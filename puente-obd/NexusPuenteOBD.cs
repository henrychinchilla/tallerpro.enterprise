/* NexusPro — Puente OBD USB
   Conecta un adaptador de diagnóstico RP1210 (NEXIQ USB-Link y compatibles) con el
   módulo Diagnóstico OBD-II de NexusPro, vía WebSocket en localhost puerto 17210.
   El puente es una tubería "tonta": toda la lógica de protocolos (J1939, ISO-TP,
   OBD-II) vive en la app web, que se actualiza sin recompilar esto.

   Compilar y ejecutar: iniciar-puente.bat
   IMPORTANTE: x86 obligatorio — las DLL RP1210 son de 32 bits.

   La API RP1210 se carga en caliente (LoadLibrary + GetProcAddress), así que el
   puente puede usar CUALQUIERA de los adaptadores registrados en
   C:\Windows\RP121032.INI y cambiar entre ellos sin reiniciarse:
     · 'apis'    — enumera los instalados (marca cuál está cargado)
     · 'cargar'  — {api:"DGDPA5MA"} elige con cuál hablar
     · 'conectar'— acepta {api:"..."} para elegir y conectar de una vez
   Al arrancar intenta NXULNK32 (NEXIQ, el más común), pero que falte ya no es
   fatal: la app puede pedir otro. */
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

/* ── API RP1210 cargada en caliente ────────────────────────────────────────
   Antes la DLL estaba fija en NXULNK32 con DllImport, así que el puente solo
   hablaba con el NEXIQ aunque la PC tuviera otros adaptadores registrados
   (DPA5, VXDIAG, el simulador de Cummins…). Con LoadLibrary + GetProcAddress
   se puede usar cualquiera de las que enumera RP121032.INI, y cambiar de una a
   otra sin reiniciar el puente.

   Las funciones RP1210 son __stdcall: los delegados DEBEN declararlo. Con la
   convención equivocada la pila queda corrupta al volver de cada llamada y el
   proceso se cae de formas difíciles de leer. */
