/* ═══════════════════════════════════════════════════════
   Expediente de armería del cliente (Ley de Armas 15-2009)
   ───────────────────────────────────────────────────────
   Antes vivía mezclado dentro de Modulos.clientes, como bloques de HTML
   condicionados por un booleano (_pideDatosArmeria). Henry pidió separarlo:
   el alta de un cliente cualquiera (taller, ferretería, agroservicio...)
   debe quedar simple, y los ~30 campos que exige una declaración jurada
   (DPI completo, vecindad, licencia, tenencias, documentos) no deberían
   aparecer ahí ni de reojo.

   Este módulo abre su PROPIO modal ("expediente de armería") sobre un
   cliente que ya existe (o que se crea aquí mismo con lo mínimo: nombre y
   teléfono) y guarda directo en la tabla `clientes` — es la misma tabla,
   sólo que la pantalla que la llena está separada. Los nombres de columna
   NO cambiaron, así que armeria.js y armeria-declaraciones.js (que leen
   cli.dpi, cli.licencia_tipo, cli.armas_registradas, etc. directo del
   registro) siguen funcionando sin tocarlos.
═══════════════════════════════════════════════════════ */
Modulos.clientesArmeria = {
  _data: [],
  _tenencias: [],
  _docsPendientes: {},
  _tenenciaPendiente: null,

  /* Cliente por id: primero busca en la caché de este módulo, luego en la
     de Modulos.clientes (si se abrió desde la lista de Clientes), y sólo si
     ninguna lo tiene va a la base — así abrir el expediente desde Armería
     (que no mantiene la lista de Clientes cargada) no rompe. */
  async _obtenerCliente(id) {
    if (!id) return {};
    const enCache = (this._data || []).find(x => x.id === id)
      || (Modulos.clientes?._data || []).find(x => x.id === id);
    if (enCache) return enCache;
    const lista = await DB.getClientes();
    this._data = lista;
    return lista.find(x => x.id === id) || {};
  },

  /* Edad cumplida a partir de la fecha de nacimiento. No se guarda en la BD:
     una edad guardada queda vencida el día del cumpleaños, y una declaración
     jurada con la edad equivocada es un documento con un dato falso.
     Se compara mes y día, no se divide por 365.25 — con años bisiestos eso
     se equivoca justo alrededor del cumpleaños, que es cuando importa. */
  edadDe(fechaNacimiento, hoy = new Date()) {
    if (!fechaNacimiento) return null;
    const n = new Date(fechaNacimiento + (String(fechaNacimiento).length === 10 ? 'T00:00:00' : ''));
    if (isNaN(n)) return null;
    let edad = hoy.getFullYear() - n.getFullYear();
    const cumpleEsteAnio = new Date(hoy.getFullYear(), n.getMonth(), n.getDate());
    if (hoy < cumpleEsteAnio) edad--;          // aún no cumple este año
    return (edad >= 0 && edad < 150) ? edad : null;
  },

  /* Días que le quedan a una licencia. Devuelve null si no hay fecha, negativo
     si ya venció. Se compara en hora LOCAL: construir la fecha con toISOString
     en UTC-6 corre el día y una licencia que vence hoy aparecería vencida. */
  diasLicencia(vence, hoy = new Date()) {
    if (!vence) return null;
    const f = new Date(String(vence).slice(0, 10) + 'T00:00:00');
    if (isNaN(f)) return null;
    const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    return Math.round((f - h) / 86400000);
  },

  /* ── Lectura automática de DPI, licencia y recibo ────────────────────────
     La foto se manda a Nexus, que devuelve JSON. Dos decisiones que importan:

     · NO se pisa lo que el usuario ya escribió. Sólo se llenan los campos
       vacíos, y lo que difiere se REPORTA para que la persona decida. Un OCR
       equivocado sobreescribiendo un dato correcto es peor que no leer nada,
       y esto alimenta una declaración jurada.
     · El prompt le ordena devolver null en lo que no lea con claridad; acá
       se respeta: un null no llena nada. */
  async _leerDocumento(file, cual) {
    if (!file) return;
    const aviso = document.getElementById('cli-lectura-aviso');
    const pintar = (html, color) => { if (aviso) { aviso.innerHTML = html; aviso.style.color = color || 'var(--text3)'; } };
    /* UN FALLO DE LECTURA NO PUEDE PASAR DESAPERCIBIDO. El aviso de arriba es
       una línea de texto perdida entre 40 campos del formulario: cuando la
       lectura fallaba, en el mostrador se veía como que "no pasó nada" y no
       había forma de saber por qué. El toast se para encima de todo y dice
       la causa exacta — que es también lo que hace falta para reportarla. */
    const fallar = (texto) => { pintar('⚠️ ' + texto, 'var(--red)'); UI.toast('No se pudo leer el documento: ' + texto, 'error', 9000); };

    if (file.size > 5 * 1024 * 1024) { fallar('La imagen pesa más de 5 MB.'); return; }
    pintar('⏳ Leyendo el documento…');

    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
    }).catch(() => null);
    if (!base64) { fallar('No se pudo abrir el archivo.'); return; }

    const lectores = {
      dpi:      () => IA.escanearDPI(base64),
      recibo:   () => IA.escanearRecibo(base64),
      licencia: () => IA.escanearLicencia(base64),
    };
    const r = await (lectores[cual] || lectores.dpi)();
    if (!r?.ok) { fallar(r?.error || 'El servidor no contestó.'); return; }

    let datos;
    try {
      /* El modelo a veces envuelve el JSON en ```; se limpia antes de parsear. */
      datos = JSON.parse(String(r.texto || '').replace(/```json|```/g, '').trim());
    } catch (_) { fallar('El documento no se leyó con claridad. Escribí los datos a mano.'); return; }

    const mapas = {
      /* El DPI trae la nacionalidad y el país como código ISO ("GTM"): se
         traducen acá porque una declaración jurada no puede decir "de
         nacionalidad GTM". Y el lugar de nacimiento y la vecindad vienen en
         DOS líneas —departamento y municipio—, que es como se guardan.
         La dirección exacta sólo viene en el diseño nuevo del DPI; en el
         anterior es null y el recibo de servicios sigue siendo la fuente. */
      dpi: {
        'cli-dpi': datos.cui,
        'cli-nombre': datos.nombre_completo,
        'cli-fnac': datos.fecha_nacimiento,
        'cli-sexo': datos.sexo,
        'cli-estado-civil': datos.estado_civil,
        'cli-nacionalidad': (typeof nacionalidadDesdeISO === 'function')
          ? nacionalidadDesdeISO(datos.nacionalidad) : datos.nacionalidad,
        /* PAÍS DE NAC. es OTRO campo del anverso, al lado de NACIONALIDAD.
           En un guatemalteco de nacimiento dicen lo mismo (GTM) y por eso
           faltaba sin que se notara; en un naturalizado NO coinciden, y la
           declaración jurada del art. 55 a) tiene que decir dónde nació la
           persona, no sólo qué nacionalidad ostenta. */
        'cli-pais-nac': (typeof paisDesdeISO === 'function')
          ? paisDesdeISO(datos.pais_nacimiento) : datos.pais_nacimiento,
        'cli-nac-depto': datos.nacimiento_departamento,
        'cli-nac-muni': datos.nacimiento_municipio,
        'cli-vec-depto': datos.vecindad_departamento,
        'cli-vec-muni': datos.vecindad_municipio,
        'cli-dir': datos.direccion,
        'cli-dpi-emision': datos.fecha_emision,
        'cli-dpi-vence': datos.fecha_vencimiento,
        'cli-dpi-serie': datos.dpi_numero_serie,
        'cli-dpi-version': datos.dpi_version,
        'cli-reg-libro': datos.registro_libro,
        'cli-reg-folio': datos.registro_folio,
        'cli-reg-pagina': datos.registro_pagina,
      },
      recibo: {
        'cli-dir': datos.direccion,
        'cli-vec-depto': datos.departamento,
        'cli-vec-muni': datos.municipio,
      },
      /* El tipo de licencia decide cuánta munición se puede entregar (art. 60),
         así que si la IA no lo distinguió manda null y el campo queda vacío
         para que alguien lo ponga a conciencia. */
      licencia: { 'cli-lic-tipo': datos.tipo, 'cli-lic-num': datos.numero,
                  'cli-lic-vence': datos.fecha_vencimiento,
                  'cli-armas-reg': datos.armas_registradas },
    };
    const mapa = mapas[cual] || mapas.dpi;

    const llenados = [], distintos = [];
    for (const [idEl, valor] of Object.entries(mapa)) {
      const el = document.getElementById(idEl);
      const v = (valor == null || valor === '') ? null : String(valor).trim();
      if (!el || !v) continue;
      const actual = (el.value || '').trim();
      if (!actual) { if (this._ponerValor(el, v)) llenados.push(idEl); }
      else if (actual.toLowerCase() !== v.toLowerCase()) distintos.push(`${el.previousElementSibling?.textContent || idEl}: el documento dice «${v}»`);
    }
    this._mostrarEdad();

    /* Con departamento y municipio puestos, el código postal sale solo. */
    this._sincronizarMunicipios();
    this._calcularCodigosPostales();

    /* SI EL RECIBO NO ESTÁ A NOMBRE DEL CLIENTE, LA VIVIENDA NO ES PROPIA.
       Es la señal que usa cualquier analista de expediente, y hasta ahora
       había que deducirla a ojo. No se decide sola —se sugiere— porque un
       recibo puede estar a nombre del cónyuge o del padre en una casa propia:
       la app marca la diferencia y la persona resuelve. */
    if (cual === 'recibo' && datos.titular) {
      const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
      const nomCliente = norm(document.getElementById('cli-nombre')?.value);
      const nomRecibo = norm(datos.titular);
      const viv = document.getElementById('cli-vivienda');
      if (nomCliente && nomRecibo) {
        /* Coincide si uno contiene al otro: el recibo suele traer el nombre
           completo y la ficha a veces sólo dos apellidos. */
        const coincide = nomRecibo.includes(nomCliente) || nomCliente.includes(nomRecibo);
        if (coincide) {
          if (viv && !viv.value) viv.value = 'propia';
          this._avisoRecibo = `<span style="color:var(--green)">🏠 El recibo está a nombre del cliente: se marcó la vivienda como <b>propia</b>.</span>`;
        } else {
          this._avisoRecibo = `<span style="color:var(--amber)">🔑 El recibo está a nombre de <b>${UI.esc(datos.titular)}</b>, no del cliente. Suele indicar vivienda <b>rentada</b> — confirmalo, porque también puede ser del cónyuge o de un familiar en casa propia.</span>`;
        }
      }
    }

    const nombreDoc = { dpi: 'DPI', recibo: 'recibo', licencia: 'licencia' }[cual] || 'documento';
    const partes = [];
    if (llenados.length) partes.push(`<span style="color:var(--green)">✅ ${llenados.length} campo(s) llenados desde el ${nombreDoc}.</span>`);
    /* El tipo de licencia es el dato del que depende el tope de munición: si no
       se pudo leer, hay que decirlo fuerte y no dejar que pase inadvertido. */
    if (cual === 'licencia' && !datos.tipo)
      partes.push('<span style="color:var(--red)">⚠️ No se pudo distinguir si es de <b>tenencia</b> o de <b>portación</b>. Elegilo a mano: de eso depende cuánta munición se le puede entregar.</span>');
    if (distintos.length) partes.push(`<span style="color:var(--amber)">⚠️ No se tocó lo que ya estaba escrito. Diferencias: ${distintos.join(' · ')}</span>`);
    if (this._avisoRecibo) { partes.push(this._avisoRecibo); this._avisoRecibo = null; }

    /* CERO CAMPOS LEÍDOS ES UN FALLO, NO UN RESULTADO. La IA contesta "ok"
       con todos los campos en null cuando la foto sale movida, oscura, con
       reflejo o recortada — y eso antes se despachaba con un renglón gris que
       decía "no aportó datos nuevos". Desde afuera se ve idéntico a que la
       app no hiciera nada, y no hay forma de saber que hay que repetir la
       foto. Se avisa igual de fuerte que un error de red, y se dice QUÉ
       hacer. */
    if (!llenados.length && !distintos.length) {
      const queEs = { dpi: 'el DPI', recibo: 'el recibo', licencia: 'la licencia' }[cual] || 'el documento';
      partes.push(`<span style="color:var(--red)">⛔ <b>No se pudo sacar ningún dato de ${queEs}.</b> Suele ser la foto: movida, oscura, con reflejo del plástico o con el documento cortado. Volvé a tomarla con el documento completo dentro del cuadro y buena luz.</span>`);
      UI.toast(`No se sacó ningún dato de ${queEs} — repetí la foto (completa, sin reflejo y con buena luz)`, 'error', 9000);
    }

    partes.push('<span style="color:var(--text3)">Revisá siempre contra el documento físico antes de guardar: esto alimenta una declaración jurada.</span>');
    pintar(partes.join('<br>'));
  },

  /* Pone un valor leído del documento en un campo del formulario.
     Devuelve true si de verdad quedó puesto.

     EXISTE POR UN FALLO REAL, invisible durante semanas: un <select> DESCARTA
     EN SILENCIO cualquier valor que no coincida EXACTO con una de sus
     opciones. El DPI grita "GUATEMALA" y el catálogo postal escribe
     "Guatemala", así que `el.value = 'GUATEMALA'` dejaba el campo VACÍO sin
     error ninguno. Y como el municipio depende del departamento y el código
     postal depende de los dos, se caían SEIS campos en cadena — justo los
     del lugar de nacimiento y la vecindad, que van en la declaración jurada.

     Las pruebas no podían verlo: simulan el DOM con objetos planos
     ({value:''}) que aceptan cualquier texto. Esto sólo se ve en un navegador
     de verdad, y por eso ahora hay una prueba con <select> reales. */
  _ponerValor(el, v) {
    if (el.tagName !== 'SELECT') { el.value = v; return true; }

    const norm = (typeof normalizarGeo === 'function')
      ? normalizarGeo : (s => String(s || '').toLowerCase().trim());
    const opcion = Array.from(el.options || [])
      .find(o => o.value && norm(o.value) === norm(v));
    if (opcion) { el.value = opcion.value; return true; }

    /* Sin opción que calce puede ser que la lista AÚN no esté poblada: los
       municipios se cargan según el departamento, que quizá se acaba de
       fijar en esta misma pasada. Se deja anotado en data-pendiente, que es
       de donde _sincronizarMunicipios() lo recoge después. Antes el dato
       simplemente se perdía. */
    if (el.dataset) el.dataset.pendiente = v;
    return false;
  },

  _leerDPI(file)      { return this._leerDocumento(file, 'dpi'); },
  _leerRecibo(file)   { return this._leerDocumento(file, 'recibo'); },
  _leerLicencia(file) { return this._leerDocumento(file, 'licencia'); },

  _mostrarEdad() {
    const el = document.getElementById('cli-edad'); if (!el) return;
    const edad = this.edadDe(document.getElementById('cli-fnac')?.value);
    el.textContent = edad == null ? ''
      : `${edad} años${edad < 18 ? ' — menor de edad' : ''}`;
    el.style.color = (edad != null && edad < 18) ? 'var(--red)' : 'var(--cyan)';
  },

  _avisarLicencia() {
    const box = document.getElementById('cli-lic-aviso');
    if (!box) return;

    /* LA TARJETA DE TENENCIA NO VENCE. Verificado contra dos tarjetas reales
       de DIGECAM: dicen "CIVIL ART. 9" y no traen fecha de vencimiento — una
       de 2019 y otra de 2024, ninguna con vigencia. Lo que vence es la
       LICENCIA DE PORTACIÓN (art. 72), que es otro documento.
       Avisar "vencida" sobre una tenencia sería inventar un impedimento que
       la ley no pone, y mandaría al cliente a renovar algo que no se renueva. */
    const tipo = document.getElementById('cli-lic-tipo')?.value;
    if (tipo === 'tenencia') {
      box.innerHTML = 'ℹ️ La <b>tarjeta de tenencia no vence</b> (CIVIL ART. 9): es por arma y no lleva vigencia. La fecha de arriba, si la ponés, se guarda como referencia.';
      box.style.color = 'var(--text3)';
      return;
    }

    const d = this.diasLicencia(document.getElementById('cli-lic-vence')?.value);
    if (d === null) { box.innerHTML = ''; return; }
    if (d < 0) {
      box.innerHTML = `⛔ <b>La licencia venció hace ${Math.abs(d)} día(s).</b> Una licencia vencida no habilita comprar arma ni munición.`;
      box.style.color = 'var(--red)';
    } else if (d <= 30) {
      box.innerHTML = `⚠️ Vence en <b>${d} día(s)</b>. Conviene avisarle al cliente que la renueve.`;
      box.style.color = 'var(--amber)';
    } else {
      box.innerHTML = `✅ Vigente — le quedan ${d} días.`;
      box.style.color = 'var(--green)';
    }
  },

  /* Un DPI vencido no identifica a nadie, y una declaración jurada armada con
     un documento vencido nace inservible. Se avisa antes, no al imprimir. */
  _avisarDPI() {
    const box = document.getElementById('cli-dpi-aviso');
    if (!box) return;
    const d = this.diasLicencia(document.getElementById('cli-dpi-vence')?.value);
    if (d === null) { box.innerHTML = ''; return; }
    if (d < 0) {
      box.innerHTML = `⛔ <b>El DPI venció hace ${Math.abs(d)} día(s).</b> Un DPI vencido no identifica: pedile el renovado antes de armar cualquier declaración.`;
      box.style.color = 'var(--red)';
    } else if (d <= 90) {
      box.innerHTML = `⚠️ El DPI vence en <b>${d} día(s)</b>.`;
      box.style.color = 'var(--amber)';
    } else {
      box.innerHTML = `✅ DPI vigente — le quedan ${d} días.`;
      box.style.color = 'var(--green)';
    }
  },

  /* Encabezado de una sección plegable del formulario. Se usa <details>/
     <summary>: pliega sin JavaScript, funciona con teclado y lector de
     pantalla. `abierta` deja desplegadas las que casi siempre se tocan. */
  _seccion(icono, titulo, ayuda, abierta = false) {
    return `
      <details ${abierta ? 'open' : ''} style="margin-bottom:12px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <summary style="cursor:pointer;padding:9px 12px;background:var(--surface2);font-weight:700;font-size:12.5px;
                        display:flex;align-items:center;gap:8px;user-select:none;list-style:none">
          <span>${icono}</span>
          <span>${UI.esc(titulo)}</span>
          <span style="font-weight:400;font-size:11px;color:var(--text3);margin-left:auto;text-align:right">${UI.esc(ayuda || '')}</span>
        </summary>
        <div style="padding:10px 12px 4px">`;
  },
  _finSeccion() { return '</div></details>'; },

  /* Los municipios dependen del departamento elegido. Se repueblan sin perder
     lo que ya estaba puesto: al leer el DPI llegan los dos a la vez, y si el
     municipio se limpiara al fijar el departamento, la lectura se perdería. */
  _sincronizarMunicipios() {
    if (typeof municipiosGT !== 'function') return;
    [['cli-nac-depto', 'cli-nac-muni'], ['cli-vec-depto', 'cli-vec-muni']].forEach(([idD, idM]) => {
      const selD = document.getElementById(idD), selM = document.getElementById(idM);
      if (!selD || !selM) return;
      const deseado = selM.value || selM.dataset?.pendiente || '';
      const lista = municipiosGT(selD.value);
      if ('innerHTML' in selM) {
        selM.innerHTML = '<option value="">— Municipio —</option>' +
          lista.map(m => `<option value="${UI.esc(m.nombre)}">${UI.esc(m.nombre)}</option>`).join('');
      }
      const match = lista.find(m => normalizarGeo(m.nombre) === normalizarGeo(deseado));
      if (match) {
        selM.value = match.nombre;
        if (selM.dataset) delete selM.dataset.pendiente;
      } else if (deseado) {
        /* El municipio leído no está en el catálogo (pasa con aldeas que
           Correos no lista). La intención siempre fue CONSERVAR lo que dijo
           el documento en vez de borrarlo... pero `selM.value = deseado` en un
           <select> sin esa opción lo deja VACÍO en silencio, así que el dato
           se perdía igual. Se agrega como opción para que se conserve y se
           vea; queda marcada para que nadie la confunda con el catálogo. */
        if ('innerHTML' in selM) {
          selM.innerHTML += `<option value="${UI.esc(deseado)}">${UI.esc(deseado)} (del documento)</option>`;
        }
        selM.value = deseado;
      } else {
        selM.value = '';
      }
    });
  },

  /* El código postal NO se teclea: sale de departamento + municipio. */
  _calcularCodigosPostales() {
    if (typeof codigoPostalGT !== 'function') return;
    const poner = (idD, idM, idCP) => {
      const cp = document.getElementById(idCP);
      if (!cp) return;
      const v = codigoPostalGT(document.getElementById(idD)?.value,
                               document.getElementById(idM)?.value);
      if (v) cp.value = v;
    };
    poner('cli-nac-depto', 'cli-nac-muni', 'cli-nac-cp');
    poner('cli-vec-depto', 'cli-vec-muni', 'cli-cp');
  },

  _cambioDepartamento() {
    this._sincronizarMunicipios();
    this._calcularCodigosPostales();
  },

  /* ══ EXPEDIENTE (modal principal) ═══════════════════════════════════════
     id null  → alta rápida (nombre + teléfono mínimos, para no perder la
                venta si el cliente aún no existe en el sistema).
     id dado  → completa/edita el expediente de un cliente ya existente. */
  async modalForm(id = null, onGuardado = null) {
    const c = await this._obtenerCliente(id);
    const esEdicion = !!id;
    if (onGuardado !== null) this._onGuardado = onGuardado;
    if (!esEdicion) { this._docsPendientes = {}; this._tenenciaPendiente = null; }

    UI.modal(`🔫 ${esEdicion ? 'Expediente de armería' : 'Nuevo cliente de armería'}`, `
      <div class="alert alert-cyan" style="margin-bottom:12px">
        <div class="alert-icon">🔫</div>
        <div class="alert-body" style="font-size:11px">
          Estos datos alimentan las declaraciones juradas y el expediente que exige DIGECAM
          (Ley de Armas 15-2009). Los datos generales del cliente (notas, puntos, retención)
          se editan desde <b>Clientes</b>.
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre Completo *</label>
          <input class="form-input" id="cli-nombre" value="${UI.esc(c.nombre||'')}"></div>
        <div class="form-group"><label class="form-label">Teléfono *</label>
          <input class="form-input" id="cli-tel" value="${c.tel||''}" placeholder="5501-1234"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">NIT</label>
          <div style="display:flex;gap:6px">
            <input class="form-input" id="cli-nit" value="${c.nit||''}" placeholder="CF" style="flex:1">
            <button type="button" class="btn btn-ghost" onclick="Modulos.verificarNIT('cli-nit','cli-nit-status','cli-nombre')" title="Verificar NIT con la SAT">🔎</button>
          </div>
          <div id="cli-nit-status" style="margin-top:4px;min-height:14px"></div></div>
        <div class="form-group"><label class="form-label">Email</label>
          <input class="form-input" id="cli-email" value="${UI.esc(c.email||'')}" type="email"></div>
      </div>

      ${this._seccion('🪪', 'Datos del DPI', 'Nombre, nacimiento, estado civil, vecindad y vigencia del documento', true)}
      <div style="background:var(--card2);border-radius:8px;padding:10px 12px;margin-bottom:12px">
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">
          Se llenan solos al adjuntar las dos caras del DPI y el recibo de servicios, más abajo.
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">DPI</label>
            <input class="form-input" id="cli-dpi" value="${c.dpi||''}" placeholder="0000 00000 0000" style="font-family:monospace"></div>
          <div class="form-group"><label class="form-label">Fecha de nacimiento</label>
            <input class="form-input" id="cli-fnac" type="date" value="${c.fecha_nacimiento||''}"
                   max="${new Date().toISOString().slice(0,10)}" onchange="Modulos.clientesArmeria._mostrarEdad()">
            <div id="cli-edad" style="font-size:11px;color:var(--cyan);margin-top:2px"></div></div>
          <div class="form-group"><label class="form-label">Estado civil</label>
            <select class="form-select" id="cli-estado-civil">
              <option value="">— No indicado —</option>
              ${['soltero(a)','casado(a)','unido(a)','divorciado(a)','viudo(a)']
                .map(e=>`<option value="${e}" ${c.estado_civil===e?'selected':''}>${e}</option>`).join('')}
            </select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Profesión u oficio</label>
            <input class="form-input" id="cli-profesion" value="${UI.esc(c.profesion||'')}" placeholder="Comerciante, ingeniero, agricultor..."></div>
          <div class="form-group"><label class="form-label">Nacionalidad</label>
            <input class="form-input" id="cli-nacionalidad" value="${UI.esc(c.nacionalidad||'')}" placeholder="Guatemalteca"></div>
          <div class="form-group"><label class="form-label">Sexo</label>
            <select class="form-select" id="cli-sexo">
              <option value="">— No indicado —</option>
              <option value="masculino" ${c.sexo==='masculino'?'selected':''}>Masculino</option>
              <option value="femenino"  ${c.sexo==='femenino'?'selected':''}>Femenino</option>
            </select></div>
        </div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">País de nacimiento</label>
            <input class="form-input" id="cli-pais-nac" value="${UI.esc((typeof paisDesdeISO==='function' ? paisDesdeISO(c.pais_nacimiento) : c.pais_nacimiento)||'')}" placeholder="Guatemala">
            <div style="font-size:11px;color:var(--text3);margin-top:3px">
              Es el <b>PAÍS DE NAC.</b> del anverso, al lado de NACIONALIDAD. En el DPI los dos dicen
              <b>GTM</b>; sólo difieren en una persona naturalizada — y ahí la declaración jurada tiene
              que decir dónde nació, no sólo qué nacionalidad tiene.
            </div></div>
        </div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">Nacimiento — departamento</label>
            <select class="form-select" id="cli-nac-depto" onchange="Modulos.clientesArmeria._cambioDepartamento()">
              <option value="">— Departamento —</option>
              ${(typeof departamentosGT==='function'?departamentosGT():[]).map(d=>`<option value="${UI.esc(d)}" ${c.nacimiento_departamento===d?'selected':''}>${UI.esc(d)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Nacimiento — municipio</label>
            <select class="form-select" id="cli-nac-muni" data-pendiente="${UI.esc(c.nacimiento_municipio||'')}"
                    onchange="Modulos.clientesArmeria._calcularCodigosPostales()">
              <option value="">— Municipio —</option>
            </select></div>
          <div class="form-group" style="max-width:130px"><label class="form-label">Cód. postal</label>
            <input class="form-input mono-sm" id="cli-nac-cp" value="${UI.esc(c.nacimiento_codigo_postal||'')}" placeholder="22003"></div>
        </div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">Vecindad — departamento</label>
            <select class="form-select" id="cli-vec-depto" onchange="Modulos.clientesArmeria._cambioDepartamento()">
              <option value="">— Departamento —</option>
              ${(typeof departamentosGT==='function'?departamentosGT():[]).map(d=>`<option value="${UI.esc(d)}" ${c.vecindad_departamento===d?'selected':''}>${UI.esc(d)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Vecindad — municipio</label>
            <select class="form-select" id="cli-vec-muni" data-pendiente="${UI.esc(c.vecindad_municipio||'')}"
                    onchange="Modulos.clientesArmeria._calcularCodigosPostales()">
              <option value="">— Municipio —</option>
            </select></div>
          <div class="form-group" style="max-width:130px"><label class="form-label">Cód. postal</label>
            <input class="form-input mono-sm" id="cli-cp" value="${UI.esc(c.codigo_postal||'')}" placeholder="01062"></div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin:-6px 0 10px">
          La <b>vecindad</b> es dónde vive ahora (va en el reverso del DPI); la <b>dirección</b> de abajo
          es la calle exacta. El código postal se calcula solo al elegir departamento y municipio.
        </div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">DPI — emisión</label>
            <input class="form-input" id="cli-dpi-emision" type="date" value="${c.dpi_fecha_emision||''}"></div>
          <div class="form-group"><label class="form-label">DPI — vencimiento</label>
            <input class="form-input" id="cli-dpi-vence" type="date" value="${c.dpi_fecha_vencimiento||''}"
                   onchange="Modulos.clientesArmeria._avisarDPI()"></div>
          <div class="form-group"><label class="form-label">DPI — No. de serie</label>
            <input class="form-input mono-sm" id="cli-dpi-serie" value="${UI.esc(c.dpi_numero_serie||'')}" placeholder="0000036456563"></div>
          <div class="form-group" style="max-width:110px"><label class="form-label">Versión</label>
            <input class="form-input mono-sm" id="cli-dpi-version" value="${UI.esc(c.dpi_version||'')}" placeholder="004"></div>
        </div>
        <div id="cli-dpi-aviso" style="font-size:11.5px;margin:-4px 0 6px"></div>

        <div class="form-row">
          <div class="form-group" style="max-width:130px"><label class="form-label">Registro — Libro</label>
            <input class="form-input mono-sm" id="cli-reg-libro" value="${UI.esc(c.registro_libro||'')}" placeholder="102"></div>
          <div class="form-group" style="max-width:130px"><label class="form-label">Folio</label>
            <input class="form-input mono-sm" id="cli-reg-folio" value="${UI.esc(c.registro_folio||'')}" placeholder="42"></div>
          <div class="form-group" style="max-width:130px"><label class="form-label">Página</label>
            <input class="form-input mono-sm" id="cli-reg-pagina" value="${UI.esc(c.registro_pagina||'')}" placeholder="263"></div>
          <div class="form-group" style="align-self:flex-end;font-size:11px;color:var(--text3);padding-bottom:8px">
            Es el <b>L: F: P:</b> del reverso del DPI — el asiento del registro civil de donde el RENAP
            tomó los datos al pasar de Cédula a DPI. Permite pedir la certificación de nacimiento.
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:2"><label class="form-label">Dirección completa</label>
          <input class="form-input" id="cli-dir" value="${UI.esc(c.direccion||'')}"
                 placeholder="Calle, avenida, número de casa, zona, municipio, departamento"></div>
        <div class="form-group"><label class="form-label">La vivienda es</label>
          <select class="form-select" id="cli-vivienda">
            <option value="">— No indicado —</option>
            <option value="propia"   ${c.vivienda==='propia'?'selected':''}>🏠 Propia</option>
            <option value="rentada"  ${c.vivienda==='rentada'?'selected':''}>🔑 Rentada</option>
            <option value="familiar" ${c.vivienda==='familiar'?'selected':''}>👪 Familiar / prestada</option>
          </select></div>
      </div>
      ${this._finSeccion()}

      ${this._seccion('🔫', 'Licencia y tenencias', 'De aquí sale el tope mensual de munición del art. 60')}
      <div class="form-group" style="background:var(--card2);border-radius:8px;padding:10px 12px">
        <label class="form-label">Licencia de arma (DIGECAM)</label>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">
          Se llena sola al subir el <b>anverso de la licencia</b> abajo. De estos datos sale el tope
          mensual de munición del art. 60, y quedan copiados en cada entrega como evidencia del día.
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Tipo</label>
            <select class="form-select" id="cli-lic-tipo" onchange="Modulos.clientesArmeria._avisarLicencia()">
              <option value="">— No indicado —</option>
              <option value="tenencia"  ${c.licencia_tipo==='tenencia'?'selected':''}>🏠 Tenencia (200 al mes)</option>
              <option value="portación" ${c.licencia_tipo==='portación'?'selected':''}>🚶 Portación (250 por arma)</option>
            </select></div>
          <div class="form-group"><label class="form-label">No. de licencia</label>
            <input class="form-input" id="cli-lic-num" value="${UI.esc(c.licencia_num||'')}" placeholder="Como aparece impreso"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Vence</label>
            <input class="form-input" id="cli-lic-vence" type="date" value="${c.licencia_vencimiento||''}"
                   onchange="Modulos.clientesArmeria._avisarLicencia()"></div>
          <div class="form-group"><label class="form-label">Armas registradas</label>
            <select class="form-select" id="cli-armas-reg">
              <option value="">— No indicado —</option>
              ${[1,2,3].map(n=>`<option value="${n}" ${Number(c.armas_registradas)===n?'selected':''}>${n} arma${n===1?'':'s'}</option>`).join('')}
            </select>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">Máximo 3 (art. 72).</div></div>
        </div>
        <div id="cli-lic-aviso" style="font-size:11.5px;margin-top:4px"></div>
      </div>

      ${!esEdicion ? `
      <div class="form-group" style="background:var(--card2);border-radius:8px;padding:10px 12px">
        <label class="form-label">🔫 Tarjetas de tenencia</label>
        <div style="font-size:11px;color:var(--text3)">
          Guardá primero el cliente y volvé a abrirlo para registrar sus tenencias.
        </div>
      </div>` : `
      <div class="form-group" style="background:var(--card2);border-radius:8px;padding:10px 12px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <label class="form-label" style="margin:0">🔫 Tarjetas de tenencia (una por arma)</label>
          <button type="button" class="btn btn-sm btn-cyan" onclick="Modulos.clientesArmeria.modalTenencia('${id}')">➕ Agregar tenencia</button>
        </div>
        <div style="font-size:11px;color:var(--text3);margin:6px 0 8px">
          La <b>licencia</b> es del titular y vence; la <b>tenencia</b> es de cada arma y <b>no vence</b>
          (dice CIVIL ART. 9). De cuántas tenencias activas tenga sale el número de armas registradas,
          que en portación multiplica el tope de munición del art. 60 — hasta 3 (art. 72).
        </div>
        <div id="cli-tenencias">Cargando…</div>
      </div>

      ${this._finSeccion()}
      ${this._seccion('🕓', 'Historial de cambios', 'Qué decía la ficha antes de cada renovación o mudanza')}
      <div class="form-group" style="background:var(--card2);border-radius:8px;padding:10px 12px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <label class="form-label" style="margin:0">Versiones anteriores</label>
          <button type="button" class="btn btn-sm btn-ghost" onclick="Modulos.clientesArmeria.verHistorial('${id}')">Ver versiones anteriores</button>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">
          Al renovar el DPI o cambiar de domicilio se guarda lo que decía antes. Una declaración
          firmada el año pasado lleva los datos de <b>entonces</b>, y hay que poder mostrarlos.
          No se guardan versiones repetidas.
        </div>
      </div>`}
      ${this._finSeccion()}

      ${this._seccion('📎', 'Documentos', 'DPI por sus dos caras, licencia, pasaporte y recibo de servicios', true)}
      <div id="cli-docs-box">${this._htmlDocumentos(id)}</div>
      ${this._finSeccion()}

      <div class="modal-footer" style="justify-content:space-between">
        <div>${esEdicion ? `<button class="btn btn-ghost" onclick="Modulos.clientesArmeria.imprimirExpediente('${id}')">🖨️ Imprimir expediente</button>` : ''}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
          <button class="btn btn-amber" onclick="Modulos.clientesArmeria.guardar('${id||''}')">
            ${esEdicion?'Guardar Expediente':'Crear y continuar'}
          </button>
        </div>
      </div>`,'680px');

    if (esEdicion) Docs.render('cliente', id, 'cli-docs');
    this._mostrarEdad();
    this._avisarLicencia();
    this._sincronizarMunicipios();
    this._avisarDPI();
    if (esEdicion) this.renderTenencias(id);
  },

  /* Las versiones anteriores. El trigger de la migración 130 sólo guarda
     cuando cambió algo de identificación, así que esta lista no tiene ruido:
     lo que aparece acá pasó de verdad. */
  async verHistorial(clienteId) {
    const lista = await DB.getHistorialCliente(clienteId).catch(() => []);
    if (!lista.length) {
      UI.toast('Este cliente no tiene cambios registrados todavía', 'info');
      return;
    }
    const ETIQUETAS = {
      dpi: 'DPI', nombre: 'Nombre', nit: 'NIT', fecha_nacimiento: 'Fecha de nacimiento',
      estado_civil: 'Estado civil', profesion: 'Profesión', nacionalidad: 'Nacionalidad',
      sexo: 'Sexo', direccion: 'Dirección', vivienda: 'Vivienda',
      nacimiento_departamento: 'Depto. nacimiento', nacimiento_municipio: 'Municipio nacimiento',
      vecindad_departamento: 'Depto. vecindad', vecindad_municipio: 'Municipio vecindad',
      codigo_postal: 'Código postal', dpi_fecha_emision: 'Emisión DPI',
      dpi_fecha_vencimiento: 'Vencimiento DPI', dpi_numero_serie: 'Serie DPI',
      dpi_version: 'Versión DPI', licencia_tipo: 'Tipo de licencia',
      licencia_num: 'No. licencia', licencia_vencimiento: 'Vence licencia',
      armas_registradas: 'Armas registradas',
    };

    UI.modal('🕓 Versiones anteriores', `
      <div style="font-size:11.5px;color:var(--text3);margin-bottom:12px;line-height:1.6">
        Cada bloque es lo que decía la ficha <b>antes</b> de un cambio, de lo más reciente a lo más
        viejo. Sirve para explicar por qué una declaración firmada hace meses no coincide con los
        datos de hoy.
      </div>
      <div style="max-height:58vh;overflow:auto">
        ${lista.map(v => `
          <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px">
              <b style="font-size:12.5px">${UI.esc(v.motivo || 'Cambio')}</b>
              <span style="font-size:11px;color:var(--text3)">
                ${UI.fecha(v.created_at)}${v.usuarios?.nombre ? ' · ' + UI.esc(v.usuarios.nombre) : ''}
              </span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:4px 14px;font-size:11.5px">
              ${Object.entries(v.datos || {}).map(([k, val]) => `
                <div><span style="color:var(--text3)">${UI.esc(ETIQUETAS[k] || k)}:</span> ${UI.esc(val)}</div>
              `).join('')}
            </div>
          </div>`).join('')}
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button></div>
    `, '760px');
  },

  /* ══ TENENCIAS ═══════════════════════════════════════════════════════════
     Una tarjeta por arma. Cuentan para el tope de munición sólo las ACTIVAS:
     un arma vendida o extraviada no le da derecho a más cartuchos. */
  async renderTenencias(clienteId) {
    const cont = document.getElementById('cli-tenencias');
    if (!cont) return;
    const lista = await DB.getTenencias(clienteId).catch(() => []);
    this._tenencias = lista;

    const activas = lista.filter(t => t.activa).length;
    const cuentan = Math.min(3, activas);

    if (!lista.length) {
      cont.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:8px 0">
        Sin tenencias registradas. Si el cliente compra munición con licencia de portación,
        registrarlas es lo que respalda su tope mensual.</div>`;
      return;
    }

    cont.innerHTML = `
      <div style="font-size:12px;margin-bottom:8px">
        <b>${activas}</b> arma(s) activa(s)${activas > 3 ? ` — el art. 72 topa en 3, así que cuentan <b>${cuentan}</b>` : ''}.
        Tope de munición con portación: <b>${cuentan * 250}</b> cartuchos al mes.
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Arma</th><th>Calibre</th><th>No. de serie</th><th>Marcaje GUA</th><th>Estado</th><th></th></tr></thead>
        <tbody>${lista.map(t => `
          <tr style="${t.activa ? '' : 'opacity:.55'}">
            <td><b>${UI.esc([t.marca, t.modelo].filter(Boolean).join(' ') || t.tipo || '—')}</b>
                <div style="font-size:11px;color:var(--text3)">${UI.esc(t.tipo || '')}${t.largo_canon_mm ? ` · cañón ${UI.esc(t.largo_canon_mm)} mm` : ''}</div></td>
            <td>${UI.esc(t.calibre || '—')}</td>
            <td class="mono-sm">${UI.esc(t.numero_serie || '—')}</td>
            <td class="mono-sm" style="font-size:11px">${UI.esc(t.marcaje_gua || '—')}</td>
            <td>${t.activa ? '<span class="badge badge-green">Activa</span>' : '<span class="badge badge-gray">Baja</span>'}</td>
            <td style="text-align:right;white-space:nowrap">
              ${Modulos.btnAccion('editar', `Modulos.clientesArmeria.modalTenencia('${clienteId}','${t.id}')`)}
              ${Modulos.btnAccion('eliminar', `Modulos.clientesArmeria.eliminarTenencia('${clienteId}','${t.id}')`)}
            </td>
          </tr>`).join('')}</tbody>
      </table></div>`;
  },

  modalTenencia(clienteId, tenenciaId) {
    const t = (this._tenencias || []).find(x => x.id === tenenciaId) || {};
    const v = (k, d = '') => UI.esc(t[k] ?? d);
    this._tenenciaPendiente = null;

    UI.modal(tenenciaId ? '🔫 Editar tenencia' : '🔫 Nueva tarjeta de tenencia', `
      <div style="background:var(--card2);border-radius:8px;padding:10px 12px;margin-bottom:12px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <b style="font-size:12.5px">📄 Leer la tarjeta y llenar solo</b>
          <button type="button" class="btn btn-sm btn-cyan" onclick="document.getElementById('ten-cam').click()">📷 Cámara</button>
          <button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById('ten-gal').click()">📂 Foto o PDF</button>
          <input type="file" id="ten-cam" accept="image/*" capture="environment" style="display:none"
                 onchange="Modulos.clientesArmeria._leerTenencia(this,'${tenenciaId||''}')">
          <input type="file" id="ten-gal" accept="image/*,application/pdf" style="display:none"
                 onchange="Modulos.clientesArmeria._leerTenencia(this,'${tenenciaId||''}')">
        </div>
        <div id="ten-lectura" style="font-size:11px;margin-top:6px;color:var(--text3)">
          Tomale foto a la tarjeta (o subí el PDF si es electrónica): los campos se llenan solos y la
          foto queda archivada en el expediente de esta arma.
        </div>
      </div>
      <div style="font-size:11.5px;color:var(--text3);margin-bottom:12px;line-height:1.6">
        Revisá siempre contra la tarjeta física antes de guardar. El
        <b>largo del cañón va en milímetros</b>, como lo anota DIGECAM (pistola ≈102 mm,
        escopeta ≈530 mm) — el art. 58 exige que el inventario cuadre exacto con el documento.
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo de arma *</label>
          <input class="form-input" id="ten-tipo" value="${v('tipo')}" placeholder="Pistola, escopeta, revólver..."></div>
        <div class="form-group"><label class="form-label">Marca *</label>
          <input class="form-input" id="ten-marca" value="${v('marca')}" placeholder="Glock"></div>
        <div class="form-group"><label class="form-label">Modelo</label>
          <input class="form-input" id="ten-modelo" value="${v('modelo')}" placeholder="19X"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Calibre</label>
          <input class="form-input" id="ten-calibre" value="${v('calibre')}" placeholder="9x19"></div>
        <div class="form-group"><label class="form-label">No. de serie *</label>
          <input class="form-input mono-sm" id="ten-serie" value="${v('numero_serie')}" placeholder="BHTT137"></div>
        <div class="form-group"><label class="form-label">Largo del cañón (mm)</label>
          <input class="form-input" id="ten-canon" type="number" step="0.1" value="${v('largo_canon_mm')}" placeholder="102"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Conversiones de calibre</label>
          <input class="form-input" id="ten-conv" value="${v('conversiones')}" placeholder="Ninguna"></div>
        <div class="form-group"><label class="form-label">País de origen</label>
          <input class="form-input" id="ten-pais" value="${v('pais_origen')}" placeholder="Austria"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">No. de tarjeta</label>
          <input class="form-input mono-sm" id="ten-num" value="${v('num_tarjeta')}" placeholder="2621570"></div>
        <div class="form-group"><label class="form-label">Huella balística No.</label>
          <input class="form-input mono-sm" id="ten-huella" value="${v('huella_balistica')}" placeholder="2202261"></div>
        <div class="form-group"><label class="form-label">No. de propietario</label>
          <input class="form-input mono-sm" id="ten-propietario" value="${v('no_propietario')}" placeholder="300951"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Marcaje GUA (troquelado)</label>
          <input class="form-input mono-sm" id="ten-gua" value="${v('marcaje_gua')}" placeholder="816025 3773028 337597">
          <div style="font-size:11px;color:var(--text3);margin-top:3px">Los tres números de la línea MARCAJE GUA (art. 35).</div></div>
        <div class="form-group"><label class="form-label">Fecha de emisión</label>
          <input class="form-input" id="ten-emision" type="date" value="${t.fecha_emision || ''}">
          <div style="font-size:11px;color:var(--text3);margin-top:3px">La tarjeta de tenencia <b>no vence</b>.</div></div>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="ten-activa" ${t.activa === false ? '' : 'checked'}>
          <span class="form-label" style="margin:0">Arma activa (cuenta para el tope de munición)</span>
        </label>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">
          Desmarcala si el arma se vendió, se extravió o la tarjeta se anuló.
        </div>
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <input class="form-input" id="ten-notas" value="${v('notas')}" placeholder="Opcional"></div>
      ${tenenciaId ? `
      <div class="form-group" style="background:var(--card2);border-radius:8px;padding:10px 12px">
        <label class="form-label">📎 Foto o PDF de la tarjeta archivados</label>
        <div id="ten-docs" style="margin-top:6px">Cargando…</div>
      </div>` : ''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-cyan" onclick="Modulos.clientesArmeria.guardarTenencia('${clienteId}','${tenenciaId || ''}')">Guardar</button>
      </div>`, '700px');

    if (tenenciaId) Docs.render('cliente_tenencia', tenenciaId, 'ten-docs');
  },

  /* Lee la tarjeta de tenencia (foto o PDF), llena el formulario Y retiene el
     archivo para archivarlo. Si la tenencia YA EXISTE (se está editando), se
     archiva de una vez; si es nueva, se archiva apenas guardarTenencia() le
     consiga un id — antes esto sólo leía y el archivo se perdía siempre. */
  async _leerTenencia(inputEl, tenenciaId) {
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    const aviso = document.getElementById('ten-lectura');
    const pintar = (html, color) => { if (aviso) { aviso.innerHTML = html; aviso.style.color = color || 'var(--text3)'; } };
    /* Mismo criterio que el DPI: el fallo se GRITA. Ver _leerDocumento. */
    const fallar = (texto) => { pintar('⚠️ ' + texto, 'var(--red)'); UI.toast('No se pudo leer la tarjeta: ' + texto, 'error', 9000); };

    if (file.size > 5 * 1024 * 1024) { fallar('El archivo pesa más de 5 MB.'); return; }
    pintar('⏳ Leyendo la tarjeta…');

    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
    }).catch(() => null);
    if (!base64) { fallar('No se pudo abrir el archivo.'); return; }

    const r = await IA.escanearLicencia(base64);
    if (!r?.ok) { fallar(r?.error || 'El servidor no contestó.'); return; }

    let d;
    try { d = JSON.parse(String(r.texto || '').replace(/```json|```/g, '').trim()); }
    catch (_) { fallar('La tarjeta no se leyó con claridad. Escribí los datos a mano.'); return; }

    const mapa = {
      'ten-tipo': d.arma_tipo, 'ten-marca': d.arma_marca, 'ten-modelo': d.arma_modelo,
      'ten-calibre': d.arma_calibre, 'ten-serie': d.arma_serie,
      'ten-canon': d.arma_largo_canon_mm, 'ten-num': d.numero,
      'ten-huella': d.huella_balistica, 'ten-propietario': d.no_propietario,
      'ten-gua': d.marcaje_gua, 'ten-emision': d.fecha_emision,
    };

    /* Misma regla que el DPI: se llena lo VACÍO y se REPORTA lo que difiere.
       Pisar un dato que alguien ya verificó contra el documento físico sería
       peor que no leer nada — de esto sale el tope de munición del cliente. */
    const llenados = [], distintos = [];
    for (const [id, valor] of Object.entries(mapa)) {
      const el = document.getElementById(id);
      const v = (valor == null || valor === '') ? null : String(valor).trim();
      if (!el || !v) continue;
      const actual = (el.value || '').trim();
      if (!actual) { el.value = v; llenados.push(id); }
      else if (actual.toLowerCase() !== v.toLowerCase()) distintos.push(`la tarjeta dice «${v}»`);
    }

    const partes = [];
    if (llenados.length) partes.push(`<span style="color:var(--green)">✅ ${llenados.length} campo(s) llenados desde la tarjeta.</span>`);
    if (distintos.length) partes.push(`<span style="color:var(--amber)">⚠️ No se tocó lo ya escrito. Diferencias: ${UI.esc(distintos.join(' · '))}</span>`);
    if (!d.arma_serie && !d.arma_marca)
      partes.push('<span style="color:var(--amber)">⚠️ No se encontraron datos de arma. ¿Seguro que es una <b>tarjeta de tenencia</b> y no la licencia?</span>');

    /* Archivar. Si la tenencia ya tiene id (edición) se sube de una vez; si
       es nueva, se retiene y guardarTenencia() la sube apenas exista el id. */
    if (tenenciaId) {
      const { error } = await Docs.subirArchivo('cliente_tenencia', tenenciaId, 'tenencia', 'Tarjeta de tenencia', file);
      if (error) partes.push(`<span style="color:var(--red)">⚠️ No se pudo archivar la foto: ${UI.esc(error.message)}</span>`);
      else { partes.push('<span style="color:var(--green)">📎 Foto archivada en el expediente de esta arma.</span>'); Docs.render('cliente_tenencia', tenenciaId, 'ten-docs'); }
    } else {
      this._tenenciaPendiente = { file, titulo: 'Tarjeta de tenencia' };
      partes.push('<span style="color:var(--green)">📎 Foto lista — se archiva al guardar la tenencia.</span>');
    }

    if (!partes.length) partes.push('<span style="color:var(--amber)">La tarjeta no aportó datos nuevos.</span>');
    partes.push('<span style="color:var(--text3)">Revisá contra la tarjeta física: de estos datos sale el tope de munición.</span>');
    pintar(partes.join('<br>'));
  },

  async guardarTenencia(clienteId, tenenciaId) {
    const v = id => document.getElementById(id)?.value?.trim() || null;
    const serie = v('ten-serie');
    if (!serie) { UI.toast('El número de serie identifica al arma: es obligatorio', 'error'); return; }

    const fields = {
      cliente_id: clienteId,
      tipo: v('ten-tipo'), marca: v('ten-marca'), modelo: v('ten-modelo'),
      calibre: v('ten-calibre'), numero_serie: serie,
      largo_canon_mm: v('ten-canon') ? Number(v('ten-canon')) : null,
      conversiones: v('ten-conv'), pais_origen: v('ten-pais'),
      num_tarjeta: v('ten-num'), huella_balistica: v('ten-huella'),
      no_propietario: v('ten-propietario'), marcaje_gua: v('ten-gua'),
      fecha_emision: v('ten-emision'),
      activa: document.getElementById('ten-activa')?.checked !== false,
      notas: v('ten-notas'),
    };
    if (tenenciaId) fields.id = tenenciaId;

    const { data, error } = await DB.guardarTenencia(fields);
    if (error) {
      /* El índice único por número de serie es el que atrapa la doble captura,
         que contaría el arma dos veces para el tope de munición. */
      const dup = /duplicate key|uq_tenencia_serie/i.test(error.message || '');
      UI.toast(dup ? `Ya hay una tenencia registrada con el número de serie ${serie}`
                   : (error.message || 'No se pudo guardar la tenencia'), 'error', 7000);
      return;
    }

    /* La foto tomada antes de que la tenencia existiera se archiva ahora que
       ya tiene id — la foto se toma UNA vez, no una para leerla y otra para
       archivarla (antes NUNCA se archivaba: sólo se leía y se descartaba). */
    const idFinal = tenenciaId || data?.id;
    if (idFinal && this._tenenciaPendiente) {
      const pend = this._tenenciaPendiente; this._tenenciaPendiente = null;
      const { error: errDoc } = await Docs.subirArchivo('cliente_tenencia', idFinal, 'tenencia', pend.titulo, pend.file);
      if (errDoc) UI.toast('Tenencia guardada, pero la foto no se pudo archivar: ' + errDoc.message, 'warn', 7000);
    }

    UI.cerrarModal();
    UI.toast('Tenencia guardada ✓');
    await this.renderTenencias(clienteId);
    this._sincronizarArmasRegistradas();
  },

  async eliminarTenencia(clienteId, tenenciaId) {
    const t = (this._tenencias || []).find(x => x.id === tenenciaId);
    if (!confirm(`¿Eliminar la tenencia de ${t?.marca || ''} ${t?.modelo || ''} (serie ${t?.numero_serie || '—'})?\n\n` +
                 'Si el arma se vendió o se extravió, es mejor darla de BAJA (desmarcar "activa"): así queda el rastro.')) return;
    const ok = await DB.eliminarTenencia(tenenciaId);
    UI.toast(ok ? 'Tenencia eliminada' : 'No se pudo eliminar', ok ? 'success' : 'error');
    if (ok) { await this.renderTenencias(clienteId); this._sincronizarArmasRegistradas(); }
  },

  /* El número de armas registradas deja de teclearse: sale de las tenencias
     activas, topado en 3 por el art. 72. Si no hay tenencias cargadas no se
     toca el campo — un comercio que aún no las registró no debe quedarse en 0
     y perder el tope que su cliente sí tiene. */
  _sincronizarArmasRegistradas() {
    const sel = document.getElementById('cli-armas-reg');
    if (!sel) return;
    const activas = (this._tenencias || []).filter(t => t.activa).length;
    if (!activas) return;
    sel.value = String(Math.min(3, activas));
  },

  /* ══ DOCUMENTOS DEL CLIENTE (DPI, licencia, pasaporte, recibo) ══════════
     El DPI y la licencia tienen DOS CARAS y las dos van al expediente: es lo
     que piden DIGECAM y el notario, y con una sola el expediente queda
     incompleto aunque el dato ya se haya leído.

     OJO con dónde vive cada dato en el DPI guatemalteco: el ANVERSO trae el
     CUI, nombres, fecha y lugar de nacimiento, vecindad, estado civil y
     vencimiento. El REVERSO es sobre todo la zona legible por máquina y los
     elementos de seguridad. Por eso la lectura automática apunta al anverso;
     el reverso se archiva para completar el expediente, no para sacar campos
     que no están ahí. */
  _DOCS_CLIENTE: {
    foto_cliente:     { icon: '📸', label: 'Foto del cliente (rostro)' },
    dpi_frente:       { icon: '🪪', label: 'DPI — anverso (frente)' },
    dpi_reverso:      { icon: '🪪', label: 'DPI — reverso (atrás)' },
    licencia_frente:  { icon: '📋', label: 'Licencia de arma — anverso' },
    licencia_reverso: { icon: '📋', label: 'Licencia de arma — reverso' },
    pasaporte:        { icon: '📘', label: 'Pasaporte (extranjeros) — hoja de datos' },
    recibo_servicios: { icon: '🧾', label: 'Recibo de servicios (agua/luz/teléfono)' },
  },

  /* Los tipos viejos, de antes de partir los documentos en dos caras. Se
     conservan para que los expedientes ya cargados sigan reconociéndose y no
     se le pida a nadie volver a fotografiar lo que ya entregó. */
  _DOCS_HEREDADOS: { dpi: 'dpi_frente', licencia_arma: 'licencia_frente' },

  /* Una sola subida por documento: se ARCHIVA el archivo y, si el documento
     trae datos aprovechables, se LEEN de una vez.

     LAS DOS CARAS SE LEEN. Antes el reverso se archivaba pero NO se mandaba a
     leer, con este comentario: "sus datos ya vinieron del anverso". Era
     FALSO, y costó semanas de campos en blanco. Verificado contra la lectura
     real de un DPI: el anverso devuelve CUI, nombre, fecha de nacimiento,
     nacionalidad, sexo y versión — y `null` en TODO lo demás, porque lo demás
     está impreso del otro lado: lugar de nacimiento, vecindad, estado civil,
     el asiento L:F:P: del registro civil, el número de serie y la fecha de
     vencimiento. Sin leer el reverso, esos ocho campos no se podían llenar
     nunca, hiciera lo que hiciera el usuario.
     Leer las dos caras es seguro porque el prompt devuelve null en lo que no
     aparece en la cara que le dan, y la lectura sólo llena campos VACÍOS: una
     cara no puede pisar lo que trajo la otra. */
  _LECTOR_DOC: {
    dpi_frente: 'dpi',
    dpi_reverso: 'dpi',
    pasaporte: 'dpi',
    licencia_frente: 'licencia',
    licencia_reverso: 'licencia',
    recibo_servicios: 'recibo',
  },

  /* Documentos que exige el expediente de una armería (art. 59 y 72 de la Ley
     de Armas). Las dos caras cuentan por separado: falta una, falta el
     documento. El pasaporte sustituye al DPI sólo para extranjeros. */
  _DOCS_OBLIGATORIOS_ARMERIA: ['dpi_frente', 'dpi_reverso', 'recibo_servicios'],

  /* ══ FOTO DEL CLIENTE ═══════════════════════════════════════════════════
     Un expediente sin cara no identifica a nadie. Se puede tomar con la
     cámara o subir, y si no hay ninguna se RECORTA del anverso del DPI, que
     ya está en el expediente: pedirle otra vez la cara a alguien cuya foto ya
     tenemos es hacerle perder el tiempo.

     El recorte es por PROPORCIONES del formato ID-1 (85.6 × 54 mm), que es el
     del DPI: la fotografía ocupa siempre la misma banda izquierda. Sale bien
     cuando la foto del DPI está tomada de frente y encuadrada; si el carné
     salió torcido o pequeño dentro del cuadro, el recorte queda mal — por eso
     se marca como "recortada del DPI" y se puede reemplazar con una foto real
     en un toque. Es un punto de partida, no una verdad. */
  _RECORTE_DPI: { x: 0.055, y: 0.20, w: 0.29, h: 0.62 },

  async _recortarFotoDPI(file) {
    if (!file?.type?.startsWith('image/')) return null;   // un PDF no se recorta
    if (typeof createImageBitmap !== 'function') return null;
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return null;
    try {
      const r = this._RECORTE_DPI;
      const sx = Math.round(bmp.width * r.x), sy = Math.round(bmp.height * r.y);
      const sw = Math.round(bmp.width * r.w), sh = Math.round(bmp.height * r.h);
      if (sw < 40 || sh < 40) return null;                // foto demasiado chica para sacar nada
      const cv = document.createElement('canvas');
      cv.width = sw; cv.height = sh;
      cv.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.9));
      return blob ? new File([blob], 'foto-cliente.jpg', { type: 'image/jpeg' }) : null;
    } finally { bmp.close?.(); }
  },

  /* Pinta la foto en el recuadro del expediente. El bucket es privado, así
     que hace falta una URL firmada; sin foto se deja el marcador. */
  async renderFoto(clienteId) {
    const cont = document.getElementById('cli-foto');
    if (!cont) return;
    const vacio = '<div style="width:96px;height:120px;border:1px dashed var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:26px;color:var(--text3)">👤</div>';
    if (!clienteId) { cont.innerHTML = vacio; return; }
    const doc = await Docs.ultimo('cliente', clienteId, 'foto_cliente').catch(() => null);
    if (!doc) { cont.innerHTML = vacio; return; }
    const url = await Docs.urlFirmada(doc.storage_path).catch(() => null);
    cont.innerHTML = url
      ? `<img src="${UI.esc(url)}" alt="Foto del cliente"
              style="width:96px;height:120px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">`
      : vacio;
  },

  _htmlDocumentos(id) {
    const pend = Object.keys(this._docsPendientes || {});
    return `
      <div class="form-group" style="background:var(--card2);border-radius:8px;padding:10px 12px">
        <label class="form-label">📎 Documentos de identificación</label>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">
          El <b>DPI y la licencia van por las dos caras</b>: el expediente queda incompleto con una sola.
          Del anverso del DPI, de la licencia y del recibo se leen los datos automáticamente.
          ${id ? '' : 'Se adjuntan al guardar el cliente.'}
        </div>
        ${Object.entries(this._DOCS_CLIENTE).map(([tipo, d]) => {
          const esReverso = tipo.endsWith('_reverso');
          return `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;
                      ${esReverso ? 'padding-left:16px;margin-top:-2px' : 'margin-top:8px'}">
            <span style="font-size:12px;min-width:230px">${esReverso ? '↳ ' : ''}${d.icon} ${d.label}
              ${this._LECTOR_DOC[tipo] ? '<span style="color:var(--cyan);font-size:10px">· se lee solo</span>' : ''}</span>
            <button type="button" class="btn btn-sm btn-cyan" onclick="document.getElementById('cli-doc-${tipo}-cam').click()">📷 Cámara</button>
            <button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById('cli-doc-${tipo}-gal').click()">📂 Archivo</button>
            ${pend.includes(tipo) ? '<span style="font-size:11px;color:var(--green)">✓ listo para adjuntar</span>' : ''}
            <input type="file" id="cli-doc-${tipo}-cam" accept="image/*" capture="environment" style="display:none"
              onchange="Modulos.clientesArmeria._subirDoc('${id || ''}','${tipo}',this)">
            <input type="file" id="cli-doc-${tipo}-gal" accept="image/*,application/pdf" style="display:none"
              onchange="Modulos.clientesArmeria._subirDoc('${id || ''}','${tipo}',this)">
          </div>`;
        }).join('')}
        <div id="cli-lectura-aviso" style="font-size:11px;margin:6px 0"></div>
        <div id="cli-docs"></div>
      </div>`;
  },

  async _subirDoc(clienteId, tipo, inputEl) {
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    const titulo = this._DOCS_CLIENTE[tipo]?.label || tipo;

    /* 1. Archivar. Si el cliente aún no existe, se retiene para subirlo
          apenas se cree — así la foto se toma una sola vez. */
    if (clienteId) {
      UI.toast('Subiendo…', 'info');
      const { error } = await Docs.subirArchivo('cliente', clienteId, tipo, titulo, file);
      if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
      UI.toast(`${titulo} archivado ✓`);
      Docs.render('cliente', clienteId, 'cli-docs');
      if (tipo === 'foto_cliente') this.renderFoto(clienteId);
    } else {
      this._docsPendientes[tipo] = { file, titulo };
      UI.toast(`${titulo} listo — se adjunta al guardar`);
      const cont = document.getElementById('cli-docs-box');
      if (cont) cont.innerHTML = this._htmlDocumentos('');
    }

    /* 2. Si es el ANVERSO del DPI y todavía no hay foto del cliente, se
          recorta la cara de ahí mismo. La foto ya la tenemos en la mano: no
          tiene sentido pedirle otra al cliente sólo para llenar el recuadro.
          Sólo se hace si NO hay una propia — una foto tomada a la persona
          siempre gana sobre un recorte de un carné plastificado. */
    if (tipo === 'dpi_frente') await this._fotoDesdeDPI(clienteId, file);

    /* 3. Leer, si este documento trae datos. Va después de archivar: si la
          lectura falla, el archivo ya quedó guardado igual. Se aceptan
          también PDF (los recibos de EEGSA llegan así), que la API lee igual. */
    const lector = this._LECTOR_DOC[tipo];
    const legible = file.type?.startsWith('image/') || file.type === 'application/pdf';
    if (lector && legible) await this._leerDocumento(file, lector);
  },

  /* Deriva la foto del cliente del anverso del DPI, si aún no tiene una. */
  async _fotoDesdeDPI(clienteId, fileDPI) {
    const yaTienePropia = clienteId
      ? !!(await Docs.ultimo('cliente', clienteId, 'foto_cliente').catch(() => null))
      : !!this._docsPendientes?.foto_cliente;
    if (yaTienePropia) return;

    const recorte = await this._recortarFotoDPI(fileDPI);
    if (!recorte) return;
    const titulo = 'Foto del cliente (recortada del DPI)';

    if (clienteId) {
      const { error } = await Docs.subirArchivo('cliente', clienteId, 'foto_cliente', titulo, recorte);
      if (error) return;                       // no es crítico: se puede subir a mano
      UI.toast('📸 Foto tomada del DPI — reemplazala si querés una del cliente');
      this.renderFoto(clienteId);
      Docs.render('cliente', clienteId, 'cli-docs');
    } else {
      this._docsPendientes.foto_cliente = { file: recorte, titulo };
      UI.toast('📸 Foto recortada del DPI — se adjunta al guardar');
      const cont = document.getElementById('cli-docs-box');
      if (cont) cont.innerHTML = this._htmlDocumentos('');
    }
  },

  /* Sube lo que quedó pendiente de un cliente recién creado. A diferencia de
     antes, PROPAGA los errores en vez de tragarlos con .catch(()=>{}): si
     algo falla (red, RLS, archivo rechazado) la persona se entera de cuál
     documento no quedó archivado y puede reintentarlo, en vez de que el
     sistema diga "adjuntado" cuando en realidad se perdió en silencio. */
  async _subirPendientes(clienteId) {
    const pend = this._docsPendientes || {};
    this._docsPendientes = {};
    const exitosos = [], fallidos = [];
    for (const [tipo, { file, titulo }] of Object.entries(pend)) {
      const { error } = await Docs.subirArchivo('cliente', clienteId, tipo, titulo, file);
      if (error) fallidos.push({ tipo, titulo, file, error });
      else exitosos.push(titulo);
    }
    /* Lo que falló se conserva pendiente (no se pierde): la próxima vez que
       se abra este cliente para editar, sigue ahí listo para reintentar. */
    if (fallidos.length) this._docsPendientes = Object.fromEntries(fallidos.map(f => [f.tipo, { file: f.file, titulo: f.titulo }]));
    return { exitosos, fallidos };
  },

  /* ══ IMPRESIÓN DEL EXPEDIENTE COMPLETO ══════════════════════════════════
     Perfil completo del cliente para el archivo físico: identidad, DPI,
     vivienda, licencia, tenencias y qué documentos están archivados. */
  async imprimirExpediente(clienteId) {
    const c = await this._obtenerCliente(clienteId);
    if (!c?.id) { UI.toast('No se encontró el cliente', 'error'); return; }
    const [tenencias, docs] = await Promise.all([
      DB.getTenencias(clienteId).catch(() => []),
      Docs.listar('cliente', clienteId).catch(() => []),
    ]);
    const t = window.Auth?.tenant || {};
    const edad = this.edadDe(c.fecha_nacimiento);
    const diasLic = c.licencia_tipo === 'portación' ? this.diasLicencia(c.licencia_vencimiento) : null;

    /* `fila` recibe el valor YA ESCAPADO. Antes escapaba adentro, y aunque
       era seguro, dejaba las llamadas con el dato crudo a la vista — que es
       justo lo que no se puede distinguir de un hueco real, ni a ojo ni con
       el detector de XSS. Escapar en el punto donde el dato entra al HTML
       hace que un descuido se vea. */
    const SIN_DATO = '<span style="color:#999">— sin dato —</span>';
    const fila = (label, valorHtml) => `<div class="campo"><span class="et">${label}</span><span>${valorHtml || SIN_DATO}</span></div>`;
    const unir = (...partes) => UI.esc(partes.filter(Boolean).join(' / '));

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Expediente — ${UI.esc(c.nombre || '')}</title>
    <style>
      @page { margin: 2cm; }
      body{font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;margin:0;color:#111}
      .barra{position:sticky;top:0;background:#fffbe6;border-bottom:1px solid #e0d9b0;padding:8px 12px;
             font-size:12px;display:flex;gap:10px;align-items:center;z-index:9}
      .barra button{font-size:12px;padding:5px 12px;border:1px solid #999;border-radius:5px;background:#fff;cursor:pointer}
      @media print { .barra{display:none} }
      .doc{padding:0 4px}
      h1{font-size:16px;margin:0 0 2px}
      .sub{font-size:11px;color:#555;margin-bottom:16px}
      h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #333;padding-bottom:3px;margin:18px 0 8px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 24px}
      .campo{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px dotted #ccc}
      .et{color:#555}
      table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px}
      th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
      th{background:#f2f2f2}
      .pie{margin-top:26px;font-size:9.5px;color:#666;border-top:1px dashed #bbb;padding-top:8px}
    </style></head><body>
    <div class="barra"><b>Expediente de armería</b>
      <button onclick="window.print()" style="margin-left:auto">🖨️ Imprimir</button></div>
    <div class="doc">
      <h1>${UI.esc(t.name || 'NexusPro Enterprise')}</h1>
      <div class="sub">NIT: ${UI.esc(t.nit || '—')} · Expediente de armería generado el ${new Date().toLocaleString('es-GT')}</div>

      <h2>Identificación</h2>
      <div class="grid">
        ${fila('Nombre', UI.esc(c.nombre))}
        ${fila('Edad', edad != null ? edad + ' años' : null)}
        ${fila('NIT', UI.esc(c.nit))}
        ${fila('Teléfono', UI.esc(c.tel))}
        ${fila('Email', UI.esc(c.email))}
        ${fila('DPI', UI.esc(c.dpi))}
        ${fila('Estado civil', UI.esc(c.estado_civil))}
        ${fila('Nacionalidad', UI.esc(c.nacionalidad))}
        ${fila('Profesión u oficio', UI.esc(c.profesion))}
        ${fila('Sexo', UI.esc(c.sexo))}
        ${fila('Fecha de nacimiento', UI.esc(c.fecha_nacimiento))}
        ${fila('Nacimiento — depto/muni', unir(c.nacimiento_departamento, c.nacimiento_municipio))}
        ${fila('Vecindad — depto/muni', unir(c.vecindad_departamento, c.vecindad_municipio))}
        ${fila('DPI — emisión / vence', unir(c.dpi_fecha_emision, c.dpi_fecha_vencimiento))}
        ${fila('DPI — serie / versión', unir(c.dpi_numero_serie, c.dpi_version))}
        ${fila('Registro civil L/F/P', unir(c.registro_libro, c.registro_folio, c.registro_pagina))}
      </div>

      <h2>Domicilio</h2>
      <div class="grid">
        ${fila('Dirección', UI.esc(c.direccion))}
        ${fila('La vivienda es', UI.esc(c.vivienda))}
      </div>

      <h2>Licencia de arma (DIGECAM)</h2>
      <div class="grid">
        ${fila('Tipo', UI.esc(c.licencia_tipo))}
        ${fila('No. de licencia', UI.esc(c.licencia_num))}
        ${fila('Vence', UI.esc(c.licencia_vencimiento))}
        ${fila('Estado', diasLic == null ? null : (diasLic < 0 ? `VENCIDA hace ${Math.abs(diasLic)} día(s)` : `Vigente — ${diasLic} día(s)`))}
        ${fila('Armas registradas', UI.esc(c.armas_registradas))}
      </div>

      <h2>Tenencias registradas (${tenencias.length})</h2>
      ${tenencias.length ? `<table><thead><tr><th>Arma</th><th>Calibre</th><th>Serie</th><th>Marcaje GUA</th><th>Estado</th></tr></thead>
        <tbody>${tenencias.map(x => `<tr>
          <td>${UI.esc([x.marca, x.modelo].filter(Boolean).join(' ') || x.tipo || '—')}</td>
          <td>${UI.esc(x.calibre || '—')}</td>
          <td>${UI.esc(x.numero_serie || '—')}</td>
          <td>${UI.esc(x.marcaje_gua || '—')}</td>
          <td>${x.activa ? 'Activa' : 'Baja'}</td>
        </tr>`).join('')}</tbody></table>` : '<div style="color:#777;font-size:11.5px">Sin tenencias registradas.</div>'}

      <h2>Documentos archivados (${docs.length})</h2>
      ${docs.length ? `<table><thead><tr><th>Documento</th><th>Fecha</th></tr></thead>
        <tbody>${docs.map(d => `<tr><td>${UI.esc(d.titulo || d.tipo || 'Documento')}</td><td>${UI.fechaHora(d.created_at)}</td></tr>`).join('')}</tbody></table>`
        : '<div style="color:#777;font-size:11.5px">Sin documentos archivados.</div>'}

      <div class="pie">Documento informativo generado por NexusPro a partir de los datos registrados del cliente.
        Verifique contra los documentos físicos antes de usarlo en un trámite ante DIGECAM.</div>
    </div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=880,height=800');
    if (!w) { UI.toast('Permití las ventanas emergentes para generar el expediente', 'error'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
  },

  /* ══ GUARDAR ═════════════════════════════════════════════════════════════
     id vacío → crea el cliente con lo mínimo (nombre/teléfono) más lo que se
     haya llenado del expediente. id dado → sólo actualiza el expediente; los
     campos generales (notas, puntos, retención) no se tocan desde acá. */
  async guardar(id = '') {
    const fields = {};

    if (!id) {
      const nombre = document.getElementById('cli-nombre')?.value.trim();
      const tel = document.getElementById('cli-tel')?.value.trim();
      if (!nombre || !tel) { UI.toast('Nombre y teléfono son obligatorios', 'error'); return; }
      Object.assign(fields, {
        tipo: 'individual', nombre, tel,
        nit: document.getElementById('cli-nit')?.value.trim() || null,
        email: document.getElementById('cli-email')?.value.trim() || null,
      });
    } else {
      fields.id = id;
    }

    const v = (idEl, transformar = x => x.trim() || null) => {
      const el = document.getElementById(idEl);
      return el ? transformar(el.value ?? '') : undefined;
    };
    const asignar = (idEl, clave, transformar) => {
      const val = v(idEl, transformar);
      if (val !== undefined) fields[clave] = val;
    };
    asignar('cli-dir', 'direccion');
    asignar('cli-vivienda', 'vivienda', x => x || null);
    asignar('cli-dpi', 'dpi');
    asignar('cli-fnac', 'fecha_nacimiento', x => x || null);
    asignar('cli-estado-civil', 'estado_civil', x => x || null);
    asignar('cli-profesion', 'profesion');
    asignar('cli-nacionalidad', 'nacionalidad');
    asignar('cli-pais-nac', 'pais_nacimiento');
    asignar('cli-sexo', 'sexo', x => x || null);
    asignar('cli-nac-depto', 'nacimiento_departamento', x => x || null);
    asignar('cli-nac-muni', 'nacimiento_municipio', x => x || null);
    asignar('cli-nac-cp', 'nacimiento_codigo_postal');
    asignar('cli-vec-depto', 'vecindad_departamento', x => x || null);
    asignar('cli-vec-muni', 'vecindad_municipio', x => x || null);
    asignar('cli-cp', 'codigo_postal');
    asignar('cli-dpi-emision', 'dpi_fecha_emision', x => x || null);
    asignar('cli-dpi-vence', 'dpi_fecha_vencimiento', x => x || null);
    asignar('cli-dpi-serie', 'dpi_numero_serie');
    asignar('cli-dpi-version', 'dpi_version');
    asignar('cli-reg-libro', 'registro_libro');
    asignar('cli-reg-folio', 'registro_folio');
    asignar('cli-reg-pagina', 'registro_pagina');
    asignar('cli-lic-tipo', 'licencia_tipo', x => x || null);
    asignar('cli-lic-num', 'licencia_num');
    asignar('cli-lic-vence', 'licencia_vencimiento', x => x || null);
    /* Entero o null: mandar '' a una columna integer revienta el insert. */
    asignar('cli-armas-reg', 'armas_registradas', x => (x ? Number(x) : null));

    const { data: guardado, error } = await DB.upsertCliente(fields);
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }

    /* Las fotos tomadas antes de que el cliente existiera se adjuntan ahora
       que ya tiene id — reporta EXACTAMENTE lo que se logró archivar, no una
       cuenta de cuántas había en cola (eso mentía cuando algo fallaba). */
    const nuevoId = id || guardado?.id;
    let resumen = '';
    if (nuevoId && Object.keys(this._docsPendientes || {}).length) {
      const { exitosos, fallidos } = await this._subirPendientes(nuevoId);
      if (exitosos.length) resumen += ` · ${exitosos.length} documento(s) adjuntado(s)`;
      if (fallidos.length) {
        UI.toast(`⚠️ ${fallidos.length} documento(s) NO se pudieron archivar (reintentá desde el expediente): ${fallidos.map(f=>f.titulo).join(', ')}`, 'error', 9000);
      }
    }

    UI.cerrarModal();
    UI.toast(id ? 'Expediente actualizado ✓' : `Cliente creado ✓${resumen}`);

    const cb = this._onGuardado;
    if (cb) { this._onGuardado = null; cb(guardado || { id: nuevoId }); return; }

    /* Alta hecha desde el expediente sin callback (ej. desde el botón de la
       lista de Clientes): el botón decía "Crear y continuar", así que se
       reabre en modo edición para completar el resto —DPI, licencia,
       tenencias— en la misma sesión. Al EDITAR un expediente ya completo,
       en cambio, "Guardar Expediente" cierra y ya: reabrirlo sería un
       parpadeo que nadie pidió. */
    if (!id && nuevoId) { await this.modalForm(nuevoId); return; }
  },
};
