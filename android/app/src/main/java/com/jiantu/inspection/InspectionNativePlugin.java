package com.jiantu.inspection;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.ClipData;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.provider.MediaStore;
import android.util.AtomicFile;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.core.content.ContextCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.*;
import java.util.*;

@CapacitorPlugin(name = "InspectionNative")
public class InspectionNativePlugin extends Plugin {
    private BroadcastReceiver shareReceiver;
    private PendingIntent shareCallback;

    private File recordDir() throws IOException {
        File directory = new File(getContext().getFilesDir(), "inspections");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法创建本地记录目录");
        return directory;
    }
    private String id(PluginCall call) throws IOException {
        String id = call.getString("id", "");
        if (!id.matches("[a-zA-Z0-9-]{1,80}")) throw new IOException("记录 ID 无效");
        return id;
    }
    private void atomicWrite(File target, byte[] bytes) throws IOException {
        AtomicFile atomic = new AtomicFile(target);
        FileOutputStream stream = null;
        try {
            stream = atomic.startWrite();
            stream.write(bytes);
            atomic.finishWrite(stream);
        } catch (IOException error) { atomic.failWrite(stream); throw error; }
    }
    @PluginMethod public void putRecord(PluginCall call) {
        try {
            String id = id(call);
            File directory = recordDir();
            String original = call.getString("imageBase64");
            if (original != null) atomicWrite(new File(directory, id + ".image"), Base64.decode(original, Base64.DEFAULT));
            if (!new File(directory, id + ".image").isFile()) throw new IOException("原始照片未保存");
            String json = call.getString("json", "");
            new JSObject(json); // Reject invalid metadata before replacing a valid record.
            atomicWrite(new File(directory, id + ".json"), json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            call.resolve();
        } catch (Exception error) { call.reject("本地保存失败，请检查剩余空间：" + error.getMessage(), error); }
    }
    @PluginMethod public void listRecords(PluginCall call) {
        try {
            File directory = recordDir();
            File[] files = directory.listFiles((dir, name) -> name.endsWith(".json"));
            JSArray records = new JSArray();
            JSArray errors = new JSArray();
            if (files != null) {
                Arrays.sort(files, Comparator.comparingLong(File::lastModified));
                for (File file : files) {
                    try {
                        String id = file.getName().replaceFirst("\\.json$", "");
                        File image = new File(directory, id + ".image");
                        if (!image.isFile()) throw new IOException("照片缺失");
                        String json = new String(new AtomicFile(file).readFully(), java.nio.charset.StandardCharsets.UTF_8);
                        new JSObject(json);
                        records.put(new JSObject().put("id", id).put("json", json).put("imageUri", Uri.fromFile(image).toString()));
                    } catch (Exception error) { errors.put("一条本地记录读取失败，原文件已保留：" + file.getName()); }
                }
            }
            call.resolve(new JSObject().put("records", records).put("errors", errors));
        } catch (Exception error) { call.reject("读取本地记录失败", error); }
    }
    @PluginMethod public void deleteRecord(PluginCall call) {
        try {
            String id = id(call);
            File directory = recordDir();
            File json = new File(directory, id + ".json");
            if (json.exists() && !json.delete()) throw new IOException("无法删除记录");
            new AtomicFile(json).delete();
            new AtomicFile(new File(directory, id + ".image")).delete();
            call.resolve();
        } catch (Exception error) { call.reject("删除失败", error); }
    }
    @PluginMethod public void pickPhotos(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/jpeg", "image/png", "image/webp"});
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try { startActivityForResult(call, intent, "photosSelected"); }
        catch (Exception error) { call.reject("无法打开系统照片选择器", error); }
    }
    @PluginMethod public void takePhoto(PluginCall call) {
        File photo = null;
        try {
            File directory = new File(getContext().getCacheDir(), "imports");
            if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法暂存照片");
            photo = File.createTempFile("camera-", ".jpg", directory);
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", photo);
            // Pass the full-resolution destination; the result Intent may only contain a thumbnail.
            call.getData().put("cameraFile", photo.getName());
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
            intent.setClipData(ClipData.newRawUri("设备照片", uri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(call, intent, "photoCaptured");
        } catch (Exception error) {
            if (photo != null) photo.delete();
            call.reject("无法打开系统相机，请确认设备已安装相机应用", error);
        }
    }
    @ActivityCallback private void photoCaptured(PluginCall call, ActivityResult result) {
        if (call == null) return;
        File photo = null;
        try {
            String name = call.getString("cameraFile", "");
            if (!name.matches("camera-[a-zA-Z0-9-]+\\.jpg")) throw new IOException("拍照文件无效");
            photo = new File(new File(getContext().getCacheDir(), "imports"), name);
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", photo);
            getContext().revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (result.getResultCode() != Activity.RESULT_OK) {
                photo.delete();
                call.resolve(new JSObject().put("photos", new JSArray()));
                return;
            }
            if (!photo.isFile() || photo.length() == 0) throw new IOException("相机未返回照片，请重试");
            if (photo.length() > 20 * 1024 * 1024) throw new IOException("照片超过 20 MB，请降低相机分辨率后重试");
            JSArray photos = new JSArray();
            photos.put(new JSObject().put("path", Uri.fromFile(photo).toString())
                .put("name", "拍照-" + System.currentTimeMillis() + ".jpg").put("type", "image/jpeg"));
            call.resolve(new JSObject().put("photos", photos));
        } catch (Exception error) {
            if (photo != null) photo.delete();
            call.reject(error.getMessage(), error);
        }
    }
    @ActivityCallback private void photosSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("photos", new JSArray())); return;
        }
        getBridge().execute(() -> {
        try {
            Intent data = result.getData();
            List<Uri> uris = new ArrayList<>();
            if (data.getClipData() != null) {
                for (int i = 0; i < data.getClipData().getItemCount(); i++) uris.add(data.getClipData().getItemAt(i).getUri());
            } else if (data.getData() != null) uris.add(data.getData());
            if (uris.size() > 30) throw new IOException("一次最多选择 30 张照片");
            File directory = new File(getContext().getCacheDir(), "imports");
            if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法暂存照片");
            JSArray photos = new JSArray();
            for (Uri uri : uris) {
                String name = "设备照片.jpg";
                try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (column >= 0) name = cursor.getString(column);
                    }
                }
                String type = getContext().getContentResolver().getType(uri);
                File copy = new File(directory, UUID.randomUUID().toString());
                try (InputStream in = getContext().getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(copy)) {
                    if (in == null) throw new IOException("无法读取照片");
                    byte[] buffer = new byte[8192]; int count, total = 0;
                    while ((count = in.read(buffer)) != -1) {
                        total += count;
                        if (total > 20 * 1024 * 1024) throw new IOException(name + " 超过 20 MB");
                        out.write(buffer, 0, count);
                    }
                }
                photos.put(new JSObject().put("path", Uri.fromFile(copy).toString()).put("name", name).put("type", type == null ? "image/jpeg" : type));
            }
            call.resolve(new JSObject().put("photos", photos));
        } catch (Exception error) { clearImportFiles(); call.reject(error.getMessage(), error); }
        });
    }
    private void clearImportFiles() {
        File[] files = new File(getContext().getCacheDir(), "imports").listFiles();
        if (files != null) for (File file : files) file.delete();
    }
    @PluginMethod public void clearImports(PluginCall call) { clearImportFiles(); call.resolve(); }
    @PluginMethod public void saveExcel(PluginCall call) {
        call.getData().put("mimeType", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        saveExport(call);
    }
    private File exportFile(PluginCall call) throws IOException {
        Uri uri = Uri.parse(call.getString("path", ""));
        if (!"file".equals(uri.getScheme()) || uri.getPath() == null) throw new IOException("导出文件无效");
        File source = new File(uri.getPath()).getCanonicalFile();
        File exports = new File(getContext().getCacheDir(), "exports").getCanonicalFile();
        if (!exports.equals(source.getParentFile()) || !source.isFile()) throw new IOException("导出文件无效");
        return source;
    }
    private String exportMimeType(PluginCall call) throws IOException {
        String mimeType = call.getString("mimeType", "");
        if (!ExportFiles.supportsMimeType(mimeType)) throw new IOException("不支持的导出格式");
        return mimeType;
    }
    @PluginMethod public void saveExport(PluginCall call) {
        try {
            exportFile(call);
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(exportMimeType(call));
            intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "检图导出"));
            startActivityForResult(call, intent, "excelLocationSelected");
        } catch (Exception error) { call.reject("无法打开系统保存对话框", error); }
    }
    @ActivityCallback private void excelLocationSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("cancelled", true)); return;
        }
        getBridge().execute(() -> {
        try {
            ExportFiles.copyAndClose(new FileInputStream(exportFile(call)),
                () -> getContext().getContentResolver().openOutputStream(result.getData().getData(), "wt"));
            call.resolve(new JSObject().put("cancelled", false));
        } catch (Exception error) { call.reject("数据保存失败，请检查所选存储位置是否可用", error); }
        });
    }
    @PluginMethod public void shareExport(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (shareReceiver != null) {
                call.reject("系统分享面板已打开，请先关闭后重试");
                return;
            }
            try {
                File source = exportFile(call);
                String mimeType = exportMimeType(call);
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", source);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mimeType);
                send.putExtra(Intent.EXTRA_SUBJECT, "检图检测记录");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(new ClipData(call.getString("name", "检图导出"), new String[]{mimeType}, new ClipData.Item(uri)));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                // A private per-share callback distinguishes choosing a target from dismissing
                // the sheet. Choosing an app does not prove that app saved or sent the file.
                String action = getContext().getPackageName() + ".SHARE_EXPORT_" + UUID.randomUUID();
                call.getData().put("shareTargetChosen", false);
                shareReceiver = new BroadcastReceiver() {
                    @Override public void onReceive(Context context, Intent intent) {
                        if (action.equals(intent.getAction()) &&
                            (intent.hasExtra(Intent.EXTRA_CHOSEN_COMPONENT) || intent.hasExtra(Intent.EXTRA_CHOOSER_RESULT))) {
                            call.getData().put("shareTargetChosen", true);
                        }
                    }
                };
                ContextCompat.registerReceiver(getContext(), shareReceiver, new IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED);
                int flags = PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_ONE_SHOT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
                // Restrict mutable callback delivery to this package, including Android 14+.
                shareCallback = PendingIntent.getBroadcast(getContext(), 0,
                    new Intent(action).setPackage(getContext().getPackageName()), flags);
                Intent chooser = Intent.createChooser(send, "分享检测数据", shareCallback.getIntentSender());
                startActivityForResult(call, chooser, "exportShareClosed");
            } catch (Exception error) {
                clearShareCallback();
                call.reject("无法打开系统分享面板", error);
            }
        });
    }
    @ActivityCallback private void exportShareClosed(PluginCall call, ActivityResult result) {
        clearShareCallback();
        if (call == null) return;
        boolean selected = call.getBoolean("shareTargetChosen", false) || result.getResultCode() == Activity.RESULT_OK;
        call.resolve(new JSObject().put("cancelled", !selected));
    }
    private void clearShareCallback() {
        if (shareCallback != null) {
            shareCallback.cancel();
            shareCallback = null;
        }
        if (shareReceiver != null) {
            try { getContext().unregisterReceiver(shareReceiver); }
            catch (IllegalArgumentException ignored) { /* Registration may have failed. */ }
            shareReceiver = null;
        }
    }
    @Override protected void handleOnDestroy() {
        clearShareCallback();
    }
}
