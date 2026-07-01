/* NexusPro v3.0 — marketing/index.js */
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
          ${this._combos.map(c=>{
            const descPct = c.precio_regular>0 ? Math.round((1-c.precio_combo/c.precio_regular)*100) : 0;
            return `
            <div class="combo-card">
              ${descPct>0?`<div style="position:absolute;top:12px;right:12px;background:var(--red);color:#fff;font-size:10px;font-weight:900;padding:4px 8px;border-radius:99px;box-shadow:0 4px 10px rgba(239,68,68,0.2)">-${descPct}% OFF</div>`:''}
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                <span class="badge badge-${c.tipo==='servicios'?'cyan':'amber'}">${c.tipo}</span>
                <span class="badge badge-${c.activo?'green':'gray'}">${c.activo?'Activo':'Inactivo'}</span>
              </div>
              <div style="font-weight:900;font-size:18px;letter-spacing:-0.4px;line-height:1.2;margin-bottom:6px;font-family:'Outfit','Inter',sans-serif">${c.nombre}</div>
              <div style="font-size:12px;color:var(--text2);margin-bottom:16px;min-height:36px">${c.descripcion||'Sin descripción.'}</div>
              <div style="background:var(--surface2);border-radius:12px;padding:12px;margin-bottom:16px">
                <div style="font-size:11px;color:var(--text3);text-decoration:line-through;margin-bottom:2px">Precio Regular: ${UI.q(c.precio_regular)}</div>
                <div style="font-size:22px;font-weight:900;color:var(--amber);font-family:'Outfit','Inter',sans-serif">${UI.q(c.precio_combo)}</div>
              </div>
              <div style="display:flex;gap:4px">
                ${Modulos.btnAccion('editar', `Modulos.marketing.modalCombo('${c.id}')`)}
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('combos','${c.id}','${(c.nombre||'').replace(/'/g,"\\'")}',()=>Modulos.marketing._renderTab())`)}
              </div>
            </div>`;
          }).join('')||'<div class="text-muted">Sin combos creados</div>'}
        </div>`;
    }

    else if (this._tab==='promos') {
      this._promos = await DB.getPromociones();
      const hoy = new Date().toISOString().slice(0,10);
      el.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
          <button class="btn btn-amber" onclick="Modulos.marketing.modalPromo()">＋ Nueva Promoción</button>
        </div>
        <div class="coupon-grid">
          ${this._promos.map(p=>{
            const vigente = p.activa && p.fecha_inicio<=hoy && (!p.fecha_fin||p.fecha_fin>=hoy);
            return `
            <div class="coupon-card">
              <div style="display:flex;height:100%;align-items:center">
                <!-- Left portion -->
                <div style="width:30%;text-align:center;padding-right:16px;border-right:1px dashed var(--border);display:flex;flex-direction:column;justify-content:center">
                  <div style="font-size:32px;font-weight:900;color:var(--amber);font-family:'Outfit',sans-serif;line-height:1">${p.descuento_pct}%</div>
                  <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-top:4px">OFF</div>
                </div>
                <!-- Right portion -->
                <div style="width:70%;padding-left:20px;display:flex;flex-direction:column;justify-content:space-between">
                  <div>
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px;margin-bottom:4px">
                      <div style="font-weight:900;font-size:15px;color:var(--text);line-height:1.2;font-family:'Outfit',sans-serif">${p.nombre}</div>
                      <span class="badge badge-${vigente?'green':'gray'}" style="font-size:8px;padding:2px 6px">${vigente?'Vigente':'Inactiva'}</span>
                    </div>
                    <div style="font-size:11px;color:var(--text2);margin-bottom:12px">${p.descripcion||'Sin descripción.'}</div>
                  </div>
                  <div>
                    <div style="font-size:9px;color:var(--text3);margin-bottom:8px">
                      📅 ${UI.fecha(p.fecha_inicio)} al ${p.fecha_fin?UI.fecha(p.fecha_fin):'Sin límite'}
                    </div>
                    <div style="display:flex;gap:4px">
                      ${Modulos.btnAccion('editar', `Modulos.marketing.modalPromo('${p.id}')`)}
                      ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('promociones','${p.id}','${(p.nombre||'').replace(/'/g,"\\'")}',()=>Modulos.marketing._renderTab())`)}
                    </div>
                  </div>
                </div>
              </div>
            </div>`;
          }).join('')||'<div class="text-muted">Sin promociones creadas</div>'}
        </div>`;
    }

    else if (this._tab==='flyers') {
      el.innerHTML = `
        <div class="mkt-split-view">
          <!-- Form -->
          <div class="card">
            <div class="card-sub mb-4">🎨 Configurar Contenido del Flyer</div>
            <div class="form-group"><label class="form-label">Plantilla de Diseño</label>
              <select class="form-select" id="fl-template">
                <option value="neon">Cyber Neon (Negro / Neon)</option>
                <option value="vintage">Retro Vintage (Oro / Madera)</option>
                <option value="minimal">Minimal Clean (Limpio / Profesional)</option>
              </select></div>
            <div class="form-group"><label class="form-label">Título del Flyer *</label>
              <input class="form-input" id="fl-titulo" placeholder="¡OFERTA ESPECIAL! Cambio de aceite" value="CAMBIO DE ACEITE PREMIUM"></div>
            <div class="form-group"><label class="form-label">Descripción</label>
              <textarea class="form-input" id="fl-desc" rows="3" placeholder="Incluye filtro + 4 litros de aceite sintético...">Incluye cambio de filtro, revisión de 15 puntos de seguridad y mano de obra calificada.</textarea></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Precio Regular (Q)</label>
                <input class="form-input" id="fl-precio-reg" type="number" placeholder="350" value="450"></div>
              <div class="form-group"><label class="form-label">Precio Especial (Q)</label>
                <input class="form-input" id="fl-precio-esp" type="number" placeholder="249" value="299"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Válido hasta</label>
                <input class="form-input" id="fl-valido" type="date" value="${new Date(Date.now()+15*24*60*60*1000).toISOString().slice(0,10)}"></div>
              <div class="form-group"><label class="form-label">Teléfono de contacto</label>
                <input class="form-input" id="fl-tel" placeholder="5501-1234" value="${Auth.tenant?.tel || ''}"></div>
            </div>
            <div style="font-size:11px;color:var(--text3);margin-bottom:12px">Los cambios en el formulario se reflejan en tiempo real en la vista previa a la derecha.</div>
            <button class="btn btn-amber" style="width:100%" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
          </div>
          <!-- Live Preview -->
          <div style="position:sticky;top:10px">
            <div class="card-sub mb-3" style="text-align:center">📱 Vista Previa en Vivo</div>
            <div id="flyer-preview" style="display:flex;justify-content:center;align-items:center;min-height:380px;background:var(--surface2);border-radius:16px;border:1px dashed var(--border);padding:10px"></div>
          </div>
        </div>`;
      
      setTimeout(() => {
        ['fl-template','fl-titulo','fl-desc','fl-precio-reg','fl-precio-esp','fl-valido','fl-tel'].forEach(id => {
          document.getElementById(id)?.addEventListener('input', () => Modulos.marketing.generarFlyer());
          document.getElementById(id)?.addEventListener('change', () => Modulos.marketing.generarFlyer());
        });
        Modulos.marketing.generarFlyer();
      }, 50);
    }

    else if (this._tab==='fidelizacion') {
      const clientes = await DB.getClientes();
      const fid = fidelizacionCfg();
      const tasa = Number(fid.puntos_por_q1_canje)||10;
      const inscritos = clientes.filter(c=>c.programa_puntos).sort((a,b)=>(b.puntos_saldo||0)-(a.puntos_saldo||0));
      const totalPts = inscritos.reduce((s,c)=>s+(Number(c.puntos_saldo)||0),0);

      const tierBadge = pts => {
        if (pts >= 5000) return '<span class="badge" style="background:linear-gradient(135deg,#c084fc,#818cf8);color:#fff;font-weight:800">💎 PLATINO</span>';
        if (pts >= 2000) return '<span class="badge" style="background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#fff;font-weight:800">👑 ORO</span>';
        if (pts >= 500) return '<span class="badge" style="background:linear-gradient(135deg,#9ca3af,#4b5563);color:#fff;font-weight:800">🥈 PLATA</span>';
        return '<span class="badge" style="background:linear-gradient(135deg,#b45309,#78350f);color:#fff;font-weight:800">🟫 BRONCE</span>';
      };
      
      const nextTierInfo = pts => {
        if (pts >= 5000) return { name:'Max Nivel', ptsNeeded: 0, pct: 100 };
        if (pts >= 2000) return { name:'Platino', ptsNeeded: 5000 - pts, pct: Math.round(((pts - 2000)/3000)*100) };
        if (pts >= 500) return { name:'Oro', ptsNeeded: 2000 - pts, pct: Math.round(((pts - 500)/1500)*100) };
        return { name:'Plata', ptsNeeded: 500 - pts, pct: Math.round((pts/500)*100) };
      };

      el.innerHTML = `
        <div class="alert alert-cyan" style="margin-bottom:16px;display:flex;align-items:flex-start;gap:12px"><div class="alert-icon">⭐</div>
          <div class="alert-body" style="font-size:12px;flex:1">Política del taller:
            <b>Q1 = ${fid.puntos_por_q} punto${fid.puntos_por_q==1?'':'s'}</b> en cada compra ·
            <b>${tasa} puntos = Q1</b> en el canje ·
            <b>${fid.bono_afiliacion>0?`+${fid.bono_afiliacion} pts`:'sin bono'}</b> al afiliarse ·
            <b>${fid.bono_feedback>0?`+${fid.bono_feedback} pts`:'sin bono'}</b> por encuesta (máx ${fid.feedback_max_mes}/mes).
            Inscribe clientes desde su ficha en <b>Clientes</b>.</div>
          <button class="btn btn-ghost btn-sm" onclick="Modulos.marketing.modalPoliticas()">⚙️ Cambiar políticas</button></div>
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'👥', clase:'cyan', label:'Clientes inscritos', value: inscritos.length })}
          ${UI.kpiCard({ icon:'⭐', clase:'amber', label:'Puntos en circulación', value: totalPts, trend:`≈ ${UI.q(totalPts/tasa)} en canjes` })}
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Cliente</th><th>Teléfono</th><th>Saldo</th><th>Equivale a</th><th>Nivel de Fidelidad</th><th>Movimientos</th></tr></thead>
          <tbody>${inscritos.map(c=>{
            const tier = nextTierInfo(c.puntos_saldo||0);
            return `<tr>
            <td><b>${c.nombre}</b></td><td class="mono-sm">${c.tel||'—'}</td>
            <td class="mono-sm text-amber"><b>${(c.puntos_saldo||0).toLocaleString()}</b> pts</td>
            <td class="mono-sm text-green">${UI.q((c.puntos_saldo||0)/tasa)}</td>
            <td>
              <div style="display:flex;flex-direction:column;gap:4px;min-width:160px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  ${tierBadge(c.puntos_saldo||0)}
                  <span style="font-size:9px;color:var(--text3)">${tier.ptsNeeded > 0 ? `Faltan ${tier.ptsNeeded} pts` : 'Max Nivel'}</span>
                </div>
                <div class="fid-progress-bar" title="${tier.pct}% para subir de rango">
                  <div class="fid-progress-fill" style="width:${tier.pct}%"></div>
                </div>
              </div>
            </td>
            <td><button class="btn btn-sm btn-ghost" onclick="Modulos.marketing.verPuntos('${c.id}','${(c.nombre||').replace(/'/g,"\\'")}')">📜 Ver</button></td>
          </tr>`;}).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Aún no hay clientes inscritos. Actívalo en la ficha del cliente.</td></tr>'}</tbody>
        </table></div>`;
    }

    else if (this._tab==='feedback') {
      const fb = await DB.getFeedback();
      const tid = Auth.tenant?.id || '';
      const url = `${location.origin}/feedback.html?t=${encodeURIComponent(tid)}`;
      const taller = Auth.tenant?.name || 'NexusPro';
      const ASP = [['rating_servicio','Servicio'],['rating_instalaciones','Instalaciones'],['rating_limpieza','Limpieza personal'],['rating_entrega','Condiciones de entrega'],['rating_documentos','Documentos']];
      const avg = a => a.length ? Math.round(a.reduce((x,y)=>x+y,0)/a.length*10)/10 : 0;
      const ratings = [];
      fb.forEach(f => ASP.forEach(([k]) => { if (f[k]) ratings.push(f[k]); }));
      const satis = ratings.length ? Math.round(ratings.filter(r=>r>=4).length/ratings.length*100) : 0;
      const aMejorar = fb.filter(f => ASP.some(([k]) => f[k] && f[k] <= 2)).length;
      const promAsp = ASP.map(([k,l]) => [l, avg(fb.map(f=>f[k]).filter(Boolean))]);
      const mesAct = new Date().toISOString().slice(0,7);
      const esteMes = fb.filter(f=>(f.created_at||'').slice(0,7)===mesAct).length;
      
      el.innerHTML = `
        <div class="mkt-split-view" style="margin-bottom:20px">
          <!-- Left Column: Poster / QR -->
          <div class="card" style="text-align:center">
            <div class="card-sub mb-3">📱 Poster Oficial de Feedback</div>
            <div style="background:linear-gradient(135deg,var(--surface2) 0%,var(--border) 100%);border-radius:12px;padding:24px;border:1px solid var(--border);box-shadow:0 8px 20px rgba(0,0,0,0.02)">
              <div style="font-weight:900;font-size:16px;color:var(--amber);margin-bottom:6px;font-family:Outfit,sans-serif">${taller.toUpperCase()}</div>
              <div style="font-size:13px;font-weight:800;margin-bottom:14px;color:var(--text)">¡TU OPINIÓN NOS IMPORTA!</div>
              <div id="qrbox" style="display:inline-flex;justify-content:center;align-items:center;background:#fff;border-radius:10px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.05)">Generando QR...</div>
              <div style="font-size:10px;color:var(--text3);margin-top:12px;word-break:break-all">${url}</div>
              ${fidelizacionCfg().bono_feedback>0?`<div style="margin-top:12px;background:color-mix(in srgb,var(--amber)12%,var(--surface2));color:var(--amber);font-size:11px;font-weight:800;padding:6px 10px;border-radius:6px;display:inline-block">🎁 ¡Obtén ${fidelizacionCfg().bono_feedback} puntos de regalo!</div>`:''}
            </div>
            <div style="display:flex;gap:6px;justify-content:center;margin-top:14px">
              <button class="btn btn-ghost btn-sm" onclick="Modulos.marketing.imprimirQR()">🖨️ Imprimir Poster</button>
              <button class="btn btn-ghost btn-sm" onclick="Modulos.marketing.modalEncuestaEmail()">✉️ Enviar por Correo</button>
            </div>
          </div>
          <!-- Right Column: KPIs & aspect satisfaction -->
          <div class="card">
            <div class="card-sub mb-3">📊 Métricas de Satisfacción</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
              ${UI.kpiCard({ icon:'💬', clase:'cyan', label:'Respuestas', value: fb.length, trend:`${esteMes} este mes` })}
              ${UI.kpiCard({ icon:'😊', clase: satis>=80?'green':satis>=60?'amber':'red', label:'Satisfacción', value: `${satis}%`, trend:'Califican 4–5★' })}
            </div>
            <div style="margin-top:10px">
              <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">Promedio por Aspecto</div>
              ${promAsp.map(([l,v])=>`
                <div style="margin-bottom:10px">
                  <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                    <span>${l}</span>
                    <span class="text-amber" style="font-weight:700">${v||'—'} / 5</span>
                  </div>
                  <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                    <div style="height:100%;border-radius:3px;width:${v?v*20:0}%;background:var(--${v>=4?'green':v>=3?'amber':'red'})"></div>
                  </div>
                </div>`).join('')}
            </div>
            ${aMejorar>0?`<div class="alert alert-red" style="margin-top:14px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px"><b>${aMejorar}</b> respuesta(s) con calificación baja (≤2★) detectadas en la encuesta.</div></div>`:''}
          </div>
        </div>
        <div class="card-sub mb-3">💬 Respuestas recientes</div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Servicio</th><th>Productos</th><th>Comentario</th><th>Pts</th></tr></thead>
          <tbody>${fb.map(f=>`<tr>
            <td class="mono-sm">${UI.fecha(f.created_at?.slice(0,10))}</td>
            <td>${f.clientes?.nombre||f.nombre||'Anónimo'}${f.telefono?`<br><small class="text-muted">${f.telefono}</small>`:''}${(f.vehiculo||f.servicio)?`<br><small class="text-muted">${[f.vehiculo,f.servicio].filter(Boolean).join(' · ')}</small>`:''}</td>
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
  /* ── POLÍTICAS DE FIDELIZACIÓN (configurables por taller) ── */
  modalPoliticas() {
    const f = fidelizacionCfg();
    UI.modal('⚙️ Políticas de fidelización', `
      <div class="alert alert-amber" style="margin-bottom:14px"><div class="alert-icon">⚠️</div>
        <div class="alert-body" style="font-size:11px">Los cambios aplican a las ventas y bonos <b>futuros</b>;
        los puntos ya acumulados no se recalculan. Pon un bono en <b>0</b> para desactivarlo.</div></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Puntos por cada Q1 de compra</label>
          <input class="form-input" id="fid-ppq" type="number" min="0" step="0.5" value="${f.puntos_por_q}">
          <div style="font-size:11px;color:var(--text3);margin-top:3px">0 = no se acumulan puntos al comprar</div></div>
        <div class="form-group"><label class="form-label">Puntos que valen Q1 al canjear</label>
          <input class="form-input" id="fid-tasa" type="number" min="1" step="1" value="${f.puntos_por_q1_canje}">
          <div style="font-size:11px;color:var(--text3);margin-top:3px">ej. 10 → 100 pts = Q10 de descuento</div></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Bono por afiliarse (pts)</label>
          <input class="form-input" id="fid-afil" type="number" min="0" step="5" value="${f.bono_afiliacion}"></div>
        <div class="form-group"><label class="form-label">Bono por encuesta (pts)</label>
          <input class="form-input" id="fid-fb" type="number" min="0" step="5" value="${f.bono_feedback}"></div>
        <div class="form-group"><label class="form-label">Máx. encuestas con bono / mes</label>
          <input class="form-input" id="fid-fbmax" type="number" min="0" step="1" value="${f.feedback_max_mes}"></div>
      </div>
      <div id="fid-ejemplo" style="background:var(--surface2);border-radius:8px;padding:10px;font-size:12px;color:var(--text2)"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.marketing.guardarPoliticas()">Guardar políticas</button>
      </div>`, '560px');
    /* ejemplo en vivo */
    const pintar = () => {
      const ppq = parseFloat(document.getElementById('fid-ppq')?.value)||0;
      const tasa = parseInt(document.getElementById('fid-tasa')?.value)||10;
      const ej = document.getElementById('fid-ejemplo');
      if (ej) ej.innerHTML = `💡 Ejemplo: una compra de <b>Q500</b> da <b>${Math.floor(500*ppq)} puntos</b>,
        que al canjear valen <b>${UI.q(Math.floor(500*ppq)/tasa)}</b>
        (retorno del ${(ppq/tasa*100).toFixed(1)}% — entre 1% y 5% es lo sano).`;
    };
    ['fid-ppq','fid-tasa'].forEach(id=>document.getElementById(id)?.addEventListener('input', pintar));
    pintar();
  },

  async guardarPoliticas() {
    const fidelizacion = {
      puntos_por_q:        Math.max(0, parseFloat(document.getElementById('fid-ppq')?.value)||0),
      puntos_por_q1_canje: Math.max(1, parseInt(document.getElementById('fid-tasa')?.value)||10),
      bono_afiliacion:     Math.max(0, parseInt(document.getElementById('fid-afil')?.value)||0),
      bono_feedback:       Math.max(0, parseInt(document.getElementById('fid-fb')?.value)||0),
      feedback_max_mes:    Math.max(0, parseInt(document.getElementById('fid-fbmax')?.value)||0)
    };
    const ok = await DB.updateTenant({ fidelizacion, updated_at: new Date().toISOString() });
    if (!ok) { UI.toast('No se pudieron guardar las políticas','error'); return; }
    if (Auth.tenant) Auth.tenant.fidelizacion = fidelizacion;
    UI.cerrarModal(); UI.toast('Políticas de fidelización actualizadas ✓');
    this._renderTab();
  },

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
    const taller = Auth.tenant?.name || 'NexusPro';
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>QR Feedback</title></head>
      <body style="text-align:center;font-family:Arial;padding:36px">
      <h2>${taller}</h2><h3>📱 Escanea y déjanos tu opinión</h3>
      ${fidelizacionCfg().bono_feedback>0?`<p style="color:#d97706;font-weight:700">¡Gana ${fidelizacionCfg().bono_feedback} puntos de fidelización!</p>`:''}
      ${img}
      <p style="font-size:11px;color:#666;margin-top:10px">${this._qrUrl}</p>
      <script>window.print()<\/script></body></html>`);
    win.document.close();
  },
  modalEncuestaEmail() {
    UI.modal('✉️ Enviar encuesta por correo', `
      <div class="form-group"><label class="form-label">Correo del cliente</label>
        <input class="form-input" id="enc-mail" type="email" placeholder="cliente@correo.com"></div>
      <div style="font-size:11px;color:var(--text3)">Se enviará un enlace a la encuesta.${fidelizacionCfg().bono_feedback>0?` Si el cliente está registrado, ganará ${fidelizacionCfg().bono_feedback} puntos al responder.`:''}</div>
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
    const taller = Auth.tenant?.name || 'NexusPro';
    const html = `<div style="font-family:Arial,sans-serif;max-width:480px"><h2 style="color:#d97706">🔧 ${taller}</h2>`+
      `<p>¡Tu opinión nos importa! Cuéntanos cómo te fue${fidelizacionCfg().bono_feedback>0?` y <b>gana ${fidelizacionCfg().bono_feedback} puntos</b> de fidelización`:''}.</p>`+
      `<p style="text-align:center;margin:18px 0"><a href="${url}" style="background:#d97706;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Responder encuesta</a></p>`+
      `<p style="font-size:11px;color:#666">${url}</p></div>`;
    UI.toast('Enviando...','info');
    const r = await Email.enviar(email, `${taller} — Tu opinión nos importa`, { html });
    if (r.ok) { UI.cerrarModal(); UI.toast(`Encuesta enviada a ${email} ✓`); }
    else UI.toast('No se pudo enviar: '+r.error,'error');
  },

  generarFlyer() {
    const titulo  = document.getElementById('fl-titulo')?.value.trim() || 'CAMBIO DE ACEITE PREMIUM';
    const desc    = document.getElementById('fl-desc')?.value.trim() || '';
    const precReg = document.getElementById('fl-precio-reg')?.value;
    const precEsp = document.getElementById('fl-precio-esp')?.value;
    const valido  = document.getElementById('fl-valido')?.value;
    const tel     = document.getElementById('fl-tel')?.value;
    const taller  = Auth.tenant?.name || 'NexusPro';
    const temp    = document.getElementById('fl-template')?.value || 'neon';

    const descPct = precReg&&precEsp ? Math.round((1-precEsp/precReg)*100) : 0;

    let style = '';
    let headerStyle = '';
    let titleStyle = '';
    let textStyle = '';
    let labelStyle = '';
    let priceStyle = '';

    if (temp === 'neon') {
      style = 'background:linear-gradient(135deg,#0a0e1a,#161e2e); border:2px solid var(--amber); box-shadow:0 10px 30px rgba(217,119,6,0.15); color:#fff;';
      headerStyle = 'color:var(--text3);letter-spacing:4px;font-weight:700;';
      titleStyle = 'color:var(--amber);letter-spacing:1px;font-family:Outfit,sans-serif;font-weight:900;';
      textStyle = 'color:#d1d5db;';
      labelStyle = 'color:var(--cyan);font-weight:700;';
      priceStyle = 'color:var(--green);font-family:Outfit,sans-serif;font-weight:900;';
    } else if (temp === 'vintage') {
      style = 'background:linear-gradient(135deg,#2e1e12,#4a321a); border:2px dashed #d97706; box-shadow:0 10px 25px rgba(0,0,0,0.3); color:#fef08a;';
      headerStyle = 'color:#fbcfe8;letter-spacing:2px;font-family:Georgia,serif;font-style:italic;';
      titleStyle = 'color:#fef08a;font-family:Georgia,serif;font-weight:700;text-transform:uppercase;';
      textStyle = 'color:#fef08a;opacity:0.85;';
      labelStyle = 'color:#fb923c;font-weight:700;';
      priceStyle = 'color:#4ade80;font-family:Georgia,serif;font-weight:800;';
    } else { // minimal
      style = 'background:linear-gradient(135deg,#ffffff,#f9fafb); border:1px solid #e5e7eb; box-shadow:0 20px 40px rgba(0,0,0,0.06); color:#1f2937;';
      headerStyle = 'color:#6b7280;letter-spacing:3px;font-weight:600;';
      titleStyle = 'color:#111827;font-family:Outfit,sans-serif;font-weight:900;';
      textStyle = 'color:#4b5563;';
      labelStyle = 'color:#2563eb;font-weight:700;';
      priceStyle = 'color:#059669;font-family:Outfit,sans-serif;font-weight:900;';
    }

    const previewEl = document.getElementById('flyer-preview');
    if (!previewEl) return;
    previewEl.innerHTML = `
      <div id="flyer-card" style="width:100%;max-width:440px;margin:0 auto;border-radius:18px;padding:32px;text-align:center;font-family:\'Outfit\',\'Inter\',sans-serif;position:relative;overflow:hidden;box-sizing:border-box;${style}">
        <div style="font-size:12px;font-weight:800;text-transform:uppercase;margin-bottom:6px;${headerStyle}">${taller}</div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:20px;opacity:0.75">🔧 SERVICIO MECÁNICO PREMIUM</div>
        <div style="font-size:26px;line-height:1.2;margin-bottom:14px;${titleStyle}">${titulo.toUpperCase()}</div>
        ${desc?`<div style="font-size:13px;margin-bottom:20px;line-height:1.6;${textStyle}">${desc}</div>`:''}
        
        ${precReg&&precEsp?`
        <div style="margin:24px 0;display:flex;flex-direction:column;align-items:center;justify-content:center">
          ${descPct>0?`<div style="background:var(--red);color:#fff;border-radius:50%;width:58px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:900;font-size:13px;margin-bottom:14px;box-shadow:0 6px 12px rgba(239,68,68,0.2)"><span>${descPct}%</span><span style="font-size:8px;font-weight:700">OFF</span></div>`:''}
          <div style="font-size:13px;text-decoration:line-through;opacity:0.6;margin-bottom:2px">Regular: Q${precReg}</div>
          <div style="font-size:42px;line-height:1;${priceStyle}">Q${precEsp}</div>
        </div>`:''}
        
        ${valido?`<div style="font-size:11px;border:1px solid var(--border);border-radius:8px;padding:6px 14px;display:inline-block;margin-bottom:16px;background:rgba(0,0,0,0.02)">📅 Válido hasta ${UI.fecha(valido)}</div>`:''}
        ${tel?`<div style="font-size:16px;margin-top:10px;${labelStyle}">📞 ¡Haz tu cita hoy! ${tel}</div>`:''}
        <div style="margin-top:24px;font-size:9px;opacity:0.5;letter-spacing:0.5px">NexusPro Enterprise · ${new Date().getFullYear()}</div>
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
