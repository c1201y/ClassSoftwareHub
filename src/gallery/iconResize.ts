// 投稿选的图标，在上传前先在浏览器里缩小、重编码。
//
// 为什么非缩不可
// --------------
// 图标在站内只以 44 / 72 px 的磁贴出现（appIcons.ts 里定的是 64 px 见方的 WebP），
// 但用户随手选的多半是相机原图或几百 KB 的 PNG。这份原图会被原样存进 OSS，再被
// /api/icon 原样转发给每一个访客 —— 一张 2 MB 的图换不来任何清晰度，只会让卡片
// 白等，还让 ECS 中继白出一次流量。所以进桶之前先压到 128 px。
//
// 为什么是 128 而不是 64
//   多留一倍余量：维护者后续可能用 scripts/icon-sync.py 再本地化一次（它的规矩是
//   64 px 正方形、≤4096 字节，必要时还要从「标 + 文字」的横排 logo 里裁出标），
//   源图太小会让那一步没有余量。
//
// 降级策略：压缩只是优化，绝不能变成上传的门槛。
//   浏览器不给 canvas、图解码不出来、编出来比原图还大 —— 任何一步出问题都原样
//   返回用户选的那个文件，让流程照常走下去。

/** 缩放后的最长边（像素） */
export const ICON_MAX_EDGE = 128;

/** 原图已经这么小就不值得重新编码了（再编一次很可能反而变大） */
const SKIP_BELOW_BYTES = 48 * 1024;

/** 有损编码质量（WebP 用；回落成 PNG 时忽略） */
const QUALITY = 0.85;

/**
 * 原图超过这个大小就干脆别碰 canvas 了：
 * 解码一张几十兆的照片足以让页面卡住几秒，而图标根本用不上那个分辨率。
 * 调用方据此给出「换一张小点的图」的提示。
 */
export const ICON_INPUT_MAX_BYTES = 8 * 1024 * 1024;

/** 换扩展名（`logo.png` → `logo.webp`）；没有扩展名就补一个 */
function renameExt(name: string, ext: string): string {
  const base = name.replace(/\.[^./\\]*$/, '');
  return `${base || 'icon'}.${ext}`;
}

/**
 * 把图片解码成能喂给 drawImage 的东西。
 * 优先 createImageBitmap（快、不占 DOM）；不支持或解码失败时退回 <img> + objectURL。
 */
async function decode(source: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(source);
    } catch {
      // 某些浏览器对 SVG / HEIC 不给位图，落到下面那条路
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
    // 图已经解码进内存，这里可以放手；放到下一个回合是为了别在 onload 之前就断掉
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
    // 非图片不碰（accept 已经是 image/*，这里只是不信前端）
    if (!/^image\//i.test(source.type)) return source;
    // 本来就够小，省掉一次解码 + 编码
    if (source.size <= SKIP_BELOW_BYTES) return source;

    const bitmap = await decode(source);
    if (!bitmap) return source;

    const sourceWidth = bitmap.width || 0;
    const sourceHeight = bitmap.height || 0;
    // SVG 没有内在尺寸时这里会是 0，缩放比例算不出来，直接放弃
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

    // 图标常带透明通道：先清空再画，免得透明区被涂成黑/白
    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
    if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) bitmap.close();

    const blob = await encode(canvas);
    // 编不出来，或压完反而更大（小尺寸高细节图会这样），那就别折腾
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
