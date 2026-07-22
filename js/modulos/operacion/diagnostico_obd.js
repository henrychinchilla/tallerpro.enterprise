/* NexusPro — Diagnóstico OBD-II (adaptadores ELM327/Vgate/OBDLink/STN1110 vía Bluetooth LE)
   Todos hablan el set de comandos AT del ELM327 + PIDs OBD-II estándar, así que
   una sola capa sirve para todos. Solo adaptadores BLE (Web Bluetooth no alcanza
   Bluetooth Classic ni WiFi; eso requeriría app nativa). */
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

  /* Envía un comando y espera la respuesta completa (termina en '>') */
  async _cmd(c, timeout = 6000) {
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

  _desconectar() {
    this._stopLive();
    try { this._dev?.gatt?.disconnect(); } catch (_) {}
    this._dev = this._char = null;
  },

  /* ═══════════ DESCRIPCIONES DTC EN ESPAÑOL ═══════════ */
  _DTCS: {
    P0011:'Sincronización del árbol de levas "A" adelantada (Banco 1)', P0016:'Correlación cigüeñal-árbol de levas (Banco 1 Sensor A)',
    P0030:'Circuito calentador sensor O2 (B1 S1)', P0031:'Calentador sensor O2 señal baja (B1 S1)',
    P0087:'Presión de riel de combustible muy baja', P0088:'Presión de riel de combustible muy alta',
    P0100:'Circuito del sensor MAF (flujo de aire)', P0101:'Rango/desempeño del sensor MAF', P0102:'Señal baja del sensor MAF', P0103:'Señal alta del sensor MAF',
    P0105:'Circuito del sensor MAP (presión absoluta)', P0106:'Rango/desempeño del sensor MAP',
    P0110:'Circuito sensor temperatura de aire de admisión', P0113:'Señal alta temp. aire de admisión',
    P0115:'Circuito sensor temperatura de refrigerante', P0116:'Rango/desempeño temp. refrigerante', P0117:'Señal baja temp. refrigerante', P0118:'Señal alta temp. refrigerante',
    P0120:'Circuito sensor posición del acelerador (TPS)', P0121:'Rango/desempeño del TPS', P0122:'Señal baja del TPS', P0123:'Señal alta del TPS',
    P0125:'Temperatura insuficiente para control de combustible',
    P0128:'Termostato — refrigerante no alcanza temperatura',
    P0130:'Circuito sensor O2 (B1 S1)', P0131:'Voltaje bajo sensor O2 (B1 S1)', P0133:'Respuesta lenta sensor O2 (B1 S1)', P0134:'Sensor O2 sin actividad (B1 S1)',
    P0135:'Calentador sensor O2 (B1 S1)', P0136:'Circuito sensor O2 (B1 S2)', P0141:'Calentador sensor O2 (B1 S2)',
    P0171:'Mezcla muy pobre (Banco 1)', P0172:'Mezcla muy rica (Banco 1)', P0174:'Mezcla muy pobre (Banco 2)', P0175:'Mezcla muy rica (Banco 2)',
    P0200:'Circuito de inyectores', P0201:'Circuito inyector cilindro 1', P0202:'Circuito inyector cilindro 2', P0203:'Circuito inyector cilindro 3', P0204:'Circuito inyector cilindro 4',
    P0300:'Fallo de encendido múltiple/aleatorio (misfire)', P0301:'Fallo de encendido cilindro 1', P0302:'Fallo de encendido cilindro 2', P0303:'Fallo de encendido cilindro 3',
    P0304:'Fallo de encendido cilindro 4', P0305:'Fallo de encendido cilindro 5', P0306:'Fallo de encendido cilindro 6',
    P0325:'Circuito sensor de detonación (knock)', P0335:'Circuito sensor posición cigüeñal (CKP)', P0340:'Circuito sensor posición árbol de levas (CMP)',
    P0400:'Flujo de recirculación de gases EGR', P0401:'Flujo EGR insuficiente', P0402:'Flujo EGR excesivo',
    P0403:'Circuito de control EGR', P0420:'Eficiencia del catalizador bajo el umbral (Banco 1)', P0430:'Eficiencia del catalizador bajo el umbral (Banco 2)',
    P0440:'Sistema evaporativo EVAP', P0441:'Flujo de purga EVAP incorrecto', P0442:'Fuga pequeña en sistema EVAP', P0443:'Circuito válvula de purga EVAP',
    P0446:'Circuito de venteo EVAP', P0455:'Fuga grande en sistema EVAP', P0456:'Fuga muy pequeña en sistema EVAP',
    P0500:'Sensor de velocidad del vehículo (VSS)', P0505:'Sistema de control de ralentí', P0506:'Ralentí más bajo de lo esperado', P0507:'Ralentí más alto de lo esperado',
    P0562:'Voltaje del sistema bajo (alternador/batería)', P0563:'Voltaje del sistema alto',
    P0601:'Memoria de la computadora (ECU) — checksum', P0603:'Memoria KAM de la ECU', P0605:'Memoria ROM de la ECU',
    P0700:'Sistema de control de la transmisión', P0705:'Circuito sensor de rango de transmisión', P0715:'Circuito sensor de turbina',
    P0720:'Circuito sensor de velocidad de salida', P0730:'Relación de cambio incorrecta', P0740:'Circuito embrague convertidor de torque',
    P0741:'Convertidor de torque atascado', P0750:'Solenoide de cambio A', P0755:'Solenoide de cambio B',
    C0035:'Sensor de velocidad rueda del. izq.', C0040:'Sensor de velocidad rueda del. der.',
    B0001:'Despliegue de bolsa de aire del conductor',
    U0100:'Sin comunicación con la ECU del motor', U0101:'Sin comunicación con la TCM (transmisión)', U0121:'Sin comunicación con el módulo ABS', U0155:'Sin comunicación con el tablero',
  },
  _descDTC(c, cat) {
    if (this._DTCS[c]) return this._DTCS[c];
    const fila = cat && cat[c];
    if (fila?.descripcion_es) return fila.descripcion_es;
    if (fila?.descripcion_en) return fila.descripcion_en;
    const rangos = { P00:'Control de mezcla aire/combustible', P01:'Medición de aire/combustible', P02:'Circuito de inyección',
      P03:'Sistema de encendido / fallos de encendido', P04:'Control de emisiones (EGR/EVAP/catalizador)', P05:'Ralentí y velocidad del vehículo',
      P06:'Computadora (ECU) y salidas auxiliares', P07:'Transmisión', P08:'Transmisión', P09:'Transmisión',
      C:'Chasis (ABS/frenos/suspensión/dirección)', B:'Carrocería (airbag/cinturones/cerraduras)', U:'Red de comunicación entre módulos' };
    const g = rangos[c.slice(0,3)] || rangos[c[0]] || 'Código de diagnóstico';
    const fab = (c[1] === '1' || c[1] === '2' || c[1] === '3') && c[0] === 'P' ? ' (específico del fabricante)' : '';
    return g + fab + ' — consultar manual del fabricante';
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
          <p class="page-subtitle">// Escáner ELM327 / Vgate / OBDLink por Bluetooth</p>
        </div>
        <div class="page-actions">
          <select class="form-select" style="width:140px" onchange="Modulos.diagnostico_obd._mes=+this.value;Modulos.diagnostico_obd.render()">
            ${meses.map((m,i)=>`<option value="${i+1}" ${i+1===this._mes?'selected':''}>${m}</option>`).join('')}
          </select>
          <select class="form-select" style="width:90px" onchange="Modulos.diagnostico_obd._anio=+this.value;Modulos.diagnostico_obd.render()">
            ${anios.map(a=>`<option ${a===this._anio?'selected':''}>${a}</option>`).join('')}
          </select>
          <button class="btn btn-ghost" onclick="Modulos.diagnostico_obd.render()">↻ Actualizar</button>
          ${puedeEditar ? `<button class="btn btn-brand" onclick="Modulos.diagnostico_obd.modalEscanear()">📡 Nuevo Escaneo</button>` : ''}
        </div>
      </div>
      <div class="page-body">
        ${!navigator.bluetooth ? `<div class="card" style="border-left:3px solid var(--amber);padding:12px;margin-bottom:12px">
          ⚠️ Este navegador no soporta Bluetooth. Para escanear usa <b>Chrome o Edge en Android</b> (o la app NexusPro) o una PC con Bluetooth. Aquí puedes consultar el historial.
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
      <div id="obd-log" style="background:var(--bg2,#0b1220);border-radius:8px;padding:10px;font-family:monospace;font-size:12px;min-height:70px;max-height:180px;overflow:auto;margin:10px 0">
        Conecta el adaptador al puerto OBD-II del vehículo y enciende el switch.<br>
        Luego presiona <b>Conectar y Escanear</b> y elige el adaptador (ej. "OBDII", "Vgate", "iCar Pro").
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
    const btn = document.getElementById('obd-btn-scan');
    btn.disabled = true;
    const log = m => this._log(m);
    try {
      log('Buscando adaptador Bluetooth...');
      const nombre = await this._conectar();
      log(`Conectado a <b>${nombre}</b> ✓`);
      const protocolo = await this._init(log);
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
      const dtcs = codConf.map(c => ({ codigo:c, desc:this._descDTC(c, cat) }));
      const pend = codPend.map(c => ({ codigo:c, desc:this._descDTC(c, cat) }));
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
      ${this._freezeHTML(s.freeze_frame)}
      <div class="card" style="padding:10px;margin-top:8px">
        <b style="font-size:12px">DATOS EN VIVO (${Object.keys(s.datos||{}).length} sensores)</b>
        <div id="obd-vivo" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-top:6px;font-size:13px">
          ${this._vivoHTML(s.datos||{})}
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost" id="obd-btn-live" onclick="Modulos.diagnostico_obd.toggleLive()">▶️ Monitor en vivo</button>
          ${(s.dtcs.length || s.mil) ? `<button class="btn btn-sm btn-danger" onclick="Modulos.diagnostico_obd.borrarDTCs()">🧹 Borrar códigos</button>` : ''}
          ${(typeof moduloEnPlan !== 'function' || moduloEnPlan('ia')) ? `<button class="btn btn-sm btn-cyan" onclick="Modulos.diagnostico_obd.analizarIA()">🤖 Analizar con IA</button>` : ''}
        </div>
      </div>
      <div id="obd-ia"></div>`;
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
        <tbody>${filas.map(f=>`<tr><td><b style="font-family:monospace">${f.codigo}</b></td><td>${f.desc}</td><td><span class="badge badge-${f.color}">${f.tipo}</span></td></tr>`).join('')}</tbody>
      </table>` : '<p style="color:var(--green);margin:6px 0 0">✅ Sin códigos de falla</p>'}
    </div>`;
  },

  /* Convierte {clave:valor} a [[etiqueta, valor, unidad]] usando el catálogo de PIDs */
  _datosLista(d, excluir = []) {
    const labels = { volt: ['Batería',''] };
    Object.values(this._PIDS).forEach(p => labels[p.k] = [p.l, p.u]);
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

  async toggleLive() {
    const btn = document.getElementById('obd-btn-live');
    if (this._liveTimer) { this._stopLive(); if (btn) btn.textContent = '▶️ Monitor en vivo'; return; }
    if (!this._conectado) { UI.toast('Adaptador desconectado — vuelve a escanear', 'error'); return; }
    if (btn) btn.textContent = '⏸ Detener';
    const tick = async () => {
      if (!this._liveTimer || !this._conectado) return;
      const d = await this._leerVivo();
      if (this._scan) this._scan.datos = { ...this._scan.datos, ...d };
      const el = document.getElementById('obd-vivo');
      if (el) el.innerHTML = this._vivoHTML(this._scan?.datos || d);
      else this._stopLive();
      if (this._liveTimer) this._liveTimer = setTimeout(tick, 800);
    };
    this._liveTimer = setTimeout(tick, 0);
  },
  _stopLive() { if (this._liveTimer) { clearTimeout(this._liveTimer); this._liveTimer = null; } },

  async borrarDTCs() {
    const ok = await UI.confirmar(
      '¿Borrar los códigos de falla y apagar el Check Engine?<br><small>Los códigos volverán a aparecer si la falla persiste. Hazlo solo después de reparar.</small>',
      'Borrar códigos');
    if (!ok) return;
    try {
      await this._cmd('04', 8000);
      if (this._scan) this._scan.dtcs_borrados = true;
      this._log('🧹 Códigos borrados (modo 04) ✓');
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
      ${d.ia_analisis ? `<div class="section"><b>ANÁLISIS DE NEXUS (IA):</b><p style="white-space:pre-wrap">${d.ia_analisis}</p></div>` : ''}
      ${d.notas ? `<div class="section"><b>NOTAS DEL TÉCNICO:</b><p>${d.notas}</p></div>` : ''}
      <p style="text-align:center;color:#888;font-size:11px">Generado por NexusPro · ${new Date().toLocaleString('es-GT')}</p>
      <div style="text-align:center"><button onclick="window.print()">🖨 Imprimir</button></div>
      </body></html>`);
    win.document.close();
  },
};
