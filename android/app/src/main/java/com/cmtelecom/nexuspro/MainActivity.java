/* NexusPro — cascarón nativo (WebView)

   Reemplaza a la TWA. El motivo NO es estético: una TWA renderiza con Chrome y
   por lo tanto solo tiene Web Bluetooth, que es BLE y nada más. El escáner OBD
   necesita además Bluetooth CLÁSICO (SPP/RFCOMM) — que es como hablan el Vgate
   vLinker MS en modo MFi, los Thinkcar y la mayoría de dongles baratos. Desde
   una página web eso no se puede alcanzar, por mucho que el teléfono tenga el
   aparato emparejado: el navegador ni siquiera mira esa radio.

   OJO, la contracara y la razón de que el puente exponga LAS DOS radios: la
   WebView de Android **no** implementa Web Bluetooth. Al dejar la TWA se pierde
   el BLE que hoy sí funciona, así que el puente tiene que reponerlo. Un
   cascarón que solo agregue SPP cambiaría un hueco por otro.

   Todo lo demás del producto sigue siendo la misma web que se despliega con
   `npm run deploy`: acá no vive ninguna regla de negocio. Lo que sí vive es lo
   que Chrome regalaba y la WebView no trae de fábrica — selector de archivos,
   cámara, descargas, geolocalización y el botón Atrás. */
