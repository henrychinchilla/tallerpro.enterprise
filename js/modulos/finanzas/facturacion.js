/* TallerPro v3.0 — facturacion/index.js */
Modulos.facturacion = {
  _data: [], _clientes: [], _ordenes: [], _cotizaciones: [],
  _ini: null, _fin: null,
  _itemsImportados: [],   // líneas de detalle traídas de una OT o cotización (para guardar al emitir)

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const now = new Date();
    if (!this._ini) {
      this._ini = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
      this._fin = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
    }
    [this._data, this._clientes, this._ordenes, this._cotizaciones] = await Promise.all([
      DB.getFacturas(this._ini, this._fin), DB.getClientes(), DB.getOrdenes(), DB.getCotizaciones({estado:'aprobada'})
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
                  <button class="btn btn-sm btn-ghost" onclick="Modulos.facturacion.imprimir('${f.id}')">🖨</button>
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
    if (!id) this._itemsImportados = [];   // factura nueva: limpiar desglose previo
    const itemsExistentes = id ? await DB.getFacturaItems(id) : [];

    UI.modal(`${esEdicion?'🧾 Ver':'＋ Nueva'} Factura`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual de la factura.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cliente *</label>
          <select class="form-select" id="fel-cli">
            <option value="">Consumidor Final (CF)</option>
            ${this._clientes.map(c=>`<option value="${c.id}" ${f.cliente_id===c.id?'selected':''}>${c.nombre} — ${c.nit||'CF'}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Orden de Trabajo</label>
          <select class="form-select" id="fel-ot" onchange="Modulos.facturacion._importarDeOT(this.value)">
            <option value="">Sin OT</option>
            ${this._ordenes.filter(o=>o.estado!=='cancelado').map(o=>`<option value="${o.id}" ${(f.ot_id||f.orden_id)===o.id?'selected':''}>${o.num} — ${UI.q(o.total)}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Cotización aprobada</label>
          <select class="form-select" id="fel-cot" onchange="Modulos.facturacion._importarDeCotizacion(this.value)">
            <option value="">Sin cotización</option>
            ${this._cotizaciones.map(c=>`<option value="${c.id}" ${f.cotizacion_id===c.id?'selected':''}>${c.num||'—'} — ${c.clientes?.nombre||''} — ${UI.q(c.total)}</option>`).join('')}
          </select></div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin:-8px 0 12px">Al elegir una OT o una cotización aprobada se importan cliente, montos e ítems a cobrar.</div>
      <div id="fel-items-box">${this._renderItemsBox(itemsExistentes)}</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Serie FEL (opcional)</label>
          <input class="form-input" id="fel-serie" value="${f.fel_serie||''}" maxlength="10" placeholder="Serie autorizada FEL"></div>
        <div class="form-group"><label class="form-label">Fecha *</label>
          <input class="form-input" id="fel-fecha" type="date" value="${f.fecha||new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Subtotal (Q) *</label>
          <input class="form-input" id="fel-sub" type="number" value="${f.subtotal||''}" step="0.01"
                 oninput="const s=parseFloat(this.value)||0;document.getElementById('fel-iva').value=(s*${iva}).toFixed(2);document.getElementById('fel-total').value=(s*(1+${iva})).toFixed(2)"></div>
        <div class="form-group"><label class="form-label">IVA ${Math.round(iva*100)}% (Q)</label>
          <input class="form-input" id="fel-iva" type="number" value="${f.iva||''}" step="0.01" readonly></div>
      </div>
      <div class="form-group"><label class="form-label">Total (Q)</label>
        <input class="form-input" id="fel-total" type="number" value="${f.total||''}" step="0.01" readonly
               style="font-size:18px;font-weight:800;color:var(--amber)"></div>
      <div class="form-group"><label class="form-label">Método de Pago</label>
        <select class="form-select" id="fel-metodo">
          ${['Efectivo','Tarjeta','Transferencia','Cheque','Depósito','Crédito'].map(m=>`<option ${(f.metodo_pago||'Efectivo')===m?'selected':''}>${m}</option>`).join('')}
        </select></div>
      ${esEdicion?`<div class="form-group"><label class="form-label">Estado</label>
        <select class="form-select" id="fel-estado">
          ${['borrador','pendiente','certificada','anulada'].map(s=>`<option ${f.estado===s?'selected':''}>${s}</option>`).join('')}
        </select></div>`:''}
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="fel-notas" rows="2">${f.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.facturacion.guardar('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Emitir Factura'}
        </button>
      </div>`,'580px');
    if (!id && cotizacionId) await this._importarDeCotizacion(cotizacionId);
  },

  /* Abre Facturación con una cotización aprobada lista para emitir
     (entrada rápida desde el módulo de Cotizaciones). */
  async facturarCotizacion(cotizacionId) {
    App.navegarA('facturacion');
    if (App.paginaActual !== 'facturacion') return;   // sin acceso (navegarA ya mostró el aviso)
    await this.render();
    await this.modalFactura(null, cotizacionId);
  },

  /* Tabla de desglose (una línea por ítem cobrado) */
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
    if (cli?.nit && !NIT.validarLocal(cli.nit).valido) {
      UI.toast('Aviso: el NIT del cliente tiene dígito verificador inválido','warn');
    }
    const fields = {
      cliente_id: cliId,
      ot_id:      document.getElementById('fel-ot')?.value||null,
      cotizacion_id: document.getElementById('fel-cot')?.value||null,
      nit:        cli?.nit?.trim() || 'CF',
      nombre_receptor: cli?.nombre || 'Consumidor Final',
      tipo_cliente: (cli?.nit && cli.nit.toUpperCase()!=='CF') ? 'NIT' : 'CF',
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
    this.render();
  },

  /* Importa de una OT todo lo cobrable: cliente, montos (IVA incluido en la
     OT → se desglosa) y el detalle de ítems hacia las notas. */
  async _importarDeOT(otId) {
    if (!otId) return;
    const cotSel = document.getElementById('fel-cot');
    if (cotSel) cotSel.value = '';   // una factura solo puede traer su detalle de un origen
    const iva = Auth.tenant?.tasa_iva || 0.12;
    const orden = this._ordenes.find(o => o.id === otId);

    /* Cliente desde la OT */
    if (orden?.cliente_id) {
      const cliSel = document.getElementById('fel-cli');
      if (cliSel) cliSel.value = orden.cliente_id;
    }

    /* Ítems a cobrar */
    const { data: items } = await getSB().from('ot_items').select('*')
      .eq('orden_id', otId).order('orden_pos');
    const itemsList = items || [];
    const totalConIva = itemsList.reduce((s,i)=>s+(i.total||0), 0) || orden?.total || 0;
    if (totalConIva <= 0) { UI.toast('La OT no tiene monto a cobrar','info'); return; }

    /* Guardar el desglose (una línea por ítem) para persistirlo al emitir */
    this._itemsImportados = itemsList.map(i=>({
      descripcion: i.descripcion, cantidad: i.cantidad,
      precio_unit: i.precio_unit, total: i.total,
      inventario_id: i.inventario_id || null
    }));
    const box = document.getElementById('fel-items-box');
    if (box) box.innerHTML = this._renderItemsBox(this._itemsImportados);

    const sub      = Math.round(totalConIva/(1+iva)*100)/100;
    const ivaMonto = Math.round((totalConIva - sub)*100)/100;

    const subEl = document.getElementById('fel-sub');
    const ivaEl = document.getElementById('fel-iva');
    const totEl = document.getElementById('fel-total');
    if (subEl) subEl.value = sub.toFixed(2);
    if (ivaEl) ivaEl.value = ivaMonto.toFixed(2);
    if (totEl) totEl.value = totalConIva.toFixed(2);

    /* Detalle de ítems en notas (lo que se debe cobrar) */
    const desc = itemsList.map(i=>`${i.descripcion} (${i.cantidad} x ${UI.q(i.precio_unit)})`).join(' | ');
    const notasEl = document.getElementById('fel-notas');
    if (notasEl && desc) notasEl.value = desc.slice(0,500);

    UI.toast(`Importado de ${orden?.num||'OT'}: ${itemsList.length} ítem(s) · ${UI.q(totalConIva)} ✓`);
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
      if (cliSel) cliSel.value = cot.cliente_id;
    }

    const itemsList = (cot.cotizacion_items||[]).map(i=>({
      descripcion: i.descripcion, cantidad: i.cantidad,
      precio_unit: i.precio_unit, total: i.total
    }));
    this._itemsImportados = itemsList;
    const box = document.getElementById('fel-items-box');
    if (box) box.innerHTML = this._renderItemsBox(itemsList);

    const subEl = document.getElementById('fel-sub');
    const ivaEl = document.getElementById('fel-iva');
    const totEl = document.getElementById('fel-total');
    if (subEl) subEl.value = (Number(cot.subtotal)||0).toFixed(2);
    if (ivaEl) ivaEl.value = (Number(cot.iva)||0).toFixed(2);
    if (totEl) totEl.value = (Number(cot.total)||0).toFixed(2);

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
    const taller = Auth.tenant?.name || 'TallerPro';
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
      <body><h2>${Auth.tenant?.name||'TallerPro'}</h2>
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
  }
};
