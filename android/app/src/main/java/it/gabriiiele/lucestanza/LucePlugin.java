package it.gabriiiele.lucestanza;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Size;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Funzioni native per Luce Stanza su Android:
 * - sfogliare le foto della Galleria (MediaStore) e copiarle nell'app;
 * - salvare le esportazioni direttamente nella Galleria (Pictures/Luce Stanza) o in Download;
 * - ricevere le foto da "Condividi → Luce Stanza".
 */
@CapacitorPlugin(
    name = "Luce",
    permissions = {
        @Permission(alias = "photos", strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        @Permission(alias = "photosOld", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "write", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class LucePlugin extends Plugin {

    private static final String FOLDER = "Luce Stanza";
    private final List<Uri> shared = new ArrayList<>();

    @Override
    public void load() {
        collectShared(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (collectShared(intent)) notifyListeners("shared", new JSObject(), true);
    }

    /* ---------- Condividi → Luce Stanza ---------- */

    private boolean collectShared(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        boolean found = false;
        if (Intent.ACTION_SEND.equals(action)) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) { shared.add(u); found = true; }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) { shared.addAll(list); found = !list.isEmpty(); }
        } else if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            shared.add(intent.getData()); found = true;
        }
        if (found) intent.setAction(Intent.ACTION_MAIN); // non reimportare alla rotazione o al riavvio
        return found;
    }

    @PluginMethod
    public void takeShared(PluginCall call) {
        JSArray out = new JSArray();
        for (Uri u : shared) out.put(u.toString());
        shared.clear();
        JSObject r = new JSObject();
        r.put("uris", out);
        call.resolve(r);
    }

    /* ---------- Permesso di lettura della Galleria ---------- */

    private String readAlias() {
        return Build.VERSION.SDK_INT >= 33 ? "photos" : "photosOld";
    }

    @PluginMethod
    public void galleryPermission(PluginCall call) {
        if (getPermissionState(readAlias()) == PermissionState.GRANTED || partialAccess()) {
            permissionResult(call);
        } else {
            requestPermissionForAlias(readAlias(), call, "permissionResult");
        }
    }

    /* Android 14: l'utente può concedere solo alcune foto */
    private boolean partialAccess() {
        return Build.VERSION.SDK_INT >= 34 &&
            getContext().checkSelfPermission("android.permission.READ_MEDIA_VISUAL_USER_SELECTED") == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        JSObject r = new JSObject();
        boolean full = getPermissionState(readAlias()) == PermissionState.GRANTED;
        r.put("granted", full || partialAccess());
        r.put("partial", !full && partialAccess());
        call.resolve(r);
    }

    /* ---------- Elenco delle foto della Galleria ---------- */

    private static final Uri IMAGES = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;

    @PluginMethod
    public void albums(PluginCall call) {
        Map<String, JSObject> map = new LinkedHashMap<>();
        String[] proj = { MediaStore.Images.Media.BUCKET_ID, MediaStore.Images.Media.BUCKET_DISPLAY_NAME };
        try (Cursor c = getContext().getContentResolver().query(IMAGES, proj, null, null, MediaStore.Images.Media.DATE_ADDED + " DESC")) {
            while (c != null && c.moveToNext()) {
                String id = c.getString(0);
                if (id == null) continue;
                JSObject a = map.get(id);
                if (a == null) {
                    a = new JSObject();
                    a.put("id", id);
                    a.put("name", c.getString(1) == null ? "Senza nome" : c.getString(1));
                    a.put("count", 0);
                    map.put(id, a);
                }
                a.put("count", a.getInteger("count") + 1);
            }
        } catch (Exception e) {
            call.reject(e.getMessage());
            return;
        }
        JSArray out = new JSArray();
        for (JSObject a : map.values()) out.put(a);
        JSObject r = new JSObject();
        r.put("albums", out);
        call.resolve(r);
    }

    @PluginMethod
    public void list(PluginCall call) {
        int offset = call.getInt("offset", 0), limit = call.getInt("limit", 120);
        String bucket = call.getString("album");
        String[] proj = {
            MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.MIME_TYPE,
            MediaStore.Images.Media.DATE_TAKEN, MediaStore.Images.Media.DATE_ADDED, MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.WIDTH, MediaStore.Images.Media.HEIGHT
        };
        String sel = bucket == null ? null : MediaStore.Images.Media.BUCKET_ID + " = ?";
        String[] args = bucket == null ? null : new String[] { bucket };
        JSArray out = new JSArray();
        int total = 0;
        try (Cursor c = getContext().getContentResolver().query(IMAGES, proj, sel, args, MediaStore.Images.Media.DATE_ADDED + " DESC")) {
            if (c != null) {
                total = c.getCount();
                if (c.moveToPosition(offset)) {
                    do {
                        long id = c.getLong(0);
                        long taken = c.getLong(3);
                        JSObject o = new JSObject();
                        o.put("uri", ContentUris.withAppendedId(IMAGES, id).toString());
                        o.put("name", c.getString(1));
                        o.put("mime", c.getString(2));
                        o.put("taken", taken > 0 ? taken : c.getLong(4) * 1000);
                        o.put("size", c.getLong(5));
                        o.put("w", c.getInt(6));
                        o.put("h", c.getInt(7));
                        out.put(o);
                    } while (out.length() < limit && c.moveToNext());
                }
            }
        } catch (Exception e) {
            call.reject(e.getMessage());
            return;
        }
        JSObject r = new JSObject();
        r.put("items", out);
        r.put("total", total);
        call.resolve(r);
    }

    /* Miniatura JPEG (data URL) per la griglia */
    @PluginMethod
    public void thumbnail(PluginCall call) {
        int size = call.getInt("size", 256);
        try {
            Uri uri = Uri.parse(call.getString("uri"));
            Bitmap b;
            if (Build.VERSION.SDK_INT >= 29) {
                b = getContext().getContentResolver().loadThumbnail(uri, new Size(size, size), null);
            } else {
                b = MediaStore.Images.Thumbnails.getThumbnail(getContext().getContentResolver(), ContentUris.parseId(uri),
                    MediaStore.Images.Thumbnails.MINI_KIND, null);
            }
            if (b == null) throw new Exception("miniatura non disponibile");
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.JPEG, 80, bos);
            JSObject r = new JSObject();
            r.put("data", "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP));
            call.resolve(r);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    /* Copia un file della Galleria (o condiviso) nella cache dell'app: il WebView poi lo legge con fetch */
    @PluginMethod
    public void copyToCache(PluginCall call) {
        try {
            Uri uri = Uri.parse(call.getString("uri"));
            ContentResolver cr = getContext().getContentResolver();
            String name = null;
            long modified = 0;
            try (Cursor c = cr.query(uri, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (i >= 0) name = c.getString(i);
                    int t = c.getColumnIndex(MediaStore.Images.Media.DATE_TAKEN);
                    if (t >= 0) modified = c.getLong(t);
                }
            } catch (Exception ignored) {}
            if (name == null) name = uri.getLastPathSegment() == null ? "foto" : uri.getLastPathSegment();
            File dir = new File(getContext().getCacheDir(), "import");
            dir.mkdirs();
            File out = new File(dir, System.nanoTime() + "_" + name.replaceAll("[^\\w.\\- ]", "_"));
            try (InputStream in = cr.openInputStream(uri); OutputStream os = new FileOutputStream(out)) {
                if (in == null) throw new Exception("file non leggibile");
                copy(in, os);
            }
            JSObject r = new JSObject();
            r.put("path", Uri.fromFile(out).toString());
            r.put("name", name);
            r.put("mime", cr.getType(uri));
            r.put("taken", modified);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void deleteCached(PluginCall call) {
        try {
            File f = new File(Uri.parse(call.getString("path")).getPath());
            if (f.getCanonicalPath().startsWith(getContext().getCacheDir().getCanonicalPath())) f.delete();
        } catch (Exception ignored) {}
        call.resolve();
    }

    /* ---------- Salvataggio nella Galleria / in Download ---------- */

    @PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29 && getPermissionState("write") != PermissionState.GRANTED) {
            requestPermissionForAlias("write", call, "saveAfterPermission");
            return;
        }
        doSave(call);
    }

    @PermissionCallback
    private void saveAfterPermission(PluginCall call) {
        if (getPermissionState("write") != PermissionState.GRANTED) call.reject("Permesso di salvataggio negato");
        else doSave(call);
    }

    private void doSave(PluginCall call) {
        String name = call.getString("name", "foto.jpg"), mime = call.getString("mime", "application/octet-stream");
        File src = new File(Uri.parse(call.getString("path")).getPath());
        boolean image = mime.startsWith("image/") && !mime.equals("image/tiff");
        String place = image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS;
        try {
            Uri saved;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver cr = getContext().getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, place + "/" + FOLDER);
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri coll = image ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                saved = cr.insert(coll, v);
                if (saved == null) throw new Exception("impossibile creare il file");
                try (InputStream in = new FileInputStream(src); OutputStream os = cr.openOutputStream(saved)) {
                    copy(in, os);
                }
                v.clear();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(saved, v, null, null);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(place), FOLDER);
                dir.mkdirs();
                File out = new File(dir, name);
                for (int i = 1; out.exists(); i++) out = new File(dir, name.replaceFirst("(\\.[^.]+)?$", " (" + i + ")$1"));
                try (InputStream in = new FileInputStream(src); OutputStream os = new FileOutputStream(out)) {
                    copy(in, os);
                }
                MediaScannerConnection.scanFile(getContext(), new String[] { out.getAbsolutePath() }, new String[] { mime }, null);
                saved = Uri.fromFile(out);
            }
            src.delete();
            JSObject r = new JSObject();
            r.put("uri", saved.toString());
            r.put("folder", (image ? "Immagini" : "Download") + " › " + FOLDER);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    private static void copy(InputStream in, OutputStream os) throws java.io.IOException {
        byte[] buf = new byte[1 << 16];
        for (int n; (n = in.read(buf)) > 0; ) os.write(buf, 0, n);
    }
}