public static class RP1210 {
  [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
  static extern IntPtr LoadLibrary(string archivo);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool FreeLibrary(IntPtr modulo);
  [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
  static extern IntPtr GetProcAddress(IntPtr modulo, string nombre);

  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public delegate short DConnect(int hwnd, short deviceId, string protocolo, int txBuf, int rxBuf, short packetize);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate short DDisconnect(short cliente);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate short DSendCommand(short comando, short cliente, byte[] datos, short n);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate short DSendMessage(short cliente, byte[] msg, short n, short notify, short block);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate short DReadMessage(short cliente, byte[] buf, short n, short block);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate short DReadVersion(byte[] dllMaj, byte[] dllMin, byte[] apiMaj, byte[] apiMin);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  public delegate short DGetErrorMsg(short codigo, byte[] msg);

  static IntPtr _mod = IntPtr.Zero;
  public static string Api;                 // cuál está cargada ahora mismo

  public static DConnect ClientConnect;
  public static DDisconnect ClientDisconnect;
  public static DSendCommand SendCommand;
  public static DSendMessage SendMessage;
  public static DReadMessage ReadMessage;
  static DReadVersion _readVersion;
  static DGetErrorMsg _getErrorMsg;

  public static bool Listo { get { return _mod != IntPtr.Zero && ClientConnect != null; } }

  static Delegate Fn(IntPtr mod, string nombre, Type tipo) {
    var p = GetProcAddress(mod, nombre);
    if (p == IntPtr.Zero) return null;
    return Marshal.GetDelegateForFunctionPointer(p, tipo);
  }

  public static bool Cargar(string api, out string error) {
    error = null;
    if (string.IsNullOrEmpty(api)) { error = "No se indicó qué adaptador cargar."; return false; }
    if (_mod != IntPtr.Zero && string.Equals(api, Api, StringComparison.OrdinalIgnoreCase)) return true;

    var dll = api.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) ? api : api + ".dll";
    var mod = LoadLibrary(dll);
    if (mod == IntPtr.Zero) {
      error = "No se pudo cargar " + dll + " (error " + Marshal.GetLastWin32Error() +
              "). Probablemente faltan los drivers de ese adaptador.";
      return false;
    }
    var cc = (DConnect)Fn(mod, "RP1210_ClientConnect", typeof(DConnect));
    var cd = (DDisconnect)Fn(mod, "RP1210_ClientDisconnect", typeof(DDisconnect));
    var sc = (DSendCommand)Fn(mod, "RP1210_SendCommand", typeof(DSendCommand));
    var sm = (DSendMessage)Fn(mod, "RP1210_SendMessage", typeof(DSendMessage));
    var rm = (DReadMessage)Fn(mod, "RP1210_ReadMessage", typeof(DReadMessage));
    if (cc == null || cd == null || sc == null || sm == null || rm == null) {
      FreeLibrary(mod);
      error = dll + " se cargó pero no exporta las funciones RP1210 esperadas.";
      return false;
    }
    /* La anterior se suelta recién acá: si la nueva fallaba, se sigue con la que
       ya venía funcionando en vez de quedarse sin ninguna. */
    if (_mod != IntPtr.Zero) { try { FreeLibrary(_mod); } catch (Exception) { } }
    _mod = mod;
    Api = api;
    ClientConnect = cc; ClientDisconnect = cd; SendCommand = sc; SendMessage = sm; ReadMessage = rm;
    _readVersion = (DReadVersion)Fn(mod, "RP1210_ReadVersion", typeof(DReadVersion));
    _getErrorMsg = (DGetErrorMsg)Fn(mod, "RP1210_GetErrorMsg", typeof(DGetErrorMsg));
    return true;
  }

  static string Txt(byte[] b) { return Encoding.ASCII.GetString(b).TrimEnd('\0').Trim(); }

  /* "1.0 · API 2.0", o null si la DLL no expone ReadVersion */
  public static string Version() {
    if (_readVersion == null) return null;
    var a = new byte[17]; var b = new byte[17]; var c = new byte[17]; var d = new byte[17];
    try { _readVersion(a, b, c, d); } catch (Exception) { return null; }
    var dll = Txt(a) + "." + Txt(b);
    return dll.Length > 1 ? dll : null;
  }

  public static string ErrorMsg(short codigo) {
    var b = new byte[120];
    if (_getErrorMsg != null) { try { _getErrorMsg(codigo, b); } catch (Exception) { } }
    var s = Txt(b);
    return s.Length > 0 ? s : ("Error RP1210 " + codigo);
  }
}

public class PuenteOBD {
  const int PUERTO = 17210;
  static readonly JavaScriptSerializer JSON = new JavaScriptSerializer();

  static void Log(string s) { Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + "  " + s); }

  const string API_DEFECTO = "NXULNK32";     // NEXIQ USB-Link, el más común en taller

