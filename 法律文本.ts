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
    version: 'v1.2',
    effective: '2026-10-23',
    zh: {
      title: '用户协议',
      intro:
        '本协议由 ClassSoftwareHub 开发组（以下简称「本开发组」）发布，是您与「ClassSoftwareHub」就使用本服务达成的约定。本服务包括：（一）网站 classsoftwarehub.us.ci、classsoftwarehub.cn 及其镜像站（以下称「网站」）；（二）桌面客户端 ClassSoftwareHub 桌面版（含 Windows 版与 Windows 7 版，以下称「客户端」）。两者合称「本服务」。请在使用前完整阅读。您开始使用本服务（浏览、搜索、下载、投稿、使用内置工具、安装或运行客户端等），即表示您已阅读并同意本协议。',
      sections: [
        {
          heading: '一、服务内容',
          items: [
            '1.1 网站面向电教委员与班级电脑，提供软件目录与详情、下载导航、内置小工具、AI 网站导航、软件投稿、回声洞与问题反馈等功能。',
            '1.2 客户端在网站功能的基础上，额外提供：软件下载与分片加速下载、软件更新、本机硬件与软件信息查看、侧边工具栏、Hub AI 电脑顾问、以及若干实验性系统工具（软件卸载与残留清理、AppData 管理、自动关机等）。',
            '1.3 本服务不设账号、无需注册登录，全部功能免费提供。',
            '1.4 本服务仅收录与指向软件：安装包来自软件官方、GitHub、应用商店、用户自制软件或程序（已经过审核，其中部分由本服务对象存储保存并分发）、第三方网盘或第三方公益镜像。本开发组不开发、不修改这些软件，也不对其安全性、合法性作保证（详见《免责声明》）。',
            '1.5 客户端的系统操作类功能（卸载、清理、关机）具有破坏性，其风险与责任划分详见《免责声明》第六节。',
          ]
        },
        {
          heading: '二、使用规范',
          items: [
            '2.1 您应遵守中华人民共和国法律法规及您所在地的法律，不得利用本服务从事违法或侵害他人权益的行为。',
            '2.2 您不得：',
            '（1）提交或发布违法、侵权、色情、暴力、仇恨、侮辱、诽谤、网络暴力、欺诈、钓鱼或其他恶意内容；',
            '（2）滥用下载接口、批量抓取、自动化高频访问、多线程或高并发请求，或以规避限制为目的清空本地数据、伪造设备标识、使用多设备或虚拟机及自动化工具，绕过下载额度、限速或其他限制；',
            '（3）干扰或攻击本服务及其依赖的接口与第三方服务，或刷取、伪造访问量与统计数据；',
            '（4）以任何方式暗示本开发组对某软件的担保或背书，或以本服务名义发布信息、冒充本开发组及维护者；',
            '（5）绕过、破解或伪造本服务下载加速节点（含自建节点与第三方镜像）的防盗链、限时签名、限速或其他访问控制措施，或盗链、批量刷取流量，或将加速链接、签名接口用于本服务之外的传播、代理、分发与商业用途；',
            '（6）将投稿、反馈或上传通道用于存储、分发与投稿无关的文件（如图床、网盘），或提交含恶意代码、病毒的文件；',
            '（7）**将客户端的系统操作功能（卸载、清理、关机等）用于您无权管理的计算机**，或在未经设备所有者明确同意的情况下对他人设备执行上述操作；',
            '（8）**对客户端进行反向工程以绕过其校验、签名、更新验证或其他安全机制**（客户端源码依 GPL-3.0 公开，您可依该许可自由研究、修改与再分发本程序，但不因此获得绕过服务端访问控制的权利）。',
            '2.3 您理解并同意：下载额度（具体次数以站点实时公布为准）与临时票据等是为防止滥用设置的合理限制；额度以本服务服务端记录为准，本开发组有权对异常设备或异常请求合并计算或拒绝服务。客户端的下载不单独计额度。',
            '2.4 对违反第 2.2 条或滥用本服务的行为，本开发组有权视情节采取限制访问、拒绝下载、封禁设备标识、删除内容、停止提供服务等措施，且无需事先通知；涉嫌违法犯罪的，本开发组将依法向有关部门报告并配合调查。您对处理措施有异议的，可通过第七节渠道申诉。',
          ]
        },
        {
          heading: '三、投稿与用户内容',
          items: [
            '3.1 您可通过「提交软件」「反馈中心」「回声洞」向本服务投稿或进行反馈。您须保证所提交内容真实、合法，不侵犯他人合法权益，且不含未经授权的他人个人信息或敏感信息。',
            '3.2 除联系方式外，通过「提交软件」「回声洞」提交的内容在通过审核后将进入本服务仓库的公开议题列表，任何人可查看；通过「反馈中心」提交的内容直接进入公开议题列表，无需审核。您提交即表示同意将上述内容（联系方式除外）公开；如不同意公开，请勿提交。',
            '3.3 您提交任何内容（包括软件信息、安装包、图标、改进建议、回声洞字条等）时，即授权本开发组，在遵守相应开源许可的前提下，免费、非独家、可转授权地在站内展示、编辑、整理、再发布，并为提供下载服务进行必要的存储与分发。您保证对上传的内容享有合法权利或已取得权利人授权；因您提交的内容侵犯第三方权益或违反法律，导致本开发组遭受索赔、处罚或损失的，您应承担相应责任并赔偿因此遭受的损失。',
            '3.4 本开发组有权对投稿进行审核、编辑或拒绝，并有权对已发布的投稿及反馈内容进行编辑或删除；不保证收录，也不承诺处理时限。对违规、侵权、广告或垃圾内容，可随时删除。',
            '3.5 联系方式仅用于审核或问题跟进沟通，提交前在本机加密，本开发组不将其对外公开。请勿填写他人联系方式或密码、验证码等敏感信息。',
          ]
        },
        {
          heading: '四、知识产权',
          items: [
            '4.1 本服务程序源码以 GPL-3.0 许可开源（详见仓库根目录的 LICENSE 文件），仓库地址：https://github.com/c1201y/ClassSoftwareHub 。**客户端亦以同一许可发布**，您可依该许可使用、研究、修改与再分发本程序，但须遵守 GPL-3.0 的全部条款。',
            '4.2 本服务的站名、界面设计、文字、图标与其他原创内容，除另有说明外，其权利归本开发组或相应权利人所有。',
            '4.3 本服务收录的软件、软件名称、图标与商标，权利归各自厂商或作者所有；对软件的引用仅为信息展示与下载导航，不代表本开发组与这些厂商存在合作、代理或背书关系。',
            '4.4 部分素材（如图片、字体等）可能来自第三方，其权利归原作者所有，本服务按其许可使用。',
            '4.5 在遵守相应许可的前提下，欢迎引用本服务内容但须注明来源；商业用途请先与我们联系。',
            '4.6 若您认为本服务内容侵犯了您的合法权益，请通过第七节渠道提交书面通知，并提供：（1）权利人的姓名（名称）、联系方式和地址；（2）要求删除或断开链接的侵权内容名称与网络地址；（3）构成侵权的初步证明材料。本开发组将及时核查并处置。被删除内容的上传者可按同一渠道提交书面说明，本开发组将依法转送并处理。',
          ]
        },
        {
          heading: '五、客户端的安装、更新与停止使用',
          items: [
            '5.1 客户端通过安装程序部署，安装位置默认位于当前用户目录，卸载通过系统「应用和功能」或安装目录内的卸载程序完成。',
            '5.2 客户端会在发现新版本后提示更新。更新过程会退出正在运行的实例并启动安装程序，**正在进行的下载任务将中断**。',
            '5.3 卸载客户端不会自动删除用户数据目录（%LOCALAPPDATA%\\ClassSoftwareHub），其中包含设置、日志、对话历史与清理备份。如需彻底清除，请手动删除该目录。',
            '5.4 您可随时停止使用本服务，无需通知本开发组。',
          ]
        },
        {
          heading: '六、服务变更与终止',
          items: [
            '6.1 本开发组可能随时新增、调整或下线部分功能，也可能因维护、网络或第三方原因中断服务。实验性功能可能被修改或移除，恕不单独通知。',
            '6.2 因地区网络策略、第三方服务不可达等情况，部分功能可能无法使用，此为客观限制，本开发组不作可用性保证。',
          ]
        },
        {
          heading: '七、协议修改',
          items: [
            '7.1 本开发组可不时修订本协议，修订后将在页面公布并更新版本号与生效日期；涉及您重大权益的变更，将以显著方式提示。',
            '7.2 修订生效后您继续使用本服务，即视为接受修订内容；若不接受，请停止使用。',
          ]
        },
        {
          heading: '八、联系我们',
          items: [
            '8.1 项目仓库：https://github.com/c1201y/ClassSoftwareHub （可通过 Issues 反馈）',
            '8.2 QQ 群：487903798',
            '8.3 投诉与举报：您可通过上述渠道投诉、举报违法和不良信息或滥用行为。',
          ]
        },
        {
          heading: '九、其他',
          items: [
            '9.1 本协议与《隐私政策》《免责声明》共同构成完整约定。就个人信息处理，以《隐私政策》为准；就软件来源、下载风险、客户端系统操作风险与责任限制，以《免责声明》为准；除此之外的冲突，以本协议为准。',
            '9.2 本协议部分条款若被认定无效，不影响其余条款的效力。',
            '9.3 本协议以中文版本为准；英文译本仅供参考，如中英文不一致，以中文版本为准。',
          ]
        },
      ]
    },
    en: {
      title: 'User Agreement',
      intro:
        'This Agreement is issued by the ClassSoftwareHub Development Group ("the Group") and governs your use of the ClassSoftwareHub Service. The Service consists of: (1) the websites classsoftwarehub.us.ci and classsoftwarehub.cn and their mirrors ("the Site"); and (2) the ClassSoftwareHub desktop client, including the Windows and Windows 7 editions ("the Client").',
      sections: [
        {
          heading: '1. The Service',
          items: [
            '1.1 The Site serves classroom IT commissioners and classroom PCs, offering an app catalogue and details, download navigation, built-in tools, an AI-site directory, app submissions, the Echo Cave and feedback.',
            '1.2 The Client additionally offers: software downloads with parallel-chunk acceleration, software updates, local hardware and software inspection, a side toolbar, the Hub AI computer advisor, and several experimental system tools (app uninstall and leftover cleanup, AppData management, scheduled shutdown).',
            '1.3 The Service has no accounts and requires no sign-in; all features are free.',
            '1.4 The Service only lists and links to software: installers come from vendors, GitHub, app stores, user-made software or programs (subject to review; some are stored and distributed via this Service\'s object storage), third-party netdisks or third-party mirrors. The Group does not develop or modify such software and gives no warranty as to its safety or legality (see the Disclaimer).',
            '1.5 The Client\'s system-operation features (uninstall, cleanup, shutdown) are destructive; risks and liability are set out in Section 6 of the Disclaimer.',
          ]
        },
        {
          heading: '2. Acceptable Use',
          items: [
            '2.1 You must comply with the laws of the People\'s Republic of China and of your own location, and must not use the Service for any unlawful or rights-infringing activity.',
            '2.2 You must not:',
            '(1) submit or post unlawful, infringing, pornographic, violent, hateful, insulting, defamatory, cyberbullying, fraudulent, phishing or otherwise malicious content;',
            '(2) abuse the download endpoints, scrape in bulk, access at automated high frequency, make multi-threaded or highly concurrent requests, or bypass download quotas, rate limits or other restrictions by clearing local data, forging device identifiers, or using multiple devices, virtual machines or automation tools;',
            '(3) interfere with or attack the Service or the endpoints and third-party services it relies on, or inflate or forge traffic and statistics;',
            '(4) imply that the Group endorses or guarantees any software, publish information in the Service\'s name, or impersonate the Group or its maintainers;',
            '(5) bypass, break or forge the anti-leech, time-limited signature, rate limits or other access controls of the Service\'s download acceleration node (including the self-built node and third-party mirrors), hotlink, generate abusive traffic in bulk, or use acceleration links or the signing endpoint for distribution, proxying, re-hosting or commercial purposes outside the Service;',
            '(6) use the submission, feedback or upload channels to store or distribute unrelated files (such as image hosting or netdisk use), or submit files containing malicious code or viruses;',
            '(7) **use the Client\'s system-operation features (uninstall, cleanup, shutdown) on computers you are not authorised to administer**, or perform such operations on another person\'s device without that owner\'s explicit consent;',
            '(8) **reverse engineer the Client to circumvent its verification, signing, update validation or other security mechanisms** (the Client\'s source code is published under GPL-3.0; you may study, modify and redistribute it under that licence, but this grants no right to circumvent server-side access controls).',
            '2.3 You understand and agree that download limits (as published on the Site) and temporary tickets are reasonable anti-abuse measures; quotas are based on the Service\'s server-side records. Client downloads are not separately metered.',
            '2.4 For violations of Section 2.2 or abuse of the Service, the Group may restrict access, refuse downloads, block device identifiers, remove content or suspend the service without prior notice; suspected unlawful activity will be reported to the competent authorities.',
          ]
        },
        {
          heading: '3. Submissions and User Content',
          items: [
            '3.1 You may submit apps or give feedback via "Submit an app", the Feedback centre and the Echo Cave. You warrant that your content is true and lawful, does not infringe the rights of others, and contains no unauthorised personal or sensitive information of others.',
            '3.2 Except for contact details, content submitted via "Submit an app" and the Echo Cave enters the public issue tracker after review; content submitted via the Feedback centre enters the public issue tracker directly without review. By submitting, you agree that the content (excluding contact details) will be made public; if you do not agree, please do not submit.',
            '3.3 By submitting any content, you grant the Group a free, non-exclusive, sub-licensable licence to display, edit, organise and republish it, and to store and distribute it as necessary to provide the download service, subject to any applicable open-source licence. You warrant that you own the rights to, or have obtained authorisation for, the content you upload; you shall bear liability for claims arising from content you submit.',
            '3.4 The Group may review, edit or reject submissions, and may edit or remove published content. Inclusion and processing deadlines are not guaranteed.',
            '3.5 Contact details are used only for review or follow-up communication and are encrypted locally before submission. Do not enter other people\'s contact details, passwords or verification codes.',
          ]
        },
        {
          heading: '4. Intellectual Property',
          items: [
            '4.1 The Service\'s source code is released under GPL-3.0 (see the LICENSE file in the repository root): https://github.com/c1201y/ClassSoftwareHub . **The Client is released under the same licence**; you may use, study, modify and redistribute it under GPL-3.0.',
            '4.2 Unless stated otherwise, the service name, interface design, text, icons and other original content belong to the Group or the respective owners.',
            '4.3 The software listed, and their names, icons and trademarks, belong to their respective vendors or authors; references are for information and download navigation only and do not imply any partnership, agency or endorsement.',
            '4.4 Some assets may come from third parties; their rights belong to the original authors and are used under their licences.',
            '4.5 Subject to the applicable licences, you are welcome to quote the Service\'s content with attribution; for commercial use, please contact us first.',
            '4.6 If you believe content infringes your rights, submit a written notice via Section 8, including the rights holder\'s details, the allegedly infringing content and address, and preliminary proof of infringement. The Group will verify and act promptly. The uploader may submit a written explanation via the same channels.',
          ]
        },
        {
          heading: '5. Client Installation, Updates and Discontinuation',
          items: [
            '5.1 The Client is deployed via an installer, installed under the current user\'s directory by default, and uninstalled via the system "Apps & features" or the uninstaller in the install directory.',
            '5.2 The Client prompts for updates when a new version is found. The application exits and the installer launches; **in-progress downloads are interrupted**.',
            '5.3 Uninstalling does not delete the user data directory (%LOCALAPPDATA%\\ClassSoftwareHub), which holds settings, logs, conversation history and cleanup backups. Delete it manually for a complete removal.',
            '5.4 You may stop using the Service at any time without notice.',
          ]
        },
        {
          heading: '6. Changes and Suspension',
          items: [
            '6.1 The Group may add, change or remove features at any time, and may be interrupted due to maintenance, network or third-party reasons. Experimental features may change or be removed without separate notice.',
            '6.2 Regional network policies or unreachable third-party services may prevent some features from working; this is beyond the Group\'s control and no availability is guaranteed.',
          ]
        },
        {
          heading: '7. Changes to this Agreement',
          items: [
            '7.1 This Agreement may be revised; revisions will be posted with an updated version and effective date, and material changes will be highlighted.',
            '7.2 Continued use after a revision takes effect constitutes acceptance; if you do not accept it, please stop using the Service.',
          ]
        },
        {
          heading: '8. Contact',
          items: [
            '8.1 Repository: https://github.com/c1201y/ClassSoftwareHub (feedback via Issues)',
            '8.2 QQ group: 487903798',
            '8.3 Complaints and reports: use the above channels to complain about or report unlawful or harmful information or abusive behaviour.',
          ]
        },
        {
          heading: '9. Miscellaneous',
          items: [
            '9.1 This Agreement, together with the Privacy Policy and the Disclaimer, forms the complete understanding. Personal information processing is governed by the Privacy Policy; software sources, download risks, client system-operation risks and limitation of liability are governed by the Disclaimer; other conflicts are governed by this Agreement.',
            '9.2 If any provision is held invalid, the remaining provisions remain in effect.',
            '9.3 The Chinese version prevails; the English translation is for reference only.',
          ]
        },
      ]
    }
  },
  // ── 隐私政策 ──────────────────────────────────────────────────────
  {
    key: 'privacy',
    version: 'v1.2',
    effective: '2026-10-23',
    zh: {
      title: '隐私政策',
      intro:
        '本政策由 ClassSoftwareHub 开发组发布，说明 ClassSoftwareHub 处理您信息的方式。ClassSoftwareHub 包括两形态：（一）网站 classsoftwarehub.us.ci、classsoftwarehub.cn 及其镜像站（以下称「网站」）；（二）桌面客户端 ClassSoftwareHub 桌面版（含 Windows 版与 Windows 7 版，以下称「客户端」）。两者合称「本服务」。本服务不设账号、无需登录，并遵循「最小必要」原则。请在使用前阅读本政策。',
      sections: [
        {
          heading: '一、适用范围',
          items: [
            '1.1 本政策同时适用于网站与客户端。凡涉及两者差异之处，均在相应条款中分别说明。',
            '1.2 客户端自 v1.2 版本起纳入本政策。此前版本若存在与本政策不一致的处理行为，以本政策为准；因技术原因无法回溯调整的部分，将在后续版本中修正。',
          ]
        },
        {
          heading: '二、我们不收集的信息',
          items: [
            '2.1 本服务不要求您提供姓名、身份证、手机号等真实身份信息，不收集您的位置、通讯录、相册、通话记录、短信等内容。',
            '2.2 网站与客户端均不采集剪贴板内容、不监听键盘输入、不截取屏幕用于上传。',
            '2.3 投稿或反馈中由您主动填写的联系方式除外。',
          ]
        },
        {
          heading: '三、网站收集的信息',
          items: [
            '3.1 访问统计：为统计访问量，网站自托管服务记录页面浏览量（PV）、访客数（UV）与在线数，并随请求携带访问域名、页面路径与时间戳，以及用于去重的 Cookie；服务器在处理请求时会接触您的 IP 地址，用于去重、安全防护与故障排查，不用于识别您的真实身份。数据由本站自建服务集中汇总展示。',
            '3.2 第三方统计：网站页面接入百度统计（hm.baidu.com），由百度按其规则收集访问数据。',
            '3.3 设备标识：为限制下载滥用，网站会在您的浏览器本地生成一个设备标识（由随机 ID 与浏览器特征计算为哈希），仅上传该哈希值，不上传原始特征；用于下载额度控制（具体次数以站点实时公布为准）。它不是用于识别您身份的安全凭证。',
            '3.4 本地存储：网站会在浏览器本地（localStorage）保存主题、镜像偏好、接口记忆、投稿或反馈草稿、下载额度用的设备标识等，以改善体验。上述数据保存在您本机，您可随时清除。',
            '3.5 下载加速：使用网站自建加速节点下载时，您的请求会经该节点中转，节点会接触您的 IP 地址与所请求的文件地址，用于完成下载、防盗链与限流；该节点位于中华人民共和国境外（日本东京）。第三方公益镜像由第三方运营，其信息处理适用该第三方的规则。',
          ]
        },
        {
          heading: '四、客户端处理的信息',
          items: [
            '4.1 客户端在本机保存的数据。以下数据仅存于您的设备，默认不上传：',
            '（1）设置项：界面偏好、下载路径、侧边布局、实验性功能开关等，存于 %LOCALAPPDATA%\\ClassSoftwareHub\\settings.json；',
            '（2）设备标识：与网站一致的本地生成标识，存于 device-id.txt，用于下载与更新的异常请求识别；',
            '（3）本机通讯与加速配置：自建加速节点密钥、站点内容接口地址等，存于对应文本文件；',
            '（4）清理与修复的备份：实验性功能「应用卸载残留清理」「AppData 管理」在删除前会将被删内容备份至 quarantine 目录，供您自行还原；',
            '（5）日志：运行日志、崩溃日志，存于 logs 目录，用于故障排查。',
            '4.2 客户端读取的本机信息。以下信息由客户端读取后**仅在界面展示**，除非您主动使用 Hub AI 并要求其分析（见第五节），否则不上传：',
            '（1）硬件概况：处理器型号与核心数、内存容量与占用、磁盘分区与容量、显卡型号与显存；',
            '（2）系统信息：操作系统版本、屏幕分辨率与缩放、电池状态（若适用）；',
            '（3）软件清单：已安装软件的名称、版本、发布者、安装位置；',
            '（4）进程与占用：进程名称、内存与处理器占用；',
            '（5）磁盘目录：指定目录的名称与占用体积。',
            '4.3 客户端联网时发送的信息：',
            '（1）检查更新：向 GitHub 及本站接口查询当前版本与最新版本；',
            '（2）获取站点内容：向本站内容接口拉取软件清单与分类数据；',
            '（3）下载请求：向文件所在域名发起下载请求，该域名会接触您的 IP 地址；',
            '（4）自建加速：使用自建加速节点时，请求经该节点中转（位于中华人民共和国境外，日本东京），节点会接触您的 IP 地址与所请求的文件地址，用于完成下载、防盗链与限流；',
            '（5）反馈与投稿：仅在您主动提交时发送，内容见第六节。',
            '4.4 客户端不收集：您在本机打开的文件内容、浏览器历史、其他程序的输入输出、屏幕内容（除您主动使用截图工具并保存外）。',
          ]
        },
        {
          heading: '五、Hub AI 与第三方 AI 服务',
          items: [
            '5.1 Hub AI 是桌面客户端内置的电脑顾问功能，其**模型由您自行配置**。您需要在设置中填写所使用 AI 服务商的接口地址、密钥与模型名称。开发组不提供模型服务，也不作为您的数据接收方。',
            '5.2 当您使用 Hub AI 并发送消息时，以下内容会经由网络发送至**您所配置的第三方 AI 服务商**：',
            '（1）您输入的对话内容；',
            '（2）作为上下文一并发送的本机信息摘要，包括第 4.2 条所列的硬件概况、系统信息、软件清单、进程与占用中的**当前快照**；',
            '（3）人工智能调用本机工具所得到的结果，包括磁盘目录占用扫描结果、已安装软件清单等；',
            '（4）此前的对话历史（用于维持多轮上下文）。',
            '5.3 **请您知悉**：上述信息将离开您的设备并由第三方 AI 服务商依其自身规则处理。该服务商可能位于中华人民共和国境内或境外，其数据处理行为不受本开发组控制。是否使用、使用哪一家、发送哪些内容，均由您自行决定并承担相应后果。**如您不希望本机信息外传，请勿使用 Hub AI，或在使用前于设置中确认所配置服务商的隐私规则。**',
            '5.4 密钥保护：您填写的 API 密钥经 Windows 数据保护接口（DPAPI，CurrentUser 作用域）加密后保存于本机（hubai-key.bin）。该加密与当前 Windows 用户账户绑定，其他用户或复制到其他设备后无法解密。开发组无法获知您的密钥，也不会将其发送至除您所指服务商以外的任何第三方。',
            '5.5 对话历史：Hub AI 的对话记录保存在本机 hubai-sessions 目录。您可在界面中删除单条会话或清空全部历史；卸载客户端后该目录随安装目录一并保留于用户数据目录，可手动删除。',
            '5.6 Hub AI 不主动上传：除您主动发送消息外，客户端不会在后台定时将本机信息发送至任何 AI 服务商。',
          ]
        },
        {
          heading: '六、投稿、反馈与联系方式',
          items: [
            '6.1 通过「提交软件」「回声洞」提交的内容（不含联系方式）在通过审核后会进入本站仓库的公开议题列表，任何人可查看；通过「反馈中心」提交的内容（不含联系方式）直接进入公开议题列表，无需审核。网站与客户端提交的内容进入同一列表。',
            '6.2 联系方式为选填，提交前在您的设备上使用公钥加密；本站只保存密文，仅维护者可用私钥解密；联系方式用于审核或问题跟进沟通。请勿填写他人联系方式、密码、验证码等敏感信息。',
            '6.3 投稿与反馈内容将进入公开议题列表（反馈中心为直接公开）。请勿在公开内容中填写您或他人的敏感个人信息（如身份证号、住址、账号密码、联系方式等）；因您主动公开造成的后果由您自行承担。',
          ]
        },
        {
          heading: '七、文件上传',
          items: [
            '7.1 您在投稿中上传的安装包或图标，会直传至本站使用的阿里云对象存储（OSS）。此功能网站与客户端均可使用。',
            '7.2 安装包为私有存储，下载需换取有效期约 15 分钟的临时票据；图标为公开只读。',
            '7.3 未通过审核、被删除或撤回的投稿，其上传文件与相关信息将在合理期限内清理。',
          ]
        },
        {
          heading: '八、第三方服务',
          items: [
            '8.1 为实现功能，本服务可能使用以下第三方服务，并按清单列明处理目的与信息种类：',
            '（1）Cloudflare：后端接口与访问统计，处理访问域名、页面路径、时间戳、IP 地址等；',
            '（2）百度（hm.baidu.com）：访问统计，按其规则处理访问数据（仅网站）；',
            '（3）阿里云 OSS：文件存储，处理您投稿上传的安装包与图标；',
            '（4）GitHub：代码托管、公开议题与客户端更新分发，处理您提交的公开内容与更新检查请求；',
            '（5）第三方公益下载镜像与网盘：下载跳转，处理下载请求与 IP 地址；',
            '（6）主站托管服务商：页面托管，处理访问请求；',
            '（7）**您自行配置的 AI 服务商**：处理 Hub AI 的对话内容与本机信息摘要（见第五节）。',
            '8.2 其中部分服务、本站位于境外的自建下载加速节点，以及您可能选择的境外 AI 服务商，可能在中华人民共和国境外处理您的信息。本开发组将依法履行相应义务；但第三方处理行为由其自行负责。',
            '8.3 上述第三方对信息的处理适用其各自规则或本政策的相应说明，本开发组对其处理行为无法完全控制。',
          ]
        },
        {
          heading: '九、Cookie 与本地存储',
          items: [
            '9.1 网站使用少量 Cookie 与本地存储用于去重、记住偏好与维持功能；您可在浏览器中清除或禁用，但可能影响部分功能。',
            '9.2 客户端不使用 Cookie，其本地数据见第 4.1 条。',
          ]
        },
        {
          heading: '十、数据安全与保留',
          items: [
            '10.1 本服务采取联系信息加密、下载票据限时、上传预签名、API 密钥 DPAPI 加密等技术措施保护数据；但互联网环境并非绝对安全，本开发组无法保证万无一失。',
            '10.2 本服务仅在实现处理目的所必需的最短期限内保留相关信息；访问统计、下载票据等按技术与安全需要短期保留，期限届满后删除或匿名化处理。',
            '10.3 客户端的本机数据保留至您主动删除或卸载并清理用户数据目录为止。删除方式见第十一节。',
            '10.4 如发生个人信息泄露、篡改或丢失等安全事件，本开发组将依法及时采取补救措施，并按规定告知您和有关部门。',
          ]
        },
        {
          heading: '十一、您的权利',
          items: [
            '11.1 您可随时清除浏览器本地数据，以删除网站保存的设置与草稿。',
            '11.2 您可随时删除客户端的本机数据：',
            '（1）在客户端内「设置」中清理本地缓存与日志；',
            '（2）直接删除 %LOCALAPPDATA%\\ClassSoftwareHub 目录，将一并清除设置、日志、Hub AI 对话历史与加密密钥；',
            '（3）实验性功能产生的清理备份位于该目录下的 quarantine 子目录，可自行检查后删除。',
            '11.3 如需查询、复制、更正、删除您提交的内容，或撤回同意、清除本地数据，可通过下面的渠道联系我们；我们将在合理期限内处理。',
          ]
        },
        {
          heading: '十二、变更与联系',
          items: [
            '12.1 本政策可能更新，更新后在本页公布；如处理目的、方式或信息种类发生重大变更，本开发组将以显著方式提示，并依法重新取得同意（如适用）。',
            '12.2 联系方式与投诉举报：GitHub 仓库 https://github.com/c1201y/ClassSoftwareHub （可通过 Issues 反馈）；QQ 群 487903798 。您可通过上述渠道行使权利、投诉或举报。',
            '12.3 本政策以中文版本为准；英文译本仅供参考，如中英文不一致，以中文版本为准。',
          ]
        },
      ]
    },
    en: {
      title: 'Privacy Policy',
      intro:
        'This Policy is issued by the ClassSoftwareHub Development Group and explains how ClassSoftwareHub handles your information. ClassSoftwareHub consists of two forms: (1) the websites classsoftwarehub.us.ci and classsoftwarehub.cn and their mirrors ("the Site"); and (2) the ClassSoftwareHub desktop client (including the Windows and Windows 7 editions, "the Client"). Together they are referred to as "the Service".',
      sections: [
        {
          heading: '1. Scope',
          items: [
            '1.1 This Policy applies to both the Site and the Client. Where the two differ, the relevant clause states so separately.',
            '1.2 The Client has been covered by this Policy since v1.2. Should any earlier version have processed data inconsistently with this Policy, this Policy prevails; any part that cannot be adjusted retroactively for technical reasons will be corrected in a subsequent version.',
          ]
        },
        {
          heading: '2. What We Do Not Collect',
          items: [
            '2.1 The Service does not ask for your name, ID number, phone number or other real identity information, and does not collect your location, contacts, photo library, call logs or messages.',
            '2.2 Neither the Site nor the Client captures clipboard contents, monitors keystrokes, or captures your screen for upload.',
            '2.3 Contact details you voluntarily provide in a submission or feedback are excepted.',
          ]
        },
        {
          heading: '3. Information Collected by the Site',
          items: [
            '3.1 Visit statistics: a self-hosted service records page views (PV), unique visitors (UV) and concurrent visitors, carrying the domain, page path and timestamp of your request, plus a de-duplication cookie. The server processes your IP address when handling the request, for de-duplication, security protection and troubleshooting, not to identify you.',
            '3.2 Third-party analytics: pages use Baidu Analytics (hm.baidu.com), which collects visit data under Baidu\'s own rules.',
            '3.3 Device identifier: to prevent download abuse, the Site generates a device identifier locally in your browser (a hash derived from a random ID and browser features) and uploads only that hash, not the raw features; it is used for download quota control (the exact quota is as published on the Site).',
            '3.4 Local storage: the Site stores settings such as theme, mirror preference, endpoint memory, submission or feedback drafts and the device identifier in your browser\'s localStorage. This data stays on your device and you may clear it at any time.',
            '3.5 Download acceleration: when you download via the Site\'s self-built acceleration node, your request is relayed through that node, which processes your IP address and the requested file URL to complete the download and to prevent hotlinking and abuse. The node is located outside the People\'s Republic of China (Tokyo, Japan). Third-party public mirrors are operated by third parties under their own rules.',
          ]
        },
        {
          heading: '4. Information Processed by the Client',
          items: [
            '4.1 Data stored locally by the Client. The following stays on your device and is not uploaded by default:',
            '(1) settings: interface preferences, download path, sidebar layout, experimental feature switches — stored in %LOCALAPPDATA%\\ClassSoftwareHub\\settings.json;',
            '(2) device identifier: the same locally generated identifier as on the Site, stored in device-id.txt, used to identify abnormal download and update requests;',
            '(3) acceleration and content endpoint configuration: the self-built node key and site content endpoints, stored in corresponding text files;',
            '(4) backups from cleanup and repair: the experimental "uninstall leftovers cleanup" and "AppData management" features back up removed content to the quarantine directory before deletion, so you can restore it yourself;',
            '(5) logs: runtime and crash logs in the logs directory, used for troubleshooting.',
            '4.2 Local information the Client reads. The following is read and **displayed in the interface only**. Unless you actively use Hub AI and ask it to analyse this information (see Section 5), it is not uploaded:',
            '(1) hardware overview: CPU model and core count, memory capacity and usage, disk partitions and capacity, graphics model and video memory;',
            '(2) system information: OS version, screen resolution and scaling, battery status (if applicable);',
            '(3) installed software: name, version, publisher and install location;',
            '(4) processes and usage: process names, memory and CPU usage;',
            '(5) disk directories: names and sizes of specified directories.',
            '4.3 Information sent when the Client goes online:',
            '(1) update check: queries GitHub and this Site\'s endpoint for the current and latest version;',
            '(2) content retrieval: pulls the software list and categories from this Site\'s content endpoint;',
            '(3) download requests: requests files from the domain hosting them, which will see your IP address;',
            '(4) accelerated downloads: when using the self-built acceleration node, requests are relayed through a node located outside the PRC (Tokyo, Japan), which sees your IP address and the requested file URL for delivery, anti-leech and rate limiting;',
            '(5) feedback and submissions: sent only when you choose to submit (see Section 6).',
            '4.4 The Client does not collect: the contents of files you open, browser history, input or output of other programs, or screen contents (other than files you actively capture and save with the screenshot tool).',
          ]
        },
        {
          heading: '5. Hub AI and Third-Party AI Services',
          items: [
            '5.1 Hub AI is a computer-advisor feature built into the desktop client whose **model you configure yourself**. You provide the AI provider\'s endpoint, key and model name in settings. The Development Group does not provide model services and is not the recipient of your data.',
            '5.2 When you use Hub AI and send a message, the following is transmitted over the network to **the third-party AI provider you configured**:',
            '(1) the content of your message;',
            '(2) a snapshot of local information sent as context, covering the hardware overview, system information, installed software and process usage listed in Section 4.2;',
            '(3) results returned to the AI by local tools it invokes, including disk directory scans and installed software lists;',
            '(4) prior conversation history (to maintain multi-turn context).',
            '5.3 **Please note**: this information leaves your device and is processed by the third-party AI provider under its own rules. That provider may be located inside or outside the PRC, and its processing is not controlled by the Development Group. Whether to use Hub AI, which provider to use and what to send are your decisions, made at your own risk. **If you do not want local information to leave your device, do not use Hub AI, or review your provider\'s privacy rules before use.**',
            '5.4 Key protection: your API key is encrypted with the Windows Data Protection API (DPAPI, CurrentUser scope) and stored locally (hubai-key.bin). The encryption is bound to the current Windows user account; other users or copies on other devices cannot decrypt it. The Development Group cannot obtain your key and does not transmit it to any third party other than the provider you specified.',
            '5.5 Conversation history: Hub AI records are stored in the hubai-sessions directory on your device. You may delete individual sessions or clear all history in the interface. After uninstalling the client, that directory remains in the user data directory and may be deleted manually.',
            '5.6 Hub AI does not upload in the background: other than when you send a message, the client does not periodically transmit local information to any AI provider.',
          ]
        },
        {
          heading: '6. Submissions, Feedback and Contact',
          items: [
            '6.1 Content submitted via "Submit an app" and the Echo Cave (excluding contact details) enters the public issue tracker of this Site\'s repository after review; content submitted via the Feedback centre (excluding contact details) enters the public issue tracker directly. Submissions from the Site and the Client enter the same list.',
            '6.2 Contact details are optional and are encrypted with a public key on your device before submission; only ciphertext is stored, decryptable only by the maintainer. Do not enter other people\'s contact details, passwords or verification codes.',
            '6.3 Submitted and feedback content enters the public issue tracker (feedback is published directly). Do not include sensitive personal information about yourself or others in public content; you bear the consequences of voluntary disclosure.',
          ]
        },
        {
          heading: '7. File Uploads',
          items: [
            '7.1 Installers or icons you upload in a submission are sent directly to the Aliyun Object Storage (OSS) used by this Site. This is available from both the Site and the Client.',
            '7.2 Installers are stored privately and require a temporary ticket valid for about 15 minutes to download; icons are publicly readable.',
            '7.3 Uploaded files and related information of submissions that are rejected, removed or withdrawn will be cleaned up within a reasonable period.',
          ]
        },
        {
          heading: '8. Third-Party Services',
          items: [
            '8.1 To operate, the Service may use the following third-party services:',
            '(1) Cloudflare: backend endpoints and visit statistics — domain, page path, timestamp, IP address, etc.;',
            '(2) Baidu (hm.baidu.com): analytics — visit data under its own rules (Site only);',
            '(3) Aliyun OSS: file storage — installers and icons you upload in submissions;',
            '(4) GitHub: code hosting, public issues and client update distribution — public content you submit and update-check requests;',
            '(5) third-party public download mirrors and netdisks: download redirection — download requests and IP addresses;',
            '(6) hosting provider: page hosting — access requests;',
            '(7) **the AI provider you configure**: Hub AI conversation content and local information snapshots (see Section 5).',
            '8.2 Some of these services, this Site\'s overseas self-built acceleration node, and any overseas AI provider you select may process your information outside the PRC. The Development Group will perform its obligations under applicable law; third parties remain responsible for their own processing.',
            '8.3 Their handling is governed by their own rules or the relevant descriptions in this Policy, and the Development Group cannot fully control their processing.',
          ]
        },
        {
          heading: '9. Cookies and Local Storage',
          items: [
            '9.1 The Site uses a small number of cookies and local storage for de-duplication, remembering preferences and keeping features working; you may clear or disable them in your browser, which may affect some features.',
            '9.2 The Client does not use cookies; its local data is described in Section 4.1.',
          ]
        },
        {
          heading: '10. Data Security and Retention',
          items: [
            '10.1 The Service uses technical measures such as contact encryption, time-limited download tickets, pre-signed uploads and DPAPI encryption of API keys; however, no internet environment is absolutely secure and no guarantee can be given.',
            '10.2 Information is retained only for the shortest period necessary for the processing purposes; visit statistics, download tickets and similar data are retained short-term and deleted or anonymised after expiry.',
            '10.3 Client-side local data is retained until you delete it or uninstall and clear the user data directory. See Section 11.',
            '10.4 In the event of personal information leakage, tampering or loss, the Development Group will promptly take remedial measures and notify you and the competent authorities as required.',
          ]
        },
        {
          heading: '11. Your Rights',
          items: [
            '11.1 You may clear your browser\'s local data at any time to remove settings and drafts stored by the Site.',
            '11.2 You may delete the Client\'s local data at any time:',
            '(1) clear local cache and logs in the client\'s Settings;',
            '(2) delete the %LOCALAPPDATA%\\ClassSoftwareHub directory, which removes settings, logs, Hub AI history and the encrypted key;',
            '(3) cleanup backups created by experimental features are in the quarantine subdirectory and may be reviewed and deleted.',
            '11.3 To access, copy, correct or delete content you submitted, or to withdraw consent or clear local data, contact us via the channels below; we will handle your request within a reasonable period.',
          ]
        },
        {
          heading: '12. Changes and Contact',
          items: [
            '12.1 This Policy may be updated and posted on this page. If the purposes, methods or types of processing change materially, the Development Group will highlight the change and obtain renewed consent as required by law (where applicable).',
            '12.2 Contact and complaints: repository https://github.com/c1201y/ClassSoftwareHub (Issues); QQ group 487903798.',
            '12.3 The Chinese version of this Policy prevails; the English translation is for reference only, and in case of inconsistency, the Chinese version prevails.',
          ]
        },
      ]
    }
  },
  // ── 免责声明 ──────────────────────────────────────────────────────
  {
    key: 'disclaimer',
    version: 'v1.2',
    effective: '2026-10-23',
    zh: {
      title: '免责声明',
      intro:
        '请在使用本服务前阅读本声明。本服务包括：（一）网站 classsoftwarehub.us.ci、classsoftwarehub.cn 及其镜像站（以下称「网站」）；（二）桌面客户端 ClassSoftwareHub 桌面版（含 Windows 版与 Windows 7 版，以下称「客户端」）。两者合称「本服务」。',
      sections: [
        {
          heading: '一、软件来源',
          items: [
            '1.1 本服务仅收录、整理并指向第三方软件，安装包来自软件官方、GitHub、应用商店、用户自制软件或程序（已经过审核，其中部分由本服务对象存储保存并分发）、第三方网盘或第三方公益镜像。本服务不开发、不修改、不重打包这些软件，也不对其安全性、合法性、完整性作任何保证；收录审核仅为把关，不构成对权利状态或安全性的保证。',
            '1.2 部分软件为有意收录的旧版本或归档版，可能已不再由厂商维护，仅供特定场景使用。',
          ]
        },
        {
          heading: '二、信息准确性',
          items: [
            '2.1 本服务通过自动化脚本每周核对版本号、下载直链与体积，但信息仍可能滞后或出错；请以软件官方页面为准。',
          ]
        },
        {
          heading: '三、下载与安装风险',
          items: [
            '3.1 您应自行判断并承担下载、安装与使用第三方软件的风险。',
            '3.2 建议在安装前：核对官方公布的校验值、使用杀毒软件扫描、优先从官方渠道获取。',
            '3.3 GitHub 下载加速：为改善部分地区的下载体验，本服务对 GitHub 文件提供加速通道，包括本站自建加速节点（download.classsoftwarehub.cn）与第三方公益镜像；实际可用的通道以页面展示为准。',
            '（1）自建加速节点由本开发组运营，仅将 GitHub 上的文件原样中转给您，承诺不修改、不重打包、不插入任何内容；加速链接为限时签名链接，有效期约 5 分钟，须在有效期内使用，过期后需重新获取。',
            '（2）为保障服务稳定、防止盗链与非法刷流量，自建节点采取防盗链与访问控制措施，包括但不限于：校验请求来源（Referer 白名单）、要求携带有效限时签名、对签名签发进行服务端鉴权，并可能对访问频率、并发连接数与下载速度作出限制；对不符合要求、来源异常、存在刷量嫌疑的请求，节点有权拒绝、限速、中断或封禁，且无需事先通知。',
            '（3）客户端对 GitHub 文件采用分片并行下载：向文件所在域名发起多个分段请求并合并写入本地文件，不修改文件内容。分片数量与单片大小可能随网络状况与版本调整。',
            '（4）第三方公益镜像由第三方提供，本服务仅将原始链接拼接至镜像域名后跳转，不中转、不修改文件；其可用性、速度、限速策略与内容完整性由该第三方负责，本服务不保证其持续可用或内容未被篡改。',
            '（5）加速通道仅为改善下载体验的辅助手段，本服务不保证其在任何时间、地区或网络环境下可用，也不保证下载速度。如加速失败，请改用 GitHub 官方直链、软件官方渠道或其他可信来源。',
            '（6）您不得绕过、破解或伪造加速通道的防盗链、限时签名、限速或其他访问控制措施，不得批量抓取、盗链，或将加速链接、签名接口用于本服务之外的传播、代理、分发或商业用途。',
            '（7）无论是否使用加速通道，文件内容均以软件官方发布或 GitHub 原始发布为准；本服务不对经加速通道获取的文件作完整性保证，请您自行核对官方校验值并承担使用风险。',
          ]
        },
        {
          heading: '四、第三方链接',
          items: [
            '4.1 本服务的官网链接、网盘链接（对象存储直链除外）、应用商店入口、AI 网站导航及各类外链均指向第三方，其内容与服务由该第三方负责；您在第三方处产生的行为与风险由您自行承担。',
          ]
        },
        {
          heading: '五、内置工具',
          items: [
            '5.1 内置小工具（取色、抽号、计时、编码、二维码、时钟、学科工具等）在网站于您的浏览器本地运行、在客户端于您的设备本地运行，结果仅供参考。抽号等结果不构成任何权威结论，请勿用于需要法律或官方公信力的场景。',
            '5.2 函数图像、方程求解、化学方程式配平等学科工具的计算结果基于程序内置算法生成，可能存在精度限制、边界情况处理不当或对特定输入给出不正确结果的情形。**请勿将本工具的输出直接用于考试答卷、正式作业提交、工程设计或其他需要准确性保证的场合**，涉及关键计算时请自行复核。',
          ]
        },
        {
          heading: '六、桌面客户端的系统操作风险',
          items: [
            '客户端的部分功能会**实际修改您的系统状态**。请在明确理解后果的前提下使用。',
            '6.1 **软件卸载与残留清理**。客户端的「应用卸载」功能会调用系统卸载程序；「卸载残留清理」会扫描并删除卸载后遗留的文件与注册表项。扫描与删除采用同一套判据，但仍可能在个别软件上误判：',
            '（1）删除注册表项前会区分为「删除键」与「删除值」两种操作，并设有禁碰名单，但无法穷尽所有情况；',
            '（2）删除的文件会在执行前备份至本机 quarantine 目录，您可自行检查与还原；',
            '（3）**备份目录可被您或第三方清理工具删除，删除后无法还原**。建议在执行清理前自行确认待删除内容的必要性。',
            '6.2 **AppData 管理**。该功能会扫描用户目录下各程序的缓存与配置，并允许您删除其中被判定为可清理的内容：',
            '（1）清理采用**永久删除**，不进入系统回收站；',
            '（2）对一级目录设有禁碰区，不会被整目录删除；',
            '（3）删除后可能导致对应程序丢失登录状态、配置、历史记录或本地数据，**此类后果不可恢复**；',
            '（4）**删除前请确认该目录确实与您不再需要的程序相关**。开发组无法判断某一目录对您的具体用途。',
            '6.3 **自动关机**。该功能会在您设定的时间点关闭计算机：',
            '（1）未保存的文档与未提交的操作**将会丢失**；',
            '（2）关机由系统命令执行，客户端无法保证在所有环境下都能成功或被及时取消；',
            '（3）请勿在运行关键任务时启用。',
            '6.4 **自动更新**。客户端会在发现新版本后提示更新，并在您确认后下载安装包、退出应用并启动安装程序：',
            '（1）更新过程中应用会退出，正在进行的下载任务会中断；',
            '（2）安装包在下载后经过校验，校验失败会重新获取；',
            '（3）安装程序由 Inno Setup 生成，其行为受该工具与安装脚本约束。',
            '6.5 **实验性功能**。导航中标注为实验性或带 Exp 标记的功能，其稳定性、准确性与兼容性均未达到正式标准，可能在新版本中被修改或移除，也可能对系统产生非预期影响。请在使用前自行评估。',
            '6.6 **本开发组不对上述系统操作造成的任何数据丢失、系统异常、业务中断或其他损失承担责任**，但本条第 6.6 款不排除因故意或重大过失造成的责任，也不排除依适用法律不得排除或限制的责任。',
          ]
        },
        {
          heading: '七、AI 功能',
          items: [
            '7.1 客户端的 Hub AI 为只读性质的电脑顾问，其模型由您自行配置并连接第三方 AI 服务商。**该服务生成的内容由对应服务商负责**，本开发组不对其准确性、完整性、合法性作任何保证。',
            '7.2 AI 输出可能包含错误、过时信息或不适用于您具体环境的建议。**请勿仅依据 AI 建议执行删除、修改系统设置、安装软件等具有破坏性的操作**。',
            '7.3 AI 功能不连接模型时，界面可能显示占位内容或提示未配置，此为正常状态。',
            '7.4 关于使用 Hub AI 时本机信息如何传输至第三方服务商，详见《隐私政策》第五节。',
          ]
        },
        {
          heading: '八、服务可用性',
          items: [
            '8.1 本服务为免费公益性质，不保证不中断、无错误或永久可用；因维护、网络、第三方服务或地区网络策略导致的服务中断，本开发组不承担责任。',
            '8.2 客户端依赖 GitHub 与本站接口完成更新检查与内容获取。上述服务不可达时，客户端可能无法获取最新软件清单或无法更新，此为客观限制。',
          ]
        },
        {
          heading: '九、责任限制',
          items: [
            '9.1 在法律允许的范围内，对于因使用或无法使用本服务及本服务所指向的第三方软件而产生的任何直接或间接损失，本开发组不承担责任。',
            '9.2 本条不排除因本开发组故意或重大过失造成的责任，也不排除依适用法律不得排除或限制的责任。',
          ]
        },
        {
          heading: '十、其他',
          items: [
            '10.1 本声明与《用户协议》《隐私政策》共同适用。',
            '10.2 本声明部分条款若被认定无效，不影响其余条款的效力。',
            '10.3 本声明以中文版本为准；英文译本仅供参考，如中英文不一致，以中文版本为准。',
          ]
        },
      ]
    },
    en: {
      title: 'Disclaimer',
      intro:
        'Please read this Disclaimer before using the Service. The Service consists of: (1) the websites classsoftwarehub.us.ci and classsoftwarehub.cn and their mirrors ("the Site"); and (2) the ClassSoftwareHub desktop client (including the Windows and Windows 7 editions, "the Client").',
      sections: [
        {
          heading: '1. Software Source',
          items: [
            '1.1 The Service only lists, organises and links to third-party software; installers come from vendors, GitHub, app stores, user-made software or programs (subject to review; some are stored and distributed via this Service\'s object storage), third-party netdisks or third-party public mirrors. The Service does not develop, modify or repackage such software and gives no warranty as to its safety, legality or integrity; review for listing is a curation step only.',
            '1.2 Some software consists of deliberately listed old or archived versions that may no longer be maintained by the vendor and are provided for specific scenarios only.',
          ]
        },
        {
          heading: '2. Accuracy of Information',
          items: [
            '2.1 The Service checks versions, download links and sizes weekly via automated scripts, but information may still lag or be wrong; the vendor\'s official page prevails.',
          ]
        },
        {
          heading: '3. Download and Installation Risks',
          items: [
            '3.1 You must judge and bear the risks of downloading, installing and using third-party software.',
            '3.2 Before installing, we recommend verifying the official checksum, scanning with antivirus software, and preferring official channels.',
            '3.3 GitHub download acceleration: to improve the download experience in some regions, the Service offers acceleration channels for GitHub files, including a self-built acceleration node (download.classsoftwarehub.cn) and third-party public mirrors; the channels actually available are those shown on the page.',
            '(1) The self-built node is operated by the Development Group and only relays files from GitHub as-is; we undertake not to modify, repackage or insert anything. Acceleration links are time-signed, valid for about 5 minutes, and must be used within that period.',
            '(2) To keep the service stable and prevent hotlinking and abusive traffic, the node applies anti-leech and access-control measures, including checking the request origin (Referer whitelist), requiring a valid time-limited signature, authenticating signature issuance server-side, and possibly limiting request frequency, concurrent connections or speed. The node may refuse, throttle, interrupt or block requests that do not meet these requirements or are suspected of abuse, without prior notice.',
            '(3) The Client downloads GitHub files in parallel chunks: it issues multiple ranged requests to the hosting domain and merges them into a local file without altering content. Chunk count and size may change with network conditions and versions.',
            '(4) Third-party public mirrors are provided by third parties. The Service only prefixes the original link with the mirror domain and redirects; it does not relay or modify files. Their availability, speed, rate-limit policies and content integrity are the responsibility of those third parties.',
            '(5) Acceleration channels are a convenience only. The Service does not guarantee availability at any time, in any region or network environment, nor any download speed. If acceleration fails, use the official GitHub link, the vendor\'s official channel or another trusted source.',
            '(6) You must not bypass, break or forge the anti-leech, time-limited signature, rate limits or other access controls, nor scrape in bulk, hotlink, or use acceleration links or the signing endpoint for distribution, proxying, re-hosting or commercial purposes outside the Service.',
            '(7) Whether or not acceleration is used, file content is governed by the vendor\'s official release or the original GitHub release; no integrity warranty is given. Please verify official checksums yourself.',
          ]
        },
        {
          heading: '4. Third-Party Links',
          items: [
            '4.1 Official-site links, netdisk links (except object-storage direct links), app-store entries, the AI-site directory and other external links point to third parties, whose content and services they are responsible for.',
          ]
        },
        {
          heading: '5. Built-in Tools',
          items: [
            '5.1 Built-in tools (colour picker, random picker, timer, encoding, QR code, clock, subject tools, etc.) run in your browser on the Site and locally on your device in the Client. Results are for reference only.',
            '5.2 Subject tools such as function plotting, equation solving and chemical equation balancing compute results with built-in algorithms, which may have precision limits, mishandle edge cases, or return incorrect results for certain inputs. **Do not use their output directly for exam papers, formal assignments, engineering design or any context requiring guaranteed accuracy**; verify critical computations yourself.',
          ]
        },
        {
          heading: '6. System Operations of the Desktop Client',
          items: [
            'Some features of the Client **actually modify your system state**. Use them only when you understand the consequences.',
            '6.1 **Software uninstall and leftover cleanup.** The "app uninstall" feature invokes the system uninstaller; "uninstall leftovers cleanup" scans and deletes files and registry entries left behind. Both use the same criteria, but misjudgement is still possible for individual applications:',
            '(1) registry operations distinguish between deleting a key and deleting a value, and a protected list is applied, though it cannot cover every case;',
            '(2) files are backed up to the local quarantine directory before deletion, so you can review and restore them;',
            '(3) **the backup directory may be deleted by you or by third-party cleaning tools, after which restoration is impossible**.',
            '6.2 **AppData management.** This feature scans per-application caches and configuration under your user directory and allows deletion of items deemed cleanable:',
            '(1) cleanup performs **permanent deletion** and does not use the Recycle Bin;',
            '(2) first-level directories are protected and will not be deleted wholesale;',
            '(3) deletion may cause the affected application to lose sign-in state, configuration, history or local data — **such consequences are irreversible**;',
            '(4) **confirm that a directory no longer serves any purpose before deleting it**. The Development Group cannot know what a given directory means to you.',
            '6.3 **Scheduled shutdown.** This feature powers off the computer at a time you set:',
            '(1) unsaved documents and uncommitted operations **will be lost**;',
            '(2) shutdown is performed via system commands; the Client cannot guarantee success or timely cancellation in all environments;',
            '(3) do not enable it while running critical tasks.',
            '6.4 **Automatic updates.** When a new version is found, the Client prompts you, then downloads the installer, exits the application and launches the installer:',
            '(1) the application exits during the update and in-progress downloads are interrupted;',
            '(2) downloaded installers are verified, and re-fetched if verification fails;',
            '(3) the installer is produced by Inno Setup and its behaviour is governed by that tool and the install script.',
            '6.5 **Experimental features.** Features marked as experimental or labelled Exp have not reached stability, accuracy or compatibility standards; they may change or be removed in later versions and may affect your system unexpectedly. Evaluate before use.',
            '6.6 **The Development Group accepts no liability for data loss, system abnormality, business interruption or other damage caused by the operations above**, except for liability arising from intent or gross negligence, or liability that cannot be excluded or limited under applicable law.',
          ]
        },
        {
          heading: '7. AI Features',
          items: [
            '7.1 Hub AI in the Client is a read-only computer advisor whose model you configure yourself, connecting to a third-party AI provider. **Content generated by that service is the provider\'s responsibility**; the Development Group gives no warranty as to accuracy, completeness or legality.',
            '7.2 AI output may contain errors, outdated information or advice unsuitable for your environment. **Do not perform destructive actions — deleting files, changing system settings, installing software — based solely on AI advice.**',
            '7.3 When no model is configured, the interface may show placeholder content or a notice; this is expected.',
            '7.4 For how local information is transmitted to third-party providers when using Hub AI, see Section 5 of the Privacy Policy.',
          ]
        },
        {
          heading: '8. Availability',
          items: [
            '8.1 The Service is free and volunteer-run and does not guarantee uninterrupted, error-free or permanent availability; the Development Group is not liable for interruptions caused by maintenance, network, third-party services or regional network policies.',
            '8.2 The Client relies on GitHub and this Service\'s endpoints for update checks and content retrieval. When those are unreachable, the Client may be unable to fetch the latest software list or update.',
          ]
        },
        {
          heading: '9. Limitation of Liability',
          items: [
            '9.1 To the extent permitted by law, the Development Group is not liable for any direct or indirect loss arising from the use of, or inability to use, the Service or the third-party software it links to.',
            '9.2 Nothing in this clause excludes liability arising from intent or gross negligence, or liability that cannot be excluded or limited under applicable law.',
          ]
        },
        {
          heading: '10. Miscellaneous',
          items: [
            '10.1 This Disclaimer applies together with the User Agreement and the Privacy Policy.',
            '10.2 If any provision is held invalid, the remaining provisions remain in effect.',
            '10.3 The Chinese version prevails; the English translation is for reference only.',
          ]
        },
      ]
    }
  },
];

export default legalDocs;
