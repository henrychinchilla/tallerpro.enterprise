/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise — Documentos firmados (firma en pantalla)
   Captura firma(s) en un <canvas> → genera PDF (jsPDF) → calcula
   SHA-256 → sube a Supabase Storage (bucket privado 'documentos') →
   registra en la tabla 'documentos'. Visible desde el historial.
═══════════════════════════════════════════════════════ */
const Docs = {
  _jsPDF: null,

  /* Carga jsPDF bajo demanda (UMD por CDN) */
  async _ensureJsPDF() {
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    if (!this._jsPDF) {
      this._jsPDF = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
        s.onload = () => res(window.jspdf.jsPDF);
        s.onerror = () => rej(new Error('No se pudo cargar jsPDF'));
        document.head.appendChild(s);
      });
    }
    return this._jsPDF;
  },

  /* Abre un modal con un pad de firma por cada firmante.
     firmantes: [{ key, label, nombre? }]. Resuelve { [key]:dataURL, [key+'_nombre']:str } o null. */
  capturarFirmas(titulo, firmantes) {
    return new Promise(resolve => {
      const pads = firmantes.map(f => `
        <div style="margin-bottom:14px">
          <label class="form-label">${f.label}</label>
          <input class="form-input" id="fz-nom-${f.key}" placeholder="Nombre de quien firma" value="${f.nombre||''}" style="margin-bottom:6px">
          <div style="position:relative;border:1px dashed var(--border-default,#999);border-radius:8px;background:#fff">
            <canvas id="fz-cv-${f.key}" width="520" height="150" style="width:100%;height:150px;touch-action:none;border-radius:8px"></canvas>
            <button type="button" onclick="Docs._limpiar('${f.key}')" style="position:absolute;top:6px;right:6px;font-size:11px;background:#eee;border:none;border-radius:6px;padding:2px 8px;cursor:pointer">Limpiar</button>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Firme con el dedo o el mouse dentro del recuadro.</div>
        </div>`).join('');
      UI.modal(`✍️ ${titulo}`, `
        ${pads}
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="Docs._resolverFirma(null)">Cancelar</button>
          <button class="btn btn-amber" onclick="Docs._confirmarFirmas()">Firmar y guardar</button>
        </div>`, '560px');
      this._firmantes = firmantes;
      this._resolver = resolve;
      firmantes.forEach(f => this._initCanvas(f.key));
    });
  },

  _canvas: {},
  _initCanvas(key) {
    const cv = document.getElementById(`fz-cv-${key}`);
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cv.width,cv.height);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    let dibujando = false, vacio = true;
    const pos = e => {
      const r = cv.getBoundingClientRect();
      const cx = (e.touches?.[0]?.clientX ?? e.clientX) - r.left;
      const cy = (e.touches?.[0]?.clientY ?? e.clientY) - r.top;
      return { x: cx * (cv.width/r.width), y: cy * (cv.height/r.height) };
    };
    const start = e => { dibujando = true; vacio = false; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); e.preventDefault(); };
    const move  = e => { if (!dibujando) return; const p = pos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); e.preventDefault(); };
    const end   = () => { dibujando = false; };
    cv.addEventListener('pointerdown', start);
    cv.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    this._canvas[key] = { cv, get vacio(){ return vacio; }, set vacio(v){ vacio = v; } };
  },

  _limpiar(key) {
    const cv = document.getElementById(`fz-cv-${key}`);
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cv.width,cv.height);
    if (this._canvas[key]) this._canvas[key].vacio = true;
  },

  _confirmarFirmas() {
    const out = {};
    for (const f of this._firmantes) {
      const c = this._canvas[f.key];
      if (!c || c.vacio) { UI.toast(`Falta la firma: ${f.label}`,'error'); return; }
      out[f.key] = c.cv.toDataURL('image/png');
      out[f.key+'_nombre'] = document.getElementById(`fz-nom-${f.key}`)?.value.trim() || '';
    }
    this._resolverFirma(out);
  },

  _resolverFirma(val) {
    UI.cerrarModal();
    const r = this._resolver; this._resolver = null; this._canvas = {};
    if (r) r(val);
  },

  /* Genera el PDF. def: { titulo, subtitulo?, lineas:[{label,value}], tabla?:{head,rows}, nota? } */
  async generarPDF(def, firmas, firmantes) {
    const JsPDF = await this._ensureJsPDF();
    const doc = new JsPDF({ unit:'pt', format:'a4' });
    const W = doc.internal.pageSize.getWidth();
    let y = 48;
    doc.setFont('helvetica','bold'); doc.setFontSize(15);
    doc.text(Auth.tenant?.name || 'TallerPro Enterprise', 40, y);
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    y += 14; doc.text(`NIT: ${Auth.tenant?.nit||'—'}   ${Auth.tenant?.tel||''}`, 40, y);
    doc.setDrawColor(245,158,11); doc.setLineWidth(2); doc.line(40, y+8, W-40, y+8);
    y += 30;
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.text(def.titulo||'Documento', 40, y);
    if (def.subtitulo) { y += 16; doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.text(def.subtitulo, 40, y); }
    y += 22;
    doc.setFontSize(10);
    (def.lineas||[]).forEach(l => {
      doc.setFont('helvetica','bold'); doc.text(`${l.label}: `, 40, y);
      doc.setFont('helvetica','normal'); doc.text(String(l.value??'—'), 40 + doc.getTextWidth(`${l.label}: `), y);
      y += 16;
    });
    if (def.tabla?.rows?.length) {
      y += 8;
      doc.setFont('helvetica','bold'); doc.setFontSize(9.5);
      doc.text(def.tabla.head.join('     '), 40, y); y += 4;
      doc.setDrawColor(200); doc.setLineWidth(0.5); doc.line(40, y, W-40, y); y += 14;
      doc.setFont('helvetica','normal');
      def.tabla.rows.forEach(r => { doc.text(r.join('     '), 40, y); y += 14; if (y > 720) { doc.addPage(); y = 48; } });
    }
    if (def.nota) { y += 10; doc.setFontSize(9); doc.setTextColor(90); doc.text(doc.splitTextToSize(def.nota, W-80), 40, y); doc.setTextColor(0); y += 24; }

    /* Firmas */
    const arr = firmantes.filter(f => firmas[f.key]);
    const colW = (W-80) / Math.min(arr.length||1, 2);
    let fx = 40, fy = Math.max(y, 640);
    arr.forEach((f, i) => {
      if (i>0 && i%2===0) { fy += 120; fx = 40; }
      try { doc.addImage(firmas[f.key], 'PNG', fx, fy, 160, 60); } catch(_) {}
      doc.setDrawColor(0); doc.setLineWidth(0.6); doc.line(fx, fy+64, fx+180, fy+64);
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text(firmas[f.key+'_nombre']||'', fx, fy+78);
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text(f.label, fx, fy+90);
      fx += colW + 20;
    });
    const fecha = new Date().toLocaleString('es-GT');
    doc.setFontSize(7.5); doc.setTextColor(120);
    doc.text(`Generado ${fecha} · Documento con sello de integridad (SHA-256) en TallerPro`, 40, 815);

    const blob = doc.output('blob');
    const buf = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const sha256 = Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
    return { blob, sha256 };
  },

  /* Sube a Storage + registra en documentos */
  async guardar(entidad, entidadId, tipo, titulo, blob, sha256, firmantesMeta) {
    const tid = getTID();
    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    const path = `${tid}/${entidad}/${entidadId||'gen'}-${tipo||'doc'}-${ts}.pdf`;
    const { error: upErr } = await getSB().storage.from('documentos').upload(path, blob, { contentType:'application/pdf', upsert:false });
    if (upErr) return { error: upErr };
    const { data, error } = await getSB().from('documentos').insert({
      tenant_id: tid, entidad, entidad_id: entidadId||null, tipo, titulo,
      storage_path: path, sha256, firmantes: firmantesMeta||[],
      created_by: Auth.user?.id || null
    }).select().single();
    return { data, error };
  },

  /* Flujo completo: captura firmas → PDF → sube → registra */
  async firmarYGuardar({ entidad, entidadId, tipo, titulo, def, firmantes }) {
    const firmas = await this.capturarFirmas(titulo, firmantes);
    if (!firmas) return null;
    UI.toast('Generando documento firmado...','info');
    const { blob, sha256 } = await this.generarPDF(def, firmas, firmantes);
    const meta = firmantes.map(f => ({ rol:f.label, nombre: firmas[f.key+'_nombre']||'' }));
    const res = await this.guardar(entidad, entidadId, tipo, titulo, blob, sha256, meta);
    if (res.error) { UI.toast('Error al guardar documento: '+res.error.message,'error'); return null; }
    UI.toast('Documento firmado guardado ✓');
    return res.data;
  },

  async listar(entidad, entidadId) {
    const { data } = await getSB().from('documentos').select('*')
      .eq('tenant_id', getTID()).eq('entidad', entidad).eq('entidad_id', entidadId)
      .order('created_at', { ascending:false });
    return data || [];
  },

  /* Abre el PDF en una pestaña con URL firmada temporal */
  async abrir(path) {
    const { data, error } = await getSB().storage.from('documentos').createSignedUrl(path, 120);
    if (error || !data?.signedUrl) { UI.toast('No se pudo abrir el documento','error'); return; }
    window.open(data.signedUrl, '_blank');
  },

  /* HTML para listar documentos de una entidad (para los detalles/historiales) */
  async render(entidad, entidadId, contId) {
    const cont = document.getElementById(contId);
    if (!cont) return;
    const docs = await this.listar(entidad, entidadId);
    if (!docs.length) { cont.innerHTML = '<div class="text-muted" style="font-size:12px">Sin documentos firmados.</div>'; return; }
    cont.innerHTML = docs.map(d => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
        <div><b>📄 ${d.titulo||d.tipo||'Documento'}</b>
          <div style="color:var(--text3);font-size:11px">${(d.firmantes||[]).map(f=>`${f.rol}: ${f.nombre||'—'}`).join(' · ')} · ${UI.fechaHora(d.created_at)}</div>
        </div>
        <button class="btn btn-sm btn-cyan" onclick="Docs.abrir('${d.storage_path}')">Ver PDF</button>
      </div>`).join('');
  }
};
