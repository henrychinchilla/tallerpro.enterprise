/* NexusPro — puente Bluetooth para la web (SPP clásico + BLE)

   Es el equivalente Android de `puente-obd/` en Windows, pero adentro de la
   app: una tubería tonta. No sabe qué es un DTC ni un PID — solo mueve bytes
   entre el dongle y la página. Toda la lógica de protocolo (ELM327, ISO-TP,
   J1939, mapa de módulos) sigue viviendo en js/modulos/operacion/diagnostico_obd.js
   y se sigue actualizando con `npm run deploy`, sin recompilar la app.

   Expone DOS radios porque son mundos separados y un dongle está en uno o en
   el otro:

   · SPP / RFCOMM (Bluetooth clásico) — lo que la web NUNCA pudo alcanzar. Es
     como hablan el Vgate vLinker MS en modo MFi, los Thinkcar y casi todo lo
     barato. Verificado el 2026-09-02 contra un vLinker MS 09327: en ese modo
     el aparato publica iAP (Apple) + SPP y CERO BLE, así que ningún navegador
     lo puede ver, por bien emparejado que esté el teléfono.

   · BLE / GATT — que la TWA sí tenía vía Web Bluetooth y la WebView NO trae.
     Va acá para no cambiar un hueco por otro.

   Contrato con la página (todo por texto, que es lo único que cruza bien el
   puente de JavascriptInterface):
     NexusBT.listar()            -> JSON [{nombre, mac, tipo, vinculado}]
     NexusBT.conectar(mac, tipo) -> arranca; el resultado llega por evento
     NexusBT.escribir(texto)     -> manda al dongle
     NexusBT.desconectar()
   y de vuelta, siempre en el hilo de la UI:
     window.NexusBT_rx(texto)    <- bytes recibidos, tal cual llegan
     window.NexusBT_evt(json)    <- {evento:'conectado'|'error'|'cerrado', ...} */
package com.cmtelecom.nexuspro;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;

@SuppressLint("MissingPermission")   // se piden en MainActivity.asegurarPermisos antes de cada uso
public class PuenteBluetooth {

  /** Perfil serie estándar. El mismo que Windows publica como "COMx". */
  private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
  /** Descriptor obligatorio para que un GATT empiece a notificar. */
  private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805F9B34FB");

  private final MainActivity act;
  private final WebView web;
  private final Handler ui = new Handler(Looper.getMainLooper());
  private final BluetoothAdapter adaptador;

  /* ── SPP ── */
  private BluetoothSocket socket;
  private OutputStream salida;
  private Thread lector;

  /* ── BLE ── */
  private BluetoothGatt gatt;
  private BluetoothGattCharacteristic escritura, notificacion;
  private final ConcurrentLinkedQueue<byte[]> colaBle = new ConcurrentLinkedQueue<>();
  private volatile boolean bleOcupado = false;

  /* Lo que vio el último escaneo, para poder resolver una MAC a su aparato. */
  private final Map<String, BluetoothDevice> vistos = new LinkedHashMap<>();
  private volatile boolean escaneando = false;

  public PuenteBluetooth(MainActivity act, WebView web) {
    this.act = act;
    this.web = web;
    BluetoothManager bm = (BluetoothManager) act.getSystemService(Context.BLUETOOTH_SERVICE);
    this.adaptador = bm != null ? bm.getAdapter() : null;
  }

  /* ═══════════ hacia la página ═══════════ */

  private void aJS(String funcion, String arg) {
    final String js = "window." + funcion + " && window." + funcion + "(" + JSONObject.quote(arg) + ")";
    ui.post(() -> web.evaluateJavascript(js, null));
  }

  private void evento(String nombre, String detalle) {
    try {
      JSONObject o = new JSONObject();
      o.put("evento", nombre);
      if (detalle != null) o.put("detalle", detalle);
      aJS("NexusBT_evt", o.toString());
    } catch (Exception ignorada) { }
  }

  /* ═══════════ API que ve el JavaScript ═══════════ */

  /** ¿Hay radio y está encendida? La web lo pregunta antes de ofrecer la vía. */
  @JavascriptInterface
  public String estado() {
    try {
      JSONObject o = new JSONObject();
      o.put("disponible", adaptador != null);
      o.put("encendido", adaptador != null && adaptador.isEnabled());
      o.put("version", BuildConfig.APP_VERSION_NAME);
      return o.toString();
    } catch (Exception e) {
      return "{\"disponible\":false,\"encendido\":false}";
    }
  }

  /** Emparejados (SPP) + lo que aparezca en un barrido BLE corto. */
  @JavascriptInterface
  public void listar() {
    if (adaptador == null || !adaptador.isEnabled()) {
      evento("error", "El Bluetooth del teléfono está apagado.");
      return;
    }
    act.asegurarPermisos(MainActivity.permisosBluetooth(), this::listarYa);
  }

