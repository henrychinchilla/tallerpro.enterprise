/* TallerPro v3.0 — especializados/peleteria.js
   Módulo vertical: Peletería. Pedidos de productos de cuero a la medida
   o reparación (cinturones, bolsos, calzado, talabartería...). */
Modulos.peleteria = {
  _data: [], _clientes: [], _filtroEstado: '',

  _TIPOS: { cinturon:'Cinturón', bolso:'Bolso', cartera:'Cartera', billetera:'Billetera', calzado:'Calzado', talabarteria:'Talabartería', mochila:'Mochila', funda:'Funda', otro:'Otro' },
  _ESTADOS: { pedido:'Pedido', en_proceso:'En Proceso', control_calidad:'Control de Calidad', terminado:'Terminado', entregado:'Entregado', cancelado:'Cancelado' },
  _colorEstado(e) { return { pedido:'gray', en_proceso:'amber', control_calidad:'cyan', terminado:'green', entregado:'green', cancelado:'red' }[e]||'gray'; },

  async render(filtroEstado='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._filtroEstado = filtroEstado;
    [this._data, this._clientes] = await Promise.all([
      DB.getPeleteriaPedidos(filtroEstado ? { estado: filtroEstado } : {}),
      DB.getClientes()
    ]);

    const activos = this._data.filter(p=>!['entregado','cancelado'].includes(p.estado));
    const enProceso = this._data.filter(p=>p.estado==='en_proceso').length;
    const saldoPorCobrar = this._data.reduce((s,p)=>s+(Number(p.saldo)||0),0);
    const hoy = new Date().toISOString().slice(0,10);
    const atrasados = this._data.filter(p=>p.fecha_entrega && p.fecha_entrega<hoy && !['entregado','cancelado'].includes(p.estado)).length;

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">👜 Peletería</h1>
        <p class="page-subtitle">// ${this._data.length} pedidos registrados</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.peleteria.modalForm()">＋ Nuevo Pedido</button>
        </div>
      </div>
      <div class="page-body">
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'👜', clase:'cyan', label:'Pedidos activos', value: activos.length })}
          ${UI.kpiCard({ icon:'🧵', clase:'amber', label:'En proceso', value: enProceso })}
          ${UI.kpiCard({ icon:'💰', clase: saldoPorCobrar?'red':'gray', label:'Saldo por cobrar', value: saldoPorCobrar, money:true })}
          ${UI.kpiCard({ icon:'⚠️', clase: atrasados?'red':'gray', label:'Atrasados', value: atrasados })}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn btn-sm ${!filtroEstado?'btn-cyan':'btn-ghost'}" onclick="Modulos.peleteria.render('')">Todos</button>
          ${Object.entries(this._ESTADOS).map(([k,l])=>`<button class="btn btn-sm ${filtroEstado===k?'btn-cyan':'btn-ghost'}" onclick="Modulos.peleteria.render('${k}')">${l}</button>`).join('')}
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>No.</th><th>Cliente</th><th>Producto</th><th>Material/Color</th><th>Entrega</th><th>Precio</th><th>Saldo</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${this._data.map(p=>`<tr>
              <td class="mono-sm">${p.num||'—'}</td>
              <td>${p.clientes?.nombre||'—'}</td>
              <td><span class="badge badge-gray">${this._TIPOS[p.tipo_producto]||p.tipo_producto}</span> ${p.cantidad>1?`×${p.cantidad}`:''}</td>
              <td style="font-size:12px">${[p.material,p.color].filter(Boolean).join(' · ')||'—'}</td>
              <td class="mono-sm">${p.fecha_entrega?UI.fecha(p.fecha_entrega):'—'}</td>
              <td class="mono-sm">${UI.q(p.precio_venta)}</td>
              <td class="mono-sm ${p.saldo>0?'text-red':'text-green'}">${UI.q(p.saldo)}</td>
              <td><span class="badge badge-${this._colorEstado(p.estado)}">${this._ESTADOS[p.estado]||p.estado}</span></td>
              <td><div style="display:flex;gap:4px">
                ${Modulos.btnAccion('editar', `Modulos.peleteria.modalForm('${p.id}')`)}
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('peleteria_pedidos','${p.id}','el pedido ${p.num||''}',()=>Modulos.peleteria.render(Modulos.peleteria._filtroEstado))`)}
              </div></td>
            </tr>`).join('')||'<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text3)">Sin pedidos. Registra el primero con "＋ Nuevo Pedido".</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  },

  async modalForm(id=null) {
    const p = id ? this._data.find(x=>x.id===id) : {};
    if (!this._clientes.length) this._clientes = await DB.getClientes();
    const esEdicion = !!id;

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Pedido de Peletería`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cliente *</label>
          <select class="form-select" id="pel-cliente">
            <option value="">— Selecciona —</option>
            ${this._clientes.map(c=>`<option value="${c.id}" ${p.cliente_id===c.id?'selected':''}>${c.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Tipo de producto *</label>
          <select class="form-select" id="pel-tipo">
            ${Object.entries(this._TIPOS).map(([k,l])=>`<option value="${k}" ${p.tipo_producto===k?'selected':''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Material</label>
          <input class="form-input" id="pel-material" value="${p.material||''}" placeholder="Cuero genuino, sintético, gamuza..."></div>
        <div class="form-group"><label class="form-label">Color</label>
          <input class="form-input" id="pel-color" value="${p.color||''}"></div>
        <div class="form-group"><label class="form-label">Cantidad</label>
          <input class="form-input" id="pel-cantidad" type="number" min="1" step="1" value="${p.cantidad||1}"></div>
      </div>
      <div class="form-group"><label class="form-label">Medidas</label>
        <input class="form-input" id="pel-medidas" value="${p.medidas||''}" placeholder="Talla 38, 110cm de largo..."></div>
      <div class="form-group"><label class="form-label">Descripción / Detalle del trabajo</label>
        <textarea class="form-input" id="pel-desc" rows="2">${p.descripcion||''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Estado</label>
          <select class="form-select" id="pel-estado">
            ${Object.entries(this._ESTADOS).map(([k,l])=>`<option value="${k}" ${(p.estado||'pedido')===k?'selected':''}>${l}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Fecha de entrega</label>
          <input class="form-input" id="pel-fecha-entrega" type="date" value="${p.fecha_entrega||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Costo material (Q)</label>
          <input class="form-input" id="pel-costo-mat" type="number" min="0" step="0.01" value="${p.costo_material||0}"></div>
        <div class="form-group"><label class="form-label">Costo mano de obra (Q)</label>
          <input class="form-input" id="pel-costo-mo" type="number" min="0" step="0.01" value="${p.costo_mano_obra||0}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Precio de venta (Q)</label>
          <input class="form-input" id="pel-precio" type="number" min="0" step="0.01" value="${p.precio_venta||0}"></div>
        <div class="form-group"><label class="form-label">Anticipo recibido (Q)</label>
          <input class="form-input" id="pel-anticipo" type="number" min="0" step="0.01" value="${p.anticipo||0}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="pel-notas" rows="2">${p.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.peleteria.guardar('${id||''}')">${esEdicion?'Guardar Cambios':'Crear Pedido'}</button>
      </div>`, '680px');
  },

  async guardar(id='') {
    const clienteId = document.getElementById('pel-cliente')?.value;
    if (!clienteId) { UI.toast('Selecciona un cliente','error'); return; }
    const precio = parseFloat(document.getElementById('pel-precio')?.value)||0;
    const anticipo = parseFloat(document.getElementById('pel-anticipo')?.value)||0;
    const fields = {
      cliente_id: clienteId,
      tipo_producto: document.getElementById('pel-tipo')?.value||'otro',
      material: document.getElementById('pel-material')?.value||null,
      color: document.getElementById('pel-color')?.value||null,
      cantidad: parseFloat(document.getElementById('pel-cantidad')?.value)||1,
      medidas: document.getElementById('pel-medidas')?.value||null,
      descripcion: document.getElementById('pel-desc')?.value||null,
      estado: document.getElementById('pel-estado')?.value||'pedido',
      fecha_entrega: document.getElementById('pel-fecha-entrega')?.value||null,
      costo_material: parseFloat(document.getElementById('pel-costo-mat')?.value)||0,
      costo_mano_obra: parseFloat(document.getElementById('pel-costo-mo')?.value)||0,
      precio_venta: precio, anticipo, saldo: Math.max(0, precio-anticipo),
      notas: document.getElementById('pel-notas')?.value||null
    };
    if (id) fields.id = id;
    const { error } = await DB.upsertPeleteriaPedido(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Pedido actualizado ✓':'Pedido creado ✓');
    this.render(this._filtroEstado);
  }
};
