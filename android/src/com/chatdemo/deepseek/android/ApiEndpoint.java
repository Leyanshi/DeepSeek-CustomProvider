package com.chatdemo.deepseek.android;

import java.net.URI;

/** Build requests under an explicit HTTPS service while restricting API operations. */
public final class ApiEndpoint {
    private ApiEndpoint() { }

    public static String resolve(String baseUrl, String path, String method) throws Exception {
        boolean allowed = ("/models".equals(path) && "GET".equals(method))
            || (("/anthropic/v1/messages".equals(path) || "/anthropic/v1/files".equals(path) || "/v1/tools/asr".equals(path) || "/v1/tools/tts".equals(path) || "/v1/tools/search".equals(path) || "/v1/tools/fetch".equals(path) || "/v1/audio/speech".equals(path) || "/v1/audio/transcriptions".equals(path)) && "POST".equals(method))
            || (path != null && path.matches("/anthropic/v1/files/[a-zA-Z0-9_-]+") && "DELETE".equals(method));
        if (!allowed) { throw new IllegalArgumentException("API 接口不受支持"); }
        URI uri = new URI(baseUrl.trim());
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null
            || uri.getRawQuery() != null || uri.getRawFragment() != null || uri.getPort() == 0 || uri.getPort() > 65535
            || baseUrl.trim().matches(".*[\\s\\\\].*") || uri.getRawPath().matches("(?i).*%(2f|5c|00).*")) {
            throw new IllegalArgumentException("Base URL 必须是有效的 HTTPS 地址");
        }
        String base = uri.normalize().toASCIIString().replaceAll("/+$", "");
        if (base.endsWith("/v1") && path.startsWith("/anthropic/v1/")) {
            return base + path.substring("/anthropic/v1".length());
        }
        if (path.startsWith("/v1/tools/") || path.startsWith("/v1/audio/")) {
            if (base.endsWith("/anthropic/v1")) {
                return base.substring(0, base.length() - "/anthropic/v1".length()) + path;
            }
            if (base.endsWith("/v1")) { return base + path.substring("/v1".length()); }
        }
        return base + path;
    }
}
