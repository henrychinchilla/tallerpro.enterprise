/* ═══════════════════════════════════════════════════════
   modules/inventario.js — Inventario completo
   TallerPro Enterprise v2.0

   Mejoras:
   - Editar producto
   - Eliminar producto
   - Filtros avanzados (categoría + búsqueda)
   - Traslado entre bodegas / envío a cliente
   - QR corregido (sin defer)
   - Badge dinámico (sin hardcode)
═══════════════════════════════════════════════════════ */

Pages.inventario = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Inventario</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const inv  = await DB.getInventario();
  const bajo = inv.filter(i => i.stock <= i.min_stock);
  const cats = [...new Set(inv.map(i => i.categoria).filter(Boolean))].sort();
  Pages._invData = inv;

  const rows = inv.map(i => {
    const pct   = Math.min((i.stock / Math.max((i.min_stock||1) * 2, 1)) * 100, 100);
    const cls   = i.stock === 0 ? 'stock-crit' : i.stock <= i.min_stock ? 'stock-warn' : 'stock-ok';
    const badge = i.stock === 0 ? 'badge-red'  : i.stock <= i.min_stock ? 'badge-amber' : 'badge-green';
    return `<tr data-cat="${i.categoria||''}"
                data-text="${[i.nombre,i.codigo,i.marca,i.proveedor,i.ubicacion].join(' ').toLowerCase()}">
      <td class="mono-sm text-cyan">${i.codigo||'—'}</td>
      <td>
        <b>${i.nombre}</b>
        <br><span class="text-muted" style="font-size:11px">${i.marca||''} · ${i.proveedor||''}</span>
      </td>
      <td><span class="badge badge-gray">${i.categoria||'—'}</span></td>
      <td>
        <span class="badge ${badge}">${i.stock} uds</span>
        <div class="stock-bar" style="width:80px;margin-top:4px">
          <div class="stock-fill ${cls}" style="width:${pct}%"></div>
        </div>
        <span class="mono-sm text-muted" style="font-size:9px">mín ${i.min_stock}</span>
      </td>
      <td class="mono-sm">${UI.q(i.precio_costo)}</td>
      <td class="mono-sm text-amber">${UI.q(i.precio_venta)}</td>
      <td class="mono-sm text-muted">${i.ubicacion||'—'}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px;flex-wrap:wrap">
          <button class="btn btn-sm btn-cyan"   title="QR"       onclick="Pages.showQR('${i.id}')">QR</button>
          <button class="btn btn-sm btn-ghost"  title="Editar"   onclick="Pages.modalEditarProducto('${i.id}')">✏️</button>
          <button class="btn btn-sm btn-ghost"  title="Traslado" onclick="Pages.modalTraslado('${i.id}')">↗</button>
          <button class="btn btn-sm btn-danger" title="Eliminar" onclick="Pages.eliminarProducto('${i.id}','${i.nombre.replace(/'/g,'')}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Inventario</h1>
        <p class="page-subtitle">// ${inv.length} PRODUCTOS · ${bajo.length} CON STOCK BAJO</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" onclick="Pages.modalMovimiento()">↕ Entrada / Salida</button>
        <button class="btn btn-amber" onclick="Pages.modalNuevoProducto()">＋ Nuevo Producto</button>
      </div>
    </div>
    <div class="page-body">

      ${bajo.length > 0 ? `
      <div class="alert alert-red">
        <div class="alert-icon">🚨</div>
        <div>
          <div class="alert-title">Stock Bajo — ${bajo.length} producto${bajo.length>1?'s':''}</div>
          <div class="alert-body">${bajo.map(i =>
            `<b>${i.nombre}</b> (${i.stock}/${i.min_stock} uds)`
          ).join(' · ')}</div>
        </div>
      </div>` : ''}

      <div class="search-bar">
        <input class="search-input" id="search-inv"
               placeholder="🔍 Buscar producto, código, marca, ubicación..."
               oninput="Pages.filterInv()">
        <select class="filter-select" id="filter-cat" onchange="Pages.filterInv()">
          <option value="">Todas las categorías</option>
          ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select class="filter-select" id="filter-stock" onchange="Pages.filterInv()">
          <option value="">Todo el stock</option>
          <option value="bajo">⚠️ Stock bajo</option>
          <option value="cero">🔴 Sin stock</option>
          <option value="ok">✅ Stock normal</option>
        </select>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Código</th><th>Producto</th><th>Categoría</th>
              <th>Stock</th><th>P. Costo</th><th>P. Venta</th>
              <th>Ubicación</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody id="inv-tbody">
            ${rows || `<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">
              Sin productos. <span class="text-amber" style="cursor:pointer"
              onclick="Pages.modalNuevoProducto()"> Agregar primero →</span>
            </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
};

Pages.filterInv = function () {
  const q      = (document.getElementById('search-inv')?.value || '').toLowerCase();
  const cat    = document.getElementById('filter-cat')?.value   || '';
  const stock  = document.getElementById('filter-stock')?.value || '';
  const inv    = Pages._invData || [];

  document.querySelectorAll('#inv-tbody tr').forEach(r => {
    const text  = r.dataset.text || '';
    const rcat  = r.dataset.cat  || '';
    const item  = inv.find(i => r.textContent.includes(i.codigo||''));

    let matchStock = true;
    if (stock && item) {
      if (stock === 'cero') matchStock = item.stock === 0;
      else if (stock === 'bajo') matchStock = item.stock > 0 && item.stock <= item.min_stock;
      else if (stock === 'ok')   matchStock = item.stock > item.min_stock;
    }

    const match = (!q || text.includes(q)) &&
                  (!cat || rcat === cat)  &&
                  matchStock;
    r.style.display = match ? '' : 'none';
  });
};

/* ── QR ───────────────────────────────────────────── */
Pages.showQR = function (id) {
  const inv  = Pages._invData || [];
  const item = inv.find(i => i.id === id);
  if (!item) return;

  UI.openModal('QR: ' + item.nombre, `
    <div style="text-align:center;padding:8px">
      <div class="mono text-amber" style="font-size:20px;margin-bottom:6px">${item.codigo||'—'}</div>
      <div style="font-weight:700;margin-bottom:4px">${item.nombre}</div>
      <div class="text-muted" style="font-size:12px;margin-bottom:16px">
        ${item.marca||''} · Ubicación: ${item.ubicacion||'—'} · Stock: ${item.stock} uds
      </div>
      <div style="display:inline-block;background:#fff;padding:16px;border-radius:8px;border:1px solid var(--border)">
        <canvas id="qr-canvas"></canvas>
      </div>
      <div class="mono-sm text-muted" style="margin-top:10px">Escanear para despacho de inventario</div>
      <div class="modal-footer" style="justify-content:center;margin-top:20px">
        <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
        <button class="btn btn-amber" onclick="Pages._imprimirQR('${item.codigo}','${item.nombre}','${item.ubicacion||''}',${item.stock})">
          🖨️ Imprimir Etiqueta
        </button>
      </div>
    </div>`
  );

  /* Generar QR con retry para asegurar que el canvas existe */
  const generarQR = (intentos = 0) => {
    const canvas = document.getElementById('qr-canvas');
    if (!canvas) {
      if (intentos < 10) setTimeout(() => generarQR(intentos + 1), 100);
      return;
    }
    if (typeof QRCode === 'undefined') {
      if (intentos < 10) setTimeout(() => generarQR(intentos + 1), 200);
      return;
    }
    QRCode.toCanvas(canvas,
      `TALLERPRO:${item.codigo||item.id}:${item.nombre}`,
      { width: 200, margin: 2, color: { dark: '#000000', light: '#ffffff' } },
      err => { if (err) console.error('QR Error:', err); }
    );
  };
  setTimeout(() => generarQR(), 150);
};

Pages._imprimirQR = function (codigo, nombre, ubicacion, stock) {
  const canvas = document.getElementById('qr-canvas');
  const imgSrc = canvas ? canvas.toDataURL() : '';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}
    .etiqueta{border:2px solid #000;border-radius:8px;padding:16px;text-align:center;width:220px}
    .codigo{font-family:monospace;font-size:16px;font-weight:bold;color:#F59E0B;margin-bottom:4px}
    .nombre{font-size:13px;font-weight:bold;margin-bottom:8px}
    .info{font-size:11px;color:#666;margin-top:8px}
    @media print{body{margin:0}}
  </style></head>
  <body><div class="etiqueta">
    <div class="codigo">${codigo}</div>
    <div class="nombre">${nombre}</div>
    ${imgSrc ? `<img src="${imgSrc}" width="180" height="180">` : ''}
    <div class="info">Ubicación: ${ubicacion} · Stock: ${stock} uds</div>
    <div class="info" style="margin-top:4px;font-size:9px">TallerPro Enterprise</div>
  </div></body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
};

/* ── EDITAR PRODUCTO ──────────────────────────────── */
Pages.modalEditarProducto = function (id) {
  const inv  = Pages._invData || [];
  const item = inv.find(i => i.id === id); if (!item) return;
  const cats = ['Motor','Transmisión','Frenos','Suspensión','Lubricantes','Filtros','Ignición','Líquidos','Eléctrico','Carrocería','Otros'];

  UI.openModal('✏️ Editar: ' + item.nombre, `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Código</label>
        <input class="form-input" id="ep2-cod" value="${item.codigo||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Categoría</label>
        <select class="form-select" id="ep2-cat">
          ${cats.map(c => `<option value="${c}" ${item.categoria===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Nombre del Producto *</label>
      <input class="form-input" id="ep2-nombre" value="${item.nombre}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Marca</label>
        <input class="form-input" id="ep2-marca" value="${item.marca||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Proveedor</label>
        <input class="form-input" id="ep2-prov" value="${item.proveedor||''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Precio Costo (Q)</label>
        <input class="form-input" id="ep2-costo" type="number" step="0.01" value="${item.precio_costo||0}">
      </div>
      <div class="form-group">
        <label class="form-label">Precio Venta (Q)</label>
        <input class="form-input" id="ep2-venta" type="number" step="0.01" value="${item.precio_venta||0}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Stock Actual</label>
        <input class="form-input" id="ep2-stock" type="number" min="0" value="${item.stock||0}">
      </div>
      <div class="form-group">
        <label class="form-label">Stock Mínimo</label>
        <input class="form-input" id="ep2-min" type="number" min="0" value="${item.min_stock||2}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Ubicación en Bodega</label>
      <input class="form-input" id="ep2-ubic" value="${item.ubicacion||''}">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.actualizarProducto('${id}')">Guardar Cambios</button>
    </div>`
  );
};

Pages.actualizarProducto = async function (id) {
  const nombre = document.getElementById('ep2-nombre').value.trim();
  if (!nombre) { UI.toast('El nombre es obligatorio', 'error'); return; }

  const inv = Pages._invData || [];
  const item = inv.find(i => i.id === id);
  const nuevoStock = parseInt(document.getElementById('ep2-stock').value) || 0;

  const { error } = await getSupabase()
    .from('inventario')
    .update({
      codigo:       document.getElementById('ep2-cod').value.trim() || null,
      nombre,
      categoria:    document.getElementById('ep2-cat').value,
      marca:        document.getElementById('ep2-marca').value.trim() || null,
      proveedor:    document.getElementById('ep2-prov').value.trim() || null,
      precio_costo: parseFloat(document.getElementById('ep2-costo').value) || 0,
      precio_venta: parseFloat(document.getElementById('ep2-venta').value) || 0,
      stock:        nuevoStock,
      min_stock:    parseInt(document.getElementById('ep2-min').value) || 2,
      ubicacion:    document.getElementById('ep2-ubic').value.trim() || null,
      updated_at:   new Date().toISOString()
    })
    .eq('id', id);

  // Registrar ajuste si el stock cambió
  if (item && nuevoStock !== item.stock) {
    const delta = nuevoStock - item.stock;
    await DB.updateStock(id, delta, 'ajuste', 'Ajuste manual desde inventario');
    // updateStock double-updates stock, so revert to intended value
    await getSupabase().from('inventario').update({ stock: nuevoStock }).eq('id', id);
  }

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Producto actualizado ✓');
  Pages.inventario();
};

/* ── ELIMINAR PRODUCTO ────────────────────────────── */
Pages.eliminarProducto = function (id, nombre) {
  UI.confirm(`¿Eliminar <b>${nombre}</b> del inventario? Esta acción no se puede deshacer.`, async () => {
    const { error } = await getSupabase()
      .from('inventario')
      .update({ activo: false })
      .eq('id', id);
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.closeModal();
    UI.toast('Producto eliminado del inventario');
    Pages.inventario();
  });
};

/* ── TRASLADO / ENVÍO ─────────────────────────────── */
Pages.modalTraslado = function (id) {
  const inv  = Pages._invData || [];
  const item = inv.find(i => i.id === id); if (!item) return;

  UI.openModal('↗ Traslado / Envío: ' + item.nombre, `
    <div class="detail-section mb-4">
      <div class="detail-section-header">Producto</div>
      <div class="detail-row"><div class="detail-key">Código</div><div class="detail-val mono-sm">${item.codigo||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">Nombre</div><div class="detail-val">${item.nombre}</div></div>
      <div class="detail-row"><div class="detail-key">Ubicación actual</div><div class="detail-val">${item.ubicacion||'Sin ubicación'}</div></div>
      <div class="detail-row"><div class="detail-key">Stock disponible</div><div class="detail-val mono-sm text-amber">${item.stock} unidades</div></div>
    </div>

    <div class="form-group">
      <label class="form-label">Tipo de Movimiento</label>
      <select class="form-select" id="trl-tipo" onchange="Pages._toggleTipoTraslado(this.value)">
        <option value="bodega">📦 Traslado entre Bodegas</option>
        <option value="cliente">🚗 Envío a Cliente / OT</option>
        <option value="devolucion">↩ Devolución a Proveedor</option>
      </select>
    </div>

    <!-- Bodega destino -->
    <div id="trl-bodega">
      <div class="form-group">
        <label class="form-label">Nueva Ubicación / Bodega Destino</label>
        <input class="form-input" id="trl-destino" placeholder="Ej: Bodega 2 / Estante B-3">
      </div>
    </div>

    <!-- Envío cliente -->
    <div id="trl-cliente" class="hidden">
      <div class="form-group">
        <label class="form-label">OT o Referencia</label>
        <input class="form-input" id="trl-ot-ref" placeholder="OT-2025-0001 o nombre del cliente">
      </div>
    </div>

    <!-- Devolución -->
    <div id="trl-devol" class="hidden">
      <div class="form-group">
        <label class="form-label">Motivo de la Devolución</label>
        <input class="form-input" id="trl-motivo" placeholder="Producto defectuoso, error de pedido...">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cantidad *</label>
        <input class="form-input" id="trl-qty" type="number" min="1" max="${item.stock}" value="1">
      </div>
      <div class="form-group">
        <label class="form-label">Referencia / Notas</label>
        <input class="form-input" id="trl-notas" placeholder="Observaciones...">
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.ejecutarTraslado('${id}', '${item.ubicacion||''}')">Confirmar</button>
    </div>`
  );
};

Pages._toggleTipoTraslado = function (tipo) {
  ['bodega','cliente','devol'].forEach(t => {
    document.getElementById('trl-' + t)?.classList.toggle('hidden', t !== tipo.split('-')[0] && tipo !== t);
  });
  const map = { bodega: 'bodega', cliente: 'cliente', devolucion: 'devol' };
  Object.entries(map).forEach(([k, v]) => {
    document.getElementById('trl-' + v)?.classList.toggle('hidden', tipo !== k);
  });
};

Pages.ejecutarTraslado = async function (id, ubicacionActual) {
  const tipo  = document.getElementById('trl-tipo').value;
  const qty   = parseInt(document.getElementById('trl-qty').value) || 0;
  const notas = document.getElementById('trl-notas').value.trim();

  if (qty < 1) { UI.toast('Cantidad inválida', 'error'); return; }

  const inv  = Pages._invData || [];
  const item = inv.find(i => i.id === id);
  if (item && qty > item.stock) { UI.toast('Stock insuficiente', 'error'); return; }

  let referencia = notas;
  let nuevaUbic  = null;

  if (tipo === 'bodega') {
    nuevaUbic = document.getElementById('trl-destino').value.trim();
    if (!nuevaUbic) { UI.toast('Indica la bodega destino', 'error'); return; }
    referencia = `Traslado a ${nuevaUbic}${notas ? ' — ' + notas : ''}`;

    // Actualizar ubicación
    await getSupabase().from('inventario').update({ ubicacion: nuevaUbic }).eq('id', id);

  } else if (tipo === 'cliente') {
    const otRef = document.getElementById('trl-ot-ref').value.trim();
    referencia  = `Envío a cliente${otRef ? ' — ' + otRef : ''}${notas ? ' · ' + notas : ''}`;
    // Descontar del stock
    await DB.updateStock(id, -qty, 'salida', referencia);

  } else if (tipo === 'devolucion') {
    const motivo = document.getElementById('trl-motivo').value.trim();
    referencia   = `Devolución a proveedor${motivo ? ': ' + motivo : ''}`;
    await DB.updateStock(id, -qty, 'salida', referencia);
  }

  // Registrar movimiento
  await getSupabase().from('inv_movimientos').insert({
    tenant_id:   (await getTenantId()),
    repuesto_id: id,
    tipo:        tipo === 'bodega' ? 'ajuste' : 'salida',
    cantidad:    qty,
    referencia,
    notas
  });

  UI.closeModal();
  UI.toast(`${tipo === 'bodega' ? 'Traslado' : 'Envío'} registrado ✓`);
  Pages.inventario();
};

/* ── ENTRADA / SALIDA ─────────────────────────────── */
Pages.modalMovimiento = async function () {
  const inv = Pages._invData || await DB.getInventario();
  UI.openModal('↕ Entrada / Salida de Inventario', `
    <div class="form-group">
      <label class="form-label">Tipo de Movimiento</label>
      <select class="form-select" id="mov-tipo">
        <option value="entrada">📥 Entrada (Compra / Recepción)</option>
        <option value="salida">📤 Salida (Despacho / OT)</option>
        <option value="ajuste">⚖️ Ajuste de Inventario</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Producto *</label>
      <select class="form-select" id="mov-prod">
        ${inv.map(i => `<option value="${i.id}">${i.codigo||'—'} — ${i.nombre} (Stock: ${i.stock})</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cantidad *</label>
        <input class="form-input" id="mov-qty" type="number" min="1" value="1">
      </div>
      <div class="form-group">
        <label class="form-label">Referencia</label>
        <input class="form-input" id="mov-ref" placeholder="No. factura / OT / nota">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.registrarMovimiento()">Registrar</button>
    </div>`
  );
};

Pages.registrarMovimiento = async function () {
  const tipo   = document.getElementById('mov-tipo').value;
  const prodId = document.getElementById('mov-prod').value;
  const qty    = parseInt(document.getElementById('mov-qty').value) || 0;
  const ref    = document.getElementById('mov-ref').value.trim();
  if (qty < 1) { UI.toast('Cantidad inválida', 'error'); return; }

  const delta  = tipo === 'entrada' ? qty : -qty;
  const result = await DB.updateStock(prodId, delta, tipo, ref);

  if (result.error) { UI.toast(result.error, 'error'); return; }
  UI.closeModal();
  UI.toast(`Movimiento registrado: ${tipo === 'entrada' ? '+' : '-'}${qty} uds`);
  Pages.inventario();
};

/* ── NUEVO PRODUCTO ───────────────────────────────── */
Pages.modalNuevoProducto = function () {
  const cats = ['Motor','Transmisión','Frenos','Suspensión','Lubricantes','Filtros','Ignición','Líquidos','Eléctrico','Carrocería','Otros'];
  UI.openModal('Nuevo Producto', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Código *</label>
        <input class="form-input" id="np-cod" placeholder="REP-009">
      </div>
      <div class="form-group">
        <label class="form-label">Categoría</label>
        <select class="form-select" id="np-cat">${cats.map(c=>`<option>${c}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Nombre del Producto *</label>
      <input class="form-input" id="np-nombre" placeholder="Nombre completo del repuesto">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Marca</label>
        <input class="form-input" id="np-marca">
      </div>
      <div class="form-group">
        <label class="form-label">Proveedor</label>
        <input class="form-input" id="np-prov">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Precio Costo (Q)</label>
        <input class="form-input" id="np-costo" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label">Precio Venta (Q)</label>
        <input class="form-input" id="np-venta" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Stock Inicial</label>
        <input class="form-input" id="np-stock" type="number" min="0" placeholder="0">
      </div>
      <div class="form-group">
        <label class="form-label">Stock Mínimo</label>
        <input class="form-input" id="np-min" type="number" min="0" placeholder="2">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Ubicación en Bodega</label>
      <input class="form-input" id="np-ubic" placeholder="Ej: Estante A-5">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarProducto()">Guardar Producto</button>
    </div>`
  );
};

Pages.guardarProducto = async function () {
  const nombre = document.getElementById('np-nombre').value.trim();
  const cod    = document.getElementById('np-cod').value.trim();
  if (!nombre || !cod) { UI.toast('Código y nombre son obligatorios', 'error'); return; }

  const { error } = await DB.insertProducto({
    codigo:       cod,
    nombre,
    marca:        document.getElementById('np-marca').value.trim() || null,
    categoria:    document.getElementById('np-cat').value,
    proveedor:    document.getElementById('np-prov').value.trim() || null,
    ubicacion:    document.getElementById('np-ubic').value.trim() || null,
    stock:        parseInt(document.getElementById('np-stock').value) || 0,
    min_stock:    parseInt(document.getElementById('np-min').value)   || 2,
    precio_costo: parseFloat(document.getElementById('np-costo').value) || 0,
    precio_venta: parseFloat(document.getElementById('np-venta').value) || 0
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Producto guardado ✓');
  Pages.inventario();
};
