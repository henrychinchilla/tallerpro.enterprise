/* Vehículos Module */
Modulos.vehiculos = {
  _data: [],
  _clientes: [],

  /* Catálogos sugeridos (editables: el usuario puede escribir uno nuevo) */
  _tipos: ['Liviano', 'SUV', 'Pesado', 'Motocicleta'],
  _marcasPorTipo: {
    'Liviano': ['Toyota','Honda','Nissan','Hyundai','Kia','Mazda','Chevrolet','Volkswagen','Mitsubishi','Suzuki','Ford','Renault','Peugeot','Geely','BYD','Changan'],
    'SUV': ['Toyota','Honda','Hyundai','Kia','Mazda','Nissan','Mitsubishi','Suzuki','Chevrolet','Ford','Jeep','Subaru','Land Rover','BMW','Mercedes-Benz','Volkswagen','BYD'],
    'Pesado': ['Hino','Isuzu','Freightliner','International','Volvo','Mercedes-Benz','Scania','Mack','Kenworth','Foton','JAC','Dongfeng','UD Trucks','Iveco'],
    'Motocicleta': ['Honda','Yamaha','Suzuki','Kawasaki','BMW','Ducati','Aprilia','KTM','Triumph','Harley-Davidson','Husqvarna','Royal Enfield','Benelli','CFMoto','Vespa','Bajaj','TVS','Italika','Hero','Genesis','Freedom','Serpento','Daytona','Vento','Zontes','Voge']
  },
  _colores: ['Blanco','Negro','Gris','Plateado','Rojo','Azul','Azul marino','Celeste','Verde','Beige','Café','Dorado','Amarillo','Naranja','Vino','Turquesa',
             'Blanco/Negro','Negro/Rojo','Negro/Gris','Azul/Blanco','Rojo/Negro','Naranja/Negro'],

  _opcionesMarca(tipo) {
    return (this._marcasPorTipo[tipo] || this._marcasPorTipo['Liviano'])
      .map(m => `<option value="${m}">`).join('');
  },

  /* Al cambiar el tipo, repuebla las marcas sugeridas sin borrar lo escrito */
  _onTipoChange() {
    const tipo = document.getElementById('veh-tipo')?.value;
    const dl = document.getElementById('marcas-list');
    if (dl) dl.innerHTML = this._opcionesMarca(tipo);
  },

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
                <td>${v.marca} ${v.modelo}<br><small style="color:var(--text3)">${[v.tipo,v.anio,v.color].filter(Boolean).join(' · ')}</small></td>
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
        <div class="form-group"><label class="form-label">Tipo *</label>
          <select class="form-select" id="veh-tipo" onchange="Modulos.vehiculos._onTipoChange()">
            ${this._tipos.map(t=>`<option ${(v.tipo||'Liviano')===t?'selected':''}>${t}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Marca *</label>
          <input class="form-input" id="veh-marca" list="marcas-list" autocomplete="off" value="${v.marca||''}" placeholder="Escribe o elige...">
          <datalist id="marcas-list">${this._opcionesMarca(v.tipo||'Liviano')}</datalist>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Si no está en la lista, escríbela.</div></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Modelo *</label>
          <input class="form-input" id="veh-modelo" value="${v.modelo||''}" placeholder="Corolla"></div>
        <div class="form-group"><label class="form-label">Año</label>
          <input class="form-input" id="veh-anio" type="number" value="${v.anio||''}" placeholder="2020"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Color</label>
          <input class="form-input" id="veh-color" list="colores-list" autocomplete="off" value="${v.color||''}" placeholder="Escribe o elige...">
          <datalist id="colores-list">${this._colores.map(c=>`<option value="${c}">`).join('')}</datalist>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Escribe uno nuevo o un dual (ej. Negro/Rojo).</div></div>
        <div class="form-group"><label class="form-label">Combustible</label>
          <select class="form-select" id="veh-comb">
            ${['Gasolina','Diesel','Híbrido','Eléctrico','GLP'].map(c=>`<option ${v.combustible===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Kilometraje</label>
          <input class="form-input" id="veh-km" type="number" value="${v.kilometraje||''}"></div>
        <div class="form-group"><label class="form-label">Motor</label>
          <input class="form-input" id="veh-motor" value="${v.motor||''}" placeholder="1.8L"></div>
      </div>
      <div class="form-group"><label class="form-label">VIN / Chasis</label>
        <input class="form-input" id="veh-vin" value="${v.vin||''}"></div>
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
      tipo:        document.getElementById('veh-tipo')?.value||null,
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
