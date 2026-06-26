/* Configuración Module */
Modulos.configuracion = {
  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const t = Auth.tenant || {};

    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">⚙️ Configuración</h1>
        <p class="page-subtitle">// ${t.name||'TallerPro'}</p>
      </div>
      <div class="page-body">
        <div class="grid-2">
          <div class="card card-amber">
            <div class="card-sub mb-4">🏪 Información del Taller</div>
            <div class="form-group"><label class="form-label">Logo del taller</label>
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
              <input class="form-input" id="cfg-email" value="${t.email||''}"></div>
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
                  const infile  = t.config_infile || { modo: 'tallerpro' };
                  const smtpOk  = !!(t.config_smtp && t.config_smtp.host);
                  const waOk    = !!(t.whatsapp_tel);
                  const felLabel = infile.modo === 'propio'
                    ? '<span class="badge badge-blue">Credenciales propias</span>'
                    : '<span class="badge badge-green">TallerPro gestiona</span>';
                  return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
                  <div>
                    <div style="font-size:13px;font-weight:600">🧾 INFILE FEL</div>
                    <div style="font-size:11px;color:var(--text3)">${infile.modo==='propio'?(infile.nit_emisor||'NIT no configurado'):'Servicio gestionado por TallerPro'}</div>
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

  /* ── LOGO DEL TALLER ──────────────────────────────
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
    if (!confirm('¿Quitar el logo del taller?')) return;
    const ok = await DB.updateTenant({ logo_base64: null, updated_at: new Date().toISOString() });
    if (!ok) { UI.toast('No se pudo quitar el logo','error'); return; }
    Auth.tenant.logo_base64 = null;
    UI.toast('Logo eliminado');
    App.renderSidebar();
    this.render();
  }
};
