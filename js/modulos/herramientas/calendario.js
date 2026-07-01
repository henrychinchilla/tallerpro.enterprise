/* NexusPro v3.0 — calendario/index.js
   Vistas Día / Semana / Mes con número de semana ISO.
   Eventos: citas, pagos recurrentes, envíos y vencimientos SAT. */
Modulos.calendario = {
  _citas: [], _clientes: [], _vehiculos: [], _empleados: [],
  _vista: 'mes',            // 'dia' | 'semana' | 'mes'
  _fecha: null,             // ancla de navegación (Date)

  /* ── Utilidades de fechas ── */
  _f(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; },
  _lunesDe(d) { const x = new Date(d); const dia = (x.getDay()+6)%7; x.setDate(x.getDate()-dia); return x; },
  /* Número de semana ISO 8601 */
  _semanaISO(d) {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dia = x.getUTCDay() || 7;
    x.setUTCDate(x.getUTCDate() + 4 - dia);
    const inicioAnio = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return Math.ceil(((x - inicioAnio) / 86400000 + 1) / 7);
  },

  /* Rango visible según la vista */
  _rango() {
    const a = this._fecha || (this._fecha = new Date());
    if (this._vista === 'dia') return { ini: new Date(a), fin: new Date(a) };
    if (this._vista === 'semana') {
      const ini = this._lunesDe(a); const fin = new Date(ini); fin.setDate(fin.getDate()+6);
      return { ini, fin };
    }
    const ini = this._lunesDe(new Date(a.getFullYear(), a.getMonth(), 1));
    const fin = new Date(this._lunesDe(new Date(a.getFullYear(), a.getMonth()+1, 0)));
    fin.setDate(fin.getDate()+6);
    return { ini, fin };
  },

  _navegar(paso) {
    const a = this._fecha || new Date();
    if (this._vista === 'dia') a.setDate(a.getDate()+paso);
    else if (this._vista === 'semana') a.setDate(a.getDate()+7*paso);
    else a.setMonth(a.getMonth()+paso, 1);
    this._fecha = a;
    this.render();
  },

  _irHoy() { this._fecha = new Date(); this.render(); },
  _verDia(fechaStr) { this._fecha = new Date(fechaStr+'T00:00:00'); this._vista='dia'; this.render(); },
  _setVista(v) { this._vista = v; this.render(); },

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    if (!this._fecha) this._fecha = new Date();
    const { ini, fin } = this._rango();
    const iniStr = this._f(ini), finStr = this._f(fin);

    let vencDocs = [], recurrentes = [], envios = [], fiscal = null, obligaciones = [];
    [this._citas, this._clientes, this._vehiculos, this._empleados, vencDocs, recurrentes, envios, fiscal, obligaciones] = await Promise.all([
      DB.getCitas(iniStr, finStr), DB.getClientes(), DB.getVehiculos(), DB.getEmpleados(),
      DB.getVencimientosDocumentos(60).catch(()=>[]), DB.getEgresosRecurrentes().catch(()=>[]),
      DB.getEnvios({archivado:false}).catch(()=>[]),
      DB.getConfigFiscal().catch(()=>null),
      Promise.all([DB.getObligaciones(ini.getFullYear()).catch(()=>[]),
                   DB.getObligaciones(fin.getFullYear()).catch(()=>[])]).then(r=>[...r[0],...r[1]])
    ]);

    /* ── Eventos del rango visible ── */
    const enRango = f => f && f >= iniStr && f <= finStr;
    const pagos = this._pagosEventosRango(recurrentes, ini, fin);
    const enviosEv = (envios||[])
      .filter(e=>enRango(e.fecha_entrega_estimada) && e.estado!=='cerrado')
      .map(e=>({ _envio:true, id:e.id, titulo:e.descripcion, tipo:e.tipo, fecha_cita:`${e.fecha_entrega_estimada}T10:00:00` }));
    const conSAT  = (typeof moduloEnPlan!=='function' || moduloEnPlan('contabilidad'));
    const conRRHH = (typeof moduloEnPlan!=='function' || moduloEnPlan('rrhh'));
    const satEv = (conSAT || conRRHH)
      ? this._eventosSATRango(ini, fin, fiscal, obligaciones, { sat: conSAT, igss: conRRHH })
        .filter(e=>enRango(e.fecha_cita.slice(0,10)))
      : [];
    const feriadosEv = this._feriadosEventosRango(ini, fin);
    const eventos = [...this._citas, ...pagos, ...enviosEv, ...satEv, ...feriadosEv]
      .sort((a,b)=>(a.fecha_cita||'').localeCompare(b.fecha_cita||''));
    this._eventosMes = eventos;

    const hoyStr = this._f(new Date());
    const citasHoy = eventos.filter(c=>c.fecha_cita?.slice(0,10)===hoyStr);

    /* ── Encabezado según vista ── */
    const a = this._fecha;
    const sem = this._semanaISO(a);
    let titulo;
    if (this._vista === 'dia') {
      titulo = `${a.toLocaleDateString('es-GT',{weekday:'long', day:'numeric', month:'long', year:'numeric'})}
        <span class="badge badge-cyan" style="font-size:11px;vertical-align:middle">Semana ${sem}</span>`;
    } else if (this._vista === 'semana') {
      const l = this._lunesDe(a), d2 = new Date(l); d2.setDate(d2.getDate()+6);
      titulo = `Semana ${sem} · ${l.toLocaleDateString('es-GT',{day:'numeric',month:'short'})} – ${d2.toLocaleDateString('es-GT',{day:'numeric',month:'short',year:'numeric'})}`;
    } else {
      titulo = a.toLocaleDateString('es-GT',{month:'long', year:'numeric'});
    }

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">📅 Calendario</h1>
        <p class="page-subtitle">// ${citasHoy.length} eventos hoy</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.calendario.modalCita()">＋ Nueva Cita</button>
        </div>
      </div>
      <div class="page-body">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-ghost btn-sm" onclick="Modulos.calendario._navegar(-1)">‹</button>
            <button class="btn btn-ghost btn-sm" onclick="Modulos.calendario._irHoy()">Hoy</button>
            <button class="btn btn-ghost btn-sm" onclick="Modulos.calendario._navegar(1)">›</button>
            <div style="font-weight:800;font-size:15px;margin-left:8px;text-transform:capitalize">${titulo}</div>
          </div>
          <div class="view-toggle">
            ${[['dia','Día'],['semana','Semana'],['mes','Mes']].map(([v,l])=>`
              <button class="view-btn ${this._vista===v?'active':''}" style="font-size:12px;padding:7px 14px" onclick="Modulos.calendario._setVista('${v}')">${l}</button>`).join('')}
          </div>
        </div>
        <div id="cal-body"></div>
        ${this._vista==='mes' ? `<div style="margin-top:16px">${this._renderSeguimiento(vencDocs, recurrentes, hoyStr)}</div>` : ''}
      </div>`;

    const body = document.getElementById('cal-body');
    if (this._vista === 'mes') body.innerHTML = this._htmlMes(eventos);
    else if (this._vista === 'semana') body.innerHTML = this._htmlSemana(eventos);
    else body.innerHTML = this._htmlDia(eventos);
  },

  /* ── Chip compacto de evento (vistas mes/semana) ── */
  _chip(c) {
    const conf = c._igss  ? { col:'green',  ico:'🏥', click:`App.navegarSub('rrhh','igss')` }
      : c._feriado ? { col:'green', ico:'🎉', click:`App.navegarSub('rrhh','horasextra')` }
      : c._sat  ? { col:'purple', ico:'🏛️', click:`App.navegarA('contabilidad')` }
      : c._pago ? { col:'red',    ico:'💸', click:`Modulos.finanzas&&(Modulos.finanzas._tab='recurrentes');App.navegarA('finanzas')` }
      : c._envio? { col:'cyan',   ico:'🚚', click:`App.navegarA('envios')` }
      :           { col:'amber',  ico:'🔧', click:`Modulos.calendario.modalCita('${c.id}')` };
    const hora = (!c._sat && !c._pago && !c._feriado && c.fecha_cita) ? new Date(c.fecha_cita).toLocaleTimeString('es-GT',{hour:'2-digit',minute:'2-digit'}) : '';
    return `<div onclick="event.stopPropagation();${conf.click}" title="${(c.titulo||'').replace(/"/g,'&quot;')}"
      style="font-size:10px;padding:2px 6px;border-radius:5px;background:var(--${conf.col}-dim);color:var(--${conf.col});
             border-left:2px solid var(--${conf.col});margin-bottom:2px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
      ${conf.ico} ${hora?hora+' ':''}${c.titulo||''}</div>`;
  },

  /* ── VISTA MES: cuadrícula con número de semana ── */
  _htmlMes(eventos) {
    const a = this._fecha;
    const mesActual = a.getMonth();
    const hoyStr = this._f(new Date());
    const ini = this._lunesDe(new Date(a.getFullYear(), mesActual, 1));
    const porDia = {};
    eventos.forEach(e => { const k = e.fecha_cita?.slice(0,10); if (k) (porDia[k] = porDia[k]||[]).push(e); });

    let filas = '';
    const d = new Date(ini);
    while (true) {
      const sem = this._semanaISO(d);
      let celdas = `<td style="background:var(--surface2);text-align:center;font-size:10px;font-weight:800;color:var(--cyan);width:34px;vertical-align:middle" title="Semana ${sem}">S${sem}</td>`;
      for (let i = 0; i < 7; i++) {
        const k = this._f(d);
        const otroMes = d.getMonth() !== mesActual;
        const esHoy = k === hoyStr;
        const evs = porDia[k] || [];
        celdas += `<td onclick="Modulos.calendario._verDia('${k}')"
          style="vertical-align:top;height:92px;width:13%;padding:4px;cursor:pointer;${otroMes?'opacity:.4;':''}
                 ${esHoy?'background:var(--amber-dim);box-shadow:inset 0 0 0 2px var(--amber);border-radius:6px;':''}">
          <div style="font-size:11px;font-weight:${esHoy?'800':'600'};color:var(--${esHoy?'amber':'text3'});margin-bottom:3px">${d.getDate()}</div>
          ${evs.slice(0,3).map(e=>this._chip(e)).join('')}
          ${evs.length>3?`<div style="font-size:9px;color:var(--text3);font-weight:700">+${evs.length-3} más</div>`:''}
        </td>`;
        d.setDate(d.getDate()+1);
      }
      filas += `<tr>${celdas}</tr>`;
      if (d.getMonth() !== mesActual && this._semanaISO(d) !== sem) break;
      if (filas.length > 40000) break; /* guarda */
    }

    return `<div class="table-wrap"><table class="data-table" style="table-layout:fixed">
      <thead><tr><th style="width:34px;text-align:center" title="Número de semana">#</th>
        ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(x=>`<th style="text-align:center">${x}</th>`).join('')}
      </tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:var(--text3)">
      <span>🔧 Citas</span><span>💸 Pagos programados</span><span>🚚 Envíos</span><span>🏛️ SAT</span><span>🏥 IGSS·IRTRA·INTECAP</span><span>🎉 Días feriados</span>
    </div>`;
  },

  /* ── VISTA SEMANA: 7 columnas ── */
  _htmlSemana(eventos) {
    const lunes = this._lunesDe(this._fecha);
    const hoyStr = this._f(new Date());
    const porDia = {};
    eventos.forEach(e => { const k = e.fecha_cita?.slice(0,10); if (k) (porDia[k] = porDia[k]||[]).push(e); });

    let cols = '';
    const d = new Date(lunes);
    for (let i = 0; i < 7; i++) {
      const k = this._f(d);
      const esHoy = k === hoyStr;
      const evs = (porDia[k]||[]).sort((a,b)=>(a.fecha_cita||'').localeCompare(b.fecha_cita||''));
      cols += `<div style="flex:1;min-width:130px;background:var(--surface);border:1px solid var(--${esHoy?'amber':'border'});border-radius:10px;overflow:hidden">
        <div onclick="Modulos.calendario._verDia('${k}')" style="padding:8px;text-align:center;background:var(--${esHoy?'amber-dim':'surface2'});cursor:pointer">
          <div style="font-size:10px;text-transform:uppercase;color:var(--text3)">${d.toLocaleDateString('es-GT',{weekday:'short'})}</div>
          <div style="font-size:18px;font-weight:800;color:var(--${esHoy?'amber':'text'})">${d.getDate()}</div>
        </div>
        <div style="padding:6px;min-height:160px">
          ${evs.map(e=>this._chip(e)).join('')||'<div style="font-size:10px;color:var(--text3);text-align:center;padding-top:18px">—</div>'}
        </div>
      </div>`;
      d.setDate(d.getDate()+1);
    }
    return `<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px">${cols}</div>`;
  },

  /* ── VISTA DÍA: tarjetas completas ── */
  _htmlDia(eventos) {
    const k = this._f(this._fecha);
    const evs = eventos.filter(e=>e.fecha_cita?.slice(0,10)===k);
    return `<div class="card" style="max-width:680px">
      <div class="card-sub mb-3">📋 Eventos del día (${evs.length})</div>
      ${evs.map(c=>this._renderCitaCard(c)).join('')||'<div class="text-muted" style="padding:12px 0">Sin eventos para este día. Usa "＋ Nueva Cita" para agendar.</div>'}
    </div>`;
  },

  /* ── Panel de seguimiento (vista mes): documentos + recurrentes ── */
  _renderSeguimiento(vencDocs, recurrentes, hoyStr) {
    const mesKey = hoyStr.slice(0,7)+'-01';
    const recPend = (recurrentes||[]).filter(r => r.activo && (r.ultima_generacion||'') < mesKey);
    if (!vencDocs.length && !recPend.length) return '';
    const docItem = d => {
      const dias = Math.ceil((new Date(d.fecha_vencimiento) - new Date()) / 86400000);
      const color = dias < 0 ? 'red' : dias <= 30 ? 'amber' : 'cyan';
      const txt = dias < 0 ? `vencido hace ${Math.abs(dias)} d` : `en ${dias} d`;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
        <div><b>${d.tipo}</b> · <span class="text-muted">${d.empleados?.nombre||''}</span></div>
        <span class="badge badge-${color}">${UI.fecha(d.fecha_vencimiento)} · ${txt}</span>
      </div>`;
    };
    return `<div class="card">
      <div class="card-sub mb-3">🔔 Seguimiento</div>
      ${vencDocs.length?`<div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">📄 Documentos por vencer</div>
        ${vencDocs.slice(0,8).map(docItem).join('')}`:''}
      ${recPend.length?`<div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:10px 0 4px">🔁 Gastos recurrentes pendientes</div>
        ${recPend.map(r=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
          <div><b>${r.concepto}</b> <span class="text-muted">· día ${r.dia_mes||1}</span></div>
          <span class="text-red mono-sm">${UI.q(r.monto)}</span>
        </div>`).join('')}
        <div style="margin-top:8px"><button class="btn btn-ghost btn-sm" onclick="Modulos.finanzas._tab='recurrentes';App.navegarA('finanzas')">Ir a Recurrentes →</button></div>`:''}
    </div>`;
  },

  /* ── Pagos recurrentes como eventos: cada mes tocado por el rango ── */
  _pagosEventosRango(recurrentes, ini, fin) {
    const out = [];
    const activos = (recurrentes||[]).filter(r=>r.activo);
    const cur = new Date(ini.getFullYear(), ini.getMonth(), 1);
    while (cur <= fin) {
      const y = cur.getFullYear(), mo = cur.getMonth();
      activos.forEach(r=>{
        const dia = Math.min(Math.max(1, r.dia_mes||1), new Date(y, mo+1, 0).getDate());
        const fechaStr = `${y}-${String(mo+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        if (fechaStr >= this._f(ini) && fechaStr <= this._f(fin))
          out.push({ _pago:true, id:r.id, titulo:r.concepto, monto:r.monto, fecha_cita:`${fechaStr}T08:00:00` });
      });
      cur.setMonth(cur.getMonth()+1);
    }
    return out;
  },

  /* ── Días feriados de Guatemala dentro del rango visible ── */
  _feriadosEventosRango(ini, fin) {
    const out = [];
    const anios = new Set([ini.getFullYear(), fin.getFullYear()]);
    anios.forEach(anio => {
      FERIADOS_GT(anio).forEach(fer => {
        if (fer.fecha >= this._f(ini) && fer.fecha <= this._f(fin)) {
          out.push({ _feriado:true, titulo: fer.nombre, completo: fer.completo, fecha_cita: `${fer.fecha}T00:00:00` });
        }
      });
    });
    return out;
  },

  /* ── Calendario fiscal (Guatemala) para los meses del rango ──
     SAT: IVA mensual (SAT-2237/2046) vence el último día del mes
     siguiente; ISR Simplificado SAT-1311 el día 10; régimen utilidades
     (25%): SAT-1361 (día 10 ene/abr/jul/oct), ISO SAT-1608 (fin de esos
     meses) y SAT-1411 anual (31 de marzo).
     IGSS: la planilla IGSS + IRTRA + INTECAP vence el día 20 del mes
     siguiente (se registra desde RRHH → Planilla IGSS).
     Estado desde obligaciones_fiscales. */
  _eventosSATRango(ini, fin, fiscal, obligaciones, incluir = { sat:true, igss:true }) {
    const out = [];
    const pequeno = (fiscal?.regimen_iva||'general').toLowerCase().startsWith('peque');
    const utilidades = (Number(fiscal?.tasa_isr)||0.05) >= 0.2;
    const f = d => this._f(d);
    const estadoDe = (tipo, periodo) => {
      const o = (obligaciones||[]).find(x=>x.tipo===tipo && x.periodo===periodo);
      return o ? o.estado : null;
    };

    const cur = new Date(ini.getFullYear(), ini.getMonth(), 1);
    while (cur <= fin) {
      const y = cur.getFullYear(), m = cur.getMonth();
      const prev = new Date(y, m-1, 1);
      const prevPer = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;
      const finMes = new Date(y, m+1, 0);

      /* Planilla IGSS + IRTRA + INTECAP del mes anterior — vence el día 20 */
      if (incluir.igss) {
        out.push({ _sat:true, _igss:true, titulo:`Planilla IGSS · IRTRA · INTECAP · ${prevPer}`,
          fecha_cita:`${f(new Date(y, m, 20))}T09:00:00`, sat_estado: estadoDe('IGSS', prevPer) });
      }

      if (!incluir.sat) { cur.setMonth(cur.getMonth()+1); continue; }

      out.push({ _sat:true, titulo:`IVA ${pequeno?'SAT-2046':'SAT-2237'} · ${prevPer}`,
        fecha_cita:`${f(finMes)}T09:00:00`, sat_estado: estadoDe('IVA', prevPer) });

      if (!utilidades) {
        if (!pequeno) out.push({ _sat:true, titulo:`ISR SAT-1311 · ${prevPer}`,
          fecha_cita:`${f(new Date(y, m, 10))}T09:00:00`, sat_estado: estadoDe('ISR', prevPer) });
      } else {
        if ([0,3,6,9].includes(m)) {
          const tAnt = m === 0 ? 4 : m/3;
          const yT = m === 0 ? y-1 : y;
          out.push({ _sat:true, titulo:`ISR Trimestral SAT-1361 · T${tAnt} ${yT}`,
            fecha_cita:`${f(new Date(y, m, 10))}T09:00:00`, sat_estado: estadoDe('ISR', `${yT}-T${tAnt}`) });
          out.push({ _sat:true, titulo:`ISO SAT-1608 · T${tAnt} ${yT}`,
            fecha_cita:`${f(finMes)}T09:00:00`, sat_estado: estadoDe('ISO', `${yT}-T${tAnt}`) });
        }
        if (m === 2) out.push({ _sat:true, titulo:`ISR Anual SAT-1411 · ejercicio ${y-1}`,
          fecha_cita:`${f(new Date(y, 2, 31))}T09:00:00`, sat_estado:null });
      }
      cur.setMonth(cur.getMonth()+1);
    }
    return out;
  },

  /* ── Tarjeta completa de evento (vista día) ── */
  _renderCitaCard(c, conFecha=false) {
    const hora = c.fecha_cita ? new Date(c.fecha_cita).toLocaleTimeString('es-GT',{hour:'2-digit',minute:'2-digit'}) : '';
    const fecha = c.fecha_cita ? new Date(c.fecha_cita).toLocaleDateString('es-GT',{day:'numeric',month:'short'}) : '';
    if (c._feriado) {
      return `<div style="padding:10px;border-left:3px solid var(--green);margin-bottom:8px;background:var(--surface2);border-radius:0 8px 8px 0;cursor:pointer"
           onclick="App.navegarSub('rrhh','horasextra')">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="font-weight:700;font-size:13px">🎉 ${c.titulo}</div>
          <div style="font-size:11px;color:var(--green);white-space:nowrap">${conFecha?fecha:''}</div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">
          Día feriado de Guatemala${c.completo===false?' (medio día)':''} — si hay personal trabajando, regístralo en RRHH → Horas Extra
        </div>
      </div>`;
    }
    if (c._sat) {
      const st = c.sat_estado === 'pagado' ? { b:'green', t:'✓ Pagado' }
        : c.sat_estado === 'pendiente' ? { b:'amber', t:'Pendiente' }
        : { b:'gray', t:'Por calcular' };
      const col = c._igss ? 'green' : 'purple';
      const ico = c._igss ? '🏥' : '🏛️';
      const sub = c._igss ? 'Pago patronal — RRHH → Planilla IGSS' : 'Declaración SAT (Declaraguate)';
      const click = c._igss ? `App.navegarSub('rrhh','igss')` : `App.navegarA('contabilidad')`;
      return `<div style="padding:10px;border-left:3px solid var(--${col});margin-bottom:8px;background:var(--surface2);border-radius:0 8px 8px 0;cursor:pointer"
           onclick="${click}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="font-weight:700;font-size:13px">${ico} ${c.titulo}</div>
          <div style="font-size:11px;color:var(--${col});white-space:nowrap">${conFecha?fecha:''}</div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;display:flex;justify-content:space-between;align-items:center">
          <span>${sub}</span>
          <span class="badge badge-${st.b}" style="font-size:9px">${st.t}</span>
        </div>
      </div>`;
    }
    if (c._envio) {
      return `<div style="padding:10px;border-left:3px solid var(--cyan);margin-bottom:8px;background:var(--surface2);border-radius:0 8px 8px 0;cursor:pointer"
           onclick="App.navegarA('envios')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:700;font-size:13px">🚚 ${c.titulo}</div>
          <div style="font-size:11px;color:var(--cyan)">${conFecha?fecha+' ':''}${hora}</div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Entrega estimada de envío</div>
      </div>`;
    }
    if (c._pago) {
      return `<div style="padding:10px;border-left:3px solid var(--red);margin-bottom:8px;background:var(--surface2);border-radius:0 8px 8px 0;cursor:pointer"
           onclick="Modulos.finanzas&&(Modulos.finanzas._tab='recurrentes');App.navegarA('finanzas')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:700;font-size:13px">💸 ${c.titulo}</div>
          <div style="font-size:11px;color:var(--red)">${conFecha?fecha+' ':''}</div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;display:flex;justify-content:space-between">
          <span>Pago programado</span><span class="text-red mono-sm">${UI.q(c.monto)}</span>
        </div>
      </div>`;
    }
    return `<div style="padding:10px;border-left:3px solid var(--${c.estado==='completada'?'green':c.estado==='cancelada'?'red':'amber'});margin-bottom:8px;background:var(--surface2);border-radius:0 8px 8px 0;cursor:pointer" onclick="Modulos.calendario.modalCita('${c.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:700;font-size:13px">${c.titulo}</div>
        <div style="font-size:11px;color:var(--amber)">${conFecha?fecha+' ':''} ${hora}</div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">
        ${c.clientes?.nombre||''} ${c.vehiculos?.placa?'· '+c.vehiculos.placa:''}
        ${c.empleados?.nombre?'· '+c.empleados.nombre:''}
      </div>
    </div>`;
  },

  async modalCita(id=null) {
    const c = id ? this._citas.find(x=>x.id===id)||{} : {};
    const esEdicion = !!id;
    const base = this._fecha || new Date();
    const defaultDate = `${this._f(base)}T${String(new Date().getHours()).padStart(2,'0')}:00`;

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nueva'} Cita`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual de la cita.</div></div>':''}
      <div class="form-group"><label class="form-label">Título / Motivo *</label>
        <input class="form-input" id="cit-titulo" value="${c.titulo||''}" placeholder="Cambio de aceite / Revisión general"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cliente</label>
          <select class="form-select" id="cit-cli">
            <option value="">Sin cliente</option>
            ${this._clientes.map(x=>`<option value="${x.id}" ${c.cliente_id===x.id?'selected':''}>${x.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Vehículo</label>
          <select class="form-select" id="cit-veh">
            <option value="">Sin vehículo</option>
            ${this._vehiculos.map(x=>`<option value="${x.id}" ${c.vehiculo_id===x.id?'selected':''}>${x.placa} - ${x.marca}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha y Hora *</label>
          <input class="form-input" id="cit-fecha" type="datetime-local" value="${c.fecha_cita?.slice(0,16)||defaultDate}"></div>
        <div class="form-group"><label class="form-label">Duración (min)</label>
          <input class="form-input" id="cit-dur" type="number" value="${c.duracion_min||60}" min="15" step="15"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Mecánico / Técnico</label>
          <select class="form-select" id="cit-emp">
            <option value="">Sin asignar</option>
            ${this._empleados.filter(e=>e.activo).map(x=>`<option value="${x.id}" ${c.empleado_id===x.id?'selected':''}>${x.nombre}</option>`).join('')}
          </select></div>
        ${esEdicion?`<div class="form-group"><label class="form-label">Estado</label>
          <select class="form-select" id="cit-estado">
            ${['pendiente','confirmada','completada','cancelada'].map(s=>`<option value="${s}" ${c.estado===s?'selected':''}>${s}</option>`).join('')}
          </select></div>`:''}
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="cit-notas" rows="2">${c.notas||''}</textarea></div>
      <div class="modal-footer">
        ${esEdicion?`<button class="btn btn-sm btn-danger" title="Eliminar" onclick="Modulos.eliminarRegistro('citas','${id}','${(c.titulo||'esta cita').replace(/'/g,"\\'")}',()=>{UI.cerrarModal();Modulos.calendario.render()})">🗑️ Eliminar</button>`:''}
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.calendario.guardarCita('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear Cita'}
        </button>
      </div>`,'580px');
  },

  async guardarCita(id='') {
    const titulo = document.getElementById('cit-titulo')?.value.trim();
    const fecha  = document.getElementById('cit-fecha')?.value;
    if (!titulo||!fecha) { UI.toast('Título y fecha son obligatorios','error'); return; }
    const fields = {
      titulo,
      fecha_cita:   new Date(fecha).toISOString(),
      cliente_id:   document.getElementById('cit-cli')?.value||null,
      vehiculo_id:  document.getElementById('cit-veh')?.value||null,
      empleado_id:  document.getElementById('cit-emp')?.value||null,
      duracion_min: parseInt(document.getElementById('cit-dur')?.value)||60,
      estado:       document.getElementById('cit-estado')?.value||'pendiente',
      notas:        document.getElementById('cit-notas')?.value||null
    };
    if (id) fields.id = id;
    const {error} = await DB.upsertCita(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Cita actualizada ✓':'Cita creada ✓');
    this.render();
  }
};
