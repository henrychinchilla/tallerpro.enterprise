/* TallerPro v3.0 — operacion/compras.js
   Compras de insumos/repuestos/aceites: captura precios, actualiza el
   inventario (stock + costo), registra el egreso (cuenta de egresos /
   Finanzas) y guarda el historial. Se compara contra el presupuesto. */
Modulos.compras = {
  _inv: [], _prov: [], _ri: 0,

  _fiscal: null,

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const anio = new Date().getFullYear();
    let compras = [], presCompras = 0, felSinImportar = [];
    [this._inv, this._prov, compras, presCompras, this._fiscal, felSinImportar] = await Promise.all([
      DB.getInventario(), DB.getProveedores(), DB.getCompras(), DB.getPresupuestoCompras(anio).catch(()=>0),
      DB.getConfigFiscal().catch(()=>({})), DB.getFelSinImportar('recibida').catch(()=>[])
    ]);
    const mesIni = `${anio}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`;
    const vivas = compras.filter(c => c.estado !== 'anulada');
    const totalAnio = vivas.filter(c => (c.fecha||'') >= `${anio}-01-01`).reduce((s,c)=>s+(Number(c.total)||0),0);
    const totalMes  = vivas.filter(c => (c.fecha||'') >= mesIni).reduce((s,c)=>s+(Number(c.total)||0),0);
    const pct = presCompras > 0 ? Math.round(totalAnio/presCompras*100) : 0;

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🛒 Compras</h1>
        <p class="page-subtitle">// ${vivas.length} compras registradas</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.compras.modalCompra()">＋ Nueva Compra</button>
        </div>
      </div>
      <div class="page-body">
        ${felSinImportar.length > 0 ? `
        <div class="card" style="background:linear-gradient(135deg,var(--cyan)15 0%,var(--blue)15 100%);margin-bottom:16px;border-left:4px solid var(--cyan)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <div class="card-sub" style="margin:0;color:var(--cyan)">📥 Importar desde FEL del SAT</div>
              <p style="font-size:12px;color:var(--text2);margin:6px 0 0 0">
                <b>${felSinImportar.length} facturas recibidas</b> del FEL disponibles para importar como compras.
                Total: <b>${UI.q(felSinImportar.reduce((s,f)=>s+(Number(f.gran_total)||0),0))}</b>
              </p>
            </div>
            <button class="btn btn-cyan" onclick="Modulos.compras._importarFel()">
              ⬆️ Importar todo (${felSinImportar.length})
            </button>
          </div>
        </div>` : ''}
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'🛒', clase:'red', label:'Compras del mes', value: totalMes, money:true })}
          ${UI.kpiCard({ icon:'📦', clase:'amber', label:'Compras del año', value: totalAnio, money:true })}
          ${UI.kpiCard({ icon:'🎯', clase:'cyan', label:`Presupuesto compras ${anio}`, value: presCompras>0?UI.q(presCompras):'—',
            trend: presCompras>0?`<span style="color:${pct>100?'var(--red)':'var(--green)'}">${pct}% ejecutado</span>`:'Define metas en Presupuesto' })}
        </div>
        ${presCompras>0?`<div style="height:8px;background:var(--surface2);border-radius:4px;overflow:hidden;margin-bottom:16px">
          <div style="height:100%;width:${Math.min(100,pct)}%;background:var(--${pct>100?'red':pct>85?'amber':'green'})"></div></div>`:''}
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>No.</th><th>Fecha</th><th>Proveedor</th><th>No. Factura</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${compras.map(c=>`<tr style="cursor:pointer;${c.estado==='anulada'?'opacity:.5':''}" onclick="Modulos.compras.verCompra('${c.id}')">
              <td class="mono-sm"><b class="text-amber">${c.num||''}</b></td>
              <td class="mono-sm">${UI.fecha(c.fecha)}</td>
              <td>${c.proveedor_nombre||'—'}</td>
              <td class="mono-sm">${c.num_factura||'—'}</td>
              <td class="mono-sm text-red"><b>${UI.q(c.total)}</b></td>
              <td><span class="badge badge-${c.estado==='recibida'?'green':c.estado==='anulada'?'red':'amber'}">${c.estado}</span></td>
              <td onclick="event.stopPropagation()"><button class="btn btn-sm btn-cyan" onclick="Modulos.compras.verCompra('${c.id}')">👁 Ver</button></td>
            </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin compras. Registra la primera con “＋ Nueva Compra”.</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  },

  _invOpts(sel='') {
    return `<option value="">— Libre / nuevo —</option>` +
      this._inv.map(a=>`<option value="${a.id}" ${sel===a.id?'selected':''} data-nombre="${(a.nombre||'').replace(/"/g,'&quot;')}" data-cat="${(a.categoria||'').replace(/"/g,'&quot;')}" data-costo="${a.precio_costo||0}">${a.nombre}${a.codigo?` (${a.codigo})`:''}</option>`).join('');
  },

  _filaHtml(idx) {
    return `<tr id="cmp-fila-${idx}">
      <td style="min-width:160px"><select class="form-select" id="cmp-inv-${idx}" onchange="Modulos.compras._onPickInv(${idx})" style="font-size:12px">${this._invOpts()}</select></td>
      <td><input class="form-input" id="cmp-desc-${idx}" placeholder="Descripción" style="font-size:12px"></td>
      <td style="width:110px"><input class="form-input" id="cmp-cat-${idx}" placeholder="Categoría" style="font-size:12px"></td>
      <td style="width:80px"><input class="form-input" id="cmp-cant-${idx}" type="number" min="0" step="0.01" value="1" oninput="Modulos.compras._calcFila(${idx})" style="font-size:12px"></td>
      <td style="width:100px"><input class="form-input" id="cmp-costo-${idx}" type="number" min="0" step="0.01" value="0" oninput="Modulos.compras._calcFila(${idx})" style="font-size:12px"></td>
      <td style="width:90px;text-align:right" class="mono-sm text-amber" id="cmp-tot-${idx}">Q0.00</td>
      <td style="width:30px"><button class="btn btn-sm btn-ghost" onclick="document.getElementById('cmp-fila-${idx}').remove();Modulos.compras._calcTotal()">✕</button></td>
    </tr>`;
  },

  modalCompra() {
    this._ri = 0;
    const esImportadora = !!this._fiscal?.es_importadora;
    UI.modal('🛒 Nueva Compra', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Proveedor</label>
          <select class="form-select" id="cmp-prov">
            <option value="">Sin proveedor</option>
            ${this._prov.map(p=>`<option value="${p.id}" data-nombre="${(p.nombre||'').replace(/"/g,'&quot;')}">${p.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">No. de factura / DUA</label>
          <input class="form-input" id="cmp-factura" placeholder="${esImportadora?'DUA o Serie-Número':'Serie-Número'}"></div>
      </div>
      <div class="form-group"><label class="form-label">Fecha</label>
        <input class="form-input" id="cmp-fecha" type="date" value="${new Date().toISOString().slice(0,10)}" style="max-width:200px"></div>
      ${esImportadora ? `
      <div style="border:1px solid var(--cyan,#0e7490);border-radius:8px;padding:12px 14px;margin-bottom:12px;background:var(--cyan-dim,#083344)">
        <div style="font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--cyan,#22d3ee);margin-bottom:8px">📦 Importación — campos DUA/DAI</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">No. DUA</label>
            <input class="form-input" id="cmp-dua" placeholder="00000-000-0000-000"></div>
          <div class="form-group"><label class="form-label">Valor CIF (Q)</label>
            <input class="form-input" id="cmp-cif" type="number" step="0.01" placeholder="0.00" oninput="Modulos.compras._calcImport()"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">DAI — Derecho Arancelario (Q)</label>
            <input class="form-input" id="cmp-dai" type="number" step="0.01" placeholder="0.00" oninput="Modulos.compras._calcImport()"></div>
          <div class="form-group"><label class="form-label">IVA en frontera (Q)</label>
            <input class="form-input" id="cmp-iva-frontera" type="number" step="0.01" placeholder="0.00" oninput="Modulos.compras._calcImport()"></div>
        </div>
        <div style="font-size:11px;color:var(--text3)">El IVA en frontera es crédito fiscal. El DAI va al costo de los artículos. Ambos aparecerán en el Libro de Compras.</div>
      </div>` : ''}
      <label class="form-label">Artículos comprados</label>
      <div class="table-wrap" style="max-height:280px;overflow-y:auto">
        <table class="data-table" style="font-size:12px">
          <thead><tr><th>Artículo (inventario)</th><th>Descripción</th><th>Categoría</th><th>Cant.</th><th>Costo U.</th><th>Total</th><th></th></tr></thead>
          <tbody id="cmp-rows"></tbody>
        </table>
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="Modulos.compras.addFila()">＋ Agregar línea</button>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;border-top:2px solid var(--border);padding-top:10px">
        <span style="font-weight:700">Total de la compra</span>
        <span id="cmp-total" style="font-size:20px;font-weight:800" class="text-amber">Q0.00</span>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">Se suma al inventario (stock + costo) y se registra como egreso en la cuenta de egresos.</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.compras.guardarCompra()">Registrar Compra</button>
      </div>`, '760px');
    this.addFila(); this.addFila();
  },

  _calcImport() {
    const cif = parseFloat(document.getElementById('cmp-cif')?.value)||0;
    const dai = parseFloat(document.getElementById('cmp-dai')?.value)||0;
    /* IVA frontera = 12% × (CIF + DAI) si no fue llenado manualmente */
    const ivaEl = document.getElementById('cmp-iva-frontera');
    if (ivaEl && !ivaEl.dataset.manual && (cif > 0 || dai > 0)) {
      ivaEl.value = ((cif + dai) * 0.12).toFixed(2);
    }
  },

  addFila() {
    const tb = document.getElementById('cmp-rows');
    if (tb) tb.insertAdjacentHTML('beforeend', this._filaHtml(this._ri++));
  },

  _onPickInv(idx) {
    const sel = document.getElementById(`cmp-inv-${idx}`);
    const opt = sel?.options[sel.selectedIndex];
    if (!opt || !sel.value) return;
    const d = document.getElementById(`cmp-desc-${idx}`); if (d) d.value = opt.dataset.nombre||'';
    const c = document.getElementById(`cmp-cat-${idx}`); if (c) c.value = opt.dataset.cat||'';
    const co = document.getElementById(`cmp-costo-${idx}`); if (co && opt.dataset.costo) co.value = opt.dataset.costo;
    this._calcFila(idx);
  },

  _calcFila(idx) {
    const cant = parseFloat(document.getElementById(`cmp-cant-${idx}`)?.value)||0;
    const costo = parseFloat(document.getElementById(`cmp-costo-${idx}`)?.value)||0;
    const tot = document.getElementById(`cmp-tot-${idx}`);
    if (tot) tot.textContent = UI.q(cant*costo);
    this._calcTotal();
  },

  _calcTotal() {
    let total = 0;
    document.querySelectorAll('#cmp-rows tr').forEach(tr => {
      const i = tr.id.replace('cmp-fila-','');
      const cant = parseFloat(document.getElementById(`cmp-cant-${i}`)?.value)||0;
      const costo = parseFloat(document.getElementById(`cmp-costo-${i}`)?.value)||0;
      total += cant*costo;
    });
    const el = document.getElementById('cmp-total'); if (el) el.textContent = UI.q(total);
  },

  async guardarCompra() {
    const items = [];
    document.querySelectorAll('#cmp-rows tr').forEach(tr => {
      const i = tr.id.replace('cmp-fila-','');
      const desc = document.getElementById(`cmp-desc-${i}`)?.value.trim();
      const cant = parseFloat(document.getElementById(`cmp-cant-${i}`)?.value)||0;
      const costo = parseFloat(document.getElementById(`cmp-costo-${i}`)?.value)||0;
      if (!desc || cant<=0) return;
      items.push({
        inventario_id: document.getElementById(`cmp-inv-${i}`)?.value||null,
        descripcion: desc, categoria: document.getElementById(`cmp-cat-${i}`)?.value||null,
        cantidad: cant, costo_unit: costo, total: cant*costo
      });
    });
    if (!items.length) { UI.toast('Agrega al menos un artículo con cantidad','error'); return; }
    const provSel = document.getElementById('cmp-prov');
    const provOpt = provSel?.options[provSel.selectedIndex];
    UI.toast('Registrando compra...','info');
    const { data, error } = await DB.registrarCompra({
      cabecera: {
        proveedor_id: provSel?.value||null,
        proveedor_nombre: provSel?.value ? (provOpt?.dataset.nombre||null) : null,
        num_factura: document.getElementById('cmp-factura')?.value.trim()||null,
        fecha: document.getElementById('cmp-fecha')?.value||null,
        num_dua: document.getElementById('cmp-dua')?.value.trim()||null,
        cif_valor: parseFloat(document.getElementById('cmp-cif')?.value)||0,
        dai_monto: parseFloat(document.getElementById('cmp-dai')?.value)||0,
        iva_frontera: parseFloat(document.getElementById('cmp-iva-frontera')?.value)||0,
        es_importacion: !!(document.getElementById('cmp-dua')?.value.trim())
      }, items
    });
    if (error || !data) { UI.toast('Error: '+(error?.message||''),'error'); return; }
    UI.cerrarModal();
    UI.toast(`Compra ${data.num} registrada ✓ — inventario y egreso actualizados`);
    this.render();
  },

  async verCompra(id) {
    const compras = await DB.getCompras();
    const c = compras.find(x=>x.id===id);
    if (!c) return;
    const items = await DB.getCompraItems(id);
    UI.modal(`🛒 Compra ${c.num||''}`, `
      <div style="font-size:13px;margin-bottom:10px">
        <b>${c.proveedor_nombre||'Sin proveedor'}</b> · ${UI.fecha(c.fecha)}${c.num_factura?` · Factura ${c.num_factura}`:''}
      </div>
      <div class="table-wrap"><table class="data-table" style="font-size:12px">
        <thead><tr><th>Artículo</th><th>Cant.</th><th>Costo U.</th><th>Total</th></tr></thead>
        <tbody>${items.map(i=>`<tr><td>${i.descripcion}${i.inventario_id?' <span class="badge badge-cyan" style="font-size:9px">inventario</span>':''}</td><td class="mono-sm">${i.cantidad}</td><td class="mono-sm">${UI.q(i.costo_unit)}</td><td class="mono-sm text-amber">${UI.q(i.total)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div style="display:flex;justify-content:space-between;font-weight:800;margin-top:10px;border-top:2px solid var(--border);padding-top:8px">
        <span>Total</span><span class="text-amber">${UI.q(c.total)}</span>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button></div>`, '600px');
  },

  async _importarFel() {
    const felSinImportar = await DB.getFelSinImportar('recibida').catch(()=>[]);
    if (!felSinImportar.length) { UI.toast('No hay facturas disponibles para importar','info'); return; }

    const ok = await UI.confirmar(`¿Crear ${felSinImportar.length} compras desde el FEL del SAT?<br>
      <span style="font-size:12px;color:var(--text2)">Total: <b>${UI.q(felSinImportar.reduce((s,f)=>s+(Number(f.gran_total)||0),0))}</b></span>`, 'Importar');
    if (!ok) return;

    UI.toast('Importando compras desde FEL...','info');
    const felIds = felSinImportar.map(f => f.id);
    const { count, omitidas, errors } = await DB.crearComprasDesdeFeL(felIds);
    if (errors) UI.toast(`Se crearon ${count} compras (${errors} errores)`, 'error');
    else if (count === 0) UI.toast('Todas las facturas ya estaban registradas','info');
    else UI.toast(`✓ ${count} compras creadas${omitidas>0?` · ${omitidas} ya existían`:''}`);
    this.render();
  }
};