  public static void Main() {
    Console.Title = "NexusPro - Puente OBD USB (RP1210)";
    try { Console.OutputEncoding = Encoding.UTF8; } catch (Exception) { }
    Log("NexusPro — Puente OBD USB · puerto " + PUERTO);
    Log("Deja esta ventana abierta mientras escaneas desde NexusPro.");

    /* Se intenta la de siempre, pero ya no es fatal que falte: la app puede
       pedir otra de las instaladas con la operación 'cargar'. Antes, sin el
       NEXIQ, el puente se cerraba y no había forma de usar otro adaptador. */
    string err;
    if (RP1210.Cargar(API_DEFECTO, out err)) {
      var v = RP1210.Version();
      Log("Adaptador: " + API_DEFECTO + (v != null ? " · DLL v" + v : "") + " ✓");
    } else {
      Log("No se pudo cargar " + API_DEFECTO + ": " + err);
    }

    var otras = ApisInstaladas();
    if (otras.Count > 0) {
      var nombres = new List<string>();
      foreach (var o in otras) {
        var d = (Dictionary<string, object>)o;
        if ((bool)d["instalado"]) nombres.Add((string)d["api"]);
      }
      Log("Adaptadores RP1210 en esta PC: " + (nombres.Count > 0 ? string.Join(", ", nombres.ToArray()) : "ninguno"));
    }
    if (!RP1210.Listo) Log("Ninguno cargado todavía — NexusPro puede elegir uno al escanear.");

    var lst = new TcpListener(IPAddress.Loopback, PUERTO);
    try { lst.Start(); }
    catch (SocketException) {
      /* Ya hay un puente corriendo (p. ej. el del arranque automatico): salir sin duplicar */
      Log("El puente ya esta corriendo en esta PC — no se necesita otra instancia.");
      Thread.Sleep(4000); return;
    }
    Log("Esperando conexion de NexusPro (Chrome/Edge en esta PC)...");
    while (true) {
      var tcp = lst.AcceptTcpClient();
      new Thread(() => Atender(tcp)) { IsBackground = true }.Start();
    }
  }

