/* ═══════════════════════════════════════════════════════
   modules/inventario.js — Inventario (Supabase)
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

Pages.inventario = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Inventario</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const inv  = await DB.getInventario();
  const bajo = inv.filter(i => i.stock <= i.min_stock);
  const cats = [...new Set(inv.map(i => i.categoria).filter(Boolean))];
  Pages._invData = inv;

  const rows = inv.map(i => {
    const pct   = Math.min((i.stock / Math.max((i.min_stock||1) * 2, 1)) * 100, 100);
    const cls   = i.stock === 0 ? 'stock-crit' : i.stock <= i.min_stock ? 'stock-warn' : 'stock-ok';
    const badge = i.stock === 0 ? 'badge-red'  : i.stock <= i.min_stock ? 'badge-amber' : 'badge-green';
    return `<tr data-cat="${i.categoria||''}" data-text="${[i.nombre,i.codigo,i.marca,i.proveedor].join(' ').toLowerCase()}">
      <td class="mono-sm text-cyan">${i.codigo}</td>
      <td><b>${i.nombre}</b><br><span class="text-muted" style="font-size:11px">${i.proveedor||''}</span></td>
      <td><span class="badge badge-gray">${i.categoria||'—'}</span></td>
      <td>
        <span class="badge ${badge}">${i.stock} uds</span>
        <div class="stock-bar" style="width:80px">
          <div class="stock-fill ${cls}" style="width:${pct}%"></div>
        </div>
      </td>
      <td class="mono-sm">${UI.q(i.precio_venta)}</td>
      <td class="mono-sm text-muted">${i.ubicacion||'—'}</td>
      <td>
        <button class="btn btn-sm btn-cyan"
                onclick="event.stopPropagation();Pages.showQR('${i.id}')">QR</button>
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
          <div class="alert-title">Stock Bajo (${bajo.length} productos)</div>
          <div class="alert-body">${bajo.map(i=>`<b>${i.nombre}</b> (${i.stock} uds, mín ${i.min_stock})`).join(' · ')}</div>
        </div>
      </div>` : ''}

      <div class="search-bar">
        <input class="search-input" id="search-inv" placeholder="🔍 Buscar producto, código, marca..."
               oninput="Pages.filterInv()">
        <select class="filter-select" id="filter-cat" onchange="Pages.filterInv()">
          <option value="">Todas las categorías</option>
          ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Código</th><th>Producto</th><th>Categoría</th><th>Stock</th><th>P. Venta</th><th>Ubicación</th><th>QR</th></tr>
          </thead>
          <tbody id="inv-tbody">
            ${rows || `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px">
              Sin productos. <span class="text-amber" style="cursor:pointer" onclick="Pages.modalNuevoProducto()">Agregar primero →</span>
            </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
};

Pages.filterInv = function () {
  const q   = (document.getElementById('search-inv')?.value || '').toLowerCase();
  const cat = document.getElementById('filter-cat')?.value || '';
  document.querySelectorAll('#inv-tbody tr').forEach(r => {
    const match = (!q || (r.dataset.text||'').includes(q)) && (!cat || r.dataset.cat === cat);
    r.style.display = match ? '' : 'none';
  });
};

Pages.showQR = function (id) {
  const inv  = Pages._invData || [];
  const item = inv.find(i => i.id === id);
  if (!item) return;

  UI.openModal('QR: ' + item.nombre, `
    <div style="text-align:center">
      <div class="mono text-amber" style="font-size:20px;margin-bottom:6px">${item.codigo}</div>
      <div style="font-weight:700;margin-bottom:16px">${item.nombre}</div>
      <canvas id="qr-canvas" style="border:1px solid var(--border);border-radius:4px;padding:10px;background:#fff"></canvas>
      <div class="mono-sm text-muted" style="margin-top:10px">Escanear para despacho</div>
      <div style="margin-top:4px;font-size:12px;color:var(--text2)">
        Ubicación: ${item.ubicacion||'—'} · Stock: ${item.stock} uds
      </div>
      <div class="modal-footer" style="justify-content:center">
        <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
        <button class="btn btn-amber" onclick="window.print()">🖨️ Imprimir</button>
      </div>
    </div>`
  );
  setTimeout(() => {
    const canvas = document.getElementById('qr-canvas');
    if (canvas && window.QRCode) {
      QRCode.toCanvas(canvas, `TALLERPRO:${item.codigo}:${item.nombre}`, { width: 180, margin: 2 }, () => {});
    }
  }, 120);
};

Pages.modalMovimiento = async function () {
  const inv = Pages._invData || await DB.getInventario();
  UI.openModal('Entrada / Salida de Inventario', `
    <div class="form-group">
      <label class="form-label">Tipo de Movimiento</label>
      <select class="form-select" id="mov-tipo">
        <option value="entrada">Entrada (Compra / Recepción)</option>
        <option value="salida">Salida (Despacho)</option>
        <option value="ajuste">Ajuste</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Producto *</label>
      <select class="form-select" id="mov-prod">
        ${inv.map(i => `<option value="${i.id}">${i.codigo} — ${i.nombre} (Stock: ${i.stock})</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cantidad *</label>
        <input class="form-input" id="mov-qty" type="number" min="1" value="1">
      </div>
      <div class="form-group">
        <label class="form-label">Referencia</label>
        <input class="form-input" id="mov-ref" placeholder="No. factura / OT">
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
        <input class="form-input" id="np-marca" placeholder="Marca">
      </div>
      <div class="form-group">
        <label class="form-label">Proveedor</label>
        <input class="form-input" id="np-prov" placeholder="Nombre proveedor">
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
    codigo:        cod,
    nombre,
    marca:         document.getElementById('np-marca').value.trim(),
    categoria:     document.getElementById('np-cat').value,
    proveedor:     document.getElementById('np-prov').value.trim(),
    ubicacion:     document.getElementById('np-ubic').value.trim(),
    stock:         parseInt(document.getElementById('np-stock').value) || 0,
    min_stock:     parseInt(document.getElementById('np-min').value)   || 2,
    precio_costo:  parseFloat(document.getElementById('np-costo').value) || 0,
    precio_venta:  parseFloat(document.getElementById('np-venta').value) || 0
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Producto guardado exitosamente ✓');
  Pages.inventario();
};
