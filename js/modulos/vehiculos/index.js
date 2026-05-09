/* Vehículos Module */
Modulos.vehiculos = {
  _data: [],
  _clientes: [],

  async render(clienteId=null) {
    const el = document.getElementById('page-content');
    UI.loading(el);
    [this._data, this._clientes] = await Promise.all([
      DB.getVehiculos(clienteId), DB.getClientes()
    ]);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🚗 Vehículos</h1>
        <p class="page-subtitle">// ${this._data.length} registrados</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.vehiculos.modalForm()">＋ Nuevo Vehículo</button>
        </div>
      </div>
      <div class="page-body">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Placa</th><th>Vehículo</th><th>Cliente</th><th>Km</th><th>Motor</th><th>Acciones</th>
            </tr></thead>
            <tbody>
              ${this._data.map(v=>`<tr>
                <td class="mono-sm"><b>${v.placa}</b></td>
                <td>${v.marca} ${v.modelo}<br><small style="color:var(--text3)">${v.anio||''} · ${v.color||''}</small></td>
                <td>${v.clientes?.nombre||'—'}</td>
                <td class="mono-sm">${(v.kilometraje||0).toLocaleString()} km</td>
                <td>${v.motor||'—'}</td>
                <td onclick="event.stopPropagation()">
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-sm btn-cyan" onclick="Modulos.vehiculos.modalForm('${v.id}')">Editar</button>
                    <button class="btn btn-sm btn-amber" onclick="Modulos.ordenes?.modalForm(null,'${v.id}')">+ OT</button>
                    <button class="btn btn-sm btn-danger" onclick="Modulos.vehiculos.eliminar('${v.id}','${v.placa}')">✕</button>
                  </div>
                </td>
              </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">Sin vehículos registrados</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  async modalForm(id=null) {
    const v = id ? this._data.find(x=>x.id===id) : {};
    const esEdicion = !!id;
    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Vehículo`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del vehículo.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Placa *</label>
          <input class="form-input" id="veh-placa" value="${v.placa||''}" placeholder="P-123ABC" style="text-transform:uppercase"></div>
        <div class="form-group"><label class="form-label">Cliente *</label>
          <select class="form-select" id="veh-cliente">
            <option value="">Seleccionar cliente...</option>
            ${this._clientes.map(c=>`<option value="${c.id}" ${v.cliente_id===c.id?'selected':''}>${c.nombre}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Marca *</label>
          <input class="form-input" id="veh-marca" value="${v.marca||''}" placeholder="Toyota"></div>
        <div class="form-group"><label class="form-label">Modelo *</label>
          <input class="form-input" id="veh-modelo" value="${v.modelo||''}" placeholder="Corolla"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Año</label>
          <input class="form-input" id="veh-anio" type="number" value="${v.anio||''}" placeholder="2020"></div>
        <div class="form-group"><label class="form-label">Color</label>
          <input class="form-input" id="veh-color" value="${v.color||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Combustible</label>
          <select class="form-select" id="veh-comb">
            ${['Gasolina','Diesel','Híbrido','Eléctrico','GLP'].map(c=>`<option ${v.combustible===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Kilometraje</label>
          <input class="form-input" id="veh-km" type="number" value="${v.kilometraje||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Motor</label>
          <input class="form-input" id="veh-motor" value="${v.motor||''}" placeholder="1.8L"></div>
        <div class="form-group"><label class="form-label">VIN / Chasis</label>
          <input class="form-input" id="veh-vin" value="${v.vin||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="veh-notas" rows="2">${v.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.vehiculos.guardar('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear Vehículo'}
        </button>
      </div>`,'640px');
  },

  async guardar(id='') {
    const placa   = document.getElementById('veh-placa')?.value.trim().toUpperCase();
    const cliente = document.getElementById('veh-cliente')?.value;
    const marca   = document.getElementById('veh-marca')?.value.trim();
    const modelo  = document.getElementById('veh-modelo')?.value.trim();
    if (!placa||!cliente||!marca||!modelo) { UI.toast('Placa, cliente, marca y modelo son obligatorios','error'); return; }

    const fields = {
      placa, cliente_id:cliente, marca, modelo,
      anio:        parseInt(document.getElementById('veh-anio')?.value)||null,
      color:       document.getElementById('veh-color')?.value||null,
      combustible: document.getElementById('veh-comb')?.value||null,
      kilometraje: parseInt(document.getElementById('veh-km')?.value)||0,
      motor:       document.getElementById('veh-motor')?.value||null,
      vin:         document.getElementById('veh-vin')?.value||null,
      notas:       document.getElementById('veh-notas')?.value||null
    };
    if (id) fields.id = id;

    const { error } = await DB.upsertVehiculo(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal();
    UI.toast(id?'Vehículo actualizado ✓':'Vehículo registrado ✓');
    this.render();
  },

  async eliminar(id, placa) {
    const ok = await UI.confirmar(`¿Eliminar vehículo <b>${placa}</b>?`, 'Eliminar');
    if (!ok) return;
    const r = await DB.deleteVehiculo(id);
    if (r) { UI.toast('Vehículo eliminado'); this.render(); }
    else UI.toast('Error al eliminar','error');
  }
};
