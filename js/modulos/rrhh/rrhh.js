/* TallerPro v3.0 — rrhh/index.js */
Modulos.rrhh = {
  _tab: 'empleados', _empleados: [],

  async render() {
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header"><h1 class="page-title">👤 RRHH & Nómina</h1></div>
      <div class="page-body">
        <div class="tabs">
          <button class="tab-btn ${this._tab==='empleados'?'active':''}" onclick="App.navegarSub('rrhh','empleados')">👤 Empleados</button>
          <button class="tab-btn ${this._tab==='nomina'?'active':''}" onclick="App.navegarSub('rrhh','nomina')">💵 Nómina</button>
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
            <thead><tr><th>Empleado</th><th>Salario</th><th>Bono</th><th>IGSS Lab.</th><th>ISR</th><th>Líquido</th><th>Estado</th></tr></thead>
            <tbody>
              ${pagos.map(p=>`<tr>
                <td>${p.empleados?.nombre||'—'}</td>
                <td class="mono-sm">${UI.q(p.salario_base)}</td>
                <td class="mono-sm">${UI.q(p.bonificacion)}</td>
                <td class="mono-sm text-red">-${UI.q(p.igss_laboral)}</td>
                <td class="mono-sm text-red">-${UI.q(p.isr)}</td>
                <td class="mono-sm text-green"><b>${UI.q(p.liquido)}</b></td>
                <td><span class="badge badge-${p.pagado?'green':'amber'}">${p.pagado?'Pagado':'Pendiente'}</span></td>
              </tr>`).join('')||`<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">
                Presiona "Calcular Nómina" para generar los pagos del mes actual
              </td></tr>`}
            </tbody>
          </table>
        </div>`;
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

  modalEmpleado(id=null) {
    const e = id ? this._empleados.find(x=>x.id===id) : {};
    const esEdicion = !!id;
    const salMinimo = GT.salario_minimo_no_agricola;
    const bono      = GT.bonificacion_incentivo;

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Empleado`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del empleado.</div></div>':''}

      <!-- DATOS PERSONALES -->
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
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
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

  async verDocumentos(empId, nombre) {
    const docs = await DB.getDocumentosEmpleado(empId);
    const TIPOS = ['DPI','Pasaporte','Contrato de Trabajo','IGSS','IRTRA','Antecedentes Penales','Antecedentes Policiales','Título Académico','Carné de Conducir','Otro'];
    UI.modal(`📄 Documentos — ${nombre}`, `
      <div style="display:flex;flex-direction:column;gap:8px">
        ${TIPOS.map(tipo=>{
          const doc = docs.find(d=>d.tipo===tipo);
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--surface2);border-radius:8px">
            <div>
              <div style="font-weight:700;font-size:13px">${tipo}</div>
              ${doc?`<div style="font-size:11px;color:var(--text3)">No: ${doc.numero||'—'} · Emitido: ${UI.fecha(doc.fecha_emision)} · Vence: ${doc.fecha_vencimiento?UI.fecha(doc.fecha_vencimiento):'Sin vencimiento'}</div>`:'<div style="font-size:11px;color:var(--text3)">Sin registrar</div>'}
            </div>
            <span class="badge badge-${doc?'green':'gray'}">${doc?'✓ OK':'Pendiente'}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
      </div>`,'500px');
  }
};
