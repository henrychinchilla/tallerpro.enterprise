/* NexusPro — Sonda de K-line por J2534
   ─────────────────────────────────────────────────────────────────────────────
   Por qué existe este archivo, además del puente RP1210:

   Todo lo probado contra el Montero 2004 hasta ahora fue por **RP1210**, y por
   ahí el vehículo nunca contestó. Pero RP1210 no tiene manera de pedir el
   **init de capa física** de un bus K-line: el barrido mandaba `81 33 F1 81`
   directo a un bus que nunca se había despertado. En un vehículo de 2004 eso no
   contesta aunque el cable esté perfecto.

   J2534 (SAE J2534-1) sí lo tiene, y son dos ioctl:
     · FIVE_BAUD_INIT — el init lento de ISO 9141-2 (dirección a 5 baudios)
     · FAST_INIT      — el init rápido de ISO 14230 / KWP2000

   Y el mismo USB-Link está registrado como dispositivo J2534 declarando
   ISO9141 e ISO14230 (HKLM\SOFTWARE\PassThruSupport.04.04). O sea: **mismo
   hardware, pila de driver distinta, y por primera vez el saludo correcto.**

   Esta sonda no toca nada del vehículo: todo lo que manda son peticiones de
   lectura (modo 01 y modo 03 de OBD-II).

   Lo que imprime es una BITÁCORA CRUDA a propósito. Un "no funcionó" no sirve;
   lo que sirve es el diálogo byte por byte, que es lo que pide el doc del
   Montero para dar una prueba por hecha.

   Se corre con: probar-kline.bat   (vehículo enchufado, switch en contacto)
   IMPORTANTE: x86 obligatorio — las DLL J2534 son de 32 bits. */
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32;

/* ── PASSTHRU_MSG, tal cual la define J2534-1 ──────────────────────────────
   6 enteros de 32 bits + 4128 bytes de datos = 4152 bytes. El tamaño importa:
   la DLL escribe sobre esta memoria y si el struct es más corto, corrompe la
   pila de formas que no se leen en el mensaje de error. */
[StructLayout(LayoutKind.Sequential)]
public struct PassThruMsg {
  public uint ProtocolID;
  public uint RxStatus;
  public uint TxFlags;
  public uint Timestamp;
  public uint DataSize;
  public uint ExtraDataIndex;
  [MarshalAs(UnmanagedType.ByValArray, SizeConst = 4128)]
  public byte[] Data;

  public static PassThruMsg Nueva(uint protocolo) {
    var m = new PassThruMsg();
    m.ProtocolID = protocolo;
    m.Data = new byte[4128];
    return m;
  }

  public static PassThruMsg Con(uint protocolo, byte[] datos) {
    var m = Nueva(protocolo);
    Array.Copy(datos, m.Data, datos.Length);
    m.DataSize = (uint)datos.Length;
    return m;
  }

  public byte[] Bytes() {
    var n = (int)DataSize;
    if (n < 0 || n > 4128) n = 0;
    var b = new byte[n];
    Array.Copy(Data, b, n);
    return b;
  }
}

/* SBYTE_ARRAY de J2534: { cuántos bytes, puntero a los bytes } */
[StructLayout(LayoutKind.Sequential)]
public struct SByteArray {
  public uint NumOfBytes;
  public IntPtr BytePtr;
}

