/* Clientes Module */
Modulos.clientes = {
  _data: [],

  /* Los datos personales largos (fecha de nacimiento, estado civil,
     profesión, nacionalidad, DPI, vivienda) y los documentos de
     identificación existen por la Ley de Armas: son los que la declaración
     jurada exige. A un taller mecánico o una venta de granos no le sirven
     de nada, así que sólo se piden si el comercio tiene armería activa.
     Un negocio mixto (taller + armería) sí los ve, y los deja vacíos en los
     clientes que no compran armas — el módulo de armería ya avisa cuando
     falta algo al momento de vender. */
  _pideDatosArmeria() {
    const mods = window.Auth?.tenant?.modulos_activos;
    return Array.isArray(mods) ? mods.includes('armeria') : false;
  },

  async render(busca='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._data = await DB.getClientes(busca||null);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">👥 Clientes</h1>
        <p class="page-subtitle">// ${this._data.length} registrados</p></div>
        <div class="page-actions">
          <select class="form-select" style="width:130px" onchange="Modulos.clientes.render(document.getElementById('cli-busca')?.value,this.value)">
            <option value="">Todos los tipos</option>
            <option value="individual">Individual</option>
            <option value="empresa">Empresa</option>
          </select>
          <button class="btn btn-ghost" onclick="window.print()">🖨 Imprimir</button>
          <button class="btn btn-amber" onclick="Modulos.clientes.modalForm()">＋ Nuevo Cliente</button>
        </div>
      </div>
      <div class="page-body">
        <div class="search-bar" style="margin-bottom:16px">
          <input class="form-input" id="cli-busca" placeholder="🔍 Buscar nombre, NIT, teléfono..." style="margin-bottom:12px"
                 value="${busca}" oninput="Modulos.clientes.render(this.value)">
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Nombre</th><th>Tipo</th><th>NIT</th><th>Teléfono</th><th>Email</th><th>Acciones</th>
            </tr></thead>
            <tbody>
              ${this._data.map(c=>`<tr>
                <td><b>${c.nombre}</b>${c.nombre_empresa?'<br><small>'+c.nombre_empresa+'</small>':''}</td>
                <td><span class="badge badge-${c.tipo==='empresa'?'amber':'cyan'}">${c.tipo==='empresa'?'Empresa':'Individual'}</span></td>
                <td class="mono-sm">${c.nit||'CF'}</td>
                <td>${c.tel||'—'}</td>
                <td>${c.email||'—'}</td>
                <td onclick="event.stopPropagation()">
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-sm btn-cyan" onclick="Modulos.clientes.modalForm('${c.id}')" title="Editar">✏️ Editar</button>
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.clientes.whatsapp('${c.tel}','${c.nombre}')" title="WhatsApp">💬</button>
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.clientes.verVehiculos('${c.id}','${c.nombre}')" title="Vehículos">🚗</button>
                    <button class="btn btn-sm btn-danger" onclick="Modulos.clientes.eliminar('${c.id}','${c.nombre}')" title="Eliminar">🗑️</button>
                  </div>
                </td>
              </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">Sin clientes registrados</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  /* onGuardado: callback opcional para quien abre el alta desde otro módulo
     (ej. Armería crea el cliente sin perder la operación que estaba llenando). */
  _onGuardado: null,

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

  /* ── Lectura automática de DPI y recibo de servicios ─────────────────────
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

    if (file.size > 5 * 1024 * 1024) { pintar('⚠️ La imagen pesa más de 5 MB.', 'var(--red)'); return; }
    pintar('⏳ Leyendo el documento…');

    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
    }).catch(() => null);
    if (!base64) { pintar('⚠️ No se pudo leer el archivo.', 'var(--red)'); return; }

    const lectores = {
      dpi:      () => IA.escanearDPI(base64),
      recibo:   () => IA.escanearRecibo(base64),
      licencia: () => IA.escanearLicencia(base64),
    };
    const r = await (lectores[cual] || lectores.dpi)();
    if (!r?.ok) { pintar('⚠️ ' + (r?.error || 'No se pudo leer el documento.'), 'var(--red)'); return; }

    let datos;
    try {
      /* El modelo a veces envuelve el JSON en ```; se limpia antes de parsear. */
      datos = JSON.parse(String(r.texto || '').replace(/```json|```/g, '').trim());
    } catch (_) { pintar('⚠️ El documento no se leyó con claridad. Escribí los datos a mano.', 'var(--red)'); return; }

    const mapas = {
      /* La dirección del DPI sólo viene en el diseño nuevo; en el anterior es
         null y el recibo de servicios sigue siendo la fuente. */
      dpi: { 'cli-dpi': datos.cui, 'cli-nombre': datos.nombre_completo, 'cli-fnac': datos.fecha_nacimiento,
             'cli-estado-civil': datos.estado_civil, 'cli-nacionalidad': datos.nacionalidad,
             'cli-lugar-nac': datos.lugar_nacimiento, 'cli-dir': datos.direccion },
      recibo: { 'cli-dir': datos.direccion },
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
      if (!actual) { el.value = v; llenados.push(idEl); }
      else if (actual.toLowerCase() !== v.toLowerCase()) distintos.push(`${el.previousElementSibling?.textContent || idEl}: el documento dice «${v}»`);
    }
    this._mostrarEdad();

    const nombreDoc = { dpi: 'DPI', recibo: 'recibo', licencia: 'licencia' }[cual] || 'documento';
    const partes = [];
    if (llenados.length) partes.push(`<span style="color:var(--green)">✅ ${llenados.length} campo(s) llenados desde el ${nombreDoc}.</span>`);
    /* El tipo de licencia es el dato del que depende el tope de munición: si no
       se pudo leer, hay que decirlo fuerte y no dejar que pase inadvertido. */
    if (cual === 'licencia' && !datos.tipo)
      partes.push('<span style="color:var(--red)">⚠️ No se pudo distinguir si es de <b>tenencia</b> o de <b>portación</b>. Elegilo a mano: de eso depende cuánta munición se le puede entregar.</span>');
    if (distintos.length) partes.push(`<span style="color:var(--amber)">⚠️ No se tocó lo que ya estaba escrito. Diferencias: ${distintos.join(' · ')}</span>`);
    if (!partes.length) partes.push('<span style="color:var(--amber)">El documento no aportó datos nuevos.</span>');
    partes.push('<span style="color:var(--text3)">Revisá siempre contra el documento físico antes de guardar: esto alimenta una declaración jurada.</span>');
    pintar(partes.join('<br>'));
  },

  /* Atajos por nombre — la lectura la dispara _subirDoc, pero se dejan
     expuestos para poder probarlos y para quien quiera leer sin archivar. */
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

  _avisarLicencia() {
    const box = document.getElementById('cli-lic-aviso');
    if (!box) return;
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

  async modalForm(id=null, onGuardado=null) {
    /* `|| {}`: si el id no está en la lista cargada (otro módulo abrió la
       ficha con una lista distinta), el formulario sale vacío en vez de
       tumbar la pantalla con "cannot read properties of undefined". */
    const c = (id ? this._data.find(x=>x.id===id) : {}) || {};
    const esEdicion = !!id;
    const armeria = this._pideDatosArmeria();
    if (onGuardado !== null) this._onGuardado = onGuardado;
    /* Al abrir una ficha se descarta lo pendiente de otra: si no, una foto
       tomada para un cliente terminaría adjuntada al siguiente. */
    if (!esEdicion) this._docsPendientes = {};
    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Cliente`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del cliente.</div></div>':''}
      <div style="display:flex;gap:12px;margin-bottom:12px">
        <label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px;background:var(--surface2);border-radius:8px;cursor:pointer">
          <input type="radio" name="cli-tipo" value="individual" ${(!c.tipo||c.tipo==='individual')?'checked':''} onchange="document.getElementById('cli-empresa-row').style.display='none'"> Individual
        </label>
        <label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px;background:var(--surface2);border-radius:8px;cursor:pointer">
          <input type="radio" name="cli-tipo" value="empresa" ${c.tipo==='empresa'?'checked':''} onchange="document.getElementById('cli-empresa-row').style.display='grid'"> Empresa
        </label>
      </div>
      <div id="cli-empresa-row" class="form-row" style="display:${c.tipo==='empresa'?'grid':'none'}">
        <div class="form-group"><label class="form-label">Nombre de Empresa</label>
          <input class="form-input" id="cli-empresa" value="${c.nombre_empresa||''}"></div>
        <div class="form-group"><label class="form-label">Representante</label>
          <input class="form-input" id="cli-representante" value="${c.representante||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre Completo *</label>
          <input class="form-input" id="cli-nombre" value="${UI.esc(c.nombre||'')}"></div>
        <div class="form-group"><label class="form-label">NIT</label>
          <div style="display:flex;gap:6px">
            <input class="form-input" id="cli-nit" value="${c.nit||''}" placeholder="CF" style="flex:1">
            <button type="button" class="btn btn-ghost" onclick="Modulos.verificarNIT('cli-nit','cli-nit-status','cli-nombre')" title="Verificar NIT con la SAT">🔎</button>
          </div>
          <div id="cli-nit-status" style="margin-top:4px;min-height:14px"></div></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Teléfono *</label>
          <input class="form-input" id="cli-tel" value="${c.tel||''}" placeholder="5501-1234"></div>
        <div class="form-group"><label class="form-label">Email</label>
          <input class="form-input" id="cli-email" value="${UI.esc(c.email||'')}" type="email"></div>
      </div>

      <!-- Datos que exige una declaración jurada (art. 55 a) de la Ley de
           Armas y art. 17 b) de su reglamento: edad, estado civil,
           nacionalidad, profesión y DPI). Guardados acá, el documento sale
           lleno en vez de con rayas para escribir a mano cada vez.
           Sólo se piden si el comercio vende armas. -->
      ${!armeria ? '' : `
      <div style="background:var(--card2);border-radius:8px;padding:10px 12px;margin-bottom:12px">
        <div style="font-size:12px;font-weight:700;margin-bottom:2px">🪪 Datos personales (para declaraciones juradas y trámites)</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">
          Se llenan solos al adjuntar el DPI y el recibo de servicios ahí abajo 👇
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">DPI</label>
            <input class="form-input" id="cli-dpi" value="${c.dpi||''}" placeholder="0000 00000 0000" style="font-family:monospace"></div>
          <div class="form-group"><label class="form-label">Fecha de nacimiento</label>
            <input class="form-input" id="cli-fnac" type="date" value="${c.fecha_nacimiento||''}"
                   max="${new Date().toISOString().slice(0,10)}" onchange="Modulos.clientes._mostrarEdad()">
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
            <input class="form-input" id="cli-nacionalidad" value="${c.nacionalidad||''}" placeholder="Guatemalteca"></div>
          <div class="form-group"><label class="form-label">Lugar de nacimiento</label>
            <input class="form-input" id="cli-lugar-nac" value="${c.lugar_nacimiento||''}" placeholder="Municipio, departamento"></div>
        </div>
      </div>`}
      <div class="form-row">
        <div class="form-group" style="flex:2"><label class="form-label">Dirección${armeria ? ' completa' : ''}</label>
          <input class="form-input" id="cli-dir" value="${UI.esc(c.direccion||'')}"
                 placeholder="${armeria ? 'Calle, avenida, número de casa, zona, municipio, departamento' : ''}"></div>
        ${!armeria ? '' : `
        <div class="form-group"><label class="form-label">La vivienda es</label>
          <select class="form-select" id="cli-vivienda">
            <option value="">— No indicado —</option>
            <option value="propia"   ${c.vivienda==='propia'?'selected':''}>🏠 Propia</option>
            <option value="rentada"  ${c.vivienda==='rentada'?'selected':''}>🔑 Rentada</option>
            <option value="familiar" ${c.vivienda==='familiar'?'selected':''}>👪 Familiar / prestada</option>
          </select></div>`}
      </div>
      ${!armeria ? '' : `
      <div class="form-group" style="background:var(--card2);border-radius:8px;padding:10px 12px">
        <label class="form-label">🔫 Licencia de arma (DIGECAM)</label>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">
          Se llena sola al subir el <b>anverso de la licencia</b> abajo. De estos datos sale el tope
          mensual de munición del art. 60, y quedan copiados en cada entrega como evidencia del día.
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Tipo</label>
            <select class="form-select" id="cli-lic-tipo">
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
                   onchange="Modulos.clientes._avisarLicencia()"></div>
          <div class="form-group"><label class="form-label">Armas registradas</label>
            <select class="form-select" id="cli-armas-reg">
              <option value="">— No indicado —</option>
              ${[1,2,3].map(n=>`<option value="${n}" ${Number(c.armas_registradas)===n?'selected':''}>${n} arma${n===1?'':'s'}</option>`).join('')}
            </select>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">Máximo 3 (art. 72).</div></div>
        </div>
        <div id="cli-lic-aviso" style="font-size:11.5px;margin-top:4px"></div>
      </div>`}
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="cli-notas" rows="2">${UI.esc(c.notas||'')}</textarea></div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="cli-puntos" ${c.programa_puntos?'checked':''}>
          <span class="form-label" style="margin:0">⭐ Inscrito en programa de puntos${esEdicion&&c.programa_puntos?` — saldo: <b>${c.puntos_saldo||0}</b> pts`:''}</span>
        </label>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Acumula Q1 = 1 punto en cada compra; canje 10 puntos = Q1.</div>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="cli-agente-ret" ${c.agente_retencion?'checked':''}
            onchange="document.getElementById('cli-ret-pcts').style.display=this.checked?'grid':'none'">
          <span class="form-label" style="margin:0">🧾 Es agente de retención (ISR / IVA)</span>
        </label>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Al facturarle, se registra automáticamente la retención sufrida (acreditable).</div>
        <div id="cli-ret-pcts" style="display:${c.agente_retencion?'grid':'none'};grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
          <div>
            <label class="form-label">% Retención IVA</label>
            <input type="number" step="0.01" min="0" max="100" class="form-input" id="cli-ret-iva" value="${c.ret_iva_pct||''}" placeholder="ej. 15">
          </div>
          <div>
            <label class="form-label">% Retención ISR</label>
            <input type="number" step="0.01" min="0" max="100" class="form-input" id="cli-ret-isr" value="${c.ret_isr_pct||''}" placeholder="ej. 1.5">
          </div>
        </div>
      </div>
      ${!armeria ? '' : `<div id="cli-docs-box">${this._htmlDocumentos(id)}</div>`}
      ${!esEdicion?`
      <div class="card" style="background:var(--amber-dim);border-color:var(--amber-border);margin-top:4px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="cli-tracking">
          <div><b>🔍 Activar seguimiento de OTs</b>
          <div style="font-size:11px;color:var(--text2)">El cliente puede ver el avance de sus órdenes. Usuario: email · Pass: teléfono</div></div>
        </label>
      </div>`:''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.clientes.guardar('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear Cliente'}
        </button>
      </div>`,'640px');
    if (esEdicion) Docs.render('cliente', id, 'cli-docs');
    this._mostrarEdad();
    this._avisarLicencia();
  },

  /* DPI, licencia (tenencia/portación) o pasaporte — foto o PDF. Vive en el
     cliente en general (no solo en Armería) porque cualquier vertical puede
     necesitar identificar a alguien; Armería es quien más lo exige hoy. */
  /* El DPI y la licencia tienen DOS CARAS y las dos van al expediente: es lo
     que piden DIGECAM y el notario, y con una sola el expediente queda
     incompleto aunque el dato ya se haya leído.

     OJO con dónde vive cada dato en el DPI guatemalteco: el ANVERSO trae el
     CUI, nombres, fecha y lugar de nacimiento, vecindad, estado civil y
     vencimiento. El REVERSO es sobre todo la zona legible por máquina y los
     elementos de seguridad. Por eso la lectura automática apunta al anverso;
     el reverso se archiva para completar el expediente, no para sacar campos
     que no están ahí. */
  _DOCS_CLIENTE: {
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
     trae datos aprovechables, se LEEN de una vez. Antes había dos caminos
     separados —un botón para leer y otro para adjuntar— y el usuario tenía
     que dar la misma foto dos veces. */
  _LECTOR_DOC: {
    dpi_frente: 'dpi',
    pasaporte: 'dpi',
    licencia_frente: 'licencia',
    recibo_servicios: 'recibo',
    /* Los REVERSOS no se leen: sus datos ya vinieron del anverso. Mandarlos al
       lector gastaría una llamada de IA para devolver nulos, y peor: si
       devolviera algo mal leído, sobrescribiría lo bueno. */
  },

  /* Documentos que exige el expediente de una armería (art. 59 y 72 de la Ley
     de Armas). Las dos caras cuentan por separado: falta una, falta el
     documento. El pasaporte sustituye al DPI sólo para extranjeros. */
  _DOCS_OBLIGATORIOS_ARMERIA: ['dpi_frente', 'dpi_reverso', 'recibo_servicios'],

  /* Fotos tomadas antes de que el cliente exista. Un cliente nuevo todavía
     no tiene id, y el archivo se guarda en una carpeta con ese id — así que
     se retienen acá y se suben apenas se crea. Sin esto habría que tomar la
     foto otra vez después de guardar. */
  _docsPendientes: {},

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
          /* El reverso se dibuja pegado a su anverso —sin la línea de arriba y
             con sangría— para que se lea como un documento de dos caras y no
             como dos documentos sueltos. */
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
              onchange="Modulos.clientes._subirDoc('${id || ''}','${tipo}',this)">
            <input type="file" id="cli-doc-${tipo}-gal" accept="image/*,application/pdf" style="display:none"
              onchange="Modulos.clientes._subirDoc('${id || ''}','${tipo}',this)">
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
    } else {
      this._docsPendientes[tipo] = { file, titulo };
      UI.toast(`${titulo} listo — se adjunta al guardar`);
      const cont = document.getElementById('cli-docs-box');
      if (cont) cont.innerHTML = this._htmlDocumentos('');
    }

    /* 2. Leer, si este documento trae datos. Va después de archivar: si la
          lectura falla, el archivo ya quedó guardado igual. */
    const lector = this._LECTOR_DOC[tipo];
    if (lector && file.type?.startsWith('image/')) await this._leerDocumento(file, lector);
  },

  /* Sube lo que quedó pendiente de un cliente recién creado. */
  async _subirPendientes(clienteId) {
    const pend = this._docsPendientes || {};
    this._docsPendientes = {};
    for (const [tipo, { file, titulo }] of Object.entries(pend)) {
      await Docs.subirArchivo('cliente', clienteId, tipo, titulo, file).catch(() => {});
    }
    return Object.keys(pend).length;
  },

  async guardar(id='') {
    const tipo   = document.querySelector('input[name="cli-tipo"]:checked')?.value||'individual';
    const nombre = document.getElementById('cli-nombre')?.value.trim();
    const tel    = document.getElementById('cli-tel')?.value.trim();
    if (!nombre||!tel) { UI.toast('Nombre y teléfono son obligatorios','error'); return; }

    const fields = {
      tipo, nombre, tel,
      nit:            document.getElementById('cli-nit')?.value.trim()||null,
      email:          document.getElementById('cli-email')?.value.trim()||null,
      direccion:      document.getElementById('cli-dir')?.value.trim()||null,
      notas:          document.getElementById('cli-notas')?.value.trim()||null,
      nombre_empresa: tipo==='empresa'?document.getElementById('cli-empresa')?.value.trim():null,
      representante:  tipo==='empresa'?document.getElementById('cli-representante')?.value.trim():null,
      programa_puntos: document.getElementById('cli-puntos')?.checked || false,
      agente_retencion: document.getElementById('cli-agente-ret')?.checked || false,
      ret_iva_pct: parseFloat(document.getElementById('cli-ret-iva')?.value) || 0,
      ret_isr_pct: parseFloat(document.getElementById('cli-ret-isr')?.value) || 0
    };
    /* Los campos de armería sólo se mandan si sus inputs EXISTEN en la
       pantalla. Mandarlos siempre los pondría en null cuando el bloque no se
       dibuja (comercio sin armería), y eso BORRARÍA lo ya guardado — por
       ejemplo si alguien apaga el módulo un rato, o al editar el cliente
       desde una pantalla que no muestra el bloque. Ausente ≠ vacío. */
    const siExiste = (idEl, clave, transformar = v => v.trim() || null) => {
      const el = document.getElementById(idEl);
      if (el) fields[clave] = transformar(el.value ?? '');
    };
    siExiste('cli-vivienda', 'vivienda', v => v || null);
    siExiste('cli-dpi', 'dpi');
    siExiste('cli-fnac', 'fecha_nacimiento', v => v || null);
    siExiste('cli-estado-civil', 'estado_civil', v => v || null);
    siExiste('cli-profesion', 'profesion');
    siExiste('cli-nacionalidad', 'nacionalidad');
    siExiste('cli-lugar-nac', 'lugar_nacimiento');
    siExiste('cli-lic-tipo', 'licencia_tipo', v => v || null);
    siExiste('cli-lic-num', 'licencia_num');
    siExiste('cli-lic-vence', 'licencia_vencimiento', v => v || null);
    /* Entero o null: mandar '' a una columna integer revienta el insert. */
    siExiste('cli-armas-reg', 'armas_registradas', v => (v ? Number(v) : null));

    if (id) fields.id = id;

    /* Aviso (no bloquea) si el NIT tiene dígito verificador inválido */
    if (fields.nit && !NIT.validarLocal(fields.nit).valido) {
      UI.toast('Aviso: el dígito verificador del NIT no parece válido','warn');
    }

    const tracking = !id && document.getElementById('cli-tracking')?.checked;

    const { data: guardado, error } = await DB.upsertCliente(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }

    /* Acceso de seguimiento: usuario = email, contraseña = su teléfono */
    if (tracking) {
      const passDigits = (fields.tel||'').replace(/\D/g,'');
      if (!fields.email) {
        UI.toast('Para el acceso de seguimiento el cliente necesita un email','warn');
      } else if (passDigits.length < 6) {
        UI.toast('El teléfono necesita al menos 6 dígitos para usarse como contraseña','warn');
      } else {
        UI.toast('Creando acceso de seguimiento...','info');
        const r = await Auth.crearUsuario({
          nombre: fields.nombre, email: fields.email, rol: 'cliente',
          telefono: fields.tel, avatar: '🚗', password: passDigits
        });
        if (r.ok) {
          /* La contraseña ES su teléfono: no forzar cambio en el primer ingreso */
          if (r.id) await DB.upsertUsuario({ id: r.id, debe_cambiar_password: false });
          UI.toast(`Acceso creado ✓ — usuario: ${fields.email} · contraseña: su teléfono`);
        } else {
          UI.toast('Cliente guardado; el acceso no se pudo crear: '+r.error,'warn');
        }
      }
    }

    /* Las fotos tomadas antes de que el cliente existiera se adjuntan ahora
       que ya tiene id. Así la foto se toma UNA vez, no una para leerla y
       otra para archivarla. */
    const nuevoId = id || guardado?.id;
    let adjuntados = 0;
    if (nuevoId && Object.keys(this._docsPendientes || {}).length) {
      adjuntados = await this._subirPendientes(nuevoId);
    }

    UI.cerrarModal();
    UI.toast(id ? 'Cliente actualizado ✓'
                : `Cliente creado ✓${adjuntados ? ` · ${adjuntados} documento(s) adjuntado(s)` : ''}`);

    /* Quien nos abrió desde otro módulo (ej. Armería) sigue su flujo con el
       cliente ya creado, en vez de perder la operación a medio llenar. */
    const cb = this._onGuardado;
    if (cb) { this._onGuardado = null; await this.render(); cb(guardado || null); return; }
    await this.render();
  },

  async eliminar(id, nombre) {
    const ok = await UI.confirmar(`¿Eliminar cliente <b>${nombre}</b>? Esta acción no se puede deshacer.`, 'Eliminar');
    if (!ok) return;
    const r = await DB.deleteCliente(id);
    if (r) { UI.toast('Cliente eliminado'); this.render(); }
    else UI.toast('Error al eliminar','error');
  },

  verVehiculos(clienteId, nombre) {
    App.navegarA('vehiculos');
    setTimeout(() => Modulos.vehiculos?.render(clienteId), 300);
  },

  imprimir() { window.print(); },

  whatsapp(tel, nombre) {
    if (!tel) { UI.toast('Este cliente no tiene teléfono registrado','warn'); return; }
    const num = tel.replace(/[^0-9]/g,'');
    const msg = `Hola ${nombre}, le contactamos desde ${Auth.tenant?.name||'el taller'}.`;
    window.open(`https://wa.me/502${num}?text=${encodeURIComponent(msg)}`, '_blank');
  }
};
