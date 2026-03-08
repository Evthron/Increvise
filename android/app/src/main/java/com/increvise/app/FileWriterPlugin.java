package com.increvise.app;

import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "FileWriter")
public class FileWriterPlugin extends Plugin {

    @PluginMethod
    public void writeToContentUri(PluginCall call) {
        String uriString = call.getString("uri");
        String base64Data = call.getString("data");

        if (uriString == null || base64Data == null) {
            call.reject("Missing uri or data parameter");
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);

            OutputStream outputStream = getContext().getContentResolver().openOutputStream(uri);
            if (outputStream == null) {
                call.reject("Failed to open output stream for URI: " + uriString);
                return;
            }

            outputStream.write(bytes);
            outputStream.flush();
            outputStream.close();

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);

        } catch (Exception e) {
            call.reject("Write failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void writeToTreeUri(PluginCall call) {
        String treeUriString = call.getString("treeUri");
        String relativePath = call.getString("relativePath");
        String base64Data = call.getString("data");

        if (treeUriString == null || relativePath == null || base64Data == null) {
            call.reject("Missing treeUri, relativePath, or data parameter");
            return;
        }

        try {
            Uri treeUri = Uri.parse(treeUriString);
            Uri documentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri) + "/" + relativePath);
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);

            OutputStream outputStream = getContext().getContentResolver().openOutputStream(documentUri);
            if (outputStream == null) {
                call.reject("Failed to open output stream for URI: " + documentUri);
                return;
            }

            outputStream.write(bytes);
            outputStream.flush();
            outputStream.close();

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);

        } catch (Exception e) {
            call.reject("Write failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readFromContentUri(PluginCall call) {
        String uriString = call.getString("uri");

        if (uriString == null) {
            call.reject("Missing uri parameter");
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);

            InputStream inputStream = getContext().getContentResolver().openInputStream(uri);
            if (inputStream == null) {
                call.reject("Failed to open input stream for URI: " + uriString);
                return;
            }

            JSObject result = readStreamToBase64(inputStream);
            call.resolve(result);

        } catch (Exception e) {
            call.reject("Read failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readFromTreeUri(PluginCall call) {
        String treeUriString = call.getString("treeUri");
        String relativePath = call.getString("relativePath");

        if (treeUriString == null || relativePath == null) {
            call.reject("Missing treeUri or relativePath parameter");
            return;
        }

        try {
            Uri treeUri = Uri.parse(treeUriString);
            Uri documentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri) + "/" + relativePath);

            InputStream inputStream = getContext().getContentResolver().openInputStream(documentUri);
            if (inputStream == null) {
                call.reject("Failed to open input stream for URI: " + documentUri);
                return;
            }

            JSObject result = readStreamToBase64(inputStream);
            call.resolve(result);

        } catch (Exception e) {
            call.reject("Read failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void writeToAppDatabase(PluginCall call) {
        String dbName = call.getString("dbName");
        String base64Data = call.getString("data");

        if (dbName == null || base64Data == null) {
            call.reject("Missing dbName or data parameter");
            return;
        }

        try {
            String fileName = dbName + "SQLite.db";
            File dbFile = getContext().getDatabasePath(fileName);

            File parent = dbFile.getParentFile();
            if (parent != null && !parent.exists()) {
                parent.mkdirs();
            }

            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);

            try (FileOutputStream outputStream = new FileOutputStream(dbFile)) {
                outputStream.write(bytes);
                outputStream.flush();
            }

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("path", dbFile.getAbsolutePath());
            call.resolve(result);

        } catch (Exception e) {
            call.reject("Write failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readFromAppDatabase(PluginCall call) {
        String dbName = call.getString("dbName");

        if (dbName == null) {
            call.reject("Missing dbName parameter");
            return;
        }

        try {
            String fileName = dbName + "SQLite.db";
            File dbFile = getContext().getDatabasePath(fileName);

            if (!dbFile.exists()) {
                call.reject("Database file not found: " + dbFile.getAbsolutePath());
                return;
            }

            try (InputStream inputStream = new FileInputStream(dbFile)) {
                JSObject result = readStreamToBase64(inputStream);
                result.put("path", dbFile.getAbsolutePath());
                call.resolve(result);
            }

        } catch (Exception e) {
            call.reject("Read failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void takePersistablePermission(PluginCall call) {
        String uriString = call.getString("uri");

        if (uriString == null) {
            call.reject("Missing uri parameter");
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);
            
            // Take persistable URI permission for both read and write
            int takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            getContext().getContentResolver().takePersistableUriPermission(uri, takeFlags);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);

        } catch (Exception e) {
            call.reject("Failed to take persistable permission: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void releasePersistablePermission(PluginCall call) {
        String uriString = call.getString("uri");

        if (uriString == null) {
            call.reject("Missing uri parameter");
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);
            
            // Release persistable URI permission
            int releaseFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            getContext().getContentResolver().releasePersistableUriPermission(uri, releaseFlags);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);

        } catch (Exception e) {
            call.reject("Failed to release persistable permission: " + e.getMessage(), e);
        }
    }

    private JSObject readStreamToBase64(InputStream inputStream) throws Exception {
        // Read all bytes into memory
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int bytesRead;

        while ((bytesRead = inputStream.read(chunk)) != -1) {
            buffer.write(chunk, 0, bytesRead);
        }

        inputStream.close();
        byte[] bytes = buffer.toByteArray();

        // Convert to base64
        String base64Data = Base64.encodeToString(bytes, Base64.NO_WRAP);

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("data", base64Data);
        return result;
    }
}