public static class J2534 {
  [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
  static extern IntPtr LoadLibrary(string archivo);
  [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
  static extern IntPtr GetProcAddress(IntPtr modulo, string nombre);

  /* Igual que en el puente RP1210: __stdcall obligatorio. Con la convención
     equivocada la pila queda corrupta al volver de cada llamada. */
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate int DOpen(IntPtr nombre, out uint deviceId);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate int DClose(uint deviceId);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate int DConnect(uint deviceId, uint protocolo, uint flags, uint baudios, out uint canalId);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate int DDisconnect(uint canalId);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate int DReadMsgs(uint canalId, [In, Out] PassThruMsg[] msgs, ref uint cuantos, uint timeout);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate int DWriteMsgs(uint canalId, [In, Out] PassThruMsg[] msgs, ref uint cuantos, uint timeout);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate int DStartMsgFilter(uint canalId, uint tipo, ref PassThruMsg mascara, ref PassThruMsg patron, IntPtr flowControl, out uint filtroId);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate int DIoctl(uint canalId, uint ioctlId, IntPtr entrada, IntPtr salida);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate int DReadVersion(uint deviceId, byte[] firmware, byte[] dll, byte[] api);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate int DGetLastError(byte[] descripcion);

  public static DOpen Open;
  public static DClose Close;
  public static DConnect Connect;
  public static DDisconnect Disconnect;
  public static DReadMsgs ReadMsgs;
  public static DWriteMsgs WriteMsgs;
  public static DStartMsgFilter StartMsgFilter;
  public static DIoctl Ioctl;
  public static DReadVersion ReadVersion;
  public static DGetLastError GetLastErrorTxt;

  /* Protocolos J2534-1 */
  public const uint P_J1850VPW = 1, P_J1850PWM = 2, P_ISO9141 = 3, P_ISO14230 = 4,
                    P_CAN = 5, P_ISO15765 = 6;
  /* Ioctl J2534-1 */
  public const uint IOCTL_READ_VBATT = 0x03, IOCTL_FIVE_BAUD_INIT = 0x04,
                    IOCTL_FAST_INIT = 0x05, IOCTL_CLEAR_RX_BUFFER = 0x08;
  public const uint PASS_FILTER = 1;

  static Delegate Fn(IntPtr mod, string nombre, Type tipo) {
    var p = GetProcAddress(mod, nombre);
    if (p == IntPtr.Zero) return null;
    return Marshal.GetDelegateForFunctionPointer(p, tipo);
  }

  public static bool Cargar(string rutaDll, out string error) {
    error = null;
    var mod = LoadLibrary(rutaDll);
    if (mod == IntPtr.Zero) {
      error = "No se pudo cargar " + rutaDll + " (error " + Marshal.GetLastWin32Error() + ")";
      return false;
    }
    Open           = (DOpen)Fn(mod, "PassThruOpen", typeof(DOpen));
    Close          = (DClose)Fn(mod, "PassThruClose", typeof(DClose));
    Connect        = (DConnect)Fn(mod, "PassThruConnect", typeof(DConnect));
    Disconnect     = (DDisconnect)Fn(mod, "PassThruDisconnect", typeof(DDisconnect));
    ReadMsgs       = (DReadMsgs)Fn(mod, "PassThruReadMsgs", typeof(DReadMsgs));
    WriteMsgs      = (DWriteMsgs)Fn(mod, "PassThruWriteMsgs", typeof(DWriteMsgs));
    StartMsgFilter = (DStartMsgFilter)Fn(mod, "PassThruStartMsgFilter", typeof(DStartMsgFilter));
    Ioctl          = (DIoctl)Fn(mod, "PassThruIoctl", typeof(DIoctl));
    ReadVersion    = (DReadVersion)Fn(mod, "PassThruReadVersion", typeof(DReadVersion));
    GetLastErrorTxt = (DGetLastError)Fn(mod, "PassThruGetLastError", typeof(DGetLastError));
    if (Open == null || Connect == null || WriteMsgs == null || ReadMsgs == null || Ioctl == null) {
      error = rutaDll + " se cargó pero no exporta las funciones J2534 esperadas.";
      return false;
    }
    return true;
  }

  /* El código numérico no dice nada; el texto lo pone la propia DLL */
  public static string Error(int codigo) {
    var b = new byte[256];
    if (GetLastErrorTxt != null) { try { GetLastErrorTxt(b); } catch (Exception) { } }
    var s = Encoding.ASCII.GetString(b).TrimEnd('\0').Trim();
    return "err " + codigo + (s.Length > 0 ? " — " + s : "");
  }
}

/* Un dispositivo J2534 tal como lo declara su fabricante en el registro */
public class DispositivoJ2534 {
  public string Nombre, Vendor, Dll;
  public bool ISO9141, ISO14230;
  public override string ToString() {
    return Vendor + " — " + Nombre + (ISO9141 || ISO14230 ? "  [K-line: " +
      (ISO9141 ? "ISO9141 " : "") + (ISO14230 ? "ISO14230" : "") + "]" : "  [sin K-line]");
  }
}

public class SondaKline {
  static void P(string s) { Console.WriteLine(s); }
  static string Hex(byte[] b) {
    if (b == null || b.Length == 0) return "(vacío)";
    var sb = new StringBuilder();
    for (int i = 0; i < b.Length; i++) { if (i > 0) sb.Append(' '); sb.Append(b[i].ToString("x2")); }
    return sb.ToString();
  }

  /* ── Los dispositivos J2534 instalados, leídos del registro ────────────────
     En un proceso de 32 bits, HKLM\SOFTWARE ya redirige solo a WOW6432Node,
     que es donde los instaladores de 32 bits registran los pass-thru. */
  public static List<DispositivoJ2534> Instalados() {
    var lista = new List<DispositivoJ2534>();
    foreach (var raiz in new string[] { "SOFTWARE\\PassThruSupport.04.04", "SOFTWARE\\WOW6432Node\\PassThruSupport.04.04" }) {
      RegistryKey k = null;
      try { k = Registry.LocalMachine.OpenSubKey(raiz); } catch (Exception) { }
      if (k == null) continue;
      foreach (var sub in k.GetSubKeyNames()) {
        try {
          using (var d = k.OpenSubKey(sub)) {
            if (d == null) continue;
            var dll = d.GetValue("FunctionLibrary") as string;
            if (string.IsNullOrEmpty(dll)) continue;
            var yaEsta = false;
            foreach (var x in lista) if (string.Equals(x.Dll, dll, StringComparison.OrdinalIgnoreCase)) yaEsta = true;
            if (yaEsta) continue;
            var dis = new DispositivoJ2534();
            dis.Nombre = (d.GetValue("Name") as string) ?? sub;
            dis.Vendor = (d.GetValue("Vendor") as string) ?? "?";
            dis.Dll = dll;
            dis.ISO9141 = Convert.ToInt32(d.GetValue("ISO9141", 0)) != 0;
            dis.ISO14230 = Convert.ToInt32(d.GetValue("ISO14230", 0)) != 0;
            lista.Add(dis);
          }
        } catch (Exception) { }
      }
      k.Close();
    }
    return lista;
  }

  /* Voltaje de batería medido por el propio adaptador en el pin 16.
     Es la primera pregunta que hay que hacer: si esto responde, el adaptador
     está ELÉCTRICAMENTE VIVO en el conector y cualquier fallo posterior ya no
     se puede echar al cable ni a la alimentación. */
  static void Voltaje(uint canal) {
    var salida = Marshal.AllocHGlobal(4);
    try {
      int r = J2534.Ioctl(canal, J2534.IOCTL_READ_VBATT, IntPtr.Zero, salida);
      if (r == 0) {
        uint mv = (uint)Marshal.ReadInt32(salida);
        P("    Voltaje de batería (pin 16): " + (mv / 1000.0).ToString("0.000") + " V  ← el adaptador ve el vehículo");
      } else {
        P("    Voltaje de batería: no soportado o falló (" + J2534.Error(r) + ")");
      }
    } catch (Exception ex) { P("    Voltaje: excepción " + ex.Message); }
    finally { Marshal.FreeHGlobal(salida); }
  }

  /* Sin filtro no llega NADA por ReadMsgs, aunque el vehículo conteste.
     Máscara y patrón en cero = pasa todo. */
  static void FiltroPasaTodo(uint canal, uint proto) {
    try {
      var mascara = PassThruMsg.Con(proto, new byte[] { 0x00, 0x00, 0x00 });
      var patron  = PassThruMsg.Con(proto, new byte[] { 0x00, 0x00, 0x00 });
      uint fid;
      int r = J2534.StartMsgFilter(canal, J2534.PASS_FILTER, ref mascara, ref patron, IntPtr.Zero, out fid);
      if (r != 0) P("    Filtro 'pasa todo': " + J2534.Error(r));
    } catch (Exception ex) { P("    Filtro: excepción " + ex.Message); }
  }

  /* ISO 9141-2: init lento, la dirección del módulo sale a 5 baudios y el
     vehículo devuelve los keyword bytes. Esto es LO QUE NUNCA SE PUDO HACER
     por RP1210. */
  static bool CincoBaudios(uint canal, byte destino) {
    var entradaBytes = Marshal.AllocHGlobal(1);
    var salidaBytes = Marshal.AllocHGlobal(16);
    var entrada = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(SByteArray)));
    var salida = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(SByteArray)));
    try {
      Marshal.WriteByte(entradaBytes, destino);
      var ein = new SByteArray(); ein.NumOfBytes = 1; ein.BytePtr = entradaBytes;
      var eout = new SByteArray(); eout.NumOfBytes = 16; eout.BytePtr = salidaBytes;
      Marshal.StructureToPtr(ein, entrada, false);
      Marshal.StructureToPtr(eout, salida, false);

      int r = J2534.Ioctl(canal, J2534.IOCTL_FIVE_BAUD_INIT, entrada, salida);
      if (r != 0) { P("    FIVE_BAUD_INIT a 0x" + destino.ToString("x2") + ": FALLÓ — " + J2534.Error(r)); return false; }

      var devuelto = (SByteArray)Marshal.PtrToStructure(salida, typeof(SByteArray));
      var kw = new byte[devuelto.NumOfBytes > 16 ? 16 : devuelto.NumOfBytes];
      if (kw.Length > 0) Marshal.Copy(salidaBytes, kw, 0, kw.Length);
      P("    *** FIVE_BAUD_INIT a 0x" + destino.ToString("x2") + " OK ***  keyword bytes: " + Hex(kw));
      return true;
    } catch (Exception ex) { P("    FIVE_BAUD_INIT: excepción " + ex.Message); return false; }
    finally {
      Marshal.FreeHGlobal(entradaBytes); Marshal.FreeHGlobal(salidaBytes);
      Marshal.FreeHGlobal(entrada); Marshal.FreeHGlobal(salida);
    }
  }

  /* ISO 14230 / KWP2000: init rápido. La entrada y la salida son mensajes
     completos, no bytes sueltos. */
  static bool InitRapido(uint canal, byte[] saludo) {
    int tam = Marshal.SizeOf(typeof(PassThruMsg));
    var entrada = Marshal.AllocHGlobal(tam);
    var salida = Marshal.AllocHGlobal(tam);
    try {
      var mIn = PassThruMsg.Con(J2534.P_ISO14230, saludo);
      var mOut = PassThruMsg.Nueva(J2534.P_ISO14230);
      Marshal.StructureToPtr(mIn, entrada, false);
      Marshal.StructureToPtr(mOut, salida, false);

      int r = J2534.Ioctl(canal, J2534.IOCTL_FAST_INIT, entrada, salida);
      if (r != 0) { P("    FAST_INIT [" + Hex(saludo) + "]: FALLÓ — " + J2534.Error(r)); return false; }

      var resp = (PassThruMsg)Marshal.PtrToStructure(salida, typeof(PassThruMsg));
      P("    *** FAST_INIT [" + Hex(saludo) + "] OK ***  respuesta: " + Hex(resp.Bytes()));
      return true;
    } catch (Exception ex) { P("    FAST_INIT: excepción " + ex.Message); return false; }
    finally { Marshal.FreeHGlobal(entrada); Marshal.FreeHGlobal(salida); }
  }

  /* Manda una petición y escucha. Devuelve cuántas tramas REALES volvieron
     (las que son eco de lo que acabamos de mandar no cuentan: ese error ya se
     cometió una vez en el barrido por RP1210). */
  static int Pedir(uint canal, uint proto, byte[] peticion, string etiqueta, int msEscucha) {
    var tx = new PassThruMsg[1];
    tx[0] = PassThruMsg.Con(proto, peticion);
    uint n = 1;
    int r = J2534.WriteMsgs(canal, tx, ref n, 1000);
    if (r != 0) { P("    → " + etiqueta + " [" + Hex(peticion) + "]: no se pudo transmitir — " + J2534.Error(r)); return 0; }
    P("    → " + etiqueta + " [" + Hex(peticion) + "]");

    int reales = 0;
    var hasta = DateTime.Now.AddMilliseconds(msEscucha);
    while (DateTime.Now < hasta) {
      var rx = new PassThruMsg[1];
      rx[0] = PassThruMsg.Nueva(proto);
      uint cuantos = 1;
      int rr = J2534.ReadMsgs(canal, rx, ref cuantos, 300);
      if (rr != 0 || cuantos == 0) continue;
      var b = rx[0].Bytes();
      if (b.Length == 0) continue;
      bool esEco = (rx[0].RxStatus & 0x01) != 0 || Igual(b, peticion);
      P("    ← " + Hex(b) + (esEco ? "   (eco propio, no cuenta)" : "   *** RESPUESTA DEL VEHÍCULO ***"));
      if (!esEco) reales++;
    }
    if (reales == 0) P("    ← sin respuesta");
    return reales;
  }

  static bool Igual(byte[] a, byte[] b) {
    if (a == null || b == null || a.Length != b.Length) return false;
    for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false;
    return true;
  }

  public static void Main() {
    Console.Title = "NexusPro - Sonda de K-line por J2534";
    try { Console.OutputEncoding = Encoding.UTF8; } catch (Exception) { }

    P("═══════════════════════════════════════════════════════════════════");
    P("  NexusPro — Sonda de K-line por J2534");
    P("  " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
    P("═══════════════════════════════════════════════════════════════════");
    if (Environment.Is64BitProcess) {
      P("  ATENCIÓN: esto corre en 64 bits y las DLL J2534 son de 32.");
      P("  Usá probar-kline.bat.");
      return;
    }

    var disp = Instalados();
    P("");
    P("Dispositivos J2534 registrados en esta PC: " + disp.Count);
    for (int i = 0; i < disp.Count; i++) P("  [" + i + "] " + disp[i]);

    /* Se elige el USB-Link por USB: es el único hardware del taller que
       declara K-line y está enchufado. Si algún día hay otro, se cambia acá. */
    DispositivoJ2534 elegido = null;
    foreach (var d in disp)
      if (d.Vendor.IndexOf("NEXIQ", StringComparison.OrdinalIgnoreCase) >= 0 &&
          d.Nombre.IndexOf("Bluetooth", StringComparison.OrdinalIgnoreCase) < 0 &&
          (d.ISO9141 || d.ISO14230)) { elegido = d; break; }
    if (elegido == null) { P("\nNo se encontró el USB-Link por USB con K-line declarado. Abortando."); return; }

    P("");
    P("Elegido: " + elegido.Nombre + "  →  " + elegido.Dll);

    string err;
    if (!J2534.Cargar(elegido.Dll, out err)) { P("  " + err); return; }
    P("  DLL cargada ✓");

    uint dev;
    int rc = J2534.Open(IntPtr.Zero, out dev);
    if (rc != 0) {
      P("  PassThruOpen FALLÓ — " + J2534.Error(rc));
      P("  Si dice que no hay dispositivo: desenchufá y volvé a enchufar el USB-Link.");
      return;
    }
    P("  PassThruOpen ✓ (device " + dev + ")");

    if (J2534.ReadVersion != null) {
      var fw = new byte[80]; var dl = new byte[80]; var ap = new byte[80];
      try {
        if (J2534.ReadVersion(dev, fw, dl, ap) == 0)
          P("  Firmware: " + Encoding.ASCII.GetString(fw).TrimEnd('\0').Trim() +
            " · DLL: " + Encoding.ASCII.GetString(dl).TrimEnd('\0').Trim() +
            " · API: " + Encoding.ASCII.GetString(ap).TrimEnd('\0').Trim());
      } catch (Exception) { }
    }

    int respuestasTotales = 0;

    /* ── ISO 14230 (KWP2000), init rápido ──────────────────────────────────
       Se prueban las dos direcciones que importan en este vehículo: 0x33 es la
       funcional de OBD-II y 0x10 el motor en Mitsubishi. */
    P("");
    P("───────────────────────────────────────────────────────────────────");
    P(" ISO 14230 / KWP2000 · 10400 baudios · init RÁPIDO");
    P("───────────────────────────────────────────────────────────────────");
    uint canal;
    rc = J2534.Connect(dev, J2534.P_ISO14230, 0, 10400, out canal);
    if (rc != 0) {
      P("  PassThruConnect(ISO14230) FALLÓ — " + J2534.Error(rc));
    } else {
      P("  Canal abierto ✓");
      Voltaje(canal);
      FiltroPasaTodo(canal, J2534.P_ISO14230);
      foreach (byte dst in new byte[] { 0x33, 0x10 }) {
        P("  · destino 0x" + dst.ToString("x2"));
        bool ok = InitRapido(canal, new byte[] { 0xC1, dst, 0xF1, 0x81 });
        /* Se piden los datos aunque el init falle: si el init no era necesario
           —hay módulos que contestan sin él— igual queremos saberlo. */
        respuestasTotales += Pedir(canal, J2534.P_ISO14230, new byte[] { 0xC2, dst, 0xF1, 0x01, 0x00 }, "OBD modo 01 PID 00", 1500);
        respuestasTotales += Pedir(canal, J2534.P_ISO14230, new byte[] { 0x82, dst, 0xF1, 0x01, 0x00 }, "OBD modo 01 (cabecera 0x82)", 1500);
        respuestasTotales += Pedir(canal, J2534.P_ISO14230, new byte[] { 0xC1, dst, 0xF1, 0x03 }, "OBD modo 03 (códigos)", 1500);
        if (ok) P("    (el init sí entró: lo de arriba vale como diálogo real)");
      }
      J2534.Disconnect(canal);
    }

    /* ── ISO 9141-2, init lento de 5 baudios ───────────────────────────────
       Cabecera clásica de OBD-II: 68 6A F1. */
    P("");
    P("───────────────────────────────────────────────────────────────────");
    P(" ISO 9141-2 · 10400 baudios · init LENTO (5 baudios)");
    P("───────────────────────────────────────────────────────────────────");
    rc = J2534.Connect(dev, J2534.P_ISO9141, 0, 10400, out canal);
    if (rc != 0) {
      P("  PassThruConnect(ISO9141) FALLÓ — " + J2534.Error(rc));
    } else {
      P("  Canal abierto ✓");
      Voltaje(canal);
      FiltroPasaTodo(canal, J2534.P_ISO9141);
      foreach (byte dst in new byte[] { 0x33, 0x10 }) {
        P("  · destino 0x" + dst.ToString("x2"));
        bool ok = CincoBaudios(canal, dst);
        respuestasTotales += Pedir(canal, J2534.P_ISO9141, new byte[] { 0x68, 0x6A, 0xF1, 0x01, 0x00 }, "OBD modo 01 PID 00", 2000);
        respuestasTotales += Pedir(canal, J2534.P_ISO9141, new byte[] { 0x68, 0x6A, 0xF1, 0x03 }, "OBD modo 03 (códigos)", 2000);
        if (ok) P("    (el init sí entró: lo de arriba vale como diálogo real)");
      }
      J2534.Disconnect(canal);
    }

    J2534.Close(dev);

    P("");
    P("═══════════════════════════════════════════════════════════════════");
    P(" RESULTADO: " + respuestasTotales + " respuesta(s) del vehículo");
    P("═══════════════════════════════════════════════════════════════════");
    if (respuestasTotales > 0) {
      P(" El USB-Link SÍ llega al pin 7. El veredicto anterior (sección 6 del");
      P(" doc del Montero) era del camino RP1210, no del hardware.");
    } else {
      P(" Sin respuesta por J2534 tampoco. Lo que decide ahora es qué pasó");
      P(" ARRIBA, no este total:");
      P("   · ¿Leyó el voltaje de batería? Entonces el adaptador está vivo en");
      P("     el conector y el problema es específico de K-line → queda");
      P("     confirmado por dos APIs independientes.");
      P("   · ¿Algún init dio OK? Entonces hay transceptor y el problema es de");
      P("     direcciones o de tiempos, no de hardware.");
      P("   · ¿Ni voltaje ni init? Revisar cable y reenchufar el adaptador.");
      P(" Y en todos los casos: mirar el LED ámbar durante la prueba.");
    }
    P("");
    P("Copiá TODO lo de esta ventana; es la bitácora técnica del escaneo.");
  }
}
