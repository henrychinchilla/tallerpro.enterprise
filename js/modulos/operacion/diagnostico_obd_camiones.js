/* NexusPro — Diagnóstico OBD · Camiones: J1939 (USB y Bluetooth) y J1587/J1708.

   Es parte de Modulos.diagnostico_obd: el objeto se define en
   diagnostico_obd.js (núcleo y conexión) y cada parte le agrega sus métodos.
   Se dividió el 2026-09-22 porque el archivo único pasaba de 9.000 líneas.
   defineProperties + getOwnPropertyDescriptors (y no Object.assign) para que
   los get/set viajen como accesores y no como el valor del momento. */
(() => {
  const M = Modulos.diagnostico_obd;
  Object.defineProperties(M, Object.getOwnPropertyDescriptors({

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
      log(`Escucha ${UI.esc(esc.motivo === 'tope' ? 'cortada por tiempo' : 'completa')} (${(esc.ms/1000).toFixed(1)} s)`);

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
      for (const b of ['obd-btn-save', 'obd-btn-print']) { const e = document.getElementById(b); if (e) e.style.display = ''; }
      btn.textContent = '↻ Re-escanear';
    } catch (e) {
      log(`<span style="color:var(--red)">✗ ${e.message}</span>`);
      UI.toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      /* El boton aparece aunque el escaneo se haya caido: es justo cuando la
         bitacora sirve. */
      const bt = document.getElementById('obd-btn-traza');
      if (bt && this._traza && this._traza.length) bt.style.display = '';
    }
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

  /* ═══ J1939 por Bluetooth — ELM327 en protocolo A ═════════════════════════
     Hasta acá, leer un camión exigía el USB-Link por RP1210: un adaptador caro
     y atado a una PC con Windows. Pero un ELM327 que declare SAE J1939 puede
     poner el transceptor en 250k / 29 bits, que es el bus del camión, y volcar
     las tramas por Bluetooth.

     Lo único que hace falta es traducir el formato. El decodificador J1939 de
     este módulo (PGN, SPN, FMI, DM1/DM2, transporte BAM, nombres de módulo)
     está escrito contra la trama que entrega el RP1210, y ya funciona. Así que
     acá NO se decodifica nada de nuevo: se le da al ELM la misma forma que trae
     el RP1210 y se reusa entero.

     Se monitorea con ATMA (todo el bus) y no con AT DM1 (sólo los códigos
     activos) a propósito: el mismo volcado alimenta además los sensores, el
     Address Claim y el VIN multipaquete. Un solo camino en vez de tres.

     Escrito contra la norma J1939-21, TODAVÍA SIN PROBAR contra un camión. */
  _j39BLE: false,

  /* Una línea del ELM327 con cabecera: 8 hex de ID de 29 bits + los datos. */
  _j39LineaELM(linea) {
    if (!this._j39 || !linea) return null;
    /* Lo que el ELM dice de sí mismo no son tramas del camión. Contarlas como
       tales inventaría módulos que no existen. */
    if (/NO DATA|ERROR|UNABLE|STOPPED|BUFFER|SEARCHING|BUS|^OK$|^>+$/i.test(linea.trim())) return null;
    const hex = linea.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    /* 8 del ID + al menos un byte de datos, y en pares. Menos que eso es eco
       del comando o ruido de la línea, no una trama. */
    if (hex.length < 10 || hex.length % 2) return null;
    const id = parseInt(hex.slice(0, 8), 16);
    if (!Number.isFinite(id)) return null;
    const prio = (id >>> 26) & 0x07;
    const dp   = (id >>> 24) & 0x03;          // EDP + DP
    const pf   = (id >>> 16) & 0xFF;          // PDU Format
    const ps   = (id >>> 8)  & 0xFF;          // PDU Specific
    const sa   = id & 0xFF;
    /* La regla que más se equivoca: con PF < 240 el mensaje va DIRIGIDO y el PS
       es la dirección del destinatario, que NO forma parte del PGN. Con PF ≥ 240
       es difusión y el PS SÍ es parte del PGN. Al revés se inventan PGNs que no
       existen y se pierden los que sí (el DM1 dirigido, entre ellos). */
    const pgn = pf < 240 ? ((dp << 16) | (pf << 8)) : ((dp << 16) | (pf << 8) | ps);
    const da  = pf < 240 ? ps : 0xFF;
    const datos = [];
    for (let p = 8; p + 1 < hex.length; p += 2) datos.push(parseInt(hex.substr(p, 2), 16));
    /* Misma forma que entrega el RP1210: [ts×4][pgn×3][prio][origen][destino][datos] */
    const trama = [0, 0, 0, 0, pgn & 0xFF, (pgn >> 8) & 0xFF, (pgn >> 16) & 0xFF, prio, sa, da, ...datos];
    this._j39Frame(trama);
    return trama;
  },

  /* Pone el adaptador a volcar el bus. Ojo: mientras dura, el ELM no contesta
     comandos — hay que cortarlo con _monFin antes de preguntar nada. */
  async _monInicio(onLinea, cmd = 'ATMA') {
    if (this._monLinea) return;
    await this._esperarTurno(cmd);
    this._buf = '';
    this._monLinea = onLinea;
    this._trazar(cmd, '(monitoreo continuo)');
    try { await this._escribirBLE(cmd + '\r'); }
    catch (e) { this._monLinea = null; throw e; }
  },

  /* Cualquier carácter corta el monitoreo del ELM327. Se le da un respiro para
     que termine de vaciar lo que traía: esas últimas tramas son datos buenos y
     descartarlas perdería justo el final de la escucha. */
  async _monFin() {
    if (!this._monLinea) return;
    try { await this._escribirBLE('\r'); } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
    this._monLinea = null;
    this._buf = '';
  },

  async _j39BleIniciar(log) {
    if (log) log('Reiniciando adaptador (ATZ)...');
    await this._cmd('ATZ', 8000);
    for (const c of ['ATE0', 'ATL0', 'ATS0']) await this._cmd(c).catch(() => {});
    /* Cabeceras SÍ: sin ellas no se sabe de qué módulo vino cada trama, que en
       J1939 es la mitad de la información. Formateo automático NO: el ISO-TP del
       ELM es de OBD-II y acá estorba — J1939 arma sus mensajes largos con su
       propio transporte (BAM), que este módulo ya sabe rearmar. */
    await this._cmd('ATH1').catch(() => {});
    await this._cmd('ATCAF0').catch(() => {});
    if (log) log('Seleccionando protocolo A (SAE J1939 · 250k · 29 bits)...');
    const r = await this._cmd('ATSPA', 6000).catch(() => '');
    if (!/OK/i.test(r))
      throw new Error('Este adaptador Bluetooth no acepta el protocolo A (SAE J1939), así que no puede leer camiones. ' +
        'Hace falta un ELM327 que declare J1939 — el Vgate vLinker MS lo declara — o el USB-Link por RP1210.');
    this._protoNum = 10;   // 'A' = SAE J1939
    return true;
  },

  /* PGN 59904 (Request). Por omisión va a la dirección global (0xFF) y contesta
     el que quiera; con `da` se le pregunta a UN módulo concreto, que es la
     única forma de sacarle los códigos al que no difunde nada por su cuenta
     (pasa con varios TCM: solo hablan si se les pregunta directo). */
  _j39Solicitar(pgn, da = 0xFF) {
    if (this._j39BLE) return this._j39SolicitarBLE(pgn, da);
    return this._puenteOp({ op:'enviar', datos:[0x00, 0xEA, 0x00, 6, 0xF9, da & 0xFF, pgn & 0xFF, (pgn >> 8) & 0xFF, (pgn >> 16) & 0xFF] });
  },

  async _j39SolicitarBLE(pgn, da = 0xFF) {
    const h = n => (n & 0xFF).toString(16).toUpperCase().padStart(2, '0');
    /* Si veníamos escuchando hay que cortar, preguntar y volver a escuchar: con
       el adaptador volcando el bus, la respuesta llega mezclada con las tramas. */
    const seguia = !!this._monLinea;
    if (seguia) await this._monFin();
    /* Request es PDU1: PF=0xEA, PS=destino, SA=0xF9 (herramienta de diagnóstico).
       Los 5 bits altos del ID los pone ATCP; 0x18 son prioridad 6 con EDP y DP
       en cero, que es lo que J1939 pide para una solicitud. */
    await this._cmd('ATCP18', 3000).catch(() => {});
    await this._cmd('ATSH EA' + h(da) + 'F9', 3000).catch(() => {});
    /* El PGN pedido viaja en 3 bytes, el menos significativo primero. */
    const r = await this._cmd(h(pgn) + h(pgn >> 8) + h(pgn >> 16), 3000).catch(() => null);
    /* Tras transmitir, el ELM escucha un rato y devuelve lo que llegó: eso ya es
       respuesta y se decodifica igual que una trama del monitoreo. */
    if (r) for (const l of r.split(/[\r\n]+/)) this._j39LineaELM(l);
    if (seguia) await this._monInicio(l => this._j39LineaELM(l));
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
      let est;
      if (this._j39BLE) {
        log('Conectando al adaptador Bluetooth...');
        const nombre = await this._conectar();
        est = { dispositivo: nombre };
        log(`Adaptador: <b>${nombre}</b> ✓`);
        await this._j39BleIniciar(log);
        log('Protocolo A (SAE J1939) aceptado ✓');
        this._j39 = { datos:{}, pgns:{}, esperas:{}, sas:{}, dm1:{}, dm2:{}, tp:{}, claim:{}, vin:null, comp:null };
      } else {
        log('Conectando al puente USB local...');
        await this._puenteConectar();
        est = await this._puenteEstado();
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
      }
      /* Por Bluetooth hay que pedirle al adaptador que vuelque el bus; por USB el
         puente ya viene empujando las tramas por su cuenta. */
      if (this._j39BLE) await this._monInicio(l => this._j39LineaELM(l));
      log('Escuchando el bus J1939 (el camión transmite solo)...');
      const j = this._j39;
      /* Los PGN lentos (odómetro, horas, DM1 de un módulo dormido) pueden tardar
         más de 2,5 s en aparecer; con el plazo fijo se perdían de a ratos y el
         escaneo salía distinto en cada intento sobre el mismo camión. */
      const esc = await this._escucharBus(
        () => `${Object.keys(j.pgns).length}|${Object.keys(j.datos).length}|${Object.keys(j.sas).length}|${Object.keys(j.dm1).length}`,
        { min:2000, max:14000, quieto:2500,
          log: () => log(`&nbsp;&nbsp;<span style="color:var(--text3)">…${Object.keys(j.pgns).length} tipo(s) de mensaje, ${Object.keys(j.datos).length} parámetro(s)</span>`) });
      log(`Escucha ${UI.esc(esc.motivo === 'tope' ? 'cortada por tiempo' : 'completa')} (${(esc.ms/1000).toFixed(1)} s)`);
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
        log(nhtsa ? `VIN identificado: <b>${UI.esc(nhtsa.marca)} ${UI.esc(nhtsa.modelo || '')} ${nhtsa.anio || ''}</b>` : 'VIN sin coincidencias en NHTSA');
      }

      this._sop = Object.keys(this._j39.datos).filter(k => typeof this._j39.datos[k] === 'number');
      log(`${this._sop.length} sensores del motor en el bus ✓`);

      /* Mismo criterio que en OBD-II: si el bus no dijo NADA, no se puede
         afirmar que el camión esté sano. */
      if (!j.total && !Object.keys(this._j39.claim).length) {
        throw new Error(
          'SIN COMUNICACIÓN CON EL BUS J1939 — no llegó ninguna trama, así que NO se puede afirmar que el camión no tenga fallas. ' +
          'Revisá el cable en el conector, el switch en contacto y que el adaptador esté alimentado por el vehículo. ' +
          'OJO con los 24 V: un adaptador de 12 V enciende sus LED igual pero no abre el bus, y se puede dañar.');
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
                     vehiculo_id: vehId, vin,
                     protocolo: `J1939 (camión · ${this._j39BLE ? 'Bluetooth' : 'USB'})`,
                     adaptador: est.dispositivo || (this._j39BLE ? 'ELM327 (BLE)' : 'USB-Link (RP1210)'), mil,
                     dtcs, dtcs_pendientes: pend, datos: { ...this._j39.datos },
                     modulos: sas.map(s => ({ ecu: s, nombre: this._nombreSA(s) })),
                     freeze_frame: null, voltaje: this._voltajeDe(this._j39.datos), nhtsa,
                     comparacion };
      log('<b>Escaneo completo ✓</b>');
      this._renderResultado();
      for (const b of ['obd-btn-save', 'obd-btn-print']) { const x = document.getElementById(b); if (x) x.style.display = ''; }
      btn.textContent = '↻ Re-escanear';
    } catch (e) {
      log(`<span style="color:var(--red)">✗ ${e.message}</span>`);
      UI.toast(e.message, 'error');
    } finally {
      /* Cortar el volcado SIEMPRE, también si el escaneo reventó: un adaptador
         que quedó en ATMA no contesta ningún comando, así que el próximo escaneo
         arrancaría muerto sin motivo aparente. */
      if (this._j39BLE) await this._monFin().catch(() => {});
      btn.disabled = false;
      /* El boton aparece aunque el escaneo se haya caido: es justo cuando la
         bitacora sirve. */
      const bt = document.getElementById('obd-btn-traza');
      if (bt && this._traza && this._traza.length) bt.style.display = '';
    }
  }
  }));
})();
