#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const HOST = 'https://classsoftwarehub.cn';

// 公钥端点：所有支持 IndexNow 的引擎共用这一个，推一次就够。
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** 在 public/ 里找 <32 位 hex>.txt 形式的验证文件，返回其中的 key。 */
function findKey() {
  const candidates = readdirSync(PUBLIC).filter((f) => /^[a-f0-9]{32}\.txt$/i.test(f));
  if (candidates.length === 0) {
    throw new Error(
      `public/ 下没有 IndexNow 验证文件（应为 <32位hex>.txt）。` +
        `去 https://www.bing.com/indexnow/getstarted 生成一个，` +
        `文件名用 key 本身，内容也写 key。`
    );
  }
  if (candidates.length > 1) {
    console.warn(`⚠️ public/ 下有多个候选 key，只用第一个：${candidates[0]}`);
  }
  const file = candidates[0];
  const key = readFileSync(join(PUBLIC, file), 'utf8').trim();
  const fromName = file.replace(/\.txt$/i, '');
  if (key !== fromName) {
    throw new Error(`${file} 的内容（${key}）与文件名（${fromName}）不一致，IndexNow 会拒绝。`);
  }
  return key;
}

async function main() {
  const key = findKey();
  const urls = process.argv.slice(2).filter((a) => a.startsWith('http'));
  if (urls.length === 0) urls.push(`${HOST}/`);

  const offHost = urls.filter((u) => !u.startsWith(HOST));
  if (offHost.length) {
    console.warn(`⚠️ 以下 URL 不属于主域名 ${HOST}，已跳过：\n  ${offHost.join('\n  ')}`);
  }
  const target = urls.filter((u) => u.startsWith(HOST));
  if (target.length === 0) {
    console.log('没有可推送的 URL，跳过。');
    return;
  }

  const payload = {
    host: new URL(HOST).host,
    key,
    keyLocation: `${HOST}/${key}.txt`,
    urlList: target,
  };

  console.log(`IndexNow：推送 ${target.length} 条 URL 到 ${new URL(ENDPOINT).host}`);
  for (const u of target) console.log(`  · ${u}`);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });

    // 200 = 已接受；202 = 已接受但 key 还在校验中。两者都算成功。
    if (res.status === 200 || res.status === 202) {
      console.log(`✅ IndexNow 已接受（HTTP ${res.status}）`);
    } else {
      const body = await res.text().catch(() => '');
      console.warn(`⚠️ IndexNow 返回 HTTP ${res.status}：${body.slice(0, 300)}`);
      console.warn('   （不影响部署：这只影响搜索引擎多快重抓）');
    }
  } catch (err) {
    // 网络不通同样只警告：本脚本在很多地区会被墙，不该让部署变红。
    console.warn(`⚠️ IndexNow 推送失败：${err.message}`);
    console.warn('   （不影响部署：站点已经发布完成）');
  }
}

main().catch((err) => {
  console.warn(`⚠️ indexnow.mjs：${err.message}`);
  console.warn('   （不影响部署）');
});
