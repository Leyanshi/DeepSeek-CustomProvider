# DeepSeek Android

基于 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo) 的社区 Android 客户端。使用 Android 系统 WebView，APK 不内置 Chromium，也不需要 Google Play 服务。

应用名称为「DeepSeek」。桌面图标采用[用户指定的 DeepSeek SVG](https://fe-static.deepseek.com/chat/favicon.svg)，配白色圆角背景；侧边栏原名称位置显示同一 SVG。图标已内置，打开应用无需联网下载。原始图形保存于 `resources/deepseek.svg`，构建时直接生成 Android 矢量图标，不增加图片处理工具。

## 安装

将 `release/DeepSeek-Android-0.1.10.apk` 传到手机，打开并按系统提示允许该来源安装。支持 Android 8.0 及以上，推荐较新的系统 WebView；已加入旧内核启动 API 和视口高度的兼容处理。兼容 ARM、ARM64 和 x86，不包含专用的原生架构库。新版沿用原签名，versionCode 为 8，可覆盖安装 0.1.3–0.1.9 并保留原有数据。

0.1.10 新增启动更新检查。每次启动应用或从桌面再次打开，会在后台请求本仓库的 GitHub 最新正式 Release；检测到比安装版本更新的版本后，显示「更新版本： {version}」和完整更新日志。日志区域可上下滚动，没有显示长度限制。点击「打开 Release」可在系统浏览器打开对应发布页，下载 APK 后覆盖安装；点击「暂不更新」关闭弹窗，下次启动仍会检查。重用已有应用界面时保留会话，同时处理新的桌面启动请求；进行中的检查会合并，避免重复弹窗。

版本号按数字比较，例如 `0.1.10` 高于 `0.1.9`；相同版本、旧版本、草稿和预发布版不提示。网络不可用、超时、GitHub 限流、没有 Release 或响应无效时直接结束检查，不显示错误和 Toast。检查使用 Android 原生网络，请求公开的 GitHub API，不需要 GitHub 账号或新增依赖。弹窗在应用处于前台且启动完成或显示启动诊断后出现。

启动画面为白底居中的 DeepSeek LOGO，下方显示灰色「加载中」。Android 原生加载层在 React 界面挂载后关闭；即使网页脚本没有执行，原生计时器也会在 15 秒后显示诊断信息和操作按钮。重试不会清除聊天记录。

0.1.9 修复 Windows `aapt2` 将网页资源路径写入 APK 时使用反斜杠的问题。旧包中的 `assets/static\startup.js` 与 Android 请求的 `assets/static/startup.js` 不一致，会让启动脚本和主程序无法读取。打包现在统一使用正斜杠，并对最终签名 APK 中的全部网页文件逐个检查路径和内容。这一问题在 APK 内部已确认；电脑上的网页测试不经过 APK，因而此前没有发现。

0.1.9 针对「复制诊断后粘贴为空」补上独立取出诊断的方式：「复制诊断」现在生成完整的纯文本、检查系统剪贴板回读结果，并始终打开原生诊断窗口。也可直接点击「查看 / 导出诊断」查看、长按选择文字或导出 TXT。导出使用 Android 系统文件保存窗口，不依赖网页、剪贴板或额外存储权限。如果仍无法启动，可将 `DeepSeek-startup-diagnostic.txt` 或诊断窗口截图反馈。

即使没有捕获到脚本错误，诊断也会包含应用版本、Android 版本、厂牌机型、系统 WebView 包名和版本、已读取的脚本、启动状态和明确的「尚未捕获到错误」说明。页面检测会补充启动脚本阶段、网页加载状态、原生桥接是否存在及视口尺寸；只读取启动元数据，不读取聊天记录和连接设置。

网页错误监听现在先于兼容处理安装，初始化阶段的异常也能显示。保留 0.1.7 对旧 WebView 缺少 `Intl.DisplayNames`、媒体查询事件 API、现代数组方法以及不支持 `dvh` 的兼容修复。

<img src="docs/images/android-loading.png" width="260" alt="白底居中 DeepSeek LOGO 和灰色加载中" />

首次打开，在「设置 → 数据管理」中填写 Base URL 和 API Key，点击「确定」验证后保存。默认 Base URL 为 `https://api.deepseek.com`；可在 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) 获取 Key。只修改 Base URL 时可以沿用已保存的 Key，验证失败会保留原配置。联网聊天按服务提供方的规则计费，界面资源在本机加载。

Base URL 支持 HTTPS 域名、端口和路径前缀。填写服务根地址时，例如 `https://example.com/proxy`，聊天请求发送到 `/proxy/anthropic/v1/messages`；填写 `https://example.com/v1` 时发送到 `/v1/messages`，不会重复追加 `/v1`。附件、Key 验证和语音同样跟随新地址。留空或点击「恢复 DeepSeek 默认地址」后确认可恢复默认配置。

在同一页的「聊天模型」中点击「获取模型」，会使用正在填写的 Base URL 和 API Key 请求 `/models`，获取列表后即可选择模型，也可直接填写「自定义模型 ID」。点击「确定」后，连接配置与模型一起保存；获取列表本身不会提交正在编辑的配置，也不会自动替换已选模型。列表支持标准的 `{data: [{id: "模型 ID"}]}` 响应和 Anthropic 的 `display_name`，重复或无效条目会跳过。

