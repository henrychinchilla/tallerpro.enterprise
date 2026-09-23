/* NexusPro — Diagnóstico OBD · Escaneo por módulo: mapa de acceso del modelo, nombres de módulos (regla única), libreta del taller y la IA que bautiza los módulos.

   Es parte de Modulos.diagnostico_obd: el objeto se define en
   diagnostico_obd.js (núcleo y conexión) y cada parte le agrega sus métodos.
   Se dividió el 2026-09-22 porque el archivo único pasaba de 9.000 líneas.
   defineProperties + getOwnPropertyDescriptors (y no Object.assign) para que
   los get/set viajen como accesores y no como el valor del momento. */
(() => {
  const M = Modulos.diagnostico_obd;
  Object.defineProperties(M, Object.getOwnPropertyDescriptors({

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
          /* Un mapa de K-line no sirve para el barrido por CAN: sus "req" son
             destinos de un byte, no IDs CAN. Preguntar por 0x18 en CAN es
             preguntarle a nadie, y ademas ensuciaria la lista de faltantes. */
          if (typeof m.req !== 'number' || m.kline) continue;
          /* Los mapas guardados antes de saber esto traen 0x7DF y 0x7E8 como
             si fueran módulos. Filtrarlos al leerlos evita que un escaneo viejo
             siga arrastrando fantasmas para siempre. */
          if (!m.ext && this._DIR_NO_ES_MODULO(m.req)) continue;
          /* La clave es SOLO la dirección de ida. Un mapa hecho por ELM guarda
             `resp: null` —el dongle no revela desde dónde contesta—, así que
             con la respuesta en la clave el mismo módulo entraba dos veces:
             una por el escaneo de USB y otra por el de Bluetooth, y el mapa
             del modelo decía tener el doble de módulos de los que hay. */
          const k = m.req;
          const y = porDir.get(k);
          if (y) {
            y.visto++;
            if (y.resp == null && m.resp != null) y.resp = m.resp;   // la de USB manda
            if (!y.nombre && m.nombre) y.nombre = m.nombre;
            continue;
          }
          porDir.set(k, { req:m.req, resp:m.resp, ext:!!m.ext, nombre:m.nombre, servicio:m.servicio, visto:1 });
        }
      }
      /* Y encima, lo que el TALLER declaró a mano para este modelo. El barrido
         solo encuentra lo que contesta en 0x700-0x7EF: un módulo en otra red,
         en 29 bits o en una dirección propia no aparece nunca por su cuenta.
         Declarado, se le pregunta siempre — y si no contesta sale en la lista
         de ausentes, que es distinto de "este modelo no lo trae". */
      /* El guard NO es paranoia de pruebas: el Service Worker puede estar
         sirviendo un db.js viejo junto a este archivo nuevo (son dos recursos
         distintos con dos vidas de caché distintas). Sin él, llamar a una
         función que todavía no existe tira TypeError, lo atrapa el catch de
         abajo y `_mapaConocido` devuelve null — o sea que el mapa conocido
         entero, que funcionaba desde hace meses, deja de funcionar por una
         función nueva. Un agregado no puede tumbar lo que ya andaba. */
      const declarados = typeof DB.getModulosVehiculo === 'function'
        ? await DB.getModulosVehiculo({ marca:v.marca, modelo:v.modelo, anio:v.anio }).catch(() => [])
        : [];
      this._modulosDeclarados = declarados;
      for (const d of declarados) {
        const req = Number(d.req);
        if (!Number.isInteger(req)) continue;
        const y = porDir.get(req);
        if (y) {
          /* Ya lo conocíamos por los escaneos: el nombre que le puso el taller
             manda sobre el que dedujo el barrido. */
          y.nombre = d.nombre;
          y.declarado = true;
          if (y.resp == null && d.resp != null) y.resp = Number(d.resp);
          continue;
        }
        porDir.set(req, { req, resp: d.resp == null ? null : Number(d.resp), ext: !!d.ext,
                          nombre: d.nombre, servicio: null, visto: 0, declarado: true });
      }

      if (!porDir.size) return null;
      return { marca:v.marca, modelo:v.modelo, anio:v.anio, n: conMapa, declarados: declarados.length,
               modulos: [...porDir.values()].sort((a, b) => b.visto - a.visto || a.req - b.req) };
    } catch (e) { console.warn('_mapaConocido:', e.message); return null; }
  },

  /* El nombre que el taller le puso a esta dirección en ESTE modelo. Es la
     fuente más específica que hay: gana sobre la tabla de direcciones comunes
     y sobre lo que el módulo diga de sí mismo, porque quien lo escribió tenía
     el vehículo enfrente. */
  _nombreDeclarado(req) {
    const d = (this._modulosDeclarados || []).find(x => Number(x.req) === Number(req));
    /* "Sin identificar 0x7B3" o "Pieza 94003G6920" quedaron guardados como si
       fueran el nombre del taller, y como el taller gana sobre todo, tapaban la
       identificación real: la pantalla decía "Sin identificar" y una línea más
       abajo "Climatización". Un marcador no es un nombre. */
    return d && !this._nombreGenerico(d.nombre, req) ? d.nombre : null;
  },

  /* EL nombre de un módulo, y de dónde sale. Un solo orden para todas las
     pantallas, para que el título nunca contradiga a la línea de abajo:
       taller (nombre real) → el propio módulo (F197) → la IA → la tabla de
       direcciones DE ESA MARCA → el grupo del número de pieza → sus códigos. */
  _nombreResuelto(m, marca) {
    const ecu = Number(m.ecu), id = m.ident || {};
    const hex = this._hexDir(ecu);
    const taller = this._nombreDeclarado(ecu);
    if (taller) return { nombre: taller, origen: 'nombrado por el taller', firme: true };
    if (this._UDS_NOMBRES[ecu]) return { nombre: this._UDS_NOMBRES[ecu], origen: 'dirección fijada por la norma ISO 15765-4', firme: true };
    if (id.nombre && !this._nombreGenerico(id.nombre, ecu)) return { nombre: String(id.nombre), origen: 'el módulo declara su nombre (F197)', firme: true };
    const h = id.hmc;
    if (h && h.sigla && this._SIGLAS_HMC[h.sigla])
      return { nombre: this._SIGLAS_HMC[h.sigla], origen: `el módulo se identifica como «${h.sigla}» (22 F1 00: ${h.texto})`, firme: true };
    if (id.ia && id.ia.nombre && !this._nombreGenerico(id.ia.nombre, ecu))
      return { nombre: id.ia.nombre, origen: `identificado por IA · confianza ${id.ia.confianza || '—'}${id.ia.fuente ? ` · ${id.ia.fuente}` : ''}`, firme: true };
    const dir = this._sugerenciaPorDireccion(ecu, marca);
    if (dir) return { nombre: dir.nombre, origen: `por su dirección ${hex} en ${marca} (${dir.fuente})`, firme: true };
    /* De acá para abajo el nombre es PROVISIONAL: sirve para no mostrar una
       dirección pelada, pero la IA igual lo investiga con la evidencia. */
    if (h && h.sigla) return { nombre: `Módulo ${h.sigla}`, origen: `el módulo se identifica como «${h.sigla}» (22 F1 00: ${h.texto})`, firme: false };
    const ref = id.referencia ? this._sugerenciaPorReferencia(id.referencia) : null;
    if (ref) return { nombre: ref.sistema, origen: `por su número de pieza ${id.referencia} (grupo ${ref.grupo})`, firme: false };
    const l = (m.codigos || []).map(c => String(c.codigo || '')[0]);
    const fam = l.length && l.every(x => x === l[0]) ? ({ C:'Chasis / frenos', B:'Carrocería', U:'Red de comunicación' })[l[0]] : null;
    if (fam) return { nombre: fam, origen: 'por el tipo de códigos que reporta', firme: false };
    return { nombre: `Sin identificar ${hex}`, origen: 'no publicó identificación y su dirección no está documentada para esta marca', firme: false };
  },

  /* Parámetros en vivo de un módulo por UDS 22. APAGADO a propósito.

     Le preguntaba a cada DIRECCIÓN identificadores que nadie verificó para esa
     marca, y decodificaba lo que volviera con fórmulas supuestas: 0x7D2 se
     trataba como TPMS, pero en el Picanto 0x7D2 es la CARROCERÍA — los bytes
     del BCM salían en pantalla como "presión de llantas" en un vehículo que no
     tiene TPMS. Con 0x7D4 igual: se leía como dirección eléctrica y en ese
     Picanto reportó P0741, que es de transmisión.

     La dirección no dice qué módulo es, y un DID no dice qué significa: las
     dos cosas tienen que venir de una definición VERIFICADA (capa OEM, migs
     138/139: "una definición no verificada nunca transmite"). Hasta que ese
     camino alimente esta ficha, no se lee nada y la ficha no muestra números. */
  async _leerParametrosUDSModulo(m) {
    return {};
  },

  /* Pregunta sólo a las direcciones que ya se sabe que contestan en este
     modelo. Mismo Tester Present del barrido: es de solo lectura. */
  async _probarConocidas(conocidas) {
    const vivos = [];
    const extPrev = this._canExt;
    try {
      for (const c of conocidas) {
        /* Por ELM la cabecera se fija con ATSH de TRES dígitos: una dirección
           de 29 bits no entra ahí. Preguntarla igual no es preguntar de más,
           es dejar la cabecera mal puesta para la siguiente. */
        if (c.ext && this._esELM()) continue;
        /* El mapa guarda si a ese modulo se le habla en 11 o en 29 bits: la
           trama se arma distinta, asi que preguntar con el direccionamiento
           equivocado es no preguntar. */
        this._canExt = !!c.ext;
        /* Se acepta cualquier respuesta que no sea el eco de la propia pregunta:
           el id de vuelta no siempre es el mismo que la vez pasada. */
        const r = await this._tocarPuerta(c.req);
        if (r) vivos.push({ req: c.req, resp: r.resp != null ? r.resp : c.resp,
                            ext: !!c.ext, servicio: c.servicio || null,
                            declarado: !!c.declarado });
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
      if (log) {
        /* De dónde salió cada dirección: decir "en 0 escaneos previos" cuando
           las direcciones las escribió el taller a mano es confuso. */
        const dec = (mapa.declarados || 0);
        const origen = [mapa.n ? `${mapa.n} escaneo(s) previo(s)` : null,
                        dec ? `${dec} declarado(s) por el taller` : null].filter(Boolean).join(' + ');
        log(`&nbsp;&nbsp;Mapa conocido de ${UI.esc(mapa.marca)} ${UI.esc(mapa.modelo)}${mapa.anio ? ' ' + mapa.anio : ''}: <b>${conocidas.length} módulo(s)</b>${origen ? ` (${origen})` : ''} — preguntando ahí primero...`);
      }
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
    if (mods.length <= 2 && !this._esELM()) {
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
          `${faltantes.map(f => UI.esc(f.nombre || '0x' + f.req.toString(16).toUpperCase())).join(', ')}` +
          ` — en ${UI.esc(mapa.marca)} ${UI.esc(mapa.modelo)} se esperaban. ` +
          (faltantes.every(f => f.declarado && !f.visto)
            ? 'Están declarados por el taller pero todavía nunca contestaron: revisá la dirección antes de culpar al vehículo.'
            : 'Puede estar dañado, desconectado o sin alimentación.') + '</span>');

    if (log) log(`<b>${mods.length} módulo(s) encontrados</b> — leyendo códigos de cada uno...`);

    const res = [];
    /* try/finally y no una asignacion al final: si algo revienta en el bucle,
       el llamador atrapa el error y SIGUE con el escaneo — pero _canExt quedaria
       apuntando al direccionamiento del ultimo modulo y todas las tramas CAN
       posteriores (sensores en vivo, borrado de codigos) saldrian mal armadas.
       Un flag global que se corrompe en silencio es el peor tipo de error: no
       falla donde se rompio. */
    const extPrev = this._canExt;
    try {
    for (const m of mods) {
      /* Mezclamos modulos de 11 y de 29 bits en la misma lista, asi que la
         trama se arma segun el modulo al que le toca, no segun como se
         conecto el vehiculo. */
      this._canExt = !!m.ext;
      /* Si el mapa del modelo ya sabe que a este modulo hay que hablarle en
         KWP2000, se empieza por ahi: probar primero lo que la vez pasada no
         funciono es gastar dos consultas por gusto. */
      let d = null, cods = [];
      if (m.servicio && m.servicio.indexOf('KWP') >= 0) {
        d = await this._udsPedir(m.req, m.resp, [0x18, 0x00, 0xFF, 0x00], 2000);
        cods = this._dtcsKWP(d);
      }
      if (!cods.length) {
        d = await this._udsPedir(m.req, m.resp, [0x19, 0x02, 0xFF], 2500);
        cods = this._dtcsUDS(d);
      }
      /* Con qué se le sacaron los códigos: al guardarlo en el mapa, el próximo
         escaneo de este modelo sabe que a este módulo hay que abrirle sesión
         extendida antes de preguntarle. */
      let servicio = (cods.length && d && d[0] === 0x58) ? '18 00 FF 00 (KWP2000)' : '19 02';

      /* Hay módulos que en sesión por defecto contestan "servicio no soportado"
         (7F 19 11) o devuelven la lista vacía, y solo entregan sus códigos en
         sesión extendida. Es el caso típico de tracción y carrocería: sin este
         reintento parecen sanos cuando no lo están. */
      const negó = d && d[0] === 0x7F;
      let sesionAbierta = false;
      if ((negó || !cods.length)) {
        const s = await this._udsPedir(m.req, m.resp, [0x10, 0x03], 1500);
        if (s && s[0] === 0x50) {
          sesionAbierta = true;
          const d2 = await this._udsPedir(m.req, m.resp, [0x19, 0x02, 0xFF], 2500);
          const c2 = this._dtcsUDS(d2);
          if (c2.length) { d = d2; cods = c2; servicio = '19 02 (sesión extendida)'; }
        }
      }

      /* Todavia sin codigos. Antes se daba por sano: ahora se le pregunta de
         las otras dos formas que existen antes de afirmarlo.

         19 0A pide TODOS los codigos que el modulo soporta, no solo los que
         hacen match con una mascara. Mismo formato de respuesta que 19 02, asi
         que lo lee el mismo parser — y el mismo filtro por bits de estado evita
         el problema del TCM del Rogue, que contesto ~60 entradas con el monitor
         sin correr. */
      if (!cods.length) {
        const dA = await this._udsPedir(m.req, m.resp, [0x19, 0x0A], 2000);
        const cA = this._dtcsUDS(dA);
        if (cA.length) { d = dA; cods = cA; servicio = '19 0A'; }
      }
      /* Y por ultimo KWP2000, para los modulos anteriores a UDS. Es de solo
         lectura, y a un modulo que si habla UDS le resbala (contesta "servicio
         no soportado"). */
      if (!cods.length) {
        const dK = await this._udsPedir(m.req, m.resp, [0x18, 0x00, 0xFF, 0x00], 2000);
        const cK = this._dtcsKWP(dK);
        if (cK.length) { d = dK; cods = cK; servicio = '18 00 FF 00 (KWP2000)'; }
      }

      /* El nombre propio del modulo gana sobre la deduccion por direccion,
         pero NO sobre las dos que la norma fija (motor y transmision): ahi la
         tabla es mas clara para el mecanico que la cadena interna del ECU. */
      /* La identidad se pide SIEMPRE, no solo cuando falta el nombre: la
         referencia del módulo sirve igual en el motor, que sí tiene nombre.
         Y se guarda con el escaneo, no al abrir la ficha: si hay que abrir once
         fichas para ver once referencias, en la práctica no se ven nunca. */
      const ident = await this._identidadModulo(m).catch(() => null);

      /* Extracción profunda de parámetros UDS en vivo (TCM, TPMS, MDPS) */
      const paramsEsp = await this._leerParametrosUDSModulo(m).catch(() => ({}));
      if (Object.keys(paramsEsp).length && this._scan) {
        this._scan.datos = { ...(this._scan.datos || {}), ...paramsEsp };
      }

      /* Devolver el módulo a la sesión por defecto. Una sesión extendida abierta
         es lo que enciende el testigo de la dirección (el volante con "!") y el
         de otros sistemas mientras dura: el módulo avisa, con razón, que está
         en modo diagnóstico. Sin este 10 01 el testigo se quedaba prendido
         hasta apagar el vehículo — verificado en el Picanto 2019 el 2026-09-17.
         Va antes de nada más por si el resto falla. */
      if (sesionAbierta) {
        await this._udsPedir(m.req, m.resp, [0x10, 0x01], 1200).catch(() => {});
      }

      /* El catálogo del módulo: TODO lo que declara poder reportar (19 0A). Se
         pide siempre — antes solo como último recurso para buscar fallas, y la
         lista se tiraba. Es lectura pura. */
      let soportados = [];
      if (d && servicio.indexOf('KWP') < 0) {   // KWP2000 no entiende 19 0A
        const dS = servicio === '19 0A' ? d : await this._udsPedir(m.req, m.resp, [0x19, 0x0A], 3000).catch(() => null);
        soportados = this._dtcsSoportados(dS);
      }

      const nombre = this._nombreResuelto({ ecu: m.req, ident, codigos: cods }, this._marcaBarrido).nombre;
      const respReal = m.resp != null ? m.resp : (this._respAprendida[m.req] != null ? this._respAprendida[m.req] : null);
      res.push({ ecu: m.req, resp: respReal, ext: !!m.ext, nombre, codigos: cods, respondio: !!d, servicio,
                 soportados: soportados.length ? soportados : undefined,
                 ident: ident || null, params_oem: paramsEsp, sesion_devuelta: sesionAbierta || undefined,
                 nuevo: !!conocidas.length && !conocidas.some(c => c.req === m.req) });
      if (log && cods.length) {
        const act = cods.filter(c => c.activo).length;
        log(`&nbsp;&nbsp;<b>${nombre}</b>: ${cods.length} código(s)` +
            (act ? ` <span style="color:var(--red)">(${act} activo${act > 1 ? 's' : ''})</span>` : ''));
      }
    }

    } finally { this._canExt = extPrev; }

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
        ${m.enlace === 'kline'
          ? `K-line · ${UI.esc(m.protocolo || 'KWP2000')} · ${m.modulos.length} módulo(s)`
          : `CAN ${m.bits} bits · ${m.baud}k · ${m.modulos.length} módulo(s)`}. Queda guardado: el próximo escaneo de
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
    /* Los declarados a mano cuentan igual: un modelo al que el taller le
       escribió sus módulos ya se sabe escanear, aunque todavía no haya un
       escaneo que lo demuestre. Sin esto, la pantalla de cobertura contestaba
       a medias. */
    const declarados = await this._declaradosDelTaller();
    const el = document.getElementById('obd-mapa-lista');
    const porModelo = new Map();
    for (const f of filas) {
      const v = f.vehiculos || {};
      const clave = [v.marca || '?', v.modelo || '?', v.anio || ''].join(' ').trim();
      const g = porModelo.get(clave) || { clave, escaneos:0, vehiculos:new Set(), dirs:new Map(),
                                          bits:null, baud:null, vias:new Set(), ultimo:f.created_at };
      g.escaneos++;
      if (f.vehiculo_id) g.vehiculos.add(f.vehiculo_id);
      const m = f.mapa_acceso || {};
      /* Por dónde se entró. Sin esto no se podía contestar si un modelo se
         mapeó con el cable o con el dongle Bluetooth, que es justamente lo que
         decide qué herramienta llevarse al vehículo siguiente. */
      if (m.via) g.vias.add(this._NOMBRE_VIA[m.via] || m.via);
      if (g.bits == null) { g.bits = m.bits; g.baud = m.baud; }
      for (const x of (m.modulos || [])) if (typeof x.req === 'number' && !g.dirs.has(x.req))
        g.dirs.set(x.req, x.nombre || ('0x' + x.req.toString(16).toUpperCase()));
      porModelo.set(clave, g);
    }
    for (const d of declarados) {
      if (!d.activo) continue;
      /* Un declarado no trae año: aplica al modelo entero. Se suma al grupo del
         modelo que coincida, y si no hay ninguno estrena el suyo. */
      const claves = [...porModelo.keys()].filter(k =>
        k.toUpperCase().startsWith([d.marca, d.modelo || ''].join(' ').trim().toUpperCase()));
      const destinos = claves.length ? claves : [[d.marca, d.modelo || '(todos los modelos)'].join(' ').trim()];
      for (const clave of destinos) {
        const g = porModelo.get(clave) || { clave, escaneos:0, vehiculos:new Set(), dirs:new Map(),
                                            bits:null, baud:null, vias:new Set(), declarados:0, ultimo:d.created_at };
        g.dirs.set(Number(d.req), d.nombre);   // el nombre del taller manda sobre el deducido
        g.declarados = (g.declarados || 0) + 1;
        porModelo.set(clave, g);
      }
    }
    const grupos = [...porModelo.values()].sort((a, b) => b.dirs.size - a.dirs.size);
    const cuerpo = !grupos.length
      ? `<p style="font-size:13px;color:var(--text3)">Todavía no hay ningún mapa. El mapa se arma solo:
         cada escaneo de un vehículo liviano guarda por dónde se le entró —por USB, y también por
         Bluetooth cuando el dongle acepta ATSH y el vehículo está en CAN de 11 bits— y desde el
         segundo del mismo modelo el escaneo empieza a usarlo.
         También se puede escribir a mano en la <b>libreta del modelo</b>, dentro del 🧠 Centro de Módulos,
         para el módulo que sabés que está
         aunque todavía no haya contestado.</p>`
      : `<table class="table" style="font-size:12px">
          <thead><tr><th>Modelo</th><th>Módulos que sabemos alcanzar</th><th style="text-align:center">Unidades</th><th style="text-align:center">Bus</th></tr></thead>
          <tbody>${grupos.map(g => `<tr>
            <td><b>${UI.esc(g.clave)}</b><div style="font-size:10px;color:var(--text3)">${g.escaneos} escaneo(s)${g.escaneos ? ` · último ${UI.fecha(g.ultimo)}` : ''}${g.declarados ? ` · ${g.declarados} declarado(s) a mano` : ''}</div></td>
            <td><span class="badge badge-cyan">${g.dirs.size}</span>
              <div style="font-size:10.5px;color:var(--text3);margin-top:3px;line-height:1.5">${[...g.dirs.values()].map(n => UI.esc(n)).join(' · ')}</div></td>
            <td style="text-align:center">${g.vehiculos.size}</td>
            <td style="text-align:center;font-size:11px;white-space:nowrap">${g.bits ? `${g.bits} bits<br>${g.baud}k` : '—'}
              ${g.vias.size ? `<div style="color:var(--text3);font-size:10px;margin-top:2px">${[...g.vias].map(v => UI.esc(v)).join(' · ')}</div>` : ''}</td>
          </tr>`).join('')}</tbody>
        </table>
        <div style="font-size:10.5px;color:var(--text3);margin-top:10px;line-height:1.5">
          Cada fila es un modelo que el taller ya sabe escanear y hasta dónde llega. Se arma solo con los
          escaneos propios — mejora con el uso y no depende de ninguna base de datos con licencia.
          <b>Módulos alcanzados</b> es lo que contestó en ese modelo, no todo lo que el vehículo trae.
        </div>`;
    if (el) el.innerHTML = cuerpo;
  },

  /* ═══════════ MÓDULOS DECLARADOS POR EL TALLER ═══════════
     El barrido automático solo encuentra lo que contesta en 0x700-0x7EF, y a lo
     que encuentra le pone el nombre que puede deducir. Esto es lo otro: la
     libreta donde el taller escribe qué módulos trae un modelo, en qué
     dirección contestan y cómo se llaman. Se pregunta siempre por ellos, aunque
     el barrido no los alcance, y si no contestan salen como AUSENTES — que es
     distinto de "este modelo no lo trae".

     No transmite nada. Una declaración es un nombre y una dirección a la que se
     pregunta con 3E 00 (Tester Present), que es de solo lectura. Lo que
     transmite vive en el catálogo OEM, con su escalera de verificación. */
  _SISTEMAS_MODULO: [
    { id:'ecm',       nombre:'Motor (ECM/PCM)' },
    { id:'tcm',       nombre:'Transmisión (TCM)' },
    { id:'abs',       nombre:'Frenos / ABS' },
    { id:'srs',       nombre:'Airbag / SRS' },
    { id:'eps',       nombre:'Dirección asistida (EPS/MDPS)' },
    { id:'bcm',       nombre:'Carrocería (BCM)' },
    { id:'ipc',       nombre:'Tablero (IPC)' },
    { id:'hvac',      nombre:'Climatización (HVAC)' },
    { id:'awd',       nombre:'Tracción 4x4 / AWD' },
    { id:'immo',      nombre:'Inmovilizador' },
    { id:'gateway',   nombre:'Puerta de enlace (gateway)' },
    { id:'adas',      nombre:'Asistencias a la conducción (ADAS)' },
    { id:'tpms',      nombre:'Presión de neumáticos (TPMS)' },
    { id:'suspension',nombre:'Suspensión' },
    { id:'carga',     nombre:'Carga / batería' },
    { id:'otro',      nombre:'Otro módulo' },
  ],
  _REDES_MODULO: [
    { id:'hs', nombre:'HS-CAN (principal)' }, { id:'ms', nombre:'MS-CAN' },
    { id:'sw', nombre:'SW-CAN / GMLAN' }, { id:'ch', nombre:'CH-CAN' },
    { id:'ls', nombre:'LS-CAN' }, { id:'kline', nombre:'K-line' },
  ],
  _PROTOS_MODULO: ['uds', 'kwp2000', 'obd2', 'j1939', 'iso9141', 'fabricante'],

  /* Igual que en _mapaConocido: el Service Worker puede servir un db.js viejo
     junto a este archivo nuevo. Una pantalla que ya existía no puede quedar en
     blanco porque se agregó una función. */
  async _declaradosDelTaller() {
    if (typeof DB.getTodosModulosVehiculo !== 'function') return [];
    try { return await DB.getTodosModulosVehiculo() || []; }
    catch (e) { console.warn('_declaradosDelTaller:', e.message); return []; }
  },

  _nombreSistema(id) {
    const x = this._SISTEMAS_MODULO.find(s => s.id === id);
    return x ? x.nombre : 'Otro módulo';
  },

  /* Marcas y modelos sugeridos. Salen del catálogo de alta de vehículos MÁS los
     vehículos que el taller ya tiene cargados: un modelo que está en el taller
     pero no en el catálogo general es el que más falta hace acá. */
  _marcasConocidas() {
    const set = new Set();
    for (const lista of Object.values(Modulos.vehiculos?._marcasPorTipo || {}))
      for (const m of lista) set.add(m);
    for (const v of (this._vehiculos || [])) if (v.marca) set.add(String(v.marca).trim());
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  },
  _modelosConocidos(marca) {
    const set = new Set();
    const igual = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
    for (const m of (Modulos.vehiculos?._modelosPorMarca?.[marca] || [])) set.add(m);
    for (const porMarca of Object.values(Modulos.vehiculos?._modelosEspeciales || {}))
      for (const m of (porMarca[marca] || [])) set.add(m);
    for (const v of (this._vehiculos || []))
      if (igual(v.marca, marca) && v.modelo) set.add(String(v.modelo).trim());
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  },

  _hexDir(n) { return n == null ? '—' : '0x' + Number(n).toString(16).toUpperCase(); },

  /* Acepta "7E0", "0x7E0" y "7e0". Devuelve null si no es una dirección. */
  _leerHex(txt) {
    const t = String(txt || '').trim().replace(/^0x/i, '');
    if (!t) return null;
    if (!/^[0-9A-Fa-f]{1,8}$/.test(t)) return NaN;
    return parseInt(t, 16);
  },

  async modalModulosVehiculo() {
    this._libretaEnCentro = false;
    UI.modal('🧩 Módulos por vehículo', `<div id="obd-mods-cuerpo" style="font-size:13px">
      Cargando módulos declarados…</div>`, '980px');
    if (!this._vehiculos || !this._vehiculos.length) {
      try { this._vehiculos = await DB.getVehiculos() || []; } catch (_) { this._vehiculos = []; }
    }
    this._modsDeclarados = await this._declaradosDelTaller();
    this._pintarModulosVehiculo();
  },

  _pintarModulosVehiculo() {
    const el = document.getElementById('obd-mods-cuerpo');
    if (!el) return;
    const filas = this._modsDeclarados || [];
    const puedeEditar = typeof puedeAccion !== 'function' || puedeAccion('diagnostico_obd', 'editar');

    const porModelo = new Map();
    for (const f of filas) {
      const clave = [f.marca, f.modelo || '(todos los modelos)'].join(' · ');
      if (!porModelo.has(clave)) porModelo.set(clave, []);
      porModelo.get(clave).push(f);
    }

    const cabecera = `
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <div style="font-size:12px;color:var(--text2);max-width:620px;line-height:1.55">
            ${filas.length ? `<div style="font-size:12.5px;margin-bottom:6px">
              <b>${filas.length} módulo(s) declarado(s)</b> ·
              <span style="color:var(--green)">${filas.filter(m => !this._nombreInutil(m.nombre)).length} con nombre</span> ·
              <span style="color:var(--amber)">${filas.filter(m => this._nombreInutil(m.nombre)).length} por nombrar</span>
            </div>` : ''}
          Acá se declara <b>qué módulos trae cada modelo</b> y en qué dirección contestan.
          El escaneo les pregunta siempre —aunque el barrido automático no los alcance, por estar
          en otra red o en 29 bits— y usa este nombre en el reporte en vez de “Módulo 0x745”.
          Si un módulo declarado no contesta, sale como <b>ausente</b>, que no es lo mismo que inexistente.
          <div style="color:var(--text3);margin-top:4px">Esto no transmite nada: solo se pregunta “¿hay alguien?”.</div>
        </div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd.modalTomarDelEscaneo()"
            title="Declarar los módulos que encontró el último escaneo">📡 Tomar del escaneo</button>
          ${puedeEditar && filas.some(m => !m.ext && this._DIR_NO_ES_MODULO(Number(m.req)))
            ? `<button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd.limpiarFantasmas()"
                 title="Quitar 0x7DF y 0x7E8-0x7EF, que contestan pero no son módulos">🧹 Quitar direcciones falsas</button>` : ''}
          ${puedeEditar ? `<button class="btn btn-sm btn-brand" onclick="Modulos.diagnostico_obd.editarModuloVehiculo()">＋ Agregar módulo</button>` : ''}
        </div>
      </div>`;

    if (!filas.length) {
      el.innerHTML = cabecera + `
        <div class="card" style="padding:16px;margin-top:12px;color:var(--text3);font-size:13px">
          Todavía no hay ningún módulo declarado. Dos formas de empezar:
          <b>Tomar del escaneo</b> convierte en nombres lo que el último escaneo ya encontró, y
          <b>Agregar módulo</b> sirve para el que sabés que está aunque todavía no haya contestado.
        </div>`;
      return;
    }

    el.innerHTML = cabecera + `
      <div style="max-height:56vh;overflow:auto;margin-top:12px">
      ${[...porModelo.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([clave, ms]) => `
        <div class="card" style="padding:12px;margin-bottom:9px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <b>${UI.esc(clave)}</b>
            <span class="badge badge-cyan">${ms.length} módulo(s)</span>
          </div>
          <table class="table" style="font-size:12px;margin-top:7px">
            <thead><tr><th>Módulo</th><th>Dirección</th><th>Red</th><th>Años</th><th style="text-align:right">Acciones</th></tr></thead>
            <tbody>${ms.map(m => `<tr${m.activo ? '' : ' style="opacity:.5"'}>
              <td>${this._nombreInutil(m.nombre)
                    ? `<b style="color:var(--amber)">${UI.esc(m.nombre)}</b>
                       <div style="font-size:10.5px;color:var(--amber)">⚠ falta ponerle nombre — el vehículo sí lo tiene</div>`
                    : `<b>${UI.esc(m.nombre)}</b>
                       <div style="font-size:10.5px;color:var(--text3)">${UI.esc(this._nombreSistema(m.sistema))}${m.origen === 'escaneo' ? ' · tomado del escaneo' : ''}${m.activo ? '' : ' · desactivado'}</div>`}</td>
              <td style="font-family:ui-monospace,Consolas,monospace;white-space:nowrap">${this._hexDir(m.req)} →
                ${m.resp == null ? '<span style="color:var(--text3)">?</span>' : this._hexDir(m.resp)}
                ${m.ext ? '<div style="font-size:10px;color:var(--text3)">29 bits</div>' : ''}</td>
              <td style="font-size:11px">${UI.esc((this._REDES_MODULO.find(r => r.id === m.red) || {}).nombre || m.red)}<div style="font-size:10px;color:var(--text3)">${UI.esc(m.protocolo)}</div></td>
              <td style="font-size:11px;white-space:nowrap">${m.anio_desde || m.anio_hasta ? `${m.anio_desde || '…'}–${m.anio_hasta || '…'}` : 'todos'}</td>
              <td style="text-align:right;white-space:nowrap">
                ${Modulos.btnAccion('ver', `Modulos.diagnostico_obd.verModuloVehiculo('${m.id}')`)}
                ${Modulos.btnAccion('editar', `Modulos.diagnostico_obd.editarModuloVehiculo('${m.id}')`)}
                ${Modulos.btnAccion('eliminar', `Modulos.diagnostico_obd.eliminarModuloVehiculo('${m.id}','${UI.jsAttr(m.nombre)}')`)}
              </td></tr>`).join('')}</tbody>
          </table>
        </div>`).join('')}
      </div>`;
  },

  verModuloVehiculo(id) {
    const m = (this._modsDeclarados || []).find(x => x.id === id);
    if (!m) return;
    UI.modal(`🧩 ${m.nombre}`, `<div class="card" style="padding:14px;font-size:13px">
      <b>${UI.esc(m.marca)} ${UI.esc(m.modelo || '(todos los modelos)')}</b>
      ${m.anio_desde || m.anio_hasta ? ` · ${m.anio_desde || '…'}–${m.anio_hasta || '…'}` : ''}
      <table class="table" style="margin-top:9px;font-size:12.5px"><tbody>
        <tr><td style="color:var(--text3)">Sistema</td><td>${UI.esc(this._nombreSistema(m.sistema))}</td></tr>
        <tr><td style="color:var(--text3)">Se le pregunta en</td><td style="font-family:ui-monospace,Consolas,monospace">${this._hexDir(m.req)}${m.ext ? ' (29 bits)' : ''}</td></tr>
        <tr><td style="color:var(--text3)">Contesta desde</td><td style="font-family:ui-monospace,Consolas,monospace">${m.resp == null ? 'no se sabe — por Bluetooth el ELM327 no lo revela' : this._hexDir(m.resp)}</td></tr>
        <tr><td style="color:var(--text3)">Red / protocolo</td><td>${UI.esc((this._REDES_MODULO.find(r => r.id === m.red) || {}).nombre || m.red)} · ${UI.esc(m.protocolo)}</td></tr>
        <tr><td style="color:var(--text3)">Origen</td><td>${({ escaneo:'Tomado de un escaneo real', paquete:'Vino en un paquete',
          ia:'🤖 Identificado por la IA — la fuente está en la nota' })[m.origen] || 'Escrito a mano'}</td></tr>
        ${m.nota ? `<tr><td style="color:var(--text3)">Nota</td><td>${UI.esc(m.nota)}</td></tr>` : ''}
      </tbody></table>
      <div style="font-size:11px;color:var(--text3);margin-top:8px">
        Declarar un módulo no transmite nada: el escaneo le pregunta “¿hay alguien?” (Tester Present),
        que es de solo lectura.</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="Modulos.diagnostico_obd.modalModulosVehiculo()">Volver</button>
      ${Modulos.btnAccion('editar', `Modulos.diagnostico_obd.editarModuloVehiculo('${m.id}')`)}
    </div>`, '600px');
  },

  editarModuloVehiculo(id) {
    const m = (this._modsDeclarados || []).find(x => x.id === id) || {};
    const anios = Array.from({ length: new Date().getFullYear() - 1979 }, (_, i) => new Date().getFullYear() - i);
    const marcas = this._marcasConocidas();
    const modelos = this._modelosConocidos(m.marca || '');
    UI.modal(id ? 'Editar módulo declarado' : 'Agregar módulo al vehículo', `
      <div class="form-grid">
        <div><label class="form-label">Marca *</label>
          <input class="form-input" id="mod-marca" list="mod-marcas-list" autocomplete="off"
            value="${UI.esc(m.marca || '')}" placeholder="Kia, Toyota, Hyundai…"
            oninput="Modulos.diagnostico_obd._onMarcaModulo()">
          <datalist id="mod-marcas-list">${marcas.map(x => `<option value="${UI.esc(x)}">`).join('')}</datalist></div>
        <div><label class="form-label">Modelo</label>
          <input class="form-input" id="mod-modelo" list="mod-modelos-list" autocomplete="off"
            value="${UI.esc(m.modelo || '')}" placeholder="Vacío = toda la marca">
          <datalist id="mod-modelos-list">${modelos.map(x => `<option value="${UI.esc(x)}">`).join('')}</datalist></div>

        <div><label class="form-label">Sistema</label>
          <select class="form-select" id="mod-sistema" onchange="Modulos.diagnostico_obd._sugerirNombreModulo()">
            ${this._SISTEMAS_MODULO.map(x => `<option value="${x.id}" ${m.sistema === x.id ? 'selected' : ''}>${UI.esc(x.nombre)}</option>`).join('')}
          </select></div>
        <div><label class="form-label">Nombre que verá el mecánico *</label>
          <input class="form-input" id="mod-nombre" maxlength="60" value="${UI.esc(m.nombre || '')}"
            placeholder="Airbag / SRS"></div>

        <div><label class="form-label">Dirección de solicitud * (hex)</label>
          <input class="form-input" id="mod-req" autocomplete="off" placeholder="7E0"
            value="${m.req != null ? Number(m.req).toString(16).toUpperCase() : ''}"
            style="font-family:ui-monospace,Consolas,monospace"></div>
        <div><label class="form-label">Dirección de respuesta (hex, opcional)</label>
          <input class="form-input" id="mod-resp" autocomplete="off" placeholder="Vacío si no se sabe"
            value="${m.resp != null ? Number(m.resp).toString(16).toUpperCase() : ''}"
            style="font-family:ui-monospace,Consolas,monospace"></div>

        <div><label class="form-label">Red</label>
          <select class="form-select" id="mod-red">
            ${this._REDES_MODULO.map(x => `<option value="${x.id}" ${(m.red || 'hs') === x.id ? 'selected' : ''}>${UI.esc(x.nombre)}</option>`).join('')}
          </select></div>
        <div><label class="form-label">Protocolo</label>
          <select class="form-select" id="mod-proto">
            ${this._PROTOS_MODULO.map(x => `<option value="${x}" ${(m.protocolo || 'uds') === x ? 'selected' : ''}>${x.toUpperCase()}</option>`).join('')}
          </select></div>

        <div><label class="form-label">Año desde</label>
          <select class="form-select" id="mod-anio-desde"><option value="">Sin límite</option>
            ${anios.map(x => `<option ${Number(m.anio_desde) === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div><label class="form-label">Año hasta</label>
          <select class="form-select" id="mod-anio-hasta"><option value="">Sin límite</option>
            ${anios.map(x => `<option ${Number(m.anio_hasta) === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>

        <div style="grid-column:1/-1"><label class="form-label">
          <input type="checkbox" id="mod-ext" ${m.ext ? 'checked' : ''}> Direccionamiento de 29 bits</label>
          <div style="font-size:11px;color:var(--text3)">Marcalo solo si la dirección es de la forma 18DAxxF1. Por Bluetooth (ELM327) no se puede preguntar en 29 bits.</div></div>

        <div style="grid-column:1/-1"><label class="form-label">Nota (opcional)</label>
          <input class="form-input" id="mod-nota" maxlength="200" value="${UI.esc(m.nota || '')}"
            placeholder="Dónde está, en qué versiones aparece, de dónde salió el dato…"></div>

        <div style="grid-column:1/-1"><label class="form-label">
          <input type="checkbox" id="mod-activo" ${m.id && !m.activo ? '' : 'checked'}> Activo
          </label><div style="font-size:11px;color:var(--text3)">Desactivado deja de preguntarse en los escaneos, pero no se borra.</div></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="Modulos.diagnostico_obd.modalModulosVehiculo()">Cancelar</button>
        <button class="btn btn-brand" onclick="Modulos.diagnostico_obd.guardarModuloVehiculo('${id || ''}')">Guardar</button>
      </div>`, '760px');
  },

  _onMarcaModulo() {
    const marca = document.getElementById('mod-marca')?.value || '';
    const dl = document.getElementById('mod-modelos-list');
    if (dl) dl.innerHTML = this._modelosConocidos(marca).map(x => `<option value="${UI.esc(x)}">`).join('');
  },

  /* Poner el nombre sugerido del sistema, sin pisar lo que el usuario escribió:
     el nombre es lo que va a leer el mecánico y puede querer el suyo. */
  _sugerirNombreModulo() {
    const sel = document.getElementById('mod-sistema'), nom = document.getElementById('mod-nombre');
    if (!sel || !nom) return;
    const sugeridos = this._SISTEMAS_MODULO.map(x => x.nombre);
    if (nom.value.trim() && !sugeridos.includes(nom.value.trim())) return;
    nom.value = this._nombreSistema(sel.value);
  },

  async guardarModuloVehiculo(id) {
    const v = x => (document.getElementById(x)?.value || '').trim();
    const marca = v('mod-marca'), nombre = v('mod-nombre');
    if (!marca) return UI.toast('La marca es obligatoria', 'error');
    if (!nombre) return UI.toast('Ponele un nombre: es lo que va a leer el mecánico en el reporte', 'error');

    const ext = !!document.getElementById('mod-ext')?.checked;
    const req = this._leerHex(v('mod-req'));
    if (req == null) return UI.toast('Falta la dirección de solicitud (por ejemplo 7E0)', 'error');
    if (Number.isNaN(req)) return UI.toast('La dirección de solicitud no es un hexadecimal válido', 'error');
    if (!ext && req > 0x7FF)
      return UI.toast('Una dirección de 11 bits llega hasta 0x7FF. Si es de 29 bits, marcá la casilla.', 'error');
    if (req > 0x1FFFFFFF) return UI.toast('Esa dirección no existe ni en 29 bits', 'error');

    const resp = this._leerHex(v('mod-resp'));
    if (Number.isNaN(resp)) return UI.toast('La dirección de respuesta no es un hexadecimal válido', 'error');
    if (resp != null && resp > 0x1FFFFFFF) return UI.toast('La dirección de respuesta no existe', 'error');

    const desde = Number(v('mod-anio-desde')) || null, hasta = Number(v('mod-anio-hasta')) || null;
    if (desde && hasta && desde > hasta) return UI.toast('El año inicial no puede ser mayor al final', 'error');

    const fila = {
      id: id || undefined, marca, modelo: v('mod-modelo') || null,
      anio_desde: desde, anio_hasta: hasta,
      nombre, sistema: v('mod-sistema') || 'otro',
      req, resp, ext, red: v('mod-red') || 'hs', protocolo: v('mod-proto') || 'uds',
      nota: v('mod-nota') || null,
      activo: !!document.getElementById('mod-activo')?.checked,
    };
    if (!id) fila.origen = 'manual';

    const r = await DB.upsertModuloVehiculo(fila);
    if (r.error) {
      /* 23505 es el índice único: la misma dirección ya está declarada en ese
         modelo. Decirlo así evita que alguien lea "error 23505" y crea que la
         herramienta se rompió. */
      const msg = /23505|duplicate|unique/i.test(r.error.message || '')
        ? `La dirección ${this._hexDir(req)} ya está declarada en ${marca} ${fila.modelo || '(todos los modelos)'}`
        : r.error.message;
      return UI.toast(msg, 'error');
    }
    UI.toast(id ? 'Módulo actualizado ✓' : 'Módulo agregado ✓');
    this._volverDeLibreta();
  },

  eliminarModuloVehiculo(id, nombre) {
    Modulos.eliminarRegistro('obd_modulos_vehiculo', id, nombre, () => this._volverDeLibreta());
  },

  /* ═══════════ LA LIBRETA VIVE DENTRO DEL CENTRO ═══════════
     Henry, 2026-09-22: «el mismo módulo que se llama Centro de Módulos y
     Módulos, ¿para qué son? no los entiendo». Tenía razón: eran dos pantallas
     para un solo trabajo. La libreta del modelo —qué módulos trae y en qué
     dirección contestan— quedó adentro del Centro, que es donde se la mira.
     El alta, la edición y el borrado son los mismos de siempre; lo único que
     cambia es a dónde se vuelve al terminar. */
  _volverDeLibreta() {
    this._modulosDeclarados = null;   // acaba de cambiar: que se relea
    this._modsDeclarados = null;
    if (this._libretaEnCentro) return this.modalCentroModulos(this._centroScan);
    return this.modalModulosVehiculo();
  },

  /* Abre el formulario de la libreta desde el Centro. Sin `id` es un alta, y
     entonces viene con la marca y el modelo del vehículo ya puestos: es la
     libreta DE ESTE MODELO, no un formulario en blanco. */
  async editarDeLaLibreta(id) {
    this._libretaEnCentro = true;
    if (!this._modsDeclarados) {
      try { this._modsDeclarados = await this._declaradosDelTaller(); } catch (_) { this._modsDeclarados = []; }
    }
    this.editarModuloVehiculo(id || undefined);
    if (id) return;
    const veh = this._vehiculoDe(this._centroScan || this._scan || {});
    const pon = (k, v) => { const el = document.getElementById(k); if (el && v != null) el.value = v; };
    pon('mod-marca', veh.marca || '');
    pon('mod-modelo', veh.modelo || '');
    this._onMarcaModulo();
  },

  /* Convertir en nombres lo que el escaneo ya encontró. Es el camino corto: el
     vehículo ya contestó desde esas direcciones, así que no hay nada que
     adivinar — solo falta decir cómo se llama cada una. */
  /* ═══════════ SOBRE QUÉ ESCANEO SE TRABAJA ═══════════
     `_scan` es SOLO el escaneo EN CURSO. Al recargar la app —o al abrir uno
     guardado desde la lista— queda en null, y todo lo que dependía de él decía
     "no hay escaneos" con la pantalla llena de escaneos. Reportado el
     2026-09-17: "me dice que no hay escaneos y por eso no puedo subir los
     módulos.. pero claro que hay escaneos, hice uno ahora".

     El escaneo de trabajo es, en orden: el que está en curso, el que se abrió,
     o el más reciente que tenga barrido por módulo. Los del mes ya están
     cargados en `_data` (se traen con `select *`), así que casi nunca hace
     falta ir a la base; si el mes está vacío, se busca sin límite de fecha. */
  _escaneosConModulos() {
    const tiene = d => d && Array.isArray(d.por_modulo) && d.por_modulo.length;
    const out = [];
    const meter = d => {
      if (!tiene(d)) return;
      if (out.some(x => x === d || (x.id && d.id && x.id === d.id))) return;
      out.push(d);
    };
    meter(this._scan);
    meter(this._centroScan);
    for (const d of (this._data || [])) meter(d);
    return out;
  },

  async _escaneoDeTrabajo() {
    let lista = this._escaneosConModulos();
    if (!lista.length) {
      /* El mes que se está mirando puede no ser el del escaneo. Antes de decir
         que no hay, se busca de verdad. */
      try {
        const historico = await DB.getDiagnosticosOBD('1980-01-01', '2200-01-01', 60);
        for (const d of (historico || []))
          if (Array.isArray(d.por_modulo) && d.por_modulo.length) lista.push(d);
      } catch (_) {}
    }
    if (!lista.length) return null;
    if (lista.length === 1) return lista[0];
    return new Promise(res => {
      this._escaneoElegido = i => { UI.cerrarModal(); res(i == null ? null : lista[i]); };
      UI.modal('¿Sobre qué escaneo?', `
        <p style="font-size:13px;color:var(--text3)">Hay varios escaneos con barrido por módulo.</p>
        <div style="max-height:46vh;overflow:auto">
        ${lista.slice(0, 20).map((d, i) => {
          const v = d.vehiculos || (this._vehiculos || []).find(x => x.id === d.vehiculo_id) || {};
          return `<button class="btn btn-ghost" style="width:100%;text-align:left;margin-bottom:6px"
            onclick="Modulos.diagnostico_obd._escaneoElegido(${i})">
            <b>${UI.esc([v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || 'Vehículo')}</b>
            <span style="font-size:11px;color:var(--text3)"> — ${UI.fecha(d.created_at)} ·
            ${d.por_modulo.length} módulo(s)${d === this._scan ? ' · <b>el de ahora</b>' : ''}</span></button>`;
        }).join('')}</div>
        <div class="modal-footer"><button class="btn btn-ghost"
          onclick="Modulos.diagnostico_obd._escaneoElegido(null)">Cancelar</button></div>`, '560px');
    });
  },

  async modalTomarDelEscaneo() {
    const s = await this._escaneoDeTrabajo();
    if (!s) return UI.toast('Ningún escaneo tiene barrido por módulo todavía. ' +
      'El barrido corre cuando el dongle acepta ATSH y el vehículo está en CAN de 11 bits.', 'warn');
    this._centroScan = s;
    const ms = s.por_modulo;
    const veh = (s.vehiculos) || (this._vehiculos || []).find(v => v.id === s.vehiculo_id) || {};
    if (!veh.marca)
      return UI.toast('El escaneo no tiene marca de vehículo: no se sabe a qué modelo declarárselos', 'warn');

    if (!this._modsDeclarados) this._modsDeclarados = await this._declaradosDelTaller();
    const igual = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
    const yaEsta = req => (this._modsDeclarados || []).some(d =>
      Number(d.req) === Number(req) && igual(d.marca, veh.marca) && (!d.modelo || igual(d.modelo, veh.modelo)));

    const nuevos = ms.filter(m => !yaEsta(m.ecu));
    this._modsDelEscaneo = { veh, nuevos };

    UI.modal('📡 Tomar módulos del escaneo', `
      <div style="font-size:13px;color:var(--text2);line-height:1.55">
        El escaneo de <b>${UI.esc(veh.marca)} ${UI.esc(veh.modelo || '')} ${veh.anio || ''}</b> encontró
        ${ms.length} módulo(s). ${nuevos.length
          ? `<b>${nuevos.length}</b> todavía no están declarados para este modelo.`
          : 'Todos ya están declarados.'}
        <div style="color:var(--text3);margin-top:4px">Declararlos hace que el próximo escaneo del modelo
        les pregunte primero, los nombre igual, y avise si alguno falta.</div>
      </div>
      ${nuevos.length ? `<div style="max-height:44vh;overflow:auto;margin-top:12px">
        <table class="table" style="font-size:12px">
          <thead><tr><th>Nombre detectado</th><th>Dirección</th><th style="text-align:right">Acción</th></tr></thead>
          <tbody>${nuevos.map((m, i) => `<tr>
            <td>${UI.esc(m.nombre || 'Módulo')}</td>
            <td style="font-family:ui-monospace,Consolas,monospace">${this._hexDir(m.ecu)} → ${m.resp == null ? '?' : this._hexDir(m.resp)}${m.ext ? ' · 29 bits' : ''}</td>
            <td style="text-align:right"><button class="btn btn-sm btn-ghost"
              onclick="Modulos.diagnostico_obd.declararUnoDelEscaneo(${i})">✏️ Revisar y declarar</button></td>
          </tr>`).join('')}</tbody></table></div>` : ''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="Modulos.diagnostico_obd.modalModulosVehiculo()">Volver</button>
        ${nuevos.length ? `<button class="btn btn-brand" onclick="Modulos.diagnostico_obd.declararTodosDelEscaneo()">Declarar los ${nuevos.length}</button>` : ''}
      </div>`, '720px');
  },

  /* Abre el formulario ya lleno con lo que contestó el vehículo. Se revisa el
     nombre antes de guardar: "Módulo 0x745" declarado con ese nombre no sirve
     de nada, y es justo lo que esta pantalla vino a arreglar. */
  declararUnoDelEscaneo(i) {
    const d = this._modsDelEscaneo;
    const m = d && d.nuevos[i];
    if (!m) return;
    this._modsDeclarados = this._modsDeclarados || [];
    this.editarModuloVehiculo();
    const pon = (id, val) => { const el = document.getElementById(id); if (el != null && val != null) el.value = val; };
    pon('mod-marca', d.veh.marca);
    pon('mod-modelo', d.veh.modelo || '');
    pon('mod-nombre', m.nombre || '');
    pon('mod-req', Number(m.ecu).toString(16).toUpperCase());
    pon('mod-resp', m.resp == null ? '' : Number(m.resp).toString(16).toUpperCase());
    const ext = document.getElementById('mod-ext'); if (ext) ext.checked = !!m.ext;
    this._onMarcaModulo();
  },

  /* Un nombre que es la dirección otra vez NO es un nombre. Declarar
     "Módulo 0x7B3" deja la lista exactamente igual que antes —trece renglones
     que no dicen nada— y encima con la sensación de que ya está resuelto. */
  _nombreInutil(n) {
    const t = String(n || '').trim();
    return !t || /^(módulo|modulo|sin identificar)\s+0x[0-9A-F]+$/i.test(t);
  },

  /* El nombre con el que se declara un módulo recién descubierto. Tres casos, y
     ninguno miente:
       · el módulo publicó su nombre       → ese
       · solo publicó su número de pieza   → "Pieza 58920-G6300" (se busca y se pide)
       · no publicó nada                   → "Sin identificar 0x7B3"
     El tercero NO es lo mismo que "Módulo 0x7B3": es un estado, dice que falta
     hacer algo, y la pantalla lo cuenta aparte y le pone el botón de nombrar. */
  _nombreParaDeclarar(m) {
    const id = m.ident || {};
    if (id.nombre) return String(id.nombre).slice(0, 60);
    if (!this._nombreInutil(m.nombre)) return String(m.nombre).slice(0, 60);
    if (id.referencia) return `Pieza ${id.referencia}`.slice(0, 60);
    return `Sin identificar ${this._hexDir(m.ecu)}`;
  },

  /* ═══════════ LA IA BAUTIZA LOS MÓDULOS ═══════════
     Pedido por Henry el 2026-09-22: «si hay módulos nuevos o que no tienen
     nombre, la IA debe investigar y colocar el nombre — yo no voy a investigar
     eso». Tiene razón: buscar un número de pieza en un catálogo de repuestos es
     exactamente el trabajo que no debería hacer el mecánico con el vehículo
     enchufado enfrente.

     Lo que NO cambia es la regla de la casa: un nombre que la IA no pueda
     sostener vuelve en null y el módulo se queda como está. Un nombre
     equivocado manda a desmontar el módulo que no era — eso es peor que la
     lista de direcciones que esto vino a arreglar.

     Y no toca nunca el nombre que escribió el taller: quien lo escribió tenía
     el vehículo enfrente, y eso gana sobre cualquier búsqueda. */

  _SISTEMAS_VALIDOS: ['ecm','tcm','abs','srs','eps','bcm','ipc','hvac','awd','immo',
                      'gateway','adas','tpms','suspension','carga','otro'],

  /* Un nombre que lleva su propia dirección adentro no es un nombre: es el
     número otra vez, con adorno. Cubre "Módulo 0x7B3", "Chasis / frenos
     (0x7B3)", "Carroceria 0x10 (29 bits)" y "Pieza 58920-G6300" de una sola
     vez, en lugar de una lista de formas que hay que ir ampliando. */
  _nombreGenerico(nombre, ecu) {
    const t = String(nombre || '').trim();
    if (!t) return true;
    if (this._nombreInutil(t)) return true;
    if (/^pieza\s+\S+$/i.test(t)) return true;
    const hex = Number(ecu).toString(16).toUpperCase();
    const dst = ((Number(ecu) >> 8) & 0xFF).toString(16).toUpperCase();
    return new RegExp(`0x(${hex}|${dst})\\b`, 'i').test(t);
  },

  /* Todo lo que el vehículo dijo de un módulo, junto. Es lo que se le manda a
     la IA: cuanta más evidencia, menos margen para adivinar. */
  _evidenciaModulo(m, marca) {
    const id = m.ident || {};
    const sugDir = this._sugerenciaPorDireccion(m.ecu, marca);
    const sugRef = id.referencia ? this._sugerenciaPorReferencia(id.referencia) : null;
    return {
      ecu: this._hexDir(m.ecu),
      responde_en: m.resp == null ? null : this._hexDir(m.resp),
      direccionamiento: m.ext ? '29 bits' : '11 bits',
      numero_de_pieza_F187: id.referencia || null,
      se_llama_a_si_mismo_F197: id.nombre || null,
      fabricante_F18A: id.proveedor || null,
      descripcion_hyundai_kia_22F100: id.hmc ? `${id.hmc.texto} (plataforma ${id.hmc.plataforma || '?'}, sigla del módulo ${id.hmc.sigla || '?'})` : null,
      codigos_que_reporta: (m.codigos || []).map(c => c.codigo),
      nombre_actual: m.nombre || null,
      pista_por_direccion: sugDir ? `${sugDir.nombre} (según ${sugDir.fuente})` : null,
      pista_por_grupo_de_pieza: sugRef ? `grupo ${sugRef.grupo} = ${sugRef.sistema}` : null,
    };
  },

  /* Los módulos de un escaneo que todavía no tienen nombre de verdad. Los
     fantasmas quedan fuera: 0x7DF es difusión y 0x7E8-0x7EF son direcciones de
     respuesta — hacerlos identificar es gastar una búsqueda en algo que no es
     un módulo (y pedirle a la IA que le invente nombre a la nada). */
  _modulosSinNombre(scan, soloEcu) {
    const v = scan && (scan.vehiculos || (this._vehiculos || []).find(x => x.id === scan.vehiculo_id));
    const marca = (scan && scan.nhtsa && scan.nhtsa.marca) || (v && v.marca) || null;
    /* También los de nombre PROVISIONAL ("Instrumentos / tablero" por el grupo
       de pieza, "Carrocería" por sus códigos, "Módulo CLU" por su sigla): Henry,
       2026-09-22 — «si lo encuentro en la primera búsqueda de Google, la app
       no puede decir que no lo conoce». */
    return ((scan && scan.por_modulo) || []).filter(m =>
      (soloEcu == null || Number(m.ecu) === Number(soloEcu)) &&
      !(!m.ext && this._DIR_NO_ES_MODULO(m.ecu)) &&
      !this._nombreDeclarado(m.ecu) &&
      (this._nombreGenerico(m.nombre, m.ecu) ||
       (!m.ext && m.ecu <= 0x7FF && !this._nombreResuelto(m, marca).firme)));
  },

  /* El mismo trabajo, pedido a mano desde el Centro de módulos. Existe para el
     caso en que el escaneo corrió sin internet o la IA no alcanzó: es volver a
     PEDIRLE a la IA, no mandar al mecánico a investigar. */
  async identificarConIA(ecu) {
    const s = this._centroScan || this._scan;
    if (!s) return;
    if (!this._modulosSinNombre(s, ecu).length)
      return UI.toast('Todos los módulos ya tienen nombre', 'info');
    UI.toast('🤖 La IA está investigando los módulos — puede tardar medio minuto', 'info', 35000);
    let n = 0;
    try { n = await this.bautizarModulosConIA(s, () => {}, ecu); }
    catch (e) { return UI.toast('No se pudo consultar a la IA: ' + e.message, 'error'); }
    UI.toast(n ? `${n} módulo(s) identificados ✓`
               : 'La IA no pudo sostener un nombre con la evidencia de este escaneo', n ? 'success' : 'warn');
    if (s === this._scan) this._renderResultado();
    if (ecu != null) this.fichaModulo(ecu); else this.modalCentroModulos(s);
  },

  /* Le pregunta a la IA quién es cada módulo sin nombre y escribe el resultado
     en el escaneo Y en la libreta del modelo, para que el próximo escaneo del
     mismo vehículo ya los llame por su nombre sin gastar otra consulta.
     Devuelve cuántos quedaron bautizados. */
  async bautizarModulosConIA(scan, log, soloEcu) {
    const s = scan || this._scan;
    const avisar = log || (() => {});
    const pendientes = this._modulosSinNombre(s, soloEcu);
    if (!pendientes.length) return 0;

    const veh = this._vehiculoDe ? this._vehiculoDe(s)
      : ((s && s.vehiculos) || (this._vehiculos || []).find(v => v.id === (s && s.vehiculo_id)) || {});

    avisar(`🤖 Identificando ${pendientes.length} módulo(s) sin nombre — la IA los investiga...`);
    let r;
    try {
      r = await IA.identificarModulos({
        vehiculo: { marca: veh.marca || null, modelo: veh.modelo || null, anio: veh.anio || null,
                    vin: (s && s.vin) || null },
        modulos: pendientes.map(m => this._evidenciaModulo(m, veh.marca)),
      });
    } catch (e) { r = { ok: false, error: e.message }; }

    if (!r.ok) { avisar(`<span style="color:var(--amber)">No se pudo consultar a la IA: ${UI.esc(r.error || '')}</span>`); return 0; }
    const lista = Array.isArray(r.modulos) ? r.modulos : [];
    if (!lista.length) { avisar('<span style="color:var(--text3)">La IA no devolvió identificaciones</span>'); return 0; }

    /* Una sola lectura de la libreta para todo el lote: pedirla por módulo son
       trece consultas a la base para escribir trece nombres. */
    let declarados = null;
    if (veh.marca) { try { declarados = await this._declaradosDelTaller(); } catch (_) { declarados = []; } }

    let puestos = 0, sinSostener = 0;
    for (const item of lista) {
      /* parseInt y no _leerHex: si la IA contesta "0x7B3 (ABS)" igual se
         entiende la dirección, que es lo único que hace falta para casarla. */
      const ecu = parseInt(String((item && item.ecu) || '').trim().replace(/^0x/i, ''), 16);
      const m = pendientes.find(x => Number(x.ecu) === Number(ecu));
      if (!m) continue;
      const nombre = String((item && item.nombre) || '').trim().slice(0, 60);
      /* El filtro se aplica también a lo que devuelve la IA: si contestó
         "Módulo 0x7B3" eso no es un nombre venga de donde venga. */
      if (!nombre || this._nombreGenerico(nombre, m.ecu)) { sinSostener++; continue; }

      const confianza = ['alta','media','baja'].includes(item.confianza) ? item.confianza : 'baja';
      const sistema = this._SISTEMAS_VALIDOS.includes(item.sistema) ? item.sistema : 'otro';
      m.nombre = nombre;
      m.ident = Object.assign({}, m.ident || {}, {
        ia: { nombre, sistema, confianza, fuente: String(item.fuente || '').slice(0, 300) || null,
              nota: String(item.nota || '').slice(0, 300) || null },
      });
      puestos++;

      /* Queda para todo el modelo. Solo lo sostenido: un "baja" se muestra en
         este escaneo pero no se le enseña al taller como si fuera un hecho. */
      if (veh.marca && confianza !== 'baja') {
        await this._guardarNombreModulo(m, veh, { sistema, confianza, fuente: item.fuente, declarados });
      }
    }

    avisar(puestos
      ? `<span style="color:var(--green)">🤖 ${puestos} módulo(s) identificados por la IA</span>` +
        (sinSostener ? ` <span style="color:var(--text3)">· ${sinSostener} sin evidencia suficiente (quedan sin nombre a propósito)</span>` : '')
      : `<span style="color:var(--text3)">La IA no pudo sostener ningún nombre con la evidencia de este escaneo</span>`);
    return puestos;
  },

  /* Escribe el nombre en la libreta del modelo (obd_modulos_vehiculo). Si la
     dirección ya estaba declarada se ACTUALIZA: insertarla de nuevo choca
     contra el índice único (marca, modelo, req, ext) y devuelve 23505. */
  async _guardarNombreModulo(m, veh, { sistema, confianza, fuente, declarados }) {
    try {
      const ya = (declarados || []).find(d =>
        Number(d.req) === Number(m.ecu) && !!d.ext === !!m.ext &&
        String(d.marca || '').toUpperCase() === String(veh.marca).toUpperCase() &&
        String(d.modelo || '').toUpperCase() === String(veh.modelo || '').toUpperCase());
      const id = m.ident || {};
      const nota = ['identificado por IA', fuente ? String(fuente).slice(0, 140) : null,
                    `confianza ${confianza}`, id.referencia ? `referencia ${id.referencia}` : null]
        .filter(Boolean).join(' · ').slice(0, 200);
      /* Un nombre puesto a mano por el taller NO se pisa: eso ya se filtró al
         armar la lista de pendientes, pero acá está el otro camino de entrada
         (una fila declarada con nombre genérico desde un escaneo anterior). */
      if (ya && !this._nombreGenerico(ya.nombre, ya.req)) return;
      await DB.upsertModuloVehiculo(ya
        ? { id: ya.id, nombre: m.nombre, sistema, nota, origen: 'ia' }
        : { marca: veh.marca, modelo: veh.modelo || null, nombre: m.nombre, sistema,
            req: Number(m.ecu), resp: m.resp == null ? null : Number(m.resp), ext: !!m.ext,
            red: 'hs', protocolo: 'uds', origen: 'ia', activo: true, nota });
      this._modsDeclarados = null;
    } catch (e) { console.warn('guardarNombreModulo:', e.message); }
  },

  async declararTodosDelEscaneo() {
    const d = this._modsDelEscaneo;
    if (!d || !d.nuevos.length) return;
    /* Los fantasmas no se declaran nunca: 0x7DF es la difusión y 0x7E8-0x7EF
       son direcciones de respuesta. Todo LO DEMÁS sí, tenga nombre o no.

       Antes se saltaban los que no se podían identificar, y eso dejaba una
       pregunta sin respuesta: "el escaneo encontró 13 y quedaron 2, ¿dónde
       están los otros?". Los otros existen: son módulos del vehículo que
       todavía no tienen nombre. Ocultarlos no los identifica, solo los
       esconde — y de paso el próximo escaneo deja de preguntarles primero. */
    const candidatos = d.nuevos.filter(m => !(!m.ext && this._DIR_NO_ES_MODULO(m.ecu)));
    const sinNombre = candidatos.filter(m => this._nombreInutil(this._nombreParaDeclarar(m)));
    let bien = 0, mal = 0;
    for (const m of candidatos) {
      const id = m.ident || {};
      const nota = [id.referencia ? `referencia ${id.referencia}` : null,
                    id.proveedor ? `fabricante ${id.proveedor}` : null].filter(Boolean).join(' · ');
      const nombre = this._nombreParaDeclarar(m);
      const r = await DB.upsertModuloVehiculo({
        marca: d.veh.marca, modelo: d.veh.modelo || null,
        nombre: String(nombre).slice(0, 60),
        sistema: 'otro', req: Number(m.ecu),
        resp: m.resp == null ? null : Number(m.resp), ext: !!m.ext,
        red: 'hs', protocolo: 'uds', origen: 'escaneo', activo: true,
        nota: nota || null,
      });
      if (r.error) mal++; else bien++;
    }
    const pendientes = sinNombre.length
      ? ` · ${sinNombre.length} quedan POR NOMBRAR (están en la lista, marcados)`
      : '';
    UI.toast((mal ? `${bien} declarado(s), ${mal} no se pudieron` : `${bien} módulo(s) declarados ✓`) + pendientes,
             mal ? 'warn' : 'success');
    this._modsDeclarados = null;
    this.modalModulosVehiculo();
  },

  /* Quita SOLO lo que no es un módulo. Lo que falta nombrar NO se borra: es un
     módulo del vehículo, existe, y borrarlo fue exactamente lo que hizo
     preguntar "eran 13 o 2, y dónde están los otros 11". */
  async limpiarFantasmas() {
    const filas = this._modsDeclarados || [];
    const fantasmas = filas.filter(m => !m.ext && this._DIR_NO_ES_MODULO(Number(m.req)));
    if (!fantasmas.length) return UI.toast('No hay direcciones falsas declaradas', 'info');
    const ok = await UI.confirmar(
      `¿Quitar ${fantasmas.length} dirección(es) que NO son un módulo?<br><br>` +
      `<b>${fantasmas.map(m => UI.esc(this._hexDir(m.req))).join(', ')}</b><br><br>
       <small>0x7DF es la dirección de <b>difusión</b>: preguntar ahí le pregunta a todos a la vez.
       0x7E8-0x7EF son direcciones de <b>respuesta</b>: nadie escucha ahí.
       Contestan, pero no son módulos.<br><br>
       Los que están <b>por nombrar</b> no se tocan: esos sí son módulos del vehículo.</small>`,
      'Quitar direcciones falsas');
    if (!ok) return;
    let n = 0;
    for (const m of fantasmas) if (await DB.deleteRegistro('obd_modulos_vehiculo', m.id)) n++;
    UI.toast(`${n} dirección(es) falsas quitadas`, 'success');
    this.modalModulosVehiculo();
  },

  _NOMBRE_VIA: { ble:'Bluetooth BLE', android:'Bluetooth de la app', serial:'Bluetooth clásico', usb:'USB' },

  /* El mapa que deja este escaneo, para que lo aproveche el próximo del mismo
     modelo. Sólo módulos que de verdad contestaron. */
  _mapaDeEscaneo(porModulo) {
    if (!Array.isArray(porModulo) || !porModulo.length) return null;
    /* Un mapa de K-line con "CAN 11 bits / 500k" seria mentira, y ademas
       inservible: el proximo escaneo del modelo leeria el mapa y volveria a
       preguntar por CAN. El enlace se guarda como lo que es. */
    if (porModulo.some(m => m.kline)) return {
      enlace: 'kline', protocolo: this._protoNum === 4 ? 'ISO 14230 (init 5 baudios)' : 'ISO 14230 (init rápido)',
      via: this._via,
      modulos: porModulo.map(m => ({ req:m.ecu, resp:null, kline:true, nombre:m.nombre, servicio:m.servicio || null })),
      faltantes: this._mapaFaltantes || [],
    };
    return {
      enlace: 'can',
      bits: this._canExt ? 29 : 11, baud: this._canBaud, via: this._via,
      modulos: porModulo.map(m => ({ req:m.ecu, resp:m.resp, ext:!!m.ext, nombre:m.nombre, servicio:m.servicio || null })),
      faltantes: this._mapaFaltantes || [],
    };
  }
  }));
})();
