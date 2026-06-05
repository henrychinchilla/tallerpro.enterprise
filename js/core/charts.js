/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/charts.js — Gráficas SVG nativas (sin dependencias)

   Theme-aware: usan var(--color) en los estilos, así que cambian
   solos con el tema. Responsivas vía viewBox.
═══════════════════════════════════════════════════════ */

const Charts = {

  _qCorto(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return 'Q' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return 'Q' + (n / 1e3).toFixed(1) + 'k';
    return 'Q' + Math.round(n);
  },

  /* ── ÁREA + LÍNEAS ─────────────────────────────────
     opts = { labels:[...], series:[{nombre, valores:[], colorVar, area?}] } */
  areaLineas({ labels, series, alto = 230 }) {
    const W = 600, H = alto, pL = 46, pR = 14, pT = 14, pB = 28;
    const plotW = W - pL - pR, plotH = H - pT - pB;
    const max = Math.max(1, ...series.flatMap(s => s.valores));
    const n = labels.length;
    const x = i => pL + (n <= 1 ? plotW / 2 : plotW * i / (n - 1));
    const y = v => pT + plotH * (1 - v / max);
    const base = pT + plotH;

    const grid = [0, .25, .5, .75, 1].map(t => {
      const gy = pT + plotH * t, val = max * (1 - t);
      return `<line x1="${pL}" y1="${gy}" x2="${W - pR}" y2="${gy}" style="stroke:var(--border)" stroke-width="1"/>
        <text x="${pL - 6}" y="${gy + 3}" text-anchor="end" style="fill:var(--text3)" font-size="9">${Charts._qCorto(val)}</text>`;
    }).join('');

    const dibujo = series.map(s => {
      const pts = s.valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      const area = s.area
        ? `<polygon points="${x(0).toFixed(1)},${base} ${pts.join(' ')} ${x(n - 1).toFixed(1)},${base}"
             style="fill:var(--${s.colorVar})" fill-opacity="0.13"/>` : '';
      const line = `<polyline points="${pts.join(' ')}" fill="none"
          style="stroke:var(--${s.colorVar})" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      const dots = s.valores.map((v, i) =>
        `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" style="fill:var(--${s.colorVar})"/>`).join('');
      return area + line + dots;
    }).join('');

    /* Etiquetas X espaciadas si hay muchos puntos */
    const step = Math.max(1, Math.ceil(n / 8));
    const xl = labels.map((l, i) =>
      (n <= 12 || i % step === 0 || i === n - 1)
        ? `<text x="${x(i).toFixed(1)}" y="${H - 9}" text-anchor="middle" style="fill:var(--text3)" font-size="10">${l}</text>`
        : '').join('');

    const legend = series.map(s =>
      `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);font-weight:600">
        <span style="width:11px;height:11px;border-radius:3px;background:var(--${s.colorVar})"></span>${s.nombre}</span>`).join('');

    return `<div style="display:flex;gap:16px;margin-bottom:8px">${legend}</div>
      <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible">
        ${grid}${dibujo}${xl}
      </svg>`;
  },

  /* ── DONA ──────────────────────────────────────────
     opts = { data:[{label, valor, colorVar}], unidad? } */
  dona({ data, unidad = 'órdenes' }) {
    const total = data.reduce((s, d) => s + d.valor, 0);
    const r = 64, cx = 90, cy = 90, sw = 24, C = 2 * Math.PI * r;
    let off = 0;
    const segs = total === 0
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:var(--surface3)" stroke-width="${sw}"/>`
      : data.filter(d => d.valor > 0).map(d => {
          const dash = (d.valor / total) * C;
          const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
            style="stroke:var(--${d.colorVar})" stroke-width="${sw}"
            stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}"
            stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
          off += dash; return seg;
        }).join('');

    const legend = data.map(d =>
      `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0">
        <span style="width:10px;height:10px;border-radius:50%;background:var(--${d.colorVar});flex-shrink:0"></span>
        <span style="color:var(--text2);flex:1">${d.label}</span>
        <span style="color:var(--text);font-weight:700">${d.valor}</span>
      </div>`).join('');

    return `<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <svg viewBox="0 0 180 180" width="158" height="158" style="flex-shrink:0">
        ${segs}
        <text x="90" y="86" text-anchor="middle" style="fill:var(--text)" font-size="30" font-weight="800">${total}</text>
        <text x="90" y="106" text-anchor="middle" style="fill:var(--text3)" font-size="11">${unidad}</text>
      </svg>
      <div style="flex:1;min-width:150px">${legend}</div>
    </div>`;
  },

  /* ── BARRAS HORIZONTALES (rankings) ────────────────
     opts = { data:[{label, valor}], colorVar } */
  barrasH({ data, colorVar = 'amber' }) {
    if (!data.length) return '';
    const max = Math.max(1, ...data.map(d => d.valor));
    const W = 600, pL = 4, pR = 4, rowH = 36, barMax = W - pL - pR;
    const H = data.length * rowH + 4;
    const rows = data.map((d, i) => {
      const y = i * rowH + 4;
      const w = Math.max(3, (d.valor / max) * barMax);
      return `
        <text x="${pL}" y="${y + 12}" style="fill:var(--text2)" font-size="12" font-weight="600">${d.label}</text>
        <text x="${W - pR}" y="${y + 12}" text-anchor="end" style="fill:var(--text)" font-size="12" font-weight="700">${Charts._qCorto(d.valor)}</text>
        <rect x="${pL}" y="${y + 18}" width="${barMax}" height="9" rx="4.5" style="fill:var(--surface3)"/>
        <rect x="${pL}" y="${y + 18}" width="${w.toFixed(1)}" height="9" rx="4.5" style="fill:var(--${colorVar})"/>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block">${rows}</svg>`;
  }
};
