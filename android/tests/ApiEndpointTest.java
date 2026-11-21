import com.chatdemo.deepseek.android.ApiEndpoint;

public final class ApiEndpointTest {
    public static void main(String[] args) throws Exception {
        check("https://api.deepseek.com", "/models", "GET", "https://api.deepseek.com/models");
        check("https://api.deepseek.com", "/anthropic/v1/messages", "POST", "https://api.deepseek.com/anthropic/v1/messages");
        check("https://example.com:8443/proxy/", "/anthropic/v1/files", "POST", "https://example.com:8443/proxy/anthropic/v1/files");
        check("https://example.com/v1///", "/models", "GET", "https://example.com/v1/models");
        check("https://example.com/v1", "/anthropic/v1/messages", "POST", "https://example.com/v1/messages");
        check("https://example.com/proxy/v1", "/anthropic/v1/files/file-123", "DELETE", "https://example.com/proxy/v1/files/file-123");
        check("https://example.com/anthropic/v1", "/anthropic/v1/messages", "POST", "https://example.com/anthropic/v1/messages");
        check("https://example.com/v1", "/v1/tools/asr", "POST", "https://example.com/v1/tools/asr");
        check("https://example.com/anthropic/v1", "/v1/tools/tts", "POST", "https://example.com/v1/tools/tts");
        for (String value : new String[] { "http://example.com", "https://user@example.com", "https://example.com?key=secret", "https://example.com#fragment", "https://example.com/a%2fb", "https://example.com/a%5cb", "https://example.com/%00", "https://example.com:0" }) {
            reject(value, "/models", "GET");
        }
        reject("https://example.com", "/models", "POST");
        reject("https://example.com", "//other.com/models", "GET");
        reject("https://example.com", "/anthropic/v1/files/../models", "DELETE");
        System.out.println("Native Base URL validation and endpoint routing passed");
    }
    private static void check(String base, String endpoint, String method, String expected) throws Exception {
        String actual = ApiEndpoint.resolve(base, endpoint, method);
        if (!expected.equals(actual)) { throw new AssertionError(actual + " != " + expected); }
    }
    private static void reject(String base, String endpoint, String method) throws Exception {
        try { ApiEndpoint.resolve(base, endpoint, method); } catch (Exception expected) { return; }
        throw new AssertionError("Unexpectedly accepted: " + base + endpoint);
    }
}
