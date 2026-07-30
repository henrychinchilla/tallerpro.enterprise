/* NexusPro — Diagnóstico OBD-II
   · Bluetooth LE: adaptadores ELM327/Vgate/OBDLink/STN1110 (comandos AT + PIDs OBD-II).
     Solo BLE (Web Bluetooth no alcanza Bluetooth Classic ni WiFi).
   · USB (puente RP1210): adaptadores NEXIQ USB-Link y compatibles vía el puente
     local (carpeta puente-obd) — camiones J1939 (SPN/FMI) y livianos OBD-II sobre CAN. */
Modulos.diagnostico_obd = {
  _data: [], _vehiculos: [],
  _mes: null, _anio: null,

  /* ═══════════ DRIVER BLE / ELM327 ═══════════ */
  _dev: null, _char: null, _buf: '', _resolve: null,
  _protoNum: 0, _liveTimer: null, _busy: false,

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
  ],

  _UUIDS: [
    { svc:'0000fff0-0000-1000-8000-00805f9b34fb', wr:'0000fff2-0000-1000-8000-00805f9b34fb', nt:'0000fff1-0000-1000-8000-00805f9b34fb' },
    { svc:'0000ffe0-0000-1000-8000-00805f9b34fb', wr:'0000ffe1-0000-1000-8000-00805f9b34fb', nt:'0000ffe1-0000-1000-8000-00805f9b34fb' },
    { svc:'e7810a71-73ae-499d-8c15-faa9aef0c3f2', wr:'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', nt:'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
    { svc:'0000fff0-0000-1000-8000-00805f9b34fb', wr:'0000fff1-0000-1000-8000-00805f9b34fb', nt:'0000fff1-0000-1000-8000-00805f9b34fb' },
  ],

  get _conectado() { return !!(this._dev?.gatt?.connected && this._char); },
  /* "listo para leer" según la vía activa (BLE o puente USB) */
  get _listo() { return this._via === 'ble' ? this._conectado : !!(this._ws && this._ws.readyState === 1); },

  async _conectar() {
    if (!navigator.bluetooth)
      throw new Error('Este navegador no tiene Bluetooth. Usa Chrome/Edge en Android o en una PC con Bluetooth.');
    /* Web Bluetooth SÓLO deja ver los servicios declarados acá: getPrimaryServices()
       no devuelve nada fuera de esta lista. Por eso la autodetección de más abajo
       era letra muerta —no podía descubrir un servicio que no estuviera ya pedido—
       y un adaptador con UUID distinto fallaba aunque el código pareciera cubrirlo.
       La lista va ancha a propósito, aunque de varios no sepamos el par exacto de
       características: de eso se encarga la autodetección. */
    const svcs = [...new Set([...this._UUIDS.map(u => u.svc), ...this._SVC_CANDIDATOS])];
    const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices:true, optionalServices:svcs });
    const server = await dev.gatt.connect();

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
    if (!wr || !nt) { try { dev.gatt.disconnect(); } catch(_){}
      throw new Error('El dispositivo no parece ser un adaptador OBD BLE compatible.'); }

    await nt.startNotifications();
    nt.addEventListener('characteristicvaluechanged', e => {
      this._buf += new TextDecoder().decode(e.target.value);
      if (this._buf.includes('>') && this._resolve) {
        const r = this._resolve; this._resolve = null;
        r(this._buf.replace(/>/g, '').trim());
      }
    });
    dev.addEventListener('gattserverdisconnected', () => { this._char = null; this._stopLive(); });
    this._dev = dev; this._char = wr; this._buf = '';
    return dev.name || 'Adaptador OBD';
  },

  /* Envía un comando y espera la respuesta completa (termina en '>').
     Por USB se emula la respuesta del ELM327 para reusar todos los lectores. */
  async _cmd(c, timeout = 6000) {
    if (this._via === 'usb') {
      while (this._busy) await new Promise(r => setTimeout(r, 50));
      this._busy = true;
      try { return await this._usbElm(c, timeout); } finally { this._busy = false; }
    }
    if (!this._conectado) throw new Error('Adaptador desconectado');
    while (this._busy) await new Promise(r => setTimeout(r, 50));
    this._busy = true; this._buf = '';
    try {
      const p = new Promise((res, rej) => {
        this._resolve = res;
        setTimeout(() => { if (this._resolve) { this._resolve = null; rej(new Error(`Sin respuesta a ${c}`)); } }, timeout);
      });
      const data = new TextEncoder().encode(c + '\r');
      if (this._char.properties.writeWithoutResponse) await this._char.writeValueWithoutResponse(data);
      else await this._char.writeValue(data);
      return await p;
    } finally { this._busy = false; }
  },

  async _init(log) {
    log('Reiniciando adaptador (ATZ)...');
    await this._cmd('ATZ', 8000);
    for (const c of ['ATE0','ATL0','ATS0','ATH0']) await this._cmd(c);
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
    const dpn = await this._cmd('ATDPN');          // ej. 'A6' = auto, protocolo 6 (CAN)
    this._protoNum = parseInt((dpn.match(/[0-9A-F]$/i) || ['0'])[0], 16) || 0;
    const dp = await this._cmd('ATDP');
    return dp.replace(/AUTO,?\s*/i, '').trim();
  },

  /* Limpia una respuesta a solo líneas hex (quita prefijos de trama multilinea '0:','1:'...) */
  _hexLines(resp) {
    return resp.split(/[\r\n]+/)
      .map(l => l.trim().replace(/^[0-9A-F]{1,2}:/i, '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase())
      .filter(l => l.length >= 2);
  },

  async _leerVIN() {
    try {
      const hex = this._hexLines(await this._cmd('0902', 8000)).join('');
      const i = hex.indexOf('4902');
      if (i < 0) return null;
      let ascii = '';
      for (let p = i + 6; p + 1 < hex.length; p += 2) {   // +6: salta 4902 + nº de secuencia
        const ch = String.fromCharCode(parseInt(hex.substr(p, 2), 16));
        if (/[A-HJ-NPR-Z0-9]/.test(ch)) ascii += ch;      // charset VIN válido
      }
      const m = ascii.match(/[A-HJ-NPR-Z0-9]{17}/);
      return m ? m[0] : (ascii.length >= 11 ? ascii : null);
    } catch (_) { return null; }
  },

  /* Módulos que contestan OBD-II, preguntando a la dirección de difusión: cada
     computadora responde con la suya.
     OJO al alcance: NO son todas las computadoras del vehículo. ABS, airbag,
     dirección eléctrica o clima no están obligados a contestar aquí y en
     general no lo hacen — hablan UDS propietario de cada marca. Lo que se
     lista es lo que la norma garantiza, no el vehículo entero. */
  async _leerModulos() {
    try {
      const r = await this._cmdPorECU('0100', 5000);
      const mods = r.filter(x => x.hex.indexOf('4100') >= 0)
                    .map(x => ({ ecu: x.ecu, nombre: this._nombreModulo(x.ecu) }));
      return mods.length ? mods : null;
    } catch (_) { return null; }
  },

  /* modo '03' confirmados / '07' pendientes → [{codigo, ecu}].
     Cada ECU contesta con su propia dirección, así que el mismo código puede
     venir de dos módulos: se listan por separado en vez de deduplicar, porque
     "P0300 en el motor" y "P0300 en la transmisión" no son el mismo hallazgo. */
  async _leerDTCs(modo) {
    const ok = modo === '03' ? '43' : '47';
    const encontrados = [];
    try {
      for (const { ecu, hex } of await this._cmdPorECU(modo, 8000)) {
        const i = hex.indexOf(ok);
        if (i < 0) continue;
        let h = hex.slice(i + 2);
        if (this._protoNum >= 6) h = h.slice(2);          // CAN antepone el conteo de DTCs
        for (let p = 0; p + 3 < h.length; p += 4) {
          const c = this._decodeDTC(h.substr(p, 4));
          if (c && !encontrados.some(x => x.codigo === c && x.ecu === ecu)) encontrados.push({ codigo: c, ecu });
        }
      }
    } catch (_) {}
    return encontrados;
  },

  _decodeDTC(h4) {
    if (!/^[0-9A-F]{4}$/i.test(h4) || h4 === '0000') return null;
    const b = parseInt(h4[0], 16);
    return ['P','C','B','U'][b >> 2] + (b & 3) + h4.slice(1).toUpperCase();
  },

  async _leerMIL() {
    try {
      const hex = this._hexLines(await this._cmd('0101')).join('');
      const i = hex.indexOf('4101');
      if (i < 0) return { mil:false, n:0 };
      const a = parseInt(hex.substr(i + 4, 2), 16);
      return { mil: !!(a & 0x80), n: a & 0x7F };
    } catch (_) { return { mil:false, n:0 }; }
  },

  /* ═══════════ EQUIPAMIENTO DECLARADO Y ELIMINACIONES ═══════════
     Un vehículo al que le sacaron el DPF o el EGR no tiene fallas: anda "bien"
     justamente porque le quitaron lo que fallaba. No se detecta buscando
     códigos — se detecta viendo qué dice el propio ECU que monitorea.

     La norma obliga a cada motor a declarar sus monitores de disponibilidad.
     Un diésel al que le corresponde postratamiento TIENE que declarar el
     monitor de filtro de partículas y el de EGR. Si no los declara, no es una
     variante regional: se los borraron del software.

     Todo sale del propio vehículo y del VIN (público). No hace falta ninguna
     base de datos de equipamiento con licencia. */

  /* Monitores de disponibilidad (modo 01 PID 01), SAE J1979.
     Byte B bit 3 dice el tipo de motor, y eso cambia qué significan C y D. */
  _MON_DIESEL: {
    0x01:'Catalizador NMHC', 0x02:'Postratamiento NOx / SCR', 0x08:'Presión de sobrealimentación',
    0x20:'Sensor de gases de escape', 0x40:'Filtro de partículas (DPF)', 0x80:'Sistema EGR / VVT',
  },
  _MON_GASOLINA: {
    0x01:'Catalizador', 0x02:'Catalizador calentado', 0x04:'Sistema evaporativo',
    0x08:'Aire secundario', 0x10:'Refrigerante A/A', 0x20:'Sensor de oxígeno',
    0x40:'Calefactor de sonda', 0x80:'Sistema EGR',
  },
  /* Los otros tres monitores viven en el byte B y quedaban afuera de la lista:
     se mostraban 8 de los 11 que declara el vehículo. Son los CONTINUOS — el
     ECU los corre todo el tiempo, no una vez por ciclo — y son justo los que
     no completan cuando algo anda mal de verdad.
     Van con bit:null a propósito: sus máscaras (0x01, 0x02, 0x04) son las
     mismas que las del byte C, y el análisis de equipamiento busca por bit
     (`find(m => m.bit === 0x01)` = catalizador). Con el bit puesto, el
     catalizador pasaría a resolverse contra el monitor de fallo de encendido. */
  _MON_CONTINUOS: [
    { m:0x01, inc:0x10, nombre:'Fallo de encendido' },
    { m:0x02, inc:0x20, nombre:'Sistema de combustible' },
    { m:0x04, inc:0x40, nombre:'Componentes (sensores)' },
  ],

  async _leerReadiness() {
    try {
      const hex = this._hexLines(await this._cmd('0101')).join('');
      const i = hex.indexOf('4101');
      if (i < 0) return null;
      const b = [1, 2, 3].map(k => parseInt(hex.substr(i + 4 + k * 2, 2), 16));
      if (b.some(isNaN)) return null;
      const [B, C, D] = b;
      const diesel = !!(B & 0x08);
      const tabla = diesel ? this._MON_DIESEL : this._MON_GASOLINA;
      const monitores = [];
      /* Byte B: soportado en el bit bajo, sin completar en el bit alto. */
      for (const c of this._MON_CONTINUOS) {
        const soportado = !!(B & c.m);
        monitores.push({ nombre: c.nombre, bit: null, continuo: true,
                         soportado, listo: soportado && !(B & c.inc) });
      }
      for (const bit of Object.keys(tabla).map(Number)) {
        const soportado = !!(C & bit);
        /* En D, 1 = INCOMPLETO. Un monitor soportado y nunca completado también
           es señal: puede ser que se borraron los códigos hace poco, o que el
           sistema no llega a ejecutarse porque no está. */
        const listo = soportado && !(D & bit);
        monitores.push({ nombre: tabla[bit], bit, soportado, listo });
      }
      return { diesel, monitores };
    } catch (_) { return null; }
  },

  /* Norma OBD que el vehículo declara cumplir (PID 1C). Dice la región. */
  _OBD_STD: {
    1:'OBD-II (CARB, EE.UU.)', 2:'OBD (EPA, EE.UU.)', 3:'OBD y OBD-II', 4:'OBD-I',
    5:'Sin OBD', 6:'EOBD (Europa)', 7:'EOBD y OBD-II', 8:'EOBD y OBD', 9:'EOBD, OBD y OBD-II',
    10:'JOBD (Japón)', 11:'JOBD y OBD-II', 12:'JOBD y EOBD', 13:'JOBD, EOBD y OBD-II',
    17:'EMD (motores pesados)', 18:'EMD+', 19:'HD OBD-C (pesados, EE.UU.)',
    20:'HD OBD (pesados, EE.UU.)', 21:'WWH-OBD (mundial)', 23:'HD EOBD-I (Europa)',
    24:'HD EOBD-I N', 25:'HD EOBD-II', 28:'OBDBr-1 (Brasil)', 29:'OBDBr-2 (Brasil)',
    30:'KOBD (Corea)', 31:'IOBD-I (India)', 32:'IOBD-II (India)', 33:'HD EOBD-IV',
  },
  async _leerNormaOBD() {
    try {
      const b = await this._pid('1C', 3000);
      if (!b || !b.length) return null;
      return { codigo: b[0], nombre: this._OBD_STD[b[0]] || `Norma ${b[0]}` };
    } catch (_) { return null; }
  },

  /* Calibración del ECU (modo 09): CALID es el nombre del software y CVN su
     firma. Sirven para saber si a este motor le reprogramaron la computadora:
     dos vehículos iguales de fábrica traen el mismo CVN. */
  async _leerCalibracion() {
    const sacar = async (info, marca) => {
      try {
        const hex = this._hexLines(await this._cmd('09' + info, 8000)).join('');
        const i = hex.indexOf(marca);
        return i < 0 ? null : hex.slice(i + marca.length + 2);   // +2: salta el conteo
      } catch (_) { return null; }
    };
    const out = { calid: null, cvn: null };
    const h4 = await sacar('04', '4904');
    if (h4) {
      let s = '';
      for (let p = 0; p + 1 < h4.length; p += 2) {
        const c = String.fromCharCode(parseInt(h4.substr(p, 2), 16));
        if (/[\x20-\x7E]/.test(c)) s += c;
      }
      s = s.replace(/\s+/g, ' ').trim();
      if (s) out.calid = s;
    }
    const h6 = await sacar('06', '4906');
    if (h6) {
      const cvn = h6.replace(/[^0-9A-F]/gi, '').toUpperCase();
      if (cvn) out.cvn = cvn.match(/.{1,8}/g).slice(0, 4).join(' ');
    }
    return (out.calid || out.cvn) ? out : null;
  },

  /* Modo 0A: códigos PERMANENTES. No se borran desconectando la batería ni con
     el modo 04 — solo se van cuando el monitor correspondiente corre y pasa.
     Es lo que delata a quien "limpió" los códigos justo antes de vender. */
  async _leerPermanentes() {
    const encontrados = [];
    try {
      for (const { ecu, hex } of await this._cmdPorECU('0A', 8000)) {
        const i = hex.indexOf('4A');
        if (i < 0) continue;
        let h = hex.slice(i + 2);
        if (this._protoNum >= 6) h = h.slice(2);
        for (let p = 0; p + 3 < h.length; p += 4) {
          const c = this._decodeDTC(h.substr(p, 4));
          if (c && !encontrados.some(x => x.codigo === c && x.ecu === ecu)) encontrados.push({ codigo: c, ecu });
        }
      }
    } catch (_) {}
    return encontrados;
  },

  /* País de fabricación por el primer carácter del VIN (ISO 3780). Fija qué
     norma de emisiones le corresponde, que es lo que decide si "no tiene DPF"
     es normal o es una eliminación. */
  _paisVIN(vin) {
    if (!vin || vin.length < 10) return null;
    const c = vin[0].toUpperCase();
    const t = { '1':['Estados Unidos','us'], '4':['Estados Unidos','us'], '5':['Estados Unidos','us'],
                '2':['Canadá','us'], '3':['México','us'], '9':['Brasil','br'], '8':['Argentina','br'],
                'J':['Japón','jp'], 'K':['Corea','kr'], 'L':['China','cn'], 'M':['India','in'],
                'S':['Reino Unido','eu'], 'V':['Francia/España','eu'], 'W':['Alemania','eu'],
                'Y':['Suecia/Finlandia','eu'], 'Z':['Italia','eu'], 'T':['Suiza/Chequia','eu'] };
    const r = t[c];
    if (!r) return null;
    /* Décima posición = año modelo. Salta I, O, Q, U, Z y el 0.
       El código es CÍCLICO de 30 años: la misma letra vale para 1999 y 2029.
       Si resolver al ciclo actual da un año futuro, es del ciclo anterior. Sin
       esto un camión de 1999 se fechaba en 2029 y la revisión de equipamiento
       lo acusaba de haberle eliminado el DPF. */
    const cod = 'ABCDEFGHJKLMNPRSTVWXY123456789';
    const k = cod.indexOf(vin[9].toUpperCase());
    let anio = null;
    if (k >= 0) {
      anio = 2010 + k;
      const tope = new Date().getFullYear() + 1;   // el modelo puede adelantarse un año
      if (anio > tope) anio -= 30;
    }
    return { pais: r[0], region: r[1], anio };
  },

  /* Cruza todo y arma los hallazgos. Solo afirma lo que se puede sostener: si
     no hay VIN o no hay lectura de monitores, lo dice en vez de suponer. */
  _analizarEquipamiento({ readiness, norma, vin, calib }) {
    const av = [];
    const info = vin ? this._paisVIN(vin) : null;

    if (!readiness) {
      av.push({ nivel:'info', txt:'El vehículo no reportó monitores de disponibilidad: no se puede verificar el equipamiento de emisiones.' });
      return { avisos: av, origen: info, norma, calib };
    }

    if (readiness.diesel) {
      /* A un diésel con postratamiento le corresponden ambos. El corte por año
         es conservador a propósito: EPA 2010 y Euro V/VI en adelante. Antes de
         eso, no declararlos es legítimo y no se marca nada. */
      const exigible = !info || !info.anio || info.anio >= 2010;
      const dpf = readiness.monitores.find(m => m.bit === 0x40);
      const egr = readiness.monitores.find(m => m.bit === 0x80);
      const nox = readiness.monitores.find(m => m.bit === 0x02);
      if (exigible) {
        if (dpf && !dpf.soportado)
          av.push({ nivel:'alto', txt:'<b>No declara monitor de filtro de partículas (DPF).</b> A un diésel de este año le corresponde tenerlo: es señal de que el DPF fue eliminado del software.' });
        if (egr && !egr.soportado)
          av.push({ nivel:'alto', txt:'<b>No declara monitor de EGR.</b> Señal de que el sistema EGR fue eliminado del software.' });
        if (nox && !nox.soportado && info && info.region === 'us')
          av.push({ nivel:'medio', txt:'No declara monitor de postratamiento NOx / SCR. En un vehículo de EE.UU. de este año debería estar.' });
      } else if (info && info.anio) {
        av.push({ nivel:'info', txt:`Modelo ${info.anio}: no se exige postratamiento, así que la ausencia de monitores de DPF/EGR no es concluyente.` });
      }
      /* Soportado pero nunca completado: puede ser borrado reciente de códigos
         (para pasar una revisión) o un sistema que no llega a ejecutarse. */
      const pend = readiness.monitores.filter(m => m.soportado && !m.listo);
      if (pend.length)
        av.push({ nivel:'medio', txt:`Monitores declarados pero sin completar: ${pend.map(m => m.nombre).join(', ')}. Puede ser que se borraran los códigos hace poco.` });
    } else {
      const egr = readiness.monitores.find(m => m.bit === 0x80);
      const cat = readiness.monitores.find(m => m.bit === 0x01);
      if (cat && !cat.soportado)
        av.push({ nivel:'alto', txt:'<b>No declara monitor de catalizador.</b> Señal de catalizador eliminado del software.' });
      if (egr && !egr.soportado)
        av.push({ nivel:'medio', txt:'No declara monitor de EGR.' });
      const pend = readiness.monitores.filter(m => m.soportado && !m.listo);
      if (pend.length)
        av.push({ nivel:'medio', txt:`Monitores sin completar: ${pend.map(m => m.nombre).join(', ')}.` });
    }

    if (!vin) av.push({ nivel:'info', txt:'Sin VIN no se puede saber el origen ni el año, así que lo anterior se evalúa sin ese contexto.' });
    return { avisos: av, origen: info, norma, calib };
  },

  /* ── Comparación contra los iguales del taller ───────────────────────────
     Los monitores dicen si le falta algo que la NORMA exige — eso es
     concluyente solo. Pero para "a este le reprogramaron la computadora" o
     "a este le falta un módulo que sus hermanos sí traen" hace falta un
     baseline, y comprarle la lista de equipamiento a un proveedor no es una
     opción. La salida es comparar contra los MISMOS modelos que ya pasaron por
     el taller: eso es data propia y mejora sola con el uso.

     Es evidencia de mayoría, no prueba: por eso pide un mínimo de vehículos
     antes de afirmar nada, y dice sobre cuántos se apoya. */
  _MIN_IGUALES: 3,

  async _compararConIguales({ vehId, calib, readiness, modulos }) {
    try {
      const v = (this._vehiculos || []).find(x => x.id === vehId);
      if (!v || !v.marca || !v.modelo) return null;

      const previos = (await DB.getDiagnosticosPorModelo(v.marca, v.modelo, v.anio))
        .filter(d => d.vehiculo_id !== vehId);          // otros vehículos, no este
      /* Un vehículo puede tener varios escaneos: vale UNO por vehículo, si no
         el que más veces entró al taller decide por todos. */
      const porVeh = {};
      for (const d of previos) if (!porVeh[d.vehiculo_id]) porVeh[d.vehiculo_id] = d;
      const iguales = Object.values(porVeh);

      const res = { marca:v.marca, modelo:v.modelo, anio:v.anio, n: iguales.length, avisos: [] };
      if (iguales.length < this._MIN_IGUALES) {
        res.insuficiente = true;
        return res;
      }

      /* CVN: la firma del software. Si la mayoría comparte una y este trae otra,
         a este le tocaron la calibración. */
      const cvn = calib && calib.cvn;
      if (cvn) {
        const cuenta = {};
        for (const d of iguales) {
          const c = d.calibracion && d.calibracion.cvn;
          if (c) cuenta[c] = (cuenta[c] || 0) + 1;
        }
        const total = Object.values(cuenta).reduce((a, b) => a + b, 0);
        const dominante = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0];
        if (dominante && total >= this._MIN_IGUALES && dominante !== cvn && cuenta[dominante] >= Math.ceil(total * 0.6)) {
          res.avisos.push({ nivel:'alto',
            txt:`<b>La calibración del ECU no coincide con la de sus iguales.</b> ${cuenta[dominante]} de ${total} ${v.marca} ${v.modelo} del taller traen <code>${UI.esc(dominante)}</code> y este trae <code>${UI.esc(cvn)}</code>. Señal de computadora reprogramada.` });
        }
      }

      /* Monitores que los iguales declaran y este no: sistema eliminado. */
      if (readiness && readiness.monitores) {
        const mios = new Set(readiness.monitores.filter(m => m.soportado).map(m => m.nombre));
        const cuenta = {};
        let conLectura = 0;
        for (const d of iguales) {
          const r = d.readiness;
          if (!r || !r.monitores) continue;
          conLectura++;
          for (const m of r.monitores) if (m.soportado) cuenta[m.nombre] = (cuenta[m.nombre] || 0) + 1;
        }
        if (conLectura >= this._MIN_IGUALES) {
          for (const nombre of Object.keys(cuenta)) {
            if (mios.has(nombre)) continue;
            if (cuenta[nombre] < Math.ceil(conLectura * 0.7)) continue;   // que sea la norma del modelo
            res.avisos.push({ nivel:'alto',
              txt:`<b>No declara el monitor de ${UI.esc(nombre)}</b>, que ${cuenta[nombre]} de ${conLectura} ${v.marca} ${v.modelo} del taller sí declaran. Señal de sistema eliminado.` });
          }
        }
      }

      /* Módulos que los iguales tienen y este no responde. Acá está la
         diferencia entre "no lo trae" y "lo trae y está muerto". */
      const mios = new Set((modulos || []).map(m => String(m.nombre || m.ecu)));
      const cuenta = {};
      let conModulos = 0;
      for (const d of iguales) {
        if (!Array.isArray(d.modulos) || !d.modulos.length) continue;
        conModulos++;
        for (const m of d.modulos) {
          const k = String(m.nombre || m.ecu);
          cuenta[k] = (cuenta[k] || 0) + 1;
        }
      }
      if (conModulos >= this._MIN_IGUALES) {
        for (const k of Object.keys(cuenta)) {
          if (mios.has(k)) continue;
          if (cuenta[k] < Math.ceil(conModulos * 0.7)) continue;
          res.avisos.push({ nivel:'medio',
            txt:`<b>${UI.esc(k)} no respondió</b>, y ${cuenta[k]} de ${conModulos} ${v.marca} ${v.modelo} del taller sí lo tienen. Puede estar dañado, desconectado o sin alimentación — verificar antes de darlo por ausente.` });
        }
      }
      return res;
    } catch (e) { console.warn('_compararConIguales:', e.message); return null; }
  },

  /* ═══════════ LA VISITA ANTERIOR DEL MISMO VEHÍCULO ═══════════
     Comparar contra los iguales del taller contesta "¿le falta algo que sus
     hermanos traen?". Falta la otra pregunta, la que el taller se hace apenas
     enchufa el escáner: <b>¿volvió lo que reparamos la vez pasada?</b>
     Eso no lo contesta el escaneo de hoy solo, y el de la visita anterior ya
     está guardado — sólo que hasta ahora nadie lo leía.

       reincidente — estaba, se fue, y volvió. Es el dato caro: decide si la
                     reparación aguantó y si la garantía la paga el taller.
       nuevo       — apareció después de la última visita.
       resuelto    — estaba y hoy no está.

     "Resuelto" pesa distinto según cómo se fue. Si en la visita anterior se
     borraron los códigos, que hoy no aparezca puede ser reparación buena o que
     todavía no se dio la condición que lo dispara. Se dice cuál de las dos se
     sabe en vez de anotarse una reparación que quizás no ocurrió. */

  /* Todos los códigos de un escaneo, de emisiones y por módulo, en un Map por
     código. Un mismo código puede venir de dos módulos: gana el primero, pero
     el módulo se guarda para poder decir dónde estaba. */
  _codigosDe(s) {
    const m = new Map();
    if (!s) return m;
    for (const d of (s.dtcs || []))
      if (d && d.codigo && !m.has(d.codigo))
        m.set(d.codigo, { codigo:d.codigo, modulo:d.modulo || this._nombreModulo(d.ecu), desc:d.desc || '' });
    for (const mod of (s.por_modulo || []))
      for (const c of (mod.codigos || []))
        if (c && c.codigo && !m.has(c.codigo))
          m.set(c.codigo, { codigo:c.codigo, modulo:mod.nombre || '', desc:c.desc || '' });
    return m;
  },

  /* `hasta` = fecha del escaneo que se está comparando. Al escanear en vivo no
     hay ninguna y se usa ahora; al abrir un escaneo guardado, la suya, para
     que se compare contra el que de verdad lo precedió y no contra el último. */
  async _compararConAnterior(vehId, actual, hasta) {
    try {
      if (!vehId) return null;
      const ref = hasta ? new Date(hasta).getTime() : Date.now();
      const previos = (await DB.getDiagnosticosPorVehiculo(vehId))
        .filter(d => new Date(d.created_at).getTime() < ref);
      if (!previos.length) return { primera: true };

      const ant = previos[0];
      const antes = this._codigosDe(ant), hoy = this._codigosDe(actual);
      const dias = Math.max(0, Math.round((ref - new Date(ant.created_at).getTime()) / 86400000));
      const permAntes = new Set((ant.permanentes || []).map(p => p.codigo));
      const permHoy = new Set((actual.permanentes || []).map(p => p.codigo));

      return {
        previo_id: ant.id, fecha: ant.created_at, dias, n: previos.length,
        reincidentes: [...hoy.values()].filter(c => antes.has(c.codigo)),
        nuevos:       [...hoy.values()].filter(c => !antes.has(c.codigo)),
        resueltos:    [...antes.values()].filter(c => !hoy.has(c.codigo)),
        /* Un permanente que sigue ahí después de la reparación no es un código
           más: significa que el monitor todavía no volvió a pasar, así que el
           vehículo no está confirmado aunque el Check Engine esté apagado. */
        perm_siguen: [...permHoy].filter(c => permAntes.has(c)),
        borrados_antes: !!ant.dtcs_borrados,
        mil_antes: !!ant.mil,
      };
    } catch (e) { console.warn('_compararConAnterior:', e.message); return null; }
  },

  /* El resultado va también a la bitácora del escaneo: el mecánico lo ve
     mientras corre, sin esperar al reporte. */
  _logComparacion(c, log) {
    if (!c) { log('&nbsp;&nbsp;<span style="color:var(--text3)">Sin escaneos anteriores para comparar</span>'); return; }
    if (c.primera) { log('&nbsp;&nbsp;<span style="color:var(--text3)">Primera visita de este vehículo — desde la próxima se compara</span>'); return; }
    const cuando = c.dias === 0 ? 'hoy mismo' : c.dias === 1 ? 'hace 1 día' : `hace ${c.dias} días`;
    log(`&nbsp;&nbsp;Última visita ${cuando}`);
    if (c.reincidentes.length)
      log(`<span style="color:var(--red)">🔁 <b>Volvieron ${c.reincidentes.length} código(s)</b>: ${c.reincidentes.map(x => x.codigo).join(', ')} — la reparación no aguantó</span>`);
    if (c.nuevos.length)
      log(`<span style="color:var(--amber)">🆕 ${c.nuevos.length} código(s) nuevo(s): ${c.nuevos.map(x => x.codigo).join(', ')}</span>`);
    if (c.resueltos.length)
      log(`<span style="color:var(--green)">✅ ${c.resueltos.length} código(s) ya no aparece(n): ${c.resueltos.map(x => x.codigo).join(', ')}</span>`);
    if (!c.reincidentes.length && !c.nuevos.length && !c.resueltos.length)
      log('&nbsp;&nbsp;<span style="color:var(--green)">Sin cambios respecto de la visita anterior</span>');
  },

  _historialHTML(s) {
    const c = s && s.comparacion;
    if (!c) return '';
    if (c.primera) return `<div class="card" style="padding:14px;margin-top:12px">
      <b style="font-size:12px">📆 PRIMERA VISITA DE ESTE VEHÍCULO</b>
      <div style="font-size:11.5px;color:var(--text3);margin-top:3px">
        No hay escaneo anterior con qué comparar. Desde la próxima entrada, acá va a decir qué código volvió,
        cuál es nuevo y cuál se resolvió — que es lo que responde si la reparación aguantó.</div>
    </div>`;

    const cuando = c.dias === 0 ? 'hoy mismo' : c.dias === 1 ? 'hace 1 día' : `hace ${c.dias} días`;
    const lista = (arr, color) => `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:5px">
      ${arr.map(x => `<span style="background:var(--${color}-dim);border:1px solid var(--${color}-border);color:var(--text);
        border-radius:6px;padding:3px 8px;font-size:11.5px">
        <b style="font-family:ui-monospace,Consolas,monospace">${UI.esc(x.codigo)}</b>${x.modulo ? ` <span style="color:var(--text3)">· ${UI.esc(x.modulo)}</span>` : ''}</span>`).join('')}
    </div>`;

    const rein = c.reincidentes || [], nuev = c.nuevos || [], resu = c.resueltos || [];
    const col = rein.length ? 'red' : nuev.length ? 'amber' : 'green';
    return `<div class="card" style="padding:14px;margin-top:12px;border-left:3px solid var(--${col})">
      <b style="font-size:12px">📆 COMPARADO CON LA VISITA ANTERIOR (${cuando})</b>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">
        ${UI.fecha(c.fecha)}${c.mil_antes ? ' · Check Engine estaba encendido' : ''}${c.borrados_antes ? ' · se borraron los códigos en esa visita' : ''}
      </div>

      ${rein.length ? `<div style="margin-top:10px">
        <b style="font-size:11.5px;color:var(--red)">🔁 VOLVIERON ${rein.length} código(s)</b>
        ${lista(rein, 'red')}
        <div style="font-size:10.5px;color:var(--text3);margin-top:5px;line-height:1.5">
          Estaban en la visita anterior y siguen. <b>La falla no quedó resuelta</b>: si se cambió una pieza por
          este código, o no era la pieza o la causa está antes. Revisá la guía del código en vez de repetir el
          mismo cambio.</div>
      </div>` : ''}

      ${nuev.length ? `<div style="margin-top:10px">
        <b style="font-size:11.5px;color:var(--amber)">🆕 ${nuev.length} código(s) nuevo(s) desde entonces</b>
        ${lista(nuev, 'amber')}
      </div>` : ''}

      ${resu.length ? `<div style="margin-top:10px">
        <b style="font-size:11.5px;color:var(--green)">✅ ${resu.length} código(s) ya no aparece(n)</b>
        ${lista(resu, 'green')}
        ${c.borrados_antes ? `<div style="font-size:10.5px;color:var(--text3);margin-top:5px;line-height:1.5">
          En la visita anterior se borraron los códigos, así que esto todavía <b>no confirma la reparación</b>:
          un código que necesita cierta condición para volver a saltar puede tardar días en reaparecer.</div>` : ''}
      </div>` : ''}

      ${!rein.length && !nuev.length && !resu.length
        ? '<div style="font-size:12px;color:var(--green);margin-top:8px">Sin cambios respecto de la visita anterior.</div>' : ''}

      ${(c.perm_siguen || []).length ? `<div style="margin-top:10px;background:var(--amber-dim);border:1px solid var(--amber-border);
        border-radius:6px;padding:7px 9px;font-size:11px;line-height:1.5;color:var(--text)">
        <b>Siguen ${c.perm_siguen.length} código(s) permanente(s)</b> desde la visita anterior
        (${c.perm_siguen.map(x => UI.esc(x)).join(', ')}). El ECU los suelta solo cuando el monitor vuelve a pasar:
        mientras estén, la reparación no está confirmada por el propio vehículo.</div>` : ''}

      <div style="font-size:10px;color:var(--text3);margin-top:8px;line-height:1.5">
        Se comparan los códigos confirmados de emisiones y los del escaneo por módulo. Los pendientes no entran:
        van y vienen solos y ensuciarían la comparación.
      </div>
    </div>`;
  },

  /* Lee un PID modo 01 y devuelve los bytes de datos */
  async _pid(pid, timeout = 4000) {
    const hex = this._hexLines(await this._cmd('01' + pid, timeout)).join('');
    const i = hex.indexOf('41' + pid.toUpperCase());
    if (i < 0) return null;
    const bytes = [];
    for (let p = i + 4; p + 1 < hex.length && bytes.length < 4; p += 2)
      bytes.push(parseInt(hex.substr(p, 2), 16));
    return bytes.length ? bytes : null;
  },

  /* Catálogo de PIDs modo 01 — se leen solo los que el vehículo reporta soportar.
     r  = rango de referencia [min,max] que se dibuja como banda en la gráfica.
     rc = condición en la que ese rango vale (se muestra al mecánico: un MAP de
          90 kPa está mal en ralentí y bien a fondo, así que el rango sin su
          condición engaña).
     a  = true sólo si estar fuera del rango es señal de falla pase lo que pase.
          Sin esto la herramienta gritaría "¡falla!" cada vez que se acelera. */
  _PIDS: {
    '0C': { k:'rpm',       l:'RPM',                    u:'',      f:b=>Math.round((b[0]*256+b[1])/4), r:[600,1000], rc:'en ralentí' },
    '0D': { k:'vel',       l:'Velocidad',              u:' km/h', f:b=>b[0] },
    '05': { k:'temp',      l:'Temp. motor',            u:' °C',   f:b=>b[0]-40, r:[80,105], rc:'motor caliente', a:true },
    '04': { k:'carga',     l:'Carga motor',            u:' %',    f:b=>Math.round(b[0]*100/255), r:[15,35], rc:'en ralentí' },
    '11': { k:'acel',      l:'Acelerador',             u:' %',    f:b=>Math.round(b[0]*100/255), r:[0,20], rc:'pie fuera' },
    '0F': { k:'temp_adm',  l:'Temp. admisión',         u:' °C',   f:b=>b[0]-40, r:[10,60] },
    '2F': { k:'comb',      l:'Combustible',            u:' %',    f:b=>Math.round(b[0]*100/255) },
    '06': { k:'stft1',     l:'Ajuste combustible corto', u:' %',  f:b=>Math.round((b[0]/1.28-100)*10)/10, r:[-10,10], a:true },
    '07': { k:'ltft1',     l:'Ajuste combustible largo', u:' %',  f:b=>Math.round((b[0]/1.28-100)*10)/10, r:[-10,10], a:true },
    '0A': { k:'pres_comb', l:'Presión de combustible', u:' kPa',  f:b=>b[0]*3 },
    '0B': { k:'map',       l:'Presión admisión (MAP)', u:' kPa',  f:b=>b[0], r:[25,45], rc:'en ralentí' },
    '0E': { k:'avance',    l:'Avance de encendido',    u:' °',    f:b=>b[0]/2-64, r:[0,25], rc:'en ralentí' },
    '10': { k:'maf',       l:'Flujo de aire (MAF)',    u:' g/s',  f:b=>Math.round((b[0]*256+b[1])/10)/10, r:[2,6], rc:'en ralentí' },
    '1F': { k:'marcha',    l:'Tiempo encendido',       u:' min',  f:b=>Math.round((b[0]*256+b[1])/60) },
    '21': { k:'dist_mil',  l:'Km con Check Engine',    u:' km',   f:b=>b[0]*256+b[1] },
    '33': { k:'baro',      l:'Presión barométrica',    u:' kPa',  f:b=>b[0] },
    '42': { k:'volt_ecu',  l:'Voltaje ECU',            u:' V',    f:b=>Math.round((b[0]*256+b[1])/10)/100, r:[13.2,14.8], rc:'motor encendido', a:true },
    '46': { k:'temp_amb',  l:'Temp. ambiente',         u:' °C',   f:b=>b[0]-40 },
    '5C': { k:'temp_aceite',l:'Temp. aceite',          u:' °C',   f:b=>b[0]-40, r:[80,110], rc:'motor caliente', a:true },
    '5E': { k:'tasa_comb', l:'Consumo',                u:' L/h',  f:b=>Math.round((b[0]*256+b[1])/20*10)/10 },
    /* ── agregados 2026-07-27: el Picanto soportaba 38 PIDs y se leían 13 ── */
    '14': { k:'o2_b1s1',   l:'Sonda lambda B1S1',      u:' V',    f:b=>Math.round(b[0]/200*1000)/1000, r:[0.1,0.9], rc:'debe oscilar, no quedarse fija', a:true },
    '15': { k:'o2_b1s2',   l:'Sonda lambda B1S2',      u:' V',    f:b=>Math.round(b[0]/200*1000)/1000, r:[0.4,0.8], rc:'post-catalizador: estable' },
    '44': { k:'lambda',    l:'Relación de mezcla (λ)', u:'',      f:b=>Math.round((b[0]*256+b[1])*2/65536*1000)/1000, r:[0.97,1.03], a:true },
    '3C': { k:'temp_cat',  l:'Temp. catalizador',      u:' °C',   f:b=>Math.round(((b[0]*256+b[1])/10-40)*10)/10, r:[400,800], rc:'caliente y en marcha' },
    '43': { k:'carga_abs', l:'Carga absoluta',         u:' %',    f:b=>Math.round((b[0]*256+b[1])*100/255), r:[15,35], rc:'en ralentí' },
    '2E': { k:'evap',      l:'Purga EVAP (cánister)',  u:' %',    f:b=>Math.round(b[0]*100/255) },
    '45': { k:'acel_rel',  l:'Acelerador relativo',    u:' %',    f:b=>Math.round(b[0]*100/255), r:[0,20], rc:'pie fuera' },
    '47': { k:'acel_abs',  l:'Acelerador absoluto B',  u:' %',    f:b=>Math.round(b[0]*100/255) },
    '49': { k:'pedal_d',   l:'Pedal acelerador D',     u:' %',    f:b=>Math.round(b[0]*100/255) },
    '4A': { k:'pedal_e',   l:'Pedal acelerador E',     u:' %',    f:b=>Math.round(b[0]*100/255) },
    '4C': { k:'acel_cmd',  l:'Acelerador comandado',   u:' %',    f:b=>Math.round(b[0]*100/255) },
    '56': { k:'ltft2s',    l:'Ajuste sonda post-cat',  u:' %',    f:b=>Math.round((b[0]/1.28-100)*10)/10, r:[-10,10], a:true },
    '30': { k:'warmups',   l:'Calentamientos desde borrado', u:'', f:b=>b[0] },
    '31': { k:'dist_borr', l:'Km desde borrado',       u:' km',   f:b=>b[0]*256+b[1] },
  },
  _BASICOS: ['0C','0D','05','04','11','0F','2F'],
  _sop: null,   // PIDs soportados por el vehículo actual

  /* Bitmaps 0100/0120/0140: qué PIDs soporta este vehículo */
  async _leerSoportados() {
    const sop = [];
    for (const base of [0x00, 0x20, 0x40]) {
      let bytes = null;
      try { bytes = await this._pid(base.toString(16).padStart(2,'0').toUpperCase(), 6000); } catch (_) {}
      if (!bytes || bytes.length < 4) break;
      for (let i = 0; i < 32; i++)
        if (bytes[i >> 3] & (0x80 >> (i & 7)))
          sop.push((base + i + 1).toString(16).padStart(2,'0').toUpperCase());
      if (!sop.includes((base + 0x20).toString(16).padStart(2,'0').toUpperCase())) break;
    }
    return sop.filter(p => this._PIDS[p]);
  },

  async _leerVivo(pids, log) {
    /* J1939 y J1587 son buses de difusión: nadie pregunta, los módulos emiten
       solos. Se muestrea lo que se acumuló en vez de pedir PID por PID. */
    if (this._via === 'j1939' || this._via === 'j1708') {
      await new Promise(r => setTimeout(r, 250));
      const acum = this._via === 'j1708' ? this._j87 : this._j39;
      const src = (acum && acum.datos) || {}, dj = {};
      for (const k of (pids && pids.length ? pids : Object.keys(src)))
        if (src[k] !== undefined) dj[k] = src[k];
      if (src.volt) dj.volt = src.volt;
      return dj;
    }
    const d = {};
    const lista = (pids && pids.length ? pids : this._BASICOS);
    let n = 0;
    for (const pid of lista) {
      const def = this._PIDS[pid];
      if (!def) continue;
      /* 1500 ms y no 4000: un sensor que no contesta no puede costar 4 s cuando
         son 30. Los que sí contestan tardan ~300 ms. */
      try { const b = await this._pid(pid, 1500); if (b) d[def.k] = def.f(b); } catch (_) {}
      if (log && ++n % 6 === 0) log(`&nbsp;&nbsp;… ${n} de ${lista.length}`);
    }
    try { d.volt = (await this._cmd('ATRV')).match(/[\d.]+V?/)?.[0] || null; } catch (_) {}
    return d;
  },

  /* Freeze frame (modo 02): snapshot que la ECU guardó al momento de la falla.
     La respuesta lleva PID + nº de frame (00) antes de los datos. */
  async _pidF(pid) {
    try {
      const hex = this._hexLines(await this._cmd('02' + pid + '00', 5000)).join('');
      const i = hex.indexOf('42' + pid);
      if (i < 0) return null;
      const bytes = [];
      for (let p = i + 6; p + 1 < hex.length && bytes.length < 4; p += 2)
        bytes.push(parseInt(hex.substr(p, 2), 16));
      return bytes.length ? bytes : null;
    } catch (_) { return null; }
  },

  /* ═══════════ MODO 06 — monitores a bordo (valor medido + límites) ═══════════
     Es la única fuente en OBD-II genérico de los contadores de fallo de
     encendido POR CILINDRO, y la única que entrega el límite del fabricante
     junto al valor medido.
     Respuesta: 46 [MID][TID][UAS][valor×2][mín×2][máx×2] … 9 bytes por prueba.

     NO se convierten unidades a propósito. El byte UAS (unidad y escala) mapea
     a una tabla de J1979 que no está verificada contra este hardware, y
     escribirla de memoria mostraría números plausibles pero falsos en una
     herramienta de diagnóstico — el mismo criterio que ya se aplicó con los
     códigos P1xxx de fabricante. Valor y límites llegan en la MISMA escala, así
     que el veredicto dentro/fuera de límites es válido igual, y en los
     cilindros el valor ya es un conteo de fallos directo. */
  _nombreMID(mid) {
    if (mid >= 0x01 && mid <= 0x0A) return `Fallo de encendido · cilindro ${mid}`;
    if (mid === 0x41) return 'Monitor de catalizador · banco 1';
    if (mid === 0x42) return 'Monitor de catalizador · banco 2';
    return `Monitor $${mid.toString(16).padStart(2, '0').toUpperCase()}`;
  },

  /* Devuelve los bytes que siguen al '46' de cada ECU que conteste */
  async _modo6(mid) {
    const h = mid.toString(16).padStart(2, '0').toUpperCase();
    const out = [];
    try {
      for (const line of this._hexLines(await this._cmd('06' + h, 7000))) {
        const i = line.indexOf('46' + h);
        if (i < 0) continue;
        const b = [];
        for (let p = i + 2; p + 1 < line.length; p += 2) b.push(parseInt(line.substr(p, 2), 16));
        if (b.length) out.push(b);
      }
    } catch (_) {}
    return out;
  },

  async _leerMonitores(log) {
    const BITMAPS = [0x00, 0x20, 0x40, 0x60, 0x80, 0xA0];
    const mids = [];
    for (const base of BITMAPS) {
      const r = await this._modo6(base);
      if (!r.length) break;
      const b = r[0].slice(1);                      // [0] es el eco del MID pedido
      if (b.length < 4) break;
      for (let i = 0; i < 32; i++)
        if (b[i >> 3] & (0x80 >> (i & 7))) mids.push(base + i + 1);
      if (!(b[3] & 1)) break;                       // bit 32 = "hay más en el rango siguiente"
    }
    const pruebas = [];
    for (const mid of mids.filter(m => !BITMAPS.includes(m))) {
      for (const b of await this._modo6(mid)) {
        for (let p = 0; p + 8 < b.length; p += 9) {  // 9 bytes por prueba
          const uas = b[p+2];
          /* Los UAS con el bit alto puesto son valores CON SIGNO. Leerlos sin
             signo daba mínimos mayores que los máximos (visto en el MID $35 de
             un vehículo real): basura que se reportaba como "fuera de límite". */
          const u16 = (h, l) => (h << 8) | l;
          const s16 = (h, l) => { const v = u16(h, l); return v >= 0x8000 ? v - 0x10000 : v; };
          const n = (uas & 0x80) ? s16 : u16;
          const val = n(b[p+3], b[p+4]), min = n(b[p+5], b[p+6]), max = n(b[p+7], b[p+8]);
          const sinTope = u16(b[p+7], b[p+8]) === 0xFFFF, sinPiso = u16(b[p+5], b[p+6]) === 0x0000;
          pruebas.push({
            mid: b[p], tid: b[p+1], uas, val, min, max, sinTope, sinPiso,
            cilindro: b[p] >= 0x01 && b[p] <= 0x0A ? b[p] : null,
            /* Sin límites reales no hay nada que juzgar; y si el mínimo supera
               al máximo, la trama no se interpretó bien: mejor no opinar que
               inventar un veredicto. */
            ok: (sinTope && sinPiso) || min > max ? null : (val >= min && val <= max),
          });
        }
      }
    }
    if (log) log(`${pruebas.length} prueba(s) de monitores en ${mids.length} módulo(s) ✓`);
    return pruebas.length ? pruebas : null;
  },

  _monitoresHTML(ms) {
    if (!ms || !ms.length) return '';
    const cil = ms.filter(m => m.cilindro), otros = ms.filter(m => !m.cilindro);
    const fila = m => {
      /* Ámbar y no rojo a propósito: un monitor que todavía no corrió en este
         ciclo reporta un valor bajo y saldría "fuera" sin estar fallando. */
      const est = m.ok === null ? '<span style="color:var(--text3)">sin evaluar</span>'
        : m.ok ? '<span style="color:var(--green)">✓ dentro</span>'
               : '<span style="color:var(--amber);font-weight:700">fuera de límite</span>';
      return `<tr><td>${this._nombreMID(m.mid)}<span style="color:var(--text3);font-size:10px"> · prueba $${m.tid.toString(16).padStart(2,'0').toUpperCase()}</span></td>
        <td style="text-align:right;font-weight:700">${m.val}</td>
        <td style="text-align:right;color:var(--text3)">${m.sinPiso ? '—' : m.min}</td>
        <td style="text-align:right;color:var(--text3)">${m.sinTope ? '—' : m.max}</td>
        <td style="text-align:right">${est}</td></tr>`;
    };
    return `<div class="section" style="margin-top:14px">
      <b>MONITORES A BORDO (modo 06) — valor medido y límites del fabricante</b>
      ${cil.length ? `<div style="font-size:11px;color:var(--text3);margin:6px 0 2px">Fallo de encendido por cilindro</div>` : ''}
      <table class="table" style="font-size:12px">
        <thead><tr><th>Monitor</th><th style="text-align:right">Medido</th><th style="text-align:right">Mín</th><th style="text-align:right">Máx</th><th style="text-align:right">Estado</th></tr></thead>
        <tbody>${cil.map(fila).join('')}${otros.map(fila).join('')}</tbody>
      </table>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">
        Los valores están en la escala interna de la ECU (no se convierten a unidades para no mostrar
        cifras falsas). El veredicto es válido igual: medido y límites vienen en la misma escala.
        En los cilindros el valor ya es el conteo de fallos.
        <b>"Fuera de límite" no es lo mismo que falla</b>: un monitor que todavía no completó su ciclo
        de manejo reporta un valor bajo y aparece fuera sin estar averiado. Confirmá siempre contra
        los códigos de falla y el Check Engine.
      </div>
    </div>`;
  },

  async _leerFreeze() {
    const b = await this._pidF('02');
    if (!b || b.length < 2) return null;
    const dtc = this._decodeDTC((b[0].toString(16).padStart(2,'0') + b[1].toString(16).padStart(2,'0')).toUpperCase());
    if (!dtc) return null;
    const fz = { dtc };
    for (const pid of ['04','05','0C','0D','11']) {
      const v = await this._pidF(pid);
      if (v) fz[this._PIDS[pid].k] = this._PIDS[pid].f(v);
    }
    return fz;
  },

  /* Decodifica el VIN contra la API pública de NHTSA (gratuita, con CORS abierto).
     Cubre vehículos comercializados en EE.UU. — la mayoría del parque importado. */
  async _decodeVIN(vin) {
    try {
      const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
      const x = (await r.json())?.Results?.[0];
      if (!x || !x.Make) return null;
      const comb = { 'Gasoline':'Gasolina', 'Diesel':'Diésel', 'Electric':'Eléctrico',
                     'Flexible Fuel Vehicle (FFV)':'Flex', 'Compressed Natural Gas (CNG)':'Gas natural' };
      return {
        marca: x.Make, modelo: x.Model || null, anio: x.ModelYear || null,
        motor: [x.DisplacementL && `${(+x.DisplacementL).toFixed(1)}L`, x.EngineCylinders && `${x.EngineCylinders} cil`]
          .filter(Boolean).join(' ') || null,
        cilindros: x.EngineCylinders || null,
        combustible: comb[x.FuelTypePrimary] || x.FuelTypePrimary || null,
        pais: x.PlantCountry || null,
      };
    } catch (_) { return null; }
  },

  /* ═══════════ CAMPAÑAS DE FÁBRICA Y QUEJAS (NHTSA) ═══════════
     Antes de cotizar una reparación hay que ver si el fabricante ya la cubre
     gratis por un llamado a revisión: cobrarle al cliente algo que la agencia
     le hace sin costo es el error caro. La API de NHTSA es de dominio público,
     sin llave y con CORS abierto (api.nhtsa.gov está en connect-src del CSP).
     Cubre el mercado de EE.UU.: un vehículo importado de otro mercado (japonés,
     europeo) puede no aparecer aunque sí tenga campaña en su país de origen. */
  async _nhtsaConsulta(ruta, marca, modelo, anio) {
    const q = `make=${encodeURIComponent(marca)}&model=${encodeURIComponent(modelo)}&modelYear=${encodeURIComponent(anio)}`;
    const r = await fetch(`https://api.nhtsa.gov/${ruta}?${q}`);
    /* 400 = NHTSA no reconoce esa combinación (el taller escribe "Corolla XLI 1.8"
       y su catálogo dice "COROLLA"). No es una falla: se devuelve vacío para que
       el reintento con el nombre corto llegue a correr. */
    if (r.status === 400) return [];
    if (!r.ok) throw new Error(`NHTSA respondió ${r.status}`);
    return (await r.json())?.results || [];
  },

  /* El modelo que escribe el taller ("Corolla XLI 1.8") no siempre coincide con
     el catálogo de NHTSA ("COROLLA"): si no hay resultados se reintenta con la
     primera palabra antes de dar por hecho que no hay campañas. */
  async _nhtsaBuscar(ruta, marca, modelo, anio) {
    const limpio = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const ma = limpio(marca), mo = limpio(modelo), an = parseInt(anio, 10);
    if (!ma || !mo || !an) return [];
    let res = await this._nhtsaConsulta(ruta, ma, mo, an);
    const corto = mo.split(/\s+/)[0];
    if (!res.length && corto && corto !== mo) res = await this._nhtsaConsulta(ruta, ma, corto, an);
    return res;
  },

  /* NHTSA clasifica con un catálogo fijo y corto de componentes: traducirlo es
     barato y es lo primero que el mecánico lee. El resumen y la solución quedan
     en inglés (texto libre): se marcan como tal en vez de arriesgar una
     traducción automática de algo que define una reparación. */
  _NHTSA_COMP: {
    'AIR BAGS':'Bolsas de aire', 'SEAT BELTS':'Cinturones de seguridad',
    'SERVICE BRAKES':'Frenos de servicio', 'SERVICE BRAKES, HYDRAULIC':'Frenos hidráulicos',
    'POWER TRAIN':'Tren motriz', 'ENGINE':'Motor', 'ENGINE AND ENGINE COOLING':'Motor y refrigeración',
    'ELECTRICAL SYSTEM':'Sistema eléctrico', 'FUEL SYSTEM':'Sistema de combustible',
    'FUEL SYSTEM, GASOLINE':'Sistema de combustible (gasolina)',
    'STEERING':'Dirección', 'SUSPENSION':'Suspensión', 'STRUCTURE':'Estructura/carrocería',
    'VEHICLE SPEED CONTROL':'Control de velocidad', 'EXTERIOR LIGHTING':'Luces exteriores',
    'INTERIOR LIGHTING':'Luces interiores', 'WHEELS':'Ruedas', 'TIRES':'Llantas',
    'VISIBILITY':'Visibilidad', 'VISIBILITY/WIPER':'Visibilidad/limpiaparabrisas',
    'LATCHES/LOCKS/LINKAGES':'Cerraduras y seguros', 'EQUIPMENT':'Equipamiento',
    'TRAILER HITCHES':'Enganche de remolque', 'PARKING BRAKE':'Freno de mano',
    'BACK OVER PREVENTION':'Asistencia de reversa', 'FORWARD COLLISION AVOIDANCE':'Prevención de colisión',
    'UNKNOWN OR OTHER':'Sin clasificar', 'OTHER':'Otros',
  },

  _comp(nombre) {
    const n = String(nombre || '').trim().toUpperCase();
    if (this._NHTSA_COMP[n]) return this._NHTSA_COMP[n];
    /* "AIR BAGS: AIR BAG/RESTRAINT CONTROL MODULE" → traduce la familia y deja el detalle */
    const [fam, ...resto] = n.split(':');
    const t = this._NHTSA_COMP[fam.trim()];
    return t ? (resto.length ? `${t}: ${resto.join(':').trim().toLowerCase()}` : t) : nombre;
  },

  /* ═══════════ BOLETINES DE FÁBRICA (TSB) ═══════════
     Un boletín es una falla que la propia marca ya reconoció para ese modelo, con
     su procedimiento. Revisarlo antes de diagnosticar desde cero ahorra horas: si
     el síntoma ya está descrito, el camino corto es el del fabricante.
     El índice se sirve como archivo estático (data/tsb/MARCA/INICIAL.json), no
     ocupa base de datos y queda cacheado para trabajar sin señal.
     Se genera con tools/tsb/generar.py desde los archivos públicos de NHTSA. */
  /* Mismo slug que usa tools/tsb/generar.py para nombrar los archivos.
     Si uno cambia, hay que cambiar el otro. */
  _tsbSlug(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || '_';
  },

  /* El taller escribe "Corolla XLI 1.8" y el catálogo dice "COROLLA": hay que
     resolver el nombre contra el índice de modelos antes de pedir el archivo. */
  async _tsbModelo(marcaSlug, modelo) {
    this._tsbIdx = this._tsbIdx || {};
    if (!(marcaSlug in this._tsbIdx)) {
      try {
        const r = await fetch(`/data/tsb/${marcaSlug}/_modelos.json`);
        this._tsbIdx[marcaSlug] = r.ok ? await r.json() : null;
      } catch (_) { this._tsbIdx[marcaSlug] = null; }
    }
    const lista = this._tsbIdx[marcaSlug];
    if (!lista || !lista.length) return null;
    const mo = this._tsbSlug(modelo);
    if (lista.includes(mo)) return mo;
    /* Prioridad: que el nombre del catálogo esté contenido en lo que escribió el
       taller (COROLLA dentro de COROLLA-XLI-1-8), y de esos el más largo. Solo si
       no hay ninguno se acepta al revés, y ahí el más corto: con "SILVERADO" a
       secas no se puede elegir entre 1500 y 2500, mejor no inventar la versión. */
    const contenidos = lista.filter(m => mo.startsWith(m + '-'));
    if (contenidos.length) return contenidos.sort((a, b) => b.length - a.length)[0];
    const amplios = lista.filter(m => m.startsWith(mo + '-'));
    if (amplios.length) return amplios.sort((a, b) => a.length - b.length)[0];
    return null;
  },

  async _tsbBuscar(marca, modelo, anio) {
    const ma = this._tsbSlug(marca);
    if (!ma || !modelo) return [];
    const mod = await this._tsbModelo(ma, modelo);
    if (!mod) return [];
    let datos;
    try {
      const resp = await fetch(`/data/tsb/${ma}/${mod}.json`);
      if (!resp.ok) return [];          // marca/modelo sin índice: no es error
      datos = await resp.json();
    } catch (_) { return []; }
    const an = parseInt(anio, 10) || null;
    return an ? datos.filter(b => an >= b.d && an <= b.h) : datos;
  },

  _tsbHTML(boletines, marca, modelo, anio) {
    if (!boletines.length) {
      return `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
        <b style="font-size:12px">📄 BOLETINES DE FÁBRICA (TSB)</b>
        <div style="font-size:12px;margin-top:4px;color:var(--text3)">
          Sin boletines para ese modelo y año en el índice descargado.
          <a href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener">Buscar en NHTSA →</a>
        </div></div>`;
    }
    /* Agrupados por componente: el mecánico llega con un síntoma ("suena la
       suspensión"), no con un número de boletín. */
    const porComp = {};
    boletines.forEach(b => { (porComp[b.c || 'SIN CLASIFICAR'] ||= []).push(b); });
    const grupos = Object.entries(porComp).sort((a, b) => b[1].length - a[1].length);
    return `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
      <b style="font-size:12px">📄 BOLETINES DE FÁBRICA (TSB) — ${boletines.length} para ${UI.esc(marca)} ${UI.esc(modelo)}${anio ? ' ' + UI.esc(anio) : ''}</b>
      <div style="font-size:11px;color:var(--text3);margin:2px 0 6px">
        Fallas que la marca ya reconoció en este modelo. Buscá el síntoma antes de diagnosticar desde cero.
      </div>
      <input class="form-input" style="width:100%;font-size:12px;margin-bottom:6px" placeholder="Filtrar por síntoma: ruido, fuga, transmisión…"
             oninput="Modulos.diagnostico_obd._filtrarTSB(this.value)">
      <div id="tsb-lista" style="max-height:340px;overflow-y:auto">
        ${grupos.map(([comp, bs]) => `
          <div class="tsb-grupo" data-txt="${UI.esc((comp + ' ' + bs.map(b => b.t).join(' ')).toLowerCase())}">
            <div style="font-weight:800;font-size:11.5px;color:var(--cyan);margin:6px 0 2px">${UI.esc(this._comp(comp))} (${bs.length})</div>
            ${bs.slice(0, 25).map(b => `
              <div class="tsb-item" data-txt="${UI.esc((b.t + ' ' + b.n).toLowerCase())}" style="border-bottom:1px solid var(--border);padding:5px 0">
                <div style="font-size:12px">${UI.esc(b.t)}</div>
                <div style="font-size:10.5px;color:var(--text3)">Boletín ${UI.esc(b.n)} · ${UI.esc(b.m)} ${b.d}${b.h !== b.d ? '–' + b.h : ''}${b.f ? ` · ${UI.esc(b.f.slice(0,4))}` : ''}</div>
              </div>`).join('')}
            ${bs.length > 25 ? `<div style="font-size:10.5px;color:var(--text3);padding:4px 0">y ${bs.length - 25} más en este componente — usá el filtro</div>` : ''}
          </div>`).join('')}
      </div>
      <div style="font-size:10.5px;color:var(--text3);margin-top:6px">
        Índice de NHTSA (dominio público). El texto completo del boletín lo publica la marca:
        pedilo por su número en el concesionario o en el sistema de la agencia.
      </div></div>`;
  },

  _filtrarTSB(texto) {
    const q = String(texto || '').toLowerCase().trim();
    document.querySelectorAll('#tsb-lista .tsb-item').forEach(el => {
      el.style.display = !q || el.dataset.txt.includes(q) ? '' : 'none';
    });
    document.querySelectorAll('#tsb-lista .tsb-grupo').forEach(g => {
      const visibles = [...g.querySelectorAll('.tsb-item')].some(i => i.style.display !== 'none');
      g.style.display = visibles ? '' : 'none';
    });
  },

  /* Pinta campañas + quejas dentro de un contenedor ya existente. */
  async pintarCampanas(idContenedor, marca, modelo, anio) {
    const el = document.getElementById(idContenedor);
    if (!el) return;
    el.innerHTML = `<div class="card" style="padding:14px;margin-top:12px;font-size:12px;color:var(--text3)">🔎 Consultando campañas de fábrica en NHTSA…</div>`;
    /* Cada fuente se resuelve por separado a propósito: los boletines salen de un
       archivo local y tienen que verse aunque NHTSA esté caído o no haya internet,
       que es justo cuando el taller más los necesita. */
    const [resCamp, quejas, boletines] = await Promise.all([
      this._nhtsaBuscar('recalls/recallsByVehicle', marca, modelo, anio).catch(e => ({ falla: e.message })),
      this._nhtsaBuscar('complaints/complaintsByVehicle', marca, modelo, anio).catch(() => []),
      this._tsbBuscar(marca, modelo, anio).catch(() => []),
    ]);
    const fallaNhtsa = resCamp && resCamp.falla ? resCamp.falla : null;
    const campanas = fallaNhtsa ? [] : resCamp;

    /* Las quejas sirven agrupadas: "en este modelo lo que más reportan es X".
       Una por una son 200+ relatos sueltos y no ayudan a decidir qué revisar. */
    const porComponente = {};
    quejas.forEach(q => String(q.components || 'OTROS').split(/\s*,\s*/).map(c => this._comp(c)).forEach(c => {
      if (c) porComponente[c] = (porComponente[c] || 0) + 1;
    }));
    const top = Object.entries(porComponente).sort((a, b) => b[1] - a[1]).slice(0, 6);

    el.innerHTML = `
      <div class="card" style="padding:14px;margin-top:12px;border-left:3px solid ${campanas.length ? 'var(--red)' : 'var(--border)'}">
        <b style="font-size:12px">🔔 CAMPAÑAS DE FÁBRICA (NHTSA) — ${UI.esc(marca)} ${UI.esc(modelo)} ${UI.esc(anio)}</b>
        ${campanas.length ? `
          <div style="font-size:12px;color:var(--red);font-weight:800;margin-top:4px">
            ${campanas.length} llamado(s) a revisión: la agencia debe repararlo sin costo. Confirmar con el número de campaña antes de cotizar.
          </div>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
            ${campanas.slice(0, 8).map(c => `
              <div style="border:1px solid var(--border);border-radius:8px;padding:8px">
                <div style="font-weight:800;font-size:12.5px">${UI.esc(this._comp(c.Component) || 'Componente no indicado')}</div>
                <div style="font-size:11px;color:var(--text3);margin:2px 0">Campaña ${UI.esc(c.NHTSACampaignNumber || '—')}${c.ReportReceivedDate ? ` · ${UI.esc(c.ReportReceivedDate)}` : ''}</div>
                <div style="font-size:12px">${UI.esc((c.Summary || '').slice(0, 300))}</div>
                <div style="font-size:10px;color:var(--text3)">texto original de NHTSA (inglés)</div>
                ${c.Remedy ? `<div style="font-size:12px;margin-top:4px"><b>Solución de fábrica:</b> ${UI.esc(c.Remedy.slice(0, 300))}</div>` : ''}
              </div>`).join('')}
          </div>
          ${campanas.length > 8 ? `<div style="font-size:11px;color:var(--text3);margin-top:6px">y ${campanas.length - 8} más — se muestran las 8 primeras</div>` : ''}
        ` : fallaNhtsa
            ? `<div style="font-size:12px;margin-top:4px;color:var(--amber)">⚠️ No se pudo consultar NHTSA (${UI.esc(fallaNhtsa)}). Los boletines de abajo son locales y sí están disponibles.</div>`
            : `<div style="font-size:12px;margin-top:4px">Sin campañas registradas en NHTSA.</div>`}
        ${top.length ? `
          <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
            <b style="font-size:12px">📋 LO QUE MÁS REPORTAN LOS DUEÑOS (${quejas.length} quejas)</b>
            <div style="font-size:12px;margin-top:4px">${top.map(([c, n]) => `${UI.esc(c)} <b>(${n})</b>`).join(' · ')}</div>
          </div>` : ''}
        ${this._tsbHTML(boletines, marca, modelo, anio)}
        <div style="font-size:10.5px;color:var(--text3);margin-top:8px">
          Fuente: NHTSA (gobierno de EE.UU., dominio público). Cubre el mercado estadounidense;
          un vehículo importado de otro mercado puede no aparecer aquí.
        </div>
      </div>`;
  },

  /* Consulta suelta, sin necesidad de escanear: sirve al cotizar. */
  modalCampanas() {
    const vs = this._vehiculos || [];
    UI.modal('🔔 Campañas de fábrica', `
      <p style="font-size:12.5px;color:var(--text2);margin-bottom:10px">
        Revisa si el fabricante tiene un llamado a revisión para este vehículo. La reparación
        de una campaña la hace la agencia <b>sin costo</b>: conviene verificarlo antes de cotizar.
      </p>
      ${vs.length ? `<label class="form-label">Tomar datos de un vehículo del taller</label>
      <select class="form-select" style="width:100%;margin-bottom:10px" onchange="Modulos.diagnostico_obd._llenarCampanas(this.value)">
        <option value="">— escribir a mano —</option>
        ${vs.map(v => `<option value="${UI.esc(v.id)}">${UI.esc(v.placa || '')} ${UI.esc(v.marca || '')} ${UI.esc(v.modelo || '')} ${UI.esc(v.anio || '')}</option>`).join('')}
      </select>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr 90px;gap:8px">
        <div><label class="form-label">Marca</label><input class="form-input" id="camp-marca" placeholder="Toyota"></div>
        <div><label class="form-label">Modelo</label><input class="form-input" id="camp-modelo" placeholder="Corolla"></div>
        <div><label class="form-label">Año</label><input class="form-input" id="camp-anio" type="number" placeholder="2015"></div>
      </div>
      <button class="btn btn-brand" style="width:100%;margin-top:10px" onclick="Modulos.diagnostico_obd.buscarCampanas()">🔎 Buscar</button>
      <div id="camp-res"></div>
    `, '620px');
  },

  _llenarCampanas(id) {
    const v = (this._vehiculos || []).find(x => x.id === id);
    if (!v) return;
    document.getElementById('camp-marca').value = v.marca || '';
    document.getElementById('camp-modelo').value = v.modelo || '';
    document.getElementById('camp-anio').value = v.anio || '';
  },

  buscarCampanas() {
    const marca = document.getElementById('camp-marca').value.trim();
    const modelo = document.getElementById('camp-modelo').value.trim();
    const anio = document.getElementById('camp-anio').value.trim();
    if (!marca || !modelo || !anio) return UI.toast('Marca, modelo y año son necesarios', 'warn');
    this.pintarCampanas('camp-res', marca, modelo, anio);
  },

  _desconectar() {
    this._stopLive();
    try { this._dev?.gatt?.disconnect(); } catch (_) {}
    this._dev = this._char = null;
    try { if (this._ws?.readyState === 1) { this._ws.send(JSON.stringify({ op:'desconectar' })); this._ws.close(); } } catch (_) {}
    this._ws = null; this._j39 = null; this._canRx = null; this._via = 'ble';
  },

  /* ═══════════ PUENTE USB (RP1210 — NEXIQ USB-Link y compatibles) ═══════════
     Un programa local pequeño (carpeta puente-obd del repo) expone el adaptador
     USB por WebSocket en localhost:17210. El puente es una tubería tonta: toda
     la lógica de protocolo vive aquí (se actualiza con deploy, sin recompilar). */
  _ws: null, _wsPend: {}, _via: 'ble', _j39: null, _canExt: false, _canRx: null,

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
          rej(new Error('No se encontró el puente USB en esta PC. Ejecuta iniciar-puente.bat (carpeta puente-obd), deja su ventana abierta y reintenta.')); }
      };
    });
  },

  _puenteMsg(m) {
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

    throw new Error('No se detectó ningún bus: ni OBD-II (CAN 500k/250k), ni J1939 (250k/500k), ni J1708. Verificá que el switch esté en contacto y el cable bien puesto en el conector.');
  },

  /* ── Vehículos livianos por USB: OBD-II sobre CAN crudo con ISO-TP propio ── */
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
    throw new Error(`El vehículo no respondió por OBD-II en CAN ${this._canBaud}k. Probá la opción "Automático", que además busca bus J1939 de camión. Verificá switch en contacto y cable bien puesto. (El USB-Link es solo USB: la opción Bluetooth es para un dongle ELM327/Vgate aparte.)`);
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

  /* Nombre del módulo por su dirección de respuesta. Sólo se nombran las dos
     que la norma fija; el resto se muestra por dirección en vez de inventarle
     un nombre que podría ser de otro fabricante. */
  _nombreModulo(ecu) {
    if (!ecu) return 'Módulo no identificado';
    if (ecu === 0x7E8) return 'Motor (ECM)';
    if (ecu === 0x7E9) return 'Transmisión (TCM)';
    return `Módulo 0x${ecu.toString(16).toUpperCase()}`;
  },

  /* Como _cmd, pero devuelve [{ecu, hex}] para atribuir cada respuesta a su
     módulo. Por Bluetooth el ELM327 oculta la dirección salvo que se enciendan
     cabeceras (ATH1), así que ahí se devuelve ecu:null y la interfaz lo dice
     en vez de atribuirle el código al módulo equivocado. */
  async _cmdPorECU(cmd, timeout = 8000) {
    if (this._via !== 'usb') {
      return this._hexLines(await this._cmd(cmd, timeout)).map(hex => ({ ecu: null, hex }));
    }
    while (this._busy) await new Promise(r => setTimeout(r, 50));
    this._busy = true;
    try {
      const tx = cmd.trim().toUpperCase().match(/../g).map(h => parseInt(h, 16));
      return await this._isotp(tx, timeout);
    } finally { this._busy = false; }
  },

  /* Trama RP1210/CAN del USB-Link (verificado en vehículo real 2026-07-27):
     [tipo][id][datos] donde tipo 0 = 11 bits con id de 2 bytes, 1 = 29 bits con
     id de 4 bytes. Mandar siempre 4 bytes lo rechaza con ERR_MESSAGE_TOO_LONG. */
  _canTx(id, datos) {
    const data8 = datos.concat(Array(Math.max(0, 8 - datos.length)).fill(0));
    const cab = this._canExt
      ? [1, (id >>> 24) & 0xFF, (id >>> 16) & 0xFF, (id >>> 8) & 0xFF, id & 0xFF]
      : [0, (id >>> 8) & 0xFF, id & 0xFF];
    return this._puenteOp({ op:'enviar', datos: [...cab, ...data8] });
  },

  /* Lectura: [timestamp×4][tipo][id 2 ó 4 bytes][datos...] — el largo del id lo
     manda la trama misma, no lo que creemos que estamos hablando. */
  _canFrame(d) {
    if (d.length < 8 || !this._canRx) return;
    const ext = d[4] === 1;
    const id = ext ? (((d[5] << 24) | (d[6] << 16) | (d[7] << 8) | d[8]) >>> 0)
                   : (((d[5] << 8) | d[6]) >>> 0);
    this._canRx(id, d.slice(ext ? 9 : 7));
  },

  /* ISO-TP (ISO 15765-2) mínimo: single/first/consecutive + flow control.
     Junta las respuestas de todas las ECUs (como hace un ELM327 real). */
  async _isotp(tx, timeout) {
    const ecus = {};
    let ultimo = Date.now();
    const fcId = rid => this._canExt ? ((0x18DA0000 | ((rid & 0xFF) << 8) | 0xF1) >>> 0) : rid - 8;
    this._canRx = (id, b) => {
      const esResp = this._canExt ? ((id & 0x1FFFFF00) === 0x18DAF100) : (id >= 0x7E8 && id <= 0x7EF);
      if (!esResp || !b.length) return;
      ultimo = Date.now();
      const pci = b[0] >> 4, e = (ecus[id] = ecus[id] || {});
      if (pci === 0) { e.datos = b.slice(1, 1 + (b[0] & 0xF)); e.ok = e.datos.length > 0; }
      else if (pci === 1) {
        e.len = ((b[0] & 0xF) << 8) | b[1];
        e.datos = b.slice(2);
        this._canTx(fcId(id), [0x30, 0, 0]).catch(() => {});   // FC: envía todo, sin pausa
      } else if (pci === 2 && e.datos && !e.ok) {
        e.datos = e.datos.concat(b.slice(1));
        if (e.datos.length >= e.len) { e.datos = e.datos.slice(0, e.len); e.ok = true; }
      }
    };
    try {
      await this._canTx(this._canExt ? 0x18DB33F1 : 0x7DF, [tx.length, ...tx]);
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        await new Promise(r => setTimeout(r, 60));
        const hay = Object.values(ecus).some(e => e.ok);
        const pendiente = Object.values(ecus).some(e => e.datos && !e.ok);
        if (hay && !pendiente && Date.now() - ultimo > 250) break;
      }
    } finally { this._canRx = null; }
    /* Se conserva la dirección de la ECU: sin eso no se puede decir QUÉ módulo
       reportó cada código, que es justo lo que distingue a un escáner serio. */
    return Object.entries(ecus).filter(([, e]) => e.ok)
      .map(([id, e]) => ({ ecu: +id, hex: e.datos.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase() }));
  },

  /* ═══════════ ESCANEO COMPLETO POR MÓDULO (UDS sobre CAN) ═══════════
     El modo 03 de OBD-II solo lo contestan los módulos de emisiones: motor y
     transmisión. Todo lo demás — ABS, TPMS, carrocería, airbag, tracción — tiene
     su propia dirección y solo habla si se le pregunta directo.

     Verificado en un Nissan Rogue 2017 el 2026-07-29: por modo 03 el vehículo
     reportaba CERO códigos, y preguntando módulo por módulo aparecieron 16,
     entre ellos el TPMS de la rueda con presión baja y los sensores de rueda
     que alimentan al AWD. Las dos alarmas que el tablero mostraba y el escaneo
     de emisiones no veía.

     No hace falta ningún protocolo con licencia: es UDS estándar (ISO 14229)
     sobre CAN. Lo que hacía falta era preguntar en el lugar correcto. */

  /* Direcciones frecuentes. Sirven para poner un nombre; lo que manda para
     saber QUÉ es cada módulo son los códigos que reporta (C=chasis, B=carrocería,
     P=motor/transmisión, U=red), porque las direcciones cambian entre marcas. */
  _UDS_NOMBRES: {
    0x7E0:'Motor (ECM)', 0x7E1:'Transmisión (TCM)', 0x7E2:'Módulo 0x7E2', 0x7E3:'Módulo 0x7E3',
    0x740:'Frenos / ABS', 0x742:'Dirección asistida', 0x743:'Tablero de instrumentos',
    0x744:'Airbag / SRS', 0x745:'Carrocería (BCM)', 0x746:'Climatización',
    0x748:'Control de tracción', 0x74D:'Puerta de enlace / gateway',
    0x752:'Carrocería auxiliar', 0x758:'Presión de neumáticos (TPMS)',
    0x760:'Frenos / ABS', 0x765:'Carrocería (BCM)',
  },
  _nombreUDS(req, codigos) {
    if (this._UDS_NOMBRES[req]) return this._UDS_NOMBRES[req];
    /* En 29 bits lo que identifica al modulo es el byte de destino, no el id
       entero: 0x18DA10F1 es "el modulo 0x10". La tabla de nombres es de
       direcciones de 11 bits, asi que no aplica — se muestra el destino, que
       es lo que se busca en la documentacion de la marca. */
    if (req > 0x7FF) {
      const dst = (req >> 8) & 0xFF;
      const l = (codigos || []).map(c => c.codigo[0]);
      const fam = l.length && l.every(x => x === l[0])
        ? ({ C:'Chasis / frenos', B:'Carroceria', P:'Motor / transmision', U:'Red' })[l[0]] : null;
      return `${fam || 'Modulo'} 0x${dst.toString(16).toUpperCase()} (29 bits)`;
    }
    /* Sin nombre conocido, se deduce por el tipo de códigos que reporta: es más
       honesto que inventarle un nombre que podría ser de otra marca. */
    const l = (codigos || []).map(c => c.codigo[0]);
    if (l.length) {
      if (l.every(x => x === 'C')) return `Chasis / frenos (0x${req.toString(16).toUpperCase()})`;
      if (l.every(x => x === 'B')) return `Carrocería (0x${req.toString(16).toUpperCase()})`;
      if (l.every(x => x === 'P')) return `Motor / transmisión (0x${req.toString(16).toUpperCase()})`;
    }
    return `Módulo 0x${req.toString(16).toUpperCase()}`;
  },

  /* Diálogo UDS punto a punto con UN módulo. El _isotp normal solo escucha
     0x7E8-0x7EF (las respuestas de emisiones), así que no sirve acá. */
  async _udsPedir(reqId, respId, tx, timeout = 2500) {
    let datos = null, len = 0, ok = false;
    this._canRx = (id, b) => {
      if (id !== respId || !b.length) return;
      const pci = b[0] >> 4;
      if (pci === 0) { datos = b.slice(1, 1 + (b[0] & 0x0F)); ok = datos.length > 0; }
      else if (pci === 1) {
        len = ((b[0] & 0x0F) << 8) | b[1];
        datos = b.slice(2);
        /* Flow Control. Sin esto el módulo se queda esperando y solo se ve el
           primer fragmento: un módulo con 8 códigos parece tener uno o ninguno. */
        this._canTx(reqId, [0x30, 0x00, 0x00]).catch(() => {});
      } else if (pci === 2 && datos && !ok) {
        datos = datos.concat(b.slice(1));
        if (datos.length >= len) { datos = datos.slice(0, len); ok = true; }
      }
    };
    try {
      await this._canTx(reqId, [tx.length, ...tx]);
      const t0 = Date.now();
      while (Date.now() - t0 < timeout && !ok) await new Promise(r => setTimeout(r, 40));
    } catch (_) {} finally { this._canRx = null; }
    return ok ? datos : null;
  },

  /* Pregunta "¿hay alguien?" en cada dirección y anota quién contesta y desde
     qué ID responde. La relación pregunta→respuesta no es fija (vimos +0x20,
     +0x08 y saltos irregulares en el mismo vehículo), así que se escucha todo
     en vez de suponer el ID de vuelta. */
  async _barrerModulos(log) {
    const hallados = [];
    let capt = [];
    this._canRx = (id, b) => { capt.push({ id, b }); };
    try {
      for (let req = 0x700; req <= 0x7EF; req++) {
        capt = [];
        /* 3E 00 = Tester Present: es de solo lectura, no cambia nada en el
           vehículo. Es la forma segura de preguntar si hay un módulo ahí. */
        await this._canTx(req, [0x02, 0x3E, 0x00]).catch(() => {});
        await new Promise(r => setTimeout(r, 70));
        for (const c of capt) {
          if (c.id === req) continue;
          if (hallados.some(h => h.req === req && h.resp === c.id)) continue;
          hallados.push({ req, resp: c.id, ext: false });
        }
        if (log && (req & 0x3F) === 0x3F)
          log(`&nbsp;&nbsp;<span style="color:var(--text3)">…0x${req.toString(16).toUpperCase()} (${hallados.length} encontrados)</span>`);
      }
    } finally { this._canRx = null; }
    return hallados;
  },

  /* ── El mismo barrido, pero en 29 bits ──────────────────────────────────
     El barrido de arriba recorre 0x700-0x7EF, que son direcciones de 11 bits.
     Un vehículo que diagnostica con direccionamiento EXTENDIDO no tiene nada
     en ese rango: la pregunta va a 0x18DA{destino}F1 y la respuesta vuelve por
     0x18DAF1{destino} (F1 = el equipo de diagnóstico, ISO 15765-4). A esos
     vehículos el barrido les devolvía cero módulos — no porque no tuvieran,
     sino porque se les estaba tocando la puerta equivocada.

     256 destinos posibles; se recorren todos porque el rango bajo (0x00-0x3F)
     cubre motor y transmisión pero carrocería y chasis viven bastante más
     arriba y cada marca los ubica distinto. */
  async _barrerModulos29(log) {
    const hallados = [];
    let capt = [];
    const extPrev = this._canExt;
    this._canExt = true;
    this._canRx = (id, b) => { capt.push({ id, b }); };
    try {
      for (let dst = 0x00; dst <= 0xFF; dst++) {
        const req = (0x18DA0000 | (dst << 8) | 0xF1) >>> 0;
        capt = [];
        await this._canTx(req, [0x02, 0x3E, 0x00]).catch(() => {});
        await new Promise(r => setTimeout(r, 70));
        for (const c of capt) {
          if (c.id === req) continue;
          if (hallados.some(h => h.req === req && h.resp === c.id)) continue;
          hallados.push({ req, resp: c.id, ext: true, dst });
        }
        if (log && (dst & 0x3F) === 0x3F)
          log(`&nbsp;&nbsp;<span style="color:var(--text3)">…destino 0x${dst.toString(16).toUpperCase()} en 29 bits (${hallados.length} encontrados)</span>`);
      }
    } finally { this._canRx = null; this._canExt = extPrev; }
    return hallados;
  },

  /* Respuesta a UDS 19 02: [59][02][máscara][DTC 3 bytes + estado]…
     El estado trae los bits que distinguen una falla presente AHORA de una
     guardada de antes — la diferencia entre mandar a revisar y no. */
  _dtcsUDS(d) {
    if (!d || d[0] !== 0x59) return [];
    const out = [];
    for (let i = 3; i + 3 < d.length; i += 4) {
      const a = d[i], b = d[i+1], sub = d[i+2], st = d[i+3];
      if ((a === 0 && b === 0 && sub === 0) || (a === 0xFF && b === 0xFF)) continue;

      /* Bits de estado (ISO 14229):
           bit0 testFailed        — está fallando AHORA
           bit2 pendingDTC        — falló en este ciclo, sin confirmar
           bit3 confirmedDTC      — falla confirmada y guardada
           bit6 testNotCompleted  — el monitor NO llegó a correr

         Pedimos la máscara 0xFF, así que el módulo devuelve TODOS los códigos
         que sabe reportar, no solo los que fallaron. El TCM de un Rogue
         contestó ~60 entradas, todas con estado 0x40 (monitor sin correr): si
         se mostraran como fallas, el reporte inventaría 60 averías que no
         existen. Solo cuenta como falla lo que está activo, pendiente o
         confirmado. */
      const activo = !!(st & 0x01), pendiente = !!(st & 0x04), confirmado = !!(st & 0x08);
      if (!activo && !pendiente && !confirmado) continue;

      const codigo = ['P','C','B','U'][a >> 6] + ((a >> 4) & 3) +
                     (a & 0x0F).toString(16).toUpperCase() + b.toString(16).padStart(2,'0').toUpperCase();
      const full = sub ? `${codigo}-${sub.toString(16).padStart(2,'0').toUpperCase()}` : codigo;
      if (out.some(x => x.codigo === full)) continue;
      out.push({ codigo: full, base: codigo, estado: st, activo, pendiente, confirmado });
    }
    return out;
  },

  /* ── Qué significa cada código ────────────────────────────────────────────
     Un código sin descripción no sirve de nada: hay que ir a buscarlo a
     internet, que es exactamente lo que la herramienta debería ahorrar.

     Los U0xxx y C0xxx de esta tabla son GENÉRICOS de la norma SAE J2012 y
     valen para cualquier marca. Los C1xxx, B1xxx y U1xxx son de fabricante:
     el mismo número significa cosas distintas en Nissan y en Toyota, así que
     NO se traducen a ciegas — se indica el sistema al que pertenecen y se
     ofrece el enlace para buscarlo con la marca del vehículo. */
  _DTC_GEN: {
    /* Pérdida de comunicación entre módulos (SAE, genéricos) */
    U0001:'Bus de datos CAN de alta velocidad', U0073:'Bus de comunicación del módulo — apagado',
    U0100:'Sin comunicación con la computadora del motor (ECM/PCM)',
    U0101:'Sin comunicación con la computadora de transmisión (TCM)',
    U0121:'Sin comunicación con el módulo de ABS',
    U0126:'Sin comunicación con el sensor de ángulo de dirección',
    U0128:'Sin comunicación con el módulo de freno de estacionamiento',
    U0131:'Sin comunicación con la dirección asistida',
    U0140:'Sin comunicación con el módulo de carrocería (BCM)',
    U0151:'Sin comunicación con el módulo de airbag',
    U0155:'Sin comunicación con el tablero de instrumentos',
    U0164:'Sin comunicación con el módulo de climatización',
    U0184:'Sin comunicación con el radio', U0199:'Sin comunicación con el módulo de puertas',
    U0300:'Incompatibilidad de versiones de software entre módulos',
    U0401:'Datos inválidos recibidos de la computadora del motor',
    U0402:'Datos inválidos recibidos de la transmisión',
    U0415:'Datos inválidos recibidos del ABS',
    /* Chasis genéricos (SAE) */
    C0035:'Sensor de velocidad — rueda delantera izquierda',
    C0040:'Sensor de velocidad — rueda delantera derecha',
    C0045:'Sensor de velocidad — rueda trasera izquierda',
    C0050:'Sensor de velocidad — rueda trasera derecha',
    C0051:'Sensor de ángulo de dirección', C0061:'Señal del ABS',
    C0110:'Circuito de la bomba del ABS', C0121:'Válvula del ABS',
    C0161:'Interruptor del pedal de freno',
  },

  /* Sistema al que pertenece un código, por su letra y rango. Cuando no se
     puede decir QUÉ es exactamente, al menos se dice DÓNDE buscar. */
  _sistemaDTC(cod) {
    const l = cod[0], n = parseInt(cod.slice(1, 5), 10);
    if (l === 'P') return 'Motor / transmisión';
    if (l === 'U') return 'Red de comunicación entre módulos';
    if (l === 'B') return 'Carrocería (luces, cierres, confort, airbag)';
    if (l === 'C') {
      if (n >= 1700 && n < 1800) return 'Presión de neumáticos (TPMS)';
      if (n >= 1100 && n < 1300) return 'Frenos / ABS / tracción';
      return 'Chasis (frenos, suspensión, dirección)';
    }
    return 'Sin clasificar';
  },

  /* Descripción de un código de módulo. Prioridad: catálogo de la base →
     diccionario genérico SAE → diccionario de emisiones → sistema por rango. */
  _descModulo(cod, cat) {
    const base = cod.split('-')[0];
    /* getDTCCatalogo devuelve la FILA completa de la tabla, no un texto:
       usarla directo imprimía "[object Object]" al lado de cada código. */
    const fila = cat && cat[base];
    if (fila) {
      const t = typeof fila === 'string' ? fila
              : (fila.descripcion_es || fila.descripcion || fila.desc || fila.texto || '');
      if (t && String(t).trim()) return String(t).trim();
    }
    if (this._DTC_GEN[base]) return this._DTC_GEN[base];
    const gen = this._descDTC(base, cat);
    /* _descDTC devuelve el propio código cuando no lo conoce: eso no es una
       descripción, así que se cae al sistema en vez de repetir el número. */
    if (gen && gen !== base && !/^[PCBU]\d/.test(gen.trim())) return gen;
    return null;
  },

  /* Marca+modelo hacen la diferencia: "C1707 Nissan" da la respuesta correcta,
     "C1707" solo da ruido de veinte marcas distintas. */
  _buscarDTC(cod, veh) {
    const v = veh || {};
    const q = [cod.split('-')[0], v.marca, v.modelo, v.anio].filter(Boolean).join(' ');
    return 'https://www.google.com/search?q=' + encodeURIComponent(q + ' codigo falla');
  },

  /* Recorre todos los módulos y junta sus códigos. Es lo que convierte el
     escaneo de "emisiones" en un escaneo del vehículo entero. */
  /* ═══════════ MAPA DE ACCESO POR MODELO ═══════════
     Al Rogue se le entró barriendo 0x700-0x7EF con Tester Present. Funcionó,
     pero ese barrido se repetía a ciegas en CADA escaneo — 240 direcciones,
     medio minuto — y lo aprendido se tiraba al terminar.

     Guardar por dónde se le entró a cada modelo convierte ese barrido en
     conocimiento del taller: el próximo Rogue se pregunta primero donde ya se
     sabe que hay alguien y contesta en segundos, y — lo que más importa — si un
     módulo que en ese modelo SIEMPRE respondió hoy no responde, se avisa en vez
     de darlo por ausente. Un módulo que desaparece del mapa está muerto,
     desconectado o sin alimentación; sin el mapa, no aparecer y no existir se
     ven exactamente igual.

     El mapa se arma solo, con los escaneos del propio taller. Un módulo entra
     al mapa del modelo apenas UN vehículo lo mostró: la dirección de un módulo
     no es opinable como sí lo es la calibración, así que no hace falta mayoría
     — pero se guarda en cuántos se vio, para poder decir "en 4 de 5". */
  async _mapaConocido(vehId) {
    try {
      const v = (this._vehiculos || []).find(x => x.id === vehId);
      if (!v || !v.marca || !v.modelo) return null;
      const previos = await DB.getDiagnosticosPorModelo(v.marca, v.modelo, v.anio);
      const porDir = new Map();
      let conMapa = 0;
      for (const d of previos) {
        const ms = d.mapa_acceso && d.mapa_acceso.modulos;
        if (!Array.isArray(ms) || !ms.length) continue;
        conMapa++;
        for (const m of ms) {
          if (typeof m.req !== 'number') continue;
          const k = m.req + ':' + m.resp;
          const y = porDir.get(k);
          if (y) { y.visto++; continue; }
          porDir.set(k, { req:m.req, resp:m.resp, ext:!!m.ext, nombre:m.nombre, servicio:m.servicio, visto:1 });
        }
      }
      if (!porDir.size) return null;
      return { marca:v.marca, modelo:v.modelo, anio:v.anio, n: conMapa,
               modulos: [...porDir.values()].sort((a, b) => b.visto - a.visto || a.req - b.req) };
    } catch (e) { console.warn('_mapaConocido:', e.message); return null; }
  },

  /* Pregunta sólo a las direcciones que ya se sabe que contestan en este
     modelo. Mismo Tester Present del barrido: es de solo lectura. */
  async _probarConocidas(conocidas) {
    const vivos = [];
    const extPrev = this._canExt;
    try {
      for (const c of conocidas) {
        /* El mapa guarda si a ese modulo se le habla en 11 o en 29 bits: la
           trama se arma distinta, asi que preguntar con el direccionamiento
           equivocado es no preguntar. */
        this._canExt = !!c.ext;
        let capt = [];
        this._canRx = (id, b) => { capt.push({ id, b }); };
        try {
          await this._canTx(c.req, [0x02, 0x3E, 0x00]).catch(() => {});
          await new Promise(r => setTimeout(r, 70));
        } finally { this._canRx = null; }
        /* Se acepta cualquier respuesta que no sea el eco de la propia pregunta:
           el id de vuelta no siempre es el mismo que la vez pasada. */
        const r = capt.find(x => x.id === c.resp) || capt.find(x => x.id !== c.req);
        if (r) vivos.push({ req: c.req, resp: r.id, ext: !!c.ext });
      }
    } finally { this._canExt = extPrev; }
    return vivos;
  },

  async _escanearModulos(log, mapa) {
    const conocidas = (mapa && mapa.modulos) || [];
    let mods = [];

    /* Primero el mapa conocido: da resultados en segundos y deja ver de una
       cuáles de los módulos habituales del modelo faltan hoy. */
    if (conocidas.length) {
      if (log) log(`&nbsp;&nbsp;Mapa conocido de ${mapa.marca} ${mapa.modelo}${mapa.anio ? ' ' + mapa.anio : ''}: <b>${conocidas.length} módulo(s)</b> en ${mapa.n} escaneo(s) previo(s) — preguntando ahí primero...`);
      mods = await this._probarConocidas(conocidas);
      if (log) log(`&nbsp;&nbsp;${mods.length} de ${conocidas.length} del mapa respondieron`);
    }

    /* Y después el barrido completo igual: el mapa acelera, no reemplaza. Un
       modelo puede traer un módulo que ningún escaneo anterior vio (versión
       distinta, accesorio de fábrica), y darlo por inexistente porque no está
       en el mapa sería exactamente el error que el mapa vino a evitar. */
    const barrido = await this._barrerModulos(log);
    for (const b of barrido)
      if (!mods.some(m => m.req === b.req && m.resp === b.resp)) mods.push(b);

    /* Si en 11 bits no contesto casi nadie, el vehiculo puede estar
       diagnosticando en 29 bits. Dos o menos son el motor y la transmision,
       que responden igual por ser los de emisiones: eso no es "encontre los
       modulos", es "encontre los de siempre". Solo entonces vale la pena
       gastar los ~18 s del segundo barrido. */
    if (mods.length <= 2) {
      if (log) log('&nbsp;&nbsp;Pocos modulos en 11 bits — probando direccionamiento de 29 bits...');
      const b29 = await this._barrerModulos29(log);
      for (const b of b29)
        if (!mods.some(m => m.req === b.req && m.resp === b.resp)) mods.push(b);
      if (log) log(b29.length
        ? `&nbsp;&nbsp;<b>${b29.length} modulo(s) en 29 bits</b> que el barrido de 11 bits no podia ver`
        : '&nbsp;&nbsp;<span style="color:var(--text3)">Nada en 29 bits tampoco</span>');
    }

    if (!mods.length) { if (log) log('Ningún módulo respondió al barrido por dirección'); return null; }

    /* Los que el mapa esperaba y hoy no contestaron. No es lo mismo que "este
       modelo no lo trae": acá ya se sabe que sí lo trae. */
    const faltantes = conocidas.filter(c => !mods.some(m => m.req === c.req));
    if (log && faltantes.length)
      log(`<span style="color:var(--amber)">⚠️ ${faltantes.length} módulo(s) del mapa NO respondieron: ` +
          `${faltantes.map(f => f.nombre || '0x' + f.req.toString(16).toUpperCase()).join(', ')}` +
          ` — en ${mapa.marca} ${mapa.modelo} sí contestan. Puede estar dañado, desconectado o sin alimentación.</span>`);

    if (log) log(`<b>${mods.length} módulo(s) encontrados</b> — leyendo códigos de cada uno...`);

    const res = [];
    const extPrev = this._canExt;
    for (const m of mods) {
      /* Mezclamos modulos de 11 y de 29 bits en la misma lista, asi que la
         trama se arma segun el modulo al que le toca, no segun como se
         conecto el vehiculo. */
      this._canExt = !!m.ext;
      let d = await this._udsPedir(m.req, m.resp, [0x19, 0x02, 0xFF], 2500);
      let cods = this._dtcsUDS(d);
      /* Con qué se le sacaron los códigos: al guardarlo en el mapa, el próximo
         escaneo de este modelo sabe que a este módulo hay que abrirle sesión
         extendida antes de preguntarle. */
      let servicio = '19 02';

      /* Hay módulos que en sesión por defecto contestan "servicio no soportado"
         (7F 19 11) o devuelven la lista vacía, y solo entregan sus códigos en
         sesión extendida. Es el caso típico de tracción y carrocería: sin este
         reintento parecen sanos cuando no lo están. */
      const negó = d && d[0] === 0x7F;
      if ((negó || !cods.length)) {
        const s = await this._udsPedir(m.req, m.resp, [0x10, 0x03], 1500);
        if (s && s[0] === 0x50) {
          const d2 = await this._udsPedir(m.req, m.resp, [0x19, 0x02, 0xFF], 2500);
          const c2 = this._dtcsUDS(d2);
          if (c2.length) { d = d2; cods = c2; servicio = '19 02 (sesión extendida)'; }
        }
      }

      const nombre = this._nombreUDS(m.req, cods);
      res.push({ ecu: m.req, resp: m.resp, ext: !!m.ext, nombre, codigos: cods, respondio: !!d, servicio,
                 nuevo: !!conocidas.length && !conocidas.some(c => c.req === m.req) });
      if (log && cods.length) {
        const act = cods.filter(c => c.activo).length;
        log(`&nbsp;&nbsp;<b>${nombre}</b>: ${cods.length} código(s)` +
            (act ? ` <span style="color:var(--red)">(${act} activo${act > 1 ? 's' : ''})</span>` : ''));
      }
    }

    this._canExt = extPrev;

    /* Descripciones: el catálogo de la base tiene 3.000+ códigos y no se estaba
       usando para estos. Un código pelado obliga a ir a buscarlo a internet,
       que es justo lo que la herramienta debería evitar. */
    const todos = res.flatMap(m => m.codigos.map(c => c.codigo.split('-')[0]));
    let cat = null;
    if (todos.length) { try { cat = await DB.getDTCCatalogo([...new Set(todos)]); } catch (_) {} }
    for (const m of res) {
      for (const c of m.codigos) {
        c.desc = this._descModulo(c.codigo, cat);
        c.sistema = this._sistemaDTC(c.codigo);
      }
    }
    /* Los que el mapa esperaba y hoy faltaron viajan aparte: el resultado del
       barrido es la lista de módulos, y meterle ausentes la volvería mentirosa. */
    this._mapaFaltantes = faltantes.map(f => ({ req:f.req, nombre:f.nombre || null, visto:f.visto }));
    return res;
  },

  _mapaHTML(s) {
    const m = s && s.mapa_acceso;
    if (!m || !Array.isArray(m.modulos) || !m.modulos.length) return '';
    const falt = m.faltantes || [];
    const hex = n => '0x' + Number(n).toString(16).toUpperCase();
    return `<div class="card" style="padding:14px;margin-top:12px">
      <b style="font-size:12px">🗺 MAPA DE ACCESO — por dónde se le entra a este vehículo</b>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">
        CAN ${m.bits} bits · ${m.baud}k · ${m.modulos.length} módulo(s). Queda guardado: el próximo escaneo de
        este modelo pregunta primero acá y responde en segundos en vez de barrer 240 direcciones.
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:7px;margin-top:8px">
        ${m.modulos.map(x => `<div style="background:var(--surface2);color:var(--text);border-radius:7px;padding:7px 9px;
            ${x.nuevo ? 'border-left:3px solid var(--cyan)' : ''}">
          <div style="font-size:12px;font-weight:600">${UI.esc(x.nombre || 'Módulo')}</div>
          <div style="font-size:10px;color:var(--text3);font-family:ui-monospace,Consolas,monospace">
            ${hex(x.req)} → ${hex(x.resp)}${x.ext ? ' · 29 bits' : ''}${x.servicio ? ` · ${UI.esc(x.servicio)}` : ''}</div>
        </div>`).join('')}
      </div>
      ${falt.length ? `<div style="margin-top:9px;background:var(--amber-dim);border:1px solid var(--amber-border);
        border-radius:6px;padding:7px 9px;font-size:11px;line-height:1.5;color:var(--text)">
        <b>⚠️ ${falt.length} módulo(s) del mapa no respondieron:</b>
        ${falt.map(f => UI.esc(f.nombre || hex(f.req))).join(', ')}.
        En este modelo sí contestan, así que no es que el vehículo no los traiga: revisá alimentación, fusible
        y conector antes de darlos por ausentes.</div>` : ''}
    </div>`;
  },

  /* ═══════════ COBERTURA: qué vehículos sabe escanear el taller ═══════════
     El mapa de un vehículo suelto sirve para ese vehículo. Juntos son otra
     cosa: la lista de modelos a los que NexusPro ya sabe entrarle, con cuántos
     módulos alcanza en cada uno. Es lo que hasta ahora no se podía contestar. */
  async modalMapaVehiculos() {
    UI.modal('🗺 Mapa de vehículos', `<div id="obd-mapa-lista" style="font-size:13px">Cargando mapas del taller...</div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button></div>`, '760px');
    const filas = await DB.getMapasVehiculos();
    const el = document.getElementById('obd-mapa-lista');
    const porModelo = new Map();
    for (const f of filas) {
      const v = f.vehiculos || {};
      const clave = [v.marca || '?', v.modelo || '?', v.anio || ''].join(' ').trim();
      const g = porModelo.get(clave) || { clave, escaneos:0, vehiculos:new Set(), dirs:new Map(),
                                          bits:null, baud:null, ultimo:f.created_at };
      g.escaneos++;
      if (f.vehiculo_id) g.vehiculos.add(f.vehiculo_id);
      const m = f.mapa_acceso || {};
      if (g.bits == null) { g.bits = m.bits; g.baud = m.baud; }
      for (const x of (m.modulos || [])) if (typeof x.req === 'number' && !g.dirs.has(x.req))
        g.dirs.set(x.req, x.nombre || ('0x' + x.req.toString(16).toUpperCase()));
      porModelo.set(clave, g);
    }
    const grupos = [...porModelo.values()].sort((a, b) => b.dirs.size - a.dirs.size);
    const cuerpo = !grupos.length
      ? `<p style="font-size:13px;color:var(--text3)">Todavía no hay ningún mapa. El mapa se arma solo:
         cada escaneo por USB de un vehículo liviano guarda por dónde se le entró, y desde el segundo
         del mismo modelo el escaneo empieza a usarlo.</p>`
      : `<table class="table" style="font-size:12px">
          <thead><tr><th>Modelo</th><th>Módulos que sabemos alcanzar</th><th style="text-align:center">Unidades</th><th style="text-align:center">Bus</th></tr></thead>
          <tbody>${grupos.map(g => `<tr>
            <td><b>${UI.esc(g.clave)}</b><div style="font-size:10px;color:var(--text3)">${g.escaneos} escaneo(s) · último ${UI.fecha(g.ultimo)}</div></td>
            <td><span class="badge badge-cyan">${g.dirs.size}</span>
              <div style="font-size:10.5px;color:var(--text3);margin-top:3px;line-height:1.5">${[...g.dirs.values()].map(n => UI.esc(n)).join(' · ')}</div></td>
            <td style="text-align:center">${g.vehiculos.size}</td>
            <td style="text-align:center;font-size:11px;white-space:nowrap">${g.bits ? `${g.bits} bits<br>${g.baud}k` : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
        <div style="font-size:10.5px;color:var(--text3);margin-top:10px;line-height:1.5">
          Cada fila es un modelo que el taller ya sabe escanear y hasta dónde llega. Se arma solo con los
          escaneos propios — mejora con el uso y no depende de ninguna base de datos con licencia.
          <b>Módulos alcanzados</b> es lo que contestó en ese modelo, no todo lo que el vehículo trae.
        </div>`;
    if (el) el.innerHTML = cuerpo;
  },

  /* El mapa que deja este escaneo, para que lo aproveche el próximo del mismo
     modelo. Sólo módulos que de verdad contestaron. */
  _mapaDeEscaneo(porModulo) {
    if (!Array.isArray(porModulo) || !porModulo.length) return null;
    return {
      bits: this._canExt ? 29 : 11, baud: this._canBaud, via: this._via,
      modulos: porModulo.map(m => ({ req:m.ecu, resp:m.resp, ext:!!m.ext, nombre:m.nombre, servicio:m.servicio || null })),
      faltantes: this._mapaFaltantes || [],
    };
  },

  /* ── Camiones por USB: J1939. El bus transmite solo (broadcast); DM1/DM2 dan
       las fallas como SPN (componente) + FMI (tipo de falla). ── */

  /* PGN → sensores (mismas claves que los PIDs OBD-II para reusar toda la UI).
     0xFF/0xFE… = "no disponible" en J1939, por eso los umbrales de validez. */
  _J39_PGNS: {
    61444: [{ k:'rpm',        f:d => d.length > 4 && d[4] < 0xFA ? Math.round((d[3] | d[4] << 8) * 0.125) : null }],
    61443: [{ k:'acel',       f:d => d.length > 1 && d[1] < 0xFB ? Math.round(d[1] * 0.4) : null },
            { k:'carga',      f:d => d.length > 2 && d[2] <= 125 ? d[2] : null }],
    65262: [{ k:'temp',       f:d => d.length > 0 && d[0] < 0xFB ? d[0] - 40 : null },
            { k:'temp_aceite',f:d => d.length > 3 && d[3] < 0xFA ? Math.round(((d[2] | d[3] << 8) * 0.03125 - 273) * 10) / 10 : null }],
    65263: [{ k:'pres_aceite',f:d => d.length > 3 && d[3] < 0xFB ? d[3] * 4 : null }],
    65265: [{ k:'vel',        f:d => d.length > 2 && d[2] < 0xFA ? Math.round((d[1] | d[2] << 8) / 256) : null }],
    65266: [{ k:'tasa_comb',  f:d => d.length > 1 && d[1] < 0xFA ? Math.round((d[0] | d[1] << 8) * 0.05 * 10) / 10 : null }],
    65270: [{ k:'boost',      f:d => d.length > 1 && d[1] < 0xFB ? d[1] * 2 : null },
            { k:'temp_adm',   f:d => d.length > 2 && d[2] < 0xFB ? d[2] - 40 : null }],
    65271: [{ k:'volt',       f:d => d.length > 7 && d[7] < 0xFA ? ((d[6] | d[7] << 8) * 0.05).toFixed(1) + 'V' : null }],
    65276: [{ k:'comb',       f:d => d.length > 1 && d[1] < 0xFB ? Math.round(d[1] * 0.4) : null }],
    65269: [{ k:'baro',       f:d => d.length > 0 && d[0] < 0xFB ? Math.round(d[0] * 0.5) : null },
            { k:'temp_amb',   f:d => d.length > 3 && d[3] < 0xFA ? Math.round((d[2] | d[3] << 8) * 0.03125 - 273) : null }],
    65253: [{ k:'horas',      f:d => d.length > 3 && d[3] < 0xFA ? Math.round(((d[0] | d[1] << 8 | d[2] << 16) + d[3] * 16777216) * 0.05) : null }],
    65248: [{ k:'odometro',   f:d => d.length > 7 && d[7] < 0xFA ? Math.round(((d[4] | d[5] << 8 | d[6] << 16) + d[7] * 16777216) * 0.125) : null }],
  },
  /* Sensores que existen en J1939/J1587 pero no en el catálogo de PIDs OBD-II */
  _LBLX: { pres_aceite:['Presión aceite',' kPa'], boost:['Presión turbo',' kPa'], horas:['Horas motor',' h'], odometro:['Odómetro',' km'],
           nivel_aceite:['Nivel de aceite',' %'], nivel_refrig:['Nivel de refrigerante',' %'],
           temp_comb:['Temp. combustible',' °C'], pres_adm:['Presión de admisión',' kPa'] },

  /* Componentes SPN comunes en camiones diésel (español) */
  _J39_SPNS: {
    84:'Velocidad del vehículo', 91:'Pedal del acelerador', 92:'Carga del motor',
    94:'Presión de entrega de combustible', 96:'Nivel de combustible', 97:'Agua en el combustible',
    98:'Nivel de aceite del motor', 100:'Presión de aceite del motor', 102:'Presión del turbo (boost)',
    105:'Temperatura del aire de admisión', 106:'Presión de aire de admisión', 107:'Restricción del filtro de aire',
    108:'Presión barométrica', 110:'Temperatura del refrigerante', 111:'Nivel de refrigerante',
    157:'Presión del riel de inyección', 158:'Voltaje de batería (switch)', 168:'Voltaje de batería',
    171:'Temperatura ambiente', 174:'Temperatura del combustible', 175:'Temperatura del aceite del motor',
    190:'RPM del motor', 237:'VIN', 245:'Odómetro', 247:'Horas del motor',
    411:'Presión EGR', 412:'Temperatura EGR', 626:'Ayuda de arranque en frío (glow/grid)',
    629:'Computadora del motor (ECU)', 639:'Bus de comunicación J1939',
    651:'Inyector cilindro 1', 652:'Inyector cilindro 2', 653:'Inyector cilindro 3',
    654:'Inyector cilindro 4', 655:'Inyector cilindro 5', 656:'Inyector cilindro 6',
    723:'Sensor de velocidad del árbol de levas', 729:'Calentador del aire de admisión',
    1127:'Presión del turbo 1', 1172:'Temperatura de entrada del turbo',
    1213:'Lámpara de falla (MIL)', 1569:'Reducción de potencia (derate) por protección',
    1761:'Nivel de DEF/urea', 3031:'Temperatura del tanque DEF',
    3216:'Sensor NOx de entrada', 3226:'Sensor NOx de salida',
    3242:'Temperatura de entrada del DPF', 3251:'Presión diferencial del DPF',
    3610:'Presión de salida del DPF', 3719:'Acumulación de hollín en DPF',
    4094:'Nivel bajo de DEF/urea', 5246:'Inductor SCR (derate por emisiones)',

    /* ── Frenos / ABS ──────────────────────────────────────────────────────
       Faltaban por completo: el catálogo era casi todo de motor, así que una
       falla de ABS salía como "Componente SPN 789" y no decía nada. En un
       camión el ABS es de los módulos que más falla (sensores y anillos
       dentados a la intemperie) y es el que no se puede dejar pasar. */
    46:'Presión neumática de suministro', 117:'Presión del depósito de frenos #1',
    118:'Presión del depósito de frenos #2', 121:'Retardador — freno de escape',
    561:'ASR — control de freno activo', 562:'ASR — control de motor activo',
    563:'ABS activo', 596:'Interruptor de control de crucero',
    597:'Interruptor del pedal de freno', 598:'Interruptor del embrague',
    904:'Velocidad del eje delantero',
    905:'Velocidad relativa — rueda delantera izquierda',
    906:'Velocidad relativa — rueda delantera derecha',
    907:'Velocidad relativa — rueda trasera izquierda',
    908:'Velocidad relativa — rueda trasera derecha',
    1045:'ABS — solicitud de freno del remolque',
    1121:'Velocidad de rueda — eje 1 izquierda', 1122:'Velocidad de rueda — eje 1 derecha',
    1123:'Velocidad de rueda — eje 2 izquierda', 1124:'Velocidad de rueda — eje 2 derecha',

    /* ── Transmisión ─────────────────────────────────────────────────────── */
    161:'Velocidad de entrada de la transmisión', 177:'Temperatura del aceite de transmisión',
    191:'Velocidad de salida de la transmisión', 522:'Marcha solicitada',
    523:'Marcha actual', 524:'Marcha seleccionada', 560:'Embrague de la transmisión',
    573:'Convertidor de par — embrague de bloqueo', 584:'Freno de estacionamiento',

    /* ── Post-tratamiento / regeneración ──────────────────────────────────
       Lo que se ve cuando el DPF entra en problemas, que es la falla más común
       en camión moderno después de las de sensor. */
    3699:'Regeneración de DPF inhibida', 3700:'Regeneración de DPF activa',
    3701:'Obstrucción del DPF', 3702:'Regeneración estacionaria en curso',
    3703:'Regeneración de DPF — inhibida por el conductor',
    3720:'Ceniza acumulada en el DPF', 3936:'Estado del sistema de post-tratamiento',
    4364:'Eficiencia de conversión del SCR', 4360:'Temperatura de entrada del SCR',
  },
  /* FMI (Failure Mode Identifier) estándar J1939 */
  _FMI: {
    0:'dato válido pero muy alto', 1:'dato válido pero muy bajo', 2:'dato errático o intermitente',
    3:'voltaje alto / corto a positivo', 4:'voltaje bajo / corto a tierra', 5:'corriente baja / circuito abierto',
    6:'corriente alta / corto a tierra', 7:'sistema mecánico no responde', 8:'frecuencia anormal',
    9:'tasa de actualización anormal', 10:'tasa de cambio anormal', 11:'causa desconocida',
    12:'componente defectuoso', 13:'fuera de calibración', 14:'instrucciones especiales',
    15:'alto — severidad baja', 16:'alto — severidad media', 17:'bajo — severidad baja',
    18:'bajo — severidad media', 19:'error de datos de red', 20:'dato desviado alto',
    21:'dato desviado bajo', 31:'condición presente',
  },

  /* ═══════════ J1708 / J1587 — camiones antiguos (MID/PID/FMI) ═══════════
     Es lo que muestra la app de servicio de Navistar en un DT466 de esa época.
     Trama RP1210: [ts×4][MID][parámetros...]; cada parámetro es PID + datos, y
     las fallas viajan en el PID 194.

     ADVERTENCIA DE ALCANCE: el formato de trama y el bit exacto de las banderas
     del PID 194 NO están verificados contra hardware — no hay camión todavía.
     Por eso se muestra SIEMPRE el MID/PID/FMI numérico, que es lo mismo que
     muestra la app de Navistar y lo que se busca en el manual, y la
     interpretación va rotulada como sin verificar. Mandan los números.
     El FMI se reutiliza de _FMI: los valores 0-14 son iguales en J1587 y J1939. */
  _J1587_MIDS: {
    128:'Motor #1', 130:'Transmisión', 136:'Frenos / ABS', 137:'Frenos del remolque',
    140:'Tablero de instrumentos', 141:'Control de viaje', 142:'Gestión del vehículo',
    143:'Suspensión', 144:'Control de cabina', 150:'Control de tracción',
    162:'Navegación', 172:'Aire acondicionado', 178:'Control de puertas',
    181:'Registrador de datos', 183:'Sistema de combustible', 186:'Compresor de aire',
    187:'Toma de fuerza', 188:'Control de arranque', 190:'Dirección',
  },
  _nombreMID1587(mid) { return this._J1587_MIDS[mid] || `Módulo MID ${mid}`; },

  /* Parámetros J1587 que emite un motor diésel de esta época (DT466 y parientes).
     Mismas claves `k` que los PIDs OBD-II y los PGN J1939, para reusar toda la UI.

     Resoluciones tomadas del estándar SAE J1587. NO están verificadas contra un
     camión: por eso la UI muestra siempre el byte crudo junto al valor, para
     poder contrastarlo contra ServiceMaxx en el mismo vehículo. Si alguno sale
     desviado, se corrige aquí sin tocar el resto.

     n = bytes de datos (lo determina el rango del PID, ver _j1587Params).
     Los multi-byte de J1587 van en little-endian (LSB primero).
     0xFF / 0xFFFF = "no disponible" y se descartan. */
  _J1587_PIDS: {
    84:  { k:'vel',         l:'Velocidad',              u:' km/h', n:1, f:b => b[0] * 0.805 },
    91:  { k:'acel',        l:'Acelerador',             u:' %',    n:1, f:b => b[0] * 0.4 },
    92:  { k:'carga',       l:'Carga motor',            u:' %',    n:1, f:b => b[0] * 0.5 },
    94:  { k:'pres_comb',   l:'Presión de combustible', u:' kPa',  n:1, f:b => b[0] * 3.447 },
    96:  { k:'comb',        l:'Combustible',            u:' %',    n:1, f:b => b[0] * 0.5 },
    98:  { k:'nivel_aceite',l:'Nivel de aceite',        u:' %',    n:1, f:b => b[0] * 0.5 },
    100: { k:'pres_aceite', l:'Presión aceite',         u:' kPa',  n:1, f:b => b[0] * 3.447 },
    102: { k:'boost',       l:'Presión turbo',          u:' kPa',  n:1, f:b => b[0] * 0.862 },
    105: { k:'temp_adm',    l:'Temp. admisión',         u:' °C',   n:1, f:b => b[0] - 40 },
    106: { k:'pres_adm',    l:'Presión de admisión',    u:' kPa',  n:1, f:b => b[0] * 0.862 },
    108: { k:'baro',        l:'Presión barométrica',    u:' kPa',  n:1, f:b => b[0] * 0.5 },
    110: { k:'temp',        l:'Temp. motor',            u:' °C',   n:1, f:b => b[0] - 40 },
    111: { k:'nivel_refrig',l:'Nivel de refrigerante',  u:' %',    n:1, f:b => b[0] * 0.5 },
    174: { k:'temp_comb',   l:'Temp. combustible',      u:' °C',   n:1, f:b => b[0] - 40 },
    175: { k:'temp_aceite', l:'Temp. aceite',           u:' °C',   n:2, f:b => (b[0] | b[1] << 8) * 0.03125 - 273 },
    171: { k:'temp_amb',    l:'Temp. ambiente',         u:' °C',   n:2, f:b => (b[0] | b[1] << 8) * 0.03125 - 273 },
    190: { k:'rpm',         l:'RPM',                    u:'',      n:2, f:b => (b[0] | b[1] << 8) * 0.25 },
    158: { k:'volt_ecu',    l:'Voltaje ECU',            u:' V',    n:2, f:b => (b[0] | b[1] << 8) * 0.05 },
    168: { k:'volt',        l:'Batería',                u:' V',    n:2, f:b => (b[0] | b[1] << 8) * 0.05 },
  },
  _nombrePID1587(id, sid) {
    if (sid) return null;                           // los SID son por módulo, no hay tabla única
    const d = this._J1587_PIDS[id];
    return d ? d.l : null;
  },

  /* Camina una trama J1587 devolviendo sus parámetros.
     La longitud de cada parámetro la fija el rango del PID (SAE J1587):
       0-127   → 1 byte de datos
       128-191 → 2 bytes
       192-253 → variable: el byte que sigue al PID es la longitud
       254     → escape a la página 2 (los PID siguientes son de otra tabla)
       255     → relleno / fin de trama
     Sin esto no se puede saber dónde empieza el siguiente PID, y buscar un byte
     suelto (p. ej. el 194 de las fallas) toma datos de otro parámetro como si
     fueran un PID: de ahí salían códigos fantasma. */
  _j1587Params(par) {
    const out = [];
    let i = 0, pagina = 0;
    while (i < par.length) {
      const pid = par[i];
      if (pid === 255) break;                       // relleno: lo que sigue no es dato
      if (pid === 254) { pagina = 1; i++; continue; }
      i++;
      let n;
      if (pid < 128) n = 1;
      else if (pid < 192) n = 2;
      else { if (i >= par.length) break; n = par[i]; i++; }
      if (n === undefined || i + n > par.length) break;   // trama truncada o checksum al final
      out.push({ pid, pagina, datos: par.slice(i, i + n) });
      i += n;
    }
    return out;
  },

  /* PID 194: pares [identificador][carácter de diagnóstico]. En el carácter,
     bit7 = el identificador es SID (subsistema) y no PID, bit6 = falla inactiva,
     bit5 = viene un byte extra con el conteo de ocurrencias, bits 3-0 = FMI.
     Consumir ese byte extra es obligatorio: si no, todo lo que sigue se
     desalinea y aparecen fallas inventadas. */
  _j1587Fallas(mid, cuerpo, j) {
    let k = 0;
    while (k + 1 < cuerpo.length) {
      const id = cuerpo[k], cod = cuerpo[k + 1];
      k += 2;
      let oc = null;
      if (cod & 0x20) { oc = cuerpo[k]; k++; }
      const falla = {
        mid, id, fmi: cod & 0x0F,
        sid: !!(cod & 0x80),
        inactiva: !!(cod & 0x40),
        oc: oc !== null && oc !== undefined ? (oc & 0x7F) : null,
        crudo: `${id.toString(16).padStart(2,'0')} ${cod.toString(16).padStart(2,'0')}`.toUpperCase(),
      };
      const clave = `${falla.mid}-${falla.id}-${falla.fmi}-${falla.sid}`;
      if (!j.fallas.some(f => `${f.mid}-${f.id}-${f.fmi}-${f.sid}` === clave)) j.fallas.push(falla);
    }
  },

  _j1587Frame(d) {
    const j = this._j87;
    if (!j) return;
    j.total = (j.total || 0) + 1;
    if (!j.crudo) j.crudo = [];
    if (j.crudo.length < 6) j.crudo.push(d.slice(0, 24));
    if (d.length < 6) { j.cortas = (j.cortas || 0) + 1; return; }

    const mid = d[4];                               // tras el timestamp de 4 bytes
    j.mids[mid] = (j.mids[mid] || 0) + 1;

    for (const p of this._j1587Params(d.slice(5))) {
      if (p.pagina) continue;                       // página 2: no está en el catálogo
      if (p.pid === 194) { this._j1587Fallas(mid, p.datos, j); continue; }
      const def = this._J1587_PIDS[p.pid];
      if (!def || p.datos.length < def.n) continue;
      /* 0xFF / 0xFFFF = parámetro no disponible en este camión */
      const todoFF = p.datos.slice(0, def.n).every(x => x === 0xFF);
      if (todoFF) continue;
      const v = def.f(p.datos);
      if (v === null || v === undefined || !isFinite(v)) continue;
      j.datos[def.k] = Math.round(v * 10) / 10;
      j.crudoPid[def.k] = p.datos.slice(0, def.n).map(x => x.toString(16).padStart(2,'0').toUpperCase()).join(' ');
      j.vistos[p.pid] = (j.vistos[p.pid] || 0) + 1;
    }
  },

  /* Formato del código igual al de la herramienta de fábrica, para poder
     compararlo de frente contra la app de Navistar. */
  _codigoJ1587(f) {
    return `MID ${f.mid} · ${f.sid ? 'SID' : 'PID'} ${f.id} · FMI ${f.fmi}`;
  },

  async _escanearJ1587(vehId, btn, log) {
    try {
      log('Conectando al puente USB local...');
      await this._puenteConectar();
      const est = await this._puenteEstado();
      log(`Puente USB: <b>${est.dispositivo || 'RP1210'}</b> v${est.version || '?'} ✓`);
      const c = await this._puenteOp({ op:'conectar', protocolo:'J1708', device:1 });
      if (!c.ok) throw new Error(`El puente no pudo abrir el J1708: ${c.error || 'código ' + c.codigo}. Revisá que el adaptador esté conectado AL CAMIÓN y con el switch en contacto: los LED encienden con el USB, pero sin los 12 V del vehículo no abre ningún bus.`);

      this._j87 = { mids:{}, fallas:[], total:0, datos:{}, crudoPid:{}, vistos:{} };
      log('Escuchando el bus J1708 (el camión transmite solo)...');
      const j = this._j87;
      /* Módulos + parámetros + fallas: mientras aparezca algo que no estaba,
         se sigue escuchando. En un DT466 con varios módulos, el tablero y los
         frenos pueden tardar en entrar. */
      const esc = await this._escucharBus(
        () => `${Object.keys(j.mids).length}|${Object.keys(j.datos).length}|${j.fallas.length}`,
        { min:2000, max:14000, quieto:2500,
          log: () => log(`&nbsp;&nbsp;<span style="color:var(--text3)">…${Object.keys(j.mids).length} módulo(s), ${Object.keys(j.datos).length} parámetro(s), ${j.fallas.length} falla(s)</span>`) });
      log(`Escucha ${esc.motivo === 'tope' ? 'cortada por tiempo' : 'completa'} (${(esc.ms/1000).toFixed(1)} s)`);

      /* Bus mudo casi siempre es el switch, y el mecánico está en la cabina con
         la laptop en el asiento. Antes esto tiraba error y había que rehacer el
         escaneo entero; ahora se le da la ventana para girar la llave. */
      if (!j.total) {
        log('<b style="color:var(--amber)">Bus mudo — poné el switch en contacto AHORA.</b> Reintentando 15 s...');
        await this._escucharBus(() => j.total, { min:3000, max:15000, quieto:2500,
          log: () => log('&nbsp;&nbsp;<span style="color:var(--text3)">…esperando</span>') });
      }
      if (!j.total) throw new Error('Bus J1708 silencioso: no llegó ninguna trama. Verificá el switch en contacto y el cable en los pines A/B del conector de 9 pines.');

      const mids = Object.keys(j.mids).map(Number);
      log(`${j.total} tramas de ${mids.length} módulo(s): ${mids.map(m => this._nombreMID1587(m)).join(', ')} ✓`);

      /* Parámetros en vivo: antes esto no se leía y el camión parecía mudo salvo
         por las fallas. La presión barométrica (PID 108) entra por acá. */
      const nPar = Object.keys(j.datos).length;
      if (nPar) {
        const vistos = Object.keys(j.vistos).map(Number).sort((a, b) => a - b);
        log(`${nPar} parámetro(s) en vivo — PID ${vistos.join(', ')} ✓`);
      } else {
        log('Ningún parámetro conocido en el tráfico: el motor puede estar apagado, o los PID que emite no están en el catálogo todavía.');
      }

      /* Siempre se vuelca la trama cruda: es lo que permite confirmar el formato
         contra la app de Navistar en el mismo camión. */
      log('<b>Trama cruda tal como llega del adaptador:</b>');
      for (const t of (j.crudo || [])) log(`&nbsp;&nbsp;<code>${t.map(x => x.toString(16).padStart(2, '0')).join(' ')}</code>`);

      /* El nombre del parámetro va adelante: "Presión barométrica — voltaje alto"
         dice mucho más que un FMI suelto. Si el PID no está en el catálogo (o es
         un SID, que es por módulo), se cae al número, que es lo que se busca en
         el manual de todos modos. */
      const aFila = f => {
        const par = this._nombrePID1587(f.id, f.sid);
        const fmi = this._FMI[f.fmi] || 'FMI ' + f.fmi;
        return {
          codigo: this._codigoJ1587(f), ecu: f.mid, modulo: this._nombreMID1587(f.mid),
          desc: (par ? `${par} — ${fmi}` : fmi) + (f.oc ? ` (${f.oc} veces)` : ''),
          origen: `bytes ${f.crudo}`,
        };
      };
      const dtcs = j.fallas.filter(f => !f.inactiva).map(aFila);
      const pend = j.fallas.filter(f => f.inactiva).map(aFila);
      log(`${dtcs.length} falla(s) activa(s), ${pend.length} inactiva(s)`);
      if (!j.fallas.length) log('No se encontró ningún PID 194 en el tráfico — puede que el camión no tenga fallas, o que el formato de trama no sea el asumido');

      /* Una flota entra al taller una y otra vez: saber si la falla ya estaba
         la vez pasada vale acá tanto o más que en un liviano. */
      log('Comparando con la visita anterior de esta unidad...');
      const comparacion = await this._compararConAnterior(vehId, { dtcs });
      this._logComparacion(comparacion, log);

      this._scan = {
        costo: this._costoEscaneo(vehId),
        vehiculo_id: vehId, vin: null, protocolo: 'J1708/J1587 (camión antiguo · USB)',
        adaptador: est.dispositivo || 'USB-Link (RP1210)', mil: dtcs.length > 0,
        dtcs, dtcs_pendientes: pend, datos: j.datos, freeze_frame: null, monitores: null,
        modulos: mids.map(m => ({ ecu: m, nombre: this._nombreMID1587(m) })),
        voltaje: this._voltajeDe(j.datos), nhtsa: null, comparacion,
      };
      log('<b>Escaneo completo ✓</b>');
      this._renderResultado();
      const bs = document.getElementById('obd-btn-save'); if (bs) bs.style.display = '';
      btn.textContent = '↻ Re-escanear';
    } catch (e) {
      log(`<span style="color:var(--red)">✗ ${e.message}</span>`);
      UI.toast(e.message, 'error');
    } finally { btn.disabled = false; }
  },

  /* Direcciones de origen J1939 (tabla de direcciones preferidas de la norma).
     Se nombran las que el estándar fija; el resto se muestra por número, que es
     lo que se busca en el manual del fabricante. */
  _J39_SA: {
    0:'Motor #1', 1:'Motor #2', 3:'Transmisión #1', 5:'Consola de cambios',
    6:'Toma de fuerza (PTO)', 7:'Eje directriz', 8:'Eje motriz #1', 9:'Eje motriz #2',
    11:'Frenos / ABS', 13:'Frenos del remolque', 15:'Retardador del motor',
    16:'Retardador de transmisión', 17:'Control de crucero',
    23:'Instrumentos / tablero', 33:'Controlador de carrocería',
    37:'Suspensión', 49:'Control de cabina', 249:'Herramienta de diagnóstico',
  },
  _nombreSA(sa) {
    /* Si el módulo se identificó con su NAME, ese dato manda: es lo que el
       módulo dice ser, no lo que suponemos por la dirección que ocupa. */
    const c = this._j39 && this._j39.claim && this._j39.claim[sa];
    if (c && c.nombre) return c.nombre;
    return this._J39_SA[sa] || `Módulo ${sa} (0x${Number(sa).toString(16).toUpperCase()})`;
  },

  /* Función del módulo dentro del NAME (J1939-81). Es lo que permite decir
     "esto es la transmisión" aunque esté en una dirección no estándar. */
  _J39_FUNC: {
    0:'Motor', 1:'Unidad de potencia auxiliar', 2:'Control de propulsión eléctrica',
    3:'Transmisión', 4:'Monitor del paquete de baterías', 5:'Control de cambios',
    6:'Toma de fuerza (PTO)', 7:'Eje directriz', 8:'Eje motriz',
    9:'Frenos — controlador del sistema (ABS)', 10:'Frenos — eje directriz',
    11:'Frenos — eje motriz', 12:'Retardador del motor', 13:'Retardador de transmisión',
    14:'Control de crucero', 15:'Sistema de combustible', 16:'Controlador de dirección',
    17:'Suspensión — eje directriz', 18:'Suspensión — eje motriz',
    19:'Tablero de instrumentos', 20:'Registrador de viaje', 21:'Climatización de cabina',
    23:'Navegación', 24:'Seguridad del vehículo', 25:'Interconexión de red (gateway)',
    26:'Controlador de carrocería', 28:'Puerta de enlace externa',
    29:'Terminal virtual', 30:'Computadora de gestión',
  },

  /* NAME de 64 bits del Address Claim. Poco intuitivo: va en little-endian y
     varios campos cruzan el borde de un byte. */
  _j39NAME(d) {
    if (!d || d.length < 8) return null;
    const identidad   = (d[0] | (d[1] << 8) | ((d[2] & 0x1F) << 16)) >>> 0;  // 21 bits
    const fabricante  = ((d[2] >> 5) | (d[3] << 3)) & 0x7FF;                 // 11 bits
    const funcion     = d[5];
    const sistema     = (d[6] >> 1) & 0x7F;
    const grupo       = (d[7] >> 4) & 0x07;
    return { identidad, fabricante, funcion, sistema, grupo,
             nombre: this._J39_FUNC[funcion] || null };
  },

  /* Pregunta al bus entero "¿quién está ahí?". Cada módulo contesta con su
     NAME, INCLUIDO el que nunca difunde nada por su cuenta — que es
     justamente el que se perdía cuando solo se escuchaba quién habla. */
  async _j39Enumerar(log) {
    const j = this._j39;
    if (!j) return [];
    await this._j39Solicitar(60928);
    await this._escucharBus(() => Object.keys(j.claim).length,
      { min:1200, max:5000, quieto:1200 });
    const sas = Object.keys(j.claim).map(Number).sort((a, b) => a - b);
    if (log && sas.length) {
      log(`<b>${sas.length} módulo(s) identificados en el bus:</b>`);
      for (const sa of sas) {
        const c = j.claim[sa];
        log(`&nbsp;&nbsp;<b>${this._nombreSA(sa)}</b> <span style="color:var(--text3)">— dirección ${sa}` +
            (c.fabricante ? ` · fabricante ${c.fabricante}` : '') +
            (c.nombre ? '' : ` · función ${c.funcion} (no estándar)`) + '</span>');
      }
    }
    return sas;
  },

  _j39Frame(d) {   // lectura RP1210 J1939: [ts×4][pgn×3][prio][origen][destino][datos...]
    const j = this._j39;
    if (!j) return;
    /* El formato CAN se verificó contra un vehículo real; este NO (hace falta un
       camión). Se guardan muestras crudas para que, si no decodifica nada, el
       log muestre la trama de verdad y se corrija en una sola pasada en vez de
       ir adivinando offsets. */
    j.total = (j.total || 0) + 1;
    if (!j.crudo) j.crudo = [];
    if (j.crudo.length < 4) j.crudo.push(d.slice(0, 20));
    if (d.length < 10) { j.cortas = (j.cortas || 0) + 1; return; }
    const pgn = d[4] | (d[5] << 8) | (d[6] << 16), sa = d[8], data = d.slice(10);
    if (sa !== 0xF9) j.sas[sa] = (j.sas[sa] || 0) + 1;   // 0xF9 somos nosotros

    /* Transporte multipaquete: un mensaje que no entra en 8 bytes se manda
       partido y hay que rearmarlo antes de interpretarlo. Se cuentan acá porque
       son tramas de transporte, no contenido: el PGN que transportan se cuenta
       al entregarlo rearmado. */
    if (pgn === 60416) { j.pgns[pgn] = (j.pgns[pgn] || 0) + 1; this._j39TPCM(j, sa, data); return; }
    if (pgn === 60160) { j.pgns[pgn] = (j.pgns[pgn] || 0) + 1; this._j39TPDT(j, sa, data); return; }

    this._j39Entregar(j, pgn, sa, data);
  },

  /* ── Transporte multipaquete J1939 (BAM) ─────────────────────────────────
     Una trama CAN lleva 8 bytes. Todo lo que no entra ahí viaja partido: el
     módulo anuncia "voy a mandar N bytes en M paquetes del PGN tal" (TP.CM) y
     después manda los pedazos numerados (TP.DT).

     Sin esto se perdían dos cosas importantes:
       · El VIN (17 caracteres + terminador) NUNCA entra en 8 bytes, así que
         por J1939 no se leía nunca.
       · Un DM1 de 8 bytes solo alcanza para UNA falla. Un módulo con varias
         las manda partidas, y se veía solo la primera — o ninguna.

     El rearmado va por dirección de origen: dos módulos pueden estar mandando
     multipaquete a la vez y sus pedazos se intercalan en el bus. */
  _j39TPCM(j, sa, d) {
    if (d.length < 8) return;
    /* 32 = BAM (difusión). 16 = RTS, que es punto a punto y no nos aplica:
       nadie nos está mandando nada dirigido, solo escuchamos difusión. */
    if (d[0] !== 32) return;
    const tam = d[1] | (d[2] << 8);
    const paquetes = d[3];
    const pgn = d[5] | (d[6] << 8) | (d[7] << 16);
    if (!tam || !paquetes || paquetes > 255) return;
    /* Un anuncio nuevo del mismo módulo cancela el anterior: si el previo quedó
       incompleto (se perdió un paquete), acumular pedazos sueltos daría un
       mensaje corrupto. */
    j.tp[sa] = { pgn, tam, paquetes, partes: {}, t: Date.now() };
  },

  _j39TPDT(j, sa, d) {
    const s = j.tp[sa];
    if (!s || d.length < 2) return;
    /* La norma da 750 ms entre paquetes de un BAM. Pasado eso, lo que llega ya
       no pertenece a esa sesión: se descarta en vez de mezclarlo. */
    if (Date.now() - s.t > 3000) { delete j.tp[sa]; return; }
    const seq = d[0];
    if (seq < 1 || seq > s.paquetes) return;
    s.partes[seq] = d.slice(1, 8);
    s.t = Date.now();
    if (Object.keys(s.partes).length < s.paquetes) return;

    const bytes = [];
    for (let i = 1; i <= s.paquetes; i++) bytes.push(...s.partes[i]);
    delete j.tp[sa];
    j.bam = (j.bam || 0) + 1;
    this._j39Entregar(j, s.pgn, sa, bytes.slice(0, s.tam));
  },

  /* Un PGN ya listo para interpretar, venga de una trama suelta o rearmado de
     varios paquetes. */
  _j39Entregar(j, pgn, sa, data) {
    j.pgns[pgn] = (j.pgns[pgn] || 0) + 1;
    const defs = this._J39_PGNS[pgn];
    if (defs) for (const s of defs) { const v = s.f(data); if (v !== null) j.datos[s.k] = v; }
    /* POR DIRECCIÓN DE ORIGEN, no en una sola variable. En J1939 CADA módulo
       difunde su propio DM1: motor, ABS, transmisión, tablero. Guardarlos en un
       único campo hacía que el último en llegar pisara a los demás — y como el
       motor transmite mucho más seguido que el ABS, las fallas de frenos
       desaparecían del escaneo. Un camión con el ABS averiado salía "sin
       códigos", que es la peor forma de fallar que puede tener esta pantalla. */
    if (pgn === 65226) j.dm1[sa] = data;
    if (pgn === 65227) j.dm2[sa] = data;
    if (pgn === 65260) j.vin = data;
    if (pgn === 65259) j.comp = data;
    if (pgn === 60928) { const n = this._j39NAME(data); if (n) j.claim[sa] = n; }
    if (j.esperas[pgn]) { j.esperas[pgn](); delete j.esperas[pgn]; }
  },

  /* Recorre el DM1/DM2 de TODOS los módulos y devuelve las fallas con el módulo
     que las reportó. */
  _j39DTCsTodos(mapa) {
    const res = [];
    for (const sa of Object.keys(mapa || {})) {
      const n = Number(sa);
      for (const f of this._j39DTCs(mapa[sa]))
        res.push({ ...f, ecu: n, modulo: this._nombreSA(n) });
    }
    return res;
  },

  /* PGN 59904 (Request). Por omisión va a la dirección global (0xFF) y contesta
     el que quiera; con `da` se le pregunta a UN módulo concreto, que es la
     única forma de sacarle los códigos al que no difunde nada por su cuenta
     (pasa con varios TCM: solo hablan si se les pregunta directo). */
  _j39Solicitar(pgn, da = 0xFF) {
    return this._puenteOp({ op:'enviar', datos:[0x00, 0xEA, 0x00, 6, 0xF9, da & 0xFF, pgn & 0xFF, (pgn >> 8) & 0xFF, (pgn >> 16) & 0xFF] });
  },

  _j39Esperar(pgn, ms) {
    return new Promise(res => { this._j39.esperas[pgn] = res; setTimeout(res, ms); });
  },

  _j39DTCs(d) {   // DM1/DM2: [lámparas×2] + n×[SPN 19 bits | FMI 5 | CM 1 | OC 7]
    if (!d || d.length < 6) return [];
    const res = [];
    for (let i = 2; i + 3 < d.length; i += 4) {
      const spn = d[i] | (d[i + 1] << 8) | ((d[i + 2] >> 5) << 16);
      const fmi = d[i + 2] & 0x1F, oc = d[i + 3] & 0x7F;
      if (!spn) continue;
      const codigo = `SPN ${spn} FMI ${fmi}`;
      if (res.some(x => x.codigo === codigo)) continue;
      res.push({ codigo, desc: `${this._J39_SPNS[spn] || 'Componente SPN ' + spn} — ${this._FMI[fmi] || 'FMI ' + fmi}${oc > 1 ? ` (${oc} veces)` : ''}` });
    }
    return res;
  },

  _j39VIN() {
    if (!this._j39?.vin) return null;
    const s = String.fromCharCode(...this._j39.vin).split('*')[0].replace(/[^A-HJ-NPR-Z0-9]/g, '');
    return s.length >= 17 ? s.slice(0, 17) : (s.length >= 11 ? s : null);
  },

  async _escanearJ1939(vehId, btn, log) {
    try {
      log('Conectando al puente USB local...');
      await this._puenteConectar();
      const est = await this._puenteEstado();
      log(`Puente USB: <b>${est.dispositivo || 'RP1210'}</b> v${est.version || '?'} ✓`);
      const c = await this._puenteOp({ op:'conectar', protocolo:`J1939:Baud=${this._j39Baud || 250}`, device:1 });
      if (!c.ok) throw new Error(`El puente no pudo abrir el USB-Link: ${c.error || 'código ' + c.codigo}. ¿Está enchufado a la PC?`);
      this._j39 = { datos:{}, pgns:{}, esperas:{}, sas:{}, dm1:{}, dm2:{}, tp:{}, claim:{}, vin:null, comp:null };
      /* Reclamar la dirección de herramienta de diagnóstico (0xF9) en el bus.
         El número de comando de RP1210 para esto no está verificado contra este
         hardware, así que se prueban los dos candidatos y se reporta cuál pasó
         en vez de fiarse de la memoria del spec. Escuchar DM1 no lo necesita
         (el camión transmite solo), por eso fallar acá no rompe el escaneo. */
      let claim = null;
      for (const num of [19, 15]) {
        const r = await this._puenteOp({ op:'comando', numero:num, datos:[0xF9, 0, 0, 0x60, 0, 0, 0, 0, 0x80, 0] }).catch(() => null);
        if (r && r.ok) { claim = num; break; }
      }
      log(claim ? `Dirección de diagnóstico reclamada (comando ${claim}) ✓`
                : 'No se pudo reclamar dirección — se escucha igual (el camión transmite solo)');
      log('Escuchando el bus J1939 (el camión transmite solo)...');
      const j = this._j39;
      /* Los PGN lentos (odómetro, horas, DM1 de un módulo dormido) pueden tardar
         más de 2,5 s en aparecer; con el plazo fijo se perdían de a ratos y el
         escaneo salía distinto en cada intento sobre el mismo camión. */
      const esc = await this._escucharBus(
        () => `${Object.keys(j.pgns).length}|${Object.keys(j.datos).length}|${Object.keys(j.sas).length}|${Object.keys(j.dm1).length}`,
        { min:2000, max:14000, quieto:2500,
          log: () => log(`&nbsp;&nbsp;<span style="color:var(--text3)">…${Object.keys(j.pgns).length} tipo(s) de mensaje, ${Object.keys(j.datos).length} parámetro(s)</span>`) });
      log(`Escucha ${esc.motivo === 'tope' ? 'cortada por tiempo' : 'completa'} (${(esc.ms/1000).toFixed(1)} s)`);
      /* Misma ventana que en J1708: dar chance a girar la llave antes de dar el
         escaneo por perdido. */
      if (!j.total) {
        log('<b style="color:var(--amber)">Bus mudo — poné el switch en contacto AHORA.</b> Reintentando 15 s...');
        await this._escucharBus(() => j.total, { min:3000, max:15000, quieto:2500,
          log: () => log('&nbsp;&nbsp;<span style="color:var(--text3)">…esperando</span>') });
      }
      const nPGN = Object.keys(this._j39.pgns).length;
      if (!j.total) log('<span style="color:var(--amber)">Bus silencioso — ¿switch encendido?</span>');
      else if (!nPGN) log(`<span style="color:var(--amber)">Llegan tramas (${j.total}) pero ninguna se pudo interpretar</span>`);
      else log(`${nPGN} tipos de mensaje detectados en ${j.total} tramas ✓`);

      /* Si el bus habla pero no se reconoce ni un PGN conocido, casi seguro el
         offset de la trama RP1210 no es el que asumimos. Se vuelca la trama
         cruda al log para corregirlo con evidencia en una sola visita al camión
         en vez de ir probando offsets a ciegas. */
      const conocidos = Object.keys(j.pgns).filter(p => this._J39_PGNS[p]).length;
      if (j.total && !conocidos && j.crudo?.length) {
        log('<b>Diagnóstico — trama cruda tal como llega del adaptador:</b>');
        for (const t of j.crudo) log(`&nbsp;&nbsp;<code>${t.map(x => x.toString(16).padStart(2, '0')).join(' ')}</code>`);
        log(`&nbsp;&nbsp;(${j.cortas || 0} tramas más cortas de 10 bytes) — mandale esto a soporte`);
      }

      /* El VIN y la identificación vienen partidos en varios paquetes (17
         caracteres no entran en 8 bytes), así que hay que darles más margen que
         a un PGN suelto: la respuesta completa tarda lo que tarde el módulo en
         mandar todos los pedazos. */
      log('Solicitando VIN e identificación...');
      await this._j39Solicitar(65260); await this._j39Esperar(65260, 3000);
      await this._j39Solicitar(65259); await this._j39Esperar(65259, 2500);
      const vin = this._j39VIN();
      log(vin ? `VIN: <b>${vin}</b>` : 'VIN no disponible por J1939');
      if (this._j39.comp) {
        const comp = String.fromCharCode(...this._j39.comp).replace(/[^\x20-\x7E*]/g, '').split('*').filter(Boolean);
        if (comp.length) log(`Unidad: <b>${comp.slice(0, 2).join(' · ')}</b>`);
      }

      /* Enumerar ANTES de pedir códigos: así se sabe a quién preguntarle. */
      log('Preguntando al bus qué módulos hay (Address Claim)...');
      const enumerados = await this._j39Enumerar(log);

      log('Leyendo códigos de falla (DM1 activos / DM2 previos)...');
      if (!Object.keys(this._j39.dm1).length) { await this._j39Solicitar(65226); await this._j39Esperar(65226, 1500); }
      await this._j39Solicitar(65227); await this._j39Esperar(65227, 1500);
      /* Se piden a la dirección global, así que contestan TODOS los módulos:
         hay que darles tiempo a los lentos (el ABS suele contestar después del
         motor) en vez de leer apenas llega la primera respuesta. */
      await this._escucharBus(
        () => `${Object.keys(this._j39.dm1).length}|${Object.keys(this._j39.dm2).length}`,
        { min:1200, max:6000, quieto:1500 });

      /* A los que se identificaron pero no contestaron a la pregunta general se
         les pregunta DIRIGIDO. Varios TCM (y módulos de carrocería) solo hablan
         si se les pregunta a su dirección: con la pregunta global se quedaban
         callados y parecía que el camión no los tenía. */
      const callados = enumerados.filter(sa => !this._j39.dm1[sa] && !this._j39.dm2[sa]);
      if (callados.length) {
        log(`${callados.length} módulo(s) no contestaron a la pregunta general — preguntando uno por uno...`);
        for (const sa of callados) {
          await this._j39Solicitar(65226, sa);
          await this._j39Solicitar(65227, sa);
          await this._escucharBus(() => `${this._j39.dm1[sa] ? 1 : 0}${this._j39.dm2[sa] ? 1 : 0}`,
            { min:400, max:1800, quieto:500 });
          const r = this._j39.dm1[sa] || this._j39.dm2[sa];
          log(`&nbsp;&nbsp;${this._nombreSA(sa)}: ${r ? 'respondió ✓' : 'sin respuesta'}`);
        }
      }
      let dtcs = this._j39DTCsTodos(this._j39.dm1);
      let pend = this._j39DTCsTodos(this._j39.dm2);
      dtcs = await this._enriquecerDTCs(dtcs, vehId, 'j1939');
      pend = await this._enriquecerDTCs(pend, vehId, 'j1939');

      /* Las lámparas las reporta cada módulo; vale la peor de todas. Antes se
         leía solo el byte del último DM1 recibido, así que una lámpara de paro
         encendida por el ABS podía no mostrarse nunca. */
      let peor = 0, paro = false, ambar = false;
      for (const sa of Object.keys(this._j39.dm1)) {
        const b = this._j39.dm1[sa][0] || 0;
        if (((b >> 6) & 3) === 1) peor = 1;
        if (((b >> 4) & 3) === 1) paro = true;
        if (((b >> 2) & 3) === 1) ambar = true;
      }
      const mil = peor === 1;
      if (paro)  log('<span style="color:var(--red)">🔴 Lámpara de PARO encendida — atender de inmediato</span>');
      if (ambar) log('<span style="color:var(--amber)">🟠 Lámpara ámbar de advertencia encendida</span>');

      /* Qué módulo reportó qué: es la diferencia entre "el camión tiene 3
         fallas" y "el ABS tiene una falla de sensor de rueda". */
      const porMod = {};
      for (const d of dtcs) porMod[d.modulo] = (porMod[d.modulo] || 0) + 1;
      log(`${dtcs.length} falla(s) activa(s), ${pend.length} previa(s)`);
      for (const m of Object.keys(porMod)) log(`&nbsp;&nbsp;${m}: ${porMod[m]}`);

      let nhtsa = null;
      if (vin) {
        log('Consultando VIN en base de datos NHTSA...');
        nhtsa = await this._decodeVIN(vin);
        log(nhtsa ? `VIN identificado: <b>${nhtsa.marca} ${nhtsa.modelo || ''} ${nhtsa.anio || ''}</b>` : 'VIN sin coincidencias en NHTSA');
      }

      this._sop = Object.keys(this._j39.datos).filter(k => typeof this._j39.datos[k] === 'number');
      log(`${this._sop.length} sensores del motor en el bus ✓`);

      /* Mismo criterio que en OBD-II: si el bus no dijo NADA, no se puede
         afirmar que el camión esté sano. */
      if (!j.total && !Object.keys(this._j39.claim).length) {
        throw new Error(
          'SIN COMUNICACIÓN CON EL BUS J1939 — no llegó ninguna trama, así que NO se puede afirmar que el camión no tenga fallas. ' +
          'Revisá el cable en el conector, el switch en contacto y que el adaptador esté alimentado por los 12 V del vehículo.');
      }
      /* La lista definitiva junta a los que se identificaron (Address Claim) con
         los que se oyeron difundiendo: un módulo puede aparecer por cualquiera
         de las dos vías y ninguna sola alcanza. */
      const sas = [...new Set([...enumerados, ...Object.keys(this._j39.sas).map(Number)])]
        .sort((a, b) => a - b);
      if (sas.length) log(`Módulos en el bus: ${sas.map(s => this._nombreSA(s)).join(' · ')}`);

      log('Comparando con la visita anterior de esta unidad...');
      const comparacion = await this._compararConAnterior(vehId, { dtcs });
      this._logComparacion(comparacion, log);

      this._scan = { costo: this._costoEscaneo(vehId),
                     vehiculo_id: vehId, vin, protocolo: 'J1939 (camión · USB)',
                     adaptador: est.dispositivo || 'USB-Link (RP1210)', mil,
                     dtcs, dtcs_pendientes: pend, datos: { ...this._j39.datos },
                     modulos: sas.map(s => ({ ecu: s, nombre: this._nombreSA(s) })),
                     freeze_frame: null, voltaje: this._voltajeDe(this._j39.datos), nhtsa,
                     comparacion };
      log('<b>Escaneo completo ✓</b>');
      this._renderResultado();
      document.getElementById('obd-btn-save').style.display = '';
      btn.textContent = '↻ Re-escanear';
    } catch (e) {
      log(`<span style="color:var(--red)">✗ ${e.message}</span>`);
      UI.toast(e.message, 'error');
    } finally { btn.disabled = false; }
  },

  /* ═══════════ DESCRIPCIONES DTC EN ESPAÑOL ═══════════ */
  /* Diccionario DTC genéricos SAE en español.
     Base: lista MIT de todrobbins/dtcdb (SAE J2012 genéricos), normalizada y
     traducida por tools/dtc/ — ver ese directorio para regenerar y auditar.
     La fuente traía defectos reales (líneas truncadas, "02"→O2, "Cylinder I"→1,
     'Stock On'→'Stuck On'); se reparan ahí, no a mano aquí.
     OJO: la tabla dtc_catalogo de la BD está corrida un lugar desde ~P0170 y por
     eso NO se usa como fuente de verdad; este diccionario manda. */
  _DTCS: {
    B0001:'Despliegue de bolsa de aire del conductor',
    C0035:'Sensor de velocidad rueda del. izq.',
    C0040:'Sensor de velocidad rueda del. der.',
    P0011:'Sincronización del árbol de levas "A" adelantada (Banco 1)',
    P0016:'Correlación cigüeñal-árbol de levas (Banco 1 Sensor A)',
    P0030:'Circuito calentador sensor O2 (B1 S1)',
    P0031:'Calentador sensor O2 señal baja (B1 S1)',
    P0087:'Presión de riel de combustible muy baja',
    P0088:'Presión de riel de combustible muy alta',
    P0100:'Circuito del sensor MAF (flujo de aire)',
    P0101:'Rango/desempeño del sensor MAF',
    P0102:'Señal baja del sensor MAF',
    P0103:'Señal alta del sensor MAF',
    P0104:'Sensor de flujo de aire (MAF) — señal intermitente',
    P0105:'Circuito del sensor MAP (presión absoluta)',
    P0106:'Rango/desempeño del sensor MAP',
    P0107:'Presión absoluta del múltiple (MAP)/barométrica — señal baja',
    P0108:'Presión absoluta del múltiple (MAP)/barométrica — señal alta',
    P0109:'Presión absoluta del múltiple (MAP)/barométrica — señal intermitente',
    P0110:'Circuito sensor temperatura de aire de admisión',
    P0111:'Temperatura del aire de admisión (IAT) — rango/desempeño fuera de especificación',
    P0112:'Temperatura del aire de admisión (IAT) — señal baja',
    P0113:'Señal alta temp. aire de admisión',
    P0114:'Temperatura del aire de admisión (IAT) — señal intermitente',
    P0115:'Circuito sensor temperatura de refrigerante',
    P0116:'Rango/desempeño temp. refrigerante',
    P0117:'Señal baja temp. refrigerante',
    P0118:'Señal alta temp. refrigerante',
    P0119:'Temperatura del refrigerante (ECT) — señal intermitente',
    P0120:'Circuito sensor posición del acelerador (TPS)',
    P0121:'Rango/desempeño del TPS',
    P0122:'Señal baja del TPS',
    P0123:'Señal alta del TPS',
    P0124:'Sensor/interruptor de posición del acelerador (TPS) A — señal intermitente',
    P0125:'Temperatura insuficiente para control de combustible',
    P0126:'Temperatura de refrigerante insuficiente (termostato)',
    P0128:'Termostato — refrigerante no alcanza temperatura',
    P0130:'Circuito sensor O2 (B1 S1)',
    P0131:'Voltaje bajo sensor O2 (B1 S1)',
    P0132:'Sensor de oxígeno (O2) — voltaje alto (Banco 1 Sensor 1)',
    P0133:'Respuesta lenta sensor O2 (B1 S1)',
    P0134:'Sensor O2 sin actividad (B1 S1)',
    P0135:'Calentador sensor O2 (B1 S1)',
    P0136:'Circuito sensor O2 (B1 S2)',
    P0137:'Sensor de oxígeno (O2) — voltaje bajo (Banco 1 Sensor 2)',
    P0138:'Sensor de oxígeno (O2) — voltaje alto (Banco 1 Sensor 2)',
    P0139:'Sensor de oxígeno (O2) — respuesta lenta (Banco 1 Sensor 2)',
    P0140:'Sensor de oxígeno (O2) — sin actividad (Banco 1 Sensor 2)',
    P0141:'Calentador sensor O2 (B1 S2)',
    P0142:'Sensor de oxígeno (O2) — falla (Banco 1 Sensor 3)',
    P0143:'Sensor de oxígeno (O2) — voltaje bajo (Banco 1 Sensor 3)',
    P0144:'Sensor de oxígeno (O2) — voltaje alto (Banco 1 Sensor 3)',
    P0145:'Sensor de oxígeno (O2) — respuesta lenta (Banco 1 Sensor 3)',
    P0146:'Sensor de oxígeno (O2) — sin actividad (Banco 1 Sensor 3)',
    P0147:'Calentador del Sensor de oxígeno (O2) — falla (Banco 1 Sensor 3)',
    P0150:'Sensor de oxígeno (O2) — falla (Banco 2 Sensor 1)',
    P0151:'Sensor de oxígeno (O2) — voltaje bajo (Banco 2 Sensor 1)',
    P0152:'Sensor de oxígeno (O2) — voltaje alto (Banco 2 Sensor 1)',
    P0153:'Sensor de oxígeno (O2) — respuesta lenta (Banco 2 Sensor 1)',
    P0154:'Sensor de oxígeno (O2) — sin actividad (Banco 2 Sensor 1)',
    P0155:'Calentador del Sensor de oxígeno (O2) — falla (Banco 2 Sensor 1)',
    P0156:'Sensor de oxígeno (O2) — falla (Banco 2 Sensor 2)',
    P0157:'Sensor de oxígeno (O2) — voltaje bajo (Banco 2 Sensor 2)',
    P0158:'Sensor de oxígeno (O2) — voltaje alto (Banco 2 Sensor 2)',
    P0159:'Sensor de oxígeno (O2) — respuesta lenta (Banco 2 Sensor 2)',
    P0160:'Sensor de oxígeno (O2) — sin actividad (Banco 2 Sensor 2)',
    P0161:'Calentador del Sensor de oxígeno (O2) — falla (Banco 2 Sensor 2)',
    P0162:'Sensor de oxígeno (O2) — falla (Banco 2 Sensor 3)',
    P0163:'Sensor de oxígeno (O2) — voltaje bajo (Banco 2 Sensor 3)',
    P0164:'Sensor de oxígeno (O2) — voltaje alto (Banco 2 Sensor 3)',
    P0165:'Sensor de oxígeno (O2) — respuesta lenta (Banco 2 Sensor 3)',
    P0166:'Sensor de oxígeno (O2) — sin actividad (Banco 2 Sensor 3)',
    P0167:'Calentador del Sensor de oxígeno (O2) — falla (Banco 2 Sensor 3)',
    P0170:'Ajuste de combustible — falla (Banco 1)',
    P0171:'Mezcla muy pobre (Banco 1)',
    P0172:'Mezcla muy rica (Banco 1)',
    P0173:'Ajuste de combustible — falla (Banco 2)',
    P0174:'Mezcla muy pobre (Banco 2)',
    P0175:'Mezcla muy rica (Banco 2)',
    P0176:'Combustible composición Sensor — falla',
    P0177:'Combustible composición Sensor — rango/desempeño fuera de especificación',
    P0178:'Combustible composición Sensor — señal baja',
    P0179:'Combustible composición Sensor — señal alta',
    P0180:'Sensor de temperatura de combustible A — falla',
    P0181:'Sensor de temperatura de combustible A — rango/desempeño fuera de especificación',
    P0182:'Sensor de temperatura de combustible A — señal baja',
    P0183:'Sensor de temperatura de combustible A — señal alta',
    P0184:'Sensor de temperatura de combustible A — señal intermitente',
    P0185:'Sensor de temperatura de combustible B — falla',
    P0186:'Sensor de temperatura de combustible B — rango/desempeño fuera de especificación',
    P0187:'Sensor de temperatura de combustible B — señal baja',
    P0188:'Sensor de temperatura de combustible B — señal alta',
    P0189:'Sensor de temperatura de combustible B — señal intermitente',
    P0190:'Sensor de presión del riel de combustible — falla',
    P0191:'Sensor de presión del riel de combustible — rango/desempeño fuera de especificación',
    P0192:'Sensor de presión del riel de combustible — señal baja',
    P0193:'Sensor de presión del riel de combustible — señal alta',
    P0194:'Sensor de presión del riel de combustible — señal intermitente',
    P0195:'Sensor de temperatura del aceite — falla',
    P0196:'Sensor de temperatura del aceite — rango/desempeño fuera de especificación',
    P0197:'Sensor de temperatura del aceite bajo',
    P0198:'Sensor de temperatura del aceite alto',
    P0199:'Sensor de temperatura del aceite — intermitente',
    P0200:'Circuito de inyectores',
    P0201:'Circuito inyector cilindro 1',
    P0202:'Circuito inyector cilindro 2',
    P0203:'Circuito inyector cilindro 3',
    P0204:'Circuito inyector cilindro 4',
    P0205:'Circuito del inyector — falla - Cilindro 5',
    P0206:'Circuito del inyector — falla - Cilindro 6',
    P0207:'Circuito del inyector — falla - Cilindro 7',
    P0208:'Circuito del inyector — falla - Cilindro 8',
    P0209:'Circuito del inyector — falla - Cilindro 9',
    P0210:'Circuito del inyector — falla - Cilindro 10',
    P0211:'Circuito del inyector — falla - Cilindro 11',
    P0212:'Circuito del inyector — falla - Cilindro 12',
    P0213:'Inyector de arranque en frío 1 — falla',
    P0214:'Inyector de arranque en frío 2 — falla',
    P0215:'Motor corte Solenoide — falla',
    P0216:'Control de sincronización de inyección — falla',
    P0217:'Sobretemperatura del Motor condición',
    P0218:'Transmisión sobretemperatura condición',
    P0219:'Motor sobrevelocidad condición',
    P0220:'Sensor/interruptor de posición del acelerador (TPS) B — falla',
    P0221:'Sensor/interruptor de posición del acelerador (TPS) B — rango/desempeño fuera de especificación',
    P0222:'Sensor/interruptor de posición del acelerador (TPS) B — señal baja',
    P0223:'Sensor/interruptor de posición del acelerador (TPS) B — señal alta',
    P0224:'Sensor/interruptor de posición del acelerador (TPS) B — señal intermitente',
    P0225:'Sensor/interruptor de posición del acelerador (TPS) C — falla',
    P0226:'Sensor/interruptor de posición del acelerador (TPS) C — rango/desempeño fuera de especificación',
    P0227:'Sensor/interruptor de posición del acelerador (TPS) C — señal baja',
    P0228:'Sensor/interruptor de posición del acelerador (TPS) C — señal alta',
    P0229:'Sensor/interruptor de posición del acelerador (TPS) C — señal intermitente',
    P0230:'Bomba de combustible primario — falla',
    P0231:'Bomba de combustible secundario — señal baja',
    P0232:'Bomba de combustible secundario — señal alta',
    P0233:'Bomba de combustible secundario — señal intermitente',
    P0234:'Motor sobrepresión de turbo condición',
    P0235:'Sensor de presión de turbo A — falla',
    P0236:'Sensor de presión de turbo A — rango/desempeño fuera de especificación',
    P0237:'Sensor de presión de turbo A — señal baja',
    P0238:'Sensor de presión de turbo A — señal alta',
    P0239:'Sensor de presión de turbo B — falla',
    P0240:'Sensor de presión de turbo B — rango/desempeño fuera de especificación',
    P0241:'Sensor de presión de turbo B — señal baja',
    P0242:'Sensor de presión de turbo B — señal alta',
    P0243:'Wastegate del turbo Solenoide A — falla',
    P0244:'Wastegate del turbo Solenoide A — rango/desempeño fuera de especificación',
    P0245:'Wastegate del turbo Solenoide A bajo',
    P0246:'Wastegate del turbo Solenoide A alto',
    P0247:'Wastegate del turbo Solenoide B — falla',
    P0248:'Wastegate del turbo Solenoide B — rango/desempeño fuera de especificación',
    P0249:'Wastegate del turbo Solenoide B bajo',
    P0250:'Wastegate del turbo Solenoide B alto',
    P0251:'Control de dosificación de la bomba de inyección "A" — falla (árbol de levas/rotor/Inyector)',
    P0252:'Control de dosificación de la bomba de inyección "A" — rango/desempeño fuera de especificación (árbol de levas/rotor/Inyector)',
    P0253:'Control de dosificación de la bomba de inyección "A" bajo (árbol de levas/rotor/Inyector)',
    P0254:'Control de dosificación de la bomba de inyección "A" alto (árbol de levas/rotor/Inyector)',
    P0255:'Control de dosificación de la bomba de inyección "A" — intermitente (árbol de levas/rotor/Inyector)',
    P0256:'Control de dosificación de la bomba de inyección "B" — falla (árbol de levas/rotor/Inyector)',
    P0257:'Control de dosificación de la bomba de inyección "B" — rango/desempeño fuera de especificación (árbol de levas/rotor/Inyector)',
    P0258:'Control de dosificación de la bomba de inyección "B" bajo (árbol de levas/rotor/Inyector)',
    P0259:'Control de dosificación de la bomba de inyección "B" alto (árbol de levas/rotor/Inyector)',
    P0260:'Control de dosificación de la bomba de inyección "B" — intermitente (árbol de levas/rotor/Inyector)',
    P0261:'Cilindro 1 Circuito del inyector bajo',
    P0262:'Cilindro 1 Circuito del inyector alto',
    P0263:'Cilindro 1 Contribución/ — desbalance',
    P0264:'Cilindro 2 Circuito del inyector bajo',
    P0265:'Cilindro 2 Circuito del inyector alto',
    P0266:'Cilindro 2 Contribución/ — desbalance',
    P0267:'Cilindro 3 Circuito del inyector bajo',
    P0268:'Cilindro 3 Circuito del inyector alto',
    P0269:'Cilindro 3 Contribución/ — desbalance',
    P0270:'Cilindro 4 Circuito del inyector bajo',
    P0271:'Cilindro 4 Circuito del inyector alto',
    P0272:'Cilindro 4 Contribución/ — desbalance',
    P0273:'Cilindro 5 Circuito del inyector bajo',
    P0274:'Cilindro 5 Circuito del inyector alto',
    P0275:'Cilindro 5 Contribución/ — desbalance',
    P0276:'Cilindro 6 Circuito del inyector bajo',
    P0277:'Cilindro 6 Circuito del inyector alto',
    P0278:'Cilindro 6 Contribución/ — desbalance',
    P0279:'Cilindro 7 Circuito del inyector bajo',
    P0280:'Cilindro 7 Circuito del inyector alto',
    P0281:'Cilindro 7 Contribución/ — desbalance',
    P0282:'Cilindro 8 Circuito del inyector bajo',
    P0283:'Cilindro 8 Circuito del inyector alto',
    P0284:'Cilindro 8 Contribución/ — desbalance',
    P0285:'Cilindro 9 Circuito del inyector bajo',
    P0286:'Cilindro 9 Circuito del inyector alto',
    P0287:'Cilindro 9 Contribución/ — desbalance',
    P0288:'Cilindro 10 Circuito del inyector bajo',
    P0289:'Cilindro 10 Circuito del inyector alto',
    P0290:'Cilindro 10 Contribución/ — desbalance',
    P0291:'Cilindro 11 Circuito del inyector bajo',
    P0292:'Cilindro 11 Circuito del inyector alto',
    P0293:'Cilindro 11 Contribución/ — desbalance',
    P0294:'Cilindro 12 Circuito del inyector bajo',
    P0295:'Cilindro 12 Circuito del inyector alto',
    P0296:'Cilindro 12 — contribución/rango fuera de especificación',
    P0300:'Fallo de encendido múltiple/aleatorio (misfire)',
    P0301:'Fallo de encendido cilindro 1',
    P0302:'Fallo de encendido cilindro 2',
    P0303:'Fallo de encendido cilindro 3',
    P0304:'Fallo de encendido cilindro 4',
    P0305:'Fallo de encendido cilindro 5',
    P0306:'Fallo de encendido cilindro 6',
    P0307:'Fallo de encendido en cilindro 7 detectado',
    P0308:'Fallo de encendido en cilindro 8 detectado',
    P0309:'Fallo de encendido en cilindro 9 detectado',
    P0311:'Fallo de encendido en cilindro 11 detectado',
    P0312:'Fallo de encendido en cilindro 12 detectado',
    P0320:'Señal de RPM de encendido/distribuidor — falla',
    P0321:'Señal de RPM de encendido/distribuidor — rango/desempeño fuera de especificación',
    P0322:'Señal de RPM de encendido/distribuidor — sin señal',
    P0323:'Señal de RPM de encendido/distribuidor — señal intermitente',
    P0325:'Circuito sensor de detonación (knock)',
    P0326:'Sensor de detonación (knock) 1 — rango/desempeño fuera de especificación (Banco 1 o Sensor único)',
    P0327:'Sensor de detonación (knock) 1 — señal baja (Banco 1 o Sensor único)',
    P0328:'Sensor de detonación (knock) 1 — señal alta (Banco 1 o Sensor único)',
    P0329:'Sensor de detonación (knock) 1 — señal intermitente (Banco 1 o Sensor único)',
    P0330:'Sensor de detonación (knock) 2 — falla (Banco 2)',
    P0331:'Sensor de detonación (knock) 2 — rango/desempeño fuera de especificación (Banco 2)',
    P0332:'Sensor de detonación (knock) 2 — señal baja (Banco 2)',
    P0333:'Sensor de detonación (knock) 2 — señal alta (Banco 2)',
    P0334:'Sensor de detonación (knock) 2 — señal intermitente (Banco 2)',
    P0335:'Circuito sensor posición cigüeñal (CKP)',
    P0336:'Sensor de posición del cigüeñal (CKP) A — rango/desempeño fuera de especificación',
    P0337:'Sensor de posición del cigüeñal (CKP) A — señal baja',
    P0338:'Sensor de posición del cigüeñal (CKP) A — señal alta',
    P0339:'Sensor de posición del cigüeñal (CKP) A — señal intermitente',
    P0340:'Circuito sensor posición árbol de levas (CMP)',
    P0341:'Sensor de posición del árbol de levas (CMP) — rango/desempeño fuera de especificación',
    P0342:'Sensor de posición del árbol de levas (CMP) — señal baja',
    P0343:'Sensor de posición del árbol de levas (CMP) — señal alta',
    P0344:'Sensor de posición del árbol de levas (CMP) — señal intermitente',
    P0350:'Bobina de encendido primario/secundario — falla',
    P0351:'Bobina de encendido A primario/secundario — falla',
    P0352:'Bobina de encendido B primario/secundario — falla',
    P0353:'Bobina de encendido C primario/secundario — falla',
    P0354:'Bobina de encendido D primario/secundario — falla',
    P0355:'Bobina de encendido E primario/secundario — falla',
    P0356:'Bobina de encendido F primario/secundario — falla',
    P0357:'Bobina de encendido G primario/secundario — falla',
    P0358:'Bobina de encendido H primario/secundario — falla',
    P0359:'Bobina de encendido I primario/secundario — falla',
    P0360:'Bobina de encendido J primario/secundario — falla',
    P0361:'Bobina de encendido K primario/secundario — falla',
    P0362:'Bobina de encendido L primario/secundario — falla',
    P0370:'Señal de referencia de sincronización de alta resolución A — falla',
    P0371:'Señal de referencia de sincronización de alta resolución A — demasiados pulsos',
    P0372:'Señal de referencia de sincronización de alta resolución A — pulsos insuficientes',
    P0373:'Señal de referencia de sincronización de alta resolución A — intermitente/errático Pulsos',
    P0374:'Señal de referencia de sincronización de alta resolución A sin Pulsos',
    P0375:'Señal de referencia de sincronización de alta resolución B — falla',
    P0376:'Señal de referencia de sincronización de alta resolución B — demasiados pulsos',
    P0377:'Señal de referencia de sincronización de alta resolución B — pulsos insuficientes',
    P0378:'Señal de referencia de sincronización de alta resolución B — intermitente/errático Pulsos',
    P0379:'Señal de referencia de sincronización de alta resolución B sin Pulsos',
    P0380:'Bujía incandescente/Calentador "A" — falla',
    P0381:'Bujía incandescente/Calentador indicador — falla',
    P0382:'Recirculación de gases de escape (EGR) Flujo — falla',
    P0385:'Sensor de posición del cigüeñal (CKP) B — falla',
    P0386:'Sensor de posición del cigüeñal (CKP) B — rango/desempeño fuera de especificación',
    P0387:'Sensor de posición del cigüeñal (CKP) B — señal baja',
    P0388:'Sensor de posición del cigüeñal (CKP) B — señal alta',
    P0389:'Sensor de posición del cigüeñal (CKP) B — señal intermitente',
    P0400:'Flujo de recirculación de gases EGR',
    P0401:'Flujo EGR insuficiente',
    P0402:'Flujo EGR excesivo',
    P0403:'Circuito de control EGR',
    P0404:'Recirculación de gases de escape (EGR) — rango/desempeño fuera de especificación',
    P0405:'Recirculación de gases de escape (EGR) Sensor A — señal baja',
    P0406:'Recirculación de gases de escape (EGR) Sensor A — señal alta',
    P0407:'Recirculación de gases de escape (EGR) Sensor B — señal baja',
    P0408:'Recirculación de gases de escape (EGR) Sensor B — señal alta',
    P0410:'Sistema de inyección de aire secundario — falla',
    P0411:'Sistema de inyección de aire secundario incorrecto Flujo detectado',
    P0412:'Sistema de inyección de aire secundario conmutación Válvula A — falla',
    P0413:'Sistema de inyección de aire secundario conmutación Válvula A — abierto',
    P0414:'Sistema de inyección de aire secundario conmutación Válvula A — en corto',
    P0415:'Sistema de inyección de aire secundario conmutación Válvula B — falla',
    P0416:'Sistema de inyección de aire secundario conmutación Válvula B — abierto',
    P0417:'Sistema de inyección de aire secundario conmutación Válvula B — en corto',
    P0418:'Sistema de inyección de aire secundario Relé ‘A" — falla',
    P0419:'Sistema de inyección de aire secundario Relé "B’ — falla',
    P0420:'Eficiencia del catalizador bajo el umbral (Banco 1)',
    P0421:'Eficiencia del catalizador de arranque bajo el umbral (Banco 1)',
    P0422:'Eficiencia del catalizador principal bajo el umbral (Banco 1)',
    P0423:'calentado Catalizador Eficiencia bajo el umbral (Banco 1)',
    P0424:'calentado Catalizador Temperatura bajo el umbral (Banco 1)',
    P0430:'Eficiencia del catalizador bajo el umbral (Banco 2)',
    P0431:'Eficiencia del catalizador de arranque bajo el umbral (Banco 2)',
    P0432:'Eficiencia del catalizador principal bajo el umbral (Banco 2)',
    P0433:'calentado Catalizador Eficiencia bajo el umbral (Banco 2)',
    P0434:'calentado Catalizador Temperatura bajo el umbral (Banco 2)',
    P0440:'Sistema evaporativo EVAP',
    P0441:'Flujo de purga EVAP incorrecto',
    P0442:'Fuga pequeña en sistema EVAP',
    P0443:'Circuito válvula de purga EVAP',
    P0444:'Sistema de emisiones evaporativas (EVAP) Válvula de purga',
    P0445:'Sistema de emisiones evaporativas (EVAP) Válvula de purga — en corto',
    P0446:'Circuito de venteo EVAP',
    P0447:'Sistema de emisiones evaporativas (EVAP) Control de ventilación — abierto',
    P0448:'Sistema de emisiones evaporativas (EVAP) Control de ventilación — en corto',
    P0449:'Sistema de emisiones evaporativas (EVAP) Ventilación Válvula/Solenoide — falla',
    P0450:'Sensor de presión del sistema EVAP — falla',
    P0451:'Sensor de presión del sistema EVAP — rango/desempeño fuera de especificación',
    P0452:'Sensor de presión del sistema EVAP — señal baja',
    P0453:'Sensor de presión del sistema EVAP — señal alta',
    P0454:'Sensor de presión del sistema EVAP — intermitente',
    P0455:'Fuga grande en sistema EVAP',
    P0456:'Fuga muy pequeña en sistema EVAP',
    P0460:'Sensor de nivel de combustible — falla',
    P0461:'Sensor de nivel de combustible — rango/desempeño fuera de especificación',
    P0462:'Sensor de nivel de combustible — señal baja',
    P0463:'Sensor de nivel de combustible — señal alta',
    P0464:'Sensor de nivel de combustible — señal intermitente',
    P0465:'Purga Flujo Sensor — falla',
    P0466:'Purga Flujo Sensor — rango/desempeño fuera de especificación',
    P0467:'Purga Flujo Sensor — señal baja',
    P0468:'Purga Flujo Sensor — señal alta',
    P0469:'Purga Flujo Sensor — señal intermitente',
    P0470:'Escape Presión Sensor — falla',
    P0471:'Escape Presión Sensor — rango/desempeño fuera de especificación',
    P0472:'Escape Presión Sensor bajo',
    P0473:'Escape Presión Sensor alto',
    P0474:'Escape Presión Sensor — intermitente',
    P0475:'Escape Presión Control Válvula — falla',
    P0476:'Escape Presión Control Válvula — rango/desempeño fuera de especificación',
    P0477:'Escape Presión Control Válvula bajo',
    P0478:'Escape Presión Control Válvula alto',
    P0479:'Escape Presión Control Válvula — intermitente',
    P0480:'Electroventilador I Control — falla',
    P0481:'Electroventilador 2 Control — falla',
    P0482:'Electroventilador 3 Control — falla',
    P0483:'Electroventilador racionalidad revisión — falla',
    P0484:'Electroventilador sobre corriente',
    P0485:'Electroventilador Alimentación/Tierra — falla',
    P0500:'Sensor de velocidad del vehículo (VSS)',
    P0501:'Sensor de velocidad del vehículo (VSS) — rango/desempeño fuera de especificación',
    P0502:'Sensor de velocidad del vehículo (VSS) — señal baja',
    P0503:'Sensor de velocidad del vehículo (VSS) — intermitente/errático/alto',
    P0505:'Sistema de control de ralentí',
    P0506:'Ralentí más bajo de lo esperado',
    P0507:'Ralentí más alto de lo esperado',
    P0510:'cerrado Posición del acelerador Interruptor — falla',
    P0520:'Motor Aceite Presión Sensor/Interruptor — falla',
    P0521:'Motor Aceite Presión Sensor/Interruptor — rango/desempeño fuera de especificación',
    P0522:'Motor Aceite Presión Sensor/Interruptor — voltaje bajo',
    P0523:'Motor Aceite Presión Sensor/Interruptor — voltaje alto',
    P0530:'Sensor de presión del refrigerante A/C — falla',
    P0531:'Sensor de presión del refrigerante A/C — rango/desempeño fuera de especificación',
    P0532:'Sensor de presión del refrigerante A/C — señal baja',
    P0533:'Sensor de presión del refrigerante A/C — señal alta',
    P0534:'Aire acondicionado Refrigerante carga pérdida',
    P0550:'Sensor de presión de dirección hidráulica — falla',
    P0551:'Sensor de presión de dirección hidráulica — rango/desempeño fuera de especificación',
    P0552:'Sensor de presión de dirección hidráulica — señal baja',
    P0553:'Sensor de presión de dirección hidráulica — señal alta',
    P0554:'Sensor de presión de dirección hidráulica — señal intermitente',
    P0560:'Voltaje del sistema — falla',
    P0561:'Voltaje del sistema inestable',
    P0562:'Voltaje del sistema bajo (alternador/batería)',
    P0563:'Voltaje del sistema alto',
    P0565:'Control crucero encendido Señal — falla',
    P0566:'Control crucero apagado Señal — falla',
    P0567:'Control crucero reanudar Señal — falla',
    P0568:'Control crucero fijar Señal — falla',
    P0569:'Control crucero desaceleración Señal — falla',
    P0570:'Control crucero aceleración Señal — falla',
    P0571:'Control crucero/Interruptor de freno A — falla',
    P0572:'Control crucero/Interruptor de freno A — señal baja',
    P0573:'Control crucero/Interruptor de freno A — señal alta',
    P0574:'Control crucero relacionado — falla',
    P0575:'Control crucero relacionado — falla',
    P0576:'Control crucero relacionado — falla',
    P0578:'Control crucero relacionado — falla',
    P0579:'Control crucero relacionado — falla',
    P0580:'Control crucero relacionado — falla',
    P0600:'Enlace de comunicación serial — falla',
    P0601:'Memoria de la computadora (ECU) — checksum',
    P0602:'Módulo de Control programación error',
    P0603:'Memoria KAM de la ECU',
    P0604:'Módulo de Control interno Memoria RAM (RAM) error',
    P0605:'Memoria ROM de la ECU',
    P0606:'PCM Procesador falla',
    P0608:'Módulo de Control VSS salida "A’ — falla',
    P0609:'Módulo de Control VSS salida "B" — falla',
    P0620:'Alternador Control — falla',
    P0621:'Alternador Testigo "L" Control — falla',
    P0622:'Alternador campo "F" Control — falla',
    P0650:'Testigo de falla (MIL) (MIL) Control — falla',
    P0654:'Motor RPM salida — falla',
    P0655:'Motor caliente Testigo salida Control — falla',
    P0656:'Combustible Nivel salida — falla',
    P0700:'Sistema de control de la transmisión',
    P0701:'Sistema de Control de la transmisión — rango/desempeño fuera de especificación',
    P0702:'Sistema de Control de la transmisión eléctrico',
    P0703:'Convertidor de par/Interruptor de freno B — falla',
    P0704:'Interruptor de embrague entrada — falla',
    P0705:'Circuito sensor de rango de transmisión',
    P0706:'Sensor de rango de transmisión — rango/desempeño fuera de especificación',
    P0707:'Sensor de rango de transmisión — señal baja',
    P0708:'Sensor de rango de transmisión — señal alta',
    P0709:'Sensor de rango de transmisión — señal intermitente',
    P0710:'Sensor de temperatura del aceite de transmisión — falla',
    P0711:'Sensor de temperatura del aceite de transmisión — rango/desempeño fuera de especificación',
    P0712:'Sensor de temperatura del aceite de transmisión — señal baja',
    P0713:'Sensor de temperatura del aceite de transmisión — señal alta',
    P0714:'Sensor de temperatura del aceite de transmisión — señal intermitente',
    P0715:'Circuito sensor de turbina',
    P0716:'entrada/Sensor de velocidad de turbina — rango/desempeño fuera de especificación',
    P0717:'entrada/Sensor de velocidad de turbina — sin señal',
    P0718:'entrada/Sensor de velocidad de turbina — señal intermitente',
    P0719:'Convertidor de par/Interruptor de freno B — señal baja',
    P0720:'Circuito sensor de velocidad de salida',
    P0721:'Sensor de velocidad de salida — rango/desempeño fuera de especificación',
    P0722:'Sensor de velocidad de salida — sin señal',
    P0723:'Sensor de velocidad de salida — intermitente',
    P0724:'Convertidor de par/Interruptor de freno B — señal alta',
    P0725:'Señal de RPM del Motor — falla',
    P0726:'Señal de RPM del Motor — rango/desempeño fuera de especificación',
    P0727:'Señal de RPM del Motor — sin señal',
    P0728:'Señal de RPM del Motor — señal intermitente',
    P0730:'Relación de cambio incorrecta',
    P0731:'Relación incorrecta en 1ª marcha',
    P0732:'Relación incorrecta en 2ª marcha',
    P0733:'Relación incorrecta en 3ª marcha',
    P0734:'Relación incorrecta en 4ª marcha',
    P0735:'Relación incorrecta en 5ª marcha',
    P0736:'Relación incorrecta en reversa',
    P0740:'Circuito embrague convertidor de torque',
    P0741:'Convertidor de torque atascado',
    P0742:'Convertidor de par Embrague — atascado encendido',
    P0743:'Convertidor de par Embrague eléctrico',
    P0744:'Convertidor de par Embrague — señal intermitente',
    P0745:'Solenoide de Control de presión — falla',
    P0746:'Solenoide de Control de presión desempeño o atascado apagado',
    P0747:'Solenoide de Control de presión — atascado encendido',
    P0748:'Solenoide de Control de presión eléctrico',
    P0749:'Solenoide de Control de presión — intermitente',
    P0750:'Solenoide de cambio A',
    P0751:'Solenoide de cambio A desempeño o atascado apagado',
    P0752:'Solenoide de cambio A — atascado encendido',
    P0753:'Solenoide de cambio A eléctrico',
    P0754:'Solenoide de cambio A — intermitente',
    P0755:'Solenoide de cambio B',
    P0756:'Solenoide de cambio B desempeño o atascado apagado',
    P0757:'Solenoide de cambio B — atascado encendido',
    P0758:'Solenoide de cambio B eléctrico',
    P0759:'Solenoide de cambio B — intermitente',
    P0760:'Solenoide de cambio C — falla',
    P0761:'Solenoide de cambio C desempeño o atascado apagado',
    P0762:'Solenoide de cambio C — atascado encendido',
    P0763:'Solenoide de cambio C eléctrico',
    P0764:'Solenoide de cambio C — intermitente',
    P0765:'Solenoide de cambio D — falla',
    P0766:'Solenoide de cambio D desempeño o atascado apagado',
    P0767:'Solenoide de cambio D — atascado encendido',
    P0768:'Solenoide de cambio D eléctrico',
    P0769:'Solenoide de cambio D — intermitente',
    P0770:'Solenoide de cambio E — falla',
    P0771:'Solenoide de cambio E desempeño o atascado apagado',
    P0772:'Solenoide de cambio E — atascado encendido',
    P0773:'Solenoide de cambio E eléctrico',
    P0774:'Solenoide de cambio E — intermitente',
    P0780:'Cambio — falla',
    P0781:'Cambio 1-2 — falla',
    P0782:'Cambio 2-3 — falla',
    P0783:'Cambio 3-4 — falla',
    P0784:'Cambio 4-5 — falla',
    P0785:'Solenoide de cambio/sincronización — falla',
    P0786:'Solenoide de cambio/sincronización — rango/desempeño fuera de especificación',
    P0787:'Solenoide de cambio/sincronización bajo',
    P0788:'Solenoide de cambio/sincronización alto',
    P0789:'Solenoide de cambio/sincronización — intermitente',
    P0790:'Interruptor normal/desempeño — falla',
    P0801:'Control de inhibición de reversa — falla',
    P0803:'Solenoide de salto de cambio 1-4 — falla',
    P0804:'Testigo de salto de cambio 1-4 — falla',
    U0100:'Sin comunicación con la ECU del motor',
    U0101:'Sin comunicación con la TCM (transmisión)',
    U0121:'Sin comunicación con el módulo ABS',
    U0155:'Sin comunicación con el tablero',
  },
  /* ═══════════ MEMORIA DEL TALLER ═══════════
     Los manuales y NHTSA cubren el mercado de EE.UU.: el Hilux, el Canter y casi
     todo lo importado de Japón o Corea no están en ninguna de esas fuentes. Lo
     único que va a cubrir esos vehículos es lo que este taller ya resolvió, así
     que la bitácora se consulta durante el escaneo y se alimenta desde ahí. */
  async pintarBitacora(s) {
    const el = document.getElementById('obd-bitacora');
    if (!el) return;
    const v = (this._vehiculos || []).find(x => x.id === s.vehiculo_id);
    const marca = s.nhtsa?.marca || v?.marca || null;
    const modelo = s.nhtsa?.modelo || v?.modelo || null;
    const codigos = [...(s.dtcs || []), ...(s.dtcs_pendientes || [])].map(d => d.codigo);
    let filas = [];
    try { filas = await DB.getBitacoraRelacionada(codigos, marca, modelo); } catch (_) { filas = []; }

    const prellenado = JSON.stringify({
      dtc_codigos: codigos,
      marca: marca || '', modelo: modelo || '',
      categoria: this._catBitacora(codigos[0]),
      titulo: codigos.length ? `${codigos[0]} — ${this._descDTC(codigos[0], null)}`.slice(0, 120) : '',
    }).replace(/"/g, '&quot;');
    const btnNueva = `<button class="btn btn-sm btn-brand" onclick="Modulos.diagnostico_obd.guardarEnBitacora(${prellenado})">➕ Guardar lo que resolvimos</button>`;

    el.innerHTML = `<div class="card" style="padding:14px;margin-top:12px;border-left:3px solid var(--green)">
      <b style="font-size:12px">📖 LO QUE ESTE TALLER YA RESOLVIÓ</b>
      ${filas.length ? `
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:6px">
          ${filas.slice(0, 8).map(b => `
            <div style="border:1px solid var(--border);border-radius:8px;padding:8px;cursor:pointer"
                 onclick="Modulos.bitacora.ver('${UI.esc(b.id)}')">
              <div style="font-size:12.5px;font-weight:800">${UI.esc(b.titulo)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">
                ${b.motivo === 'codigo' ? '🎯 mismo código' : '🚗 mismo modelo'}
                ${(b.dtc_codigos || []).length ? ` · ${UI.esc((b.dtc_codigos || []).join(', '))}` : ''}
                ${b.veces_ejecutada > 1 ? ` · resuelto ${b.veces_ejecutada}×` : ''}
                ${b.creado_por_nombre ? ` · ${UI.esc(b.creado_por_nombre)}` : ''}
              </div>
              ${b.sintoma ? `<div style="font-size:11.5px;color:var(--text2);margin-top:2px">${UI.esc(b.sintoma)}</div>` : ''}
            </div>`).join('')}
        </div>
        <div style="margin-top:8px">${btnNueva}</div>`
      : `<div style="font-size:12px;color:var(--text3);margin-top:4px">
          Nada registrado todavía para estos códigos ni para este modelo.
          Cuando lo resuelvan, guardarlo acá hace que el próximo que vea este código lo encuentre hecho.
        </div>
        <div style="margin-top:8px">${btnNueva}</div>`}
    </div>`;
  },

  /* La categoría se deduce de la familia del código para no hacerlo escribir */
  _catBitacora(codigo) {
    if (!codigo) return 'general';
    if (codigo[0] === 'U') return 'electrico';
    if (codigo[0] === 'C') return 'frenos';
    if (codigo[0] === 'B') return 'carroceria';
    const fam = codigo.slice(1, 3);
    if (['03'].includes(fam)) return 'motor';
    if (['01', '02'].includes(fam)) return 'combustible';
    if (['04'].includes(fam)) return 'escape';
    if (['07', '08', '09'].includes(fam)) return 'transmision';
    if (['05', '06'].includes(fam)) return 'electrico';
    return 'motor';
  },

  guardarEnBitacora(prellenado) {
    if (!Modulos.bitacora) return UI.toast('El módulo de bitácora no está disponible', 'error');
    Modulos.bitacora.modalNueva(prellenado || {});
  },

  /* ═══════════ GUÍA DE DIAGNÓSTICO ═══════════
     Un código NO dice qué pieza cambiar: dice qué monitor salió fuera de rango.
     Por eso cada guía trae qué medir ANTES de comprar nada, y las causas en orden
     de probabilidad y costo (primero lo barato y común). Cubre los códigos que de
     verdad entran al taller; el resto muestra solo la descripción.
     sev: informativa | atencion | alta | critica  (si puede seguir manejando) */
  _GUIA: {
    P0011: { sev:'atencion', sint:'Ralentí inestable, falta de potencia, a veces ruido de cadena en frío.',
      causas:['Aceite sucio, viejo o con nivel bajo (causa más común)','Malla/filtro del solenoide VVT (OCV) tapada','Solenoide VVT con falla eléctrica','Cadena o tensor de tiempo estirados','Sensor de árbol de levas'],
      medir:'Revisá nivel y estado del aceite ANTES que nada: el VVT trabaja con presión de aceite y un aceite pasado reproduce este código. Después compará en datos en vivo el ángulo de leva comandado contra el real, y medí la resistencia del solenoide.' },
    P0016: { sev:'alta', sint:'Arranque difícil o no arranca, tironeo, pérdida de potencia.',
      causas:['Cadena/banda de tiempo saltada o estirada','Tensor de cadena vencido','Rueda dentada o reluctor dañado','Sensor CKP o CMP','Actuador VVT atascado'],
      medir:'Verificá la sincronización mecánica con las marcas antes de tocar sensores. Cambiar el CKP por este código sin revisar el tiempo es el error clásico. Con osciloscopio, comparar la señal de cigüeñal contra la de levas.' },
    P0101: { sev:'atencion', sint:'Falta de potencia, consumo alto, ralentí irregular, tirones al acelerar.',
      causas:['Filtro de aire sucio o mal asentado','MAF sucio (típico con filtros de alto flujo aceitados)','Fuga de aire entre el MAF y el múltiple','Ducto de admisión roto o flojo','MAF dañado'],
      medir:'Mirá los g/s en vivo: en ralentí un motor de 2.0L ronda 3–5 g/s y a 2500 rpm sube proporcional. Si el valor es bajo, limpiá el MAF con limpiador específico antes de comprar uno: se recupera seguido.' },
    P0102: { sev:'atencion', sint:'Falta de potencia, humo, motor que se apaga.', causas:['Ducto de admisión desconectado o roto','MAF sucio','Conector o cableado del MAF','MAF dañado'],
      medir:'Revisá el ducto completo del filtro al múltiple. Con el conector puesto, medí la señal del MAF acelerando: debe subir parejo.' },
    P0106: { sev:'atencion', sint:'Ralentí irregular, respuesta pobre.', causas:['Manguera de vacío rota, floja o tapada','Sensor MAP sucio de carbón','Fuga en el múltiple de admisión','Sensor MAP dañado'],
      medir:'Con el motor apagado, el MAP debe leer casi lo mismo que la presión barométrica. Si no coincide, el sensor miente. En ralentí debe marcar vacío alto y estable.' },
    P0113: { sev:'informativa', sint:'Arranque en frío difícil, consumo levemente alto.', causas:['Conector del sensor IAT suelto o con falso contacto','Cableado abierto','Sensor IAT dañado'],
      medir:'Con el motor frío, la temperatura de aire debe leer parecida a la ambiente. Puenteando el conector la lectura debe irse al otro extremo: si lo hace, el problema es el sensor, no el cableado.' },
    P0117: { sev:'atencion', sint:'Ventilador siempre encendido, mezcla rica, consumo alto.', causas:['Sensor ECT en corto','Cableado rozado','Conector con agua o verdín'],
      medir:'Compará la temperatura del refrigerante en vivo contra un termómetro infrarrojo en la culata. Si difieren mucho, el sensor miente.' },
    P0118: { sev:'atencion', sint:'Arranque en frío difícil, ventilador que no arranca.', causas:['Circuito abierto del sensor ECT','Conector desconectado','Sensor dañado'],
      medir:'Igual que P0117: comparar contra termómetro. Ojo con el nivel de refrigerante bajo, que deja el sensor sin contacto con el líquido.' },
    P0128: { sev:'atencion', sint:'El motor tarda en calentar, calefacción tibia, consumo alto.', causas:['Termostato pegado abierto (causa más común)','Nivel de refrigerante bajo','Sensor ECT mintiendo','Ventilador que corre de más'],
      medir:'Cronometrá cuánto tarda en llegar a temperatura de trabajo y palpá la manguera superior. Si el motor nunca pasa de media temperatura, es termostato.' },
    P0131: { sev:'atencion', sint:'Consumo alto, ralentí inestable.', causas:['Fuga de escape antes del sensor (entra aire y lo hace leer pobre)','Sensor contaminado','Mezcla realmente pobre','Cableado del sensor'],
      medir:'Buscá fugas de escape antes de condenar el sensor. En vivo, un O2 sano oscila entre 0.1 y 0.9 V aproximadamente una vez por segundo.' },
    P0133: { sev:'atencion', sint:'Consumo alto, pierde algo de potencia.', causas:['Sensor O2 envejecido (lo normal después de 100 mil km)','Contaminado por aceite o refrigerante quemado','Fuga de escape'],
      medir:'Mirá la velocidad de conmutación en vivo: si el sensor se mueve lento o se queda plano, está agotado. Antes de cambiarlo, descartá consumo de aceite.' },
    P0135: { sev:'atencion', sint:'Consumo alto en frío, testigo encendido.', causas:['Fusible del calefactor','Cableado o conector','Relé de alimentación','Calefactor del sensor abierto'],
      medir:'Medí la resistencia del calefactor (suele andar entre 3 y 15 ohm) y verificá que le llegue voltaje con el switch. Sin voltaje, el problema es el circuito, no el sensor.' },
    P0141: { sev:'informativa', sint:'Testigo encendido, casi sin síntomas de manejo.', causas:['Calefactor del sensor posterior abierto','Fusible o cableado','Conector dañado por calor'],
      medir:'Mismo procedimiento que P0135, pero en el sensor después del catalizador.' },
    P0171: { sev:'atencion', sint:'Ralentí inestable, tirones, falta de potencia, consumo alto.',
      causas:['Fuga de aire falso: mangueras, empaque del múltiple, PCV, bota del acelerador','MAF sucio o subinformando','Presión de combustible baja (filtro o bomba)','Inyectores sucios','Sensor O2 mintiendo','EGR pegada abierta'],
      medir:'Mirá los ajustes de combustible (STFT/LTFT) en ralentí y a 2500 rpm: si el ajuste es muy positivo en ralentí y mejora en alta, es fuga de vacío. Si se mantiene alto en todo el rango, apuntá a combustible o MAF. La prueba de humo es la que menos tiempo pierde.' },
    P0172: { sev:'atencion', sint:'Olor a combustible, humo negro, bujías tiznadas, consumo alto.',
      causas:['Inyector goteando','Presión de combustible alta o retorno tapado','MAF sobreinformando','Sensor ECT que reporta el motor frío de más','Filtro de aire tapado'],
      medir:'Ajustes de combustible muy negativos confirman rica. Revisá el sensor de refrigerante: si dice que el motor está frío, la ECU enriquece de más para siempre.' },
    P0174: { sev:'atencion', sint:'Igual que P0171 pero en el banco 2.', causas:['Fuga de aire en el banco 2','MAF o presión de combustible (si además aparece P0171)','Inyectores del banco 2','O2 del banco 2'],
      medir:'Si aparecen P0171 y P0174 juntos, la causa es común a ambos bancos (MAF, presión, PCV). Si es uno solo, buscá la fuga o el inyector de ese lado.' },
    P0201: { sev:'alta', sint:'Fallo de encendido en un cilindro, tironeo.', causas:['Conector del inyector suelto','Cableado cortado o rozado','Inyector abierto eléctricamente','Driver de la ECU'],
      medir:'Medí la resistencia del inyector y compará con los otros: una diferencia grande lo delata. Verificá pulso con lámpara de inyector antes de culpar a la ECU.' },
    P0300: { sev:'alta', sint:'Motor que vibra, tironea, pierde potencia. Si el testigo PARPADEA, apagá el motor.',
      causas:['Bujías gastadas o con luz mal calibrada','Bobinas o cables de bujía','Combustible malo o agua en el tanque','Presión de combustible baja','Fuga de vacío','Compresión baja o válvulas','Tiempo de encendido'],
      medir:'Un testigo parpadeando significa que está entrando combustible sin quemar al catalizador y lo va a fundir: no lo sigas manejando. Mirá los contadores de fallo por cilindro: si el fallo salta entre cilindros, sospechá de combustible, vacío o presión; si se concentra, seguí con los códigos P030x.' },
    P0301: { sev:'alta', sint:'Vibración, tironeo, pérdida de potencia.', causas:['Bujía del cilindro 1','Bobina de ese cilindro','Inyector tapado','Compresión baja o válvula quemada','Cableado'],
      medir:'Intercambiá la bobina y la bujía con otro cilindro y volvé a escanear: si el código se mueve al otro cilindro, encontraste la pieza. Si el fallo se queda, hacé prueba de compresión. Confirmar cuesta 20 minutos; equivocarse cuesta el repuesto.' },
    P0302: { sev:'alta', sint:'Igual que P0301, en el cilindro 2.', causas:['Bujía','Bobina','Inyector','Compresión'], medir:'Intercambiá bobina y bujía con otro cilindro y reescaneá: si el código se mueve, es esa pieza.' },
    P0303: { sev:'alta', sint:'Igual que P0301, en el cilindro 3.', causas:['Bujía','Bobina','Inyector','Compresión'], medir:'Intercambiá bobina y bujía con otro cilindro y reescaneá: si el código se mueve, es esa pieza.' },
    P0304: { sev:'alta', sint:'Igual que P0301, en el cilindro 4.', causas:['Bujía','Bobina','Inyector','Compresión'], medir:'Intercambiá bobina y bujía con otro cilindro y reescaneá: si el código se mueve, es esa pieza.' },
    P0325: { sev:'informativa', sint:'Pérdida de potencia leve, la ECU atrasa el tiempo por seguridad.',
      causas:['Sensor de detonación flojo o mal torqueado','Cableado o conector','Ruido mecánico real (biela, pistón)','Sensor dañado'],
      medir:'El torque del sensor importa: montado flojo no lee. Antes de cambiarlo, escuchá el motor: si hay golpeteo real, el sensor está haciendo su trabajo.' },
    P0335: { sev:'alta', sint:'No arranca, se apaga en caliente, tacómetro errático.', causas:['Sensor CKP (falla típica en caliente)','Entrehierro o rueda fónica dañada','Cableado o conector','Aceite en el conector'],
      medir:'Si falla solo en caliente, probá el sensor a temperatura de trabajo: en frío mide bien y engaña. Revisá que la rueda dentada no tenga dientes rotos.' },
    P0340: { sev:'alta', sint:'Arranque demorado, tironeo, motor que se apaga.', causas:['Sensor CMP','Cadena de tiempo saltada','Cableado','Actuador VVT'],
      medir:'Si aparece junto con P0016, revisá primero la sincronización mecánica: el sensor puede estar bien y estar reportando un tiempo corrido.' },
    P0401: { sev:'atencion', sint:'Tironeo a baja velocidad, testigo, a veces pinado.', causas:['Conductos de EGR carbonizados (causa más común)','Válvula EGR pegada','Sensor DPFE o de posición','Falta de vacío en la válvula'],
      medir:'Destapá y limpiá los conductos antes de comprar la válvula: en motores con kilometraje el carbón los tapa y la válvula está sana.' },
    P0402: { sev:'atencion', sint:'Ralentí inestable, motor que se apaga al frenar.', causas:['Válvula EGR pegada abierta','Diafragma roto','Sensor de posición'],
      medir:'Con el motor en ralentí, la EGR debe estar cerrada. Si la abrís a mano y el motor casi se apaga, la válvula responde; el problema es que queda abierta.' },
    P0420: { sev:'atencion', sint:'Testigo encendido, casi sin síntomas de manejo, no pasa la revisión de emisiones.',
      causas:['Fuga de escape antes o entre los sensores','Sensor O2 posterior lento o envejecido','Fallos de encendido o consumo de aceite que envenenaron el catalizador','Catalizador realmente agotado'],
      medir:'Es el código donde más plata se tira. Antes de cambiar el catalizador, compará en vivo la señal del O2 delantero contra el trasero: el trasero debe estar casi plano; si copia al delantero, el catalizador no está trabajando. Y buscá la causa: si el motor quema aceite o falla, el catalizador nuevo se muere igual.' },
    P0430: { sev:'atencion', sint:'Igual que P0420, en el banco 2.', causas:['Fuga de escape','O2 posterior del banco 2','Fallos de encendido o aceite','Catalizador agotado'],
      medir:'Mismo procedimiento que P0420, del lado del banco 2.' },
    P0442: { sev:'informativa', sint:'Casi sin síntomas, a veces olor a combustible.', causas:['Tapón de combustible flojo, mal roscado o con empaque vencido','Manguera del EVAP agrietada','Válvula de purga o de venteo','Canister fisurado'],
      medir:'Empezá por el tapón: es la causa más común y la más barata. Si no, prueba de humo en el sistema EVAP; a ojo no se encuentra una fuga pequeña.' },
    P0455: { sev:'informativa', sint:'Olor a combustible, testigo encendido.', causas:['Tapón de combustible ausente o mal cerrado','Manguera del EVAP desconectada','Canister o válvula de venteo dañados'],
      medir:'Fuga grande: normalmente se encuentra a la vista. Revisá el tapón y las mangueras del canister antes de la prueba de humo.' },
    P0456: { sev:'informativa', sint:'Testigo encendido, sin síntomas de manejo.', causas:['Empaque del tapón reseco','Fisura fina en manguera','Válvula de purga que no sella'],
      medir:'Fuga muy pequeña: solo aparece con prueba de humo. No cambies piezas a ciegas por este código.' },
    P0500: { sev:'atencion', sint:'Velocímetro errático o muerto, cambios bruscos de la caja.', causas:['Sensor de velocidad','Rueda fónica o corona dañada','Cableado','Módulo de ABS'],
      medir:'Si el vehículo toma la velocidad del ABS, revisá primero los códigos de ABS: el problema suele estar ahí y no en un sensor propio.' },
    P0506: { sev:'informativa', sint:'Ralentí bajo, el motor se apaga al frenar o en marcha lenta.', causas:['Cuerpo de aceleración sucio de carbón','Válvula IAC pegada','Fuga de vacío','Falta de aprendizaje del ralentí tras desconectar la batería'],
      medir:'Limpiá el cuerpo de aceleración y hacé el reaprendizaje de ralentí que pida la marca. Muchos casos se resuelven ahí.' },
    P0507: { sev:'atencion', sint:'Ralentí alto, el motor no baja de vueltas.', causas:['Fuga de aire falso (la causa más común)','Cuerpo de aceleración sucio o mal ajustado','IAC pegada','Cable del acelerador trabado'],
      medir:'Buscá la fuga de vacío con humo. Un ralentí alto casi siempre es aire que entra sin medir.' },
    P0562: { sev:'alta', sint:'Luces que bajan, testigos varios, arranque flojo.', causas:['Batería en mal estado o bornes sulfatados','Banda del alternador floja','Alternador o regulador','Cables de tierra flojos'],
      medir:'Con el motor en marcha el sistema debe estar entre 13.5 y 14.5 V aproximadamente. Antes de cambiar el alternador, limpiá bornes y revisá las tierras: un mal contacto reproduce todo esto.' },
    P0563: { sev:'atencion', sint:'Focos que se queman seguido, testigo encendido.', causas:['Regulador del alternador','Batería en falla','Conexión de tierra deficiente'],
      medir:'Si el voltaje pasa de 15 V con el motor en marcha, el regulador está dejando cargar de más y va a dañar módulos.' },
    P0601: { sev:'alta', sint:'Funcionamiento errático, el motor puede no arrancar.', causas:['Alimentación o tierra de la ECU con mal contacto','Software desactualizado','Módulo dañado'],
      medir:'Revisá alimentaciones y tierras de la ECU antes de condenarla; un módulo se cambia de último y con la reprogramación resuelta.' },
    P0700: { sev:'atencion', sint:'Testigo encendido, la caja puede entrar en modo de emergencia.', causas:['Este código solo avisa que la TCM guardó un código propio'],
      medir:'No cambies nada por este código: es un aviso. Leé los códigos de la transmisión (TCM) y trabajá sobre esos.' },
    P0740: { sev:'atencion', sint:'Aumento de revoluciones sin avanzar, consumo alto, la caja calienta.', causas:['Nivel o estado del aceite de transmisión (empezar por acá)','Solenoide del convertidor (TCC)','Cuerpo de válvulas','Convertidor de par'],
      medir:'Revisá nivel, color y olor del ATF antes que nada: quemado u oscuro explica el código. Verificá el bloqueo del convertidor en vivo a velocidad de crucero.' },
    P0741: { sev:'atencion', sint:'Las revoluciones no bajan al mantener velocidad, la caja calienta.', causas:['ATF sucio o con nivel bajo','Solenoide TCC pegado','Cuerpo de válvulas sucio','Convertidor dañado'],
      medir:'Mismo camino que P0740: aceite primero, solenoide después, convertidor de último.' },
    U0100: { sev:'critica', sint:'El motor puede no arrancar o apagarse en marcha; varios testigos encendidos.',
      causas:['Alimentación o tierra de la ECU','Bus CAN cortado o en corto','Conector con corrosión o agua','Resistencias terminadoras del bus','Módulo dañado'],
      medir:'Medí la resistencia entre CAN-H y CAN-L con todo apagado: lo normal ronda 60 ohm (dos resistencias de 120 en paralelo). Un valor muy distinto apunta al cableado, no al módulo.' },
  },

  /* Muestra la guía de un código en un modal, con las causas en orden. */
  verGuia(codigo) {
    const g = this._GUIA[codigo];
    const desc = this._descDTC(codigo, null);
    if (!g) {
      return UI.modal(`🔧 ${codigo}`, `<p style="font-size:13px"><b>${UI.esc(desc)}</b></p>
        <p style="font-size:12.5px;color:var(--text2);margin-top:8px">
          Todavía no hay guía cargada para este código. Un código indica qué monitor salió
          fuera de rango, no qué pieza cambiar: confirmá con mediciones y consultá el manual
          del fabricante y los boletines de ese modelo antes de reemplazar nada.</p>`, '560px');
    }
    const sevTxt = { informativa:['Informativa','var(--text3)','Puede seguir circulando; corregir cuando se pueda.'],
      atencion:['Atención','var(--amber)','Puede circular, pero conviene atenderlo pronto: gasta más y puede dañar otras piezas.'],
      alta:['Alta','var(--red)','Atender de inmediato: manejar así puede dañar el motor o el catalizador.'],
      critica:['Crítica','var(--red)','No circular. Puede quedar tirado o dañar módulos.'] }[g.sev] || ['—','var(--text3)',''];
    UI.modal(`🔧 ${codigo}`, `
      <div style="font-size:13.5px;font-weight:800;margin-bottom:2px">${UI.esc(desc)}</div>
      <div style="display:inline-block;font-size:11px;font-weight:800;color:${sevTxt[1]};border:1px solid ${sevTxt[1]};border-radius:6px;padding:2px 8px;margin-bottom:8px">Severidad: ${sevTxt[0]}</div>
      <div style="font-size:12.5px;color:var(--text2);margin-bottom:10px">${UI.esc(sevTxt[2])}</div>
      <div style="margin-bottom:10px"><b style="font-size:12px">SÍNTOMAS TÍPICOS</b>
        <div style="font-size:12.5px;margin-top:2px">${UI.esc(g.sint)}</div></div>
      <div style="margin-bottom:10px"><b style="font-size:12px">CAUSAS PROBABLES</b>
        <div style="font-size:11px;color:var(--text3)">en orden: primero lo más común y barato</div>
        <ol style="font-size:12.5px;margin:4px 0 0 18px">${g.causas.map(c => `<li style="margin:2px 0">${UI.esc(c)}</li>`).join('')}</ol></div>
      <div style="background:var(--surface2);border-left:3px solid var(--cyan);border-radius:8px;padding:10px">
        <b style="font-size:12px">QUÉ MEDIR ANTES DE CAMBIAR PIEZAS</b>
        <div style="font-size:12.5px;margin-top:4px">${UI.esc(g.medir)}</div></div>
      <div style="font-size:10.5px;color:var(--text3);margin-top:10px">
        Guía general para códigos genéricos SAE. El procedimiento exacto y los valores de
        especificación los da el manual del fabricante para ese motor.</div>`, '600px');
  },

  _descDTC(c, cat) {
    if (this._DTCS[c]) return this._DTCS[c];
    /* Rango específico de fabricante (SAE J2012): P1xxx, y en las familias
       B/C/U cualquier código que no sea X0xxx (B1-B3, C1-C3, U1-U3). P2xxx
       y P0xxx SÍ son genéricos SAE — mismo significado en cualquier marca.
       Nuestro catálogo (fuente pública, 3,071 códigos) NO trae el fabricante
       de cada código: mostrar su texto para un código de fabricante sería
       adivinar la marca — puede ser el de otro fabricante. Mejor avisar que
       no está verificado que arriesgar un diagnóstico equivocado. */
    const esFabricante = (c[0] === 'P' && c[1] === '1') || (c[0] !== 'P' && c[1] !== '0');
    /* La tabla dtc_catalogo está corrida un lugar desde ~P0170 (P0420 aparece
       como "Secondary Air Injection Relay B", que en realidad es P0419), así que
       su texto se muestra como pista y NUNCA como dato firme: cambiar la pieza
       equivocada cuesta mucho más que verificar en el manual. */
    if (!esFabricante) {
      const fila = cat && cat[c];
      const t = fila?.descripcion_es || fila?.descripcion_en;
      if (t) return t + ' — sin verificar, confirmar en el manual';
    }
    const rangos = { P00:'Control de mezcla aire/combustible', P01:'Medición de aire/combustible', P02:'Circuito de inyección',
      P03:'Sistema de encendido / fallos de encendido', P04:'Control de emisiones (EGR/EVAP/catalizador)', P05:'Ralentí y velocidad del vehículo',
      P06:'Computadora (ECU) y salidas auxiliares', P07:'Transmisión', P08:'Transmisión', P09:'Transmisión',
      C:'Chasis (ABS/frenos/suspensión/dirección)', B:'Carrocería (airbag/cinturones/cerraduras)', U:'Red de comunicación entre módulos' };
    const g = rangos[c.slice(0,3)] || rangos[c[0]] || 'Código de diagnóstico';
    return esFabricante
      ? g + ' — específico del fabricante, no verificado para esta marca: consultar manual del fabricante'
      : g + ' — consultar manual del fabricante';
  },

  /* Reemplaza una descripción base únicamente si hay una fuente con licencia
     y verificada para el vehículo concreto. */
  async _enriquecerDTCs(dtcs, vehId, protocolo = 'obd2') {
    if (!dtcs?.length) return dtcs || [];
    const veh = this._vehiculos.find(v => v.id === vehId);
    try {
      const especificos = await DB.getDTCEspecificos(dtcs.map(d => d.codigo), veh, protocolo);
      return dtcs.map(d => {
        const e = especificos[d.codigo];
        return e ? { ...d, desc:e.descripcion_es, origen:'Específico verificado', fuente:e.fuente, severidad:e.severidad }
          : { ...d, origen: protocolo === 'j1939' ? 'J1939 base' : 'SAE genérico' };
      });
    } catch (_) {
      return dtcs.map(d => ({ ...d, origen: protocolo === 'j1939' ? 'J1939 base' : 'SAE genérico' }));
    }
  },

  /* ═══════════ VISTA PRINCIPAL (lista por mes) ═══════════ */
  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const now = new Date();
    if (!this._mes)  this._mes  = now.getMonth() + 1;
    if (!this._anio) this._anio = now.getFullYear();
    const ini = `${this._anio}-${String(this._mes).padStart(2,'0')}-01`;
    const fin = new Date(this._anio, this._mes, 0).toISOString().slice(0,10);

    [this._data, this._vehiculos] = await Promise.all([
      DB.getDiagnosticosOBD(ini, fin), DB.getVehiculos()
    ]);

    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const anios = [this._anio - 1, this._anio, this._anio + 1];
    const conFallas = this._data.filter(d => (d.dtcs||[]).length).length;
    const puedeEditar = typeof puedeAccion !== 'function' || puedeAccion('diagnostico_obd','editar');

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">🩺 Diagnóstico OBD-II</h1>
          <p class="page-subtitle">// Escáner ELM327/Vgate por Bluetooth · camiones J1939 y livianos por USB (RP1210)</p>
        </div>
        <div class="page-actions">
          <select class="form-select" style="width:140px" onchange="Modulos.diagnostico_obd._mes=+this.value;Modulos.diagnostico_obd.render()">
            ${meses.map((m,i)=>`<option value="${i+1}" ${i+1===this._mes?'selected':''}>${m}</option>`).join('')}
          </select>
          <select class="form-select" style="width:90px" onchange="Modulos.diagnostico_obd._anio=+this.value;Modulos.diagnostico_obd.render()">
            ${anios.map(a=>`<option ${a===this._anio?'selected':''}>${a}</option>`).join('')}
          </select>
          <button class="btn btn-ghost" onclick="Modulos.diagnostico_obd.modalCampanas()">🔔 Campañas de fábrica</button>
          <button class="btn btn-ghost" onclick="Modulos.diagnostico_obd.modalMapaVehiculos()" title="Qué vehículos sabe escanear el taller y hasta dónde llega en cada uno">🗺 Mapa de vehículos</button>
          <button class="btn btn-ghost" onclick="Modulos.diagnostico_obd.render()">↻ Actualizar</button>
          ${puedeEditar ? `<button class="btn btn-brand" onclick="Modulos.diagnostico_obd.modalEscanear()">📡 Nuevo Escaneo</button>` : ''}
        </div>
      </div>
      <div class="page-body">
        ${!navigator.bluetooth ? `<div class="card" style="border-left:3px solid var(--amber);padding:12px;margin-bottom:12px">
          ⚠️ Este navegador no soporta Bluetooth. Para escanear por Bluetooth usa <b>Chrome o Edge en Android</b> (o la app NexusPro) o una PC con Bluetooth. El escaneo por <b>USB (puente RP1210)</b> sí está disponible desde esta PC.
        </div>` : ''}
        <div class="card" style="padding:0;overflow:auto">
          <table class="table">
            <thead><tr><th>Fecha</th><th>Vehículo</th><th>VIN</th><th>Check Engine</th><th>Fallas</th><th>Voltaje</th><th style="text-align:right">Acciones</th></tr></thead>
            <tbody>
              ${this._data.length ? this._data.map(d => {
                const v = d.vehiculos;
                const n = (d.dtcs||[]).length, np = (d.dtcs_pendientes||[]).length;
                return `<tr style="cursor:pointer" onclick="Modulos.diagnostico_obd.ver('${d.id}')">
                  <td>${UI.fecha(d.created_at)}</td>
                  <td>${v ? `<b>${v.placa||''}</b> ${v.marca||''} ${v.modelo||''}` : '—'}</td>
                  <td style="font-family:monospace;font-size:11px">${d.vin||'—'}</td>
                  <td>${d.mil ? '<span class="badge badge-red">🔴 Encendido</span>' : '<span class="badge badge-green">Apagado</span>'}</td>
                  <td>${n ? `<span class="badge badge-red">${n}</span>` : '<span class="badge badge-green">0</span>'}${np?` <span class="badge badge-amber" title="pendientes">${np}p</span>`:''}${d.dtcs_borrados?' 🧹':''}</td>
                  <td>${d.voltaje||'—'}</td>
                  <td style="text-align:right;white-space:nowrap">
                    ${Modulos.btnAccion('ver', `Modulos.diagnostico_obd.ver('${d.id}')`)}
                    ${Modulos.btnAccion('editar', `Modulos.diagnostico_obd.modalEditar('${d.id}')`)}
                    ${Modulos.btnAccion('imprimir', `Modulos.diagnostico_obd.imprimir('${d.id}')`)}
                    ${Modulos.btnAccion('eliminar', `Modulos.diagnostico_obd.eliminar('${d.id}')`)}
                  </td></tr>`;
              }).join('') : `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">
                Sin escaneos en ${meses[this._mes-1]} ${this._anio}. ${puedeEditar&&navigator.bluetooth?'Conecta un adaptador OBD-II BLE y presiona 📡 Nuevo Escaneo.':''}
              </td></tr>`}
            </tbody>
          </table>
        </div>
        ${this._data.length ? `<p style="color:var(--text3);font-size:12px;margin-top:8px">${this._data.length} escaneo(s) · ${conFallas} con fallas activas</p>` : ''}
      </div>`;
  },

  /* ═══════════ NUEVO ESCANEO ═══════════ */
  /* `vehId` llega cuando se entra desde la ficha del vehículo: evita tener que
     buscarlo de nuevo en una lista que en un taller con flota es larga. */
  async modalEscanear(vehId) {
    this._scan = null;
    /* Al entrar desde la ficha del vehículo este módulo puede no haberse
       renderizado todavía, así que su lista estaría vacía y el selector
       saldría sin opciones. */
    if (!this._vehiculos || !this._vehiculos.length) {
      try { this._vehiculos = await DB.getVehiculos() || []; } catch (_) { this._vehiculos = []; }
    }
    UI.modal('📡 Nuevo Escaneo OBD-II', `
      <div class="form-group">
        <label class="form-label">Vehículo *</label>
        <select class="form-select" id="obd-veh">
          <option value="">— Seleccionar vehículo —</option>
          ${this._vehiculos.map(v=>`<option value="${v.id}"${vehId===v.id?' selected':''}>${v.placa||'s/placa'} · ${v.marca||''} ${v.modelo||''} ${v.anio||''} ${v.clientes?`(${v.clientes.nombre})`:''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Conexión</label>
        <select class="form-select" id="obd-via" onchange="Modulos.diagnostico_obd._verApis()">
          <option value="auto">🔎 USB — detectar solo (recomendado: liviano o camión)</option>
          <option value="ble">📶 Bluetooth — ELM327 / Vgate / OBDLink (BLE)</option>
          <option value="j1939">🚚 USB — forzar camión J1939 (puente RP1210)</option>
          <option value="j1708">🚛 USB — forzar camión antiguo J1708/J1587 (MID/PID/FMI)</option>
          <option value="usb">🔌 USB — forzar vehículo liviano (puente RP1210)</option>
        </select>
      </div>
      <div class="form-group" id="obd-api-wrap">
        <label class="form-label">Adaptador USB</label>
        <select class="form-select" id="obd-api">
          <option value="">Buscando adaptadores…</option>
        </select>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">
          Un taller con software de fábrica (Cummins, Navistar, Allison…) tiene varios adaptadores RP1210 registrados. Si el de siempre no responde, probá con otro.
        </div>
      </div>
      <div id="obd-log" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.8;min-height:70px;max-height:220px;overflow:auto;margin:10px 0">
        Conecta el adaptador al puerto de diagnóstico del vehículo y enciende el switch.<br>
        · Bluetooth: presiona <b>Conectar y Escanear</b> y elige el adaptador (ej. "OBDII", "Vgate", "iCar Pro").<br>
        · USB: solo enchufa el USB-Link a esta PC — el puente arranca solo con Windows.<br>
        &nbsp;&nbsp;¿Primera vez en esta PC? <a href="/puente-obd/instalar-puente.bat" download style="color:var(--cyan)">⬇️ Instalar el puente USB</a> (doble clic al archivo descargado, una sola vez).
      </div>
      <div id="obd-result"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn btn-ghost" id="obd-btn-test" title="Prueba cada adaptador instalado y dice cuál responde" onclick="Modulos.diagnostico_obd.probarAdaptador()" style="margin-right:auto">🔧 Probar adaptador</button>
        <button class="btn btn-ghost" onclick="Modulos.diagnostico_obd._cerrarEscaneo()">Cancelar</button>
        <button class="btn btn-brand" id="obd-btn-scan" onclick="Modulos.diagnostico_obd.escanear()">🔌 Conectar y Escanear</button>
        <button class="btn btn-cyan" id="obd-btn-save" style="display:none" onclick="Modulos.diagnostico_obd.guardarEscaneo()">💾 Guardar</button>
      </div>`, '640px');

    /* Se puebla después de pintar el modal: hablar con el puente tarda y no
       vale la pena demorar la apertura por algo que solo aplica al USB. */
    this._api = null;
    this._verApis();
    this._cargarApis();
  },

  /* ── Costo del escaneo ───────────────────────────────────────────────────
     Tarifa del taller: Q250 en liviano y Q750 en camión. La diferencia está en
     el tiempo y en el equipo — un camión necesita el adaptador RP1210 y
     recorrer varios módulos, un liviano se resuelve por OBD-II.
     Se calcula por el TIPO del vehículo, no por el protocolo: un camión al que
     se le escanea el OBD-II sigue siendo un camión. */
  _TARIFA: { liviano: 250, camion: 750 },
  _TIPOS_PESADOS: /cami[oó]n|pesado|tr[aá]iler|cabezal|bus|autob[uú]s|microb[uú]s|maquinaria|montacarga|industrial/i,

  _costoEscaneo(vehId) {
    const v = (this._vehiculos || []).find(x => x.id === vehId);
    const tipo = (v && v.tipo) || '';
    const pesado = this._TIPOS_PESADOS.test(tipo);
    return { monto: pesado ? this._TARIFA.camion : this._TARIFA.liviano,
             categoria: pesado ? 'camión' : 'liviano',
             tipo: tipo || null };
  },

  /* ── Elección de adaptador RP1210 ────────────────────────────────────────
     El puente carga la API en caliente, así que se puede usar cualquiera de las
     registradas en RP121032.INI (NEXIQ, DPA5, VXDIAG…). Sin esto quedaba atado
     al NEXIQ aunque la PC tuviera otros. */
  _api: null,

  /* ── Probar adaptador ────────────────────────────────────────────────────
     Cuando el escaneo falla, el mecánico se queda con un número de error y nada
     más. Esto recorre CADA adaptador instalado y prueba abrir cada protocolo
     que ese adaptador dice soportar, para responder la única pregunta que
     importa: ¿el problema es el cable, el adaptador, o el camión?

     Todo se hace con las operaciones que el puente ya tiene (apis/cargar/
     conectar), así que no hay que reinstalarlo en cada taller. Tampoco se lanza
     ningún .exe desde acá: darle al puente la capacidad de ejecutar programas
     abriría un agujero mucho peor que la molestia que ahorra. Si nada responde,
     se indica dónde está la herramienta del fabricante para abrirla a mano. */
  _PROTOS_PRUEBA: [
    { p:'J1708',        et:'J1708/J1587 · camión antiguo' },
    { p:'J1939',        et:'J1939 · camión moderno' },
    { p:'CAN:Baud=500', et:'CAN 500k · vehículo liviano', req:'CAN' },
  ],

  /* Los mensajes que devuelve cada DLL vienen como salen del fabricante: con
     saltos de línea y espacios de relleno que descuadran el log. */
  _errLimpio(c) {
    const t = String((c && c.error) || (c && c.codigo != null ? 'código ' + c.codigo : 'sin respuesta'))
      .replace(/\s+/g, ' ').trim();
    return t.length > 110 ? t.slice(0, 107) + '…' : t;
  },

  async probarAdaptador() {
    const btn = document.getElementById('obd-btn-test');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Probando...'; }
    const log = m => this._log(m);
    const apiPrevia = this._api;
    let algunoRespondio = false;
    try {
      await this._puenteConectar();
      const r = await this._puenteOp({ op:'apis' }, 5000);
      const apis = ((r && r.apis) || []).filter(a => a.instalado);
      if (!apis.length) { log('<b>No hay ningún adaptador RP1210 instalado en esta PC.</b>'); return; }

      log(`<b>Probando ${apis.length} adaptador(es)...</b>`);
      for (const a of apis) {
        const nombre = a.nombre || a.api;
        const soporta = ((a.protocolos) || []).map(p => String(p).split(',')[0].toUpperCase());
        /* Se prueban SOLO los protocolos que el adaptador declara. Intentar los
           demás sería medio minuto de esperas para llegar al mismo "no". */
        const pruebas = this._PROTOS_PRUEBA.filter(t =>
          soporta.includes((t.req || t.p.split(':')[0]).toUpperCase()));
        if (!pruebas.length) { log(`&nbsp;&nbsp;<b>${nombre}</b> — no maneja protocolos de vehículo, se omite`); continue; }

        const carga = await this._puenteOp({ op:'cargar', api:a.api }, 6000).catch(() => null);
        if (!carga || !carga.ok) {
          log(`&nbsp;&nbsp;<b>${nombre}</b> — <span style="color:var(--red)">no se pudo cargar</span>: ${this._errLimpio(carga)}`);
          continue;
        }
        const detalle = [];
        for (const t of pruebas) {
          const c = await this._puenteOp({ op:'conectar', protocolo:t.p, device:1, api:a.api }, 8000)
            .catch(() => ({ ok:false, error:'sin respuesta del puente' }));
          if (c.ok) {
            algunoRespondio = true;
            detalle.push(`<span style="color:var(--green)">✓ ${t.et}</span>`);
            await this._puenteOp({ op:'desconectar' }, 5000).catch(() => {});
          } else {
            detalle.push(`<span style="color:var(--text3)">✗ ${t.et} — ${this._errLimpio(c)}</span>`);
          }
        }
        log(`&nbsp;&nbsp;<b>${nombre}</b>${carga.version ? ` <span style="color:var(--text3)">v${carga.version}</span>` : ''}`);
        for (const d of detalle) log(`&nbsp;&nbsp;&nbsp;&nbsp;${d}`);
      }

      if (algunoRespondio) {
        log('<b style="color:var(--green)">✓ Hay al menos un adaptador respondiendo.</b> Elegí arriba el que dio ✓ en el protocolo de este vehículo y escaneá.');
      } else {
        /* El caso más común y el más frustrante: todo "instalado" pero nada
           enchufado. Conviene decirlo con todas las letras. */
        log('<b style="color:var(--red)">Ningún adaptador respondió.</b> Los drivers están, pero el hardware no contesta. Revisá, en este orden:');
        /* Lo más frecuente y lo que más tiempo hace perder: el adaptador
           enciende sus LED con la alimentación del USB y parece listo, pero los
           transceptores del bus se alimentan de los 12 V del vehículo. Sin el
           cable en el camión NUNCA va a conectar, por más que se vea encendido. */
        log('&nbsp;&nbsp;1. <b>El adaptador tiene que estar conectado al vehículo</b>, no solo al USB. Con los LED encendidos por el USB parece listo, pero sin los <b>12 V del camión</b> no puede abrir ningún bus.');
        log('&nbsp;&nbsp;2. El cable en el <b>conector del vehículo</b> — en camión antiguo, pines A/B del Deutsch de 9 pines');
        log('&nbsp;&nbsp;3. El <b>switch en contacto</b> (no hace falta arrancar, pero con el motor andando se ven más datos)');
        log('&nbsp;&nbsp;4. Que Windows vea el adaptador en el USB');
        log('&nbsp;&nbsp;5. Si nada de eso: probá la herramienta del fabricante, <code>C:\\NEXIQ\\Test\\CommCheck.exe</code>');
      }
    } catch (e) {
      log(`<span style="color:var(--red)">✗ ${e.message}</span>`);
    } finally {
      /* Dejar cargado el que el usuario había elegido: si no, el próximo
         escaneo saldría con el último que se probó acá. */
      if (apiPrevia) await this._puenteOp({ op:'cargar', api:apiPrevia }, 6000).catch(() => {});
      this._api = apiPrevia;
      if (btn) { btn.disabled = false; btn.textContent = '🔧 Probar adaptador'; }
    }
  },

  /* Oculta el selector y la prueba en Bluetooth, donde no aplican */
  _verApis() {
    const via = document.getElementById('obd-via')?.value;
    const usb = via !== 'ble';
    const wrap = document.getElementById('obd-api-wrap');
    if (wrap) wrap.style.display = usb ? '' : 'none';
    const test = document.getElementById('obd-btn-test');
    if (test) test.style.display = usb ? '' : 'none';
  },

  async _cargarApis() {
    const poner = html => { const s = document.getElementById('obd-api'); if (s) s.innerHTML = html; };
    try {
      await this._puenteConectar();
      const r = await this._puenteOp({ op:'apis' }, 4000);
      /* Sin .INI no hay drivers de ese adaptador: mostrarlo solo confundiría */
      const apis = ((r && r.apis) || []).filter(a => a.instalado);
      if (!apis.length) { poner('<option value="">No hay ningún adaptador RP1210 instalado</option>'); return; }
      poner(apis.map(a => {
        /* Los protocolos dicen de un vistazo si ese adaptador sirve para el
           camión que se tiene enfrente (J1708 para los viejos, J1939 para los
           nuevos). Es la información que hace útil al selector. */
        const protos = (a.protocolos || []).map(p => String(p).split(',')[0]);
        const clave = protos.filter(p => /^(J1939|J1708|OBDII|CAN|ISO15765|J1850)$/i.test(p));
        const resumen = clave.length ? ` — ${clave.slice(0, 4).join(', ')}` : '';
        return `<option value="${UI.esc(a.api)}"${a.cargada ? ' selected' : ''}>${UI.esc(a.nombre || a.api)}${UI.esc(resumen)}</option>`;
      }).join(''));
      this._api = document.getElementById('obd-api')?.value || null;
    } catch (_) {
      /* Que no haya puente no es un error acá: se puede escanear por Bluetooth */
      poner('<option value="">Puente USB no disponible — solo Bluetooth</option>');
    }
  },

  _log(msg) {
    const el = document.getElementById('obd-log');
    if (!el) return;
    /* la flecha en color de acento hace la lista escaneable de un vistazo */
    el.innerHTML += `<div><span style="color:var(--cyan)">›</span> ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
  },

  async escanear() {
    const vehId = document.getElementById('obd-veh')?.value;
    if (!vehId) { UI.toast('Selecciona el vehículo a escanear', 'error'); return; }
    this._via = document.getElementById('obd-via')?.value || 'ble';
    this._api = (this._via !== 'ble' && document.getElementById('obd-api')?.value) || null;
    const btn = document.getElementById('obd-btn-scan');
    btn.disabled = true;
    const log = m => this._log(m);
    if (this._via === 'auto') {
      try { this._via = await this._detectarVia(log); }
      catch (e) {
        log(`<span style="color:var(--red)">✗ ${e.message}</span>`);
        UI.toast(e.message, 'error'); btn.disabled = false; return;
      }
    }
    if (this._via === 'j1939') return this._escanearJ1939(vehId, btn, log);
    if (this._via === 'j1708') return this._escanearJ1587(vehId, btn, log);
    try {
      let nombre, protocolo;
      if (this._via === 'usb') {
        log('Conectando al puente USB local...');
        ({ nombre, protocolo } = await this._usbInit(log));
      } else {
        log('Buscando adaptador Bluetooth...');
        nombre = await this._conectar();
        log(`Conectado a <b>${nombre}</b> ✓`);
        protocolo = await this._init(log);
      }
      log(`Protocolo: <b>${protocolo || 'detectado'}</b> ✓`);

      log('Leyendo VIN...');
      const vin = await this._leerVIN();
      log(vin ? `VIN: <b>${vin}</b>` : 'VIN no disponible en este vehículo');

      log('Leyendo estado Check Engine...');
      const { mil, n } = await this._leerMIL();
      log(mil ? `🔴 Check Engine ENCENDIDO (${n} falla(s))` : '✅ Check Engine apagado');

      log('Buscando módulos que responden...');
      const modulos = await this._leerModulos();
      log(modulos ? `${modulos.length} módulo(s): ${modulos.map(m => m.nombre).join(', ')} ✓`
                  : 'No se pudo enumerar los módulos');

      log('Leyendo códigos de falla...');
      const codConf = await this._leerDTCs('03');
      const codPend = await this._leerDTCs('07');
      log(`${codConf.length} confirmado(s), ${codPend.length} pendiente(s)`);

      /* ¿El vehículo contestó ALGO? Sin esta verificación, un cable flojo, un
         switch apagado o un adaptador que no llega al bus daban exactamente el
         mismo resultado que un vehículo sano: cero códigos, y el reporte salía
         en verde "Sin códigos de falla". Un vehículo con fallas reales podía
         declararse sano, que es la peor manera de fallar que tiene esto.
         Se exige evidencia positiva de comunicación: módulos que respondieron,
         VIN, códigos, o el estado del Check Engine. */
      /* Escaneo por módulo: lo que encuentra las fallas que NO son de emisiones
         (TPMS, ABS, tracción, carrocería). Solo por USB — el ELM327 Bluetooth
         no deja dirigir tramas a una dirección arbitraria. */
      let porModulo = null, mapaAcceso = null;
      if (this._via === 'usb') {
        log('<b>Escaneando TODOS los módulos del vehículo...</b> (esto tarda ~30 s)');
        this._mapaFaltantes = [];
        /* Por dónde se le entró a este mismo modelo en escaneos anteriores. */
        const mapaPrev = await this._mapaConocido(vehId);
        porModulo = await this._escanearModulos(log, mapaPrev).catch(e => { log(`No se pudo barrer módulos: ${e.message}`); return null; });
        mapaAcceso = this._mapaDeEscaneo(porModulo);
        if (mapaAcceso) {
          const nuevos = porModulo.filter(m => m.nuevo).length;
          log(`&nbsp;&nbsp;Mapa de acceso guardado: ${mapaAcceso.modulos.length} módulo(s) en CAN ${mapaAcceso.bits} bits / ${mapaAcceso.baud}k` +
              (nuevos ? ` — <b>${nuevos} que no estaban en el mapa del modelo</b>` : '') +
              (mapaPrev ? '' : ' — primer mapa de este modelo'));
        }
        if (porModulo) {
          const conFallas = porModulo.filter(m => m.codigos.length);
          const total = conFallas.reduce((n, m) => n + m.codigos.length, 0);
          log(total
            ? `<b style="color:var(--amber)">${total} código(s) en ${conFallas.length} módulo(s)</b> además de los de emisiones`
            : `Los ${porModulo.length} módulos respondieron sin códigos`);
        }
      }

      const hubo = !!(modulos && modulos.length) || !!vin || codConf.length || codPend.length || mil
                   || !!(porModulo && porModulo.length);
      if (!hubo) {
        throw new Error(
          'SIN COMUNICACIÓN CON EL VEHÍCULO — no se leyó nada, así que NO se puede afirmar que no tenga fallas. ' +
          'Revisá: el cable bien puesto en el conector de diagnóstico, el switch en contacto, y que el adaptador ' +
          'sea compatible con este vehículo (un adaptador de camión necesita cable OBD-II de 16 pines para un liviano). ' +
          'Usá el botón "Probar adaptador" para ver qué protocolo responde.');
      }

      let freeze = null;
      if (codConf.length || mil) {
        log('Leyendo freeze frame (datos al momento de la falla)...');
        freeze = await this._leerFreeze();
      }

      /* Descripciones: diccionario local ES → catálogo BD (3,000+ códigos) → rango SAE */
      const cat = await DB.getDTCCatalogo(
        [...codConf.map(c => c.codigo), ...codPend.map(c => c.codigo), freeze?.dtc].filter(Boolean));
      let dtcs = codConf.map(c => ({ codigo:c.codigo, ecu:c.ecu, modulo:this._nombreModulo(c.ecu), desc:this._descDTC(c.codigo, cat) }));
      let pend = codPend.map(c => ({ codigo:c.codigo, ecu:c.ecu, modulo:this._nombreModulo(c.ecu), desc:this._descDTC(c.codigo, cat) }));
      dtcs = await this._enriquecerDTCs(dtcs, vehId);
      pend = await this._enriquecerDTCs(pend, vehId);
      if (freeze) freeze.desc = this._descDTC(freeze.dtc, cat);

      log('Detectando sensores soportados...');
      this._sop = await this._leerSoportados();
      log(`Leyendo ${this._sop.length || this._BASICOS.length} sensores en vivo...`);
      const datos = await this._leerVivo(this._sop, log);

      log('Leyendo monitores a bordo (modo 06)...');
      const monitores = await this._leerMonitores(log).catch(() => null);
      if (!monitores) log('Este vehículo no reporta monitores en modo 06');

      /* Códigos PERMANENTES: los que no se borran con la batería ni con el modo
         04. Si aparecen y no hay códigos confirmados, alguien limpió la memoria
         hace poco — dato clave al recibir un vehículo que no se conoce. */
      log('Leyendo códigos permanentes (modo 0A)...');
      const permanentes = await this._leerPermanentes();
      if (permanentes.length) {
        log(`<b style="color:var(--amber)">${permanentes.length} código(s) PERMANENTE(S)</b> — no se borran desconectando la batería`);
        if (!dtcs.length) log('&nbsp;&nbsp;Hay permanentes pero ningún código confirmado: la memoria se borró hace poco.');
      } else log('Sin códigos permanentes');

      /* Equipamiento declarado: lo que permite ver un DPF o un EGR eliminados,
         que no dejan ningún código porque el software ya no los busca. */
      log('Verificando equipamiento declarado...');
      const readiness = await this._leerReadiness();
      const normaObd = await this._leerNormaOBD();
      const calib = await this._leerCalibracion();
      if (normaObd) log(`Norma declarada: <b>${normaObd.nombre}</b>`);
      if (calib?.calid) log(`Calibración: <b>${calib.calid}</b>${calib.cvn ? ` <span style="color:var(--text3)">· CVN ${calib.cvn}</span>` : ''}`);
      else if (calib?.cvn) log(`CVN de calibración: <b>${calib.cvn}</b>`);
      const equipo = this._analizarEquipamiento({ readiness, norma:normaObd, vin, calib });
      if (readiness) {
        const sop = readiness.monitores.filter(m => m.soportado);
        log(`Motor ${readiness.diesel ? 'diésel' : 'a gasolina'} — declara ${sop.length} de ${readiness.monitores.length} monitores`);
      }
      for (const a of equipo.avisos) {
        const col = a.nivel === 'alto' ? 'var(--red)' : a.nivel === 'medio' ? 'var(--amber)' : 'var(--text3)';
        log(`<span style="color:${col}">${a.nivel === 'alto' ? '⛔' : a.nivel === 'medio' ? '⚠️' : 'ℹ️'} ${a.txt}</span>`);
      }

      /* Contra los mismos modelos que ya pasaron por el taller: es lo que
         permite pasar de "le falta lo que exige la norma" a "le falta lo que
         sus iguales sí traen". */
      log('Comparando contra vehículos iguales del taller...');
      const iguales = await this._compararConIguales({ vehId, calib, readiness, modulos });
      if (!iguales) log('&nbsp;&nbsp;<span style="color:var(--text3)">Sin datos de marca/modelo para comparar</span>');
      else if (iguales.insuficiente)
        log(`&nbsp;&nbsp;<span style="color:var(--text3)">Solo ${iguales.n} ${iguales.marca} ${iguales.modelo} en el historial (hacen falta ${this._MIN_IGUALES}). Escaneá más de este modelo y la comparación empieza a servir.</span>`);
      else if (!iguales.avisos.length)
        log(`&nbsp;&nbsp;<span style="color:var(--green)">Coincide con los ${iguales.n} ${iguales.marca} ${iguales.modelo} del taller ✓</span>`);
      else for (const a of iguales.avisos)
        log(`<span style="color:${a.nivel === 'alto' ? 'var(--red)' : 'var(--amber)'}">${a.nivel === 'alto' ? '⛔' : '⚠️'} ${a.txt}</span>`);
      if (iguales && iguales.avisos) equipo.iguales = iguales;

      /* Contra la visita anterior de ESTE vehículo: lo que dice si la
         reparación de la vez pasada aguantó. */
      log('Comparando con la visita anterior de este vehículo...');
      const comparacion = await this._compararConAnterior(vehId, { dtcs, por_modulo: porModulo, permanentes });
      this._logComparacion(comparacion, log);

      let nhtsa = null;
      if (vin) {
        log('Consultando VIN en base de datos NHTSA...');
        nhtsa = await this._decodeVIN(vin);
        log(nhtsa ? `VIN identificado: <b>${nhtsa.marca} ${nhtsa.modelo||''} ${nhtsa.anio||''}</b>` : 'VIN sin coincidencias en NHTSA');
      }

      this._scan = { costo: this._costoEscaneo(vehId),
                     vehiculo_id: vehId, vin, protocolo, adaptador: nombre, mil,
                     dtcs, dtcs_pendientes: pend, datos, freeze_frame: freeze,
                     monitores, modulos, por_modulo: porModulo, voltaje: this._voltajeDe(datos), nhtsa,
                     permanentes, readiness, norma_obd: normaObd, calibracion: calib,
                     equipamiento: equipo, comparacion, mapa_acceso: mapaAcceso };
      log('<b>Escaneo completo ✓</b>');
      this._renderResultado();
      document.getElementById('obd-btn-save').style.display = '';
      btn.textContent = '↻ Re-escanear';
    } catch (e) {
      log(`<span style="color:var(--red)">✗ ${e.message}</span>`);
      UI.toast(e.message, 'error');
    } finally { btn.disabled = false; }
  },

  _renderResultado() {
    const s = this._scan, el = document.getElementById('obd-result');
    if (!s || !el) return;
    el.innerHTML = `
      ${s.nhtsa ? `<div class="card" style="padding:14px;margin-top:12px;border-left:3px solid var(--cyan)">
        <b style="font-size:12px">🌐 IDENTIFICADO POR VIN (NHTSA)</b>
        <div style="font-size:13px;margin-top:4px">${s.nhtsa.marca} ${s.nhtsa.modelo||''} ${s.nhtsa.anio||''}
          ${s.nhtsa.motor?` · Motor ${s.nhtsa.motor}`:''} ${s.nhtsa.combustible?` · ${s.nhtsa.combustible}`:''}
          ${s.nhtsa.pais?` · Fab. ${s.nhtsa.pais}`:''}</div>
        <button class="btn btn-sm btn-cyan" style="margin-top:6px" onclick="Modulos.diagnostico_obd.aplicarVIN()">📋 Completar ficha del vehículo</button>
      </div>` : ''}
      ${this._modulosHTML(s)}
      ${this._tablaDTCs(s)}
      ${this._historialHTML(s)}
      <div id="obd-bitacora"></div>
      <div id="obd-campanas"></div>
      ${this._freezeHTML(s.freeze_frame)}
      ${this._porModuloHTML(s)}
      ${this._mapaHTML(s)}
      ${this._costoHTML(s)}
      ${this._equipamientoHTML(s)}
      ${this._monitoresHTML(s.monitores)}
      <div class="card" style="padding:14px;margin-top:12px">
        <b style="font-size:12px">DATOS EN VIVO (${Object.keys(s.datos||{}).length} sensores)</b>
        <div id="obd-mon-sel" style="margin-top:6px">${this._chipsInicial()}</div>
        <div id="obd-vivo" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:9px;margin-top:6px;font-size:13px">
          ${this._vivoHTML(s.datos||{})}
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost" id="obd-btn-live" onclick="Modulos.diagnostico_obd.toggleLive()">▶️ Monitor en vivo</button>
          <button class="btn btn-sm btn-ghost" id="obd-btn-rec" style="display:none" onclick="Modulos.diagnostico_obd.toggleRec()">⏺ Grabar sesión</button>
          ${(s.dtcs.length || s.mil) ? `<button class="btn btn-sm btn-danger" onclick="Modulos.diagnostico_obd.borrarDTCs()">🧹 Borrar códigos</button>` : ''}
          ${(typeof moduloEnPlan !== 'function' || moduloEnPlan('ia')) ? `<button class="btn btn-sm btn-cyan" onclick="Modulos.diagnostico_obd.analizarIA()">🤖 Analizar con IA</button>` : ''}
        </div>
        <div id="obd-rec-info" style="font-size:11px;color:var(--text3);margin-top:6px"></div>
      </div>
      <div id="obd-ia"></div>`;

    /* Se consulta sola, sin pedir clic: si el mecánico tuviera que acordarse,
       la campaña de fábrica se descubre cuando el cliente ya pagó la reparación.
       Va sin await para no demorar el resultado del escaneo. */
    const v = (this._vehiculos || []).find(x => x.id === s.vehiculo_id);
    const marca = s.nhtsa?.marca || v?.marca, modelo = s.nhtsa?.modelo || v?.modelo, anio = s.nhtsa?.anio || v?.anio;
    if (marca && modelo && anio) this.pintarCampanas('obd-campanas', marca, modelo, anio);
    this.pintarBitacora(s);   // la memoria del taller no depende de internet
  },

  _freezeHTML(fz) {
    if (!fz) return '';
    return `<div class="card" style="padding:14px;margin-top:12px;border-left:3px solid var(--amber)">
      <b style="font-size:12px">📸 FREEZE FRAME — al momento de la falla ${fz.dtc}${fz.desc?` (${fz.desc})`:''}</b>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-top:10px;font-size:13px">
        ${this._vivoHTML(fz, ['dtc','desc'])}
      </div>
    </div>`;
  },

  /* Aplica lo decodificado del VIN a la ficha del vehículo (solo campos vacíos) */
  async aplicarVIN() {
    const s = this._scan;
    if (!s?.nhtsa) return;
    const v = this._vehiculos.find(x => x.id === s.vehiculo_id);
    if (!v) return;
    const n = s.nhtsa, campos = { id: v.id, vin: s.vin };
    if (!v.marca && n.marca)             campos.marca = n.marca;
    if (!v.modelo && n.modelo)           campos.modelo = n.modelo;
    if (!v.anio && n.anio)               campos.anio = +n.anio;
    if (!v.motor && n.motor)             campos.motor = n.motor;
    if (!v.cilindros && n.cilindros)     campos.cilindros = +n.cilindros;
    if (!v.combustible && n.combustible) campos.combustible = n.combustible;
    const { error } = await DB.upsertVehiculo(campos);
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    Object.assign(v, campos);
    UI.toast('Ficha del vehículo completada con datos del VIN ✓');
  },

  /* Análisis del escaneo con Nexus (Edge Function ai-assistant ya existente) */
  _promptIA(s, veh) {
    const dat = Object.entries(s.datos||{}).map(([k,v])=>`${k}:${v}`).join(', ');
    const c = s.comparacion;
    return `Analiza este escaneo OBD-II y explica en español sencillo para un mecánico: ` +
      `causa probable de cada código, cómo confirmar el diagnóstico y la reparación recomendada con su urgencia.\n` +
      `Vehículo: ${veh ? `${veh.marca||''} ${veh.modelo||''} ${veh.anio||''} placa ${veh.placa||''}` : 'no especificado'}\n` +
      `VIN: ${s.vin||'—'}\nCheck Engine: ${s.mil?'ENCENDIDO':'apagado'}\n` +
      `Códigos confirmados: ${(s.dtcs||[]).map(d=>`${d.codigo} (${d.desc})`).join('; ')||'ninguno'}\n` +
      `Códigos pendientes: ${(s.dtcs_pendientes||[]).map(d=>d.codigo).join('; ')||'ninguno'}\n` +
      /* El histórico cambia el diagnóstico: un código que vuelve por segunda vez
         no se atiende igual que uno que aparece por primera. */
      (c && !c.primera
        ? `Visita anterior hace ${c.dias} día(s) — códigos que VOLVIERON: ${(c.reincidentes||[]).map(x=>x.codigo).join(', ')||'ninguno'}; ` +
          `nuevos desde entonces: ${(c.nuevos||[]).map(x=>x.codigo).join(', ')||'ninguno'}; ` +
          `ya no aparecen: ${(c.resueltos||[]).map(x=>x.codigo).join(', ')||'ninguno'}` +
          `${c.borrados_antes ? ' (en esa visita se borraron los códigos)' : ''}\n`
        : '') +
      `Freeze frame: ${s.freeze_frame?JSON.stringify(s.freeze_frame):'—'}\nDatos en vivo: ${dat||'—'}`;
  },

  async analizarIA(idGuardado) {
    const s = idGuardado ? this._data.find(x => x.id === idGuardado) : this._scan;
    const el = document.getElementById('obd-ia');
    if (!s || !el) return;
    el.innerHTML = `<div class="card" style="padding:14px;margin-top:12px">⏳ Nexus está analizando el escaneo...</div>`;
    const veh = idGuardado ? s.vehiculos : this._vehiculos.find(v => v.id === s.vehiculo_id);
    const r = await IA.tecnico(this._promptIA(s, veh));
    if (!r.ok) { el.innerHTML = `<div class="card" style="padding:14px;margin-top:12px;color:var(--red)">⚠️ ${r.error}</div>`; return; }
    s.ia_analisis = r.respuesta;
    if (idGuardado) await DB.upsertDiagnosticoOBD({ id: idGuardado, ia_analisis: r.respuesta });  // cachear: 1 sola consulta por escaneo
    el.innerHTML = this._iaHTML(r.respuesta);
  },

  _iaHTML(texto) {
    if (!texto) return '';
    const cuerpo = (typeof IA !== 'undefined' && IA._formatear) ? IA._formatear(texto)
      : `<div style="white-space:pre-wrap">${texto}</div>`;
    return `<div class="card" style="padding:14px;margin-top:12px;border-left:3px solid var(--cyan)">
      <b style="font-size:12px">🤖 ANÁLISIS DE NEXUS</b>
      <div style="font-size:13px;margin-top:6px">${cuerpo}</div>
    </div>`;
  },

  _modulosHTML(s) {
    if (!s || !s.modulos || !s.modulos.length) return '';
    /* En J1587 los módulos SON los MID y ahí sí aparecen frenos, tablero y
       demás; la advertencia de "acá no sale el ABS" sólo vale para OBD-II. */
    const j87 = /J1587/.test(s.protocolo || '');
    return `<div class="card" style="padding:14px;margin-top:12px">
      <b style="font-size:12px">MÓDULOS DETECTADOS (${s.modulos.length})</b>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;margin-top:6px">
        ${s.modulos.map(m => {
          const conf = (s.dtcs || []).filter(d => d.ecu === m.ecu).length;
          const pend = (s.dtcs_pendientes || []).filter(d => d.ecu === m.ecu).length;
          const col = conf ? 'red' : pend ? 'amber' : 'green';
          const estado = conf || pend
            ? `${conf ? `${conf} confirmado(s)` : ''}${conf && pend ? ' · ' : ''}${pend ? `${pend} pendiente(s)` : ''}`
            : 'responde · sin códigos';
          return `<div style="background:var(--surface2);border-radius:8px;padding:9px 11px;border-left:3px solid var(--${col})">
            <div style="font-size:12.5px;font-weight:600">${m.nombre}</div>
            <div style="font-size:10px;color:var(--text3);font-family:ui-monospace,Consolas,monospace">${m.ecu ? (j87 ? `MID ${m.ecu}` : '0x' + m.ecu.toString(16).toUpperCase()) : 'dirección no expuesta'}</div>
            <div style="font-size:11.5px;margin-top:4px;color:var(--${col});font-weight:600">${estado}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:7px;line-height:1.5">
        ${j87
          ? 'Son los módulos que se anunciaron en el bus J1708 durante la escucha. Un módulo que no transmitió en esos segundos no aparece, aunque esté presente.'
          : 'Acá sólo aparecen los módulos que la norma OBD-II obliga a responder (motor y, si existe, transmisión). <b>ABS, airbag, dirección eléctrica y clima no salen en esta lista</b>: usan protocolos propios de cada marca. Que no aparezcan no significa que estén fallando.'}
      </div>
    </div>`;
  },

  _tablaDTCs(s) {
    const filas = [
      ...s.dtcs.map(x => ({ ...x, tipo:'Confirmado', color:'red' })),
      ...(s.dtcs_pendientes||[]).map(x => ({ ...x, tipo:'Pendiente', color:'amber' })),
    ];
    /* J1587 todavía no se contrastó contra un camión: el número manda, el texto
       acompaña. Se dice en pantalla para que nadie cambie una pieza por una
       interpretación que aún no se verificó. */
    const sinVerificar = /J1587/.test(s.protocolo || '')
      ? `<div style="background:var(--amber-dim);border:1px solid var(--amber-border);border-radius:6px;padding:7px 9px;margin-top:6px;font-size:11px;line-height:1.5">
          <b>Lectura J1587 sin verificar contra hardware.</b> Los números MID/PID/FMI son los que reporta
          el camión y son los que valen — contrastalos con la app de servicio de Navistar antes de
          intervenir. La descripción del FMI es orientativa.
        </div>` : '';
    return `<div class="card" style="padding:14px;margin-top:12px">
      <b style="font-size:12px">CÓDIGOS DE FALLA (DTC)</b>
      ${sinVerificar}
      ${filas.length ? `<table class="table" style="margin-top:6px;font-size:12px">
        <thead><tr><th>Código</th><th>Módulo</th><th>Descripción</th><th>Estado</th><th style="text-align:right">Guía</th></tr></thead>
        <tbody>${filas.map(f=>`<tr><td><b style="font-family:monospace">${f.codigo}</b></td><td style="font-size:11px;white-space:nowrap">${f.modulo || this._nombreModulo(f.ecu)}</td><td>${f.desc}${f.origen ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">${f.origen}${f.fuente ? ` · ${f.fuente}` : ''}</div>` : ''}</td><td><span class="badge badge-${f.color}">${f.tipo}</span></td><td style="text-align:right;white-space:nowrap"><button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd.verGuia('${UI.esc(f.codigo)}')" title="Qué medir antes de cambiar piezas">🔧${this._GUIA[f.codigo] ? '' : '<span style="opacity:.5"> ·</span>'}</button></td></tr>`).join('')}</tbody>
      </table>` : this._sinCodigosHTML(s)}
    </div>`;
  },

  /* "Sin códigos" en verde solo si el vehículo REALMENTE contestó. Si no hubo
     evidencia de comunicación, decirlo en rojo: un escaneo que no llegó al bus
     no prueba que el vehículo esté sano, y el verde invita a devolverlo así. */
  _sinCodigosHTML(s) {
    const hablo = !!(s && ((s.modulos && s.modulos.length) || s.vin || s.mil ||
                           (s.datos && Object.keys(s.datos).length) || s.readiness));
    if (hablo) return '<p style="color:var(--green);margin:6px 0 0">✅ Sin códigos de falla</p>';
    return '<p style="color:var(--red);margin:6px 0 0"><b>⚠️ Sin comunicación con el vehículo.</b><br>' +
           '<span style="font-size:11.5px">No se leyó ningún dato, así que esto <b>no significa</b> que no tenga fallas. ' +
           'Revisá el cable, el switch en contacto y el adaptador, y volvé a escanear.</span></p>';
  },

  /* ── Voltaje de batería ──────────────────────────────────────────────────
     Venía SOLO del comando ATRV del ELM327, que por USB no existe (el CAN crudo
     no lo reporta): el campo quedaba vacío o en 0 aunque el propio ECU hubiera
     dicho su voltaje en un PID. Ahora se toma el primero que sirva:
     ATRV → PGN/PID de batería (168, 65271) → voltaje del ECU (PID 42 / 158).

     Un 0 nunca es lectura buena: si el bus contesta, hay batería. Por debajo de
     5 V se descarta como dato inválido en vez de mostrar "0V", que hace dudar
     de todo el escaneo. */
  _voltajeDe(datos) {
    for (const v of [datos && datos.volt, datos && datos.volt_ecu]) {
      if (v == null || v === '') continue;
      const n = parseFloat(String(v).replace(',', '.'));
      if (isFinite(n) && n > 5) return n.toFixed(1) + 'V';
    }
    return null;
  },

  /* Códigos por módulo. Va ARRIBA de la tabla de emisiones porque acá aparecen
     las fallas que el modo 03 no ve — y son las que el cliente está sintiendo. */
  _porModuloHTML(s) {
    const ms = s && s.por_modulo;
    if (!Array.isArray(ms) || !ms.length) return '';
    /* La marca y el modelo hacen útil la búsqueda del código: sin eso el
       enlace devuelve resultados de veinte fabricantes distintos. */
    const veh = (s && s.vehiculos) ||
                (this._vehiculos || []).find(v => v.id === (s && s.vehiculo_id)) || {};
    /* Borrar y reiniciar solo tienen sentido con el vehículo enchufado: al
       abrir un escaneo guardado no hay a quién mandarle el comando. */
    const vivo = s === this._scan && this._via === 'usb' && this._listo;
    const conFallas = ms.filter(m => m.codigos && m.codigos.length);
    const total = conFallas.reduce((n, m) => n + m.codigos.length, 0);
    const activos = conFallas.reduce((n, m) => n + m.codigos.filter(c => c.activo).length, 0);

    return `<div class="card" style="padding:14px;margin-top:12px${activos ? ';border:1px solid rgba(239,68,68,.45)' : ''}">
      <b style="font-size:12px">ESCANEO POR MÓDULO (todo el vehículo)</b>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">
        ${ms.length} módulo(s) consultados uno por uno. Acá aparecen las fallas que el escaneo de emisiones no puede ver: frenos, presión de neumáticos, tracción, carrocería.
      </div>
      ${total ? `<div style="font-size:12px;margin-top:8px"><b>${total} código(s)</b> en ${conFallas.length} módulo(s)${activos ? ` · <span style="color:var(--red)"><b>${activos} activo(s) ahora</b></span>` : ''}</div>` : ''}
      ${!total ? '<p style="color:var(--green);margin:8px 0 0;font-size:12px">✅ Ningún módulo reportó códigos</p>' : `
      <div style="margin-top:10px">${conFallas.map(m => `
        <div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:600;margin-bottom:4px">${UI.esc(m.nombre)}
            <span style="color:var(--text3);font-weight:400;font-family:ui-monospace,Consolas,monospace;font-size:10.5px"> · 0x${m.ecu.toString(16).toUpperCase()}</span></div>
          ${m.codigos.map(c => `
            <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
              <span style="flex-shrink:0;padding:2px 8px;border-radius:6px;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;font-weight:700;
                background:${c.activo ? 'rgba(239,68,68,.16)' : 'rgba(148,163,184,.14)'};
                color:${c.activo ? 'var(--red)' : 'var(--text2)'}">${UI.esc(c.codigo)}${c.activo ? ' ●' : ''}</span>
              <span style="flex:1;font-size:11.5px;line-height:1.45">
                ${c.desc
                  ? UI.esc(c.desc)
                  : `<span style="color:var(--text3)">${UI.esc(c.sistema || '')} — código propio del fabricante</span>`}
                ${c.activo ? '<b style="color:var(--red)"> · presente ahora</b>' : '<span style="color:var(--text3)"> · guardada</span>'}
              </span>
              <a href="${this._buscarDTC(c.codigo, veh)}" target="_blank" rel="noopener"
                 style="flex-shrink:0;font-size:11px;color:var(--cyan);text-decoration:none"
                 title="Buscar este código para ${UI.esc([veh.marca, veh.modelo].filter(Boolean).join(' ') || 'este vehículo')}">🔎 buscar</a>
            </div>`).join('')}
        </div>`).join('')}
      </div>
      <div style="font-size:10.5px;color:var(--text3);border-top:1px solid var(--border);padding-top:6px">
        ● = falla presente en este momento; el resto quedó guardada de antes.
        Los códigos C1xxx, B1xxx y U1xxx son <b>propios de cada marca</b>: el mismo número
        significa cosas distintas en Nissan y en Toyota, por eso no se traducen a ciegas.
        El botón <b>🔎 buscar</b> los consulta junto con la marca y el modelo.
      </div>`}
      ${ms.length > conFallas.length ? `<div style="font-size:10.5px;color:var(--text3);margin-top:6px">
        Sin códigos: ${ms.filter(m => !m.codigos.length).map(m => UI.esc(m.nombre)).join(' · ')}</div>` : ''}
      ${vivo ? `
        <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:6px">
            <b>Ver datos de un módulo</b> — identificación y valores en vivo. Solo lectura.
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${ms.map(m => `<button class="btn btn-sm btn-ghost"
              title="Identificación y datos que expone este módulo"
              onclick="Modulos.diagnostico_obd.verModulo(${m.ecu})">📊 ${UI.esc(m.nombre)}</button>`).join('')}
          </div>
        </div>` : ''}
      ${vivo && total ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
          <button class="btn btn-sm btn-danger" onclick="Modulos.diagnostico_obd.borrarPorModulo()">
            🧹 Borrar códigos de todos los módulos</button>
          ${conFallas.map(m => `<button class="btn btn-sm btn-ghost" title="Reiniciar este módulo (no borra nada)"
            onclick="Modulos.diagnostico_obd.resetModulo(${m.ecu})">🔄 ${UI.esc(m.nombre)}</button>`).join('')}
        </div>
        <div style="font-size:10.5px;color:var(--text3);margin-top:6px">
          Borrar <b>no repara</b>: los códigos vuelven si la falla sigue. Se guarda el escaneo antes,
          y se reinician los monitores de emisiones (puede reprobar una inspección hasta que vuelvan a correr).
        </div>` : ''}
    </div>`;
  },

  /* Cobro del escaneo, visible en el reporte para que no se pase por alto al
     armar la OT. La tarifa es del taller, así que se muestra como sugerencia:
     el monto final lo decide quien factura. */
  _costoHTML(s) {
    const c = s && s.costo;
    if (!c || !c.monto) return '';
    return `<div class="card" style="padding:14px;margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div>
        <b style="font-size:12px">COBRO DEL ESCANEO</b>
        <div style="font-size:11px;color:var(--text3)">Tarifa de ${UI.esc(c.categoria)}${c.tipo ? ` · ${UI.esc(c.tipo)}` : ''} — sugerida, ajustable al facturar</div>
      </div>
      <div style="font-size:20px;font-weight:700;font-family:ui-monospace,Consolas,monospace">Q${c.monto.toLocaleString('es-GT')}</div>
    </div>`;
  },

  /* Tarjeta de equipamiento: lo que el vehículo declara y lo que falta.
     Va arriba porque un DPF eliminado no genera ningún código y se pasaría por
     alto mirando solo la lista de fallas. */
  _equipamientoHTML(s) {
    const e = s && s.equipamiento;
    const r = s && s.readiness;
    if (!e && !r && !s?.norma_obd && !s?.calibracion && !(s?.permanentes || []).length) return '';
    const av = (e && e.avisos) || [];
    const alto = av.filter(a => a.nivel === 'alto');

    const chip = m => `<span style="display:inline-block;padding:2px 8px;margin:2px;border-radius:10px;font-size:11px;` +
      `background:${m.soportado ? (m.listo ? 'rgba(34,197,94,.15)' : 'rgba(245,158,11,.15)') : 'rgba(148,163,184,.12)'};` +
      `color:${m.soportado ? (m.listo ? 'var(--green)' : 'var(--amber)') : 'var(--text3)'}">` +
      `${m.soportado ? (m.listo ? '✓' : '◔') : '—'} ${UI.esc(m.nombre)}</span>`;

    const origen = e && e.origen;
    return `<div class="card" style="padding:14px;margin-top:12px${alto.length ? ';border:1px solid rgba(239,68,68,.45)' : ''}">
      <b style="font-size:12px">EQUIPAMIENTO DECLARADO POR EL VEHÍCULO</b>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">Un sistema eliminado del software no genera códigos: se detecta porque el motor deja de declarar su monitor.</div>
      ${origen ? `<div style="font-size:11.5px;margin-top:6px">Origen por VIN: <b>${UI.esc(origen.pais)}</b>${origen.anio ? ` · modelo <b>${origen.anio}</b>` : ''}</div>` : ''}
      ${s.norma_obd ? `<div style="font-size:11.5px">Norma declarada: <b>${UI.esc(s.norma_obd.nombre)}</b></div>` : ''}
      ${s.calibracion?.calid ? `<div style="font-size:11.5px">Calibración: <b style="font-family:ui-monospace,Consolas,monospace">${UI.esc(s.calibracion.calid)}</b></div>` : ''}
      ${s.calibracion?.cvn ? `<div style="font-size:11.5px">CVN: <span style="font-family:ui-monospace,Consolas,monospace">${UI.esc(s.calibracion.cvn)}</span> <span style="color:var(--text3)">— dos vehículos iguales de fábrica traen el mismo</span></div>` : ''}
      ${r ? `<div style="margin-top:8px"><div style="font-size:11px;color:var(--text3)">Monitores (motor ${r.diesel ? 'diésel' : 'a gasolina'}): ✓ listo · ◔ sin completar · — no declarado</div>
        <div style="margin-top:4px">${r.monitores.map(chip).join('')}</div></div>` : ''}
      ${(s.permanentes || []).length ? `<div style="margin-top:8px;font-size:11.5px;color:var(--amber)">
        <b>${s.permanentes.length} código(s) permanente(s):</b> ${s.permanentes.map(p => UI.esc(p.codigo)).join(', ')}
        <div style="color:var(--text3);font-size:11px">No se borran desconectando la batería. Si aparecen sin códigos confirmados, la memoria se limpió hace poco.</div></div>` : ''}
      ${av.length ? `<div style="margin-top:8px">${av.map(a => {
        const col = a.nivel === 'alto' ? 'var(--red)' : a.nivel === 'medio' ? 'var(--amber)' : 'var(--text3)';
        const ic = a.nivel === 'alto' ? '⛔' : a.nivel === 'medio' ? '⚠️' : 'ℹ️';
        return `<div style="font-size:11.5px;color:${col};margin-top:3px">${ic} ${a.txt}</div>`;
      }).join('')}</div>` : ''}
      ${this._igualesHTML(e && e.iguales)}
    </div>`;
  },

  /* Comparación contra los mismos modelos del taller. Se dice SIEMPRE sobre
     cuántos vehículos se apoya: sin ese número, "no coincide con sus iguales"
     puede significar tanto "contra 30 vehículos" como "contra uno". */
  _igualesHTML(g) {
    if (!g) return '';
    const cab = `<div style="font-size:11px;color:var(--text3);margin-top:8px;border-top:1px solid var(--border);padding-top:6px">` +
                `Comparado contra ${g.n} ${UI.esc(g.marca)} ${UI.esc(g.modelo)}${g.anio ? ' ' + g.anio : ''} del taller</div>`;
    if (g.insuficiente)
      return `<div style="font-size:11px;color:var(--text3);margin-top:8px;border-top:1px solid var(--border);padding-top:6px">` +
             `Solo ${g.n} ${UI.esc(g.marca)} ${UI.esc(g.modelo)} en el historial: hacen falta ${this._MIN_IGUALES} para comparar. ` +
             `Escaneá más de este modelo — sobre todo los que estén sanos — y esta sección empieza a servir.</div>`;
    if (!g.avisos || !g.avisos.length)
      return cab + `<div style="font-size:11.5px;color:var(--green)">✓ Coincide con sus iguales</div>`;
    return cab + g.avisos.map(a =>
      `<div style="font-size:11.5px;color:${a.nivel === 'alto' ? 'var(--red)' : 'var(--amber)'};margin-top:3px">` +
      `${a.nivel === 'alto' ? '⛔' : '⚠️'} ${a.txt}</div>`).join('');
  },

  /* Mapa clave→[etiqueta, unidad] de todos los sensores */
  _labels() {
    const labels = { volt: ['Batería',''], ...this._LBLX };
    Object.values(this._PIDS).forEach(p => labels[p.k] = [p.l, p.u]);
    return labels;
  },

  /* Definición de un sensor del monitor: PID OBD-II, o clave J1939/J1587 */
  _defSensor(p) {
    if (this._via === 'j1939' || this._via === 'j1708') { const lb = this._labels()[p]; return lb ? { k: p, l: lb[0], u: lb[1] } : null; }
    return this._PIDS[p];
  },

  _sensoresMonitor() {
    if (this._sop && this._sop.length) return this._sop;
    if (this._via === 'j1708') return Object.keys((this._j87 && this._j87.datos) || (this._scan && this._scan.datos) || {});
    if (this._via === 'j1939') return Object.keys((this._j39 && this._j39.datos) || {});
    /* Al reabrir un escaneo guardado ya no existe _sop, pero sí quedaron los
       datos que se leyeron: se reconstruye la lista desde ahí. Antes caía a los
       7 básicos y parecía que el vehículo sólo daba un puñado de sensores. */
    const leidos = Object.keys((this._scan && this._scan.datos) || {});
    const desdeDatos = Object.keys(this._PIDS).filter(p => leidos.includes(this._PIDS[p].k));
    return desdeDatos.length ? desdeDatos : this._BASICOS;
  },

  /* Deja el selector listo apenas termina el escaneo: antes sólo aparecía al
     arrancar el monitor, así que parecía que no se podía elegir nada. */
  _chipsInicial() {
    if (!this._selMon) {
      const disp = this._sensoresMonitor().filter(p => this._defSensor(p));
      const basicos = (this._via === 'j1939' || this._via === 'j1708') ? ['rpm', 'temp', 'vel'] : ['0C', '05', '0D'];
      this._selMon = disp.filter(p => basicos.includes(p));
      if (!this._selMon.length) this._selMon = disp.slice(0, 3);
    }
    return this._chipsMonitor();
  },

  _selTodos(todos) {
    this._selMon = todos ? this._sensoresMonitor().filter(p => this._defSensor(p)) : [];
    const sel = document.getElementById('obd-mon-sel');
    if (sel) sel.innerHTML = this._chipsMonitor();
    const el = document.getElementById('obd-vivo');
    if (el) el.innerHTML = this._tilesMonitor();
  },

  /* Convierte {clave:valor} a [[etiqueta, valor, unidad]] usando el catálogo de PIDs */
  _datosLista(d, excluir = []) {
    const labels = this._labels();
    return Object.entries(d || {})
      .filter(([k,v]) => v !== null && v !== undefined && labels[k] && !excluir.includes(k))
      .map(([k,v]) => [labels[k][0], v, labels[k][1]]);
  },

  _vivoHTML(d, excluir = []) {
    return this._datosLista(d, excluir)
      .map(i => `<div style="background:var(--surface2);border-radius:6px;padding:6px 8px">
        <div style="font-size:10px;color:var(--text3)">${i[0]}</div><b>${i[1]}${i[2]}</b></div>`).join('')
      || '<span style="color:var(--text3)">Sin datos (¿motor apagado?)</span>';
  },

  /* ═══════════ MONITOR EN VIVO (sensores seleccionables + gráficas + grabación) ═══════════ */
  _selMon: null, _hist: null, _rec: null, _zoom: null,

  /* Clic en un recuadro: lo agranda a todo el ancho. El tick del monitor
     vuelve a dibujar solo, así que el valor ampliado sigue vivo. */
  _toggleZoom(pid) {
    this._zoom = this._zoom === pid ? null : pid;
    const el = document.getElementById('obd-vivo');
    if (el) el.innerHTML = this._tilesMonitor();
  },

  _spark(vals, ref = null, colorVar = 'cyan') {
    if (!vals || vals.length < 2 || typeof Charts === 'undefined') return '';
    const paso = Math.ceil(vals.length / 100);                    // downsample para SVG liviano
    const ds = paso > 1 ? vals.filter((_, i) => i % paso === 0) : vals;
    return Charts.sparkline({ valores: ds, colorVar, ref }).replace('<svg ', '<svg style="width:100%;height:100%" ');
  },

  /* Cómo está el sensor contra su referencia. Sólo marca falla cuando el rango
     vale pase lo que pase (def.a); si depende de la condición, la banda de la
     gráfica ya lo muestra sin gritar "¡falla!" cada vez que se acelera. */
  _estadoSensor(def, v) {
    if (!def || !def.r || typeof v !== 'number') return null;
    if (v >= def.r[0] && v <= def.r[1]) return 'ok';
    return def.a ? 'mal' : 'fuera';
  },

  _chipsMonitor() {
    const disp = this._sensoresMonitor().filter(p => this._defSensor(p));
    const n = (this._selMon || []).length;
    /* Los sensores se leen uno por uno (~0.3 s cada uno), así que elegir muchos
       espacia el refresco. Se dice el número real en vez de dejar que parezca
       que la app se trabó. */
    const seg = Math.max(0.2, n * 0.32).toFixed(1);
    return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <b style="font-size:11.5px">Sensores a monitorear — ${n} de ${disp.length}</b>
        <button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd._selTodos(true)">Todos</button>
        <button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd._selTodos(false)">Ninguno</button>
        <span style="font-size:10.5px;color:var(--text3)">refresco ≈ ${seg} s</span>
      </div>
      <div>${disp.map(p => {
        const def = this._defSensor(p), on = (this._selMon || []).includes(p);
        return `<label style="font-size:11.5px;display:inline-flex;align-items:center;gap:4px;background:var(--surface2);border:1px solid var(--${on ? 'cyan' : 'border'});border-radius:12px;padding:4px 9px;cursor:pointer;margin:0 5px 5px 0;opacity:${on ? 1 : .7}">
          <input type="checkbox" ${on ? 'checked' : ''} onchange="Modulos.diagnostico_obd._toggleSel('${p}',this.checked)"> ${def.l}</label>`;
      }).join('')}</div>`;
  },

  _toggleSel(pid, on) {
    if (on && !this._selMon.includes(pid)) this._selMon.push(pid);
    if (!on) this._selMon = this._selMon.filter(x => x !== pid);
    const sel = document.getElementById('obd-mon-sel');
    if (sel) sel.innerHTML = this._chipsMonitor();
  },

  _tilesMonitor() {
    return this._selMon.map(p => {
      const def = this._defSensor(p);
      if (!def) return '';
      const vals = (this._hist[def.k] || []).filter(x => typeof x === 'number');
      const v = vals.length ? vals[vals.length - 1] : null;
      const est = this._estadoSensor(def, v);
      const color = est === 'mal' ? 'red' : est === 'ok' ? 'green' : 'cyan';
      const redondo = x => Math.round(x * 100) / 100;
      const mm = vals.length > 1
        ? `mín ${redondo(Math.min(...vals))} · máx ${redondo(Math.max(...vals))} · ` : '';
      const ref = def.r
        ? `ref ${def.r[0]}–${def.r[1]}${def.u}${def.rc ? ` (${def.rc})` : ''}`
        : 'sin referencia estándar';
      const z = this._zoom === p;                       // ampliado a todo el ancho
      return `<div onclick="Modulos.diagnostico_obd._toggleZoom('${p}')" title="Clic para ${z ? 'reducir' : 'ampliar'}"
        style="background:var(--surface2);border-radius:8px;padding:${z ? '16px 18px' : '10px 12px'};border-left:3px solid var(--${color});cursor:pointer${z ? ';grid-column:1/-1' : ''}">
        <div style="font-size:${z ? '14px' : '11px'};color:var(--text3);display:flex;justify-content:space-between;gap:6px;align-items:baseline">
          <span>${def.l}</span>${est === 'mal'
            ? '<span style="color:var(--red);font-weight:700">⚠ fuera</span>'
            : `<span style="opacity:.45">${z ? '⤡' : '⤢'}</span>`}
        </div>
        <div style="font-size:${z ? '56px' : '24px'};font-weight:700;line-height:1.15${est === 'mal' ? ';color:var(--red)' : ''}">${v === null ? '—' : v}<span style="font-size:${z ? '22px' : '13px'};font-weight:500;color:var(--text3)">${def.u}</span></div>
        <div style="height:${z ? '160px' : '46px'};margin:4px 0">${this._spark(vals, def.r, color)}</div>
        <div style="font-size:${z ? '12.5px' : '10px'};color:var(--text3);line-height:1.4">${mm}${ref}</div>
      </div>`;
    }).join('') || '<span style="color:var(--text3)">Marca al menos un sensor arriba</span>';
  },

  async toggleLive() {
    if (this._liveTimer) { this._stopLive(); return; }
    if (!this._listo) { UI.toast('Adaptador desconectado — vuelve a escanear', 'error'); return; }
    this._hist = {};
    const btn = document.getElementById('obd-btn-live'); if (btn) btn.textContent = '⏸ Detener';
    const rec = document.getElementById('obd-btn-rec');  if (rec) rec.style.display = '';
    const sel = document.getElementById('obd-mon-sel');
    if (sel) { sel.style.display = ''; sel.innerHTML = this._chipsInicial(); }
    const tick = async () => {
      if (!this._liveTimer) return;
      if (!this._listo) { this._stopLive(); return; }
      const d = await this._leerVivo(this._selMon);
      if (this._scan) this._scan.datos = { ...this._scan.datos, ...d };
      for (const [k, v] of Object.entries(d)) {
        if (typeof v !== 'number') continue;
        (this._hist[k] = this._hist[k] || []).push(v);
        if (this._hist[k].length > 120) this._hist[k].shift();
      }
      if (this._rec) this._rec.muestras.push({ t: Math.round((Date.now() - this._rec.t0) / 100) / 10, ...d });
      const el = document.getElementById('obd-vivo');
      if (!el) { this._stopLive(); return; }
      el.innerHTML = this._tilesMonitor();
      const info = document.getElementById('obd-rec-info');
      if (info && this._rec) info.textContent = `⏺ Grabando: ${this._rec.muestras.length} muestras · ${Math.round((Date.now() - this._rec.t0) / 1000)}s`;
      if (this._liveTimer) this._liveTimer = setTimeout(tick, 150);
    };
    this._liveTimer = setTimeout(tick, 0);
  },

  _stopLive() {
    if (this._liveTimer) { clearTimeout(this._liveTimer); this._liveTimer = null; }
    if (this._rec) this._detenerGrab(false);
    const btn = document.getElementById('obd-btn-live');
    if (btn) btn.textContent = '▶️ Monitor en vivo';
  },

  toggleRec() {
    if (this._rec) { this._detenerGrab(true); return; }
    this._rec = { t0: Date.now(), inicio: new Date().toISOString(), muestras: [] };
    const b = document.getElementById('obd-btn-rec');
    if (b) b.textContent = '⏹ Detener grabación';
    if (!this._liveTimer) this.toggleLive();
  },

  _detenerGrab(avisar) {
    const rec = this._rec; this._rec = null;
    const b = document.getElementById('obd-btn-rec');
    if (b) b.textContent = '⏺ Grabar sesión';
    const info = document.getElementById('obd-rec-info');
    if (rec && rec.muestras.length && this._scan) {
      const seg = Math.round((Date.now() - rec.t0) / 1000);
      this._scan.grabacion = { inicio: rec.inicio, seg, muestras: rec.muestras };
      if (info) info.textContent = `💾 Grabación lista: ${rec.muestras.length} muestras · ${seg}s — se guarda con el escaneo`;
      if (avisar) UI.toast(`Grabación capturada (${rec.muestras.length} muestras) — presiona Guardar`);
    } else if (info) info.textContent = '';
  },

  /* Estadísticas de una grabación: [{l, u, vals, min, avg, max}] */
  _grabStats(g) {
    if (!g?.muestras?.length) return [];
    const labels = this._labels(), llaves = new Set();
    g.muestras.forEach(m => Object.keys(m).forEach(k => k !== 't' && llaves.add(k)));
    return [...llaves].map(k => {
      const vals = g.muestras.map(m => m[k]).filter(v => typeof v === 'number');
      if (!vals.length || !labels[k]) return null;
      return { l: labels[k][0], u: labels[k][1], vals,
               min: Math.min(...vals), max: Math.max(...vals),
               avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 };
    }).filter(Boolean);
  },

  _grabHTML(g) {
    const stats = this._grabStats(g);
    if (!stats.length) return '';
    return `<div class="card" style="padding:14px;margin-top:12px;border-left:3px solid var(--cyan)">
      <b style="font-size:12px">📈 GRABACIÓN DE SESIÓN (${g.muestras.length} muestras · ${g.seg || '?'} s)</b>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:6px;font-size:12px">
        ${stats.map(s => `<div style="background:var(--surface2);border-radius:6px;padding:6px 8px">
          <div style="font-size:10px;color:var(--text3)">${s.l}</div>
          <div style="height:30px">${this._spark(s.vals)}</div>
          <div style="font-size:10px;color:var(--text3)">min ${s.min} · prom ${s.avg} · max ${s.max}${s.u}</div>
        </div>`).join('')}
      </div>
    </div>`;
  },

  async borrarDTCs() {
    const ok = await UI.confirmar(
      '¿Borrar los códigos de falla y apagar el Check Engine?<br><small>Los códigos volverán a aparecer si la falla persiste. Hazlo solo después de reparar.</small>',
      'Borrar códigos');
    if (!ok) return;
    try {
      if (this._via === 'j1939') {
        await this._j39Solicitar(65235);   // DM11: borra códigos activos
        await this._j39Solicitar(65228);   // DM3: borra códigos previos
        if (this._j39) { this._j39.dm1 = {}; this._j39.dm2 = {}; }
      } else await this._cmd('04', 8000);
      if (this._scan) this._scan.dtcs_borrados = true;
      this._log(this._via === 'j1939' ? '🧹 Códigos borrados (DM11 + DM3) ✓' : '🧹 Códigos borrados (modo 04) ✓');
      UI.toast('Códigos borrados ✓');
    } catch (e) { UI.toast('No se pudo borrar: ' + e.message, 'error'); }
  },

  /* ═══════════ DATOS EN VIVO POR MÓDULO (UDS 22) ═══════════
     El ABS conoce la velocidad de cada rueda, el TPMS la presión y temperatura
     de cada sensor, el BCM el estado de puertas, luces y llaves. Todo eso se
     lee con UDS 22 (ReadDataByIdentifier).

     El límite honesto: los identificadores de datos en vivo son PROPIETARIOS de
     cada fabricante. No existe un número estándar para "presión de la rueda
     trasera izquierda" — Nissan usa uno, Toyota otro. Así que:

       · Los identificadores de IDENTIFICACIÓN (0xF18x-0xF19x) sí son de la
         norma ISO 14229 y se leen con su nombre correcto.
       · Para los datos, se descubre QUÉ responde cada módulo y se muestra el
         valor crudo con sus interpretaciones más probables. El mecánico ve el
         número cambiar en tiempo real y lo relaciona con lo que hace el
         vehículo — que es como se identifica un dato sin la tabla del
         fabricante. Inventar la etiqueta sería peor que no ponerla. */

  /* Identificadores estándar de la norma: mismos en cualquier marca */
  _DID_ID: {
    0xF186:'Sesión de diagnóstico activa', 0xF187:'Número de parte del fabricante',
    0xF188:'Versión de software', 0xF189:'Versión de software (fabricante)',
    0xF18A:'Identificador del proveedor', 0xF18B:'Fecha de fabricación del módulo',
    0xF18C:'Número de serie del módulo', 0xF190:'VIN',
    0xF191:'Número de parte del hardware', 0xF192:'Número de parte (proveedor)',
    0xF193:'Versión de hardware', 0xF194:'Número de software (proveedor)',
    0xF195:'Versión de software (proveedor)', 0xF197:'Nombre del sistema',
    0xF19E:'Nombre del archivo ODX',
  },

  async _leerDID(req, resp, did) {
    const d = await this._udsPedir(req, resp, [0x22, (did >> 8) & 0xFF, did & 0xFF], 1800);
    if (!d || d[0] !== 0x62) return null;
    /* Respuesta: [62][did hi][did lo][datos...] */
    if (((d[1] << 8) | d[2]) !== did) return null;
    return d.slice(3);
  },

  /* Un valor crudo puede ser texto, un número de 1/2 bytes, o varios campos.
     Se ofrecen las lecturas plausibles en vez de elegir una y arriesgarse. */
  _interpretarDID(b) {
    if (!b || !b.length) return null;
    const hex = b.map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const txt = b.every(x => x === 0 || (x >= 32 && x < 127))
      ? b.map(x => x ? String.fromCharCode(x) : '').join('').trim() : '';
    const lecturas = [];
    if (txt && txt.length >= 3) lecturas.push(`texto: "${txt}"`);
    if (b.length === 1) lecturas.push(`${b[0]}`);
    if (b.length === 2) lecturas.push(`${(b[0] << 8) | b[1]}`);
    if (b.length === 4) lecturas.push(`${((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0}`);
    if (b.length > 1 && b.length <= 8) lecturas.push('bytes: ' + b.join(', '));
    return { hex, txt, lecturas };
  },

  /* Identificación del módulo: número de parte, software, serie. Sirve para
     saber si dos vehículos iguales traen el mismo módulo, y para pedir el
     repuesto correcto sin desmontarlo. */
  async _identificarModulo(req, resp) {
    const out = {};
    for (const did of [0xF187, 0xF188, 0xF18C, 0xF191, 0xF193, 0xF18A]) {
      const b = await this._leerDID(req, resp, did);
      if (!b) continue;
      const i = this._interpretarDID(b);
      out[did] = { nombre: this._DID_ID[did], texto: i.txt || i.hex, hex: i.hex };
    }
    return Object.keys(out).length ? out : null;
  },

  /* Descubre qué datos expone un módulo. Se barren los rangos donde los
     fabricantes suelen poner sus datos en vivo; los que contestan se muestran
     con su valor crudo para poder observarlos cambiar. */
  _RANGOS_DID: [[0x0100, 0x0140], [0x1000, 0x1040], [0xC100, 0xC140], [0xD100, 0xD140]],

  async _explorarDatos(req, resp, log, tope = 24) {
    const hallados = [];
    for (const [ini, fin] of this._RANGOS_DID) {
      for (let did = ini; did <= fin && hallados.length < tope; did++) {
        const b = await this._leerDID(req, resp, did);
        if (!b || !b.length) continue;
        const i = this._interpretarDID(b);
        hallados.push({ did, hex: i.hex, txt: i.txt, lecturas: i.lecturas, bytes: b });
        if (log) log(`&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:var(--text3)">DID 0x${did.toString(16).toUpperCase()} → ${i.hex}</span>`);
      }
      if (hallados.length >= tope) break;
    }
    return hallados;
  },

  /* Abre la ficha de un módulo: identificación + datos que expone. */
  async verModulo(ecu) {
    const ms = (this._scan && this._scan.por_modulo) || [];
    const m = ms.find(x => x.ecu === ecu);
    if (!m) return;
    if (this._via !== 'usb' || !this._listo) { UI.toast('Requiere el vehículo conectado por USB', 'error'); return; }

    UI.modal(`📊 ${m.nombre}`, `<div id="mod-cuerpo" style="font-size:12.5px">
      <p style="color:var(--text3)">Consultando el módulo…</p></div>`, '760px');
    const pon = h => { const el = document.getElementById('mod-cuerpo'); if (el) el.innerHTML = h; };

    try {
      const ident = await this._identificarModulo(m.ecu, m.resp);
      const datos = await this._explorarDatos(m.ecu, m.resp);
      m.ident = ident; m.datos_uds = datos;

      pon(`
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px">
          Dirección 0x${m.ecu.toString(16).toUpperCase()} · responde en 0x${m.resp.toString(16).toUpperCase()}
        </div>
        ${ident ? `<div class="card" style="padding:12px;margin-bottom:10px">
          <b style="font-size:12px">IDENTIFICACIÓN DEL MÓDULO</b>
          <table class="table" style="margin-top:6px;font-size:12px"><tbody>
            ${Object.values(ident).map(v => `<tr><td style="color:var(--text3)">${UI.esc(v.nombre)}</td>
              <td style="font-family:ui-monospace,Consolas,monospace">${UI.esc(v.texto)}</td></tr>`).join('')}
          </tbody></table>
          <div style="font-size:10.5px;color:var(--text3);margin-top:4px">
            Sirve para pedir el repuesto exacto sin desmontarlo, y para comparar contra otro vehículo igual.
          </div>
        </div>` : '<p style="color:var(--text3)">El módulo no expuso datos de identificación.</p>'}

        ${datos.length ? `<div class="card" style="padding:12px">
          <b style="font-size:12px">DATOS QUE EXPONE (${datos.length})</b>
          <div style="font-size:10.5px;color:var(--text3);margin:2px 0 8px">
            Los identificadores de datos son <b>propios de cada marca</b>: no se les pone etiqueta
            inventada. Mirá cuál cambia al mover el volante, girar una rueda o abrir una puerta —
            así se identifica cada dato sin la tabla del fabricante.
          </div>
          <table class="table" style="font-size:12px"><thead><tr>
            <th>Identificador</th><th>Valor crudo</th><th>Lecturas posibles</th></tr></thead><tbody>
            ${datos.map(d => `<tr>
              <td style="font-family:ui-monospace,Consolas,monospace">0x${d.did.toString(16).toUpperCase()}</td>
              <td style="font-family:ui-monospace,Consolas,monospace">${UI.esc(d.hex)}</td>
              <td style="font-size:11.5px;color:var(--text2)">${UI.esc((d.lecturas || []).join('  ·  '))}</td>
            </tr>`).join('')}
          </tbody></table>
        </div>` : '<p style="color:var(--text3)">No respondió a los identificadores de datos consultados.</p>'}

        <div style="margin-top:10px;font-size:11px;color:var(--text3)">
          Solo lectura: nada de esto modifica el vehículo.
        </div>`);
    } catch (e) {
      pon(`<p style="color:var(--red)">No se pudo consultar el módulo: ${UI.esc(e.message)}</p>`);
    }
  },

  /* ═══════════ BORRADO Y RESET POR MÓDULO ═══════════
     El modo 04 de OBD-II solo llega a los módulos de emisiones. Las fallas del
     ABS, del TPMS o de la carrocería NO se borran con él: hay que pedírselo a
     cada módulo por su dirección con UDS 14 (ClearDiagnosticInformation).

     Dos protecciones que no son opcionales:

     1. El escaneo se GUARDA ANTES de borrar. Un código borrado sin registro es
        evidencia perdida: si el cliente vuelve en dos semanas con el mismo
        síntoma, sin ese registro no hay con qué comparar.

     2. Borrar reinicia los monitores de disponibilidad. Un vehículo recién
        borrado REPRUEBA una inspección de emisiones aunque esté sano, porque
        los monitores no han corrido. Hay que decirlo antes, no después. */

  async _guardarAntesDeBorrar() {
    if (!this._scan || this._scan.id) return true;
    try {
      /* COPIA, no referencia: enseguida se vacían los códigos de cada módulo
         para reflejar el borrado en pantalla, y con una referencia viva eso
         vaciaría también lo que se está guardando. El registro tiene que
         conservar lo que HABÍA — es justamente su razón de ser. */
      const { nhtsa, ...fila } = JSON.parse(JSON.stringify(this._scan));
      let { data, error } = await DB.upsertDiagnosticoOBD(fila);
      if (error && /PGRST204|column|does not exist/i.test(error.message || '')) {
        const base = { ...fila };
        for (const c of this._CAMPOS_NUEVOS) delete base[c];
        ({ data, error } = await DB.upsertDiagnosticoOBD(base));
      }
      if (error) return false;
      if (data && data.id) this._scan.id = data.id;
      return true;
    } catch (_) { return false; }
  },

  /* Borra los códigos de UN módulo. UDS 14 FF FF FF = borrar todos los suyos. */
  async _borrarModulo(req, resp) {
    const r = await this._udsPedir(req, resp, [0x14, 0xFF, 0xFF, 0xFF], 3000);
    if (r && r[0] === 0x54) return { ok: true };
    /* Algunos módulos exigen sesión extendida para aceptar el borrado */
    const s = await this._udsPedir(req, resp, [0x10, 0x03], 1500);
    if (s && s[0] === 0x50) {
      const r2 = await this._udsPedir(req, resp, [0x14, 0xFF, 0xFF, 0xFF], 3000);
      if (r2 && r2[0] === 0x54) return { ok: true };
      return { ok: false, motivo: r2 && r2[0] === 0x7F ? `rechazado (0x${(r2[2] || 0).toString(16)})` : 'sin respuesta' };
    }
    return { ok: false, motivo: r && r[0] === 0x7F ? `rechazado (0x${(r[2] || 0).toString(16)})` : 'sin respuesta' };
  },

  /* Borra los códigos de TODOS los módulos que reportaron fallas. */
  async borrarPorModulo() {
    const ms = (this._scan && this._scan.por_modulo) || [];
    const conFallas = ms.filter(m => m.codigos && m.codigos.length);
    if (!conFallas.length) { UI.toast('No hay códigos por módulo para borrar', 'info'); return; }
    if (this._via !== 'usb') { UI.toast('El borrado por módulo requiere la conexión USB', 'error'); return; }

    const total = conFallas.reduce((n, m) => n + m.codigos.length, 0);
    const ok = await UI.confirmar(
      `¿Borrar ${total} código(s) en ${conFallas.length} módulo(s)?<br><br>` +
      `<b>${conFallas.map(m => UI.esc(m.nombre)).join(', ')}</b><br><br>` +
      '<small>· Los códigos <b>vuelven</b> si la falla sigue: borrar no repara.<br>' +
      '· Se reinician los monitores de emisiones: el vehículo puede <b>reprobar una inspección</b> hasta que vuelvan a correr.<br>' +
      '· El escaneo se guarda antes, para no perder el registro de lo que había.<br>' +
      '· El vehículo debe estar <b>detenido</b> y con el motor apagado.</small>',
      'Borrar códigos de todos los módulos');
    if (!ok) return;

    const guardado = await this._guardarAntesDeBorrar();
    this._log(guardado ? '💾 Escaneo guardado antes de borrar ✓'
                       : '<span style="color:var(--amber)">No se pudo guardar el escaneo previo — se borra igual, pero sin registro</span>');

    let bien = 0, mal = 0;
    for (const m of conFallas) {
      const r = await this._borrarModulo(m.ecu, m.resp);
      if (r.ok) { bien++; this._log(`🧹 ${m.nombre}: borrado ✓`); m.codigos = []; }
      else { mal++; this._log(`<span style="color:var(--amber)">⚠️ ${m.nombre}: no se pudo borrar (${r.motivo})</span>`); }
    }
    if (this._scan) this._scan.dtcs_borrados = true;
    this._renderResultado();
    UI.toast(mal ? `${bien} borrado(s), ${mal} rechazado(s)` : `${bien} módulo(s) borrados ✓`, mal ? 'warn' : 'success');
    this._log('<b>Volvé a escanear para confirmar qué códigos regresaron.</b> Los que vuelven de inmediato son fallas presentes, no memoria vieja.');
  },

  /* Reinicio de un módulo (UDS 11 01 = hard reset). Es como desconectarle la
     alimentación: vuelve a arrancar y reejecuta sus autodiagnósticos.
     NO borra códigos ni adaptaciones — para eso está el borrado. */
  async resetModulo(ecu) {
    const ms = (this._scan && this._scan.por_modulo) || [];
    const m = ms.find(x => x.ecu === ecu);
    if (!m) return;
    if (this._via !== 'usb') { UI.toast('El reinicio requiere la conexión USB', 'error'); return; }

    const ok = await UI.confirmar(
      `¿Reiniciar <b>${UI.esc(m.nombre)}</b>?<br><br>` +
      '<small>Equivale a cortarle la alimentación un instante: el módulo arranca de nuevo y repite sus autodiagnósticos.<br><br>' +
      '<b>El vehículo TIENE que estar detenido y con el motor apagado.</b> Reiniciar un módulo en marcha puede apagar el motor o dejar sin asistencia a la dirección o los frenos.<br><br>' +
      'No borra códigos ni adaptaciones.</small>',
      'Reiniciar módulo');
    if (!ok) return;

    try {
      const r = await this._udsPedir(m.ecu, m.resp, [0x11, 0x01], 4000);
      if (r && r[0] === 0x51) {
        this._log(`🔄 ${m.nombre}: reiniciado ✓ — esperá unos segundos y volvé a escanear`);
        UI.toast('Módulo reiniciado ✓');
      } else if (r && r[0] === 0x7F) {
        this._log(`<span style="color:var(--amber)">${m.nombre}: rechazó el reinicio (0x${(r[2] || 0).toString(16)})</span>`);
        UI.toast('El módulo rechazó el reinicio', 'warn');
      } else {
        this._log(`<span style="color:var(--amber)">${m.nombre}: sin respuesta al reinicio</span>`);
        UI.toast('Sin respuesta del módulo', 'warn');
      }
    } catch (e) { UI.toast('No se pudo reiniciar: ' + e.message, 'error'); }
  },

  /* Campos que dependen de una migración posterior a la tabla original. El
     código se despliega antes que la migración (son dos pasos distintos), así
     que un escaneo no puede perderse solo porque la columna todavía no exista.*/
  _CAMPOS_NUEVOS: ['permanentes', 'readiness', 'norma_obd', 'calibracion', 'equipamiento', 'costo', 'por_modulo', 'comparacion', 'mapa_acceso'],

  async guardarEscaneo() {
    if (!this._scan) return;
    this._stopLive();
    const { nhtsa, ...fila } = this._scan;   // nhtsa no se persiste (se aplica a la ficha del vehículo)
    let { error } = await DB.upsertDiagnosticoOBD(fila);

    /* PGRST204 = la tabla no tiene esa columna. Se reintenta sin los campos
       nuevos: es preferible guardar el escaneo sin el análisis de equipamiento
       que perder el trabajo entero y que el mecánico tenga que rescanear. */
    if (error && /PGRST204|column|no existe|does not exist/i.test(error.message || '')) {
      const base = { ...fila };
      for (const c of this._CAMPOS_NUEVOS) delete base[c];
      const r2 = await DB.upsertDiagnosticoOBD(base);
      if (!r2.error) {
        UI.toast('Escaneo guardado, sin el análisis de equipamiento (falta aplicar la migración 095)', 'warn');
        this._cerrarEscaneo();
        this.render();
        return;
      }
      error = r2.error;
    }
    if (error) { UI.toast('Error al guardar: ' + error.message, 'error'); return; }
    UI.toast('Escaneo guardado ✓');
    this._cerrarEscaneo();
    this.render();
  },

  _cerrarEscaneo() { this._stopLive(); this._desconectar(); UI.cerrarModal(); },

  /* ═══════════ VER / EDITAR / IMPRIMIR / ELIMINAR ═══════════ */
  ver(id) {
    const d = this._data.find(x => x.id === id);
    if (!d) return;
    const v = d.vehiculos;
    UI.modal('🩺 Reporte de Diagnóstico', `
      <div style="font-size:13px">
        <p><b>Vehículo:</b> ${v ? `${v.placa||''} · ${v.marca||''} ${v.modelo||''} ${v.anio||''}` : '—'}<br>
        <b>Fecha:</b> ${UI.fecha(d.created_at)} · <b>VIN:</b> <span style="font-family:monospace">${d.vin||'—'}</span><br>
        <b>Protocolo:</b> ${d.protocolo||'—'} · <b>Adaptador:</b> ${d.adaptador||'—'} · <b>Batería:</b> ${d.voltaje||'—'}<br>
        <b>Check Engine:</b> ${d.mil?'🔴 Encendido':'✅ Apagado'} ${d.dtcs_borrados?' · 🧹 Códigos borrados tras el escaneo':''}</p>
        ${this._modulosHTML(d)}
        ${this._tablaDTCs(d)}
        ${this._historialHTML(d)}
        ${this._freezeHTML(d.freeze_frame)}
        ${this._porModuloHTML(d)}
      ${this._mapaHTML(d)}
      ${this._costoHTML(d)}
      ${this._equipamientoHTML(d)}
      ${this._monitoresHTML(d.monitores)}
        <div class="card" style="padding:14px;margin-top:12px">
          <b style="font-size:12px">DATOS AL MOMENTO DEL ESCANEO</b>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-top:10px">${this._vivoHTML(d.datos||{})}</div>
        </div>
        ${this._grabHTML(d.grabacion)}
        <div id="obd-ia">${this._iaHTML(d.ia_analisis)}</div>
        ${d.notas ? `<p style="margin-top:8px"><b>Notas:</b> ${d.notas}</p>` : ''}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        ${!d.ia_analisis && (typeof moduloEnPlan !== 'function' || moduloEnPlan('ia')) ? `<button class="btn btn-cyan" onclick="Modulos.diagnostico_obd.analizarIA('${d.id}')">🤖 Analizar con IA</button>` : ''}
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        ${Modulos.btnAccion('imprimir', `Modulos.diagnostico_obd.imprimir('${d.id}')`, { label:'🖨 Imprimir' })}
      </div>`, '980px');
  },

  modalEditar(id) {
    const d = this._data.find(x => x.id === id);
    if (!d) return;
    UI.modal('✏️ Editar Diagnóstico', `
      <div class="form-group">
        <label class="form-label">Vehículo</label>
        <select class="form-select" id="obd-e-veh">
          ${this._vehiculos.map(v=>`<option value="${v.id}" ${v.id===d.vehiculo_id?'selected':''}>${v.placa||'s/placa'} · ${v.marca||''} ${v.modelo||''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notas del técnico</label>
        <textarea class="form-input" id="obd-e-notas" rows="4" placeholder="Diagnóstico, causa probable, trabajo recomendado...">${d.notas||''}</textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-brand" onclick="Modulos.diagnostico_obd.guardarEdicion('${id}')">Guardar</button>
      </div>`, '520px');
  },

  async guardarEdicion(id) {
    const { error } = await DB.upsertDiagnosticoOBD({
      id,
      vehiculo_id: document.getElementById('obd-e-veh').value,
      notas: document.getElementById('obd-e-notas').value.trim() || null,
    });
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.toast('Actualizado ✓'); UI.cerrarModal(); this.render();
  },

  eliminar(id) {
    const d = this._data.find(x => x.id === id);
    Modulos.eliminarRegistro('diagnosticos_obd', id,
      `el diagnóstico de ${d?.vehiculos?.placa || 'este vehículo'}`, () => this.render());
  },

  imprimir(id) {
    const d = this._data.find(x => x.id === id);
    if (!d) return;
    const v = d.vehiculos;
    const filas = [
      ...(d.dtcs||[]).map(x => ({ ...x, tipo:'Confirmado' })),
      ...(d.dtcs_pendientes||[]).map(x => ({ ...x, tipo:'Pendiente' })),
    ];
    const vivo = this._datosLista(d.datos);
    const fz = d.freeze_frame ? this._datosLista(d.freeze_frame, ['dtc','desc']) : [];
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Diagnóstico OBD-II</title><meta charset="UTF-8">
      <style>
        body{font-family:Arial,sans-serif;padding:20px;max-width:700px;margin:0 auto;color:#111}
        h2{text-align:center;border-bottom:2px solid #3B82F6;padding-bottom:8px}
        .section{border:1px solid #ddd;border-radius:6px;padding:12px;margin-bottom:12px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#3B82F6;color:#fff;padding:6px 8px;text-align:left}
        td{padding:6px 8px;border-bottom:1px solid #eee}
        .mil-on{color:#DC2626;font-weight:bold}.mil-off{color:green;font-weight:bold}
        @media print{button{display:none}}
      </style></head><body>
      <h2>${Auth.tenant?.name||'NexusPro'} — Diagnóstico OBD-II</h2>
      <div class="section">
        <b>VEHÍCULO:</b> ${v ? `${v.placa||''} · ${v.marca||''} ${v.modelo||''} ${v.anio||''}` : '—'}<br>
        <b>VIN:</b> ${d.vin||'—'} · <b>Fecha:</b> ${UI.fecha(d.created_at)}<br>
        <b>Protocolo:</b> ${d.protocolo||'—'} · <b>Batería:</b> ${d.voltaje||'—'}<br>
        <b>Check Engine:</b> <span class="${d.mil?'mil-on':'mil-off'}">${d.mil?'ENCENDIDO':'Apagado'}</span>
        ${d.dtcs_borrados?' · Códigos borrados tras el escaneo':''}
      </div>
      <div class="section"><b>CÓDIGOS DE FALLA:</b>
        ${filas.length ? `<table style="margin-top:8px"><thead><tr><th>Código</th><th>Descripción</th><th>Estado</th></tr></thead>
          <tbody>${filas.map(f=>`<tr><td><b>${f.codigo}</b></td><td>${f.desc}</td><td>${f.tipo}</td></tr>`).join('')}</tbody></table>`
        : '<p style="color:green">Sin códigos de falla ✓</p>'}
      </div>
      ${(() => {
        /* La reincidencia va en el papel que se lleva el cliente: es la
           diferencia entre "tiene esta falla" y "esta falla ya estaba la vez
           pasada", y de eso depende quién paga el trabajo. */
        const c = d.comparacion;
        if (!c || c.primera) return '';
        const l = arr => arr.map(x => x.codigo).join(', ');
        const cuando = c.dias === 0 ? 'hoy mismo' : c.dias === 1 ? 'hace 1 día' : `hace ${c.dias} días`;
        return `<div class="section"><b>COMPARADO CON LA VISITA ANTERIOR (${cuando} · ${UI.fecha(c.fecha)}):</b>
          <table style="margin-top:8px"><tbody>
            ${c.reincidentes.length ? `<tr><td>Volvieron</td><td class="mil-on">${l(c.reincidentes)}</td></tr>` : ''}
            ${c.nuevos.length ? `<tr><td>Nuevos desde entonces</td><td><b>${l(c.nuevos)}</b></td></tr>` : ''}
            ${c.resueltos.length ? `<tr><td>Ya no aparecen</td><td class="mil-off">${l(c.resueltos)}</td></tr>` : ''}
            ${!c.reincidentes.length && !c.nuevos.length && !c.resueltos.length
              ? '<tr><td colspan="2">Sin cambios respecto de la visita anterior.</td></tr>' : ''}
          </tbody></table>
          ${c.reincidentes.length ? '<p style="font-size:12px;margin:6px 0 0">Un código que vuelve indica que la causa sigue presente: la reparación anterior no resolvió el problema de fondo.</p>' : ''}
          ${c.borrados_antes && c.resueltos.length ? '<p style="font-size:12px;margin:6px 0 0">En la visita anterior se borraron los códigos, así que un código que hoy no aparece todavía no confirma la reparación.</p>' : ''}
        </div>`;
      })()}
      ${fz.length ? `<div class="section"><b>FREEZE FRAME (al momento de la falla ${d.freeze_frame.dtc}):</b>
        <table style="margin-top:8px"><tbody>${fz.map(i=>`<tr><td>${i[0]}</td><td><b>${i[1]}${i[2]}</b></td></tr>`).join('')}</tbody></table>
      </div>` : ''}
      ${vivo.length ? `<div class="section"><b>DATOS AL MOMENTO DEL ESCANEO:</b>
        <table style="margin-top:8px"><tbody>${vivo.map(i=>`<tr><td>${i[0]}</td><td><b>${i[1]}${i[2]}</b></td></tr>`).join('')}</tbody></table>
      </div>` : ''}
      ${(() => { const st = this._grabStats(d.grabacion); return st.length ? `<div class="section">
        <b>GRABACIÓN DE SESIÓN (${d.grabacion.muestras.length} muestras · ${d.grabacion.seg||'?'} s):</b>
        <table style="margin-top:8px"><thead><tr><th>Sensor</th><th>Mín</th><th>Promedio</th><th>Máx</th></tr></thead>
        <tbody>${st.map(s=>`<tr><td>${s.l}</td><td>${s.min}${s.u}</td><td>${s.avg}${s.u}</td><td>${s.max}${s.u}</td></tr>`).join('')}</tbody></table>
      </div>` : ''; })()}
      ${d.ia_analisis ? `<div class="section"><b>ANÁLISIS DE NEXUS (IA):</b><p style="white-space:pre-wrap">${d.ia_analisis}</p></div>` : ''}
      ${d.notas ? `<div class="section"><b>NOTAS DEL TÉCNICO:</b><p>${d.notas}</p></div>` : ''}
      <p style="text-align:center;color:#888;font-size:11px">Generado por NexusPro · ${new Date().toLocaleString('es-GT')}</p>
      <div style="text-align:center"><button onclick="window.print()">🖨 Imprimir</button></div>
      </body></html>`);
    win.document.close();
  },
};
