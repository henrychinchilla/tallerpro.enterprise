/* Órdenes de Trabajo Module */
Modulos.ordenes = {
  _data: [], _vehiculos: [], _clientes: [], _mecanicos: [],
  _vista: 'lista', _fotos: [],

  async render(filtros={}) {
    const el = document.getElementById('page-content');
    UI.loading(el);
    [this._data, this._vehiculos, this._clientes, this._mecanicos] = await Promise.all([
      DB.getOrdenes(filtros), DB.getVehiculos(), DB.getClientes(), DB.getEmpleados()
    ]);

    const mecs = this._mecanicos.filter(e=>e.rol==='mecanico'||e.rol==='gerente_tal');

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">📋 Órdenes de Trabajo</h1>
        <p class="page-subtitle">// ${this._data.length} órdenes</p></div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.ordenes._vista='kanban';Modulos.ordenes.render()">⬛ Kanban</button>
          <button class="btn btn-ghost" onclick="Modulos.ordenes._vista='lista';Modulos.ordenes.render()">☰ Lista</button>
          <button class="btn btn-amber" onclick="Modulos.ordenes.modalForm()">＋ Nueva OT</button>
        </div>
      </div>
      <div class="page-body">
        ${this._vista==='kanban' ? this._renderKanban() : this._renderLista()}
      </div>`;
  },

  _renderLista() {
    return `<div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>OT</th><th>Vehículo</th><th>Cliente</th><th>Estado</th><th>Mecánico</th><th>Fecha</th><th>Total</th><th>Acciones</th></tr></thead>
        <tbody>
          ${this._data.map(o=>`<tr onclick="Modulos.ordenes.ver('${o.id}')" style="cursor:pointer">
            <td class="mono-sm"><b>${o.num}</b></td>
            <td>${o.vehiculos?.placa}<br><small>${o.vehiculos?.marca} ${o.vehiculos?.modelo}</small></td>
            <td>${o.clientes?.nombre||'—'}</td>
            <td>
              <select class="badge" style="border:none;background:transparent;cursor:pointer;font-size:11px"
                      onclick="event.stopPropagation()"
                      onchange="Modulos.ordenes.cambiarEstado('${o.id}',this.value)">
                ${Object.entries(ESTADOS_OT).map(([k,v])=>
                  `<option value="${k}" ${o.estado===k?'selected':''}>${v.label}</option>`
                ).join('')}
              </select>
            </td>
            <td>${o.empleados?.nombre||'—'}</td>
            <td>${UI.fecha(o.fecha_ingreso)}</td>
            <td class="mono-sm">${UI.q(o.total)}</td>
            <td onclick="event.stopPropagation()">
              <button class="btn btn-sm btn-cyan" onclick="Modulos.ordenes.modalForm('${o.id}')">Editar</button>
            </td>
          </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">Sin órdenes registradas</td></tr>'}
        </tbody>
      </table>
    </div>`;
  },

  _renderKanban() {
    const cols = Object.entries(ESTADOS_OT);
    return `<div class="kanban-board" style="display:flex;gap:16px;overflow-x:auto;padding-bottom:16px">
      ${cols.map(([est,info])=>{
        const ots = this._data.filter(o=>o.estado===est);
        return `<div class="kanban-col" style="min-width:220px;flex-shrink:0">
          <div style="font-weight:700;font-size:12px;color:var(--${info.color});margin-bottom:10px;letter-spacing:.05em">
            ${info.label} (${ots.length})
          </div>
          ${ots.map(o=>`<div class="card" style="margin-bottom:10px;cursor:pointer;border-left:3px solid var(--${info.color})"
              onclick="Modulos.ordenes.ver('${o.id}')">
            <div class="mono-sm" style="color:var(--amber)">${o.num}</div>
            <div style="font-size:12px;margin:4px 0">${o.vehiculos?.placa} · ${o.vehiculos?.marca}</div>
            <div style="font-size:11px;color:var(--text3)">${o.clientes?.nombre||''}</div>
            <div style="font-size:11px;color:var(--amber);margin-top:4px">${UI.q(o.total)}</div>
          </div>`).join('')}
        </div>`;
      }).join('')}
    </div>`;
  },

  async ver(id) {
    const o = await DB.getOrden(id);
    if (!o) return;
    const est = ESTADOS_OT[o.estado] || { label:o.estado, color:'gray', pct:50 };
    let fotos = [];
    try { fotos = typeof o.fotos_recepcion==='string' ? JSON.parse(o.fotos_recepcion) : (o.fotos_recepcion||[]); } catch(e){}

    UI.modal(`📋 ${o.num}`, `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <div style="font-size:18px;font-weight:700">${o.vehiculos?.placa} · ${o.vehiculos?.marca} ${o.vehiculos?.modelo}</div>
          <div style="font-size:13px;color:var(--text3)">${o.clientes?.nombre||''} · ${o.empleados?.nombre||'Sin mecánico'}</div>
        </div>
        <span style="font-weight:700;color:var(--${est.color})">${est.label}</span>
      </div>
      <div style="background:var(--surface2);border-radius:8px;height:8px;margin-bottom:16px;overflow:hidden">
        <div style="height:100%;width:${est.pct}%;background:var(--${est.color});border-radius:8px"></div>
      </div>
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px">${o.descripcion||''}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:16px">
        <div><span style="color:var(--text3)">Ingreso:</span> ${UI.fecha(o.fecha_ingreso)}</div>
        <div><span style="color:var(--text3)">Entrega est.:</span> ${UI.fecha(o.fecha_estimada)}</div>
        <div><span style="color:var(--text3)">Total:</span> <b style="color:var(--amber)">${UI.q(o.total)}</b></div>
        <div><span style="color:var(--text3)">Prioridad:</span> ${o.prioridad||'—'}</div>
      </div>
      ${fotos.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        ${fotos.map(f=>`<img src="${f}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">`).join('')}
      </div>`:''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        <button class="btn btn-cyan" onclick="Modulos.ordenes.modalForm('${o.id}')">✏️ Editar</button>
      </div>`,'600px');
  },

  async modalForm(id=null, vehiculoId=null) {
    const o = id ? this._data.find(x=>x.id===id)||await DB.getOrden(id) : {};
    const esEdicion = !!id;
    this._fotos = [];

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nueva'} Orden de Trabajo`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual de la orden.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Vehículo *</label>
          <select class="form-select" id="ot-veh">
            <option value="">Seleccionar...</option>
            ${this._vehiculos.map(v=>`<option value="${v.id}" data-cliente="${v.cliente_id}" ${(o.vehiculo_id===v.id||vehiculoId===v.id)?'selected':''}>${v.placa} · ${v.marca} ${v.modelo}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Mecánico</label>
          <select class="form-select" id="ot-mec">
            <option value="">Sin asignar</option>
            ${this._mecanicos.filter(e=>['mecanico','gerente_tal'].includes(e.rol)).map(e=>`<option value="${e.id}" ${o.mecanico_id===e.id?'selected':''}>${e.nombre}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Descripción del Trabajo *</label>
        <textarea class="form-input" id="ot-desc" rows="3" placeholder="Describir el trabajo...">${o.descripcion||''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Estado</label>
          <select class="form-select" id="ot-estado">
            ${Object.entries(ESTADOS_OT).map(([k,v])=>`<option value="${k}" ${(o.estado||'recibido')===k?'selected':''}>${v.label}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Prioridad</label>
          <select class="form-select" id="ot-prio">
            ${['baja','media','alta','urgente'].map(p=>`<option value="${p}" ${(o.prioridad||'media')===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha Estimada Entrega</label>
          <input class="form-input" id="ot-fecha" type="date" value="${o.fecha_estimada||''}"></div>
        <div class="form-group"><label class="form-label">Total Estimado (Q)</label>
          <input class="form-input" id="ot-total" type="number" value="${o.total||''}" min="0"></div>
      </div>
      ${!esEdicion?`
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
        <label class="form-label">📸 Fotos de Recepción</label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <label style="width:70px;height:70px;border:2px dashed var(--border);border-radius:8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:20px;color:var(--text3)">
            📷<span style="font-size:9px">Agregar</span>
            <input type="file" accept="image/*" multiple class="hidden" onchange="Modulos.ordenes._agregarFotos(this)">
          </label>
          <div id="ot-fotos-preview" style="display:flex;gap:6px;flex-wrap:wrap"></div>
        </div>
      </div>`:''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.ordenes.guardar('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear OT'}
        </button>
      </div>`,'640px');
  },

  _agregarFotos(input) {
    const preview = document.getElementById('ot-fotos-preview');
    Array.from(input.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        this._fotos.push(e.target.result);
        if (preview) {
          const d = document.createElement('div');
          d.style.cssText = 'position:relative;width:70px;height:70px';
          d.innerHTML = `<img src="${e.target.result}" style="width:70px;height:70px;object-fit:cover;border-radius:6px">`;
          preview.appendChild(d);
        }
      };
      reader.readAsDataURL(file);
    });
  },

  async guardar(id='') {
    const vehSel = document.getElementById('ot-veh');
    const vehId  = vehSel?.value;
    const desc   = document.getElementById('ot-desc')?.value.trim();
    if (!vehId)  { UI.toast('Selecciona un vehículo','error'); return; }
    if (!desc)   { UI.toast('La descripción es obligatoria','error'); return; }

    const cliId = vehSel.options[vehSel.selectedIndex]?.dataset.cliente || null;
    const fields = {
      vehiculo_id:    vehId,
      cliente_id:     cliId,
      mecanico_id:    document.getElementById('ot-mec')?.value||null,
      descripcion:    desc,
      estado:         document.getElementById('ot-estado')?.value||'recibido',
      prioridad:      document.getElementById('ot-prio')?.value||'media',
      fecha_estimada: document.getElementById('ot-fecha')?.value||null,
      total:          parseFloat(document.getElementById('ot-total')?.value)||0,
      fotos_recepcion:this._fotos.length?JSON.stringify(this._fotos):null
    };
    if (id) fields.id = id;

    const { error } = await DB.upsertOrden(fields);
    this._fotos = [];
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal();
    UI.toast(id?'OT actualizada ✓':'OT creada ✓');
    this.render();
  },

  async cambiarEstado(id, estado) {
    await DB.updateEstadoOT(id, estado);
    UI.toast('Estado actualizado ✓');
  }
};
