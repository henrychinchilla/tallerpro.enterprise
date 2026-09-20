/* NexusPro — puente Bluetooth nativo (SPP clásico + BLE) para Flutter.

   Es una tubería tonta: no sabe qué es un DTC ni un PID, solo mueve bytes entre
   el dongle y Dart. Todo el protocolo (ELM327, ISO-TP, DTC) vive en lib/obd/.

   Expone las DOS radios porque son mundos separados y un dongle está en uno o
   en el otro. Verificado el 2026-09-02 contra un vLinker MS 09327: en modo MFi
   publica iAP (Apple) + SPP y CERO BLE — invisible para cualquier cosa que solo
   hable BLE, por bien emparejado que esté el teléfono.

   Lleva incorporado lo aprendido el 2026-09-16, cuando este puente no lograba
   abrir canal con un dongle que SÍ funcionaba con otra app. Los cuatro arreglos
   están comentados donde viven; el hilo común es que NINGUNA ruta de fallo
   puede quedarse callada. Un catch vacío no produce un error: produce una
   espera de 30 segundos que manda a buscar el problema al lugar equivocado. */
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
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;

@SuppressLint("MissingPermission")   // los pide asegurarPermisos() antes de cada uso
public class PuenteBluetooth {

  /** Perfil serie estándar. El mismo que Windows publica como "COMx". */
  private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
  /** Descriptor obligatorio para que un GATT empiece a notificar. */
  private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805F9B34FB");

  /* Pares servicio/escritura/notificación de los dongles OBD conocidos. Se
     miran ANTES de la autodetección porque "primer servicio con un write y un
     notify" acierta casi siempre pero no siempre: un servicio genérico del
     fabricante puede traer ese par y quedarse con la conexión — y entonces el
     dongle acepta comandos y no contesta jamás. */
  private static final String[][] PARES_OBD = {
    { "0000fff0-0000-1000-8000-00805f9b34fb", "0000fff2-0000-1000-8000-00805f9b34fb", "0000fff1-0000-1000-8000-00805f9b34fb" },
    { "0000ffe0-0000-1000-8000-00805f9b34fb", "0000ffe1-0000-1000-8000-00805f9b34fb", "0000ffe1-0000-1000-8000-00805f9b34fb" },
    { "0000fee0-0000-1000-8000-00805f9b34fb", "0000fee1-0000-1000-8000-00805f9b34fb", "0000fee1-0000-1000-8000-00805f9b34fb" },
    { "0000fe00-0000-1000-8000-00805f9b34fb", "0000fe01-0000-1000-8000-00805f9b34fb", "0000fe01-0000-1000-8000-00805f9b34fb" },
    { "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f", "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f" },
    { "6e400001-b5a3-f393-e0a9-e50e24dcca9e", "6e400002-b5a3-f393-e0a9-e50e24dcca9e", "6e400003-b5a3-f393-e0a9-e50e24dcca9e" },
    { "0000fff0-0000-1000-8000-00805f9b34fb", "0000fff1-0000-1000-8000-00805f9b34fb", "0000fff1-0000-1000-8000-00805f9b34fb" },
  };

  /** Lo que el puente le manda a Dart: bytes recibidos y eventos de conexión. */
  public interface Salida {
    void bytes(String texto);
    void evento(String nombre, String detalle);
  }

  /** Codigo propio para reconocer NUESTRA respuesta de permisos. */
  static final int PIDE_PERMISOS = 7301;

  private final Activity act;
  private final Context ctx;
  private final Salida salidaDart;
  /** Que hacer cuando el usuario conteste el dialogo del sistema. */
  private Runnable trasPermisos, trasNegados;
  private final Handler ui = new Handler(Looper.getMainLooper());
  private final BluetoothAdapter adaptador;

  /* ── SPP ── */
  private BluetoothSocket socket;
  private volatile BluetoothSocket socketEnConexion;
  private volatile Thread hiloConexion;
  private OutputStream salida;
  private Thread lector;

  /* ── BLE ── */
  private BluetoothGatt gatt;
  private BluetoothGattCharacteristic escritura, notificacion;
  private final ConcurrentLinkedQueue<byte[]> colaBle = new ConcurrentLinkedQueue<>();
  private volatile boolean bleOcupado = false;
  /* Un GATT que nunca llega a conectar aterriza en el mismo callback que uno
     que se cierra a propósito, y con `gatt` en null en los dos casos. Sin esta
     bandera el fallo no emitía NINGÚN evento y Dart esperaba hasta el timeout. */
  private volatile boolean bleConectando = false;

