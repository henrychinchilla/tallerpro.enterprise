/* TallerPro v3.0 — facturacion/index.js */
Modulos.facturacion = {
  _data: [], _clientes: [], _ordenes: [],
  _ini: null, _fin: null,

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const now = new Date();
    if (!this._ini) {
      this._ini = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
      this._fin = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
    }
    [this._data, this._clientes, this._ordenes] = await Promise.all([
      DB.getFacturas(this._ini, this._fin), DB.getClientes(), DB.getOrdenes()
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
            <thead><tr><th>Serie/No.</th><th>Cliente</th><th>NIT</th><th>Fecha</th><th>Subtotal</th><th>IVA</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${this._data.map(f=>`<tr>
                <td class="mono-sm"><b>${f.serie||'A'}-${f.num_fel||'—'}</b></td>
                <td>${f.clientes?.nombre||'CF'}</td>
                <td class="mono-sm">${f.clientes?.nit||'CF'}</td>
                <td>${UI.fecha(f.fecha)}</td>
                <td class="mono-sm">${UI.q(f.subtotal)}</td>
                <td class="mono-sm">${UI.q(f.iva)}</td>
                <td class="mono-sm text-amber"><b>${UI.q(f.total)}</b></td>
                <td><span class="badge badge-${f.estado==='emitida'?'green':f.estado==='anulada'?'red':'amber'}">${f.estado}</span></td>
                <td><div style="display:flex;gap:4px">
                  <button class="btn btn-sm btn-cyan" onclick="Modulos.facturacion.modalFactura('${f.id}')">Ver</button>
                  <button class="btn btn-sm btn-ghost" onclick="Modulos.facturacion.imprimir('${f.id}')">🖨</button>
                </div></td>
              </tr>`).join('')||'<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text3)">Sin facturas en este período</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  modalFactura(id=null) {
    const f = id ? this._data.find(x=>x.id===id) : {};
    const esEdicion = !!id;
    const iva = Auth.tenant?.tasa_iva || 0.12;

    UI.modal(`${esEdicion?'🧾 Ver':'＋ Nueva'} Factura`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual de la factura.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cliente *</label>
          <select class="form-select" id="fel-cli">
            <option value="">Consumidor Final (CF)</option>
            ${this._clientes.map(c=>`<option value="${c.id}" ${f.cliente_id===c.id?'selected':''}>${c.nombre} — ${c.nit||'CF'}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Orden de Trabajo</label>
          <select class="form-select" id="fel-ot">
            <option value="">Sin OT</option>
            ${this._ordenes.filter(o=>o.estado!=='cancelado').map(o=>`<option value="${o.id}" ${f.orden_id===o.id?'selected':''}>${o.num} — ${UI.q(o.total)}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Serie FEL</label>
          <input class="form-input" id="fel-serie" value="${f.serie||'A'}" maxlength="10"></div>
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
      ${esEdicion?`<div class="form-group"><label class="form-label">Estado</label>
        <select class="form-select" id="fel-estado">
          ${['emitida','pendiente','anulada'].map(s=>`<option ${f.estado===s?'selected':''}>${s}</option>`).join('')}
        </select></div>`:''}
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="fel-notas" rows="2">${f.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.facturacion.guardar('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Emitir Factura'}
        </button>
      </div>`,'580px');
  },

  async guardar(id='') {
    const sub = parseFloat(document.getElementById('fel-sub')?.value)||0;
    if (sub<=0) { UI.toast('El subtotal es obligatorio','error'); return; }
    const iva   = parseFloat(document.getElementById('fel-iva')?.value)||0;
    const total = parseFloat(document.getElementById('fel-total')?.value)||0;
    const fields = {
      cliente_id: document.getElementById('fel-cli')?.value||null,
      orden_id:   document.getElementById('fel-ot')?.value||null,
      serie:      document.getElementById('fel-serie')?.value||'A',
      fecha:      document.getElementById('fel-fecha')?.value,
      subtotal:   sub, iva, total,
      estado:     document.getElementById('fel-estado')?.value||'emitida',
      notas:      document.getElementById('fel-notas')?.value||null
    };
    if (id) fields.id = id;
    const {error} = await DB.upsertFactura(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Factura actualizada ✓':'Factura emitida ✓');
    this.render();
  },

  imprimir(id) {
    const f = this._data.find(x=>x.id===id);
    if (!f) return;
    const win = window.open('','_blank');
    win.document.write(`<html><head><title>Factura ${f.serie}-${f.num_fel}</title>
      <style>body{font-family:monospace;padding:20px;max-width:400px}h2{text-align:center}.total{font-size:20px;font-weight:bold}</style></head>
      <body><h2>${Auth.tenant?.name||'TallerPro'}</h2>
      <p>NIT: ${Auth.tenant?.nit||'—'} | ${Auth.tenant?.tel||''}</p>
      <hr><p><b>Factura:</b> ${f.serie||'A'}-${f.num_fel||'—'}</p>
      <p><b>Fecha:</b> ${UI.fecha(f.fecha)}</p>
      <p><b>Cliente:</b> ${f.clientes?.nombre||'CF'} | NIT: ${f.clientes?.nit||'CF'}</p>
      <hr><p>Subtotal: Q${f.subtotal?.toFixed(2)}</p>
      <p>IVA (12%): Q${f.iva?.toFixed(2)}</p>
      <p class="total">TOTAL: Q${f.total?.toFixed(2)}</p>
      <hr><p style="text-align:center;font-size:10px">Documento tributario electrónico FEL</p>
      <script>window.print();</script></body></html>`);
    win.document.close();
  }
};
