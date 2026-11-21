package com.chatdemo.deepseek.android;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import java.io.File;
import java.io.FileNotFoundException;

/** Read-only grants for previews, limited to individual files in our cache. */
public final class AttachmentProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }
    private File resolve(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.contains("/") || name.contains("\\") || name.contains("..")) { throw new FileNotFoundException(); }
        File root = new File(getContext().getCacheDir(), "attachments");
        File file = new File(root, name);
        try {
            if (!file.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator) || !file.isFile()) { throw new FileNotFoundException(); }
        } catch (java.io.IOException error) { throw new FileNotFoundException(); }
        return file;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) { throw new FileNotFoundException("Read only"); }
        return ParcelFileDescriptor.open(resolve(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public String getType(Uri uri) {
        String name = uri.getLastPathSegment();
        String extension = name != null && name.lastIndexOf('.') >= 0 ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(java.util.Locale.ROOT) : "";
        String type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        return type == null ? "application/octet-stream" : type;
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        try {
            File file = resolve(uri);
            String[] columns = projection != null ? projection : new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
            MatrixCursor cursor = new MatrixCursor(columns, 1);
            MatrixCursor.RowBuilder row = cursor.newRow();
            for (String column : columns) {
                if (OpenableColumns.DISPLAY_NAME.equals(column)) { row.add(file.getName().substring(file.getName().indexOf('_') + 1)); }
                else if (OpenableColumns.SIZE.equals(column)) { row.add(file.length()); }
                else { row.add(null); }
            }
            return cursor;
        } catch (FileNotFoundException error) { return null; }
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("Read only"); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException("Read only"); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException("Read only"); }
}
