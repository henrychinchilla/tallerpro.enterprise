/* TallerPro v3.0 — bodegas/index.js */
Modulos.bodegas = {
  _data: [],

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._data = await DB.getBodegas();

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🏭 Bodegas</h1>
        <p class="page-subtitle">// ${this._data.length} bodegas / sucursales</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.bodegas.modalForm()">＋ Nueva Bodega</button>
        </div>
      </div>
      <div class="page-body">
        <div class="grid-3">
          ${this._data.map(b=>`
            <div class="card">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                <div style="font-size:28px">🏭</div>
                <span class="badge badge-${b.activa?'green':'gray'}">${b.activa?'Activa':'Inactiva'}</span>
              </div>
              <div style="font-weight:800;font-size:15px;margin-bottom:4px">${b.nombre}</div>
              <div style="font-size:12px;color:var(--text2);margin-bottom:4px">
                ${b.direccion?`📍 ${b.direccion}<br>`:''}
                ${b.responsable?`👤 ${b.responsable}`:''}
              </div>
              <div style="display:flex;gap:8px;margin-top:12px">
                <button class="btn btn-sm btn-cyan" style="flex:1" onclick="Modulos.bodegas.modalForm('${b.id}')">Editar</button>
                <button class="btn btn-sm btn-ghost" style="flex:1" onclick="App.navegarA('inventario')">Ver Inventario</button>
              </div>
            </div>`).join('')||'<div class="text-muted" style="padding:24px">Sin bodegas registradas. Crea la primera para gestionar tu inventario por ubicación.</div>'}
        </div>
      </div>`;
  },

  modalForm(id=null) {
    const b = id ? this._data.find(x=>x.id===id) : {};
    const esEdicion = !!id;
    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nueva'} Bodega`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual de la bodega.</div></div>':''}
      <div class="form-group"><label class="form-label">Nombre / Sucursal *</label>
        <input class="form-input" id="bod-nombre" value="${b.nombre||''}" placeholder="Bodega Principal / Sucursal Norte"></div>
      <div class="form-group"><label class="form-label">Dirección</label>
        <input class="form-input" id="bod-dir" value="${b.direccion||''}"></div>
      <div class="form-group"><label class="form-label">Responsable</label>
        <input class="form-input" id="bod-resp" value="${b.responsable||''}"></div>
      ${esEdicion?`<div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="bod-activa" ${b.activa?'checked':''}>
          <span class="form-label" style="margin:0">Bodega activa</span>
        </label>
      </div>`:''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.bodegas.guardar('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear Bodega'}
        </button>
      </div>`);
  },

  async guardar(id='') {
    const nombre = document.getElementById('bod-nombre')?.value.trim();
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }
    const fields = {
      nombre,
      direccion:   document.getElementById('bod-dir')?.value||null,
      responsable: document.getElementById('bod-resp')?.value||null,
      activa:      id ? (document.getElementById('bod-activa')?.checked ?? true) : true
    };
    if (id) fields.id = id;
    const {error} = await DB.upsertBodega(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Bodega actualizada ✓':'Bodega creada ✓');
    this.render();
  }
};
