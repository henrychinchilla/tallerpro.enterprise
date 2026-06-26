/* ═══════════════════════════════════════════════════════════════════════════
   Helper compartido: OT + Anticipo para módulos especializados
   (Herrería, Peletería, Electrónica, Refrigeración)
   ═══════════════════════════════════════════════════════════════════════════ */
Modulos._especialOT = {

  /* Genera OT en la tabla ordenes y vincula al proyecto especializado.
     tablaProyecto  : nombre de la tabla ('herreria_proyectos', ...)
     proyecto       : objeto del proyecto ya guardado (debe tener id, num, cliente_id, ...)
     campoTotal     : nombre del campo precio ('precio_venta' o 'precio_total')
     modulo         : etiqueta corta ('herreria', 'peleteria', 'electronica', 'refrigeracion')
     descripcionFn  : función(proyecto) → string con descripción para la OT              */
  async generarOT(tablaProyecto, proyecto, campoTotal, modulo, descripcionFn) {
    if (proyecto.orden_id) {
      UI.toast('Este proyecto ya tiene una OT vinculada: ' + (proyecto.ot_num || proyecto.orden_id), 'warning');
      return null;
    }
    const total = Number(proyecto[campoTotal]) || 0;
    const descripcion = descripcionFn(proyecto);
    const { data: ot, error } = await DB.upsertOrden({
      cliente_id:     proyecto.cliente_id,
      descripcion,
      total,
      saldo:          Math.max(0, total - (Number(proyecto.anticipo) || 0)),
      anticipo:       Number(proyecto.anticipo) || 0,
      estado:         'en_proceso',
      modulo_origen:  modulo,
      referencia_id:  proyecto.id,
      referencia_num: proyecto.num,
    });
    if (error) { UI.toast('Error al crear OT: ' + error.message, 'error'); return null; }

    /* Vincular OT al proyecto */
    await getSB().from(tablaProyecto)
      .update({ orden_id: ot.id })
      .eq('id', proyecto.id);

    UI.toast(`OT generada: ${ot.num} ✓`, 'success');
    return ot;
  },

  /* Slot temporal para el modal de anticipo (evita serializar JSON en onclick) */
  _ant: null,

  /* Modal de anticipo del 50% con comprobante imprimible */
  async modalAnticipo(tablaProyecto, proyecto, campoTotal, modulo, renderFn, otNum='') {
    this._ant = { tablaProyecto, proyecto, campoTotal, modulo, renderFn };
    const total     = Number(proyecto[campoTotal]) || 0;
    const sugerido  = Math.round(total * 0.5 * 100) / 100;
    const yaAbonado = Number(proyecto.anticipo) || 0;
    const label     = { herreria:'proyecto', peleteria:'pedido', electronica:'reparación', refrigeracion:'servicio' }[modulo] || 'trabajo';

    UI.modal('💰 Registrar Anticipo / Abono', `
      <div style="background:var(--card2);border-radius:8px;padding:12px;margin-bottom:14px">
        <div style="font-size:13px;color:var(--text3)">Ref: <b>${proyecto.num||'—'}</b>${otNum ? ` · OT: <b>${otNum}</b>` : ''}</div>
        <div style="font-size:22px;font-weight:800;color:var(--cyan);margin-top:4px">${UI.q(total)}</div>
        <div style="font-size:12px;color:var(--text3)">Monto total del ${label}</div>
        ${yaAbonado ? `<div style="font-size:13px;color:var(--amber);margin-top:4px">Ya abonado: ${UI.q(yaAbonado)}</div>` : ''}
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Monto del anticipo (Q) <span style="color:var(--cyan)">(sugerido 50% = ${UI.q(sugerido)})</span></label>
          <input class="form-input" id="ant-monto" type="number" min="0" step="0.01" value="${sugerido}" style="font-size:18px;font-weight:700"></div>
        <div class="form-group"><label class="form-label">Forma de pago</label>
          <select class="form-select" id="ant-forma">
            <option value="efectivo">💵 Efectivo</option>
            <option value="tarjeta">💳 Tarjeta</option>
            <option value="transferencia">🏦 Transferencia / Depósito</option>
            <option value="cheque">📄 Cheque</option>
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Notas del abono</label>
        <input class="form-input" id="ant-notas" placeholder="No. de transferencia, banco, referencia..."></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-cyan" onclick="Modulos._especialOT._guardarAnticipo()">
          💾 Guardar y Imprimir Comprobante
        </button>
      </div>`, '540px');
  },

  async _guardarAnticipo() {
    const ctx   = this._ant; if (!ctx) return;
    const monto = parseFloat(document.getElementById('ant-monto')?.value) || 0;
    const forma = document.getElementById('ant-forma')?.value || 'efectivo';
    const notas = document.getElementById('ant-notas')?.value || '';
    if (monto <= 0) { UI.toast('Ingresa un monto válido', 'error'); return; }

    const { tablaProyecto, proyecto, campoTotal, modulo, renderFn } = ctx;
    const { data: updated, error } = await getSB().from(tablaProyecto)
      .update({
        anticipo: monto,
        saldo: Math.max(0, (Number(proyecto[campoTotal]) || 0) - monto),
        forma_pago_anticipo: forma,
      })
      .eq('id', proyecto.id)
      .select().single();
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }

    if (proyecto.orden_id) {
      await getSB().from('ordenes').update({ anticipo: monto, saldo: Math.max(0,(Number(proyecto[campoTotal])||0)-monto) }).eq('id', proyecto.orden_id);
    }

    UI.cerrarModal();
    UI.toast('Anticipo registrado ✓');
    this._ant = null;
    this._imprimirComprobante({ ...proyecto, ...updated, anticipo: monto, forma_pago_anticipo: forma }, modulo, notas);
    if (renderFn && Modulos[renderFn]) Modulos[renderFn].render();
  },

  _imprimirComprobante(proyecto, modulo, notas = '') {
    const total   = Number(proyecto.precio_venta || proyecto.precio_total) || 0;
    const anticipo = Number(proyecto.anticipo) || 0;
    const saldo   = Math.max(0, total - anticipo);
    const formas  = { efectivo:'Efectivo', tarjeta:'Tarjeta', transferencia:'Transferencia/Depósito', cheque:'Cheque' };
    const forma   = formas[proyecto.forma_pago_anticipo] || proyecto.forma_pago_anticipo || 'Efectivo';
    const hoy     = new Date().toLocaleDateString('es-GT');
    const labelProyecto = { herreria:'Proyecto', peleteria:'Pedido', electronica:'Reparación', refrigeracion:'Servicio' }[modulo] || 'Proyecto';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Comprobante de Anticipo</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;padding:20px;font-size:13px}
      .header{text-align:center;margin-bottom:16px;border-bottom:2px solid #000;padding-bottom:12px}
      .header h2{margin:0;font-size:18px}
      .header p{margin:2px 0;color:#555}
      table{width:100%;border-collapse:collapse;margin:12px 0}
      td{padding:5px 8px;border:1px solid #ddd}
      td:first-child{font-weight:600;background:#f5f5f5;width:45%}
      .totales td{font-size:14px;border:2px solid #000}
      .totales .monto{font-size:18px;font-weight:800;color:#000}
      .saldo{color:#c0392b;font-size:16px;font-weight:700}
      .footer{text-align:center;margin-top:20px;font-size:11px;color:#777;border-top:1px dashed #ccc;padding-top:10px}
      .badge{display:inline-block;background:#2563eb;color:#fff;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:8px}
    </style></head><body>
    <div class="header">
      <div class="badge">COMPROBANTE DE ANTICIPO / ABONO</div>
      <h2>TallerPro — ${labelProyecto} ${proyecto.num || ''}</h2>
      <p>Fecha: ${hoy}</p>
    </div>
    <table>
      <tr><td>Cliente</td><td>${proyecto.clientes?.nombre || proyecto.cliente_nombre || '—'}</td></tr>
      <tr><td>${labelProyecto} No.</td><td><b>${proyecto.num || '—'}</b></td></tr>
      ${proyecto.ot_num ? `<tr><td>OT vinculada</td><td><b>${proyecto.ot_num}</b></td></tr>` : ''}
      <tr><td>Descripción</td><td>${proyecto.descripcion || proyecto.falla_reportada || proyecto.tipo_trabajo || '—'}</td></tr>
      <tr><td>Forma de pago</td><td>${forma}</td></tr>
      ${notas ? `<tr><td>Referencia</td><td>${notas}</td></tr>` : ''}
    </table>
    <table class="totales">
      <tr><td>MONTO TOTAL</td><td class="monto">${UI.q(total)}</td></tr>
      <tr><td>ANTICIPO RECIBIDO</td><td class="monto" style="color:#16a34a">${UI.q(anticipo)}</td></tr>
      <tr><td>SALDO PENDIENTE</td><td class="${saldo > 0 ? 'saldo' : 'monto'}">${UI.q(saldo)}</td></tr>
    </table>
    <p style="text-align:center;font-size:11px;color:#555">Este comprobante acredita el pago de anticipo. El saldo deberá cancelarse a la entrega.</p>
    <div class="footer">Generado por TallerPro Enterprise · ${hoy} · Documento no fiscal</div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=500,height=600');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  },

  /* Badge HTML para mostrar OT en tablas y modales */
  badgeOT(proyecto) {
    if (!proyecto.orden_id) return '';
    return `<div style="font-size:11px;color:var(--cyan);font-weight:700;margin-top:2px">🔧 ${proyecto.ot_num||'OT vinculada'}</div>`;
  },

  /* Botón "Generar OT" o badge de OT ya generada */
  btnOT(proyecto, modulo) {
    if (proyecto.orden_id) {
      return `<span class="badge badge-cyan" style="font-size:10px;cursor:pointer" title="OT vinculada" onclick="Modulos.ordenes&&Modulos.ordenes.render()">${proyecto.ot_num||'OT'}</span>`;
    }
    return `<button class="btn btn-sm btn-cyan" onclick="Modulos.${modulo}._accionGenerarOT('${proyecto.id}')" title="Generar OT">🔧 OT</button>`;
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   TallerPro v3.0 — especializados/herreria.js
   Módulo vertical: Herrería Industrial y Ventanería PVC/Aluminio.
   Proyectos de fabricación e instalación (portones, barandas, estructuras
   metálicas, ventanería PVC/aluminio) con seguimiento de estado y cobro.
   OT automática al aprobar; anticipo 50% con comprobante imprimible.
   ═══════════════════════════════════════════════════════════════════════════ */
Modulos.herreria = {
  _data: [], _clientes: [], _filtroEstado: '',

  _TIPOS: { porton:'Portón', baranda:'Baranda/Barandal', escalera:'Escalera metálica', estructura_metalica:'Estructura metálica', techo_metalico:'Techo/Lámina metálica', ventana_pvc:'Ventana PVC', puerta_pvc:'Puerta PVC', ventana_aluminio:'Ventana Aluminio', puerta_aluminio:'Puerta Aluminio', cancel:'Cancel', otro:'Otro' },
  _ESTADOS: { cotizado:'Cotizado', aprobado:'Aprobado', en_fabricacion:'En Fabricación', en_instalacion:'En Instalación', entregado:'Entregado', cancelado:'Cancelado', garantia:'Garantía' },
  _colorEstado(e) { return { cotizado:'gray', aprobado:'cyan', en_fabricacion:'amber', en_instalacion:'amber', entregado:'green', cancelado:'red', garantia:'purple' }[e]||'gray'; },

  async render(filtroEstado='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._filtroEstado = filtroEstado;
    [this._data, this._clientes] = await Promise.all([
      DB.getHerreriaProyectos(filtroEstado ? { estado: filtroEstado } : {}),
      DB.getClientes()
    ]);

    const activos = this._data.filter(p=>!['entregado','cancelado'].includes(p.estado));
    const enProceso = this._data.filter(p=>['en_fabricacion','en_instalacion'].includes(p.estado));
    const saldoPorCobrar = this._data.reduce((s,p)=>s+(Number(p.saldo)||0),0);
    const mesActual = new Date().toISOString().slice(0,7);
    const entregadosMes = this._data.filter(p=>p.estado==='entregado' && (p.updated_at||'').slice(0,7)===mesActual).length;

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">⚒️ Herrería y Ventanería</h1>
        <p class="page-subtitle">// ${this._data.length} proyectos registrados</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.herreria.modalForm()">＋ Nuevo Proyecto</button>
        </div>
      </div>
      <div class="page-body">
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'⚒️', clase:'cyan', label:'Proyectos activos', value: activos.length })}
          ${UI.kpiCard({ icon:'🏗️', clase:'amber', label:'En fabricación/instalación', value: enProceso.length })}
          ${UI.kpiCard({ icon:'💰', clase: saldoPorCobrar?'red':'gray', label:'Saldo por cobrar', value: saldoPorCobrar, money:true })}
          ${UI.kpiCard({ icon:'✅', clase:'green', label:'Entregados este mes', value: entregadosMes })}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn btn-sm ${!filtroEstado?'btn-cyan':'btn-ghost'}" onclick="Modulos.herreria.render('')">Todos</button>
          ${Object.entries(this._ESTADOS).map(([k,l])=>`<button class="btn btn-sm ${filtroEstado===k?'btn-cyan':'btn-ghost'}" onclick="Modulos.herreria.render('${k}')">${l}</button>`).join('')}
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>No.</th><th>Cliente</th><th>Tipo</th><th>Medidas</th><th>Precio</th><th>Anticipo</th><th>Saldo</th><th>OT</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${this._data.map(p=>`<tr>
              <td class="mono-sm"><b>${p.num||'—'}</b></td>
              <td>${p.clientes?.nombre||'—'}</td>
              <td><span class="badge badge-gray">${this._TIPOS[p.tipo_trabajo]||p.tipo_trabajo}</span><div style="font-size:11px;color:var(--text3)">${p.tipo_inicio==='directo'?'⚡ Directo':'📋 Cotización'}</div></td>
              <td class="mono-sm">${p.ancho_m&&p.alto_m?`${p.ancho_m}×${p.alto_m} m`:'—'}</td>
              <td class="mono-sm">${UI.q(p.precio_venta)}</td>
              <td class="mono-sm ${p.anticipo>0?'text-green':''}">${UI.q(p.anticipo)}</td>
              <td class="mono-sm ${p.saldo>0?'text-red':'text-green'}">${UI.q(p.saldo)}</td>
              <td>${Modulos._especialOT.btnOT(p,'herreria')}</td>
              <td><span class="badge badge-${this._colorEstado(p.estado)}">${this._ESTADOS[p.estado]||p.estado}</span></td>
              <td><div style="display:flex;gap:4px;flex-wrap:wrap">
                ${Modulos.btnAccion('ver', `Modulos.herreria.verDetalle('${p.id}')`)}
                ${Modulos.btnAccion('editar', `Modulos.herreria.modalForm('${p.id}')`)}
                <button class="btn btn-sm btn-cyan" onclick="Modulos.herreria._accionAnticipo('${p.id}')" title="Registrar anticipo">💰</button>
                <button class="btn btn-sm btn-ghost" onclick="Modulos.herreria._imprimirProyecto('${p.id}')" title="Imprimir">🖨️</button>
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('herreria_proyectos','${p.id}','el proyecto ${p.num||''}',()=>Modulos.herreria.render(Modulos.herreria._filtroEstado))`)}
              </div></td>
            </tr>`).join('')||'<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text3)">Sin proyectos. Registra el primero con "＋ Nuevo Proyecto".</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  },

  async verDetalle(id) {
    const p = this._data.find(x=>x.id===id); if (!p) return;
    UI.modal(`📋 Proyecto ${p.num||''}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><div style="font-size:11px;color:var(--text3)">Cliente</div><div style="font-weight:700">${p.clientes?.nombre||'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Tipo</div><div>${this._TIPOS[p.tipo_trabajo]||p.tipo_trabajo}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Estado</div><div><span class="badge badge-${this._colorEstado(p.estado)}">${this._ESTADOS[p.estado]||p.estado}</span></div></div>
        <div><div style="font-size:11px;color:var(--text3)">Inicio</div><div>${p.tipo_inicio==='directo'?'⚡ Directo':'📋 Cotización'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Medidas</div><div>${p.ancho_m&&p.alto_m?`${p.ancho_m}×${p.alto_m} m (${p.cantidad} uds)·${p.area_m2||'—'} m²`:'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Compromiso</div><div>${p.fecha_compromiso?UI.fecha(p.fecha_compromiso):'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Material / Color</div><div>${[p.material,p.color].filter(Boolean).join(' · ')||'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Ubicación</div><div>${p.ubicacion_instalacion||'—'}</div></div>
      </div>
      ${p.descripcion?`<div style="background:var(--card2);padding:10px;border-radius:6px;margin-bottom:12px;font-size:13px">${p.descripcion}</div>`:''}
      <div class="kpi-grid" style="margin-bottom:14px">
        ${UI.kpiCard({icon:'🏷️',clase:'gray',label:'Precio venta',value:p.precio_venta,money:true})}
        ${UI.kpiCard({icon:'💰',clase:'green',label:'Anticipo',value:p.anticipo,money:true})}
        ${UI.kpiCard({icon:'⚠️',clase:p.saldo>0?'red':'green',label:'Saldo',value:p.saldo,money:true})}
      </div>
      ${p.orden_id?`<div style="background:var(--card2);padding:10px;border-radius:6px;display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="font-size:20px">🔧</span>
        <div><div style="font-size:11px;color:var(--text3)">OT vinculada</div><div style="font-weight:700;color:var(--cyan)">${p.ot_num||p.orden_id}</div></div>
      </div>`:`<div style="color:var(--text3);font-size:12px;margin-bottom:10px">${p.estado==='aprobado'?'⚡ Aprobado — listo para generar OT':'Sin OT. Se genera cuando el cliente aprueba la cotización.'}</div>`}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        ${!p.orden_id&&['aprobado','en_fabricacion','en_instalacion'].includes(p.estado)?`<button class="btn btn-cyan" onclick="UI.cerrarModal();Modulos.herreria._accionGenerarOT('${p.id}')">🔧 Generar OT</button>`:''}
        <button class="btn btn-ghost" onclick="UI.cerrarModal();Modulos.herreria._accionAnticipo('${p.id}')">💰 Anticipo</button>
        <button class="btn btn-amber" onclick="UI.cerrarModal();Modulos.herreria.modalForm('${p.id}')">✏️ Editar</button>
      </div>`, '640px');
  },

  async modalForm(id=null) {
    const p = id ? this._data.find(x=>x.id===id)||{} : {};
    if (!this._clientes.length) this._clientes = await DB.getClientes();
    const esEdicion = !!id;

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Proyecto de Herrería`, `
      ${p.orden_id?`<div style="background:var(--card2);padding:8px 12px;border-radius:6px;margin-bottom:12px;display:flex;align-items:center;gap:8px">
        <span style="color:var(--cyan);font-weight:700">🔧 OT: ${p.ot_num||p.orden_id}</span>
        <span style="font-size:11px;color:var(--text3)">Este proyecto tiene una OT activa</span></div>`:''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo de inicio</label>
          <select class="form-select" id="her-inicio">
            <option value="cotizacion" ${(p.tipo_inicio||'cotizacion')==='cotizacion'?'selected':''}>📋 Cotización → requiere aprobación</option>
            <option value="directo" ${p.tipo_inicio==='directo'?'selected':''}>⚡ Trabajo directo → ya autorizado</option>
          </select></div>
        <div class="form-group"><label class="form-label">Estado</label>
          <select class="form-select" id="her-estado">
            ${Object.entries(this._ESTADOS).map(([k,l])=>`<option value="${k}" ${(p.estado||'cotizado')===k?'selected':''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cliente *</label>
          <select class="form-select" id="her-cliente">
            <option value="">— Selecciona —</option>
            ${this._clientes.map(c=>`<option value="${c.id}" ${p.cliente_id===c.id?'selected':''}>${c.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Tipo de trabajo *</label>
          <select class="form-select" id="her-tipo">
            ${Object.entries(this._TIPOS).map(([k,l])=>`<option value="${k}" ${p.tipo_trabajo===k?'selected':''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Descripción del trabajo</label>
        <textarea class="form-input" id="her-desc" rows="2" placeholder="Portón corredizo 2 hojas, tubo cuadrado 2x2...">${p.descripcion||''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Ancho (m)</label>
          <input class="form-input" id="her-ancho" type="number" min="0" step="0.01" value="${p.ancho_m||''}"></div>
        <div class="form-group"><label class="form-label">Alto (m)</label>
          <input class="form-input" id="her-alto" type="number" min="0" step="0.01" value="${p.alto_m||''}"></div>
        <div class="form-group"><label class="form-label">Cantidad</label>
          <input class="form-input" id="her-cantidad" type="number" min="1" step="1" value="${p.cantidad||1}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Material</label>
          <input class="form-input" id="her-material" value="${p.material||''}" placeholder="Tubo cuadrado, lámina, perfil PVC..."></div>
        <div class="form-group"><label class="form-label">Color / Acabado</label>
          <input class="form-input" id="her-color" value="${p.color||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Ubicación en la propiedad</label>
          <input class="form-input" id="her-ubicacion" value="${p.ubicacion_instalacion||''}" placeholder="Fachada, patio, balcón 2do nivel..."></div>
        <div class="form-group"><label class="form-label">Dirección de instalación</label>
          <input class="form-input" id="her-direccion" value="${p.direccion_instalacion||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Fecha compromiso</label>
        <input class="form-input" id="her-fecha" type="date" value="${p.fecha_compromiso||''}"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Costo materiales (Q)</label>
          <input class="form-input" id="her-costo-mat" type="number" min="0" step="0.01" value="${p.costo_materiales||0}"></div>
        <div class="form-group"><label class="form-label">Costo mano de obra (Q)</label>
          <input class="form-input" id="her-costo-mo" type="number" min="0" step="0.01" value="${p.costo_mano_obra||0}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Precio de venta (Q)</label>
          <input class="form-input" id="her-precio" type="number" min="0" step="0.01" value="${p.precio_venta||0}"></div>
        <div class="form-group"><label class="form-label">Anticipo recibido (Q)</label>
          <input class="form-input" id="her-anticipo" type="number" min="0" step="0.01" value="${p.anticipo||0}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="her-notas" rows="2">${p.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.herreria.guardar('${id||''}')">${esEdicion?'Guardar Cambios':'Crear Proyecto'}</button>
      </div>`, '720px');
  },

  async guardar(id='') {
    const clienteId = document.getElementById('her-cliente')?.value;
    if (!clienteId) { UI.toast('Selecciona un cliente','error'); return; }
    const ancho = parseFloat(document.getElementById('her-ancho')?.value)||0;
    const alto  = parseFloat(document.getElementById('her-alto')?.value)||0;
    const cantidad = parseFloat(document.getElementById('her-cantidad')?.value)||1;
    const precio   = parseFloat(document.getElementById('her-precio')?.value)||0;
    const anticipo = parseFloat(document.getElementById('her-anticipo')?.value)||0;
    const estadoPrev = id ? (this._data.find(x=>x.id===id)?.estado||'cotizado') : 'cotizado';
    const fields = {
      cliente_id: clienteId,
      tipo_inicio: document.getElementById('her-inicio')?.value||'cotizacion',
      tipo_trabajo: document.getElementById('her-tipo')?.value||'otro',
      descripcion: document.getElementById('her-desc')?.value||null,
      ancho_m: ancho||null, alto_m: alto||null, cantidad,
      area_m2: (ancho&&alto) ? Math.round(ancho*alto*cantidad*100)/100 : null,
      material: document.getElementById('her-material')?.value||null,
      color: document.getElementById('her-color')?.value||null,
      ubicacion_instalacion: document.getElementById('her-ubicacion')?.value||null,
      direccion_instalacion: document.getElementById('her-direccion')?.value||null,
      estado: document.getElementById('her-estado')?.value||'cotizado',
      fecha_compromiso: document.getElementById('her-fecha')?.value||null,
      costo_materiales: parseFloat(document.getElementById('her-costo-mat')?.value)||0,
      costo_mano_obra: parseFloat(document.getElementById('her-costo-mo')?.value)||0,
      precio_venta: precio, anticipo, saldo: Math.max(0, precio-anticipo),
      notas: document.getElementById('her-notas')?.value||null,
    };
    if (id) fields.id = id;
    const prevOrdenId = id ? this._data.find(x=>x.id===id)?.orden_id : null;

    const { data: saved, error } = await DB.upsertHerreriaProyecto(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Proyecto actualizado ✓':'Proyecto creado ✓');

    /* Auto-generar OT si corresponde */
    const proyecto = { ...fields, id: saved?.id||id, clientes: { nombre: this._clientes.find(c=>c.id===clienteId)?.nombre||'' }, orden_id: prevOrdenId };
    const estadoNuevo = fields.estado;
    const debeOT = !prevOrdenId && (
      fields.tipo_inicio === 'directo' ||
      (estadoPrev === 'cotizado' && estadoNuevo === 'aprobado') ||
      ['aprobado','en_fabricacion','en_instalacion'].includes(estadoNuevo)
    );
    if (debeOT) {
      const ot = await Modulos._especialOT.generarOT(
        'herreria_proyectos', proyecto, 'precio_venta', 'herreria',
        p => `HER ${p.num}: ${this._TIPOS[p.tipo_trabajo]||p.tipo_trabajo} — ${p.descripcion||''}`.slice(0,200)
      );
      if (ot) await Modulos._especialOT.modalAnticipo('herreria_proyectos', { ...proyecto, orden_id: ot.id }, 'precio_venta', 'herreria', 'herreria', ot.num);
    }
    this.render(this._filtroEstado);
  },

  async _accionGenerarOT(id) {
    const p = this._data.find(x=>x.id===id); if (!p) return;
    const ot = await Modulos._especialOT.generarOT(
      'herreria_proyectos', p, 'precio_venta', 'herreria',
      pr => `HER ${pr.num}: ${this._TIPOS[pr.tipo_trabajo]||pr.tipo_trabajo} — ${pr.descripcion||''}`.slice(0,200)
    );
    if (ot) {
      await getSB().from('herreria_proyectos').update({ estado:'en_fabricacion' }).eq('id',id);
      await Modulos._especialOT.modalAnticipo('herreria_proyectos', { ...p, orden_id: ot.id }, 'precio_venta', 'herreria', 'herreria', ot.num);
    }
    this.render(this._filtroEstado);
  },

  async _accionAnticipo(id) {
    const p = this._data.find(x=>x.id===id); if (!p) return;
    await Modulos._especialOT.modalAnticipo('herreria_proyectos', p, 'precio_venta', 'herreria', 'herreria', p.ot_num||'');
  },

  _imprimirProyecto(id) {
    const p = this._data.find(x=>x.id===id); if (!p) return;
    Modulos._especialOT._imprimirComprobante(
      { ...p, precio_venta: p.precio_venta, clientes: p.clientes }, 'herreria', ''
    );
  },
};