package com.cmtelecom.nexuspro;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {

  /* El sitio es el producto; la app es la ventana. `nativo=1` le avisa a la web
     que acá SÍ hay puente Bluetooth, para que el módulo de diagnóstico ofrezca
     la vía nativa en vez de mandar a Web Bluetooth (que en WebView no existe). */
  private static final String INICIO =
      "https://nexuspro.cmtelecommgt.com/?app=android&nativo=1"
          + "&appvc=" + BuildConfig.APP_VERSION_CODE
          + "&appvn=" + BuildConfig.APP_VERSION_NAME;

  private static final String HOST = "nexuspro.cmtelecommgt.com";

  private WebView web;
  private PuenteBluetooth bluetooth;

  /* El <input type="file"> de la web: sin esto el botón simplemente no hace
     nada, que es como se pierde la foto del vehículo y el voucher de pago. */
  private ValueCallback<Uri[]> archivoPendiente;
  private ActivityResultLauncher<Intent> selectorArchivos;

  /* Permisos que se piden cuando la web los necesita, no al arrancar: pedirlos
     todos de golpe en la primera pantalla es lo que hace que la gente los
     niegue en bloque. */
  private ActivityResultLauncher<String[]> pedirPermisos;
  private Runnable trasPermisos;

  @Override
  protected void onCreate(Bundle estado) {
    super.onCreate(estado);

    selectorArchivos = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(),
        r -> {
          if (archivoPendiente == null) return;
          Uri[] uris = null;
          if (r.getResultCode() == RESULT_OK && r.getData() != null) {
            Uri uno = r.getData().getData();
            if (uno != null) uris = new Uri[] { uno };
          }
          /* Cancelar TIENE que devolver null, no un arreglo vacío: si no, la
             web queda esperando un archivo que nunca llega y el formulario se
             traba sin decir nada. */
          archivoPendiente.onReceiveValue(uris);
          archivoPendiente = null;
        });

    pedirPermisos = registerForActivityResult(
        new ActivityResultContracts.RequestMultiplePermissions(),
        r -> {
          Runnable t = trasPermisos;
          trasPermisos = null;
          if (t != null) t.run();
        });

    web = new WebView(this);
    setContentView(web);
    configurar(web);

    bluetooth = new PuenteBluetooth(this, web);
    web.addJavascriptInterface(bluetooth, "NexusBT");

    /* Atrás navega dentro del sistema; solo sale de la app cuando ya no hay a
       dónde volver. Sin esto, un Atrás por reflejo cierra la app y se pierde
       la orden a medio escribir. */
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override public void handleOnBackPressed() {
        if (web.canGoBack()) web.goBack();
        else finish();
      }
    });

    if (estado == null) web.loadUrl(INICIO);
    else web.restoreState(estado);
  }

  private void configurar(WebView w) {
    WebSettings s = w.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);            // localStorage: sesión, borradores
    s.setDatabaseEnabled(true);
    s.setLoadWithOverviewMode(true);
    s.setUseWideViewPort(true);
    s.setSupportZoom(false);
    s.setMediaPlaybackRequiresUserGesture(false);
    /* El sitio es https entero; permitir contenido mixto sería abrir un agujero
       para nada. */
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    /* La web decide qué es un teléfono por el user agent. La WebView ya manda
       "Android", pero se le agrega la marca de la app para que los reportes
       distingan tráfico de app del de navegador. */
    s.setUserAgentString(s.getUserAgentString() + " NexusProApp/" + BuildConfig.APP_VERSION_NAME);

    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(w, true);

    w.setWebViewClient(new WebViewClient() {
      @Override
      public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
        Uri u = req.getUrl();
        String host = u.getHost();
        /* Lo del sistema se abre adentro; lo de afuera (un WhatsApp, un mapa,
           una factura de un tercero) va al navegador o a su app. Sin esto la
           WebView se traga enlaces que no sabe renderizar y queda en blanco. */
        if (host != null && host.equalsIgnoreCase(HOST)) return false;
        try {
          startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException e) {
          Toast.makeText(MainActivity.this, "No hay una app para abrir ese enlace", Toast.LENGTH_SHORT).show();
        }
        return true;
      }
    });

    w.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
        if (archivoPendiente != null) archivoPendiente.onReceiveValue(null);
        archivoPendiente = cb;
        try {
          selectorArchivos.launch(params.createIntent());
          return true;
        } catch (ActivityNotFoundException e) {
          archivoPendiente = null;
          return false;
        }
      }

      /* Cámara y micrófono para la web (foto del vehículo, lectura de vouchers).
         Se concede solo lo que la página pidió y solo si Android ya nos lo dio
         a nosotros: conceder a ciegas aquí es entregar la cámara sin que el
         usuario lo haya visto nunca. */
      @Override
      public void onPermissionRequest(final PermissionRequest req) {
        runOnUiThread(() -> {
          for (String r : req.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)
                && !concedido(android.Manifest.permission.CAMERA)) { req.deny(); return; }
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)
                && !concedido(android.Manifest.permission.RECORD_AUDIO)) { req.deny(); return; }
          }
          req.grant(req.getResources());
        });
      }

      @Override
      public void onGeolocationPermissionsShowPrompt(String origen, GeolocationPermissions.Callback cb) {
        boolean ok = concedido(android.Manifest.permission.ACCESS_FINE_LOCATION);
        cb.invoke(origen, ok, false);
      }
    });

    /* Descargas: reportes, respaldos, el APK. La WebView no descarga sola. */
    w.setDownloadListener((url, userAgent, contentDisposition, mime, tam) -> {
      try {
        String nombre = URLUtil.guessFileName(url, contentDisposition, mime);
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
        req.setMimeType(mime);
        req.addRequestHeader("User-Agent", userAgent);
        req.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
        req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, nombre);
        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (dm != null) dm.enqueue(req);
        Toast.makeText(this, "Descargando " + nombre, Toast.LENGTH_SHORT).show();
      } catch (Exception e) {
        Toast.makeText(this, "No se pudo descargar: " + e.getMessage(), Toast.LENGTH_LONG).show();
      }
    });
  }

  boolean concedido(String permiso) {
    return ContextCompat.checkSelfPermission(this, permiso) == PackageManager.PERMISSION_GRANTED;
  }

  /* La usa el puente Bluetooth: en Android 12+ conectarse a un dongle exige
     BLUETOOTH_CONNECT/SCAN, y en los anteriores el escaneo BLE exige ubicación.
     Se pide en el momento en que el mecánico toca "Escanear", con el aparato
     enfrente, que es cuando la pregunta tiene sentido. */
  void asegurarPermisos(String[] permisos, Runnable despues) {
    java.util.List<String> faltan = new java.util.ArrayList<>();
    for (String p : permisos) if (!concedido(p)) faltan.add(p);
    if (faltan.isEmpty()) { despues.run(); return; }
    trasPermisos = despues;
    runOnUiThread(() -> pedirPermisos.launch(faltan.toArray(new String[0])));
  }

  static String[] permisosBluetooth() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      return new String[] {
          android.Manifest.permission.BLUETOOTH_CONNECT,
          android.Manifest.permission.BLUETOOTH_SCAN };
    }
    /* Antes de Android 12 el escaneo BLE se consideraba ubicación: sin este
       permiso el escaneo devuelve una lista vacía y NO da error, que es la
       forma más confusa de fallar que tiene el Bluetooth de Android. */
    return new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION };
  }

  @Override protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); web.saveState(b); }

  @Override protected void onDestroy() {
    if (bluetooth != null) bluetooth.cerrar();
    super.onDestroy();
  }
}
