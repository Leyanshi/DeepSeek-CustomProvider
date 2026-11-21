# DeepSeek CustomProvider

English | [简体中文](README.zh-CN.md)

A lightweight Android chat app based on [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo). Configure your own **API Key, Base URL and model**. The app uses the system WebView and a native HTTPS bridge; its APK is about **1.92 MB**. No Android Studio, Gradle or emulator is required.

<img src="resources/deepseek-app-icon.svg" width="88" height="88" alt="DeepSeek app icon" />

## Download and use

[Download the Android APK](https://github.com/Leyanshi/DeepSeek-CustomProvider/releases/latest) · [Android build and usage guide](ANDROID.md)

Requires Android 8.0 or later. A recent system WebView is recommended. v0.1.9 fixes Windows separators in APK asset paths that prevented Android from loading the scripts, and verifies every bundled web file after signing. The loading screen shows a centered DeepSeek logo and a gray “加载中” label. A native 15-second timer displays diagnostics if startup does not finish; copying checks the clipboard and opens a native report dialog, with TXT export available. Older startup API and viewport fallbacks are retained. Google Play services are not required. The app is named **DeepSeek** on the device. This is a community client, not an official DeepSeek app.

1. Install the APK from Releases.
2. Open **Settings → Data**, enter an API Key and an HTTPS Base URL, then confirm to save.
3. Under **Chat model**, fetch the model list and select a model, or enter a custom model ID. Confirm to save.

New messages and regenerated replies use the selected model. Continuation uses the original reply's model. Connection settings and model selection persist across restarts. Released updates keep the same signing certificate, so you can install them over an earlier release to retain local data.

If startup remains on the loading screen, wait 15 seconds and choose **查看 / 导出诊断 → 导出 TXT**. Attach the saved `DeepSeek-startup-diagnostic.txt` or a screenshot of the native diagnostic dialog to a bug report if pasting copied text remains empty. The report includes app and Android versions, device model, WebView version, startup stages and any captured errors. Retry keeps your local history. The reported device's startup and clipboard causes have not yet been confirmed.

<img src="docs/images/android-loading.png" width="260" alt="Centered DeepSeek logo with gray loading label" />

## Getting started

Install Node.js 24 and pnpm 12.21.0, then run:

```sh
git clone https://github.com/Leyanshi/DeepSeek-CustomProvider.git
cd DeepSeek-CustomProvider
pnpm install
pnpm dev
```

Open http://localhost:8090.

To build the static site:

```sh
pnpm build
```

The output is written to `dist/`. Deploy it to a static web server or open `dist/index.html` directly. Opening the file directly requires browser support for storage on `file://` pages and an API service that permits their cross-origin requests.

To package the Android app on **Windows with JDK 11+**:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm pack:android
```

Set `JAVA_HOME` or `DS_ANDROID_JAVA_HOME` to your existing JDK. The first Android build downloads and verifies official Android tool archives, retaining only about 48 MB of required files in `.android-tools/`. The output is `release/DeepSeek-Android-<version>.apk`. See [ANDROID.md](ANDROID.md) for details.

Each fresh checkout generates its own local signing key in `android/.signing/`. Keep that directory for subsequent builds; a locally signed APK cannot update an APK signed by another key. Signing keys, tool downloads and build output are excluded from Git. GitHub Pages deployment is a manual workflow, available after enabling Pages with GitHub Actions in repository settings.

## Features

- Custom API Key and HTTPS Base URL, with service roots, ports, path prefixes and `/v1` supported.
- Fetch models using the entered connection; select a returned model or enter an unlisted custom model ID.
- Bundled UI and DeepSeek SVG branding, a white rounded launcher icon, and the native Android HTTPS bridge.
- Multiple conversations with automatic titles, renaming, and deletion; edit prompts, regenerate replies, and switch between message branches.
- Streaming replies, deep thinking, smart search, link reading, and source citations; stop generation or continue eligible replies.
- Upload, paste, or drag and drop attachments; use voice input and read replies aloud. A live audio spectrum appears in the first row of the input area while recording on mobile.
- Markdown, syntax highlighting, KaTeX math, and Mermaid diagrams.
- Simplified Chinese and English, light and dark themes, mobile layouts, location settings, and chat history import and export.

## Data and storage

Your API key and settings are stored in the browser's localStorage. Conversations and original attachments are stored in IndexedDB. Local data is isolated by browser profile and site origin. Sending messages, uploading attachments, and using speech features sends the relevant content to the configured API service.

History import and export in Settings use ZIP archives. After confirmation and successful validation, importing replaces all local conversations and attachments. Exports include conversations and locally available original images, but exclude API keys, settings, and original non-image attachments. See the [history import/export documentation (Chinese)](src/services/chat/history/README.md) for the archive format and preservation details.

Settings → Data → Delete all chats clears all local conversations, original attachments, and unsent drafts after confirmation. It stops ongoing replies and returns to a new chat. Your API key and settings are preserved; files already uploaded to the API service are not deleted.

## Development

| Command                    | Description                             |
| -------------------------- | --------------------------------------- |
| `pnpm dev`                 | Start the development server            |
| `pnpm build`               | Build the web app into `dist/`          |
| `pnpm pack:android`        | Build and sign the Android APK          |
| `pnpm type`                | Run TypeScript type checks              |
| `pnpm lint`                | Lint with oxlint                        |
| `pnpm test:models`         | Test model catalogs and custom IDs      |
| `pnpm test:base-url`       | Test frontend and native URL handling   |
| `pnpm test:android-assets` | Test Android ZIP paths and web assets   |
| `pnpm test:android`        | Test mobile UI and the simulated bridge |
| `pnpm format`              | Format with oxfmt                       |

CI checks types, lint, model parsing, frontend/native URL handling, Android asset packaging and the web build. The 12 mobile UI tests use an existing Microsoft Edge installation and a simulated native bridge, including loading, readiness and early startup errors; they do not need an emulator or a real API Key. Five packaging tests cover ZIP paths, collisions, missing files and stale contents. APK packaging verifies every bundled web file, signatures, alignment and the manifest. Android device testing, including the native startup timer, clipboard and TXT export, has not yet been performed.

[rspack.config.ts](rspack.config.ts) uses `https://api.deepseek.com` by default. Use `createConfig({ apiOrigin, devServer })` to customize the API origin and development server proxy.

Chat uses `deepseek-flash` by default through **Anthropic-compatible Messages / Files APIs**. The selected service must support that protocol and the selected model. Changing Base URL or model does not convert requests to OpenAI Chat Completions. Speech features use ASR / TTS endpoints. Requests include extensions for search, link reading, titles, and `latest_reminder`, so the configured service must support the corresponding capabilities. Supported attachment formats are determined by server-side validation.

```text
src/
  app/                 Application layout, themes, and global styles
  components/          Chat, settings, Markdown, and other UI components
  i18n/                English and Chinese translations
  services/
    api/               API requests, SSE, and protocol types
    chat/              Conversations, message branches, storage, and history import/export
    markdown/          Markdown parsing, syntax highlighting, and diagrams
    speech/            Audio recording and read-aloud playback
  utils/               Shared utilities
```

## License

[MIT](LICENSE), retaining DeepSeek's copyright notice and upstream source history. The bundled SVG comes from [DeepSeek's favicon](https://fe-static.deepseek.com/chat/favicon.svg). Builds include `LICENSE` and `THIRD-PARTY-NOTICES.txt`; dependency licenses remain applicable.