  static void Atender(TcpClient tcp) {
    short cliente = -1;
    bool[] activo = { true };
    bool[] leyendo = { false };
    object candado = new object();
    NetworkStream ns = null;
    try {
      ns = tcp.GetStream();
      if (!Handshake(ns)) { tcp.Close(); return; }
      Log("NexusPro conectado ✓");
      Action<Dictionary<string, object>> enviar = obj => {
        lock (candado) { EnviarTexto(ns, JSON.Serialize(obj)); }
      };

      while (activo[0]) {
        string txt = LeerTexto(ns, candado);
        if (txt == null) break;
        Dictionary<string, object> m;
        try { m = JSON.Deserialize<Dictionary<string, object>>(txt); } catch (Exception) { continue; }
        if (m == null || !m.ContainsKey("op")) continue;
        var op = (string)m["op"];
        var resp = new Dictionary<string, object>();
        resp["op"] = op;
        try {
          switch (op) {
            case "apis": {
              resp["ok"] = true;
              resp["apis"] = ApisInstaladas();
              break;
            }
            case "estado": {
              resp["ok"] = RP1210.Listo;
              resp["api"] = RP1210.Api;
              resp["dispositivo"] = NombreApi(RP1210.Api);
              var v = RP1210.Version();
              if (v != null) resp["version"] = v;
              if (!RP1210.Listo) resp["error"] = "Ningún adaptador RP1210 cargado.";
              break;
            }
            /* Elegir con qué adaptador hablar, entre los que enumera 'apis'.
               Sirve para el DPA5, el VXDIAG y el simulador de Cummins, que
               antes eran inalcanzables por tener la DLL fija. */
            case "cargar": {
              var api = m.ContainsKey("api") ? (string)m["api"] : null;
              if (cliente >= 0) { leyendo[0] = false; Thread.Sleep(50); RP1210.ClientDisconnect(cliente); cliente = -1; }
              string e2;
              if (RP1210.Cargar(api, out e2)) {
                resp["ok"] = true; resp["api"] = RP1210.Api;
                resp["dispositivo"] = NombreApi(RP1210.Api);
                var v = RP1210.Version(); if (v != null) resp["version"] = v;
                Log("Adaptador cargado: " + RP1210.Api);
              } else {
                resp["ok"] = false; resp["error"] = e2;
                Log("No se pudo cargar " + api + ": " + e2);
              }
              break;
            }
            case "conectar": {
              if (cliente >= 0) { leyendo[0] = false; Thread.Sleep(50); RP1210.ClientDisconnect(cliente); cliente = -1; }
              /* Permite cambiar de adaptador en la misma llamada */
              if (m.ContainsKey("api") && m["api"] != null) {
                string e3;
                if (!RP1210.Cargar((string)m["api"], out e3)) {
                  resp["ok"] = false; resp["error"] = e3;
                  break;
                }
              }
              if (!RP1210.Listo) {
                resp["ok"] = false;
                resp["error"] = "No hay ningún adaptador RP1210 cargado. Instalá los drivers, o elegí otro con la operación 'cargar'.";
                break;
              }
              var proto = m.ContainsKey("protocolo") ? (string)m["protocolo"] : "J1939";
              short dev = m.ContainsKey("device") ? Convert.ToInt16(m["device"]) : (short)1;
              short r = RP1210.ClientConnect(0, dev, proto, 0, 0, 0);
              if (r >= 0 && r < 128) {
                cliente = r;
                RP1210.SendCommand(3, cliente, new byte[1], 0);   // 3 = todos los filtros a "pasar"
                resp["ok"] = true; resp["cliente"] = (int)r; resp["api"] = RP1210.Api;
                Log("Cliente RP1210 abierto: " + proto + " en " + RP1210.Api + " (id " + r + ")");
                leyendo[0] = true;
                short cl = cliente;
                new Thread(() => Bombear(cl, activo, leyendo, enviar)) { IsBackground = true }.Start();
              } else {
                resp["ok"] = false; resp["codigo"] = (int)r; resp["error"] = RP1210.ErrorMsg(r);
                Log("ClientConnect(" + proto + ") fallo: " + resp["error"]);
              }
              break;
            }
            case "enviar": {
              var datos = ABytes(m.ContainsKey("datos") ? m["datos"] : null);
              short r = RP1210.SendMessage(cliente, datos, (short)datos.Length, 0, 0);
              resp["ok"] = r == 0;
              if (r != 0) { resp["codigo"] = (int)r; resp["error"] = RP1210.ErrorMsg(r); }
              break;
            }
            case "comando": {
              short num = Convert.ToInt16(m["numero"]);
              var datos = ABytes(m.ContainsKey("datos") ? m["datos"] : null);
              short r = RP1210.SendCommand(num, cliente, datos.Length > 0 ? datos : new byte[1], (short)datos.Length);
              resp["ok"] = r == 0;
              if (r != 0) { resp["codigo"] = (int)r; resp["error"] = RP1210.ErrorMsg(r); }
              break;
            }
            case "desconectar": {
              leyendo[0] = false;
              if (cliente >= 0) { Thread.Sleep(50); RP1210.ClientDisconnect(cliente); cliente = -1; Log("Cliente RP1210 cerrado"); }
              resp["ok"] = true;
              break;
            }
            default: resp["ok"] = false; resp["error"] = "Operacion desconocida: " + op; break;
          }
        } catch (Exception ex) { resp["ok"] = false; resp["error"] = ex.Message; }
        enviar(resp);
      }
    } catch (Exception) { }
    finally {
      activo[0] = false; leyendo[0] = false;
      if (cliente >= 0) { try { RP1210.ClientDisconnect(cliente); } catch (Exception) { } }
      try { tcp.Close(); } catch (Exception) { }
      Log("NexusPro desconectado");
    }
  }

  /* ── Adaptadores RP1210 instalados en esta PC ──────────────────────────────
     Cada software de fábrica (Cummins, CAT, Navistar, Detroit, Allison, Isuzu…)
     registra su propio adaptador RP1210. Enumerarlos dice con qué hardware
     PODRÍA hablar NexusPro en un taller que ya tiene esos programas.
     Sólo lee archivos .INI: no carga ninguna DLL, así que no puede afectar la
     conexión en curso. */
  static string LeerClave(string archivo, string clave) {
    try {
      foreach (var linea in File.ReadAllLines(archivo)) {
        var l = linea.Trim();
        int i = l.IndexOf('=');
        if (i > 0 && l.Substring(0, i).Trim().Equals(clave, StringComparison.OrdinalIgnoreCase))
          return l.Substring(i + 1).Trim();
      }
    } catch (Exception) { }
    return null;
  }

