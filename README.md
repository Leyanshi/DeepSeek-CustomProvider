# DeepSeek CustomProvider

English | [简体中文](README.zh-CN.md)

A lightweight Android chat app. Configure your own **API Key, Base URL and model**. The app uses the system WebView and a native HTTPS bridge; its APK is about **2 MB**. No Android Studio, Gradle or emulator is required.

<img src="resources/deepseek-app-icon.svg" width="88" height="88" alt="DeepSeek app icon" />

## ❤️ Sponsors

> [Wanna be there?](mailto:zynkapi@qq.com)
<details open>

<table>
<tr>
<td width="180"><a href="https://zynk.top/sign-up?aff=DSCP"><img src="https://topup.leyanshi.me/logo.jpg" alt="Zynk API" width="150"></a></td>
<td>Thanks to Zynk API for sponsoring this project! <a href="https://zynk.top/sign-up?aff=DSCP">Zynk API</a> is an AI API gateway platform focused on speed and value, providing API access to leading models such as Claude, OpenAI, Gemini, and Kimi. <a href="https://zynk.top/sign-up?aff=DSCP">Click here</a> to enjoy fast, reliable, and affordable service at prices far below official API rates.</td>
</tr>




</table>

</details>

## Download and use

[Download the Android APK](https://github.com/Leyanshi/DeepSeek-CustomProvider/releases/latest) · [Android build and usage guide](ANDROID.md)

Requires Android 8.0 or later. A recent system WebView is recommended. v0.1.10 checks GitHub's latest stable Release at startup. A newer version opens a dialog titled “更新版本： {version}” with complete, scrollable release notes and an **打开 Release** button. Failed checks are silent. The loading screen shows a centered DeepSeek logo and a gray “加载中” label, with native diagnostics and TXT export if startup fails. APK asset paths and every bundled web file are verified after signing. Google Play services are not required. The app is named **DeepSeek** on the device. This is a community client, not an official DeepSeek app.

1. Install the APK from Releases.
2. Open **Settings → Data**, enter an API Key and an HTTPS Base URL, then confirm to save.
3. Under **Chat model**, fetch the model list and select a model, or enter a custom model ID. Confirm to save.
4. In **Web & speech**, configure independent Search/Fetch and speech services, or follow the chat connection. OpenAI compatible speech supports custom TTS/transcription models and voice IDs.

v0.1.13 animates the mobile conversation drawer: it slides in and out over 300 ms with a fading backdrop. Closing by selecting a conversation, tapping outside or pressing Android Back follows the same transition. It respects the system’s reduced motion preference and adds no dependencies.

v0.1.12 adds **GrokSearch-rs (MCP)** under **Web & speech → Web API source**. It calls `web_search` and `web_fetch` over remote Streamable HTTP, preserving the Grok summary, citations and fetched Markdown in chat context and history. The default full endpoint is `https://mcp.episkeyai.com/groksearch_rs/mcp`, as documented by [GrokSearch-rs](https://github.com/Episkey-G/GrokSearch-rs); you can use a self-hosted HTTPS endpoint. Enter a Grok API Key, optionally its matching gateway URL and search model ID, and source keys for page reading. A blank Grok gateway uses the server default (normally xAI), and a blank model uses its default model. General pages need a configured Tavily, Exa, TinyFish or Firecrawl source; GitHub, Wikipedia, arXiv and other specialist readers can work without source keys. These keys are sent to your configured MCP service for upstream calls, independently of the chat credentials. Android needs no Rust server or extra SDK. DeepSeek remains the default for existing installations, and switching providers retains their saved configurations.

v0.1.11 sends images directly in Messages requests, calls DeepSeek Search/Fetch and includes retrieved sources in the model context, and fixes PCM/WAV/MP3 playback and configurable speech input. Unsupported thinking parameters are omitted after explicit model metadata or API rejection. Capabilities are isolated by URL/model; changing the API Key clears old observations and rejects late cache writes from the previous connection. A manual recheck is available under Data.

New messages and regenerated replies use the selected model. Continuation uses the original reply's model. Connection settings and model selection persist across restarts. Released updates keep the same signing certificate, so you can install them over an earlier release to retain local data.

Update checks run in the background using Android's native networking. Versions are compared numerically; equal or older releases, drafts and prereleases are ignored. Offline, timeout, rate-limit and invalid-response failures produce no dialog or toast. Dismissing a newer version keeps checks enabled for the next startup; download and install the APK from the linked Release page to update.

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
- Startup checks for newer GitHub Releases, complete scrollable release notes and a link to the release page.
- Multiple conversations with automatic titles, renaming, and deletion; edit prompts, regenerate replies, and switch between message branches.
- Streaming replies, deep thinking, smart search, link reading, and source citations; stop generation or continue eligible replies.
- Select DeepSeek Search/Fetch or GrokSearch-rs remote MCP, with independent gateway, model and source keys.
- Upload, paste, or drag and drop attachments; use voice input and read replies aloud. A live audio spectrum appears in the first row of the input area while recording on mobile.
- Markdown, syntax highlighting, KaTeX math, and Mermaid diagrams.
- Simplified Chinese and English, light and dark themes, mobile layouts, location settings, and chat history import and export.

## Data and storage

Your API key and settings are stored in the browser's localStorage. Conversations and original attachments are stored in IndexedDB. Local data is isolated by browser profile and site origin. Sending messages, uploading attachments, and using speech features sends the relevant content to the configured API service.

History import and export in Settings use ZIP archives. After confirmation and successful validation, importing replaces all local conversations and attachments. Exports include conversations and locally available original images, but exclude API keys, settings, and original non-image attachments. See the [history import/export documentation (Chinese)](src/services/chat/history/README.md) for the archive format and preservation details.

Settings → Data → Delete all chats clears all local conversations, original attachments, and unsent drafts after confirmation. It stops ongoing replies and returns to a new chat. Your API key and settings are preserved; files already uploaded to the API service are not deleted.

## Development

| Command                     | Description                                  |
| --------------------------- | -------------------------------------------- |
| `pnpm dev`                  | Start the development server                 |
| `pnpm build`                | Build the web app into `dist/`               |
| `pnpm pack:android`         | Build and sign the Android APK               |
| `pnpm type`                 | Run TypeScript type checks                   |
| `pnpm lint`                 | Lint with oxlint                             |
| `pnpm test:models`          | Test model catalogs and custom IDs           |
| `pnpm test:grok-search`     | Test GrokSearch MCP envelopes and outputs    |
| `pnpm test:base-url`        | Test frontend and native URL handling        |
| `pnpm test:android-assets`  | Test Android ZIP paths and web assets        |
| `pnpm test:android-updates` | Test release comparisons and silent failures |
| `pnpm test:android`         | Test mobile UI and the simulated bridge      |
| `pnpm format`               | Format with oxfmt                            |

CI checks types, lint, model and GrokSearch parsing, frontend/native URL handling, Android asset packaging, release update logic and the web build. The 32 mobile UI tests use an existing Microsoft Edge installation and a simulated native bridge, including fake microphone input. They cover image history, Search/Fetch, configurable speech, PCM/WAV playback, and thinking detection across model/key changes, alongside startup and chat regressions. GrokSearch checks include JSON/SSE, MCP initialization and sessions, independent keys, provider switching, history, errors and cancellation; six protocol tests cover envelopes and source output. Five packaging tests cover ZIP paths and missing or stale files; 22 JDK checks cover release comparisons, silent failures and long Unicode notes. APK packaging verifies every bundled web file, signatures, alignment and the manifest. Android device testing and live Grok calls with real credentials have not yet been performed.

[rspack.config.ts](rspack.config.ts) uses `https://api.deepseek.com` by default. Use `createConfig({ apiOrigin, devServer })` to customize the API origin and development server proxy.

Chat uses `deepseek-flash` by default through **Anthropic-compatible Messages**. The selected service must support that protocol and model; changing Base URL or model does not convert chat to OpenAI Chat Completions. Images use inline Base64 and assume multimodal support; documents require Files API. Search/Fetch can use an independent DeepSeek compatible service or GrokSearch-rs remote MCP; speech supports DeepSeek and OpenAI compatible APIs, including independent models and voices. Chat retains title, safety and `latest_reminder` extensions. Actual model and attachment support is determined by the provider.

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