模型 ID 保存在本机，重启后沿用。新消息、编辑提问和重新生成使用当前选定的模型；继续生成保留原回答的模型。首次使用及从旧版升级的默认模型为 `deepseek-flash`。服务返回空列表或获取失败时可重试、手动填写；仅修改已保存连接的模型无需再次验证 `/models`。更换 Base URL 或 API Key 仍需通过 `/models` 验证后保存。

自定义服务需支持 Anthropic Messages 接口与所选模型，更换地址和模型不会将请求改为 OpenAI Chat Completions 协议。搜索、附件和语音仍需服务支持对应扩展。Base URL 不允许 HTTP、用户名、密码、查询参数或 URL 片段。

保留流式聊天、停止生成、附件、公式与图表、主题、语音、聊天记录导入导出功能。文件选择和 ZIP 导出使用 Android 的系统文件窗口，不申请全盘存储权限；录音时才申请麦克风权限。搜索、附件和语音是否可用取决于 DeepSeek API 对相应接口和模型的支持。

## 轻量构建

不安装 Android Studio、Gradle、模拟器、NDK 或整套 SDK。复用现有 Node.js 和 JDK 11+，直接用 `aapt2 → javac → d8 → zipalign → apksigner` 构建和签名。

```powershell
corepack pnpm install
corepack pnpm pack:android
```

首次构建从 Google 官方下载两个归档，校验 SHA-1 后只保留必需的文件到 `.android-tools/`，约 48 MB。不会修改系统 PATH 或 Java 配置。下载缓存位于 `tmp/android-tools/`，工具提取完成后可删除。后续打包直接复用 `.android-tools/`。

使用其他 JDK 时可指定：

```powershell
$env:DS_ANDROID_JAVA_HOME = 'D:\Environments\jdk\jdk17'
corepack pnpm pack:android
```

构建脚本目前支持 Windows 主机，输出为 Android APK。`pnpm build` 仍构建普通网页，`pnpm build:android` 构建供 APK 内置的网页。

## 验证

```powershell
corepack pnpm type
corepack pnpm lint
corepack pnpm test:base-url
corepack pnpm test:models
corepack pnpm test:android-assets
corepack pnpm test:android-updates
corepack pnpm test:android
```

验证已打包的 APK 时，直接从 APK 读取网页资源再运行相同的手机尺寸测试：

```powershell
$env:DS_ANDROID_TEST_APK = 'release/DeepSeek-Android-0.1.10.apk'
corepack pnpm exec playwright test
Remove-Item Env:DS_ANDROID_TEST_APK
```

界面和桥接测试用电脑已有的 Edge 在手机尺寸下运行，模拟 Android 原生 API，并使用 Android 壳相同的内容安全策略。不需要真实 API Key，不产生调用费用，也不安装测试浏览器或模拟器。12 项测试覆盖流式聊天、取消请求、二进制附件、ZIP 导出、主题、外部链接、Base URL 验证与恢复默认、模型选择及持久化、自定义 ID、重新生成与续写、列表重试，以及旧 API 缺失、缺少 `dvh` 支持、启动失败后显示详情与重试、居中 LOGO 加载页、React 挂载通知和兼容初始化异常上报。另有 5 项打包测试覆盖 Windows ZIP 路径、资源保留、路径冲突、缺失脚本及内容过期。模型解析测试检查列表格式、名称、重复条目和 ID 校验；Base URL 测试同时检查前端和 Android 原生的 URL 拼接及接口边界。打包脚本自动验证 APK 签名、全部网页资源、文件对齐与 Android 清单。

更新逻辑另有 22 项 JDK 检查，覆盖数字版本比较、相同和旧版本、无效版本、草稿和预发布、请求失败、空响应及长中文日志的完整保留。不安装模拟器或额外测试依赖。

这些检查不代替 Android 真机验收。目前没有进行真机上的更新弹窗、原生加载层、超时诊断、剪贴板、TXT 导出、系统文件窗口、麦克风和键盘适配测试。旧包的资源路径错误已确认；是否还有手机特有问题以及粘贴为空的原因，需要真机反馈。

## 数据与更新

API Key、Base URL、模型与设置保存于应用私有 WebView 存储，对话和附件保存于 IndexedDB。没有增加 API Key 加密，与上游行为一致。清除应用数据或卸载会删除本机记录，建议先导出 ZIP。导出的 ZIP 不包含 API Key、Base URL 或其他设置。

网络桥向用户配置的 HTTPS 服务转发允许的 API 接口，不接受跨站重定向或任意请求头。单次 API 请求体上限 32 MB，单次本机导出上限 256 MB。应用没有后台服务、广告或遥测。启动检查只获取公开的 Release 信息，APK 更新由用户从发布页下载并安装。

签名密钥和密码保存在 `android/.signing/`，已从 Git 忽略。保留并备份该目录，后续升级必须使用相同密钥和更高的 versionCode；不要将密钥公开提交。

分发包保留上游 MIT `LICENSE` 和 `THIRD-PARTY-NOTICES.txt` 中的依赖许可证。此应用是社区封装，不是 DeepSeek 官方客户端。
