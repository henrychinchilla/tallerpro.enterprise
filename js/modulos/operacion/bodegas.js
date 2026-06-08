/* TallerPro v3.0 — bodegas/index.js */
Modulos.bodegas = {
  _bodegas: [],
  _bodegaActiva: null,
  _tab: 'lista',

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._bodegas = await DB.getBodegas();

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🏭 Bodegas</h1>
        <p class="page-subtitle">// ${this._bodegas.length} bodegas/sucursales</p></div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.bodegas.exportar()">⬇ CSV</button>
          <button class="btn btn-ghost" onclick="Modulos.bodegas.importar()">⬆ Importar</button>
          <button class="btn btn-ghost" onclick="window.print()">🖨️ Imprimir</button>
          <button class="btn btn-amber" onclick="Modulos.bodegas.modalBodega()">＋ Nueva Bodega</button>
        </div>
      </div>
      <div class="page-body">
        <!-- TALLER PRINCIPAL -->
        <div class="card card-amber" style="margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:800;font-size:15px">🏪 ${Auth.tenant?.name||'Taller Principal'}</div>
              <div style="font-size:12px;color:var(--text3)">Inventario principal del taller</div>
            </div>
            <button class="btn btn-amber" onclick="Modulos.bodegas.verInventario(null,'Taller Principal')">
              📦 Ver Inventario
            </button>
          </div>
        </div>

        <!-- BODEGAS ADICIONALES -->
        <div style="font-weight:700;font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">
          Bodegas y Sucursales
        </div>
        <div class="grid-3">
          ${this._bodegas.map(b=>`
            <div class="card ${b.activa?'':'card-gray'}">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                <div>
                  <div style="font-size:28px;margin-bottom:4px">🏭</div>
                  <div style="font-weight:800;font-size:15px">${b.nombre}</div>
                  ${b.direccion?`<div style="font-size:11px;color:var(--text3)">📍 ${b.direccion}</div>`:''}
                  ${b.responsable?`<div style="font-size:11px;color:var(--text3)">👤 ${b.responsable}</div>`:''}
                </div>
                <span class="badge badge-${b.activa?'green':'gray'}">${b.activa?'Activa':'Inactiva'}</span>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px">
                <button class="btn btn-cyan btn-sm" onclick="Modulos.bodegas.verInventario('${b.id}','${b.nombre}')">
                  📦 Ver Inventario
                </button>
                <button class="btn btn-ghost btn-sm" onclick="Modulos.bodegas.modalTraslado('${b.id}','${b.nombre}')">
                  🔄 Trasladar Stock
                </button>
                <button class="btn btn-ghost btn-sm" onclick="Modulos.bodegas.modalBodega('${b.id}')">
                  ✏️ Editar Bodega
                </button>
                <button class="btn btn-danger btn-sm" onclick="Modulos.bodegas.eliminarBodega('${b.id}','${b.nombre}')" title="Eliminar">
                  🗑️ Eliminar
                </button>
              </div>
            </div>`).join('')||'<div class="text-muted" style="padding:20px">Sin bodegas adicionales registradas.</div>'}
        </div>
      </div>`;
  },

  async verInventario(bodegaId, nombre) {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._bodegaActiva = bodegaId || null;
    let qInv = getSB().from('inventario').select('*').eq('tenant_id', getTID());
    qInv = bodegaId ? qInv.eq('bodega_id', bodegaId) : qInv.is('bodega_id', null);
    const { data: items } = await qInv.order('nombre');

    const totalItems = items?.length || 0;
    const bajoStock  = items?.filter(i=>i.stock<=i.min_stock).length || 0;
    const verCosto   = puedeVerCosto();

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">📦 ${nombre}</h1>
          <p class="page-subtitle">// ${totalItems} artículos${bajoStock>0?` · <span style="color:var(--red)">⚠️ ${bajoStock} bajo mínimo</span>`:''}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.bodegas.render()">← Bodegas</button>
          <button class="btn btn-ghost" onclick="Modulos.bodegas.modalTraslado('${bodegaId||''}','${nombre}')">🔄 Trasladar</button>
          <button class="btn btn-ghost" onclick="window.print()">🖨️ Imprimir</button>
          <button class="btn btn-amber" onclick="Modulos.bodegas.modalAgregarItem('${bodegaId||''}')">＋ Agregar Artículo</button>
        </div>
      </div>
      <div class="page-body">
        <input class="form-input" style="margin-bottom:16px" placeholder="🔍 Buscar artículo..."
               oninput="Modulos.bodegas._filtrar(this.value)">
        <div class="table-wrap">
          <table class="data-table" id="bod-inv-table">
            <thead><tr>
              <th>Código</th><th>Artículo</th><th>Categoría</th>
              <th>Stock</th><th>Mínimo</th>${verCosto?'<th>Costo</th>':''}<th>Venta</th><th>Acciones</th>
            </tr></thead>
            <tbody id="bod-inv-tbody">
              ${(items||[]).map(i=>{
                const bajo = i.stock <= i.min_stock;
                return `<tr style="${bajo?'background:var(--red-dim)':''}">
                  <td class="mono-sm">${i.codigo||'—'}</td>
                  <td><b>${i.nombre}</b></td>
                  <td><span class="badge badge-gray">${i.categoria||'General'}</span></td>
                  <td class="mono-sm ${bajo?'text-red':'text-green'}"><b>${i.stock}</b> ${i.unidad_medida||''}</td>
                  <td class="mono-sm text-muted">${i.min_stock}</td>
                  ${verCosto?`<td class="mono-sm">${UI.q(i.precio_costo)}</td>`:''}
                  <td class="mono-sm text-amber">${UI.q(i.precio_venta)}</td>
                  <td><div style="display:flex;gap:4px">
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.bodegas.modalMovimiento('${i.id}','${i.nombre}',${i.stock})">± Stock</button>
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.bodegas.modalTraslado('${bodegaId||''}','${nombre}','${i.id}','${i.nombre}')">🔄</button>
                  </div></td>
                </tr>`;
              }).join('')||`<tr><td colspan="${verCosto?8:7}" style="text-align:center;padding:24px;color:var(--text3)">Sin artículos en esta bodega</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  _filtrar(busca) {
    document.querySelectorAll('#bod-inv-tbody tr').forEach(tr=>{
      tr.style.display = tr.textContent.toLowerCase().includes(busca.toLowerCase()) ? '' : 'none';
    });
  },

  modalAgregarItem(bodegaId) {
    UI.modal('＋ Agregar Artículo a Bodega', `
      <div class="alert alert-cyan" style="margin-bottom:12px">
        <div class="alert-icon">ℹ️</div>
        <div class="alert-body" style="font-size:11px">
          Puedes agregar un artículo nuevo específico para esta bodega, o trasladar stock desde el taller principal o desde otra bodega.
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Código / SKU</label>
          <input class="form-input" id="bi-codigo" placeholder="REP-001"></div>
        <div class="form-group"><label class="form-label">Nombre *</label>
          <input class="form-input" id="bi-nombre" placeholder="Filtro de aceite"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Categoría</label>
          <select class="form-select" id="bi-cat">
            ${['Filtros','Aceites','Frenos','Motor','Eléctrico','Herramientas','Consumibles','Otro'].map(c=>`<option>${c}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Unidad</label>
          <select class="form-select" id="bi-unidad">
            ${['unidad','litro','kg','par','caja'].map(u=>`<option>${u}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Stock Inicial</label>
          <input class="form-input" id="bi-stock" type="number" value="0" min="0"></div>
        <div class="form-group"><label class="form-label">Stock Mínimo</label>
          <input class="form-input" id="bi-min" type="number" value="5" min="0"></div>
      </div>
      <div class="form-row">
        ${puedeVerCosto()?`<div class="form-group"><label class="form-label">Precio Costo (Q)</label>
          <input class="form-input" id="bi-costo" type="number" value="0" min="0" step="0.01"></div>`:''}
        <div class="form-group"><label class="form-label">Precio Venta (Q)</label>
          <input class="form-input" id="bi-venta" type="number" value="0" min="0" step="0.01"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.bodegas.guardarItem('${bodegaId}')">Agregar</button>
      </div>`);
  },

  async guardarItem(bodegaId) {
    const nombre = document.getElementById('bi-nombre')?.value.trim();
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }
    const fields = {
      bodega_id:     bodegaId || null,
      codigo:        document.getElementById('bi-codigo')?.value.trim()||null,
      nombre,
      categoria:     document.getElementById('bi-cat')?.value,
      unidad_medida: document.getElementById('bi-unidad')?.value,
      stock:         parseFloat(document.getElementById('bi-stock')?.value)||0,
      min_stock:     parseFloat(document.getElementById('bi-min')?.value)||5,
      precio_venta:  parseFloat(document.getElementById('bi-venta')?.value)||0
    };
    /* El costo solo se guarda si el usuario puede verlo */
    const _biCosto = document.getElementById('bi-costo');
    if (_biCosto) fields.precio_costo = parseFloat(_biCosto.value)||0;
    const { error } = await DB.upsertInventario(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('Artículo agregado ✓');
    this.verInventario(bodegaId||null, bodegaId?'Bodega':'Taller Principal');
  },

  modalMovimiento(invId, nombre, stockActual) {
    UI.modal(`± Movimiento — ${nombre}`, `
      <div style="text-align:center;margin-bottom:16px">
        <div class="kpi-label">Stock actual</div>
        <div class="kpi-val amber">${stockActual}</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo</label>
          <select class="form-select" id="mov-tipo">
            <option value="entrada">📥 Entrada (compra)</option>
            <option value="salida">📤 Salida (uso/venta)</option>
            <option value="ajuste">🔄 Ajuste</option>
          </select></div>
        <div class="form-group"><label class="form-label">Cantidad *</label>
          <input class="form-input" id="mov-cant" type="number" min="0.01" step="0.01"></div>
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <input class="form-input" id="mov-notas" placeholder="Razón del movimiento"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.bodegas.guardarMovimiento('${invId}',${stockActual})">Registrar</button>
      </div>`);
  },

  async guardarMovimiento(invId, stockActual) {
    const tipo = document.getElementById('mov-tipo')?.value;
    const cant = parseFloat(document.getElementById('mov-cant')?.value)||0;
    if (cant<=0) { UI.toast('Ingresa una cantidad válida','error'); return; }
    const nuevoStock = tipo==='salida' ? stockActual-cant : stockActual+cant;
    if (nuevoStock<0) { UI.toast('Stock insuficiente','error'); return; }
    await getSB().from('inventario').update({ stock:nuevoStock, updated_at:new Date().toISOString() }).eq('id',invId);
    /* Registrar el movimiento en la trazabilidad compartida con Inventario */
    await DB.movimientoInventario({
      inventario_id: invId, tipo, cantidad: cant,
      notas: document.getElementById('mov-notas')?.value || null,
      fecha: new Date().toISOString().slice(0,10)
    });
    UI.cerrarModal(); UI.toast('Movimiento registrado ✓');
    this.verInventario(this._bodegaActiva || null, this._bodegaActiva ? (this._bodegas.find(b=>b.id===this._bodegaActiva)?.nombre||'Bodega') : 'Taller Principal');
  },

  async modalTraslado(desdeBodegaId, desdeBodegaNombre, invId=null, invNombre=null) {
    /* Cargar artículos de la bodega origen */
    let qOrigen = getSB().from('inventario').select('*').eq('tenant_id', getTID());
    qOrigen = desdeBodegaId ? qOrigen.eq('bodega_id', desdeBodegaId) : qOrigen.is('bodega_id', null);
    const { data: itemsOrigen } = await qOrigen.order('nombre');

    /* Cargar bodegas destino */
    const bodegas = await DB.getBodegas();
    const destinos = [
      { id: '', nombre: `🏪 ${Auth.tenant?.name||'Taller Principal'}` },
      ...bodegas.filter(b=>b.id!==desdeBodegaId&&b.activa).map(b=>({ id:b.id, nombre:`🏭 ${b.nombre}` }))
    ];

    UI.modal(`🔄 Trasladar Stock — Desde: ${desdeBodegaNombre}`, `
      <div class="form-group"><label class="form-label">Artículo a trasladar *</label>
        <select class="form-select" id="trs-item" onchange="Modulos.bodegas._updateMaxStock(this)">
          <option value="">Seleccionar artículo...</option>
          ${(itemsOrigen||[]).map(i=>`<option value="${i.id}" data-stock="${i.stock}">${i.nombre} (Stock: ${i.stock} ${i.unidad_medida||''})</option>`).join('')}
        </select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cantidad a trasladar *</label>
          <input class="form-input" id="trs-cant" type="number" min="1" step="1" placeholder="0">
          <div id="trs-max" style="font-size:11px;color:var(--text3);margin-top:4px"></div>
        </div>
        <div class="form-group"><label class="form-label">Destino *</label>
          <select class="form-select" id="trs-dest">
            <option value="">Seleccionar destino...</option>
            ${destinos.map(d=>`<option value="${d.id}">${d.nombre}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Motivo del traslado</label>
        <input class="form-input" id="trs-motivo" placeholder="Reposición, redistribución, etc."></div>

      <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:10px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="trs-flete-on" onchange="Modulos.bodegas._toggleFlete()"> 🚚 Registrar flete / envío de este traslado
        </label>
        <div id="trs-flete-box" style="display:none;margin-top:10px">
          <div class="form-row">
            <div class="form-group"><label class="form-label">¿Cómo se envía?</label>
              <select class="form-select" id="trs-flete-tipo" onchange="Modulos.bodegas._toggleFlete()">
                <option value="interno">🏠 Nosotros mismos</option>
                <option value="externo">🚚 Transporte externo</option>
              </select></div>
            <div class="form-group"><label class="form-label">Entrega estimada</label>
              <input class="form-input" id="trs-festimada" type="date"></div>
          </div>
          <div id="trs-flete-interno">
            <div class="form-row">
              <div class="form-group"><label class="form-label">Medio</label>
                <select class="form-select" id="trs-medio">${['moto','vehiculo','camion','cabezal','otro'].map(m=>`<option value="${m}">${m}</option>`).join('')}</select></div>
              <div class="form-group"><label class="form-label">Responsable</label>
                <input class="form-input" id="trs-resp"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Viáticos (Q)</label><input class="form-input" id="trs-viaticos" type="number" min="0" step="0.01" value="0"></div>
              <div class="form-group"><label class="form-label">Combustible (Q)</label><input class="form-input" id="trs-combustible" type="number" min="0" step="0.01" value="0"></div>
            </div>
          </div>
          <div id="trs-flete-externo" style="display:none">
            <div class="form-row">
              <div class="form-group"><label class="form-label">Empresa de transporte</label><input class="form-input" id="trs-empresa" placeholder="Cargo Expreso..."></div>
              <div class="form-group"><label class="form-label">Costo del flete (Q)</label><input class="form-input" id="trs-fcosto" type="number" min="0" step="0.01" value="0"></div>
            </div>
            <div class="form-group"><label class="form-label">No. de envío / guía</label><input class="form-input" id="trs-fnum"></div>
          </div>
        </div>
      </div>

      <div class="alert alert-amber" style="margin-top:8px">
        <div class="alert-icon">ℹ️</div>
        <div class="alert-body" style="font-size:11px">
          El stock se descontará de <b>${desdeBodegaNombre}</b> y se agregará al destino seleccionado.
          Si el artículo no existe en el destino, se creará automáticamente.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-cyan" onclick="Modulos.bodegas.ejecutarTraslado('${desdeBodegaId||''}','${desdeBodegaNombre}')">
          🔄 Ejecutar Traslado
        </button>
      </div>`,'560px');

    /* Pre-seleccionar artículo si viene de botón */
    if (invId) {
      const sel = document.getElementById('trs-item');
      if (sel) { sel.value = invId; Modulos.bodegas._updateMaxStock(sel); }
    }
  },

  _toggleFlete() {
    const on = document.getElementById('trs-flete-on')?.checked;
    const box = document.getElementById('trs-flete-box'); if (box) box.style.display = on ? 'block' : 'none';
    const tipo = document.getElementById('trs-flete-tipo')?.value;
    const i = document.getElementById('trs-flete-interno'), e = document.getElementById('trs-flete-externo');
    if (i) i.style.display = tipo === 'externo' ? 'none' : 'block';
    if (e) e.style.display = tipo === 'externo' ? 'block' : 'none';
  },

  _updateMaxStock(sel) {
    const stock = sel.options[sel.selectedIndex]?.dataset.stock || 0;
    const el = document.getElementById('trs-max');
    if (el) el.textContent = `Máximo disponible: ${stock}`;
    const cantEl = document.getElementById('trs-cant');
    if (cantEl) cantEl.max = stock;
  },

  async ejecutarTraslado(desdeBodegaId, desdeBodegaNombre) {
    const itemId  = document.getElementById('trs-item')?.value;
    const cant    = parseFloat(document.getElementById('trs-cant')?.value)||0;
    const destId  = document.getElementById('trs-dest')?.value;
    const motivo  = document.getElementById('trs-motivo')?.value||'Traslado';

    if (!itemId)  { UI.toast('Selecciona un artículo','error'); return; }
    if (cant<=0)  { UI.toast('Ingresa una cantidad válida','error'); return; }
    if (destId === desdeBodegaId) { UI.toast('El origen y destino son iguales','error'); return; }

    /* Obtener artículo origen */
    const { data: origen } = await getSB().from('inventario').select('*').eq('id', itemId).maybeSingle();
    if (!origen) { UI.toast('Artículo no encontrado','error'); return; }
    if (cant > origen.stock) { UI.toast(`Stock insuficiente. Disponible: ${origen.stock}`,'error'); return; }

    /* Descontar del origen */
    await getSB().from('inventario').update({
      stock: origen.stock - cant,
      updated_at: new Date().toISOString()
    }).eq('id', itemId);

    /* Buscar artículo en destino */
    let qDest = getSB().from('inventario').select('*,id,stock')
      .eq('tenant_id', getTID())
      .eq('nombre', origen.nombre);
    if (destId) qDest = qDest.eq('bodega_id', destId);
    else qDest = qDest.is('bodega_id', null);
    const { data: destItem } = await qDest.maybeSingle();

    if (destItem) {
      /* Sumar al destino existente */
      await getSB().from('inventario').update({
        stock: destItem.stock + cant,
        updated_at: new Date().toISOString()
      }).eq('id', destItem.id);
    } else {
      /* Crear nuevo registro en destino */
      await getSB().from('inventario').insert({
        tenant_id:     getTID(),
        bodega_id:     destId || null,
        codigo:        `${origen.codigo||'ART'}-B${(destId||'P').slice(0,4)}`,
        nombre:        origen.nombre,
        categoria:     origen.categoria,
        unidad_medida: origen.unidad_medida,
        stock:         cant,
        min_stock:     origen.min_stock,
        precio_costo:  origen.precio_costo,
        precio_venta:  origen.precio_venta
      });
    }

    /* Registrar movimiento */
    await DB.movimientoInventario({
      inventario_id: itemId,
      tipo:          'traslado',
      cantidad:      cant,
      referencia:    `Traslado a ${destId ? 'bodega' : 'taller principal'}`,
      notas:         motivo,
      fecha:         new Date().toISOString().slice(0,10)
    });

    /* Registrar flete / envío del traslado si se solicitó */
    if (document.getElementById('trs-flete-on')?.checked) {
      const tipoF = document.getElementById('trs-flete-tipo')?.value || 'interno';
      const nm = elId => parseFloat(document.getElementById(elId)?.value) || 0;
      const via = tipoF==='interno' ? nm('trs-viaticos') : 0;
      const comb = tipoF==='interno' ? nm('trs-combustible') : 0;
      const flete = tipoF==='interno' ? 0 : nm('trs-fcosto');
      const destNombre = destId ? (this._bodegas.find(b=>b.id===destId)?.nombre || 'Bodega') : 'Taller Principal';
      await DB.upsertEnvio({
        tipo: tipoF,
        descripcion: `Traslado: ${origen.nombre} (${cant}) → ${destNombre}`,
        destinatario: destNombre,
        bodega_origen_id: desdeBodegaId || null,
        bodega_destino_id: destId || null,
        medio: tipoF==='interno' ? (document.getElementById('trs-medio')?.value || null) : null,
        responsable: tipoF==='interno' ? (document.getElementById('trs-resp')?.value || null) : null,
        empresa_transporte: tipoF==='externo' ? (document.getElementById('trs-empresa')?.value || null) : null,
        numero_envio: tipoF==='externo' ? (document.getElementById('trs-fnum')?.value || null) : null,
        costo_flete: flete, viaticos: via, combustible: comb, costo_total: flete+via+comb,
        fecha_envio: new Date().toISOString().slice(0,10),
        fecha_entrega_estimada: document.getElementById('trs-festimada')?.value || null,
        estado: 'programado'
      }).catch(()=>{});
    }

    UI.cerrarModal();
    UI.toast(`✓ Trasladadas ${cant} ${origen.unidad_medida||''} de "${origen.nombre}" desde ${desdeBodegaNombre}`);
    this.render();
  },

  async eliminarBodega(id, nombre) {
    const ok = await UI.confirmar(
      `¿Eliminar bodega <b>${nombre}</b>?<br>Los artículos de su inventario se moverán al taller principal.`,
      'Eliminar Bodega'
    );
    if (!ok) return;
    /* Mover inventario al taller principal */
    await getSB().from('inventario').update({ bodega_id: null }).eq('bodega_id', id);
    /* Eliminar bodega */
    const { error } = await getSB().from('bodegas').delete().eq('id', id);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast('Bodega eliminada ✓ — inventario movido al taller principal');
    this.render();
  },

  modalBodega(id=null) {
    const b = id ? this._bodegas.find(x=>x.id===id) : {};
    const esEdicion = !!id;
    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nueva'} Bodega`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual de la bodega.</div></div>':''}
      <div class="form-group"><label class="form-label">Nombre / Sucursal *</label>
        <input class="form-input" id="bod-nombre" value="${b.nombre||''}" placeholder="Bodega Norte / Sucursal Centro"></div>
      <div class="form-group"><label class="form-label">Dirección</label>
        <input class="form-input" id="bod-dir" value="${b.direccion||''}"></div>
      <div class="form-group"><label class="form-label">Responsable</label>
        <input class="form-input" id="bod-resp" value="${b.responsable||''}"></div>
      ${esEdicion?`<div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="bod-activa" ${b.activa?'checked':''}>
          <span class="form-label" style="margin:0">Bodega activa</span>
        </label>
      </div>`:''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.bodegas.guardarBodega('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear Bodega'}
        </button>
      </div>`);
  },

  async guardarBodega(id='') {
    const nombre = document.getElementById('bod-nombre')?.value.trim();
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }
    const fields = {
      nombre,
      direccion:   document.getElementById('bod-dir')?.value||null,
      responsable: document.getElementById('bod-resp')?.value||null,
      activa:      id ? (document.getElementById('bod-activa')?.checked ?? true) : true
    };
    if (id) fields.id = id;
    const {error} = await DB.upsertBodega(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Bodega actualizada ✓':'Bodega creada ✓');
    this.render();
  },

  /* ── EXPORTAR BODEGAS (CSV) ────────────────────────── */
  exportar() {
    const rows = [['Nombre','Dirección','Responsable','Activa']];
    this._bodegas.forEach(b => rows.push([
      b.nombre, b.direccion||'', b.responsable||'', b.activa===false?'No':'Sí'
    ]));
    Modulos._descargarCSV(rows, `bodegas-${new Date().toISOString().slice(0,10)}.csv`);
  },

  /* ── IMPORTAR BODEGAS (CSV) ────────────────────────── */
  importar() {
    Modulos._importarCSV(async (filas) => {
      const norm = s => (s||'').toString().trim().toLowerCase();
      const head = filas.shift().map(norm);
      const col = (...n) => head.findIndex(h => n.includes(h));
      const iNom=col('nombre','bodega','sucursal'), iDir=col('dirección','direccion'),
            iResp=col('responsable','encargado'), iAct=col('activa','activo','estado');
      if (iNom < 0) { UI.toast('El CSV debe tener la columna "Nombre"','error'); return; }

      let ok=0, err=0;
      for (const f of filas) {
        if (!norm(f[iNom])) continue;
        const actRaw = iAct>=0 ? norm(f[iAct]) : 'sí';
        const fields = {
          nombre:      (f[iNom]||'').trim(),
          direccion:   iDir>=0 ? (f[iDir]||'').trim()||null : null,
          responsable: iResp>=0 ? (f[iResp]||'').trim()||null : null,
          activa:      !['no','false','0','inactiva','inactivo'].includes(actRaw)
        };
        const { error } = await DB.upsertBodega(fields);
        error ? err++ : ok++;
      }
      UI.toast(`Importación: ${ok} bodegas${err?`, ${err} con error`:''} ✓`);
      this.render();
    });
  }
};
