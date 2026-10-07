// ════════════════════════════════════════════════════════════════════
// ★★★★★ 法律文本区（用户协议 / 隐私政策 / 免责声明）★★★★★
// 本文件放在项目根目录，打开就能改 —— 「条款」页（#/agreement）和
// 设置页「关于」区里的三个链接，内容都来自这里
// （和 文字设置.ts 分开，方便单独维护，同 鸣谢文本.ts / AI导航文本.ts 的做法）。
//
// 【日常改法】只改下面引号里的文字：
//   每份文档一个对象：zh = 中文版，en = 英文版，两版的小节结构必须一一对应；
//   title     = 文档标题（「条款」页的标签文字 + 设置页链接文字也用它）
//   intro     = 标题下的引言段（可以留空字符串 ""）
//   sections  = 条款列表：heading 是「一、xxx」这样的小节标题，
//               items 是该节下的条款，每条一行（如 "1.1 ……"、
//               用户协议 2.2 的（1）（2）子项也各占一行）
//   version / effective = 版本号与生效日期，改了条款记得同步更新
// 保存后 npm run dev 自动刷新；发布前跑 npm run build 或 npm run build:single。
// ════════════════════════════════════════════════════════════════════

/** 一个小节：小节标题 + 该节下的条款（每条一行） */
interface LegalSection {
  heading: string;
  items: string[];
}

/** 单语言版本文档 */
interface LegalDocLang {
  title: string;
  intro: string;
  sections: LegalSection[];
}

/** 一份法律文档 = 中英两版 + 版本号 + 生效日期 */
interface LegalDoc {
  key: 'agreement' | 'privacy' | 'disclaimer';
  version: string;
  effective: string;
  zh: LegalDocLang;
  en: LegalDocLang;
}

