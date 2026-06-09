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
          <button class="tab-btn ${this._tab==='organigrama'?'active':''}" onclick="App.navegarSub('rrhh','organigrama')">🏢 Organigrama</button>
          <button class="tab-btn ${this._tab==='documentos'?'active':''}" onclick="App.navegarSub('rrhh','documentos')">📄 Documentos</button>
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
          <div class="kpi-card"><div class="kpi-label">Total Salarios</div><div class="kpi-val amber">${UI.q(pagos.reduce((s,p)=>s+p.salario_base,0))}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Bonificaciones</div><div class="kpi-val cyan">${UI.q(pagos.reduce((s,p)=>s+p.bonificacion,0))}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total IGSS</div><div class="kpi-val red">${UI.q(pagos.reduce((s,p)=>s+p.igss_laboral,0))}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Líquido</div><div class="kpi-val green">${UI.q(pagos.reduce((s,p)=>s+p.liquido,0))}</div></div>
        </div>`:''}
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Empleado</th><th>Salario</th><th>Bono</th><th>IGSS Lab.</th><th>ISR</th><th>Líquido</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${pagos.map(p=>`<tr>
                <td>${p.empleados?.nombre||'—'}</td>
                <td class="mono-sm">${UI.q(p.salario_base)}</td>
                <td class="mono-sm">${UI.q(p.bonificacion)}</td>
                <td class="mono-sm text-red">-${UI.q(p.igss_laboral)}</td>
                <td class="mono-sm text-red">-${UI.q(p.isr)}</td>
                <td class="mono-sm text-green"><b>${UI.q(p.liquido)}</b></td>
                <td><span class="badge badge-${p.pagado?'green':'amber'}">${p.pagado?'Pagado':'Pendiente'}</span></td>
                <td>
                  ${p.pagado ? '' : `<button class="btn btn-sm btn-green" onclick="Modulos.rrhh.pagarNomina('${p.id}')">💵 Pagar</button>`}
                </td>
              </tr>`).join('')||`<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">
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
            <button class="btn btn-cyan" onclick="Modulos.rrhh.imprimirIGSS()" ${pagos.length?'':'disabled'}>🖨️ Imprimir Planilla IGSS</button>
          </div>
        </div>

        ${pagos.length ? `
        <div class="kpi-grid" style="margin-bottom:16px">
          <div class="kpi-card"><div class="kpi-label">Masa Salarial Base</div><div class="kpi-val amber">${UI.q(totalSueldo)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Cuota Laboral (4.83%)</div><div class="kpi-val red">${UI.q(totalLaboral)}</div><div class="kpi-trend">retención a empleados</div></div>
          <div class="kpi-card"><div class="kpi-label">Aporte Patronal (12.67%)</div><div class="kpi-val cyan">${UI.q(totalPatronal)}</div><div class="kpi-trend">IGSS/IRTRA/INTECAP</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Pago IGSS</div><div class="kpi-val green">${UI.q(granTotal)}</div><div class="kpi-trend">17.50% de la planilla</div></div>
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

  async calcularNomina(mes, anio) {
    UI.toast('Calculando nómina Guatemala 2026...','info');
    for (const e of this._empleados.filter(x=>x.activo)) {
      const isr  = calcularISR(e.salario_base);
      const igss = e.salario_base * GT.igss_laboral;
      const liquido = e.salario_base + (e.bonificacion||GT.bonificacion_incentivo) - igss - isr;
      await DB.upsertPagoNomina({
        empleado_id:  e.id, periodo_mes: mes, periodo_anio: anio,
        salario_base: e.salario_base,
        bonificacion: e.bonificacion || GT.bonificacion_incentivo,
        igss_laboral: Math.round(igss*100)/100,
        isr:          Math.round(isr*100)/100,
        liquido:      Math.round(liquido*100)/100
      });
    }
    UI.toast('Nómina calculada ✓');
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
                ${['mecanico','recepcionista','gerente_tal','gerente_fin','admin'].map(r=>`<option value="${r}" ${e.rol===r?'selected':''}>${ROLES[r]?.icon||''} ${ROLES[r]?.label||r}</option>`).join('')}
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
      tel:                   document.getElementById('emp-tel')?.value||null,
      email,
      fecha_nacimiento:      document.getElementById('emp-nacimiento')?.value||null,
      estado_civil:          document.getElementById('emp-estado-civil')?.value||null,
      direccion:             document.getElementById('emp-dir')?.value||null,
      departamento:          document.getElementById('emp-departamento')?.value||null,
      emergencia_nombre:     document.getElementById('emp-emerg-nombre')?.value||null,
      emergencia_parentesco: document.getElementById('emp-emerg-parentesco')?.value||null,
      emergencia_tel:        document.getElementById('emp-emerg-tel')?.value||null,
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

  /* Calcula los KPIs (auto + manual) y el score ponderado de un empleado */
  _kpiScores(emp, ordenes, manual, cfg) {
    const ots = ordenes.filter(o => o.mecanico_id === emp.id);
    const entregadasArr = ots.filter(o => ['entregado','listo'].includes(o.estado));
    const trabajadas = ots.length;
    const entregadas = entregadasArr.length;
    const ingresos   = entregadasArr.reduce((s,o)=>s+(Number(o.total)||0),0);
    const garantias  = ots.filter(o => o.estado==='garantia').length;
    const conFechas  = entregadasArr.filter(o => o.fecha_entrega && o.fecha_estimada);
    const aTiempo    = conFechas.filter(o => o.fecha_entrega <= o.fecha_estimada).length;
    const cumplimiento = conFechas.length ? Math.round(aTiempo/conFechas.length*100) : (entregadas ? 100 : 0);
    const calidad      = trabajadas ? Math.max(0, Math.round(100 - garantias/trabajadas*100)) : 100;

    const detail = (cfg.kpis||[]).map(k => {
      let score = 0, valor = '—';
      if (k.tipo === 'manual') {
        score = Math.max(0, Math.min(100, Number(manual?.[k.id]) || 0));
        valor = `${score}%`;
      } else if (k.id === 'ots_entregadas') {
        score = Math.min(100, Math.round(entregadas/(k.meta||10)*100));
        valor = `${entregadas}/${trabajadas} (meta ${k.meta||10})`;
      } else if (k.id === 'ingresos') {
        score = Math.min(100, Math.round(ingresos/(k.meta||20000)*100));
        valor = `${UI.q(ingresos)} (meta ${UI.q(k.meta||20000)})`;
      } else if (k.id === 'cumplimiento') {
        score = cumplimiento; valor = `${cumplimiento}% a tiempo`;
      } else if (k.id === 'calidad') {
        score = calidad; valor = `${garantias} garantía(s)`;
      }
      return { id:k.id, label:k.label, peso:Number(k.peso)||0, tipo:k.tipo, valor, score };
    });
    const pesoTotal = detail.reduce((s,d)=>s+d.peso,0) || 1;
    const score = Math.round(detail.reduce((s,d)=>s+d.score*d.peso,0)/pesoTotal);
    return { detail, score, raw:{ trabajadas, entregadas, ingresos, garantias, cumplimiento, calidad } };
  },

  _calcBono(salario, score, cfg) {
    /* Base del bono: salario (Fase 1). Bono = salario × bono_max% × score% */
    const pct = (Number(cfg.bono_max_pct)||0)/100;
    return Math.round((Number(salario)||0) * pct * (score/100) * 100)/100;
  },

  async _renderProductividad(el) {
    const { mes, anio, ini, fin } = this._rangoMes();
    this._cfgProd = await DB.getConfigProductividad();
    const [ordenes, registros] = await Promise.all([
      DB.getOrdenesPeriodo(ini, fin),
      DB.getKpiEmpleados(mes, anio)
    ]);
    const cfg = this._cfgProd;
    const recByEmp = {}; registros.forEach(r => recByEmp[r.empleado_id] = r);
    const activos = this._empleados.filter(e => e.activo);

    const nombreMes = new Date(anio, mes-1, 1).toLocaleDateString('es-GT',{month:'long',year:'numeric'});
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const anios = [anio-1, anio, anio+1];

    let totalBono = 0, totalCosto = 0;
    const filas = activos.map(e => {
      const rec = recByEmp[e.id];
      const { score, raw } = this._kpiScores(e, ordenes, rec?.manual||{}, cfg);
      const hh = calcularHoraHombre(e.salario_base, cfg);
      const bono = this._calcBono(e.salario_base, score, cfg);
      totalBono += rec?.aprobado ? (rec.bono||bono) : bono;
      totalCosto += hh.costoMensual;
      const col = score>=80?'green':score>=50?'amber':'red';
      return `<tr>
        <td><div style="font-weight:700">${e.nombre}</div><div style="font-size:11px;color:var(--text3)">${e.cargo||ROLES[e.rol]?.label||'—'}</div></td>
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
        <td class="mono-sm text-amber"><b>${UI.q(rec?.aprobado?(rec.bono||bono):bono)}</b></td>
        <td><span class="badge badge-${rec?.aprobado?'green':'gray'}">${rec?.aprobado?'Aprobado':'Borrador'}</span></td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-cyan" onclick="Modulos.rrhh.detalleEmpleado('${e.id}')" title="Ver / editar KPIs">👁 Ver</button>
          ${rec?.aprobado?'':`<button class="btn btn-sm btn-green" onclick="Modulos.rrhh.aprobarBono('${e.id}')" title="Aprobar bono y cargar a egresos">✓ Bono</button>`}
          ${rec?`<button class="btn btn-sm btn-danger" onclick="Modulos.rrhh.eliminarKpi('${rec.id}')" title="Eliminar registro del mes">🗑️</button>`:''}
        </div></td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <div style="display:flex;gap:8px;align-items:center">
          <select class="form-select" style="width:auto" onchange="Modulos.rrhh._prodMes=parseInt(this.value);Modulos.rrhh._renderTab()">
            ${meses.map((m,i)=>`<option value="${i+1}" ${mes===i+1?'selected':''}>${m}</option>`).join('')}
          </select>
          <select class="form-select" style="width:auto" onchange="Modulos.rrhh._prodAnio=parseInt(this.value);Modulos.rrhh._renderTab()">
            ${anios.map(a=>`<option value="${a}" ${anio===a?'selected':''}>${a}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-ghost" onclick="Modulos.rrhh.modalConfigProductividad()">⚙️ Configurar criterios</button>
      </div>

      <div class="kpi-grid" style="margin-bottom:16px">
        <div class="kpi-card"><div class="kpi-label">Empleados</div><div class="kpi-val cyan">${activos.length}</div><div class="kpi-trend">activos</div></div>
        <div class="kpi-card"><div class="kpi-label">Costo Mensual (cargado)</div><div class="kpi-val red">${UI.q(totalCosto)}</div><div class="kpi-trend">${nombreMes}</div></div>
        <div class="kpi-card"><div class="kpi-label">Bonos del Mes</div><div class="kpi-val amber">${UI.q(totalBono)}</div><div class="kpi-trend">según desempeño</div></div>
        <div class="kpi-card"><div class="kpi-label">Hora-Hombre prom.</div><div class="kpi-val green">${UI.q(activos.length?totalCosto/activos.length/(cfg.horas_mes||240):0)}</div><div class="kpi-trend">base ${cfg.horas_mes||240} h/mes</div></div>
      </div>

      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Empleado</th><th>Hora-Hombre</th><th style="text-align:center">OTs</th><th>Ingresos</th><th>Score</th><th>Bono</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>${filas||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin empleados activos</td></tr>'}</tbody>
      </table></div>
      <div class="alert alert-cyan" style="margin-top:12px">
        <div class="alert-icon">ℹ️</div>
        <div class="alert-body" style="font-size:12px">El <b>score</b> combina los KPIs según sus pesos. El <b>bono</b> = salario × ${cfg.bono_max_pct||30}% × score. Al <b>aprobar</b>, el bono se registra como egreso (categoría Bonos) del mes.</div>
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

  /* Lee los KPIs manuales del modal de detalle */
  _leerManual(cfg) {
    const manual = {};
    (cfg.kpis||[]).filter(k=>k.tipo==='manual').forEach(k=>{
      const inp = document.getElementById('kpi-'+k.id);
      if (inp) manual[k.id] = parseInt(inp.value)||0;
    });
    return manual;
  },

  async guardarKpiManual(empId) {
    const e = this._empleados.find(x=>x.id===empId);
    const { mes, anio, ini, fin } = this._rangoMes();
    const cfg = this._cfgProd || await DB.getConfigProductividad();
    const manual = this._leerManual(cfg);
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
    const manual = document.getElementById('kpi-actitud') !== null
      ? this._leerManual(cfg) : (rec?.manual || {});
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

      <div style="font-weight:700;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;border-top:1px solid var(--border);padding-top:12px">Pesos de los KPIs (deben sumar 100%)</div>
      <div id="cfg-kpis" style="display:flex;flex-direction:column;gap:6px">
        ${(cfg.kpis||[]).map(k=>`
          <div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border-radius:8px;padding:8px">
            <span style="flex:1;font-size:12px">${k.label} <span style="color:var(--text3)">(${k.tipo})</span></span>
            ${k.meta!==undefined?`<input class="form-input" style="width:90px" type="number" id="cfg-meta-${k.id}" value="${k.meta}" title="Meta" placeholder="meta">`:''}
            <input class="form-input" style="width:70px" type="number" id="cfg-peso-${k.id}" value="${k.peso}" min="0" max="100"> <span style="font-size:12px;color:var(--text3)">%</span>
          </div>`).join('')}
      </div>
      <div id="cfg-pesos-aviso" style="font-size:11px;color:var(--text3);margin-top:6px"></div>

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh.guardarConfigProductividad()">Guardar criterios</button>
      </div>`, '560px');
  },

  async guardarConfigProductividad() {
    const base = this._cfgProd || PRODUCTIVIDAD_DEFAULTS;
    const kpis = (base.kpis||[]).map(k => ({
      ...k,
      peso: parseInt(document.getElementById('cfg-peso-'+k.id)?.value)||0,
      ...(k.meta!==undefined ? { meta: parseFloat(document.getElementById('cfg-meta-'+k.id)?.value)||k.meta } : {})
    }));
    const sumaPesos = kpis.reduce((s,k)=>s+k.peso,0);
    if (sumaPesos !== 100) {
      const seguir = await UI.confirmar(`Los pesos suman <b>${sumaPesos}%</b> (lo ideal es 100%). El score se normaliza igual. ¿Guardar de todas formas?`, 'Guardar');
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
      kpis
    };
    const ok = await DB.saveConfigProductividad(settings);
    if (!ok) { UI.toast('Error al guardar la configuración','error'); return; }
    this._cfgProd = { ...PRODUCTIVIDAD_DEFAULTS, ...settings };
    UI.cerrarModal(); UI.toast('Criterios actualizados ✓'); this._renderTab();
  },

  _tiposDoc: ['DPI','Pasaporte','Contrato de Trabajo','IGSS','IRTRA','Antecedentes Penales','Antecedentes Policiales','Tarjeta de Salud','Tarjeta de Pulmones','Título Académico','Licencia de Conducir','Otro'],
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
              background: linear-gradient(135deg, #1e293b, #0f172a);
              height: 80px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 10px;
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
              margin-top: -30px;
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
              border: 3px solid #ffffff;
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
              background: radial-gradient(circle at 100% 100%, #1e293b, #0f172a);
              color: #f8fafc;
              border: 1px solid #0f172a;
            }
            .carne-back .back-title {
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              color: #f59e0b;
              border-bottom: 1px solid #334155;
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
              color: #94a3b8;
              text-transform: uppercase;
              margin-bottom: 4px;
            }
            .carne-back .back-data {
              font-size: 10px;
              line-height: 1.4;
              background: rgba(255,255,255,0.05);
              border-radius: 6px;
              padding: 8px;
              border: 1px solid rgba(255,255,255,0.08);
            }
            .carne-back .back-disclaimer {
              font-size: 7.5px;
              color: #94a3b8;
              text-align: center;
              line-height: 1.3;
              border-top: 1px solid #334155;
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
              border-top: 1px solid #94a3b8;
              margin-top: 20px;
            }
            .carne-back .sig-text {
              font-size: 7px;
              color: #94a3b8;
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
                  <div class="back-section-title">Datos Médicos / Notas:</div>
                  <div class="back-data" style="font-size: 8.5px;">
                    ${e.notas ? e.notas.replace(/\n/g, '<br>') : 'Sin observaciones médicas registradas.'}
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
  }
};