  static List<string> TodasLasClaves(string archivo, string clave) {
    var res = new List<string>();
    try {
      foreach (var linea in File.ReadAllLines(archivo)) {
        var l = linea.Trim();
        int i = l.IndexOf('=');
        if (i > 0 && l.Substring(0, i).Trim().Equals(clave, StringComparison.OrdinalIgnoreCase)) {
          var v = l.Substring(i + 1).Trim();
          if (v.Length > 0 && !res.Contains(v)) res.Add(v);
        }
      }
    } catch (Exception) { }
    return res;
  }

  /* Nombre legible del adaptador, leído de su propio .INI */
  static string NombreApi(string api) {
    if (string.IsNullOrEmpty(api)) return null;
    try {
      var ini = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), api + ".INI");
      var n = LeerClave(ini, "Name");
      if (!string.IsNullOrEmpty(n)) return n;
    } catch (Exception) { }
    return api;
  }

  static List<object> ApisInstaladas() {
    var lista = new List<object>();
    try {
      var win = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
      var impl = LeerClave(Path.Combine(win, "RP121032.INI"), "APIImplementations");
      if (impl == null) return lista;
      foreach (var bruto in impl.Split(',')) {
        var api = bruto.Trim();
        if (api.Length == 0) continue;
        var ini = Path.Combine(win, api + ".INI");
        var d = new Dictionary<string, object>();
        d["api"] = api;
        d["instalado"] = File.Exists(ini);
        d["cargada"] = string.Equals(api, RP1210.Api, StringComparison.OrdinalIgnoreCase);
        if (File.Exists(ini)) {
          d["nombre"] = LeerClave(ini, "Name") ?? api;
          d["protocolos"] = TodasLasClaves(ini, "ProtocolString");
          d["dispositivos"] = TodasLasClaves(ini, "DeviceDescription");
        }
        lista.Add(d);
      }
    } catch (Exception) { }
    return lista;
  }

  /* Bombea mensajes del bus del vehículo hacia la app en cuanto llegan */
  static void Bombear(short cliente, bool[] activo, bool[] leyendo, Action<Dictionary<string, object>> enviar) {
    var buf = new byte[2048];
    short ultimoError = 0;
    while (activo[0] && leyendo[0]) {
      short r;
      try { r = RP1210.ReadMessage(cliente, buf, (short)buf.Length, 0); }
      catch (Exception) { break; }
      if (r > 0) {
        var arr = new int[r];
        for (int i = 0; i < r; i++) arr[i] = buf[i];
        var msg = new Dictionary<string, object>(); msg["op"] = "mensaje"; msg["datos"] = arr;
        try { enviar(msg); } catch (Exception) { break; }
        ultimoError = 0;
      } else if (r == 0) {
        Thread.Sleep(15);
      } else {
        short cod = (short)(-r);
        if (cod != ultimoError) {
          ultimoError = cod;
          var e = new Dictionary<string, object>(); e["op"] = "error"; e["codigo"] = (int)cod; e["error"] = RP1210.ErrorMsg(cod);
          try { enviar(e); } catch (Exception) { break; }
        }
        Thread.Sleep(150);
      }
    }
  }

  static byte[] ABytes(object o) {
    var lista = o as IList;
    if (lista == null) return new byte[0];
    var b = new byte[lista.Count];
    for (int i = 0; i < lista.Count; i++) b[i] = Convert.ToByte(lista[i]);
    return b;
  }

  /* ── WebSocket mínimo (RFC 6455, frames de texto) sobre TcpListener.
       Se evita HttpListener a propósito: exige permisos de administrador
       para reservar la URL; TcpListener en loopback no. ── */
  static bool Handshake(NetworkStream ns) {
    var sb = new StringBuilder();
    var b1 = new byte[1];
    while (!(sb.Length > 3 && sb.ToString(sb.Length - 4, 4) == "\r\n\r\n")) {
      int n = ns.Read(b1, 0, 1);
      if (n <= 0 || sb.Length > 8192) return false;
      sb.Append((char)b1[0]);
    }
    var req = sb.ToString();
    var clave = Cab(req, "Sec-WebSocket-Key");
    if (clave == null) return false;
    var origen = Cab(req, "Origin");
    /* Solo NexusPro (o pruebas locales) puede usar el puente — ninguna otra web */
    if (origen != null && origen.IndexOf("nexuspro.cmtelecommgt.com") < 0 &&
        origen.IndexOf("localhost") < 0 && origen.IndexOf("127.0.0.1") < 0) {
      Log("Conexion RECHAZADA de origen no autorizado: " + origen);
      return false;
    }
    string acepta;
    using (var sha = SHA1.Create())
      acepta = Convert.ToBase64String(sha.ComputeHash(Encoding.ASCII.GetBytes(clave + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
    var resp = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + acepta + "\r\n\r\n";
    var rb = Encoding.ASCII.GetBytes(resp);
    ns.Write(rb, 0, rb.Length);
    return true;
  }

  static string Cab(string req, string nombre) {
    foreach (var l in req.Split('\n')) {
      var t = l.Trim();
      if (t.StartsWith(nombre + ":", StringComparison.OrdinalIgnoreCase))
        return t.Substring(nombre.Length + 1).Trim();
    }
    return null;
  }

  static byte[] LeerExacto(NetworkStream ns, int n) {
    var b = new byte[n]; int off = 0;
    while (off < n) {
      int r = ns.Read(b, off, n - off);
      if (r <= 0) return null;
      off += r;
    }
    return b;
  }

  static string LeerTexto(NetworkStream ns, object candado) {
    while (true) {
      var cab = LeerExacto(ns, 2);
      if (cab == null) return null;
      int opcode = cab[0] & 0x0F;
      bool mask = (cab[1] & 0x80) != 0;
      long len = cab[1] & 0x7F;
      if (len == 126) { var e = LeerExacto(ns, 2); if (e == null) return null; len = (e[0] << 8) | e[1]; }
      else if (len == 127) { var e = LeerExacto(ns, 8); if (e == null) return null; len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | e[i]; }
      if (len > 1048576) return null;
      var llave = mask ? LeerExacto(ns, 4) : null;
      if (mask && llave == null) return null;
      var datos = len > 0 ? LeerExacto(ns, (int)len) : new byte[0];
      if (datos == null) return null;
      if (llave != null) for (int i = 0; i < datos.Length; i++) datos[i] ^= llave[i % 4];
      if (opcode == 8) return null;                                        // close
      if (opcode == 9) { lock (candado) { EnviarFrame(ns, 0x8A, datos); } continue; }  // ping → pong
      if (opcode == 1) return Encoding.UTF8.GetString(datos);
      /* binario/continuación: no se usan — ignorar */
    }
  }

  static void EnviarTexto(NetworkStream ns, string s) {
    EnviarFrame(ns, 0x81, Encoding.UTF8.GetBytes(s));
  }

  static void EnviarFrame(NetworkStream ns, byte tipo, byte[] datos) {
    var ms = new System.IO.MemoryStream();
    ms.WriteByte(tipo);
    if (datos.Length < 126) ms.WriteByte((byte)datos.Length);
    else if (datos.Length < 65536) { ms.WriteByte(126); ms.WriteByte((byte)(datos.Length >> 8)); ms.WriteByte((byte)(datos.Length & 0xFF)); }
    else { ms.WriteByte(127); for (int i = 7; i >= 0; i--) ms.WriteByte((byte)(((long)datos.Length >> (8 * i)) & 0xFF)); }
    ms.Write(datos, 0, datos.Length);
    var arr = ms.ToArray();
    ns.Write(arr, 0, arr.Length);
  }
}
