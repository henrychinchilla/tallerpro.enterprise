/* TallerPro v3.0 — inventario/index.js */
Modulos.inventario = {
  _data: [], _bodegas: [],

  async render(busca='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    [this._data, this._bodegas] = await Promise.all([DB.getInventario(busca||null), DB.getBodegas()]);
    const bajoStock = this._data.filter(i=>i.stock<=i.min_stock);
    const verCosto = puedeVerCosto();

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">📦 Inventario</h1>
        <p class="page-subtitle">// ${this._data.length} artículos${bajoStock.length>0?` · <span class="text-red">⚠️ ${bajoStock.length} bajo mínimo</span>`:''}</p></div>
        <div class="page-actions">
          <select class="form-select" style="width:130px" onchange="Modulos.inventario.render(document.getElementById('inv-busca')?.value,this.value)">
            <option value="">Todas</option>
            <option value="bajo">Stock Bajo</option>
            <option value="ok">Stock OK</option>
          </select>
          <button class="btn btn-ghost" onclick="Modulos.inventario.exportar()">⬇ CSV</button>
          <button class="btn btn-ghost" onclick="Modulos.inventario.importar()">⬆ Importar</button>
          <button class="btn btn-ghost" onclick="Modulos.inventario.historial()">📜 Movimientos</button>
          <button class="btn btn-ghost" onclick="window.print()">🖨 Imprimir</button>
          <button class="btn btn-amber" onclick="Modulos.inventario.modalForm()">＋ Nuevo Artículo</button>
        </div>
      </div>
      <div class="page-body">
        <input class="form-input" id="inv-busca" style="margin-bottom:16px" placeholder="🔍 Buscar nombre o código..."
               value="${busca}" oninput="Modulos.inventario.render(this.value)">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Código</th><th>Artículo</th><th>Categoría</th><th>Stock</th><th>Mín.</th>${verCosto?'<th>Costo</th>':''}<th>Venta</th><th>Acciones</th></tr></thead>
            <tbody>
              ${this._data.map(i=>{
                const bajo = i.stock <= i.min_stock;
                return `<tr style="${bajo?'background:var(--red-dim)':''}">
                  <td class="mono-sm">${i.codigo||'—'}</td>
                  <td><b>${i.nombre}</b>${i.descripcion?`<br><small class="text-muted">${i.descripcion}</small>`:''}</td>
                  <td><span class="badge badge-gray">${i.categoria||'General'}</span></td>
                  <td class="mono-sm ${bajo?'text-red':'text-green'}"><b>${i.stock}</b> ${i.unidad}</td>
                  <td class="mono-sm text-muted">${i.min_stock}</td>
                  ${verCosto?`<td class="mono-sm">${UI.q(i.precio_costo)}</td>`:''}
                  <td class="mono-sm text-amber">${UI.q(i.precio_venta)}</td>
                  <td><div style="display:flex;gap:4px">
                    <button class="btn btn-sm btn-cyan" onclick="Modulos.inventario.modalForm('${i.id}')" title="Editar">✏️ Editar</button>
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.inventario.modalMovimiento('${i.id}','${i.nombre}',${i.stock})" title="Movimiento de stock">±</button>
                    <button class="btn btn-sm btn-danger" onclick="Modulos.inventario.eliminar('${i.id}','${i.nombre}')" title="Eliminar">🗑️</button>
                  </div></td>
                </tr>`;
              }).join('')||`<tr><td colspan="${verCosto?8:7}" style="text-align:center;padding:24px;color:var(--text3)">Sin artículos registrados</td></tr>`}
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
        ${puedeVerCosto()?`<div class="form-group"><label class="form-label">Precio Costo (Q)</label>
          <input class="form-input" id="inv-costo" type="number" value="${item.precio_costo||0}" min="0" step="0.01"></div>`:''}
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
      precio_venta: parseFloat(document.getElementById('inv-venta')?.value)||0,
      descripcion:  document.getElementById('inv-desc')?.value||null
    };
    /* El costo solo se toca si el usuario puede verlo (si no, se preserva) */
    const costoEl = document.getElementById('inv-costo');
    if (costoEl) fields.precio_costo = parseFloat(costoEl.value)||0;
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

  async eliminar(id, nombre) {
    const ok = await UI.confirmar(`¿Eliminar artículo <b>${nombre}</b>? Esta acción no se puede deshacer.`, 'Eliminar');
    if (!ok) return;
    const { error } = await getSB().from('inventario').delete().eq('id', id);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast('Artículo eliminado ✓');
    this.render();
  },

  exportar() {
    const verCosto = puedeVerCosto();
    const head = ['Código','Nombre','Categoría','Marca','Unidad','Stock','Mínimo'];
    if (verCosto) head.push('Costo');
    head.push('Venta','Descripción');
    const rows = [head];
    this._data.forEach(i=>{
      const r = [i.codigo||'',i.nombre,i.categoria||'',i.marca||'',i.unidad||'unidad',i.stock,i.min_stock];
      if (verCosto) r.push(i.precio_costo);
      r.push(i.precio_venta, i.descripcion||'');
      rows.push(r);
    });
    Modulos._descargarCSV(rows, `inventario-${new Date().toISOString().slice(0,10)}.csv`);
  },

  /* ── HISTORIAL DE MOVIMIENTOS (trazabilidad / auditoría) ─── */
  async historial() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const movs = await DB.getMovimientosInventario({ limite: 400 });
    const badge = {
      entrada:['green','📥 Entrada'], salida:['red','📤 Salida'], traslado:['cyan','🔄 Traslado'],
      ajuste:['amber','🔧 Ajuste'], devolucion:['purple','↩️ Devolución']
    };
    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">📜 Movimientos de Inventario</h1>
        <p class="page-subtitle">// ${movs.length} movimientos · trazabilidad de entradas, salidas y traslados</p></div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.inventario.render()">← Inventario</button>
          <button class="btn btn-ghost" onclick="window.print()">🖨️ Imprimir</button>
        </div>
      </div>
      <div class="page-body"><div class="table-wrap"><table class="data-table">
        <thead><tr><th>Fecha y hora</th><th>Artículo</th><th>Tipo</th><th>Cantidad</th><th>Referencia</th><th>Usuario</th></tr></thead>
        <tbody>
          ${movs.map(m=>{
            const t = badge[m.tipo] || ['gray', m.tipo||'—'];
            const signo = m.tipo==='salida' ? '-' : (m.tipo==='entrada'||m.tipo==='devolucion') ? '+' : '';
            return `<tr>
              <td class="mono-sm">${new Date(m.created_at).toLocaleString('es-GT')}</td>
              <td><b>${m.inventario?.nombre||'—'}</b>${m.inventario?.codigo?`<br><small class="text-muted">${m.inventario.codigo}</small>`:''}</td>
              <td><span class="badge badge-${t[0]}">${t[1]}</span></td>
              <td class="mono-sm">${signo}${m.cantidad} ${m.inventario?.unidad||''}</td>
              <td class="mono-sm">${m.referencia||'—'}${m.notas?`<br><small class="text-muted">${m.notas}</small>`:''}</td>
              <td>${m.usuario_nombre||'—'}</td>
            </tr>`;
          }).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin movimientos registrados</td></tr>'}
        </tbody>
      </table></div></div>`;
  },

  /* ── IMPORTAR INVENTARIO (CSV) ─────────────────────── */
  importar() {
    Modulos._importarCSV(async (filas) => {
      /* Mapea encabezados flexibles (acepta export propio o plantilla simple) */
      const norm = s => (s||'').toString().trim().toLowerCase();
      const head = filas.shift().map(norm);
      const col = (...names) => head.findIndex(h => names.includes(h));
      const iCod=col('código','codigo','sku'), iNom=col('nombre','artículo','articulo'),
            iCat=col('categoría','categoria'), iMar=col('marca'), iUni=col('unidad'),
            iStk=col('stock','existencia'), iMin=col('mínimo','minimo','min'),
            iCos=col('costo','precio costo','precio_costo'), iVen=col('venta','precio venta','precio_venta'),
            iDes=col('descripción','descripcion');
      if (iNom < 0) { UI.toast('El CSV debe tener al menos la columna "Nombre"','error'); return; }
      const verCosto = puedeVerCosto();

      let ok=0, err=0;
      for (const f of filas) {
        if (!f.length || !norm(f[iNom])) continue;
        const fields = {
          codigo:     iCod>=0 ? (f[iCod]||'').trim()||null : null,
          nombre:     (f[iNom]||'').trim(),
          categoria:  iCat>=0 ? (f[iCat]||'').trim()||'General' : 'General',
          marca:      iMar>=0 ? (f[iMar]||'').trim()||null : null,
          unidad:     iUni>=0 ? (f[iUni]||'').trim()||'unidad' : 'unidad',
          stock:      iStk>=0 ? parseFloat(f[iStk])||0 : 0,
          min_stock:  iMin>=0 ? parseFloat(f[iMin])||5 : 5,
          precio_venta: iVen>=0 ? parseFloat(f[iVen])||0 : 0,
          descripcion:  iDes>=0 ? (f[iDes]||'').trim()||null : null
        };
        /* Solo quien ve el costo puede importarlo */
        if (verCosto && iCos>=0) fields.precio_costo = parseFloat(f[iCos])||0;
        const { error } = await DB.upsertInventario(fields);
        error ? err++ : ok++;
      }
      UI.toast(`Importación: ${ok} creados${err?`, ${err} con error`:''} ✓`);
      this.render();
    });
  }
};
