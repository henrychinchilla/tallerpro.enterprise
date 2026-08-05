/* ═══════════════════════════════════════════════════════
   🎯 Política de precios — recomendador con MARGEN NETO
   (lo que queda en la bolsa después de impuestos según el régimen SAT,
   gastos fijos, comisión de tarjeta y mermas).
   Se renderiza como pestaña del módulo Finanzas.

   Fórmulas por régimen (B = base sin IVA, P = precio al cliente):
   · Simplificados — Pequeño Contribuyente y Agropecuario (tasa única s/facturado,
     sin crédito IVA y SIN ISR aparte: el pago es definitivo):
       P = costo / (1 − tasa − fijos − comisión − merma − margen)   [tasa = 5% ó 4%]
   · Opcional Simplificado (ISR 5%/7% s/ingresos; gastos NO deducen):
       B = costo / (1 − isr − fijos − comisión − merma − margen);  P = B × 1.12
   · Sobre Utilidades (ISR 25% s/utilidad; gastos SÍ deducen):
       B = costo / (1 − fijos − comisión − merma − margen/0.75);   P = B × 1.12
   El IVA 12% (régimen general) NO es costo: se traslada al consumidor.
═══════════════════════════════════════════════════════ */
Modulos.precios = {
  _cfg: null, _fiscal: null, _costoDirPct: 0.55, _ventasReales: 0,

  DEFAULTS: {
    margen_neto_pct: 25,      // lo que el dueño quiere que le quede
    margen_minimo_pct: 20,    // piso: debajo de esto el POS avisa
    ventas_mes: 0,            // facturación mensual estimada (base de prorrateo)
    mezcla_tarjeta_pct: 0,    // % de las ventas cobradas con tarjeta
    merma_pct: 3,             // mermas, garantías y retrabajos
    gastos_fijos: [],         // [{nombre, monto}] — SIN salarios de técnicos
    salario_tecnico: 0,       // salario base mensual promedio de un técnico
    factor_prestaciones: 1.42,// IGSS patronal + Bono 14 + aguinaldo + vacaciones + indemnización
    horas_mes: 176,           // jornada mensual (8h × 22 días)
    utilizacion_pct: 70       // % de la jornada realmente facturable
  },

  async render(el) {
    el.innerHTML = '<div class="empty-state">⏳ Calculando tu política de precios...</div>';
    const hoy = new Date();
    const ini3m = new Date(hoy.getFullYear(), hoy.getMonth()-3, 1).toISOString().slice(0,10);
    const finMesPasado = new Date(hoy.getFullYear(), hoy.getMonth(), 0).toISOString().slice(0,10);
    const [fiscal, recurrentes, empleados, facturas, inventario] = await Promise.all([
      DB.getConfigFiscal().catch(()=>({})),
      DB.getEgresosRecurrentes().catch(()=>[]),
      DB.getEmpleados().catch(()=>[]),
      DB.getFacturas(ini3m, finMesPasado).catch(()=>[]),
      DB.getInventario().catch(()=>[])
    ]);
    this._fiscal = fiscal || {};

    /* Ventas reales: promedio mensual de los últimos 3 meses facturados */
    const vivas = (facturas||[]).filter(f=>f.estado!=='anulada');
    this._ventasReales = Math.round(vivas.reduce((s,f)=>s+(Number(f.total)||0),0) / 3);

    /* Costo directo promedio del inventario (para punto de equilibrio y simulador) */
    const conCosto = (inventario||[]).filter(i=>Number(i.precio_costo)>0 && Number(i.precio_venta)>0 && Number(i.precio_costo)<Number(i.precio_venta));
    if (conCosto.length >= 3) {
      const r = conCosto.reduce((s,i)=>s + Number(i.precio_costo)/Number(i.precio_venta), 0) / conCosto.length;
      this._costoDirPct = Math.min(0.9, Math.max(0.1, r));
    }

    /* Config guardada + prellenado con datos reales la primera vez */
    this._cfg = Object.assign({}, this.DEFAULTS, Auth.tenant?.config_precios || {});
    this._cfg.gastos_fijos = (this._cfg.gastos_fijos||[]).map(g=>({nombre:g.nombre, monto:Number(g.monto)||0}));
    if (!this._cfg.gastos_fijos.length) {
      this._cfg.gastos_fijos = (recurrentes||[]).filter(r=>r.activo!==false).map(r=>({ nombre: r.nombre||r.descripcion||'Gasto recurrente', monto: Number(r.monto)||0 }));
      const pt = Auth.tenant?.config_pos_tarjeta;
      if (pt?.habilitado && Number(pt.fee_mensual)>0 && !this._cfg.gastos_fijos.some(g=>/pos/i.test(g.nombre)))
        this._cfg.gastos_fijos.push({ nombre:'Fee mensual POS tarjeta', monto:Number(pt.fee_mensual) });
    }
    if (!this._cfg.ventas_mes) this._cfg.ventas_mes = this._ventasReales;
    if (!this._cfg.salario_tecnico) {
      const activos = (empleados||[]).filter(e=>e.activo!==false && Number(e.salario_base)>0);
      if (activos.length) this._cfg.salario_tecnico = Math.round(activos.reduce((s,e)=>s+Number(e.salario_base),0)/activos.length);
    }
    if (!this._cfg.mezcla_tarjeta_pct && Auth.tenant?.config_pos_tarjeta?.habilitado) this._cfg.mezcla_tarjeta_pct = 30;

    this._pintar(el);
  },

  /* ── Régimen activo (mismo criterio que Contabilidad/Formularios SAT) ──
     `pequeno` significa "régimen simplificado": tasa única sobre lo facturado,
     sin IVA que trasladar y sin ISR aparte. Antes se decidía con
     startsWith('peque'), así que el AGROPECUARIO —que es simplificado y paga
     igual— caía en la rama del régimen general: se le agregaba IVA 12% al
     precio y se le restaba un ISR que no paga. Doble error en el margen. */
  _regimen() {
    const f = this._fiscal || {};
    const iva = REGIMENES_SAT[f.regimen_iva] ? f.regimen_iva : 'general';
    const pequeno = regimenSimplificado(iva);
    /* La tasa del simplificado no siempre es 5%: las variantes electrónicas
       del Decreto 7-2019 pagan 4%. Sale del catálogo, no de una constante. */
    const tasaSimpl = REGIMENES_SAT[iva].tasa_iva;
    const utilidades = !pequeno && (REGIMENES_ISR[f.regimen_isr]
      ? f.regimen_isr === 'utilidades'
      : (Number(f.tasa_isr)||0.05) >= 0.2);   // comercios viejos: sólo tienen la tasa
    return {
      pequeno, utilidades, tasaSimpl,
      label: pequeno ? `${REGIMENES_SAT[iva].label} — pago definitivo, sin ISR`
           : utilidades ? 'Sobre Utilidades (ISR 25% + ISO)'
           : 'Opcional Simplificado (ISR 5%/7%)'
    };
  },

  /* ── Motor de cálculo. costo → precio y todos los indicadores ── */
  _calc() {
    const c = this._cfg;
    const { pequeno, utilidades, tasaSimpl } = this._regimen();
    const margen = (Number(c.margen_neto_pct)||0)/100;
    const margenMin = Math.min(margen, (Number(c.margen_minimo_pct)||20)/100);
    const GF = c.gastos_fijos.reduce((s,g)=>s+(Number(g.monto)||0),0);
    const V = Number(c.ventas_mes)||0;                 // facturación mensual (IVA incluido)
    const BV = pequeno ? V : V/1.12;                   // base sin IVA
    const ohd = BV>0 ? GF/BV : 0;                      // fijos como fracción del ingreso neto
    const mezcla = (Number(c.mezcla_tarjeta_pct)||0)/100;
    const comPct = (Number(Auth.tenant?.config_pos_tarjeta?.comision_pct)||0)/100;
    const com = mezcla * comPct * (pequeno ? 1 : 1.12); // la comisión se cobra sobre lo transado (con IVA)
    const m = (Number(c.merma_pct)||0)/100;

    /* denominador según régimen (margen deseado y margen mínimo) */
    const denom = (mg) => {
      if (pequeno)    return 1 - tasaSimpl - ohd - com - m - mg;
      if (utilidades) return 1 - ohd - com - m - mg/0.75;
      const isr = BV > 30000 ? 0.07 : 0.05;
      return 1 - isr - ohd - com - m - mg;
    };
    const dSel = denom(margen), dMin = denom(margenMin);
    const iva = pequeno ? 1 : 1.12;
    const M    = dSel > 0.03 ? iva/dSel : null;        // precio al cliente = costo × M
    const Mmin = dMin > 0.03 ? iva/dMin : null;
    const isrPct = pequeno ? tasaSimpl : utilidades ? null : (BV>30000 ? 0.07 : 0.05);

    /* Hora-hombre: costo real de una hora facturable */
    const costoHora = (Number(c.salario_tecnico)||0) * (Number(c.factor_prestaciones)||1.42)
                    / Math.max(1, (Number(c.horas_mes)||176) * ((Number(c.utilizacion_pct)||70)/100));
    const tarifaHora = M ? costoHora * M : null;

    /* Punto de equilibrio: facturación mensual donde la ganancia neta es Q0 */
    const cd = this._costoDirPct;                      // costo directo promedio (inventario)
    const dEq = (pequeno ? 1-tasaSimpl : utilidades ? 1 : 1-(BV>30000?0.07:0.05)) - com - m - cd;
    const breakEven = dEq > 0.03 ? (GF/dEq) * iva : null;

    /* Descuento máximo promedio que aún respeta el margen mínimo */
    const descMax = (M && Mmin && M > Mmin) ? (1 - Mmin/M) : 0;

    return { M, Mmin, GF, V, BV, ohd, com, m, isrPct, pequeno, utilidades, tasaSimpl,
             costoHora, tarifaHora, breakEven, descMax, margen, margenMin, cd };
  },

  /* Margen neto resultante si el mercado fija el precio (modo inverso) */
  _margenDe(precio, costo) {
    const { pequeno, utilidades, tasaSimpl } = this._regimen();
    const k = this._calc();
    if (!(precio>0) || !(costo>=0)) return null;
    const B = pequeno ? precio : precio/1.12;
    const varTot = k.ohd + k.com + k.m;
    if (pequeno)    return 1 - tasaSimpl - varTot - costo/B;
    if (utilidades) return (1 - varTot - costo/B) * 0.75;
    return 1 - (k.isrPct||0.05) - varTot - costo/B;
  },

  /* ── UI ─────────────────────────────────────────── */
  _pintar(el) {
    const c = this._cfg;
    const reg = this._regimen();
    const k = this._calc();
    const filaGasto = (g,i)=>`
      <div style="display:flex;gap:6px;margin-bottom:6px" class="pp-gasto">
        <input class="form-input" style="flex:1;padding:7px 10px;font-size:13px" value="${(g.nombre||'').replace(/"/g,'&quot;')}" placeholder="Concepto" onchange="Modulos.precios._setGasto(${i},'nombre',this.value)">
        <input class="form-input mono-sm" style="width:110px;padding:7px 10px;font-size:13px" type="number" min="0" step="0.01" value="${g.monto||0}" onchange="Modulos.precios._setGasto(${i},'monto',this.value)">
        <button class="btn btn-ghost btn-sm" style="padding:4px 8px" title="Quitar" onclick="Modulos.precios._quitarGasto(${i})">🗑️</button>
      </div>`;

    el.innerHTML = `
      <div class="alert alert-cyan" style="margin-bottom:16px"><div class="alert-icon">🧭</div><div class="alert-body" style="font-size:12px">
        Tu régimen SAT activo: <b>${reg.label}</b> (se lee de Contabilidad → Formularios SAT).
        ${reg.pequeno ? `El ${(reg.tasaSimpl*100).toFixed(0)}% sobre lo facturado <b>sí es un costo</b> y no acreditas IVA de compras. Es pago definitivo: <b>no pagas ISR aparte</b>.`
          : reg.utilidades ? 'Tus gastos <b>sí deducen</b> el ISR (25% sobre utilidad). El IVA 12% no es costo: se traslada al cliente.'
          : 'El ISR (5%/7%) se paga sobre el ingreso: tus gastos <b>no lo reducen</b>. El IVA 12% no es costo: se traslada al cliente.'}
      </div></div>

      <div class="grid-2">
        <!-- ── ENTRADAS ── -->
        <div class="card card-amber">
          <div class="card-sub mb-3">⚙️ Tu operación</div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Margen neto deseado (%)</label>
              <input class="form-input" id="pp-margen" type="number" min="1" max="80" step="1" value="${c.margen_neto_pct}" onchange="Modulos.precios._set('margen_neto_pct',this.value)">
              <div style="font-size:10.5px;color:var(--text3);margin-top:3px">Lo que quieres que te quede LIBRE después de todo</div></div>
            <div class="form-group"><label class="form-label">Margen mínimo (%)</label>
              <input class="form-input" id="pp-margen-min" type="number" min="1" max="80" step="1" value="${c.margen_minimo_pct}" onchange="Modulos.precios._set('margen_minimo_pct',this.value)">
              <div style="font-size:10.5px;color:var(--text3);margin-top:3px">Piso: el POS avisa si un descuento lo rompe</div></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Ventas mensuales (Q, facturado)</label>
              <input class="form-input mono-sm" id="pp-ventas" type="number" min="0" step="100" value="${c.ventas_mes}" onchange="Modulos.precios._set('ventas_mes',this.value)">
              <div style="font-size:10.5px;color:var(--text3);margin-top:3px">Promedio real últimos 3 meses: <b>${UI.q(this._ventasReales)}</b></div></div>
            <div class="form-group"><label class="form-label">Ventas con tarjeta (%)</label>
              <input class="form-input" type="number" min="0" max="100" step="5" value="${c.mezcla_tarjeta_pct}" onchange="Modulos.precios._set('mezcla_tarjeta_pct',this.value)">
              <div style="font-size:10.5px;color:var(--text3);margin-top:3px">Comisión POS configurada: <b>${Number(Auth.tenant?.config_pos_tarjeta?.comision_pct)||0}%</b></div></div>
          </div>
          <div class="form-group"><label class="form-label">Mermas, garantías y retrabajos (%)</label>
            <input class="form-input" type="number" min="0" max="30" step="0.5" value="${c.merma_pct}" onchange="Modulos.precios._set('merma_pct',this.value)"></div>

          <div class="form-group"><label class="form-label">Gastos fijos mensuales (renta, luz, contador, NexusPro...)</label>
            <div id="pp-gastos">${c.gastos_fijos.map(filaGasto).join('')||'<div class="text-muted" style="font-size:12px;padding:6px 0">Sin gastos — agrega los recurrentes de tu operación</div>'}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
              <button class="btn btn-ghost btn-sm" onclick="Modulos.precios._agregarGasto()">＋ Agregar gasto</button>
              <span style="font-size:12.5px;font-weight:800">Total: <span class="text-amber">${UI.q(k.GF)}</span>/mes</span>
            </div>
            <div style="font-size:10.5px;color:var(--text3);margin-top:4px">⚠️ NO incluyas salarios de técnicos aquí (van en hora-hombre). Sí incluye administrativos.</div></div>

          <div class="card-sub mb-3" style="margin-top:14px">🔧 Hora-hombre (servicios)</div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Salario técnico (Q/mes)</label>
              <input class="form-input mono-sm" type="number" min="0" step="50" value="${c.salario_tecnico}" onchange="Modulos.precios._set('salario_tecnico',this.value)"></div>
            <div class="form-group"><label class="form-label">Factor prestaciones</label>
              <input class="form-input" type="number" min="1" max="2" step="0.01" value="${c.factor_prestaciones}" onchange="Modulos.precios._set('factor_prestaciones',this.value)">
              <div style="font-size:10.5px;color:var(--text3);margin-top:3px">IGSS patronal + Bono 14 + aguinaldo + vacaciones ≈ 1.42</div></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Horas jornada/mes</label>
              <input class="form-input" type="number" min="40" max="300" step="1" value="${c.horas_mes}" onchange="Modulos.precios._set('horas_mes',this.value)"></div>
            <div class="form-group"><label class="form-label">% facturable (utilización)</label>
              <input class="form-input" type="number" min="10" max="100" step="5" value="${c.utilizacion_pct}" onchange="Modulos.precios._set('utilizacion_pct',this.value)">
              <div style="font-size:10.5px;color:var(--text3);margin-top:3px">Un técnico factura 60-75% de su jornada; el resto también se paga</div></div>
          </div>
          <button class="btn btn-amber" style="width:100%" onclick="Modulos.precios.guardar()">💾 Guardar política</button>
        </div>

        <!-- ── RESULTADOS ── -->
        <div>
          <div id="pp-resultados">${this._htmlResultados(k)}</div>

          <div class="card card-cyan mb-4">
            <div class="card-sub mb-3">🧮 Calculadora rápida</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">De costo → precio</label>
                <input class="form-input mono-sm" id="pp-calc-costo" type="number" min="0" step="0.01" placeholder="Costo (Q)" oninput="Modulos.precios._calcRapida()">
                <div id="pp-calc-precio" style="font-size:15px;font-weight:900;color:var(--green);margin-top:6px">—</div></div>
              <div class="form-group"><label class="form-label">De precio de mercado → margen</label>
                <div style="display:flex;gap:6px">
                  <input class="form-input mono-sm" id="pp-inv-precio" type="number" min="0" step="0.01" placeholder="Precio (Q)" oninput="Modulos.precios._calcInversa()">
                  <input class="form-input mono-sm" id="pp-inv-costo" type="number" min="0" step="0.01" placeholder="Costo (Q)" oninput="Modulos.precios._calcInversa()">
                </div>
                <div id="pp-inv-out" style="font-size:14px;font-weight:900;margin-top:6px">—</div></div>
            </div>
          </div>

          <div class="card card-purple">
            <div class="card-sub mb-3">🔮 Simulador: ¿y si vendo...?</div>
            <div style="display:flex;gap:8px;align-items:center">
              <input class="form-input mono-sm" id="pp-sim-ventas" type="number" min="0" step="500" placeholder="Facturación al mes (Q)" style="flex:1" oninput="Modulos.precios._simular()">
              <div id="pp-sim-out" style="font-size:14px;font-weight:900;min-width:150px;text-align:right">—</div>
            </div>
            <div style="font-size:10.5px;color:var(--text3);margin-top:6px">Estimación con tu costo directo promedio (${Math.round(this._costoDirPct*100)}% del precio, calculado de tu inventario) y tu política actual.</div>
          </div>
        </div>
      </div>`;
  },

  _htmlResultados(k) {
    if (!k.M) return `
      <div class="alert alert-red mb-4"><div class="alert-icon">🚨</div><div class="alert-body" style="font-size:12.5px">
        <b>Con estos números el objetivo no alcanza.</b> Los gastos fijos (${UI.q(k.GF)}) + impuestos + comisiones + margen deseado
        consumen más del 97% de cada quetzal vendido. Sube las ventas estimadas, baja gastos o baja el margen deseado.
      </div></div>`;
    const p100 = 100 * k.M;                     // precio para un costo de Q100
    const base = k.pequeno ? p100 : p100/1.12;  // base sin IVA
    const fila = (label, monto, color) => monto>0.004 ? `
      <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0">
        <span style="color:var(--text2)">${label}</span><span class="mono-sm" style="color:var(--${color||'text2'});font-weight:700">${UI.q(monto)}</span>
      </div>` : '';
    const isrQ = k.pequeno ? p100*k.tasaSimpl : k.utilidades ? (base*(1-k.ohd-k.com-k.m)-100)*0.25 : base*(k.isrPct||0.05);
    const gananciaQ = base*k.margen;
    return `
      <div class="card card-green mb-4">
        <div class="card-sub mb-3">📊 Tu política recomendada</div>
        <div class="kpi-grid" style="margin-bottom:12px">
          ${UI.kpiCard({ icon:'✖️', clase:'green', label:'Multiplicador de precio', value:'×'+k.M.toFixed(2), trend:'precio = costo × '+k.M.toFixed(2) })}
          ${UI.kpiCard({ icon:'🔧', clase:'cyan', label:'Tarifa hora recomendada', value:Math.round(k.tarifaHora||0), money:true, trend:'costo real: '+UI.q(k.costoHora)+'/h' })}
          ${UI.kpiCard({ icon:'⚖️', clase:'amber', label:'Punto de equilibrio', value:Math.round(k.breakEven||0), money:true, trend:'facturación/mes para no perder' })}
          ${UI.kpiCard({ icon:'🏷️', clase:'purple', label:'Descuento máximo', value:(k.descMax*100).toFixed(1)+'%', trend:'sin romper el margen mínimo' })}
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);margin-bottom:6px">
            Ejemplo: producto que te cuesta Q100 → véndelo a <span class="text-green">${UI.q(p100)}</span></div>
          ${fila('Tu costo', 100)}
          ${k.pequeno?'':fila('IVA (12%) — se traslada, no es tuyo', p100-base,'text3')}
          ${fila(k.pequeno?'Tarifa SAT 5% s/facturado':'ISR ('+(k.utilidades?'25% s/utilidad':(k.isrPct*100).toFixed(0)+'% s/ingresos')+')', Math.max(0,isrQ),'red')}
          ${fila('Gastos fijos prorrateados', base*k.ohd,'amber')}
          ${fila('Comisión tarjeta (ponderada)', base*k.com,'amber')}
          ${fila('Mermas y garantías', base*k.m,'amber')}
          <div style="display:flex;justify-content:space-between;font-size:13.5px;padding:6px 0;border-top:1px solid var(--border);margin-top:4px">
            <span style="font-weight:900">💰 TU GANANCIA NETA (${(k.margen*100).toFixed(0)}%)</span>
            <span class="mono-sm text-green" style="font-weight:900">${UI.q(gananciaQ)}</span>
          </div>
        </div>
        ${k.utilidades?'<div style="font-size:10.5px;color:var(--text3);margin-top:8px">Nota: el ISO (1%) es acreditable al ISR — afecta tu flujo, no tu costo final.</div>':''}
        ${!k.V?'<div class="alert alert-amber" style="margin-top:10px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11.5px">Sin ventas estimadas no puedo prorratear tus gastos fijos: el precio recomendado los está ignorando.</div></div>':''}
      </div>`;
  },

  /* ── Interacción ── */
  _set(campo, valor) {
    this._cfg[campo] = parseFloat(valor)||0;
    this._refrescar();
  },
  _setGasto(i, campo, valor) {
    if (!this._cfg.gastos_fijos[i]) return;
    this._cfg.gastos_fijos[i][campo] = campo==='monto' ? (parseFloat(valor)||0) : valor;
    this._refrescar();
  },
  _agregarGasto() { this._cfg.gastos_fijos.push({nombre:'', monto:0}); this._repintar(); },
  _quitarGasto(i) { this._cfg.gastos_fijos.splice(i,1); this._repintar(); },
  _repintar() { const el = document.getElementById('fin-content'); if (el) this._pintar(el); },
  _refrescar() {
    const out = document.getElementById('pp-resultados');
    if (out) out.innerHTML = this._htmlResultados(this._calc());
    this._calcRapida(); this._calcInversa(); this._simular();
  },

  _calcRapida() {
    const out = document.getElementById('pp-calc-precio');
    if (!out) return;
    const costo = parseFloat(document.getElementById('pp-calc-costo')?.value)||0;
    const k = this._calc();
    out.textContent = (costo>0 && k.M) ? '→ Vende a '+UI.q(costo*k.M) : '—';
  },

  _calcInversa() {
    const out = document.getElementById('pp-inv-out');
    if (!out) return;
    const precio = parseFloat(document.getElementById('pp-inv-precio')?.value)||0;
    const costo = parseFloat(document.getElementById('pp-inv-costo')?.value)||0;
    if (!(precio>0)) { out.textContent='—'; return; }
    const mg = this._margenDe(precio, costo);
    if (mg===null) { out.textContent='—'; return; }
    const pct = (mg*100).toFixed(1);
    const min = Number(this._cfg.margen_minimo_pct)||20;
    const icono = mg*100 >= (Number(this._cfg.margen_neto_pct)||25) ? '🟢' : mg*100 >= min ? '🟡' : '🔴';
    out.innerHTML = `${icono} Margen neto: <span style="color:var(--${mg*100>=min?'green':'red'})">${pct}%</span>`;
  },

  _simular() {
    const out = document.getElementById('pp-sim-out');
    if (!out) return;
    const V = parseFloat(document.getElementById('pp-sim-ventas')?.value)||0;
    if (!(V>0)) { out.textContent='—'; return; }
    const { pequeno, utilidades, tasaSimpl } = this._regimen();
    const k = this._calc();
    const B = pequeno ? V : V/1.12;
    const mezcla = (Number(this._cfg.mezcla_tarjeta_pct)||0)/100;
    const comPct = (Number(Auth.tenant?.config_pos_tarjeta?.comision_pct)||0)/100;
    const com = mezcla*comPct*(pequeno?1:1.12);
    let neta;
    const contrib = B*(1 - this._costoDirPct - com - k.m) - k.GF;
    if (pequeno)         neta = contrib - V*tasaSimpl;
    else if (utilidades) neta = contrib>0 ? contrib*0.75 : contrib;
    else                 neta = contrib - B*(B>30000?0.07:0.05);
    out.innerHTML = `<span style="color:var(--${neta>=0?'green':'red'})">${neta>=0?'Ganas':'Pierdes'} ${UI.q(Math.abs(neta))}/mes</span>`;
  },

  /* ── Guardar: persiste config + derivados que usan POS e Inventario ── */
  async guardar() {
    const k = this._calc();
    if (!k.M) { UI.toast('Ajusta los números: con estos valores el objetivo no alcanza','error'); return; }
    const cfg = { ...this._cfg,
      derivado: {
        multiplicador: Math.round(k.M*100)/100,
        multiplicador_min: Math.round((k.Mmin||k.M)*100)/100,
        tarifa_hora: Math.round(k.tarifaHora||0),
        punto_equilibrio: Math.round(k.breakEven||0),
        costo_dir_pct: Math.round(this._costoDirPct*100)/100,
        actualizado: new Date().toISOString().slice(0,10)
      }
    };
    const ok = await DB.updateTenant({ config_precios: cfg, updated_at: new Date().toISOString() });
    if (!ok) { UI.toast('Error al guardar','error'); return; }
    Auth.tenant.config_precios = cfg;
    UI.toast('Política de precios guardada ✓ El POS e Inventario ya la usan');
  }
};