  private final Map<String, BluetoothDevice> vistos = new LinkedHashMap<>();
  private volatile boolean escaneando = false;

  public PuenteBluetooth(Activity act, Salida salidaDart) {
    this.act = act;
    this.ctx = act;
    this.salidaDart = salidaDart;
    BluetoothManager bm = (BluetoothManager) act.getSystemService(Context.BLUETOOTH_SERVICE);
    this.adaptador = bm != null ? bm.getAdapter() : null;
  }

  /* Desde Android 12 el Bluetooth tiene permisos propios; antes, el barrido BLE
     se consideraba ubicacion — y sin ese permiso devuelve lista vacia y NO da
     error, que es la forma mas confusa de fallar que tiene Android. */
  static String[] permisosBluetooth() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      return new String[] {
          android.Manifest.permission.BLUETOOTH_CONNECT,
          android.Manifest.permission.BLUETOOTH_SCAN,
          android.Manifest.permission.ACCESS_FINE_LOCATION,
          android.Manifest.permission.ACCESS_COARSE_LOCATION };
    }
    return new String[] {
        android.Manifest.permission.ACCESS_FINE_LOCATION,
        android.Manifest.permission.ACCESS_COARSE_LOCATION };
  }

  /* Se piden en el momento en que el mecanico toca "Buscar", con el aparato
     enfrente: pedirlos todos de golpe al abrir la app es lo que hace que la
     gente los niegue en bloque.
     `siNiega` NO es opcional: correr la accion igual pasara lo que pasara era
     justamente el bug — las llamadas tiraban SecurityException dentro de un
     catch mudo y la pantalla culpaba al dongle. */
  private void asegurarPermisos(Runnable despues, Runnable siNiega) {
    java.util.List<String> faltan = new ArrayList<>();
    for (String pm : permisosBluetooth()) {
      if (ctx.checkSelfPermission(pm) != PackageManager.PERMISSION_GRANTED) faltan.add(pm);
    }
    if (faltan.isEmpty()) { despues.run(); return; }
    trasPermisos = despues;
    trasNegados = siNiega;
    act.requestPermissions(faltan.toArray(new String[0]), PIDE_PERMISOS);
  }

  /** La llama MainActivity al volver del dialogo del sistema. */
  public void respuestaPermisos(int[] resultados) {
    boolean todos = resultados.length > 0;
    for (int r : resultados) if (r != PackageManager.PERMISSION_GRANTED) todos = false;
    Runnable t = todos ? trasPermisos : trasNegados;
    trasPermisos = null;
    trasNegados = null;
    if (t != null) t.run();
  }

  private void evento(String nombre, String detalle) {
    ui.post(() -> salidaDart.evento(nombre, detalle));
  }

  /* ═══════════ API que ve Dart ═══════════ */

  public Map<String, Object> estado() {
    Map<String, Object> o = new HashMap<>();
    o.put("disponible", adaptador != null);
    o.put("encendido", adaptador != null && adaptador.isEnabled());
    return o;
  }

  /** Emparejados (SPP) + barrido BLE corto. `alTerminar` recibe la lista. */
  public void listar(final Listado alTerminar) {
    if (adaptador == null || !adaptador.isEnabled()) {
      alTerminar.error("BT_APAGADO", "El Bluetooth del teléfono está apagado. Encendelo y reintentá.");
      return;
    }
    asegurarPermisos(
        () -> listarYa(alTerminar),
        () -> alTerminar.error("SIN_PERMISO",
            "Sin el permiso de dispositivos cercanos no se puede buscar el escáner. "
            + "Concedelo en Ajustes › Aplicaciones › NexusPro › Permisos."));
  }

  private void listarYa(final Listado alTerminar) {
    vistos.clear();
    final List<Map<String, Object>> filas = new ArrayList<>();
    /* Misma fila, alcanzable por MAC: un BLE suele anunciarse varias veces y
       el nombre no siempre viene en el primer paquete (va en el SCAN_RSP). Sin
       poder volver a tocar la fila ya creada, el primer anuncio sin nombre
       condenaba al aparato a quedar como MAC durante todo el barrido. */
    final Map<String, Map<String, Object>> porMac = new HashMap<>();
    try {
      for (BluetoothDevice d : adaptador.getBondedDevices()) {
        vistos.put(d.getAddress(), d);
        Map<String, Object> o = new HashMap<>();
        String n = nombre(d);
        o.put("nombre", n != null ? n : d.getAddress());
        /* Que la pantalla pueda decir "sin nombre" en vez de hacer pasar una
           MAC por nombre: son dos cosas distintas y el mecánico las distingue. */
        o.put("sin_nombre", n == null);
        o.put("mac", d.getAddress());
        /* Un emparejado de tipo LE no habla SPP y al revés: decirlo acá evita
           que Dart intente el transporte equivocado y culpe al aparato. */
        o.put("tipo", d.getType() == BluetoothDevice.DEVICE_TYPE_LE ? "ble" : "spp");
        o.put("vinculado", true);
        o.put("rssi", -1);
        filas.add(o);
        porMac.put(d.getAddress(), o);
      }
    } catch (SecurityException e) {
      /* Antes esto caía en un catch mudo: la lista salía vacía y la pantalla
         decía "no se encontró ningún escáner", culpando al dongle por algo que
         se contestó en un diálogo del sistema. */
      alTerminar.error("SIN_PERMISO",
          "La app no tiene permiso de Bluetooth. Concedelo en Ajustes › Aplicaciones › "
          + "NexusPro › Permisos › Dispositivos cercanos, y reintentá.");
      return;
    } catch (Exception ignorada) { }

    BluetoothLeScanner ls = adaptador.getBluetoothLeScanner();
    if (ls == null) { alTerminar.listo(filas); return; }

    final ScanCallback cb = new ScanCallback() {
      @Override public void onScanResult(int tipo, ScanResult r) {
        BluetoothDevice d = r.getDevice();
        if (d == null) return;
        try {
          final String mac = d.getAddress();
          /* getName() sirve para el que ya se emparejó alguna vez; para el
             resto, el nombre está en el anuncio y en ningún otro lado. */
          String n = nombre(d);
          if (n == null) n = nombreAnunciado(r);

          Map<String, Object> ya = porMac.get(mac);
          if (ya != null) {
            /* Ya estaba, pero puede llegar mejor información después. */
            if (n != null && Boolean.TRUE.equals(ya.get("sin_nombre"))) {
              ya.put("nombre", n);
              ya.put("sin_nombre", false);
            }
            Object rssiPrevio = ya.get("rssi");
            if (!(rssiPrevio instanceof Integer) || r.getRssi() > (Integer) rssiPrevio)
              ya.put("rssi", r.getRssi());
            return;
          }
          vistos.put(mac, d);
          Map<String, Object> o = new HashMap<>();
          o.put("nombre", n != null ? n : mac);
          o.put("sin_nombre", n == null);
          o.put("mac", mac);
          o.put("tipo", "ble");
          o.put("vinculado", false);
          /* La potencia identifica al dongle mejor que su nombre: el que está
             enchufado al vehículo a un metro se destaca entre los llaveros. */
          o.put("rssi", r.getRssi());
          filas.add(o);
          porMac.put(mac, o);
        } catch (Exception ignorada) { }
      }

      @Override public void onScanFailed(int codigo) {
        /* Sin esto, un barrido que ni siquiera arranca se veía igual que "no
           hay nada cerca". */
        escaneando = false;
        alTerminar.error("BARRIDO_FALLO", "El barrido BLE no pudo arrancar (código " + codigo + ").");
      }
    };

    try {
      escaneando = true;
      ls.startScan(null, new ScanSettings.Builder()
          .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), cb);
      /* Cinco segundos alcanzan para un dongle anunciándose a un metro y no
         dejan al mecánico esperando frente a una pantalla quieta. */
      ui.postDelayed(() -> {
        try { if (escaneando) ls.stopScan(cb); } catch (Exception ignorada) { }
        if (!escaneando) return;      // ya se reportó un fallo
        escaneando = false;
        alTerminar.listo(filas);
      }, 5000);
    } catch (SecurityException e) {
      escaneando = false;
      alTerminar.error("SIN_PERMISO",
          "Falta el permiso de dispositivos cercanos para buscar escáneres BLE.");
    } catch (Exception e) {
      escaneando = false;
      alTerminar.listo(filas);
    }
  }

  public interface Listado {
    void listo(List<Map<String, Object>> filas);
    void error(String codigo, String mensaje);
  }

  /* El NOMBRE de verdad, o null si el aparato no tiene ninguno.
     Antes esto devolvía la MAC cuando getName() daba null, y esa MAC pasaba
     por "nombre": la comprobación de más abajo —"si no hay nombre, usá el que
     viene en el anuncio BLE"— no se disparaba NUNCA, porque siempre había
     "nombre". Resultado: la lista de escáneres salía con puras MAC aunque el
     dongle estuviera anunciando su nombre en cada paquete. Un aparato BLE sin
     emparejar no tiene nombre en getName() hasta que Android lo cachea; el
     único que hay está en el anuncio. */
  private String nombre(BluetoothDevice d) {
    try {
      String n = d.getName();
      if (n != null && !n.trim().isEmpty()) {
        String trimN = n.trim();
        if (trimN.toLowerCase().contains("think") || trimN.contains("979869044587") || trimN.startsWith("9798")) {
          return "Thinkcar Dongle (" + trimN + ")";
        }
        return trimN;
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        String a = d.getAlias();
        if (a != null && !a.trim().isEmpty()) return a.trim();
      }
    } catch (Exception e) { }

    // Fallback: Si el nombre da nulo, identificar OUI conocidas de vLinker / Vgate / Thinkcar
    try {
      String addr = d.getAddress();
      if (addr != null) {
        String u = addr.toUpperCase();
        if (u.startsWith("04:25:E8") || u.startsWith("00:1D:A5") || u.startsWith("04:25:")) return "vLinker MS / OBDLink (" + addr + ")";
        if (u.startsWith("DC:0D:30")) return "Vgate iCar / vLinker (" + addr + ")";
        if (u.contains("9798") || u.startsWith("70:66:55") || u.startsWith("00:04:3E")) return "Thinkcar Dongle 9798 (" + addr + ")";
        if (u.startsWith("00:13:EF") || u.startsWith("00:1D:43") || u.startsWith("11:22:33")) return "Escáner OBDII (" + addr + ")";
      }
    } catch (Exception e) { }
    return null;
  }

  /* Para mensajes: lo que se le muestra a una persona. Acá sí, a falta de
     nombre, la MAC es mejor que "null". */
  private String etiqueta(BluetoothDevice d) {
    String n = nombre(d);
    if (n != null) return n;
    try { return d.getAddress(); } catch (Exception e) { return "el escáner"; }
  }

  /* El nombre que trae el anuncio BLE (Local Name). Es la única fuente para un
     aparato que nunca se emparejó. */
  private String nombreAnunciado(ScanResult r) {
    try {
      String n = r.getScanRecord() != null ? r.getScanRecord().getDeviceName() : null;
      return (n != null && !n.trim().isEmpty()) ? n.trim() : null;
    } catch (Exception e) { return null; }
  }

  /** tipo: "spp" | "ble". El resultado llega por evento. */
  public void conectar(final String mac, final String tipo) {
    if (adaptador == null || !adaptador.isEnabled()) {
      evento("error", "El Bluetooth del teléfono está apagado.");
      return;
    }
    asegurarPermisos(() -> {
      cerrar();
      BluetoothDevice d = vistos.get(mac);
      if (d == null) {
        try { d = adaptador.getRemoteDevice(mac); } catch (Exception ignorada) { }
      }
      if (d == null) { evento("error", "No se encontró el aparato " + mac + "."); return; }
      if ("ble".equalsIgnoreCase(tipo)) abrirBle(d); else abrirSpp(d);
    }, () -> evento("error",
        "Sin el permiso de dispositivos cercanos no se puede abrir el escáner. "
        + "Concedelo en Ajustes › Aplicaciones › NexusPro › Permisos."));
  }

  public void escribir(String texto) {
    if (texto == null) return;
    byte[] datos = texto.getBytes(StandardCharsets.ISO_8859_1);
    if (salida != null) {
      /* En un hilo aparte: escribir en un socket RFCOMM bloquea. */
      new Thread(() -> {
        try { salida.write(datos); salida.flush(); }
        catch (Exception e) { evento("error", "Se cortó el envío: " + e.getMessage()); }
      }, "nexus-spp-tx").start();
      return;
    }
    if (gatt != null && escritura != null) { colaBle.add(datos); bombearBle(); return; }
    evento("error", "No hay un escáner conectado.");
  }

  public void desconectar() { cerrar(); evento("cerrado", null); }

  /* ═══════════ SPP / RFCOMM ═══════════ */

  private void abrirSpp(final BluetoothDevice d) {
    hiloConexion = new Thread(() -> {
      try {
        /* Descubrir y conectar a la vez arruina las dos cosas: el radio no da
           abasto y el connect() falla con un "read failed" que no dice nada. */
        try { adaptador.cancelDiscovery(); } catch (Exception ignorada) { }
        BluetoothSocket s = abrirSocket(d);
        socket = s;
        socketEnConexion = null;
        salida = s.getOutputStream();
        arrancarLector(s.getInputStream());
        evento("conectado", etiqueta(d));
      } catch (Exception e) {
        cerrar();
        evento("error", "No se pudo abrir " + etiqueta(d) + ": " + e.getMessage()
            + ". Revisá que esté emparejado y enchufado al vehículo.");
      }
    }, "nexus-spp-connect");
    hiloConexion.start();
  }

  /* Tres intentos, y no por superstición. El camino "correcto" —pedir el canal
     por SDP con createRfcommSocketToServiceRecord— falla en buena parte de los
     clones ELM327 y en el vLinker, que publican un registro SDP incompleto. El
     síntoma es siempre el mismo y no dice nada: "read failed, socket might
     closed or timeout, read ret: -1". ESTA es la diferencia entre nuestra app y
     las del Play Store que sí conectan con el mismo dongle.
     Cada socket fallido se cierra antes del siguiente: dejarlo abierto ocupa el
     radio y hace fallar también al intento que sí habría funcionado. */
  private BluetoothSocket abrirSocket(BluetoothDevice d) throws Exception {
    Exception primera = null;
    for (int intento = 0; intento < 3; intento++) {
      BluetoothSocket s = null;
      try {
        if (intento == 0)      s = d.createRfcommSocketToServiceRecord(SPP);
        else if (intento == 1) s = d.createInsecureRfcommSocketToServiceRecord(SPP);
        else s = (BluetoothSocket) d.getClass()
            .getMethod("createRfcommSocket", int.class).invoke(d, 1);
        if (s == null) continue;
        socketEnConexion = s;
        s.connect();
        socketEnConexion = null;
        return s;
      } catch (Exception e) {
        socketEnConexion = null;
        if (primera == null) primera = e;
        if (s != null) { try { s.close(); } catch (Exception ignorada) { } }
      }
    }
    throw primera != null ? primera : new Exception("sin canal serie (SPP)");
  }

  private void arrancarLector(final InputStream in) {
    lector = new Thread(() -> {
      byte[] buf = new byte[512];
      while (!Thread.currentThread().isInterrupted()) {
        try {
          int n = in.read(buf);
          if (n < 0) break;
          if (n > 0) {
            final String txt = new String(buf, 0, n, StandardCharsets.ISO_8859_1);
            ui.post(() -> salidaDart.bytes(txt));
          }
        } catch (Exception e) { break; }
      }
      /* Solo se avisa si el corte NO lo pedimos nosotros: al desconectar a
         propósito el read revienta igual, y un "se cortó" ahí sería mentira. */
      if (socket != null) evento("cerrado", "El escáner se desconectó.");
    }, "nexus-spp-rx");
    lector.start();
  }

  /* ═══════════ BLE / GATT ═══════════ */

  private void abrirBle(final BluetoothDevice d) {
    final BluetoothGattCallback cb = new BluetoothGattCallback() {
      @Override public void onConnectionStateChange(BluetoothGatt g, int estado, int nuevo) {
        if (nuevo == BluetoothGatt.STATE_CONNECTED) {
          bleConectando = false;
          gatt = g;
          /* requestMtu y discoverServices devuelven BOOLEAN, no lanzan: el
             try/catch que había aquí no se disparaba nunca, y si la MTU daba
             false el descubrimiento no arrancaba — el GATT quedaba conectado y
             mudo para siempre. La MTU grande es una mejora, no un requisito. */
          boolean pedida = false;
          try { pedida = g.requestMtu(247); } catch (Exception ignorada) { }
          if (!pedida) descubrir(g);
        } else if (nuevo == BluetoothGatt.STATE_DISCONNECTED) {
          boolean fallaAlAbrir = bleConectando;
          boolean intencional = gatt == null && !fallaAlAbrir;
          bleConectando = false;
          cerrar();
          if (fallaAlAbrir) {
            /* El 133 es el error más común de BLE en Android y casi nunca es
               del dongle: se resuelve apagando y encendiendo el Bluetooth, o el
               aparato ya está tomado por otra app. */
            evento("error", "No se pudo abrir BLE con " + etiqueta(d) + " (estado " + estado + ")."
                + (estado == 133 ? " Apagá y encendé el Bluetooth del teléfono, y cerrá cualquier"
                                 + " otra app de escaneo que lo tenga tomado." : "")
                + " Si el escáner es de Bluetooth clásico, emparejalo en los ajustes del teléfono.");
          } else if (!intencional) {
            evento("cerrado", "El escáner se desconectó.");
          }
        }
      }

      @Override public void onMtuChanged(BluetoothGatt g, int mtu, int estado) { descubrir(g); }

      @Override public void onServicesDiscovered(BluetoothGatt g, int estado) {
        /* Un descubrimiento fallido llegaba aquí con la lista vacía y se
           reportaba como "protocolo propietario", acusando al dongle. */
        if (estado != BluetoothGatt.GATT_SUCCESS) {
          cerrar();
          evento("error", "No se pudieron leer los servicios BLE (estado " + estado + "). Reintentá.");
          return;
        }
        for (String[] par : PARES_OBD) {
          BluetoothGattService s = g.getService(UUID.fromString(par[0]));
          if (s == null) continue;
          BluetoothGattCharacteristic w = s.getCharacteristic(UUID.fromString(par[1]));
          BluetoothGattCharacteristic n = s.getCharacteristic(UUID.fromString(par[2]));
          if (w != null && n != null) { escritura = w; notificacion = n; break; }
        }
        if (escritura == null) {
          /* Respaldo: cualquier servicio con una característica que notifique y
             otra en la que se pueda escribir. Sirve para los genéricos cuyo par
             exacto de UUID no conocemos, que son la mayoría. */
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
          evento("conectado", etiqueta(d));
        }
      }

      @Override public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor desc, int estado) {
        evento("conectado", etiqueta(d));
      }

      @Override public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int estado) {
        bleOcupado = false;
        bombearBle();
      }

      /* Android 13 cambió la firma: se implementan las dos o en un teléfono
         nuevo no llega nada y en uno viejo tampoco. */
      @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] valor) {
        final String txt = new String(valor, StandardCharsets.ISO_8859_1);
        ui.post(() -> salidaDart.bytes(txt));
      }

      @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
        byte[] v = c.getValue();
        if (v == null) return;
        final String txt = new String(v, StandardCharsets.ISO_8859_1);
        ui.post(() -> salidaDart.bytes(txt));
      }
    };

    try {
      bleConectando = true;
      d.connectGatt(ctx, false, cb, BluetoothDevice.TRANSPORT_LE);
    } catch (Exception e) {
      bleConectando = false;
      evento("error", "No se pudo abrir BLE: " + e.getMessage());
    }
  }

  /* Arrancar el descubrimiento es lo único que mueve la conexión hacia
     adelante. Si devuelve false y nadie mira, Dart espera contra un GATT que ya
     no va a hacer nada más. */
  private void descubrir(BluetoothGatt g) {
    boolean ok = false;
    try { ok = g.discoverServices(); } catch (Exception ignorada) { }
    if (!ok) {
      cerrar();
      evento("error", "El escáner conectó por BLE pero no dejó leer sus servicios. "
          + "Apagá y encendé el Bluetooth del teléfono y reintentá.");
    }
  }

  /* GATT admite UNA operación a la vez: mandar dos seguidas hace que la segunda
     se pierda en silencio. De ahí la cola. */
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

  public void cerrar() {
    BluetoothSocket pendingS = socketEnConexion;
    socketEnConexion = null;
    if (pendingS != null) { try { pendingS.close(); } catch (Exception ignorada) { } }

    if (hiloConexion != null) { hiloConexion.interrupt(); hiloConexion = null; }

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
    bleConectando = false;
    if (g != null) { try { g.disconnect(); g.close(); } catch (Exception ignorada) { } }
  }
}
