/* TallerPro v3.0 — agropecuaria/venta_granos.js
   Módulo vertical: Venta de Granos. Comercialización de maíz, frijol, trigo,
   sorgo, cebada con inventario, cotizaciones, facturación FEL y análisis de precios. */
Modulos.venta_granos = {
  _data: [], _clientes: [], _proveedores: [], _filtroGrano: '',

  _TIPOS_GRANO: {
    maiz:'Maíz', frijol:'Frijol', trigo:'Trigo',
    sorgo:'Sorgo', cebada:'Cebada', otros:'Otros Granos'
  },
  _ESTADOS: { cotizado:'Cotizado', pendiente:'Pendiente', vendido:'Vendido', entregado:'Entregado', cancelado:'Cancelado' },
  _colorEstado(e) { return { cotizado:'gray', pendiente:'amber', vendido:'cyan', entregado:'green', cancelado:'red' }[e]||'gray'; },

  async render(filtroGrano='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._filtroGrano = filtroGrano;
    [this._data, this._clientes, this._proveedores] = await Promise.all([
      DB.getVentaGranos(filtroGrano ? { tipo_grano: filtroGrano } : {}),
      DB.getClientes(),
      DB.getProveedores()
    ]);

    const pendientes = this._data.filter(v=>['cotizado','pendiente'].includes(v.estado)).length;
    const vendidos = this._data.filter(v=>v.estado==='vendido').length;
    const totalKg = this._data.reduce((s,v)=>s+(Number(v.cantidad_kg)||0),0);
    const ingresoTotal = this._data.reduce((s,v)=>s+(v.estado==='vendido'?Number(v.total)||0:0),0);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🌽 Venta de Granos</h1>
        <p class="page-subtitle">// ${this._data.length} transacciones registradas</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.venta_granos.modalForm()">＋ Nueva Transacción</button>
        </div>
      </div>
      <div class="page-body">
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'🌽', clase:'cyan', label:'Pendientes', value: pendientes })}
          ${UI.kpiCard({ icon:'✓', clase:'green', label:'Vendidos', value: vendidos })}
          ${UI.kpiCard({ icon:'📦', clase:'amber', label:'Total (kg)', value: totalKg, format:'number' })}
          ${UI.kpiCard({ icon:'💰', clase:'green', label:'Ingresos', value: ingresoTotal, money:true })}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn btn-sm ${!filtroGrano?'btn-cyan':'btn-ghost'}" onclick="Modulos.venta_granos.render('')">Todos</button>
          ${Object.entries(this._TIPOS_GRANO).map(([k,l])=>`<button class="btn btn-sm ${filtroGrano===k?'btn-cyan':'btn-ghost'}" onclick="Modulos.venta_granos.render('${k}')">${l}</button>`).join('')}
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>No.</th><th>Grano</th><th>Cliente</th><th>Cantidad (kg)</th><th>Precio/kg</th><th>Total</th><th>Documento</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
          <tbody>
            ${this._data.map(v=>`<tr>
              <td class="mono-sm"><b>${v.num||'—'}</b></td>
              <td><span class="badge badge-green">${this._TIPOS_GRANO[v.tipo_grano]||v.tipo_grano}</span></td>
              <td>${v.clientes?.nombre||v.proveedores?.nombre||'—'}</td>
              <td class="mono-sm">${UI.numero(v.cantidad_kg)}</td>
              <td class="mono-sm">${UI.q(v.precio_kg)}</td>
              <td class="mono-sm" style="font-weight:700">${UI.q(v.total)}</td>
              <td><span class="badge badge-${v.es_compra?'purple':'cyan'}">${v.es_compra?'🔽 Compra':'🔺 Venta'}</span></td>
              <td><span class="badge badge-${this._colorEstado(v.estado)}">${this._ESTADOS[v.estado]||v.estado}</span></td>
              <td class="mono-sm">${UI.fecha(v.fecha)}</td>
              <td><div style="display:flex;gap:4px;flex-wrap:wrap">
                ${Modulos.btnAccion('ver', `Modulos.venta_granos.verDetalle('${v.id}')`)}
                ${Modulos.btnAccion('editar', `Modulos.venta_granos.modalForm('${v.id}')`)}
                ${v.estado==='vendido'?`<button class="btn btn-sm btn-cyan" onclick="Modulos.venta_granos._facturar('${v.id}')" title="Facturar FEL">🧾</button>`:''}
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('venta_granos','${v.id}','la transacción ${v.num||''}',()=>Modulos.venta_granos.render(Modulos.venta_granos._filtroGrano))`)}
              </div></td>
            </tr>`).join('')||'<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text3)">Sin transacciones. Registra la primera con "＋ Nueva Transacción".</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  },

  async verDetalle(id) {
    const v = this._data.find(x=>x.id===id); if (!v) return;
    UI.modal(`📋 Transacción ${v.num||''}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><div style="font-size:11px;color:var(--text3)">Tipo</div><div><span class="badge badge-${v.es_compra?'purple':'cyan'}">${v.es_compra?'🔽 Compra':'🔺 Venta'}</span></div></div>
        <div><div style="font-size:11px;color:var(--text3)">Grano</div><div>${this._TIPOS_GRANO[v.tipo_grano]||v.tipo_grano}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">${v.es_compra?'Proveedor':'Cliente'}</div><div style="font-weight:700">${v.es_compra?(v.proveedores?.nombre||'—'):(v.clientes?.nombre||'—')}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Cantidad (kg)</div><div class="mono-sm" style="font-weight:700">${UI.numero(v.cantidad_kg)}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Precio/kg</div><div class="mono-sm" style="font-weight:700">${UI.q(v.precio_kg)}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Total</div><div class="mono-sm" style="font-weight:700;color:var(--green)">${UI.q(v.total)}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Estado</div><div><span class="badge badge-${this._colorEstado(v.estado)}">${this._ESTADOS[v.estado]||v.estado}</span></div></div>
        <div><div style="font-size:11px;color:var(--text3)">Fecha</div><div>${UI.fecha(v.fecha)}</div></div>
        <div style="grid-column:1/-1"><div style="font-size:11px;color:var(--text3)">Notas</div><div style="font-size:12px">${v.notas||'—'}</div></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
      </div>`, '520px');
  },

  modalForm(id=null) {
    const v = id ? this._data.find(x=>x.id===id) : null;
    const titulo = id ? `✏️ Editar: ${v.num||''}` : '🌽 Nueva Transacción de Granos';

    const form = `
      <div style="display:grid;gap:10px">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tipo de Transacción *</label>
            <select class="form-input" id="form-tipo">
              <option value="venta" ${!v?.es_compra?'selected':''}>🔺 Venta de Granos</option>
              <option value="compra" ${v?.es_compra?'selected':''}>🔽 Compra de Granos</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Tipo de Grano *</label>
            <select class="form-input" id="form-grano">
              <option value="">— Seleccionar —</option>
              ${Object.entries(this._TIPOS_GRANO).map(([k,l])=>`<option value="${k}" ${v?.tipo_grano===k?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group" id="grupo-cliente" style="display:none">
          <label class="form-label">Cliente *</label>
          <select class="form-input" id="form-cliente">
            <option value="">— Seleccionar cliente —</option>
            ${this._clientes.map(c=>`<option value="${c.id}" ${v?.cliente_id===c.id?'selected':''}>${c.nombre}</option>`).join('')}
          </select>
        </div>

        <div class="form-group" id="grupo-proveedor" style="display:none">
          <label class="form-label">Proveedor *</label>
          <select class="form-input" id="form-proveedor">
            <option value="">— Seleccionar proveedor —</option>
            ${this._proveedores.map(p=>`<option value="${p.id}" ${v?.proveedor_id===p.id?'selected':''}>${p.nombre}</option>`).join('')}
          </select>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cantidad (kg) *</label>
            <input class="form-input" type="number" id="form-cantidad" value="${v?.cantidad_kg||''}" min="0.01" step="0.01">
          </div>
          <div class="form-group">
            <label class="form-label">Precio por kg (Q) *</label>
            <input class="form-input" type="number" id="form-precio" value="${v?.precio_kg||''}" min="0" step="0.01">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Total (Q) <span style="color:var(--text3)">calculado</span></label>
          <input class="form-input" id="form-total" readonly value="${v?.total||'0'}" style="background:var(--surface2)">
        </div>

        <div class="form-group">
          <label class="form-label">Fecha *</label>
          <input class="form-input" type="date" id="form-fecha" value="${v?.fecha||new Date().toISOString().slice(0,10)}">
        </div>

        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-input" id="form-estado">
            ${Object.entries(this._ESTADOS).map(([k,l])=>`<option value="${k}" ${v?.estado===k?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Notas</label>
          <textarea class="form-input" id="form-notas" style="min-height:50px">${v?.notas||''}</textarea>
        </div>
      </div>

      <script>
        function actualizar_tipo() {
          const tipo = document.getElementById('form-tipo').value;
          document.getElementById('grupo-cliente').style.display = tipo==='venta'?'block':'none';
          document.getElementById('grupo-proveedor').style.display = tipo==='compra'?'block':'none';
        }
        function actualizar_total() {
          const cant = parseFloat(document.getElementById('form-cantidad').value)||0;
          const precio = parseFloat(document.getElementById('form-precio').value)||0;
          document.getElementById('form-total').value = (cant*precio).toFixed(2);
        }
        actualizar_tipo();
        document.getElementById('form-tipo').addEventListener('change',actualizar_tipo);
        document.getElementById('form-cantidad').addEventListener('change',actualizar_total);
        document.getElementById('form-precio').addEventListener('change',actualizar_total);
      </script>`;

    UI.modal(titulo, form, '600px', [
      { label:'Cancelar', onclick:() => UI.cerrarModal(), clase:'ghost' },
      { label: id?'Guardar Cambios':'Crear Transacción', onclick:() => Modulos.venta_granos._guardar(id), clase:'amber' }
    ]);
  },

  async _guardar(id) {
    const tipo = document.getElementById('form-tipo').value;
    const tipo_grano = document.getElementById('form-grano').value;
    const cliente_id = tipo==='venta' ? document.getElementById('form-cliente').value : null;
    const proveedor_id = tipo==='compra' ? document.getElementById('form-proveedor').value : null;
    const cantidad_kg = parseFloat(document.getElementById('form-cantidad').value) || 0;
    const precio_kg = parseFloat(document.getElementById('form-precio').value) || 0;
    const total = cantidad_kg * precio_kg;
    const fecha = document.getElementById('form-fecha').value;
    const estado = document.getElementById('form-estado').value;
    const notas = document.getElementById('form-notas').value;

    if (!tipo_grano || (tipo==='venta' && !cliente_id) || (tipo==='compra' && !proveedor_id) || !cantidad_kg || !precio_kg || !fecha) {
      UI.toast('Completa los campos obligatorios (*)', 'error'); return;
    }

    const es_compra = tipo === 'compra';
    const payload = {
      es_compra, tipo_grano, cliente_id, proveedor_id,
      cantidad_kg, precio_kg, total, fecha, estado, notas
    };

    if (id) {
      const ok = await DB.updateVentaGranos(id, payload);
      if (ok) { UI.toast('Transacción actualizada ✓'); UI.cerrarModal(); Modulos.venta_granos.render(Modulos.venta_granos._filtroGrano); }
      else UI.toast('Error al actualizar', 'error');
    } else {
      const num = 'GRANO-' + String(Math.floor(Math.random()*1000000)).padStart(6,'0');
      const ok = await DB.crearVentaGranos({ num, ...payload });
      if (ok) { UI.toast('✓ Transacción creada'); UI.cerrarModal(); Modulos.venta_granos.render(); }
      else UI.toast('Error al crear', 'error');
    }
  },

  async _facturar(id) {
    const v = this._data.find(x=>x.id===id); if (!v) return;
    UI.toast('Integrando con Facturación FEL...', 'info');
    await DB.crearFacturaDesdeVentaGranos(id);
    UI.toast('✓ Factura creada. Revisa Facturación FEL', 'success');
  }
};
