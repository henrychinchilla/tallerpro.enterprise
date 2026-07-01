/* NexusPro v3.0 — inventario/index.js */
Modulos.inventario = {
  _data: [], _bodegas: [], _proveedores: [], _img: '',
  async render(busca='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    [this._data, this._bodegas, this._proveedores] = await Promise.all([
      DB.getInventario(null), DB.getBodegas(), DB.getProveedores().catch(()=>[])
    ]);
    const bajoStock = this._data.filter(i=>i.stock<=i.min_stock);
    const verCosto = puedeVerCosto();
    const cats = [...new Set(this._data.map(i=>i.categoria).filter(Boolean))].sort();

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">📦 Inventario</h1>
        <p class="page-subtitle">// ${this._data.length} artículos${bajoStock.length>0?` · <span class="text-red">⚠️ ${bajoStock.length} bajo mínimo</span>`:''}</p></div>
        <div class="page-actions" style="display:flex;gap:8px;flex-wrap:wrap">
          <select class="form-select" id="inv-filtro-cat" style="width:170px" onchange="Modulos.inventario._filtrarLocal()">
            <option value="">Todas las categorías</option>
            ${cats.map(c=>`<option value="${c}">${c}</option>`).join('')}
          </select>
          <select class="form-select" id="inv-filtro-stock" style="width:130px" onchange="Modulos.inventario._filtrarLocal()">
            <option value="">Todos los stocks</option>
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
        <input class="form-input" id="inv-busca" style="margin-bottom:16px" placeholder="🔍 Buscar nombre, código o marca..."
               value="${busca}" oninput="Modulos.inventario._filtrarLocal()">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Código</th><th>Artículo</th><th>Categoría</th><th>Stock</th><th>Mín.</th>${verCosto?'<th>Costo</th>':''}<th>Venta</th><th>Acciones</th></tr></thead>
            <tbody>
              ${this._data.map(i=>{
                const bajo = i.stock <= i.min_stock;
                const thumb = i.imagen_url
                  ? `<img src="${i.imagen_url}" alt="" onclick="event.stopPropagation();Modulos.inventario._lightbox('${i.id}')" style="width:34px;height:34px;border-radius:6px;object-fit:cover;border:1px solid var(--border);cursor:zoom-in;flex-shrink:0">`
                  : `<div style="width:34px;height:34px;border-radius:6px;background:var(--surface2);display:flex;align-items:center;justify-content:center;color:var(--text3);flex-shrink:0">📦</div>`;
                return `<tr data-categoria="${i.categoria||'General'}" data-bajo="${bajo}" style="${bajo?'background:var(--red-dim)':''}">
                  <td class="mono-sm">${i.codigo||'—'}</td>
                  <td><div style="display:flex;align-items:center;gap:8px">${thumb}<div><b>${i.nombre}</b>${i.descripcion?`<br><small class="text-muted">${i.descripcion}</small>`:''}</div></div></td>
                  <td><span class="badge badge-gray">${i.categoria||'General'}</span></td>
                  <td class="mono-sm ${bajo?'text-red':'text-green'}"><b>${i.stock}</b> ${i.unidad_medida||''}</td>
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
    this._filtrarLocal();
  },

  modalForm(id=null) {
    const item = id ? this._data.find(x=>x.id===id) : {};
    const esEdicion = !!id;
    this._img = item.imagen_url || '';
    const cats = [...new Set(this._data.map(i=>i.categoria).filter(Boolean))].sort();

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Artículo`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del artículo.</div></div>':''}

      <!-- Foto del producto -->
      <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px">
        <div id="inv-img-box" style="flex-shrink:0">${this._renderImgBox()}</div>
        <div style="flex:1">
          <label class="form-label">Foto del producto (opcional)</label>
          <div style="font-size:11px;color:var(--text3);margin-bottom:6px">Sube una imagen (se reduce automáticamente) o pega una URL.</div>
          <input class="form-input" id="inv-img-url" placeholder="https://... (URL de imagen)"
                 value="${(this._img && !this._img.startsWith('data:')) ? this._img : ''}"
                 oninput="Modulos.inventario._setImgUrl(this.value)">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group"><label class="form-label">Código / SKU</label>
          <input class="form-input" id="inv-codigo" value="${item.codigo||''}" placeholder="REP-001"></div>
        <div class="form-group"><label class="form-label">Nombre *</label>
          <input class="form-input" id="inv-nombre" value="${item.nombre||''}" placeholder="Filtro de aceite"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Código de barras</label>
          <input class="form-input" id="inv-barcode" value="${item.codigo_barras||''}" placeholder="7501234567890"></div>
        <div class="form-group"><label class="form-label">Marca</label>
          <input class="form-input" id="inv-marca" value="${item.marca||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Categoría</label>
          <input class="form-input" id="inv-cat" list="inv-cats-form-list" value="${item.categoria||''}" placeholder="Escribe o selecciona categoría...">
          <datalist id="inv-cats-form-list">
            ${cats.map(c=>`<option value="${c}">`).join('')}
          </datalist>
        </div>
        <div class="form-group"><label class="form-label">Proveedor</label>
          <select class="form-select" id="inv-prov">
            <option value="">Sin proveedor</option>
            ${this._proveedores.map(p=>`<option value="${p.id}" ${item.proveedor_id===p.id?'selected':''}>${p.nombre}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Unidad</label>
          <select class="form-select" id="inv-unidad">
            ${['pieza','unidad','litro','galón','kg','metro','par','juego','caja'].map(u=>`<option ${item.unidad_medida===u?'selected':''}>${u}</option>`).join('')}
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
      <div class="form-row">
        <div class="form-group"><label class="form-label">No. de parte OEM</label>
          <input class="form-input" id="inv-oem" value="${item.num_parte_oem||''}" placeholder="OEM / referencia fabricante"></div>
        <div class="form-group"><label class="form-label">Estado del artículo</label>
          <select class="form-select" id="inv-estado">
            ${['nuevo','usado','remanufacturado'].map(s=>`<option ${item.estado_articulo===s?'selected':''}>${s}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Stock máximo</label>
          <input class="form-input" id="inv-max" type="number" min="0" value="${item.max_stock||''}" placeholder="Opcional"></div>
        <div class="form-group"><label class="form-label">Peso (kg)</label>
          <input class="form-input" id="inv-peso" type="number" min="0" step="0.001" value="${item.peso_kg||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Ubicación en bodega</label>
        <input class="form-input" id="inv-ubic" value="${item.ubicacion||''}" placeholder="Estante A, Fila 3"></div>
      <div class="form-group">
        <label class="form-label">Dimensiones (cm)</label>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <input class="form-input" id="inv-ancho" type="number" min="0" step="0.1" value="${item.ancho_cm||''}" placeholder="Ancho">
          <input class="form-input" id="inv-alto"  type="number" min="0" step="0.1" value="${item.alto_cm||''}"  placeholder="Alto">
          <input class="form-input" id="inv-largo" type="number" min="0" step="0.1" value="${item.largo_cm||''}" placeholder="Largo">
        </div>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">🚗 Compatibilidad con vehículos</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Marca compatible</label>
            <input class="form-input" id="inv-cmarca" value="${item.compat_marca||''}" placeholder="Toyota, Honda..."></div>
          <div class="form-group"><label class="form-label">Modelo compatible</label>
            <input class="form-input" id="inv-cmodelo" value="${item.compat_modelo||''}" placeholder="Corolla, Civic..."></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Año desde</label>
            <input class="form-input" id="inv-canioini" type="number" value="${item.compat_anio_ini||''}" placeholder="2010"></div>
          <div class="form-group"><label class="form-label">Año hasta</label>
            <input class="form-input" id="inv-caniofin" type="number" value="${item.compat_anio_fin||''}" placeholder="2018"></div>
        </div>
        <div class="form-group"><label class="form-label">Motor compatible</label>
          <input class="form-input" id="inv-cmotor" value="${item.compat_motor||''}" placeholder="1.8L, 2.0 Turbo..."></div>
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
      codigo:        document.getElementById('inv-codigo')?.value.trim()||null,
      nombre,
      codigo_barras: document.getElementById('inv-barcode')?.value.trim()||null,
      categoria:     document.getElementById('inv-cat')?.value,
      marca:         document.getElementById('inv-marca')?.value||null,
      proveedor_id:  document.getElementById('inv-prov')?.value||null,
      unidad_medida: document.getElementById('inv-unidad')?.value,
      bodega_id:     document.getElementById('inv-bodega')?.value||null,
      stock:         parseFloat(document.getElementById('inv-stock')?.value)||0,
      min_stock:     parseFloat(document.getElementById('inv-min')?.value)||5,
      precio_venta:  parseFloat(document.getElementById('inv-venta')?.value)||0,
      descripcion:   document.getElementById('inv-desc')?.value||null,
      imagen_url:    this._img || null,
      num_parte_oem: document.getElementById('inv-oem')?.value.trim()||null,
      estado_articulo: document.getElementById('inv-estado')?.value||'nuevo',
      max_stock:     parseFloat(document.getElementById('inv-max')?.value)||null,
      peso_kg:       parseFloat(document.getElementById('inv-peso')?.value)||null,
      ubicacion:     document.getElementById('inv-ubic')?.value.trim()||null,
      ancho_cm:      parseFloat(document.getElementById('inv-ancho')?.value)||null,
      alto_cm:       parseFloat(document.getElementById('inv-alto')?.value)||null,
      largo_cm:      parseFloat(document.getElementById('inv-largo')?.value)||null,
      compat_marca:  document.getElementById('inv-cmarca')?.value.trim()||null,
      compat_modelo: document.getElementById('inv-cmodelo')?.value.trim()||null,
      compat_anio_ini: parseInt(document.getElementById('inv-canioini')?.value)||null,
      compat_anio_fin: parseInt(document.getElementById('inv-caniofin')?.value)||null,
      compat_motor:  document.getElementById('inv-cmotor')?.value.trim()||null
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

  /* ── FOTO DEL PRODUCTO ───────────────────────────── */
  _renderImgBox() {
    if (this._img) {
      return `<div style="position:relative;width:84px;height:84px">
        <img src="${this._img}" onclick="Modulos.inventario._lightbox()" alt="producto"
             style="width:84px;height:84px;border-radius:10px;object-fit:cover;border:1px solid var(--border);cursor:zoom-in;display:block">
        <button type="button" onclick="Modulos.inventario._quitarFoto()" title="Quitar foto"
          style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;background:var(--red);border:none;color:#fff;cursor:pointer;font-weight:700;line-height:1">×</button>
      </div>`;
    }
    return `<label style="width:84px;height:84px;border-radius:10px;border:2px dashed var(--border);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:var(--text3);font-size:10px;gap:4px;background:var(--surface2)">
      <span style="font-size:22px">📷</span><span>Subir foto</span>
      <input type="file" accept="image/*" style="display:none" onchange="Modulos.inventario._subirFoto(this)">
    </label>`;
  },

  _refreshImgBox() {
    const b = document.getElementById('inv-img-box');
    if (b) b.innerHTML = this._renderImgBox();
  },

  _setImgUrl(url) { this._img = (url||'').trim(); this._refreshImgBox(); },

  _quitarFoto() {
    this._img = '';
    const u = document.getElementById('inv-img-url'); if (u) u.value = '';
    this._refreshImgBox();
  },

  /* Lee la imagen, la reduce a máx. 800px y la guarda como data URL */
  _subirFoto(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { UI.toast('Selecciona una imagen','error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const max = 800; let w = img.width, h = img.height;
        if (w > max || h > max) { const r = Math.min(max/w, max/h); w = Math.round(w*r); h = Math.round(h*r); }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        this._img = c.toDataURL('image/jpeg', 0.82);
        const u = document.getElementById('inv-img-url'); if (u) u.value = '';
        this._refreshImgBox();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  /* Visor a pantalla completa (overlay propio, no usa el modal de la app) */
  _lightbox(id) {
    const src = id ? this._data.find(x=>x.id===id)?.imagen_url : this._img;
    if (!src) return;
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out';
    ov.onclick = () => ov.remove();
    ov.innerHTML = `<img src="${src}" style="max-width:92vw;max-height:92vh;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.6)">`;
    document.body.appendChild(ov);
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
      const r = [i.codigo||'',i.nombre,i.categoria||'',i.marca||'',i.unidad_medida||'unidad',i.stock,i.min_stock];
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
              <td class="mono-sm">${signo}${m.cantidad} ${m.inventario?.unidad_medida||''}</td>
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
          unidad_medida: iUni>=0 ? (f[iUni]||'').trim()||'unidad' : 'unidad',
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
  },

  _filtrarLocal() {
    const busca = (document.getElementById('inv-busca')?.value||'').trim().toLowerCase();
    const cat = document.getElementById('inv-filtro-cat')?.value||'';
    const stock = document.getElementById('inv-filtro-stock')?.value||'';

    const rows = document.querySelectorAll('.data-table tbody tr');
    let totalVisibles = 0;
    let bajoVisibles = 0;

    rows.forEach(row => {
      const rowCat = row.getAttribute('data-categoria') || '';
      const rowBajo = row.getAttribute('data-bajo') === 'true';
      const text = row.innerText.toLowerCase();

      const matchBusca = !busca || text.includes(busca);
      const matchCat = !cat || rowCat === cat;
      const matchStock = !stock || (stock === 'bajo' && rowBajo) || (stock === 'ok' && !rowBajo);

      if (matchBusca && matchCat && matchStock) {
        row.style.display = '';
        totalVisibles++;
        if (rowBajo) bajoVisibles++;
      } else {
        row.style.display = 'none';
      }
    });

    const subtitle = document.querySelector('.page-subtitle');
    if (subtitle) {
      subtitle.innerHTML = `// ${totalVisibles} filtrados${bajoVisibles > 0 ? ` · <span class="text-red">⚠️ ${bajoVisibles} bajo mínimo</span>` : ''}`;
    }
  }
};
