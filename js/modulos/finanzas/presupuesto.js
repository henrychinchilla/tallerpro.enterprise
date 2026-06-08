/* TallerPro v3.0 — finanzas/presupuesto.js
   Budget / planeación anual. Se nutre de: consumo de insumos en OTs,
   gastos recurrentes, nómina cargada (hora-hombre) y depreciación de activos.
   Incluye plan de compras de herramientas/maquinaria (capex). */
Modulos.presupuesto = {
  _anio: null,
  _EGR: [
    { clave:'materiales',   label:'Insumos y repuestos (OTs)' },
    { clave:'nomina',       label:'Nómina y cargas' },
    { clave:'recurrentes',  label:'Gastos recurrentes (renta, servicios)' },
    { clave:'depreciacion', label:'Depreciación de activos' },
    { clave:'otros',        label:'Otros gastos' }
  ],

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const now = new Date();
    if (!this._anio) this._anio = now.getFullYear();
    const anio = this._anio;

    /* Ventana últimos 12 meses (base de proyección) y año seleccionado */
    const fin12 = now.toISOString().slice(0,10);
    const ini12 = new Date(now.getFullYear()-1, now.getMonth(), now.getDate()).toISOString().slice(0,10);
    const aIni = `${anio}-01-01`, aFin = `${anio}-12-31`;

    const [
      lineasGuardadas, cfg, empleados, activos, recurrentes,
      ing12, fac12, insumos12, egr12,
      ingAnio, facAnio, egrAnio
    ] = await Promise.all([
      DB.getPresupuesto(anio), DB.getConfigProductividad(), DB.getEmpleados(), DB.getActivos(), DB.getEgresosRecurrentes(),
      DB.getIngresos(ini12, fin12), DB.getFacturas(ini12, fin12), DB.getConsumoInsumos(ini12, fin12), DB.getEgresos(ini12, fin12),
      DB.getIngresos(aIni, aFin), DB.getFacturas(aIni, aFin), DB.getEgresos(aIni, aFin)
    ]);

    /* ── Base automática (proyección) ── */
    const sum = (arr,campo)=>arr.reduce((s,x)=>s+(Number(x[campo])||0),0);
    const FREQ = { mensual:12, bimestral:6, trimestral:4, anual:1 };
    const recurrentesAnual = recurrentes.filter(r=>r.activo)
      .reduce((s,r)=>s+(Number(r.monto)||0)*(FREQ[r.frecuencia]||12),0);
    const nominaAnual = empleados.filter(e=>e.activo)
      .reduce((s,e)=>s+calcularHoraHombre(e.salario_base,cfg).costoMensual*12,0);
    const depAnual = activos.reduce((s,a)=>s+depEnRango(a, aIni, aFin),0);
    const otros12 = egr12.filter(e=>{
      const c=e.categoria, ref=e.referencia||'';
      return !['Compras','Repuestos','Nómina','Bonos','Viáticos'].includes(c) && !ref.startsWith('REC-');
    }).reduce((s,e)=>s+(Number(e.monto)||0),0);

    const base = {
      ingresos:     sum(ing12,'monto')+sum(fac12,'total'),
      materiales:   insumos12.monto,
      nomina:       nominaAnual,
      recurrentes:  recurrentesAnual,
      depreciacion: depAnual,
      otros:        otros12
    };

    /* ── Real del año seleccionado ── */
    let rMat=0,rNom=0,rRec=0,rOtros=0;
    egrAnio.forEach(e=>{
      const c=e.categoria, ref=e.referencia||'', m=Number(e.monto)||0;
      if (['Compras','Repuestos'].includes(c)) rMat+=m;
      else if (['Nómina','Bonos'].includes(c)) rNom+=m;
      else if (ref.startsWith('REC-')) rRec+=m;
      else rOtros+=m;
    });
    const hastaReal = (anio < now.getFullYear()) ? aFin : fin12;
    const real = {
      ingresos:     sum(ingAnio,'monto')+sum(facAnio,'total'),
      materiales:   rMat, nomina:rNom, recurrentes:rRec,
      depreciacion: activos.reduce((s,a)=>s+depEnRango(a, aIni, hastaReal),0),
      otros:        rOtros
    };

    /* ── Plan (guardado o sugerido) ── */
    const guardadasLinea = {}; const capex = [];
    lineasGuardadas.forEach(l => { if (l.tipo==='capex') capex.push(l); else guardadasLinea[l.clave]=l; });
    const hayGuardado = lineasGuardadas.length>0;
    const plan = {};
    ['ingresos',...this._EGR.map(x=>x.clave)].forEach(k=>{
      plan[k] = guardadasLinea[k] ? Number(guardadasLinea[k].monto_plan)||0 : Math.round(base[k]);
    });

    this._base = base;
    const anios = [now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1, now.getFullYear()+2];

    const filaEgr = (clave,label) => `<tr>
      <td>${label}</td>
      <td class="mono-sm text-muted" style="text-align:right">${UI.q(real[clave])}</td>
      <td class="mono-sm" style="text-align:right;color:var(--text3)">${UI.q(base[clave])}</td>
      <td style="text-align:right"><input class="form-input" style="width:130px;text-align:right;display:inline-block" type="number" step="0.01"
            id="pp-${clave}" value="${plan[clave]}" oninput="Modulos.presupuesto._recalc()"></td>
    </tr>`;

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">📊 Presupuesto / Planeación</h1>
        <p class="page-subtitle">// Proyección anual basada en OTs, nómina, recurrentes y depreciación</p></div>
        <div class="page-actions">
          <select class="form-select" style="width:auto" onchange="Modulos.presupuesto._anio=parseInt(this.value);Modulos.presupuesto.render()">
            ${anios.map(y=>`<option value="${y}" ${anio===y?'selected':''}>${y}</option>`).join('')}
          </select>
          <button class="btn btn-ghost" onclick="Modulos.presupuesto.aplicarBase()">✨ Generar base automática</button>
          <button class="btn btn-amber" onclick="Modulos.presupuesto.guardar()">💾 Guardar presupuesto</button>
        </div>
      </div>
      <div class="page-body">
        ${!hayGuardado?`<div class="alert alert-cyan" style="margin-bottom:16px"><div class="alert-icon">✨</div>
          <div class="alert-body" style="font-size:12px">Aún no hay presupuesto para ${anio}. Los valores mostrados son la <b>proyección automática</b> (últimos 12 meses + nómina + depreciación). Ajústalos y presiona <b>Guardar</b>.</div></div>`:''}

        <div class="kpi-grid" style="margin-bottom:20px">
          <div class="kpi-card"><div class="kpi-label">Ingresos presupuestados</div><div class="kpi-val green" id="pp-kpi-ing">${UI.q(plan.ingresos)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Egresos presupuestados</div><div class="kpi-val red" id="pp-kpi-egr">${UI.q(0)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Utilidad proyectada</div><div class="kpi-val amber" id="pp-kpi-util">${UI.q(0)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Plan de herramientas (Capex)</div><div class="kpi-val cyan" id="pp-kpi-capex">${UI.q(0)}</div></div>
        </div>

        <div class="card" style="max-width:760px;margin-bottom:20px">
          <div class="card-sub mb-3">📋 Presupuesto ${anio}</div>
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>Concepto</th><th style="text-align:right">Real ${anio}</th><th style="text-align:right">Sugerido</th><th style="text-align:right">Presupuesto</th></tr></thead>
            <tbody>
              <tr style="background:var(--surface2)"><td colspan="4" style="font-weight:800;font-size:11px;color:var(--green);text-transform:uppercase;letter-spacing:.06em">Ingresos</td></tr>
              <tr>
                <td>Ventas y Servicios</td>
                <td class="mono-sm text-muted" style="text-align:right">${UI.q(real.ingresos)}</td>
                <td class="mono-sm" style="text-align:right;color:var(--text3)">${UI.q(base.ingresos)}</td>
                <td style="text-align:right"><input class="form-input" style="width:130px;text-align:right;display:inline-block" type="number" step="0.01" id="pp-ingresos" value="${plan.ingresos}" oninput="Modulos.presupuesto._recalc()"></td>
              </tr>
              <tr style="background:var(--surface2)"><td colspan="4" style="font-weight:800;font-size:11px;color:var(--red);text-transform:uppercase;letter-spacing:.06em">Egresos</td></tr>
              ${this._EGR.map(e=>filaEgr(e.clave,e.label)).join('')}
            </tbody>
          </table></div>
        </div>

        <div class="card" style="max-width:760px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div class="card-sub" style="margin:0">🛠️ Plan de compras de herramientas / maquinaria (Capex) ${anio}</div>
            <button class="btn btn-ghost btn-sm" onclick="Modulos.presupuesto.addCapex()">＋ Agregar</button>
          </div>
          <div id="pp-capex">
            ${capex.length?capex.map(c=>this._filaCapex(c)).join(''):''}
          </div>
          <div id="pp-capex-empty" style="font-size:12px;color:var(--text3);${capex.length?'display:none':''}">Sin compras planificadas. Agrega herramientas o maquinaria que planeas adquirir.</div>
        </div>
      </div>`;

    this._recalc();
  },

  _filaCapex(c={}) {
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `<div class="pp-capex-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <input class="form-input pp-cx-concepto" style="flex:1" placeholder="Compresor, elevador, scanner..." value="${(c.concepto||'').replace(/"/g,'&quot;')}">
      <select class="form-select pp-cx-mes" style="width:90px">
        ${meses.map((m,i)=>`<option value="${i+1}" ${c.mes===i+1?'selected':''}>${m}</option>`).join('')}
      </select>
      <input class="form-input pp-cx-monto" style="width:120px;text-align:right" type="number" step="0.01" placeholder="0.00" value="${c.monto_plan||''}" oninput="Modulos.presupuesto._recalc()">
      <button class="btn btn-sm btn-danger" onclick="this.closest('.pp-capex-row').remove();Modulos.presupuesto._recalc()">🗑️</button>
    </div>`;
  },

  addCapex() {
    const cont = document.getElementById('pp-capex');
    const empty = document.getElementById('pp-capex-empty');
    if (empty) empty.style.display = 'none';
    if (cont) cont.insertAdjacentHTML('beforeend', this._filaCapex({ mes: new Date().getMonth()+1 }));
  },

  aplicarBase() {
    const b = this._base; if (!b) return;
    ['ingresos','materiales','nomina','recurrentes','depreciacion','otros'].forEach(k=>{
      const inp = document.getElementById('pp-'+k);
      if (inp) inp.value = Math.round(b[k]);
    });
    this._recalc();
    UI.toast('Base automática aplicada — revisa y guarda','info');
  },

  _recalc() {
    const val = id => parseFloat(document.getElementById(id)?.value)||0;
    const ing = val('pp-ingresos');
    const egr = this._EGR.reduce((s,e)=>s+val('pp-'+e.clave),0);
    const capex = Array.from(document.querySelectorAll('.pp-cx-monto'))
      .reduce((s,i)=>s+(parseFloat(i.value)||0),0);
    const set=(id,v,cls)=>{const el=document.getElementById(id); if(el){el.textContent=UI.q(v); if(cls)el.className='kpi-val '+cls;}};
    set('pp-kpi-ing', ing);
    set('pp-kpi-egr', egr);
    set('pp-kpi-util', ing-egr, (ing-egr)>=0?'amber':'red');
    set('pp-kpi-capex', capex);
  },

  async guardar() {
    const val = id => parseFloat(document.getElementById(id)?.value)||0;
    const lineas = [];
    lineas.push({ tipo:'linea', clave:'ingresos', categoria:'Ingresos', monto_plan: val('pp-ingresos') });
    this._EGR.forEach(e=>lineas.push({ tipo:'linea', clave:e.clave, categoria:'Egresos', monto_plan: val('pp-'+e.clave) }));
    document.querySelectorAll('.pp-capex-row').forEach(row=>{
      const concepto = row.querySelector('.pp-cx-concepto')?.value.trim();
      const monto = parseFloat(row.querySelector('.pp-cx-monto')?.value)||0;
      const mes = parseInt(row.querySelector('.pp-cx-mes')?.value)||1;
      if (concepto && monto>0) lineas.push({ tipo:'capex', concepto, mes, categoria:'Capex', monto_plan: monto });
    });
    const { error } = await DB.guardarPresupuesto(this._anio, lineas);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast('Presupuesto guardado ✓');
    this.render();
  }
};
