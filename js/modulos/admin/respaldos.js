/* Respaldos — exportación on-demand de los datos del taller + bitácora.
   Los respaldos automáticos a nivel de base de datos los maneja la
   infraestructura (Supabase: respaldo diario). Aquí el taller puede
   descargar una copia completa de SUS datos cuando quiera y ver el historial. */
Modulos.respaldos = {
  _data: [],

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._data = await DB.getBackups(getTID()).catch(()=>[]);
    const ultimo = this._data[0];

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">💾 Respaldos</h1>
        <p class="page-subtitle">// copia de seguridad de los datos de tu taller</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.respaldos.respaldarAhora()">⬇️ Respaldar ahora</button>
        </div>
      </div>
      <div class="page-body">
        <div class="kpi-grid" style="margin-bottom:20px">
          ${UI.kpiCard({ icon:'🕓', clase:'cyan', label:'Último respaldo manual', value: ultimo?UI.fecha(ultimo.fecha):'—',
            trend: ultimo?`${ultimo.registros||0} registros · ${ultimo.tablas||0} tablas`:'aún sin respaldos' })}
          ${UI.kpiCard({ icon:'📦', clase:'amber', label:'Respaldos registrados', value: this._data.length })}
          ${UI.kpiCard({ icon:'⚙️', clase:'green', label:'Respaldo automático', value:'Diario', trend:'a nivel de base de datos' })}
        </div>

        <div class="alert alert-cyan" style="margin-bottom:18px">
          <div class="alert-icon">🛡️</div>
          <div class="alert-body" style="font-size:12px">
            Tus datos se respaldan <b>automáticamente todos los días</b> en la infraestructura segura del sistema.
            Además, con <b>“Respaldar ahora”</b> descargas una copia completa de tus datos (clientes, vehículos, órdenes,
            facturas, inventario, finanzas…) en un archivo <b>.json</b> que puedes guardar donde quieras.
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Tablas</th><th>Registros</th><th>Tamaño</th><th>Generado por</th></tr></thead>
            <tbody>
              ${this._data.map(b=>`<tr>
                <td>${UI.fechaHora?UI.fechaHora(b.fecha):UI.fecha(b.fecha)}</td>
                <td><span class="badge badge-${b.tipo==='automatico'?'green':'cyan'}">${b.tipo}</span></td>
                <td class="mono-sm">${b.tablas||0}</td>
                <td class="mono-sm">${b.registros||0}</td>
                <td class="mono-sm">${b.tamano_kb?b.tamano_kb+' KB':'—'}</td>
                <td>${b.creado_por||'—'}</td>
              </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin respaldos manuales todavía</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  async respaldarAhora() {
    UI.toast('Generando respaldo...','info');
    try {
      const dump = await DB.exportarDatosTenant();
      const json = JSON.stringify(dump, null, 2);
      const kb = Math.round(new Blob([json]).size / 1024);
      const nombre = (Auth.tenant?.slug || Auth.tenant?.name || 'taller').replace(/\s+/g,'_').toLowerCase();
      const fecha = new Date().toISOString().slice(0,10);

      /* Descargar archivo */
      const blob = new Blob([json], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `respaldo_${nombre}_${fecha}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);

      /* Registrar en bitácora */
      await DB.registrarBackup({
        tipo: 'manual',
        tablas: Object.keys(dump._meta?.tablas||{}).length,
        registros: dump._meta?.total_registros || 0,
        tamano_kb: kb,
        creado_por: Auth.user?.nombre || Auth.user?.email || 'usuario',
        notas: 'Exportación JSON descargada'
      }).catch(()=>{});

      UI.toast(`Respaldo descargado ✓ (${dump._meta?.total_registros||0} registros)`);
      this.render();
    } catch (e) {
      UI.toast('No se pudo generar el respaldo: '+(e.message||''),'error');
    }
  }
};