const legalDocs: LegalDoc[] = [
  // ── 用户协议 ──────────────────────────────────────────────────────
  {
    key: 'agreement',
    version: 'v1.0',
    effective: '2026-10-05',
    zh: {
      title: '用户协议',
      intro:
        '本协议由 ClassSoftwareHub 开发组（以下简称「本站运营者」）发布，是您与「ClassSoftwareHub 电教委员常用软件下载站」（含网站 classsoftwarehub.us.ci 及桌面客户端 ClassSoftwareHub-Desktop，以下合称「本站」）就使用本站服务达成的约定。请在使用前完整阅读。您开始使用本站（浏览、搜索、下载、投稿、使用内置工具或桌面客户端等），即表示您已阅读并同意本协议。',
      sections: [
        {
          heading: '一、服务内容',
          items: [
            '1.1 本站面向电教委员与班级电脑，提供软件目录与详情、下载导航、内置小工具、AI 网站导航、软件投稿与问题反馈等功能。',
            '1.2 本站不设账号、无需注册登录，全部功能免费提供。',
            '1.3 本站仅收录与指向软件：安装包来自软件官方、GitHub、应用商店、用户自制软件/程序（已经过审核）、第三方网盘或第三方公益镜像。本站不开发、不修改这些软件，也不对其安全性、合法性作保证（详见《免责声明》）。',
            '1.4 桌面客户端为独立程序，主要在本机运行，其版本更新随客户端提供。'
          ]
        },
        {
          heading: '二、使用规范',
          items: [
            '2.1 您应遵守中华人民共和国法律法规及您所在地的法律，不得利用本站从事违法或侵害他人权益的行为。',
            '2.2 您不得：',
            '（1）提交或发布违法、侵权、色情、暴力、仇恨、欺诈或其他恶意内容；',
            '（2）滥用下载接口、批量抓取或自动化高频访问，或绕过下载额度限制；',
            '（3）干扰或攻击本站及其依赖的接口与第三方服务；',
            '（4）以任何方式暗示本站对某软件的担保或背书。',
            '2.3 您理解并同意：下载额度（具体次数以站点实时公布为准）与临时票据等是为防止滥用设置的合理限制。'
          ]
        },
        {
          heading: '三、投稿与用户内容',
          items: [
            '3.1 您可通过「提交软件」「反馈中心」「回声洞」向本站投稿或进行反馈。您须保证所提交内容真实、合法。',
            '3.2 除联系方式外，投稿与反馈内容通过审核后将进入本站仓库的公开议题列表，任何人可查看。',
            '3.3 您提交软件信息或改进建议时，即授权本站，在遵守相应开源许可的前提下，免费、非独家地在站内展示、编辑、整理与再发布这些内容，以便维护收录。',
            '3.4 本站有权对投稿进行审核、编辑或拒绝，且不保证收录、不承诺处理时限；对违规或侵权内容可随时删除。',
            '3.5 联系方式仅用于审核沟通，提交前在本机加密，本站不将其对外公开。'
          ]
        },
        {
          heading: '四、知识产权',
          items: [
            '4.1 本站程序源码以 GPL-3.0 许可开源（详见仓库根目录的 LICENSE 文件），仓库地址：https://github.com/c1201y/ClassSoftwareHub 。',
            '4.2 本站的站名、界面设计、文字、图标与其他原创内容，除另有说明外，其权利归 ClassSoftwareHub 开发组或相应权利人所有。',
            '4.3 本站收录的软件、软件名称、图标与商标，权利归各自厂商或作者所有；本站对软件的引用仅为信息展示与下载导航，不代表本站与这些厂商存在合作、代理或背书关系。',
            '4.4 站点部分素材（如图片字体等）可能来自第三方，其权利归原作者所有，本站按其许可使用。',
            '4.5 在遵守相应许可的前提下，欢迎引用本站内容但须注明来源；商业用途请先与我们联系。',
            '4.6 若您认为本站内容侵犯了您的合法权益，请通过第七节渠道联系我们，并提供权利证明与具体链接，本站将及时核查并处置。'
          ]
        },
        {
          heading: '五、服务变更与终止',
          items: [
            '5.1 本站可能随时新增、调整或下线部分功能，也可能因维护、网络或第三方原因中断服务。',
            '5.2 因地域网络限制，部分地区可能无法访问本站，此为客观情况，本站不作可用性保证。'
          ]
        },
        {
          heading: '六、协议修改',
          items: [
            '6.1 本站可不时修订本协议，修订后将在页面公布并更新版本号与生效日期。',
            '6.2 修订生效后您继续使用本站，即视为接受修订内容；若不接受，请停止使用。'
          ]
        },
        {
          heading: '七、联系我们',
          items: [
            '7.1 项目仓库：https://github.com/c1201y/ClassSoftwareHub （可通过 Issues 反馈）',
            '7.2 QQ 群：487903798'
          ]
        },
        {
          heading: '八、其他',
          items: [
            '8.1 本协议与《隐私政策》《免责声明》共同构成完整约定；如条款冲突，以本协议为准。',
            '8.2 本协议部分条款若被认定无效，不影响其余条款的效力。'
          ]
        }
      ]
    },
    en: {
      title: 'User Agreement',
      intro:
        'This Agreement governs your use of the "ClassSoftwareHub Software Download Station for Classroom IT Commissioners" (including the website classsoftwarehub.us.ci and the desktop client ClassSoftwareHub-Desktop; together, "this Site"). Please read it fully before use. By using this Site (browsing, searching, downloading, submitting, using built-in tools, or the desktop client), you confirm that you have read and accepted this Agreement.',
      sections: [
        {
          heading: '1. The Service',
          items: [
            '1.1 This Site serves classroom IT commissioners and classroom PCs, offering an app catalogue and details, download navigation, built-in tools, an AI-site directory, app submissions and feedback.',
            '1.2 This Site has no accounts and requires no sign-in; all features are free.',
            '1.3 This Site only lists and links to software: installers come from vendors, GitHub, app stores, user-made software/programs (subject to review), third-party netdisks or third-party mirrors. This Site does not develop or modify such software and gives no warranty as to its safety or legality (see the Disclaimer).',
            '1.4 The desktop client is a separate program that mainly runs locally; its updates are delivered with the client.'
          ]
        },
        {
          heading: '2. Acceptable Use',
          items: [
            '2.1 You must comply with the laws of the People\'s Republic of China and of your own location, and must not use this Site for any unlawful or rights-infringing activity.',
            '2.2 You must not:',
            '(1) submit or post unlawful, infringing, pornographic, violent, hateful, fraudulent or otherwise malicious content;',
            '(2) abuse the download endpoints, scrape in bulk, access at automated high frequency, or bypass download limits;',
            '(3) interfere with or attack this Site or the endpoints and third-party services it relies on;',
            '(4) imply that this Site endorses or guarantees any software.',
            '2.3 You understand and agree that download limits (the exact quota is as published on the Site) and temporary tickets are reasonable anti-abuse measures.'
          ]
        },
        {
          heading: '3. Submissions and User Content',
          items: [
            '3.1 You may submit apps or give feedback via "Submit an app", the Feedback centre and the Echo Cave. You warrant that your content is true and lawful.',
            '3.2 Except for contact details, submitted and feedback content enters the public issue tracker of this Site\'s repository after review, visible to anyone.',
            '3.3 By submitting app information or suggestions, you grant this Site a free, non-exclusive licence to display, edit, organise and republish the content on the Site, subject to any applicable open-source licence, so the catalogue can be maintained.',
            '3.4 This Site may review, edit or reject submissions and does not guarantee inclusion or any processing deadline; unlawful or infringing content may be removed at any time.',
            '3.5 Contact details are used only for review communication and are encrypted locally before submission; this Site does not publish them.'
          ]
        },
        {
          heading: '4. Intellectual Property',
          items: [
            '4.1 The site\'s source code is released under GPL-3.0 (see the LICENSE file in the repository root): https://github.com/c1201y/ClassSoftwareHub .',
            '4.2 Unless stated otherwise, the site name, interface design, text, icons and other original content belong to the ClassSoftwareHub Development Group or the respective owners.',
            '4.3 The software listed, and their names, icons and trademarks, belong to their respective vendors or authors; references to software are for information and download navigation only and do not imply any partnership, agency or endorsement between this Site and those vendors.',
            '4.4 Some assets (such as images and fonts) may come from third parties; their rights belong to the original authors and this Site uses them under their licences.',
            '4.5 Subject to the applicable licences, you are welcome to quote this Site\'s content with attribution; for commercial use, please contact us first.',
            '4.6 If you believe content on this Site infringes your rights, contact us via the channels in Section 7 with proof of rights and the specific link; this Site will verify and act promptly.'
          ]
        },
        {
          heading: '5. Changes and Suspension',
          items: [
            '5.1 This Site may add, change or remove features at any time, and may be interrupted due to maintenance, network or third-party reasons.',
            '5.2 Regional network restrictions may make the Site unreachable in some areas; this is beyond the Site\'s control and no availability is guaranteed.'
          ]
        },
        {
          heading: '6. Changes to this Agreement',
          items: [
            '6.1 This Agreement may be revised from time to time; revisions will be posted with an updated version and effective date.',
            '6.2 Continued use after a revision takes effect constitutes acceptance; if you do not accept it, please stop using the Site.'
          ]
        },
        {
          heading: '7. Contact',
          items: [
            '7.1 Repository: https://github.com/c1201y/ClassSoftwareHub (feedback via Issues)',
            '7.2 QQ group: 487903798'
          ]
        },
        {
          heading: '8. Miscellaneous',
          items: [
            '8.1 This Agreement, together with the Privacy Policy and the Disclaimer, forms the complete understanding; in case of conflict, this Agreement prevails.',
            '8.2 If any provision is held invalid, the remaining provisions remain in effect.'
          ]
        }
      ]
    }
  },

  // ── 隐私政策 ──────────────────────────────────────────────────────
  {
    key: 'privacy',
    version: 'v1.0',
    effective: '2026-10-05',
    zh: {
      title: '隐私政策',
      intro:
        '本政策由 ClassSoftwareHub 开发组发布，说明 ClassSoftwareHub（网站 classsoftwarehub.us.ci 及桌面客户端 ClassSoftwareHub-Desktop）处理您信息的方式。本站不设账号、无需登录，并遵循「最小必要」原则。',
      sections: [
        {
          heading: '一、我们不收集的信息',
          items: [
            '1.1 本站不要求您提供姓名、身份证、手机号等真实身份信息，也不收集您的位置、通讯录、相册等内容（投稿/反馈中由您主动填写的联系方式除外）。'
          ]
        },
        {
          heading: '二、我们收集的信息',
          items: [
            '2.1 访问统计：为统计访问量，本站自托管服务记录页面浏览量（PV）、访客数（UV）与在线数，并随请求携带您访问的域名、页面路径与时间戳，以及用于去重的 Cookie。数据由本站自建服务集中汇总展示。',
            '2.2 第三方统计：本站页面接入百度统计（hm.baidu.com），由百度按其规则收集访问数据。',
            '2.3 设备标识：为限制下载滥用，本站会在您的浏览器本地生成一个设备标识（由随机 ID 与浏览器特征计算为哈希），仅上传该哈希值，不上传原始特征；用于下载额度控制（具体次数以站点实时公布为准）。它不是用于识别您身份的安全凭证。',
            '2.4 本地存储：本站会在您的浏览器本地（localStorage）保存主题、镜像偏好、接口记忆、投稿/反馈草稿、下载额度用的设备标识等，以改善体验。这些数据保存在您本机，您可随时清除。',
            '2.5 桌面客户端：桌面版会在您的电脑上保存设置与内容缓存于 %LOCALAPPDATA%\\ClassSoftwareHub（与程序目录相互独立，卸载程序不会自动删除），这些数据仅存于本机；桌面版检查更新时会从网络下载安装包。'
          ]
        },
        {
          heading: '三、投稿、反馈与联系方式',
          items: [
            '3.1 通过「提交软件」「反馈中心」「回声洞」提交的内容（不含联系方式）在通过审核后会进入本站仓库的公开议题列表，任何人可查看。',
            '3.2 联系方式为选填，提交前在您的设备上使用公钥加密；本站只保存密文，仅维护者可用私钥解密；联系方式用于审核沟通。请勿填写密码、验证码等敏感信息。'
          ]
        },
        {
          heading: '四、文件上传',
          items: [
            '4.1 您在投稿中上传的安装包或图标，会直传至本站使用的阿里云对象存储（OSS）。',
            '4.2 安装包为私有存储，下载需换取有效期约 15 分钟的临时票据；图标为公开只读。'
          ]
        },
        {
          heading: '五、第三方服务',
          items: [
            '5.1 为实现功能，本站可能使用以下第三方服务：Cloudflare（后端接口与统计）、百度（访问统计）、阿里云 OSS（文件存储）、GitHub（代码托管与议题）、第三方公益下载镜像与网盘、主站托管服务商等。',
            '5.2 这些第三方对信息的处理适用其各自的隐私政策，本站无法控制。'
          ]
        },
        {
          heading: '六、Cookie 与本地存储',
          items: [
            '6.1 本站使用少量 Cookie 与本地存储用于去重、记住偏好与维持功能；您可在浏览器中清除或禁用，但可能影响部分功能。'
          ]
        },
        {
          heading: '七、数据安全',
          items: [
            '7.1 本站采取联系信息加密、下载票据限时、上传预签名等技术措施保护数据；但互联网环境并非绝对安全，本站无法保证万无一失。'
          ]
        },
        {
          heading: '八、您的权利',
          items: [
            '8.1 您可随时清除浏览器本地数据，以删除本地保存的设置与草稿。',
            '8.2 如需查询、更正或删除您提交的内容，可通过下面的渠道联系我们。'
          ]
        },
        {
          heading: '九、未成年人',
          items: ['9.1 本站不面向特定年龄提供服务，也不主动收集年龄信息。']
        },
        {
          heading: '十、变更与联系',
          items: [
            '10.1 本政策可能更新，更新后在本页公布。',
            '10.2 联系方式：GitHub 仓库 https://github.com/c1201y/ClassSoftwareHub （可通过 Issues 反馈）；QQ 群 487903798 。'
          ]
        }
      ]
    },
    en: {
      title: 'Privacy Policy',
      intro:
        'This Policy is issued by the ClassSoftwareHub Development Group. It explains how ClassSoftwareHub (the website classsoftwarehub.us.ci and the desktop client ClassSoftwareHub-Desktop) handles your information. This Site has no accounts and requires no sign-in, and follows a data-minimisation principle.',
      sections: [
        {
          heading: '1. What We Do Not Collect',
          items: [
            '1.1 This Site does not ask for your name, ID number, phone number or other real identity information, and does not collect your location, contacts or photo library (except contact details you voluntarily provide in a submission or feedback).'
          ]
        },
        {
          heading: '2. What We Collect',
          items: [
            '2.1 Visit statistics: to measure traffic, a self-hosted service records page views (PV), unique visitors (UV) and concurrent visitors, carrying the domain, page path and timestamp of your request, plus a de-duplication cookie. The data is aggregated and shown by the Site\'s own service.',
            '2.2 Third-party analytics: pages use Baidu Analytics (hm.baidu.com), which collects visit data under Baidu\'s own rules.',
            '2.3 Device identifier: to prevent download abuse, this Site generates a device identifier locally in your browser (a hash derived from a random ID and browser features) and uploads only that hash, not the raw features; it is used for download quota control (the exact quota is as published on the Site). It is not a security credential for identifying you.',
            '2.4 Local storage: this Site stores settings such as theme, mirror preference, endpoint memory, submission/feedback drafts and the device identifier in your browser\'s localStorage to improve your experience. This data stays on your device and you may clear it at any time.',
            '2.5 Desktop client: the desktop app stores settings and content cache in %LOCALAPPDATA%\\ClassSoftwareHub on your computer (separate from the program folder; uninstalling does not remove it). This data stays on your device. When checking for updates, the desktop app downloads the installer from the network.'
          ]
        },
        {
          heading: '3. Submissions, Feedback and Contact',
          items: [
            '3.1 Content submitted via "Submit an app", the Feedback centre and the Echo Cave (excluding contact details) enters the public issue tracker of this Site\'s repository after review, visible to anyone.',
            '3.2 Contact details are optional and are encrypted with a public key on your device before submission; the Site stores only ciphertext, decryptable only by the maintainer. Contact details are used for review communication. Do not enter passwords or verification codes.'
          ]
        },
        {
          heading: '4. File Uploads',
          items: [
            '4.1 Installers or icons you upload in a submission are sent directly to the Aliyun Object Storage (OSS) used by this Site.',
            '4.2 Installers are stored privately and require a temporary ticket valid for about 15 minutes to download; icons are publicly readable.'
          ]
        },
        {
          heading: '5. Third-Party Services',
          items: [
            '5.1 To operate, this Site may use: Cloudflare (backend endpoints and statistics), Baidu (analytics), Aliyun OSS (file storage), GitHub (code hosting and issues), third-party mirror/netdisk services, and the hosting provider.',
            '5.2 Their handling of information is governed by their own privacy policies, which this Site does not control.'
          ]
        },
        {
          heading: '6. Cookies and Local Storage',
          items: [
            '6.1 This Site uses a small number of cookies and local storage for de-duplication, remembering preferences and keeping features working; you may clear or disable them in your browser, which may affect some features.'
          ]
        },
        {
          heading: '7. Data Security',
          items: [
            '7.1 This Site uses technical measures such as contact encryption, time-limited download tickets and pre-signed uploads; however, no internet environment is absolutely secure and no guarantee can be given.'
          ]
        },
        {
          heading: '8. Your Rights',
          items: [
            '8.1 You may clear your browser\'s local data at any time to remove locally stored settings and drafts.',
            '8.2 To access, correct or delete content you submitted, contact us via the channels below.'
          ]
        },
        {
          heading: '9. Minors',
          items: [
            '9.1 This Site does not target any particular age and does not actively collect age information.'
          ]
        },
        {
          heading: '10. Changes and Contact',
          items: [
            '10.1 This Policy may be updated; updates will be posted on this page.',
            '10.2 Contact: repository https://github.com/c1201y/ClassSoftwareHub (Issues); QQ group 487903798.'
          ]
        }
      ]
    }
  },

  // ── 免责声明 ──────────────────────────────────────────────────────
  {
    key: 'disclaimer',
    version: 'v1.0',
    effective: '2026-10-05',
    zh: {
      title: '免责声明',
      intro:
        '请在使用本站（网站 classsoftwarehub.us.ci 及桌面客户端 ClassSoftwareHub-Desktop）前阅读本声明。',
      sections: [
        {
          heading: '一、软件来源',
          items: [
            '1.1 本站仅收录、整理并指向第三方软件，安装包来自软件官方、GitHub、应用商店、用户自制软件/程序（已经过审核）、第三方网盘或第三方公益镜像。本站不开发、不修改、不重打包这些软件，也不对其安全性、合法性、完整性作任何保证。',
            '1.2 部分软件为有意收录的旧版本或归档版，可能已不再由厂商维护，仅供特定场景使用。'
          ]
        },
        {
          heading: '二、信息准确性',
          items: [
            '2.1 本站通过自动化脚本每周核对版本号、下载直链与体积，但信息仍可能滞后或出错；请以软件官方页面为准。'
          ]
        },
        {
          heading: '三、下载与安装风险',
          items: [
            '3.1 您应自行判断并承担下载、安装与使用第三方软件的风险。',
            '3.2 建议在安装前：核对官方公布的校验值、使用杀毒软件扫描、优先从官方渠道获取。',
            '3.3 本站提供的下载加速镜像由第三方公益提供，本站只做跳转、不中转、不修改文件，且不保证其持续可用或内容未被篡改。'
          ]
        },
        {
          heading: '四、第三方链接',
          items: [
            '4.1 本站的官网链接、网盘链接（OSS 直链除外）、应用商店入口、AI 网站导航及各类外链均指向第三方，其内容与服务由该第三方负责；您在第三方处产生的行为与风险由您自行承担。'
          ]
        },
        {
          heading: '五、内置工具与桌面客户端',
          items: [
            '5.1 内置小工具（取色、抽号、计时、编码、二维码等）全部在您的浏览器本地运行，结果仅供参考。抽号等结果不构成任何权威结论，请勿用于需要法律或官方公信力的场景。',
            '5.2 桌面客户端会从网络检查并下载新版本安装包，并提供音量调节、屏幕亮度、截屏、关闭窗口等本机系统操作能力；请在确认后再使用，相关操作的影响由您自行承担。'
          ]
        },
        {
          heading: '六、服务可用性',
          items: [
            '6.1 本站为免费公益性质，不保证不中断、无错误或永久可用；因维护、网络、第三方服务或地域限制导致的服务中断，本站不承担责任。'
          ]
        },
        {
          heading: '七、责任限制',
          items: [
            '7.1 在法律允许的范围内，对于因使用或无法使用本站及本站所指向的第三方软件而产生的任何直接或间接损失，本站不承担责任。',
            '7.2 本条不排除依适用法律不得排除或限制的责任。'
          ]
        },
        {
          heading: '八、其他',
          items: ['8.1 本声明与《用户协议》《隐私政策》共同适用。']
        }
      ]
    },
    en: {
      title: 'Disclaimer',
      intro:
        'Please read this Disclaimer before using this Site (the website classsoftwarehub.us.ci and the desktop client ClassSoftwareHub-Desktop).',
      sections: [
        {
          heading: '1. Software Source',
          items: [
            '1.1 This Site only lists, organises and links to third-party software; installers come from vendors, GitHub, app stores, user-made software/programs (subject to review), third-party netdisks or third-party mirrors. This Site does not develop, modify or repackage such software and gives no warranty as to its safety, legality or integrity.',
            '1.2 Some software consists of deliberately listed old or archived versions that may no longer be maintained by the vendor and are provided for specific scenarios only.'
          ]
        },
        {
          heading: '2. Accuracy of Information',
          items: [
            '2.1 This Site checks versions, download links and sizes weekly via automated scripts, but information may still lag or be wrong; the vendor\'s official page prevails.'
          ]
        },
        {
          heading: '3. Download and Installation Risks',
          items: [
            '3.1 You must judge and bear the risks of downloading, installing and using third-party software.',
            '3.2 Before installing, we recommend verifying the official checksum, scanning with antivirus software, and preferring official channels.',
            '3.3 Download mirrors offered by this Site are provided by third parties; this Site only redirects, does not relay or modify files, and cannot guarantee they stay available or unmodified.'
          ]
        },
        {
          heading: '4. Third-Party Links',
          items: [
            '4.1 Official-site links, netdisk links (except OSS direct links), app-store entries, the AI-site directory and other external links point to third parties, whose content and services they are responsible for; your actions and risks there are your own.'
          ]
        },
        {
          heading: '5. Built-in Tools and the Desktop Client',
          items: [
            '5.1 Built-in tools (colour picker, random picker, timer, encoding, QR code, etc.) run locally in your browser and their results are for reference only. Results such as random draws are not authoritative and must not be used where legal or official validity is required.',
            '5.2 The desktop client checks for and downloads new versions online, and offers local system actions such as volume, brightness, screenshots and closing windows; please use them at your own discretion, and you bear the consequences of those actions.'
          ]
        },
        {
          heading: '6. Availability',
          items: [
            '6.1 This Site is a free, volunteer-run service and does not guarantee uninterrupted, error-free or permanent availability; it is not liable for interruptions caused by maintenance, network, third-party services or regional restrictions.'
          ]
        },
        {
          heading: '7. Limitation of Liability',
          items: [
            '7.1 To the extent permitted by law, this Site is not liable for any direct or indirect loss arising from the use of, or inability to use, this Site or the third-party software it links to.',
            '7.2 Nothing in this clause excludes liability that cannot be excluded or limited under applicable law.'
          ]
        },
        {
          heading: '8. Miscellaneous',
          items: [
            '8.1 This Disclaimer applies together with the User Agreement and the Privacy Policy.'
          ]
        }
      ]
    }
  }
];

export default legalDocs;
