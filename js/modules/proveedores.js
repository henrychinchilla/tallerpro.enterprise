/* ═══════════════════════════════════════════════════════
   modules/proveedores.js — Proveedores y Recepciones
   TallerPro Enterprise v2.0

   Funciones:
   - CRUD de proveedores
   - Recepciones de mercadería (manual y CSV masivo)
   - Actualización automática de stock e inventario
   - Generación de QR por producto
═══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   MÓDULO PROVEEDORES
══════════════════════════════════════════════════════ */

Pages.proveedores = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Proveedores</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const [proveedores, entradas] = await Promise.all([
    DB.getProveedores(),
    DB.getEntradas()
  ]);
  Pages._proveedoresData = proveedores;

  const CATS = ['Repuestos','Lubricantes','Filtros','Herramientas','Insumos','Eléctrico','Carrocería','Otros'];

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Proveedores</h1>
        <p class="page-subtitle">// ${proveedores.length} PROVEEDORES · ${entradas.length} RECEPCIONES</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" onclick="Pages.verEntradas()">📦 Recepciones</button>
        <button class="btn btn-ghost" onclick="Pages.modalNuevaEntrada()">＋ Recepción</button>
        <button class="btn btn-amber" onclick="Pages.modalNuevoProveedor()">＋ Proveedor</button>
      </div>
    </div>
    <div class="page-body">
      <div class="search-bar">
        <input class="search-input" id="search-prov" placeholder="🔍 Buscar proveedor, categoría, NIT..."
               oninput="Pages.filterProveedores()">
        <select class="filter-select" id="filter-prov-cat" onchange="Pages.filterProveedores()">
          <option value="">Todas las categorías</option>
          ${CATS.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select class="filter-select" id="filter-prov-cred" onchange="Pages.filterProveedores()">
          <option value="">Todos</option>
          <option value="credito">Con crédito</option>
          <option value="contado">Contado</option>
        </select>
      </div>

      ${proveedores.length === 0 ? `
        <div class="card" style="text-align:center;padding:48px">
          <div style="font-size:40px;margin-bottom:16px">🏪</div>
          <div style="font-weight:700;font-size:16px;color:var(--text);margin-bottom:8px">Sin proveedores registrados</div>
          <div class="text-muted mb-4">Agrega tus proveedores para gestionar recepciones de mercadería.</div>
          <div style="display:flex;gap:10px;justify-content:center">
            <button class="btn btn-ghost" onclick="Pages.modalImportarProveedores()">📥 Importar CSV</button>
            <button class="btn btn-amber" onclick="Pages.modalNuevoProveedor()">＋ Agregar Proveedor</button>
          </div>
        </div>` : `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Código</th><th>Proveedor</th><th>Contacto</th><th>Teléfono</th><th>NIT</th><th>Categoría</th><th>Crédito</th><th></th></tr>
          </thead>
          <tbody id="prov-tbody">
            ${proveedores.map(p => `
            <tr data-text="${p.nombre} ${p.nit||''} ${p.categoria||''} ${p.contacto||''} ${p.email||''}"
                data-cat="${p.categoria||''}"
                data-credito="${p.credito_dias||0}"
                onclick="Pages.verProveedor('${p.id}')">
              <td class="mono-sm text-cyan">${p.codigo||'—'}</td>
              <td><b>${p.nombre}</b><br>
                  <span class="text-muted" style="font-size:11px">${p.email||''}</span></td>
              <td>${p.contacto||'—'}</td>
              <td>${p.telefono||'—'}</td>
              <td class="mono-sm">${p.nit||'—'}</td>
              <td><span class="badge badge-gray">${p.categoria||'—'}</span></td>
              <td class="mono-sm">${p.credito_dias ? p.credito_dias + ' días' : 'Contado'}</td>
              <td onclick="event.stopPropagation()">
                <div style="display:flex;gap:4px">
                  <button class="btn btn-sm btn-ghost" onclick="Pages.verProveedor('${p.id}')">Ver</button>
                  <button class="btn btn-sm btn-cyan" onclick="Pages.modalEditarProveedor('${p.id}')">✏️</button>
                  <button class="btn btn-sm btn-ghost" onclick="Pages.modalNuevaEntrada('${p.id}')">＋ Recibir</button>
                  <button class="btn btn-sm btn-danger" onclick="Pages.eliminarProveedor('${p.id}','${p.nombre.replace(/'/g,'')}')">🗑</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>`;
};

Pages.filterProveedores = function () {
  const q    = (document.getElementById('search-prov')?.value || '').toLowerCase();
  const cat  = document.getElementById('filter-prov-cat')?.value || '';
  const cred = document.getElementById('filter-prov-cred')?.value || '';
  document.querySelectorAll('#prov-tbody tr').forEach(r => {
    const matchQ    = !q   || (r.dataset.text||'').toLowerCase().includes(q);
    const matchCat  = !cat || r.dataset.cat === cat;
    const matchCred = !cred || (cred === 'credito' ? r.dataset.credito !== '0' : r.dataset.credito === '0');
    r.style.display = matchQ && matchCat && matchCred ? '' : 'none';
  });
};

Pages.verProveedor = async function (id) {
  const p = (Pages._proveedoresData||[]).find(x => x.id === id);
  if (!p) return;
  const entradas = await DB.getEntradasByProveedor(id);
  const totalCompras = entradas.reduce((s, e) => s + (e.total||0), 0);

  UI.openModal('Proveedor: ' + p.nombre, `
    <div class="grid-2 mb-4">
      <div class="detail-section">
        <div class="detail-section-header">Información</div>
        <div class="detail-row"><div class="detail-key">Código</div><div class="detail-val mono-sm">${p.codigo||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">Nombre</div><div class="detail-val">${p.nombre}</div></div>
        <div class="detail-row"><div class="detail-key">Contacto</div><div class="detail-val">${p.contacto||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">Teléfono</div><div class="detail-val">${p.telefono||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">Email</div><div class="detail-val">${p.email||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">NIT</div><div class="detail-val mono-sm">${p.nit||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">Dirección</div><div class="detail-val">${p.direccion||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">Categoría</div><div class="detail-val">${p.categoria||'—'}</div></div>
      </div>
      <div class="detail-section">
        <div class="detail-section-header">Condiciones Comerciales</div>
        <div class="detail-row"><div class="detail-key">Crédito</div><div class="detail-val">${p.credito_dias ? p.credito_dias + ' días' : 'Contado'}</div></div>
        <div class="detail-row"><div class="detail-key">Límite Crédito</div><div class="detail-val mono-sm">${UI.q(p.limite_credito||0)}</div></div>
        <div class="detail-row"><div class="detail-key">Total Compras</div><div class="detail-val mono-sm text-amber">${UI.q(totalCompras)}</div></div>
        <div class="detail-row"><div class="detail-key">Recepciones</div><div class="detail-val">${entradas.length}</div></div>
        ${p.notas ? `<div class="detail-row"><div class="detail-key">Notas</div><div class="detail-val">${p.notas}</div></div>` : ''}
      </div>
    </div>

    <div style="font-weight:700;font-size:13px;margin-bottom:10px">📦 Últimas Recepciones</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Fecha</th><th>No. Factura</th><th>Total</th><th>Estado</th></tr></thead>
        <tbody>
          ${entradas.slice(0,5).map(e => `<tr>
            <td class="mono-sm">${e.fecha}</td>
            <td class="mono-sm">${e.num_factura||'—'}</td>
            <td class="mono-sm text-amber">${UI.q(e.total)}</td>
            <td>${e.estado === 'recibida' ? '<span class="badge badge-green">Recibida</span>' : '<span class="badge badge-gray">'+e.estado+'</span>'}</td>
          </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px">Sin recepciones</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-ghost" onclick="Pages.modalEditarProveedor('${p.id}')">✏️ Editar</button>
      <button class="btn btn-amber" onclick="UI.closeModal();Pages.modalNuevaEntrada('${p.id}')">＋ Nueva Recepción</button>
    </div>
  `, 'modal-lg');
};

Pages.modalNuevoProveedor = function () {
  const CATS = ['Repuestos','Lubricantes','Filtros','Herramientas','Insumos','Eléctrico','Carrocería','Otros'];
  UI.openModal('Nuevo Proveedor', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-input" id="np2-nombre" placeholder="Importadora de Repuestos GT">
      </div>
      <div class="form-group">
        <label class="form-label">Código Interno</label>
        <input class="form-input" id="np2-codigo" placeholder="PROV-001">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Categoría</label>
        <select class="form-select" id="np2-cat">
          <option value="">Seleccionar...</option>
          ${CATS.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">NIT</label>
        <input class="form-input" id="np2-nit" placeholder="1234567-8">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nombre del Contacto</label>
        <input class="form-input" id="np2-contacto" placeholder="Juan Pérez">
      </div>
      <div class="form-group">
        <label class="form-label">Teléfono</label>
        <input class="form-input" id="np2-tel" placeholder="2456-7890">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="np2-email" type="email" placeholder="ventas@proveedor.gt">
      </div>
      <div class="form-group">
        <label class="form-label">País</label>
        <input class="form-input" id="np2-pais" value="Guatemala">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Dirección</label>
      <input class="form-input" id="np2-dir" placeholder="Zona 12, Guatemala">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Días de Crédito</label>
        <input class="form-input" id="np2-credito" type="number" min="0" value="0"
               placeholder="0 = Contado">
      </div>
      <div class="form-group">
        <label class="form-label">Límite de Crédito (Q)</label>
        <input class="form-input" id="np2-limite" type="number" min="0" value="0" placeholder="0.00">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-input form-textarea" id="np2-notas" rows="2"
                placeholder="Condiciones especiales, observaciones..."></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarProveedor()">Guardar Proveedor</button>
    </div>`
  );
};

Pages.guardarProveedor = async function () {
  const nombre = document.getElementById('np2-nombre').value.trim();
  if (!nombre) { UI.toast('El nombre es obligatorio', 'error'); return; }

  const { error } = await DB.insertProveedor({
    nombre,
    codigo:        document.getElementById('np2-codigo').value.trim() || null,
    categoria:     document.getElementById('np2-cat').value || null,
    nit:           document.getElementById('np2-nit').value.trim() || null,
    contacto:      document.getElementById('np2-contacto').value.trim() || null,
    telefono:      document.getElementById('np2-tel').value.trim() || null,
    email:         document.getElementById('np2-email').value.trim() || null,
    pais:          document.getElementById('np2-pais').value.trim() || 'Guatemala',
    direccion:     document.getElementById('np2-dir').value.trim() || null,
    credito_dias:  parseInt(document.getElementById('np2-credito').value) || 0,
    limite_credito:parseFloat(document.getElementById('np2-limite').value) || 0,
    notas:         document.getElementById('np2-notas').value.trim() || null
  });

  if (error) {
    const msg = error.message || 'Error desconocido';
    UI.toast('Error al guardar: ' + msg, 'error');
    console.error('guardarProveedor:', error);
    return;
  }
  UI.closeModal();
  UI.toast('Proveedor guardado ✓');
  Pages.proveedores();
};

Pages.modalEditarProveedor = async function (id) {
  const p = (Pages._proveedoresData||[]).find(x => x.id === id);
  if (!p) return;
  const CATS = ['Repuestos','Lubricantes','Filtros','Herramientas','Insumos','Eléctrico','Carrocería','Otros'];

  UI.openModal('Editar: ' + p.nombre, `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-input" id="ep-nombre" value="${p.nombre}">
      </div>
      <div class="form-group">
        <label class="form-label">Código</label>
        <input class="form-input" id="ep-codigo" value="${p.codigo||''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Categoría</label>
        <select class="form-select" id="ep-cat">
          ${CATS.map(c => `<option value="${c}" ${p.categoria===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">NIT</label>
        <input class="form-input" id="ep-nit" value="${p.nit||''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Contacto</label>
        <input class="form-input" id="ep-contacto" value="${p.contacto||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Teléfono</label>
        <input class="form-input" id="ep-tel" value="${p.telefono||''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Días de Crédito</label>
        <input class="form-input" id="ep-credito" type="number" value="${p.credito_dias||0}">
      </div>
      <div class="form-group">
        <label class="form-label">Límite de Crédito (Q)</label>
        <input class="form-input" id="ep-limite" type="number" value="${p.limite_credito||0}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-input form-textarea" id="ep-notas" rows="2">${p.notas||''}</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.actualizarProveedor('${id}')">Guardar Cambios</button>
    </div>`
  );
};

Pages.actualizarProveedor = async function (id) {
  const nombre = document.getElementById('ep-nombre').value.trim();
  if (!nombre) { UI.toast('El nombre es obligatorio', 'error'); return; }

  const ok = await DB.updateProveedor(id, {
    nombre,
    codigo:        document.getElementById('ep-codigo').value.trim() || null,
    categoria:     document.getElementById('ep-cat').value || null,
    nit:           document.getElementById('ep-nit').value.trim() || null,
    contacto:      document.getElementById('ep-contacto').value.trim() || null,
    telefono:      document.getElementById('ep-tel').value.trim() || null,
    credito_dias:  parseInt(document.getElementById('ep-credito').value) || 0,
    limite_credito:parseFloat(document.getElementById('ep-limite').value) || 0,
    notas:         document.getElementById('ep-notas').value.trim() || null
  });

  if (!ok) { UI.toast('Error al actualizar', 'error'); return; }
  UI.closeModal();
  UI.toast('Proveedor actualizado ✓');
  Pages.proveedores();
};

/* ══════════════════════════════════════════════════════
   RECEPCIONES DE MERCADERÍA
══════════════════════════════════════════════════════ */

Pages.verEntradas = async function () {
  const entradas = await DB.getEntradas();
  const proveedores = Pages._proveedoresData || await DB.getProveedores();

  UI.openModal('Historial de Recepciones', `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Fecha</th><th>Proveedor</th><th>No. Factura</th><th>Total</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${entradas.map(e => {
            const p = proveedores.find(x => x.id === e.proveedor_id);
            return `<tr>
              <td class="mono-sm">${e.fecha}</td>
              <td>${p?.nombre||'—'}</td>
              <td class="mono-sm">${e.num_factura||'—'}</td>
              <td class="mono-sm text-amber">${UI.q(e.total)}</td>
              <td>${e.estado==='recibida'?'<span class="badge badge-green">Recibida</span>':'<span class="badge badge-gray">'+e.estado+'</span>'}</td>
              <td><button class="btn btn-sm btn-ghost" onclick="Pages.verDetalleEntrada('${e.id}')">Ver</button></td>
            </tr>`;
          }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">Sin recepciones</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-amber" onclick="UI.closeModal();Pages.modalNuevaEntrada()">＋ Nueva Recepción</button>
    </div>
  `, 'modal-lg');
};

Pages.modalNuevaEntrada = async function (proveedorPreId = '') {
  const [proveedores, inventario] = await Promise.all([
    DB.getProveedores(),
    DB.getInventario()
  ]);

  UI.openModal('Nueva Recepción de Mercadería', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Proveedor</label>
        <select class="form-select" id="ne3-prov">
          <option value="">Sin proveedor específico</option>
          ${proveedores.map(p => `<option value="${p.id}" ${p.id===proveedorPreId?'selected':''}>${p.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de Recepción</label>
        <input class="form-input" id="ne3-fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">No. Factura del Proveedor</label>
        <input class="form-input" id="ne3-factura" placeholder="FAC-2025-001234">
      </div>
      <div class="form-group">
        <label class="form-label">Notas</label>
        <input class="form-input" id="ne3-notas" placeholder="Observaciones de la recepción">
      </div>
    </div>

    <!-- Tabs: Manual o CSV -->
    <div style="display:flex;gap:4px;margin:16px 0 12px;border-bottom:1px solid var(--border)">
      <button onclick="Pages._entradaTab('manual')" id="etab-manual"
        style="padding:8px 16px;border:none;background:none;cursor:pointer;font-family:'Manrope',sans-serif;
               font-size:13px;font-weight:600;border-bottom:2px solid var(--amber);color:var(--amber)">
        ✏️ Manual
      </button>
      <button onclick="Pages._entradaTab('csv')" id="etab-csv"
        style="padding:8px 16px;border:none;background:none;cursor:pointer;font-family:'Manrope',sans-serif;
               font-size:13px;font-weight:600;border-bottom:2px solid transparent;color:var(--text2)">
        📥 Importar CSV
      </button>
    </div>

    <!-- TAB MANUAL -->
    <div id="entrada-manual">
      <div style="margin-bottom:8px;display:flex;justify-content:flex-end">
        <button class="btn btn-sm btn-cyan" onclick="Pages._agregarLineaEntrada()">＋ Agregar línea</button>
      </div>
      <div class="table-wrap" style="margin-bottom:12px">
        <table class="data-table" id="tabla-entrada">
          <thead>
            <tr>
              <th>Producto</th>
              <th style="width:80px">Cant.</th>
              <th style="width:110px">P. Costo (Q)</th>
              <th style="width:110px">P. Venta (Q)</th>
              <th style="width:80px">Subtotal</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="lineas-entrada">
            <!-- líneas dinámicas -->
          </tbody>
          <tfoot>
            <tr style="background:var(--surface2)">
              <td colspan="4" style="text-align:right;font-weight:700;padding:10px 16px">TOTAL:</td>
              <td class="mono-sm text-amber" id="entrada-total" style="padding:10px 16px">Q0.00</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- TAB CSV -->
    <div id="entrada-csv" class="hidden">
      <div class="alert alert-cyan mb-4">
        <div class="alert-icon">💡</div>
        <div>
          <div class="alert-title">Formato CSV requerido</div>
          <div class="alert-body" style="font-family:'DM Mono',monospace;font-size:11px">
            codigo,nombre,cantidad,precio_costo,precio_venta<br>
            REP-001,Aceite 5W-30,10,42.00,65.00<br>
            REP-002,Filtro de Aceite,5,28.00,45.00
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Archivo CSV</label>
        <input type="file" id="csv-file" accept=".csv,.txt"
               class="form-input" onchange="Pages.procesarCSV(this)">
      </div>
      <div id="csv-preview" class="hidden">
        <div style="font-weight:700;font-size:13px;margin-bottom:8px">Vista Previa</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Cant.</th><th>P. Costo</th><th>P. Venta</th><th>Subtotal</th></tr></thead>
            <tbody id="csv-tbody"></tbody>
          </table>
        </div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label">¿No tienes el archivo? Descarga la plantilla:</label>
        <button class="btn btn-ghost btn-sm" onclick="Pages.descargarPlantillaCSV()">
          📥 Descargar Plantilla CSV
        </button>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarEntrada()">Confirmar Recepción</button>
    </div>
  `, 'modal-lg');

  // Inicializar con productos del inventario
  Pages._inventarioParaEntrada = inventario;
  Pages._lineasEntrada = [];
  Pages._csvLineas = [];
  Pages._entradaTabActivo = 'manual';
  Pages._agregarLineaEntrada(); // Primera línea vacía
};

Pages._entradaTab = function (tab) {
  Pages._entradaTabActivo = tab;
  document.getElementById('entrada-manual').classList.toggle('hidden', tab !== 'manual');
  document.getElementById('entrada-csv').classList.toggle('hidden', tab !== 'csv');

  ['manual','csv'].forEach(t => {
    const btn = document.getElementById('etab-' + t);
    if (btn) {
      btn.style.borderBottomColor = t === tab ? 'var(--amber)' : 'transparent';
      btn.style.color = t === tab ? 'var(--amber)' : 'var(--text2)';
    }
  });
};

Pages._lineaIdx = 0;
Pages._agregarLineaEntrada = function () {
  const idx = Pages._lineaIdx++;
  const inv = Pages._inventarioParaEntrada || [];
  const opts = `<option value="">Nuevo producto...</option>` +
    inv.map(i => `<option value="${i.id}" data-costo="${i.precio_costo}" data-venta="${i.precio_venta}" data-nombre="${i.nombre}">${i.codigo} — ${i.nombre}</option>`).join('');

  const row = document.createElement('tr');
  row.id = `linea-${idx}`;
  row.innerHTML = `
    <td style="padding:6px 8px">
      <select class="form-select" id="l-prod-${idx}" onchange="Pages._onSelectProducto(${idx})" style="font-size:12px;padding:6px 8px">
        ${opts}
      </select>
      <input class="form-input" id="l-nombre-${idx}" placeholder="Nombre del producto"
             style="font-size:12px;padding:6px 8px;margin-top:4px">
    </td>
    <td style="padding:6px 8px">
      <input class="form-input" id="l-qty-${idx}" type="number" min="1" value="1"
             style="font-size:12px;padding:6px 8px" oninput="Pages._recalcLinea(${idx})">
    </td>
    <td style="padding:6px 8px">
      <input class="form-input" id="l-costo-${idx}" type="number" min="0" step="0.01" value="0.00"
             style="font-size:12px;padding:6px 8px" oninput="Pages._recalcLinea(${idx})">
    </td>
    <td style="padding:6px 8px">
      <input class="form-input" id="l-venta-${idx}" type="number" min="0" step="0.01" value="0.00"
             style="font-size:12px;padding:6px 8px">
    </td>
    <td class="mono-sm text-amber" id="l-sub-${idx}" style="padding:6px 16px">Q0.00</td>
    <td style="padding:6px 8px">
      <button class="btn btn-sm btn-danger" onclick="document.getElementById('linea-${idx}').remove();Pages._recalcTotal()">✕</button>
    </td>`;
  document.getElementById('lineas-entrada')?.appendChild(row);
};

Pages._onSelectProducto = function (idx) {
  const sel = document.getElementById(`l-prod-${idx}`);
  const opt = sel.options[sel.selectedIndex];
  if (opt?.value) {
    document.getElementById(`l-nombre-${idx}`).value   = opt.dataset.nombre || '';
    document.getElementById(`l-costo-${idx}`).value    = parseFloat(opt.dataset.costo||0).toFixed(2);
    document.getElementById(`l-venta-${idx}`).value    = parseFloat(opt.dataset.venta||0).toFixed(2);
  }
  Pages._recalcLinea(idx);
};

Pages._recalcLinea = function (idx) {
  const qty   = parseFloat(document.getElementById(`l-qty-${idx}`)?.value || 0);
  const costo = parseFloat(document.getElementById(`l-costo-${idx}`)?.value || 0);
  const sub   = qty * costo;
  const el    = document.getElementById(`l-sub-${idx}`);
  if (el) el.textContent = UI.q(sub);
  Pages._recalcTotal();
};

Pages._recalcTotal = function () {
  let total = 0;
  document.querySelectorAll('[id^="l-sub-"]').forEach(el => {
    total += parseFloat(el.textContent.replace('Q','').replace(',','')) || 0;
  });
  const tel = document.getElementById('entrada-total');
  if (tel) tel.textContent = UI.q(total);
};

Pages.procesarCSV = function (input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.split('\n').filter(l => l.trim());
    const header = lines[0].toLowerCase().split(',').map(h => h.trim());
    const filas  = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length < 3) continue;
      const fila = {
        codigo:       cols[header.indexOf('codigo')]         || '',
        nombre:       cols[header.indexOf('nombre')]         || '',
        cantidad:     parseInt(cols[header.indexOf('cantidad')])    || 1,
        precio_costo: parseFloat(cols[header.indexOf('precio_costo')]) || 0,
        precio_venta: parseFloat(cols[header.indexOf('precio_venta')]) || 0
      };
      if (fila.nombre) filas.push(fila);
    }

    Pages._csvLineas = filas;
    const tbody = document.getElementById('csv-tbody');
    const preview = document.getElementById('csv-preview');
    if (tbody && preview) {
      preview.classList.remove('hidden');
      tbody.innerHTML = filas.map(f => `<tr>
        <td class="mono-sm">${f.codigo}</td>
        <td>${f.nombre}</td>
        <td class="mono-sm">${f.cantidad}</td>
        <td class="mono-sm">${UI.q(f.precio_costo)}</td>
        <td class="mono-sm">${UI.q(f.precio_venta)}</td>
        <td class="mono-sm text-amber">${UI.q(f.cantidad * f.precio_costo)}</td>
      </tr>`).join('');
    }
    UI.toast(`${filas.length} productos cargados del CSV ✓`);
  };
  reader.readAsText(file);
};

Pages.descargarPlantillaCSV = function () {
  const csv = 'codigo,nombre,cantidad,precio_costo,precio_venta\nREP-001,Aceite Motor 5W-30 1L,10,42.00,65.00\nREP-002,Filtro de Aceite Universal,5,28.00,45.00\nREP-003,Bujías NGK Iridium,8,38.00,65.00';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'plantilla_entrada_inventario.csv';
  a.click();
  URL.revokeObjectURL(url);
};

Pages.guardarEntrada = async function () {
  const proveedorId = document.getElementById('ne3-prov')?.value || null;
  const fecha       = document.getElementById('ne3-fecha')?.value;
  const numFactura  = document.getElementById('ne3-factura')?.value.trim() || null;
  const notas       = document.getElementById('ne3-notas')?.value.trim() || null;
  const esCSV       = Pages._entradaTabActivo === 'csv';

  // Recopilar líneas
  let lineas = [];

  if (esCSV) {
    lineas = Pages._csvLineas || [];
    if (lineas.length === 0) { UI.toast('Carga un archivo CSV primero', 'error'); return; }
  } else {
    // Líneas manuales
    document.querySelectorAll('[id^="l-qty-"]').forEach(el => {
      const idx   = el.id.replace('l-qty-', '');
      const prod  = document.getElementById(`l-prod-${idx}`)?.value || null;
      const nombre= document.getElementById(`l-nombre-${idx}`)?.value.trim();
      const qty   = parseInt(el.value) || 0;
      const costo = parseFloat(document.getElementById(`l-costo-${idx}`)?.value) || 0;
      const venta = parseFloat(document.getElementById(`l-venta-${idx}`)?.value) || 0;
      if (nombre && qty > 0) {
        lineas.push({ repuesto_id: prod||null, nombre, cantidad: qty, precio_costo: costo, precio_venta: venta });
      }
    });
    if (lineas.length === 0) { UI.toast('Agrega al menos un producto', 'error'); return; }
  }

  const total = lineas.reduce((s, l) => s + (l.cantidad * l.precio_costo), 0);

  UI.toast('Guardando recepción...', 'info');

  try {
    // Crear entrada
    const { data: entrada, error } = await DB.insertEntrada({
      proveedor_id: proveedorId,
      fecha,
      num_factura:  numFactura,
      total:        parseFloat(total.toFixed(2)),
      notas,
      estado:       'recibida'
    });
    if (error) throw new Error(error.message);

    // Guardar detalle y actualizar stock
    let productosNuevos = 0, productosActualizados = 0;

    for (const linea of lineas) {
      let repuestoId = linea.repuesto_id;

      // Si es producto nuevo (CSV sin ID o sin selección), crearlo
      if (!repuestoId) {
        const inv = Pages._inventarioParaEntrada || [];
        const existente = inv.find(i =>
          linea.codigo && i.codigo?.toLowerCase() === linea.codigo.toLowerCase()
        );

        if (existente) {
          repuestoId = existente.id;
        } else {
          // Crear nuevo producto
          const { data: newProd } = await DB.insertProducto({
            codigo:       linea.codigo || 'AUTO-' + Date.now(),
            nombre:       linea.nombre,
            precio_costo: linea.precio_costo,
            precio_venta: linea.precio_venta || linea.precio_costo * 1.4,
            stock:        0,
            min_stock:    2,
            proveedor_id: proveedorId
          });
          repuestoId = newProd?.id;
          productosNuevos++;
        }
      }

      // Insertar detalle
      await DB.insertEntradaDetalle({
        entrada_id:   entrada.id,
        repuesto_id:  repuestoId,
        codigo:       linea.codigo || null,
        nombre:       linea.nombre,
        cantidad:     linea.cantidad,
        precio_costo: linea.precio_costo,
        precio_venta: linea.precio_venta
      });

      // Actualizar stock
      if (repuestoId) {
        await DB.updateStock(repuestoId, linea.cantidad, 'entrada', numFactura || 'Recepción');
        // Actualizar precios si cambiaron
        if (linea.precio_costo > 0 || linea.precio_venta > 0) {
          await getSupabase()
            .from('inventario')
            .update({
              precio_costo: linea.precio_costo,
              precio_venta: linea.precio_venta || linea.precio_costo * 1.4
            })
            .eq('id', repuestoId);
        }
        productosActualizados++;
      }
    }

    // Registrar egreso automáticamente
    if (total > 0) {
      const prov = (Pages._proveedoresData||[]).find(p => p.id === proveedorId);
      await DB.insertEgreso({
        categoria:   'compra_inventario',
        concepto:    `Recepción mercadería${prov ? ' — ' + prov.nombre : ''}${numFactura ? ' Fact. ' + numFactura : ''}`,
        monto:       parseFloat(total.toFixed(2)),
        fecha,
        proveedor:   prov?.nombre || null,
        num_factura: numFactura,
        metodo_pago: 'transferencia',
        notas:       `${lineas.length} productos recibidos`
      });
    }

    UI.closeModal();
    UI.toast(`Recepción guardada ✓ — ${productosNuevos} nuevos, ${productosActualizados} actualizados`);
    Pages.proveedores();

  } catch (err) {
    UI.toast('Error: ' + err.message, 'error');
  }
};

Pages.verDetalleEntrada = async function (id) {
  const { data: detalles } = await getSupabase()
    .from('entradas_detalle')
    .select('*')
    .eq('entrada_id', id);

  const total = (detalles||[]).reduce((s, d) => s + (d.cantidad * d.precio_costo), 0);

  UI.openModal('Detalle de Recepción', `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Nombre</th><th>Código</th><th>Cant.</th><th>P. Costo</th><th>P. Venta</th><th>Subtotal</th></tr></thead>
        <tbody>
          ${(detalles||[]).map(d => `<tr>
            <td>${d.nombre}</td>
            <td class="mono-sm">${d.codigo||'—'}</td>
            <td class="mono-sm">${d.cantidad}</td>
            <td class="mono-sm">${UI.q(d.precio_costo)}</td>
            <td class="mono-sm">${UI.q(d.precio_venta)}</td>
            <td class="mono-sm text-amber">${UI.q(d.cantidad * d.precio_costo)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr style="background:var(--surface2);font-weight:700">
            <td colspan="5" style="text-align:right;padding:10px 16px">TOTAL:</td>
            <td class="mono-sm text-amber" style="padding:10px 16px">${UI.q(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
    </div>
  `, 'modal-lg');
};

/* ── ELIMINAR PROVEEDOR ───────────────────────────── */
Pages.eliminarProveedor = function (id, nombre) {
  UI.confirm(`¿Eliminar al proveedor <b>${nombre}</b>? Esta acción no se puede deshacer.`, async () => {
    const { error } = await getSupabase().from('proveedores')
      .update({ activo: false }).eq('id', id);
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.closeModal();
    UI.toast('Proveedor eliminado');
    Pages.proveedores();
  });
};
