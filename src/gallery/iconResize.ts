// 投稿选的图标，在上传前先在浏览器里缩小、重编码。
//
// 为什么非缩不可
// --------------
// 图标在站内只以 44 / 72 px 的磁贴出现（appIcons.ts 里定的是 64 px 见方的 WebP），
// 但用户选择的多为相机原图或数百 KB 的 PNG。原图会被原样存进 OSS，再被
// /api/icon 原样转发给每一个访客 —— 2 MB 的原图换不来任何清晰度，只会增加卡片
// 等待时间，并额外消耗 ECS 中继流量。因此进桶前先压缩到 128 px。
//
// 为什么是 128 而不是 64
//   预留一倍余量：维护者后续可能用 scripts/icon-sync.py 再本地化一次（其要求为
//   64 px 正方形、≤4096 字节，必要时还要从「标 + 文字」的横排 logo 里裁出标），
//   源图太小会让那一步没有余量。
//
// 降级策略：压缩只是优化，绝不能成为上传的门槛。
//   浏览器不支持 canvas、图解码失败、编码结果比原图更大 —— 任何一步出错都原样
//   返回用户选择的文件，让流程照常继续。

/** 缩放后的最长边（像素） */
export const ICON_MAX_EDGE = 128;

/** 原图已经这么小就不值得重新编码了（再编一次很可能反而变大） */
const SKIP_BELOW_BYTES = 48 * 1024;

/** 有损编码质量（WebP 用；回落成 PNG 时忽略） */
const QUALITY = 0.85;

/**
 * 原图超过该大小即不进入 canvas 处理：
 * 解码数十兆的照片足以使页面卡顿数秒，而图标无需该分辨率。
 * 调用方据此提示「换一张小点的图」。
 */
export const ICON_INPUT_MAX_BYTES = 8 * 1024 * 1024;

/** 换扩展名（`logo.png` → `logo.webp`）；没有扩展名就补一个 */
function renameExt(name: string, ext: string): string {
  const base = name.replace(/\.[^./\\]*$/, '');
  return `${base || 'icon'}.${ext}`;
}

/**
 * 将图片解码为 drawImage 可用的对象。
 * 优先 createImageBitmap（快、不占 DOM）；不支持或解码失败时退回 <img> + objectURL。
 */
async function decode(source: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(source);
    } catch {
      // 部分浏览器对 SVG / HEIC 无法生成位图，回退至下方的 <img> 路径
    }
  }

  const objectUrl = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = objectUrl;
    });
    return image;
  } finally {
    // 图片已解码进内存，可释放 URL；延后至下一个事件循环是为了避免在 onload 之前失效
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

/** canvas → Blob；浏览器不认 WebP 时会自己回落成 PNG（blob.type 会如实反映） */
function encode(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', QUALITY);
  });
}

/**
 * 把用户选的图标缩到 `ICON_MAX_EDGE` 以内并重新编码。
 *
 * @returns 压缩后的 File；任何环节失败都返回**原文件**（调用方无需判断，直接上传即可）。
 */
export async function shrinkIcon(source: File): Promise<File> {
  try {
    // 非图片直接返回（accept 已限定 image/*，此处为防御性校验）
    if (!/^image\//i.test(source.type)) return source;
    // 原图已足够小，跳过一次解码与编码
    if (source.size <= SKIP_BELOW_BYTES) return source;

    const bitmap = await decode(source);
    if (!bitmap) return source;

    const sourceWidth = bitmap.width || 0;
    const sourceHeight = bitmap.height || 0;
    // SVG 无内在尺寸时此处为 0，无法计算缩放比例，直接放弃
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) bitmap.close();
      return source;
    }

    const scale = Math.min(1, ICON_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) bitmap.close();
      return source;
    }

    // 图标常带透明通道：先清空再绘制，避免透明区被填充为黑/白
    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
    if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) bitmap.close();

    const blob = await encode(canvas);
    // 无法编码，或压缩后反而更大（小尺寸高细节图会出现此情况），此时返回原文件
    if (!blob || blob.size >= source.size) return source;

    const ext = blob.type === 'image/webp' ? 'webp' : 'png';
    return new File([blob], renameExt(source.name, ext), {
      type: blob.type || 'image/png',
      lastModified: Date.now()
    });
  } catch {
    return source;
  }
}
