/* TallerPro v3.0 — inventario/index.js */
Modulos.inventario = {
  _data: [], _bodegas: [],

  async render(busca='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    [this._data, this._bodegas] = await Promise.all([DB.getInventario(busca||null), DB.getBodegas()]);
    const bajoStock = this._data.filter(i=>i.stock<=i.min_stock);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">📦 Inventario</h1>
        <p class="page-subtitle">// ${this._data.length} artículos${bajoStock.length>0?` · <span class="text-red">⚠️ ${bajoStock.length} bajo mínimo</span>`:''}</p></div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.inventario.exportar()">⬇ Exportar</button>
          <button class="btn btn-amber" onclick="Modulos.inventario.modalForm()">＋ Nuevo Artículo</button>
        </div>
      </div>
      <div class="page-body">
        <input class="form-input" style="margin-bottom:16px" placeholder="🔍 Buscar nombre o código..."
               value="${busca}" oninput="Modulos.inventario.render(this.value)">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Código</th><th>Artículo</th><th>Categoría</th><th>Stock</th><th>Mín.</th><th>Costo</th><th>Venta</th><th>Acciones</th></tr></thead>
            <tbody>
              ${this._data.map(i=>{
                const bajo = i.stock <= i.min_stock;
                return `<tr style="${bajo?'background:var(--red-dim)':''}">
                  <td class="mono-sm">${i.codigo||'—'}</td>
                  <td><b>${i.nombre}</b>${i.descripcion?`<br><small class="text-muted">${i.descripcion}</small>`:''}</td>
                  <td><span class="badge badge-gray">${i.categoria||'General'}</span></td>
                  <td class="mono-sm ${bajo?'text-red':'text-green'}"><b>${i.stock}</b> ${i.unidad}</td>
                  <td class="mono-sm text-muted">${i.min_stock}</td>
                  <td class="mono-sm">${UI.q(i.precio_costo)}</td>
                  <td class="mono-sm text-amber">${UI.q(i.precio_venta)}</td>
                  <td><div style="display:flex;gap:4px">
                    <button class="btn btn-sm btn-cyan" onclick="Modulos.inventario.modalForm('${i.id}')">Editar</button>
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.inventario.modalMovimiento('${i.id}','${i.nombre}',${i.stock})">±</button>
                  </div></td>
                </tr>`;
              }).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin artículos registrados</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  modalForm(id=null) {
    const item = id ? this._data.find(x=>x.id===id) : {};
    const esEdicion = !!id;
    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Artículo`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del artículo.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Código / SKU</label>
          <input class="form-input" id="inv-codigo" value="${item.codigo||''}" placeholder="REP-001"></div>
        <div class="form-group"><label class="form-label">Nombre *</label>
          <input class="form-input" id="inv-nombre" value="${item.nombre||''}" placeholder="Filtro de aceite"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Categoría</label>
          <select class="form-select" id="inv-cat">
            ${['Filtros','Aceites','Frenos','Motor','Eléctrico','Carrocería','Herramientas','Consumibles','Otro'].map(c=>`<option ${item.categoria===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Marca</label>
          <input class="form-input" id="inv-marca" value="${item.marca||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Unidad</label>
          <select class="form-select" id="inv-unidad">
            ${['unidad','litro','galón','kg','metro','par','juego','caja'].map(u=>`<option ${item.unidad===u?'selected':''}>${u}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Bodega</label>
          <select class="form-select" id="inv-bodega">
            <option value="">Principal</option>
            ${this._bodegas.map(b=>`<option value="${b.id}" ${item.bodega_id===b.id?'selected':''}>${b.nombre}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Stock Actual</label>
          <input class="form-input" id="inv-stock" type="number" value="${item.stock||0}" min="0"></div>
        <div class="form-group"><label class="form-label">Stock Mínimo</label>
          <input class="form-input" id="inv-min" type="number" value="${item.min_stock||5}" min="0"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Precio Costo (Q)</label>
          <input class="form-input" id="inv-costo" type="number" value="${item.precio_costo||0}" min="0" step="0.01"></div>
        <div class="form-group"><label class="form-label">Precio Venta (Q)</label>
          <input class="form-input" id="inv-venta" type="number" value="${item.precio_venta||0}" min="0" step="0.01"></div>
      </div>
      <div class="form-group"><label class="form-label">Descripción</label>
        <textarea class="form-input" id="inv-desc" rows="2">${item.descripcion||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.inventario.guardar('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear Artículo'}
        </button>
      </div>`,'640px');
  },

  async guardar(id='') {
    const nombre = document.getElementById('inv-nombre')?.value.trim();
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }
    const fields = {
      codigo:       document.getElementById('inv-codigo')?.value.trim()||null,
      nombre,
      categoria:    document.getElementById('inv-cat')?.value,
      marca:        document.getElementById('inv-marca')?.value||null,
      unidad:       document.getElementById('inv-unidad')?.value,
      bodega_id:    document.getElementById('inv-bodega')?.value||null,
      stock:        parseFloat(document.getElementById('inv-stock')?.value)||0,
      min_stock:    parseFloat(document.getElementById('inv-min')?.value)||5,
      precio_costo: parseFloat(document.getElementById('inv-costo')?.value)||0,
      precio_venta: parseFloat(document.getElementById('inv-venta')?.value)||0,
      descripcion:  document.getElementById('inv-desc')?.value||null
    };
    if (id) fields.id = id;
    const {error} = await DB.upsertInventario(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Actualizado ✓':'Artículo creado ✓');
    this.render();
  },

  modalMovimiento(id, nombre, stockActual) {
    UI.modal(`± Movimiento — ${nombre}`, `
      <div style="text-align:center;margin-bottom:16px">
        <div class="kpi-label">Stock actual</div>
        <div class="kpi-val amber">${stockActual}</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo</label>
          <select class="form-select" id="mov-tipo">
            <option value="entrada">📥 Entrada (compra)</option>
            <option value="salida">📤 Salida (uso en OT)</option>
            <option value="ajuste">🔄 Ajuste de inventario</option>
            <option value="devolucion">↩️ Devolución</option>
          </select></div>
        <div class="form-group"><label class="form-label">Cantidad *</label>
          <input class="form-input" id="mov-cant" type="number" min="0.01" step="0.01" placeholder="0"></div>
      </div>
      <div class="form-group"><label class="form-label">Referencia</label>
        <input class="form-input" id="mov-ref" placeholder="No. OT, factura proveedor..."></div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="mov-notas" rows="2"></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.inventario.guardarMovimiento('${id}',${stockActual})">Registrar</button>
      </div>`);
  },

  async guardarMovimiento(invId, stockActual) {
    const tipo = document.getElementById('mov-tipo')?.value;
    const cant = parseFloat(document.getElementById('mov-cant')?.value)||0;
    if (cant<=0) { UI.toast('Ingresa una cantidad válida','error'); return; }

    const nuevoStock = tipo==='salida' ? stockActual-cant : stockActual+cant;
    if (nuevoStock<0) { UI.toast('Stock insuficiente','error'); return; }

    await DB.movimientoInventario({
      inventario_id: invId, tipo, cantidad:cant,
      referencia: document.getElementById('mov-ref')?.value||null,
      notas:      document.getElementById('mov-notas')?.value||null,
      fecha:      new Date().toISOString().slice(0,10)
    });

    await DB.upsertInventario({ id:invId, stock:nuevoStock });
    UI.cerrarModal(); UI.toast('Movimiento registrado ✓');
    this.render();
  },

  exportar() {
    const rows = [['Código','Nombre','Categoría','Stock','Mínimo','Costo','Venta']];
    this._data.forEach(i=>rows.push([i.codigo||'',i.nombre,i.categoria||'',i.stock,i.min_stock,i.precio_costo,i.precio_venta]));
    const csv = rows.map(r=>r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    a.download = `inventario-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }
};
