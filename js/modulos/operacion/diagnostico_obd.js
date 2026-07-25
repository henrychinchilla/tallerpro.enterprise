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
    const svcs = [...new Set(this._UUIDS.map(u => u.svc))];
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

  async _leerDTCs(modo) {   // modo '03' confirmados / '07' pendientes → códigos crudos
    const ok = modo === '03' ? '43' : '47';
    let codigos = [];
    try {
      for (let line of this._hexLines(await this._cmd(modo, 8000))) {
        const i = line.indexOf(ok);
        if (i < 0) continue;
        let h = line.slice(i + 2);
        if (this._protoNum >= 6) h = h.slice(2);          // CAN antepone el conteo de DTCs
        for (let p = 0; p + 3 < h.length; p += 4) {
          const c = this._decodeDTC(h.substr(p, 4));
          if (c && !codigos.includes(c)) codigos.push(c);
        }
      }
    } catch (_) {}
    return codigos;
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

  /* Catálogo de PIDs modo 01 — se leen solo los que el vehículo reporta soportar */
  _PIDS: {
    '0C': { k:'rpm',       l:'RPM',                    u:'',      f:b=>Math.round((b[0]*256+b[1])/4) },
    '0D': { k:'vel',       l:'Velocidad',              u:' km/h', f:b=>b[0] },
    '05': { k:'temp',      l:'Temp. motor',            u:' °C',   f:b=>b[0]-40 },
    '04': { k:'carga',     l:'Carga motor',            u:' %',    f:b=>Math.round(b[0]*100/255) },
    '11': { k:'acel',      l:'Acelerador',             u:' %',    f:b=>Math.round(b[0]*100/255) },
    '0F': { k:'temp_adm',  l:'Temp. admisión',         u:' °C',   f:b=>b[0]-40 },
    '2F': { k:'comb',      l:'Combustible',            u:' %',    f:b=>Math.round(b[0]*100/255) },
    '06': { k:'stft1',     l:'Ajuste combustible corto', u:' %',  f:b=>Math.round((b[0]/1.28-100)*10)/10 },
    '07': { k:'ltft1',     l:'Ajuste combustible largo', u:' %',  f:b=>Math.round((b[0]/1.28-100)*10)/10 },
    '0A': { k:'pres_comb', l:'Presión de combustible', u:' kPa',  f:b=>b[0]*3 },
    '0B': { k:'map',       l:'Presión admisión (MAP)', u:' kPa',  f:b=>b[0] },
    '0E': { k:'avance',    l:'Avance de encendido',    u:' °',    f:b=>b[0]/2-64 },
    '10': { k:'maf',       l:'Flujo de aire (MAF)',    u:' g/s',  f:b=>Math.round((b[0]*256+b[1])/10)/10 },
    '1F': { k:'marcha',    l:'Tiempo encendido',       u:' min',  f:b=>Math.round((b[0]*256+b[1])/60) },
    '21': { k:'dist_mil',  l:'Km con Check Engine',    u:' km',   f:b=>b[0]*256+b[1] },
    '33': { k:'baro',      l:'Presión barométrica',    u:' kPa',  f:b=>b[0] },
    '42': { k:'volt_ecu',  l:'Voltaje ECU',            u:' V',    f:b=>Math.round((b[0]*256+b[1])/10)/100 },
    '46': { k:'temp_amb',  l:'Temp. ambiente',         u:' °C',   f:b=>b[0]-40 },
    '5C': { k:'temp_aceite',l:'Temp. aceite',          u:' °C',   f:b=>b[0]-40 },
    '5E': { k:'tasa_comb', l:'Consumo',                u:' L/h',  f:b=>Math.round((b[0]*256+b[1])/20*10)/10 },
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

  async _leerVivo(pids) {
    if (this._via === 'j1939') {   // el bus emite solo: muestrear lo acumulado
      await new Promise(r => setTimeout(r, 250));
      const src = (this._j39 && this._j39.datos) || {}, dj = {};
      for (const k of (pids && pids.length ? pids : Object.keys(src)))
        if (src[k] !== undefined) dj[k] = src[k];
      if (src.volt) dj.volt = src.volt;
      return dj;
    }
    const d = {};
    for (const pid of (pids && pids.length ? pids : this._BASICOS)) {
      const def = this._PIDS[pid];
      if (!def) continue;
      try { const b = await this._pid(pid); if (b) d[def.k] = def.f(b); } catch (_) {}
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
      <b style="font-size:12px">📄 BOLETINES DE FÁBRICA (TSB) — ${boletines.length} para ${this._esc(marca)} ${this._esc(modelo)}${anio ? ' ' + this._esc(anio) : ''}</b>
      <div style="font-size:11px;color:var(--text3);margin:2px 0 6px">
        Fallas que la marca ya reconoció en este modelo. Buscá el síntoma antes de diagnosticar desde cero.
      </div>
      <input class="form-input" style="width:100%;font-size:12px;margin-bottom:6px" placeholder="Filtrar por síntoma: ruido, fuga, transmisión…"
             oninput="Modulos.diagnostico_obd._filtrarTSB(this.value)">
      <div id="tsb-lista" style="max-height:340px;overflow-y:auto">
        ${grupos.map(([comp, bs]) => `
          <div class="tsb-grupo" data-txt="${this._esc((comp + ' ' + bs.map(b => b.t).join(' ')).toLowerCase())}">
            <div style="font-weight:800;font-size:11.5px;color:var(--cyan);margin:6px 0 2px">${this._esc(this._comp(comp))} (${bs.length})</div>
            ${bs.slice(0, 25).map(b => `
              <div class="tsb-item" data-txt="${this._esc((b.t + ' ' + b.n).toLowerCase())}" style="border-bottom:1px solid var(--border);padding:5px 0">
                <div style="font-size:12px">${this._esc(b.t)}</div>
                <div style="font-size:10.5px;color:var(--text3)">Boletín ${this._esc(b.n)} · ${this._esc(b.m)} ${b.d}${b.h !== b.d ? '–' + b.h : ''}${b.f ? ` · ${this._esc(b.f.slice(0,4))}` : ''}</div>
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
    el.innerHTML = `<div class="card" style="padding:10px;margin-top:8px;font-size:12px;color:var(--text3)">🔎 Consultando campañas de fábrica en NHTSA…</div>`;
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
      <div class="card" style="padding:10px;margin-top:8px;border-left:3px solid ${campanas.length ? 'var(--red)' : 'var(--border)'}">
        <b style="font-size:12px">🔔 CAMPAÑAS DE FÁBRICA (NHTSA) — ${this._esc(marca)} ${this._esc(modelo)} ${this._esc(anio)}</b>
        ${campanas.length ? `
          <div style="font-size:12px;color:var(--red);font-weight:800;margin-top:4px">
            ${campanas.length} llamado(s) a revisión: la agencia debe repararlo sin costo. Confirmar con el número de campaña antes de cotizar.
          </div>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
            ${campanas.slice(0, 8).map(c => `
              <div style="border:1px solid var(--border);border-radius:8px;padding:8px">
                <div style="font-weight:800;font-size:12.5px">${this._esc(this._comp(c.Component) || 'Componente no indicado')}</div>
                <div style="font-size:11px;color:var(--text3);margin:2px 0">Campaña ${this._esc(c.NHTSACampaignNumber || '—')}${c.ReportReceivedDate ? ` · ${this._esc(c.ReportReceivedDate)}` : ''}</div>
                <div style="font-size:12px">${this._esc((c.Summary || '').slice(0, 300))}</div>
                <div style="font-size:10px;color:var(--text3)">texto original de NHTSA (inglés)</div>
                ${c.Remedy ? `<div style="font-size:12px;margin-top:4px"><b>Solución de fábrica:</b> ${this._esc(c.Remedy.slice(0, 300))}</div>` : ''}
              </div>`).join('')}
          </div>
          ${campanas.length > 8 ? `<div style="font-size:11px;color:var(--text3);margin-top:6px">y ${campanas.length - 8} más — se muestran las 8 primeras</div>` : ''}
        ` : fallaNhtsa
            ? `<div style="font-size:12px;margin-top:4px;color:var(--amber)">⚠️ No se pudo consultar NHTSA (${this._esc(fallaNhtsa)}). Los boletines de abajo son locales y sí están disponibles.</div>`
            : `<div style="font-size:12px;margin-top:4px">Sin campañas registradas en NHTSA.</div>`}
        ${top.length ? `
          <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
            <b style="font-size:12px">📋 LO QUE MÁS REPORTAN LOS DUEÑOS (${quejas.length} quejas)</b>
            <div style="font-size:12px;margin-top:4px">${top.map(([c, n]) => `${this._esc(c)} <b>(${n})</b>`).join(' · ')}</div>
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
        ${vs.map(v => `<option value="${this._esc(v.id)}">${this._esc(v.placa || '')} ${this._esc(v.marca || '')} ${this._esc(v.modelo || '')} ${this._esc(v.anio || '')}</option>`).join('')}
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

  _esc(t) {
    return String(t ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
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
      if (this._via === 'j1939') this._j39Frame(m.datos);
      else if (this._canRx) this._canFrame(m.datos);
      return;
    }
    if (m.op === 'error') { console.warn('Puente RP1210:', m.codigo, m.error); return; }
    const r = this._wsPend[m.op]; delete this._wsPend[m.op];
    if (r) r(m);
  },

  _puenteOp(obj, timeout = 8000) {
    return new Promise((res, rej) => {
      if (!this._ws || this._ws.readyState !== 1) { rej(new Error('Puente USB desconectado')); return; }
      this._wsPend[obj.op] = res;
      setTimeout(() => { if (this._wsPend[obj.op]) { delete this._wsPend[obj.op]; rej(new Error(`El puente no respondió (${obj.op})`)); } }, timeout);
      this._ws.send(JSON.stringify(obj));
    });
  },

  /* ── Vehículos livianos por USB: OBD-II sobre CAN crudo con ISO-TP propio ── */
  async _usbInit(log) {
    await this._puenteConectar();
    const est = await this._puenteOp({ op:'estado' });
    log(`Puente USB: <b>${est.dispositivo || 'RP1210'}</b> v${est.version || '?'} ✓`);
    const c = await this._puenteOp({ op:'conectar', protocolo:'CAN:Baud=500', device:1 });
    if (!c.ok) throw new Error(`El puente no pudo abrir el USB-Link: ${c.error || 'código ' + c.codigo}. ¿Está enchufado a la PC?`);
    for (const ext of [false, true]) {
      this._canExt = ext;
      log(`Probando CAN ${ext ? 29 : 11} bits / 500k...`);
      const r = await this._usbElm('0100').catch(() => 'NO DATA');
      if (/4100/.test(r.replace(/\s/g, ''))) {
        this._protoNum = ext ? 7 : 6;
        return { nombre: est.dispositivo || 'USB-Link (RP1210)', protocolo: `CAN ${ext ? 29 : 11} bits / 500k (USB)` };
      }
    }
    throw new Error('El vehículo no respondió por USB (CAN 500k). Verifica switch encendido y cable OBD. Para livianos también puedes usar el adaptador Bluetooth.');
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
    return lineas.length ? lineas.join('\r') : 'NO DATA';
  },

  _canTx(id, datos) {
    const data8 = datos.concat(Array(Math.max(0, 8 - datos.length)).fill(0));
    return this._puenteOp({ op:'enviar',
      datos: [this._canExt ? 1 : 0, (id >>> 24) & 0xFF, (id >>> 16) & 0xFF, (id >>> 8) & 0xFF, id & 0xFF, ...data8] });
  },

  _canFrame(d) {   // lectura RP1210: [timestamp×4][tipo][id×4][datos...]
    if (d.length < 10 || !this._canRx) return;
    const id = ((d[5] << 24) | (d[6] << 16) | (d[7] << 8) | d[8]) >>> 0;
    this._canRx(id, d.slice(9));
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
    return Object.values(ecus).filter(e => e.ok)
      .map(e => e.datos.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase());
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
  /* Sensores que existen en J1939 pero no en el catálogo de PIDs OBD-II */
  _LBLX: { pres_aceite:['Presión aceite',' kPa'], boost:['Presión turbo',' kPa'], horas:['Horas motor',' h'], odometro:['Odómetro',' km'] },

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

  _j39Frame(d) {   // lectura RP1210 J1939: [ts×4][pgn×3][prio][origen][destino][datos...]
    const j = this._j39;
    if (!j || d.length < 10) return;
    const pgn = d[4] | (d[5] << 8) | (d[6] << 16), data = d.slice(10);
    j.pgns[pgn] = (j.pgns[pgn] || 0) + 1;
    const defs = this._J39_PGNS[pgn];
    if (defs) for (const s of defs) { const v = s.f(data); if (v !== null) j.datos[s.k] = v; }
    if (pgn === 65226) j.dm1 = data;
    if (pgn === 65227) j.dm2 = data;
    if (pgn === 65260) j.vin = data;
    if (pgn === 65259) j.comp = data;
    if (j.esperas[pgn]) { j.esperas[pgn](); delete j.esperas[pgn]; }
  },

  _j39Solicitar(pgn) {   // PGN 59904 (Request) a la dirección global
    return this._puenteOp({ op:'enviar', datos:[0x00, 0xEA, 0x00, 6, 0xF9, 0xFF, pgn & 0xFF, (pgn >> 8) & 0xFF, (pgn >> 16) & 0xFF] });
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
      const est = await this._puenteOp({ op:'estado' });
      log(`Puente USB: <b>${est.dispositivo || 'RP1210'}</b> v${est.version || '?'} ✓`);
      const c = await this._puenteOp({ op:'conectar', protocolo:'J1939', device:1 });
      if (!c.ok) throw new Error(`El puente no pudo abrir el USB-Link: ${c.error || 'código ' + c.codigo}. ¿Está enchufado a la PC?`);
      this._j39 = { datos:{}, pgns:{}, esperas:{}, dm1:null, dm2:null, vin:null, comp:null };
      /* Reclamar dirección de herramienta de diagnóstico (0xF9) en el bus */
      await this._puenteOp({ op:'comando', numero:15, datos:[0xF9, 0, 0, 0x60, 0, 0, 0, 0, 0x80, 0] }).catch(() => {});
      log('Escuchando el bus J1939 (el camión transmite solo)...');
      await new Promise(r => setTimeout(r, 2500));
      const nPGN = Object.keys(this._j39.pgns).length;
      if (!nPGN) log('<span style="color:var(--amber)">Bus silencioso — ¿switch encendido?</span>');
      else log(`${nPGN} tipos de mensaje detectados ✓`);

      log('Solicitando VIN e identificación...');
      await this._j39Solicitar(65260); await this._j39Esperar(65260, 1500);
      await this._j39Solicitar(65259); await this._j39Esperar(65259, 1200);
      const vin = this._j39VIN();
      log(vin ? `VIN: <b>${vin}</b>` : 'VIN no disponible por J1939');
      if (this._j39.comp) {
        const comp = String.fromCharCode(...this._j39.comp).replace(/[^\x20-\x7E*]/g, '').split('*').filter(Boolean);
        if (comp.length) log(`Unidad: <b>${comp.slice(0, 2).join(' · ')}</b>`);
      }

      log('Leyendo códigos de falla (DM1 activos / DM2 previos)...');
      if (!this._j39.dm1) { await this._j39Solicitar(65226); await this._j39Esperar(65226, 1500); }
      await this._j39Solicitar(65227); await this._j39Esperar(65227, 1500);
      let dtcs = this._j39DTCs(this._j39.dm1);
      let pend = this._j39DTCs(this._j39.dm2);
      dtcs = await this._enriquecerDTCs(dtcs, vehId, 'j1939');
      pend = await this._enriquecerDTCs(pend, vehId, 'j1939');
      const b0 = this._j39.dm1 ? this._j39.dm1[0] : 0;
      const mil = ((b0 >> 6) & 3) === 1;
      if (((b0 >> 4) & 3) === 1) log('<span style="color:var(--red)">🔴 Lámpara de PARO encendida — atender de inmediato</span>');
      if (((b0 >> 2) & 3) === 1) log('<span style="color:var(--amber)">🟠 Lámpara ámbar de advertencia encendida</span>');
      log(`${dtcs.length} falla(s) activa(s), ${pend.length} previa(s)`);

      let nhtsa = null;
      if (vin) {
        log('Consultando VIN en base de datos NHTSA...');
        nhtsa = await this._decodeVIN(vin);
        log(nhtsa ? `VIN identificado: <b>${nhtsa.marca} ${nhtsa.modelo || ''} ${nhtsa.anio || ''}</b>` : 'VIN sin coincidencias en NHTSA');
      }

      this._sop = Object.keys(this._j39.datos).filter(k => typeof this._j39.datos[k] === 'number');
      log(`${this._sop.length} sensores del motor en el bus ✓`);
      this._scan = { vehiculo_id: vehId, vin, protocolo: 'J1939 (camión · USB)',
                     adaptador: est.dispositivo || 'USB-Link (RP1210)', mil,
                     dtcs, dtcs_pendientes: pend, datos: { ...this._j39.datos },
                     freeze_frame: null, voltaje: this._j39.datos.volt || null, nhtsa };
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
  modalEscanear() {
    this._scan = null;
    UI.modal('📡 Nuevo Escaneo OBD-II', `
      <div class="form-group">
        <label class="form-label">Vehículo *</label>
        <select class="form-select" id="obd-veh">
          <option value="">— Seleccionar vehículo —</option>
          ${this._vehiculos.map(v=>`<option value="${v.id}">${v.placa||'s/placa'} · ${v.marca||''} ${v.modelo||''} ${v.anio||''} ${v.clientes?`(${v.clientes.nombre})`:''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Conexión</label>
        <select class="form-select" id="obd-via">
          <option value="ble">📶 Bluetooth — ELM327 / Vgate / OBDLink (BLE)</option>
          <option value="j1939">🚚 USB — camión J1939 (puente RP1210)</option>
          <option value="usb">🔌 USB — vehículo liviano (puente RP1210 · beta)</option>
        </select>
      </div>
      <div id="obd-log" style="background:var(--bg2,#0b1220);border-radius:8px;padding:10px;font-family:monospace;font-size:12px;min-height:70px;max-height:180px;overflow:auto;margin:10px 0">
        Conecta el adaptador al puerto de diagnóstico del vehículo y enciende el switch.<br>
        · Bluetooth: presiona <b>Conectar y Escanear</b> y elige el adaptador (ej. "OBDII", "Vgate", "iCar Pro").<br>
        · USB: solo enchufa el USB-Link a esta PC — el puente arranca solo con Windows.<br>
        &nbsp;&nbsp;¿Primera vez en esta PC? <a href="/puente-obd/instalar-puente.bat" download style="color:var(--cyan)">⬇️ Instalar el puente USB</a> (doble clic al archivo descargado, una sola vez).
      </div>
      <div id="obd-result"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn btn-ghost" onclick="Modulos.diagnostico_obd._cerrarEscaneo()">Cancelar</button>
        <button class="btn btn-brand" id="obd-btn-scan" onclick="Modulos.diagnostico_obd.escanear()">🔌 Conectar y Escanear</button>
        <button class="btn btn-cyan" id="obd-btn-save" style="display:none" onclick="Modulos.diagnostico_obd.guardarEscaneo()">💾 Guardar</button>
      </div>`, '640px');
  },

  _log(msg) {
    const el = document.getElementById('obd-log');
    if (el) { el.innerHTML += `<div>› ${msg}</div>`; el.scrollTop = el.scrollHeight; }
  },

  async escanear() {
    const vehId = document.getElementById('obd-veh')?.value;
    if (!vehId) { UI.toast('Selecciona el vehículo a escanear', 'error'); return; }
    this._via = document.getElementById('obd-via')?.value || 'ble';
    const btn = document.getElementById('obd-btn-scan');
    btn.disabled = true;
    const log = m => this._log(m);
    if (this._via === 'j1939') return this._escanearJ1939(vehId, btn, log);
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

      log('Leyendo códigos de falla...');
      const codConf = await this._leerDTCs('03');
      const codPend = await this._leerDTCs('07');
      log(`${codConf.length} confirmado(s), ${codPend.length} pendiente(s)`);

      let freeze = null;
      if (codConf.length || mil) {
        log('Leyendo freeze frame (datos al momento de la falla)...');
        freeze = await this._leerFreeze();
      }

      /* Descripciones: diccionario local ES → catálogo BD (3,000+ códigos) → rango SAE */
      const cat = await DB.getDTCCatalogo([...codConf, ...codPend, freeze?.dtc].filter(Boolean));
      let dtcs = codConf.map(c => ({ codigo:c, desc:this._descDTC(c, cat) }));
      let pend = codPend.map(c => ({ codigo:c, desc:this._descDTC(c, cat) }));
      dtcs = await this._enriquecerDTCs(dtcs, vehId);
      pend = await this._enriquecerDTCs(pend, vehId);
      if (freeze) freeze.desc = this._descDTC(freeze.dtc, cat);

      log('Detectando sensores soportados...');
      this._sop = await this._leerSoportados();
      log(`Leyendo ${this._sop.length || this._BASICOS.length} sensores en vivo...`);
      const datos = await this._leerVivo(this._sop);

      let nhtsa = null;
      if (vin) {
        log('Consultando VIN en base de datos NHTSA...');
        nhtsa = await this._decodeVIN(vin);
        log(nhtsa ? `VIN identificado: <b>${nhtsa.marca} ${nhtsa.modelo||''} ${nhtsa.anio||''}</b>` : 'VIN sin coincidencias en NHTSA');
      }

      this._scan = { vehiculo_id: vehId, vin, protocolo, adaptador: nombre, mil,
                     dtcs, dtcs_pendientes: pend, datos, freeze_frame: freeze,
                     voltaje: datos.volt || null, nhtsa };
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
      ${s.nhtsa ? `<div class="card" style="padding:10px;margin-top:8px;border-left:3px solid var(--cyan)">
        <b style="font-size:12px">🌐 IDENTIFICADO POR VIN (NHTSA)</b>
        <div style="font-size:13px;margin-top:4px">${s.nhtsa.marca} ${s.nhtsa.modelo||''} ${s.nhtsa.anio||''}
          ${s.nhtsa.motor?` · Motor ${s.nhtsa.motor}`:''} ${s.nhtsa.combustible?` · ${s.nhtsa.combustible}`:''}
          ${s.nhtsa.pais?` · Fab. ${s.nhtsa.pais}`:''}</div>
        <button class="btn btn-sm btn-cyan" style="margin-top:6px" onclick="Modulos.diagnostico_obd.aplicarVIN()">📋 Completar ficha del vehículo</button>
      </div>` : ''}
      ${this._tablaDTCs(s)}
      <div id="obd-campanas"></div>
      ${this._freezeHTML(s.freeze_frame)}
      <div class="card" style="padding:10px;margin-top:8px">
        <b style="font-size:12px">DATOS EN VIVO (${Object.keys(s.datos||{}).length} sensores)</b>
        <div id="obd-mon-sel" style="margin-top:6px;display:none"></div>
        <div id="obd-vivo" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-top:6px;font-size:13px">
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
  },

  _freezeHTML(fz) {
    if (!fz) return '';
    return `<div class="card" style="padding:10px;margin-top:8px;border-left:3px solid var(--amber)">
      <b style="font-size:12px">📸 FREEZE FRAME — al momento de la falla ${fz.dtc}${fz.desc?` (${fz.desc})`:''}</b>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-top:6px;font-size:13px">
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
    return `Analiza este escaneo OBD-II y explica en español sencillo para un mecánico: ` +
      `causa probable de cada código, cómo confirmar el diagnóstico y la reparación recomendada con su urgencia.\n` +
      `Vehículo: ${veh ? `${veh.marca||''} ${veh.modelo||''} ${veh.anio||''} placa ${veh.placa||''}` : 'no especificado'}\n` +
      `VIN: ${s.vin||'—'}\nCheck Engine: ${s.mil?'ENCENDIDO':'apagado'}\n` +
      `Códigos confirmados: ${(s.dtcs||[]).map(d=>`${d.codigo} (${d.desc})`).join('; ')||'ninguno'}\n` +
      `Códigos pendientes: ${(s.dtcs_pendientes||[]).map(d=>d.codigo).join('; ')||'ninguno'}\n` +
      `Freeze frame: ${s.freeze_frame?JSON.stringify(s.freeze_frame):'—'}\nDatos en vivo: ${dat||'—'}`;
  },

  async analizarIA(idGuardado) {
    const s = idGuardado ? this._data.find(x => x.id === idGuardado) : this._scan;
    const el = document.getElementById('obd-ia');
    if (!s || !el) return;
    el.innerHTML = `<div class="card" style="padding:10px;margin-top:8px">⏳ Nexus está analizando el escaneo...</div>`;
    const veh = idGuardado ? s.vehiculos : this._vehiculos.find(v => v.id === s.vehiculo_id);
    const r = await IA.tecnico(this._promptIA(s, veh));
    if (!r.ok) { el.innerHTML = `<div class="card" style="padding:10px;margin-top:8px;color:var(--red)">⚠️ ${r.error}</div>`; return; }
    s.ia_analisis = r.respuesta;
    if (idGuardado) await DB.upsertDiagnosticoOBD({ id: idGuardado, ia_analisis: r.respuesta });  // cachear: 1 sola consulta por escaneo
    el.innerHTML = this._iaHTML(r.respuesta);
  },

  _iaHTML(texto) {
    if (!texto) return '';
    const cuerpo = (typeof IA !== 'undefined' && IA._formatear) ? IA._formatear(texto)
      : `<div style="white-space:pre-wrap">${texto}</div>`;
    return `<div class="card" style="padding:10px;margin-top:8px;border-left:3px solid var(--brand,#3B82F6)">
      <b style="font-size:12px">🤖 ANÁLISIS DE NEXUS</b>
      <div style="font-size:13px;margin-top:6px">${cuerpo}</div>
    </div>`;
  },

  _tablaDTCs(s) {
    const filas = [
      ...s.dtcs.map(x => ({ ...x, tipo:'Confirmado', color:'red' })),
      ...(s.dtcs_pendientes||[]).map(x => ({ ...x, tipo:'Pendiente', color:'amber' })),
    ];
    return `<div class="card" style="padding:10px;margin-top:8px">
      <b style="font-size:12px">CÓDIGOS DE FALLA (DTC)</b>
      ${filas.length ? `<table class="table" style="margin-top:6px;font-size:12px">
        <thead><tr><th>Código</th><th>Descripción</th><th>Estado</th></tr></thead>
        <tbody>${filas.map(f=>`<tr><td><b style="font-family:monospace">${f.codigo}</b></td><td>${f.desc}${f.origen ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">${f.origen}${f.fuente ? ` · ${f.fuente}` : ''}</div>` : ''}</td><td><span class="badge badge-${f.color}">${f.tipo}</span></td></tr>`).join('')}</tbody>
      </table>` : '<p style="color:var(--green);margin:6px 0 0">✅ Sin códigos de falla</p>'}
    </div>`;
  },

  /* Mapa clave→[etiqueta, unidad] de todos los sensores */
  _labels() {
    const labels = { volt: ['Batería',''], ...this._LBLX };
    Object.values(this._PIDS).forEach(p => labels[p.k] = [p.l, p.u]);
    return labels;
  },

  /* Definición de un sensor del monitor: PID OBD-II o clave J1939 */
  _defSensor(p) {
    if (this._via === 'j1939') { const lb = this._labels()[p]; return lb ? { k: p, l: lb[0], u: lb[1] } : null; }
    return this._PIDS[p];
  },

  _sensoresMonitor() {
    if (this._sop && this._sop.length) return this._sop;
    return this._via === 'j1939' ? Object.keys((this._j39 && this._j39.datos) || {}) : this._BASICOS;
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
      .map(i => `<div style="background:var(--bg2,#0b1220);border-radius:6px;padding:6px 8px">
        <div style="font-size:10px;color:var(--text3)">${i[0]}</div><b>${i[1]}${i[2]}</b></div>`).join('')
      || '<span style="color:var(--text3)">Sin datos (¿motor apagado?)</span>';
  },

  /* ═══════════ MONITOR EN VIVO (sensores seleccionables + gráficas + grabación) ═══════════ */
  _selMon: null, _hist: null, _rec: null,

  _spark(vals) {
    if (!vals || vals.length < 2 || typeof Charts === 'undefined') return '';
    const paso = Math.ceil(vals.length / 100);                    // downsample para SVG liviano
    const ds = paso > 1 ? vals.filter((_, i) => i % paso === 0) : vals;
    return Charts.sparkline({ valores: ds }).replace('<svg ', '<svg style="width:100%;height:100%" ');
  },

  _chipsMonitor() {
    return this._sensoresMonitor().map(p => {
      const def = this._defSensor(p), on = this._selMon.includes(p);
      if (!def) return '';
      return `<label style="font-size:11px;display:inline-flex;align-items:center;gap:3px;background:var(--bg2,#0b1220);border-radius:12px;padding:3px 8px;cursor:pointer;margin:0 4px 4px 0;opacity:${on?1:.55}">
        <input type="checkbox" ${on?'checked':''} onchange="Modulos.diagnostico_obd._toggleSel('${p}',this.checked)"> ${def.l}</label>`;
    }).join('');
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
      const vals = this._hist[def.k] || [];
      const v = vals.length ? vals[vals.length - 1] : '—';
      return `<div style="background:var(--bg2,#0b1220);border-radius:6px;padding:6px 8px">
        <div style="font-size:10px;color:var(--text3)">${def.l}</div>
        <b>${v}${def.u}</b>
        <div style="height:26px;margin-top:2px">${this._spark(vals)}</div>
      </div>`;
    }).join('') || '<span style="color:var(--text3)">Marca al menos un sensor arriba</span>';
  },

  async toggleLive() {
    if (this._liveTimer) { this._stopLive(); return; }
    if (!this._listo) { UI.toast('Adaptador desconectado — vuelve a escanear', 'error'); return; }
    const disp = this._sensoresMonitor();
    const basicos = this._via === 'j1939' ? ['rpm','temp','vel'] : ['0C','05','0D'];
    if (!this._selMon) this._selMon = disp.filter(p => basicos.includes(p));
    if (!this._selMon.length) this._selMon = disp.slice(0, 3);
    this._hist = {};
    const btn = document.getElementById('obd-btn-live'); if (btn) btn.textContent = '⏸ Detener';
    const rec = document.getElementById('obd-btn-rec');  if (rec) rec.style.display = '';
    const sel = document.getElementById('obd-mon-sel');
    if (sel) { sel.style.display = ''; sel.innerHTML = this._chipsMonitor(); }
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
    return `<div class="card" style="padding:10px;margin-top:8px;border-left:3px solid var(--cyan)">
      <b style="font-size:12px">📈 GRABACIÓN DE SESIÓN (${g.muestras.length} muestras · ${g.seg || '?'} s)</b>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:6px;font-size:12px">
        ${stats.map(s => `<div style="background:var(--bg2,#0b1220);border-radius:6px;padding:6px 8px">
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
        if (this._j39) { this._j39.dm1 = null; this._j39.dm2 = null; }
      } else await this._cmd('04', 8000);
      if (this._scan) this._scan.dtcs_borrados = true;
      this._log(this._via === 'j1939' ? '🧹 Códigos borrados (DM11 + DM3) ✓' : '🧹 Códigos borrados (modo 04) ✓');
      UI.toast('Códigos borrados ✓');
    } catch (e) { UI.toast('No se pudo borrar: ' + e.message, 'error'); }
  },

  async guardarEscaneo() {
    if (!this._scan) return;
    this._stopLive();
    const { nhtsa, ...fila } = this._scan;   // nhtsa no se persiste (se aplica a la ficha del vehículo)
    const { error } = await DB.upsertDiagnosticoOBD(fila);
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
        ${this._tablaDTCs(d)}
        ${this._freezeHTML(d.freeze_frame)}
        <div class="card" style="padding:10px;margin-top:8px">
          <b style="font-size:12px">DATOS AL MOMENTO DEL ESCANEO</b>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-top:6px">${this._vivoHTML(d.datos||{})}</div>
        </div>
        ${this._grabHTML(d.grabacion)}
        <div id="obd-ia">${this._iaHTML(d.ia_analisis)}</div>
        ${d.notas ? `<p style="margin-top:8px"><b>Notas:</b> ${d.notas}</p>` : ''}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        ${!d.ia_analisis && (typeof moduloEnPlan !== 'function' || moduloEnPlan('ia')) ? `<button class="btn btn-cyan" onclick="Modulos.diagnostico_obd.analizarIA('${d.id}')">🤖 Analizar con IA</button>` : ''}
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        ${Modulos.btnAccion('imprimir', `Modulos.diagnostico_obd.imprimir('${d.id}')`, { label:'🖨 Imprimir' })}
      </div>`, '680px');
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