  private void listarYa() {
    vistos.clear();
    final List<JSONObject> filas = new ArrayList<>();
    try {
      for (BluetoothDevice d : adaptador.getBondedDevices()) {
        vistos.put(d.getAddress(), d);
        JSONObject o = new JSONObject();
        o.put("nombre", nombre(d));
        o.put("mac", d.getAddress());
        /* Un emparejado con tipo LE no habla SPP y al revés: decirlo acá evita
           que la web intente el transporte equivocado y culpe al aparato. */
        o.put("tipo", d.getType() == BluetoothDevice.DEVICE_TYPE_LE ? "ble" : "spp");
        o.put("vinculado", true);
        filas.add(o);
      }
    } catch (Exception ignorada) { }

    /* Un BLE sin emparejar no sale en getBondedDevices: hay que barrer. Cinco
       segundos alcanzan para un dongle que está anunciándose a un metro, y no
       dejan al mecánico esperando frente a una pantalla quieta. */
    BluetoothLeScanner ls = adaptador.getBluetoothLeScanner();
    if (ls == null) { entregar(filas); return; }

    final ScanCallback cb = new ScanCallback() {
      @Override public void onScanResult(int tipo, ScanResult r) {
        BluetoothDevice d = r.getDevice();
        if (d == null || vistos.containsKey(d.getAddress())) return;
        vistos.put(d.getAddress(), d);
        try {
          JSONObject o = new JSONObject();
          String n = nombre(d);
          if (n == null || n.trim().isEmpty()) {
            String anunciado = r.getScanRecord() != null ? r.getScanRecord().getDeviceName() : null;
            n = (anunciado != null && !anunciado.trim().isEmpty()) ? anunciado : d.getAddress();
          }
          o.put("nombre", n);
          o.put("mac", d.getAddress());
          o.put("tipo", "ble");
          o.put("vinculado", false);
          filas.add(o);
        } catch (Exception ignorada) { }
      }
    };

    try {
      escaneando = true;
      ls.startScan(null, new ScanSettings.Builder()
          .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), cb);
      ui.postDelayed(() -> {
        try { if (escaneando) ls.stopScan(cb); } catch (Exception ignorada) { }
        escaneando = false;
        entregar(filas);
      }, 5000);
    } catch (Exception e) {
      escaneando = false;
      entregar(filas);
    }
  }

  private void entregar(List<JSONObject> filas) {
    JSONArray a = new JSONArray();
    for (JSONObject o : filas) a.put(o);
    aJS("NexusBT_lista", a.toString());
  }

  private String nombre(BluetoothDevice d) {
    try { String n = d.getName(); return n != null ? n : d.getAddress(); }
    catch (Exception e) { return d.getAddress(); }
  }

  /** tipo: "spp" | "ble". El resultado llega por NexusBT_evt. */
  @JavascriptInterface
  public void conectar(final String mac, final String tipo) {
    if (adaptador == null || !adaptador.isEnabled()) {
      evento("error", "El Bluetooth del teléfono está apagado.");
      return;
    }
    act.asegurarPermisos(MainActivity.permisosBluetooth(), () -> {
      cerrar();
      BluetoothDevice d = vistos.get(mac);
      if (d == null) {
        try { d = adaptador.getRemoteDevice(mac); } catch (Exception ignorada) { }
      }
      if (d == null) { evento("error", "No se encontró el aparato " + mac + "."); return; }
      if ("ble".equalsIgnoreCase(tipo)) abrirBle(d); else abrirSpp(d);
    });
  }

  @JavascriptInterface
  public void escribir(String texto) {
    if (texto == null) return;
    byte[] datos = texto.getBytes(StandardCharsets.ISO_8859_1);
    if (salida != null) {
      /* En un hilo aparte: escribir en un socket RFCOMM bloquea, y hacerlo en
         el hilo del puente congelaría la página entera. */
      new Thread(() -> {
        try { salida.write(datos); salida.flush(); }
        catch (Exception e) { evento("error", "Se cortó el envío: " + e.getMessage()); }
      }, "nexus-spp-tx").start();
      return;
    }
    if (gatt != null && escritura != null) { colaBle.add(datos); bombearBle(); return; }
    evento("error", "No hay un escáner conectado.");
  }

  @JavascriptInterface
  public void desconectar() { cerrar(); evento("cerrado", null); }

  /* ═══════════ SPP / RFCOMM ═══════════ */

  private void abrirSpp(final BluetoothDevice d) {
    new Thread(() -> {
      try {
        /* Descubrir y conectar a la vez arruina las dos cosas: el radio no da
           abasto y el connect() falla con un "read failed" que no dice nada. */
        try { adaptador.cancelDiscovery(); } catch (Exception ignorada) { }
        BluetoothSocket s = d.createRfcommSocketToServiceRecord(SPP);
        s.connect();
        socket = s;
        salida = s.getOutputStream();
        arrancarLector(s.getInputStream());
        evento("conectado", nombre(d));
      } catch (Exception e) {
        cerrar();
        evento("error", "No se pudo abrir " + nombre(d) + ": " + e.getMessage()
            + ". Revisá que esté emparejado y enchufado al vehículo.");
      }
    }, "nexus-spp-connect").start();
  }

  private void arrancarLector(final InputStream in) {
    lector = new Thread(() -> {
      byte[] buf = new byte[512];
      while (!Thread.currentThread().isInterrupted()) {
        try {
          int n = in.read(buf);
          if (n < 0) break;
          if (n > 0) aJS("NexusBT_rx", new String(buf, 0, n, StandardCharsets.ISO_8859_1));
        } catch (Exception e) { break; }
      }
      /* Solo se avisa si el corte NO lo pedimos nosotros: al desconectar a
         propósito, el read revienta igual y un "se cortó" ahí sería mentira. */
      if (socket != null) evento("cerrado", "El escáner se desconectó.");
    }, "nexus-spp-rx");
    lector.start();
  }

  /* ═══════════ BLE / GATT ═══════════ */

  private void abrirBle(final BluetoothDevice d) {
    final BluetoothGattCallback cb = new BluetoothGattCallback() {
      @Override public void onConnectionStateChange(BluetoothGatt g, int estado, int nuevo) {
        if (nuevo == BluetoothGatt.STATE_CONNECTED) {
          gatt = g;
          try { g.requestMtu(247); } catch (Exception e) { g.discoverServices(); }
        } else if (nuevo == BluetoothGatt.STATE_DISCONNECTED) {
          boolean intencional = gatt == null;
          cerrar();
          if (!intencional) evento("cerrado", "El escáner se desconectó.");
        }
      }

      @Override public void onMtuChanged(BluetoothGatt g, int mtu, int estado) { g.discoverServices(); }

      @Override public void onServicesDiscovered(BluetoothGatt g, int estado) {
        /* Autodetección: cualquier servicio que tenga una característica que
           notifique y otra en la que se pueda escribir. Es la misma regla que
           usa el driver web, y por eso sirve para dongles cuyo par exacto de
           UUID no conocemos — que son la mayoría de los genéricos. */
        for (BluetoothGattService s : g.getServices()) {
          BluetoothGattCharacteristic wr = null, nt = null;
          for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
            int p = c.getProperties();
            if (nt == null && (p & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) nt = c;
            if (wr == null && ((p & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0
                || (p & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0)) wr = c;
          }
          if (wr != null && nt != null) { escritura = wr; notificacion = nt; break; }
        }
        if (escritura == null || notificacion == null) {
          cerrar();
          evento("error", "El aparato conectó por BLE pero no expone un canal de datos "
              + "(escritura + notificación). Puede ser un protocolo propietario.");
          return;
        }
        g.setCharacteristicNotification(notificacion, true);
        BluetoothGattDescriptor desc = notificacion.getDescriptor(CCCD);
        if (desc != null) {
          /* Sin escribir el CCCD el aparato NO manda nada y todo parece
             funcionar: conecta, acepta comandos y jamás contesta. */
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            g.writeDescriptor(desc, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
          } else {
            desc.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
            g.writeDescriptor(desc);
          }
        } else {
          evento("conectado", nombre(d));
        }
      }

      @Override public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor desc, int estado) {
        evento("conectado", nombre(d));
      }

      @Override public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int estado) {
        bleOcupado = false;
        bombearBle();
      }

      /* Android 13 cambió la firma; se implementan las dos o en un teléfono
         nuevo no llega nada y en uno viejo tampoco. */
      @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] valor) {
        aJS("NexusBT_rx", new String(valor, StandardCharsets.ISO_8859_1));
      }

      @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
        byte[] v = c.getValue();
        if (v != null) aJS("NexusBT_rx", new String(v, StandardCharsets.ISO_8859_1));
      }
    };

    try {
      d.connectGatt(act, false, cb, BluetoothDevice.TRANSPORT_LE);
    } catch (Exception e) {
      evento("error", "No se pudo abrir BLE: " + e.getMessage());
    }
  }

  /* GATT admite UNA operación a la vez: mandar dos seguidas hace que la
     segunda se pierda en silencio. De ahí la cola. */
  private void bombearBle() {
    if (bleOcupado || gatt == null || escritura == null) return;
    byte[] datos = colaBle.poll();
    if (datos == null) return;
    bleOcupado = true;
    try {
      int modo = (escritura.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0
          ? BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
          : BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        gatt.writeCharacteristic(escritura, datos, modo);
      } else {
        escritura.setWriteType(modo);
        escritura.setValue(datos);
        gatt.writeCharacteristic(escritura);
      }
    } catch (Exception e) {
      bleOcupado = false;
      evento("error", "Falló el envío por BLE: " + e.getMessage());
    }
  }

  /* ═══════════ cierre ═══════════ */

  void cerrar() {
    BluetoothSocket s = socket;
    socket = null;                 // primero, para que el lector sepa que fue a propósito
    salida = null;
    if (lector != null) { lector.interrupt(); lector = null; }
    if (s != null) { try { s.close(); } catch (Exception ignorada) { } }

    BluetoothGatt g = gatt;
    gatt = null;
    escritura = null;
    notificacion = null;
    colaBle.clear();
    bleOcupado = false;
    if (g != null) { try { g.disconnect(); g.close(); } catch (Exception ignorada) { } }
  }
}
