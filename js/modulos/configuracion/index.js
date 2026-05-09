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
            <div class="form-group"><label class="form-label">Nombre *</label>
              <input class="form-input" id="cfg-nombre" value="${t.name||''}"></div>
            <div class="form-group"><label class="form-label">NIT</label>
              <input class="form-input" id="cfg-nit" value="${t.nit||''}"></div>
            <div class="form-group"><label class="form-label">Teléfono</label>
              <input class="form-input" id="cfg-tel" value="${t.tel||''}"></div>
            <div class="form-group"><label class="form-label">Email</label>
              <input class="form-input" id="cfg-email" value="${t.email||''}"></div>
            <div class="form-group"><label class="form-label">Dirección</label>
              <input class="form-input" id="cfg-dir" value="${t.address||''}"></div>
            <button class="btn btn-amber" onclick="Modulos.configuracion.guardar()">Guardar Cambios</button>
          </div>
          <div>
            <div class="card card-purple mb-4">
              <div class="card-sub mb-3">👥 Usuarios del Sistema</div>
              <button class="btn btn-cyan" style="width:100%" onclick="App.navegarA('usuarios')">
                👥 Gestionar Usuarios →
              </button>
            </div>
            <div class="card card-cyan">
              <div class="card-sub mb-3">🔗 Integraciones</div>
              <div style="display:flex;flex-direction:column;gap:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                  <span style="font-size:13px">🧾 INFILE FEL</span>
                  <span class="badge badge-green">Activo</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                  <span style="font-size:13px">💬 WhatsApp</span>
                  <button class="btn btn-sm btn-ghost" onclick="App.navegarA('comunicaciones')">Configurar</button>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">
                  <span style="font-size:13px">📧 Email SMTP</span>
                  <button class="btn btn-sm btn-ghost" onclick="App.navegarA('comunicaciones')">Configurar</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  async guardar() {
    const ok = await DB.updateTenant({
      name:    document.getElementById('cfg-nombre')?.value.trim(),
      nit:     document.getElementById('cfg-nit')?.value.trim()||null,
      tel:     document.getElementById('cfg-tel')?.value.trim()||null,
      email:   document.getElementById('cfg-email')?.value.trim()||null,
      address: document.getElementById('cfg-dir')?.value.trim()||null,
      updated_at: new Date().toISOString()
    });
    if (ok) { UI.toast('Configuración guardada ✓'); Auth.tenant.name = document.getElementById('cfg-nombre')?.value.trim(); App.renderSidebar(); }
    else UI.toast('Error al guardar','error');
  }
};
