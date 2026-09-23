/* NexusPro — Diagnóstico OBD · UDS / ISO-TP: tramas CAN, identidad de cada módulo (F187/F197/22 F1 00), direcciones por marca, diálogo punto a punto por ELM (con filtro de respuesta), barrido 11/29 bits, K-line y lectura de códigos UDS/KWP.

   Es parte de Modulos.diagnostico_obd: el objeto se define en
   diagnostico_obd.js (núcleo y conexión) y cada parte le agrega sus métodos.
   Se dividió el 2026-09-22 porque el archivo único pasaba de 9.000 líneas.
   defineProperties + getOwnPropertyDescriptors (y no Object.assign) para que
   los get/set viajen como accesores y no como el valor del momento. */
(() => {
  const M = Modulos.diagnostico_obd;
  Object.defineProperties(M, Object.getOwnPropertyDescriptors({

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
    await this._esperarTurno('barrido por ECU');
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
  /* SOLO lo que fija la norma. Esta tabla tenía ~40 direcciones de Hyundai
     aplicadas a CUALQUIER marca ("0x7D2 = TPMS" para todos): en el Picanto
     0x7D2 es la carrocería, y así salían llantas en un vehículo sin TPMS. Lo
     que depende de la marca vive en _DIRECCIONES_MARCA, con su fuente. */
  _UDS_NOMBRES: {
    0x7E0:'Motor (ECM)', 0x7E1:'Transmisión (TCM)',
  },
  /* El nombre que el modulo se da a si mismo (DID F197 "nombre del sistema",
     y si no F18A "proveedor"). La tabla de direcciones sirve para las que la
     norma fija, pero el resto salia como "Modulo 0x745" — y el propio modulo
     sabe decir como se llama. Preguntarselo es una consulta mas por modulo y
     convierte una lista de direcciones en una lista de nombres reales.

     Solo se acepta texto legible y de largo razonable: varios modulos
     contestan el DID con basura binaria o con relleno, y un nombre inventado
     es peor que una direccion honesta. */
  /* Texto legible dentro de la respuesta de un DID. Varios módulos contestan
     con relleno binario o con ceros: un nombre inventado a partir de basura es
     peor que una dirección honesta, así que se exige largo razonable y algo
     que parezca de verdad texto. */
  _textoDID(bytes) {
    if (!bytes || !bytes.length) return null;
    const txt = bytes.filter(x => x >= 32 && x < 127).map(x => String.fromCharCode(x)).join('').trim();
    if (txt.length < 3 || txt.length > 40) return null;
    if (!/[A-Za-z0-9]{3}/.test(txt)) return null;
    return txt;
  },

  /* Siglas con que los módulos Hyundai/Kia se nombran a sí mismos en 22 F1 00.
     SOLO las que aparecen en las huellas reales de opendbc
     (car/hyundai/fingerprints.py, consultado 2026-09-22), cada una en la
     dirección y con el prefijo de pieza que le corresponde: ESC/IEB en 0x7D1
     (589/585), MDPS en 0x7D4 (563/577), MFC/LKAS/LKA/LDWS/FR_CMR en 0x7C4
     (992/957/958), SCC/RDR/FCA en 0x7D0 (991/964). Una sigla que no esté acá
     se muestra tal cual la dice el módulo y se le pasa a la IA para traducirla. */
  _SIGLAS_HMC: {
    ESC: 'Frenos / ABS / ESC', IEB: 'Freno electrónico integrado (IEB)',
    MDPS: 'Dirección asistida (MDPS)',
    MFC: 'Cámara frontal', LKAS: 'Cámara frontal (LKAS)', LKA: 'Cámara frontal (LKA)',
    LDWS: 'Cámara frontal (LDWS)', FR_CMR: 'Cámara frontal',
    SCC: 'Radar frontal (SCC)', RDR: 'Radar frontal', FCA: 'Radar frontal (FCA)',
  },

  /* "IG  MDPS C 1.00 1.02 56310G8510\0 4IGSC103" → plataforma IG, sigla MDPS,
     pieza 56310-G8510. Lo no imprimible se vuelve espacio (la fecha viaja en
     binario dentro de la cadena del ESC). */
  _leerDescripcionHMC(bytes) {
    if (!bytes || !bytes.length) return null;
    const txt = bytes.map(x => (x >= 32 && x < 127) ? String.fromCharCode(x) : ' ').join('')
      .replace(/\s+/g, ' ').trim();
    if (txt.length < 4 || txt.length > 90 || !/[A-Z]{2}/.test(txt)) return null;
    const tok = txt.split(' ');
    /* Sin \b al final: el airbag del Picanto contesta "JA 95910-G60101XXXXXX…",
       con la pieza pegada al resto. El patrón es el de opendbc
       (PART_NUMBER_FW_PATTERN): 5 dígitos, guion opcional, letra y 4 más. */
    const pn = txt.match(/\b([0-9]{5})[-\/]?([A-Z][A-Z0-9]{3}[0-9])/);
    return {
      texto: txt,
      plataforma: /^[A-Z]{2}[A-Za-z0-9]{0,2}$/.test(tok[0]) ? tok[0] : null,
      sigla: tok.length > 1 && /^[A-Z][A-Z0-9_]{1,9}$/.test(tok[1]) ? tok[1] : null,
      pieza: pn ? `${pn[1]}-${pn[2]}` : null,
    };
  },

  /* La marca del vehículo que se está diagnosticando, venga de donde venga. */
  _marcaActual() {
    const s = this._centroScan || this._scan;
    const v = s && ((s.vehiculos) || (this._vehiculos || []).find(x => x.id === s.vehiculo_id));
    return this._marcaBarrido || (s && s.nhtsa && s.nhtsa.marca) || (v && v.marca) || null;
  },

  /* Lo que el módulo dice de SÍ MISMO. Son los identificadores normalizados de
     ISO 14229-1, iguales en cualquier marca:

       F197  nombre del sistema        — cómo se llama, cuando lo publica
       F187  número de pieza de repuesto — LA REFERENCIA del módulo
       F18A  fabricante del módulo

     La referencia es el dato que de verdad resuelve "¿qué módulo es este?": con
     ella se busca el repuesto, se compara contra otro vehículo igual y se le
     pone nombre de una vez para todo el modelo. Antes solo se pedía el nombre,
     y como la mayoría de los módulos NO lo publica, el reporte se quedaba en
     "Módulo 0x7B3" teniendo la referencia a una consulta de distancia.

     Tres consultas por módulo como máximo, y se corta apenas hay con qué
     identificarlo: en un vehículo con once módulos, cada consulta de más son
     segundos que el mecánico está parado esperando. */
  async _identidadModulo(m) {
    const out = {};
    const pedir = async did => {
      const d = await this._udsPedir(m.req, m.resp, [0x22, did >> 8, did & 0xFF], 1500);
      if (!d || d[0] !== 0x62) return null;
      return this._textoDID(d.slice(3));            // 62 + los 2 bytes del DID
    };
    /* Hyundai/Kia/Genesis contestan 22 F1 00 con su descripción larga, que
       dice QUÉ ES el módulo: "JA  MDPS C 1.00 1.01 56310-G6200". Es lo que usa
       opendbc (HYUNDAI_VERSION_REQUEST_LONG; F1 10 es la alternativa) para
       reconocer cada módulo. Lectura pura, no cambia nada en el vehículo. */
    if (/^(HYUNDAI|KIA|GENESIS)/i.test(this._marcaActual() || '')) {
      for (const did of [0xF100, 0xF110]) {
        try {
          const d = await this._udsPedir(m.req, m.resp, [0x22, did >> 8, did & 0xFF], 1500);
          const h = d && d[0] === 0x62 ? this._leerDescripcionHMC(d.slice(3)) : null;
          if (h) { out.hmc = h; if (h.pieza) out.referencia = h.pieza; break; }
        } catch (_) {}
      }
    }
    if (!(out.hmc && out.hmc.sigla)) { try { out.nombre = await pedir(0xF197); } catch (_) {} }
    if (!out.referencia) { try { out.referencia = await pedir(0xF187); } catch (_) {} }
    if (!out.nombre && !out.referencia) {
      try { out.proveedor = await pedir(0xF18A); } catch (_) {}
    }
    for (const k of Object.keys(out)) if (!out[k]) delete out[k];
    return Object.keys(out).length ? out : null;
  },

  /* Grupo del número de repuesto Hyundai/Kia. Los primeros dos dígitos de la
     referencia son el grupo del catálogo de repuestos, y el grupo es el sistema.

     ES UNA SUGERENCIA, NO UN NOMBRE. Se muestra al lado de la referencia, con
     el "¿?" a la vista, para que el mecánico confirme y lo declare él. Nunca se
     usa como nombre del módulo: la regla de esta herramienta es que un dato sin
     confirmar no se presenta como hecho. */
  /* ═══════════ DIRECCIONES CONOCIDAS POR MARCA ═══════════
     El vehículo no dice cómo se llama cada módulo, y el escaneo solo puede
     deducir dos: el motor y la transmisión, porque sus direcciones están en la
     norma (ISO 15765-4). El resto salía como "Módulo 0x7B3".

     Esto es lo que falta: direcciones que alguien verificó contra vehículos
     REALES. No son norma, así que se muestran como SUGERENCIA con la fuente a
     la vista y nunca se guardan solas como nombre — las confirma una persona.

     Hyundai/Kia/Genesis salen de opendbc (comma.ai), que es código de
     producción: consulta estas direcciones en vehículos reales para leer la
     versión de firmware de cada módulo.
       · opendbc/car/hyundai/values.py       → extra_ecus
       · opendbc/car/hyundai/fingerprints.py → tuplas (Ecu.X, 0x…, None)
     Consultado el 2026-09-17.

     Para agregar otra marca: misma forma, y SIEMPRE con su fuente. Sin fuente
     no entra — es la misma regla del catálogo OEM. */
  _DIRECCIONES_MARCA: [
    {
      /* Restaurada a lo VERIFICADO el 2026-09-17. El commit a2e79bc la había
         "ampliado" sin fuente real: 0x7D2 pasó a ser "EPS / TPMS" (en el
         Picanto es la carrocería), 0x7D0 cambió de radar a ABS, 0x7D4 quedó
         como "crucero O dirección", y se sumaron 0x7A0/7A1/7A5/71A/71D/7D6
         citando un "GDS" que nadie consultó. Una dirección que no está acá
         queda sin nombre por dirección — la identifican el propio módulo, su
         número de pieza o la IA con evidencia. */
      marcas: /^(HYUNDAI|KIA|GENESIS)/i,
      fuente: 'opendbc (comma.ai), consultado 2026-09-17',
      dirs: {
        0x730: 'ADAS de conducción',
        0x7B1: 'ADAS de estacionamiento',
        0x7B3: 'Climatización (HVAC)',
        0x7B7: 'Radar de esquina',
        0x7C4: 'Cámara frontal',
        0x7C6: 'Tablero de instrumentos (IPC)',
        0x7D0: 'Radar frontal',
        0x7D1: 'Frenos / ABS',
        0x7D4: 'Dirección asistida (MDPS / EPS)',
      },
    },
    /* Toyota, Nissan, Ford/Mazda, GM y VW: auditadas el 2026-09-22 contra el
       código de opendbc (car/<marca>/values.py y fingerprints.py, rama master),
       tupla por tupla (Ecu.x, dirección). Las tablas que había (commit
       a2e79bc) citaban opendbc pero casi nada coincidía:
         · Toyota: 0x7C4 decía AIRBAG y es CLIMATIZACIÓN; la dirección estaba
           en 0x7E4 (es 0x7A1); BCM/tablero/TPMS en 0x7C0/7C3/7C7 sin fuente.
         · Nissan: las 7 direcciones del rango 0x79x no aparecen; ABS, dirección
           y tablero están en 0x740/0x742/0x743.
         · GM: ponía carrocería, airbag, tablero y dirección en 0x7E4-0x7E7 (rango
           de EMISIONES, ISO 15765-4) y climatización en 0x7EA, que es una
           dirección de RESPUESTA. opendbc no documenta ninguna UDS de GM.
         · VW: era una copia de la tabla de Hyundai (7D0, 7D4, 7A0, 7B3, 7C6,
           758). En VW la dirección es 0x712 y el airbag 0x715.
       Solo entra lo que está en la fuente. Lo que no, se queda sin nombre por
       dirección: lo nombran el propio módulo, su número de pieza o la IA. */
    {
      marcas: /^(TOYOTA|LEXUS|SCION)/i,
      fuente: 'opendbc (comma.ai), consultado 2026-09-22',
      dirs: {
        0x700: 'Motor (ECM)',
        0x701: 'Transmisión (TCM)',
        0x780: 'Airbag (SRS)',
        0x791: 'Unidad de asistencia a la conducción (DSU)',
        0x7A1: 'Dirección asistida (EPS)',
        0x7B0: 'Frenos / ABS',
        0x7C4: 'Climatización (HVAC)',
        0x7D1: 'Frenos / ABS',
        0x7D2: 'Sistema híbrido',
        0x7E2: 'Sistema híbrido',
      },
    },
    {
      marcas: /^(NISSAN|INFINITI)/i,
      fuente: 'opendbc (comma.ai), consultado 2026-09-22',
      dirs: {
        0x707: 'Cámara frontal',
        0x740: 'Frenos / ABS',
        0x742: 'Dirección asistida (EPS)',
        0x743: 'Tablero de instrumentos',
      },
    },
    {
      /* Mazda comparte con Ford las mismas cuatro direcciones en opendbc. */
      marcas: /^(FORD|LINCOLN|MAZDA)/i,
      fuente: 'opendbc (comma.ai), consultado 2026-09-22',
      dirs: {
        0x706: 'Cámara frontal',
        0x730: 'Dirección asistida (EPS / PSCM)',
        0x732: 'Selector de cambios electrónico',
        0x760: 'Frenos / ABS',
        0x764: 'Radar frontal',
      },
    },
    /* GM: sin tabla. opendbc no documenta direcciones UDS de GM (solo la cámara
       en 0x24B, que no es diagnóstico) y lo que había era inventado. */
    {
      marcas: /^(VOLKSWAGEN|VW|AUDI|SEAT|SKODA|CUPRA)/i,
      fuente: 'opendbc (comma.ai), consultado 2026-09-22',
      dirs: {
        0x712: 'Dirección asistida (EPS)',
        0x715: 'Airbag (SRS)',
        0x74F: 'Cámara frontal',
        0x757: 'Radar frontal',
      },
    },
  ],

  /* Sugerencia de nombre por la dirección, para la marca del vehículo. */
  _sugerenciaPorDireccion(req, marca) {
    const m = String(marca || '').trim();
    if (!m) return null;
    for (const tabla of this._DIRECCIONES_MARCA) {
      if (!tabla.marcas.test(m)) continue;
      const nombre = tabla.dirs[Number(req)];
      if (nombre) return { nombre, fuente: tabla.fuente };
    }
    return null;
  },

  _GRUPO_PIEZA: {
    '39':'Control del motor', '45':'Transmisión automática', '43':'Transmisión manual',
    '58':'Frenos (ABS / ESC)', '56':'Dirección (MDPS / EPS)', '97':'Climatización',
    '94':'Instrumentos / tablero', '95':'Eléctrica y electrónica (airbag, carrocería, llave)',
    '99':'Multimedia / asistencias', '91':'Arneses y cajas de fusibles',
  },
  _sugerenciaPorReferencia(ref) {
    const t = String(ref || '').replace(/[^0-9A-Za-z]/g, '');
    if (t.length < 5 || !/^\d{5}/.test(t)) return null;
    const g = this._GRUPO_PIEZA[t.slice(0, 2)];
    return g ? { grupo: t.slice(0, 2), sistema: g } : null;
  },

  _nombreUDS(req, codigos) {
    const propio = this._nombreDeclarado(req);
    if (propio) return propio;
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
    const r = await this._udsPedirCAN(reqId, respId, tx, timeout);
    /* Se traza aca y no adentro para que quede UNA entrada por consulta, con la
       direccion delante: sin eso no se sabe a quien se le pregunto. */
    if (!this._sinTraza)
      this._trazar(`UDS 0x${reqId.toString(16).toUpperCase()} ${tx.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')}`, r);
    return r;
  },

  async _udsPedirCAN(reqId, respId, tx, timeout = 2500) {
    if (this._esELM()) {
      /* El camino ELM ya pasa por _cmd, que traza solo: se silencia para no
         duplicar cada consulta en la bitacora. */
      const antes = this._sinTraza;
      this._sinTraza = true;
      try { return await this._udsPedirELM(reqId, respId, tx, timeout); }
      finally { this._sinTraza = antes; }
    }
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

  /* ── El mismo escaneo por módulo, pero con un dongle Bluetooth ──────────
     Decía "solo por USB — el ELM327 Bluetooth no deja dirigir tramas a una
     dirección arbitraria". No es exacto: para eso está ATSH, que fija la
     cabecera de envío. Y como la mayoría de los talleres no tiene un USB-Link
     sino un dongle barato, el escaneo por módulo — el que encuentra el TPMS,
     el ABS y la carrocería — no le llegaba a casi nadie.

     Dos diferencias con el USB, y las dos se dicen en vez de disimularse:
       · el ELM arma y desarma el ISO-TP solo, así que no se ve la dirección
         desde la que contesta el módulo. Se guarda solo la de ida, que es la
         que hace falta para volver a hablarle.
       · el barrido de 29 bits queda solo para USB: en BLE la cabecera extendida
         se fija distinto (ATSH de 6 dígitos + ATCP) y no está verificado.

     Al terminar hay que devolver la cabecera a la dirección de difusión: si
     queda apuntando al módulo de frenos, el monitor en vivo y el borrado de
     códigos le hablan a los frenos. Por eso sólo se habilita en CAN de 11 bits,
     donde la difusión es 7DF y la restauración es inequívoca. */
  _elmPuedeModulos() {
    return this._esELM() && (this._protoNum === 6 || this._protoNum === 8);
  },

  async _elmModoModulo(encender) {
    if (!this._esELM()) return true;
    if (encender) {
      /* ATST fija cuánto espera el ELM antes de contestar NO DATA. Por defecto
         son ~200 ms: con 240 direcciones, casi un minuto de pura espera. */
      await this._cmd('ATST 20', 3000).catch(() => {});
      const r = await this._cmd('ATSH 7DF', 3000).catch(() => '');
      return /OK/i.test(r || '');            // dongle sin ATSH: no se sigue
    }
    await this._cmd('ATSH 7DF', 3000).catch(() => {});   // volver a la difusión
    await this._cmd('ATAR', 3000).catch(() => {});       // sin filtro: el monitor en vivo escucha a todos
    await this._cmd('ATH0', 3000).catch(() => {});
    await this._cmd('ATST 32', 3000).catch(() => {});
    return true;
  },

  /* Hablarle a UN módulo suelto fuera del escaneo (ver su ficha, borrarle los
     códigos, reiniciarlo). Por USB no hay nada que preparar: cada trama lleva
     su propia dirección. Por ELM la dirección es ESTADO del dongle —la fija
     ATSH y ahí se queda—, así que sin devolverla a la difusión al terminar, el
     monitor en vivo y el borrado general le siguen hablando al módulo de
     frenos. Va en finally justamente por eso: si la operación falla, la
     cabecera tiene que volver igual. */
  async _elmPuntoAPunto(fn) {
    if (!this._esELM()) return fn();
    const ok = await this._elmModoModulo(true);
    if (!ok) throw new Error('Este adaptador no acepta ATSH: no puede dirigirse a un módulo puntual.');
    try { return await fn(); }
    finally { await this._elmModoModulo(false); }
  },

  /* Un módulo suelto sólo se puede tocar con el vehículo enchufado Y con un
     transporte capaz de dirigirse a él. Devuelve el motivo, no un booleano:
     "requiere USB" era mentira desde que el ELM también sabe hacerlo, y un
     mensaje equivocado manda a buscar un cable que no hacía falta. */
  _puedePuntoAPunto() {
    if (!this._listo) return { ok: false, motivo: 'El vehículo y el adaptador deben seguir conectados' };
    if (this._via === 'usb') return { ok: true };
    if (!this._esELM()) return { ok: false, motivo: 'Esta vía no puede dirigirse a un módulo puntual' };
    if (!this._elmPuedeModulos()) return { ok: false, motivo:
      `Por Bluetooth esto necesita CAN de 11 bits (protocolo actual: ${this._protoNum ?? '?'})` };
    return { ok: true };
  },

  /* Direcciones que NO son un módulo, aunque contesten.

     Verificado en el Picanto 2019 el 2026-09-17: el barrido reportó "módulos"
     en 0x7DF y 0x7E8, los dos con cero códigos. No son módulos:

     · 0x7DF es la dirección de DIFUSIÓN legislada (ISO 15765-4). Preguntar ahí
       no descubre a nadie: le pregunta a TODOS los de emisiones a la vez y
       contesta el primero que alcanza. Siempre hay respuesta, y siempre es la
       del motor, que ya está en la lista por su propia dirección.
     · 0x7E8-0x7EF son las direcciones de RESPUESTA de esos mismos módulos.
       Nadie escucha ahí. Lo que vuelve es el eco de una conversación anterior.

     Contarlas infla la lista con fantasmas, y un fantasma en el mapa de acceso
     es peor que un módulo de menos: el próximo escaneo del modelo lo busca, no
     lo encuentra y lo reporta como AUSENTE — una avería que no existe. */
  _DIR_NO_ES_MODULO(req) {
    return req === 0x7DF || (req >= 0x7E8 && req <= 0x7EF);
  },

  _hex3(req) { return req.toString(16).toUpperCase().padStart(3, '0'); },

  /* Toca la puerta de UNA dirección. Devuelve {req,resp} si hay alguien.
     Por BLE el ELM oculta la dirección de respuesta, así que resp va en null y
     la interfaz lo dice en vez de inventarla. */
  /* ¿Lo que llegó es la respuesta A ESTO que se preguntó?

     Sin esta verificación, el barrido contaba como módulo CUALQUIER línea
     hexadecimal que apareciera. Y aparecen de más: el barrido manda 240
     preguntas seguidas, y una respuesta que llega tarde se la lleva el comando
     SIGUIENTE — el mismo efecto que ya se había visto por Web Serial el
     2026-09-20. Resultado: el módulo real 0x7B3 contesta tarde, su respuesta
     cae en la pregunta de 0x7B4, y 0x7B4 queda anotado como módulo.

     Cuántos fantasmas salgan depende del TIEMPO, no del vehículo. Por eso el
     Picanto reportaba 10 módulos, después 20, después 22 y después 27
     (reportado por Henry el 2026-09-22): como el mapa del modelo es la UNIÓN de
     todo lo que se vio alguna vez, cada fantasma quedaba para siempre y volvía
     a tener oportunidad de "contestar" en el escaneo siguiente. Una unión que
     nunca resta sólo puede crecer.

     ISO 14229-1: a un servicio N se contesta N+0x40 si se acepta, o 7F N xx si
     se rechaza. Las DOS prueban que hay un módulo escuchando ahí —un rechazo
     lo manda alguien—, así que las dos cuentan. Lo que no cuenta es un chorro
     de bytes que no responde a ninguna de las dos formas. */
  _contestaA(r, servicio) {
    const hex = this._hexLines(r || '').join('');
    if (hex.length < 2) return false;
    const pos = ((servicio + 0x40) & 0xFF).toString(16).padStart(2, '0').toUpperCase();
    const svc = servicio.toString(16).padStart(2, '0').toUpperCase();
    for (let p = 0; p + 1 < hex.length; p += 2) {
      const b = hex.substr(p, 2);
      if (b === pos) return true;
      if (b === '7F' && hex.substr(p + 2, 2) === svc) return true;
    }
    return false;
  },

  async _tocarPuerta(req) {
    if (this._esELM()) {
      await this._cmd('ATSH ' + this._hex3(req), 2500).catch(() => {});
      let r = null;
      try { r = await this._cmd('3E00', 1500); } catch (_) { return null; }
      if (this._contestaA(r, 0x3E)) return { req, resp: null, ext: false };
      /* Hay módulos que ignoran Tester Present y sí abren sesión. Se prueba
         con 10 01 —la sesión POR DEFECTO, la que apaga los testigos, no la
         extendida— y se exige igual que la respuesta sea a ESE servicio. */
      try { r = await this._cmd('1001', 1500); } catch (_) { return null; }
      return this._contestaA(r, 0x10) ? { req, resp: null, ext: false } : null;
    }
    let capt = [];
    this._canRx = (id, b) => { capt.push({ id, b }); };
    try {
      await this._canTx(req, [0x02, 0x3E, 0x00]).catch(() => {});
      await new Promise(r => setTimeout(r, 70));
      if (!capt.length) {
        await this._canTx(req, [0x02, 0x10, 0x01]).catch(() => {});
        await new Promise(r => setTimeout(r, 70));
      }
    } finally { this._canRx = null; }
    const c = capt.find(x => x.id !== req);
    return c ? { req, resp: c.id, ext: false } : null;
  },

  /* UDS punto a punto por ELM327. El dongle arma el ISO-TP (incluido el control
     de flujo), así que acá sólo se fija la cabecera y se manda el servicio.
     La respuesta multilínea del ELM antepone el largo total y prefijos '0:',
     '1:' — por eso no se asume que el primer byte sea el del servicio: se busca
     la respuesta positiva (servicio+0x40) o la negativa (7F). */
  /* ── Quién contestó ─────────────────────────────────────────────────────
     Sin filtro de recepción el ELM entrega la respuesta de CUALQUIER módulo
     que hable en ese momento. En el Picanto (2026-09-23 00:27) la dirección
     asistida 0x7D4 salió con P0115, P0106, P0782, B0001 y U39FF — motor,
     transmisión y airbag — y en el escaneo siguiente con ninguno: era una
     respuesta ajena atribuida al módulo equivocado. Con eso cualquier catálogo
     de códigos por módulo se llena de basura.

     Ahora se filtra por la dirección de RESPUESTA del módulo (ATCRA): la
     conocida, la aprendida, o la de la convención ISO 15765 (pedido + 8). Si
     con el filtro no contesta nadie — hay módulos que responden en otra
     dirección, se vieron saltos de +0x20 — se pregunta UNA vez con cabeceras
     visibles (ATH1), se aprende quién contesta de verdad y solo se aceptan
     SUS tramas. */
  _respAprendida: {},

  /* Con ATH1 cada trama viene con su ID adelante ("7DC1014590200FF…"): se
     rearma el ISO-TP por ID para no mezclar dos módulos. */
  _framesPorId(raw) {
    const porId = new Map();
    for (const linea of String(raw || '').split(/[\r\n]+/)) {
      const h = linea.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
      if (h.length < 5) continue;
      const id = parseInt(h.slice(0, 3), 16);
      const b = (h.slice(3).match(/../g) || []).map(x => parseInt(x, 16));
      if (!b.length) continue;
      const e = porId.get(id) || { datos: [], len: 0 };
      const pci = b[0] >> 4;
      if (pci === 0) { e.len = b[0] & 0x0F; e.datos = b.slice(1, 1 + e.len); }
      else if (pci === 1) { e.len = ((b[0] & 0x0F) << 8) | b[1]; e.datos = b.slice(2); }
      else if (pci === 2) e.datos = e.datos.concat(b.slice(1));
      porId.set(id, e);
    }
    const out = new Map();
    for (const [id, e] of porId) if (e.datos.length) out.set(id, e.len ? e.datos.slice(0, e.len) : e.datos);
    return out;
  },

  async _udsPedirELM(req, resp, tx, timeout = 3000) {
    await this._cmd('ATSH ' + this._hex3(req), 2500).catch(() => {});
    const cmd = tx.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const esPositiva = d => d && (d[0] === ((tx[0] + 0x40) & 0xFF) || (d[0] === 0x7F && d[1] === tx[0]));
    if (req <= 0x7F7) {
      const esperado = resp != null ? Number(resp) : (this._respAprendida[req] != null ? this._respAprendida[req] : req + 8);
      await this._cmd('ATCRA ' + this._hex3(esperado), 2500).catch(() => {});
      let r1 = null;
      try { r1 = await this._cmd(cmd, timeout); } catch (_) {}
      const d1 = this._parsearRespELM(r1, tx);
      if (d1) return d1;
      /* Nadie contestó desde la dirección esperada: ¿contesta desde otra? */
      await this._cmd('ATAR', 2500).catch(() => {});
      await this._cmd('ATH1', 2500).catch(() => {});
      let raw = null;
      try { raw = await this._cmd(cmd, timeout); } catch (_) {}
      await this._cmd('ATH0', 2500).catch(() => {});
      const ajenas = new Set(Object.entries(this._respAprendida)
        .filter(([r]) => Number(r) !== req).map(([, id]) => id));
      for (const [id, datos] of this._framesPorId(raw)) {
        /* La respuesta de OTRO módulo ya conocido no se toma por la de éste, y
           0x7E8-0x7EF solo valen para 0x7E0-0x7E7 (motor/transmisión). */
        if (ajenas.has(id) || (id >= 0x7E8 && id <= 0x7EF && !(req >= 0x7E0 && req <= 0x7E7))) continue;
        if (esPositiva(datos)) {
          this._respAprendida[req] = id;
          this._trazaNota(`0x${this._hex3(req)} contesta desde 0x${this._hex3(id)} (aprendido)`);
          return datos;
        }
      }
      return null;
    }
    let r = null;
    try { r = await this._cmd(cmd, timeout); } catch (_) { return null; }
    return this._parsearRespELM(r, tx);
  },

  _parsearRespELM(r, tx) {
    if (!r || /NO DATA|ERROR|UNABLE|STOPPED|BUFFER/i.test(r)) return null;
    /* Acá NO sirve _hexLines. En una respuesta larga el ELM antepone una línea
       con el largo total ("014") y numera las siguientes ("0:", "1:"). Esa
       línea son TRES caracteres hex — largo impar — así que al pegarla con el
       resto corre todos los bytes medio byte y el 59 del servicio cae en una
       posición impar: se pierde la respuesta entera. Se descarta quedándose
       sólo con las líneas numeradas cuando las hay. */
    const lineas = r.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const numeradas = lineas.filter(l => /^[0-9A-F]{1,2}:/i.test(l));
    const hex = (numeradas.length ? numeradas : lineas)
      .map(l => l.replace(/^[0-9A-F]{1,2}:/i, '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase())
      .join('');
    const buscar = h => { for (let p = 0; p + 1 < hex.length; p += 2) if (hex.substr(p, 2) === h) return p; return -1; };
    let i = buscar(((tx[0] + 0x40) & 0xFF).toString(16).padStart(2, '0').toUpperCase());
    if (i < 0) i = buscar('7F');
    if (i < 0) return null;
    const out = [];
    for (let p = i; p + 1 < hex.length; p += 2) out.push(parseInt(hex.substr(p, 2), 16));
    return out.length ? out : null;
  },

  /* Pregunta "¿hay alguien?" en cada dirección y anota quién contesta y desde
     qué ID responde. La relación pregunta→respuesta no es fija (vimos +0x20,
     +0x08 y saltos irregulares en el mismo vehículo), así que se escucha todo
     en vez de suponer el ID de vuelta. */
  async _barrerModulos(log) {
    const hallados = [];
    /* 3E 00 = Tester Present: es de solo lectura, no cambia nada en el
       vehículo. Es la forma segura de preguntar si hay un módulo ahí. */
    const antes = this._sinTraza;
    this._sinTraza = true;          // 240 puertas ahogarian la bitacora
    try {
      for (let req = 0x700; req <= 0x7EF; req++) {
        if (this._DIR_NO_ES_MODULO(req)) continue;
        const h = await this._tocarPuerta(req);
        if (h && !hallados.some(x => x.req === h.req && x.resp === h.resp)) hallados.push(h);
        if (log && (req & 0x3F) === 0x3F)
          log(`&nbsp;&nbsp;<span style="color:var(--text3)">…0x${req.toString(16).toUpperCase()} (${hallados.length} encontrados)</span>`);
      }
    } finally { this._sinTraza = antes; }
    this._trazaNota(`barrido 11 bits 0x700-0x7EF: ${hallados.length} modulo(s) — ` +
      (hallados.map(h => '0x' + h.req.toString(16).toUpperCase()).join(' ') || 'ninguno'));
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

  /* ═══ Escaneo por modulo en K-line (ISO 14230 / KWP2000) ═══════════════════
     Todo el escaneo por modulo de arriba direcciona por CAN: le pregunta a los
     IDs 0x700-0x7EF. Un liviano anterior a ~2006 no tiene CAN de diagnostico,
     asi que ahi NO habia escaneo por modulo — solo los codigos de emisiones del
     motor. El vehiculo quedaba con un modulo listado y todo lo demas invisible:
     exactamente el falso-limpio que esta herramienta no se puede permitir.

     En K-line el destino es UN byte (ISO 14230-3): cabecera
     [formato][destino][origen], con formato = 0x80 | largo y origen = 0xF1 (el
     equipo de diagnostico). Se le toca la puerta a cada destino con
     StartCommunication (0x81), que es el saludo del propio protocolo: un modulo
     presente contesta 0xC1 + dos bytes de llave.

     Limites, dichos y no disimulados:
       · solo en ISO 14230 (protocolos 4 y 5 del ELM). En ISO 9141-2 (protocolo
         3) el direccionamiento por modulo no esta especificado asi, y adivinarlo
         seria inventar.
       · los codigos se piden con 18 00 FF 00 — el mismo servicio KWP2000 que ya
         se usa para modulos viejos en CAN, con el mismo lector y la misma
         advertencia sobre el byte de estado.
       · NO alcanza a los modulos que hablan protocolo propietario de la marca.
         En Mitsubishi de esta generacion (MUT-II) el ABS, SRS, 4x4, TPMS y el
         ETACS van a 15625 baudios — y el ETACS por el pin 9, que ningun ELM327
         cablea. Para esos hace falta MUT-III o equivalente. Se avisa, en vez de
         dejar creer que "no contesto" es "no tiene fallas".

     Escrito contra la norma, todavia SIN verificar en vehiculo. Mientras no se
     pruebe enchufado, la interfaz lo dice. */
  _KLINE_ORIGEN: 0xF1,

  _klineHdr(destino, largo) {
    const h = n => n.toString(16).toUpperCase().padStart(2, '0');
    return `${h(0x80 | (largo & 0x3F))} ${h(destino)} ${h(this._KLINE_ORIGEN)}`;
  },

  /* Una consulta KWP2000 a un destino puntual. El ELM arma el checksum y la
     temporizacion; aca solo se fija la cabecera y se manda el servicio. */
  async _klinePedir(destino, tx, timeout = 2500) {
    await this._cmd('ATSH ' + this._klineHdr(destino, tx.length), 2500).catch(() => {});
    const cmd = tx.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    let r = null;
    try { r = await this._cmd(cmd, timeout); } catch (_) { return null; }
    /* BUS INIT / SEARCHING no son respuestas del modulo: son el ELM negociando.
       Tomarlas por datos haria aparecer modulos que no existen. */
    if (!r || /NO DATA|ERROR|UNABLE|STOPPED|BUFFER|BUS INIT|BUS BUSY|SEARCHING|CAN ERROR/i.test(r)) return null;
    const hex = this._hexLines(r).join('');
    if (hex.length < 2) return null;
    const out = [];
    for (let p = 0; p + 1 < hex.length; p += 2) out.push(parseInt(hex.substr(p, 2), 16));
    return out.length ? out : null;
  },

  _klinePuedeModulos() {
    return this._esELM() && (this._protoNum === 4 || this._protoNum === 5);
  },

  /* Al terminar hay que dejar el adaptador hablando OBD-II otra vez. En CAN
     alcanza con devolver la cabecera a 7DF; en K-line la cabecera por defecto
     depende del protocolo negociado, asi que en vez de adivinarla se rehace la
     autodeteccion: cuesta ~2 s y es la unica forma segura de no dejar el
     monitor en vivo y el borrado de codigos apuntando a un modulo cualquiera. */
  async _klineRestaurar() {
    await this._cmd('ATSP0', 4000).catch(() => {});
    await this._cmd('0100', 12000).catch(() => {});
  },

  /* Destinos que la norma y la practica reservan para modulos de diagnostico.
     Se prueban PRIMERO porque cubren la enorme mayoria de los vehiculos: barrer
     los 255 a ciegas cuesta varios minutos, y en K-line cada puerta cerrada se
     paga con el timeout completo. */
  _KLINE_DESTINOS: [
    0x10, 0x11, 0x12, 0x13, 0x18, 0x19,      // motor y variantes
    0x33,                                     // direccion funcional OBD-II
    0x28, 0x29, 0x2C,                         // frenos / ABS
    0x38, 0x39,                               // carroceria
    0x40, 0x41, 0x44, 0x45,                   // instrumentos / confort
    0x50, 0x51, 0x58, 0x59,                   // airbag / seguridad
    0x60, 0x61, 0x6A, 0x6B,                   // transmision / traccion
    0x01, 0x02, 0x03, 0x05, 0x07, 0x08,       // bajos, usados por varias marcas
  ],

  /* `completo` recorre los 255. Es lo correcto cuando el vehiculo no aparece en
     los destinos habituales, pero se pide a proposito: en el caso peor son
     varios minutos y hay que decirlo antes, no dejar la pantalla quieta. */
  async _barrerModulosKline(log, completo = false) {
    const hallados = [];
    const antes = this._sinTraza;
    this._sinTraza = true;                 // 255 puertas ahogarian la bitacora
    const lista = completo
      ? Array.from({ length: 0xFF }, (_, i) => i + 1)
      : this._KLINE_DESTINOS;
    try {
      let n = 0;
      for (const dst of lista) {
        if (dst === this._KLINE_ORIGEN) continue;        // ese somos nosotros
        const r = await this._klinePedir(dst, [0x81], 1200);
        /* 0xC1 = StartCommunication aceptada. Se cuenta tambien el rechazo
           explicito (0x7F): un modulo que contesta "no" es un modulo que ESTA,
           y darlo por ausente seria perderlo. */
        if (r && (r[0] === 0xC1 || r[0] === 0x7F))
          hallados.push({ dst, saludo: r[0] === 0xC1 });
        if (log && ++n % 8 === 0)
          log(`&nbsp;&nbsp;<span style="color:var(--text3)">…${n} de ${lista.length} destinos (${hallados.length} encontrados)</span>`);
      }
    } finally { this._sinTraza = antes; }
    this._trazaNota(`barrido K-line ${completo ? '0x01-0xFF' : 'destinos habituales'}: ` +
      `${hallados.length} modulo(s) — ` +
      (hallados.map(h => '0x' + h.dst.toString(16).toUpperCase()).join(' ') || 'ninguno'));
    return hallados;
  },

  async _escanearModulosKline(log) {
    const n = this._KLINE_DESTINOS.length;
    if (log) log(`<b>Barriendo módulos en K-line (KWP2000)…</b> ${n} destinos habituales, ~${Math.ceil(n * 1.4 / 60)} min`);
    let hallados = await this._barrerModulosKline(log);

    /* Si en los habituales no aparece nadie, se recorren los 255 antes de dar
       el vehículo por mudo: es lento, pero decir "no hay módulos" sin haber
       preguntado en todas las puertas sería el mismo falso-limpio de siempre. */
    if (!hallados.length) {
      if (log) log('Ninguno en los destinos habituales — recorriendo los 255 (puede tardar varios minutos)…');
      hallados = await this._barrerModulosKline(log, true);
    }

    if (!hallados.length) {
      if (log) log('Ningún módulo contestó el saludo KWP2000. En Mitsubishi de esta generación es lo esperable: ' +
        'ABS, SRS, 4x4, TPMS y ETACS usan MUT-II (15625 baudios), que un ELM327 no puede hablar.');
      return null;
    }
    if (log) log(`<b>${hallados.length} módulo(s) contestaron en K-line</b> — leyendo códigos de cada uno...`);
    const res = [];
    try {
      for (const h of hallados) {
        /* Se vuelve a saludar ANTES de pedir los códigos. En KWP2000 la sesión
           se cae sola tras unos segundos sin tráfico, y entre el barrido y este
           momento pasaron minutos: sin re-saludar, el módulo contesta NO DATA y
           quedaría listado como "sin códigos" teniéndolos. */
        await this._klinePedir(h.dst, [0x81], 1200);
        let d = await this._klinePedir(h.dst, [0x18, 0x00, 0xFF, 0x00], 2500);
        /* Un segundo intento tras re-saludar: si el módulo cerró la sesión
           justo en el medio, el primer pedido se pierde pero el siguiente entra. */
        if (!d) {
          await this._klinePedir(h.dst, [0x81], 1200);
          d = await this._klinePedir(h.dst, [0x18, 0x00, 0xFF, 0x00], 2500);
        }
        const cods = this._dtcsKWP(d);
        const nombre = this._nombreUDS(h.dst, cods);
        res.push({ ecu: h.dst, resp: null, ext: false, kline: true, nombre,
                   codigos: cods, respondio: !!d, servicio: '18 00 FF 00 (KWP2000)', nuevo: false });
        if (log) {
          if (cods.length) log(`&nbsp;&nbsp;<b>${nombre}</b>: ${cods.length} código(s)`);
          else if (!d) log(`&nbsp;&nbsp;<span style="color:var(--amber)">${nombre}: saludó pero no entregó códigos — no se puede afirmar que esté sano</span>`);
        }
      }
    } finally { await this._klineRestaurar(); }

    /* Mismas descripciones que el camino CAN: un codigo pelado obliga a irlo a
       buscar a internet, que es justo lo que esto deberia evitar. */
    const todos = res.flatMap(m => m.codigos.map(c => c.codigo.split('-')[0]));
    let cat = null;
    if (todos.length) { try { cat = await DB.getDTCCatalogo([...new Set(todos)]); } catch (_) {} }
    for (const m of res)
      for (const c of m.codigos) {
        c.desc = this._descModulo(c.codigo, cat);
        c.sistema = this._sistemaDTC(c.codigo);
      }
    return res;
  },

  /* ── Modulos que no hablan UDS: KWP2000 (ISO 14230-3), servicio 0x18 ──
     Un modulo de 2003-2010 contesta el Tester Present del barrido — o sea que
     el escaneo lo encuentra — pero no conoce el servicio 0x19: devuelve
     "servicio no soportado" y quedaba listado como respondio-sin-codigos.
     Ese es el falso-limpio que esta herramienta no se puede permitir: un modulo
     con fallas reales declarado sano.

     Peticion 18 00 FF 00 (todos los codigos, todos los grupos).
     Respuesta   58 [cantidad] y despues 3 bytes por codigo: [alto][bajo][estado].

     El NUMERO se decodifica igual que en modo 03 y es inequivoco. El byte de
     estado NO se interpreta a proposito: en KWP2000 su significado varia entre
     implementaciones y no esta verificado contra hardware. Decir "presente
     ahora" o "guardada" a partir de un byte que no sabemos leer es exactamente
     el error que ya se evito con las unidades del modo 06 y con los MID/FMI de
     J1587. Se muestra el codigo — que es lo que se busca en el manual — y se
     dice que el estado no se pudo leer. */
  _dtcsKWP(d) {
    if (!d || d[0] !== 0x58) return [];
    /* Casi todas las implementaciones mandan el conteo despues del 0x58, pero
       algunas van directo a los codigos. Se elige el desplazamiento que deja
       una cantidad exacta de registros de 3 bytes en vez de suponer. */
    let off = null;
    if ((d.length - 2) % 3 === 0 && d.length >= 5) off = 2;
    else if ((d.length - 1) % 3 === 0 && d.length >= 4) off = 1;
    if (off === null) return [];
    const out = [];
    for (let i = off; i + 2 < d.length; i += 3) {
      const hi = d[i], lo = d[i + 1];
      if ((hi === 0 && lo === 0) || (hi === 0xFF && lo === 0xFF)) continue;
      const codigo = this._decodeDTC(hi.toString(16).padStart(2, '0') + lo.toString(16).padStart(2, '0'));
      if (!codigo || out.some(x => x.codigo === codigo)) continue;
      out.push({ codigo, base: codigo, estado: d[i + 2],
                 activo: false, pendiente: false, confirmado: false, estadoDesconocido: true });
    }
    return out;
  },

  /* ── El tercer byte del codigo: QUE le pasa al circuito ─────────────────
     Un codigo UDS son 3 bytes. Los dos primeros son el numero (C1707) y el
     tercero es el TIPO DE FALLA (ISO 14229-1, DTCFailureType). Se mostraba
     crudo — "C1707-04" — y ese sufijo no le dice nada a nadie, cuando es
     justamente la mitad util del codigo: no es lo mismo un sensor con el cable
     cortado que uno que manda una senal fuera de rango. Uno se arregla con un
     empalme y el otro cambiando la pieza.

     Solo van los tipos de los que hay certeza. Los que no estan en la tabla se
     muestran con su numero y "ver manual", igual que ya se hace con los P1xxx
     de fabricante y con los MID/FMI de J1587: el numero manda, la traduccion
     acompana y nunca se inventa.

     OJO: hay marcas que usan este byte a su manera. Por eso la descripcion se
     muestra como lectura estandar, no como palabra final. */
  _TIPO_FALLA: {
    0x01:'falla electrica general',        0x02:'falla general de la senal',
    0x11:'circuito en corto a tierra',     0x12:'circuito en corto a positivo',
    0x13:'circuito abierto',               0x14:'circuito abierto o en corto a tierra',
    0x15:'circuito abierto o en corto a positivo',
    0x16:'voltaje por debajo del limite',  0x17:'voltaje por encima del limite',
    0x1A:'resistencia por debajo del limite', 0x1B:'resistencia por encima del limite',
    0x1C:'voltaje fuera de rango',
    0x21:'senal por debajo del minimo',    0x22:'senal por encima del maximo',
    0x23:'senal trabada en bajo',          0x24:'senal trabada en alto',
    0x29:'senal invalida',                 0x2A:'senal erratica',
    0x31:'sin senal',
    0x49:'falla electronica interna del modulo',
    0x62:'la senal no coincide con la de otro modulo',
    0x64:'senal fuera de lo posible (implausible)',
    0x92:'funcionamiento incorrecto',      0x96:'falla interna del componente',
  },
  _descTipoFalla(sub) {
    if (sub == null) return null;
    const t = this._TIPO_FALLA[sub];
    const h = '0x' + sub.toString(16).padStart(2, '0').toUpperCase();
    return t ? { txt: t, cierto: true, hex: h }
             : { txt: `tipo de falla ${h} — ver manual de la marca`, cierto: false, hex: h };
  },

  /* Respuesta a UDS 19 02: [59][02][máscara][DTC 3 bytes + estado]…
     El estado trae los bits que distinguen una falla presente AHORA de una
     guardada de antes — la diferencia entre mandar a revisar y no. */
  /* TODOS los códigos que el módulo dice soportar (19 0A), sin filtrar por
     estado: acá no se buscan fallas sino el catálogo posible del módulo. */
  _dtcsSoportados(d) {
    if (!d || d[0] !== 0x59 || d[1] !== 0x0A) return [];
    const out = [];
    for (let i = 3; i + 3 < d.length; i += 4) {
      const a = d[i], b = d[i + 1], sub = d[i + 2];
      if ((a === 0 && b === 0 && sub === 0) || (a === 0xFF && b === 0xFF)) continue;
      const codigo = ['P','C','B','U'][a >> 6] + ((a >> 4) & 3) +
                     (a & 0x0F).toString(16).toUpperCase() + b.toString(16).padStart(2, '0').toUpperCase();
      const ftb = sub ? sub.toString(16).padStart(2, '0').toUpperCase() : '';
      if (!out.some(x => x.codigo === codigo && x.ftb === ftb)) out.push({ codigo, ftb });
    }
    return out;
  },

  /* Guarda el catálogo de cada módulo del escaneo para el modelo. No bloquea
     el escaneo ni lo tumba: si la base no está, el escaneo sigue igual. */
  async _guardarCatalogoDTC(porModulo, veh) {
    if (!veh || !veh.marca || typeof DB === 'undefined' || typeof DB.upsertDTCsModulo !== 'function') return 0;
    const filas = [];
    for (const m of porModulo || []) {
      if (m.ext || !(m.soportados || []).length) continue;
      for (const c of m.soportados)
        filas.push({ marca: veh.marca, modelo: veh.modelo || '', req: Number(m.ecu), codigo: c.codigo, ftb: c.ftb || '', fuente: '19 0A' });
    }
    if (!filas.length) return 0;
    const { error } = await DB.upsertDTCsModulo(filas).catch(e => ({ error: e }));
    if (error) { console.warn('catalogo DTC:', error.message || error); return 0; }
    return filas.length;
  },

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
      out.push({ codigo: full, base: codigo, estado: st, activo, pendiente, confirmado,
                 tipo: sub ? this._descTipoFalla(sub) : null });
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
  }
  }));
})();
