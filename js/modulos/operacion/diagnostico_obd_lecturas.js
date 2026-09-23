/* NexusPro — Diagnóstico OBD · Lecturas OBD-II: VIN, códigos (modo 03/07/0A), readiness, norma, calibración, equipamiento, comparación con la visita anterior, NHTSA, boletines y campañas.

   Es parte de Modulos.diagnostico_obd: el objeto se define en
   diagnostico_obd.js (núcleo y conexión) y cada parte le agrega sus métodos.
   Se dividió el 2026-09-22 porque el archivo único pasaba de 9.000 líneas.
   defineProperties + getOwnPropertyDescriptors (y no Object.assign) para que
   los get/set viajen como accesores y no como el valor del momento. */
(() => {
  const M = Modulos.diagnostico_obd;
  Object.defineProperties(M, Object.getOwnPropertyDescriptors({

  /* Limpia una respuesta a solo líneas hex (quita prefijos de trama multilinea '0:','1:'...) */
  _hexLines(resp) {
    return resp.split(/[\r\n]+/)
      .map(l => l.trim().replace(/^[0-9A-F]{1,2}:/i, '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase())
      .filter(l => l.length >= 2);
  },

  /* El VIN es la base del escaneo. El Picanto lo dio a las 00:51 y NO a las
     00:27 (2026-09-23): se pedía UNA vez y, si el módulo tardaba o contestaba
     "SEARCHING…", quedaba vacío sin decir nada. Ahora se reintenta, y solo se
     acepta un VIN completo de 17: uno a medias se veía como VIN y no lo era. */
  async _leerVIN() {
    for (let intento = 0; intento < 3; intento++) {
      try {
        const hex = this._hexLines(await this._cmd('0902', 8000)).join('');
        const i = hex.indexOf('4902');
        if (i >= 0) {
          let ascii = '';
          for (let p = i + 6; p + 1 < hex.length; p += 2) {   // +6: salta 4902 + nº de secuencia
            const ch = String.fromCharCode(parseInt(hex.substr(p, 2), 16));
            if (/[A-HJ-NPR-Z0-9]/.test(ch)) ascii += ch;      // charset VIN válido
          }
          const m = ascii.match(/[A-HJ-NPR-Z0-9]{17}/);
          if (m) return m[0];
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 400 * (intento + 1)));
    }
    return null;
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
            txt:`<b>La calibración del ECU no coincide con la de sus iguales.</b> ${cuenta[dominante]} de ${total} ${UI.esc(v.marca)} ${UI.esc(v.modelo)} del taller traen <code>${UI.esc(dominante)}</code> y este trae <code>${UI.esc(cvn)}</code>. Señal de computadora reprogramada.` });
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
              txt:`<b>No declara el monitor de ${UI.esc(nombre)}</b>, que ${cuenta[nombre]} de ${conLectura} ${UI.esc(v.marca)} ${UI.esc(v.modelo)} del taller sí declaran. Señal de sistema eliminado.` });
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
            txt:`<b>${UI.esc(k)} no respondió</b>, y ${cuenta[k]} de ${conModulos} ${UI.esc(v.marca)} ${UI.esc(v.modelo)} del taller sí lo tienen. Puede estar dañado, desconectado o sin alimentación — verificar antes de darlo por ausente.` });
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
    '0C': { k:'rpm',       l:'RPM',                    u:'',      f:b=>Math.round((b[0]*256+b[1])/4), r:[600,1000], rc:'en ralentí', cat:'motor' },
    '0D': { k:'vel',       l:'Velocidad',              u:' km/h', f:b=>b[0], cat:'chassis' },
    '05': { k:'temp',      l:'Temp. motor',            u:' °C',   f:b=>b[0]-40, r:[80,105], rc:'motor caliente', a:true, cat:'temp' },
    '04': { k:'carga',     l:'Carga motor',            u:' %',    f:b=>Math.round(b[0]*100/255), r:[15,35], rc:'en ralentí', cat:'motor' },
    '11': { k:'acel',      l:'Acelerador',             u:' %',    f:b=>Math.round(b[0]*100/255), r:[0,20], rc:'pie fuera', cat:'motor' },
    '0F': { k:'temp_adm',  l:'Temp. admisión',         u:' °C',   f:b=>b[0]-40, r:[10,60], cat:'temp' },
    '2F': { k:'comb',      l:'Combustible',            u:' %',    f:b=>Math.round(b[0]*100/255), cat:'mezcla' },
    '06': { k:'stft1',     l:'Ajuste combustible corto', u:' %',  f:b=>Math.round((b[0]/1.28-100)*10)/10, r:[-10,10], a:true, cat:'mezcla' },
    '07': { k:'ltft1',     l:'Ajuste combustible largo', u:' %',  f:b=>Math.round((b[0]/1.28-100)*10)/10, r:[-10,10], a:true, cat:'mezcla' },
    '0A': { k:'pres_comb', l:'Presión de combustible', u:' kPa',  f:b=>b[0]*3, cat:'mezcla' },
    '0B': { k:'map',       l:'Presión admisión (MAP)', u:' kPa',  f:b=>b[0], r:[25,45], rc:'en ralentí', cat:'motor' },
    '0E': { k:'avance',    l:'Avance de encendido',    u:' °',    f:b=>b[0]/2-64, r:[0,25], rc:'en ralentí', cat:'motor' },
    '10': { k:'maf',       l:'Flujo de aire (MAF)',    u:' g/s',  f:b=>Math.round((b[0]*256+b[1])/10)/10, r:[2,6], rc:'en ralentí', cat:'motor' },
    '1F': { k:'marcha',    l:'Tiempo encendido',       u:' min',  f:b=>Math.round((b[0]*256+b[1])/60), cat:'chassis' },
    '21': { k:'dist_mil',  l:'Km con Check Engine',    u:' km',   f:b=>b[0]*256+b[1], cat:'chassis' },
    '33': { k:'baro',      l:'Presión barométrica',    u:' kPa',  f:b=>b[0], cat:'chassis' },
    '42': { k:'volt_ecu',  l:'Voltaje ECU',            u:' V',    f:b=>Math.round((b[0]*256+b[1])/10)/100, r:[13.2,14.8], rc:'motor encendido', a:true, cat:'elec' },
    '46': { k:'temp_amb',  l:'Temp. ambiente',         u:' °C',   f:b=>b[0]-40, cat:'temp' },
    '5C': { k:'temp_aceite',l:'Temp. aceite',          u:' °C',   f:b=>b[0]-40, r:[80,110], rc:'motor caliente', a:true, cat:'temp' },
    '5E': { k:'tasa_comb', l:'Consumo',                u:' L/h',  f:b=>Math.round((b[0]*256+b[1])/20*10)/10, cat:'mezcla' },
    /* ── agregados 2026-07-27: el Picanto soportaba 38 PIDs y se leían 13 ── */
    '14': { k:'o2_b1s1',   l:'Sonda lambda B1S1',      u:' V',    f:b=>Math.round(b[0]/200*1000)/1000, r:[0.1,0.9], rc:'debe oscilar, no quedarse fija', a:true, cat:'mezcla' },
    '15': { k:'o2_b1s2',   l:'Sonda lambda B1S2',      u:' V',    f:b=>Math.round(b[0]/200*1000)/1000, r:[0.4,0.8], rc:'post-catalizador: estable', cat:'mezcla' },
    '44': { k:'lambda',    l:'Relación de mezcla (λ)', u:'',      f:b=>Math.round((b[0]*256+b[1])*2/65536*1000)/1000, r:[0.97,1.03], a:true, cat:'mezcla' },
    '3C': { k:'temp_cat',  l:'Temp. catalizador',      u:' °C',   f:b=>Math.round(((b[0]*256+b[1])/10-40)*10)/10, r:[400,800], rc:'caliente y en marcha', cat:'temp' },
    '43': { k:'carga_abs', l:'Carga absoluta',         u:' %',    f:b=>Math.round((b[0]*256+b[1])*100/255), r:[15,35], rc:'en ralentí', cat:'motor' },
    '2E': { k:'evap',      l:'Purga EVAP (cánister)',  u:' %',    f:b=>Math.round(b[0]*100/255), cat:'mezcla' },
    '45': { k:'acel_rel',  l:'Acelerador relativo',    u:' %',    f:b=>Math.round(b[0]*100/255), r:[0,20], rc:'pie fuera', cat:'motor' },
    '47': { k:'acel_abs',  l:'Acelerador absoluto B',  u:' %',    f:b=>Math.round(b[0]*100/255), cat:'motor' },
    '49': { k:'pedal_d',   l:'Pedal acelerador D',     u:' %',    f:b=>Math.round(b[0]*100/255), cat:'motor' },
    '4A': { k:'pedal_e',   l:'Pedal acelerador E',     u:' %',    f:b=>Math.round(b[0]*100/255), cat:'motor' },
    '4C': { k:'acel_cmd',  l:'Acelerador comandado',   u:' %',    f:b=>Math.round(b[0]*100/255), cat:'motor' },
    '56': { k:'ltft2s',    l:'Ajuste sonda post-cat',  u:' %',    f:b=>Math.round((b[0]/1.28-100)*10)/10, r:[-10,10], a:true, cat:'mezcla' },
    '30': { k:'warmups',   l:'Calentamientos desde borrado', u:'', f:b=>b[0], cat:'chassis' },
    '31': { k:'dist_borr', l:'Km desde borrado',       u:' km',   f:b=>b[0]*256+b[1], cat:'chassis' },
  },
  _OEM_PIDS: {
    /* Transmisión Automática (TCM) */
    'temp_atf':        { k:'temp_atf',        l:'Temp. Aceite Transmisión (ATF)', u:' °C',   r:[70, 95],   rc:'temp ideal 75-90°C (máx 105°C)', a:true, cat:'motor' },
    'rpm_turbina':     { k:'rpm_turbina',     l:'Velocidad Eje Entrada / Turbina', u:' RPM', r:[600, 3000],rc:'coincide con RPM en D', cat:'motor' },
    'rpm_salida':      { k:'rpm_salida',      l:'Velocidad Eje Salida (TCM)',     u:' RPM', r:[0, 3000],  rc:'proporcional a velocidad km/h', cat:'motor' },
    'marcha_tcm':      { k:'marcha_tcm',      l:'Marcha Seleccionada (TCM)',      u:'',     r:[0, 8],     rc:'0=P, 1=R, 2=N, 3=D (1-8ª)', cat:'motor' },
    'tcc_lockup':      { k:'tcc_lockup',      l:'Convertidor de Par (TCC Lockup)',u:' %',   r:[0, 100],   rc:'0% libre / 100% acoplado', cat:'motor' },
    'presion_linea':   { k:'presion_linea',   l:'Presión de Línea (TCM)',         u:' bar', r:[3.5, 12.0],rc:'presión hidráulica TCM', cat:'motor' },

    /* Presión y Temp de Neumáticos (TPMS) */
    'presion_tpms_fl': { k:'presion_tpms_fl', l:'Presión Neumático Del. Izquierdo (FL)', u:' PSI', r:[30.0, 35.0], rc:'frío (32-35 PSI)', a:true, cat:'chassis' },
    'presion_tpms_fr': { k:'presion_tpms_fr', l:'Presión Neumático Del. Derecho (FR)',   u:' PSI', r:[30.0, 35.0], rc:'frío (32-35 PSI)', a:true, cat:'chassis' },
    'presion_tpms_rl': { k:'presion_tpms_rl', l:'Presión Neumático Tras. Izquierdo (RL)', u:' PSI', r:[30.0, 35.0], rc:'frío (32-35 PSI)', a:true, cat:'chassis' },
    'presion_tpms_rr': { k:'presion_tpms_rr', l:'Presión Neumático Tras. Derecho (RR)',   u:' PSI', r:[30.0, 35.0], rc:'frío (32-35 PSI)', a:true, cat:'chassis' },
    'temp_tpms_fl':    { k:'temp_tpms_fl',    l:'Temp. Neumático Del. Izquierdo (FL)', u:' °C',  r:[15, 60],     rc:'rodaje normal (<65°C)', cat:'temp' },
    'temp_tpms_fr':    { k:'temp_tpms_fr',    l:'Temp. Neumático Del. Derecho (FR)',   u:' °C',  r:[15, 60],     rc:'rodaje normal (<65°C)', cat:'temp' },
    'temp_tpms_rl':    { k:'temp_tpms_rl',    l:'Temp. Neumático Tras. Izquierdo (RL)',u:' °C',  r:[15, 60],     rc:'rodaje normal (<65°C)', cat:'temp' },
    'temp_tpms_rr':    { k:'temp_tpms_rr',    l:'Temp. Neumático Tras. Derecho (RR)',  u:' °C',  r:[15, 60],     rc:'rodaje normal (<65°C)', cat:'temp' },
    'bat_tpms':        { k:'bat_tpms',        l:'Estado Batería Sensores TPMS',        u:'',     r:null,         rc:'OK / Normal', cat:'chassis' },

    /* Dirección Electrónica (MDPS / EPS) */
    'angulo_direccion':{ k:'angulo_direccion',l:'Ángulo de Dirección (MDPS/EPS)',u:' °',   r:[-30, 30],  rc:'en línea recta', cat:'chassis' },
    'torque_conductor':{ k:'torque_conductor',l:'Torque del Conductor al Volante',u:' Nm',  r:[-2.0, 2.0],rc:'sin fuerza manual', cat:'chassis' },
    'corriente_eps':   { k:'corriente_eps',   l:'Corriente Motor Dirección EPS',  u:' A',   r:[0.0, 15.0],rc:'ralentí en recta (<3A)', cat:'elec' },

    /* Climatización & Carrocería (FATC / BCM / ACU) */
    'temp_evaporador': { k:'temp_evaporador', l:'Temp. Evaporador A/C (FATC)',    u:' °C',  r:[2.0, 8.0], rc:'A/C encendido', cat:'temp' },
    'presion_ac':      { k:'presion_ac',      l:'Presión Gas Refrigerante A/C',  u:' PSI', r:[120, 220], rc:'A/C en marcha', cat:'temp' },
    'volt_srs':        { k:'volt_srs',        l:'Voltaje Módulo Airbag (SRS/ACU)',u:' V',   r:[12.0, 15.0],rc:'alimentación SRS', cat:'elec' },
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
      /* Cada 3 y con el nombre del sensor: avisando solo cada 6, un sensor que
         no contesta deja la pantalla quieta 9 segundos y parece congelada. Y
         cuando de verdad se traba, el nombre dice EN CUAL se trabo. */
      if (log && ++n % 3 === 0) log(`&nbsp;&nbsp;… ${n} de ${lista.length} (${def.n || def.k})`);
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

  /* El índice de boletines viene de NHTSA, así que trae el nombre con que el
     vehículo se vendió en EE.UU. En Guatemala circula el MISMO carro con el
     nombre de otro mercado: la Rogue es la X-Trail, la NP300 es la Frontier.
     Sin esta tabla el taller escribe el nombre de acá y se queda sin boletines
     — que es peor que no tenerlos, porque parece que el modelo no tiene.

     Solo van equivalencias donde es literalmente la misma plataforma. Un
     boletín de otro vehículo manda al mecánico por el camino equivocado, así
     que ante la duda NO se agrega (por eso no está Tracker→Trailblazer: el
     Tracker viejo era el Vitara y el TrailBlazer 2002-2009 otra camioneta).
     El filtro por año de _tsbBuscar tapa el resto: si la equivalencia solo
     vale para cierta generación, los años que no cuadran salen solos. */
  _tsbAliasMercado: {
    'NISSAN':     { 'X-TRAIL':'ROGUE', 'QASHQAI':'ROGUE-SPORT',
                    'NAVARA':'FRONTIER', 'NP300':'FRONTIER' },
    'MITSUBISHI': { 'ASX':'OUTLANDER-SPORT' },   // ASX = RVR = Outlander Sport
    'KIA':        { 'CERATO':'FORTE' },
    'SUZUKI':     { 'VITARA':'GRAND-VITARA' },
    'ISUZU':      { 'ELF':'N-SERIES', 'FORWARD':'F-SERIES' }
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
    /* Nombre de otro mercado: se traduce antes de rendirse. Se acepta tanto
       "X-Trail" como "X-Trail 2.5 SL", y solo si el destino existe en el índice
       (si NHTSA cambia el nombre, preferimos quedarnos sin boletín que servir
       uno inventado). */
    const alias = this._tsbAliasMercado[marcaSlug];
    if (alias) {
      const k = Object.keys(alias)
        .filter(a => mo === a || mo.startsWith(a + '-'))
        .sort((a, b) => b.length - a.length)[0];
      if (k && lista.includes(alias[k])) return alias[k];
    }
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
  }
  }));
})();
