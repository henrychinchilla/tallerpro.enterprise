/* TallerPro v3.0 — proveedores/index.js */
Modulos.proveedores = {
  _data: [],
  _busca: '',
  _view: localStorage.getItem('tp_prov_view') || 'cards',   // 'cards' | 'lista'

  _setView(v) {
    this._view = v;
    localStorage.setItem('tp_prov_view', v);
    this.render(this._busca);
  },

  async render(busca='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._busca = busca;
    this._data = await DB.getProveedores();
    const filtrados = busca ? this._data.filter(p=>p.nombre.toLowerCase().includes(busca.toLowerCase())||p.nit?.includes(busca)) : this._data;

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🏪 Proveedores</h1>
        <p class="page-subtitle">// ${filtrados.length} registrados</p></div>
        <div class="page-actions">
          <div class="view-toggle">
            <button class="view-btn ${this._view==='cards'?'active':''}" title="Tarjetas" onclick="Modulos.proveedores._setView('cards')">▦</button>
            <button class="view-btn ${this._view==='lista'?'active':''}" title="Lista" onclick="Modulos.proveedores._setView('lista')">☰</button>
          </div>
          <button class="btn btn-amber" onclick="Modulos.proveedores.modalForm()">＋ Nuevo Proveedor</button>
        </div>
      </div>
      <div class="page-body">
        <input class="form-input" style="margin-bottom:16px" placeholder="🔍 Buscar nombre o NIT..."
               value="${busca}" oninput="Modulos.proveedores.render(this.value)">
        ${this._view==='lista' ? this._renderLista(filtrados) : this._renderCards(filtrados)}
      </div>`;
  },

  _renderCards(filtrados) {
    return `<div class="grid-3" style="margin-bottom:16px">
      ${filtrados.map(p=>`
        <div class="card" style="cursor:pointer" onclick="Modulos.proveedores.modalForm('${p.id}')">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
            <div>
              <div style="font-weight:800;font-size:14px">${p.nombre}</div>
              <span class="badge badge-gray" style="margin-top:4px">${p.categoria||'General'}</span>
            </div>
            <span class="badge badge-${p.activo?'green':'red'}">${p.activo?'Activo':'Inactivo'}</span>
          </div>
          <div style="font-size:12px;color:var(--text2);display:flex;flex-direction:column;gap:4px">
            ${p.nit?`<span>NIT: ${p.nit}</span>`:''}
            ${p.telefono?`<span>📞 ${p.telefono}</span>`:''}
            ${p.email?`<span>✉️ ${p.email}</span>`:''}
            ${p.contacto?`<span>👤 ${p.contacto}</span>`:''}
          </div>
          <div style="display:flex;gap:4px;margin-top:10px" onclick="event.stopPropagation()">
            ${Modulos.btnAccion('editar', `Modulos.proveedores.modalForm('${p.id}')`)}
            ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('proveedores','${p.id}','${(p.nombre||'').replace(/'/g,"\\'")}',()=>Modulos.proveedores.render(Modulos.proveedores._busca))`)}
          </div>
        </div>`).join('')||'<div style="color:var(--text3);padding:24px">Sin proveedores registrados</div>'}
    </div>`;
  },

  _renderLista(filtrados) {
    return `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Proveedor</th><th>Categoría</th><th>NIT</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>
        ${filtrados.map(p=>`<tr>
          <td style="font-weight:700">${p.nombre}</td>
          <td><span class="badge badge-gray">${p.categoria||'General'}</span></td>
          <td class="mono-sm">${p.nit||'—'}</td>
          <td>${p.contacto||'—'}</td>
          <td class="mono-sm">${p.telefono||'—'}</td>
          <td style="font-size:12px">${p.email||'—'}</td>
          <td><span class="badge badge-${p.activo?'green':'red'}">${p.activo?'Activo':'Inactivo'}</span></td>
          <td><div style="display:flex;gap:4px">
            ${Modulos.btnAccion('editar', `Modulos.proveedores.modalForm('${p.id}')`)}
            ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('proveedores','${p.id}','${(p.nombre||'').replace(/'/g,"\\'")}',()=>Modulos.proveedores.render(Modulos.proveedores._busca))`)}
          </div></td>
        </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin proveedores registrados</td></tr>'}
      </tbody>
    </table></div>`;
  },

  async modalForm(id=null) {
    const p = id ? this._data.find(x=>x.id===id) : {};
    const esEdicion = !!id;
    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Proveedor`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del proveedor.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre / Razón Social *</label>
          <input class="form-input" id="prov-nombre" value="${p.nombre||''}" placeholder="Distribuidora García"></div>
        <div class="form-group"><label class="form-label">NIT</label>
          <div style="display:flex;gap:6px">
            <input class="form-input" id="prov-nit" value="${p.nit||''}" placeholder="1234567-8" style="flex:1">
            <button type="button" class="btn btn-ghost" onclick="Modulos.verificarNIT('prov-nit','prov-nit-status','prov-nombre')" title="Verificar NIT con la SAT">🔎</button>
          </div>
          <div id="prov-nit-status" style="margin-top:4px;min-height:14px"></div></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Categoría</label>
          <select class="form-select" id="prov-cat">
            ${['Repuestos','Aceites y Lubricantes','Herramientas','Equipo','Servicios','Otro'].map(c=>`<option ${p.categoria===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Persona de Contacto</label>
          <input class="form-input" id="prov-contacto" value="${p.contacto||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Teléfono</label>
          <input class="form-input" id="prov-tel" value="${p.telefono||''}" placeholder="5501-1234"></div>
        <div class="form-group"><label class="form-label">Email</label>
          <input class="form-input" id="prov-email" type="email" value="${p.email||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Dirección</label>
        <input class="form-input" id="prov-dir" value="${p.direccion||''}"></div>
      <div class="form-group"><label class="form-label">Notas / Condiciones de pago</label>
        <textarea class="form-input" id="prov-notas" rows="2">${p.notas||''}</textarea></div>
      ${esEdicion?`<div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="prov-activo" ${p.activo?'checked':''}>
          <span class="form-label" style="margin:0">Proveedor activo</span>
        </label>
      </div>`:''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.proveedores.guardar('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear Proveedor'}
        </button>
      </div>`,'580px');
  },

  async guardar(id='') {
    const nombre = document.getElementById('prov-nombre')?.value.trim();
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }
    /* Evitar duplicados por nombre (también hay índice único en BD) */
    if (!id) {
      const dup = this._data.find(p => (p.nombre||'').trim().toLowerCase() === nombre.toLowerCase());
      if (dup) { UI.toast('Ya existe un proveedor con ese nombre','error'); return; }
    }
    const fields = {
      nombre,
      nit:       document.getElementById('prov-nit')?.value.trim()||null,
      categoria: document.getElementById('prov-cat')?.value,
      contacto:  document.getElementById('prov-contacto')?.value||null,
      telefono:  document.getElementById('prov-tel')?.value||null,
      email:     document.getElementById('prov-email')?.value||null,
      direccion: document.getElementById('prov-dir')?.value||null,
      notas:     document.getElementById('prov-notas')?.value||null,
      activo:    id ? (document.getElementById('prov-activo')?.checked ?? true) : true
    };
    if (id) fields.id = id;
    if (fields.nit && !NIT.validarLocal(fields.nit).valido) {
      UI.toast('Aviso: el dígito verificador del NIT no parece válido','warn');
    }
    const {error} = await DB.upsertProveedor(fields);
    if (error) {
      const msg = error.code==='23505' ? 'Ya existe un proveedor con ese nombre' : ('Error: '+error.message);
      UI.toast(msg,'error'); return;
    }
    UI.cerrarModal(); UI.toast(id?'Proveedor actualizado ✓':'Proveedor creado ✓');
    this.render();
  }
};
