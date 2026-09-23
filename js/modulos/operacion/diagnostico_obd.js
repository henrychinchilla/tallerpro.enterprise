/* NexusPro — Diagnóstico OBD-II
   · Bluetooth LE: adaptadores ELM327/Vgate/OBDLink/STN1110 (comandos AT + PIDs OBD-II).
     Solo BLE (Web Bluetooth no alcanza Bluetooth Classic ni WiFi).
   · USB (puente RP1210): adaptadores NEXIQ USB-Link y compatibles vía el puente
     local (carpeta puente-obd) — camiones J1939 (SPN/FMI) y livianos OBD-II sobre CAN.

   EL MÓDULO ESTÁ EN PARTES (2026-09-22: el archivo único pasaba de 9.000 líneas).
   Este archivo es el NÚCLEO: define Modulos.diagnostico_obd con el estado y la
   conexión (BLE, COM, USB, puente de la app, latido). Cada parte le agrega sus
   métodos, y se cargan en este orden (index.html, sw.js y test/obd/harness.js):
     diagnostico_obd_lecturas.js  VIN, DTC OBD-II, readiness, comparación, NHTSA, campañas
     diagnostico_obd_uds.js       UDS/ISO-TP, identidad de módulos, direcciones, barrido, K-line
     diagnostico_obd_barrido.js   escaneo por módulo, mapa, nombres, libreta, IA que bautiza
     diagnostico_obd_camiones.js  J1939 y J1587
     diagnostico_obd_catalogo.js  descripciones DTC (_DTCS), guías, bitácora
     diagnostico_obd_escaneo.js   pantalla, escanear(), resultado, informe de Nexus
     diagnostico_obd_monitor.js   datos en vivo, relojes, grabación
     diagnostico_obd_acciones.js  borrado, reset, guardar, ver/editar/eliminar/imprimir
   Después vienen diagnostico_oem.js, diagnostico_modulos.js (Centro de Módulos)
   y diagnostico_tablero.js (tablero en vivo), que también extienden el objeto. */
