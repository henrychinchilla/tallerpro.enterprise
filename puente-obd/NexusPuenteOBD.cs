/* NexusPro — Puente OBD USB
   Conecta un adaptador de diagnóstico RP1210 (NEXIQ USB-Link y compatibles) con el
   módulo Diagnóstico OBD-II de NexusPro, vía WebSocket en localhost puerto 17210.
   El puente es una tubería "tonta": toda la lógica de protocolos (J1939, ISO-TP,
   OBD-II) vive en la app web, que se actualiza sin recompilar esto.

   Compilar y ejecutar: iniciar-puente.bat
   IMPORTANTE: x86 obligatorio — la DLL RP1210 (NXULNK32.dll) es de 32 bits.
   ponytail: DLL fija NXULNK32; si algún día hay otro adaptador RP1210, leer
   APIImplementations de C:\Windows\RP121032.INI y cargarla dinámicamente. */
using System;
using System.Collections;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

public static class RP1210 {
  [DllImport("NXULNK32.dll", CharSet = CharSet.Ansi)]
  public static extern short RP1210_ClientConnect(int hwnd, short deviceId, string protocolo, int txBuf, int rxBuf, short packetize);
  [DllImport("NXULNK32.dll")] public static extern short RP1210_ClientDisconnect(short cliente);
  [DllImport("NXULNK32.dll")] public static extern short RP1210_SendCommand(short comando, short cliente, byte[] datos, short n);
  [DllImport("NXULNK32.dll")] public static extern short RP1210_SendMessage(short cliente, byte[] msg, short n, short notify, short block);
  [DllImport("NXULNK32.dll")] public static extern short RP1210_ReadMessage(short cliente, byte[] buf, short n, short block);
  [DllImport("NXULNK32.dll")] public static extern short RP1210_ReadVersion(byte[] dllMaj, byte[] dllMin, byte[] apiMaj, byte[] apiMin);
  [DllImport("NXULNK32.dll")] public static extern short RP1210_GetErrorMsg(short codigo, byte[] msg);

  public static string ErrorMsg(short codigo) {
    var b = new byte[120];
    try { RP1210_GetErrorMsg(codigo, b); } catch (Exception) { }
    var s = Encoding.ASCII.GetString(b).TrimEnd('\0').Trim();
    return s.Length > 0 ? s : ("Error RP1210 " + codigo);
  }
}

public class PuenteOBD {
  const int PUERTO = 17210;
  static readonly JavaScriptSerializer JSON = new JavaScriptSerializer();

  static void Log(string s) { Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + "  " + s); }
  static string Ascii(byte[] b) { return Encoding.ASCII.GetString(b).TrimEnd('\0').Trim(); }

  public static void Main() {
    Console.Title = "NexusPro - Puente OBD USB (RP1210)";
    try { Console.OutputEncoding = Encoding.UTF8; } catch (Exception) { }
    Log("NexusPro — Puente OBD USB · puerto " + PUERTO);
    Log("Adaptador: NEXIQ USB-Link (NXULNK32, RP1210)");
    Log("Deja esta ventana abierta mientras escaneas desde NexusPro.");

    try {
      var a = new byte[8]; var b = new byte[8]; var c = new byte[8]; var d = new byte[8];
      RP1210.RP1210_ReadVersion(a, b, c, d);
      Log("DLL RP1210 cargada OK — DLL v" + Ascii(a) + "." + Ascii(b) + " · API v" + Ascii(c) + "." + Ascii(d));
    } catch (DllNotFoundException) {
      Log("ERROR: no se encontro NXULNK32.dll. Instala los drivers del USB-Link y reintenta.");
      Console.ReadKey(); return;
    } catch (Exception ex) {
      Log("Aviso al leer version de la DLL: " + ex.Message);
    }

    var lst = new TcpListener(IPAddress.Loopback, PUERTO);
    try { lst.Start(); }
    catch (SocketException) {
      Log("ERROR: el puerto " + PUERTO + " ya esta en uso. ¿El puente ya esta corriendo en otra ventana?");
      Console.ReadKey(); return;
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
            case "estado": {
              resp["ok"] = true;
              resp["api"] = "NXULNK32";
              resp["dispositivo"] = "NEXIQ USB-Link";
              var a = new byte[8]; var b = new byte[8]; var c = new byte[8]; var d = new byte[8];
              try { RP1210.RP1210_ReadVersion(a, b, c, d); resp["version"] = Ascii(a) + "." + Ascii(b); } catch (Exception) { }
              break;
            }
            case "conectar": {
              if (cliente >= 0) { leyendo[0] = false; Thread.Sleep(50); RP1210.RP1210_ClientDisconnect(cliente); cliente = -1; }
              var proto = m.ContainsKey("protocolo") ? (string)m["protocolo"] : "J1939";
              short dev = m.ContainsKey("device") ? Convert.ToInt16(m["device"]) : (short)1;
              short r = RP1210.RP1210_ClientConnect(0, dev, proto, 0, 0, 0);
              if (r >= 0 && r < 128) {
                cliente = r;
                RP1210.RP1210_SendCommand(3, cliente, new byte[1], 0);   // 3 = todos los filtros a "pasar"
                resp["ok"] = true; resp["cliente"] = (int)r;
                Log("Cliente RP1210 abierto: " + proto + " (id " + r + ")");
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
              short r = RP1210.RP1210_SendMessage(cliente, datos, (short)datos.Length, 0, 0);
              resp["ok"] = r == 0;
              if (r != 0) { resp["codigo"] = (int)r; resp["error"] = RP1210.ErrorMsg(r); }
              break;
            }
            case "comando": {
              short num = Convert.ToInt16(m["numero"]);
              var datos = ABytes(m.ContainsKey("datos") ? m["datos"] : null);
              short r = RP1210.RP1210_SendCommand(num, cliente, datos.Length > 0 ? datos : new byte[1], (short)datos.Length);
              resp["ok"] = r == 0;
              if (r != 0) { resp["codigo"] = (int)r; resp["error"] = RP1210.ErrorMsg(r); }
              break;
            }
            case "desconectar": {
              leyendo[0] = false;
              if (cliente >= 0) { Thread.Sleep(50); RP1210.RP1210_ClientDisconnect(cliente); cliente = -1; Log("Cliente RP1210 cerrado"); }
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
      if (cliente >= 0) { try { RP1210.RP1210_ClientDisconnect(cliente); } catch (Exception) { } }
      try { tcp.Close(); } catch (Exception) { }
      Log("NexusPro desconectado");
    }
  }

  /* Bombea mensajes del bus del vehículo hacia la app en cuanto llegan */
  static void Bombear(short cliente, bool[] activo, bool[] leyendo, Action<Dictionary<string, object>> enviar) {
    var buf = new byte[2048];
    short ultimoError = 0;
    while (activo[0] && leyendo[0]) {
      short r;
      try { r = RP1210.RP1210_ReadMessage(cliente, buf, (short)buf.Length, 0); }
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
