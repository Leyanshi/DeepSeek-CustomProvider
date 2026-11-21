package com.chatdemo.deepseek.android;

import java.math.BigInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Release comparison and failure handling without Android or external dependencies. */
public final class ReleaseUpdate {
    public static final String API_URL = "https://api.github.com/repos/Leyanshi/DeepSeek-CustomProvider/releases/latest";
    private static final String RELEASE_ROOT = "https://github.com/Leyanshi/DeepSeek-CustomProvider/releases/tag/";
    private static final Pattern VERSION = Pattern.compile("^[vV]?([0-9]+(?:\\.[0-9]+)*)(?:\\+[0-9A-Za-z.-]+)?$");

    public final String version;
    public final String notes;
    public final String url;

    private ReleaseUpdate(String tag, String notes) {
        version = tag.startsWith("v") || tag.startsWith("V") ? tag.substring(1) : tag;
        this.notes = notes == null ? "" : notes;
        url = RELEASE_ROOT + tag;
    }

    public interface Source { Latest load() throws Exception; }

    public static final class Latest {
        public final String tag;
        public final String notes;
        public final boolean draft;
        public final boolean prerelease;
        public Latest(String tag, String notes, boolean draft, boolean prerelease) {
            this.tag = tag; this.notes = notes; this.draft = draft; this.prerelease = prerelease;
        }
    }

    /** Offline, unavailable and malformed releases all produce no notification. */
    public static ReleaseUpdate check(String installed, Source source) {
        try {
            Latest latest = source.load();
            if (latest == null || latest.draft || latest.prerelease || !newer(latest.tag, installed)) { return null; }
            return new ReleaseUpdate(latest.tag, latest.notes);
        } catch (Exception ignored) { return null; }
    }

    private static boolean newer(String candidate, String installed) {
        if (candidate == null || installed == null) { return false; }
        Matcher remote = VERSION.matcher(candidate);
        Matcher local = VERSION.matcher(installed);
        if (!remote.matches() || !local.matches()) { return false; }
        String[] next = remote.group(1).split("\\.");
        String[] current = local.group(1).split("\\.");
        for (int index = 0; index < Math.max(next.length, current.length); index++) {
            BigInteger a = index < next.length ? new BigInteger(next[index]) : BigInteger.ZERO;
            BigInteger b = index < current.length ? new BigInteger(current[index]) : BigInteger.ZERO;
            int compared = a.compareTo(b);
            if (compared != 0) { return compared > 0; }
        }
        return false;
    }
}
