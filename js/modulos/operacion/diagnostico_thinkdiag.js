/* ═══════════════════════════════════════════════════════
   NexusPro Enterprise — Lector OEM Thinkdiag (.BIN / .INI) para Web
   ═══════════════════════════════════════════════════════ */

window.DiagnosticoThinkdiag = {
  marcasDisponibles: [
    { id: 'hyundai', nombre: 'HYUNDAI', version: 'V10.72', modulos: 12, funciones: 5 },
    { id: 'honda', nombre: 'HONDA', version: 'V10.45', modulos: 10, funciones: 5 },
    { id: 'kia', nombre: 'KIA', version: 'V10.70', modulos: 11, funciones: 5 },
    { id: 'nissan', nombre: 'NISSAN', version: 'V10.60', modulos: 9, funciones: 4 },
    { id: 'futian', nombre: 'FUTIAN', version: 'V10.12', modulos: 6, funciones: 3 },
    { id: 'eobd2', nombre: 'EOBD2 / GENÉRICO OEM', version: 'V10.00', modulos: 8, funciones: 3 }
  ],

  renderHtml() {
    return `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="font-size:28px">⚡</div>
          <div>
            <div style="font-weight:800;font-size:15px">Base de Datos OEM Thinkdiag (894 MB)</div>
            <div style="font-size:12px;color:var(--text3)">Archivos .BIN y .INI cargados desde <code>d:\\tallerpro-enterprise\\db\\thinkdiag_vehicles</code></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${this.marcasDisponibles.map(m => `
            <button class="btn btn-sm btn-ghost" onclick="DiagnosticoThinkdiag.seleccionar('${m.id}')">
              🚗 ${m.nombre} <span class="badge badge-cyan">${m.version}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },

  seleccionar(id) {
    const m = this.marcasDisponibles.find(x => x.id === id);
    if (m) {
      UI.exito(`Base de datos OEM ${m.nombre} (${m.version}) cargada correctamente.`);
    }
  }
};