Modulos.diagnostico_obd = {
  _data: [], _vehiculos: [],
  _mes: null, _anio: null,

  /* ═══════════ DRIVER BLE / ELM327 ═══════════ */
  _dev: null, _char: null, _buf: '', _resolve: null, _serialReady: false,
  /* Puerto COM abierto directo por Web Serial (Chrome/Edge de PC, sin puente).
     Es el MISMO dongle y el MISMO diálogo AT que por el puente: acá sólo cambia
     por dónde entran y salen los bytes. */
  _webSerialPort: null, _webSerialReader: null, _webSerialWriter: null,
  _bleIdentity: null,
  _protoNum: 0, _liveTimer: null, _busy: false,
  /* Callback activo mientras el adaptador esta en monitoreo continuo (ATMA).
     Ver _monInicio: ahi el ELM no manda prompt y hay que leer por linea. */
  _monLinea: null,

  /* Pares servicio/característica conocidos de adaptadores OBD BLE */
  /* Servicios BLE que se piden permiso para inspeccionar. No hace falta conocer
     el par escritura/notificación de cada uno: alcanza con poder VERLO para que
     la autodetección encuentre la característica que notifica y la que escribe. */
  _SVC_CANDIDATOS: [
    '0000fff0-0000-1000-8000-00805f9b34fb',   // Vgate iCar Pro y muchos genéricos
    '0000ffe0-0000-1000-8000-00805f9b34fb',   // módulos tipo HM-10 / JDY
    '0000ffe5-0000-1000-8000-00805f9b34fb',   // variante de escritura del anterior
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',   // LELink
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',   // Nordic UART, usado por varios puentes serie BLE
    '0000180a-0000-1000-8000-00805f9b34fb',   // Device Information (identidad del VCI)
    '00001101-0000-1000-8000-00805f9b34fb',   // SPP Serial Port UUID
    '000018f0-0000-1000-8000-00805f9b34fb',   // OBDLink / STN BLE
    '0000abf0-0000-1000-8000-00805f9b34fb',   // Viecar / Veepeak BLE
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',   // Microchip Transparent UART
  ],

  _UUIDS: [
    { svc:'0000fff0-0000-1000-8000-00805f9b34fb', wr:'0000fff2-0000-1000-8000-00805f9b34fb', nt:'0000fff1-0000-1000-8000-00805f9b34fb' },
    { svc:'0000ffe0-0000-1000-8000-00805f9b34fb', wr:'0000ffe1-0000-1000-8000-00805f9b34fb', nt:'0000ffe1-0000-1000-8000-00805f9b34fb' },
    { svc:'e7810a71-73ae-499d-8c15-faa9aef0c3f2', wr:'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', nt:'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
    { svc:'0000fff0-0000-1000-8000-00805f9b34fb', wr:'0000fff1-0000-1000-8000-00805f9b34fb', nt:'0000fff1-0000-1000-8000-00805f9b34fb' },
  ],

  /* Todo lo que llega del dongle entra por acá, venga de una notificación BLE
     del navegador o del puente nativo de la app Android. Es un solo lugar a
     propósito: cuando esto estaba escrito adentro del listener de Web
     Bluetooth, cualquier transporte nuevo tenía que copiarlo — y una copia de
     esta lógica que se desincronice no falla, contesta MAL. */
  _recibir(texto) {
    this._buf += texto;
    /* Monitoreo continuo: el ELM327 NO manda '>' hasta que se lo detiene, asi
       que esperar el prompt seria esperar para siempre. Mientras dura, cada
       linea completa se entrega apenas llega. El try/catch es para que una
       trama con basura no mate el listener y con el las que vienen atras. */
    if (this._monLinea) {
      let i;
      while ((i = this._buf.search(/[\r\n]/)) >= 0) {
        const l = this._buf.slice(0, i).trim();
        this._buf = this._buf.slice(i + 1);
        if (l) { try { this._monLinea(l); } catch (_) {} }
      }
    }
    if (this._buf.includes('>') && this._resolve) {
      const r = this._resolve; this._resolve = null;
      r(this._buf.replace(/>/g, '').trim());
    }
  },

  /* ═══════════ PUENTE NATIVO (app Android) ═══════════
     La app deja de ser una TWA justamente por esto: renderizando con Chrome
     solo hay Web Bluetooth, que es BLE, y la mayoria de los dongles OBD
     hablan Bluetooth CLASICO (SPP). Verificado contra un Vgate vLinker MS en
     modo MFi: publica iAP + SPP y cero BLE, asi que ningun navegador lo ve.
     El puente expone las DOS radios y entrega los bytes crudos: la logica de
     protocolo no se movio de aqui, y se sigue actualizando con deploy. */
  _bt: null, _btEsperando: null, _btEnganchado: false, _escanerElegido: null,

  get _nativo() { return typeof window !== 'undefined' && !!window.NexusBT; },

  /* La pregunta util NO es "¿el navegador tiene Web Bluetooth?" sino "¿hay
     alguna radio alcanzable?". Adentro de la app la primera da NO —la WebView
     no implementa Web Bluetooth— y sin embargo es el unico lugar donde estan
     LAS DOS radios. Preguntar lo que no era mostraba "este navegador no
     soporta Bluetooth, usa la app NexusPro" a alguien que YA estaba en la app. */
  get _hayBluetooth() {
    return this._nativo || (typeof navigator !== 'undefined' && !!navigator.bluetooth);
  },

  /* Se engancha una sola vez; el puente llama a estas funciones por nombre. */
  _engancharNativo() {
    if (this._btEnganchado || !this._nativo) return;
    this._btEnganchado = true;
    window.NexusBT_rx = t => this._recibir(String(t || ''));
    window.NexusBT_lista = json => {
      const cb = this._btEsperando; this._btEsperando = null;
      if (cb) { try { cb.res(JSON.parse(json)); } catch (_) { cb.res([]); } }
    };
    window.NexusBT_evt = json => {
      let e = {}; try { e = JSON.parse(json); } catch (_) {}
      if (e.evento === 'conectado') { this._bt = { nombre: e.detalle || 'Escáner' }; }
      if (e.evento === 'cerrado' || e.evento === 'error') { this._bt = null; this._stopLive(); }
      const cb = this._btEsperando;
      if (!cb) return;
      if (cb.tipo === 'conectar') {
        this._btEsperando = null;
        if (e.evento === 'conectado') cb.res(e.detalle || 'Escáner');
        else cb.rej(new Error(e.detalle || 'No se pudo conectar.'));
      } else if (e.evento === 'error') {
        /* Un error mientras se esperaba la LISTA no lo miraba nadie: la espera
           moria a los 20 s con "el puente no contesto a tiempo" y tapaba el
           motivo real —permiso negado, radio apagada— que el puente SI habia
           mandado. El unico caso en que el puente calla es el que ya no existe. */
        this._btEsperando = null;
        cb.rej(new Error(e.detalle || 'El puente Bluetooth de la app falló.'));
      }
    };
  },

  /* El puente es asincrono y contesta por evento, no por retorno: cada espera
     se resuelve cuando llega NexusBT_lista o NexusBT_evt. */
  _btPedir(tipo, accion, timeout = 20000) {
    this._engancharNativo();
    return new Promise((res, rej) => {
      this._btEsperando = { tipo, res, rej };
      setTimeout(() => {
        if (this._btEsperando && this._btEsperando.res === res) {
          this._btEsperando = null;
          rej(new Error('El puente Bluetooth de la app no contestó a tiempo.'));
        }
      }, timeout);
      try { accion(); } catch (e) { this._btEsperando = null; rej(e); }
    });
  },

  get _conectado() {
    if (this._via === 'android') return !!this._bt;
    /* Por COM hay DOS tuberías posibles hacia el mismo dongle: el puerto que
       Web Serial abre directo en Chrome/Edge de PC, o el puente local. Exigir
       `_ws` para las dos daba SIEMPRE "desconectado" cuando se entraba por Web
       Serial —que no usa puente— aunque el escáner estuviera contestando: el
       escaneo terminaba bien y de ahí en adelante todo decía que no había nada
       conectado (sensores en vivo, módulo puntual, el chip de la barra), y la
       reconexión automática se iba a Web Bluetooth, que a este dongle no lo ve. */
    if (this._via === 'serial')
      return this._serialReady && (!!this._webSerialPort || this._ws?.readyState === 1);
    return !!(this._dev?.gatt?.connected && this._char);
  },
  /* "listo para leer" según la vía activa (BLE, puente de la app, COM o USB) */
  get _listo() {
    if (this._via === 'ble' || this._via === 'android' || this._via === 'serial') return this._conectado;
    if (!this._ws || this._ws.readyState !== 1) return false;
    /* Tener el puente WebSocket abierto solo significa que Windows está
       disponible; para leer el vehículo también debe existir un canal RP1210
       CAN/J1939/J1708 abierto. */
    return !!this._puenteCanalActivo;
  },

  /* ¿Del otro lado hay un ELM327 al que se le habla en TEXTO?
     Son tres transportes distintos —BLE del navegador, puente de la app,
     Bluetooth clásico por COM— con EL MISMO dongle y el mismo diálogo AT.
     Preguntar `_via === 'ble'` era preguntar por el transporte cuando lo que
     importaba era el dongle: por eso el escaneo por módulo, el mapa de acceso
     y todo el UDS punto a punto existían sólo por BLE, y un escaneo por
     Bluetooth clásico —el del vLinker en modo MFi, que es el caso real de
     taller— caía al camino de CAN crudo, que necesita el puente RP1210 y por
     Bluetooth no existe: no fallaba, contestaba nada. */
  _esELM() {
    return this._via === 'ble' || this._via === 'android' || this._via === 'serial';
  },

  /* Dongles que ABREN el Bluetooth pero NO hablan ELM327. El Thinkdiag /
     Thinkcar —y en general los de Launch: X431, DBSCar, golo— usan el protocolo
     propietario de su marca, atado a su propia app y a su servidor. El enlace
     abre igual (el dongle hasta cambia de color) y después no contesta ni ATI ni
     ATZ, porque no entiende el idioma, no porque esté mal conectado.

     Verificado el 2026-09-20 con un Thinkdiag TKD01: el puente conectó, el
     dongle cambió de color y la sonda se quedó muda.

     Esto NO bloquea nada —se puede elegir igual, por si una versión de firmware
     lo permite—: lo que hace es decirlo ANTES. El mensaje genérico mandaba a
     buscar un error que no existe ("habrás elegido los audífonos"), y eso es
     peor que no ofrecerlo. */
  _esDongleCerrado(nombre) {
    return /think(diag|car|tool)|launch|x-?431|dbscar|golo/i.test(String(nombre || ''));
  },

  /* La identidad Device Information es lectura pasiva. Muchos VCI no
     publican un canal OBD por GATT, pero sí dejan ver modelo/firmware en 180A.
     Guardarla permite distinguir "Bluetooth conectado" de "protocolo de datos
     disponible" sin mandar ninguna trama al vehículo. */
  async _leerIdentidadBLE(server) {
    const uuids = {
      '00002a24-0000-1000-8000-00805f9b34fb':'modelo',
      '00002a27-0000-1000-8000-00805f9b34fb':'hardware',
      '00002a28-0000-1000-8000-00805f9b34fb':'firmware',
      '00002a29-0000-1000-8000-00805f9b34fb':'fabricante'
    };
    const out = {};
    try {
      const s = await server.getPrimaryService('0000180a-0000-1000-8000-00805f9b34fb');
      for (const [uuid, clave] of Object.entries(uuids)) {
        try {
          const c = await s.getCharacteristic(uuid);
          if (!c.properties?.read) continue;
          const v = await c.readValue();
          const txt = new TextDecoder().decode(v).replace(/\0/g, '').trim();
          if (txt) out[clave] = txt;
        } catch (_) {}
      }
    } catch (_) {}
    this._bleIdentity = out;
    return out;
  },

  async _conectar() {
    if (!navigator.bluetooth)
      /* Adentro de la app esta via no existe —la WebView no trae Web Bluetooth—
         pero el puente si, y alcanza MAS aparatos que ella: mandar a "usa la app
         NexusPro" a quien ya esta en la app es el peor callejon sin salida. */
      throw new Error(this._nativo
        ? 'Adentro de la app esta vía no aplica: elegí <b>📲 Bluetooth de la app</b>, que llega a más escáneres (BLE y clásico).'
        : 'Este navegador no tiene Bluetooth. Usa Chrome/Edge en Android o en una PC con Bluetooth.');
    /* Web Bluetooth SÓLO deja ver los servicios declarados acá: getPrimaryServices()
       no devuelve nada fuera de esta lista. Por eso la autodetección de más abajo
       era letra muerta —no podía descubrir un servicio que no estuviera ya pedido—
       y un adaptador con UUID distinto fallaba aunque el código pareciera cubrirlo.
       La lista va ancha a propósito, aunque de varios no sepamos el par exacto de
       características: de eso se encarga la autodetección. */
    const svcs = [...new Set([...this._UUIDS.map(u => u.svc), ...this._SVC_CANDIDATOS])];
    /* El chooser de Chrome SOLO escucha anuncios BLE. Un dongle en modo
       MFi/iPhone o de Bluetooth clasico (SPP) no se anuncia por ahi y no
       aparece nunca en la lista, por bien emparejado que este en el sistema
       operativo: emparejar es del sistema, y esto no lo usa. Verificado con un
       Vgate vLinker MS, que en modo MFi publica iAP + SPP y cero BLE.
       Sin este aviso, el sintoma es "la lista sale vacia" y no hay pista de por que. */
    let dev;
    try {
      dev = await navigator.bluetooth.requestDevice({ acceptAllDevices:true, optionalServices:svcs });
    } catch (e) {
      if (e && e.name === 'NotFoundError')
        throw new Error('No se eligió ningún adaptador. Si el escáner NO aparecía en la lista: el navegador solo ve adaptadores en ' +
          '<b>modo BLE</b>. Uno en modo MFi/iPhone o de Bluetooth clásico (SPP) no se anuncia por BLE y no va a aparecer, ' +
          'aunque el sistema lo tenga emparejado. Pasalo a modo BLE con la app del fabricante' +
          (this._esMovil() ? '.' : ', o en esta PC usá la vía <b>Bluetooth clásico</b>, que sí habla SPP por puerto COM.'));
      throw e;
    }
    const server = await dev.gatt.connect();
    const identidad = await this._leerIdentidadBLE(server);

    let wr = null, nt = null;
    for (const u of this._UUIDS) {
      try {
        const s = await server.getPrimaryService(u.svc);
        wr = await s.getCharacteristic(u.wr);
        nt = (u.nt === u.wr) ? wr : await s.getCharacteristic(u.nt);
        break;
      } catch (_) { wr = nt = null; }
    }
    /* Autodetección: cualquier servicio con una característica notify + una write */
    if (!wr) {
      try {
        for (const s of await server.getPrimaryServices()) {
          const chars = await s.getCharacteristics();
          const n = chars.find(c => c.properties.notify);
          const w = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
          if (n && w) { nt = n; wr = w; break; }
        }
      } catch (_) {}
    }
    if (!wr || !nt) {
      let accesibles = [];
      try { accesibles = (await server.getPrimaryServices()).map(s => s.uuid); } catch (_) {}
      try { dev.gatt.disconnect(); } catch(_){}
      const id = [identidad.fabricante, identidad.modelo, identidad.firmware].filter(Boolean).join(' ');
      const svc = accesibles.length ? ` Servicios GATT accesibles: ${accesibles.join(', ')}.` : '';
      throw new Error(`Bluetooth conectado${id ? ` (${id})` : ''}, pero no expone una característica de datos OBD (write + notify).${svc} El canal puede ser SPP/protocolo propietario; no se enviaron comandos al vehículo.`);
    }

    await nt.startNotifications();
    nt.addEventListener('characteristicvaluechanged',
      e => this._recibir(new TextDecoder().decode(e.target.value)));
    dev.addEventListener('gattserverdisconnected', () => { this._char = null; this._stopLive(); });
    this._dev = dev; this._char = wr; this._buf = '';
    return dev.name || 'Adaptador OBD';
  },

  /* Envía un comando y espera la respuesta completa (termina en '>').
     Por USB se emula la respuesta del ELM327 para reusar todos los lectores. */
  /* ═══════════ BITACORA TECNICA DEL ESCANEO ═══════════
     Todo lo de este modulo se prueba contra un vehiculo real, y cuando algo
     sale mal en el taller lo que llega es "no funciono" — que no alcanza para
     arreglar nada. El log en pantalla esta escrito para el mecanico (que paso),
     no para depurar (que se pidio y que contesto el bus).

     Esta bitacora guarda el dialogo crudo: cada comando y su respuesta tal cual.
     Con eso, un escaneo fallido en un vehiculo que no tengo enfrente se puede
     leer igual — en que paso se corto, si el modulo nego el servicio, si
     contesto basura o si directamente no contesto.

     Tiene tope: un barrido son 240 direcciones y volcarlas todas ahoga lo unico
     que importa. Por eso el barrido se resume en una linea y el detalle queda
     para el dialogo con cada modulo, que es donde se rompen las cosas. */
  _traza: null, _sinTraza: false, _TRAZA_TOPE: 400,

  _trazar(peticion, respuesta) {
    if (!this._traza || this._sinTraza) return;
    if (this._traza.length >= this._TRAZA_TOPE) return;
    const corto = v => {
      if (v == null) return 'sin respuesta';
      if (Array.isArray(v)) return v.map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      return String(v).replace(/[\r\n]+/g, ' | ').trim().slice(0, 200);
    };
    this._traza.push({ q: corto(peticion), r: corto(respuesta) });
  },

  _trazaNota(txt) {
    if (this._traza && this._traza.length < this._TRAZA_TOPE) this._traza.push({ nota: txt });
  },

  /* Texto plano a proposito: se pega en WhatsApp o en un correo sin que se
     rompa nada, que es como va a llegar desde el taller. */
  _trazaTexto(guardado) {
    const s = guardado || this._scan || {};
    /* Un escaneo guardado trae el vehiculo adentro; el que esta en curso hay
       que buscarlo en la lista. */
    const v = s.vehiculos || (this._vehiculos || []).find(x => x.id === s.vehiculo_id) || {};
    const traza = guardado ? (s.traza || []) : (this._traza || []);
    const L = [];
    L.push('NexusPro — bitacora tecnica del escaneo');
    L.push('fecha: ' + new Date().toISOString());
    L.push(`vehiculo: ${[v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || '?'}  placa: ${v.placa || '?'}`);
    L.push(`via: ${this._via}  protocolo: ${s.protocolo || '?'}  adaptador: ${s.adaptador || '?'}`);
    /* Que aparato es y por que radio se intento: sin esto, un "no conecta"
       mandado desde el taller no distingue la app del navegador, que es la
       primera bifurcacion de todo el diagnostico. */
    let entorno = 'navegador sin Bluetooth';
    try {
      if (this._nativo) entorno = `app (puente v${JSON.parse(window.NexusBT.estado() || '{}').version || '?'})`;
      else if (navigator.bluetooth) entorno = 'navegador con Web Bluetooth';
    } catch (_) { entorno = 'app'; }
    L.push(`entorno: ${entorno}  ua: ${(navigator.userAgent || '').slice(0, 120)}`);
    L.push(`protoNum: ${this._protoNum}  canExt: ${this._canExt}  baud: ${this._canBaud}`);
    L.push(`VIN: ${s.vin || '—'}  MIL: ${s.mil ? 'ON' : 'off'}  voltaje: ${s.voltaje || '—'}`);
    const mp = s.mapa_acceso;
    if (mp) L.push(`mapa: ${mp.modulos.length} modulo(s), ${mp.bits} bits` +
                   (mp.faltantes && mp.faltantes.length ? `, ${mp.faltantes.length} faltante(s)` : ''));
    if (Array.isArray(s.por_modulo))
      for (const m of s.por_modulo)
        L.push(`  modulo 0x${m.ecu.toString(16).toUpperCase()}${m.resp != null ? ' -> 0x' + m.resp.toString(16).toUpperCase() : ''}` +
               ` "${m.nombre}" servicio=${m.servicio || '?'} codigos=${m.codigos.length}` +
               (m.codigos.length ? ' [' + m.codigos.map(c => c.codigo).join(' ') + ']' : ''));
    L.push('');
    L.push(`--- dialogo (${traza.length} entradas) ---`);
    for (const t of traza)
      L.push(t.nota ? '# ' + t.nota : `> ${t.q}\n< ${t.r}`);
    if (traza.length >= this._TRAZA_TOPE) L.push('# (cortado en el tope)');
    return L.join('\n');
  },

  /* Con id copia la de un escaneo ya guardado; sin id, la del que esta en curso. */
  async copiarTraza(id) {
    const guardado = id ? (this._data || []).find(x => x.id === id) : null;
    if (id && !guardado) { UI.toast('No se encontro ese escaneo', 'error'); return; }
    if (guardado && !(guardado.traza || []).length) {
      UI.toast('Ese escaneo se guardo antes de que existiera la bitacora tecnica', 'warn');
      return;
    }
    const txt = this._trazaTexto(guardado);
    try {
      await navigator.clipboard.writeText(txt);
      UI.toast('Bitacora tecnica copiada — pegala en el chat de soporte');
    } catch (_) {
      /* Sin permiso de portapapeles (pasa en http o si el navegador lo bloquea)
         igual hay que poder sacarla: se abre en una ventana para copiarla a mano. */
      const w = window.open('', '_blank');
      if (w) { w.document.write('<pre style="white-space:pre-wrap;font-size:12px">' + UI.esc(txt) + '</pre>'); w.document.close(); }
      else UI.toast('No se pudo copiar: permiti las ventanas emergentes', 'error');
    }
  },

  async _cmd(c, timeout = 6000) {
    let r;
    try { r = await this._cmdRaw(c, timeout); }
    catch (e) { this._trazar(c, 'ERROR: ' + e.message); throw e; }
    this._trazar(c, r);
    return r;
  },

  async _cmdRaw(c, timeout = 6000) {
    if (this._via === 'usb') {
      await this._esperarTurno(c);
      this._busy = true;
      try { return await this._usbElm(c, timeout); } finally { this._busy = false; }
    }
    /* COM por el puente: el puente arma el diálogo completo y devuelve la
       respuesta ya entera. Por Web Serial NO se toma este atajo: ese puerto cae
       al camino de abajo, el mismo del ELM por BLE y por la app. */
    if (this._via === 'serial' && !this._webSerialPort) {
      await this._esperarTurno(c);
      this._busy = true;
      try {
        const r = await this._puenteOp({ op:'serial_cmd', cmd:c, timeout }, timeout + 1000);
        return String(r?.respuesta || '');
      } finally { this._busy = false; }
    }
    if (!this._conectado) throw new Error('Adaptador desconectado');
    await this._esperarTurno(c);
    this._busy = true; this._buf = '';
    let temporizador = null;
    try {
      const p = new Promise((res, rej) => {
        /* El resolvedor se identifica A SI MISMO, y el temporizador SIEMPRE
           rechaza su propia promesa.

           Antes el temporizador miraba `this._resolve`, que es compartido entre
           comandos, y con respuestas rapidas (~300 ms) y un tope de 1500 ms el
           orden real era este:
             1. el comando A contesta y se resuelve;
             2. arranca B y pone su resolvedor en this._resolve;
             3. dispara el temporizador VIEJO de A, ve que this._resolve existe
                —es el de B— y lo pone en null;
             4. llega la respuesta de B y ya no hay a quien resolver;
             5. dispara el temporizador de B, ve this._resolve en null y NO
                rechaza nada.
           La promesa de B no se asentaba jamas, el `finally` no corria y
           `_busy` quedaba en true PARA SIEMPRE. Como `_busy` es estado del
           modulo, desde ahi todo comando futuro giraba en la espera sin salida:
           el escaneo se congelaba y ni reconectando volvia: habia que recargar.
           Se manifestaba en "datos en vivo", que es donde mas comandos rapidos
           van seguidos. Verificado el 2026-09-16 contra el sintoma real. */
        const mio = v => { if (this._resolve === mio) this._resolve = null; res(v); };
        this._resolve = mio;
        temporizador = setTimeout(() => {
          if (this._resolve === mio) this._resolve = null;
          rej(new Error(`Sin respuesta a ${c}`));
        }, timeout);
      });
      await this._escribirBLE(c + '\r');
      return await p;
    } finally {
      /* Sin esto quedan temporizadores viejos vivos; ya no pueden anular a
         nadie, pero tampoco tienen nada que hacer. */
      if (temporizador) clearTimeout(temporizador);
      this._busy = false;
    }
  },

  /* Espera a que el canal quede libre, PERO NO PARA SIEMPRE.
     `while (this._busy)` sin tope convierte cualquier fuga de `_busy` en un
     congelamiento mudo: la pantalla se queda quieta y no hay error que leer ni
     nada que mandar a soporte. Con tope, un fallo asi se ve y se puede
     reintentar. 45 s es mas de lo que tarda el comando mas lento (ATZ, 8 s) con
     margen de sobra, asi que llegar aqui YA significa que algo se rompio. */
  _TOPE_CANAL: 45000,

  async _esperarTurno(c) {
    const limite = Date.now() + this._TOPE_CANAL;
    while (this._busy) {
      if (Date.now() > limite) {
        this._busy = false;          // se libera para que el reintento sirva
        throw new Error(`El canal quedo ocupado y no se libero (esperando para mandar ${c}). ` +
          `Se libero solo: reintenta el escaneo.`);
      }
      await new Promise(r => setTimeout(r, 50));
    }
  },

  async _escribirBLE(txt) {
    /* Por el puente nativo el texto va tal cual: del otro lado hay un socket
       SPP o un GATT, y quien decide como partirlo en tramas es el puente. */
    if (this._via === 'android') { window.NexusBT.escribir(txt); return; }
    /* Por Web Serial el COM ya es un flujo de bytes: se escribe y listo. */
    if (this._webSerialPort) { await this._webSerialWriter.write(new TextEncoder().encode(txt)); return; }
    const data = new TextEncoder().encode(txt);
    if (this._char.properties.writeWithoutResponse) await this._char.writeValueWithoutResponse(data);
    else await this._char.writeValue(data);
  },

  /* Deja el adaptador CONECTADO Y PUESTO A PUNTO, venga de donde venga.
     Existe porque el modulo OEM no tenia forma propia de conectarse: se
     colgaba de la sesion que abria el escaneo, y esa sesion se cierra al
     cerrar el modal. Resultado: "Realiza primero un escaneo y mantenlo
     conectado" era un callejon sin salida, y el mapa de redes solo sabia
     autoconectarse por USB — por Bluetooth nunca.
     Devuelve el nombre del adaptador y el protocolo negociado. */
  /* La última vía que de verdad funcionó, con su puerto. Sobrevive a recargar
     la app: una vez que el taller conectó por COM6 o por el puente, ninguna
     pantalla tiene que volver a preguntarlo. */
  get _ultimaVia() {
    try {
      const v = JSON.parse(localStorage.getItem('obd_ultima_via') || 'null');
      /* 'webserial' llegó a guardarse como si fuera una vía aparte. No lo es —es
         la vía COM con otra tubería— y ninguna de las preguntas por `_via` la
         contemplaba, así que reusarla mandaba a Web Bluetooth, que a este dongle
         no lo ve. Queda guardado en el navegador de quien ya conectó una vez con
         esa versión, así que hay que traducirlo al leerlo. */
      if (v && v.via === 'webserial') v.via = 'serial';
      return v;
    } catch (_) { return null; }
  },
  set _ultimaVia(v) {
    try { localStorage.setItem('obd_ultima_via', JSON.stringify(v || null)); } catch (_) {}
  },

  _recordarVia() {
    if (!this._via || this._via === 'auto') return;
    this._ultimaVia = { via: this._via, api: this._api || null, fecha: Date.now() };
  },

  async _asegurarConexion(log = () => {}) {
    if (this._listo) return { nombre: this._scan?.adaptador || 'adaptador ya conectado',
                              protocolo: this._scan?.protocolo || null, yaEstaba: true };

    /* Lo que ya funcionó manda sobre cualquier detección: si la última vez se
       entró por COM6, se entra por COM6. Detectar de nuevo no está mal, pero
       preguntarle otra vez al usuario algo que ya contestó, sí. */
    if (!this._via) {
      const ult = this._ultimaVia;
      if (ult && ult.via && (ult.via !== 'android' || this._nativo)) {
        this._via = ult.via;
        if (ult.api && !this._api) this._api = ult.api;
        log(`Reusando la última conexión que funcionó: ${UI.esc(this._NOMBRE_VIA[ult.via] || ult.via)}${ult.api ? ' · ' + UI.esc(String(ult.api).replace(/^SERIAL:/i, '')) : ''}`);
      }
    }

    /* Sin via elegida se elige la MEJOR DISPONIBLE, no una por defecto a ciegas:
       · dentro de la app, su puente (alcanza SPP clasico y BLE);
       · en una PC, si el puente local ve un puerto Bluetooth emparejado, ESE,
         porque un navegador solo alcanza BLE y casi ningun dongle lo publica;
       · si no hay puente, Web Bluetooth. */
    /* En una PC con Chrome/Edge la vía COM existe SIN puente: la abre Web
       Serial. Antes sólo se contaba el puente, así que una PC sin el .bat
       corriendo caía a Web Bluetooth —la única vía que a un dongle en modo
       MFi/SPP no lo alcanza nunca— y ninguna pantalla que se conecta sola
       (OEM, centro de módulos, banco de pruebas) podía llegar al escáner. */
    if (!this._via) this._via = this._nativo ? 'android'
      : ((await this._hayPuertoSerie()) || this._puedeWebSerial() ? 'serial' : 'ble');

    let nombre, protocolo;
    if (this._via === 'usb' || this._via === 'auto') {
      if (this._via === 'auto') this._via = await this._detectarVia(log);
      ({ nombre, protocolo } = await this._usbInit(log));
      this._recordarVia();
      return { nombre, protocolo };
    }
    /* Por COM hace falta saber CUAL. Con el puente al dia viene marcado cual
       parece escaner (`obd`) y cuales son puertos locales entrantes, que nunca
       sirven; si no se puede decidir solo, se pregunta en vez de adivinar. */
    /* Con Web Serial el puerto lo elige el propio navegador (y si ya se
       autorizó, ni pregunta): pedirlo TAMBIÉN por el puente era hacer elegir el
       COM dos veces seguidas, y la primera de las dos no se usaba para nada. */
    if (this._via === 'serial' && !this._puedeWebSerial() && !/^SERIAL:/i.test(this._api || '')) {
      this._api = await this._elegirPuertoSerie();
      if (!this._api) throw new Error('No se eligió ningún puerto COM.');
    }
    if (this._via === 'serial')       ({ nombre } = await this._serialInit(log));
    else if (this._via === 'android') ({ nombre } = await this._androidInit(log));
    else                               nombre = await this._conectar();
    protocolo = await this._init(log);
    this._recordarVia();
    return { nombre, protocolo };
  },

  /* Puertos serie que ve el puente local. Devuelve [] si no hay puente: en un
     telefono no falta, no existe. */
  async _puertosSerie() {
    try {
      await this._puenteConectar();
      const r = await this._puenteOp({ op:'apis' }, 5000);
      return ((r && r.apis) || []).filter(a => /^SERIAL:/i.test(String(a.api || '')) && a.instalado);
    } catch (_) { return []; }
  },

  async _hayPuertoSerie() {
    const p = await this._puertosSerie();
    /* Un puerto LOCAL entrante no es un escaner: contarlo haria elegir la via
       COM en una PC que no tiene ningun dongle emparejado. */
    return p.some(a => a.local !== true);
  },

  /* Elige el puerto del escaner. Si el puente lo marca como OBD, no se
     pregunta nada; si hay varios candidatos, decide el usuario. */
  async _elegirPuertoSerie() {
    const puertos = (await this._puertosSerie()).filter(a => a.local !== true);
    if (!puertos.length) throw new Error(
      'El puente no ve ningún puerto Bluetooth emparejado. Emparejá el escáner en ' +
      'Configuración › Bluetooth de Windows y reintentá.');

    const obd = puertos.filter(a => a.obd);
    if (obd.length === 1) return obd[0].api;
    if (puertos.length === 1) return puertos[0].api;

    const lista = obd.length ? obd : puertos;
    return new Promise(res => {
      this._puertoElegido = api => { UI.cerrarModal(); res(api || null); };
      UI.modal('🔌 ¿Por cuál puerto está el escáner?', `
        <p style="font-size:12.5px;color:var(--text3)">
          Windows crea un COM por cada perfil Bluetooth emparejado. Los
          <i>puertos locales entrantes</i> ya se descartaron: nunca hay un escáner ahí.
        </p>
        ${lista.map(a => `
          <button class="btn btn-ghost" style="width:100%;text-align:left;margin-bottom:6px"
            onclick="Modulos.diagnostico_obd._puertoElegido('${UI.jsAttr(a.api)}')">
            <b>${UI.esc(a.equipo || a.nombre || a.api)}</b>
            ${a.obd ? ' <span style="color:var(--green);font-size:11px">🔌 parece un escáner OBD</span>' : ''}
            <span style="display:block;font-size:11px;color:var(--text3)">${UI.esc(a.api)}</span>
          </button>`).join('')}
        <button class="btn btn-ghost" style="margin-top:6px"
          onclick="Modulos.diagnostico_obd._puertoElegido(null)">Cancelar</button>`, '460px');
    });
  },

  /* La respuesta de un comando AT puede volver con el ECO del propio comando
     delante y con el prompt '>' detrás. Limpiarla es barato; no hacerlo costó
     un escaneo entero.

     Verificado en el Picanto el 2026-09-17 por COM: el escaneo guardó como
     protocolo la cadena `ATDPISO 15765-4 (CAN 11/500)>`, o sea con el eco
     pegado. Y `ATDPN` devolvió `ATDPNA6>`: la expresión que buscaba el dígito
     hexadecimal AL FINAL de la cadena no encontraba nada por culpa del '>',
     así que `_protoNum` quedaba en 0. Con 0, `_elmPuedeModulos()` da false y
     EL BARRIDO POR MÓDULO NO CORRE: el escaneo salió con cero módulos y sin
     mapa de acceso, sin un solo error en pantalla. */
  _limpiarAT(cmd, r) {
    return String(r == null ? '' : r)
      .replace(/[\r\n]+/g, ' ')
      .replace(new RegExp('^\\s*' + cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
      .replace(/>/g, '')
      .trim();
  },

  async _init(log) {
    log('Reiniciando adaptador (ATZ)...');
    await this._cmd('ATZ', 8000);
    for (const c of ['ATE0','ATL0','ATS0','ATH0']) await this._cmd(c);
    /* Si el eco quedó encendido, TODAS las respuestas vienen con el comando
       pegado adelante — y el eco de un comando OBD es hexadecimal (0100, 0902),
       así que el parser lo toma por datos del vehículo y contesta MAL, que es
       peor que fallar. Se verifica y se reintenta una vez antes de seguir. */
    const eco = String(await this._cmd('ATI', 4000).catch(() => ''));
    if (/^\s*ATI/i.test(eco)) {
      log('El adaptador seguía con el eco encendido: apagándolo de nuevo...');
      await this._cmd('ATE0').catch(() => {});
    }
    await this._cmd('ATSP0');                      // autoprotocolo: CAN / ISO9141 / KWP2000 / J1850
    log('Buscando protocolo del vehículo...');
    let r = '';
    for (let intento = 1; intento <= 2; intento++) {   // ECUs viejas (ISO/KWP) suelen responder al 2º intento
      r = await this._cmd('0100', 20000);          // dispara la búsqueda (SEARCHING...)
      if (!/UNABLE|ERROR|NO DATA/i.test(r) || /4100/i.test(r.replace(/\s/g,''))) break;
      if (intento === 1) { log('Sin respuesta, reintentando...'); await this._cmd('ATSP0'); }
    }
    if (/UNABLE|ERROR|NO DATA/i.test(r) && !/4100/i.test(r.replace(/\s/g,'')))
      throw new Error('No se pudo comunicar con el vehículo. Verifica que el switch esté encendido y el adaptador bien conectado al puerto OBD.');
    /* 'A6' = automático, protocolo 6 (CAN 11/500). Se lee el ÚLTIMO dígito
       hexadecimal de la respuesta ya limpia, no del texto crudo. */
    const dpn = this._limpiarAT('ATDPN', await this._cmd('ATDPN'));
    const digitos = dpn.replace(/[^0-9A-Fa-f]/g, '');
    this._protoNum = digitos ? (parseInt(digitos.slice(-1), 16) || 0) : 0;
    if (!this._protoNum)
      log(`<span style="color:var(--amber)">El adaptador no dijo qué protocolo negoció (contestó "${UI.esc(dpn || 'nada')}"): ` +
          'el barrido por módulo no va a correr.</span>');
    const dp = this._limpiarAT('ATDP', await this._cmd('ATDP'));
    return dp.replace(/AUTO,?\s*/i, '').trim();
  },

  _desconectar() {
    this._stopLive();
    this._pararLatido();
    try { this._dev?.gatt?.disconnect(); } catch (_) {}
    this._dev = this._char = null;
    this._serialReady = false;
    this._cerrarWebSerial();
    try { if (this._ws?.readyState === 1) { this._ws.send(JSON.stringify({ op:'desconectar' })); this._ws.close(); } } catch (_) {}
    /* Y desconectar tampoco puede dejarla en 'ble': la siguiente pantalla que
       se conecte sola volvería a pedir emparejar. Se deja en null para que se
       vuelva a elegir la mejor disponible. */
    this._ws = null; this._j39 = null; this._canRx = null; this._puenteCanalActivo = false; this._via = null;
  },

  /* ═══════════ PUENTE USB (RP1210 — NEXIQ USB-Link y compatibles) ═══════════
     Un programa local pequeño (carpeta puente-obd del repo) expone el adaptador
     USB por WebSocket en localhost:17210. El puente es una tubería tonta: toda
     la lógica de protocolo vive aquí (se actualiza con deploy, sin recompilar). */
  /* `_via` arranca en null = "todavía no se sabe". Arrancaba en 'ble', y eso
     hacía que la autodetección de `_asegurarConexion` —la que elige el puente
     de la app, o el COM del dongle ya emparejado— NO CORRIERA NUNCA: como ya
     había vía, se iba derecho a Web Bluetooth y abría el diálogo de emparejar
     del navegador. Reportado el 2026-09-17: "¿por qué me vuelve a pedir que
     haga pair, si ya lo tenemos resuelto para Android y para COM6?". */
  _ws: null, _wsPend: {}, _via: null, _j39: null, _canExt: false, _canRx: null, _puenteCanalActivo: false,

  /* Telefono o tablet: ahi no hay puente ni Web Serial, solo Web Bluetooth. */
  _esMovil() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ''); },

  async _puenteConectar() {
    if (this._ws && this._ws.readyState === 1) return;
    await new Promise((res, rej) => {
      let resuelto = false;
      const ws = new WebSocket('ws://127.0.0.1:17210');
      ws.onopen = () => { resuelto = true; this._ws = ws; res(); };
      ws.onmessage = e => { try { this._puenteMsg(JSON.parse(e.data)); } catch (_) {} };
      ws.onclose = ws.onerror = () => {
        this._ws = null;
        if (!resuelto) { resuelto = true;
          /* El puente es un programa de Windows: en telefono o tablet no falta,
             no existe. Mandar ahi a "ejecutar iniciar-puente.bat" es una pista
             falsa que hace perder la tarde; en movil la unica via es Bluetooth BLE. */
          rej(new Error(this._esMovil()
            ? 'Las vías USB y Bluetooth clásico necesitan el puente, que es un programa de Windows y no existe en teléfono ni tablet. ' +
              'Acá la única vía es <b>Bluetooth (BLE)</b>, y el escáner tiene que estar en modo BLE — un dongle en modo MFi/iPhone ' +
              'o solo Bluetooth clásico no se anuncia por BLE y el navegador no lo puede ver.'
            : 'No se encontró el puente USB en esta PC. Ejecuta iniciar-puente.bat (carpeta puente-obd), deja su ventana abierta y reintenta.')); }
      };
    });
  },

  _puenteMsg(m) {
    if (m.op === 'conectar') this._puenteCanalActivo = !!m.ok;
    else if (m.op === 'desconectar' || (m.op === 'cargar' && m.ok)) this._puenteCanalActivo = false;
    if (m.op === 'mensaje') {
      if (this._sniff) this._sniff(m.datos);          // observa sin desviar la ruta normal
      if (this._via === 'j1939') this._j39Frame(m.datos);
      else if (this._via === 'j1708') this._j1587Frame(m.datos);
      else if (this._canRx) this._canFrame(m.datos);
      return;
    }
    if (m.op === 'error') { console.warn('Puente RP1210:', m.codigo, m.error); return; }
    const cola = this._wsPend[m.op];
    if (cola && cola.length) cola.shift()(m);
  },

  /* Una COLA por operación, no un solo casillero: el control de flujo del ISO-TP
     dispara un 'enviar' desde dentro de la recepción, que se pisaba con el
     'enviar' en curso y dejaba una promesa colgada hasta el timeout. Con 30
     sensores eso convertía el escaneo en minutos de espera. Se responden en
     orden porque el puente atiende las operaciones de a una. */
  _puenteOp(obj, timeout = 8000) {
    /* El adaptador elegido se inyecta acá y no en cada llamada: 'conectar' se
       invoca desde ocho lugares (autodetección, J1939, J1587, liviano…) y
       olvidarlo en uno solo haría que ese camino siguiera usando el de
       siempre, con un síntoma dificilísimo de rastrear. */
    if (obj && obj.op === 'conectar' && this._api && !obj.api) obj = Object.assign({}, obj, { api: this._api });
    return new Promise((res, rej) => {
      if (!this._ws || this._ws.readyState !== 1) { rej(new Error('Puente USB desconectado')); return; }
      const cola = (this._wsPend[obj.op] = this._wsPend[obj.op] || []);
      cola.push(res);
      setTimeout(() => {
        const i = cola.indexOf(res);
        if (i >= 0) { cola.splice(i, 1); rej(new Error(`El puente no respondió (${obj.op})`)); }
      }, timeout);
      this._ws.send(JSON.stringify(obj));
    });
  },

  /* Estado del puente, asegurando primero que tenga cargado el adaptador
     elegido. Si se pidiera el estado antes de cargarlo, el log mostraría el
     adaptador anterior y daría la impresión de que el selector no hace nada. */
  async _puenteEstado() {
    if (this._api) {
      const c = await this._puenteOp({ op:'cargar', api: this._api }, 6000).catch(() => null);
      if (c && c.ok === false)
        throw new Error(`No se pudo usar ese adaptador: ${c.error || 'error desconocido'}`);
    }
    return this._puenteOp({ op:'estado' });
  },

  /* ── Escucha adaptativa del bus ──────────────────────────────────────────
     Los buses de difusión (J1939, J1587) no se consultan: los módulos hablan
     cuando quieren. Esperar un plazo fijo falla de las dos maneras — se queda
     corto con un camión que tarda en arrancar a hablar (se pierde justo el
     módulo que interesa) y desperdicia segundos con uno que ya dijo todo.

     Acá se escucha mientras SIGA APARECIENDO algo nuevo: un módulo que no había
     hablado, un parámetro que no se había visto, una falla nueva. Cuando pasan
     `quieto` ms sin novedad, se corta. `min` evita cortar en el primer respiro y
     `max` es el tope duro para no colgar la pantalla.

     `huella` devuelve un valor que cambia cuando entró información nueva. */
  async _escucharBus(huella, opts = {}) {
    const min = opts.min || 1500, max = opts.max || 12000, quieto = opts.quieto || 2000;
    const paso = 200;
    const t0 = Date.now();
    let previa = huella(), ultimoCambio = t0, avisos = 0;
    for (;;) {
      await new Promise(r => setTimeout(r, paso));
      const ahora = Date.now();
      const h = huella();
      if (h !== previa) {
        previa = h; ultimoCambio = ahora;
        /* Un avance visible cada ~2 s: en un bus lento, sin esto la pantalla
           parece congelada y el mecánico desconecta creyendo que falló. */
        if (opts.log && ahora - t0 > (avisos + 1) * 2000) { avisos++; opts.log(); }
      }
      const t = ahora - t0;
      if (t >= max) return { ms: t, motivo: 'tope' };
      if (t >= min && ahora - ultimoCambio >= quieto) return { ms: t, motivo: 'estable' };
    }
  },

  /* Sale apenas hay tráfico: para decidir QUÉ bus es, la primera trama alcanza.
     Antes se esperaba el plazo completo aunque el camión ya hubiera contestado,
     y con tres protocolos a probar eso eran varios segundos regalados. */
  async _hayTrafico(maxMs = 2200) {
    let tramas = 0;
    this._sniff = () => tramas++;
    const t0 = Date.now();
    try {
      while (Date.now() - t0 < maxMs) {
        await new Promise(r => setTimeout(r, 100));
        if (tramas > 0) {
          /* Un respiro para no reportar 1 trama suelta como si fuera el bus */
          await new Promise(r => setTimeout(r, 400));
          break;
        }
      }
    } finally { this._sniff = null; }
    return tramas;
  },

  /* Un camión con conector OBD-II de 16 pines puede hablar OBD-II a 500k o
     J1939 a 250k por los mismos pines. Se prueba en vez de hacer adivinar:
     primero OBD-II (contesta a una petición), después J1939 (el camión
     transmite solo, así que basta con escuchar). */
  _canBaud: 500, _j39Baud: 250, _sniff: null,

  async _detectarVia(log) {
    await this._puenteConectar();
    const est = await this._puenteEstado();
    log(`Puente USB: <b>${est.dispositivo || 'RP1210'}</b> v${est.version || '?'} ✓`);

    /* En un taller con los software de fábrica instalados (Cummins, CAT,
       Navistar, Detroit…) hay varios adaptadores RP1210 registrados. Se avisa
       que hay más para que, si este no responde, se sepa que hay con qué
       reintentar desde el selector en vez de dar el escaneo por perdido. */
    const inst = await this._puenteOp({ op:'apis' }, 4000).catch(() => null);
    const otros = ((inst && inst.apis) || []).filter(a => a.instalado && !a.cargada);
    if (otros.length)
      log(`Hay ${otros.length} adaptador(es) más en esta PC: ${otros.map(a => a.nombre || a.api).join(' · ')}`);

    for (const baud of [500, 250]) {
      const c = await this._puenteOp({ op:'conectar', protocolo:`CAN:Baud=${baud}`, device:1 }).catch(() => ({ ok:false }));
      if (!c.ok) continue;
      for (const ext of [false, true]) {
        this._canExt = ext;
        log(`Probando OBD-II en CAN ${ext ? 29 : 11} bits / ${baud}k...`);
        const r = await this._usbElm('0100', 2500).catch(() => 'NO DATA');
        if (/4100/.test(r.replace(/\s/g, ''))) {
          this._canBaud = baud;
          log(`Responde OBD-II en CAN ${ext ? 29 : 11} bits / ${baud}k ✓`);
          return 'usb';
        }
      }
    }

    for (const baud of [250, 500]) {
      log(`Escuchando bus J1939 a ${baud}k...`);
      const c = await this._puenteOp({ op:'conectar', protocolo:`J1939:Baud=${baud}`, device:1 }).catch(() => ({ ok:false }));
      if (!c.ok) continue;
      const tramas = await this._hayTrafico();
      if (tramas > 0) { this._j39Baud = baud; log(`Bus J1939 activo a ${baud}k (${tramas} tramas) ✓`); return 'j1939'; }
    }

    /* Camiones antiguos: J1708/J1587. Se detecta el bus para no decir "no hay
       nada" cuando en realidad hay tráfico; la decodificación de fallas J1587
       (MID/PID/FMI) todavía no está implementada. */
    log('Escuchando bus J1708 (camión antiguo)...');
    const c8 = await this._puenteOp({ op:'conectar', protocolo:'J1708', device:1 }).catch(() => ({ ok:false }));
    if (c8.ok) {
      const tramas = await this._hayTrafico();
      if (tramas > 0) { log(`Bus J1708/J1587 activo (${tramas} tramas) — camión antiguo ✓`); return 'j1708'; }
    }

    throw new Error('No se detectó ningún bus: ni OBD-II (CAN 500k/250k), ni J1939 (250k/500k), ni J1708. ' +
      this._AVISO_KLINE_USB);
  },

  /* ── Por qué el USB-Link no sirve para un liviano anterior a ~2006 ────────
     Antes acá se probaba si el adaptador "podía abrir K-line" y, si abría, se
     lo anunciaba como buena noticia. Era engañoso: el 2026-07-30, contra un
     Mitsubishi Montero 2004 enchufado, se comprobó que **abrir no significa
     nada**. El USB-Link abre ISO9141, ISO14230, KWP2000 y KW2000 —tanto en el
     dispositivo genérico como en sus canales dedicados (70, 120, 121, 134)— y
     además TRANSMITE de verdad: con el eco del driver encendido (comando 16)
     se ve salir la trama con el checksum que él mismo agrega.

     Y el vehículo no contesta nunca. Unas 80 combinaciones: 5 protocolos, 4
     canales dedicados, 7 direcciones de módulo, 10 comandos de init, motor
     apagado y andando. El mismo conector le responde a un Thinkdiag al
     instante, así que el pin 7 del vehículo está vivo.

     O sea: el USB-Link es una herramienta de camión y su K-line no llega al
     conector — sea porque el cable no trae el pin 7, sea porque el clon no
     tiene el transceptor. Las dos se ven idénticas desde el software y ninguna
     se arregla con código. Por eso acá se dice la conclusión y no una prueba
     que da falsas esperanzas. */
  _AVISO_KLINE_USB:
    'Si el vehículo es anterior a ~2006 diagnostica por <b>K-line (pin 7)</b>, y por USB no se va a poder: ' +
    'está verificado contra un Montero 2004 que el USB-Link abre K-line y hasta transmite, pero el vehículo ' +
    'nunca contesta — el canal K-line no llega al conector. ' +
    'Para estos vehículos usá la opción <b>Bluetooth</b> con un dongle ELM327 que hable ISO 9141-2 y KWP2000. ' +
    'Si no es ese el caso: revisá el switch en contacto y el cable bien puesto.',

  /* ── Vehículos livianos por USB: OBD-II sobre CAN crudo con ISO-TP propio ── */
  /* Bluetooth clasico/SPP: Windows lo publica como SERIAL:COMx y el puente
     solo transporta el dialogo ELM; el protocolo OBD sigue aqui, igual que BLE. */
  /* ── Bluetooth por el puente nativo de la app Android (SPP + BLE) ── */
  async _androidInit(log) {
    if (!this._nativo)
      throw new Error('Esta vía necesita la app de Android de NexusPro. En el navegador usá <b>Bluetooth (BLE)</b>.');
    this._engancharNativo();

    let est = {};
    try { est = JSON.parse(window.NexusBT.estado() || '{}'); } catch (_) {}
    if (!est.disponible) throw new Error('Este teléfono no tiene Bluetooth.');
    if (!est.encendido) throw new Error('El Bluetooth del teléfono está apagado. Encendelo y reintentá.');

    log('Buscando escáneres (emparejados y BLE cercanos)...');
    const lista = await this._btPedir('lista', () => window.NexusBT.listar(), 20000);
    if (!lista.length)
      throw new Error('No se encontró ningún escáner. Si es de Bluetooth clásico, emparejalo primero ' +
        'desde los ajustes del teléfono; si es BLE, alcanza con que esté enchufado y encendido.');

    /* Ordenar y etiquetar es de _elegirEscaner, que es quien lo pinta. Aca habia
       una segunda copia del reconocedor de nombres OBD con una lista de marcas
       mas corta: dos regex para lo mismo no fallan, se desincronizan. */
    const elegido = await this._elegirEscaner(lista);
    if (!elegido) throw new Error('No se eligió ningún escáner.');

    log(`Conectando a <b>${UI.esc(elegido.nombre)}</b> (${elegido.tipo === 'ble' ? 'BLE' : 'Bluetooth clásico'})...`);
    const nombre = await this._btPedir('conectar',
      () => window.NexusBT.conectar(elegido.mac, elegido.tipo), 30000);
    this._buf = '';
    this._via = 'android';

    /* Decir "Conectado ✓" apenas abre el socket es una promesa sin respaldo: el
       socket abre igual contra unos audifonos o una balanza, y la pantalla
       igual felicita. La via serial ya sondeaba con ATI por exactamente esta
       razon; la de la app se agrego despues y se quedo sin la sonda.
       ATI le habla al DONGLE, no al vehiculo, asi que no toca ninguna ECU, y lo
       que conteste se imprime CRUDO: es lo unico que separa "hay enlace" de
       "parece que hay enlace". */
    let sonda = await this._cmd('ATI', 4000).catch(() => '');
    if (!sonda.trim()) sonda = await this._cmd('ATZ', 5000).catch(() => '');
    if (!sonda.trim()) {
      try { window.NexusBT.desconectar(); } catch (_) {}
      this._bt = null;
      /* Con un Thinkdiag/Launch el motivo NO es un error de elección: el enlace
         está bien y el dongle simplemente no habla este idioma. Mandarlo a
         "revisá que no sean los audífonos" lo hace perder la tarde buscando algo
         que está bien. */
      if (this._esDongleCerrado(nombre) || this._esDongleCerrado(elegido.nombre))
        throw new Error(`El Bluetooth con <b>${UI.esc(nombre)}</b> abrió bien —por eso el dongle cambió de color— ` +
          `pero no contestó ni a ATI ni a ATZ: <b>este escáner no habla ELM327</b>. Los Thinkdiag/Thinkcar (y los ` +
          `Launch X431) usan el protocolo propietario de su marca, atado a su propia app y a su servidor, así que ` +
          `ninguna aplicación de terceros los puede usar. Para escanear desde NexusPro necesitás un dongle ELM327: ` +
          `el <b>vLinker MS</b> que ya tenés sirve.`);
      throw new Error(`Se abrió el Bluetooth con <b>${UI.esc(nombre)}</b>, pero no contestó ni a ATI ni a ATZ: ` +
        `NO hay enlace con un escáner OBD. Lo más común es haber elegido el aparato equivocado de la lista ` +
        `(manos libres, audífonos, balanza, el celular de alguien). Si es el correcto, desenchufalo del ` +
        `vehículo, volvé a enchufarlo y reintentá.`);
    }
    log(`El escáner contesta: <b>${UI.esc(sonda.replace(/[\r\n>]+/g, ' ').trim())}</b> ✓`);
    return { nombre, protocolo: elegido.tipo === 'ble' ? 'BLE (app)' : 'Bluetooth clásico SPP (app)' };
  },

  /* Se pinta DENTRO del panel de resultados del escaneo, no en otro modal:
     UI.modal reemplaza el modal abierto, y eso se llevaría por delante el log,
     los botones y el estado del escaneo en curso. */
  _elegirEscaner(lista) {
    return new Promise(res => {
      /* Si no hay panel de escaneo (por ejemplo, llamado desde el modulo OEM)
         se pinta en un modal. Antes se devolvia `lista[0]` EN SILENCIO: eso es
         conectarse al primer aparato que aparezca —unos audifonos, una
         balanza— sin preguntar, que es exactamente lo que este selector
         existe para no hacer. */
      const caja = document.getElementById('obd-panel');
      const enModal = !caja;

      const terminar = elegido => {
        this._escanerElegido = null;
        if (enModal) UI.cerrarModal(); else caja.innerHTML = '';
        res(elegido);
      };
      this._escanerElegido = i => terminar(i === null ? null : (lista[i] || null));

      /* Un barrido BLE en la calle levanta TODO lo que esté anunciando cerca
         —llaveros, sensores de presión, audífonos, el celular del cliente— y la
         mayoría no publica nombre: el puente cae a la MAC y llegan como un
         número pelado. Mezclados y en crudo, el mecánico elige entre veinte
         filas idénticas. Acá se ordenan por probabilidad, cada una dice QUÉ es,
         y los emparejados (vinculados en el teléfono) NUNCA se ocultan. */
      const esOBD = n => /vlinker|linker|ms|vgate|obd|elm|obdlink|think|thinkcar|thinkdiag|thinktool|mucar|9798|veepeak|konnwei|icar|viecar|panlong|scan|stn|bafx|autophix|nexa|vlink/i.test(n || '');
      const macOBD = mac => /^00:1D:A5|^DC:0D:30|^00:13:EF|^00:1D:43|^11:22:33|^70:66:55|^00:04:3E/i.test(mac || '');
      const soloHex = t => String(t || '').replace(/[^0-9A-F]/gi, '').toUpperCase();
      /* Un dispositivo vinculado en Android NUNCA es anónimo, aunque no reporte nombre de texto */
      const anonimo = d => (!String(d.nombre || '').trim() || soloHex(d.nombre) === soloHex(d.mac)) && !d.vinculado;
      const rango = d => (esOBD(d.nombre) || macOBD(d.mac)) ? 0 : d.vinculado ? 1 : anonimo(d) ? 3 : 2;
      const orden = [...lista].sort((a, b) => rango(a) - rango(b));

      const fila = d => {
        const r = rango(d);
        const esObdCheck = esOBD(d.nombre) || macOBD(d.mac);
        const cerrado = this._esDongleCerrado(d.nombre);
        const etiqueta = cerrado
          ? ' <span style="color:var(--amber);font-size:11px;font-weight:700">⚠️ No habla ELM327 — sólo su propia app</span>'
          : (esObdCheck
            ? ' <span style="color:var(--green);font-size:11px;font-weight:700">🔌 Escáner OBD (vLinker/Vgate/ELM327)</span>'
            : (d.vinculado ? ' <span style="color:var(--cyan);font-size:11px;font-weight:700">📱 Emparejado en Android</span>' : ''));

        let nombreMostrar = d.nombre;
        if (macOBD(d.mac) && (!nombreMostrar || soloHex(nombreMostrar) === soloHex(d.mac))) {
          nombreMostrar = `vLinker MS / Vgate (${d.mac})`;
        } else if (anonimo(d)) {
          nombreMostrar = `<span style="color:var(--text3)">(sin nombre) ${d.mac}</span>`;
        } else {
          nombreMostrar = UI.esc(nombreMostrar);
        }

        return `<button class="btn btn-ghost" style="width:100%;text-align:left;margin-bottom:6px;border:1px solid ${d.vinculado ? 'var(--cyan)' : 'var(--border)'}"
            onclick="Modulos.diagnostico_obd._escanerElegido(${lista.indexOf(d)})">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <b>${nombreMostrar}</b>
              ${etiqueta}
            </div>
            <span style="display:block;font-size:11px;color:var(--text3);margin-top:2px">
              ${d.tipo === 'ble' ? '⚡ BLE' : '🔌 Bluetooth clásico (SPP - COM)'} ·
              <b>MAC: ${UI.esc(d.mac)}</b> ·
              ${d.vinculado ? '✅ Emparejado en teléfono' : 'No emparejado'}
            </span>
          </button>`;
      };

      const probables = orden.filter(d => rango(d) < 3);
      const anon = orden.filter(d => rango(d) === 3);

      const cuerpo = `
        <div style="background:var(--surface2);color:var(--text);border-radius:8px;padding:12px;margin-top:10px">
          <div style="font-weight:700;margin-bottom:2px;font-size:14px">📡 Seleccionar Escáner Bluetooth</div>
          <div style="font-size:11.5px;color:var(--text3);margin-bottom:10px">
            Se encontraron ${lista.length} dispositivo(s). Al elegir uno, se probará comunicación mandando <b>ATI</b>.
          </div>
          ${probables.length ? probables.map(fila).join('')
            : '<div style="font-size:12px;color:var(--amber);margin-bottom:8px;padding:8px;background:rgba(245,158,11,0.1);border-radius:6px">Ninguno se anuncia con nombre reconocido de escáner. Si el vLinker / Vgate es de Bluetooth clásico, verfica que esté emparejado en los Ajustes de Bluetooth de Android.</div>'}
          ${anon.length ? `
            <button class="btn btn-ghost" style="width:100%;font-size:12px;margin-top:6px"
              onclick="this.style.display='none';this.nextElementSibling.style.display=''">
              ▾ Ver ${anon.length} otro(s) dispositivo(s) sin nombre
            </button>
            <div style="display:none;margin-top:6px">
              <div style="font-size:11.5px;color:var(--text3);margin:4px 0">
                Dispositivos no emparejados que no publican nombre (llaveros, sensores, etc.):
              </div>
              ${anon.map(fila).join('')}
            </div>` : ''}

          <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
            <details>
              <summary style="font-size:11.5px;color:var(--cyan);cursor:pointer;font-weight:600">
                ⚙️ ¿No ves tu vLinker/Vgate? Ingresar dirección MAC manualmente
              </summary>
              <div style="display:flex;gap:6px;margin-top:8px">
                <input type="text" id="obd-mac-manual" class="form-input" style="font-size:12px;font-family:monospace" placeholder="Ej: 00:1D:A5:12:34:56">
                <button class="btn btn-sm btn-brand" onclick="
                  const m = (document.getElementById('obd-mac-manual').value || '').trim().toUpperCase();
                  if(m) Modulos.diagnostico_obd._escanerElegido({ mac: m, nombre: 'Escáner MAC ' + m, tipo: 'spp', vinculado: true });
                ">Conectar MAC</button>
              </div>
            </details>
          </div>

          <div style="font-size:11px;color:var(--text3);margin-top:10px">
            💡 <b>Vgate / vLinker MAC OUI:</b> Las direcciones MAC de vLinker / Vgate suelen iniciar con <code>00:1D:A5</code> o <code>DC:0D:30</code>.
          </div>
          <button class="btn btn-ghost" style="margin-top:8px;width:100%"
            onclick="Modulos.diagnostico_obd._escanerElegido(null)">Cancelar</button>
        </div>`;

      if (enModal) UI.modal('📡 Escáneres Bluetooth', cuerpo, '540px');
      else caja.innerHTML = cuerpo;
    });
  },

  /* Chrome/Edge de PC abren el COM del dongle sin ningún programa aparte.
     Adentro de la app no: ahí la vía es el puente nativo. */
  _puedeWebSerial() {
    return typeof navigator !== 'undefined' && !!navigator.serial && !this._nativo;
  },

  /* Un solo lector, vivo mientras dure el puerto, que entrega TODO a `_recibir`
     —igual que la notificación BLE y el puente de la app—. Leer "una vez por
     comando" con un temporizador de 400 ms deja la lectura anterior colgada, y
     el pedazo que llega tarde se lo lleva el comando SIGUIENTE: eso no falla,
     contesta MAL, que es peor. Mismo motivo por el que `_recibir` es un solo
     lugar y no una copia por transporte. */
  async _bombearWebSerial(port) {
    try {
      while (this._webSerialPort === port && port.readable) {
        const lector = port.readable.getReader();
        this._webSerialReader = lector;
        try {
          for (;;) {
            const { value, done } = await lector.read();
            if (done) break;
            if (value) this._recibir(new TextDecoder().decode(value));
          }
        } finally { try { lector.releaseLock(); } catch (_) {} }
      }
    } catch (_) { /* puerto cerrado, o el dongle se fue: lo ve el latido */ }
    if (this._webSerialPort === port) this._serialReady = false;
  },

  /* Cerrar el COM DE VERDAD. Un puerto Web Serial que queda abierto NO se puede
     volver a abrir: el segundo intento revienta con "The port is already open"
     y el síntoma es "conecta una vez y después ya no me deja, hasta recargar la
     página". Además Windows sostiene el enlace SPP con el dongle mientras el
     COM siga abierto, así que tampoco lo suelta para otro programa. */
  _cerrarWebSerial() {
    const p = this._webSerialPort, r = this._webSerialReader, w = this._webSerialWriter;
    this._webSerialPort = this._webSerialReader = this._webSerialWriter = null;
    this._serialReady = false;
    /* Devuelve la promesa del cierre: quien vuelve a abrir el MISMO puerto
       tiene que esperarla, o el open() choca con "already open". */
    if (!p) return Promise.resolve();
    return (async () => {
      try { await r?.cancel(); } catch (_) {}
      try { await w?.abort(); } catch (_) {}
      try { w?.releaseLock(); } catch (_) {}
      /* `close()` rechaza mientras algún lock siga tomado, y soltarlos es
         asíncrono: se reintenta en vez de dar el puerto por cerrado sin estarlo.
         ponytail: 5 intentos de 100 ms; si hiciera falta más, hay algo peor. */
      for (let i = 0; i < 5; i++) {
        try { await p.close(); return; } catch (_) { await new Promise(r2 => setTimeout(r2, 100)); }
      }
    })();
  },

  /* ── El escáner Bluetooth REGISTRADO en esta PC ─────────────────────────
     Henry, 2026-09-22: «si doy escaneo por Bluetooth es porque usaré ESE
     Bluetooth» — el vLinker MS emparejado en Windows. Antes solo se reusaba el
     puerto si el navegador tenía exactamente UNO autorizado; Windows crea un
     COM entrante y uno saliente por equipo, así que casi siempre eran dos y
     se abría el selector cada vez. Web Serial no da el nombre del equipo, así
     que se reconoce por lo que CONTESTA: el puerto que responde ATI como un
     ELM327 es el escáner. Se prueba primero el que funcionó la última vez. */
  get _puertoConocido() {
    try { return JSON.parse(localStorage.getItem('obd_puerto_bt') || 'null'); } catch (_) { return null; }
  },
  set _puertoConocido(v) {
    try { localStorage.setItem('obd_puerto_bt', JSON.stringify(v || null)); } catch (_) {}
  },

  /* Abre el puerto y le pregunta ATI. Devuelve lo que contestó si es un
     escáner; si no, lo cierra y devuelve null. El open tiene tope: un COM
     saliente hacia un equipo apagado puede tardar mucho en fallar. */
  async _probarPuertoSerial(port, aceptarMudo = false) {
    const abrir = port.open({ baudRate: 115200 });
    try {
      await Promise.race([abrir, new Promise((_, no) => setTimeout(() => no(new Error('tiempo')), 7000))]);
    } catch (_) {
      abrir.then(() => port.close().catch(() => {}), () => {});
      return null;
    }
    this._webSerialPort = port;
    this._webSerialWriter = port.writable.getWriter();
    this._serialReady = true;
    this._buf = '';
    this._bombearWebSerial(port);          // lector permanente → _recibir
    /* Al abrir el COM saliente, Windows recién levanta el enlace SPP con el
       dongle y el primer comando puede tardar o perderse (2026-09-23: con un
       solo ATI de 2.5 s la PC dejó de conectar). Dos intentos de 4 s. */
    for (let i = 0; i < 2; i++) {
      const ati = await this._cmd('ATI', 4000).catch(() => '');
      if (/ELM|STN|OBD|vLinker|Vgate/i.test(ati || '')) return ati.replace(/[\r\n>]+/g, ' ').replace(/^\s*ATI\s*/i, '').trim();
    }
    if (aceptarMudo) return 'sin respuesta a ATI';
    await this._cerrarWebSerial();
    return null;
  },

  async _serialInit(log, modo = this._modoPuerto) {
    if (this._puedeWebSerial()) {
      let port = null, ati = null;
      try {
        if (modo !== 'elegir') {
          let ya = [];
          try { ya = await navigator.serial.getPorts(); } catch (_) {}
          const con = this._puertoConocido;
          const orden = ya.map((pt, i) => ({ pt, i }))
            .sort((a, b) => (b.i === (con && con.indice)) - (a.i === (con && con.indice)));
          if (orden.length) log(`Buscando el escáner Bluetooth registrado${con && con.ati ? ` (<b>${UI.esc(con.ati)}</b>)` : ''} entre ${orden.length} puerto(s) de esta PC...`);
          for (const { pt, i } of orden) {
            ati = await this._probarPuertoSerial(pt);
            if (ati) { port = pt; this._puertoConocido = { indice: i, ati, fecha: Date.now() }; break; }
          }
          if (!port && modo === 'conocido')
            throw new Error('El escáner Bluetooth registrado no contestó. Revisá que esté enchufado al vehículo con el ' +
              'switch en contacto y emparejado en el Bluetooth de Windows. Si es otro escáner, usá <b>🔁 Elegir otro escáner</b>.');
          if (!port && orden.length) log('<span style="color:var(--amber)">El escáner registrado no contestó: elegí cuál usar.</span>');
        }
        if (!port) {
          log('Abriendo selector de puerto COM / Bluetooth de Windows...');
          const elegido = await navigator.serial.requestPort();
          /* Lo eligió la persona: se sigue aunque no conteste ATI, como antes
             del 2026-09-22. Si es el entrante, falla después con su error. */
          ati = await this._probarPuertoSerial(elegido, true);
          if (!ati) throw new Error('Ese puerto no contestó como escáner (ATI). Elegí el COM <b>saliente</b> del escáner: ' +
            'los que Windows llama "entrante" nunca sirven.');
          port = elegido;
          try {
            const lista = await navigator.serial.getPorts();
            this._puertoConocido = { indice: lista.indexOf(elegido), ati, fecha: Date.now() };
          } catch (_) {}
        }
        log(`Escáner Bluetooth conectado ✓ contesta: <b>${UI.esc(ati)}</b>`);
        return { nombre: `${ati} · Bluetooth COM`, protocolo: 'Bluetooth clásico SPP 115200' };
      } catch (e) {
        /* Que no quede el puerto medio abierto: si no se limpia acá, el próximo
           intento choca con "already open" y el error cambia de motivo. */
        await this._cerrarWebSerial();
        if (e && (e.name === 'NotFoundError' || /User cancelled|No port selected/i.test(e.message || '')))
          throw new Error('No se eligió ningún puerto COM. El vLinker tiene que estar emparejado en el Bluetooth de Windows; ' +
            'elegí el COM <b>saliente</b> del escáner (los que Windows llama "entrante" nunca sirven).');
        throw new Error(`No se pudo abrir el puerto COM del escáner: ${e.message || e}. ` +
          'Revisá que no lo tenga abierto otro programa y que el dongle esté enchufado al vehículo con el switch en contacto.');
      }
    }

    try {
      await this._puenteConectar();
    } catch (e) {
      throw new Error('No se pudo conectar al puente Bluetooth local. En Chrome/Edge de PC, asegúrate de emparejar el escáner en los Ajustes de Bluetooth de Windows.');
    }
    const api = this._api || '';
    if (!/^SERIAL:/i.test(api)) throw new Error('Selecciona el puerto COM del escaner en "Adaptador / puerto local".');
    const portName = api.substring(7);
    const equipo = (document.getElementById('obd-api')?.selectedOptions?.[0]?.textContent || '').trim();
    const c = await this._puenteOp({ op:'conectar', api, protocolo:'SPP', baud:115200 }, 6000);
    if (!c.ok) throw new Error(c.error || `No se pudo abrir Bluetooth clasico en ${portName}.`);
    this._serialReady = true;
    log(`Bluetooth clasico: <b>${equipo || portName}</b> @115200`);
    const identidad = await this._cmd('ATI', 3000).catch(() => '');
    const sonda = identidad.trim() ? identidad : await this._cmd('ATZ', 3000).catch(() => '');
    if (!sonda.trim()) throw new Error(`${portName} no contesto a ATI/ATZ. Revisa que en "Adaptador / puerto local" este elegido el COM de tu escaner ` +
      `(el desplegable ya muestra el nombre del equipo emparejado; los que dicen "puerto local entrante" nunca sirven), ` +
      `que el escaner este enchufado al vehiculo y con el switch en contacto.`);
    return { nombre: equipo || `Bluetooth ${portName}`, protocolo:'Bluetooth clasico SPP' };
  },

  async _usbInit(log) {
    await this._puenteConectar();
    const est = await this._puenteEstado();
    log(`Puente USB: <b>${est.dispositivo || 'RP1210'}</b> v${est.version || '?'} ✓`);
    const c = await this._puenteOp({ op:'conectar', protocolo:`CAN:Baud=${this._canBaud}`, device:1 });
    if (!c.ok) throw new Error(`El puente no pudo abrir el USB-Link: ${c.error || 'código ' + c.codigo}. ¿Está enchufado a la PC?`);
    for (const ext of [false, true]) {
      this._canExt = ext;
      log(`Probando CAN ${ext ? 29 : 11} bits / ${this._canBaud}k...`);
      const r = await this._usbElm('0100').catch(() => 'NO DATA');
      if (/4100/.test(r.replace(/\s/g, ''))) {
        this._protoNum = ext ? 7 : 6;
        return { nombre: est.dispositivo || 'USB-Link (RP1210)', protocolo: `CAN ${ext ? 29 : 11} bits / ${this._canBaud}k (USB)` };
      }
    }
    /* Antes se culpaba al cable y al switch. En un liviano anterior a ~2006 eso
       manda a revisar lo que esta bien: el vehiculo habla OBD-II, pero por
       K-line (pin 7), y por CAN no va a contestar nunca. */
    throw new Error(`El vehículo no respondió por OBD-II en CAN ${this._canBaud}k. ` +
      this._AVISO_KLINE_USB +
      ' Si es camión, probá "Automático", que además busca J1939.');
  },

  /* Emula un ELM327 sobre el puente: mismos comandos, misma respuesta hex */
  async _usbElm(cmd, timeout = 4000) {
    cmd = cmd.trim().toUpperCase();
    if (cmd.startsWith('AT')) {
      if (cmd === 'ATRV') return '';          // CAN crudo no reporta voltaje de batería
      if (cmd === 'ATDPN') return this._protoNum.toString(16).toUpperCase();
      if (cmd === 'ATDP') return 'CAN (USB RP1210)';
      return 'OK';
    }
    if (!/^[0-9A-F]{2,}$/.test(cmd)) return '?';
    const tx = cmd.match(/../g).map(h => parseInt(h, 16));
    const lineas = await this._isotp(tx, timeout);
    return lineas.length ? lineas.map(l => l.hex).join('\r') : 'NO DATA';
  },

  /* Cancelar tiene que dejar el driver COMO NUEVO, no solo cerrar el modal.
     El estado del canal (_busy, _resolve, _buf, el monitoreo) vive en el
     modulo y sobrevive al cierre: si se cancela con un comando a medias, lo
     que quedaba trabado seguia trabado y el siguiente escaneo no arrancaba —
     "al cancelar ya no vuelve a leer". Reportado el 2026-09-16. */
  /* ═══════════ MANTENER LA CONEXIÓN VIVA ═══════════
     Dos cosas distintas, las dos pedidas:

     1. Que el enlace no se caiga solo. Un dongle ELM327 se DUERME cuando no le
        hablan —los Vgate a los 3-5 minutos— y el Bluetooth del sistema apaga la
        radio para ahorrar batería. Un comando inofensivo cada pocos segundos lo
        mantiene despierto. Se usa ATI, que le habla AL DONGLE y no al vehículo:
        no abre ninguna sesión de diagnóstico ni toca ningún módulo.

     2. Que cerrar el reporte no corte la conexión. Antes, salir del escaneo
        desconectaba: para leer parámetros OEM o ejecutar un reset había que
        reconectar (y volver a elegir el escáner) cada vez.

     Lo que NO cambia: el canal de comandos se suelta igual. Ese estado (_busy,
     _resolve, el buffer) vive en el módulo y sobrevive al cierre — dejarlo a
     medias es lo que congelaba el escaneo siguiente. */
  _LATIDO_MS: 3000,
  _latido: null, _latidoFallos: 0,

  get _mantenerConexion() {
    try { return localStorage.getItem('obd_mantener') !== '0'; } catch (_) { return true; }
  },
  set _mantenerConexion(v) {
    try { localStorage.setItem('obd_mantener', v ? '1' : '0'); } catch (_) {}
  },

  _iniciarLatido() {
    if (this._latido) return;
    this._latidoFallos = 0;
    this._latido = setInterval(async () => {
      /* Si no hay nadie del otro lado ya no hay nada que mantener. */
      if (!this._listo) { this._pararLatido(); this._pintarEstadoConexion(); return; }
      /* No encimarse: el monitor en vivo ya está hablando todo el tiempo, y un
         comando a medias no se interrumpe para meter un saludo. */
      if (this._busy || this._liveTimer) return;
      try {
        const r = await this._cmd('ATI', 2500);
        if (r && String(r).trim()) this._latidoFallos = 0; else this._latidoFallos++;
      } catch (_) { this._latidoFallos++; }
      /* Tres seguidos sin respuesta es que se cayó de verdad, no un hipo. Se
         suelta en vez de quedar diciendo "conectado" sobre un enlace muerto,
         que es peor que decir "desconectado". */
      if (this._latidoFallos >= 3) {
        this._pararLatido();
        this._desconectar();
        this._pintarEstadoConexion();
        UI.toast('Se perdió la conexión con el escáner', 'warn');
      }
    }, this._LATIDO_MS);
  },

  _pararLatido() {
    if (this._latido) { clearInterval(this._latido); this._latido = null; }
    this._latidoFallos = 0;
  },

  /* El chip de la barra: "hay un escáner conectado ahora mismo" y cómo soltarlo.
     Sin esto, una conexión que sobrevive al modal es una conexión invisible —
     y una batería que se gasta sin que nadie sepa por qué. */
  _pintarEstadoConexion() {
    const el = document.getElementById('obd-estado-conexion');
    if (!el) return;
    if (!this._listo) { el.innerHTML = ''; return; }
    const quien = (this._bt && this._bt.nombre) || this._dev?.name ||
                  (this._oemAdaptador && this._oemAdaptador.modelo) ||
                  this._NOMBRE_VIA[this._via] || 'escáner';
    el.innerHTML = `<span class="badge badge-green" title="La conexión se mantiene abierta con un saludo al dongle cada ${this._LATIDO_MS / 1000} s. No se le manda nada al vehículo.">
        🔗 ${UI.esc(quien)}</span>
      <button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd.desconectarAhora()">Desconectar</button>`;
  },

  desconectarAhora() {
    this._pararLatido();
    this._desconectar();
    this._soltarCanal();
    this._pintarEstadoConexion();
    UI.toast('Escáner desconectado');
  },

  _cerrarEscaneo() {
    this._stopLive();
    /* El canal SIEMPRE se suelta, se mantenga o no la conexión: es el estado
       del diálogo, no del enlace. */
    if (this._mantenerConexion && this._listo) {
      this._soltarCanal();
      this._iniciarLatido();
      UI.cerrarModal();
      this._pintarEstadoConexion();
      UI.toast('Conexión mantenida — el escáner sigue enlazado', 'info');
      return;
    }
    this._pararLatido();
    this._desconectar();
    this._soltarCanal();
    UI.cerrarModal();
    this._pintarEstadoConexion();
  },

  /* Deja el canal de comandos en su estado inicial. Un comando a medias se
     rechaza explicitamente en vez de quedarse esperando para siempre. */
  _soltarCanal() {
    const pendiente = this._resolve;
    this._resolve = null;
    this._monLinea = null;
    this._buf = '';
    this._busy = false;
    /* Al pendiente se le contesta algo: dejarlo sin resolver es justo lo que
       congelaba el modulo. */
    if (pendiente) { try { pendiente(''); } catch (_) {} }
  },

};
