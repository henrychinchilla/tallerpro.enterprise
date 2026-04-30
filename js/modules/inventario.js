/* ═══════════════════════════════════════════════════════
   modules/inventario.js — Inventario Completo v2
   TallerPro Enterprise v2.0

   Vista lista: campos clave solamente
   Modal editar/crear: todos los campos
═══════════════════════════════════════════════════════ */

Pages.inventario = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Inventario</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const inv  = await DB.getInventario();
  const bajo = inv.filter(i => i.stock <= (i.min_stock||2));
  const cats = [...new Set(inv.map(i => i.categoria).filter(Boolean))].sort();
  Pages._invData = inv;

  /* ── Filas tabla (solo campos clave) ─────────────── */
  const rows = inv.map(i => {
    const stockOk   = i.stock > (i.min_stock||2);
    const stockBajo = i.stock > 0 && i.stock <= (i.min_stock||2);
    const sinStock  = i.stock === 0;
    const badgeCls  = sinStock ? 'badge-red' : stockBajo ? 'badge-amber' : 'badge-green';
    const barCls    = sinStock ? 'stock-crit' : stockBajo ? 'stock-warn' : 'stock-ok';
    const pct       = Math.min((i.stock / Math.max((i.min_stock||2)*2, 1))*100, 100);

    return `<tr data-cat="${i.categoria||''}"
                data-estado="${i.estado_articulo||'nuevo'}"
                data-text="${[i.nombre,i.codigo,i.codigo_barras,i.num_parte_oem,i.marca,i.proveedor,i.ubicacion,i.compat_marca,i.compat_modelo].join(' ').toLowerCase()}">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          ${i.imagen_url
            ? `<img src="${i.imagen_url}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">`
            : `<div style="width:32px;height:32px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:14px">📦</div>`}
          <div>
            <div style="font-weight:600;font-size:13px">${i.nombre}</div>
            <div style="font-size:10px;color:var(--text3)">${i.num_parte_oem ? 'OEM: '+i.num_parte_oem : ''}${i.marca ? ' · '+i.marca : ''}</div>
          </div>
        </div>
      </td>
      <td class="mono-sm text-cyan">${i.codigo||'—'}</td>
      <td><span class="badge badge-gray" style="font-size:9px">${i.categoria||'—'}</span></td>
      <td>
        <span class="badge ${badgeCls}">${i.stock} ${i.unidad_medida||'pz'}</span>
        <div class="stock-bar" style="width:60px;margin-top:3px">
          <div class="stock-fill ${barCls}" style="width:${pct}%"></div>
        </div>
        <span style="font-size:9px;color:var(--text3)">mín ${i.min_stock||2}${i.max_stock?' / máx '+i.max_stock:''}</span>
      </td>
      <td class="mono-sm">${UI.q(i.precio_costo||0)}</td>
      <td class="mono-sm text-amber">${UI.q(i.precio_venta||0)}</td>
      <td style="font-size:11px;color:var(--text3)">${i.ubicacion||'—'}</td>
      <td style="font-size:10px;color:var(--text3)">
        ${i.compat_marca||i.compat_modelo
          ? `${i.compat_marca||''} ${i.compat_modelo||''} ${i.compat_anio_ini||''}${i.compat_anio_fin&&i.compat_anio_fin!==i.compat_anio_ini?'-'+i.compat_anio_fin:''}`.trim()
          : '—'}
      </td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px;flex-wrap:wrap">
          <button class="btn btn-sm btn-cyan"   onclick="Pages.showQR('${i.id}')"                  title="QR">QR</button>
          <button class="btn btn-sm btn-ghost"  onclick="Pages.modalEditarProducto('${i.id}')"     title="Editar">✏️</button>
          <button class="btn btn-sm btn-ghost"  onclick="Pages.modalTraslado('${i.id}')"           title="Traslado">↗</button>
          <button class="btn btn-sm btn-danger" onclick="Pages.eliminarProducto('${i.id}','${i.nombre.replace(/'/g,'').slice(0,30)}')" title="Eliminar">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Inventario</h1>
        <p class="page-subtitle">// ${inv.length} PRODUCTOS · ${bajo.length} STOCK BAJO</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" onclick="Pages.modalMovimiento()">↕ Mov.</button>
        <button class="btn btn-ghost" onclick="Pages.modalCargaMasiva()">📥 CSV/Excel</button>
        <button class="btn btn-ghost" onclick="Pages.imprimirInventario()">🖨️</button>
        <button class="btn btn-amber" onclick="Pages.modalNuevoProducto()">＋ Producto</button>
      </div>
    </div>
    <div class="page-body">
      ${bajo.length > 0 ? `
      <div class="alert alert-red">
        <div class="alert-icon">🚨</div>
        <div>
          <div class="alert-title">Stock Bajo — ${bajo.length} producto${bajo.length>1?'s':''}</div>
          <div class="alert-body">${bajo.slice(0,5).map(i=>`<b>${i.nombre}</b> (${i.stock}/${i.min_stock||2})`).join(' · ')}${bajo.length>5?' y '+(bajo.length-5)+' más…':''}</div>
        </div>
      </div>` : ''}

      <div class="search-bar">
        <input class="search-input" id="search-inv"
               placeholder="🔍 Buscar nombre, código, OEM, marca, compatibilidad..."
               oninput="Pages.filterInv()">
        <select class="filter-select" id="filter-cat" onchange="Pages.filterInv()">
          <option value="">Todas las categorías</option>
          ${cats.map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
        <select class="filter-select" id="filter-stock" onchange="Pages.filterInv()">
          <option value="">Todo el stock</option>
          <option value="bajo">⚠️ Stock bajo</option>
          <option value="cero">🔴 Sin stock</option>
          <option value="ok">✅ Normal</option>
        </select>
        <select class="filter-select" id="filter-estado" onchange="Pages.filterInv()">
          <option value="">Todos los estados</option>
          <option value="nuevo">Nuevo</option>
          <option value="reconstruido">Reconstruido</option>
          <option value="usado">Usado</option>
        </select>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Código</th>
              <th>Categoría</th>
              <th>Stock</th>
              <th>P. Costo</th>
              <th>P. Venta</th>
              <th>Ubicación</th>
              <th>Compatibilidad</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="inv-tbody">
            ${rows||`<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:32px">
              Sin productos. <span class="text-amber" style="cursor:pointer" onclick="Pages.modalNuevoProducto()">Agregar primero →</span>
            </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
};

Pages.filterInv = function () {
  const q      = (document.getElementById('search-inv')?.value||'').toLowerCase();
  const cat    = document.getElementById('filter-cat')?.value||'';
  const stock  = document.getElementById('filter-stock')?.value||'';
  const estado = document.getElementById('filter-estado')?.value||'';
  const inv    = Pages._invData||[];

  document.querySelectorAll('#inv-tbody tr').forEach(r => {
    const text = r.dataset.text||'';
    const rcat = r.dataset.cat||'';
    const rest = r.dataset.estado||'';
    const item = inv.find(i => text.includes((i.codigo||'').toLowerCase()));

    let matchStock = true;
    if (stock && item) {
      if      (stock==='cero') matchStock = item.stock===0;
      else if (stock==='bajo') matchStock = item.stock>0 && item.stock<=(item.min_stock||2);
      else if (stock==='ok')   matchStock = item.stock>(item.min_stock||2);
    }

    const match = (!q||text.includes(q)) && (!cat||rcat===cat) &&
                  (!estado||rest===estado) && matchStock;
    r.style.display = match?'':'none';
  });
};

/* ── MODAL NUEVO PRODUCTO (todos los campos) ──────── */
Pages.modalNuevoProducto = function () {
  const CATS  = ['Motor','Transmisión','Frenos','Suspensión','Lubricantes','Filtros','Ignición','Líquidos','Eléctrico','Carrocería','Herramientas','Otros'];
  const UNIDS = [{v:'pieza',l:'Pieza'},{v:'litro',l:'Litro'},{v:'juego',l:'Juego'},{v:'metro',l:'Metro'},
                 {v:'kilogramo',l:'Kilogramo'},{v:'caja',l:'Caja'},{v:'par',l:'Par'},{v:'kit',l:'Kit'}];

  UI.openModal('Nuevo Producto', `
    <!-- SECCIÓN 1: Identificación -->
    <div style="font-weight:700;font-size:11px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">
      1. Identificación del Producto
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Código SKU *</label>
        <input class="form-input" id="np-cod" placeholder="REP-001">
      </div>
      <div class="form-group">
        <label class="form-label">Código de Barras</label>
        <input class="form-input" id="np-barras" placeholder="7501234567890">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Nombre del Repuesto *</label>
      <input class="form-input" id="np-nombre" placeholder="Ej. Filtro de aceite Toyota Corolla">
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <textarea class="form-input form-textarea" id="np-desc" rows="2"
                placeholder="Descripción detallada del repuesto..."></textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Número de Parte OEM</label>
        <input class="form-input" id="np-oem" placeholder="90915-YZZD4">
      </div>
      <div class="form-group">
        <label class="form-label">Marca del Repuesto</label>
        <input class="form-input" id="np-marca" placeholder="Bosch, ACDelco, NGK...">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Categoría</label>
        <select class="form-select" id="np-cat">
          ${CATS.map(c=>`<option>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Estado del Artículo</label>
        <select class="form-select" id="np-estado">
          <option value="nuevo">Nuevo</option>
          <option value="reconstruido">Reconstruido</option>
          <option value="usado">Usado</option>
        </select>
      </div>
    </div>

    <!-- SECCIÓN 2: Compatibilidad -->
    <div style="font-weight:700;font-size:11px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin:16px 0 10px;border-top:1px solid var(--border);padding-top:14px">
      2. Compatibilidad Vehicular
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Marca del Vehículo</label>
        <input class="form-input" id="np-cmarca" placeholder="Toyota, Nissan, Honda...">
      </div>
      <div class="form-group">
        <label class="form-label">Modelo del Vehículo</label>
        <input class="form-input" id="np-cmodelo" placeholder="Corolla, Versa, CRV...">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Año desde</label>
        <input class="form-input" id="np-canio-ini" type="number" min="1980" max="2030" placeholder="2018">
      </div>
      <div class="form-group">
        <label class="form-label">Año hasta</label>
        <input class="form-input" id="np-canio-fin" type="number" min="1980" max="2030" placeholder="2024">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Motorización Compatible</label>
      <input class="form-input" id="np-cmotor" placeholder="1.6L, 2.0L Diesel, 1.8T...">
    </div>

    <!-- SECCIÓN 3: Stock y Ubicación -->
    <div style="font-weight:700;font-size:11px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin:16px 0 10px;border-top:1px solid var(--border);padding-top:14px">
      3. Stock, Ubicación y Medida
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Stock Inicial</label>
        <input class="form-input" id="np-stock" type="number" min="0" placeholder="0">
      </div>
      <div class="form-group">
        <label class="form-label">Stock Mínimo (Punto de Reorden)</label>
        <input class="form-input" id="np-min" type="number" min="0" placeholder="2">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Stock Máximo</label>
        <input class="form-input" id="np-max" type="number" min="0" placeholder="50">
      </div>
      <div class="form-group">
        <label class="form-label">Unidad de Medida</label>
        <select class="form-select" id="np-unidad">
          ${UNIDS.map(u=>`<option value="${u.v}">${u.l}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Ubicación Física</label>
        <input class="form-input" id="np-ubic" placeholder="Pasillo A, Estante 3, Cajón 5">
      </div>
      <div class="form-group">
        <label class="form-label">Proveedor</label>
        <input class="form-input" id="np-prov" placeholder="Nombre del proveedor">
      </div>
    </div>

    <!-- SECCIÓN 4: Financiero -->
    <div style="font-weight:700;font-size:11px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin:16px 0 10px;border-top:1px solid var(--border);padding-top:14px">
      4. Precios
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Precio de Costo (Q)</label>
        <input class="form-input" id="np-costo" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label">Precio de Venta (Q)</label>
        <input class="form-input" id="np-venta" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
    </div>

    <!-- SECCIÓN 5: Adicional -->
    <div style="font-weight:700;font-size:11px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin:16px 0 10px;border-top:1px solid var(--border);padding-top:14px">
      5. Información Adicional
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Peso (kg)</label>
        <input class="form-input" id="np-peso" type="number" min="0" step="0.001" placeholder="0.000">
      </div>
      <div class="form-group">
        <label class="form-label">Volumen (cm³)</label>
        <input class="form-input" id="np-vol" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">URL de Imagen del Producto</label>
      <input class="form-input" id="np-img" type="url" placeholder="https://ejemplo.com/imagen.jpg">
      <div style="font-size:10px;color:var(--text3);margin-top:4px">URL pública de una imagen del producto</div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarProducto()">Guardar Producto</button>
    </div>
  `, 'modal-lg');
};

Pages.guardarProducto = async function () {
  const nombre = document.getElementById('np-nombre').value.trim();
  const cod    = document.getElementById('np-cod').value.trim();
  if (!nombre||!cod) { UI.toast('Código y nombre son obligatorios','error'); return; }

  const { error } = await DB.insertProducto({
    codigo:          cod,
    codigo_barras:   document.getElementById('np-barras').value.trim()||null,
    nombre,
    descripcion:     document.getElementById('np-desc').value.trim()||null,
    num_parte_oem:   document.getElementById('np-oem').value.trim()||null,
    marca:           document.getElementById('np-marca').value.trim()||null,
    categoria:       document.getElementById('np-cat').value,
    estado_articulo: document.getElementById('np-estado').value,
    compat_marca:    document.getElementById('np-cmarca').value.trim()||null,
    compat_modelo:   document.getElementById('np-cmodelo').value.trim()||null,
    compat_anio_ini: parseInt(document.getElementById('np-canio-ini').value)||null,
    compat_anio_fin: parseInt(document.getElementById('np-canio-fin').value)||null,
    compat_motor:    document.getElementById('np-cmotor').value.trim()||null,
    stock:           parseInt(document.getElementById('np-stock').value)||0,
    min_stock:       parseInt(document.getElementById('np-min').value)||2,
    max_stock:       parseInt(document.getElementById('np-max').value)||100,
    unidad_medida:   document.getElementById('np-unidad').value,
    ubicacion:       document.getElementById('np-ubic').value.trim()||null,
    proveedor:       document.getElementById('np-prov').value.trim()||null,
    precio_costo:    parseFloat(document.getElementById('np-costo').value)||0,
    precio_venta:    parseFloat(document.getElementById('np-venta').value)||0,
    peso_kg:         parseFloat(document.getElementById('np-peso').value)||null,
    volumen_cm3:     parseFloat(document.getElementById('np-vol').value)||null,
    imagen_url:      document.getElementById('np-img').value.trim()||null
  });

  if (error) { UI.toast('Error: '+error.message,'error'); return; }
  UI.closeModal();
  UI.toast('Producto guardado ✓');
  Pages.inventario();
};

/* ── MODAL EDITAR PRODUCTO (todos los campos) ─────── */
Pages.modalEditarProducto = function (id) {
  const inv  = Pages._invData||[];
  const item = inv.find(i=>i.id===id); if (!item) return;
  const CATS  = ['Motor','Transmisión','Frenos','Suspensión','Lubricantes','Filtros','Ignición','Líquidos','Eléctrico','Carrocería','Herramientas','Otros'];
  const UNIDS = [{v:'pieza',l:'Pieza'},{v:'litro',l:'Litro'},{v:'juego',l:'Juego'},{v:'metro',l:'Metro'},
                 {v:'kilogramo',l:'Kilogramo'},{v:'caja',l:'Caja'},{v:'par',l:'Par'},{v:'kit',l:'Kit'}];

  UI.openModal('✏️ Editar: '+item.nombre, `
    <div style="font-weight:700;font-size:11px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">1. Identificación</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Código SKU</label>
        <input class="form-input" id="ep2-cod" value="${item.codigo||''}"></div>
      <div class="form-group"><label class="form-label">Código de Barras</label>
        <input class="form-input" id="ep2-barras" value="${item.codigo_barras||''}"></div>
    </div>
    <div class="form-group"><label class="form-label">Nombre *</label>
      <input class="form-input" id="ep2-nombre" value="${item.nombre}"></div>
    <div class="form-group"><label class="form-label">Descripción</label>
      <textarea class="form-input form-textarea" id="ep2-desc" rows="2">${item.descripcion||''}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Número OEM</label>
        <input class="form-input" id="ep2-oem" value="${item.num_parte_oem||''}"></div>
      <div class="form-group"><label class="form-label">Marca</label>
        <input class="form-input" id="ep2-marca" value="${item.marca||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Categoría</label>
        <select class="form-select" id="ep2-cat">
          ${CATS.map(c=>`<option value="${c}" ${item.categoria===c?'selected':''}>${c}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Estado</label>
        <select class="form-select" id="ep2-estado">
          ${['nuevo','reconstruido','usado','defectuoso'].map(s=>`<option value="${s}" ${item.estado_articulo===s?'selected':''}>${s}</option>`).join('')}
        </select></div>
    </div>

    <div style="font-weight:700;font-size:11px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin:14px 0 10px;border-top:1px solid var(--border);padding-top:12px">2. Compatibilidad</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Marca Vehículo</label>
        <input class="form-input" id="ep2-cmarca" value="${item.compat_marca||''}"></div>
      <div class="form-group"><label class="form-label">Modelo Vehículo</label>
        <input class="form-input" id="ep2-cmodelo" value="${item.compat_modelo||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Año desde</label>
        <input class="form-input" id="ep2-canio-ini" type="number" value="${item.compat_anio_ini||''}"></div>
      <div class="form-group"><label class="form-label">Año hasta</label>
        <input class="form-input" id="ep2-canio-fin" type="number" value="${item.compat_anio_fin||''}"></div>
    </div>
    <div class="form-group"><label class="form-label">Motorización</label>
      <input class="form-input" id="ep2-cmotor" value="${item.compat_motor||''}"></div>

    <div style="font-weight:700;font-size:11px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin:14px 0 10px;border-top:1px solid var(--border);padding-top:12px">3. Stock</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Stock Actual</label>
        <input class="form-input" id="ep2-stock" type="number" min="0" value="${item.stock||0}"></div>
      <div class="form-group"><label class="form-label">Stock Mínimo</label>
        <input class="form-input" id="ep2-min" type="number" min="0" value="${item.min_stock||2}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Stock Máximo</label>
        <input class="form-input" id="ep2-max" type="number" min="0" value="${item.max_stock||100}"></div>
      <div class="form-group"><label class="form-label">Unidad de Medida</label>
        <select class="form-select" id="ep2-unidad">
          ${UNIDS.map(u=>`<option value="${u.v}" ${item.unidad_medida===u.v?'selected':''}>${u.l}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Ubicación Física</label>
        <input class="form-input" id="ep2-ubic" value="${item.ubicacion||''}"></div>
      <div class="form-group"><label class="form-label">Proveedor</label>
        <input class="form-input" id="ep2-prov" value="${item.proveedor||''}"></div>
    </div>

    <div style="font-weight:700;font-size:11px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin:14px 0 10px;border-top:1px solid var(--border);padding-top:12px">4. Precios</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Precio Costo (Q)</label>
        <input class="form-input" id="ep2-costo" type="number" step="0.01" value="${item.precio_costo||0}"></div>
      <div class="form-group"><label class="form-label">Precio Venta (Q)</label>
        <input class="form-input" id="ep2-venta" type="number" step="0.01" value="${item.precio_venta||0}"></div>
    </div>

    <div style="font-weight:700;font-size:11px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin:14px 0 10px;border-top:1px solid var(--border);padding-top:12px">5. Adicional</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Peso (kg)</label>
        <input class="form-input" id="ep2-peso" type="number" step="0.001" value="${item.peso_kg||''}"></div>
      <div class="form-group"><label class="form-label">Volumen (cm³)</label>
        <input class="form-input" id="ep2-vol" type="number" step="0.01" value="${item.volumen_cm3||''}"></div>
    </div>
    <div class="form-group"><label class="form-label">URL de Imagen</label>
      <input class="form-input" id="ep2-img" value="${item.imagen_url||''}" placeholder="https://...">
      ${item.imagen_url?`<img src="${item.imagen_url}" style="height:60px;margin-top:8px;border-radius:4px;border:1px solid var(--border)" onerror="this.style.display='none'">`:''}</div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.actualizarProducto('${id}')">Guardar Cambios</button>
    </div>
  `, 'modal-lg');
};

Pages.actualizarProducto = async function (id) {
  const nombre = document.getElementById('ep2-nombre').value.trim();
  if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }

  const { error } = await getSupabase().from('inventario').update({
    codigo:          document.getElementById('ep2-cod').value.trim()||null,
    codigo_barras:   document.getElementById('ep2-barras').value.trim()||null,
    nombre,
    descripcion:     document.getElementById('ep2-desc').value.trim()||null,
    num_parte_oem:   document.getElementById('ep2-oem').value.trim()||null,
    marca:           document.getElementById('ep2-marca').value.trim()||null,
    categoria:       document.getElementById('ep2-cat').value,
    estado_articulo: document.getElementById('ep2-estado').value,
    compat_marca:    document.getElementById('ep2-cmarca').value.trim()||null,
    compat_modelo:   document.getElementById('ep2-cmodelo').value.trim()||null,
    compat_anio_ini: parseInt(document.getElementById('ep2-canio-ini').value)||null,
    compat_anio_fin: parseInt(document.getElementById('ep2-canio-fin').value)||null,
    compat_motor:    document.getElementById('ep2-cmotor').value.trim()||null,
    stock:           parseInt(document.getElementById('ep2-stock').value)||0,
    min_stock:       parseInt(document.getElementById('ep2-min').value)||2,
    max_stock:       parseInt(document.getElementById('ep2-max').value)||100,
    unidad_medida:   document.getElementById('ep2-unidad').value,
    ubicacion:       document.getElementById('ep2-ubic').value.trim()||null,
    proveedor:       document.getElementById('ep2-prov').value.trim()||null,
    precio_costo:    parseFloat(document.getElementById('ep2-costo').value)||0,
    precio_venta:    parseFloat(document.getElementById('ep2-venta').value)||0,
    peso_kg:         parseFloat(document.getElementById('ep2-peso').value)||null,
    volumen_cm3:     parseFloat(document.getElementById('ep2-vol').value)||null,
    imagen_url:      document.getElementById('ep2-img').value.trim()||null,
    updated_at:      new Date().toISOString()
  }).eq('id', id);

  if (error) { UI.toast('Error: '+error.message,'error'); return; }
  UI.closeModal();
  UI.toast('Producto actualizado ✓');
  Pages.inventario();
};

/* ── QR ───────────────────────────────────────────── */
Pages.showQR = function (id) {
  const inv  = Pages._invData||[];
  const item = inv.find(i=>i.id===id); if (!item) return;

  UI.openModal('QR / Código de Barras: '+item.nombre, `
    <div style="text-align:center;padding:8px">
      ${item.imagen_url?`<img src="${item.imagen_url}" style="height:80px;margin-bottom:12px;border-radius:6px;border:1px solid var(--border)" onerror="this.style.display='none'">`:''}
      <div class="mono text-amber" style="font-size:18px;margin-bottom:2px">${item.codigo||'—'}</div>
      <div style="font-weight:700;margin-bottom:2px">${item.nombre}</div>
      ${item.num_parte_oem?`<div class="text-muted" style="font-size:11px">OEM: ${item.num_parte_oem}</div>`:''}
      <div class="text-muted" style="font-size:11px;margin-bottom:16px">
        ${item.marca||''} ${item.marca&&item.categoria?'·':''} ${item.categoria||''} · ${item.ubicacion||'Sin ubicación'}
      </div>
      <div style="display:inline-block;background:#fff;padding:16px;border-radius:8px;border:1px solid var(--border)">
        <canvas id="qr-canvas"></canvas>
      </div>
      <div class="modal-footer" style="justify-content:center;margin-top:16px">
        <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
        <button class="btn btn-amber" onclick="Pages._imprimirQR('${item.codigo}','${item.nombre.replace(/'/g,'')}','${item.ubicacion||''}',${item.stock},'${item.num_parte_oem||''}')">
          🖨️ Etiqueta
        </button>
      </div>
    </div>`
  );

  const generarQR = (intentos=0) => {
    const canvas = document.getElementById('qr-canvas');
    if (!canvas||typeof QRCode==='undefined') {
      if (intentos<15) setTimeout(()=>generarQR(intentos+1),150);
      return;
    }
    QRCode.toCanvas(canvas,
      `SKU:${item.codigo||item.id}|OEM:${item.num_parte_oem||''}|${item.nombre}`,
      {width:200,margin:2,color:{dark:'#000000',light:'#ffffff'}},
      err=>{if(err)console.error('QR Error:',err);}
    );
  };
  setTimeout(()=>generarQR(),180);
};

Pages._imprimirQR = function (codigo, nombre, ubicacion, stock, oem) {
  const canvas = document.getElementById('qr-canvas');
  const imgSrc = canvas?canvas.toDataURL():'';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}
  .etiqueta{border:2px solid #000;border-radius:8px;padding:16px;text-align:center;width:230px}
  .codigo{font-family:monospace;font-size:15px;font-weight:bold;color:#F59E0B;margin-bottom:2px}
  .nombre{font-size:12px;font-weight:bold;margin-bottom:4px}
  .info{font-size:10px;color:#666;margin-top:6px}
  @media print{body{margin:0}}</style></head>
  <body><div class="etiqueta">
    <div class="codigo">${codigo}</div>
    <div class="nombre">${nombre}</div>
    ${oem?`<div class="info">OEM: ${oem}</div>`:''}
    ${imgSrc?`<img src="${imgSrc}" width="180" height="180">`:''}
    <div class="info">Ubicación: ${ubicacion} · Stock: ${stock} uds</div>
    <div class="info" style="margin-top:4px;font-size:9px">TallerPro Enterprise</div>
  </div></body></html>`;
  const win=window.open('','_blank'); win.document.write(html); win.document.close(); setTimeout(()=>win.print(),400);
};

/* ── ELIMINAR ─────────────────────────────────────── */
Pages.eliminarProducto = function (id, nombre) {
  UI.confirm(`¿Eliminar <b>${nombre}</b> del inventario?`, async () => {
    await getSupabase().from('inventario').update({activo:false}).eq('id',id);
    UI.closeModal(); UI.toast('Producto eliminado'); Pages.inventario();
  });
};

/* ── TRASLADO ─────────────────────────────────────── */
Pages.modalTraslado = function (id) {
  const inv  = Pages._invData||[];
  const item = inv.find(i=>i.id===id); if (!item) return;

  UI.openModal('↗ Traslado: '+item.nombre, `
    <div class="detail-section mb-4">
      <div class="detail-section-header">Producto</div>
      <div class="detail-row"><div class="detail-key">Código</div><div class="detail-val mono-sm">${item.codigo||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">Ubicación actual</div><div class="detail-val">${item.ubicacion||'Sin ubicación'}</div></div>
      <div class="detail-row"><div class="detail-key">Stock</div><div class="detail-val mono-sm text-amber">${item.stock} ${item.unidad_medida||'uds'}</div></div>
    </div>
    <div class="form-group"><label class="form-label">Tipo de Movimiento</label>
      <select class="form-select" id="trl-tipo" onchange="Pages._toggleTipoTraslado(this.value)">
        <option value="bodega">📦 Traslado entre Bodegas</option>
        <option value="cliente">🚗 Envío a Cliente / OT</option>
        <option value="devolucion">↩ Devolución a Proveedor</option>
      </select>
    </div>
    <div id="trl-bodega">
      <div class="form-group"><label class="form-label">Nueva Ubicación</label>
        <input class="form-input" id="trl-destino" placeholder="Bodega 2 / Estante B-3">
      </div>
    </div>
    <div id="trl-cliente" class="hidden">
      <div class="form-group"><label class="form-label">OT o Referencia</label>
        <input class="form-input" id="trl-ot-ref" placeholder="OT-2025-0001">
      </div>
    </div>
    <div id="trl-devol" class="hidden">
      <div class="form-group"><label class="form-label">Motivo</label>
        <input class="form-input" id="trl-motivo" placeholder="Producto defectuoso...">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Cantidad *</label>
        <input class="form-input" id="trl-qty" type="number" min="1" max="${item.stock}" value="1">
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <input class="form-input" id="trl-notas" placeholder="Observaciones...">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.ejecutarTraslado('${id}','${item.ubicacion||''}')">Confirmar</button>
    </div>`
  );
};

Pages._toggleTipoTraslado = function (tipo) {
  ['bodega','cliente','devol'].forEach(t => {
    document.getElementById('trl-'+t)?.classList.add('hidden');
  });
  const map = {bodega:'bodega',cliente:'cliente',devolucion:'devol'};
  document.getElementById('trl-'+(map[tipo]||'bodega'))?.classList.remove('hidden');
};

Pages.ejecutarTraslado = async function (id, ubicActual) {
  const tipo  = document.getElementById('trl-tipo').value;
  const qty   = parseInt(document.getElementById('trl-qty').value)||0;
  const notas = document.getElementById('trl-notas').value.trim();
  if (qty<1) { UI.toast('Cantidad inválida','error'); return; }

  const inv  = Pages._invData||[];
  const item = inv.find(i=>i.id===id);
  if (item && qty>item.stock) { UI.toast('Stock insuficiente','error'); return; }

  let referencia = notas;
  if (tipo==='bodega') {
    const dest = document.getElementById('trl-destino').value.trim();
    if (!dest) { UI.toast('Indica la bodega destino','error'); return; }
    await getSupabase().from('inventario').update({ubicacion:dest}).eq('id',id);
    referencia = `Traslado de ${ubicActual||'bodega'} a ${dest}${notas?' — '+notas:''}`;
  } else {
    const otRef = document.getElementById('trl-ot-ref')?.value.trim()||
                  document.getElementById('trl-motivo')?.value.trim()||'';
    referencia = (tipo==='cliente'?'Envío cliente':'Devolución proveedor')+(otRef?' — '+otRef:'');
    await DB.updateStock(id, -qty, 'salida', referencia);
  }

  UI.closeModal();
  UI.toast(`${tipo==='bodega'?'Traslado':'Movimiento'} registrado ✓`);
  Pages.inventario();
};

/* ── ENTRADA / SALIDA ─────────────────────────────── */
Pages.modalMovimiento = async function () {
  const inv = Pages._invData||await DB.getInventario();
  UI.openModal('↕ Entrada / Salida', `
    <div class="form-group"><label class="form-label">Tipo</label>
      <select class="form-select" id="mov-tipo">
        <option value="entrada">📥 Entrada (Compra / Recepción)</option>
        <option value="salida">📤 Salida (Despacho / OT)</option>
        <option value="ajuste">⚖️ Ajuste</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Producto *</label>
      <select class="form-select" id="mov-prod">
        ${inv.map(i=>`<option value="${i.id}">${i.codigo||'—'} — ${i.nombre} (${i.stock} ${i.unidad_medida||'uds'})</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Cantidad *</label>
        <input class="form-input" id="mov-qty" type="number" min="1" value="1">
      </div>
      <div class="form-group"><label class="form-label">Referencia</label>
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
  const qty    = parseInt(document.getElementById('mov-qty').value)||0;
  const ref    = document.getElementById('mov-ref').value.trim();
  if (qty<1) { UI.toast('Cantidad inválida','error'); return; }
  const delta = tipo==='entrada'?qty:-qty;
  await DB.updateStock(prodId, delta, tipo, ref);
  UI.closeModal();
  UI.toast(`${tipo==='entrada'?'+':'−'}${qty} registrado`);
  Pages.inventario();
};

/* ── CARGA MASIVA ─────────────────────────────────── */
Pages.modalCargaMasiva = function () {
  UI.openModal('📥 Carga Masiva de Inventario', `
    <div class="alert alert-cyan mb-4">
      <div class="alert-icon">💡</div>
      <div>
        <div class="alert-title">Formato CSV</div>
        <div class="alert-body" style="font-family:'DM Mono',monospace;font-size:10px">
          codigo, nombre, categoria, marca, proveedor, ubicacion, stock, min_stock, precio_costo, precio_venta<br>
          (Columnas opcionales: codigo_barras, num_parte_oem, compat_marca, compat_modelo, max_stock)
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="border:2px dashed var(--border);border-radius:8px;padding:20px;text-align:center;cursor:pointer"
           onclick="document.getElementById('inv-csv-file').click()">
        <div style="font-size:28px;margin-bottom:8px">📄</div>
        <div style="font-weight:600;font-size:13px">CSV</div>
        <input type="file" id="inv-csv-file" accept=".csv,.txt" class="hidden"
               onchange="Pages.procesarCSVInventario(this,'csv')">
      </div>
      <div style="border:2px dashed var(--border);border-radius:8px;padding:20px;text-align:center;cursor:pointer"
           onclick="document.getElementById('inv-xls-file').click()">
        <div style="font-size:28px;margin-bottom:8px">📊</div>
        <div style="font-weight:600;font-size:13px">Excel (.xlsx)</div>
        <input type="file" id="inv-xls-file" accept=".xlsx,.xls" class="hidden"
               onchange="Pages.procesarCSVInventario(this,'excel')">
      </div>
    </div>
    <div class="form-group"><label class="form-label">
      <input type="checkbox" id="inv-actualizar" checked style="margin-right:8px">
      Actualizar productos existentes (mismo código)
    </label></div>
    <div id="inv-preview" class="hidden">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px" id="inv-preview-title">Vista Previa</div>
      <div class="table-wrap" style="max-height:280px;overflow-y:auto">
        <table class="data-table">
          <thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th>Stock</th><th>P.Costo</th><th>P.Venta</th><th>Estado</th></tr></thead>
          <tbody id="inv-preview-tbody"></tbody>
        </table>
      </div>
    </div>
    <div class="flex gap-2 mt-3">
      <button class="btn btn-ghost btn-sm" onclick="Pages.descargarPlantillaInv()">📥 Plantilla CSV</button>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" id="btn-importar-inv" disabled onclick="Pages.importarInventarioMasivo()">
        ⬆ Importar
      </button>
    </div>`
  );
  Pages._invImportData = [];
};

Pages.procesarCSVInventario = async function (input, tipo) {
  const file = input.files[0]; if (!file) return;
  UI.toast('Procesando...','info');
  let filas = [];

  if (tipo==='csv') {
    const text   = await file.text();
    const lines  = text.split('\n').map(l=>l.trim()).filter(Boolean);
    const header = lines[0].toLowerCase().split(',').map(h=>h.trim().replace(/"/g,''));
    const gc = (row,names)=>{
      for(const n of names){const idx=header.findIndex(h=>h.includes(n));if(idx>=0)return(row[idx]||'').replace(/"/g,'').trim();}
      return '';
    };
    for(let i=1;i<lines.length;i++){
      const cols=lines[i].split(',');
      const f={
        codigo:gc(cols,['codigo','sku']), nombre:gc(cols,['nombre']),
        categoria:gc(cols,['categoria'])||'Otros', marca:gc(cols,['marca']),
        proveedor:gc(cols,['proveedor']), ubicacion:gc(cols,['ubicacion']),
        stock:parseInt(gc(cols,['stock']))||0, min_stock:parseInt(gc(cols,['min_stock','minimo']))||2,
        max_stock:parseInt(gc(cols,['max_stock','maximo']))||100,
        precio_costo:parseFloat(gc(cols,['precio_costo','costo']))||0,
        precio_venta:parseFloat(gc(cols,['precio_venta','venta']))||0,
        codigo_barras:gc(cols,['barras','barcode']),
        num_parte_oem:gc(cols,['oem','parte']),
        compat_marca:gc(cols,['compat_marca']), compat_modelo:gc(cols,['compat_modelo'])
      };
      if(f.nombre)filas.push(f);
    }
  } else {
    const buf=await file.arrayBuffer();
    try{
      const XLSX=window.XLSX;
      if(!XLSX){UI.toast('Usa CSV en este entorno','warn');return;}
      const wb=XLSX.read(buf,{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws,{defval:''});
      filas=data.map(row=>({
        codigo:String(row.codigo||row.Codigo||'').trim(),
        nombre:String(row.nombre||row.Nombre||'').trim(),
        categoria:String(row.categoria||row.Categoria||'').trim()||'Otros',
        marca:String(row.marca||row.Marca||'').trim(),
        proveedor:String(row.proveedor||row.Proveedor||'').trim(),
        ubicacion:String(row.ubicacion||row.Ubicacion||'').trim(),
        stock:parseInt(row.stock||row.Stock||0)||0,
        min_stock:parseInt(row.min_stock||row.MinStock||2)||2,
        max_stock:parseInt(row.max_stock||row.MaxStock||100)||100,
        precio_costo:parseFloat(row.precio_costo||row.PrecioCosto||0)||0,
        precio_venta:parseFloat(row.precio_venta||row.PrecioVenta||0)||0,
        codigo_barras:String(row.codigo_barras||row.CodigoBarras||'').trim(),
        num_parte_oem:String(row.num_parte_oem||row.OEM||'').trim(),
        compat_marca:String(row.compat_marca||'').trim(),
        compat_modelo:String(row.compat_modelo||'').trim()
      })).filter(f=>f.nombre);
    }catch(e){UI.toast('Error Excel: '+e.message,'error');return;}
  }

  if(!filas.length){UI.toast('No se encontraron datos','error');return;}
  const inv=Pages._invData||await DB.getInventario();
  Pages._invImportData=filas;
  const tbody=document.getElementById('inv-preview-tbody');
  const preview=document.getElementById('inv-preview');
  if(tbody&&preview){
    preview.classList.remove('hidden');
    document.getElementById('inv-preview-title').textContent=`${filas.length} productos`;
    tbody.innerHTML=filas.map(f=>{
      const existe=inv.find(i=>i.codigo?.toLowerCase()===f.codigo?.toLowerCase());
      return`<tr>
        <td class="mono-sm">${f.codigo||'—'}</td><td>${f.nombre}</td>
        <td><span class="badge badge-gray">${f.categoria}</span></td>
        <td class="mono-sm">${f.stock}</td>
        <td class="mono-sm">${UI.q(f.precio_costo)}</td>
        <td class="mono-sm">${UI.q(f.precio_venta)}</td>
        <td>${existe?'<span class="badge badge-amber">Actualizar</span>':'<span class="badge badge-green">Nuevo</span>'}</td>
      </tr>`;
    }).join('');
  }
  const btn=document.getElementById('btn-importar-inv');
  if(btn)btn.disabled=false;
  UI.toast(`${filas.length} productos listos ✓`);
};

Pages.importarInventarioMasivo = async function () {
  const filas=Pages._invImportData||[];
  if(!filas.length){UI.toast('Sin datos','error');return;}
  const actualizar=document.getElementById('inv-actualizar')?.checked;
  const inv=Pages._invData||await DB.getInventario();
  let creados=0,actualizados=0,errores=0;
  UI.toast('Importando...','info');
  for(const f of filas){
    try{
      const existe=inv.find(i=>i.codigo?.toLowerCase()===f.codigo?.toLowerCase());
      if(existe&&actualizar){
        await getSupabase().from('inventario').update({...f,updated_at:new Date().toISOString()}).eq('id',existe.id);
        actualizados++;
      }else if(!existe){
        await DB.insertProducto(f); creados++;
      }
    }catch{errores++;}
  }
  UI.closeModal();
  UI.toast(`✓ ${creados} nuevos, ${actualizados} actualizados${errores?', '+errores+' errores':''}`);
  Pages.inventario();
};

Pages.descargarPlantillaInv = function () {
  const csv=['codigo,nombre,categoria,marca,proveedor,ubicacion,stock,min_stock,max_stock,precio_costo,precio_venta,num_parte_oem,compat_marca,compat_modelo',
    'REP-001,Aceite Motor 5W-30 1L,Lubricantes,Castrol,Lubricantes SA,Estante B-3,10,5,50,42.00,65.00,,Toyota,Corolla',
    'REP-002,Filtro de Aceite Universal,Filtros,Mann,Filtros CR,Estante A-4,8,4,40,28.00,45.00,90915-YZZD4,Toyota,'
  ].join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='plantilla_inventario_v2.csv';a.click();
  URL.revokeObjectURL(url);
};

Pages.imprimirInventario = async function () {
  const inv=Pages._invData||await DB.getInventario();
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Inventario</title>
  <style>body{font-family:Arial,sans-serif;font-size:10px;margin:20px}
  table{width:100%;border-collapse:collapse}
  th{background:#f3f4f6;padding:5px 6px;border:1px solid #ddd;text-align:left;font-size:9px}
  td{padding:4px 6px;border:1px solid #ddd}
  .header{border-bottom:2px solid #000;margin-bottom:12px;padding-bottom:6px;display:flex;justify-content:space-between}
  @media print{body{margin:0}}</style></head><body>
  <div class="header">
    <div><b>${Auth.tenant?.name} — Reporte de Inventario</b></div>
    <div>${new Date().toLocaleDateString('es-GT')} · ${inv.length} productos</div>
  </div>
  <table><thead><tr><th>Código</th><th>Nombre</th><th>Marca/OEM</th><th>Categoría</th><th>Stock</th><th>Mín</th><th>Máx</th><th>Ubicación</th><th>P.Costo</th><th>P.Venta</th><th>Compat.</th></tr></thead>
  <tbody>${inv.map(i=>`<tr>
    <td>${i.codigo||'—'}</td><td>${i.nombre}</td>
    <td>${i.marca||''} ${i.num_parte_oem?'OEM:'+i.num_parte_oem:''}</td>
    <td>${i.categoria||'—'}</td>
    <td style="${i.stock<=(i.min_stock||2)?'color:red;font-weight:bold':''}">${i.stock}</td>
    <td>${i.min_stock||2}</td><td>${i.max_stock||100}</td>
    <td>${i.ubicacion||'—'}</td>
    <td>Q${(i.precio_costo||0).toFixed(2)}</td><td>Q${(i.precio_venta||0).toFixed(2)}</td>
    <td style="font-size:9px">${[i.compat_marca,i.compat_modelo,i.compat_anio_ini,i.compat_anio_fin?'-'+i.compat_anio_fin:''].filter(Boolean).join(' ')}</td>
  </tr>`).join('')}</tbody></table></body></html>`;
  const win=window.open('','_blank');win.document.write(html);win.document.close();setTimeout(()=>win.print(),400);
};
