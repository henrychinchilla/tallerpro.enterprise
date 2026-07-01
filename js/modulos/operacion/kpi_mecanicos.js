/* NexusPro v3.0 — KPI Mecánicos & Hora-Hombre */
Modulos.kpi_mecanicos = {
  _mes: null, _anio: null,

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);

    const now = new Date();
    if (!this._mes)  this._mes  = now.getMonth() + 1;
    if (!this._anio) this._anio = now.getFullYear();

    const ini = `${this._anio}-${String(this._mes).padStart(2,'0')}-01`;
    const fin = new Date(this._anio, this._mes, 0).toISOString().slice(0,10);

    const [{ horas, ots }, empleados, cfg] = await Promise.all([
      DB.getKpiMecanicos(ini, fin),
      DB.getEmpleados(),
      DB.getConfigProductividad()
    ]);

    const mecanicos = empleados.filter(e =>
      ['mecanico','tecnico','tecnico_especialista'].includes(e.cargo?.toLowerCase()?.replace(/\s/g,'_')) ||
      e.rol === 'mecanico' || (e.cargo || '').toLowerCase().includes('mecán') ||
      (e.cargo || '').toLowerCase().includes('técn')
    );

    const rows = this._calcular(mecanicos, horas, ots, cfg);
    const totales = this._totales(rows);
    const nombreMes = new Date(this._anio, this._mes - 1, 1)
      .toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });

    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const anios = [this._anio - 1, this._anio, this._anio + 1];

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">📊 KPI Mecánicos</h1>
          <p class="page-subtitle">// Productividad · Hora-Hombre · ${nombreMes}</p>
        </div>
        <div class="page-actions">
          <select class="form-select" style="width:140px" onchange="Modulos.kpi_mecanicos._mes=+this.value;Modulos.kpi_mecanicos.render()">
            ${meses.map((m,i)=>`<option value="${i+1}" ${i+1===this._mes?'selected':''}>${m}</option>`).join('')}
          </select>
          <select class="form-select" style="width:90px" onchange="Modulos.kpi_mecanicos._anio=+this.value;Modulos.kpi_mecanicos.render()">
            ${anios.map(a=>`<option ${a===this._anio?'selected':''}>${a}</option>`).join('')}
          </select>
          <button class="btn btn-ghost" onclick="Modulos.kpi_mecanicos.render()">↻ Actualizar</button>
          <button class="btn btn-cyan" onclick="Modulos.kpi_mecanicos.modalRegistrarHoras()">＋ Registrar Horas</button>
        </div>
      </div>

      <div class="page-body">
        ${this._renderKpis(totales, rows.length)}
        ${this._renderTabla(rows, cfg)}
        ${this._renderGrafico(rows)}
      </div>`;
  },

  _calcular(mecanicos, horas, ots, cfg) {
    return mecanicos.map(mec => {
      const misHoras = horas.filter(h => h.mecanico_id === mec.id);
      const misOts   = ots.filter(o => o.mecanico_id === mec.id);

      const totalHoras    = misHoras.reduce((s, h) => s + Number(h.horas), 0);
      const otsEntregadas = misOts.filter(o => o.estado === 'entregado').length;
      const otsTrabajadas = misOts.length;
      const ingresos      = misOts.reduce((s, o) => s + Number(o.total || 0), 0);
      const garantias     = misOts.filter(o => o.es_garantia).length;

      /* Costo H/H desde planilla */
      const hh = calcularHoraHombre(mec.salario_base || 0, cfg);
      const costoHH      = hh.horaHombre;
      const costoTotal   = costoHH * totalHoras;
      const ingresoPorHH = totalHoras > 0 ? ingresos / totalHoras : 0;
      const rentabilidad = costoTotal > 0 ? (ingresos / costoTotal) * 100 : 0;

      /* Cumplimiento de fechas */
      const conFecha = misOts.filter(o => o.fecha_estimada && o.fecha_entrega);
      const aTiempo  = conFecha.filter(o => o.fecha_entrega <= o.fecha_estimada).length;
      const cumplimiento = conFecha.length ? Math.round(aTiempo / conFecha.length * 100) : 100;

      /* Score ponderado simple */
      const score = Math.round(
        (Math.min(100, otsEntregadas / 8 * 100) * 0.30) +
        (Math.min(100, ingresos / 15000 * 100)  * 0.25) +
        (cumplimiento                             * 0.20) +
        (Math.max(0, 100 - garantias * 20)        * 0.15) +
        (totalHoras > 0 ? 80 : 0)                * 0.10
      );

      return { mec, totalHoras, otsEntregadas, otsTrabajadas, ingresos,
               garantias, costoHH, costoTotal, ingresoPorHH, rentabilidad,
               cumplimiento, score };
    }).sort((a, b) => b.score - a.score);
  },

  _totales(rows) {
    return {
      horas:    rows.reduce((s, r) => s + r.totalHoras, 0),
      ots:      rows.reduce((s, r) => s + r.otsEntregadas, 0),
      ingresos: rows.reduce((s, r) => s + r.ingresos, 0),
      costo:    rows.reduce((s, r) => s + r.costoTotal, 0),
    };
  },

  _renderKpis(t, nMec) {
    const rent = t.costo > 0 ? Math.round(t.ingresos / t.costo * 100) : 0;
    return `
    <div class="kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px">
      ${UI.kpiCard('👷 Mecánicos activos', nMec, '', '', { color:'var(--brand)' })}
      ${UI.kpiCard('⏱ Horas registradas', t.horas.toFixed(1)+'h', '', '', { color:'var(--cyan)' })}
      ${UI.kpiCard('✅ OTs entregadas', t.ots, '', '', { color:'var(--green)' })}
      ${UI.kpiCard('💰 Ingresos generados', UI.q(t.ingresos), '', '', { color:'var(--green)' })}
      ${UI.kpiCard('🔧 Costo H/H total', UI.q(t.costo), '', '', { color:'var(--amber)' })}
      ${UI.kpiCard('📈 Rentabilidad', rent+'%', rent >= 200 ? '✅ Excelente' : rent >= 150 ? '✓ Buena' : '⚠ Revisar', '', { color: rent >= 200 ? 'var(--green)' : rent >= 150 ? 'var(--cyan)' : 'var(--amber)' })}
    </div>`;
  },

  _scoreColor(s) {
    if (s >= 80) return 'var(--green)';
    if (s >= 60) return 'var(--cyan)';
    if (s >= 40) return 'var(--amber)';
    return 'var(--red)';
  },

  _renderTabla(rows, cfg) {
    if (!rows.length) return `<div class="empty-state"><p>No hay mecánicos con horas registradas en este período.<br>
      Usa <strong>＋ Registrar Horas</strong> para asignar horas a las órdenes.</p></div>`;

    return `
    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><h3 class="card-title">Ranking de Mecánicos — ${rows.length} activos</h3></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>#</th>
            <th>Mecánico</th>
            <th>OTs entregadas</th>
            <th>Horas registradas</th>
            <th>Ingresos generados</th>
            <th>Costo H/H</th>
            <th>Ingreso / H/H</th>
            <th>Rentabilidad</th>
            <th>Cumplimiento</th>
            <th>Score</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${rows.map((r, i) => {
              const rent = Math.round(r.rentabilidad);
              const rentColor = rent >= 200 ? 'var(--green)' : rent >= 150 ? 'var(--cyan)' : 'var(--amber)';
              return `<tr>
                <td><strong style="color:var(--muted)">${i+1}</strong></td>
                <td>
                  <strong>${r.mec.nombre}</strong><br>
                  <small style="color:var(--muted)">${r.mec.cargo || 'Mecánico'}</small>
                </td>
                <td>${r.otsEntregadas} <small style="color:var(--muted)">/ ${r.otsTrabajadas}</small></td>
                <td><strong>${r.totalHoras.toFixed(1)}h</strong></td>
                <td><strong style="color:var(--green)">${UI.q(r.ingresos)}</strong></td>
                <td style="color:var(--muted)">${UI.q(r.costoHH)}/h</td>
                <td><strong style="color:var(--cyan)">${UI.q(r.ingresoPorHH)}/h</strong></td>
                <td><span style="color:${rentColor};font-weight:700">${rent}%</span></td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="flex:1;height:6px;background:var(--border);border-radius:3px;min-width:60px">
                      <div style="width:${r.cumplimiento}%;height:100%;background:${r.cumplimiento>=80?'var(--green)':'var(--amber)'};border-radius:3px"></div>
                    </div>
                    <span style="font-size:12px;white-space:nowrap">${r.cumplimiento}%</span>
                  </div>
                </td>
                <td>
                  <span style="display:inline-flex;align-items:center;justify-content:center;
                    width:44px;height:44px;border-radius:50%;font-weight:900;font-size:14px;
                    background:${this._scoreColor(r.score)}22;color:${this._scoreColor(r.score)};
                    border:2px solid ${this._scoreColor(r.score)}">
                    ${r.score}
                  </span>
                </td>
                <td>
                  <button class="btn btn-ghost btn-sm" title="Ver detalle horas"
                    onclick="Modulos.kpi_mecanicos.modalDetalleHoras('${r.mec.id}','${r.mec.nombre}')">
                    ⏱ Horas
                  </button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  },

  _renderGrafico(rows) {
    if (!rows.length) return '';
    const max = Math.max(...rows.map(r => r.ingresos), 1);
    return `
    <div class="card">
      <div class="card-header"><h3 class="card-title">Ingresos generados por mecánico</h3></div>
      <div style="padding:16px 24px">
        ${rows.map(r => {
          const pct = Math.round(r.ingresos / max * 100);
          const rent = Math.round(r.rentabilidad);
          return `
          <div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:14px">
              <span><strong>${r.mec.nombre}</strong></span>
              <span style="color:var(--green);font-weight:700">${UI.q(r.ingresos)}
                <small style="color:var(--muted)"> · ${r.totalHoras.toFixed(1)}h · rentab. ${rent}%</small>
              </span>
            </div>
            <div style="height:10px;background:var(--border);border-radius:5px">
              <div style="width:${pct}%;height:100%;border-radius:5px;
                background:linear-gradient(90deg,var(--brand),var(--cyan));
                transition:width .4s ease"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  },

  /* ── MODAL: REGISTRAR HORAS ─────────────────────── */
  async modalRegistrarHoras(preOrdenId = null) {
    const [empleados, ordenesBrut] = await Promise.all([
      DB.getEmpleados(),
      DB.getOrdenes({ estado: 'en_proceso' })
    ]);
    const mecanicos = empleados.filter(e =>
      (e.cargo || '').toLowerCase().includes('mecán') ||
      (e.cargo || '').toLowerCase().includes('técn') ||
      e.rol === 'mecanico'
    );
    const ordenes = ordenesBrut.filter(o => !['entregado','cancelado'].includes(o.estado));
    const hoy = new Date().toISOString().slice(0, 10);

    Modulos.modalForm(`
      <h2 style="margin:0 0 20px;font-size:22px">⏱ Registrar Horas en OT</h2>
      <p style="color:var(--muted);margin-bottom:20px;font-size:14px">
        Distribuye las horas del día de planilla entre las órdenes trabajadas.
      </p>

      <div class="form-group">
        <label class="form-label">Mecánico *</label>
        <select class="form-select" id="hh-mec" onchange="Modulos.kpi_mecanicos._sugerirDistribucion()">
          <option value="">— Seleccionar —</option>
          ${mecanicos.map(e => `<option value="${e.id}">${e.nombre} (${e.cargo || 'Mecánico'})</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Fecha *</label>
        <input type="date" class="form-input" id="hh-fecha" value="${hoy}"
               onchange="Modulos.kpi_mecanicos._sugerirDistribucion()">
      </div>

      <div class="form-group">
        <label class="form-label">Orden de Trabajo *</label>
        <select class="form-select" id="hh-ot">
          <option value="">— Seleccionar OT —</option>
          ${ordenes.map(o => {
            const veh = o.vehiculos ? `${o.vehiculos.marca} ${o.vehiculos.modelo}` : o.descripcion?.slice(0,30) || '';
            const cli = o.clientes?.nombre || '';
            return `<option value="${o.id}" ${o.id===preOrdenId?'selected':''}>${o.num} · ${veh} · ${cli}</option>`;
          }).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Horas trabajadas en esta OT *</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" class="form-input" id="hh-horas" min="0.5" max="24" step="0.5"
                 placeholder="ej. 3.5" style="max-width:140px">
          <span style="color:var(--muted);font-size:13px" id="hh-sugerencia"></span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Notas (opcional)</label>
        <input type="text" class="form-input" id="hh-notas" placeholder="Tipo de trabajo, observaciones...">
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:24px">
        <button class="btn btn-ghost" onclick="Modulos.cerrarModal()">Cancelar</button>
        <button class="btn btn-brand" onclick="Modulos.kpi_mecanicos.guardarHoras()">Guardar Horas</button>
      </div>
    `);
  },

  async _sugerirDistribucion() {
    const mecId = document.getElementById('hh-mec')?.value;
    const fecha = document.getElementById('hh-fecha')?.value;
    const span  = document.getElementById('hh-sugerencia');
    if (!mecId || !fecha || !span) return;

    const registradas = await DB.getOtHorasMecanicoDia(mecId, fecha);
    const horasUsadas = registradas.reduce((s, h) => s + Number(h.horas), 0);
    const horasDia    = 8; // jornada estándar
    const disponibles = Math.max(0, horasDia - horasUsadas);
    span.textContent  = `Jornada: ${horasDia}h · Asignadas hoy: ${horasUsadas.toFixed(1)}h · Disponibles: ${disponibles.toFixed(1)}h`;
    span.style.color  = disponibles > 0 ? 'var(--cyan)' : 'var(--amber)';

    if (!document.getElementById('hh-horas').value && disponibles > 0) {
      document.getElementById('hh-horas').value = disponibles;
    }
  },

  async guardarHoras() {
    const mec   = document.getElementById('hh-mec').value;
    const ot    = document.getElementById('hh-ot').value;
    const fecha = document.getElementById('hh-fecha').value;
    const horas = parseFloat(document.getElementById('hh-horas').value);
    const notas = document.getElementById('hh-notas').value.trim();

    if (!mec || !ot || !fecha || !horas || horas <= 0) {
      return UI.toast('Completa todos los campos requeridos', 'error');
    }

    const { error } = await DB.upsertOtHoras({ orden_id: ot, mecanico_id: mec, fecha, horas, notas });
    if (error) return UI.toast('Error al guardar: ' + error.message, 'error');

    Modulos.cerrarModal();
    UI.toast('Horas registradas correctamente', 'success');
    this.render();
  },

  /* ── MODAL: DETALLE HORAS POR MECÁNICO ─────────── */
  async modalDetalleHoras(mecId, mecNombre) {
    const registros = await DB.getOtHoras(null); // traemos todos y filtramos
    // Traer horas del mes actual del mecánico
    const now = new Date();
    const ini = `${this._anio}-${String(this._mes).padStart(2,'0')}-01`;
    const fin = new Date(this._anio, this._mes, 0).toISOString().slice(0, 10);

    const { horas } = await DB.getKpiMecanicos(ini, fin);
    const misHoras  = horas.filter(h => h.mecanico_id === mecId);

    if (!misHoras.length) {
      return UI.toast('Sin horas registradas para este período', 'info');
    }

    const total = misHoras.reduce((s, h) => s + Number(h.horas), 0);

    Modulos.modalForm(`
      <h2 style="margin:0 0 6px;font-size:22px">⏱ Horas de ${mecNombre}</h2>
      <p style="color:var(--muted);margin-bottom:20px;font-size:13px">
        ${new Date(this._anio, this._mes-1,1).toLocaleDateString('es-GT',{month:'long',year:'numeric'})}
        · Total: <strong>${total.toFixed(1)}h</strong>
      </p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>OT</th><th>Fecha</th><th>Horas</th><th></th></tr></thead>
          <tbody>
            ${misHoras.map(h => `
              <tr>
                <td style="font-size:13px;color:var(--muted)">${h.orden_id?.slice(0,8)}…</td>
                <td>${h.fecha}</td>
                <td><strong>${Number(h.horas).toFixed(1)}h</strong></td>
                <td>
                  <button class="btn btn-ghost btn-sm" style="color:var(--red)"
                    onclick="Modulos.kpi_mecanicos._borrarHoras('${h.id}','${mecId}','${mecNombre}')">✕</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="text-align:right;margin-top:16px">
        <button class="btn btn-ghost" onclick="Modulos.cerrarModal()">Cerrar</button>
      </div>
    `);
  },

  async _borrarHoras(id, mecId, mecNombre) {
    if (!confirm('¿Eliminar este registro de horas?')) return;
    await DB.deleteOtHoras(id);
    Modulos.cerrarModal();
    UI.toast('Registro eliminado', 'success');
    this.render();
  },
};
