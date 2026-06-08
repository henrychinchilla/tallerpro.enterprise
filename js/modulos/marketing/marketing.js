/* TallerPro v3.0 — marketing/index.js */
Modulos.marketing = {
  _tab: 'combos', _combos: [], _promos: [],

  async render() {
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">🎯 Marketing</h1>
      </div>
      <div class="page-body">
        <div class="tabs">
          <button class="tab-btn ${this._tab==='combos'?'active':''}" onclick="Modulos.marketing._tab='combos';Modulos.marketing._renderTab()">🎁 Combos</button>
          <button class="tab-btn ${this._tab==='promos'?'active':''}" onclick="Modulos.marketing._tab='promos';Modulos.marketing._renderTab()">🏷️ Promociones</button>
          <button class="tab-btn ${this._tab==='flyers'?'active':''}" onclick="Modulos.marketing._tab='flyers';Modulos.marketing._renderTab()">📄 Generador de Flyers</button>
          <button class="tab-btn ${this._tab==='fidelizacion'?'active':''}" onclick="Modulos.marketing._tab='fidelizacion';Modulos.marketing._renderTab()">⭐ Fidelización</button>
          <button class="tab-btn ${this._tab==='feedback'?'active':''}" onclick="Modulos.marketing._tab='feedback';Modulos.marketing._renderTab()">💬 Feedback / QR</button>
        </div>
        <div id="mkt-content"><div class="empty-state">⏳ Cargando...</div></div>
      </div>`;
    await this._renderTab();
  },

  async _renderTab() {
    const el = document.getElementById('mkt-content');
    if (!el) return;

    if (this._tab==='combos') {
      this._combos = await DB.getCombos();
      el.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
          <button class="btn btn-amber" onclick="Modulos.marketing.modalCombo()">＋ Nuevo Combo</button>
        </div>
        <div class="grid-3">
          ${this._combos.map(c=>`
            <div class="card card-amber">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <span class="badge badge-${c.tipo==='servicios'?'cyan':'amber'}">${c.tipo}</span>
                <span class="badge badge-${c.activo?'green':'gray'}">${c.activo?'Activo':'Inactivo'}</span>
              </div>
              <div style="font-weight:800;font-size:15px;margin-bottom:4px">${c.nombre}</div>
              <div style="font-size:12px;color:var(--text2);margin-bottom:10px">${c.descripcion||''}</div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <div style="font-size:11px;color:var(--text3);text-decoration:line-through">${UI.q(c.precio_regular)}</div>
                  <div style="font-size:18px;font-weight:800;color:var(--amber)">${UI.q(c.precio_combo)}</div>
                </div>
                <div style="font-size:13px;color:var(--green);font-weight:700">
                  ${c.precio_regular>0?Math.round((1-c.precio_combo/c.precio_regular)*100)+'% OFF':''}
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:10px">
                ${Modulos.btnAccion('editar', `Modulos.marketing.modalCombo('${c.id}')`)}
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('combos','${c.id}','${(c.nombre||'').replace(/'/g,"\\'")}',()=>Modulos.marketing._renderTab())`)}
              </div>
            </div>`).join('')||'<div class="text-muted">Sin combos creados</div>'}
        </div>`;
    }

    else if (this._tab==='promos') {
      this._promos = await DB.getPromociones();
      const hoy = new Date().toISOString().slice(0,10);
      el.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
          <button class="btn btn-amber" onclick="Modulos.marketing.modalPromo()">＋ Nueva Promoción</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Promoción</th><th>Descuento</th><th>Inicio</th><th>Fin</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${this._promos.map(p=>{
                const vigente = p.activa && p.fecha_inicio<=hoy && (!p.fecha_fin||p.fecha_fin>=hoy);
                return `<tr>
                  <td><b>${p.nombre}</b><br><small>${p.descripcion||''}</small></td>
                  <td><span class="badge badge-amber">${p.descuento_pct}% OFF</span></td>
                  <td>${UI.fecha(p.fecha_inicio)}</td>
                  <td>${UI.fecha(p.fecha_fin)||'Sin límite'}</td>
                  <td><span class="badge badge-${vigente?'green':'gray'}">${vigente?'Vigente':'Inactiva'}</span></td>
                  <td><div style="display:flex;gap:4px">
                    ${Modulos.btnAccion('editar', `Modulos.marketing.modalPromo('${p.id}')`)}
                    ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('promociones','${p.id}','${(p.nombre||'').replace(/'/g,"\\'")}',()=>Modulos.marketing._renderTab())`)}
                  </div></td>
                </tr>`;
              }).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin promociones</td></tr>'}
            </tbody>
          </table>
        </div>`;
    }

    else if (this._tab==='flyers') {
      el.innerHTML = `
        <div class="card" style="max-width:600px;margin:0 auto">
          <div class="card-sub mb-4">📄 Generador de Flyer para WhatsApp / Redes</div>
          <div class="form-group"><label class="form-label">Título del Flyer *</label>
            <input class="form-input" id="fl-titulo" placeholder="¡OFERTA ESPECIAL! Cambio de aceite"></div>
          <div class="form-group"><label class="form-label">Descripción</label>
            <textarea class="form-input" id="fl-desc" rows="3" placeholder="Incluye filtro + 4 litros de aceite sintético..."></textarea></div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Precio Regular (Q)</label>
              <input class="form-input" id="fl-precio-reg" type="number" placeholder="350"></div>
            <div class="form-group"><label class="form-label">Precio Especial (Q)</label>
              <input class="form-input" id="fl-precio-esp" type="number" placeholder="249"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Válido hasta</label>
              <input class="form-input" id="fl-valido" type="date"></div>
            <div class="form-group"><label class="form-label">Teléfono de contacto</label>
              <input class="form-input" id="fl-tel" placeholder="5501-1234"></div>
          </div>
          <button class="btn btn-amber" style="width:100%" onclick="Modulos.marketing.generarFlyer()">🎨 Generar Flyer</button>
        </div>
        <div id="flyer-preview" style="margin-top:20px"></div>`;
    }

    else if (this._tab==='fidelizacion') {
      const clientes = await DB.getClientes();
      const inscritos = clientes.filter(c=>c.programa_puntos).sort((a,b)=>(b.puntos_saldo||0)-(a.puntos_saldo||0));
      const totalPts = inscritos.reduce((s,c)=>s+(Number(c.puntos_saldo)||0),0);
      el.innerHTML = `
        <div class="alert alert-cyan" style="margin-bottom:16px"><div class="alert-icon">⭐</div>
          <div class="alert-body" style="font-size:12px">Política: <b>Q1 = 1 punto</b> en cada compra · <b>10 puntos = Q1</b> en el canje · <b>+50 puntos</b> por responder la encuesta. Inscribe clientes desde su ficha en <b>Clientes</b>.</div></div>
        <div class="kpi-grid" style="margin-bottom:16px">
          <div class="kpi-card"><div class="kpi-label">Clientes inscritos</div><div class="kpi-val cyan">${inscritos.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Puntos en circulación</div><div class="kpi-val amber">${totalPts.toLocaleString()}</div><div class="kpi-trend">≈ ${UI.q(totalPts/10)} en canjes</div></div>
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Cliente</th><th>Teléfono</th><th>Saldo</th><th>Equivale a</th><th>Movimientos</th></tr></thead>
          <tbody>${inscritos.map(c=>`<tr>
            <td><b>${c.nombre}</b></td><td class="mono-sm">${c.tel||'—'}</td>
            <td class="mono-sm text-amber"><b>${(c.puntos_saldo||0).toLocaleString()}</b> pts</td>
            <td class="mono-sm text-green">${UI.q((c.puntos_saldo||0)/10)}</td>
            <td><button class="btn btn-sm btn-ghost" onclick="Modulos.marketing.verPuntos('${c.id}','${(c.nombre||'').replace(/'/g,"\\'")}')">📜 Ver</button></td>
          </tr>`).join('')||'<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text3)">Aún no hay clientes inscritos. Actívalo en la ficha del cliente.</td></tr>'}</tbody>
        </table></div>`;
    }

    else if (this._tab==='feedback') {
      const fb = await DB.getFeedback();
      const tid = Auth.tenant?.id || '';
      const url = `${location.origin}/feedback.html?t=${encodeURIComponent(tid)}`;
      const ratings = [];
      fb.forEach(f=>{ if(f.rating_servicio) ratings.push(f.rating_servicio); if(f.rating_productos) ratings.push(f.rating_productos); });
      const prom = ratings.length ? Math.round(ratings.reduce((a,b)=>a+b,0)/ratings.length*10)/10 : 0;
      const avg = a => a.length ? Math.round(a.reduce((x,y)=>x+y,0)/a.length*10)/10 : 0;
      const promServ = avg(fb.map(f=>f.rating_servicio).filter(Boolean));
      const promProd = avg(fb.map(f=>f.rating_productos).filter(Boolean));
      const satis = ratings.length ? Math.round(ratings.filter(r=>r>=4).length/ratings.length*100) : 0;
      const aMejorar = fb.filter(f=>(f.rating_servicio&&f.rating_servicio<=2)||(f.rating_productos&&f.rating_productos<=2)).length;
      const mesAct = new Date().toISOString().slice(0,7);
      const esteMes = fb.filter(f=>(f.created_at||'').slice(0,7)===mesAct).length;
      el.innerHTML = `
        <div class="grid-2" style="margin-bottom:16px">
          <div class="card" style="text-align:center">
            <div class="card-sub mb-3">📱 QR de feedback</div>
            <div id="qrbox" style="display:flex;justify-content:center;align-items:center;min-height:170px;background:#fff;border-radius:10px;padding:10px">Generando QR...</div>
            <div style="font-size:11px;color:var(--text3);word-break:break-all;margin-top:8px">${url}</div>
            <div style="display:flex;gap:6px;justify-content:center;margin-top:10px">
              <button class="btn btn-ghost btn-sm" onclick="Modulos.marketing.imprimirQR()">🖨️ Imprimir</button>
              <button class="btn btn-ghost btn-sm" onclick="Modulos.marketing.modalEncuestaEmail()">✉️ Enviar por correo</button>
            </div>
          </div>
          <div class="card">
            <div class="card-sub mb-3">📊 KPIs de mejora</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div class="kpi-card"><div class="kpi-label">Respuestas</div><div class="kpi-val cyan">${fb.length}</div><div class="kpi-trend">${esteMes} este mes</div></div>
              <div class="kpi-card"><div class="kpi-label">Satisfacción</div><div class="kpi-val ${satis>=80?'green':satis>=60?'amber':'red'}">${satis}%</div><div class="kpi-trend">califican 4–5★</div></div>
              <div class="kpi-card"><div class="kpi-label">Prom. servicio</div><div class="kpi-val amber">${promServ||'—'}/5</div></div>
              <div class="kpi-card"><div class="kpi-label">Prom. productos</div><div class="kpi-val amber">${promProd||'—'}/5</div></div>
            </div>
            ${aMejorar>0?`<div class="alert alert-red" style="margin-top:10px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:12px"><b>${aMejorar}</b> respuesta(s) con calificación baja (≤2★) — revisa los comentarios para tu estrategia de mejora.</div></div>`:''}
          </div>
        </div>
        <div class="card-sub mb-3">💬 Respuestas recientes</div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Servicio</th><th>Productos</th><th>Comentario</th><th>Pts</th></tr></thead>
          <tbody>${fb.map(f=>`<tr>
            <td class="mono-sm">${UI.fecha(f.created_at?.slice(0,10))}</td>
            <td>${f.clientes?.nombre||f.nombre||'Anónimo'}${f.telefono?`<br><small class="text-muted">${f.telefono}</small>`:''}</td>
            <td>${'⭐'.repeat(f.rating_servicio||0)||'—'}</td>
            <td>${'⭐'.repeat(f.rating_productos||0)||'—'}</td>
            <td style="font-size:12px;max-width:240px">${f.comentario||'—'}</td>
            <td class="mono-sm text-amber">${f.puntos_otorgados||0}</td>
          </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin respuestas todavía. Comparte el QR con tus clientes.</td></tr>'}</tbody>
        </table></div>`;
      this._renderQR(url);
    }
  },

  /* ── Fidelización ───────────────────────────────── */
  async verPuntos(clienteId, nombre) {
    const movs = await DB.getPuntosMovimientos(clienteId);
    UI.modal(`📜 Puntos — ${nombre}`, `
      <div class="table-wrap" style="max-height:360px;overflow-y:auto"><table class="data-table">
        <thead><tr><th>Fecha</th><th>Movimiento</th><th>Puntos</th></tr></thead>
        <tbody>${movs.map(m=>`<tr><td class="mono-sm">${UI.fecha(m.fecha)}</td><td>${m.motivo||m.tipo}${m.referencia?` <small class="text-muted">(${m.referencia})</small>`:''}</td><td class="mono-sm ${m.puntos>=0?'text-green':'text-red'}">${m.puntos>=0?'+':''}${m.puntos}</td></tr>`).join('')||'<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:16px">Sin movimientos</td></tr>'}</tbody>
      </table></div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button></div>`);
  },

  /* ── Feedback / QR ──────────────────────────────── */
  _ensureQR() {
    if (window.qrcode) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
      s.onload = res; s.onerror = () => rej(new Error('qr')); document.head.appendChild(s);
    });
  },
  async _renderQR(url) {
    const box = document.getElementById('qrbox'); if (!box) return;
    try {
      await this._ensureQR();
      const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
      box.innerHTML = qr.createImgTag(6, 8);
      const img = box.querySelector('img'); if (img) img.style.maxWidth = '190px';
      this._qrUrl = url;
    } catch(e) { box.textContent = 'No se pudo generar el QR'; }
  },
  imprimirQR() {
    if (!window.qrcode || !this._qrUrl) { UI.toast('Espera a que cargue el QR','warn'); return; }
    const qr = qrcode(0, 'M'); qr.addData(this._qrUrl); qr.make();
    const img = qr.createImgTag(10, 12);
    const taller = Auth.tenant?.name || 'TallerPro';
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>QR Feedback</title></head>
      <body style="text-align:center;font-family:Arial;padding:36px">
      <h2>${taller}</h2><h3>📱 Escanea y déjanos tu opinión</h3>
      <p style="color:#d97706;font-weight:700">¡Gana 50 puntos de fidelización!</p>
      ${img}
      <p style="font-size:11px;color:#666;margin-top:10px">${this._qrUrl}</p>
      <script>window.print()<\/script></body></html>`);
    win.document.close();
  },
  modalEncuestaEmail() {
    UI.modal('✉️ Enviar encuesta por correo', `
      <div class="form-group"><label class="form-label">Correo del cliente</label>
        <input class="form-input" id="enc-mail" type="email" placeholder="cliente@correo.com"></div>
      <div style="font-size:11px;color:var(--text3)">Se enviará un enlace a la encuesta. Si el cliente está registrado, ganará 50 puntos al responder.</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.marketing.enviarEncuesta()">Enviar</button>
      </div>`);
  },
  async enviarEncuesta() {
    const email = document.getElementById('enc-mail')?.value.trim();
    if (!email) { UI.toast('Ingresa un correo','error'); return; }
    const tid = Auth.tenant?.id || '';
    const url = `${location.origin}/feedback.html?t=${encodeURIComponent(tid)}&o=email`;
    const taller = Auth.tenant?.name || 'TallerPro';
    const html = `<div style="font-family:Arial,sans-serif;max-width:480px"><h2 style="color:#d97706">🔧 ${taller}</h2>`+
      `<p>¡Tu opinión nos importa! Cuéntanos cómo te fue y <b>gana 50 puntos</b> de fidelización.</p>`+
      `<p style="text-align:center;margin:18px 0"><a href="${url}" style="background:#d97706;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Responder encuesta</a></p>`+
      `<p style="font-size:11px;color:#666">${url}</p></div>`;
    UI.toast('Enviando...','info');
    const r = await Email.enviar(email, `${taller} — Tu opinión nos importa`, { html });
    if (r.ok) { UI.cerrarModal(); UI.toast(`Encuesta enviada a ${email} ✓`); }
    else UI.toast('No se pudo enviar: '+r.error,'error');
  },

  generarFlyer() {
    const titulo  = document.getElementById('fl-titulo')?.value.trim();
    const desc    = document.getElementById('fl-desc')?.value.trim();
    const precReg = document.getElementById('fl-precio-reg')?.value;
    const precEsp = document.getElementById('fl-precio-esp')?.value;
    const valido  = document.getElementById('fl-valido')?.value;
    const tel     = document.getElementById('fl-tel')?.value;
    const taller  = Auth.tenant?.name || 'TallerPro';
    if (!titulo) { UI.toast('El título es obligatorio','error'); return; }

    const descPct = precReg&&precEsp ? Math.round((1-precEsp/precReg)*100) : 0;

    document.getElementById('flyer-preview').innerHTML = `
      <div id="flyer-card" style="max-width:500px;margin:0 auto;background:linear-gradient(135deg,#0A0E1A,#161E2E);border:2px solid var(--amber);border-radius:16px;padding:32px;text-align:center;font-family:'Manrope',sans-serif">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:14px;color:var(--text3);letter-spacing:3px;margin-bottom:8px">${taller.toUpperCase()}</div>
        <div style="font-size:13px;color:var(--amber);margin-bottom:16px">🔧 TALLER MECÁNICO PROFESIONAL</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;color:var(--amber);letter-spacing:2px;line-height:1.1;margin-bottom:12px">${titulo.toUpperCase()}</div>
        ${desc?`<div style="font-size:13px;color:var(--text2);margin-bottom:16px;line-height:1.6">${desc}</div>`:''}
        ${precReg&&precEsp?`
        <div style="margin:20px 0">
          ${descPct>0?`<div style="background:var(--red);color:#fff;border-radius:50%;width:60px;height:60px;display:inline-flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:18px;margin-bottom:12px">${descPct}%<br>OFF</div>`:''}
          <div style="font-size:14px;color:var(--text3);text-decoration:line-through">Regular: Q${precReg}</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:48px;color:var(--green)">Q${precEsp}</div>
        </div>`:''}
        ${valido?`<div style="font-size:12px;color:var(--text3);border:1px solid var(--border);border-radius:8px;padding:6px 12px;display:inline-block;margin-bottom:12px">📅 Válido hasta ${UI.fecha(valido)}</div>`:''}
        ${tel?`<div style="font-size:16px;color:var(--cyan);font-weight:700;margin-top:8px">📞 ${tel}</div>`:''}
        <div style="margin-top:16px;font-size:10px;color:var(--text3)">TallerPro Enterprise · ${new Date().getFullYear()}</div>
      </div>
      <div style="text-align:center;margin-top:12px">
        <button class="btn btn-ghost" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
      </div>`;
  },

  modalCombo(id=null) {
    const c = id ? this._combos.find(x=>x.id===id) : {};
    UI.modal(`${id?'✏️ Editar':'＋ Nuevo'} Combo`, `
      ${id?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del combo.</div></div>':''}
      <div class="form-group"><label class="form-label">Nombre del Combo *</label>
        <input class="form-input" id="cmb-nombre" value="${c.nombre||''}" placeholder="Combo Mantenimiento Premium"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo</label>
          <select class="form-select" id="cmb-tipo">
            ${['servicios','repuestos','mixto'].map(t=>`<option value="${t}" ${c.tipo===t?'selected':''}>${t}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Estado</label>
          <select class="form-select" id="cmb-activo">
            <option value="true" ${c.activo!==false?'selected':''}>Activo</option>
            <option value="false" ${c.activo===false?'selected':''}>Inactivo</option>
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Descripción / Incluye</label>
        <textarea class="form-input" id="cmb-desc" rows="3" placeholder="Incluye: cambio de aceite + filtro + revisión de frenos...">${c.descripcion||''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Precio Regular (Q)</label>
          <input class="form-input" id="cmb-reg" type="number" value="${c.precio_regular||0}" step="0.01"></div>
        <div class="form-group"><label class="form-label">Precio Combo (Q)</label>
          <input class="form-input" id="cmb-combo" type="number" value="${c.precio_combo||0}" step="0.01"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.marketing.guardarCombo('${id||''}')">
          ${id?'Guardar Cambios':'Crear Combo'}
        </button>
      </div>`);
  },

  async guardarCombo(id='') {
    const nombre = document.getElementById('cmb-nombre')?.value.trim();
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }
    const fields = {
      nombre,
      tipo:           document.getElementById('cmb-tipo')?.value,
      descripcion:    document.getElementById('cmb-desc')?.value||null,
      precio_regular: parseFloat(document.getElementById('cmb-reg')?.value)||0,
      precio_combo:   parseFloat(document.getElementById('cmb-combo')?.value)||0,
      activo:         document.getElementById('cmb-activo')?.value === 'true'
    };
    if (id) fields.id = id;
    const {error} = await DB.upsertCombo(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Combo actualizado ✓':'Combo creado ✓');
    this._renderTab();
  },

  modalPromo(id=null) {
    const p = id ? this._promos.find(x=>x.id===id) : {};
    UI.modal(`${id?'✏️ Editar':'＋ Nueva'} Promoción`, `
      ${id?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual de la promoción.</div></div>':''}
      <div class="form-group"><label class="form-label">Nombre *</label>
        <input class="form-input" id="prm-nombre" value="${p.nombre||''}" placeholder="Descuento Julio"></div>
      <div class="form-group"><label class="form-label">Descripción</label>
        <textarea class="form-input" id="prm-desc" rows="2">${p.descripcion||''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Descuento %</label>
          <input class="form-input" id="prm-pct" type="number" value="${p.descuento_pct||0}" min="0" max="100"></div>
        <div class="form-group"><label class="form-label">Estado</label>
          <select class="form-select" id="prm-activa">
            <option value="true" ${p.activa!==false?'selected':''}>Activa</option>
            <option value="false" ${p.activa===false?'selected':''}>Inactiva</option>
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha Inicio</label>
          <input class="form-input" id="prm-ini" type="date" value="${p.fecha_inicio||new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Fecha Fin (opcional)</label>
          <input class="form-input" id="prm-fin" type="date" value="${p.fecha_fin||''}"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.marketing.guardarPromo('${id||''}')">
          ${id?'Guardar Cambios':'Crear Promoción'}
        </button>
      </div>`);
  },

  async guardarPromo(id='') {
    const nombre = document.getElementById('prm-nombre')?.value.trim();
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }
    const fields = {
      nombre,
      descripcion:   document.getElementById('prm-desc')?.value||null,
      descuento_pct: parseFloat(document.getElementById('prm-pct')?.value)||0,
      activa:        document.getElementById('prm-activa')?.value === 'true',
      fecha_inicio:  document.getElementById('prm-ini')?.value||null,
      fecha_fin:     document.getElementById('prm-fin')?.value||null
    };
    if (id) fields.id = id;
    const {error} = await DB.upsertPromocion(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Promoción actualizada ✓':'Promoción creada ✓');
    this._renderTab();
  }
};
