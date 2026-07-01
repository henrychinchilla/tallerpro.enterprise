/* NexusPro v3.0 — operacion/traslados.js
   Workflow de traslados con trazabilidad y firmas:
   solicitud → enviado (firma encargado + piloto) → recibido (firma).
   El stock sale del origen al ENVIAR y entra al destino al RECIBIR.
   Cada paso genera un PDF firmado (Docs) accesible desde el historial. */
Modulos.traslados = {
  _data: [], _bodegas: [],
  _ESTADOS: {
    solicitado: ['amber','📝 Solicitado'],
    enviado:    ['cyan', '🚚 Enviado'],
    recibido:   ['green','✓ Recibido'],
    cancelado:  ['red',  '✗ Cancelado'],
  },

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    [this._data, this._bodegas] = await Promise.all([ DB.getTraslados(), DB.getBodegas() ]);
    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">📋 Traslados</h1>
        <p class="page-subtitle">// ${this._data.length} traslados · historial trazable</p></div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.bodegas.render()">← Bodegas</button>
          <button class="btn btn-amber" onclick="Modulos.traslados.nuevaSolicitud()">＋ Nueva solicitud</button>
        </div>
      </div>
      <div class="page-body">
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>No.</th><th>Origen → Destino</th><th>Estado</th><th>Piloto</th><th>Solicitud</th><th>Envío</th><th>Recepción</th><th>Docs</th><th>Acciones</th></tr></thead>
          <tbody>
            ${this._data.map(t=>{
              const [c,l] = this._ESTADOS[t.estado]||['gray',t.estado];
              return `<tr style="cursor:pointer" onclick="Modulos.traslados.verDetalle('${t.id}')">
                <td class="mono-sm"><b class="text-amber">${t.num||''}</b></td>
                <td>${t.origen_nombre||'Principal'} → <b>${t.destino_nombre||'Principal'}</b></td>
                <td><span class="badge badge-${c}">${l}</span></td>
                <td>${t.piloto_nombre||'—'}${t.piloto_tipo?` <span class="text-muted">(${t.piloto_tipo})</span>`:''}</td>
                <td class="mono-sm">${UI.fecha(t.fecha_solicitud)}</td>
                <td class="mono-sm">${t.fecha_envio?UI.fecha(t.fecha_envio.slice(0,10)):'—'}</td>
                <td class="mono-sm">${t.fecha_recepcion?UI.fecha(t.fecha_recepcion.slice(0,10)):'—'}</td>
                <td onclick="event.stopPropagation()">${t.doc_envio_id?'📄':''}${t.doc_recepcion_id?'📄':''}</td>
                <td onclick="event.stopPropagation()"><button class="btn btn-sm btn-cyan" onclick="Modulos.traslados.verDetalle('${t.id}')">👁 Ver</button></td>
              </tr>`;
            }).join('')||'<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text3)">Sin traslados. Crea una solicitud.</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  },

  _nombreBodega(id) { return id ? (this._bodegas.find(b=>b.id===id)?.nombre||'Bodega') : 'Taller Principal'; },

  async _itemsDe(bodegaId) {
    let q = getSB().from('inventario').select('*').eq('tenant_id', getTID());
    q = bodegaId ? q.eq('bodega_id', bodegaId) : q.is('bodega_id', null);
    const { data } = await q.order('nombre');
    return data || [];
  },

  async nuevaSolicitud(origenId='') {
    const items = await this._itemsDe(origenId||null);
    const destinos = [
      ...(origenId ? [{ id:'', nombre:`🏪 ${Auth.tenant?.name||'Taller Principal'}` }] : []),
      ...this._bodegas.filter(b=>b.id!==origenId && b.activa).map(b=>({ id:b.id, nombre:`🏭 ${b.nombre}` }))
    ];
    const origenes = [
      { id:'', nombre:`🏪 ${Auth.tenant?.name||'Taller Principal'}` },
      ...this._bodegas.filter(b=>b.activa).map(b=>({ id:b.id, nombre:`🏭 ${b.nombre}` }))
    ];
    UI.modal('📝 Nueva solicitud de traslado', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Origen *</label>
          <select class="form-select" id="tr-origen" onchange="Modulos.traslados._recargarItems()">
            ${origenes.map(o=>`<option value="${o.id}" ${o.id===origenId?'selected':''}>${o.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Destino *</label>
          <select class="form-select" id="tr-destino">
            <option value="__none__">Seleccionar...</option>
            ${destinos.map(d=>`<option value="${d.id}">${d.nombre}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Artículos (cantidad a trasladar)</label>
        <div id="tr-items" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px 10px">
          ${this._itemsHtml(items)}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Piloto / transportista</label>
          <input class="form-input" id="tr-piloto" placeholder="Nombre del piloto"></div>
        <div class="form-group"><label class="form-label">Tipo de piloto</label>
          <select class="form-select" id="tr-piloto-tipo">
            <option value="interno">Interno</option>
            <option value="externo">Externo</option>
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Motivo</label>
        <input class="form-input" id="tr-motivo" placeholder="Reposición, redistribución..."></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.traslados.guardarSolicitud()">Crear solicitud</button>
      </div>`, '600px');
    this._origenActual = origenId;
  },

  _itemsHtml(items) {
    return items.length ? items.map(i=>`
      <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;font-size:12px"><b>${i.nombre}</b> <span class="text-muted">· disp: ${i.stock} ${i.unidad_medida||''}</span></div>
        <input class="form-input" style="width:96px" type="number" min="0" max="${i.stock}" step="1"
               id="tri-${i.id}" data-stock="${i.stock}" data-nombre="${(i.nombre||'').replace(/"/g,'&quot;')}" data-unidad="${i.unidad_medida||''}" placeholder="0">
      </div>`).join('') : '<div class="text-muted" style="padding:8px">Esta ubicación no tiene artículos.</div>';
  },

  async _recargarItems() {
    const origen = document.getElementById('tr-origen')?.value || '';
    this._origenActual = origen;
    const cont = document.getElementById('tr-items');
    if (cont) cont.innerHTML = this._itemsHtml(await this._itemsDe(origen||null));
  },

  _leerLineas() {
    const lineas = [];
    document.querySelectorAll('[id^="tri-"]').forEach(inp=>{
      const cant = parseFloat(inp.value)||0;
      if (cant>0) lineas.push({ inventario_id: inp.id.replace('tri-',''), cantidad: cant, stock: parseFloat(inp.dataset.stock)||0, nombre: inp.dataset.nombre, unidad: inp.dataset.unidad });
    });
    return lineas;
  },

  async guardarSolicitud() {
    const origenId = document.getElementById('tr-origen')?.value || '';
    const destId = document.getElementById('tr-destino')?.value;
    if (destId === '__none__' || destId == null) { UI.toast('Selecciona un destino','error'); return; }
    if (destId === origenId) { UI.toast('Origen y destino no pueden ser iguales','error'); return; }
    const lineas = this._leerLineas();
    if (!lineas.length) { UI.toast('Indica la cantidad de al menos un artículo','error'); return; }
    if (lineas.some(l=>l.cantidad>l.stock)) { UI.toast('Una cantidad supera el stock disponible','error'); return; }

    const { data: tr, error } = await DB.upsertTraslado({
      bodega_origen_id: origenId||null, bodega_destino_id: destId||null,
      origen_nombre: this._nombreBodega(origenId), destino_nombre: this._nombreBodega(destId),
      estado: 'solicitado', motivo: document.getElementById('tr-motivo')?.value||null,
      piloto_nombre: document.getElementById('tr-piloto')?.value.trim()||null,
      piloto_tipo: document.getElementById('tr-piloto-tipo')?.value||null
    });
    if (error || !tr) { UI.toast('Error: '+(error?.message||''),'error'); return; }
    await DB.insertTrasladoItems(tr.id, lineas);
    UI.cerrarModal(); UI.toast(`Solicitud ${tr.num} creada ✓`);
    this.render();
  },

  async verDetalle(id) {
    const t = this._data.find(x=>x.id===id);
    if (!t) return;
    const items = await DB.getTrasladoItems(id);
    const [c,l] = this._ESTADOS[t.estado]||['gray',t.estado];
    UI.modal(`📋 Traslado ${t.num||''}`, `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div><b>${t.origen_nombre||'Principal'} → ${t.destino_nombre||'Principal'}</b>
          <div style="font-size:12px;color:var(--text3)">${t.motivo||''}</div></div>
        <span class="badge badge-${c}">${l}</span>
      </div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px">
        🚚 Piloto: <b>${t.piloto_nombre||'—'}</b> ${t.piloto_tipo?`(${t.piloto_tipo})`:''}<br>
        ${t.responsable_envia?`Envió: ${t.responsable_envia} · ${t.fecha_envio?UI.fechaHora(t.fecha_envio):''}<br>`:''}
        ${t.responsable_recibe?`Recibió: ${t.responsable_recibe} · ${t.fecha_recepcion?UI.fechaHora(t.fecha_recepcion):''}`:''}
      </div>
      <div class="table-wrap"><table class="data-table" style="font-size:12px">
        <thead><tr><th>Artículo</th><th style="text-align:right">Cantidad</th></tr></thead>
        <tbody>${items.map(i=>`<tr><td>${i.nombre}</td><td style="text-align:right" class="mono-sm">${i.cantidad} ${i.unidad||''}</td></tr>`).join('')}</tbody>
      </table></div>
      <div id="tr-docs" style="margin-top:12px"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        ${t.estado==='solicitado'?`<button class="btn btn-danger btn-sm" onclick="Modulos.traslados.cancelar('${id}')">Cancelar</button>
          <button class="btn btn-cyan" onclick="Modulos.traslados.marcarEnviado('${id}')">🚚 Marcar enviado (firmar)</button>`:''}
        ${t.estado==='enviado'?`<button class="btn btn-green" onclick="Modulos.traslados.marcarRecibido('${id}')">✓ Marcar recibido (firmar)</button>`:''}
      </div>`, '620px');
    Docs.render('traslado', id, 'tr-docs');
  },

  async cancelar(id) {
    const ok = await UI.confirmar('¿Cancelar esta solicitud de traslado?', 'Cancelar traslado');
    if (!ok) return;
    await DB.upsertTraslado({ id, estado:'cancelado' });
    UI.toast('Traslado cancelado'); this.render();
  },

  /* ENVIAR: firma encargado+piloto → descuenta stock del origen */
  async marcarEnviado(id) {
    const t = this._data.find(x=>x.id===id);
    const items = await DB.getTrasladoItems(id);
    if (!t || !items.length) return;
    const doc = await Docs.firmarYGuardar({
      entidad:'traslado', entidadId:id, tipo:'envio', titulo:`Salida de traslado ${t.num||''}`,
      firmantes:[ {key:'envia',label:'Encargado que envía'}, {key:'piloto',label:'Piloto / transportista', nombre:t.piloto_nombre||''} ],
      def:{ titulo:`Comprobante de ENVÍO — ${t.num||''}`,
        subtitulo:`${t.origen_nombre||'Principal'} → ${t.destino_nombre||'Principal'}`,
        lineas:[{label:'Motivo',value:t.motivo||'—'},{label:'Piloto',value:`${t.piloto_nombre||'—'} (${t.piloto_tipo||'—'})`},{label:'Fecha',value:new Date().toLocaleString('es-GT')}],
        tabla:{ head:['Artículo','Cantidad'], rows: items.map(i=>[i.nombre, `${i.cantidad} ${i.unidad||''}`]) },
        nota:'El encargado que envía y el piloto confirman la salida de los artículos detallados.' }
    });
    if (!doc) return;
    /* Descontar del origen */
    for (const it of items) {
      if (!it.inventario_id) continue;
      const { data: inv } = await getSB().from('inventario').select('stock').eq('id', it.inventario_id).maybeSingle();
      if (!inv) continue;
      await getSB().from('inventario').update({ stock: Math.max(0, Number(inv.stock)-Number(it.cantidad)), updated_at:new Date().toISOString() }).eq('id', it.inventario_id);
      await DB.movimientoInventario({ inventario_id: it.inventario_id, tipo:'traslado', cantidad: it.cantidad, referencia:`Traslado ${t.num} (envío)`, notas:t.motivo||null, fecha:new Date().toISOString().slice(0,10) });
    }
    await DB.upsertTraslado({ id, estado:'enviado', fecha_envio:new Date().toISOString(), responsable_envia: doc.firmantes?.find(f=>/env/i.test(f.rol))?.nombre || null, doc_envio_id: doc.id });
    UI.cerrarModal(); UI.toast('Traslado enviado y firmado ✓'); this.render();
  },

  /* RECIBIR: firma encargado destino+piloto → suma stock al destino */
  async marcarRecibido(id) {
    const t = this._data.find(x=>x.id===id);
    const items = await DB.getTrasladoItems(id);
    if (!t || !items.length) return;
    const doc = await Docs.firmarYGuardar({
      entidad:'traslado', entidadId:id, tipo:'recibido', titulo:`Recepción de traslado ${t.num||''}`,
      firmantes:[ {key:'recibe',label:'Encargado que recibe'}, {key:'piloto',label:'Piloto / transportista', nombre:t.piloto_nombre||''} ],
      def:{ titulo:`Comprobante de RECEPCIÓN — ${t.num||''}`,
        subtitulo:`${t.origen_nombre||'Principal'} → ${t.destino_nombre||'Principal'}`,
        lineas:[{label:'Motivo',value:t.motivo||'—'},{label:'Piloto',value:`${t.piloto_nombre||'—'} (${t.piloto_tipo||'—'})`},{label:'Fecha',value:new Date().toLocaleString('es-GT')}],
        tabla:{ head:['Artículo','Cantidad'], rows: items.map(i=>[i.nombre, `${i.cantidad} ${i.unidad||''}`]) },
        nota:'El encargado que recibe y el piloto confirman la recepción conforme de los artículos.' }
    });
    if (!doc) return;
    const destId = t.bodega_destino_id;
    for (const it of items) {
      let q = getSB().from('inventario').select('id,stock,codigo').eq('tenant_id', getTID()).eq('nombre', it.nombre);
      q = destId ? q.eq('bodega_id', destId) : q.is('bodega_id', null);
      const { data: dest } = await q.maybeSingle();
      if (dest) {
        await getSB().from('inventario').update({ stock: Number(dest.stock)+Number(it.cantidad), updated_at:new Date().toISOString() }).eq('id', dest.id);
      } else {
        const { data: orig } = it.inventario_id ? await getSB().from('inventario').select('*').eq('id', it.inventario_id).maybeSingle() : { data:null };
        await getSB().from('inventario').insert({
          tenant_id:getTID(), bodega_id: destId||null,
          codigo: `${orig?.codigo||'ART'}-B${(destId||'P').slice(0,4)}`,
          nombre: it.nombre, categoria: orig?.categoria||null, unidad_medida: it.unidad||orig?.unidad_medida||null,
          stock: it.cantidad, min_stock: orig?.min_stock||0, precio_costo: orig?.precio_costo||0, precio_venta: orig?.precio_venta||0
        });
      }
    }
    await DB.upsertTraslado({ id, estado:'recibido', fecha_recepcion:new Date().toISOString(), responsable_recibe: doc.firmantes?.find(f=>/recib/i.test(f.rol))?.nombre || null, doc_recepcion_id: doc.id });
    UI.cerrarModal(); UI.toast('Traslado recibido y firmado ✓'); this.render();
  }
};
