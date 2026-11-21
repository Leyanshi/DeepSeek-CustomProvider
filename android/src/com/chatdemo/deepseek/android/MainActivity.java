package com.chatdemo.deepseek.android;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.View;
import android.view.Gravity;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Button;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** A platform-only WebView shell. No AndroidX, services, browser engine or analytics. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int PICK_FILES = 10;
    private static final int SAVE_FILE = 11;
    private static final int MICROPHONE = 12;
    private static final int SAVE_DIAGNOSTIC = 13;
    private static final long MAX_FILE = 256L * 1024 * 1024;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService workers = Executors.newFixedThreadPool(3);
    private final ConcurrentHashMap<String, NetworkJob> requests = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, FileJob> files = new ConcurrentHashMap<>();
    private WebView webView;
    private FrameLayout container;
    private ScrollView startupPanel;
    private TextView startupTitle;
    private TextView startupDetail;
    private LinearLayout startupActions;
    private volatile boolean startupReady;
    private volatile String startupError = "";
    private String startupFailureReason = "";
    private String startupPageProbe = "尚未收到页面检测结果。";
    private int startupAttempt;
    private String pendingDiagnostic;
    private final Set<String> startupScripts = Collections.newSetFromMap(new ConcurrentHashMap<String, Boolean>());
    private final Runnable startupTimeout = () -> {
        if (!this.destroyed && !startupReady) { showStartupFailure("启动超过 15 秒，页面没有报告启动完成。"); }
    };
    private ValueCallback<Uri[]> fileChooser;
    private PermissionRequest microphoneRequest;
    private String savingId;
    private volatile boolean destroyed;
    private volatile HttpURLConnection updateConnection;
    private ReleaseUpdate pendingUpdate;
    private AlertDialog updateDialog;
    private boolean resumed;
    private boolean checkingUpdates;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        File previewCache = new File(getCacheDir(), "attachments");
        File[] oldPreviews = previewCache.listFiles();
        if (oldPreviews != null) {
            for (File preview : oldPreviews) {
                if (preview.isFile() && System.currentTimeMillis() - preview.lastModified() > 86400000L) { preview.delete(); }
            }
        }
        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        container = new FrameLayout(this);
        container.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(container);
        if (android.os.Build.VERSION.SDK_INT >= 30) { getWindow().setDecorFitsSystemWindows(false); }
        // Target 35 draws edge to edge. Keep status/navigation bars and the keyboard
        // outside the content, while retaining the site's visualViewport behavior.
        container.setOnApplyWindowInsetsListener((view, insets) -> {
            int left, top, right, bottom;
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                left = bars.left; top = bars.top; right = bars.right; bottom = Math.max(bars.bottom, ime.bottom);
            } else {
                left = insets.getSystemWindowInsetLeft(); top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight(); bottom = insets.getSystemWindowInsetBottom();
            }
            view.setPadding(left, top, right, bottom);
            return insets;
        });
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setAllowFileAccess(false);
        // SAF-selected documents are read through their explicit content URI grants.
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportMultipleWindows(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        webView.addJavascriptInterface(new NativeBridge(), "DeepSeekAndroid");
        webView.setWebViewClient(new LocalClient());
        webView.setWebChromeClient(new ChromeClient());
        webView.setDownloadListener((url, agent, disposition, mime, length) -> {
            if (url.startsWith("https://") || url.startsWith("http://")) { openExternal(url); }
        });
        createStartupPanel();
        beginStartup();
        webView.loadUrl(ORIGIN + "/index.html");
        checkForUpdate();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void checkForUpdate() {
        if (destroyed || checkingUpdates) { return; }
        String installed;
        try { installed = getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (Exception ignored) { return; }
        pendingUpdate = null;
        if (updateDialog != null) {
            AlertDialog previous = updateDialog;
            updateDialog = null;
            previous.dismiss();
        }
        checkingUpdates = true;
        final String current = installed;
        workers.execute(() -> {
            ReleaseUpdate update = ReleaseUpdate.check(current, () -> {
                if (destroyed) { return null; }
                HttpURLConnection connection = (HttpURLConnection) new URL(ReleaseUpdate.API_URL).openConnection();
                updateConnection = connection;
                try {
                    if (destroyed) { return null; }
                    connection.setRequestMethod("GET");
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(8000);
                    connection.setReadTimeout(8000);
                    connection.setUseCaches(false);
                    connection.setRequestProperty("Accept", "application/vnd.github+json");
                    connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
                    connection.setRequestProperty("User-Agent", "DeepSeek-CustomProvider/" + current);
                    if (connection.getResponseCode() != 200) { return null; }
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    try (InputStream stream = connection.getInputStream()) {
                        byte[] buffer = new byte[8192];
                        int length;
                        while ((length = stream.read(buffer)) != -1) {
                            if (destroyed) { return null; }
                            bytes.write(buffer, 0, length);
                        }
                    }
                    JSONObject release = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
                    return new ReleaseUpdate.Latest(release.getString("tag_name"), release.optString("body", ""),
                        release.optBoolean("draft", false), release.optBoolean("prerelease", false));
                } finally {
                    connection.disconnect();
                    updateConnection = null;
                }
            });
            ui.post(() -> {
                checkingUpdates = false;
                if (destroyed) { return; }
                pendingUpdate = update;
                showPendingUpdate();
            });
        });
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (Intent.ACTION_MAIN.equals(intent.getAction()) && intent.hasCategory(Intent.CATEGORY_LAUNCHER)) { checkForUpdate(); }
    }

    private void showPendingUpdate() {
        if (destroyed || isFinishing() || !resumed || (!startupReady && startupFailureReason.isEmpty()) || pendingUpdate == null || updateDialog != null) { return; }
        ReleaseUpdate update = pendingUpdate;
        pendingUpdate = null;
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        ScrollView scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(true);
        TextView notes = new TextView(this);
        notes.setText(update.notes.isEmpty() ? "此版本暂无更新日志。" : update.notes);
        notes.setTextSize(14);
        notes.setTextColor(Color.DKGRAY);
        notes.setBackgroundColor(Color.WHITE);
        notes.setTextIsSelectable(true);
        notes.setPadding(dp(24), dp(16), dp(24), dp(16));
        scroll.addView(notes, new ScrollView.LayoutParams(-1, -2));
        content.addView(scroll, new LinearLayout.LayoutParams(-1, Math.max(dp(80), (int) (getResources().getDisplayMetrics().heightPixels * 0.55f))));
        updateDialog = new AlertDialog.Builder(this).setTitle("更新版本： " + update.version).setView(content)
            .setPositiveButton("打开 Release", (dialog, button) -> openExternal(update.url))
            .setNegativeButton("暂不更新", null).create();
        updateDialog.setOnDismissListener(dialog -> {
            if (updateDialog == dialog) { updateDialog = null; showPendingUpdate(); }
        });
        updateDialog.show();
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        showPendingUpdate();
    }

    @Override protected void onPause() {
        resumed = false;
        super.onPause();
    }

    private void createStartupPanel() {
        startupPanel = new ScrollView(this);
        startupPanel.setBackgroundColor(Color.WHITE);
        startupPanel.setFillViewport(true);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        content.setPadding(dp(24), dp(24), dp(24), dp(24));
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.ic_launcher);
        logo.setContentDescription("DeepSeek");
        content.addView(logo, new LinearLayout.LayoutParams(dp(96), dp(96)));
        startupTitle = new TextView(this);
        startupTitle.setTextSize(14);
        startupTitle.setTextColor(Color.rgb(138, 138, 138));
        startupTitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleLayout = new LinearLayout.LayoutParams(-1, -2);
        titleLayout.topMargin = dp(16);
        content.addView(startupTitle, titleLayout);
        startupDetail = new TextView(this);
        startupDetail.setTextSize(12);
        startupDetail.setTextColor(Color.DKGRAY);
        startupDetail.setTextIsSelectable(true);
        LinearLayout.LayoutParams detailLayout = new LinearLayout.LayoutParams(-1, -2);
        detailLayout.topMargin = dp(16);
        content.addView(startupDetail, detailLayout);
        startupActions = new LinearLayout(this);
        startupActions.setOrientation(LinearLayout.VERTICAL);
        startupActions.setGravity(Gravity.CENTER);
        LinearLayout actionRow = new LinearLayout(this);
        actionRow.setGravity(Gravity.CENTER);
        Button retry = new Button(this);
        retry.setText("重新加载");
        retry.setOnClickListener(view -> { beginStartup(); webView.reload(); });
        actionRow.addView(retry);
        Button copy = new Button(this);
        copy.setText("复制诊断");
        copy.setOnClickListener(view -> copyStartupDiagnostic());
        actionRow.addView(copy);
        startupActions.addView(actionRow);
        Button details = new Button(this);
        details.setText("查看 / 导出诊断");
        details.setOnClickListener(view -> showDiagnosticDialog(startupDiagnostic(), "可长按文字选择，或导出为 TXT 文件。"));
        startupActions.addView(details);
        content.addView(startupActions);
        startupPanel.addView(content, new ScrollView.LayoutParams(-1, -2));
    }

    private void beginStartup() {
        startupReady = false;
        startupError = "";
        startupFailureReason = "";
        startupPageProbe = "尚未收到页面检测结果。";
        startupAttempt++;
        startupScripts.clear();
        startupTitle.setText("加载中");
        startupDetail.setVisibility(View.GONE);
        startupActions.setVisibility(View.GONE);
        if (startupPanel.getParent() == null) { container.addView(startupPanel, new FrameLayout.LayoutParams(-1, -1)); }
        ui.removeCallbacks(startupTimeout);
        ui.postDelayed(startupTimeout, 15000);
    }

    private void showStartupFailure(String reason) {
        if (destroyed || startupReady) { return; }
        ui.removeCallbacks(startupTimeout);
        startupFailureReason = reason;
        startupTitle.setText("启动未完成");
        startupDetail.setText(startupDiagnostic());
        startupDetail.setVisibility(View.VISIBLE);
        startupActions.setVisibility(View.VISIBLE);
        probeStartupPage();
        showPendingUpdate();
    }

    private void probeStartupPage() {
        int attempt = startupAttempt;
        // ES5 probe reads only startup metadata, never conversations or API configuration.
        String script = "(function(){return JSON.stringify({page:document.readyState,"
            + "startup:window.__deepseekStartupPhase||'启动脚本未执行',"
            + "bridge:typeof window.DeepSeekAndroid,"
            + "readyCallback:window.DeepSeekAndroid?typeof window.DeepSeekAndroid.appReady:'缺少桥接',"
            + "loading:!!document.getElementById('startup-state'),"
            + "viewport:window.innerWidth+'x'+window.innerHeight});})()";
        try {
            webView.evaluateJavascript(script, value -> {
                if (destroyed || startupReady || attempt != startupAttempt) { return; }
                try {
                    Object result = new org.json.JSONTokener(value).nextValue();
                    if (result instanceof String) { startupPageProbe = (String) result; }
                } catch (Exception ignored) { }
                startupDetail.setText(startupDiagnostic());
            });
        } catch (Exception ignored) { }
    }

    /** Generate a fresh plain String; copying/exporting never depends on a TextView's contents. */
    private String startupDiagnostic() {
        String version = "未知";
        try { version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception ignored) { }
        String providerName = "未知";
        try {
            android.content.pm.PackageInfo provider = WebView.getCurrentWebViewPackage();
            if (provider != null) { providerName = provider.packageName + " " + provider.versionName; }
        } catch (Exception ignored) { }
        ArrayList<String> scripts = new ArrayList<>(startupScripts);
        Collections.sort(scripts);
        return "DeepSeek 启动诊断\nApp：" + version
            + "\nAndroid：" + android.os.Build.VERSION.RELEASE + " (API " + android.os.Build.VERSION.SDK_INT + ")"
            + "\n设备：" + android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL
            + "\nWebView：" + providerName
            + "\nJavaScript：" + webView.getSettings().getJavaScriptEnabled()
            + "\n已读取脚本：" + scripts.size() + "\n" + scripts
            + "\n状态：" + (startupFailureReason.isEmpty() ? "尚未收到页面启动完成的通知。" : startupFailureReason)
            + "\n错误：" + (startupError.isEmpty() ? "尚未捕获到错误。" : startupError)
            + "\n页面检测：" + startupPageProbe
            + "\n\n可复制或导出诊断反馈；重新加载不会清除聊天记录。";
    }

    private void copyStartupDiagnostic() {
        String report = startupDiagnostic();
        String result = "系统未能完成复制，请直接查看文字或导出 TXT。";
        try {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (clipboard != null) {
                clipboard.setPrimaryClip(ClipData.newPlainText("DeepSeek 启动诊断", report));
                ClipData copied = clipboard.getPrimaryClip();
                CharSequence text = copied != null && copied.getItemCount() > 0 ? copied.getItemAt(0).getText() : null;
                result = text != null && report.equals(text.toString())
                    ? "已核对系统剪贴板中的诊断文本。如果粘贴仍为空，请导出 TXT。"
                    : "系统剪贴板未返回相同文本，请直接查看文字或导出 TXT。";
            }
        } catch (Exception ignored) { }
        // Always show the exact report, including when another app prevents pasting.
        showDiagnosticDialog(report, result);
    }

    private void showDiagnosticDialog(String report, String status) {
        if (destroyed) { return; }
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        TextView text = new TextView(this);
        text.setText(status + "\n\n" + report);
        text.setTextSize(14);
        text.setTextColor(Color.DKGRAY);
        text.setBackgroundColor(Color.WHITE);
        text.setPadding(dp(20), dp(16), dp(20), dp(16));
        text.setTextIsSelectable(true);
        scroll.addView(text);
        new AlertDialog.Builder(this).setTitle("启动诊断").setView(scroll)
            .setPositiveButton("导出 TXT", (dialog, button) -> exportStartupDiagnostic(report))
            .setNegativeButton("关闭", null).show();
    }

    private void exportStartupDiagnostic(String report) {
        pendingDiagnostic = report;
        try {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType("text/plain").putExtra(Intent.EXTRA_TITLE, "DeepSeek-startup-diagnostic.txt");
            startActivityForResult(intent, SAVE_DIAGNOSTIC);
        } catch (ActivityNotFoundException error) {
            pendingDiagnostic = null;
            showDiagnosticDialog(report, "没有找到系统文件保存窗口，请长按诊断文字选择，或截取此窗口。");
        }
    }

    private boolean trusted(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
            && uri.getPort() == -1 && uri.getUserInfo() == null;
    }

    private void openExternal(String value) {
        try {
            Uri uri = Uri.parse(value);
            if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null || uri.getUserInfo() != null) { return; }
            startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException error) { notice("没有找到可以打开网页的浏览器"); }
    }

    private void notice(String message) {
        if (!destroyed) { ui.post(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show()); }
    }

    private JSONObject event(String id, String type) throws Exception {
        return new JSONObject().put("id", id).put("type", type);
    }

    private void emit(JSONObject event, boolean wait) {
        if (destroyed) { return; }
        CountDownLatch delivered = new CountDownLatch(1);
        // JSON is quoted as a JavaScript string, never evaluated as executable code.
        String script = "window.dispatchEvent(new CustomEvent('deepseek-native',{detail:JSON.parse(" + JSONObject.quote(event.toString()) + ")}));";
        ui.post(() -> {
            if (destroyed) { delivered.countDown(); return; }
            webView.evaluateJavascript(script, ignored -> delivered.countDown());
        });
        if (wait) {
            try { delivered.await(15, TimeUnit.SECONDS); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
        }
    }

    private void fileResult(String id, boolean success, String message) {
        try { emit(event(id, "file").put("success", success).put("message", message), false); } catch (Exception ignored) { }
    }

    private final class LocalClient extends WebViewClient {
        @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
            if (trusted(Uri.parse(url))) { beginStartup(); }
        }
        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) { showStartupFailure("页面加载失败：" + error.getErrorCode() + " " + error.getDescription()); }
        }
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (trusted(uri) && ("/".equals(uri.getPath()) || "/index.html".equals(uri.getPath()))) { return false; }
            if (request.isForMainFrame()) { openExternal(uri.toString()); }
            return true;
        }
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!trusted(uri)) {
                if ("content".equals(uri.getScheme()) || "file".equals(uri.getScheme())) { return blocked(403, "Forbidden"); }
                return null;
            }
            String name = uri.getPath();
            if ("/".equals(name)) { name = "/index.html"; }
            if (!"GET".equals(request.getMethod()) || name == null || name.contains("..") || name.contains("\\") || name.indexOf('\0') >= 0
                || !("/index.html".equals(name) || name.startsWith("/static/") || "/deepseek-app-icon.svg".equals(name) || "/LICENSE".equals(name) || "/THIRD-PARTY-NOTICES.txt".equals(name))) {
                return blocked(403, "Forbidden");
            }
            try {
                Map<String, String> headers = new HashMap<>();
                headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'");
                headers.put("X-Content-Type-Options", "nosniff");
                headers.put("Cache-Control", "no-store");
                String type = mime(name);
                InputStream asset = getAssets().open(name.substring(1));
                if (!startupReady && name.endsWith(".js")) { startupScripts.add(name.substring(name.lastIndexOf('/') + 1)); }
                return new WebResourceResponse(type, type.startsWith("text/") ? "UTF-8" : null, 200, "OK", headers, asset);
            } catch (Exception error) {
                if (!startupReady) { startupError = "本地资源读取失败：" + name; }
                return blocked(404, "Not Found");
            }
        }
        private WebResourceResponse blocked(int code, String message) {
            return new WebResourceResponse("text/plain", "UTF-8", code, message, Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
        }
        private String mime(String name) {
            if (name.endsWith(".html")) { return "text/html"; }
            if (name.endsWith(".js")) { return "text/javascript"; }
            if (name.endsWith(".css")) { return "text/css"; }
            if (name.endsWith(".woff2")) { return "font/woff2"; }
            if (name.endsWith(".woff")) { return "font/woff"; }
            if (name.endsWith(".ttf")) { return "font/ttf"; }
            if (name.endsWith(".svg")) { return "image/svg+xml"; }
            return "application/octet-stream";
        }
    }

    private final class ChromeClient extends WebChromeClient {
        @Override public boolean onConsoleMessage(ConsoleMessage message) {
            if (!startupReady && message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                String detail = message.message();
                startupError = detail.substring(0, Math.min(600, detail.length()));
            }
            return true;
        }
        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileChooser != null) { fileChooser.onReceiveValue(null); }
            fileChooser = callback;
            Intent intent = params.createIntent();
            intent.setAction(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            try { startActivityForResult(intent, PICK_FILES); }
            catch (ActivityNotFoundException error) { callback.onReceiveValue(null); fileChooser = null; notice("没有找到文件选择器"); }
            return true;
        }
        @Override public void onPermissionRequest(PermissionRequest request) {
            ui.post(() -> {
                if (microphoneRequest != null) { request.deny(); return; }
                if (!trusted(request.getOrigin()) || request.getResources().length != 1
                    || !PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(request.getResources()[0])) { request.deny(); return; }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                } else {
                    microphoneRequest = request;
                    requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, MICROPHONE);
                }
            });
        }
        @Override public void onPermissionRequestCanceled(PermissionRequest request) {
            ui.post(() -> { if (microphoneRequest == request) { microphoneRequest = null; } });
        }
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == MICROPHONE && microphoneRequest != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                microphoneRequest.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
            } else { microphoneRequest.deny(); notice("未开启麦克风权限，仍可使用文字聊天"); }
            microphoneRequest = null;
        }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == SAVE_DIAGNOSTIC) {
            String report = pendingDiagnostic;
            pendingDiagnostic = null;
            if (report == null) { return; }
            if (result != RESULT_OK || data == null || data.getData() == null) {
                notice("已取消诊断导出"); return;
            }
            Uri destination = data.getData();
            workers.execute(() -> {
                try (OutputStream out = getContentResolver().openOutputStream(destination, "w")) {
                    if (out == null) { throw new Exception("No destination"); }
                    out.write(report.getBytes(StandardCharsets.UTF_8));
                } catch (Exception error) {
                    ui.post(() -> showDiagnosticDialog(report, "诊断保存失败，请重试，或截取此窗口。"));
                    return;
                }
                notice("诊断 TXT 已保存");
            });
        } else if (code == PICK_FILES && fileChooser != null) {
            ArrayList<Uri> selected = new ArrayList<>();
            if (result == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) { for (int i = 0; i < clip.getItemCount(); i++) { selected.add(clip.getItemAt(i).getUri()); } }
                else if (data.getData() != null) { selected.add(data.getData()); }
            }
            fileChooser.onReceiveValue(selected.isEmpty() ? null : selected.toArray(new Uri[0]));
            fileChooser = null;
        } else if (code == SAVE_FILE && savingId != null) {
            String id = savingId;
            savingId = null;
            FileJob job = files.remove(id);
            if (job == null) { return; }
            if (result != RESULT_OK || data == null || data.getData() == null) {
                job.file.delete(); fileResult(id, false, "已取消保存"); return;
            }
            Uri destination = data.getData();
            workers.execute(() -> {
                try (InputStream source = new FileInputStream(job.file); OutputStream out = getContentResolver().openOutputStream(destination, "w")) {
                    if (out == null) { throw new Exception("No destination"); }
                    byte[] buffer = new byte[32768];
                    int length;
                    while ((length = source.read(buffer)) != -1) { out.write(buffer, 0, length); }
                    fileResult(id, true, "文件已保存"); notice("文件已保存");
                } catch (Exception error) { fileResult(id, false, "文件保存失败，请检查剩余空间"); notice("文件保存失败"); }
                finally { job.file.delete(); }
            });
        }
    }

    @Override public void onBackPressed() {
        // Close the top modal/drawer first. Otherwise Android returns to the launcher.
        webView.evaluateJavascript("(function(){if(document.querySelector('[role=dialog]')){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return true;}var b=document.querySelector('[data-android-back]');if(b){b.click();return true;}return false;})()", handled -> {
            if (!"true".equals(handled)) { moveTaskToBack(true); }
        });
    }

    @Override public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        webView.evaluateJavascript("window.dispatchEvent(new Event('deepseek-system-theme'))", null);
    }

    @Override protected void onDestroy() {
        destroyed = true;
        HttpURLConnection update = updateConnection;
        if (update != null) { update.disconnect(); }
        if (updateDialog != null) { updateDialog.dismiss(); }
        ui.removeCallbacks(startupTimeout);
        for (NetworkJob job : requests.values()) { job.cancel(); }
        for (FileJob job : files.values()) { job.close(); job.file.delete(); }
        if (fileChooser != null) { fileChooser.onReceiveValue(null); }
        if (microphoneRequest != null) { microphoneRequest.deny(); }
        workers.shutdownNow();
        webView.removeJavascriptInterface("DeepSeekAndroid");
        webView.destroy();
        super.onDestroy();
    }

    private boolean validId(String id) { return id != null && id.matches("[a-zA-Z0-9-]{1,64}"); }

    private static final class NetworkJob {
        volatile boolean cancelled;
        volatile HttpURLConnection connection;
        void cancel() { cancelled = true; if (connection != null) { connection.disconnect(); } }
    }

    private static final class FileJob {
        final File file;
        final String name;
        final String type;
        FileOutputStream stream;
        long size;
        FileJob(File file, String name, String type) throws Exception {
            this.file = file; this.name = name; this.type = type; stream = new FileOutputStream(file);
        }
        void close() { try { if (stream != null) { stream.close(); stream = null; } } catch (Exception ignored) { } }
    }

    public final class NativeBridge {
        @JavascriptInterface public void appReady() {
            ui.post(() -> {
                if (destroyed) { return; }
                startupReady = true;
                ui.removeCallbacks(startupTimeout);
                container.removeView(startupPanel);
                showPendingUpdate();
            });
        }
        @JavascriptInterface public void startupFailed(String message) {
            ui.post(() -> {
                if (destroyed || startupReady) { return; }
                String detail = message == null ? "页面启动失败" : message;
                startupError = detail.substring(0, Math.min(600, detail.length()));
                showStartupFailure("页面脚本报告启动失败。");
            });
        }
        @JavascriptInterface public void request(String payload) {
            String requestId = "";
            try {
                JSONObject body = new JSONObject(payload);
                requestId = body.getString("id");
                if (!validId(requestId) || requests.size() >= 6) { throw new Exception("请求过多，请稍后重试"); }
                String id = requestId;
                NetworkJob job = new NetworkJob();
                if (requests.putIfAbsent(id, job) != null) { throw new Exception("重复请求"); }
                workers.execute(() -> performRequest(id, body, job));
            } catch (Exception error) {
                try { emit(event(requestId, "error").put("message", "暂时无法发起请求，请重试"), false); } catch (Exception ignored) { }
            }
        }

        @JavascriptInterface public void cancelRequest(String id) {
            NetworkJob job = requests.remove(id);
            if (job != null) { job.cancel(); }
        }

        @JavascriptInterface public void openLink(String url) { ui.post(() -> openExternal(url)); }

        @JavascriptInterface public void setTheme(boolean dark) {
            ui.post(() -> {
                int background = dark ? Color.rgb(18, 18, 18) : Color.WHITE;
                getWindow().setStatusBarColor(background);
                getWindow().setNavigationBarColor(background);
                webView.setBackgroundColor(background);
                getWindow().getDecorView().setSystemUiVisibility(dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            });
        }

        @JavascriptInterface public boolean systemDark() {
            return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        }

        @JavascriptInterface public boolean beginFile(String id, String name, String type) {
            if (!validId(id) || files.size() >= 2) { return false; }
            try {
                String safeName = new File(name.replace('\\', '/')).getName().replaceAll("[\\p{Cntrl}]", "_");
                if (safeName.isEmpty() || safeName.length() > 180) { safeName = "DeepSeek-export.zip"; }
                String safeType = type.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+") ? type : "application/octet-stream";
                File directory = new File(getCacheDir(), "attachments");
                directory.mkdirs();
                File file = new File(directory, id + "_" + safeName);
                FileJob job = new FileJob(file, safeName, safeType);
                if (files.putIfAbsent(id, job) != null) { job.close(); file.delete(); return false; }
                return true;
            } catch (Exception error) { notice("无法创建文件，请检查剩余空间"); return false; }
        }

        @JavascriptInterface public boolean writeFileChunk(String id, String data) {
            FileJob job = files.get(id);
            if (job == null || job.stream == null || data.length() > 65536) { return false; }
            try {
                byte[] bytes = Base64.decode(data, Base64.NO_WRAP);
                if (job.size + bytes.length > MAX_FILE) { throw new Exception("File limit"); }
                job.stream.write(bytes); job.size += bytes.length;
                return true;
            } catch (Exception error) { cancelFile(id); notice("文件写入失败，文件不能超过 256 MB"); return false; }
        }

        @JavascriptInterface public void cancelFile(String id) {
            FileJob job = files.remove(id);
            if (job != null) { job.close(); job.file.delete(); }
        }

        @JavascriptInterface public void finishFile(String id, boolean preview) {
            FileJob job = files.get(id);
            if (job == null) { fileResult(id, false, "文件不存在"); return; }
            job.close();
            ui.post(() -> {
                if (preview && (job.type.startsWith("image/") || "application/pdf".equals(job.type))) {
                    try {
                        Uri uri = Uri.parse("content://com.chatdemo.deepseek.android.attachments/" + Uri.encode(job.file.getName()));
                        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, job.type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(intent);
                        files.remove(id); fileResult(id, true, ""); return;
                    } catch (ActivityNotFoundException ignored) { notice("未找到预览应用，请保存后打开"); }
                }
                if (savingId != null) { cancelFile(id); fileResult(id, false, "请先完成上一个文件的保存"); return; }
                savingId = id;
                try {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(job.type).putExtra(Intent.EXTRA_TITLE, job.name);
                    startActivityForResult(intent, SAVE_FILE);
                } catch (ActivityNotFoundException error) { savingId = null; cancelFile(id); fileResult(id, false, "没有找到系统文件保存器"); }
            });
        }
    }

    private void performRequest(String id, JSONObject body, NetworkJob job) {
        try {
            if (job.cancelled) { return; }
            Uri requested = Uri.parse(body.getString("url"));
            String method = body.getString("method");
            String path = requested.getPath();
            if (!trusted(requested) || requested.getQuery() != null || requested.getFragment() != null || path == null || !path.startsWith("/api/")) { throw new Exception("API 地址不受支持"); }
            path = path.substring(4);
            String target = ApiEndpoint.resolve(body.getString("baseUrl"), path, method);
            String encoded = body.optString("body", "");
            if (encoded.length() > 45 * 1024 * 1024) { throw new Exception("上传文件过大"); }
            byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
            HttpURLConnection connection = (HttpURLConnection) new URL(target).openConnection();
            job.connection = connection;
            if (job.cancelled) { connection.disconnect(); return; }
            connection.setRequestMethod(method);
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(180000);
            connection.setRequestProperty("Accept-Encoding", "identity");
            JSONObject headers = body.optJSONObject("headers");
            if (headers != null) {
                Iterator<String> names = headers.keys();
                while (names.hasNext()) {
                    String name = names.next();
                    if (name.matches("(?i)authorization|x-api-key|anthropic-beta|anthropic-version|content-type|accept")) {
                        connection.setRequestProperty(name, headers.getString(name));
                    }
                }
            }
            if (!"GET".equals(method)) {
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = connection.getOutputStream()) { out.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) { throw new Exception("API 返回了不受支持的重定向"); }
            JSONObject responseHeaders = new JSONObject().put("content-type", connection.getContentType() == null ? "application/json" : connection.getContentType());
            emit(event(id, "headers").put("status", status).put("headers", responseHeaders), true);
            InputStream response = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (response != null) {
                try (InputStream stream = response) {
                    byte[] buffer = new byte[24576];
                    int length;
                    while (!job.cancelled && (length = stream.read(buffer)) != -1) {
                        emit(event(id, "data").put("data", Base64.encodeToString(buffer, 0, length, Base64.NO_WRAP)), true);
                    }
                }
            }
            if (!job.cancelled) { emit(event(id, "end"), false); }
        } catch (Exception error) {
            if (!job.cancelled && !destroyed) {
                try { emit(event(id, "error").put("message", "无法连接 API 服务，请检查 Base URL 和网络后重试。"), false); } catch (Exception ignored) { }
            }
        } finally {
            if (job.connection != null) { job.connection.disconnect(); }
            requests.remove(id, job);
        }
    }
}
