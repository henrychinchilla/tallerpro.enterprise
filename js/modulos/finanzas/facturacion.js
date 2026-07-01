/* NexusPro v3.0 — facturacion/index.js */
Modulos.facturacion = {
  _data: [], _clientes: [], _ordenes: [], _cotizaciones: [],
  _ini: null, _fin: null,
  _itemsImportados: [],   // líneas de detalle traídas de OT/cotización O agregadas manualmente
  _inventario: [],        // cache de inventario para el picker de productos

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const now = new Date();
    if (!this._ini) {
      this._ini = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
      this._fin = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
    }
    [this._data, this._clientes, this._ordenes, this._cotizaciones, this._inventario] = await Promise.all([
      DB.getFacturas(this._ini, this._fin), DB.getClientes(), DB.getOrdenes(),
      DB.getCotizaciones({estado:'aprobada'}), DB.getInventario()
    ]);

    const totalFEL = this._data.reduce((s,f)=>s+(f.total||0), 0);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🧾 Facturación FEL</h1>
        <p class="page-subtitle">// ${this._data.length} facturas · ${UI.q(totalFEL)}</p></div>
        <div class="page-actions">
          <input type="date" class="form-input" style="width:140px" value="${this._ini}" onchange="Modulos.facturacion._ini=this.value;Modulos.facturacion.render()">
          <input type="date" class="form-input" style="width:140px" value="${this._fin}" onchange="Modulos.facturacion._fin=this.value;Modulos.facturacion.render()">
          <button class="btn btn-amber" onclick="Modulos.facturacion.modalFactura()">＋ Nueva Factura</button>
        </div>
      </div>
      <div class="page-body">
        <div class="alert alert-cyan" style="margin-bottom:16px">
          <div class="alert-icon">ℹ️</div>
          <div class="alert-body" style="font-size:12px">
            Integración FEL activa con INFILE. Configura tus credenciales en <b>Configuración → Fiscal</b> para emitir facturas electrónicas.
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Serie/No.</th><th>Cliente</th><th>NIT</th><th>Fecha</th><th>Subtotal</th><th>IVA</th><th>Total</th><th>Método</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${this._data.map(f=>`<tr>
                <td class="mono-sm"><b>${f.fel_serie?`${f.fel_serie}-${f.fel_numero||''}`:(f.num||'—')}</b></td>
                <td>${f.nombre_receptor||f.clientes?.nombre||'CF'}</td>
                <td class="mono-sm">${f.nit||f.clientes?.nit||'CF'}</td>
                <td>${UI.fecha(f.fecha)}</td>
                <td class="mono-sm">${UI.q(f.subtotal)}</td>
                <td class="mono-sm">${UI.q(f.iva)}</td>
                <td class="mono-sm text-amber"><b>${UI.q(f.total)}</b></td>
                <td><span class="badge badge-gray">${f.metodo_pago||'Efectivo'}</span></td>
                <td><span class="badge badge-${f.estado==='certificada'?'green':f.estado==='anulada'?'red':f.estado==='borrador'?'gray':'amber'}">${f.estado}</span></td>
                <td><div style="display:flex;gap:4px">
                  <button class="btn btn-sm btn-cyan" onclick="Modulos.facturacion.modalFactura('${f.id}')">Ver</button>
                  <button class="btn btn-sm btn-ghost" onclick="Modulos.facturacion.enviarEmail('${f.id}')" title="Enviar por email">📧</button>
                  <button class="btn btn-sm btn-ghost" onclick="Modulos.facturacion.imprimir('${f.id}')">🖨️</button>
                  ${f.estado!=='anulada'?`<button class="btn btn-sm btn-ghost" onclick="Modulos.facturacion.anularFactura('${f.id}')" title="Anular factura">🔴</button>`:''}
                  ${Modulos.btnAccion('eliminar', `Modulos.finanzas.eliminar('facturas','${f.id}')`)}
                </div></td>
              </tr>`).join('')||'<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text3)">Sin facturas en este período</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  async modalFactura(id=null, cotizacionId=null) {
    const f = id ? this._data.find(x=>x.id===id) : {};
    const esEdicion = !!id;
    const iva = Auth.tenant?.tasa_iva || 0.12;
    const itemsExistentes = id ? await DB.getFacturaItems(id) : [];
    this._itemsImportados = itemsExistentes.map(i=>({ ...i }));
    if (!this._inventario.length) this._inventario = await DB.getInventario().catch(()=>[]);

    UI.modal(`${esEdicion?'🧾 Ver':'＋ Nueva'} Factura`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual de la factura.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cliente *</label>
          <select class="form-select" id="fel-cli" onchange="Modulos.facturacion._clienteCambio(this.value)">
            <option value="">Consumidor Final (CF)</option>
            ${this._clientes.map(c=>`<option value="${c.id}" ${f.cliente_id===c.id?'selected':''}>${c.nombre} — ${c.nit||'CF'}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row" id="fel-receptor-row">
        <div class="form-group"><label class="form-label">Nombre del Receptor (para la factura)</label>
          <input class="form-input" id="fel-nombre-receptor" value="${f.nombre_receptor || 'Consumidor Final'}" 
            ${f.cliente_id ? 'readonly style="background:var(--surface2)"' : ''}></div>
        <div class="form-group"><label class="form-label">NIT Receptor</label>
          <input class="form-input mono-sm" id="fel-nit-receptor" value="${f.nit || 'CF'}" 
            ${f.cliente_id ? 'readonly style="background:var(--surface2)"' : ''}></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">📋 Importar de OT <span style="font-size:10px;color:var(--text3)">(trae ítems automáticamente)</span></label>
          <select class="form-select" id="fel-ot" onchange="Modulos.facturacion._importarDeOT(this.value)">
            <option value="">— Sin OT —</option>
            ${this._ordenes.filter(o=>o.estado!=='cancelado').map(o=>`<option value="${o.id}" ${(f.ot_id||f.orden_id)===o.id?'selected':''}>${o.num} · ${o.clientes?.nombre||''} · ${UI.q(o.total)}${o.anticipo>0?` (anticipo: ${UI.q(o.anticipo)})`:''}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">📋 Importar de Cotización aprobada</label>
          <select class="form-select" id="fel-cot" onchange="Modulos.facturacion._importarDeCotizacion(this.value)">
            <option value="">— Sin cotización —</option>
            ${this._cotizaciones.map(c=>`<option value="${c.id}" ${f.cotizacion_id===c.id?'selected':''}>${c.num||'—'} · ${c.clientes?.nombre||''} · ${UI.q(c.total)}</option>`).join('')}
          </select></div>
      </div>

      <!-- Editor de ítems manual -->
      <div class="form-group">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <label class="form-label" style="margin:0">🛒 Ítems a cobrar</label>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-ghost" onclick="Modulos.facturacion._agregarServicio()">＋ Servicio</button>
            <button class="btn btn-sm btn-cyan" onclick="Modulos.facturacion._agregarProducto()">＋ Producto de inventario</button>
          </div>
        </div>
        <div id="fel-items-editor">${this._renderItemsEditor()}</div>
      </div>

      <div class="form-row">
        <div class="form-group"><label class="form-label">Serie FEL (opcional)</label>
          <input class="form-input" id="fel-serie" value="${f.fel_serie||''}" maxlength="10" placeholder="Serie autorizada FEL"></div>
        <div class="form-group"><label class="form-label">Fecha *</label>
          <input class="form-input" id="fel-fecha" type="date" value="${f.fecha||new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Método de Pago</label>
          <select class="form-select" id="fel-metodo">
            ${['Efectivo','Tarjeta','Transferencia','Cheque','Depósito','Crédito'].map(m=>`<option ${(f.metodo_pago||'Efectivo')===m?'selected':''}>${m}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row" style="align-items:end">
        <div class="form-group"><label class="form-label">Subtotal (Q) *</label>
          <input class="form-input" id="fel-sub" type="number" value="${f.subtotal||''}" step="0.01"
                 oninput="Modulos.facturacion._recalcularDesdeSubtotal(this.value)"></div>
        <div class="form-group"><label class="form-label">IVA ${Math.round(iva*100)}%</label>
          <input class="form-input" id="fel-iva" type="number" value="${f.iva||''}" step="0.01" readonly></div>
        <div class="form-group"><label class="form-label" style="font-size:14px;font-weight:800;color:var(--amber)">TOTAL (Q)</label>
          <input class="form-input" id="fel-total" type="number" value="${f.total||''}" step="0.01" readonly
                 style="font-size:20px;font-weight:800;color:var(--amber)"></div>
      </div>
      ${esEdicion?`<div class="form-group"><label class="form-label">Estado</label>
        <select class="form-select" id="fel-estado">
          ${['borrador','pendiente','certificada','anulada'].map(s=>`<option ${f.estado===s?'selected':''}>${s}</option>`).join('')}
        </select></div>`:''}
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="fel-notas" rows="2">${f.notas||''}</textarea></div>
      <div class="modal-footer">
        ${esEdicion?`<button class="btn btn-red" onclick="UI.cerrarModal();Modulos.finanzas.eliminar('facturas','${id}')" style="margin-right:auto">🗑️ Eliminar Factura</button>`:''}
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.facturacion.guardar('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Emitir Factura'}
        </button>
      </div>`,'700px');

    if (!id && cotizacionId) await this._importarDeCotizacion(cotizacionId);
    else if (this._itemsImportados.length) {
      const box = document.getElementById('fel-items-editor');
      if (box) box.innerHTML = this._renderItemsEditor();
    }
  },

  /* Abre Facturación con una cotización aprobada lista para emitir */
  async facturarCotizacion(cotizacionId) {
    App.navegarA('facturacion');
    if (App.paginaActual !== 'facturacion') return;
    await this.render();
    await this.modalFactura(null, cotizacionId);
  },

  /* ── Editor de ítems (manual + importados) ── */
  _renderItemsEditor() {
    if (!this._itemsImportados.length) {
      return `<div id="fel-items-vacio" style="text-align:center;padding:16px;color:var(--text3);font-size:13px;border:1px dashed var(--border);border-radius:8px">
        Sin ítems. Agrega servicios o productos, o importa desde una OT / cotización.
      </div>`;
    }
    return `<div class="table-wrap"><table class="data-table" style="font-size:12px">
      <thead><tr><th>Descripción</th><th style="text-align:right;width:70px">Cant.</th><th style="text-align:right;width:90px">P. Unit.</th><th style="text-align:right;width:90px">Total</th><th style="width:36px"></th></tr></thead>
      <tbody id="fel-items-tbody">
        ${this._itemsImportados.map((it,i)=>`<tr>
          <td><input class="form-input" style="font-size:12px;padding:4px 8px" value="${(it.descripcion||'').replace(/"/g,'&quot;')}"
               onchange="Modulos.facturacion._itemCambio(${i},'descripcion',this.value)"></td>
          <td><input class="form-input mono-sm" style="font-size:12px;padding:4px;text-align:right;width:60px" type="number" min="0.001" step="0.001" value="${it.cantidad||1}"
               onchange="Modulos.facturacion._itemCambio(${i},'cantidad',parseFloat(this.value)||1)"></td>
          <td><input class="form-input mono-sm" style="font-size:12px;padding:4px;text-align:right;width:80px" type="number" min="0" step="0.01" value="${it.precio_unit||0}"
               onchange="Modulos.facturacion._itemCambio(${i},'precio_unit',parseFloat(this.value)||0)"></td>
          <td class="mono-sm text-amber" style="text-align:right">${UI.q(it.total||0)}</td>
          <td><button class="btn btn-sm" style="padding:2px 6px;color:var(--red)" onclick="Modulos.facturacion._itemQuitar(${i})">✕</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  },

  _itemCambio(i, campo, valor) {
    if (!this._itemsImportados[i]) return;
    this._itemsImportados[i][campo] = valor;
    if (campo === 'cantidad' || campo === 'precio_unit') {
      this._itemsImportados[i].total = Math.round(
        (Number(this._itemsImportados[i].cantidad)||1) *
        (Number(this._itemsImportados[i].precio_unit)||0) * 100
      ) / 100;
    }
    this._refrescarEditor();
  },

  _itemQuitar(i) {
    this._itemsImportados.splice(i,1);
    this._refrescarEditor();
  },

  _refrescarEditor() {
    const box = document.getElementById('fel-items-editor');
    if (box) box.innerHTML = this._renderItemsEditor();
    this._recalcularDesdeItems();
  },

  _recalcularDesdeItems() {
    const totalConIva = this._itemsImportados.reduce((s,i)=>s+(Number(i.total)||0),0);
    this._setTotales(totalConIva);
  },

  _recalcularDesdeSubtotal(val) {
    const iva = Auth.tenant?.tasa_iva || 0.12;
    const s = parseFloat(val)||0;
    const ivaM = Math.round(s*iva*100)/100;
    const tot  = Math.round((s + ivaM)*100)/100;
    const ivaEl = document.getElementById('fel-iva');
    const totEl = document.getElementById('fel-total');
    if (ivaEl) ivaEl.value = ivaM.toFixed(2);
    if (totEl) totEl.value = tot.toFixed(2);
  },

  _setTotales(totalConIva) {
    const iva = Auth.tenant?.tasa_iva || 0.12;
    const sub = Math.round(totalConIva/(1+iva)*100)/100;
    const ivaM = Math.round((totalConIva - sub)*100)/100;
    const subEl = document.getElementById('fel-sub');
    const ivaEl = document.getElementById('fel-iva');
    const totEl = document.getElementById('fel-total');
    if (subEl) subEl.value = sub.toFixed(2);
    if (ivaEl) ivaEl.value = ivaM.toFixed(2);
    if (totEl) totEl.value = totalConIva.toFixed(2);
  },

  /* Agrega una línea de servicio (texto libre) */
  _agregarServicio() {
    this._itemsImportados.push({ descripcion:'Servicio', cantidad:1, precio_unit:0, total:0 });
    this._refrescarEditor();
    /* Scroll al final y enfocar la descripción del nuevo ítem */
    setTimeout(()=>{
      const rows = document.querySelectorAll('#fel-items-tbody tr');
      if (rows.length) { const inp = rows[rows.length-1].querySelector('input'); inp?.focus(); inp?.select(); }
    }, 50);
  },

  /* Abre selector de inventario para agregar producto */
  _agregarProducto() {
    const cats = [...new Set(this._inventario.map(p=>p.categoria).filter(Boolean))].sort();
    UI.modal('📦 Agregar producto de inventario', `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <input class="form-input" style="flex:1" placeholder="🔍 Buscar..." id="inv-busca" oninput="Modulos.facturacion._filtrarInv(this.value)">
        <select class="form-select" style="width:170px" id="inv-cat" onchange="Modulos.facturacion._filtrarInv(document.getElementById('inv-busca').value)">
          <option value="">Todas las categorías</option>
          ${cats.map(c=>`<option>${c}</option>`).join('')}
        </select>
      </div>
      <div id="inv-lista" style="max-height:340px;overflow-y:auto">
        ${this._renderListaInv(this._inventario)}
      </div>`, '560px');
  },

  _filtrarInv(busca='') {
    const cat = document.getElementById('inv-cat')?.value||'';
    const b = busca.toLowerCase();
    const filtrados = this._inventario.filter(p=>{
      if (cat && p.categoria !== cat) return false;
      if (!b) return true;
      return (p.nombre||'').toLowerCase().includes(b) || (p.codigo||'').toLowerCase().includes(b);
    });
    const el = document.getElementById('inv-lista');
    if (el) el.innerHTML = this._renderListaInv(filtrados);
  },

  _renderListaInv(items) {
    if (!items.length) return `<div style="text-align:center;padding:16px;color:var(--text3)">Sin productos</div>`;
    return items.map(p=>`
      <div onclick="Modulos.facturacion._seleccionarProducto('${p.id}');UI.cerrarModal()"
           onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''"
           style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-weight:700;font-size:13px">${p.nombre}</div>
          <div style="font-size:11px;color:var(--text3)">${p.categoria||''} · ${p.codigo||''}${p.stock!=null?` · Stock: ${p.stock}`:''}</div>
        </div>
        <div style="font-weight:800;color:var(--amber);font-size:14px">${UI.q(p.precio_venta)}</div>
      </div>`).join('');
  },

  _clienteCambio(cliId) {
    const cli = cliId ? this._clientes.find(c=>c.id===cliId) : null;
    const nombreEl = document.getElementById('fel-nombre-receptor');
    const nitEl = document.getElementById('fel-nit-receptor');
    if (!nombreEl || !nitEl) return;
    if (cli) {
      nombreEl.value = cli.nombre;
      nombreEl.readOnly = true;
      nombreEl.style.background = 'var(--surface2)';
      nitEl.value = cli.nit || 'CF';
      nitEl.readOnly = true;
      nitEl.style.background = 'var(--surface2)';
    } else {
      nombreEl.value = 'Consumidor Final';
      nombreEl.readOnly = false;
      nombreEl.style.background = '';
      nitEl.value = 'CF';
      nitEl.readOnly = false;
      nitEl.style.background = '';
    }
  },

  _seleccionarProducto(id) {
    const p = this._inventario.find(x=>x.id===id); if (!p) return;
    const precio = Number(p.precio_venta)||0;
    this._itemsImportados.push({
      descripcion: p.nombre, cantidad: 1, precio_unit: precio, total: precio,
      inventario_id: p.id
    });
    this._refrescarEditor();
  },

  /* Tabla de desglose (legado, solo lectura - se sigue usando para impresión) */
  _renderItemsBox(items) {
    if (!items || !items.length) return '';
    return `<div class="form-group"><label class="form-label">Detalle a cobrar (desglose)</label>
      <div class="table-wrap"><table class="data-table" style="font-size:12px">
        <thead><tr><th>Descripción</th><th style="text-align:right">Cant.</th><th style="text-align:right">P. Unit</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${items.map(i=>`<tr>
          <td>${i.descripcion||'—'}</td>
          <td style="text-align:right" class="mono-sm">${i.cantidad}</td>
          <td style="text-align:right" class="mono-sm">${UI.q(i.precio_unit)}</td>
          <td style="text-align:right" class="mono-sm text-amber">${UI.q(i.total)}</td>
        </tr>`).join('')}</tbody>
      </table></div></div>`;
  },

  async guardar(id='') {
    const sub = parseFloat(document.getElementById('fel-sub')?.value)||0;
    if (sub<=0) { UI.toast('El subtotal es obligatorio','error'); return; }
    const iva   = parseFloat(document.getElementById('fel-iva')?.value)||0;
    const total = parseFloat(document.getElementById('fel-total')?.value)||0;
    const cliId = document.getElementById('fel-cli')?.value||null;
    const cli   = cliId ? this._clientes.find(c=>c.id===cliId) : null;
    const customNombre = document.getElementById('fel-nombre-receptor')?.value?.trim() || 'Consumidor Final';
    const customNit = document.getElementById('fel-nit-receptor')?.value?.trim() || 'CF';

    const finalNit = cli?.nit?.trim() || customNit;
    if (finalNit && finalNit.toUpperCase() !== 'CF' && !NIT.validarLocal(finalNit).valido) {
      UI.toast('Aviso: el NIT del receptor tiene dígito verificador inválido','warn');
    }
    const fields = {
      cliente_id: cliId,
      ot_id:      document.getElementById('fel-ot')?.value||null,
      cotizacion_id: document.getElementById('fel-cot')?.value||null,
      nit:        finalNit,
      nombre_receptor: cli?.nombre || customNombre,
      tipo_cliente: (finalNit && finalNit.toUpperCase()!=='CF') ? 'NIT' : 'CF',
      fel_serie:  document.getElementById('fel-serie')?.value?.trim()||null,
      fecha:      document.getElementById('fel-fecha')?.value,
      metodo_pago: document.getElementById('fel-metodo')?.value||'Efectivo',
      subtotal:   sub, iva, total,
      estado:     document.getElementById('fel-estado')?.value||'pendiente',
      descripcion: document.getElementById('fel-notas')?.value||null
    };
    /* Evitar doble facturación de una misma OT o cotización (doble descuento de inventario / doble cobro) */
    if (!id && fields.ot_id) {
      const yaFact = await DB.facturaDeOrden(fields.ot_id);
      if (yaFact) { UI.toast(`Esa OT ya tiene factura (${yaFact.num||'—'})`,'error'); return; }
    }
    if (!id && fields.cotizacion_id) {
      const yaFact = await DB.facturaDeCotizacion(fields.cotizacion_id);
      if (yaFact) { UI.toast(`Esa cotización ya tiene factura (${yaFact.num||'—'})`,'error'); return; }
    }
    if (id) fields.id = id;
    const res = await DB.upsertFactura(fields);
    if (res.error) { UI.toast('Error: '+res.error.message,'error'); return; }
    /* Persistir el desglose en una factura nueva creada desde una OT o
       cotización, y descontar del inventario los repuestos vendidos. */
    let descontados = 0;
    if (!id && res.data?.id && this._itemsImportados.length) {
      await DB.insertFacturaItems(res.data.id, this._itemsImportados);
      const nro = res.data.num || res.data.id.slice(0,8);
      descontados = await DB.descontarInventarioVenta(this._itemsImportados, `Factura ${nro}`);
    }
    /* Marcar la cotización como convertida (igual que al pasar por una OT) */
    if (!id && res.data?.id && fields.cotizacion_id) {
      await DB.marcarCotizacionConvertida(fields.cotizacion_id, res.data.id);
    }
    /* Fidelización: acumula según la política del taller (solo al emitir) */
    if (!id && res.data?.id && cli?.programa_puntos) {
      const fid = fidelizacionCfg();
      const pts = Math.floor((Number(res.data.total ?? fields.total) || 0) * (Number(fid.puntos_por_q)||0));
      if (pts > 0) await DB.registrarPuntos(cli.id, pts, { tipo:'gana', motivo:'Factura', referencia:res.data.num, factura_id:res.data.id });
    }
    this._itemsImportados = [];
    UI.cerrarModal();
    UI.toast(id ? 'Factura actualizada ✓'
                : `Factura emitida ✓${descontados ? ` · ${descontados} repuesto(s) descontado(s) de inventario` : ''}`);
    if (window.App && App.paginaActual === 'contabilidad') {
      if (window.Modulos?.contabilidad?._renderTab) await Modulos.contabilidad._renderTab();
    } else {
      this.render();
    }
  },

  /* Importa de una OT: cliente, ítems y montos. Si hay anticipo, solo cobra el saldo. */
  async _importarDeOT(otId) {
    if (!otId) return;
    const cotSel = document.getElementById('fel-cot');
    if (cotSel) cotSel.value = '';
    const iva = Auth.tenant?.tasa_iva || 0.12;
    const orden = this._ordenes.find(o => o.id === otId);

    if (orden?.cliente_id) {
      const cliSel = document.getElementById('fel-cli');
      if (cliSel) {
        cliSel.value = orden.cliente_id;
        this._clienteCambio(orden.cliente_id);
      }
    }

    const { data: items } = await getSB().from('ot_items').select('*')
      .eq('orden_id', otId).order('orden_pos');
    const itemsList = items || [];
    const totalBruto = itemsList.reduce((s,i)=>s+(i.total||0), 0) || orden?.total || 0;
    const anticipo   = Number(orden?.anticipo)||0;
    /* Cobrar solo el saldo pendiente (total menos lo ya abonado) */
    const totalACobrar = Math.max(0, totalBruto - anticipo);
    if (totalACobrar <= 0 && totalBruto > 0) {
      UI.toast('Esta OT ya fue totalmente cubierta por el anticipo ✓','info');
    }
    if (totalBruto <= 0) { UI.toast('La OT no tiene monto a cobrar','info'); return; }

    this._itemsImportados = itemsList.map(i=>({
      descripcion: i.descripcion, cantidad: i.cantidad,
      precio_unit: i.precio_unit, total: i.total,
      inventario_id: i.inventario_id || null
    }));

    /* Si hay anticipo, añadir una línea negativa que lo descuente */
    if (anticipo > 0) {
      this._itemsImportados.push({
        descripcion: `Anticipo recibido previo (${orden?.num||'OT'})`,
        cantidad: 1, precio_unit: -anticipo, total: -anticipo
      });
    }

    const box = document.getElementById('fel-items-editor');
    if (box) box.innerHTML = this._renderItemsEditor();
    this._setTotales(totalACobrar);

    const notasEl = document.getElementById('fel-notas');
    if (notasEl && !notasEl.value) notasEl.value = `Importado de ${orden?.num||'OT'}`.slice(0,500);

    const msg = anticipo > 0
      ? `Importado de ${orden?.num||'OT'} · Total: ${UI.q(totalBruto)} · Anticipo descontado: ${UI.q(anticipo)} · A cobrar: ${UI.q(totalACobrar)} ✓`
      : `Importado de ${orden?.num||'OT'}: ${itemsList.length} ítem(s) · ${UI.q(totalACobrar)} ✓`;
    UI.toast(msg, 'success', 5000);
  },

  /* Importa de una cotización APROBADA todo lo cobrable: cliente, ítems y
     montos (la cotización ya guarda subtotal/IVA/total desglosados). */
  async _importarDeCotizacion(cotizacionId) {
    if (!cotizacionId) return;
    const otSel = document.getElementById('fel-ot');
    if (otSel) otSel.value = '';   // una factura solo puede traer su detalle de un origen
    const cot = await DB.getCotizacion(cotizacionId);
    if (!cot) return;

    if (cot.cliente_id) {
      const cliSel = document.getElementById('fel-cli');
      if (cliSel) {
        cliSel.value = cot.cliente_id;
        this._clienteCambio(cot.cliente_id);
      }
    }

    const itemsList = (cot.cotizacion_items||[]).map(i=>({
      descripcion: i.descripcion, cantidad: i.cantidad,
      precio_unit: i.precio_unit, total: i.total
    }));
    this._itemsImportados = itemsList;
    const box = document.getElementById('fel-items-editor');
    if (box) box.innerHTML = this._renderItemsEditor();

    if (itemsList.length) {
      this._setTotales(Number(cot.total)||0);
    } else {
      const subEl = document.getElementById('fel-sub');
      const ivaEl = document.getElementById('fel-iva');
      const totEl = document.getElementById('fel-total');
      if (subEl) subEl.value = (Number(cot.subtotal)||0).toFixed(2);
      if (ivaEl) ivaEl.value = (Number(cot.iva)||0).toFixed(2);
      if (totEl) totEl.value = (Number(cot.total)||0).toFixed(2);
    }

    const notasEl = document.getElementById('fel-notas');
    if (notasEl && !notasEl.value) notasEl.value = `Generado desde cotización ${cot.num||''}`.trim();

    UI.toast(`Importado de ${cot.num||'cotización'}: ${itemsList.length} ítem(s) · ${UI.q(cot.total)} ✓`);
  },

  /* Envía la factura al email del cliente (Edge Function email-send) */
  async enviarEmail(id) {
    const f = this._data.find(x=>x.id===id);
    if (!f) return;
    const email = f.clientes?.email;
    if (!email) { UI.toast('El cliente no tiene email registrado','error'); return; }
    const taller = Auth.tenant?.name || 'NexusPro';
    const nro = f.fel_serie ? `${f.fel_serie}-${f.fel_numero||''}` : (f.num||'—');
    const html =
      `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">` +
      `<h2 style="color:#d97706">🧾 ${taller}</h2>` +
      `<p>Estimado(a) <b>${f.nombre_receptor||f.clientes?.nombre||'cliente'}</b>, adjuntamos el detalle de su factura:</p>` +
      `<table style="width:100%;border-collapse:collapse;font-size:14px">` +
      `<tr><td style="padding:6px 0;color:#666">Factura</td><td style="text-align:right"><b>${nro}</b></td></tr>` +
      `<tr><td style="padding:6px 0;color:#666">Fecha</td><td style="text-align:right">${UI.fecha(f.fecha)}</td></tr>` +
      `<tr><td style="padding:6px 0;color:#666">NIT</td><td style="text-align:right">${f.nit||f.clientes?.nit||'CF'}</td></tr>` +
      `<tr><td style="padding:6px 0;color:#666">Subtotal</td><td style="text-align:right">${UI.q(f.subtotal)}</td></tr>` +
      `<tr><td style="padding:6px 0;color:#666">IVA</td><td style="text-align:right">${UI.q(f.iva)}</td></tr>` +
      `<tr><td style="padding:10px 0;border-top:2px solid #d97706;font-weight:800">TOTAL</td>` +
      `<td style="text-align:right;padding:10px 0;border-top:2px solid #d97706;font-weight:800;color:#d97706">${UI.q(f.total)}</td></tr>` +
      `</table>` +
      (f.notas?`<p style="font-size:12px;color:#666;margin-top:12px">${f.notas}</p>`:'') +
      `<p style="margin-top:16px">¡Gracias por su preferencia! 🔧</p></div>`;

    UI.toast('Enviando factura por email...','info');
    const r = await Email.enviar(email, `${taller} — Factura ${nro}`, { html, referencia_id: f.id });
    if (r.ok) UI.toast(`Factura enviada a ${email} ✓`);
    else UI.toast('No se pudo enviar: '+r.error,'error');
  },

  async imprimir(id) {
    const f = this._data.find(x=>x.id===id);
    if (!f) return;
    const items = await DB.getFacturaItems(id);
    const itemsHtml = items.length
      ? `<hr><table style="width:100%;border-collapse:collapse;font-size:11px">
           <tr style="border-bottom:1px solid #000"><th style="text-align:left">Descripción</th><th style="text-align:right">Cant</th><th style="text-align:right">P.U.</th><th style="text-align:right">Total</th></tr>
           ${items.map(i=>`<tr><td>${i.descripcion||'—'}</td><td style="text-align:right">${i.cantidad}</td><td style="text-align:right">${Number(i.precio_unit).toFixed(2)}</td><td style="text-align:right">${Number(i.total).toFixed(2)}</td></tr>`).join('')}
         </table>`
      : '';
    const win = window.open('','_blank');
    const nroDoc = f.fel_serie ? `${f.fel_serie}-${f.fel_numero||''}` : (f.num||'—');
    win.document.write(`<html><head><title>Factura ${nroDoc}</title>
      <style>body{font-family:monospace;padding:20px;max-width:400px}h2{text-align:center}.total{font-size:20px;font-weight:bold}table{margin:8px 0}th,td{padding:2px 0}</style></head>
      <body><h2>${Auth.tenant?.name||'NexusPro'}</h2>
      <p>NIT: ${Auth.tenant?.nit||'—'} | ${Auth.tenant?.tel||''}</p>
      <hr><p><b>Factura:</b> ${nroDoc}</p>
      <p><b>Fecha:</b> ${UI.fecha(f.fecha)}</p>
      <p><b>Cliente:</b> ${f.nombre_receptor||f.clientes?.nombre||'CF'} | NIT: ${f.nit||f.clientes?.nit||'CF'}</p>
      ${itemsHtml}
      <hr><p>Subtotal: Q${f.subtotal?.toFixed(2)}</p>
      <p>IVA (12%): Q${f.iva?.toFixed(2)}</p>
      <p class="total">TOTAL: Q${f.total?.toFixed(2)}</p>
      <p><b>Método de pago:</b> ${f.metodo_pago||'Efectivo'}</p>
      <hr><p style="text-align:center;font-size:10px">Documento tributario electrónico FEL</p>
      <script>window.print();</script></body></html>`);
    win.document.close();
  },

  async anularFactura(id) {
    UI.modal('⚠️ Anular Factura', `
      <div style="text-align:left;line-height:1.6">
        <p>¿Anular esta factura? Esta acción es <b>irreversible</b> y se reportará en el formulario SAT-2237 como factura anulada.</p>
        <div style="display:flex;gap:8px;margin-top:20px">
          <button class="btn btn-red" onclick="Modulos.facturacion._confirmarAnular('${id}')">Anular Factura</button>
          <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        </div>
      </div>
    `, '400px');
  },

  async _confirmarAnular(id) {
    const { error } = await DB.anularFactura(id);
    if (error) return UI.toast('Error al anular: '+error.message, 'error');
    UI.toast('Factura anulada ✓', 'success');
    UI.cerrarModal();
    this.render();
  }
};
