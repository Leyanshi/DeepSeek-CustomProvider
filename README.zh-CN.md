# DeepSeek CustomProvider

[English](README.md) | 简体中文

基于 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo) 的轻量 Android 聊天客户端，可自定义 **API Key、Base URL 和模型**。复用系统 WebView，通过原生 HTTPS 桥接访问 API，APK 约 **1.92 MB**，无需 Android Studio、Gradle 或模拟器。

<img src="resources/deepseek-app-icon.svg" width="88" height="88" alt="DeepSeek 应用图标" />

## 下载与使用

[下载 Android APK](https://github.com/Leyanshi/DeepSeek-CustomProvider/releases/latest) · [安装与构建详细说明](ANDROID.md)

支持 Android 8.0 及以上，推荐较新的系统 WebView，不依赖 Google Play 服务。v0.1.8 启动画面为居中的 DeepSeek LOGO 和灰色「加载中」；原生计时器在启动未完成时于 15 秒后显示诊断、重试和复制按钮，即使网页脚本没有运行也能提示。保留旧内核启动 API 和视口高度兼容。手机上显示的应用名称为 **DeepSeek**。这是社区客户端，并非 DeepSeek 官方应用。

1. 从 Releases 下载 APK，传到手机安装。
2. 打开「设置 → 数据管理」，填写 API Key 和 HTTPS Base URL，点击「确定」保存。
3. 在「聊天模型」中获取模型列表并选择，或手动填写自定义模型 ID，再点击「确定」。

新消息、编辑提问和重新生成使用当前所选模型，继续生成沿用原回答的模型。连接配置和模型会保留到下次启动。正式发布版本使用同一签名，可以覆盖安装旧版并保留本机数据。

若仍停在加载画面，请等待 15 秒并点击「复制诊断」，反馈应用版本、WebView 版本和错误详情。重试保留本机聊天记录。用户手机上持续加载的原因尚未确认。

<img src="docs/images/android-loading.png" width="260" alt="居中 DeepSeek LOGO 和灰色加载中" />

## 运行

准备 Node.js 24 和 pnpm 12.21.0：

```sh
git clone https://github.com/Leyanshi/DeepSeek-CustomProvider.git
cd DeepSeek-CustomProvider
pnpm install
pnpm dev
```

打开 http://localhost:8090 。

生成静态产物：

```sh
pnpm build
```

产物位于 `dist/`，可部署到静态服务器，也可直接打开 `dist/index.html`。直接打开时，浏览器和 API 服务需允许 `file://` 页面的存储与跨域请求。

Android 打包使用 **Windows 和 JDK 11+**：

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm pack:android
```

通过 `JAVA_HOME` 或 `DS_ANDROID_JAVA_HOME` 指定现有 JDK。首次构建下载并校验 Google 官方的 Android 平台和构建工具归档，只保留约 48 MB 的必要文件到 `.android-tools/`，不会修改系统 PATH。产物位于 `release/DeepSeek-Android-<版本>.apk`。详见 [ANDROID.md](ANDROID.md)。

全新检出时会在 `android/.signing/` 生成本地签名密钥。保留该目录，才能让自己的后续构建覆盖安装；自行构建的 APK 与其他密钥签名的 APK 不能互相覆盖。签名密钥、下载工具和构建产物均从 Git 排除。GitHub Pages 工作流仅手动触发，运行前需在仓库设置中启用由 GitHub Actions 构建的 Pages。

## 功能

- 自定义 API Key 和 HTTPS Base URL，支持服务根地址、端口、路径前缀及 `/v1`。
- 使用正在填写的连接获取模型列表，支持选择模型或手动填写列表之外的模型 ID。
- 内置界面与 DeepSeek SVG 标识，白色圆角桌面图标和原生 Android HTTPS 桥接。
- 多会话、自动标题、重命名与删除；编辑提问、重新生成和切换消息分支。
- 流式回答、深度思考、智能搜索、链接阅读与来源引用；支持停止和符合条件的继续生成。
- 附件上传、粘贴与拖拽，语音输入和回复朗读；移动端录音时输入框首行显示实时频谱。
- Markdown、代码高亮、KaTeX 公式和 Mermaid 图表。
- 简体中文与英文、浅色与深色主题、移动端布局、位置设置、历史导入导出。

## 数据

API Key 和设置保存在浏览器 localStorage，会话及附件原件保存在 IndexedDB，本地数据按浏览器用户配置和站点源（origin）隔离。发送对话、上传附件和使用语音功能时，相应内容会提交给配置的 API 服务。

设置中的历史导入导出使用 ZIP 格式。导入会在确认并校验成功后替换全部本地会话和附件；导出包含会话与本地可用的图片原件，不包含 API Key、设置或非图片附件原件。格式与保留范围见[历史导入导出](src/services/chat/history/README.md)。

设置 → 数据管理 → 删除所有对话，会在确认后清空全部本地会话、附件原件和未发送的草稿，停止正在生成的回复并回到新对话。API Key 和其他设置保留，已上传到 API 服务的文件不受影响。

## 开发

| 命令                 | 用途                         |
| -------------------- | ---------------------------- |
| `pnpm dev`           | 启动开发服务器               |
| `pnpm build`         | 网页构建到 `dist/`           |
| `pnpm pack:android`  | 构建并签名 Android APK       |
| `pnpm type`          | TypeScript 类型检查          |
| `pnpm lint`          | oxlint 检查                  |
| `pnpm test:models`   | 模型列表解析与自定义 ID 测试 |
| `pnpm test:base-url` | 前端与原生 URL 测试          |
| `pnpm test:android`  | 手机尺寸界面与桥接测试       |
| `pnpm format`        | oxfmt 格式化                 |

CI 执行类型检查、代码检查、模型解析、前端与原生 URL 测试及网页构建。12 项移动端界面测试使用已有的 Microsoft Edge 模拟手机尺寸和 Android 桥接，覆盖加载页、启动完成通知和早期初始化错误，不安装模拟器，也不需要真实 API Key。打包时自动检查 APK 签名、对齐和清单。尚未进行 Android 真机测试，包括原生启动计时和诊断。

[rspack.config.ts](rspack.config.ts) 默认连接 `https://api.deepseek.com`。`createConfig({ apiOrigin, devServer })` 支持自定义 API 地址和开发服务器代理。

聊天默认使用 `deepseek-flash`，通过 **Anthropic 兼容的 Messages / Files API** 通信，接入服务需支持相应协议及所选模型。更换 Base URL 和模型不会自动转换为 OpenAI Chat Completions 协议；语音使用 ASR / TTS 接口。请求使用搜索、链接阅读、标题和 `latest_reminder` 等扩展，接入服务需支持相应能力。附件实际支持的格式以服务端校验为准。

<img src="docs/images/android-sidebar.png" width="260" alt="侧边栏 SVG 标识与 Android 界面预览" />

```text
src/
  app/                 应用布局、主题与全局样式
  components/          聊天、设置、Markdown 等界面组件
  i18n/                中英文文案
  services/
    api/               API 请求、SSE 与协议类型
    chat/              会话、消息分支、本地存储与历史导入导出
    markdown/          Markdown 解析、代码高亮与图表
    speech/            录音与朗读
  utils/               通用工具
```

## 许可证

[MIT](LICENSE)，保留 DeepSeek 的版权声明和上游提交历史。SVG 来自[用户指定的 DeepSeek favicon](https://fe-static.deepseek.com/chat/favicon.svg)。构建产物附带 `LICENSE` 与 `THIRD-PARTY-NOTICES.txt`，第三方依赖遵循各自的许可证。
