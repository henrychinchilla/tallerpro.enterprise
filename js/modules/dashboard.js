/* ═══════════════════════════════════════════════════════
   modules/dashboard.js — Dashboard con datos de Supabase
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

Pages.dashboard = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Dashboard</h1></div>
    <div class="page-body"><div class="text-muted">Cargando datos...</div></div>`;

  /* ── Cargar datos en paralelo ─────────────────────── */
  const [kpis, ordenes, vehiculos, clientes] = await Promise.all([
    DB.getKPIs(),
    DB.getOrdenes(),
    DB.getVehiculos(),
    DB.getClientes()
  ]);

  const { totalClientes, otActivas, ingresos, stockBajo } = kpis;

  document.getElementById('page-content').innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">// Vista Gerencial — ${new Date().toLocaleDateString('es-GT',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
      </div>
    </div>
    <div class="page-body">

      ${stockBajo.length > 0 ? `
      <div class="alert alert-amber">
        <div class="alert-icon">⚠️</div>
        <div>
          <div class="alert-title">Inventario Bajo (${stockBajo.length} productos)</div>
          <div class="alert-body">${stockBajo.map(i=>`<b>${i.nombre}</b>`).join(', ')}
            <span class="text-amber" style="cursor:pointer" onclick="App.navigate('inventario')"> · Ver inventario →</span>
          </div>
        </div>
      </div>` : ''}

      <!-- KPIs -->
      <div class="kpi-grid">
        <div class="kpi-card amber">
          <div class="kpi-label">Ingresos — ${new Date().toLocaleDateString('es-GT',{month:'long',year:'numeric'})}</div>
          <div class="kpi-val amber">${UI.q(ingresos)}</div>
          <div class="kpi-trend">${ingresos===0?'Sin ingresos registrados este mes':'Facturas + ingresos directos'}</div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-label">OTs Activas</div>
          <div class="kpi-val cyan">${otActivas}</div>
          <div class="kpi-trend">En proceso</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-label">Clientes Activos</div>
          <div class="kpi-val green">${totalClientes}</div>
          <div class="kpi-trend">Registrados</div>
        </div>
        <div class="kpi-card red">
          <div class="kpi-label">Stock Bajo</div>
          <div class="kpi-val red">${stockBajo.length}</div>
          <div class="kpi-trend${stockBajo.length > 0 ? ' down' : ''}">Requieren atención</div>
        </div>
      </div>

      <!-- Charts -->
      <div class="grid-2" style="margin-bottom:20px">
        <div class="chart-box">
          <div class="chart-title">Ingresos Mensuales</div>
          <div class="chart-sub">ÚLTIMOS 6 MESES · Q GUATEMALTECOS</div>
          <div class="chart-canvas"><canvas id="chart-ingresos"></canvas></div>
        </div>
        <div class="chart-box">
          <div class="chart-title">OTs por Estado</div>
          <div class="chart-sub">DISTRIBUCIÓN ACTUAL</div>
          <div class="chart-canvas"><canvas id="chart-estados"></canvas></div>
        </div>
      </div>

      <!-- OTs recientes -->
      <div class="mb-4">
        <div class="flex items-center justify-between mb-3">
          <span style="font-weight:700;font-size:14px">OTs Recientes</span>
          <button class="btn btn-sm btn-ghost" onclick="App.navigate('ordenes')">Ver todas →</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Número</th><th>Vehículo</th><th>Cliente</th><th>Estado</th><th>Total</th></tr></thead>
            <tbody>
              ${ordenes.length === 0
                ? `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">Sin órdenes registradas</td></tr>`
                : ordenes.slice(0, 5).map(o => {
                    const v = o.vehiculos;
                    const c = o.clientes;
                    return `<tr onclick="Pages.verOT('${o.id}')">
                      <td class="mono-sm text-amber">${o.num}</td>
                      <td><b>${v?.marca || '—'} ${v?.modelo || ''}</b><br>
                          <span class="mono-sm text-muted">${v?.placa || ''}</span></td>
                      <td>${c?.nombre || '—'}</td>
                      <td>${UI.estadoBadge(o.estado)}</td>
                      <td class="mono-sm">${UI.q(o.total)}</td>
                    </tr>`;
                  }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- AI Recomendaciones -->
      ${vehiculos.length > 0 ? `
      <div class="card card-purple">
        <div class="card-sub" style="margin-bottom:12px">🤖 Motor de Recomendaciones AI</div>
        ${vehiculos.filter(v => v.kilometraje > 70000).slice(0, 2).map(v => `
        <div class="alert alert-amber" style="margin-bottom:8px">
          <div class="alert-icon">⚠️</div>
          <div>
            <div class="alert-title">${v.marca} ${v.modelo} — ${v.placa}</div>
            <div class="alert-body">Kilometraje: <b>${v.kilometraje?.toLocaleString()} km</b>.
              Verificar faja de distribución y mantenimiento preventivo.</div>
          </div>
        </div>`).join('') || '<div class="text-muted" style="font-size:13px">Sin alertas de mantenimiento por ahora.</div>'}
      </div>` : ''}

    </div>`;

  /* ── Charts ───────────────────────────────────────── */
  setTimeout(() => {
    const gridColor = 'rgba(30,45,61,0.6)', tickColor = '#7A9BB5';

    const ctx1 = document.getElementById('chart-ingresos');
    if (ctx1) App.charts.ingresos = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: ['Nov','Dic','Ene','Feb','Mar','Abr'],
        datasets: [{ label: 'Q', data: [18200,22400,19800,24100,21500, ingresos || 26800],
          backgroundColor: 'rgba(245,158,11,0.25)', borderColor: '#F59E0B',
          borderWidth: 2, borderRadius: 4 }]
      },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } },
          y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 },
               callback: v => 'Q' + v.toLocaleString() } }
        }
      }
    });

    const ctx2 = document.getElementById('chart-estados');
    if (ctx2) {
      const keys   = Object.keys(ESTADOS_OT);
      const counts = keys.map(k => ordenes.filter(o => o.estado === k).length);
      App.charts.estados = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: keys.map(k => ESTADOS_OT[k].label),
          datasets: [{ data: counts,
            backgroundColor: ['#3D5570','#06B6D4','#F59E0B','#8B5CF6','#10B981','#243444','#EF4444'],
            borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { color: tickColor, font: { size: 10 }, boxWidth: 10 } } }
        }
      });
    }
  }, 100);
};
