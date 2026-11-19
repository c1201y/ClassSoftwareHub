import * as age from 'age-encryption';
import { homedir } from 'node:os';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
if (process.env.CI) {
  console.error('⛔ 拒绝在 CI 环境运行：本脚本会打印 age 私钥，私钥不该进任何 CI 日志。');
  console.error('   请在本地机器上执行：node scripts/gen-age-key.mjs');
  process.exit(1);
}

const identity = await age.generateX25519Identity();
const recipient = await age.identityToRecipient(identity);

console.log('公钥（硬编码进两端代码，公开无妨）：');
console.log(recipient);
console.log();
console.log('私钥（仅本地保存，⛔ 绝不进代码 / 网页 / git）：');
console.log(identity);

const outFile = join(homedir(), '.csh-contact-age-key.txt');
writeFileSync(outFile, identity + '\n', { mode: 0o600 });
console.log();
console.log(`私钥已写入：${outFile}`);
console.log('请把该文件移到你的密钥保管处，随后可视情况删除本机这份。');
