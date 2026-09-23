/* NexusPro — Diagnóstico OBD · Datos en vivo: sensores, relojes, tarjetas, gráficas y grabación de sesión (el tablero vive en diagnostico_tablero.js).

   Es parte de Modulos.diagnostico_obd: el objeto se define en
   diagnostico_obd.js (núcleo y conexión) y cada parte le agrega sus métodos.
   Se dividió el 2026-09-22 porque el archivo único pasaba de 9.000 líneas.
   defineProperties + getOwnPropertyDescriptors (y no Object.assign) para que
   los get/set viajen como accesores y no como el valor del momento. */
(() => {
  const M = Modulos.diagnostico_obd;
  Object.defineProperties(M, Object.getOwnPropertyDescriptors({

  /* Mapa clave→[etiqueta, unidad] de todos los sensores */
  _labels() {
    const labels = { volt: ['Batería',''], ...this._LBLX };
    Object.values(this._PIDS).forEach(p => labels[p.k] = [p.l, p.u]);
    if (this._OEM_PIDS) {
      Object.values(this._OEM_PIDS).forEach(p => labels[p.k] = [p.l, p.u]);
    }
    return labels;
  },

  /* Definición de un sensor del monitor: PID OBD-II, o clave J1939/J1587 */
  _defSensor(p) {
    if (this._via === 'j1939' || this._via === 'j1708') { const lb = this._labels()[p]; return lb ? { k: p, l: lb[0], u: lb[1] } : null; }
    return this._PIDS[p] || (this._OEM_PIDS && this._OEM_PIDS[p]);
  },

  _sensoresMonitor() {
    if (this._sop && this._sop.length) return this._sop;
    if (this._via === 'j1708') return Object.keys((this._j87 && this._j87.datos) || (this._scan && this._scan.datos) || {});
    if (this._via === 'j1939') return Object.keys((this._j39 && this._j39.datos) || {});
    /* Al reabrir un escaneo guardado ya no existe _sop, pero sí quedaron los
       datos que se leyeron: se reconstruye la lista desde ahí. Antes caía a los
       7 básicos y parecía que el vehículo sólo daba un puñado de sensores. */
    const leidos = Object.keys((this._scan && this._scan.datos) || {});
    const desdeDatos = Object.keys(this._PIDS).filter(p => leidos.includes(this._PIDS[p].k));
    return desdeDatos.length ? desdeDatos : this._BASICOS;
  },

  /* Deja el selector listo apenas termina el escaneo: antes sólo aparecía al
     arrancar el monitor, así que parecía que no se podía elegir nada. */
  _chipsInicial() {
    if (!this._selMon) {
      const disp = this._sensoresMonitor().filter(p => this._defSensor(p));
      const basicos = (this._via === 'j1939' || this._via === 'j1708') ? ['rpm', 'temp', 'vel'] : ['0C', '05', '0D'];
      this._selMon = disp.filter(p => basicos.includes(p));
      if (!this._selMon.length) this._selMon = disp.slice(0, 3);
    }
    return this._chipsMonitor();
  },

  _selTodos(todos) {
    this._selMon = todos ? this._sensoresMonitor().filter(p => this._defSensor(p)) : [];
    const sel = document.getElementById('obd-mon-sel');
    if (sel) sel.innerHTML = this._chipsMonitor();
    const el = document.getElementById('obd-vivo');
    this._pintarVivo(el);
  },

  /* Convierte {clave:valor} a [[etiqueta, valor, unidad]] usando el catálogo de PIDs */
  _datosLista(d, excluir = []) {
    const labels = this._labels();
    return Object.entries(d || {})
      .filter(([k,v]) => v !== null && v !== undefined && labels[k] && !excluir.includes(k))
      .map(([k,v]) => [labels[k][0], v, labels[k][1]]);
  },

  _vivoHTML(d, excluir = []) {
    return this._vivoCategorizadoHTML(d, excluir);
  },

  _findPIDDefByKey(k) {
    if (k === 'volt') {
      return { k:'volt', l:'Voltaje Batería/ECU', u:' V', r:[13.2,14.8], rc:'motor encendido (alternador)', a:true, cat:'elec' };
    }
    if (this._OEM_PIDS && this._OEM_PIDS[k]) {
      return this._OEM_PIDS[k];
    }
    return Object.values(this._PIDS).find(p => p.k === k) || null;
  },

  _evaluarSensorKey(k, val) {
    const def = this._findPIDDefByKey(k);
    const lb = this._labels()[k] || [k, ''];

    let status = 'normal';
    let badge = '<span style="font-size:9.5px;padding:2px 6px;border-radius:4px;background:rgba(34,197,94,0.15);color:var(--green);font-weight:700">✓ NORMAL</span>';
    let ref = def && def.r
      ? `Ref: ${def.r[0]} – ${def.r[1]}${def.u}${def.rc ? ` (${def.rc})` : ''}`
      : `Ref: ${(def && def.rc) ? def.rc : 'Nominal / Estado normal'}`;

    if (def && typeof val === 'number' && def.r) {
      if (val < def.r[0] || val > def.r[1]) {
        if (def.a) {
          status = 'critico';
          badge = '<span style="font-size:9.5px;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.15);color:var(--red);font-weight:700">🚨 CRÍTICO</span>';
        } else {
          status = 'advertencia';
          badge = '<span style="font-size:9.5px;padding:2px 6px;border-radius:4px;background:rgba(245,158,11,0.15);color:var(--amber);font-weight:700">⚠️ ADVERTENCIA</span>';
        }
      }
    } else if (typeof val === 'string') {
      const vUpper = val.toUpperCase();
      if (vUpper.includes('BAJ') || vUpper.includes('FAIL') || vUpper.includes('ERR') || vUpper.includes('CRIT')) {
        status = 'critico';
        badge = '<span style="font-size:9.5px;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.15);color:var(--red);font-weight:700">🚨 CRÍTICO</span>';
      }
    }

    return {
      label: (def && def.l) || lb[0],
      unidad: (def && def.u !== undefined) ? def.u : lb[1],
      status,
      badge,
      ref,
      cat: (def && def.cat) || 'chassis'
    };
  },

  _vivoCategorizadoHTML(d, excluir = []) {
    const entries = Object.entries(d || {}).filter(([k, v]) => v !== null && v !== undefined && !excluir.includes(k));
    if (!entries.length) {
      return '<span style="color:var(--text3)">Sin datos (¿motor apagado?)</span>';
    }

    const catNombres = {
      motor: '🚀 Motor & Transmisión',
      mezcla: '⛽ Mezcla & Combustible',
      temp: '🌡️ Temperaturas',
      elec: '⚡ Sistema Eléctrico',
      chassis: '🚗 Chasis & Vehículo'
    };

    const grupos = { motor: [], mezcla: [], temp: [], elec: [], chassis: [] };

    for (const [k, v] of entries) {
      const evalData = this._evaluarSensorKey(k, v);
      const cat = evalData.cat && grupos[evalData.cat] ? evalData.cat : 'chassis';
      grupos[cat].push({ k, v, ...evalData });
    }

    let html = '';
    for (const [catKey, items] of Object.entries(grupos)) {
      if (!items.length) continue;
      html += `
        <div style="margin-top:10px">
          <div style="font-size:11px;font-weight:700;color:var(--brand);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">${catNombres[catKey]}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">
            ${items.map(i => {
              const colorBorder = i.status === 'critico' ? 'var(--red)' : i.status === 'advertencia' ? 'var(--amber)' : 'var(--border)';
              return `
                <div style="background:var(--surface2);border-radius:8px;padding:8px 10px;border:1px solid ${colorBorder}">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:11px;color:var(--text3);font-weight:600">${UI.esc(i.label)}</span>
                    ${i.badge}
                  </div>
                  <div style="font-size:18px;font-weight:800;color:var(--text);margin:2px 0">
                    ${i.v}<span style="font-size:12px;font-weight:600;color:var(--text3);margin-left:2px">${UI.esc(i.unidad)}</span>
                  </div>
                  ${i.ref ? `<div style="font-size:10px;color:var(--text3)">${UI.esc(i.ref)}</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
    return html;
  },

  _vivoCategorizadoPDF(d, excluir = []) {
    const entries = Object.entries(d || {}).filter(([k, v]) => v !== null && v !== undefined && !excluir.includes(k));
    if (!entries.length) return '';

    const catNombres = {
      motor: '🚀 MOTOR & TRANSMISIÓN',
      mezcla: '⛽ MEZCLA & COMBUSTIBLE',
      temp: '🌡️ TEMPERATURAS',
      elec: '⚡ SISTEMA ELÉCTRICO',
      chassis: '🚗 CHASIS & VEHÍCULO'
    };

    const grupos = { motor: [], mezcla: [], temp: [], elec: [], chassis: [] };

    for (const [k, v] of entries) {
      const evalData = this._evaluarSensorKey(k, v);
      const cat = evalData.cat && grupos[evalData.cat] ? evalData.cat : 'chassis';
      grupos[cat].push({ k, v, ...evalData });
    }

    let html = '<div class="section"><b>DATOS AL MOMENTO DEL ESCANEO:</b>';
    for (const [catKey, items] of Object.entries(grupos)) {
      if (!items.length) continue;
      html += `
        <div style="margin-top:8px">
          <b style="font-size:11px;color:#2563EB">${catNombres[catKey]}</b>
          <table style="margin-top:4px">
            <thead>
              <tr>
                <th style="font-size:11px">Sensor</th>
                <th style="font-size:11px">Valor Medido</th>
                <th style="font-size:11px">Rango de Referencia</th>
                <th style="font-size:11px">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(i => {
                const tagStatus = i.status === 'critico'
                  ? '<span style="color:#DC2626;font-weight:bold">🚨 CRÍTICO</span>'
                  : i.status === 'advertencia'
                  ? '<span style="color:#D97706;font-weight:bold">⚠️ ADVERTENCIA</span>'
                  : '<span style="color:#16A34A;font-weight:bold">✓ NORMAL</span>';
                return `
                  <tr>
                    <td><b>${UI.esc(i.label)}</b></td>
                    <td><b>${i.v}${UI.esc(i.unidad)}</b></td>
                    <td style="font-size:11px;color:#555">${UI.esc(i.ref || '—')}</td>
                    <td>${tagStatus}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    html += '</div>';
    return html;
  },

  /* ═══════════ MONITOR EN VIVO (sensores seleccionables + gráficas + grabación) ═══════════ */
  _selMon: null, _hist: null, _rec: null, _zoom: null,

  /* Clic en un recuadro: lo agranda a todo el ancho. El tick del monitor
     vuelve a dibujar solo, así que el valor ampliado sigue vivo. */
  _vistaMon: 'tarjetas',

  _setVistaMon(modo) {
    this._vistaMon = modo;
    const el = document.getElementById('obd-vivo');
    this._pintarVivo(el);
    const sel = document.getElementById('obd-mon-sel');
    if (sel) sel.innerHTML = this._chipsMonitor();
  },

  /* Un solo lugar pinta el área del monitor. El tablero en vivo
     (diagnostico_tablero.js) devuelve null cuando ya está dibujado: rehacer su
     HTML en cada vuelta del ciclo borraría el mapa y la foto 6 veces por segundo. */
  _pintarVivo(el) {
    if (!el) return;
    const html = this._tilesMonitor();
    if (html != null) el.innerHTML = html;
  },

  _toggleZoom(pid) {
    this._zoom = this._zoom === pid ? null : pid;
    const el = document.getElementById('obd-vivo');
    this._pintarVivo(el);
  },

  _spark(vals, ref = null, colorVar = 'cyan') {
    if (!vals || vals.length < 2 || typeof Charts === 'undefined') return '';
    const paso = Math.ceil(vals.length / 100);                    // downsample para SVG liviano
    const ds = paso > 1 ? vals.filter((_, i) => i % paso === 0) : vals;
    return Charts.sparkline({ valores: ds, colorVar, ref }).replace('<svg ', '<svg style="width:100%;height:100%" ');
  },

  /* Reloj analógico / Gauge SVG dinámico para datos en vivo */
  _gaugeSVG(val, minVal = 0, maxVal = 100, label = '', unit = '', colorVar = 'cyan') {
    const nVal = typeof val === 'number' && isFinite(val) ? val : null;
    const min = typeof minVal === 'number' ? minVal : 0;
    const max = typeof maxVal === 'number' && maxVal > min ? maxVal : 100;
    const pct = nVal !== null ? Math.min(1, Math.max(0, (nVal - min) / (max - min))) : 0;

    const angle = -225 + (pct * 270);
    const rad = Math.PI / 180;
    const cx = 60, cy = 60, r = 44;

    const x1 = cx + r * Math.cos(-225 * rad);
    const y1 = cy + r * Math.sin(-225 * rad);
    const x2 = cx + r * Math.cos(angle * rad);
    const y2 = cy + r * Math.sin(angle * rad);
    const xEnd = cx + r * Math.cos(45 * rad);
    const yEnd = cy + r * Math.sin(45 * rad);

    const largeArcVal = (angle - (-225)) > 180 ? 1 : 0;
    const colorMap = { cyan: '#06b6d4', green: '#22c55e', amber: '#f59e0b', red: '#ef4444' };
    const strokeColor = colorMap[colorVar] || '#06b6d4';

    return `<svg viewBox="0 0 120 100" style="width:100%;height:100%;max-height:110px;display:block;margin:0 auto">
      <path d="M ${x1} ${y1} A ${r} ${r} 0 1 1 ${xEnd} ${yEnd}" fill="none" stroke="var(--border)" stroke-width="8" stroke-linecap="round"/>
      ${nVal !== null && pct > 0 ? `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArcVal} 1 ${x2} ${y2}" fill="none" stroke="${strokeColor}" stroke-width="9" stroke-linecap="round"/>` : ''}
      <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="18" font-weight="800" fill="var(--text)">${nVal !== null ? (Math.round(nVal * 10) / 10) : '—'}</text>
      <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="9" font-weight="600" fill="var(--text3)">${UI.esc(unit)}</text>
    </svg>`;
  },

  /* Cómo está el sensor contra su referencia */
  _estadoSensor(def, v) {
    if (!def || !def.r || typeof v !== 'number') return null;
    if (v >= def.r[0] && v <= def.r[1]) return 'ok';
    return def.a ? 'mal' : 'fuera';
  },

  _chipsMonitor() {
    const disp = this._sensoresMonitor().filter(p => this._defSensor(p));
    const n = (this._selMon || []).length;
    const seg = Math.max(0.2, n * 0.32).toFixed(1);
    const modo = this._vistaMon || 'tarjetas';

    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <b style="font-size:11.5px">Sensores a monitorear — ${n} de ${disp.length}</b>
          <button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd._selTodos(true)">Todos</button>
          <button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd._selTodos(false)">Ninguno</button>
          <span style="font-size:10.5px;color:var(--text3)">refresco ≈ ${seg} s</span>
        </div>
        <div style="display:inline-flex;gap:3px;background:var(--surface);padding:3px;border:1px solid var(--border);border-radius:9px">
          <button class="btn btn-sm ${modo === 'tarjetas' ? 'btn-brand' : 'btn-ghost'}" style="padding:3px 10px;font-size:11px" onclick="Modulos.diagnostico_obd._setVistaMon('tarjetas')">📊 Tarjetas</button>
          <button class="btn btn-sm ${modo === 'gauges' ? 'btn-brand' : 'btn-ghost'}" style="padding:3px 10px;font-size:11px" onclick="Modulos.diagnostico_obd._setVistaMon('gauges')">⏲️ Relojes (Gauges)</button>
          <button class="btn btn-sm ${modo === 'graficas' ? 'btn-brand' : 'btn-ghost'}" style="padding:3px 10px;font-size:11px" onclick="Modulos.diagnostico_obd._setVistaMon('graficas')">📈 Gráficas</button>
          <button class="btn btn-sm ${modo === 'tablero' ? 'btn-brand' : 'btn-ghost'}" style="padding:3px 10px;font-size:11px" onclick="Modulos.diagnostico_obd._setVistaMon('tablero')">🎛 Tablero</button>
        </div>
      </div>
      <div>${disp.map(p => {
        const def = this._defSensor(p), on = (this._selMon || []).includes(p);
        return `<label style="font-size:11.5px;display:inline-flex;align-items:center;gap:4px;background:var(--surface2);border:1px solid var(--${on ? 'cyan' : 'border'});border-radius:12px;padding:4px 9px;cursor:pointer;margin:0 5px 5px 0;opacity:${on ? 1 : .7}">
          <input type="checkbox" ${on ? 'checked' : ''} onchange="Modulos.diagnostico_obd._toggleSel('${p}',this.checked)"> ${def.l}</label>`;
      }).join('')}</div>`;
  },

  _toggleSel(pid, on) {
    if (on && !this._selMon.includes(pid)) this._selMon.push(pid);
    if (!on) this._selMon = this._selMon.filter(x => x !== pid);
    const sel = document.getElementById('obd-mon-sel');
    if (sel) sel.innerHTML = this._chipsMonitor();
  },

  _tilesMonitor() {
    const modo = this._vistaMon || 'tarjetas';
    if (!this._selMon || !this._selMon.length) return '<span style="color:var(--text3)">Selecciona al menos un sensor arriba</span>';

    return this._selMon.map(p => {
      const def = this._defSensor(p);
      if (!def) return '';
      const vals = (this._hist[def.k] || []).filter(x => typeof x === 'number');
      const v = vals.length ? vals[vals.length - 1] : null;
      const est = this._estadoSensor(def, v);
      const color = est === 'mal' ? 'red' : est === 'ok' ? 'green' : 'cyan';
      const redondo = x => Math.round(x * 100) / 100;
      const mm = vals.length > 0
        ? `Mín: ${redondo(Math.min(...vals))}${def.u||''} | Máx: ${redondo(Math.max(...vals))}${def.u||''}` : '';
      const ref = def.r
        ? `ref ${def.r[0]}–${def.r[1]}${def.u}${def.rc ? ` (${def.rc})` : ''}`
        : 'sin referencia';
      const z = this._zoom === p;

      if (modo === 'gauges') {
        const minVal = (def.r && typeof def.r[0] === 'number') ? Math.min(0, def.r[0]) : 0;
        let maxVal = (def.r && typeof def.r[1] === 'number') ? def.r[1] * 1.2 : 100;
        if (def.k === 'rpm') maxVal = 7000;
        else if (def.k === 'vel') maxVal = 220;
        else if (def.k === 'temp') maxVal = 130;
        else if (def.k === 'volt' || def.k === 'volt_ecu') maxVal = 18;
        else if (def.k === 'carga' || def.k === 'acel' || def.k === 'comb') maxVal = 100;

        return `<div onclick="Modulos.diagnostico_obd._toggleZoom('${p}')" title="Clic para ampliar/reducir"
          style="background:var(--surface2);border-radius:10px;padding:12px;border:1px solid var(--border);border-top:3px solid var(--${color});text-align:center;cursor:pointer${z ? ';grid-column:1/-1' : ''}">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px;display:flex;justify-content:space-between">
            <span>${def.l}</span>
            <span style="font-size:10px;color:var(--${color})">${est === 'mal' ? '⚠ ALERTA' : est === 'ok' ? '✓ NORMAL' : 'EN VIVO'}</span>
          </div>
          ${this._gaugeSVG(v, minVal, maxVal, def.l, def.u, color)}
          <div style="font-size:10px;color:var(--text3);margin-top:4px">${mm ? `<b style="color:var(--text2)">${mm}</b> · ` : ''}${ref}</div>
        </div>`;
      }

      if (modo === 'graficas') {
        return `<div onclick="Modulos.diagnostico_obd._toggleZoom('${p}')" title="Clic para ampliar/reducir"
          style="background:var(--surface2);border-radius:10px;padding:12px;border:1px solid var(--border);border-left:4px solid var(--${color});cursor:pointer${z ? ';grid-column:1/-1' : ';grid-column:span 2'}">
          <div style="font-size:12px;font-weight:700;color:var(--text);display:flex;justify-content:space-between;align-items:center">
            <span>${def.l}</span>
            <div style="font-size:18px;font-weight:800;color:var(--text)">${v === null ? '—' : v} <span style="font-size:12px;font-weight:500;color:var(--text3)">${def.u}</span></div>
          </div>
          <div style="height:${z ? '220px' : '110px'};margin:8px 0">${this._spark(vals, def.r, color)}</div>
          <div style="font-size:10px;color:var(--text3);display:flex;justify-content:space-between">
            <span>${mm ? `<b style="color:var(--text2)">${mm}</b>` : ''}</span><span>${ref}</span>
          </div>
        </div>`;
      }

      // Modo por defecto: 'tarjetas'
      return `<div onclick="Modulos.diagnostico_obd._toggleZoom('${p}')" title="Clic para ${z ? 'reducir' : 'ampliar'}"
        style="background:var(--surface2);border-radius:10px;padding:${z ? '16px 18px' : '11px 13px'};border-left:4px solid var(--${color});cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.04)${z ? ';grid-column:1/-1' : ''}">
        <div style="font-size:${z ? '14px' : '11px'};color:var(--text3);display:flex;justify-content:space-between;gap:6px;align-items:baseline">
          <span style="font-weight:600">${def.l}</span>${est === 'mal'
            ? '<span style="color:var(--red);font-weight:700">⚠ FUERA</span>'
            : `<span style="opacity:.45">${z ? '⤡' : '⤢'}</span>`}
        </div>
        <div style="font-size:${z ? '56px' : '26px'};font-weight:800;line-height:1.15;margin:4px 0${est === 'mal' ? ';color:var(--red)' : ''}">${v === null ? '—' : v}<span style="font-size:${z ? '22px' : '13px'};font-weight:600;color:var(--text3);margin-left:2px">${def.u}</span></div>
        <div style="height:${z ? '160px' : '48px'};margin:4px 0">${this._spark(vals, def.r, color)}</div>
        <div style="font-size:${z ? '12.5px' : '10.5px'};color:var(--text3);line-height:1.4">${mm ? `<b style="color:var(--text2)">${mm}</b> · ` : ''}${ref}</div>
      </div>`;
    }).join('');
  },

  async toggleLive() {
    if (this._liveTimer) { this._stopLive(); return; }
    if (!this._listo) { UI.toast('Adaptador desconectado — vuelve a escanear', 'error'); return; }
    this._hist = {};
    const btn = document.getElementById('obd-btn-live'); if (btn) btn.textContent = '⏸ Detener';
    const rec = document.getElementById('obd-btn-rec');  if (rec) rec.style.display = '';
    const sel = document.getElementById('obd-mon-sel');
    if (sel) { sel.style.display = ''; sel.innerHTML = this._chipsInicial(); }
    const tick = async () => {
      if (!this._liveTimer) return;
      if (!this._listo) { this._stopLive(); return; }
      const d = await this._leerVivo(this._selMon);
      if (this._scan) this._scan.datos = { ...this._scan.datos, ...d };
      for (const [k, v] of Object.entries(d)) {
        if (typeof v !== 'number') continue;
        (this._hist[k] = this._hist[k] || []).push(v);
        if (this._hist[k].length > 120) this._hist[k].shift();
      }
      if (this._rec) this._rec.muestras.push({ t: Math.round((Date.now() - this._rec.t0) / 100) / 10, ...d });
      const el = document.getElementById('obd-vivo');
      if (!el) { this._stopLive(); return; }
      this._pintarVivo(el);
      const info = document.getElementById('obd-rec-info');
      if (info && this._rec) info.textContent = `⏺ Grabando: ${this._rec.muestras.length} muestras · ${Math.round((Date.now() - this._rec.t0) / 1000)}s · ${(this._rec.marcadores||[]).length} marcador(es)`;
      if (this._liveTimer) this._liveTimer = setTimeout(tick, 150);
    };
    this._liveTimer = setTimeout(tick, 0);
  },

  _stopLive() {
    if (this._liveTimer) { clearTimeout(this._liveTimer); this._liveTimer = null; }
    if (this._rec) this._detenerGrab(false);
    const btn = document.getElementById('obd-btn-live');
    if (btn) btn.textContent = '▶️ Monitor en vivo';
  },

  toggleRec() {
    if (this._rec) { this._detenerGrab(true); return; }
    this._rec = { t0: Date.now(), inicio: new Date().toISOString(), muestras: [], marcadores: [] };
    const b = document.getElementById('obd-btn-rec');
    if (b) b.textContent = '⏹ Detener grabación';
    const bm = document.getElementById('obd-btn-marca'); if(bm)bm.style.display='';
    if (!this._liveTimer) this.toggleLive();
  },

  _detenerGrab(avisar) {
    const rec = this._rec; this._rec = null;
    const b = document.getElementById('obd-btn-rec');
    if (b) b.textContent = '⏺ Grabar sesión';
    const bm = document.getElementById('obd-btn-marca'); if(bm)bm.style.display='none';
    const info = document.getElementById('obd-rec-info');
    if (rec && rec.muestras.length && this._scan) {
      const seg = Math.round((Date.now() - rec.t0) / 1000);
      this._scan.grabacion = { inicio: rec.inicio, seg, muestras: rec.muestras, marcadores:rec.marcadores||[] };
      if (info) info.textContent = `💾 Grabación lista: ${rec.muestras.length} muestras · ${seg}s — se guarda con el escaneo`;
      if (avisar) UI.toast(`Grabación capturada (${rec.muestras.length} muestras) — presiona Guardar`);
    } else if (info) info.textContent = '';
  },

  modalMarcadorGrabacion() {
    if(!this._rec)return UI.toast('Inicia una grabación antes de marcar un evento','warn');
    UI.modal('📍 Marcar evento',`<label class="form-label">¿Qué ocurrió en este momento?</label><select class="form-select" id="obd-marca-tipo"><option>Aceleración</option><option>Falla / tirón</option><option>Ralentí</option><option>Frenado</option><option>Cambio de marcha</option><option>Ventilador activado</option><option>Prueba del técnico</option><option>Otro</option></select><label class="form-label" style="margin-top:10px">Nota</label><input class="form-input" id="obd-marca-nota" maxlength="160" placeholder="Descripción breve"><div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button><button class="btn btn-brand" onclick="Modulos.diagnostico_obd.guardarMarcadorGrabacion()">Guardar marcador</button></div>`,'520px');
  },

  guardarMarcadorGrabacion() {
    if(!this._rec)return;
    const tipo=document.getElementById('obd-marca-tipo')?.value||'Otro',nota=document.getElementById('obd-marca-nota')?.value.trim()||'';
    const ultimo=this._rec.muestras[this._rec.muestras.length-1]||{};
    this._rec.marcadores.push({t:Math.round((Date.now()-this._rec.t0)/100)/10,tipo,nota,valores:{...ultimo}});
    UI.cerrarModal();UI.toast(`Marcador “${tipo}” guardado ✓`);
  },

  /* Estadísticas de una grabación: [{l, u, vals, min, avg, max}] */
  _grabStats(g) {
    if (!g?.muestras?.length) return [];
    const labels = this._labels(), llaves = new Set();
    g.muestras.forEach(m => Object.keys(m).forEach(k => k !== 't' && llaves.add(k)));
    return [...llaves].map(k => {
      const vals = g.muestras.map(m => m[k]).filter(v => typeof v === 'number');
      if (!vals.length || !labels[k]) return null;
      return { k, l: labels[k][0], u: labels[k][1], vals,
               min: Math.min(...vals), max: Math.max(...vals),
               avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 };
    }).filter(Boolean);
  },

  _compararGrabaciones(antes, despues) {
    const a=new Map(this._grabStats(antes).map(x=>[x.k,x])), b=this._grabStats(despues);
    return b.filter(x=>a.has(x.k)).map(x=>({k:x.k,l:x.l,u:x.u,antes:a.get(x.k).avg,despues:x.avg,cambio:Math.round((x.avg-a.get(x.k).avg)*10)/10}));
  },

  _grabAnterior(d) {
    return (this._data||[]).filter(x=>x.id!==d.id&&x.vehiculo_id===d.vehiculo_id&&x.grabacion?.muestras?.length&&new Date(x.created_at)<new Date(d.created_at)).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]||null;
  },

  _grabComparacionHTML(d) {
    const ant=this._grabAnterior(d), filas=ant?this._compararGrabaciones(ant.grabacion,d.grabacion):[];
    if(!filas.length)return '';
    return `<div class="card" style="padding:14px;margin-top:12px"><b>↔ COMPARACIÓN CON GRABACIÓN ANTERIOR</b><table class="table" style="margin-top:8px"><thead><tr><th>Sensor</th><th>Antes</th><th>Después</th><th>Cambio</th></tr></thead><tbody>${filas.map(x=>`<tr><td>${UI.esc(x.l)}</td><td>${x.antes}${UI.esc(x.u)}</td><td>${x.despues}${UI.esc(x.u)}</td><td>${x.cambio>0?'+':''}${x.cambio}${UI.esc(x.u)}</td></tr>`).join('')}</tbody></table></div>`;
  },

  _grabMuestrasPDF(g) {
    if(!g?.muestras?.length)return '';
    const labels=this._labels(),claves=[...new Set(g.muestras.flatMap(m=>Object.keys(m).filter(k=>k!=='t'&&typeof m[k]==='number')))];
    const marcas=g.marcadores||[],marcaEn=t=>marcas.filter(x=>Math.abs(Number(x.t)-Number(t))<0.11).map(x=>`${x.tipo}${x.nota?': '+x.nota:''}`).join(' · ');
    return `<div class="section page-break"><b>ANEXO — TODAS LAS MUESTRAS (${g.muestras.length}):</b><table style="margin-top:8px;font-size:9px"><thead><tr><th>t (s)</th>${claves.map(k=>`<th>${UI.esc(labels[k]?.[0]||k)} ${UI.esc(labels[k]?.[1]||'')}</th>`).join('')}<th>Evento</th></tr></thead><tbody>${g.muestras.map(m=>`<tr><td>${m.t}</td>${claves.map(k=>`<td>${typeof m[k]==='number'?m[k]:'—'}</td>`).join('')}<td>${UI.esc(marcaEn(m.t))}</td></tr>`).join('')}</tbody></table></div>`;
  },

  _grabComparacionPDF(d) {
    const ant=this._grabAnterior(d),filas=ant?this._compararGrabaciones(ant.grabacion,d.grabacion):[];if(!filas.length)return '';
    return `<div class="section"><b>COMPARACIÓN ANTES / DESPUÉS:</b><p style="font-size:11px">Contra la grabación del ${UI.fecha(ant.created_at)}.</p><table><thead><tr><th>Sensor</th><th>Antes</th><th>Después</th><th>Cambio</th></tr></thead><tbody>${filas.map(x=>`<tr><td>${UI.esc(x.l)}</td><td>${x.antes}${UI.esc(x.u)}</td><td>${x.despues}${UI.esc(x.u)}</td><td>${x.cambio>0?'+':''}${x.cambio}${UI.esc(x.u)}</td></tr>`).join('')}</tbody></table></div>`;
  },

  _grabHTML(g) {
    const stats = this._grabStats(g);
    if (!stats.length) return '';
    return `<div class="card" style="padding:14px;margin-top:12px;border-left:3px solid var(--cyan)">
      <b style="font-size:12px">📈 GRABACIÓN DE SESIÓN (${g.muestras.length} muestras · ${g.seg || '?'} s)</b>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:6px;font-size:12px">
        ${stats.map(s => `<div style="background:var(--surface2);border-radius:6px;padding:6px 8px">
          <div style="font-size:10px;color:var(--text3)">${s.l}</div>
          <div style="height:30px">${this._spark(s.vals)}</div>
          <div style="font-size:10px;color:var(--text3)">min ${s.min} · prom ${s.avg} · max ${s.max}${s.u}</div>
        </div>`).join('')}
      </div>
    </div>`;
  }
  }));
})();
