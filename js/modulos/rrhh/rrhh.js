/* TallerPro v3.0 — rrhh/index.js */
Modulos.rrhh = {
  _tab: 'empleados', _empleados: [],
  _cfgProd: null, _prodMes: null, _prodAnio: null,

  async render() {
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header"><h1 class="page-title">👤 RRHH & Nómina</h1></div>
      <div class="page-body">
        <div class="tabs">
          <button class="tab-btn ${this._tab==='empleados'?'active':''}" onclick="App.navegarSub('rrhh','empleados')">👤 Empleados</button>
          <button class="tab-btn ${this._tab==='nomina'?'active':''}" onclick="App.navegarSub('rrhh','nomina')">💵 Nómina</button>
          <button class="tab-btn ${this._tab==='igss'?'active':''}" onclick="App.navegarSub('rrhh','igss')">🏛️ Planilla IGSS</button>
          <button class="tab-btn ${this._tab==='productividad'?'active':''}" onclick="App.navegarSub('rrhh','productividad')">📈 Productividad</button>
          <button class="tab-btn ${this._tab==='capacitacion'?'active':''}" onclick="App.navegarSub('rrhh','capacitacion')">🎓 Capacitación</button>
          <button class="tab-btn ${this._tab==='asignaciones'?'active':''}" onclick="App.navegarSub('rrhh','asignaciones')">🔑 Asignaciones</button>
          <button class="tab-btn ${this._tab==='organigrama'?'active':''}" onclick="App.navegarSub('rrhh','organigrama')">🏢 Organigrama</button>
          <button class="tab-btn ${this._tab==='documentos'?'active':''}" onclick="App.navegarSub('rrhh','documentos')">📄 Documentos</button>
          <button class="tab-btn ${this._tab==='reclutamiento'?'active':''}" onclick="App.navegarSub('rrhh','reclutamiento')">🧑‍💼 Reclutamiento</button>
          <button class="tab-btn ${this._tab==='disciplina'?'active':''}" onclick="App.navegarSub('rrhh','disciplina')">⚖️ Disciplina</button>
          <button class="tab-btn ${this._tab==='vacaciones'?'active':''}" onclick="App.navegarSub('rrhh','vacaciones')">🏖️ Vacaciones</button>
          <button class="tab-btn ${this._tab==='horasextra'?'active':''}" onclick="App.navegarSub('rrhh','horasextra')">⏰ Horas Extra</button>
        </div>
        <div id="rrhh-content"></div>
      </div>`;
    await this._renderTab();
  },

  async _renderTab() {
    const el = document.getElementById('rrhh-content');
    if (!el) return;
    this._empleados = await DB.getEmpleados();

    if (this._tab==='empleados') {
      el.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
          <button class="btn btn-amber" onclick="Modulos.rrhh.modalEmpleado()">＋ Nuevo Empleado</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Empleado</th><th>Cargo</th><th>DPI</th><th>IGSS</th><th>Ingreso</th><th>Salario</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${this._empleados.map(e=>`<tr>
                <td><div style="display:flex;align-items:center;gap:8px">
                  <div style="width:32px;height:32px;border-radius:50%;background:var(--amber-dim);display:flex;align-items:center;justify-content:center">👤</div>
                  <div><div style="font-weight:700">${e.nombre}</div><div style="font-size:11px;color:var(--text3)">${e.email||''}</div></div>
                </div></td>
                <td>${e.cargo||'—'}</td>
                <td class="mono-sm">${e.dpi||'—'}</td>
                <td class="mono-sm">${e.igss||'—'}</td>
                <td>${UI.fecha(e.fecha_ingreso)}</td>
                <td class="mono-sm text-amber">${UI.q(e.salario_base)}</td>
                <td><span class="badge badge-${e.activo?'green':'red'}">${e.activo?'Activo':'Inactivo'}</span></td>
                <td><div style="display:flex;gap:4px">
                  ${Modulos.btnAccion('editar', `Modulos.rrhh.modalEmpleado('${e.id}')`)}
                  <button class="btn btn-sm btn-amber" title="Imprimir Carné de Identificación" onclick="event.stopPropagation();Modulos.rrhh.imprimirCarne('${e.id}')">🪪 Carné</button>
                  ${Modulos.btnAccion('eliminar', `Modulos.rrhh.eliminarEmpleado('${e.id}','${(e.nombre||'').replace(/'/g,"\\'")}')`)}
                </div></td>
              </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin empleados</td></tr>'}
            </tbody>
          </table>
        </div>`;
    }

    else if (this._tab==='nomina') {
      const now = new Date();
      const mes = now.getMonth()+1, anio = now.getFullYear();
      const pagos = await DB.getPagosNomina(mes, anio);
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="font-weight:700">${now.toLocaleDateString('es-GT',{month:'long',year:'numeric'})}</div>
          <button class="btn btn-amber" onclick="Modulos.rrhh.calcularNomina(${mes},${anio})">🔄 Calcular Nómina</button>
        </div>
        ${pagos.length?`
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'💵', clase:'amber', label:'Total Salarios', value: pagos.reduce((s,p)=>s+p.salario_base,0), money:true })}
          ${UI.kpiCard({ icon:'⭐', clase:'cyan', label:'Total Bonificaciones', value: pagos.reduce((s,p)=>s+p.bonificacion,0), money:true })}
          ${UI.kpiCard({ icon:'🏛️', clase:'red', label:'Total IGSS', value: pagos.reduce((s,p)=>s+p.igss_laboral,0), money:true })}
          ${UI.kpiCard({ icon:'✅', clase:'green', label:'Total Líquido', value: pagos.reduce((s,p)=>s+p.liquido,0), money:true })}
        </div>`:''}
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Empleado</th><th>Salario</th><th>Bono</th><th>IGSS Lab.</th><th>ISR</th><th>Extra/Feriado</th><th>Líquido</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${pagos.map(p=>`<tr>
                <td>${p.empleados?.nombre||'—'}</td>
                <td class="mono-sm">${UI.q(p.salario_base)}</td>
                <td class="mono-sm">${UI.q(p.bonificacion)}</td>
                <td class="mono-sm text-red">-${UI.q(p.igss_laboral)}</td>
                <td class="mono-sm text-red">-${UI.q(p.isr)}</td>
                <td class="mono-sm text-cyan">${p.extra_feriado?'+'+UI.q(p.extra_feriado):'—'}</td>
                <td class="mono-sm text-green"><b>${UI.q(p.liquido)}</b></td>
                <td><span class="badge badge-${p.pagado?'green':'amber'}">${p.pagado?'Pagado':'Pendiente'}</span></td>
                <td>
                  ${p.pagado ? '' : `<button class="btn btn-sm btn-green" onclick="Modulos.rrhh.pagarNomina('${p.id}')">💵 Pagar</button>`}
                </td>
              </tr>`).join('')||`<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text3)">
                Presiona "Calcular Nómina" para generar los pagos del mes actual
              </td></tr>`}
            </tbody>
          </table>
        </div>`;
    }

    else if (this._tab==='igss') {
      const now = new Date();
      if (this._igssMes === undefined) {
        this._igssMes = now.getMonth()+1;
        this._igssAnio = now.getFullYear();
      }
      const pagos = await DB.getPagosNomina(this._igssMes, this._igssAnio);
      const totalSueldo = pagos.reduce((s, p) => s + (Number(p.salario_base) || 0), 0);
      const totalLaboral = pagos.reduce((s, p) => s + Math.round((Number(p.salario_base) || 0) * 0.0483 * 100) / 100, 0);
      const totalPatIgss = pagos.reduce((s, p) => s + Math.round((Number(p.salario_base) || 0) * 0.1067 * 100) / 100, 0);
      const totalIrtra = pagos.reduce((s, p) => s + Math.round((Number(p.salario_base) || 0) * 0.01 * 100) / 100, 0);
      const totalIntecap = pagos.reduce((s, p) => s + Math.round((Number(p.salario_base) || 0) * 0.01 * 100) / 100, 0);
      const totalPatronal = totalPatIgss + totalIrtra + totalIntecap;
      const granTotal = totalLaboral + totalPatronal;

      el.innerHTML = `
        <div class="card card-amber mb-4" style="padding:16px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--text1)">🏛️ Registro Patronal del IGSS</div>
            <div style="font-size:12px;color:var(--text3)">Configure el identificador oficial del taller ante el IGSS para deducciones del ISR.</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <input class="form-input mono-sm" id="igss-patronal-input" value="${Auth.tenant?.igss_patronal || ''}" placeholder="Ej. 1234567-8" style="width:160px">
            <button class="btn btn-amber" onclick="Modulos.rrhh.guardarPatronalIGSS()">💾 Guardar</button>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:8px;flex-wrap:wrap">
          <div style="display:flex;gap:8px;align-items:center">
            <select class="form-select" style="width:120px" onchange="Modulos.rrhh._igssMes=parseInt(this.value);Modulos.rrhh._renderTab()">
              ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m=>`<option value="${m}" ${this._igssMes===m?'selected':''}>${new Date(2026,m-1,1).toLocaleDateString('es-GT',{month:'long'})}</option>`).join('')}
            </select>
            <select class="form-select" style="width:90px" onchange="Modulos.rrhh._igssAnio=parseInt(this.value);Modulos.rrhh._renderTab()">
              ${[2024,2025,2026,2027].map(a=>`<option value="${a}" ${this._igssAnio===a?'selected':''}>${a}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-amber" onclick="Modulos.rrhh.registrarPagoIGSS(${this._igssMes},${this._igssAnio},${granTotal})" ${pagos.length?'':'disabled'}
              title="Registrar la obligación de pago (vence el día 20 del mes siguiente) — aparece en el Calendario y en Contabilidad → Obligaciones">📅 Registrar pago IGSS</button>
            <button class="btn btn-cyan" onclick="Modulos.rrhh.imprimirIGSS()" ${pagos.length?'':'disabled'}>🖨️ Imprimir Planilla IGSS</button>
          </div>
        </div>

        ${pagos.length ? `
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'💵', clase:'amber', label:'Masa Salarial Base', value: totalSueldo, money:true })}
          ${UI.kpiCard({ icon:'🧾', clase:'red', label:'Cuota Laboral (4.83%)', value: totalLaboral, money:true, trend:'retención a empleados' })}
          ${UI.kpiCard({ icon:'🏛️', clase:'cyan', label:'Aporte Patronal (12.67%)', value: totalPatronal, money:true, trend:'IGSS/IRTRA/INTECAP' })}
          ${UI.kpiCard({ icon:'💰', clase:'green', label:'Total Pago IGSS', value: granTotal, money:true, trend:'17.50% de la planilla' })}
        </div>
        ` : ''}

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Afiliado / Empleado</th>
                <th>DPI</th>
                <th style="text-align:right">Sueldo Base</th>
                <th style="text-align:right">Laboral (4.83%)</th>
                <th style="text-align:right">Patronal IGSS (10.67%)</th>
                <th style="text-align:right">IRTRA (1.00%)</th>
                <th style="text-align:right">INTECAP (1.00%)</th>
                <th style="text-align:right">Total Patronal (12.67%)</th>
                <th style="text-align:right">Total Aporte (17.50%)</th>
              </tr>
            </thead>
            <tbody>
              ${pagos.map(p => {
                const base = Number(p.salario_base) || 0;
                const lab = Math.round(base * 0.0483 * 100) / 100;
                const patIgss = Math.round(base * 0.1067 * 100) / 100;
                const irtra = Math.round(base * 0.01 * 100) / 100;
                const intecap = Math.round(base * 0.01 * 100) / 100;
                const totalPat = Math.round((patIgss + irtra + intecap) * 100) / 100;
                const totalAporte = Math.round((lab + totalPat) * 100) / 100;

                return `<tr>
                  <td>
                    <div style="font-weight:700">${p.empleados?.nombre || '—'}</div>
                    <div style="font-size:11px;color:var(--text3)">Afiliación: <b>${p.empleados?.igss || 'No afiliado'}</b></div>
                  </td>
                  <td class="mono-sm">${p.empleados?.dpi || '—'}</td>
                  <td class="mono-sm text-right" style="text-align:right">${UI.q(base)}</td>
                  <td class="mono-sm text-red text-right" style="text-align:right">-${UI.q(lab)}</td>
                  <td class="mono-sm text-amber text-right" style="text-align:right">${UI.q(patIgss)}</td>
                  <td class="mono-sm text-amber text-right" style="text-align:right">${UI.q(irtra)}</td>
                  <td class="mono-sm text-amber text-right" style="text-align:right">${UI.q(intecap)}</td>
                  <td class="mono-sm text-amber text-right" style="text-align:right;font-weight:700">${UI.q(totalPat)}</td>
                  <td class="mono-sm text-green text-right" style="text-align:right"><b>${UI.q(totalAporte)}</b></td>
                </tr>`;
              }).join('') || `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text3)">
                No hay nóminas calculadas para el período seleccionado. Presiona la pestaña "Nómina" para calcularlas.
              </td></tr>`}
            </tbody>
          </table>
        </div>
      `;
    }

    else if (this._tab==='productividad') {
      await this._renderProductividad(el);
    }

    else if (this._tab==='capacitacion') {
      await this._renderCapacitacion(el);
    }

    else if (this._tab==='asignaciones') {
      await this._renderAsignaciones(el);
    }

    else if (this._tab==='organigrama') {
      const ids = new Set(this._empleados.map(e=>e.id));
      const byParent = {};
      this._empleados.forEach(e=>{
        const p = (e.reporta_a && ids.has(e.reporta_a)) ? e.reporta_a : 'root';
        (byParent[p] = byParent[p] || []).push(e);
      });
      const raices = byParent['root'] || [];
      const visited = new Set();
      let arbol = raices.map(r=>this._renderNodoOrg(r, byParent, 0, visited)).join('');
      /* Cualquier nodo no alcanzado (ciclo) se muestra como raíz extra */
      const sueltos = this._empleados.filter(e=>!visited.has(e.id));
      arbol += sueltos.map(r=>this._renderNodoOrg(r, byParent, 0, visited)).join('');

      el.innerHTML = `
        <div class="alert alert-cyan" style="margin-bottom:16px">
          <div class="alert-icon">🏢</div>
          <div class="alert-body" style="font-size:12px">
            Cadena de mando del taller. Asigna el jefe de cada empleado desde
            <b>Empleados → Editar → Reporta a</b>. La cúpula (CEO/Dueño/Gerente General) aparece arriba sin jefe.
          </div>
        </div>
        ${this._empleados.length ? `<div class="org-container"><div class="org-tree"><ul>${arbol}</ul></div></div>`
          : '<div class="text-muted" style="padding:20px">Sin empleados registrados.</div>'}`;
    }

    else if (this._tab==='documentos') {
      el.innerHTML = `
        <div class="alert alert-cyan" style="margin-bottom:16px">
          <div class="alert-icon">ℹ️</div>
          <div class="alert-body" style="font-size:12px">Selecciona un empleado para ver y gestionar sus documentos.</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
          ${this._empleados.map(e=>`
            <div class="card" style="cursor:pointer;text-align:center" onclick="Modulos.rrhh.verDocumentos('${e.id}','${e.nombre}')">
              <div style="font-size:28px;margin-bottom:8px">👤</div>
              <div style="font-weight:700;font-size:13px">${e.nombre}</div>
              <div style="font-size:11px;color:var(--text3)">${e.cargo||'—'}</div>
              <div class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%">Ver documentos</div>
            </div>`).join('')||'<div class="text-muted">Sin empleados registrados</div>'}
        </div>`;
    }

    else if (this._tab==='reclutamiento') {
      await this._renderReclutamiento(el);
    }

    else if (this._tab==='disciplina') {
      await this._renderDisciplina(el);
    }

    else if (this._tab==='vacaciones') {
      await this._renderVacaciones(el);
    }

    else if (this._tab==='horasextra') {
      await this._renderHorasExtra(el);
    }
  },

  /* Render recursivo de un nodo del organigrama (con guarda anti-ciclos) */
  _renderNodoOrg(e, byParent, nivel, visited) {
    if (visited.has(e.id)) return '';
    visited.add(e.id);
    const hijos = byParent[e.id] || [];
    const dim = e.activo ? '' : 'opacity:.55;';
    const esRaiz = nivel === 0;
    
    // HTML de los hijos recursivos (ul/li estructurados)
    const hijosHtml = hijos.length 
      ? `<ul>${hijos.map(h => this._renderNodoOrg(h, byParent, nivel + 1, visited)).join('')}</ul>` 
      : '';

    return `
      <li class="${esRaiz ? 'org-root' : ''}" style="${dim}">
        <div class="org-card" style="border-top: 3px solid ${esRaiz ? 'var(--amber)' : 'var(--cyan)'}">
          <div class="org-card-avatar">${e.avatar || '👤'}</div>
          <div class="org-card-name">${e.nombre}</div>
          <div class="org-card-cargo">${e.cargo || ROLES[e.rol]?.label || '—'}</div>
          ${esRaiz ? '<div class="org-card-tag">Cúpula</div>' : ''}
          ${hijos.length ? `<div style="font-size:10px;color:var(--text3);margin-top:4px;font-weight:700">${hijos.length} a cargo</div>` : ''}
        </div>
        ${hijosHtml}
      </li>`;
  },

  /* Registrar la obligación de pago de la planilla IGSS+IRTRA+INTECAP
     (vence el día 20 del mes siguiente). Alimenta el Calendario,
     el aviso al login y Contabilidad → Obligaciones. */
  async registrarPagoIGSS(mes, anio, monto) {
    const periodo = `${anio}-${String(mes).padStart(2,'0')}`;
    const vence = new Date(anio, mes, 20).toISOString().slice(0,10);
    const ok = await UI.confirmar(
      `¿Registrar la obligación de la <b>planilla IGSS · IRTRA · INTECAP</b> del periodo <b>${periodo}</b>
      por <b>${UI.q(monto)}</b> (17.50% de la masa salarial)?<br>
      <span style="font-size:11px;color:var(--text3)">Vence el ${UI.fecha(vence)} — aparecerá en el Calendario y en Contabilidad → Obligaciones.</span>`,
      '📅 Registrar pago IGSS');
    if (!ok) return;
    const { error } = await DB.upsertObligacion({
      tipo: 'IGSS', periodo, monto_calculado: Math.round(monto*100)/100,
      fecha_vencimiento: vence, estado: 'pendiente',
      notas: 'Planilla IGSS + IRTRA + INTECAP (cuota laboral 4.83% + patronal 12.67%)'
    });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(`Obligación IGSS ${periodo} registrada ✓ — vence el ${UI.fecha(vence)}`);
  },

  async calcularNomina(mes, anio) {
    const activos = this._empleados.filter(x=>x.activo);
    if (!activos.length) { UI.toast('No hay empleados activos para calcular','error'); return; }
    UI.toast('Calculando nómina Guatemala 2026...','info');
    const errores = [];
    const horasExtraPend = await DB.getHorasExtra(mes, anio, true);
    for (const e of activos) {
      const isr  = calcularISR(e.salario_base);
      const igss = e.salario_base * GT.igss_laboral;
      const extrasEmp = horasExtraPend.filter(h=>h.empleado_id===e.id);
      const extraFeriado = extrasEmp.reduce((s,h)=>s+(Number(h.monto)||0),0);
      const liquido = e.salario_base + (e.bonificacion||GT.bonificacion_incentivo) - igss - isr + extraFeriado;
      const { error } = await DB.upsertPagoNomina({
        empleado_id:  e.id, periodo_mes: mes, periodo_anio: anio,
        salario_base: e.salario_base,
        bonificacion: e.bonificacion || GT.bonificacion_incentivo,
        igss_laboral: Math.round(igss*100)/100,
        isr:          Math.round(isr*100)/100,
        extra_feriado: Math.round(extraFeriado*100)/100,
        liquido:      Math.round(liquido*100)/100
      });
      if (error) { errores.push(`${e.nombre}: ${error.message}`); continue; }
      for (const h of extrasEmp) {
        await DB.upsertHoraExtra({ id: h.id, pagada: true, periodo_mes: mes, periodo_anio: anio });
      }
    }
    if (errores.length) {
      console.error('calcularNomina:', errores);
      UI.toast(`Nómina con errores (${errores.length}/${activos.length}): ${errores[0]}`,'error');
    } else {
      UI.toast(`Nómina calculada ✓ (${activos.length} empleados)`);
    }
    this._renderTab();
  },

  async pagarNomina(pagoId) {
    const now = new Date();
    const mes = now.getMonth()+1, anio = now.getFullYear();
    const pagos = await DB.getPagosNomina(mes, anio);
    const p = pagos.find(x=>x.id===pagoId);
    if (!p) return;
    const ok = await UI.confirmar(`¿Marcar como pagado el salario de <b>${p.empleados?.nombre || 'empleado'}</b> por un monto líquido de <b>${UI.q(p.liquido)}</b>? Se registrará como egreso y salida de banco.`, 'Confirmar Pago');
    if (!ok) return;

    // 1. Actualizar el pago de nómina
    const { error } = await DB.upsertPagoNomina({
      id: pagoId,
      pagado: true,
      fecha_pago: new Date().toISOString().slice(0,10)
    });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }

    // 2. Registrar egreso en la categoría Nómina (que a su vez registra la salida en el banco por defecto)
    await DB.upsertEgreso({
      concepto: `Pago Planilla: ${p.empleados?.nombre || 'Empleado'} (Mes ${p.periodo_mes}/${p.periodo_anio})`,
      monto: p.liquido,
      categoria: 'Nómina',
      fecha: new Date().toISOString().slice(0,10),
      referencia: `NOM-${pagoId.slice(0,8)}`
    });

    UI.toast('Nómina pagada y egreso registrado ✓');
    this._renderTab();
  },

  modalEmpleado(id=null) {
    const e = id ? this._empleados.find(x=>x.id===id) : {};
    this._tempFoto = e.foto || '';
    const esEdicion = !!id;
    const salMinimo = GT.salario_minimo_no_agricola;
    const bono      = GT.bonificacion_incentivo;

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Empleado`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del empleado.</div></div>':''}

      <!-- FOTO Y DATOS PERSONALES -->
      <div style="display:flex;gap:16px;margin-bottom:12px;align-items:flex-start">
        <!-- Columna Foto -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:120px;flex-shrink:0">
          <div style="font-weight:700;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Fotografía</div>
          <div id="emp-photo-container" style="position:relative;width:100px;height:120px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);display:flex;align-items:center;justify-content:center;overflow:hidden">
            ${this._tempFoto ? `<img src="${this._tempFoto}" id="emp-img-preview" style="width:100%;height:100%;object-fit:cover">` : `<span id="emp-img-placeholder" style="font-size:48px;color:var(--text3)">👤</span>`}
          </div>
          <!-- Botones de la foto -->
          <div style="display:flex;gap:4px;width:100%">
            <button type="button" class="btn btn-sm btn-ghost" title="Subir archivo de foto" style="padding:4px;flex:1" onclick="document.getElementById('emp-file-input').click()">📁</button>
            <button type="button" class="btn btn-sm btn-ghost" title="Tomar foto con cámara" style="padding:4px;flex:1" onclick="Modulos.rrhh.iniciarCamara()">📷</button>
            <button type="button" class="btn btn-sm btn-ghost text-red" title="Eliminar foto" style="padding:4px;flex:1" onclick="Modulos.rrhh.eliminarFoto()">🗑️</button>
          </div>
          <input type="file" id="emp-file-input" accept="image/*" style="display:none" onchange="Modulos.rrhh.subirFotoEmpleado(this)">
        </div>

        <!-- Columna Campos -->
        <div style="flex:1">
          <div style="font-weight:700;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Datos Personales</div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Nombre Completo *</label>
              <input class="form-input" id="emp-nombre" value="${e.nombre||''}"></div>
            <div class="form-group"><label class="form-label">Cargo / Puesto</label>
              <input class="form-input" id="emp-cargo" value="${e.cargo||''}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">DPI *</label>
              <input class="form-input" id="emp-dpi" value="${e.dpi||''}" placeholder="0000 00000 0000"></div>
            <div class="form-group"><label class="form-label">No. IGSS</label>
              <input class="form-input" id="emp-igss" value="${e.igss||''}"></div>
          </div>
        </div>
      </div>

      <!-- Cámara Box (oculto por defecto) -->
      <div id="emp-camera-box" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:16px;text-align:center">
        <div style="font-weight:700;font-size:12px;margin-bottom:8px">Capturar Foto</div>
        <video id="emp-camera-video" autoplay playsinline style="width:100%;max-width:240px;height:180px;object-fit:cover;border-radius:6px;background:#000;margin:0 auto 8px;display:block"></video>
        <canvas id="emp-camera-canvas" style="display:none"></canvas>
        <div style="display:flex;justify-content:center;gap:8px">
          <button type="button" class="btn btn-sm btn-ghost" onclick="Modulos.rrhh.detenerCamara()">Cancelar</button>
          <button type="button" class="btn btn-sm btn-amber" onclick="Modulos.rrhh.capturarFotoCamara()">📸 Capturar</button>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group"><label class="form-label">Teléfono</label>
          <input class="form-input" id="emp-tel" value="${e.tel||''}" placeholder="5501-1234"></div>
        <div class="form-group"><label class="form-label">Email</label>
          <input class="form-input" id="emp-email" type="email" value="${e.email||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha de Nacimiento</label>
          <input class="form-input" id="emp-nacimiento" type="date" value="${e.fecha_nacimiento||''}"></div>
        <div class="form-group"><label class="form-label">Estado Civil</label>
          <select class="form-select" id="emp-estado-civil">
            ${['Soltero/a','Casado/a','Unido/a','Divorciado/a','Viudo/a'].map(s=>`<option ${e.estado_civil===s?'selected':''}>${s}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Dirección</label>
        <input class="form-input" id="emp-dir" value="${e.direccion||''}"></div>

      <!-- SITUACIÓN DE SALUD / ALERGIAS -->
      <div class="form-group"><label class="form-label">Alergias / Situación de Salud (se muestra en el carné)</label>
        <input class="form-input" id="emp-alergias" value="${e.alergias_salud||''}" placeholder="Ej. Sangre O+, Alergia a Penicilina, Diabético..."></div>

      <!-- CONTACTO DE EMERGENCIA -->
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px;font-weight:700;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Contacto de Emergencia</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre</label>
          <input class="form-input" id="emp-emerg-nombre" value="${e.emergencia_nombre||''}"></div>
        <div class="form-group"><label class="form-label">Parentesco</label>
          <select class="form-select" id="emp-emerg-parentesco">
            ${['Cónyuge','Padre/Madre','Hijo/a','Hermano/a','Otro'].map(p=>`<option ${e.emergencia_parentesco===p?'selected':''}>${p}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Teléfono de Emergencia</label>
        <input class="form-input" id="emp-emerg-tel" value="${e.emergencia_tel||''}" placeholder="5501-1234"></div>

      <!-- DATOS LABORALES -->
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px;font-weight:700;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Datos Laborales</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha de Ingreso</label>
          <input class="form-input" id="emp-ingreso" type="date" value="${e.fecha_ingreso||''}"></div>
        <div class="form-group"><label class="form-label">Departamento / Área</label>
          <input class="form-input" id="emp-departamento" value="${e.departamento||''}" placeholder="Taller, Administración..."></div>
      </div>
      <div class="form-group"><label class="form-label">Reporta a (jefe directo)</label>
        <select class="form-select" id="emp-jefe">
          <option value="">— Sin jefe (CEO / Dueño / Gerente General) —</option>
          ${this._empleados.filter(x=>x.id!==e.id).map(x=>`<option value="${x.id}" ${e.reporta_a===x.id?'selected':''}>${x.nombre}${x.cargo?` — ${x.cargo}`:''}</option>`).join('')}
        </select>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Define la cadena de mando. Solo la cúpula (CEO/Dueño/Gerente General) queda sin jefe.</div></div>

      <!-- ACCESO AL SISTEMA (OPCIONAL) -->
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px;font-weight:700;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Acceso al Sistema</div>
      ${e.user_id ? `
        <div class="alert alert-green" style="margin-bottom:4px">
          <div class="alert-icon">✅</div>
          <div class="alert-body" style="font-size:11px">Este empleado <b>ya tiene acceso</b> al sistema. Gestiona su rol y permisos desde <b>Administración → Usuarios</b>.</div>
        </div>` : `
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:4px">
          <input type="checkbox" id="emp-crear-usuario" onchange="Modulos.rrhh._toggleAcceso(this.checked)">
          <span class="form-label" style="margin:0">Crear acceso al sistema (usuario y contraseña)</span>
        </label>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">No todos los empleados necesitan acceso. Actívalo solo para quien usará TallerPro.</div>
        <div id="emp-acceso-box" style="display:none">
          <div class="form-row">
            <div class="form-group"><label class="form-label">Rol en el Sistema *</label>
              <select class="form-select" id="emp-rol">
                ${['mecanico','vendedor','recepcionista','gerente_tal','gerente_fin','admin'].map(r=>`<option value="${r}" ${e.rol===r?'selected':''}>${ROLES[r]?.icon||''} ${ROLES[r]?.label||r}</option>`).join('')}
              </select></div>
            <div class="form-group"><label class="form-label">Contraseña Temporal *</label>
              <div style="position:relative">
                <input class="form-input" id="emp-pass" type="password" placeholder="Mínimo 8 caracteres" style="padding-right:44px">
                <button type="button" onclick="UI.togglePass('emp-pass',this)" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;color:var(--text3)">👁</button>
              </div></div>
          </div>
          <div class="alert alert-cyan" style="margin-bottom:4px">
            <div class="alert-icon">🔑</div>
            <div class="alert-body" style="font-size:11px">Iniciará sesión con el <b>email</b> indicado arriba y la contraseña temporal. Deberá cambiarla en su primer ingreso.</div>
          </div>
        </div>`}

      <!-- SALARIO CON REFERENCIA MINSALARIO 2026 -->
      <div class="card card-amber" style="margin-bottom:12px">
        <div style="font-size:11px;color:var(--text3);margin-bottom:6px">📋 Salarios Mínimos Guatemala 2026 (Ministerio de Trabajo)</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px">
          <div style="cursor:pointer" onclick="document.getElementById('emp-salario').value=${salMinimo}">
            <div style="color:var(--amber);font-weight:700">No Agrícola</div>
            <div class="mono-sm">Q${salMinimo.toFixed(2)}</div>
            <div style="color:var(--text3);font-size:10px">Click para aplicar</div>
          </div>
          <div style="cursor:pointer" onclick="document.getElementById('emp-salario').value=${GT.salario_minimo_agricola}">
            <div style="color:var(--cyan);font-weight:700">Agrícola</div>
            <div class="mono-sm">Q${GT.salario_minimo_agricola.toFixed(2)}</div>
            <div style="color:var(--text3);font-size:10px">Click para aplicar</div>
          </div>
          <div style="cursor:pointer" onclick="document.getElementById('emp-salario').value=${GT.salario_minimo_maquila}">
            <div style="color:var(--purple);font-weight:700">Maquila</div>
            <div class="mono-sm">Q${GT.salario_minimo_maquila.toFixed(2)}</div>
            <div style="color:var(--text3);font-size:10px">Click para aplicar</div>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Salario Base (Q) *</label>
          <input class="form-input" id="emp-salario" type="number" value="${e.salario_base||salMinimo}" min="0" step="0.01"
                 oninput="Modulos.rrhh._calcularPreviaNomina(this.value)"></div>
        <div class="form-group"><label class="form-label">Bonificación Incentivo (Q)</label>
          <input class="form-input" id="emp-bono" type="number" value="${e.bonificacion||bono}" min="0"></div>
      </div>
      <!-- Preview cálculo nómina -->
      <div id="emp-nomina-preview" class="card" style="background:var(--surface2);font-size:12px;margin-bottom:12px">
        ${this._calcularPreview(e.salario_base||salMinimo)}
      </div>

      <!-- CUENTA BANCARIA -->
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px;font-weight:700;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Cuenta Bancaria para Nómina</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Banco</label>
          <select class="form-select" id="emp-banco">
            ${['','Banrural','BAC','G&T Continental','Industrial','Bantrab','Agromercantil','Otro'].map(b=>`<option ${e.banco===b?'selected':''}>${b}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">No. Cuenta</label>
          <input class="form-input" id="emp-cuenta" value="${e.cuenta_bancaria||''}" class="mono-sm"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo de Cuenta</label>
          <select class="form-select" id="emp-tipo-cuenta">
            ${['monetaria','ahorro'].map(t=>`<option ${e.tipo_cuenta===t?'selected':''}>${t}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">DPI para cuenta</label>
          <input class="form-input" id="emp-dpi-banco" value="${e.dpi_banco||''}"></div>
      </div>

      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="emp-notas" rows="2">${e.notas||''}</textarea></div>
      ${esEdicion?`<div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="emp-activo" ${e.activo?'checked':''}>
          <span class="form-label" style="margin:0">Empleado activo</span>
        </label>
      </div>`:''}

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="Modulos.rrhh.detenerCamara();UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh.guardarEmpleado('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear Empleado'}
        </button>
      </div>`,'680px');
  },

  _calcularPreview(salario) {
    const s   = parseFloat(salario) || 0;
    const bono = GT.bonificacion_incentivo;
    const igss = Math.round(s * GT.igss_laboral * 100)/100;
    const isr  = Math.round(calcularISR(s) * 100)/100;
    const liq  = Math.round((s + bono - igss - isr) * 100)/100;
    return `<div style="font-size:11px;color:var(--text3);margin-bottom:6px">Preview cálculo nómina:</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center">
        <div><div style="color:var(--amber);font-weight:700">${UI.q(s+bono)}</div><div style="font-size:10px;color:var(--text3)">Devengado</div></div>
        <div><div style="color:var(--red);font-weight:700">-${UI.q(igss)}</div><div style="font-size:10px;color:var(--text3)">IGSS ${(GT.igss_laboral*100).toFixed(2)}%</div></div>
        <div><div style="color:var(--red);font-weight:700">-${UI.q(isr)}</div><div style="font-size:10px;color:var(--text3)">ISR</div></div>
        <div><div style="color:var(--green);font-weight:700">${UI.q(liq)}</div><div style="font-size:10px;color:var(--text3)">Líquido</div></div>
      </div>`;
  },

  _calcularPreviaNomina(salario) {
    const el = document.getElementById('emp-nomina-preview');
    if (el) el.innerHTML = this._calcularPreview(salario);
  },

  /* Muestra/oculta los campos de acceso al sistema */
  _toggleAcceso(activo) {
    const box = document.getElementById('emp-acceso-box');
    if (box) box.style.display = activo ? 'block' : 'none';
  },

  async eliminarEmpleado(id, nombre) {
    /* Si tiene historial (nómina/viáticos) el borrado fallará por FK;
       en ese caso se ofrece desactivarlo en su lugar. */
    const ok = await UI.confirmar(`¿Eliminar al empleado <b>${nombre||''}</b>? Esta acción no se puede deshacer.`, 'Eliminar');
    if (!ok) return;
    const exito = await DB.deleteRegistro('empleados', id);
    if (exito) { UI.toast('Empleado eliminado ✓'); this._renderTab(); return; }
    const desactivar = await UI.confirmar(
      'No se pudo eliminar porque tiene registros relacionados (nómina, viáticos o documentos).<br>¿Deseas <b>desactivarlo</b> en su lugar?',
      'Desactivar'
    );
    if (!desactivar) return;
    const { error } = await DB.upsertEmpleado({ id, activo: false });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast('Empleado desactivado ✓'); this._renderTab();
  },

  async guardarEmpleado(id='') {
    this.detenerCamara();
    const nombre = document.getElementById('emp-nombre')?.value.trim();
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }
    const prev = id ? this._empleados.find(x=>x.id===id) : null;
    const email = document.getElementById('emp-email')?.value.trim()||null;

    /* Acceso al sistema (opcional) */
    const crearAcceso = document.getElementById('emp-crear-usuario')?.checked || false;
    const accesoRol   = document.getElementById('emp-rol')?.value || 'mecanico';
    const accesoPass  = document.getElementById('emp-pass')?.value || '';
    if (crearAcceso) {
      if (!email)               { UI.toast('Para crear acceso necesitas un email','error'); return; }
      if (accesoPass.length<8)  { UI.toast('La contraseña temporal debe tener al menos 8 caracteres','error'); return; }
    }

    const fields = {
      nombre,
      foto:                  this._tempFoto || null,
      cargo:                 document.getElementById('emp-cargo')?.value||null,
      dpi:                   document.getElementById('emp-dpi')?.value||null,
      igss:                  document.getElementById('emp-igss')?.value.trim()||null,
      tel:                   document.getElementById('emp-tel')?.value||null,
      email,
      fecha_nacimiento:      document.getElementById('emp-nacimiento')?.value||null,
      estado_civil:          document.getElementById('emp-estado-civil')?.value||null,
      direccion:             document.getElementById('emp-dir')?.value||null,
      departamento:          document.getElementById('emp-departamento')?.value||null,
      emergencia_nombre:     document.getElementById('emp-emerg-nombre')?.value||null,
      emergencia_parentesco: document.getElementById('emp-emerg-parentesco')?.value||null,
      emergencia_tel:        document.getElementById('emp-emerg-tel')?.value||null,
      alergias_salud:        document.getElementById('emp-alergias')?.value.trim()||null,
      fecha_ingreso:         document.getElementById('emp-ingreso')?.value||null,
      rol:                   crearAcceso ? accesoRol : (prev?.rol || null),
      reporta_a:             (document.getElementById('emp-jefe')?.value && document.getElementById('emp-jefe').value!==id)
                               ? document.getElementById('emp-jefe').value : null,
      salario_base:          parseFloat(document.getElementById('emp-salario')?.value)||GT.salario_minimo_no_agricola,
      bonificacion:          parseFloat(document.getElementById('emp-bono')?.value)||GT.bonificacion_incentivo,
      banco:                 document.getElementById('emp-banco')?.value||null,
      cuenta_bancaria:       document.getElementById('emp-cuenta')?.value||null,
      tipo_cuenta:           document.getElementById('emp-tipo-cuenta')?.value||null,
      dpi_banco:             document.getElementById('emp-dpi-banco')?.value||null,
      notas:                 document.getElementById('emp-notas')?.value||null,
      activo:                id ? (document.getElementById('emp-activo')?.checked ?? true) : true
    };
    if (id) fields.id = id;

    /* Crear el acceso al sistema ANTES de guardar para vincular el user_id */
    if (crearAcceso) {
      UI.toast('Creando acceso al sistema...','info');
      const r = await Auth.crearUsuario({ nombre, email, rol: accesoRol, telefono: fields.tel, password: accesoPass });
      if (!r.ok) { UI.toast('No se pudo crear el acceso: '+r.error,'error'); return; }
      if (r.id) fields.user_id = r.id;
    }

    const {error} = await DB.upsertEmpleado(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal();
    UI.toast(crearAcceso ? `Empleado creado con acceso al sistema ✓`
                         : (id?'Empleado actualizado ✓':'Empleado creado ✓'));
    this._renderTab();
  },

  /* ── PRODUCTIVIDAD: hora-hombre + KPIs + bono (mensual) ── */
  _rangoMes() {
    const now = new Date();
    const mes  = this._prodMes  || (now.getMonth()+1);
    const anio = this._prodAnio || now.getFullYear();
    const ini = new Date(anio, mes-1, 1).toISOString().slice(0,10);
    const fin = new Date(anio, mes, 0).toISOString().slice(0,10);
    return { mes, anio, ini, fin };
  },

  /* KPIs que aplican a un empleado según su ROL (con overrides del tenant).
     Prioridad: settings.kpis_rol[grupo] → legacy settings.kpis (solo mecánico)
     → plantilla KPIS_POR_ROL del sistema. */
  _kpisDe(emp, cfg) {
    const grupo = plantillaKpiRol(emp.rol || 'mecanico');
    if (cfg?.kpis_rol?.[grupo]?.length) return cfg.kpis_rol[grupo];
    if (grupo === 'mecanico' && cfg?.kpis?.length) return cfg.kpis;
    return KPIS_POR_ROL[grupo];
  },

  /* Métricas de un conjunto de OTs (del empleado o de todo el taller) */
  _metricasOts(ots) {
    const entregadasArr = ots.filter(o => ['entregado','listo'].includes(o.estado));
    const trabajadas = ots.length;
    const entregadas = entregadasArr.length;
    const ingresos   = entregadasArr.reduce((s,o)=>s+(Number(o.total)||0),0);
    const garantias  = ots.filter(o => o.estado==='garantia').length;
    const conFechas  = entregadasArr.filter(o => o.fecha_entrega && o.fecha_estimada);
    const aTiempo    = conFechas.filter(o => o.fecha_entrega <= o.fecha_estimada).length;
    const cumplimiento = conFechas.length ? Math.round(aTiempo/conFechas.length*100) : (entregadas ? 100 : 0);
    const calidad      = trabajadas ? Math.max(0, Math.round(100 - garantias/trabajadas*100)) : 100;
    return { trabajadas, entregadas, ingresos, garantias, cumplimiento, calidad };
  },

  /* Calcula los KPIs (auto + manual) y el score ponderado de un empleado.
     Los KPIs dependen del ROL: gerencia/ventas miden el TALLER (scope:'taller'),
     los mecánicos miden SUS OTs. Los personalizados son manuales (0-100). */
  _kpiScores(emp, ordenes, manual, cfg) {
    const propio = this._metricasOts(ordenes.filter(o => o.mecanico_id === emp.id));
    const taller = this._metricasOts(ordenes);

    const detail = this._kpisDe(emp, cfg).map(k => {
      const m = k.scope === 'taller' ? taller : propio;
      let score = 0, valor = '—';
      if (k.tipo === 'manual') {
        score = Math.max(0, Math.min(100, Number(manual?.[k.id]) || 0));
        valor = `${score}%`;
      } else if (k.id === 'ots_entregadas' || k.id === 'ots_taller') {
        score = Math.min(100, Math.round(m.entregadas/(k.meta||10)*100));
        valor = `${m.entregadas}/${m.trabajadas} (meta ${k.meta||10})`;
      } else if (k.id === 'ingresos' || k.id === 'ingresos_taller') {
        score = Math.min(100, Math.round(m.ingresos/(k.meta||20000)*100));
        valor = `${UI.q(m.ingresos)} (meta ${UI.q(k.meta||20000)})`;
      } else if (k.id === 'cumplimiento' || k.id === 'cumplimiento_taller') {
        score = m.cumplimiento; valor = `${m.cumplimiento}% a tiempo`;
      } else if (k.id === 'calidad') {
        score = m.calidad; valor = `${m.garantias} garantía(s)`;
      }
      return { id:k.id, label:k.label, peso:Number(k.peso)||0, tipo:k.tipo, scope:k.scope, valor, score };
    });
    const pesoTotal = detail.reduce((s,d)=>s+d.peso,0) || 1;
    const score = Math.round(detail.reduce((s,d)=>s+d.score*d.peso,0)/pesoTotal);
    return { detail, score, raw: propio, taller };
  },

  _calcBono(salario, score, cfg) {
    /* Base del bono: salario (Fase 1). Bono = salario × bono_max% × score% */
    const pct = (Number(cfg.bono_max_pct)||0)/100;
    return Math.round((Number(salario)||0) * pct * (score/100) * 100)/100;
  },

  async _renderProductividad(el) {
    const { mes, anio, ini, fin } = this._rangoMes();
    this._cfgProd = await DB.getConfigProductividad();
    const [ordenes, registros, historial] = await Promise.all([
      DB.getOrdenesPeriodo(ini, fin),
      DB.getKpiEmpleados(mes, anio),
      DB.getKpiHistorial()
    ]);
    const cfg = this._cfgProd;
    const recByEmp = {}; registros.forEach(r => recByEmp[r.empleado_id] = r);
    const activos = this._empleados.filter(e => e.activo);
    const vista = this._prodVista || 'tabla';

    const nombreMes = new Date(anio, mes-1, 1).toLocaleDateString('es-GT',{month:'long',year:'numeric'});
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const anios = [anio-1, anio, anio+1];

    /* Datos calculados una vez para ambas vistas */
    let totalBono = 0, totalCosto = 0;
    const datos = activos.map(e => {
      const rec = recByEmp[e.id];
      const { score, raw, detail } = this._kpiScores(e, ordenes, rec?.manual||{}, cfg);
      const hh = calcularHoraHombre(e.salario_base, cfg);
      const bono = rec?.aprobado ? (rec.bono ?? this._calcBono(e.salario_base, score, cfg))
                                 : this._calcBono(e.salario_base, score, cfg);
      totalBono += bono;
      totalCosto += hh.costoMensual;
      return { e, rec, score, raw, detail, hh, bono };
    });

    const filas = datos.map(({ e, rec, score, raw, hh, bono }) => {
      const col = score>=80?'green':score>=50?'amber':'red';
      return `<tr>
        <td><div style="font-weight:700">${e.nombre}</div><div style="font-size:11px;color:var(--text3)">${e.cargo||ROLES[e.rol]?.label||'—'} · KPIs ${KPIS_ROL_LABELS[plantillaKpiRol(e.rol)]?.replace(/^\S+\s/,'')||''}</div></td>
        <td class="mono-sm">${UI.q(hh.horaHombre)}<div style="font-size:10px;color:var(--text3)">${UI.q(hh.costoMensual)}/mes</div></td>
        <td style="text-align:center" class="mono-sm">${raw.entregadas}/${raw.trabajadas}</td>
        <td class="mono-sm text-green">${UI.q(raw.ingresos)}</td>
        <td style="min-width:120px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:7px;background:var(--surface3);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${score}%;background:var(--${col});border-radius:4px"></div>
            </div>
            <b style="color:var(--${col})">${score}%</b>
          </div>
        </td>
        <td class="mono-sm text-amber"><b>${UI.q(bono)}</b></td>
        <td><span class="badge badge-${rec?.aprobado?'green':'gray'}">${rec?.aprobado?'Aprobado':'Borrador'}</span></td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-cyan" onclick="Modulos.rrhh.detalleEmpleado('${e.id}')" title="Ver / editar KPIs">👁 Ver</button>
          ${rec?.aprobado?'':`<button class="btn btn-sm btn-green" onclick="Modulos.rrhh.aprobarBono('${e.id}')" title="Aprobar bono y cargar a egresos">✓ Bono</button>`}
          ${rec?`<button class="btn btn-sm btn-danger" onclick="Modulos.rrhh.eliminarKpi('${rec.id}')" title="Eliminar registro del mes">🗑️</button>`:''}
        </div></td>
      </tr>`;
    }).join('');

    const cuerpo = vista === 'dash'
      ? this._htmlProdDashboard(datos, historial, mes, anio)
      : `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>Empleado</th><th>Hora-Hombre</th><th style="text-align:center">OTs</th><th>Ingresos</th><th>Score</th><th>Bono</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>${filas||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin empleados activos</td></tr>'}</tbody>
        </table></div>`;

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <div style="display:flex;gap:8px;align-items:center">
          <select class="form-select" style="width:auto" onchange="Modulos.rrhh._prodMes=parseInt(this.value);Modulos.rrhh._renderTab()">
            ${meses.map((m,i)=>`<option value="${i+1}" ${mes===i+1?'selected':''}>${m}</option>`).join('')}
          </select>
          <select class="form-select" style="width:auto" onchange="Modulos.rrhh._prodAnio=parseInt(this.value);Modulos.rrhh._renderTab()">
            ${anios.map(a=>`<option value="${a}" ${anio===a?'selected':''}>${a}</option>`).join('')}
          </select>
          <div class="view-toggle">
            <button class="view-btn ${vista==='tabla'?'active':''}" title="Vista tabla" onclick="Modulos.rrhh._prodVista='tabla';Modulos.rrhh._renderTab()">📋</button>
            <button class="view-btn ${vista==='dash'?'active':''}" title="Dashboard de KPIs" onclick="Modulos.rrhh._prodVista='dash';Modulos.rrhh._renderTab()">📊</button>
          </div>
        </div>
        <button class="btn btn-ghost" onclick="Modulos.rrhh.modalConfigProductividad()">⚙️ Configurar criterios</button>
      </div>

      <div class="kpi-grid" style="margin-bottom:16px">
        ${UI.kpiCard({ icon:'👥', clase:'cyan', label:'Empleados', value: activos.length, trend:'activos' })}
        ${UI.kpiCard({ icon:'💰', clase:'red', label:'Costo Mensual (cargado)', value: totalCosto, money:true, trend: nombreMes })}
        ${UI.kpiCard({ icon:'⭐', clase:'amber', label:'Bonos del Mes', value: totalBono, money:true, trend:'según desempeño' })}
        ${UI.kpiCard({ icon:'⏱️', clase:'green', label:'Hora-Hombre prom.', value: activos.length?totalCosto/activos.length/(cfg.horas_mes||240):0, money:true, trend:`base ${cfg.horas_mes||240} h/mes` })}
      </div>

      ${cuerpo}
      <div class="alert alert-cyan" style="margin-top:12px">
        <div class="alert-icon">ℹ️</div>
        <div class="alert-body" style="font-size:12px">Los KPIs dependen del <b>rol</b> de cada empleado (gerencia mide el taller completo, mecánicos sus OTs). El <b>bono</b> = salario × ${cfg.bono_max_pct||30}% × score. Al <b>aprobar</b>, el bono se registra como egreso (categoría Bonos) del mes.</div>
      </div>`;
  },

  /* ── Mini dashboard de KPIs por empleado ───────────
     Tarjeta por empleado: anillo de score, barras por KPI,
     bono y tendencia de los últimos 6 meses. */
  _htmlProdDashboard(datos, historial, mes, anio) {
    if (!datos.length) return '<div class="empty-state">Sin empleados activos</div>';

    /* últimos 6 periodos terminando en el mes seleccionado */
    const periodos = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anio, mes-1-i, 1);
      periodos.push({ m: d.getMonth()+1, a: d.getFullYear(), lbl: d.toLocaleDateString('es-GT',{month:'short'}) });
    }

    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px">
      ${datos.map(({ e, rec, score, detail, bono }) => {
        const col = score>=80?'green':score>=50?'amber':'red';
        const hist = periodos.map(p => {
          const r = historial.find(h => h.empleado_id===e.id && h.periodo_mes===p.m && h.periodo_anio===p.a);
          return { ...p, score: r ? (Number(r.score)||0) : null };
        });
        return `
        <div class="card" style="cursor:pointer" onclick="Modulos.rrhh.detalleEmpleado('${e.id}')">
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">
            <div style="width:62px;height:62px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;
                        background:conic-gradient(var(--${col}) ${score*3.6}deg, var(--surface3) 0deg)">
              <div style="width:48px;height:48px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--${col})">${score}%</div>
            </div>
            <div style="min-width:0">
              <div style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.avatar||'👤'} ${e.nombre}</div>
              <div style="font-size:11px;color:var(--text3)">${e.cargo||ROLES[e.rol]?.label||'—'}</div>
              <div style="margin-top:3px"><span class="badge badge-${rec?.aprobado?'green':'amber'}" style="font-size:10px">Bono ${UI.q(bono)}${rec?.aprobado?' ✓':''}</span></div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:10px">
            ${detail.map(d=>`
              <div style="display:flex;align-items:center;gap:8px;font-size:11px">
                <span style="flex:1;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${d.valor}">${d.label}</span>
                <div style="width:90px;height:5px;background:var(--surface3);border-radius:3px;overflow:hidden;flex-shrink:0">
                  <div style="height:100%;width:${d.score}%;background:var(--${d.score>=80?'green':d.score>=50?'amber':'red'})"></div>
                </div>
                <b style="width:34px;text-align:right;color:var(--${d.score>=80?'green':d.score>=50?'amber':'red'})">${d.score}%</b>
              </div>`).join('')}
          </div>
          <div style="border-top:1px solid var(--border);padding-top:8px">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Tendencia 6 meses</div>
            <div style="display:flex;align-items:flex-end;gap:5px;height:36px">
              ${hist.map(h=>`
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px" title="${h.lbl}: ${h.score===null?'sin registro':h.score+'%'}">
                  <div style="width:100%;height:${h.score===null?2:Math.max(2,h.score*0.3)}px;border-radius:2px;
                              background:${h.score===null?'var(--surface3)':`var(--${h.score>=80?'green':h.score>=50?'amber':'red'})`}"></div>
                  <span style="font-size:8px;color:var(--text3)">${h.lbl}</span>
                </div>`).join('')}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  },

  async detalleEmpleado(empId) {
    const e = this._empleados.find(x=>x.id===empId);
    if (!e) return;
    const { mes, anio, ini, fin } = this._rangoMes();
    const cfg = this._cfgProd || await DB.getConfigProductividad();
    const [ordenes, registros] = await Promise.all([
      DB.getOrdenesPeriodo(ini, fin), DB.getKpiEmpleados(mes, anio)
    ]);
    const rec = registros.find(r=>r.empleado_id===empId);
    const { detail, score } = this._kpiScores(e, ordenes, rec?.manual||{}, cfg);
    const hh = calcularHoraHombre(e.salario_base, cfg);
    const bono = this._calcBono(e.salario_base, score, cfg);
    const nombreMes = new Date(anio, mes-1, 1).toLocaleDateString('es-GT',{month:'long',year:'numeric'});

    UI.modal(`📈 ${e.nombre} — ${nombreMes}`, `
      <!-- Costeo hora-hombre -->
      <div class="card card-cyan" style="margin-bottom:14px">
        <div style="font-weight:700;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">💰 Costo laboral (cargado)</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;font-size:12px">
          <span class="text-muted">Salario base</span><span style="text-align:right">${UI.q(hh.salario)}</span>
          <span class="text-muted">Bonificación incentivo</span><span style="text-align:right">${UI.q(hh.bonificacion)}</span>
          <span class="text-muted">Cargas (IGSS+IRTRA+INTECAP)</span><span style="text-align:right">${UI.q(hh.cargas)}</span>
          <span class="text-muted">Aguinaldo + Bono14</span><span style="text-align:right">${UI.q(hh.aguinaldo+hh.bono14)}</span>
          <span class="text-muted">Vacaciones + Indemnización</span><span style="text-align:right">${UI.q(hh.vacaciones+hh.indemnizacion)}</span>
          <span style="font-weight:800;border-top:1px solid var(--border);padding-top:4px">Costo mensual</span><span style="text-align:right;font-weight:800;border-top:1px solid var(--border);padding-top:4px">${UI.q(hh.costoMensual)}</span>
          <span style="font-weight:800;color:var(--cyan)">Hora-hombre (${hh.horasMes} h)</span><span style="text-align:right;font-weight:800;color:var(--cyan)">${UI.q(hh.horaHombre)}</span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:6px">Factor de carga: +${Math.round(hh.factorCarga*100)}% sobre el salario base.</div>
      </div>

      <!-- KPIs -->
      <div style="font-weight:700;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">📊 KPIs del mes</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${detail.map(d=>`
          <div style="background:var(--surface2);border-radius:8px;padding:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px">
              <span style="font-weight:700">${d.label} <span style="font-size:11px;color:var(--text3)">· peso ${d.peso}%</span></span>
              <span style="font-weight:800;color:var(--${d.score>=80?'green':d.score>=50?'amber':'red'})">${d.score}%</span>
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${d.valor}</div>
            ${d.tipo==='manual'?`<input type="range" min="0" max="100" value="${d.score}" id="kpi-${d.id}" style="width:100%;margin-top:6px;accent-color:var(--amber)" oninput="this.nextElementSibling.textContent=this.value+'%'"><span style="font-size:11px;color:var(--amber)">${d.score}%</span>`:''}
          </div>`).join('')}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;background:var(--amber-dim);border-radius:8px;padding:12px;margin-top:14px">
        <div><div style="font-size:11px;color:var(--text3)">Score ponderado</div><div style="font-size:22px;font-weight:800" id="det-score">${score}%</div></div>
        <div style="text-align:right"><div style="font-size:11px;color:var(--text3)">Bono estimado</div><div style="font-size:22px;font-weight:800;color:var(--amber)" id="det-bono">${UI.q(bono)}</div></div>
      </div>
      ${rec?.aprobado?'<div class="alert alert-green" style="margin-top:10px"><div class="alert-icon">✅</div><div class="alert-body" style="font-size:11px">Bono ya aprobado y cargado a egresos.</div></div>':''}

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        <button class="btn btn-cyan" onclick="Modulos.rrhh.guardarKpiManual('${empId}')">💾 Guardar</button>
        ${rec?.aprobado?'':`<button class="btn btn-amber" onclick="Modulos.rrhh.aprobarBono('${empId}')">✓ Aprobar bono</button>`}
      </div>`, '560px');
  },

  /* Lee los KPIs manuales del modal de detalle (lista de KPIs del empleado) */
  _leerManual(kpis) {
    const manual = {};
    (kpis||[]).filter(k=>k.tipo==='manual').forEach(k=>{
      const inp = document.getElementById('kpi-'+k.id);
      if (inp) manual[k.id] = parseInt(inp.value)||0;
    });
    return manual;
  },

  async guardarKpiManual(empId) {
    const e = this._empleados.find(x=>x.id===empId);
    const { mes, anio, ini, fin } = this._rangoMes();
    const cfg = this._cfgProd || await DB.getConfigProductividad();
    const manual = this._leerManual(this._kpisDe(e, cfg));
    const ordenes = await DB.getOrdenesPeriodo(ini, fin);
    const { score } = this._kpiScores(e, ordenes, manual, cfg);
    const bono = this._calcBono(e.salario_base, score, cfg);
    const { error } = await DB.upsertKpiEmpleado({
      empleado_id: empId, periodo_mes: mes, periodo_anio: anio, manual, score, bono
    });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('KPIs guardados ✓'); this._renderTab();
  },

  async aprobarBono(empId) {
    const e = this._empleados.find(x=>x.id===empId);
    const { mes, anio, ini, fin } = this._rangoMes();
    const cfg = this._cfgProd || await DB.getConfigProductividad();
    const registros = await DB.getKpiEmpleados(mes, anio);
    const rec = registros.find(r=>r.empleado_id===empId);
    if (rec?.aprobado) { UI.toast('Este bono ya fue aprobado','info'); return; }
    /* Tomar KPIs manuales del modal si está abierto, si no del registro */
    const manual = document.querySelector('input[id^="kpi-"]') !== null
      ? this._leerManual(this._kpisDe(e, cfg)) : (rec?.manual || {});
    const ordenes = await DB.getOrdenesPeriodo(ini, fin);
    const { score } = this._kpiScores(e, ordenes, manual, cfg);
    const bono = this._calcBono(e.salario_base, score, cfg);
    const nombreMes = new Date(anio, mes-1, 1).toLocaleDateString('es-GT',{month:'long',year:'numeric'});

    const ok = await UI.confirmar(`¿Aprobar bono de <b>${e.nombre}</b> por <b>${UI.q(bono)}</b> (score ${score}%) de ${nombreMes}?<br>Se registrará como egreso.`, 'Aprobar');
    if (!ok) return;

    const { error } = await DB.upsertKpiEmpleado({
      empleado_id: empId, periodo_mes: mes, periodo_anio: anio, manual, score, bono, aprobado: true
    });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    if (bono > 0) {
      await DB.upsertEgreso({
        concepto:  `Bono productividad ${nombreMes} — ${e.nombre}`,
        monto:     bono, categoria: 'Bonos',
        fecha:     fin,
        referencia:`BONO-${empId.slice(0,8)}-${mes}-${anio}`
      });
    }
    UI.cerrarModal();
    UI.toast(`Bono aprobado y cargado a egresos ✓`);
    this._renderTab();
  },

  async eliminarKpi(id) {
    const ok = await UI.confirmar('¿Eliminar el registro de KPI/bono de este empleado para el mes?<br>No revierte el egreso si ya fue aprobado.', 'Eliminar');
    if (!ok) return;
    const exito = await DB.deleteRegistro('kpi_empleado', id);
    if (exito) { UI.toast('Registro eliminado ✓'); this._renderTab(); }
    else UI.toast('No se pudo eliminar','error');
  },

  modalConfigProductividad() {
    const cfg = this._cfgProd || PRODUCTIVIDAD_DEFAULTS;
    const p = cfg.provisiones||{};
    UI.modal('⚙️ Criterios de Productividad', `
      <div style="font-weight:700;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Hora-hombre</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Horas laborales / mes</label>
          <input class="form-input" id="cfg-horas" type="number" value="${cfg.horas_mes||240}" min="1"></div>
        <div class="form-group"><label class="form-label">Bono máximo (% del salario)</label>
          <input class="form-input" id="cfg-bonomax" type="number" value="${cfg.bono_max_pct||30}" min="0" step="1"></div>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Provisiones incluidas en el costo:</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:6px">
        ${[['aguinaldo','Aguinaldo'],['bono14','Bono 14'],['vacaciones','Vacaciones'],['indemnizacion','Indemnización (Art.82)']].map(([k,l])=>`
          <label style="display:flex;align-items:center;gap:8px;background:var(--surface2);border-radius:8px;padding:8px;font-size:12px;cursor:pointer">
            <input type="checkbox" id="cfg-prov-${k}" ${p[k]!==false?'checked':''}> ${l}
          </label>`).join('')}
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;margin-bottom:14px">
        <input type="checkbox" id="cfg-indbonif" ${cfg.incluir_bonificacion_en_indemnizacion!==false?'checked':''}>
        Incluir bonificación en la base de indemnización (jurisprudencia GT)
      </label>

      <div style="font-weight:700;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;border-top:1px solid var(--border);padding-top:12px">KPIs por rol (los pesos de cada rol deben sumar 100%)</div>
      <select class="form-select" id="cfg-rol" style="margin-bottom:8px" onchange="Modulos.rrhh._cambiarCfgRol(this.value)">
        ${Object.entries(KPIS_ROL_LABELS).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}
      </select>
      <div id="cfg-kpis" style="display:flex;flex-direction:column;gap:6px"></div>
      <div style="display:flex;gap:6px;margin-top:8px;align-items:center">
        <input class="form-input" id="cfg-nuevo-kpi" placeholder="KPI personalizado (ej. Puntualidad, 5S del área...)" style="flex:1">
        <button class="btn btn-cyan btn-sm" onclick="Modulos.rrhh._agregarKpiCustom()">➕ Agregar</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">Los KPIs personalizados se evalúan manualmente (0-100) en la ficha de cada empleado.</div>

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh.guardarConfigProductividad()">Guardar criterios</button>
      </div>`, '560px');

    /* Copia editable de los KPIs de los 4 grupos (override del tenant o plantilla) */
    this._kpisEdit = {};
    Object.keys(KPIS_POR_ROL).forEach(g => {
      const src = cfg.kpis_rol?.[g]?.length ? cfg.kpis_rol[g]
        : (g === 'mecanico' && cfg.kpis?.length ? cfg.kpis : KPIS_POR_ROL[g]);
      this._kpisEdit[g] = src.map(k => ({ ...k }));
    });
    this._cfgRol = 'mecanico';
    this._renderCfgKpis();
  },

  /* Vuelca los inputs del grupo visible a la copia editable */
  _syncCfgKpis() {
    (this._kpisEdit?.[this._cfgRol] || []).forEach(k => {
      const peso = document.getElementById('cfg-peso-'+k.id);
      const meta = document.getElementById('cfg-meta-'+k.id);
      if (peso) k.peso = parseInt(peso.value)||0;
      if (meta && k.meta !== undefined) k.meta = parseFloat(meta.value)||k.meta;
    });
  },

  _cambiarCfgRol(rol) { this._syncCfgKpis(); this._cfgRol = rol; this._renderCfgKpis(); },

  _renderCfgKpis() {
    const el = document.getElementById('cfg-kpis');
    if (!el) return;
    const kpis = this._kpisEdit[this._cfgRol] || [];
    el.innerHTML = kpis.map(k=>`
      <div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border-radius:8px;padding:8px">
        <span style="flex:1;font-size:12px">${k.label}
          <span style="color:var(--text3)">(${k.tipo==='manual'?'manual':'auto'}${k.scope==='taller'?' · taller':''})</span></span>
        ${k.meta!==undefined?`<input class="form-input" style="width:90px" type="number" id="cfg-meta-${k.id}" value="${k.meta}" title="Meta" placeholder="meta">`:''}
        <input class="form-input" style="width:70px" type="number" id="cfg-peso-${k.id}" value="${k.peso}" min="0" max="100"> <span style="font-size:12px;color:var(--text3)">%</span>
        ${String(k.id).startsWith('custom_')?`<button class="btn btn-sm btn-danger" title="Quitar KPI personalizado" onclick="Modulos.rrhh._quitarKpiCustom('${k.id}')">✕</button>`:''}
      </div>`).join('');
    const suma = kpis.reduce((s,k)=>s+(Number(k.peso)||0),0);
    el.innerHTML += `<div style="font-size:11px;color:var(--${suma===100?'green':'amber'});text-align:right">Suma de pesos: ${suma}%</div>`;
  },

  _agregarKpiCustom() {
    const inp = document.getElementById('cfg-nuevo-kpi');
    const label = inp?.value.trim();
    if (!label) { UI.toast('Escribe el nombre del KPI','error'); return; }
    this._syncCfgKpis();
    const id = 'custom_' + label.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,30);
    if (this._kpisEdit[this._cfgRol].some(k=>k.id===id)) { UI.toast('Ya existe un KPI con ese nombre','error'); return; }
    this._kpisEdit[this._cfgRol].push({ id, label, peso: 10, tipo: 'manual' });
    if (inp) inp.value = '';
    this._renderCfgKpis();
  },

  _quitarKpiCustom(id) {
    this._syncCfgKpis();
    this._kpisEdit[this._cfgRol] = this._kpisEdit[this._cfgRol].filter(k=>k.id!==id);
    this._renderCfgKpis();
  },

  async guardarConfigProductividad() {
    const base = this._cfgProd || PRODUCTIVIDAD_DEFAULTS;
    this._syncCfgKpis();
    const kpis_rol = this._kpisEdit;
    const desbalance = Object.entries(kpis_rol)
      .map(([g,ks])=>({ g, suma: ks.reduce((s,k)=>s+(Number(k.peso)||0),0) }))
      .filter(x=>x.suma!==100);
    if (desbalance.length) {
      const det = desbalance.map(x=>`${KPIS_ROL_LABELS[x.g]||x.g}: ${x.suma}%`).join(' · ');
      const seguir = await UI.confirmar(`Hay roles cuyos pesos no suman 100% (${det}). El score se normaliza igual. ¿Guardar de todas formas?`, 'Guardar');
      if (!seguir) return;
    }
    const settings = {
      ...base,
      horas_mes: parseInt(document.getElementById('cfg-horas')?.value)||240,
      bono_max_pct: parseFloat(document.getElementById('cfg-bonomax')?.value)||0,
      incluir_bonificacion_en_indemnizacion: document.getElementById('cfg-indbonif')?.checked,
      provisiones: {
        aguinaldo:     document.getElementById('cfg-prov-aguinaldo')?.checked,
        bono14:        document.getElementById('cfg-prov-bono14')?.checked,
        vacaciones:    document.getElementById('cfg-prov-vacaciones')?.checked,
        indemnizacion: document.getElementById('cfg-prov-indemnizacion')?.checked
      },
      kpis_rol,
      kpis: kpis_rol.mecanico   /* compat con código/datos previos */
    };
    const ok = await DB.saveConfigProductividad(settings);
    if (!ok) { UI.toast('Error al guardar la configuración','error'); return; }
    this._cfgProd = { ...PRODUCTIVIDAD_DEFAULTS, ...settings };
    UI.cerrarModal(); UI.toast('Criterios actualizados ✓'); this._renderTab();
  },

  /* ══ CAPACITACIÓN: entrenamientos / seminarios / cursos ══ */
  _capFiltroEmp: '',
  _capCertificado: null,

  async _renderCapacitacion(el) {
    const cursos = await DB.getEntrenamientos();
    const lista = this._capFiltroEmp ? cursos.filter(c=>c.empleado_id===this._capFiltroEmp) : cursos;
    const anio = new Date().getFullYear();
    const delAnio = cursos.filter(c=>(c.fecha_inicio||'').startsWith(String(anio)));
    const horas = delAnio.reduce((s,c)=>s+(Number(c.horas)||0),0);
    const inversion = delAnio.reduce((s,c)=>s+(Number(c.costo)||0),0);

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <select class="form-select" style="width:auto" onchange="Modulos.rrhh._capFiltroEmp=this.value;Modulos.rrhh._renderTab()">
          <option value="">Todos los empleados</option>
          ${this._empleados.map(e=>`<option value="${e.id}" ${this._capFiltroEmp===e.id?'selected':''}>${e.nombre}</option>`).join('')}
        </select>
        <button class="btn btn-amber" onclick="Modulos.rrhh.modalCapacitacion()">＋ Registrar capacitación</button>
      </div>
      <div class="kpi-grid" style="margin-bottom:16px">
        ${UI.kpiCard({ icon:'🎓', clase:'cyan', label:`Capacitaciones ${anio}`, value: delAnio.length })}
        ${UI.kpiCard({ icon:'⏱️', clase:'green', label:'Horas de formación', value: horas, trend:'este año' })}
        ${UI.kpiCard({ icon:'💰', clase:'amber', label:'Inversión', value: inversion, money:true, trend:'este año' })}
        ${UI.kpiCard({ icon:'📜', clase:'purple', label:'Con certificado', value: cursos.filter(c=>c.certificado).length })}
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Empleado</th><th>Capacitación</th><th>Modalidad</th><th>Fechas</th><th>Horas</th><th>Costo</th><th>Resultado</th><th>Acciones</th></tr></thead>
        <tbody>${lista.map(c=>`<tr>
          <td><b>${c.empleados?.nombre||'—'}</b><div style="font-size:10px;color:var(--text3)">${c.empleados?.cargo||''}</div></td>
          <td>${c.titulo}<div style="font-size:10px;color:var(--text3)">${c.instructor?'Por: '+c.instructor:''}</div></td>
          <td><span class="badge badge-cyan" style="font-size:10px">${c.tipo||'Curso'}</span></td>
          <td class="mono-sm">${UI.fecha(c.fecha_inicio)}${c.fecha_fin?' → '+UI.fecha(c.fecha_fin):''}</td>
          <td class="mono-sm" style="text-align:center">${c.horas||'—'}</td>
          <td class="mono-sm text-amber">${c.costo?UI.q(c.costo):'—'}</td>
          <td><span class="badge badge-${c.resultado==='Aprobado'||c.resultado==='Completado'?'green':c.resultado==='Reprobado'?'red':'amber'}">${c.resultado||'En curso'}</span></td>
          <td><div style="display:flex;gap:4px">
            ${c.certificado?`<button class="btn btn-sm btn-cyan" title="Ver certificado" onclick="UI.verAdjunto(Modulos.rrhh._certDe('${c.id}'),'🎓 Certificado')">🎓</button>`:''}
            ${Modulos.btnAccion('editar', `Modulos.rrhh.modalCapacitacion('${c.id}')`)}
            ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('entrenamientos','${c.id}','esta capacitación',()=>Modulos.rrhh._renderTab())`)}
          </div></td>
        </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin capacitaciones registradas</td></tr>'}</tbody>
      </table></div>`;
    this._cursosCache = cursos;
  },

  _certDe(id) { return (this._cursosCache||[]).find(c=>c.id===id)?.certificado || null; },

  async modalCapacitacion(id=null) {
    const c = id ? (this._cursosCache||[]).find(x=>x.id===id)||{} : {};
    this._capCertificado = null;
    UI.modal(`${id?'✏️ Editar':'🎓 Registrar'} capacitación`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Empleado *</label>
          <select class="form-select" id="cap-emp">
            ${this._empleados.filter(e=>e.activo||e.id===c.empleado_id).map(e=>`<option value="${e.id}" ${c.empleado_id===e.id?'selected':''}>${e.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Modalidad</label>
          <select class="form-select" id="cap-tipo">
            ${['Curso en línea','Seminario','Entrenamiento','Taller','Certificación','Diplomado'].map(t=>`<option ${c.tipo===t?'selected':''}>${t}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Título / Tema *</label>
        <input class="form-input" id="cap-titulo" value="${c.titulo||''}" placeholder="Diagnóstico de inyección electrónica"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Inicio *</label>
          <input class="form-input" id="cap-ini" type="date" value="${c.fecha_inicio||new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Fin</label>
          <input class="form-input" id="cap-fin" type="date" value="${c.fecha_fin||''}"></div>
        <div class="form-group"><label class="form-label">Horas</label>
          <input class="form-input" id="cap-horas" type="number" min="0" step="0.5" value="${c.horas||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Instructor / Entidad</label>
          <input class="form-input" id="cap-inst" value="${c.instructor||''}" placeholder="INTECAP, Bosch, Udemy..."></div>
        <div class="form-group"><label class="form-label">Costo (Q)</label>
          <input class="form-input" id="cap-costo" type="number" min="0" step="0.01" value="${c.costo||''}"></div>
        <div class="form-group"><label class="form-label">Resultado</label>
          <select class="form-select" id="cap-res">
            ${['En curso','Completado','Aprobado','Reprobado'].map(r=>`<option ${(c.resultado||'En curso')===r?'selected':''}>${r}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Certificado / Diploma (jpg o pdf)</label>
        <input class="form-input" type="file" accept="image/*,application/pdf" onchange="Modulos.rrhh._onCertificado(this)">
        <div id="cap-cert-info" style="font-size:11px;color:var(--text3);margin-top:4px">${c.certificado?'📎 Ya tiene certificado adjunto (subir otro lo reemplaza)':''}</div></div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="cap-notas" rows="2">${c.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh.guardarCapacitacion('${id||''}')">Guardar</button>
      </div>`, '600px');
  },

  _onCertificado(input) {
    const f = input.files?.[0];
    if (!f) { this._capCertificado = null; return; }
    UI.fileABase64(f, { maxPx: 1400 }).then(r => {
      this._capCertificado = r.base64;
      const i = document.getElementById('cap-cert-info'); if (i) i.textContent = '✓ ' + r.nombre;
    }).catch(e => { UI.toast(e.message,'error'); input.value=''; });
  },

  async guardarCapacitacion(id='') {
    const titulo = document.getElementById('cap-titulo')?.value.trim();
    const empleado_id = document.getElementById('cap-emp')?.value;
    if (!titulo || !empleado_id) { UI.toast('Empleado y título son obligatorios','error'); return; }
    const fields = {
      empleado_id, titulo,
      tipo:         document.getElementById('cap-tipo')?.value,
      fecha_inicio: document.getElementById('cap-ini')?.value||null,
      fecha_fin:    document.getElementById('cap-fin')?.value||null,
      horas:        parseFloat(document.getElementById('cap-horas')?.value)||null,
      instructor:   document.getElementById('cap-inst')?.value||null,
      costo:        parseFloat(document.getElementById('cap-costo')?.value)||null,
      resultado:    document.getElementById('cap-res')?.value,
      notas:        document.getElementById('cap-notas')?.value||null
    };
    if (this._capCertificado) fields.certificado = this._capCertificado;
    if (id) fields.id = id;
    const { error } = await DB.upsertEntrenamiento(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('Capacitación guardada ✓');
    this._renderTab();
  },

  /* ══ ASIGNACIONES: licencias, apps, herramientas y vehículos
     entregados al empleado, con acta de entrega firmable ══ */
  _asigFiltroEmp: '',
  _asigFotos: [],
  _asigTipos: { herramienta:'🛠️ Herramienta', vehiculo:'🚗 Vehículo', licencia:'📜 Licencia', aplicacion:'📱 Aplicación / Acceso', equipo:'💻 Equipo', otro:'📦 Otro' },

  async _renderAsignaciones(el) {
    const asigs = await DB.getAsignaciones();
    this._asigsCache = asigs;
    const lista = this._asigFiltroEmp ? asigs.filter(a=>a.empleado_id===this._asigFiltroEmp) : asigs;
    const activas = asigs.filter(a=>a.estado==='asignado');

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <select class="form-select" style="width:auto" onchange="Modulos.rrhh._asigFiltroEmp=this.value;Modulos.rrhh._renderTab()">
          <option value="">Todos los empleados</option>
          ${this._empleados.map(e=>`<option value="${e.id}" ${this._asigFiltroEmp===e.id?'selected':''}>${e.nombre}</option>`).join('')}
        </select>
        <button class="btn btn-amber" onclick="Modulos.rrhh.modalAsignacion()">＋ Nueva entrega</button>
      </div>
      <div class="kpi-grid" style="margin-bottom:16px">
        ${UI.kpiCard({ icon:'🧰', clase:'cyan', label:'Asignaciones activas', value: activas.length })}
        ${UI.kpiCard({ icon:'✍️', clase: activas.filter(a=>!a.firma_fecha).length?'red':'gray', label:'Sin firma de recibido', value: activas.filter(a=>!a.firma_fecha).length })}
        ${UI.kpiCard({ icon:'🚗', clase:'amber', label:'Vehículos entregados', value: activas.filter(a=>a.tipo==='vehiculo').length })}
        ${UI.kpiCard({ icon:'↩️', clase:'gray', label:'Devueltas', value: asigs.filter(a=>a.estado==='devuelto').length })}
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Empleado</th><th>Tipo</th><th>Descripción</th><th>Entrega</th><th>Firma de recibido</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>${lista.map(a=>{
          const esMia = Auth.user?.email && a.empleados?.email && Auth.user.email.toLowerCase()===a.empleados.email.toLowerCase();
          return `<tr style="${a.estado==='devuelto'?'opacity:.6':''}">
            <td><b>${a.empleados?.nombre||'—'}</b><div style="font-size:10px;color:var(--text3)">${a.empleados?.cargo||''}</div></td>
            <td><span class="badge badge-cyan" style="font-size:10px">${this._asigTipos[a.tipo]||a.tipo}</span></td>
            <td>${a.descripcion}<div style="font-size:10px;color:var(--text3)">${a.identificador||''} ${(a.fotos||[]).length?`· 📷 ${(a.fotos||[]).length}`:''}</div></td>
            <td class="mono-sm">${UI.fecha(a.fecha_entrega)}</td>
            <td>${a.firma_fecha
              ? `<span class="badge badge-green" style="font-size:10px">✍️ ${a.firma_tipo==='digital'?'Digital':'En papel'} · ${a.firma_nombre||''}</span>`
              : `<span class="badge badge-red" style="font-size:10px">Sin firmar</span>`}</td>
            <td><span class="badge badge-${a.estado==='asignado'?'amber':'gray'}">${a.estado==='asignado'?'Asignado':'Devuelto '+(a.fecha_devolucion?UI.fecha(a.fecha_devolucion):'')}</span></td>
            <td><div style="display:flex;gap:4px;flex-wrap:wrap">
              <button class="btn btn-sm btn-cyan" title="Ver / imprimir acta" onclick="Modulos.rrhh.imprimirActa('${a.id}')">🖨️ Acta</button>
              ${!a.firma_fecha ? `<button class="btn btn-sm btn-green" title="${esMia?'Firmar de recibido con tu usuario':'Marcar firmada (acta impresa)'}" onclick="Modulos.rrhh.firmarAsignacion('${a.id}')">✍️</button>` : ''}
              ${a.estado==='asignado' ? `<button class="btn btn-sm btn-ghost" title="Registrar devolución" onclick="Modulos.rrhh.devolverAsignacion('${a.id}')">↩️</button>` : ''}
              ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('empleado_asignaciones','${a.id}','esta asignación',()=>Modulos.rrhh._renderTab())`)}
            </div></td>
          </tr>`;}).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin asignaciones registradas</td></tr>'}</tbody>
      </table></div>
      <div class="alert alert-cyan" style="margin-top:12px">
        <div class="alert-icon">✍️</div>
        <div class="alert-body" style="font-size:12px">El empleado puede <b>firmar de recibido con su usuario</b> (firma digital con fecha y hora) o puedes <b>imprimir el acta</b> para firma física y marcarla firmada. Adjunta fotos del estado al entregar — valen oro al recibir de vuelta.</div>
      </div>`;
  },

  modalAsignacion() {
    this._asigFotos = [];
    UI.modal('🔑 Nueva entrega al empleado', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Empleado *</label>
          <select class="form-select" id="asig-emp">
            ${this._empleados.filter(e=>e.activo).map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Tipo *</label>
          <select class="form-select" id="asig-tipo">
            ${Object.entries(this._asigTipos).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Descripción del bien / acceso *</label>
        <input class="form-input" id="asig-desc" placeholder="Caja de herramientas Stanley 150 pzs / Pickup Toyota Hilux / Licencia Office 365"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Identificador (serie, placa, usuario)</label>
          <input class="form-input" id="asig-ident" placeholder="No. serie / P-123ABC / usuario@app"></div>
        <div class="form-group"><label class="form-label">Fecha de entrega</label>
          <input class="form-input" id="asig-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="form-group"><label class="form-label">Estado al entregar</label>
        <textarea class="form-input" id="asig-estado" rows="2" placeholder="Nuevo / Usado en buen estado, rayón en puerta izquierda..."></textarea></div>
      <div class="form-group"><label class="form-label">Fotos del estado (hasta 4)</label>
        <div style="display:flex;gap:6px">
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('asig-foto-cam').click()">📷 Tomar foto</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('asig-foto-file').click()">📁 Subir fotos</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Modulos.rrhh._limpiarFotosAsig()">🗑️</button>
        </div>
        <input type="file" id="asig-foto-cam" accept="image/*" capture="environment" style="display:none" onchange="Modulos.rrhh._onFotosAsig(this)">
        <input type="file" id="asig-foto-file" accept="image/*" multiple style="display:none" onchange="Modulos.rrhh._onFotosAsig(this)">
        <div id="asig-fotos-prev" style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"></div></div>
      <div class="form-group"><label class="form-label">Notas / condiciones</label>
        <textarea class="form-input" id="asig-notas" rows="2" placeholder="Uso exclusivo laboral, devolución al terminar la relación laboral..."></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh.guardarAsignacion()">Registrar entrega</button>
      </div>`, '620px');
  },

  /* Acumula fotos (la cámara entrega una a la vez); máximo 4 */
  async _onFotosAsig(input) {
    const files = Array.from(input.files||[]);
    for (const f of files) {
      if (this._asigFotos.length >= 4) { UI.toast('Máximo 4 fotos','error'); break; }
      try { this._asigFotos.push((await UI.fileABase64(f, { maxPx: 900, calidad: 0.75 })).base64); }
      catch(e) { UI.toast(e.message,'error'); }
    }
    input.value = '';
    this._pintarFotosAsig();
  },

  _limpiarFotosAsig() { this._asigFotos = []; this._pintarFotosAsig(); },

  _pintarFotosAsig() {
    const prev = document.getElementById('asig-fotos-prev');
    if (prev) prev.innerHTML = this._asigFotos.map(b=>`<img src="${b}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">`).join('')
      || '<span style="font-size:11px;color:var(--text3)">Sin fotos aún</span>';
  },

  async guardarAsignacion() {
    const empleado_id = document.getElementById('asig-emp')?.value;
    const descripcion = document.getElementById('asig-desc')?.value.trim();
    if (!empleado_id || !descripcion) { UI.toast('Empleado y descripción son obligatorios','error'); return; }
    const { error } = await DB.upsertAsignacion({
      empleado_id, descripcion,
      tipo: document.getElementById('asig-tipo')?.value||'herramienta',
      identificador: document.getElementById('asig-ident')?.value||null,
      fecha_entrega: document.getElementById('asig-fecha')?.value||new Date().toISOString().slice(0,10),
      estado_entrega: document.getElementById('asig-estado')?.value||null,
      fotos: this._asigFotos.length ? this._asigFotos : null,
      notas: document.getElementById('asig-notas')?.value||null,
      estado: 'asignado'
    });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('Entrega registrada ✓ — imprime el acta o pide la firma digital');
    this._renderTab();
  },

  async firmarAsignacion(id) {
    const a = (this._asigsCache||[]).find(x=>x.id===id); if (!a) return;
    const esMia = Auth.user?.email && a.empleados?.email && Auth.user.email.toLowerCase()===a.empleados.email.toLowerCase();
    if (esMia) {
      const ok = await UI.confirmar(
        `<b>Firma digital de recibido</b><br><br>Yo, <b>${a.empleados?.nombre}</b>, confirmo que recibí
        <b>${a.descripcion}</b>${a.identificador?` (${a.identificador})`:''} en el estado descrito,
        y me comprometo a su cuidado y devolución conforme a las condiciones indicadas.<br><br>
        La firma quedará registrada con tu usuario, fecha y hora.`, '✍️ Firmar de recibido');
      if (!ok) return;
      const { error } = await DB.upsertAsignacion({
        id, firma_tipo:'digital', firmado_por: Auth.user.id,
        firma_nombre: Auth.user.nombre || Auth.user.email, firma_fecha: new Date().toISOString()
      });
      if (error) { UI.toast('Error: '+error.message,'error'); return; }
      UI.toast('Firmado de recibido ✓');
    } else {
      const ok = await UI.confirmar(
        `¿Marcar esta entrega como <b>firmada en papel</b> por <b>${a.empleados?.nombre}</b>?<br>
        <span style="font-size:11px;color:var(--text3)">Úsalo cuando el acta impresa ya fue firmada físicamente. Si el empleado tiene usuario, lo ideal es que firme digitalmente al ingresar.</span>`, 'Acta en papel');
      if (!ok) return;
      const { error } = await DB.upsertAsignacion({
        id, firma_tipo:'papel', firmado_por: Auth.user.id,
        firma_nombre: a.empleados?.nombre, firma_fecha: new Date().toISOString()
      });
      if (error) { UI.toast('Error: '+error.message,'error'); return; }
      UI.toast('Acta marcada como firmada en papel ✓');
    }
    this._renderTab();
  },

  async devolverAsignacion(id) {
    const a = (this._asigsCache||[]).find(x=>x.id===id); if (!a) return;
    UI.modal('↩️ Registrar devolución', `
      <div style="font-size:13px;margin-bottom:10px"><b>${a.descripcion}</b> — ${a.empleados?.nombre}</div>
      <div class="form-group"><label class="form-label">Fecha de devolución</label>
        <input class="form-input" id="dev-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="form-group"><label class="form-label">Estado al devolver / observaciones</label>
        <textarea class="form-input" id="dev-notas" rows="3" placeholder="Completo y en buen estado / Faltante: ..."></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh._confirmarDevolucion('${id}')">Registrar devolución</button>
      </div>`);
  },

  async _confirmarDevolucion(id) {
    const { error } = await DB.upsertAsignacion({
      id, estado:'devuelto',
      fecha_devolucion: document.getElementById('dev-fecha')?.value||new Date().toISOString().slice(0,10),
      devolucion_notas: document.getElementById('dev-notas')?.value||null
    });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('Devolución registrada ✓');
    this._renderTab();
  },

  /* Acta de entrega formal (imprimible) */
  imprimirActa(id) {
    const a = (this._asigsCache||[]).find(x=>x.id===id); if (!a) return;
    const t = Auth.tenant||{};
    const e = a.empleados||{};
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Acta de entrega</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; color:#111; max-width:720px; margin:30px auto; padding:0 24px; font-size:13px; line-height:1.55; }
        .head { display:flex; align-items:center; gap:14px; border-bottom:2px solid #111; padding-bottom:12px; }
        .head img { width:56px; height:56px; object-fit:contain; }
        h1 { font-size:17px; margin:18px 0 4px; text-align:center; letter-spacing:1px; }
        h2 { font-size:13px; margin:16px 0 6px; border-bottom:1px solid #999; padding-bottom:3px; }
        table { width:100%; border-collapse:collapse; margin:6px 0; }
        td { padding:5px 8px; border:1px solid #ccc; vertical-align:top; }
        td.k { width:32%; background:#f4f4f4; font-weight:bold; }
        .fotos { display:flex; gap:8px; flex-wrap:wrap; margin-top:6px; }
        .fotos img { width:150px; height:112px; object-fit:cover; border:1px solid #999; }
        .firmas { display:flex; gap:40px; margin-top:60px; }
        .firma { flex:1; text-align:center; border-top:1px solid #111; padding-top:6px; font-size:12px; }
        .dig { margin-top:30px; border:1px dashed #16a34a; background:#f0fdf4; padding:10px 14px; font-size:12px; }
        @media print { .noprint { display:none; } }
      </style></head><body>
      <div class="head">
        ${t.logo_base64?`<img src="${t.logo_base64}">`:''}
        <div><b style="font-size:16px">${t.name||'Taller'}</b><br>
        <span style="font-size:11px;color:#555">NIT: ${t.nit||'—'} · Tel: ${t.tel||'—'} · ${t.address||''}</span></div>
      </div>
      <h1>ACTA DE ENTREGA Y RESPONSABILIDAD</h1>
      <div style="text-align:center;font-size:11px;color:#555">${this._asigTipos[a.tipo]||a.tipo} · Fecha de entrega: ${UI.fecha(a.fecha_entrega)}</div>

      <h2>1. Receptor</h2>
      <table>
        <tr><td class="k">Nombre del empleado</td><td>${e.nombre||'—'}</td></tr>
        <tr><td class="k">DPI</td><td>${e.dpi||'—'}</td></tr>
        <tr><td class="k">Cargo</td><td>${e.cargo||'—'}</td></tr>
      </table>

      <h2>2. Bien o acceso entregado</h2>
      <table>
        <tr><td class="k">Tipo</td><td>${(this._asigTipos[a.tipo]||a.tipo).replace(/^\S+\s/,'')}</td></tr>
        <tr><td class="k">Descripción</td><td>${a.descripcion}</td></tr>
        <tr><td class="k">Identificador (serie/placa/usuario)</td><td>${a.identificador||'—'}</td></tr>
        <tr><td class="k">Estado al entregar</td><td>${a.estado_entrega||'—'}</td></tr>
        ${a.notas?`<tr><td class="k">Condiciones</td><td>${a.notas}</td></tr>`:''}
      </table>
      ${(a.fotos||[]).length?`<h2>3. Registro fotográfico del estado</h2><div class="fotos">${a.fotos.map(f=>`<img src="${f}">`).join('')}</div>`:''}

      <h2>${(a.fotos||[]).length?'4':'3'}. Declaración</h2>
      <p>El receptor declara haber recibido a su entera satisfacción el bien o acceso arriba descrito,
      en el estado indicado, y se compromete a: darle uso exclusivamente laboral, custodiarlo con
      diligencia, reportar de inmediato cualquier daño, pérdida o robo, y devolverlo al término de la
      relación laboral o cuando la empresa lo requiera, en el mismo estado salvo el desgaste normal por uso.</p>

      ${a.firma_fecha && a.firma_tipo==='digital' ? `
        <div class="dig">✍️ <b>Firmado digitalmente</b> por <b>${a.firma_nombre}</b>
        el ${new Date(a.firma_fecha).toLocaleString('es-GT')} mediante su usuario de TallerPro.
        Esta firma electrónica registra fecha, hora e identidad del usuario.</div>
        <div class="firmas"><div class="firma">Entrega — ${t.name||''}</div></div>`
      : `<div class="firmas">
          <div class="firma">${e.nombre||'Empleado'}<br>Recibí conforme</div>
          <div class="firma">Entrega — ${t.name||''}</div>
        </div>`}

      ${a.estado==='devuelto'?`<h2>Devolución</h2>
      <table>
        <tr><td class="k">Fecha de devolución</td><td>${UI.fecha(a.fecha_devolucion)}</td></tr>
        <tr><td class="k">Observaciones</td><td>${a.devolucion_notas||'—'}</td></tr>
      </table>`:''}

      <div class="noprint" style="text-align:center;margin-top:24px">
        <button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer">🖨️ Imprimir</button>
      </div>
      </body></html>`);
    w.document.close();
  },

  _tiposDoc: ['DPI','Pasaporte','Contrato de Trabajo','Carné IGSS','Carné IRTRA','Antecedentes Penales','Antecedentes Policiales','Tarjeta de Salud','Tarjeta de Pulmones','Título Académico','Licencia de Conducir','Otro'],
  _docFile: null,

  /* Clasifica el estado de vencimiento de un documento */
  _estadoDoc(doc) {
    if (!doc) return { color:'gray', txt:'Sin registrar' };
    if (!doc.fecha_vencimiento) return { color:'green', txt:'Vigente' };
    const dias = Math.ceil((new Date(doc.fecha_vencimiento) - new Date()) / 86400000);
    if (dias < 0)  return { color:'red',   txt:`Vencido hace ${Math.abs(dias)} d` };
    if (dias <= 30) return { color:'amber', txt:`Vence en ${dias} d` };
    return { color:'green', txt:`Vence ${UI.fecha(doc.fecha_vencimiento)}` };
  },

  async verDocumentos(empId, nombre) {
    const docs = await DB.getDocumentosEmpleado(empId);
    const filas = this._tiposDoc.map(tipo=>{
      const doc = docs.find(d=>d.tipo===tipo);
      const st = this._estadoDoc(doc);
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;background:var(--surface2);border-radius:8px">
        <div style="min-width:0">
          <div style="font-weight:700;font-size:13px">${tipo} ${doc?.subido?'📎':''}</div>
          <div style="font-size:11px;color:var(--text3)">${doc ? (doc.notas || (doc.fecha_vencimiento?`Vence: ${UI.fecha(doc.fecha_vencimiento)}`:'Sin fecha de vencimiento')) : 'No registrado'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <span class="badge badge-${st.color}">${st.txt}</span>
          <button class="btn btn-sm btn-cyan" onclick="Modulos.rrhh.modalDocumento('${empId}','${tipo}','${doc?.id||''}')">${doc?'✏️':'＋'}</button>
          ${doc?Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('empleado_documentos','${doc.id}','el documento ${tipo}',()=>Modulos.rrhh.verDocumentos('${empId}','${(nombre||'').replace(/'/g,"\\'")}'))`):''}
        </div>
      </div>`;
    }).join('');

    UI.modal(`📄 Expediente — ${nombre}`, `
      <div class="alert alert-cyan" style="margin-bottom:12px">
        <div class="alert-icon">📅</div>
        <div class="alert-body" style="font-size:11px">Define la <b>fecha de vencimiento</b> de cada documento. Los próximos a vencer aparecen en el <b>Calendario</b> para darles seguimiento.</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">${filas}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
      </div>`,'560px');
  },

  modalDocumento(empId, tipo, docId='') {
    UI.modal(`📄 ${tipo}`, `
      <div class="form-group"><label class="form-label">Tipo de documento</label>
        <input class="form-input" id="doc-tipo" value="${tipo}" ${tipo!=='Otro'?'readonly':''} placeholder="Nombre del documento"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha de vencimiento</label>
          <input class="form-input" id="doc-vence" type="date"></div>
        <div class="form-group"><label class="form-label">¿Documento entregado?</label>
          <label style="display:flex;align-items:center;gap:8px;height:40px;padding:0 4px;cursor:pointer">
            <input type="checkbox" id="doc-subido"><span style="font-size:13px">Sí, en el expediente</span>
          </label></div>
      </div>
      <div class="form-group"><label class="form-label">Adjuntar archivo (opcional)</label>
        <input class="form-input" type="file" id="doc-file" accept="image/*,application/pdf" onchange="Modulos.rrhh._onDocFile(this)">
        <div id="doc-file-info" style="font-size:11px;color:var(--text3);margin-top:4px"></div></div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="doc-notas" rows="2" placeholder="No. de documento, observaciones..."></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh.guardarDocumento('${empId}','${docId}')">Guardar</button>
      </div>`);
    this._docFile = null;
    /* Precargar datos si el documento existe */
    if (docId) DB.getDocumentosEmpleado(empId).then(docs=>{
      const d = docs.find(x=>x.id===docId); if (!d) return;
      const set=(id,v)=>{const el=document.getElementById(id); if(el)el.value=v;};
      set('doc-vence', d.fecha_vencimiento||'');
      set('doc-notas', d.notas||'');
      const sub=document.getElementById('doc-subido'); if(sub) sub.checked=!!d.subido;
      if (d.nombre_archivo){ const i=document.getElementById('doc-file-info'); if(i)i.textContent='Archivo actual: '+d.nombre_archivo; }
    });
  },

  _onDocFile(input) {
    const f = input.files?.[0];
    const info = document.getElementById('doc-file-info');
    if (!f) { this._docFile = null; return; }
    if (f.size > 2*1024*1024) { UI.toast('El archivo supera 2MB','error'); input.value=''; return; }
    const reader = new FileReader();
    reader.onload = e => { this._docFile = { nombre:f.name, base64:e.target.result }; if(info) info.textContent='✓ '+f.name; };
    reader.readAsDataURL(f);
  },

  async guardarDocumento(empId, docId='') {
    const tipo = document.getElementById('doc-tipo')?.value.trim();
    if (!tipo) { UI.toast('Indica el tipo de documento','error'); return; }
    const fields = {
      empleado_id:       empId,
      tipo,
      fecha_vencimiento: document.getElementById('doc-vence')?.value || null,
      notas:             document.getElementById('doc-notas')?.value || null,
      subido:            document.getElementById('doc-subido')?.checked || false
    };
    if (docId) fields.id = docId;
    if (this._docFile) { fields.nombre_archivo = this._docFile.nombre; fields.base64 = this._docFile.base64; fields.subido = true; }
    const { error } = await DB.upsertDocumento(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    this._docFile = null;
    UI.cerrarModal(); UI.toast('Documento guardado ✓');
    /* Reabrir el expediente del empleado */
    const emp = this._empleados.find(e=>e.id===empId);
    this.verDocumentos(empId, emp?.nombre||'');
  },

  async guardarPatronalIGSS() {
    const val = document.getElementById('igss-patronal-input')?.value.trim() || null;
    const ok = await DB.updateTenant({ igss_patronal: val });
    if (ok) {
      if (Auth.tenant) Auth.tenant.igss_patronal = val;
      UI.toast('Número Patronal IGSS actualizado ✓');
      this._renderTab();
    } else {
      UI.toast('Error al guardar', 'error');
    }
  },

  async imprimirIGSS() {
    const mes = this._igssMes;
    const anio = this._igssAnio;
    const pagos = await DB.getPagosNomina(mes, anio);
    if (!pagos.length) { UI.toast('No hay datos para imprimir','warn'); return; }

    const win = window.open('', '_blank');
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const periodoStr = `${meses[mes-1]} de ${anio}`;
    const patronal = Auth.tenant?.igss_patronal || '—';
    const nit = Auth.tenant?.nit || '—';
    
    // Totales
    const totalSueldo = pagos.reduce((s, p) => s + (Number(p.salario_base) || 0), 0);
    const totalLaboral = pagos.reduce((s, p) => s + Math.round((Number(p.salario_base) || 0) * 0.0483 * 100) / 100, 0);
    const totalPatIgss = pagos.reduce((s, p) => s + Math.round((Number(p.salario_base) || 0) * 0.1067 * 100) / 100, 0);
    const totalIrtra = pagos.reduce((s, p) => s + Math.round((Number(p.salario_base) || 0) * 0.01 * 100) / 100, 0);
    const totalIntecap = pagos.reduce((s, p) => s + Math.round((Number(p.salario_base) || 0) * 0.01 * 100) / 100, 0);
    const totalPatronal = totalPatIgss + totalIrtra + totalIntecap;
    const granTotal = totalLaboral + totalPatronal;

    win.document.write(`
      <html>
        <head>
          <title>Planilla IGSS - ${periodoStr}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; color: #333; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 18px; color: #000; text-transform: uppercase; }
            .header h2 { margin: 4px 0 0; font-size: 13px; color: #666; font-weight: normal; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid #000; padding-bottom: 10px; }
            .meta-item { font-size: 12px; line-height: 1.5; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; font-size: 11px; }
            th { background-color: #f2f2f2; text-align: left; }
            .text-right { text-align: right; }
            .totals-box { display: flex; justify-content: flex-end; margin-top: 10px; }
            .totals-table { width: 320px; border-collapse: collapse; }
            .totals-table td { font-size: 12px; padding: 6px; border: none; }
            .totals-table tr.total-row { font-weight: bold; border-top: 2px solid #000; }
            .footer-sig { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; }
            .sig-line { border-top: 1px solid #000; width: 200px; margin: 0 auto; padding-top: 5px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Planilla de Contribución IGSS, IRTRA e INTECAP</h1>
            <h2>Declaración de Salarios y Aportes a la Seguridad Social (Guatemala)</h2>
          </div>
          <div class="meta-grid">
            <div class="meta-item">
              <strong>Patrono:</strong> ${Auth.tenant?.name || 'TallerPro'}<br>
              <strong>NIT:</strong> ${nit}<br>
              <strong>No. Patronal IGSS:</strong> ${patronal}
            </div>
            <div class="meta-item" style="text-align: right;">
              <strong>Período:</strong> ${periodoStr}<br>
              <strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-GT')}<br>
              <strong>Deducción Autorizada:</strong> D. 10-2012 (SAT)
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Nombre del Trabajador</th>
                <th>Afiliación IGSS</th>
                <th>DPI</th>
                <th class="text-right">Base Salarial</th>
                <th class="text-right">Retención Lab. (4.83%)</th>
                <th class="text-right">Cuota IGSS (10.67%)</th>
                <th class="text-right">IRTRA (1.00%)</th>
                <th class="text-right">INTECAP (1.00%)</th>
                <th class="text-right">Total Patronal (12.67%)</th>
                <th class="text-right">Total Aporte (17.50%)</th>
              </tr>
            </thead>
            <tbody>
              ${pagos.map(p => {
                const base = Number(p.salario_base) || 0;
                const lab = Math.round(base * 0.0483 * 100) / 100;
                const pat = Math.round(base * 0.1067 * 100) / 100;
                const irtra = Math.round(base * 0.01 * 100) / 100;
                const int = Math.round(base * 0.01 * 100) / 100;
                const totP = pat + irtra + int;
                const totA = lab + totP;
                return `
                  <tr>
                    <td>${p.empleados?.nombre || '—'}</td>
                    <td>${p.empleados?.igss || '—'}</td>
                    <td>${p.empleados?.dpi || '—'}</td>
                    <td class="text-right">Q${base.toFixed(2)}</td>
                    <td class="text-right">Q${lab.toFixed(2)}</td>
                    <td class="text-right">Q${pat.toFixed(2)}</td>
                    <td class="text-right">Q${irtra.toFixed(2)}</td>
                    <td class="text-right">Q${int.toFixed(2)}</td>
                    <td class="text-right">Q${totP.toFixed(2)}</td>
                    <td class="text-right">Q${totA.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
              <tr style="font-weight: bold; background: #f9f9f9;">
                <td colspan="3">TOTALES</td>
                <td class="text-right">Q${totalSueldo.toFixed(2)}</td>
                <td class="text-right">Q${totalLaboral.toFixed(2)}</td>
                <td class="text-right">Q${totalPatIgss.toFixed(2)}</td>
                <td class="text-right">Q${totalIrtra.toFixed(2)}</td>
                <td class="text-right">Q${totalIntecap.toFixed(2)}</td>
                <td class="text-right">Q${totalPatronal.toFixed(2)}</td>
                <td class="text-right">Q${granTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <div class="totals-box">
            <table class="totals-table">
              <tr>
                <td><strong>Masa Salarial Base:</strong></td>
                <td class="text-right">Q${totalSueldo.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Retención Laboral (4.83%):</td>
                <td class="text-right">Q${totalLaboral.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Aporte Patronal Total (12.67%):</td>
                <td class="text-right">Q${totalPatronal.toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td><strong>TOTAL A PAGAR AL IGSS:</strong></td>
                <td class="text-right"><strong>Q${granTotal.toFixed(2)}</strong></td>
              </tr>
            </table>
          </div>

          <div style="margin-top: 30px; font-size: 10px; color: #555; line-height: 1.4; border-top: 1px solid #ddd; padding-top: 10px;">
            <strong>Nota de Deducibilidad del ISR:</strong> El gasto por sueldos y salarios, así como la contribución patronal al IGSS, IRTRA e INTECAP son costos deducibles para el cálculo del Impuesto Sobre la Renta, conforme al artículo 21, numeral 4 del Libro I del Decreto 10-2012 del Congreso de la República (Ley de Actualización Tributaria de Guatemala). Para su validez, esta planilla debe estar efectivamente pagada y respaldada por las constancias de aportes respectivos.
          </div>

          <div class="footer-sig">
            <div>
              <div class="sig-line">Preparado por Contabilidad</div>
            </div>
            <div>
              <div class="sig-line">Firma y Sello Representante Legal</div>
            </div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  },

  async iniciarCamara() {
    const box = document.getElementById('emp-camera-box');
    const video = document.getElementById('emp-camera-video');
    if (!box || !video) return;

    try {
      box.style.display = 'block';
      this._cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' }
      });
      video.srcObject = this._cameraStream;
    } catch (err) {
      console.error(err);
      UI.toast('No se pudo acceder a la cámara. Revisa los permisos.', 'error');
      box.style.display = 'none';
    }
  },

  detenerCamara() {
    const box = document.getElementById('emp-camera-box');
    if (box) box.style.display = 'none';

    if (this._cameraStream) {
      this._cameraStream.getTracks().forEach(track => track.stop());
      this._cameraStream = null;
    }
    const video = document.getElementById('emp-camera-video');
    if (video) video.srcObject = null;
  },

  capturarFotoCamara() {
    const video = document.getElementById('emp-camera-video');
    const canvas = document.getElementById('emp-camera-canvas');
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = 300;
    canvas.height = 375; // Formato vertical 4:5

    const videoWidth = video.videoWidth || 320;
    const videoHeight = video.videoHeight || 240;
    
    // Recorte vertical centrado
    const sw = videoHeight * 0.8;
    const sh = videoHeight;
    const sx = (videoWidth - sw) / 2;
    const sy = 0;

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    this._tempFoto = dataUrl;

    const container = document.getElementById('emp-photo-container');
    if (container) {
      container.innerHTML = `<img src="${dataUrl}" id="emp-img-preview" style="width:100%;height:100%;object-fit:cover">`;
    }

    this.detenerCamara();
    UI.toast('Fotografía capturada ✓');
  },

  subirFotoEmpleado(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { UI.toast('El archivo debe ser una imagen', 'error'); return; }

    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 375;
        const ctx = canvas.getContext('2d');

        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;
        ctx.drawImage(img, x, y, w, h);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        this._tempFoto = dataUrl;

        const container = document.getElementById('emp-photo-container');
        if (container) {
          container.innerHTML = `<img src="${dataUrl}" id="emp-img-preview" style="width:100%;height:100%;object-fit:cover">`;
        }
        UI.toast('Imagen cargada ✓');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  eliminarFoto() {
    this._tempFoto = '';
    const container = document.getElementById('emp-photo-container');
    if (container) {
      container.innerHTML = `<span id="emp-img-placeholder" style="font-size:48px;color:var(--text3)">👤</span>`;
    }
    UI.toast('Fotografía removida');
  },

  async imprimirCarne(id) {
    const e = this._empleados.find(x => x.id === id);
    if (!e) { UI.toast('Empleado no encontrado', 'error'); return; }

    const tenantName = Auth.tenant?.name || 'TallerPro';
    const fotoSrc = e.foto || '';

    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head>
          <title>Carné - ${e.nombre}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
            @media print {
              body { background: none; padding: 0; margin: 0; }
              .no-print { display: none; }
              .carnes-container { gap: 40px !important; }
            }
            body {
              font-family: 'Outfit', 'Inter', sans-serif;
              background: #f0f2f5;
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 40px 20px;
              margin: 0;
            }
            .no-print-btn {
              background: #f59e0b;
              color: white;
              border: none;
              padding: 10px 20px;
              font-size: 14px;
              font-weight: bold;
              border-radius: 6px;
              cursor: pointer;
              margin-bottom: 30px;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
              transition: background 0.2s;
            }
            .no-print-btn:hover {
              background: #d97706;
            }
            .carnes-container {
              display: flex;
              gap: 30px;
              flex-wrap: wrap;
              justify-content: center;
            }
            .carne-card {
              width: 240px;
              height: 380px;
              background: #ffffff;
              border-radius: 12px;
              box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
              border: 1px solid #e5e7eb;
              display: flex;
              flex-direction: column;
              overflow: hidden;
              position: relative;
              box-sizing: border-box;
            }
            /* Front design */
            .carne-front {
              background: #fff;
            }
            .carne-front .header-band {
              background: linear-gradient(135deg, #1e3a8a, #172554);
              height: 70px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 5px 10px;
              color: white;
              text-align: center;
              position: relative;
            }
            .carne-front .header-band .logo-icon {
              font-size: 20px;
              margin-bottom: 2px;
            }
            .carne-front .header-band .company-name {
              font-size: 13px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              width: 100%;
            }
            .carne-front .header-band .company-sub {
              font-size: 8px;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 0.1em;
            }
            .carne-front .photo-wrap {
              margin-top: 12px;
              margin-bottom: 5px;
              display: flex;
              justify-content: center;
              position: relative;
              z-index: 10;
            }
            .carne-front .photo-frame {
              width: 90px;
              height: 112px;
              border-radius: 8px;
              background: #f3f4f6;
              border: 2px solid #e5e7eb;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .carne-front .photo-frame img {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }
            .carne-front .photo-frame .default-avatar {
              font-size: 50px;
              color: #9ca3af;
            }
            .carne-front .body-content {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 15px;
              text-align: center;
            }
            .carne-front .emp-name {
              font-size: 15px;
              font-weight: 700;
              color: #1f2937;
              margin: 5px 0 2px 0;
              line-height: 1.2;
            }
            .carne-front .emp-cargo {
              font-size: 11px;
              font-weight: 600;
              color: #f59e0b;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              margin-bottom: 15px;
            }
            .carne-front .info-grid {
              width: 100%;
              display: flex;
              flex-direction: column;
              gap: 4px;
              margin-bottom: 10px;
              padding: 0 10px;
              box-sizing: border-box;
            }
            .carne-front .info-row {
              display: flex;
              justify-content: space-between;
              font-size: 10px;
              color: #4b5563;
              border-bottom: 1px solid #f3f4f6;
              padding-bottom: 2px;
            }
            .carne-front .info-label {
              font-weight: 600;
              color: #9ca3af;
            }
            .carne-front .info-value {
              font-weight: 700;
              color: #1f2937;
            }
            /* Mock Barcode */
            .barcode-wrap {
              position: absolute;
              bottom: 15px;
              left: 0;
              right: 0;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 2px;
            }
            .barcode-lines {
              display: flex;
              height: 20px;
              width: 140px;
              background: #fff;
              justify-content: center;
              align-items: stretch;
            }
            .barcode-lines span {
              background: #000;
              margin-right: 1px;
            }
            .barcode-num {
              font-size: 8px;
              font-family: monospace;
              color: #6b7280;
            }

            /* Back design */
            .carne-back {
              display: flex;
              flex-direction: column;
              padding: 20px;
              justify-content: space-between;
              background: #ffffff;
              color: #1f2937;
              border: 1px solid #e5e7eb;
            }
            .carne-back .back-title {
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              color: #d97706;
              border-bottom: 1px solid #e5e7eb;
              padding-bottom: 6px;
              text-align: center;
            }
            .carne-back .back-content {
              flex: 1;
              display: flex;
              flex-direction: column;
              justify-content: center;
              gap: 12px;
              margin: 15px 0;
            }
            .carne-back .back-section-title {
              font-size: 9px;
              font-weight: 700;
              color: #6b7280;
              text-transform: uppercase;
              margin-bottom: 4px;
            }
            .carne-back .back-data {
              font-size: 10px;
              line-height: 1.4;
              background: #f8fafc;
              border-radius: 6px;
              padding: 8px;
              border: 1px solid #e5e7eb;
            }
            .carne-back .back-disclaimer {
              font-size: 7.5px;
              color: #6b7280;
              text-align: center;
              line-height: 1.3;
              border-top: 1px solid #e5e7eb;
              padding-top: 8px;
            }
            .carne-back .back-signature {
              display: flex;
              flex-direction: column;
              align-items: center;
              margin-top: 5px;
            }
            .carne-back .sig-line {
              width: 120px;
              border-top: 1px solid #9ca3af;
              margin-top: 20px;
            }
            .carne-back .sig-text {
              font-size: 7px;
              color: #6b7280;
              margin-top: 3px;
              text-transform: uppercase;
            }
          </style>
        </head>
        <body>
          <button class="no-print-btn" onclick="window.print()">🖨️ Imprimir Carné</button>
          
          <div class="carnes-container">
            <!-- FRONT CARD -->
            <div class="carne-card carne-front">
              <div class="header-band">
                <div class="logo-icon">🚗</div>
                <div class="company-name">${tenantName}</div>
                <div class="company-sub">Identificación Personal</div>
              </div>
              <div class="photo-wrap">
                <div class="photo-frame">
                  ${fotoSrc ? `<img src="${fotoSrc}">` : `<span class="default-avatar">👤</span>`}
                </div>
              </div>
              <div class="body-content">
                <div class="emp-name">${e.nombre}</div>
                <div class="emp-cargo">${e.cargo || 'Mecánico'}</div>
                
                <div class="info-grid">
                  <div class="info-row">
                    <span class="info-label">DPI / CUI</span>
                    <span class="info-value">${e.dpi || '—'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">No. Afiliación</span>
                    <span class="info-value">${e.igss || '—'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Ingreso</span>
                    <span class="info-value">${e.fecha_ingreso ? new Date(e.fecha_ingreso).toLocaleDateString('es-GT') : '—'}</span>
                  </div>
                </div>
              </div>

              <!-- Barcode -->
              <div class="barcode-wrap">
                <div class="barcode-lines">
                  ${Array.from({length: 24}).map(() => {
                    const width = Math.random() > 0.5 ? '2px' : '1px';
                    return `<span style="width:${width}"></span>`;
                  }).join('')}
                </div>
                <div class="barcode-num">EMP-${e.id.slice(0,8).toUpperCase()}</div>
              </div>
            </div>

            <!-- BACK CARD -->
            <div class="carne-card carne-back">
              <div class="back-title">Datos Adicionales</div>
              
              <div class="back-content">
                <div>
                  <div class="back-section-title">En Caso de Emergencia Avisar a:</div>
                  <div class="back-data">
                    <strong>${e.emergencia_nombre || '—'}</strong> (${e.emergencia_parentesco || '—'})<br>
                    📞 Tel: ${e.emergencia_tel || '—'}
                  </div>
                </div>

                <div>
                  <div class="back-section-title">Datos Médicos / Alergias:</div>
                  <div class="back-data" style="font-size: 8.5px; min-height: 36px;">
                    ${e.alergias_salud ? `<strong>Alergias/Salud:</strong> ${e.alergias_salud.replace(/\n/g, '<br>')}` : 'Sin alergias o situaciones de salud reportadas.'}
                    ${e.notas ? `<br><span style="font-size: 7.5px; color: #cbd5e1; display: block; margin-top: 4px;">${e.notas.replace(/\n/g, '<br>')}</span>` : ''}
                  </div>
                </div>

                <div class="back-signature">
                  <div class="sig-line"></div>
                  <div class="sig-text">Firma Autorizada</div>
                </div>
              </div>

              <div class="back-disclaimer">
                Este carné es personal e intransferible y de uso exclusivo en las instalaciones del taller. Si lo encuentra, por favor devuélvalo a la administración.
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
  },

  /* ══ RECLUTAMIENTO: vacantes y aplicantes ══ */
  _reclutVacanteSel: '',
  _reclutMostrarPerfiles: false,
  _aplCV: null,

  async _renderReclutamiento(el) {
    const vacantes = await DB.getVacantes();
    this._vacantesCache = vacantes;
    const aplicantesAll = await DB.getAplicantes();
    this._aplicantesCache = aplicantesAll;
    const aplicantes = this._reclutVacanteSel ? aplicantesAll.filter(a=>a.vacante_id===this._reclutVacanteSel) : aplicantesAll;
    const publicadas = vacantes.filter(v=>v.estado==='publicada');
    const contratados = aplicantesAll.filter(a=>a.estado==='contratado').length;
    const vacSel = vacantes.find(v=>v.id===this._reclutVacanteSel);

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-weight:700">Vacantes</div>
        <button class="btn btn-amber" onclick="Modulos.rrhh.modalVacante()">＋ Nueva vacante</button>
      </div>
      <div class="kpi-grid" style="margin-bottom:16px">
        ${UI.kpiCard({ icon:'📢', clase:'green', label:'Publicadas', value: publicadas.length })}
        ${UI.kpiCard({ icon:'📋', clase:'cyan', label:'Total vacantes', value: vacantes.length })}
        ${UI.kpiCard({ icon:'🧑', clase:'amber', label:'Aplicantes', value: aplicantesAll.length })}
        ${UI.kpiCard({ icon:'✅', clase:'purple', label:'Contratados', value: contratados })}
      </div>

      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="Modulos.rrhh._reclutMostrarPerfiles=!Modulos.rrhh._reclutMostrarPerfiles;Modulos.rrhh._renderTab()">
          <div class="card-sub" style="margin:0">📋 Perfiles predefinidos de puestos (${PERFILES_RECLUTAMIENTO.length})</div>
          <span style="font-size:12px;color:var(--text3)">${this._reclutMostrarPerfiles?'▲ Ocultar':'▼ Mostrar'}</span>
        </div>
        ${this._reclutMostrarPerfiles?`
        <div style="font-size:12px;color:var(--text3);margin:8px 0 12px">Usa una plantilla para crear rápidamente una vacante con descripción, requisitos y rango salarial sugerido (puedes editarlos antes de guardar).</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
          ${PERFILES_RECLUTAMIENTO.map((p,i)=>`
            <div class="card" style="padding:12px">
              <div style="font-weight:700;font-size:13px">${p.puesto}</div>
              <div style="font-size:11px;color:var(--text3);margin:2px 0 6px">${p.departamento}</div>
              <div class="mono-sm text-amber" style="margin-bottom:8px">${UI.q(p.salario_min)} – ${UI.q(p.salario_max)}</div>
              <button class="btn btn-ghost btn-sm" style="width:100%" onclick="Modulos.rrhh.modalVacante(null,${i})">＋ Crear vacante</button>
            </div>`).join('')}
        </div>`:''}
      </div>

      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Puesto</th><th>Depto</th><th>Salario</th><th>Vacantes</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>${vacantes.map(v=>`<tr>
          <td><b>${v.puesto}</b></td>
          <td>${v.departamento||'—'}</td>
          <td class="mono-sm">${v.salario_min?UI.q(v.salario_min):'—'}${v.salario_max?' – '+UI.q(v.salario_max):''}</td>
          <td style="text-align:center">${v.vacantes_disponibles||1}</td>
          <td><span class="badge badge-${v.estado==='publicada'?'green':v.estado==='cerrada'?'gray':'amber'}">${v.estado}</span></td>
          <td><div style="display:flex;gap:4px;flex-wrap:wrap">
            ${Modulos.btnAccion('editar', `Modulos.rrhh.modalVacante('${v.id}')`)}
            <button class="btn btn-sm btn-${v.estado==='publicada'?'ghost':'green'}" onclick="Modulos.rrhh.togglePublicarVacante('${v.id}')">${v.estado==='publicada'?'⏸️ Despublicar':'📢 Publicar'}</button>
            <button class="btn btn-sm btn-cyan" onclick="Modulos.rrhh._reclutVacanteSel='${v.id}';Modulos.rrhh._renderTab()">👥 Aplicantes</button>
            ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('vacantes','${v.id}','${(v.puesto||'').replace(/'/g,"\\'")}',()=>Modulos.rrhh._renderTab())`)}
          </div></td>
        </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin vacantes registradas</td></tr>'}</tbody>
      </table></div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:20px 0 12px">
        <div style="font-weight:700">Aplicantes ${vacSel?'— '+vacSel.puesto:'(todas las vacantes)'}</div>
        <div style="display:flex;gap:8px">
          ${this._reclutVacanteSel?`<button class="btn btn-ghost btn-sm" onclick="Modulos.rrhh._reclutVacanteSel='';Modulos.rrhh._renderTab()">Ver todos</button>`:''}
          <button class="btn btn-amber" onclick="Modulos.rrhh.modalAplicante()">＋ Nuevo aplicante</button>
        </div>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Nombre</th><th>Vacante</th><th>Contacto</th><th>CV</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>${aplicantes.map(a=>{
          const vac = vacantes.find(v=>v.id===a.vacante_id);
          return `<tr>
          <td><b>${a.nombre}</b>${a.notas?`<div style="font-size:10px;color:var(--text3)">${a.notas}</div>`:''}</td>
          <td>${vac?.puesto||'—'}</td>
          <td class="mono-sm">${a.telefono||''}${a.email?'<br>'+a.email:''}</td>
          <td>${a.cv_base64?`<button class="btn btn-sm btn-cyan" onclick="UI.verAdjunto(Modulos.rrhh._cvDe('${a.id}'),'📄 CV')">📄 Ver</button>`:'—'}</td>
          <td><select class="form-select" style="font-size:11px;padding:3px 6px" onchange="Modulos.rrhh.cambiarEstadoAplicante('${a.id}',this.value)">
            ${['nuevo','entrevista','rechazado','contratado'].map(s=>`<option value="${s}" ${a.estado===s?'selected':''}>${s}</option>`).join('')}
          </select></td>
          <td><div style="display:flex;gap:4px">
            ${Modulos.btnAccion('editar', `Modulos.rrhh.modalAplicante('${a.id}')`)}
            ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('aplicantes','${a.id}','${(a.nombre||'').replace(/'/g,"\\'")}',()=>Modulos.rrhh._renderTab())`)}
          </div></td>
        </tr>`;}).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin aplicantes registrados</td></tr>'}</tbody>
      </table></div>`;
  },

  modalVacante(id=null, plantillaIdx=null) {
    const v = id ? (this._vacantesCache||[]).find(x=>x.id===id)||{}
      : (plantillaIdx!=null ? { ...PERFILES_RECLUTAMIENTO[plantillaIdx] } : {});
    UI.modal(`${id?'✏️ Editar':'🧑‍💼 Nueva'} vacante`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Puesto *</label>
          <input class="form-input" id="vac-puesto" value="${v.puesto||''}" placeholder="Mecánico automotriz"></div>
        <div class="form-group"><label class="form-label">Departamento</label>
          <input class="form-input" id="vac-depto" value="${v.departamento||''}" placeholder="Taller"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Salario mínimo (Q)</label>
          <input class="form-input" id="vac-smin" type="number" min="0" step="0.01" value="${v.salario_min||''}"></div>
        <div class="form-group"><label class="form-label">Salario máximo (Q)</label>
          <input class="form-input" id="vac-smax" type="number" min="0" step="0.01" value="${v.salario_max||''}"></div>
        <div class="form-group"><label class="form-label">Vacantes disponibles</label>
          <input class="form-input" id="vac-cant" type="number" min="1" value="${v.vacantes_disponibles||1}"></div>
      </div>
      <div class="form-group"><label class="form-label">Descripción</label>
        <textarea class="form-input" id="vac-desc" rows="3">${v.descripcion||''}</textarea></div>
      <div class="form-group"><label class="form-label">Requisitos</label>
        <textarea class="form-input" id="vac-req" rows="3">${v.requisitos||''}</textarea></div>
      <div class="form-group"><label class="form-label">Estado</label>
        <select class="form-select" id="vac-estado">
          ${['borrador','publicada','cerrada'].map(s=>`<option ${(v.estado||'borrador')===s?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh.guardarVacante('${id||''}')">Guardar</button>
      </div>`, '600px');
  },

  async guardarVacante(id='') {
    const puesto = document.getElementById('vac-puesto')?.value.trim();
    if (!puesto) { UI.toast('El puesto es obligatorio','error'); return; }
    const estado = document.getElementById('vac-estado')?.value;
    const fields = {
      puesto,
      departamento: document.getElementById('vac-depto')?.value||null,
      descripcion:  document.getElementById('vac-desc')?.value||null,
      requisitos:   document.getElementById('vac-req')?.value||null,
      salario_min:  parseFloat(document.getElementById('vac-smin')?.value)||null,
      salario_max:  parseFloat(document.getElementById('vac-smax')?.value)||null,
      vacantes_disponibles: parseInt(document.getElementById('vac-cant')?.value)||1,
      estado
    };
    if (estado==='publicada') fields.publicado_en = new Date().toISOString();
    if (id) fields.id = id;
    const { error } = await DB.upsertVacante(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('Vacante guardada ✓');
    this._renderTab();
  },

  async togglePublicarVacante(id) {
    const v = (this._vacantesCache||[]).find(x=>x.id===id);
    if (!v) return;
    const nuevo = v.estado==='publicada' ? 'borrador' : 'publicada';
    const fields = { id, estado: nuevo };
    if (nuevo==='publicada') fields.publicado_en = new Date().toISOString();
    const { error } = await DB.upsertVacante(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(nuevo==='publicada'?'Vacante publicada ✓':'Vacante despublicada');
    this._renderTab();
  },

  modalAplicante(id=null) {
    const a = id ? (this._aplicantesCache||[]).find(x=>x.id===id)||{} : {};
    this._aplCV = null;
    UI.modal(`${id?'✏️ Editar':'🧑 Nuevo'} aplicante`, `
      <div class="form-group"><label class="form-label">Vacante *</label>
        <select class="form-select" id="apl-vac">
          ${(this._vacantesCache||[]).map(v=>`<option value="${v.id}" ${(a.vacante_id||this._reclutVacanteSel)===v.id?'selected':''}>${v.puesto}</option>`).join('')}
        </select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre *</label>
          <input class="form-input" id="apl-nombre" value="${a.nombre||''}"></div>
        <div class="form-group"><label class="form-label">Teléfono</label>
          <input class="form-input" id="apl-tel" value="${a.telefono||''}"></div>
        <div class="form-group"><label class="form-label">Email</label>
          <input class="form-input" id="apl-email" value="${a.email||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">CV (pdf o imagen)</label>
        <input class="form-input" type="file" accept="image/*,application/pdf" onchange="Modulos.rrhh._onCV(this)">
        <div id="apl-cv-info" style="font-size:11px;color:var(--text3);margin-top:4px">${a.cv_base64?'📎 Ya tiene CV adjunto (subir otro lo reemplaza)':''}</div></div>
      <div class="form-group"><label class="form-label">Estado</label>
        <select class="form-select" id="apl-estado">
          ${['nuevo','entrevista','rechazado','contratado'].map(s=>`<option ${(a.estado||'nuevo')===s?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="apl-notas" rows="2">${a.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh.guardarAplicante('${id||''}')">Guardar</button>
      </div>`, '560px');
  },

  _onCV(input) {
    const f = input.files?.[0];
    if (!f) { this._aplCV = null; return; }
    UI.fileABase64(f, { maxPx: 1400, maxPdfMB: 5 }).then(r => {
      this._aplCV = r;
      const i = document.getElementById('apl-cv-info'); if (i) i.textContent = '✓ ' + r.nombre;
    }).catch(e => { UI.toast(e.message,'error'); input.value=''; });
  },

  async guardarAplicante(id='') {
    const nombre = document.getElementById('apl-nombre')?.value.trim();
    const vacante_id = document.getElementById('apl-vac')?.value;
    if (!nombre || !vacante_id) { UI.toast('Vacante y nombre son obligatorios','error'); return; }
    const fields = {
      vacante_id, nombre,
      telefono: document.getElementById('apl-tel')?.value||null,
      email:    document.getElementById('apl-email')?.value||null,
      estado:   document.getElementById('apl-estado')?.value,
      notas:    document.getElementById('apl-notas')?.value||null
    };
    if (this._aplCV) { fields.cv_base64 = this._aplCV.base64; fields.cv_nombre = this._aplCV.nombre; }
    if (id) fields.id = id;
    const { error } = await DB.upsertAplicante(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('Aplicante guardado ✓');
    this._renderTab();
  },

  async cambiarEstadoAplicante(id, estado) {
    const { error } = await DB.upsertAplicante({ id, estado });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast('Estado actualizado ✓');
    this._renderTab();
  },

  _cvDe(id) { return (this._aplicantesCache||[]).find(a=>a.id===id)?.cv_base64 || null; },

  /* ══ DISCIPLINA: medidas conforme al Código de Trabajo de Guatemala ══ */
  _discFiltroEmp: '',
  _discDoc: null,
  _DISC_TIPOS: ['Llamada de atención','Amonestación escrita','Suspensión','Sanción económica','Despido'],
  _DISC_ARTICULOS: {
    'Llamada de atención':  'Art. 60-64 (obligaciones de los trabajadores)',
    'Amonestación escrita': 'Art. 60-64 (obligaciones de los trabajadores)',
    'Suspensión':           'Art. 60, 76 (suspensión disciplinaria sin goce de salario)',
    'Sanción económica':    'Art. 61, reglamento interno de trabajo',
    'Despido':              'Art. 77 (causas de despido justificado sin responsabilidad patronal)'
  },

  async _renderDisciplina(el) {
    const registros = await DB.getDisciplina(this._discFiltroEmp || null);
    this._discCache = registros;
    const anio = new Date().getFullYear();
    const delAnio = registros.filter(r=>(r.fecha||'').startsWith(String(anio)));

    el.innerHTML = `
      <div class="alert alert-amber" style="margin-bottom:16px">
        <div class="alert-icon">⚖️</div>
        <div class="alert-body" style="font-size:12px">
          Registro de medidas disciplinarias conforme al <b>Código de Trabajo de Guatemala</b> (Art. 60-64 obligaciones de los
          trabajadores, Art. 77 causas de despido justificado, Art. 82 indemnización). Documenta cada caso con fecha, motivo y
          artículo aplicable para respaldar al taller ante una inconformidad o demanda laboral.
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <select class="form-select" style="width:auto" onchange="Modulos.rrhh._discFiltroEmp=this.value;Modulos.rrhh._renderTab()">
          <option value="">Todos los empleados</option>
          ${this._empleados.map(e=>`<option value="${e.id}" ${this._discFiltroEmp===e.id?'selected':''}>${e.nombre}</option>`).join('')}
        </select>
        <button class="btn btn-amber" onclick="Modulos.rrhh.modalDisciplina()">＋ Nuevo registro</button>
      </div>
      <div class="kpi-grid" style="margin-bottom:16px">
        ${UI.kpiCard({ icon:'⚠️', clase:'amber', label:`Registros ${anio}`, value: delAnio.length })}
        ${UI.kpiCard({ icon:'📢', clase:'cyan', label:'Llamadas de atención', value: registros.filter(r=>r.tipo==='Llamada de atención').length })}
        ${UI.kpiCard({ icon:'⛔', clase:'red', label:'Despidos', value: registros.filter(r=>r.tipo==='Despido').length })}
        ${UI.kpiCard({ icon:'💰', clase:'purple', label:'Sanciones económicas', value: registros.reduce((s,r)=>s+(Number(r.monto_sancion)||0),0), money:true })}
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Empleado</th><th>Tipo</th><th>Motivo</th><th>Fecha</th><th>Artículo</th><th>Detalle</th><th>Acciones</th></tr></thead>
        <tbody>${registros.map(r=>`<tr>
          <td><b>${r.empleados?.nombre||'—'}</b></td>
          <td><span class="badge badge-${this._discColor(r.tipo)}" style="font-size:10px">${r.tipo}</span></td>
          <td>${r.motivo}</td>
          <td class="mono-sm">${UI.fecha(r.fecha)}</td>
          <td class="mono-sm">${r.articulo||'—'}</td>
          <td class="mono-sm">${r.dias_suspension?r.dias_suspension+' día(s) susp.':''}${r.monto_sancion?UI.q(r.monto_sancion):''}</td>
          <td><div style="display:flex;gap:4px">
            ${r.documento_base64?`<button class="btn btn-sm btn-cyan" title="Ver documento" onclick="UI.verAdjunto(Modulos.rrhh._discDocDe('${r.id}'),'⚖️ Documento')">📎</button>`:''}
            ${Modulos.btnAccion('editar', `Modulos.rrhh.modalDisciplina('${r.id}')`)}
            ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('disciplina','${r.id}','este registro',()=>Modulos.rrhh._renderTab())`)}
          </div></td>
        </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin registros disciplinarios</td></tr>'}</tbody>
      </table></div>`;
  },

  _discColor(tipo) {
    return { 'Llamada de atención':'amber', 'Amonestación escrita':'amber', 'Suspensión':'red', 'Sanción económica':'purple', 'Despido':'red' }[tipo] || 'gray';
  },

  _discDocDe(id) { return (this._discCache||[]).find(r=>r.id===id)?.documento_base64 || null; },

  modalDisciplina(id=null) {
    const r = id ? (this._discCache||[]).find(x=>x.id===id)||{} : {};
    this._discDoc = null;
    const tipoIni = r.tipo || this._DISC_TIPOS[0];
    UI.modal(`${id?'✏️ Editar':'⚖️ Nuevo'} registro disciplinario`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Empleado *</label>
          <select class="form-select" id="disc-emp">
            ${this._empleados.map(e=>`<option value="${e.id}" ${r.empleado_id===e.id?'selected':''}>${e.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Tipo *</label>
          <select class="form-select" id="disc-tipo" onchange="Modulos.rrhh._actualizarArticuloDisc()">
            ${this._DISC_TIPOS.map(t=>`<option ${tipoIni===t?'selected':''}>${t}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha *</label>
          <input class="form-input" id="disc-fecha" type="date" value="${r.fecha||new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Artículo (Código de Trabajo)</label>
          <input class="form-input" id="disc-articulo" value="${r.articulo||this._DISC_ARTICULOS[tipoIni]||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Motivo *</label>
        <textarea class="form-input" id="disc-motivo" rows="3">${r.motivo||''}</textarea></div>
      <div class="form-row">
        <div class="form-group" id="disc-dias-wrap" style="${tipoIni==='Suspensión'?'':'display:none'}">
          <label class="form-label">Días de suspensión</label>
          <input class="form-input" id="disc-dias" type="number" min="1" value="${r.dias_suspension||''}"></div>
        <div class="form-group" id="disc-monto-wrap" style="${tipoIni==='Sanción económica'?'':'display:none'}">
          <label class="form-label">Monto de sanción (Q)</label>
          <input class="form-input" id="disc-monto" type="number" min="0" step="0.01" value="${r.monto_sancion||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Documento de respaldo (acta, carta, fotos)</label>
        <input class="form-input" type="file" accept="image/*,application/pdf" onchange="Modulos.rrhh._onDiscDoc(this)">
        <div id="disc-doc-info" style="font-size:11px;color:var(--text3);margin-top:4px">${r.documento_base64?'📎 Ya tiene documento adjunto (subir otro lo reemplaza)':''}</div></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh.guardarDisciplina('${id||''}')">Guardar</button>
      </div>`, '600px');
  },

  _actualizarArticuloDisc() {
    const tipo = document.getElementById('disc-tipo')?.value;
    const art = document.getElementById('disc-articulo');
    if (art) art.value = this._DISC_ARTICULOS[tipo] || '';
    const diasWrap = document.getElementById('disc-dias-wrap');
    const montoWrap = document.getElementById('disc-monto-wrap');
    if (diasWrap) diasWrap.style.display = tipo==='Suspensión' ? '' : 'none';
    if (montoWrap) montoWrap.style.display = tipo==='Sanción económica' ? '' : 'none';
  },

  _onDiscDoc(input) {
    const f = input.files?.[0];
    if (!f) { this._discDoc = null; return; }
    UI.fileABase64(f, { maxPx: 1400, maxPdfMB: 5 }).then(r => {
      this._discDoc = r;
      const i = document.getElementById('disc-doc-info'); if (i) i.textContent = '✓ ' + r.nombre;
    }).catch(e => { UI.toast(e.message,'error'); input.value=''; });
  },

  async guardarDisciplina(id='') {
    const empleado_id = document.getElementById('disc-emp')?.value;
    const motivo = document.getElementById('disc-motivo')?.value.trim();
    if (!empleado_id || !motivo) { UI.toast('Empleado y motivo son obligatorios','error'); return; }
    const fields = {
      empleado_id,
      tipo:    document.getElementById('disc-tipo')?.value,
      motivo,
      fecha:   document.getElementById('disc-fecha')?.value,
      articulo: document.getElementById('disc-articulo')?.value||null,
      dias_suspension: parseInt(document.getElementById('disc-dias')?.value)||null,
      monto_sancion:   parseFloat(document.getElementById('disc-monto')?.value)||null
    };
    if (this._discDoc) { fields.documento_base64 = this._discDoc.base64; fields.documento_nombre = this._discDoc.nombre; }
    if (id) fields.id = id;
    const { error } = await DB.upsertDisciplina(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('Registro guardado ✓');
    this._renderTab();
  },

  /* ══ VACACIONES: acumulación (1.25 días/mes) y goce/pago ══ */
  async _renderVacaciones(el) {
    const movs = await DB.getVacacionesMovimientos();
    this._vacMovsCache = movs;
    const activos = this._empleados.filter(e=>e.activo);
    const hoy = new Date();
    const filas = activos.map(e=>{
      const ingreso = e.fecha_ingreso ? new Date(e.fecha_ingreso) : null;
      const meses = ingreso ? Math.max(0, (hoy.getFullYear()-ingreso.getFullYear())*12 + (hoy.getMonth()-ingreso.getMonth()) - (hoy.getDate()<ingreso.getDate()?1:0)) : 0;
      const acumulado = Math.round(meses*1.25*100)/100;
      const propios = movs.filter(m=>m.empleado_id===e.id);
      const gozados = propios.filter(m=>m.tipo==='goce').reduce((s,m)=>s+(Number(m.dias)||0),0);
      const pagados = propios.filter(m=>m.tipo==='pago').reduce((s,m)=>s+(Number(m.dias)||0),0);
      const saldo = Math.round((acumulado - gozados - pagados)*100)/100;
      const salarioDiario = (Number(e.salario_base)||0)/30;
      return { e, acumulado, gozados, pagados, saldo, salarioDiario };
    });
    const totalSaldo = filas.reduce((s,f)=>s+f.saldo,0);
    const totalValor = filas.reduce((s,f)=>s+f.saldo*f.salarioDiario,0);

    el.innerHTML = `
      <div class="alert alert-cyan" style="margin-bottom:16px">
        <div class="alert-icon">🏖️</div>
        <div class="alert-body" style="font-size:12px">
          Acumulación de <b>1.25 días por mes trabajado (15 días hábiles al año)</b> según el Código de Trabajo de Guatemala
          (Art. 130-136). Si el empleado no goza sus vacaciones, puedes registrar el <b>pago</b> con base en su salario diario.
        </div>
      </div>
      <div class="kpi-grid" style="margin-bottom:16px">
        ${UI.kpiCard({ icon:'📅', clase:'cyan', label:'Días pendientes (todos)', value: Math.round(totalSaldo*10)/10 })}
        ${UI.kpiCard({ icon:'💰', clase:'amber', label:'Valor si se pagaran', value: totalValor, money:true })}
        ${UI.kpiCard({ icon:'👤', clase:'green', label:'Empleados activos', value: activos.length })}
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Empleado</th><th>Ingreso</th><th>Acumulados</th><th>Gozados</th><th>Pagados</th><th>Saldo</th><th>Valor saldo</th><th>Acciones</th></tr></thead>
        <tbody>${filas.map(f=>`<tr>
          <td><b>${f.e.nombre}</b><div style="font-size:10px;color:var(--text3)">${f.e.cargo||''}</div></td>
          <td class="mono-sm">${UI.fecha(f.e.fecha_ingreso)}</td>
          <td class="mono-sm" style="text-align:center">${f.acumulado}</td>
          <td class="mono-sm" style="text-align:center">${f.gozados}</td>
          <td class="mono-sm" style="text-align:center">${f.pagados}</td>
          <td class="mono-sm" style="text-align:center"><b class="${f.saldo<0?'text-red':'text-green'}">${f.saldo}</b></td>
          <td class="mono-sm text-amber">${UI.q(f.saldo*f.salarioDiario)}</td>
          <td><div style="display:flex;gap:4px">
            <button class="btn btn-sm btn-cyan" onclick="Modulos.rrhh.modalVacacion('${f.e.id}','goce')">🏖️ Goce</button>
            <button class="btn btn-sm btn-amber" onclick="Modulos.rrhh.modalVacacion('${f.e.id}','pago')">💵 Pago</button>
          </div></td>
        </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin empleados activos</td></tr>'}</tbody>
      </table></div>
      <div style="font-weight:700;margin:20px 0 12px">Historial de movimientos</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Empleado</th><th>Tipo</th><th>Periodo</th><th>Días</th><th>Monto</th><th>Notas</th><th>Acciones</th></tr></thead>
        <tbody>${movs.map(m=>{
          const emp = this._empleados.find(e=>e.id===m.empleado_id);
          return `<tr>
          <td>${emp?.nombre||'—'}</td>
          <td><span class="badge badge-${m.tipo==='goce'?'cyan':'amber'}">${m.tipo==='goce'?'Goce':'Pago'}</span></td>
          <td class="mono-sm">${m.fecha_inicio?UI.fecha(m.fecha_inicio)+(m.fecha_fin?' → '+UI.fecha(m.fecha_fin):''):'—'}</td>
          <td class="mono-sm" style="text-align:center">${m.dias}</td>
          <td class="mono-sm text-amber">${m.monto?UI.q(m.monto):'—'}</td>
          <td>${m.notas||''}</td>
          <td>${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('vacaciones_movimientos','${m.id}','este movimiento',()=>Modulos.rrhh._renderTab())`)}</td>
        </tr>`;}).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin movimientos registrados</td></tr>'}</tbody>
      </table></div>`;
  },

  modalVacacion(empleadoId, tipo) {
    const e = this._empleados.find(x=>x.id===empleadoId);
    if (!e) return;
    const salarioDiario = (Number(e.salario_base)||0)/30;
    UI.modal(`${tipo==='goce'?'🏖️ Registrar goce de vacaciones':'💵 Pagar vacaciones no gozadas'} — ${e.nombre}`, `
      <input type="hidden" id="vac-tipo" value="${tipo}">
      ${tipo==='goce' ? `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Inicio *</label>
          <input class="form-input" id="vac-ini" type="date" value="${new Date().toISOString().slice(0,10)}" onchange="Modulos.rrhh._calcDiasVac()"></div>
        <div class="form-group"><label class="form-label">Fin *</label>
          <input class="form-input" id="vac-fin" type="date" value="${new Date().toISOString().slice(0,10)}" onchange="Modulos.rrhh._calcDiasVac()"></div>
      </div>` : ''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Días *</label>
          <input class="form-input" id="vac-dias" type="number" min="0.5" step="0.5" value="${tipo==='goce'?1:''}" onchange="Modulos.rrhh._calcMontoVac()"></div>
        ${tipo==='pago'?`
        <div class="form-group"><label class="form-label">Salario diario (Q)</label>
          <input class="form-input" id="vac-saldiario" type="number" step="0.01" value="${salarioDiario.toFixed(2)}" onchange="Modulos.rrhh._calcMontoVac()"></div>
        <div class="form-group"><label class="form-label">Monto a pagar (Q)</label>
          <input class="form-input" id="vac-monto" type="number" step="0.01" value="0"></div>`:''}
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="vac-notas" rows="2"></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh.guardarVacacion('${empleadoId}')">Guardar</button>
      </div>`, '520px');
    if (tipo==='pago') setTimeout(()=>this._calcMontoVac(),0);
  },

  _calcDiasVac() {
    const ini = document.getElementById('vac-ini')?.value;
    const fin = document.getElementById('vac-fin')?.value;
    if (!ini || !fin) return;
    const dias = Math.round((new Date(fin)-new Date(ini))/86400000) + 1;
    const inp = document.getElementById('vac-dias');
    if (inp && dias>0) inp.value = dias;
  },

  _calcMontoVac() {
    const dias = parseFloat(document.getElementById('vac-dias')?.value)||0;
    const sal = parseFloat(document.getElementById('vac-saldiario')?.value)||0;
    const m = document.getElementById('vac-monto');
    if (m) m.value = Math.round(dias*sal*100)/100;
  },

  async guardarVacacion(empleadoId) {
    const tipo = document.getElementById('vac-tipo')?.value;
    const dias = parseFloat(document.getElementById('vac-dias')?.value)||0;
    if (dias<=0) { UI.toast('Indica los días','error'); return; }
    const fields = {
      empleado_id: empleadoId, tipo, dias,
      notas: document.getElementById('vac-notas')?.value||null
    };
    if (tipo==='goce') {
      fields.fecha_inicio = document.getElementById('vac-ini')?.value||null;
      fields.fecha_fin    = document.getElementById('vac-fin')?.value||null;
    } else {
      fields.monto = parseFloat(document.getElementById('vac-monto')?.value)||0;
    }
    const { error } = await DB.upsertVacacionMovimiento(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(tipo==='goce'?'Goce registrado ✓':'Pago de vacaciones registrado ✓ — agrégalo a egresos si corresponde');
    this._renderTab();
  },

  /* ══ HORAS EXTRA / TRABAJO EN DÍA FERIADO ══ */
  _heTipos: { extra:'⏰ Hora extra', feriado_trabajado:'🎉 Feriado trabajado', feriado_descanso:'🛌 Feriado descanso' },

  async _renderHorasExtra(el) {
    const now = new Date();
    if (this._heMes===undefined) { this._heMes = now.getMonth()+1; this._heAnio = now.getFullYear(); }
    const registros = await DB.getHorasExtra(this._heMes, this._heAnio);
    this._heCache = registros;
    const feriadosMes = FERIADOS_GT(this._heAnio).filter(f=>parseInt(f.fecha.slice(5,7))===this._heMes);
    const totalMonto = registros.reduce((s,r)=>s+(Number(r.monto)||0),0);
    const pendientes = registros.filter(r=>!r.pagada);
    const totalPendiente = pendientes.reduce((s,r)=>s+(Number(r.monto)||0),0);
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <div style="display:flex;gap:8px;align-items:center">
          <select class="form-select" onchange="Modulos.rrhh._heMes=parseInt(this.value);Modulos.rrhh._renderTab()">
            ${meses.map((m,i)=>`<option value="${i+1}" ${this._heMes===i+1?'selected':''}>${m}</option>`).join('')}
          </select>
          <select class="form-select" onchange="Modulos.rrhh._heAnio=parseInt(this.value);Modulos.rrhh._renderTab()">
            ${[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(a=>`<option value="${a}" ${this._heAnio===a?'selected':''}>${a}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-amber" onclick="Modulos.rrhh.modalHoraExtra()">＋ Registrar horas</button>
      </div>
      ${feriadosMes.length?`<div class="alert alert-cyan" style="margin-bottom:16px">
        <div class="alert-icon">🎉</div>
        <div class="alert-body" style="font-size:12px">Feriados de ${meses[this._heMes-1]} ${this._heAnio}: ${feriadosMes.map(f=>`${UI.fecha(f.fecha)} ${f.nombre}`).join(' · ')}.
        Si algún empleado trabajó ese día, regístralo aquí con tipo "Feriado trabajado" para incluirlo en la nómina.</div>
      </div>`:''}
      <div class="kpi-grid" style="margin-bottom:16px">
        ${UI.kpiCard({ icon:'⏰', clase:'cyan', label:'Registros del mes', value: registros.length })}
        ${UI.kpiCard({ icon:'💰', clase:'amber', label:'Monto total', value: totalMonto, money:true })}
        ${UI.kpiCard({ icon:'⏳', clase: pendientes.length?'red':'green', label:'Pendiente de nómina', value: totalPendiente, money:true })}
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Empleado</th><th>Fecha</th><th>Tipo</th><th>Horas</th><th>Factor</th><th>Monto</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>${registros.map(r=>`<tr>
          <td><b>${r.empleados?.nombre||'—'}</b></td>
          <td class="mono-sm">${UI.fecha(r.fecha)}</td>
          <td><span class="badge badge-${r.tipo==='extra'?'cyan':'green'}" style="font-size:10px">${this._heTipos[r.tipo]||r.tipo}</span></td>
          <td class="mono-sm" style="text-align:center">${r.horas||'—'}</td>
          <td class="mono-sm" style="text-align:center">${r.factor||'—'}</td>
          <td class="mono-sm text-amber">${UI.q(r.monto)}</td>
          <td><span class="badge badge-${r.pagada?'green':'amber'}">${r.pagada?'En nómina':'Pendiente'}</span></td>
          <td><div style="display:flex;gap:4px">
            ${!r.pagada?Modulos.btnAccion('editar', `Modulos.rrhh.modalHoraExtra('${r.id}')`):''}
            ${!r.pagada?Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('horas_extra','${r.id}','este registro',()=>Modulos.rrhh._renderTab())`):''}
          </div></td>
        </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin horas extra registradas en este periodo</td></tr>'}</tbody>
      </table></div>`;
  },

  modalHoraExtra(id=null) {
    const r = id ? (this._heCache||[]).find(x=>x.id===id)||{} : {};
    const tipoIni = r.tipo || 'extra';
    UI.modal(`${id?'✏️ Editar':'⏰ Registrar'} horas extra / feriado`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Empleado *</label>
          <select class="form-select" id="he-emp" onchange="Modulos.rrhh._calcMontoHE()">
            ${this._empleados.filter(e=>e.activo||e.id===r.empleado_id).map(e=>`<option value="${e.id}" ${r.empleado_id===e.id?'selected':''}>${e.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Fecha *</label>
          <input class="form-input" id="he-fecha" type="date" value="${r.fecha||new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo *</label>
          <select class="form-select" id="he-tipo" onchange="Modulos.rrhh._calcMontoHE()">
            <option value="extra" ${tipoIni==='extra'?'selected':''}>⏰ Hora extra (factor 1.5)</option>
            <option value="feriado_trabajado" ${tipoIni==='feriado_trabajado'?'selected':''}>🎉 Feriado trabajado (día doble)</option>
            <option value="feriado_descanso" ${tipoIni==='feriado_descanso'?'selected':''}>🛌 Feriado descanso (día pagado, no trabajado)</option>
          </select></div>
        <div class="form-group"><label class="form-label">Horas</label>
          <input class="form-input" id="he-horas" type="number" min="0" step="0.5" value="${r.horas||(tipoIni==='extra'?1:8)}" onchange="Modulos.rrhh._calcMontoHE()"></div>
        <div class="form-group"><label class="form-label">Factor</label>
          <input class="form-input" id="he-factor" type="number" min="0" step="0.1" value="${r.factor||1.5}" onchange="Modulos.rrhh._calcMontoHE()"></div>
      </div>
      <div class="form-group"><label class="form-label">Monto (Q) *</label>
        <input class="form-input" id="he-monto" type="number" min="0" step="0.01" value="${r.monto||0}"></div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="he-notas" rows="2">${r.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh.guardarHoraExtra('${id||''}')">Guardar</button>
      </div>`, '560px');
    if (!id) setTimeout(()=>this._calcMontoHE(),0);
  },

  _calcMontoHE() {
    const empId = document.getElementById('he-emp')?.value;
    const e = this._empleados.find(x=>x.id===empId);
    if (!e) return;
    const tipo = document.getElementById('he-tipo')?.value;
    const salarioDiario = (Number(e.salario_base)||0)/30;
    const factorInp = document.getElementById('he-factor');
    const horasInp = document.getElementById('he-horas');
    const montoInp = document.getElementById('he-monto');
    if (tipo==='extra') {
      const factor = parseFloat(factorInp?.value)||1.5;
      const horas = parseFloat(horasInp?.value)||0;
      const horaOrdinaria = salarioDiario/8;
      if (montoInp) montoInp.value = Math.round(horaOrdinaria*horas*factor*100)/100;
    } else {
      if (factorInp) factorInp.value = 1;
      if (horasInp) horasInp.value = 8;
      if (montoInp) montoInp.value = Math.round(salarioDiario*100)/100;
    }
  },

  async guardarHoraExtra(id='') {
    const empleado_id = document.getElementById('he-emp')?.value;
    const fecha = document.getElementById('he-fecha')?.value;
    const monto = parseFloat(document.getElementById('he-monto')?.value)||0;
    if (!empleado_id || !fecha || monto<=0) { UI.toast('Empleado, fecha y monto son obligatorios','error'); return; }
    const fields = {
      empleado_id, fecha,
      tipo:   document.getElementById('he-tipo')?.value,
      horas:  parseFloat(document.getElementById('he-horas')?.value)||null,
      factor: parseFloat(document.getElementById('he-factor')?.value)||null,
      monto,
      notas:  document.getElementById('he-notas')?.value||null
    };
    if (id) fields.id = id;
    const { error } = await DB.upsertHoraExtra(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('Registro guardado ✓ — se agregará a la nómina al calcularla');
    this._renderTab();
  }
};
