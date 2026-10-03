// 生成一对 age 密钥，用于「提交软件」页联系方式的客户端本地加密。
//
// 用法：node scripts/gen-age-key.mjs
//
// 输出：
//   · 公钥（age1... 开头）—— 硬编码进网页端 + 桌面端的源码里（公开无妨）
//   · 私钥（AGE-SECRET-KEY-1... 开头）—— 仅本地保存，⛔ 绝不进代码 / 网页 / git
//
// ⛔ 本脚本本身不含任何密钥，每次运行都生成一对新的。生成后请把私钥文件
//    移到你自己管理的地方（密码管理器 / 离线介质），并从本机删除本脚本替你写的
//    那份临时副本，除非你确定要长期留在用户主目录。
import * as age from 'age-encryption';
import { homedir } from 'node:os';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
