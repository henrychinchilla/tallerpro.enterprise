/* Configuración Module */
Modulos.configuracion = {
  _terminales: [],

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const t = Auth.tenant || {};
    /* Las terminales del POS se administran acá. Antes no se administraban en
       ningún lado: el POS mandaba a pedírselas al administrador y el
       administrador no tenía dónde crearlas, así que un negocio con módulo POS
       activo simplemente no podía cobrar nunca (le pasó a El Granjero). */
    this._terminales = (await DB.getTodasTerminalesPOS().catch(() => ({ data: [] }))).data || [];

    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">⚙️ Configuración</h1>
        <p class="page-subtitle">// ${t.name||'NexusPro'}</p>
      </div>
      <div class="page-body">
        <div class="grid-2">
          <div class="card card-amber">
            <div class="card-sub mb-4">🏪 Información del Negocio</div>
            <div class="form-group"><label class="form-label">Logo del negocio</label>
              <div style="display:flex;align-items:center;gap:12px">
                <div id="cfg-logo-prev" style="width:64px;height:64px;border-radius:12px;border:1px solid var(--border);background:var(--surface2);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                  ${t.logo_base64?`<img src="${t.logo_base64}" style="width:100%;height:100%;object-fit:contain">`:'<span style="font-size:24px">🏪</span>'}
                </div>
                <div style="display:flex;flex-direction:column;gap:6px">
                  <input type="file" id="cfg-logo-file" accept="image/*" style="display:none" onchange="Modulos.configuracion._onLogo(this)">
                  <button class="btn btn-ghost btn-sm" onclick="document.getElementById('cfg-logo-file').click()">📷 Subir logo</button>
                  ${t.logo_base64?`<button class="btn btn-ghost btn-sm" onclick="Modulos.configuracion.quitarLogo()">🗑️ Quitar</button>`:''}
                </div>
              </div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px">PNG/JPG, se ajusta automáticamente. Aparece en el menú y en tus documentos.</div>
            </div>
            <div class="form-group"><label class="form-label">Nombre *</label>
              <input class="form-input" id="cfg-nombre" value="${t.name||''}"></div>
            <div class="form-group"><label class="form-label">NIT</label>
              <input class="form-input" id="cfg-nit" value="${t.nit||''}"></div>
            <div class="form-group"><label class="form-label">No. Patronal IGSS</label>
              <input class="form-input mono-sm" id="cfg-igss-pat" value="${t.igss_patronal||''}" placeholder="Escriba número patronal"></div>
            <div class="form-group"><label class="form-label">Teléfono</label>
              <input class="form-input" id="cfg-tel" value="${t.tel||''}"></div>
            <div class="form-group"><label class="form-label">Email</label>
              <input class="form-input" id="cfg-email" value="${UI.esc(t.email||'')}"></div>
            <div class="form-group"><label class="form-label">Dirección</label>
              <input class="form-input" id="cfg-dir" value="${t.address||''}"></div>
            <button class="btn btn-amber" onclick="Modulos.configuracion.guardar()">Guardar Cambios</button>
          </div>
          <div>
            <div class="card card-red mb-4">
              <div class="card-sub mb-3">🔒 Seguridad de Sesión</div>
              <div class="form-group"><label class="form-label">Cierre de sesión por inactividad (minutos)</label>
                <input type="number" step="1" min="1" max="480" class="form-input" id="cfg-session-timeout" value="${t.session_timeout_minutes||15}">
                <div style="font-size:11px;color:var(--text3);margin-top:4px">La sesión se cerrará automáticamente tras este tiempo sin actividad. Recomendado: 15 minutos.</div>
              </div>
              <button class="btn btn-danger" onclick="Modulos.configuracion.guardarSeguridad()">Guardar</button>
            </div>
            ${(()=>{ const pt = t.config_pos_tarjeta || {}; return `
            <div class="card card-green mb-4">
              <div class="card-sub mb-3">💳 Cobro con tarjeta (POS físico)</div>
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:10px;cursor:pointer;user-select:none">
                <input type="checkbox" id="cfg-pt-on" style="width:16px;height:16px" ${pt.habilitado?'checked':''}>
                <span>Acepto pagos con tarjeta de crédito/débito (opcional)</span>
              </label>
              <div class="form-row">
                <div class="form-group"><label class="form-label">Proveedor del POS</label>
                  <select class="form-select" id="cfg-pt-prov">
                    ${['VISA (Visanet)','CREDOMATIC (BAC)','Otro'].map(p=>`<option ${pt.proveedor===p?'selected':''}>${p}</option>`).join('')}
                  </select></div>
                <div class="form-group"><label class="form-label">Comisión (%)</label>
                  <input class="form-input" id="cfg-pt-comision" type="number" min="0" max="15" step="0.01" value="${pt.comision_pct??''}" placeholder="Ej. 4.5"></div>
              </div>
              <div class="form-row">
                <div class="form-group"><label class="form-label">No. de afiliación</label>
                  <input class="form-input mono-sm" id="cfg-pt-afiliacion" value="${pt.afiliacion||''}" placeholder="No. de afiliado/comercio"></div>
                <div class="form-group"><label class="form-label">Banco que deposita</label>
                  <input class="form-input" id="cfg-pt-banco" value="${pt.banco||''}" placeholder="Ej. BAC, BI, Banrural"></div>
              </div>
              <div class="form-group"><label class="form-label">Fee mensual del POS (Q)</label>
                <input class="form-input mono-sm" id="cfg-pt-fee" type="number" min="0" step="0.01" value="${pt.fee_mensual??''}" placeholder="Renta mensual del aparato POS">
                <div style="font-size:10.5px;color:var(--text3);margin-top:3px">Se toma en cuenta como gasto fijo en Finanzas → 🎯 Política de precios</div></div>
              <div class="alert alert-cyan" style="margin-bottom:10px"><div class="alert-icon">🔒</div><div class="alert-body" style="font-size:11px">
                NexusPro <b>nunca guarda el número completo ni el CVV</b> de las tarjetas de tus clientes.
                El cobro se hace en tu POS físico y aquí solo se registra el voucher: autorización y últimos 4 dígitos.
              </div></div>
              <button class="btn btn-green" onclick="Modulos.configuracion.guardarPosTarjeta()">Guardar</button>
            </div>`; })()}
            ${(()=>{ const caja = t.config_pos_caja || {}; return `
            <div class="card card-amber mb-4">
              <div class="card-sub mb-3">🧾 Caja del Punto de Venta</div>
              <div class="form-group"><label class="form-label">Fondo inicial sugerido (Q)</label>
                <input class="form-input mono-sm" id="cfg-caja-fondo" type="number" min="0" step="0.01" value="${Number(caja.fondo_inicial_sugerido ?? 500).toFixed(2)}">
                <div style="font-size:10.5px;color:var(--text3);margin-top:3px">Se propone al abrir turno; cada cajero confirma el efectivo físico antes de cobrar.</div>
              </div>
              <button class="btn btn-amber" onclick="Modulos.configuracion.guardarCajaPOS()">Guardar configuración de caja</button>
              ${Modulos.configuracion._terminalesHTML()}
            </div>`; })()}
            ${Modulos.configuracion._correoMagaHTML(t)}
            <div class="card card-purple mb-4">
              <div class="card-sub mb-3">👥 Usuarios del Sistema</div>
              <button class="btn btn-cyan" style="width:100%" onclick="App.navegarA('usuarios')">
                👥 Gestionar Usuarios →
              </button>
            </div>
            <div class="card card-cyan">
              <div class="card-sub mb-3">🔗 Integraciones</div>
              <div style="display:flex;flex-direction:column;gap:0">
                ${(()=>{
                  const infile  = t.config_infile || { modo: 'nexuspro' };
                  const smtpOk  = !!(t.config_smtp && t.config_smtp.host);
                  const waOk    = !!(t.whatsapp_tel);
                  const felLabel = infile.modo === 'propio'
                    ? '<span class="badge badge-blue">Credenciales propias</span>'
                    : '<span class="badge badge-green">NexusPro gestiona</span>';
                  return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
                  <div>
                    <div style="font-size:13px;font-weight:600">🧾 FEL — ${(infile.certificador_nombre||'INFILE').split('—')[0].split('(')[0].trim()}</div>
                    <div style="font-size:11px;color:var(--text3)">${infile.modo==='propio'?(infile.nit_emisor||'NIT no configurado'):'Servicio gestionado por NexusPro'}</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px">
                    ${felLabel}
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.comunicaciones._tab='config';App.navegarA('comunicaciones')">Editar</button>
                  </div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
                  <div>
                    <div style="font-size:13px;font-weight:600">💬 WhatsApp</div>
                    <div style="font-size:11px;color:var(--text3)">${waOk ? 'wa.me/+' + t.whatsapp_tel + ' (sin API)' : 'Número no configurado'}</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px">
                    ${waOk ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-gray">Sin configurar</span>'}
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.comunicaciones._tab='config';App.navegarA('comunicaciones')">Editar</button>
                  </div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0">
                  <div>
                    <div style="font-size:13px;font-weight:600">📧 Email SMTP</div>
                    <div style="font-size:11px;color:var(--text3)">${smtpOk ? t.config_smtp.host + ' · ' + (t.config_smtp.from_email||'') : 'Usando cliente de correo (mailto:)'}</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px">
                    ${smtpOk ? '<span class="badge badge-green">SMTP propio</span>' : '<span class="badge badge-gray">mailto</span>'}
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.comunicaciones._tab='config';App.navegarA('comunicaciones')">Editar</button>
                  </div>
                </div>`;
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  async guardar() {
    const nameVal = document.getElementById('cfg-nombre')?.value.trim();
    const igssPat = document.getElementById('cfg-igss-pat')?.value.trim()||null;
    const ok = await DB.updateTenant({
      name:    nameVal,
      nit:     document.getElementById('cfg-nit')?.value.trim()||null,
      igss_patronal: igssPat,
      tel:     document.getElementById('cfg-tel')?.value.trim()||null,
      email:   document.getElementById('cfg-email')?.value.trim()||null,
      address: document.getElementById('cfg-dir')?.value.trim()||null,
      updated_at: new Date().toISOString()
    });
    if (ok) {
      UI.toast('Configuración guardada ✓');
      Auth.tenant.name = nameVal;
      Auth.tenant.igss_patronal = igssPat;
      App.renderSidebar();
    }
    else UI.toast('Error al guardar','error');
  },

  /* ── COBRO CON TARJETA (POS físico VISA/Credomatic) ──
     Config opcional por comercio. Solo datos del comercio (afiliación,
     comisión); jamás datos de tarjetas de clientes. */
  async guardarPosTarjeta() {
    const cfg = {
      habilitado:   !!document.getElementById('cfg-pt-on')?.checked,
      proveedor:    document.getElementById('cfg-pt-prov')?.value||'VISA (Visanet)',
      afiliacion:   document.getElementById('cfg-pt-afiliacion')?.value.trim()||null,
      banco:        document.getElementById('cfg-pt-banco')?.value.trim()||null,
      comision_pct: parseFloat(document.getElementById('cfg-pt-comision')?.value)||0,
      fee_mensual:  parseFloat(document.getElementById('cfg-pt-fee')?.value)||0
    };
    if (/\d{13,19}/.test((cfg.afiliacion||'').replace(/[\s\-]/g,''))) {
      UI.toast('Seguridad: eso parece un número de tarjeta, no una afiliación','error'); return;
    }
    const ok = await DB.updateTenant({ config_pos_tarjeta: cfg, updated_at: new Date().toISOString() });
    if (ok) {
      Auth.tenant.config_pos_tarjeta = cfg;
      UI.toast(cfg.habilitado ? 'Cobro con tarjeta activado ✓ Ya puedes cobrar con tarjeta en el POS' : 'Configuración guardada (cobro con tarjeta desactivado)');
    }
    else UI.toast('Error al guardar','error');
  },

  /* ══ TERMINALES DEL POS — CRUD COMPLETO ═══════════════════════════════════
     Crear, ver, editar (nombre / principal) y eliminar. La que está en uso no
     se puede borrar sin más: una terminal con caja abierta o con ventas es
     historial, así que se apaga en vez de borrarse (y el botón lo dice). */
  _terminalesHTML() {
    const filas = (this._terminales || []).map(t => `<tr>
      <td><b>${UI.esc(t.nombre)}</b>${t.es_principal ? ' <span class="badge badge-cyan">Principal</span>' : ''}</td>
      <td>${t.activo ? '<span class="badge badge-green">Activa</span>' : '<span class="badge badge-gray">Apagada</span>'}</td>
      <td style="text-align:right;white-space:nowrap">
        ${Modulos.btnAccion('editar', `Modulos.configuracion.modalTerminal('${t.id}')`)}
        <button class="btn btn-sm btn-ghost" title="${t.activo ? 'Apagar: deja de ofrecerse en el POS' : 'Volver a encender'}"
                onclick="Modulos.configuracion.alternarTerminal('${t.id}', ${t.activo ? 'false' : 'true'})">${t.activo ? '⏸️' : '▶️'}</button>
        ${Modulos.btnAccion('eliminar', `Modulos.configuracion.eliminarTerminal('${t.id}','${UI.jsAttr(t.nombre)}')`)}
      </td></tr>`).join('');

    return `<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <div style="font-size:12px;font-weight:700">🖥️ Terminales (cajas)</div>
        <button class="btn btn-sm btn-cyan" onclick="Modulos.configuracion.modalTerminal()">＋ Nueva terminal</button>
      </div>
      ${filas
        ? `<div class="table-wrap"><table class="data-table">
             <thead><tr><th>Terminal</th><th>Estado</th><th style="text-align:right">Acciones</th></tr></thead>
             <tbody>${filas}</tbody></table></div>`
        : `<div style="font-size:11.5px;color:var(--amber)">
             No hay ninguna terminal. <b>Sin al menos una, el Punto de Venta no abre</b> — creála acá.</div>`}
    </div>`;
  },

  modalTerminal(id = null) {
    const t = id ? (this._terminales || []).find(x => x.id === id) : null;
    UI.modal(`${id ? '✏️ Editar' : '＋ Nueva'} terminal`, `
      <div class="form-group"><label class="form-label">Nombre *</label>
        <input class="form-input" id="term-nombre" value="${t ? UI.esc(t.nombre) : ''}" placeholder="Caja 1, Mostrador, Bodega...">
        <div style="font-size:11px;color:var(--text3);margin-top:3px">Es el nombre que elige el cajero al entrar al POS.</div></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:12px;cursor:pointer">
        <input type="checkbox" id="term-principal" ${t?.es_principal ? 'checked' : ''}> Es la terminal principal
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:12px;cursor:pointer">
        <input type="checkbox" id="term-activo" ${t ? (t.activo ? 'checked' : '') : 'checked'}> Activa (se ofrece en el POS)
      </label>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.configuracion.guardarTerminal(${id ? `'${id}'` : 'null'})">Guardar</button>
      </div>`);
  },

  async guardarTerminal(id) {
    const nombre = document.getElementById('term-nombre')?.value.trim();
    if (!nombre) { UI.toast('Poné el nombre de la terminal', 'error'); return; }
    const { error } = await DB.guardarTerminalPOS({
      id,
      nombre,
      es_principal: !!document.getElementById('term-principal')?.checked,
      activo: !!document.getElementById('term-activo')?.checked,
    });
    if (error) { UI.toast('No se pudo guardar: ' + error.message, 'error'); return; }
    UI.toast(id ? 'Terminal actualizada ✓' : 'Terminal creada ✓');
    UI.cerrarModal();
    this.render();
  },

  async alternarTerminal(id, activo) {
    const t = (this._terminales || []).find(x => x.id === id);
    if (!t) return;
    const { error } = await DB.guardarTerminalPOS({ id, nombre: t.nombre, es_principal: t.es_principal, activo });
    if (error) { UI.toast('No se pudo cambiar: ' + error.message, 'error'); return; }
    UI.toast(activo ? 'Terminal encendida ✓' : 'Terminal apagada');
    this.render();
  },

  async eliminarTerminal(id, nombre) {
    Modulos.eliminarRegistro('pos_terminales', id, nombre, () => this.render());
  },

  /* ══ CORREO DEL RESUMEN DIARIO DEL MAGA ════════════════════════════════════
     Vivía sólo dentro de una pestaña del módulo de granos, y ahí no lo
     encontraba quien administra el negocio — que es justo quien decide a qué
     correo llega. La tarjeta es la MISMA (se reutiliza la del módulo, no se
     copia): así no hay dos pantallas que se puedan desincronizar. */
  _correoMagaHTML(t) {
    const mods = t.modulos_activos;
    const tieneGranos = Array.isArray(mods) ? mods.includes('venta_granos') : false;
    if (!tieneGranos || !Modulos.precios_maga?._configCorreoHTML) return '';
    const tarjeta = Modulos.precios_maga._configCorreoHTML(t);
    return tarjeta ? `<div class="mb-4">${tarjeta}</div>` : '';
  },

  async guardarCajaPOS() {
    const fondo = Number(document.getElementById('cfg-caja-fondo')?.value);
    if (!Number.isFinite(fondo) || fondo < 0) { UI.toast('Ingresa un fondo inicial válido','error'); return; }
    const cfg = { fondo_inicial_sugerido: fondo };
    const ok = await DB.updateTenant({ config_pos_caja:cfg, updated_at:new Date().toISOString() });
    if (!ok) { UI.toast('Error al guardar','error'); return; }
    Auth.tenant.config_pos_caja = cfg;
    UI.toast('Fondo inicial sugerido actualizado ✓');
  },

  async guardarSeguridad() {
    const minutos = Math.min(480, Math.max(1, parseInt(document.getElementById('cfg-session-timeout')?.value,10)||15));
    const ok = await DB.updateTenant({ session_timeout_minutes: minutos, updated_at: new Date().toISOString() });
    if (ok) {
      Auth.tenant.session_timeout_minutes = minutos;
      if (App.iniciarInactividad) App.iniciarInactividad(minutos);
      UI.toast('Seguridad de sesión guardada ✓');
    }
    else UI.toast('Error al guardar','error');
  },

  /* ── LOGO DEL NEGOCIO ──────────────────────────────
     Se redimensiona a máx 320px y se guarda como base64 en tenants. */
  _onLogo(input) {
    const f = input.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { UI.toast('Selecciona una imagen','error'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = async () => {
        const MAX = 320;
        const escala = Math.min(1, MAX / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * escala);
        cv.height = Math.round(img.height * escala);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        const base64 = cv.toDataURL('image/png');
        const ok = await DB.updateTenant({ logo_base64: base64, updated_at: new Date().toISOString() });
        if (!ok) { UI.toast('No se pudo guardar el logo','error'); return; }
        Auth.tenant.logo_base64 = base64;
        UI.toast('Logo actualizado ✓');
        App.renderSidebar();
        this.render();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  },

  async quitarLogo() {
    if (!confirm('¿Quitar el logo del negocio?')) return;
    const ok = await DB.updateTenant({ logo_base64: null, updated_at: new Date().toISOString() });
    if (!ok) { UI.toast('No se pudo quitar el logo','error'); return; }
    Auth.tenant.logo_base64 = null;
    UI.toast('Logo eliminado');
    App.renderSidebar();
    this.render();
  }
};
