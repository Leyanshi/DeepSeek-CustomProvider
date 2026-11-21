import com.chatdemo.deepseek.android.ReleaseUpdate;
import java.io.IOException;

public final class ReleaseUpdateTest {
    private static int checks;
    public static void main(String[] args) {
        ReleaseUpdate update = check("0.1.9", "v0.1.10", "修复白屏\n\n更新日志", false, false);
        expect(update != null && "0.1.10".equals(update.version), "numeric patch comparison");
        expect("https://github.com/Leyanshi/DeepSeek-CustomProvider/releases/tag/v0.1.10".equals(update.url), "release destination");
        expect(check("1.9.9", "v1.10.0", "", false, false) != null, "numeric minor comparison");
        expect(check("1.9.9", "v2.0.0", "", false, false) != null, "major update");
        expect(check("1.2", "v1.2.0", "", false, false) == null, "equivalent versions");
        expect(check("0.1.10", "v0.1.10", "", false, false) == null, "current release is silent");
        expect(check("0.1.10", "v0.1.9", "", false, false) == null, "older release is silent");
        expect(check("1.0.0+local", "v1.0.0+remote", "", false, false) == null, "metadata does not trigger update");
        expect(check("0.1.10", "v0.1.11", "", true, false) == null, "draft is silent");
        expect(check("0.1.10", "v0.1.11", "", false, true) == null, "prerelease is silent");
        for (String tag : new String[] { "", "latest", "v0.1.11-beta", "v0.1.11/other", "https://other.example", null }) {
            expect(check("0.1.10", tag, "", false, false) == null, "invalid release is silent");
        }
        expect(ReleaseUpdate.check("0.1.10", () -> { throw new IOException("timeout"); }) == null, "network failure is silent");
        expect(ReleaseUpdate.check("0.1.10", () -> { throw new IllegalArgumentException("invalid JSON"); }) == null, "malformed response is silent");
        expect(ReleaseUpdate.check("0.1.10", () -> null) == null, "missing release is silent");
        StringBuilder longNotes = new StringBuilder();
        for (int index = 0; index < 20000; index++) { longNotes.append("第 ").append(index).append(" 项更新：完整保留日志。\n"); }
        update = check("0.1.10", "v0.1.11", longNotes.toString(), false, false);
        expect(update != null && longNotes.toString().equals(update.notes), "long Unicode notes are preserved without truncation");
        update = check("0.1.10", "v0.1.11", null, false, false);
        expect(update != null && update.notes.isEmpty(), "release without notes is valid");
        expect(check("invalid", "v0.1.11", "", false, false) == null, "unknown installed version is silent");
        System.out.println("Native release checks passed (" + checks + " checks, including long notes and silent failures)");
    }
    private static ReleaseUpdate check(String current, String tag, String notes, boolean draft, boolean prerelease) {
        return ReleaseUpdate.check(current, () -> new ReleaseUpdate.Latest(tag, notes, draft, prerelease));
    }
    private static void expect(boolean success, String reason) {
        checks++;
        if (!success) { throw new AssertionError(reason); }
    }
}
