/* ════════════════════════════════════════════════════════════════
   formularios_sat.js — Formularios Tributarios SAT (Declaraguate)
   Porteado fielmente desde FerreProGT (finances_sat_templates.js +
   finances.js). Mismas fórmulas, mismos campos, mismo HTML.
   Adaptado solo en idioma de llamada:
     - DB.getFacturasPeriodo/getComprasPeriodo/getEgresosIvaPeriodo/
       getRetencionesPeriodo/getFormulariosTributarios/upsertFormularioTributario
     - UI.loading(el)/UI.modal(titulo,html,ancho)/UI.toast/UI.q
     - datos_formulario es JSONB (no se hace JSON.parse)
     - contenedor de render: #cont-content
     - Modulos.contabilidad._renderTab() en vez de renderTab()
   ════════════════════════════════════════════════════════════════ */

Modulos.contabilidad.sat = {

  FORM_LABELS: {
    'SAT-2046': 'IVA PEQUEÑO CONTRIBUYENTE',
    'SAT-2237': 'IVA GENERAL',
    'SAT-1311': 'ISR OPCIONAL MENSUAL',
    'SAT-1361': 'ISR TRIMESTRAL SOBRE UTILIDADES',
    'SAT-1608': 'IMPUESTO DE SOLIDARIDAD (ISO)',
    'SAT-1331': 'ISR RETENCIONES EN COMPRAS',
    'SAT-2085': 'IVA FACTURAS ESPECIALES',
    'SAT-1431': 'ISR RETENCIONES POR TRABAJO',
    'SAT-1411': 'ISR ANUAL ACTIVIDADES LUCRATIVAS'
  },

  /* Formularios aplicables según régimen fiscal (LAT Decreto 10-2012 + IVA 27-92).
     Siempre incluidos: SAT-1331, SAT-2085, SAT-1431 (aplican a todos los regímenes). */
  _formsParaRegimen(fiscal) {
    const pequeno   = (fiscal?.regimen_iva||'general').toLowerCase().startsWith('peque');
    const utilidades= (Number(fiscal?.tasa_isr)||0.05) >= 0.2;
    if (pequeno) {
      return [
        { id:'SAT-2046', label:'IVA Pequeño Contribuyente (SAT-2046)', obligatorio:true },
        { id:'SAT-1331', label:'ISR Retenciones sobre Facturas (SAT-1331)', obligatorio:false },
        { id:'SAT-2085', label:'IVA Facturas Especiales (SAT-2085)', obligatorio:false },
        { id:'SAT-1431', label:'ISR Retenciones Relación Dependencia (SAT-1431)', obligatorio:false },
      ];
    }
    if (utilidades) {
      return [
        { id:'SAT-2237', label:'IVA General Régimen General (SAT-2237)', obligatorio:true },
        { id:'SAT-1361', label:'ISR Trimestral Actividades Lucrativas (SAT-1361)', obligatorio:true },
        { id:'SAT-1608', label:'Impuesto de Solidaridad ISO Trimestral (SAT-1608)', obligatorio:true },
        { id:'SAT-1411', label:'ISR Anual Actividades Lucrativas (SAT-1411) ⚠️ cierre dic', obligatorio:true },
        { id:'SAT-1331', label:'ISR Retenciones sobre Facturas (SAT-1331)', obligatorio:false },
        { id:'SAT-2085', label:'IVA Facturas Especiales (SAT-2085)', obligatorio:false },
        { id:'SAT-1431', label:'ISR Retenciones Relación Dependencia (SAT-1431)', obligatorio:false },
      ];
    }
    /* Régimen General + ISR Opcional Simplificado (default) */
    return [
      { id:'SAT-2237', label:'IVA General Régimen General (SAT-2237)', obligatorio:true },
      { id:'SAT-1311', label:'ISR Opcional Mensual (SAT-1311)', obligatorio:true },
      { id:'SAT-1331', label:'ISR Retenciones sobre Facturas (SAT-1331)', obligatorio:false },
      { id:'SAT-2085', label:'IVA Facturas Especiales (SAT-2085)', obligatorio:false },
      { id:'SAT-1431', label:'ISR Retenciones Relación Dependencia (SAT-1431)', obligatorio:false },
    ];
  },

  /* ── LISTA ──────────────────────────────────────────────────── */
  async renderLista(parent) {
    const el = document.getElementById('cont-content');
    if (!el) return;
    /* Sin editor abierto → liberar guardia de salida */
    this._editorDirty = false;
    App._unsavedGuard = null;
    window.onbeforeunload = null;

    let list = [];
    try {
      list = await DB.getFormulariosTributarios();
    } catch (err) {
      UI.toast(err.message, "error");
    }

    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:12px;">
        <span class="badge badge-info">Historial de Declaraciones SAT</span>
        <button class="btn btn-primary" onclick="Modulos.contabilidad.sat.modalNuevoFormulario()">＋ Nueva Declaración SAT</button>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Formulario</th>
              <th>NIT</th>
              <th>Período</th>
              <th>Formulario No.</th>
              <th>Acceso No.</th>
              <th>Impuesto (Q)</th>
              <th>Total a Pagar</th>
              <th>Estado</th>
              <th class="no-sort" style="text-align:right;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(f => {
              const periodo = f.periodo_mes ? `${f.periodo_mes}/${f.periodo_anio}` : `Trimestre ${f.periodo_anio}`;
              const badgeClass = f.estado === 'pagado' ? 'badge-success' : f.estado === 'presentado' ? 'badge-info' : 'badge-warning';
              const badgeLabel = f.estado === 'pagado' ? 'Pagado' : f.estado === 'presentado' ? 'Presentado' : 'Borrador';
              return `
                <tr>
                  <td style="font-weight:700;">${Modulos.contabilidad.sat.FORM_LABELS[f.tipo_formulario] || f.tipo_formulario}</td>
                  <td><code>${f.nit}</code></td>
                  <td>${periodo}</td>
                  <td><code>${f.numero_formulario || '—'}</code></td>
                  <td><code>${f.numero_acceso || '—'}</code></td>
                  <td>${UI.q(f.monto_impuesto)}</td>
                  <td style="font-weight:700; color:var(--warning-color);">${UI.q(f.total_pagar)}</td>
                  <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
                  <td style="text-align:right; white-space:nowrap;">
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.contabilidad.sat.abrirEditorFormulario('${f.id}')" title="Editar/Ver">👁️ Ver/Editar</button>
                    <button class="btn btn-sm btn-success" onclick="Modulos.contabilidad.sat.imprimirFormulario('${f.id}')" title="Imprimir">🖨️ Imprimir</button>
                    ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('formularios_tributarios', '${f.id}', 'esta declaración', () => Modulos.contabilidad._renderTab())`)}
                  </td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--text-muted);">No hay declaraciones tributarias registradas.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  },

  /* ── MODAL NUEVA DECLARACIÓN ────────────────────────────────── */
  async modalNuevoFormulario() {
    let tenant = {};
    try { tenant = await DB.getTenant() || {}; } catch(e) {}
    const fiscal = Modulos.contabilidad._fiscal || await DB.getConfigFiscalFresh().catch(()=>({})) || {};
    const pequeno    = (fiscal.regimen_iva||'general').toLowerCase().startsWith('peque');
    const utilidades = (Number(fiscal.tasa_isr)||0.05) >= 0.2;
    const regimenLabel = pequeno ? 'Pequeño Contribuyente (IVA 5%)' : utilidades ? 'Régimen Sobre Utilidades (ISR 25%)' : 'Régimen Opcional Simplificado (ISR 5%/7%)';

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const forms = this._formsParaRegimen(fiscal);

    UI.modal("＋ Nueva Declaración SAT", `
      <form id="modal-nuevo-formulario-form" style="text-align:left;">
        <!-- Bloque régimen fiscal -->
        <div style="border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:16px;background:var(--surface2)">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div>
              <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Régimen fiscal activo</div>
              <div style="font-weight:800;font-size:14px">${regimenLabel}</div>
            </div>
            <button type="button" class="btn btn-sm btn-ghost" onclick="Modulos.contabilidad.sat.modalCambiarRegimen()">⚙️ Cambiar régimen</button>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px">Solo se muestran los formularios que corresponden a su régimen actual. Los demás quedan ocultos.</div>
        </div>
        <div class="form-group">
          <label class="form-label">NIT del Contribuyente *</label>
          <input type="text" id="m-form-nit" class="form-control" value="${tenant.nit || 'CF'}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de Formulario SAT *</label>
          <select id="m-form-tipo" class="form-control" onchange="Modulos.contabilidad.sat.togglePeriodoFields(this.value)">
            ${forms.map((f,i)=>`<option value="${f.id}" ${i===0?'selected':''}>${f.label}${f.obligatorio?' ✅':' (según aplique)'}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Año Fiscal *</label>
          <input type="number" id="m-form-anio" class="form-control" value="${currentYear}" required />
        </div>
        <div class="form-group" id="m-form-mes-group">
          <label class="form-label">Mes Fiscal *</label>
          <select id="m-form-mes" class="form-control">
            ${['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => `
              <option value="${m}" ${m === currentMonth ? 'selected' : ''}>${m}</option>
            `).join('')}
          </select>
        </div>
        <div class="form-group" id="m-form-trimestre-group" style="display:none;">
          <label class="form-label">Trimestre Fiscal *</label>
          <select id="m-form-trimestre" class="form-control">
            <option value="T1">Trimestre 1 (Enero - Marzo)</option>
            <option value="T2">Trimestre 2 (Abril - Junio)</option>
            <option value="T3">Trimestre 3 (Julio - Septiembre)</option>
            <option value="T4">Trimestre 4 (Octubre - Diciembre)</option>
          </select>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="UI.cerrarModal()">Cancelar</button>
          <button type="button" class="btn btn-primary" onclick="Modulos.contabilidad.sat._crearDesdeModal()">Siguiente (Crear)</button>
        </div>
      </form>
    `);
  },

  async _crearDesdeModal() {
    const nit = document.getElementById("m-form-nit").value.trim();
    const tipo = document.getElementById("m-form-tipo").value;
    const anio = document.getElementById("m-form-anio").value.trim();
    let mes = null;
    if (tipo === 'SAT-1361' || tipo === 'SAT-1608') {
      mes = document.getElementById("m-form-trimestre").value;
    } else if (tipo === 'SAT-1411') {
      mes = 'ANUAL';  // período anual — sin mes ni trimestre
    } else {
      mes = document.getElementById("m-form-mes").value;
    }

    if (!nit || !anio) {
      UI.toast("Faltan campos obligatorios.", "error");
      return;
    }

    UI.cerrarModal();
    await Modulos.contabilidad.sat.abrirEditorFormulario(null, tipo, nit, mes, anio);
  },

  /* ── CAMBIO DE RÉGIMEN FISCAL con aviso legal ── */
  async modalCambiarRegimen() {
    const fiscal = Modulos.contabilidad._fiscal || await DB.getConfigFiscalFresh().catch(()=>({})) || {};
    const pequeno    = (fiscal.regimen_iva||'general').toLowerCase().startsWith('peque');
    const utilidades = (Number(fiscal.tasa_isr)||0.05) >= 0.2;
    const regimenActual = pequeno ? 'Pequeño Contribuyente' : utilidades ? 'Sobre Utilidades (25%)' : 'Opcional Simplificado (5%/7%)';

    UI.modal('⚠️ Cambio de Régimen Fiscal', `
      <div class="alert alert-amber" style="margin-bottom:16px">
        <div class="alert-icon">⚠️</div>
        <div class="alert-body">
          <b>Restricción legal — Decreto 10-2012 (LAT) Art. 69 y 70</b><br>
          <div style="font-size:12px;margin-top:4px;line-height:1.5">
            Conforme a la Ley de Actualización Tributaria (LAT):
            <ul style="margin:8px 0 0 14px;padding:0">
              <li>El cambio de régimen ISR solo puede hacerse <b>una vez al año</b>, con efecto a partir del 1 de enero del año siguiente.</li>
              <li>Debe notificarse a la SAT por escrito con al menos <b>30 días hábiles de anticipación</b> antes del 31 de diciembre.</li>
              <li>Una vez inscrito como Pequeño Contribuyente, el regreso al Régimen General requiere habilitación previa en la SAT y puede implicar auditoría del periodo anterior.</li>
              <li>El cambio <b>no aplica retroactivamente</b> a periodos ya declarados.</li>
            </ul>
            <b>Recomendación:</b> consulte a su contador antes de realizar este cambio.
          </div>
        </div>
      </div>
      <div style="font-size:13px;margin-bottom:14px">Régimen actual: <b>${regimenActual}</b></div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Régimen IVA</label>
          <select class="form-select" id="cfr-iva">
            <option value="general" ${!pequeno?'selected':''}>General (IVA 12%)</option>
            <option value="pequeno" ${pequeno?'selected':''}>Pequeño Contribuyente (IVA 5% plano)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Régimen ISR</label>
          <select class="form-select" id="cfr-isr">
            <option value="0.05" ${!utilidades?'selected':''}>Opcional Simplificado (5% hasta Q30,000 · 7% excedente)</option>
            <option value="0.25" ${utilidades?'selected':''}>Sobre Utilidades / Actividades Lucrativas (25%)</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Tasa IVA</label>
        <select class="form-select" id="cfr-tiva">
          <option value="0.12" ${!pequeno?'selected':''}>12% (Régimen General)</option>
          <option value="0.05" ${pequeno?'selected':''}>5% (Pequeño Contribuyente)</option>
        </select>
      </div>
      <div class="form-group" style="margin-top:12px">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;font-weight:700">
          <input type="checkbox" id="cfr-importadora" ${fiscal.es_importadora?'checked':''} style="width:18px;height:18px">
          📦 Empresa importadora (habilita campos DUA/DAI en compras)
        </label>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;margin-left:28px">
          Activa la sección de importación en el módulo de Compras: No. DUA, Derecho Arancelario (DAI), IVA en frontera y valor CIF.
          Requerido si la empresa importa repuestos, equipos o mercancía del exterior.
        </div>
      </div>
      <div class="alert" style="background:var(--surface3,#1e1e1e);border:1px solid var(--border);border-radius:8px;padding:10px;font-size:11px;color:var(--text3);margin-top:4px">
        Este campo actualiza la configuración de cálculo en TallerPro. <b>Usted es responsable de notificar a la SAT y hacer el cambio oficial en Declaraguate/SAT en línea.</b>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.contabilidad.sat._guardarRegimen()">Confirmar cambio (entiendo el riesgo)</button>
      </div>
    `, '560px');
  },

  async _guardarRegimen() {
    const regimen_iva    = document.getElementById('cfr-iva')?.value || 'general';
    const tasa_isr       = parseFloat(document.getElementById('cfr-isr')?.value) || 0.05;
    const tasa_iva       = parseFloat(document.getElementById('cfr-tiva')?.value) || 0.12;
    const es_importadora = document.getElementById('cfr-importadora')?.checked || false;
    const fiscal = Modulos.contabilidad._fiscal || {};
    const nuevo = { ...fiscal, regimen_iva, tasa_isr, tasa_iva, es_importadora };
    const ok = await DB.saveConfigFiscal(nuevo);
    if (!ok) { UI.toast('Error al guardar la configuración fiscal','error'); return; }
    Modulos.contabilidad._fiscal = nuevo;
    UI.cerrarModal();
    UI.toast('Régimen fiscal actualizado en TallerPro ✓ — recuerde notificar a la SAT', 'success', 6000);
    /* Recarga el módulo para reflejar el nuevo régimen en los cálculos */
    await Modulos.contabilidad.render();
  },

  togglePeriodoFields(tipo) {
    const mesGroup = document.getElementById("m-form-mes-group");
    const trimGroup = document.getElementById("m-form-trimestre-group");
    if (tipo === 'SAT-1411') {
      mesGroup.style.display = 'none';
      trimGroup.style.display = 'none';
    } else if (tipo === 'SAT-1361' || tipo === 'SAT-1608') {
      mesGroup.style.display = 'none';
      trimGroup.style.display = 'block';
    } else {
      mesGroup.style.display = 'block';
      trimGroup.style.display = 'none';
    }
  },

  /* ── EDITOR DE FORMULARIO ───────────────────────────────────── */
  async abrirEditorFormulario(id = null, tipo = '', nit = '', mes = '', anio = '', targetContainer = null) {
    let form = null;
    let datos = {};

    if (id) {
      try {
        const list = await DB.getFormulariosTributarios();
        form = list.find(x => x.id === id);
        if (form) {
          tipo = form.tipo_formulario;
          nit = form.nit;
          mes = form.periodo_mes;
          anio = form.periodo_anio;
          datos = form.datos_formulario || {};
          if (tipo === 'SAT-2237') {
            datos.comp_veh2_cre = datos.comp_veh2_cre || (datos.comp_veh2_base ? Math.round(datos.comp_veh2_base * 0.12 * 100) / 100 : 0);
            datos.comp_veh1_cre = datos.comp_veh1_cre || (datos.comp_veh1_base ? Math.round(datos.comp_veh1_base * 0.12 * 100) / 100 : 0);
          }

          if (!datos.valores_originales) {
            let valores_originales = {};
            if (tipo === 'SAT-2046') {
              valores_originales.ingresos = datos.ingresos ?? 0;
              valores_originales.retenciones_recibidas = datos.retenciones_recibidas ?? 0;
            } else if (tipo === 'SAT-2237') {
              valores_originales.ventas_base = datos.ventas_base ?? 0;
              valores_originales.compras_base = datos.compras_base ?? 0;
              valores_originales.comb_base = datos.comb_base ?? 0;
              valores_originales.imp_mundo_base = datos.imp_mundo_base ?? 0;
              valores_originales.retenciones_recibidas = datos.retenciones_recibidas ?? 0;
            } else if (tipo === 'SAT-1311') {
              valores_originales.rentas = datos.rentas ?? 0;
              valores_originales.retenciones = datos.retenciones ?? 0;
            } else if (tipo === 'SAT-1361') {
              valores_originales.rentas = datos.rentas ?? 0;
              valores_originales.gastos = datos.gastos ?? 0;
            } else if (tipo === 'SAT-1608') {
              valores_originales.ingresos_ventas = datos.ingresos_ventas ?? 0;
              valores_originales.costo_ventas = datos.costo_ventas ?? 0;
            } else if (tipo === 'SAT-1331') {
              valores_originales.monto_lucrativas = datos.monto_lucrativas ?? 0;
              valores_originales.impuesto_lucrativas = datos.impuesto_lucrativas ?? 0;
            } else if (tipo === 'SAT-2085') {
              valores_originales.monto = datos.monto ?? 0;
            }
            datos.valores_originales = valores_originales;
          }
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      // Auto-prefill data from database stats
      let startDate = "", endDate = "";
      if (mes.startsWith('T')) {
        const q = mes;
        if (q === 'T1') { startDate = `${anio}-01-01`; endDate = `${anio}-03-31`; }
        else if (q === 'T2') { startDate = `${anio}-04-01`; endDate = `${anio}-06-30`; }
        else if (q === 'T3') { startDate = `${anio}-07-01`; endDate = `${anio}-09-30`; }
        else if (q === 'T4') { startDate = `${anio}-10-01`; endDate = `${anio}-12-31`; }
      } else {
        startDate = `${anio}-${mes}-01`;
        const lastDay = new Date(Number(anio), Number(mes), 0).getDate();
        endDate = `${anio}-${mes}-${String(lastDay).padStart(2, '0')}`;
      }

      let facturas = [], compras = [], egresosIva = [], retenciones = [], allForms = [];
      try {
        facturas = await DB.getFacturasPeriodo(startDate, endDate) || [];
        compras = await DB.getComprasPeriodo(startDate, endDate) || [];
        egresosIva = await DB.getEgresosIvaPeriodo(startDate, endDate) || [];
        retenciones = await DB.getRetencionesPeriodo(startDate, endDate) || [];
        allForms = await DB.getFormulariosTributarios() || [];
      } catch (e) {
        console.error(e);
      }

      const facturasValidas = facturas.filter(f => !/anulad/i.test(f.estado || ''));
      const comprasValidas = compras.filter(c => !/anulad/i.test(c.estado || ''));

      /* Las ventas/compras del FEL ya se importan a facturas/compras (fuente canónica).
         CLAVE FISCAL: solo cuentan las compras DEDUCIBLES (ISR) y con CRÉDITO (IVA).
         Lo "por clasificar" o "no deducible" NO computa → protege Estado de Resultados y SAT. */
      const neto = d => Number(d.subtotal) || Math.round((Number(d.total)||0)/1.12*100)/100;
      const round2 = n => Math.round(n*100)/100;
      const comprasDeducibles = comprasValidas.filter(c => c.deducible);

      const salesTotal = facturasValidas.reduce((sum, f) => sum + (Number(f.total) || 0), 0);
      const purchasesTotal = comprasDeducibles.reduce((sum, c) => sum + (Number(c.total) || 0), 0)
        + egresosIva.reduce((sum, e) => sum + (Number(e.monto) || 0), 0);

      const sufISR = retenciones.filter(r => r.tipo === 'ISR' && r.naturaleza === 'recibida').reduce((s, r) => s + (Number(r.monto) || 0), 0);
      const sufIVA = retenciones.filter(r => r.tipo === 'IVA' && r.naturaleza === 'recibida').reduce((s, r) => s + (Number(r.monto) || 0), 0);
      const efeISR = retenciones.filter(r => r.tipo === 'ISR' && r.naturaleza === 'emitida').reduce((s, r) => s + (Number(r.monto) || 0), 0);

      // Map to default fields structure and store original prefilled values
      datos.nit = nit;
      datos.periodo_mes = mes;
      datos.periodo_anio = anio;

      let valores_originales = {};
      if (tipo === 'SAT-2046') {
        valores_originales.ingresos = salesTotal;
        valores_originales.retenciones_recibidas = sufIVA;
      } else if (tipo === 'SAT-2237') {
        /* El formulario calcula crédito/débito = base × 12%, bases NETAS (sin IVA).
           CRÉDITO solo de compras con credito_iva=true (clasificadas como deducibles). */
        const ventasBase = facturasValidas.reduce((s,f)=>s+neto(f),0);

        const conCredito = comprasValidas.filter(c => c.credito_iva);
        const importaciones = conCredito.filter(c => c.es_importacion && (Number(c.cif_valor)||0) > 0);
        const impMundoBase  = importaciones.reduce((s,c) => s + (Number(c.cif_valor)||0) + (Number(c.dai_monto)||0), 0);
        const combBase = conCredito.filter(c => c.categoria_gasto==='combustible' && !c.es_importacion).reduce((s,c)=>s+neto(c),0);
        const comprasLocalesBase = conCredito.filter(c => c.categoria_gasto!=='combustible' && !c.es_importacion).reduce((s,c)=>s+neto(c),0)
          + egresosIva.reduce((s,e)=> s + ((Number(e.monto)||0) - (Number(e.iva_credito)||0)), 0);

        valores_originales.ventas_base   = round2(ventasBase);
        valores_originales.compras_base  = round2(comprasLocalesBase);
        valores_originales.comb_base     = round2(combBase);
        valores_originales.imp_mundo_base = round2(impMundoBase);
        valores_originales.retenciones_recibidas = sufIVA;
      } else if (tipo === 'SAT-1311') {
        valores_originales.rentas = salesTotal;
        valores_originales.retenciones = sufISR;
      } else if (tipo === 'SAT-1361') {
        valores_originales.rentas = salesTotal;
        valores_originales.gastos = purchasesTotal;
      } else if (tipo === 'SAT-1608') {
        // Secciones 3 y 5 del ISO usan datos del AÑO ANTERIOR completo, no del trimestre actual
        let prevYearSales = 0, prevYearPurchases = 0;
        try {
          const prevAnioStr = String(Number(anio) - 1);
          const [factsAnt, comprasAnt, egresosAnt] = await Promise.all([
            DB.getFacturasPeriodo(`${prevAnioStr}-01-01`, `${prevAnioStr}-12-31`),
            DB.getComprasPeriodo(`${prevAnioStr}-01-01`, `${prevAnioStr}-12-31`),
            DB.getEgresosIvaPeriodo(`${prevAnioStr}-01-01`, `${prevAnioStr}-12-31`)
          ]);
          prevYearSales = (factsAnt || []).filter(f => !/anulad/i.test(f.estado || '')).reduce((s, f) => s + (Number(f.total) || 0), 0);
          prevYearPurchases = (comprasAnt || []).filter(c => !/anulad/i.test(c.estado || '')).reduce((s, c) => s + (Number(c.total) || 0), 0)
            + (egresosAnt || []).reduce((s, e) => s + (Number(e.monto) || 0), 0);
        } catch (e) {
          console.error('SAT-1608 prefill año anterior:', e);
        }
        valores_originales.ingresos_ventas = prevYearSales;
        valores_originales.ingresos_servicios = 0;
        valores_originales.costo_ventas = prevYearPurchases;
        valores_originales.ingresos_anual = prevYearSales;
      } else if (tipo === 'SAT-1331') {
        valores_originales.monto_lucrativas = purchasesTotal;
        valores_originales.impuesto_lucrativas = efeISR;
      } else if (tipo === 'SAT-2085') {
        valores_originales.monto = purchasesTotal;
      } else if (tipo === 'SAT-1431') {
        valores_originales.sueldos = 0;
      } else if (tipo === 'SAT-1411') {
        /* ISR Anual: prefill con datos del año completo (año = anio) */
        try {
          const [factsAnual, comprasAnual, egresosAnual, retsAnual] = await Promise.all([
            DB.getFacturasPeriodo(`${anio}-01-01`, `${anio}-12-31`),
            DB.getComprasPeriodo(`${anio}-01-01`, `${anio}-12-31`),
            DB.getEgresosIvaPeriodo(`${anio}-01-01`, `${anio}-12-31`),
            DB.getRetencionesPeriodo(`${anio}-01-01`, `${anio}-12-31`)
          ]);
          const rentaBruta = (factsAnual||[]).filter(f=>!/anulad/i.test(f.estado||'')).reduce((s,f)=>s+(Number(f.subtotal)||Math.round((Number(f.total)||0)/1.12*100)/100),0);
          /* Solo costos DEDUCIBLES cuentan para ISR (protege fiscalización) */
          const costos = (comprasAnual||[]).filter(c=>!/anulad/i.test(c.estado||'') && c.deducible).reduce((s,c)=>s+(Number(c.subtotal)||0),0) + (egresosAnual||[]).reduce((s,e)=>s+(Number(e.monto)||0),0);
          const retIsrAnual = (retsAnual||[]).filter(r=>r.tipo==='ISR'&&r.naturaleza==='recibida').reduce((s,r)=>s+(Number(r.monto)||0),0);
          /* Acreditar ISR trimestrales y ISO del año */
          const [forms1361, forms1608] = await Promise.all([
            DB.getFormulariosTributarios(),
            DB.getFormulariosTributarios()
          ]);
          const impTrim = (allForms||[]).filter(f=>f.tipo_formulario==='SAT-1361'&&f.nit===nit&&f.periodo_anio===String(anio)).reduce((s,f)=>s+(Number((f.datos_formulario||{}).total_pagar)||0),0);
          const isoAcred = (allForms||[]).filter(f=>f.tipo_formulario==='SAT-1608'&&f.nit===nit&&f.periodo_anio===String(anio)).reduce((s,f)=>s+(Number((f.datos_formulario||{}).total_pagar)||0),0);
          valores_originales.renta_bruta = Math.round(rentaBruta*100)/100;
          valores_originales.costos_gastos = Math.round(costos*100)/100;
          valores_originales.ret_isr = Math.round(retIsrAnual*100)/100;
          valores_originales.imp_trimestrales = Math.round(impTrim*100)/100;
          valores_originales.iso_acreditado = Math.round(isoAcred*100)/100;
        } catch(e) { console.error('SAT-1411 prefill:', e); }
      }

      datos.valores_originales = valores_originales;
      Object.assign(datos, valores_originales);

      // --- CARRY OVER & CROSS-FORM DATABASE RELATIONSHIPS ---
      // Determine previous period
      let prevMes = "", prevAnio = Number(anio);
      if (mes.startsWith('T')) {
        const qNum = Number(mes.substring(1));
        if (qNum === 1) {
          prevMes = 'T4';
          prevAnio = Number(anio) - 1;
        } else {
          prevMes = 'T' + (qNum - 1);
          prevAnio = Number(anio);
        }
      } else {
        const mVal = Number(mes);
        if (mVal === 1) {
          prevMes = '12';
          prevAnio = Number(anio) - 1;
        } else {
          prevMes = String(mVal - 1).padStart(2, '0');
          prevAnio = Number(anio);
        }
      }

      // Find immediate previous form of same type
      const prevForm = allForms.find(f =>
        f.tipo_formulario === tipo &&
        f.nit === nit &&
        f.periodo_mes === prevMes &&
        f.periodo_anio === String(prevAnio)
      );

      const prevDatos = prevForm ? (prevForm.datos_formulario || {}) : {};

      // Assign historical prefill values based on previous period form data
      if (tipo === 'SAT-2237') {
        datos.remanente_iva_anterior = prevDatos.cre_siguiente || prevDatos.cre_sig || 0;
        datos.remanente_ret_anterior = prevDatos.saldo_siguiente || prevDatos.saldo_sig || 0;
      } else if (tipo === 'SAT-2046') {
        datos.remanente_anterior = prevDatos.saldo_siguiente || prevDatos.saldo_sig || 0;
      } else if (tipo === 'SAT-1311') {
        datos.remanente_anterior = prevDatos.excedente_retenciones || prevDatos.exc || 0;
        datos.iso_anterior = prevDatos.iso_por_acreditar || prevDatos.iso_por_acred || 0;
      } else if (tipo === 'SAT-1361') {
        if (prevAnio === Number(anio)) {
          datos.imp_trim_anterior = prevDatos.impuesto_determinado || prevDatos.impuesto_c || prevDatos.impuesto_e || 0;
        }
        datos.iso_anterior = prevDatos.iso_saldo_sig || prevDatos.iso_sig || 0;
      }

      // Cross-form relationship: ISR forms (SAT-1311 / SAT-1361) fetching ISO paid (SAT-1608)
      if (tipo === 'SAT-1311' || tipo === 'SAT-1361') {
        if (!datos.iso_anterior) {
          const isoForms = allForms.filter(f =>
            f.tipo_formulario === 'SAT-1608' &&
            f.nit === nit &&
            f.periodo_anio === String(anio)
          );
          let totalIso = 0;
          isoForms.forEach(f => {
            const fd = f.datos_formulario || {};
            totalIso += (fd.impuesto_a_pagar || fd.imp_pagar || fd.impuesto_det || 0);
          });
          if (totalIso > 0) {
            datos.iso_anterior = totalIso;
          }
        }
      }

      // Cross-form relationship: ISO form (SAT-1608) fetching ISR paid (SAT-1311 / SAT-1361)
      if (tipo === 'SAT-1608') {
        if (!datos.isr_anterior) {
          const isrForms = allForms.filter(f =>
            (f.tipo_formulario === 'SAT-1311' || f.tipo_formulario === 'SAT-1361') &&
            f.nit === nit &&
            f.periodo_anio === String(anio)
          );
          let totalIsr = 0;
          isrForms.forEach(f => {
            const fd = f.datos_formulario || {};
            totalIsr += (fd.impuesto_a_pagar || fd.imp_pagar || fd.impuesto_determinado || 0);
          });
          if (totalIsr > 0) {
            datos.isr_anterior = totalIsr;
          }
        }
      }
    }

    const formNum = form?.numero_formulario || '51' + Math.floor(10000000 + Math.random() * 90000000);
    const accNum = form?.numero_acceso || Math.floor(100000000 + Math.random() * 900000000).toString().replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
    const estado = form?.estado || 'preparacion';
    const statusLabel = estado === 'pagado' ? 'Pagado' : estado === 'presentado' ? 'Presentado' : 'Borrador';

    const container = targetContainer || document.getElementById("cont-content");
    if (!container) return;

    let subFormHtml = "";

    // Render Subforms with CSS/HTML similar to Declaraguate
    if (tipo === 'SAT-2046') {
      subFormHtml = `
        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">3. RÉGIMEN DE PEQUEÑO CONTRIBUYENTE</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Ingresos por venta de bienes y/o prestación de servicios</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-2046-ingresos" class="form-control text-right" style="font-weight:bold;" value="${datos.ingresos || 0}" data-original="${datos.valores_originales?.ingresos ?? 0}" oninput="Modulos.contabilidad.sat.recalc2046()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">Impuesto determinado (5%)</td>
              <td style="padding:6px;"><input type="text" id="f-2046-impuesto" class="form-control text-right bg-light" value="${datos.impuesto_determinado || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(-) Remanente de retenciones del IVA del período anterior</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-2046-remanente-ant" class="form-control text-right" value="${datos.remanente_anterior || 0}" oninput="Modulos.contabilidad.sat.recalc2046()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Valor de constancias de retención del IVA recibidas en el período</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-2046-retenciones" class="form-control text-right" value="${datos.retenciones_recibidas || 0}" data-original="${datos.valores_originales?.retenciones_recibidas ?? 0}" oninput="Modulos.contabilidad.sat.recalc2046()" /></td>
            </tr>
            <tr>
              <td style="padding:6px; font-weight:bold;">Saldo de retenciones para el período siguiente</td>
              <td style="padding:6px;"><input type="text" id="f-2046-saldo-sig" class="form-control text-right bg-light" value="${datos.saldo_siguiente || 0}" readonly /></td>
            </tr>
            <tr style="background:#e9f0fa; font-weight:bold;">
              <td style="padding:6px; color:#1a365d;">Impuesto a pagar</td>
              <td style="padding:6px;"><input type="text" id="f-2046-imp-pagar" class="form-control text-right bg-light font-weight-bold" style="color:#1a365d;" value="${datos.impuesto_a_pagar || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">4. RECTIFICACIÓN (opcional)</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Número de formulario SAT-2046 que se rectifica</td>
              <td style="padding:6px;"><input type="text" id="f-2046-rect-numero" class="form-control text-right" value="${datos.rect_numero || ''}" oninput="Modulos.contabilidad.sat.recalc2046()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Impuesto ingresado con el formulario que se rectifica y anteriores</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-2046-rect-impuesto" class="form-control text-right" value="${datos.rect_impuesto || 0}" oninput="Modulos.contabilidad.sat.recalc2046()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(=) Impuesto a pagar por rectificación</td>
              <td style="padding:6px;"><input type="text" id="f-2046-rect-pagar" class="form-control text-right bg-light" value="${datos.rect_pagar || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(=) Impuesto a favor del contribuyente</td>
              <td style="padding:6px;"><input type="text" id="f-2046-rect-favor" class="form-control text-right bg-light" value="${datos.rect_favor || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">5. ACCESORIOS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">(+) Multa formal (por presentación extemporánea)</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-2046-multa" class="form-control text-right" value="${datos.multa || 0}" oninput="Modulos.contabilidad.sat.recalc2046()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Multa por omisión</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-2046-multa-omision" class="form-control text-right" value="${datos.multa_omision || 0}" oninput="Modulos.contabilidad.sat.recalc2046()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Multa por rectificación</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-2046-multa-rect" class="form-control text-right" value="${datos.multa_rect || 0}" oninput="Modulos.contabilidad.sat.recalc2046()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Intereses</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-2046-interes" class="form-control text-right" value="${datos.interes || 0}" oninput="Modulos.contabilidad.sat.recalc2046()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Mora</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-2046-mora" class="form-control text-right" value="${datos.mora || 0}" oninput="Modulos.contabilidad.sat.recalc2046()" /></td>
            </tr>
            <tr style="background:#f9f9f9; font-weight:bold;">
              <td style="padding:6px;">(=) Accesorios a pagar</td>
              <td style="padding:6px;"><input type="text" id="f-2046-acc-pagar" class="form-control text-right bg-light" value="${datos.accesorios_pagar || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>
      `;
    } else if (tipo === 'SAT-2237') {
      subFormHtml = `
        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">3. DÉBITO FISCAL POR OPERACIONES LOCALES</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <thead>
            <tr style="background:#f2f2f2; font-weight:bold;">
              <th style="padding:6px; text-align:left; width:50%;">Detalle</th>
              <th style="padding:6px; text-align:right; width:25%;">Base (Q)</th>
              <th style="padding:6px; text-align:right; width:25%;">Débito (Q)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:6px;">Ventas exentas y servicios exentos</td>
              <td><input type="number" step="0.01" id="f-2237-exento-base" class="form-control form-control-sm text-right" value="${datos.exento_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td style="text-align:right; padding:6px; color:#666;">—</td>
            </tr>
            <tr>
              <td style="padding:6px;">Ventas de medicamentos genéricos y antirretrovirales</td>
              <td><input type="number" step="0.01" id="f-2237-med-base" class="form-control form-control-sm text-right" value="${datos.med_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td style="text-align:right; padding:6px; color:#666;">—</td>
            </tr>
            <tr>
              <td style="padding:6px;">Ventas no afectas calificadas Decreto 29-89</td>
              <td><input type="number" step="0.01" id="f-2237-d2989-base" class="form-control form-control-sm text-right" value="${datos.d2989_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td style="text-align:right; padding:6px; color:#666;">—</td>
            </tr>
            <tr>
              <td style="padding:6px;">Ventas vehículos terrestres (modelo 2+ años anteriores)</td>
              <td><input type="number" step="0.01" id="f-2237-veh2-base" class="form-control form-control-sm text-right" value="${datos.veh2_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td style="text-align:right; padding:6px; color:#666;">—</td>
            </tr>
            <tr>
              <td style="padding:6px;">Ventas vehículos terrestres (modelo año actual/anterior/siguiente)</td>
              <td><input type="number" step="0.01" id="f-2237-veh1-base" class="form-control form-control-sm text-right" value="${datos.veh1_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td><input type="text" id="f-2237-veh1-deb" class="form-control form-control-sm text-right bg-light" value="${datos.veh1_deb || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Ventas gravadas</td>
              <td><input type="number" step="0.01" id="f-2237-ventas-base" class="form-control form-control-sm text-right" value="${datos.ventas_base || 0}" data-original="${datos.valores_originales?.ventas_base ?? 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td><input type="text" id="f-2237-ventas-deb" class="form-control form-control-sm text-right bg-light" value="${datos.ventas_deb || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Servicios gravados</td>
              <td><input type="number" step="0.01" id="f-2237-serv-base" class="form-control form-control-sm text-right" value="${datos.servicios_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td><input type="text" id="f-2237-serv-deb" class="form-control form-control-sm text-right bg-light" value="${datos.servicios_deb || 0}" readonly /></td>
            </tr>
            <tr style="background:#e9ecef; font-weight:bold;">
              <td style="padding:6px;">Sumatoria de las columnas BASE y DÉBITOS</td>
              <td><input type="text" id="f-2237-deb-sum-base" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.deb_sum_base || 0}" readonly /></td>
              <td><input type="text" id="f-2237-deb-sum-deb" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.deb_sum_deb || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">4. EXPORTACIONES Y TRANSFERENCIAS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:50%;">Exportaciones de bienes y transferencias</td>
              <td style="width:25%;"><input type="number" step="0.01" id="f-2237-exp-base" class="form-control form-control-sm text-right" value="${datos.exp_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td style="width:25%; text-align:right; padding:6px; color:#666;">—</td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">5. CRÉDITO FISCAL POR OPERACIONES LOCALES</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <thead>
            <tr style="background:#f2f2f2; font-weight:bold;">
              <th style="padding:6px; text-align:left; width:50%;">Detalle</th>
              <th style="padding:6px; text-align:right; width:25%;">Base (Q)</th>
              <th style="padding:6px; text-align:right; width:25%;">Crédito (Q)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:6px;">Compras de medicamentos genéricos, alternativos y antirretrovirales</td>
              <td><input type="number" step="0.01" id="f-2237-comp-med-base" class="form-control form-control-sm text-right" value="${datos.comp_med_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td style="text-align:right; padding:6px; color:#666;">—</td>
            </tr>
            <tr>
              <td style="padding:6px;">Compras y servicios adquiridos de pequeños contribuyentes</td>
              <td><input type="number" step="0.01" id="f-2237-comp-peq-base" class="form-control form-control-sm text-right" value="${datos.comp_peq_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td style="text-align:right; padding:6px; color:#666;">—</td>
            </tr>
            <tr>
              <td style="padding:6px;">Compras que no generan derecho a compensación del crédito fiscal</td>
              <td><input type="number" step="0.01" id="f-2237-comp-nocomp-base" class="form-control form-control-sm text-right" value="${datos.comp_nocomp_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td style="text-align:right; padding:6px; color:#666;">—</td>
            </tr>
            <tr>
              <td style="padding:6px;">Compras de vehículos terrestres del modelo de dos años o más anteriores al del año en curso</td>
              <td style="text-align:right; padding:6px; color:#666;">—</td>
              <td><input type="number" step="0.01" id="f-2237-comp-veh2-cre" class="form-control form-control-sm text-right" value="${datos.comp_veh2_cre || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Compras de vehículos terrestres del modelo del año en curso, del año siguiente o anterior al del año en curso</td>
              <td><input type="number" step="0.01" id="f-2237-comp-veh1-base" class="form-control form-control-sm text-right" value="${datos.comp_veh1_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td><input type="text" id="f-2237-comp-veh1-cre" class="form-control form-control-sm text-right bg-light" value="${datos.comp_veh1_cre || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Compras de combustibles</td>
              <td><input type="number" step="0.01" id="f-2237-comb-base" class="form-control form-control-sm text-right" value="${datos.comb_base || 0}" data-original="${datos.valores_originales?.comb_base ?? 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td><input type="text" id="f-2237-comb-cre" class="form-control form-control-sm text-right bg-light" value="${datos.comb_cre || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Otras compras</td>
              <td><input type="number" step="0.01" id="f-2237-compras-base" class="form-control form-control-sm text-right" value="${datos.compras_base || 0}" data-original="${datos.valores_originales?.compras_base ?? 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td><input type="text" id="f-2237-compras-cre" class="form-control form-control-sm text-right bg-light" value="${datos.compras_cre || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Servicios adquiridos</td>
              <td><input type="number" step="0.01" id="f-2237-serv-acq-base" class="form-control form-control-sm text-right" value="${datos.serv_acq_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td><input type="text" id="f-2237-serv-acq-cre" class="form-control form-control-sm text-right bg-light" value="${datos.serv_acq_cre || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Importaciones de Centro América</td>
              <td><input type="number" step="0.01" id="f-2237-imp-ca-base" class="form-control form-control-sm text-right" value="${datos.imp_ca_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td><input type="text" id="f-2237-imp-ca-cre" class="form-control form-control-sm text-right bg-light" value="${datos.imp_ca_cre || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Adquisiciones con FYDUCA</td>
              <td><input type="number" step="0.01" id="f-2237-fyduca-base" class="form-control form-control-sm text-right" value="${datos.fyduca_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td><input type="text" id="f-2237-fyduca-cre" class="form-control form-control-sm text-right bg-light" value="${datos.fyduca_cre || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Importaciones del resto del mundo <span style="font-size:10px;color:#0e7490;font-weight:600">(auto-prefill desde DUA)</span></td>
              <td><input type="number" step="0.01" id="f-2237-imp-mundo-base" class="form-control form-control-sm text-right" value="${datos.imp_mundo_base || 0}" data-original="${datos.valores_originales?.imp_mundo_base ?? 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td><input type="text" id="f-2237-imp-mundo-cre" class="form-control form-control-sm text-right bg-light" value="${datos.imp_mundo_cre || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Compras de activos fijos directamente vinculados con el proceso productivo</td>
              <td><input type="number" step="0.01" id="f-2237-activos-base" class="form-control form-control-sm text-right" value="${datos.activos_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td><input type="text" id="f-2237-activos-cre" class="form-control form-control-sm text-right bg-light" value="${datos.activos_cre || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Importaciones de activos fijos directamente vinculados con el proceso productivo</td>
              <td><input type="number" step="0.01" id="f-2237-imp-activos-base" class="form-control form-control-sm text-right" value="${datos.imp_activos_base || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
              <td><input type="text" id="f-2237-imp-activos-cre" class="form-control form-control-sm text-right bg-light" value="${datos.imp_activos_cre || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">IVA conforme constancias de exención recibidas</td>
              <td style="text-align:right; padding:6px; color:#666;">—</td>
              <td><input type="number" step="0.01" id="f-2237-iva-exencion" class="form-control form-control-sm text-right" value="${datos.iva_exencion || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Remanente de crédito fiscal del período anterior</td>
              <td style="text-align:right; padding:6px; color:#666;">—</td>
              <td><input type="number" step="0.01" id="f-2237-remanente-iva-ant" class="form-control form-control-sm text-right" value="${datos.remanente_iva_anterior || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
            </tr>
            <tr style="background:#e9ecef; font-weight:bold;">
              <td style="padding:6px;">Sumatoria de las columnas BASE y CRÉDITOS</td>
              <td><input type="text" id="f-2237-cre-sum-base" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.cre_sum_base || 0}" readonly /></td>
              <td><input type="text" id="f-2237-cre-sum-cre" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.cre_sum_cre || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">7. DETERMINACIÓN DEL CRÉDITO FISCAL O IMPUESTO A PAGAR</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Crédito fiscal para el período siguiente por operaciones locales (Créditos mayor que Débitos)</td>
              <td><input type="text" id="f-2237-cre-siguiente" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.cre_siguiente || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">Crédito fiscal por operaciones de exportación y/o transferencia (Créditos mayor que Débitos)</td>
              <td><input type="text" id="f-2237-cre-exportacion" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.cre_exportacion || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">IMPUESTO TOTAL DETERMINADO (Débitos mayor que Créditos) Operaciones locales</td>
              <td><input type="text" id="f-2237-impuesto-det" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.impuesto_det || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">IMPUESTO TOTAL DETERMINADO (Débitos mayor que Créditos) Operaciones de exportación y/o transferencia</td>
              <td><input type="text" id="f-2237-impuesto-det-exp" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.impuesto_det_exp || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Crédito fiscal para el período siguiente por operaciones de exportación y/o transferencia</td>
              <td><input type="text" id="f-2237-cre-sig-exportacion" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.cre_sig_exportacion || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9; font-weight:bold;">
              <td style="padding:6px;">SALDO DEL IMPUESTO</td>
              <td><input type="text" id="f-2237-saldo-impuesto" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.saldo_impuesto || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Remanente de retenciones del IVA del período anterior</td>
              <td><input type="number" step="0.01" id="f-2237-remanente-ret-ant" class="form-control form-control-sm text-right" value="${datos.remanente_ret_anterior || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px; font-weight:bold;" colspan="2">(-) Acreditamiento en cuenta bancaria del remanente de retención de IVA</td>
            </tr>
            <tr>
              <td style="padding:6px; padding-left:20px;">Número Resolución</td>
              <td><input type="text" id="f-2237-ret-banco-resolucion" class="form-control form-control-sm text-right" value="${datos.ret_banco_resolucion || ''}" /></td>
            </tr>
            <tr>
              <td style="padding:6px; padding-left:20px;">Monto acreditado</td>
              <td><input type="number" step="0.01" id="f-2237-ret-banco-monto" class="form-control form-control-sm text-right" value="${datos.ret_banco_monto || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(=) Remanente de retenciones del IVA recibidas en el período</td>
              <td><input type="text" id="f-2237-rem-ret-recibidas" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.rem_ret_recibidas || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(-) Constancias de retenciones del IVA recibidas en el período a declarar</td>
              <td><input type="number" step="0.01" id="f-2237-retenciones-rec" class="form-control form-control-sm text-right" value="${datos.retenciones_recibidas || 0}" data-original="${datos.valores_originales?.retenciones_recibidas ?? 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px; font-weight:bold;">Saldo de retenciones para el período siguiente</td>
              <td><input type="text" id="f-2237-saldo-sig" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.saldo_siguiente || 0}" readonly /></td>
            </tr>
            <tr style="background:#e9f0fa; font-weight:bold; color:#1a365d;">
              <td style="padding:6px; font-size:12px;">IMPUESTO A PAGAR</td>
              <td><input type="text" id="f-2237-imp-pagar" class="form-control form-control-sm text-right bg-light font-weight-bold" style="color:#1a365d;" value="${datos.impuesto_a_pagar || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:12px; margin-top:20px;">8. INDICADORES COMERCIALES</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Indicadores comerciales, base débitos menos base créditos</td>
              <td><input type="text" id="f-2237-ind-margen" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.ind_margen || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Razón ventas y compras, base débitos dividido base créditos</td>
              <td><input type="text" id="f-2237-ind-razon" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.ind_razon || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:12px; margin-top:20px;">9.1 CANTIDAD DE OPERACIONES REALIZADAS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <thead>
            <tr style="background:#eee; font-weight:bold;">
              <th style="padding:6px; text-align:left; width:50%;">Tipo Documento</th>
              <th style="padding:6px; text-align:right; width:25%;">EMITIDAS</th>
              <th style="padding:6px; text-align:right; width:25%;">RECIBIDAS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:6px;">Facturas (incluir las anuladas)</td>
              <td><input type="number" id="f-2237-op-emitidas-fact" class="form-control form-control-sm text-right" value="${datos.op_emitidas_fact || 0}" /></td>
              <td><input type="number" id="f-2237-op-recibidas-fact" class="form-control form-control-sm text-right" value="${datos.op_recibidas_fact || 0}" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Factura y Declaracion Unica Centroamericana FYDUCA</td>
              <td><input type="number" id="f-2237-op-emitidas-fyduca" class="form-control form-control-sm text-right" value="${datos.op_emitidas_fyduca || 0}" /></td>
              <td><input type="number" id="f-2237-op-recibidas-fyduca" class="form-control form-control-sm text-right" value="${datos.op_recibidas_fyduca || 0}" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Constancias de exención</td>
              <td><input type="number" id="f-2237-op-emitidas-exen" class="form-control form-control-sm text-right" value="${datos.op_emitidas_exen || 0}" /></td>
              <td><input type="number" id="f-2237-op-recibidas-exen" class="form-control form-control-sm text-right" value="${datos.op_recibidas_exen || 0}" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Constancias de adquisición de insumos de producción local</td>
              <td><input type="number" id="f-2237-op-emitidas-insu" class="form-control form-control-sm text-right" value="${datos.op_emitidas_insu || 0}" /></td>
              <td><input type="number" id="f-2237-op-recibidas-insu" class="form-control form-control-sm text-right" value="${datos.op_recibidas_insu || 0}" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Constancias de retención de IVA</td>
              <td><input type="number" id="f-2237-op-emitidas-ret" class="form-control form-control-sm text-right" value="${datos.op_emitidas_ret || 0}" /></td>
              <td><input type="number" id="f-2237-op-recibidas-ret" class="form-control form-control-sm text-right" value="${datos.op_recibidas_ret || 0}" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Facturas especiales</td>
              <td><input type="number" id="f-2237-op-emitidas-fesp" class="form-control form-control-sm text-right" value="${datos.op_emitidas_fesp || 0}" /></td>
              <td><input type="number" id="f-2237-op-recibidas-fesp" class="form-control form-control-sm text-right" value="${datos.op_recibidas_fesp || 0}" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Notas de crédito</td>
              <td><input type="number" id="f-2237-op-emitidas-ncre" class="form-control form-control-sm text-right" value="${datos.op_emitidas_ncre || 0}" /></td>
              <td><input type="number" id="f-2237-op-recibidas-ncre" class="form-control form-control-sm text-right" value="${datos.op_recibidas_ncre || 0}" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Notas de débito</td>
              <td><input type="number" id="f-2237-op-emitidas-ndeb" class="form-control form-control-sm text-right" value="${datos.op_emitidas_ndeb || 0}" /></td>
              <td><input type="number" id="f-2237-op-recibidas-ndeb" class="form-control form-control-sm text-right" value="${datos.op_recibidas_ndeb || 0}" /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:12px; margin-top:20px;">9.2 MONTO DE OPERACIONES REALIZADAS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <thead>
            <tr style="background:#eee; font-weight:bold;">
              <th style="padding:6px; text-align:left; width:50%;">Detalle</th>
              <th style="padding:6px; text-align:right; width:25%;">EMITIDAS (Q)</th>
              <th style="padding:6px; text-align:right; width:25%;">RECIBIDAS (Q)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:6px;">Valor de las notas de crédito del período</td>
              <td><input type="number" step="0.01" id="f-2237-monto-emitidas-ncre" class="form-control form-control-sm text-right" value="${datos.monto_emitidas_ncre || 0}" /></td>
              <td><input type="number" step="0.01" id="f-2237-monto-recibidas-ncre" class="form-control form-control-sm text-right" value="${datos.monto_recibidas_ncre || 0}" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Valor de las notas de débito del período</td>
              <td><input type="number" step="0.01" id="f-2237-monto-emitidas-ndeb" class="form-control form-control-sm text-right" value="${datos.monto_emitidas_ndeb || 0}" /></td>
              <td><input type="number" step="0.01" id="f-2237-monto-recibidas-ndeb" class="form-control form-control-sm text-right" value="${datos.monto_recibidas_ndeb || 0}" /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">10. RECTIFICACIÓN (opcional)</div>
        <div style="padding:8px; border:1px solid #ccc; background:#fff; font-size:11px; margin-top:5px; color:#555;">
          (llene solo si necesita corregir datos de un formulario SAT-2237 anterior)
        </div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">
                Número de formulario SAT-2237 que se rectifica<br/>
                <small style="color:#666;">Son 11 dígitos que aparecen en la parte superior derecha del encabezado del formulario a corregir. Ejemplo 12345678901</small>
              </td>
              <td><input type="text" id="f-2237-rect-numero" class="form-control form-control-sm text-right" value="${datos.rect_numero || ''}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Impuesto ingresado con el formulario que se rectifica y anteriores</td>
              <td><input type="number" step="0.01" id="f-2237-rect-impuesto" class="form-control form-control-sm text-right" value="${datos.rect_impuesto || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
            </tr>
            <tr>
              <td style="padding:6px; font-weight:bold;">(=) Impuesto a pagar</td>
              <td><input type="text" id="f-2237-rect-pagar" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.rect_pagar || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9; font-weight:bold;">
              <td style="padding:6px;">(=) Impuesto a favor del contribuyente</td>
              <td><input type="text" id="f-2237-rect-favor" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.rect_favor || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">11. ACCESORIOS</div>
        <div style="padding:8px; border:1px solid #ccc; background:#fff; font-size:11px; margin-top:5px; color:#555;">
          (son las multas, intereses y mora por presentación o pago extemporáneo)
        </div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">¿Cuándo presentará esta declaración?</td>
              <td><input type="date" id="f-2237-fecha-pago" class="form-control form-control-sm text-right" value="${datos.fecha_pago || new Date().toISOString().split('T')[0]}" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Multa formal (por presentación extemporánea)</td>
              <td><input type="number" step="0.01" id="f-2237-multa" class="form-control form-control-sm text-right" value="${datos.multa || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Multa por omisión</td>
              <td><input type="number" step="0.01" id="f-2237-multa-omision" class="form-control form-control-sm text-right" value="${datos.multa_omision || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Multa por rectificación</td>
              <td><input type="number" step="0.01" id="f-2237-multa-rect" class="form-control form-control-sm text-right" value="${datos.multa_rect || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Intereses</td>
              <td><input type="number" step="0.01" id="f-2237-interes" class="form-control form-control-sm text-right" value="${datos.interes || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Mora</td>
              <td><input type="number" step="0.01" id="f-2237-mora" class="form-control form-control-sm text-right" value="${datos.mora || 0}" oninput="Modulos.contabilidad.sat.recalc2237()" /></td>
            </tr>
            <tr style="background:#eee; font-weight:bold;">
              <td style="padding:6px;">(=) Accesorios a pagar</td>
              <td><input type="text" id="f-2237-acc-pagar" class="form-control form-control-sm text-right bg-light" value="${datos.accesorios_pagar || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">12. CONTADOR</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">NIT del contador responsable de la contabilidad del contribuyente</td>
              <td><input type="text" id="f-2237-contador-nit" class="form-control form-control-sm text-right" value="${datos.contador_nit || ''}" /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">13. CÓDIGOS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Ingrese el código del anexo del detalle de facturas especiales</td>
              <td><input type="text" id="f-2237-anexo-cod" class="form-control form-control-sm text-right" value="${datos.anexo_cod || ''}" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">Ingrese el código resumen de facturación mensual (CRFM) casilla exclusiva para los contribuyentes clasificados como EFACE (Emisor de Factura Electrónica).</td>
              <td><input type="text" id="f-2237-crfm-cod" class="form-control form-control-sm text-right" value="${datos.crfm_cod || ''}" /></td>
            </tr>
          </tbody>
        </table>
        </div>
      `;
    } else if (tipo === 'SAT-1311') {
      subFormHtml = `
        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">3. RENTA IMPONIBLE Y DETERMINACIÓN DEL IMPUESTO</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Rentas de actividades Lucrativas</td>
              <td><input type="number" step="0.01" id="f-1311-rentas" class="form-control text-right" style="font-weight:bold;" value="${datos.rentas || 0}" data-original="${datos.valores_originales?.rentas ?? 0}" oninput="Modulos.contabilidad.sat.recalc1311()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Monto total de Rentas exentas</td>
              <td><input type="number" step="0.01" id="f-1311-exentas" class="form-control text-right" value="${datos.exentas || 0}" oninput="Modulos.contabilidad.sat.recalc1311()" /></td>
            </tr>
            <tr>
              <td style="padding:6px; font-weight:bold;">Renta Imponible</td>
              <td><input type="text" id="f-1311-imponible" class="form-control text-right bg-light" value="${datos.renta_imponible || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9; font-weight:bold;">
              <td style="padding:6px;">Impuesto Determinado (Escala: 5% hasta Q30k, 7% sobre excedente + Q1500)</td>
              <td><input type="text" id="f-1311-impuesto" class="form-control text-right bg-light" value="${datos.impuesto_determinado || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(-) Valor de las retenciones que le practicaron en este período</td>
              <td><input type="number" step="0.01" id="f-1311-retenciones" class="form-control text-right" value="${datos.retenciones || 0}" data-original="${datos.valores_originales?.retenciones ?? 0}" oninput="Modulos.contabilidad.sat.recalc1311()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Remanente de Retenciones del período anterior</td>
              <td><input type="number" step="0.01" id="f-1311-remanente-ant" class="form-control text-right" value="${datos.remanente_anterior || 0}" oninput="Modulos.contabilidad.sat.recalc1311()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Saldo del Impuesto</td>
              <td><input type="text" id="f-1311-saldo-imp" class="form-control text-right bg-light" value="${datos.saldo_impuesto || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px; font-weight:bold;">Excedente de retenciones para el período siguiente</td>
              <td><input type="text" id="f-1311-exc" class="form-control text-right bg-light" value="${datos.excedente_retenciones || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">3.1 INFORMACIÓN COMPLEMENTARIA A RENTAS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Rentas de capital, facturas con retención definitiva (base)</td>
              <td><input type="number" step="0.01" id="f-1311-comp-retdef" class="form-control text-right" value="${datos.comp_retdef || 0}" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">Rentas de capital, facturas con pago directo (base)</td>
              <td><input type="number" step="0.01" id="f-1311-comp-pagodir" class="form-control text-right" value="${datos.comp_pagodir || 0}" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Otras rentas de capital sujetas a retención definitiva (base)</td>
              <td><input type="number" step="0.01" id="f-1311-comp-otrasret" class="form-control text-right" value="${datos.comp_otrasret || 0}" /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">4. LIQUIDACIÓN Y DETERMINACIÓN DEL IMPUESTO A PAGAR</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Saldo del Impuesto de Solidaridad (ISO) pagado en períodos anteriores</td>
              <td><input type="number" step="0.01" id="f-1311-iso-ant" class="form-control text-right" value="${datos.iso_anterior || 0}" oninput="Modulos.contabilidad.sat.recalc1311()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Acreditamiento del Impuesto de Solidaridad para este período</td>
              <td><input type="text" id="f-1311-iso-acred" class="form-control text-right bg-light" value="${datos.iso_acreditamiento || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Saldo de Impuesto de Solidaridad por Acreditar</td>
              <td><input type="text" id="f-1311-iso-por-acred" class="form-control text-right bg-light" value="${datos.iso_por_acreditar || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Incentivos Fiscales (Decretos 29-89, etc.)</td>
              <td><input type="number" step="0.01" id="f-1311-incentivos" class="form-control text-right" value="${datos.incentivos || 0}" oninput="Modulos.contabilidad.sat.recalc1311()" /></td>
            </tr>
            <tr style="background:#e9f0fa; font-weight:bold; color:#1a365d;">
              <td style="padding:6px; font-size:12px;">Impuesto a pagar</td>
              <td><input type="text" id="f-1311-imp-pagar" class="form-control text-right bg-light font-weight-bold" style="color:#1a365d;" value="${datos.impuesto_a_pagar || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Cantidad de Facturas emitidas (incluyendo las anuladas)</td>
              <td><input type="number" id="f-1311-cant-facturas" class="form-control text-right" value="${datos.cant_facturas || 0}" /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">5. RECTIFICACIÓN / 6. ACCESORIOS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Número de formulario que se rectifica</td>
              <td><input type="text" id="f-1311-rect-numero" class="form-control text-right" value="${datos.rect_numero || ''}" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Impuesto ingresado en formulario anterior</td>
              <td><input type="number" step="0.01" id="f-1311-rect-impuesto" class="form-control text-right" value="${datos.rect_impuesto || 0}" oninput="Modulos.contabilidad.sat.recalc1311()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Multas (presentación, omisión, etc.)</td>
              <td><input type="number" step="0.01" id="f-1311-multa" class="form-control text-right" value="${datos.multa || 0}" oninput="Modulos.contabilidad.sat.recalc1311()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Intereses</td>
              <td><input type="number" step="0.01" id="f-1311-interes" class="form-control text-right" value="${datos.interes || 0}" oninput="Modulos.contabilidad.sat.recalc1311()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Mora</td>
              <td><input type="number" step="0.01" id="f-1311-mora" class="form-control text-right" value="${datos.mora || 0}" oninput="Modulos.contabilidad.sat.recalc1311()" /></td>
            </tr>
          </tbody>
        </table>
      `;
    } else if (tipo === 'SAT-1361') {
      subFormHtml = `
        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">
          MÉTODO DE DETERMINACIÓN DE RENTA IMPONIBLE TRIMESTRAL
        </div>
        <div style="padding:12px; display:flex; gap:30px; font-size:13px; color:#000;">
          <label><input type="radio" name="f-1361-metodo" value="cierres" ${!datos.metodo || datos.metodo === 'cierres' ? 'checked' : ''} onchange="document.getElementById('f-1361-sec-cierres').style.display='block';document.getElementById('f-1361-sec-estimada').style.display='none';Modulos.contabilidad.sat.recalc1361()" /> Cierres Contables Parciales (Art. 38)</label>
          <label><input type="radio" name="f-1361-metodo" value="estimada" ${datos.metodo === 'estimada' ? 'checked' : ''} onchange="document.getElementById('f-1361-sec-cierres').style.display='none';document.getElementById('f-1361-sec-estimada').style.display='block';Modulos.contabilidad.sat.recalc1361()" /> Renta Imponible Estimada (8% del trimestre)</label>
        </div>

        <div id="f-1361-sec-cierres" style="display:${!datos.metodo || datos.metodo === 'cierres' ? 'block' : 'none'};">
          <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:15px;">3. DETERMINACIÓN DE LA RENTA IMPONIBLE SOBRE CIERRES PARCIALES</div>
          <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
            <tbody>
              <tr>
                <td style="padding:6px; width:70%;">Renta bruta acumulada (incluyendo exentas, no afectas o sujetas a retención definitiva)</td>
                <td><input type="number" step="0.01" id="f-1361-rentas" class="form-control form-control-sm text-right" style="font-weight:bold;" value="${datos.rentas || 0}" data-original="${datos.valores_originales?.rentas ?? 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:6px;">(-) Rentas exentas y no afectas acumuladas</td>
                <td><input type="number" step="0.01" id="f-1361-exentas" class="form-control form-control-sm text-right" value="${datos.exentas || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
              </tr>
              <tr>
                <td style="padding:6px;">(-) Rentas sujetas a retención definitiva (art 52 A)</td>
                <td><input type="number" step="0.01" id="f-1361-retdef" class="form-control form-control-sm text-right" value="${datos.retdef || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:6px;">(-) Costos y gastos acumulados deducibles localmente</td>
                <td><input type="number" step="0.01" id="f-1361-gastos" class="form-control form-control-sm text-right" value="${datos.gastos || 0}" data-original="${datos.valores_originales?.gastos ?? 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
              </tr>
              <tr>
                <td style="padding:6px;">(+) Costos y gastos de rentas exentas acumulados</td>
                <td><input type="number" step="0.01" id="f-1361-gastosexentas" class="form-control form-control-sm text-right" value="${datos.gastosexentas || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:6px;">(+) Costos y gastos acumulados de rentas que fueron sujetas a retención definitiva según artículo 52 "A" Ley del IVA</td>
                <td><input type="number" step="0.01" id="f-1361-gastosretdef" class="form-control form-control-sm text-right" value="${datos.gastosretdef || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
              </tr>
              <tr>
                <td style="padding:6px;">(+) Costos y gastos no deducibles acumulados</td>
                <td><input type="number" step="0.01" id="f-1361-nodeducibles" class="form-control form-control-sm text-right" value="${datos.nodeducibles || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
              </tr>
              <tr style="font-weight:bold; background:#eee;">
                <td style="padding:6px;">(=) Renta Imponible acumulada</td>
                <td><input type="text" id="f-1361-renta-neta" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.renta_neta || 0}" readonly /></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:6px;">Impuesto Sobre la Renta acumulado determinado (25%)</td>
                <td><input type="text" id="f-1361-impuesto-ac" class="form-control form-control-sm text-right bg-light" value="${datos.impuesto_acumulado || 0}" readonly /></td>
              </tr>
              <tr>
                <td style="padding:6px;">(-) Impuesto sobre la Renta del trimestre inmediato anterior</td>
                <td><input type="number" step="0.01" id="f-1361-imp-trim-ant" class="form-control form-control-sm text-right" value="${datos.imp_trim_anterior || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
              </tr>
              <tr style="background:#eee; font-weight:bold;">
                <td style="padding:6px;">Impuesto determinado en este trimestre (cierres)</td>
                <td><input type="text" id="f-1361-impuesto-c" class="form-control form-control-sm text-right bg-light" value="${datos.impuesto_determinado || 0}" readonly /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div id="f-1361-sec-estimada" style="display:${datos.metodo === 'estimada' ? 'block' : 'none'};">
          <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:15px;">4. RENTA ESTIMADA TRIMESTRAL</div>
          <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
            <tbody>
              <tr>
                <td style="padding:6px; width:70%;">Renta bruta de este trimestre (ventas netas)</td>
                <td><input type="number" step="0.01" id="f-1361-estimada-bruta" class="form-control text-right" value="${datos.estimada_bruta || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:6px;">(-) Rentas exentas y no afectas de este trimestre</td>
                <td><input type="number" step="0.01" id="f-1361-estimada-exentas" class="form-control text-right" value="${datos.estimada_exentas || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
              </tr>
              <tr>
                <td style="padding:6px; font-weight:bold;">Renta Neta del trimestre</td>
                <td><input type="text" id="f-1361-estimada-neta" class="form-control text-right bg-light" value="${datos.estimada_neta || 0}" readonly /></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:6px; font-weight:bold;">Renta Imponible estimada (8% de la Renta Neta)</td>
                <td><input type="text" id="f-1361-estimada-imponible" class="form-control text-right bg-light" value="${datos.estimada_imponible || 0}" readonly /></td>
              </tr>
              <tr style="background:#eee; font-weight:bold;">
                <td style="padding:6px;">Impuesto determinado (25% sobre imponible estimada)</td>
                <td><input type="text" id="f-1361-impuesto-e" class="form-control text-right bg-light" value="${datos.impuesto_determinado_e || 0}" readonly /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">5. LIQUIDACIÓN Y DETERMINACIÓN DEL IMPUESTO A PAGAR</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Impuesto determinado en este trimestre (Q)</td>
              <td><input type="text" id="f-1361-imp-det-liq" class="form-control text-right bg-light font-weight-bold" value="${datos.impuesto_determinado || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Saldo de ISO debidamente pagado en períodos anteriores</td>
              <td><input type="number" step="0.01" id="f-1361-iso-ant" class="form-control text-right" value="${datos.iso_anterior || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(-) Acreditamiento de ISO para este período</td>
              <td><input type="text" id="f-1361-iso-acred" class="form-control text-right bg-light" value="${datos.iso_acreditamiento || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px; font-weight:bold;">Saldo de ISO por acreditar para siguientes trimestres</td>
              <td><input type="text" id="f-1361-iso-sig" class="form-control text-right bg-light" value="${datos.iso_saldo_sig || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(-) Incentivos Fiscales (Dtos. 29-89, etc.)</td>
              <td><input type="number" step="0.01" id="f-1361-incentivos" class="form-control text-right" value="${datos.incentivos || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
            </tr>
            <tr style="background:#e9f0fa; font-weight:bold; color:#1a365d;">
              <td style="padding:6px; font-size:12px;">Impuesto a pagar neto</td>
              <td><input type="text" id="f-1361-imp-pagar" class="form-control text-right bg-light font-weight-bold" style="color:#1a365d;" value="${datos.impuesto_a_pagar || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">6. RECTIFICACIÓN / 7. ACCESORIOS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Número de formulario que se rectifica</td>
              <td><input type="text" id="f-1361-rect-numero" class="form-control text-right" value="${datos.rect_numero || ''}" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Impuesto ingresado en declaración anterior</td>
              <td><input type="number" step="0.01" id="f-1361-rect-impuesto" class="form-control text-right" value="${datos.rect_impuesto || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Multas (formal, omisión, etc.)</td>
              <td><input type="number" step="0.01" id="f-1361-multa" class="form-control text-right" value="${datos.multa || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Intereses</td>
              <td><input type="number" step="0.01" id="f-1361-interes" class="form-control text-right" value="${datos.interes || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Mora</td>
              <td><input type="number" step="0.01" id="f-1361-mora" class="form-control text-right" value="${datos.mora || 0}" oninput="Modulos.contabilidad.sat.recalc1361()" /></td>
            </tr>
          </tbody>
        </table>
      `;
    } else if (tipo === 'SAT-1608') {
      subFormHtml = `
        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">3. DETERMINACIÓN DEL MARGEN BRUTO %</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Total ingresos brutos por servicios prestados (durante el período de liquidación anual del ISR inmediato anterior)</td>
              <td><input type="number" step="0.01" id="f-1608-ingresos-servicios" class="form-control text-right" value="${datos.ingresos_servicios || 0}" data-original="${datos.valores_originales?.ingresos_servicios ?? 0}" oninput="Modulos.contabilidad.sat.recalc1608(); Modulos.contabilidad.sat.verificarCambiosOperador(this);" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">Total ingresos brutos por ventas (durante el período de liquidación anual del ISR inmediato anterior)</td>
              <td><input type="number" step="0.01" id="f-1608-ingresos-ventas" class="form-control text-right" value="${datos.ingresos_ventas || 0}" data-original="${datos.valores_originales?.ingresos_ventas ?? 0}" oninput="Modulos.contabilidad.sat.recalc1608(); Modulos.contabilidad.sat.verificarCambiosOperador(this);" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Total costo de ventas (no incluir gastos de ventas ni administrativos)</td>
              <td><input type="number" step="0.01" id="f-1608-costo-ventas" class="form-control text-right" value="${datos.costo_ventas || 0}" data-original="${datos.valores_originales?.costo_ventas ?? 0}" oninput="Modulos.contabilidad.sat.recalc1608(); Modulos.contabilidad.sat.verificarCambiosOperador(this);" /></td>
            </tr>
            <tr style="background:#f9f9f9; font-weight:bold;">
              <td style="padding:6px;">Total ingresos brutos menos Total costo de ventas</td>
              <td><input type="text" id="f-1608-margen-monto" class="form-control text-right bg-light" value="${datos.margen_monto || 0}" readonly /></td>
            </tr>
            <tr style="font-weight:bold;">
              <td style="padding:6px;">MARGEN BRUTO % (para estar afecto al impuesto, debe ser mayor al 4%)</td>
              <td><input type="text" id="f-1608-margen-pct" class="form-control text-right bg-light" value="${datos.margen_pct || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">4. BASE IMPONIBLE SEGÚN ACTIVO NETO</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Activo Total</td>
              <td><input type="number" step="0.01" id="f-1608-activo-total" class="form-control form-control-sm text-right" value="${datos.activo_total || 0}" data-original="${datos.valores_originales?.activo_total ?? 0}" oninput="Modulos.contabilidad.sat.recalc1608(); Modulos.contabilidad.sat.verificarCambiosOperador(this);" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Depreciaciones acumuladas</td>
              <td><input type="number" step="0.01" id="f-1608-deprec" class="form-control form-control-sm text-right" value="${datos.depreciaciones || 0}" data-original="${datos.valores_originales?.depreciaciones ?? 0}" oninput="Modulos.contabilidad.sat.recalc1608(); Modulos.contabilidad.sat.verificarCambiosOperador(this);" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(-) Amortizaciones acumuladas</td>
              <td><input type="number" step="0.01" id="f-1608-amort" class="form-control form-control-sm text-right" value="${datos.amortizaciones || 0}" data-original="${datos.valores_originales?.amortizaciones ?? 0}" oninput="Modulos.contabilidad.sat.recalc1608(); Modulos.contabilidad.sat.verificarCambiosOperador(this);" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Reserva para cuentas incobrables</td>
              <td><input type="number" step="0.01" id="f-1608-incob" class="form-control form-control-sm text-right" value="${datos.reserva_incobrables || 0}" data-original="${datos.valores_originales?.reserva_incobrables ?? 0}" oninput="Modulos.contabilidad.sat.recalc1608(); Modulos.contabilidad.sat.verificarCambiosOperador(this);" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(-) Créditos fiscales pendientes de reintegro (saldos líquidos y exigibles).</td>
              <td><input type="number" step="0.01" id="f-1608-cred-fisc" class="form-control form-control-sm text-right" value="${datos.creditos_fiscales || 0}" data-original="${datos.valores_originales?.creditos_fiscales ?? 0}" oninput="Modulos.contabilidad.sat.recalc1608(); Modulos.contabilidad.sat.verificarCambiosOperador(this);" /></td>
            </tr>
            <tr style="background:#eee; font-weight:bold;">
              <td style="padding:6px;">Activo neto</td>
              <td><input type="text" id="f-1608-activo-neto" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.activo_neto || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Base imponible (según activo neto)</td>
              <td><input type="text" id="f-1608-activo-base" class="form-control form-control-sm text-right bg-light" value="${datos.activo_base || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">Impuesto total</td>
              <td><input type="text" id="f-1608-activo-impuesto-t" class="form-control form-control-sm text-right bg-light" value="${datos.activo_impuesto_t || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(-) Impuesto Único Sobre Inmuebles efectivamente pagado durante mismo trimestre</td>
              <td><input type="number" step="0.01" id="f-1608-iusi" class="form-control form-control-sm text-right" value="${datos.iusi_pagado || 0}" data-original="${datos.valores_originales?.iusi_pagado ?? 0}" oninput="Modulos.contabilidad.sat.recalc1608(); Modulos.contabilidad.sat.verificarCambiosOperador(this);" /></td>
            </tr>
            <tr style="background:#eee; font-weight:bold;">
              <td style="padding:6px;">Impuesto (según activo neto)</td>
              <td><input type="text" id="f-1608-activo-impuesto" class="form-control form-control-sm text-right bg-light" value="${datos.activo_impuesto || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">5. BASE IMPONIBLE SEGÚN INGRESOS BRUTOS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Ingresos brutos (durante el período de liquidación anual del ISR inmediato anterior)</td>
              <td><input type="number" step="0.01" id="f-1608-ingresos-anual" class="form-control text-right" value="${datos.ingresos_anual || 0}" data-original="${datos.valores_originales?.ingresos_anual ?? 0}" oninput="Modulos.contabilidad.sat.recalc1608(); Modulos.contabilidad.sat.verificarCambiosOperador(this);" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Ingresos por resarcimientos provenientes de contratos de seguro</td>
              <td><input type="number" step="0.01" id="f-1608-ingresos-seguro" class="form-control text-right" value="${datos.ingresos_seguro || 0}" oninput="Modulos.contabilidad.sat.recalc1608();" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(-) Ingresos por resarcimientos provenientes de contratos de reaseguro</td>
              <td><input type="number" step="0.01" id="f-1608-ingresos-reaseguro" class="form-control text-right" value="${datos.ingresos_reaseguro || 0}" oninput="Modulos.contabilidad.sat.recalc1608();" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Ingresos por resarcimientos provenientes de contratos de reafianzamiento</td>
              <td><input type="number" step="0.01" id="f-1608-ingresos-reafianzamiento" class="form-control text-right" value="${datos.ingresos_reafianzamiento || 0}" oninput="Modulos.contabilidad.sat.recalc1608();" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(-) Primas cedidas de seguro y de reafianzamiento</td>
              <td><input type="number" step="0.01" id="f-1608-primas-cedidas" class="form-control text-right" value="${datos.primas_cedidas || 0}" oninput="Modulos.contabilidad.sat.recalc1608();" /></td>
            </tr>
            <tr style="background:#eee; font-weight:bold;">
              <td style="padding:6px;">Ingresos brutos menos exclusiones</td>
              <td><input type="text" id="f-1608-ingresos-neto" class="form-control text-right bg-light" value="${datos.ingresos_neto || 0}" readonly /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Base imponible (según ingresos brutos)</td>
              <td><input type="text" id="f-1608-ingresos-base" class="form-control text-right bg-light" value="${datos.ingresos_base || 0}" readonly /></td>
            </tr>
            <tr style="background:#eee; font-weight:bold;">
              <td style="padding:6px;">Impuesto (según ingresos brutos)</td>
              <td><input type="text" id="f-1608-ingresos-impuesto" class="form-control text-right bg-light" value="${datos.ingresos_impuesto || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">6. DETERMINACIÓN DEL IMPUESTO</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Impuesto determinado</td>
              <td><input type="text" id="f-1608-impuesto-det" class="form-control text-right bg-light font-weight-bold" value="${datos.impuesto_det || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Acreditación de ISR al ISO (Literal b Art. 11 de la ley). Saldo No Acreditado</td>
              <td><input type="number" step="0.01" id="f-1608-isr-ant" class="form-control text-right" value="${datos.isr_anterior || 0}" data-original="${datos.valores_originales?.isr_anterior ?? 0}" oninput="Modulos.contabilidad.sat.recalc1608(); Modulos.contabilidad.sat.verificarCambiosOperador(this);" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Valor de ISR a acreditar en este período (utilice hasta el monto del impuesto a cubrir)</td>
              <td><input type="number" step="0.01" id="f-1608-isr-acred" class="form-control text-right" value="${datos.isr_acreditamiento || 0}" oninput="Modulos.contabilidad.sat.recalc1608()" /></td>
            </tr>
            <tr style="background:#e9f0fa; font-weight:bold; color:#1a365d;">
              <td style="padding:6px; font-size:12px;">Impuesto</td>
              <td><input type="text" id="f-1608-imp-pagar" class="form-control text-right bg-light font-weight-bold" style="color:#1a365d;" value="${datos.impuesto_a_pagar || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">7. RECTIFICACIÓN (opcional)</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">
                Número de la declaración que se rectifica
                <div style="font-size:9px; color:#666; font-weight:normal; margin-top:2px;">Son 11, 12 ó 15 dígitos, comenzando con el código de formulario: 1601, 1609 ó 1608. Ejemplo 160812345678901</div>
              </td>
              <td><input type="text" id="f-1608-rect-numero" class="form-control text-right" value="${datos.rect_numero || ''}" oninput="Modulos.contabilidad.sat.recalc1608()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Impuesto ingresado con el formulario que se rectifica y anteriores</td>
              <td><input type="number" step="0.01" id="f-1608-rect-impuesto" class="form-control text-right" value="${datos.rect_impuesto || 0}" oninput="Modulos.contabilidad.sat.recalc1608()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(=) Impuesto a pagar</td>
              <td><input type="text" id="f-1608-rect-pagar" class="form-control text-right bg-light" value="${datos.rect_pagar || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(=) Impuesto a favor del contribuyente</td>
              <td><input type="text" id="f-1608-rect-favor" class="form-control text-right bg-light" value="${datos.rect_favor || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">8. ACCESORIOS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">¿Cuándo pagará este formulario?</td>
              <td><input type="date" id="f-1608-fecha-pago" class="form-control text-right" value="${datos.fecha_pago || new Date().toISOString().substring(0, 10)}" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Multa formal (por presentación extemporánea)</td>
              <td><input type="number" step="0.01" id="f-1608-multa" class="form-control text-right" value="${datos.multa || 0}" oninput="Modulos.contabilidad.sat.recalc1608()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Multa por omisión</td>
              <td><input type="number" step="0.01" id="f-1608-multa-omision" class="form-control text-right" value="${datos.multa_omision || 0}" oninput="Modulos.contabilidad.sat.recalc1608()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Multa por rectificación</td>
              <td><input type="number" step="0.01" id="f-1608-multa-rect" class="form-control text-right" value="${datos.multa_rect || 0}" oninput="Modulos.contabilidad.sat.recalc1608()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Intereses</td>
              <td><input type="number" step="0.01" id="f-1608-interes" class="form-control text-right" value="${datos.interes || 0}" oninput="Modulos.contabilidad.sat.recalc1608()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Mora</td>
              <td><input type="number" step="0.01" id="f-1608-mora" class="form-control text-right" value="${datos.mora || 0}" oninput="Modulos.contabilidad.sat.recalc1608()" /></td>
            </tr>
            <tr style="background:#eee; font-weight:bold;">
              <td style="padding:6px;">(=) Accesorios a pagar</td>
              <td><input type="text" id="f-1608-acc-pagar" class="form-control text-right bg-light" value="${datos.accesorios_pagar || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>
      `;
    } else if (tipo === 'SAT-1331') {
      const lucrativeConcepts = [
        "Compras o servicios gravados, adquiridos de entidades exentas",
        "Compra de materias primas",
        "Compra de productos terminados",
        "Transporte de carga y de personas, dentro o fuera del territorio",
        "Telecomunicaciones",
        "Servicios bancarios, financieros y seguros",
        "Servicios informáticos",
        "Suministro de energía eléctrica y agua",
        "Servicios técnicos",
        "Bienes muebles, arrendamiento y subarrendamiento",
        "Bienes inmuebles, arrendamiento y subarrendamiento",
        "Servicios profesionales",
        "Dietas a asistentes eventuales a consejos y otros órganos directivos",
        "Espectáculos públicos, culturales y deportivos",
        "Subsidios públicos",
        "Subsidios privados",
        "Otros bienes y/o servicios",
        "Películas cinematográficas, TV y similares",
        "Dietas a miembros de concejos municipales, órganos directivos y consultivos",
        "Otras remuneraciones (Viáticos no comprobables, comisiones, gastos de representación)"
      ];

      const capitalMovableConcepts = [
        "Intereses y Rentas de Dinero o en Especie Provenientes de Créditos de Cualquier Naturaleza",
        "Arrendamientos y Subarrendamientos de Bienes Muebles",
        "Constitución o Cesión de Derechos o Facultades de Uso o Goce de Bienes Muebles Tangibles",
        "Constitución o Cesión de Derechos o Facultades de Uso o Goce de Bienes Muebles Intangibles",
        "Rentas derivadas de contratos de Seguros",
        "Rentas Vitalicias o Temporales Originadas de Inversión de Capital",
        "Rentas Originadas en Donaciones Condicionadas"
      ];

      subFormHtml = `
        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">
          ¿QUÉ CONCEPTOS DE RETENCIÓN DESEA DECLARAR?
        </div>
        <div style="padding:12px; display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:13px; color:#000;">
          <label><input type="checkbox" id="f-1331-chk-lucrativas" ${!datos.has_lucrativas || datos.has_lucrativas ? 'checked' : ''} onchange="document.getElementById('f-1331-sec-lucrativas').style.display=this.checked?'block':'none';Modulos.contabilidad.sat.recalc1331()" /> 3. Retenciones sobre Actividades Lucrativas</label>
          <label><input type="checkbox" id="f-1331-chk-especiales" ${datos.has_especiales ? 'checked' : ''} onchange="document.getElementById('f-1331-sec-especiales').style.display=this.checked?'block':'none';Modulos.contabilidad.sat.recalc1331()" /> 4. Retenciones sobre Facturas Especiales</label>
          <label><input type="checkbox" id="f-1331-chk-trabajo" ${datos.has_trabajo ? 'checked' : ''} onchange="document.getElementById('f-1331-sec-trabajo').style.display=this.checked?'block':'none';Modulos.contabilidad.sat.recalc1331()" /> 5. Retenciones sobre Rentas del Trabajo</label>
          <label><input type="checkbox" id="f-1331-chk-capital" ${datos.has_capital ? 'checked' : ''} onchange="document.getElementById('f-1331-sec-capital').style.display=this.checked?'block':'none';Modulos.contabilidad.sat.recalc1331()" /> 6. Retenciones sobre Rentas de Capital</label>
        </div>

        <div id="f-1331-sec-lucrativas" style="display:${!datos.has_lucrativas || datos.has_lucrativas ? 'block' : 'none'}; margin-top:10px;">
          <div style="background:#f4f4f4; padding:6px 12px; font-weight:bold; border-bottom:1px solid #ccc; font-size:12px;">3. RETENCIONES SOBRE ACTIVIDADES LUCRATIVAS</div>
          <table style="width:100%; border-collapse:collapse; margin-top:5px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
            <thead>
              <tr style="background:#f2f2f2; font-weight:bold;">
                <th style="padding:4px; width:60%;">CONCEPTOS</th>
                <th style="padding:4px; width:20%; text-align:center;">BASE</th>
                <th style="padding:4px; width:20%; text-align:center;">RETENCIÓN</th>
              </tr>
            </thead>
            <tbody>
              ${lucrativeConcepts.map((c, i) => {
                const idx = i + 1;
                return `
                  <tr style="${i % 2 === 1 ? 'background:#f9f9f9;' : ''}">
                    <td style="padding:4px;">${c}</td>
                    <td><input type="number" step="0.01" id="f-1331-base-luc-${idx}" class="form-control form-control-sm text-right" value="${datos[`base_luc_${idx}`] || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
                    <td><input type="text" id="f-1331-ret-luc-${idx}" class="form-control form-control-sm text-right bg-light" value="${datos[`ret_luc_${idx}`] || 0}" readonly /></td>
                  </tr>
                `;
              }).join('')}
              <tr style="background:#eee; font-weight:bold;">
                <td style="padding:6px;">Total Base y Retención</td>
                <td><input type="text" id="f-1331-total-base-luc" class="form-control form-control-sm text-right bg-light" value="${datos.total_base_luc || 0}" readonly /></td>
                <td><input type="text" id="f-1331-total-ret-luc" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.total_ret_luc || 0}" readonly /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div id="f-1331-sec-especiales" style="display:${datos.has_especiales ? 'block' : 'none'}; margin-top:15px;">
          <div style="background:#f4f4f4; padding:6px 12px; font-weight:bold; border-bottom:1px solid #ccc; font-size:12px;">4. RETENCIONES SOBRE FACTURAS ESPECIALES</div>
          <table style="width:100%; border-collapse:collapse; margin-top:5px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
            <thead>
              <tr style="background:#f2f2f2; font-weight:bold;">
                <th style="padding:4px; width:60%;">CONCEPTOS</th>
                <th style="padding:4px; width:20%; text-align:center;">BASE</th>
                <th style="padding:4px; width:20%; text-align:center;">RETENCIÓN</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding:4px;">Facturación por cuenta del vendedor (Facturas especiales sobre venta de bienes)</td>
                <td><input type="number" step="0.01" id="f-1331-base-esp-1" class="form-control form-control-sm text-right" value="${datos.base_esp_1 || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
                <td><input type="text" id="f-1331-ret-esp-1" class="form-control form-control-sm text-right bg-light" value="${datos.ret_esp_1 || 0}" readonly /></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:4px;">Facturación por cuenta del vendedor (Facturas especiales sobre prestación de servicios)</td>
                <td><input type="number" step="0.01" id="f-1331-base-esp-2" class="form-control form-control-sm text-right" value="${datos.base_esp_2 || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
                <td><input type="text" id="f-1331-ret-esp-2" class="form-control form-control-sm text-right bg-light" value="${datos.ret_esp_2 || 0}" readonly /></td>
              </tr>
              <tr style="background:#eee; font-weight:bold;">
                <td style="padding:6px;">Total Base y Retención</td>
                <td><input type="text" id="f-1331-total-base-esp" class="form-control form-control-sm text-right bg-light" value="${datos.total_base_esp || 0}" readonly /></td>
                <td><input type="text" id="f-1331-total-ret-esp" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.total_ret_esp || 0}" readonly /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div id="f-1331-sec-trabajo" style="display:${datos.has_trabajo ? 'block' : 'none'}; margin-top:15px;">
          <div style="background:#f4f4f4; padding:6px 12px; font-weight:bold; border-bottom:1px solid #ccc; font-size:12px;">5. RETENCIONES SOBRE RENTAS DEL TRABAJO</div>
          <table style="width:100%; border-collapse:collapse; margin-top:5px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
            <thead>
              <tr style="background:#f2f2f2; font-weight:bold;">
                <th style="padding:4px; width:60%;">CONCEPTOS</th>
                <th style="padding:4px; width:20%; text-align:center;">BASE</th>
                <th style="padding:4px; width:20%; text-align:center;">RETENCIÓN</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding:4px;">Rentas del trabajo en relación de dependencia (retenciones acumuladas)</td>
                <td><input type="number" step="0.01" id="f-1331-base-trab" class="form-control form-control-sm text-right" value="${datos.base_trab || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
                <td><input type="number" step="0.01" id="f-1331-ret-trab" class="form-control form-control-sm text-right" value="${datos.ret_trab || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
              </tr>
              <tr style="background:#eee; font-weight:bold;">
                <td style="padding:6px;">Total Base y Retención</td>
                <td><input type="text" id="f-1331-total-base-trab" class="form-control form-control-sm text-right bg-light" value="${datos.total_base_trab || 0}" readonly /></td>
                <td><input type="text" id="f-1331-total-ret-trab" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.total_ret_trab || 0}" readonly /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div id="f-1331-sec-capital" style="display:${datos.has_capital ? 'block' : 'none'}; margin-top:15px;">
          <div style="background:#f4f4f4; padding:6px 12px; font-weight:bold; border-bottom:1px solid #ccc; font-size:12px;">6. RETENCIONES SOBRE RENTAS DE CAPITAL</div>

          <div style="background:#eee; padding:4px 12px; font-weight:bold; font-size:11px; margin-top:5px;">6.1. RENTAS DE CAPITAL INMOBILIARIO</div>
          <table style="width:100%; border-collapse:collapse; margin-top:5px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
            <thead>
              <tr style="background:#f2f2f2; font-weight:bold;">
                <th style="padding:4px; width:60%;">INGRESOS PROVENIENTES DE</th>
                <th style="padding:4px; width:20%; text-align:center;">BASE</th>
                <th style="padding:4px; width:20%; text-align:center;">RETENCIÓN</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding:4px;">Arrendamiento y Subarrendamiento de Bienes Inmuebles</td>
                <td><input type="number" step="0.01" id="f-1331-base-cap-inmob-1" class="form-control form-control-sm text-right" value="${datos.base_cap_inmob_1 || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
                <td><input type="text" id="f-1331-ret-cap-inmob-1" class="form-control form-control-sm text-right bg-light" value="${datos.ret_cap_inmob_1 || 0}" readonly /></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:4px;">Constitución Cesión de Derechos o Facultades de Uso o Goce de Bienes Inmuebles</td>
                <td><input type="number" step="0.01" id="f-1331-base-cap-inmob-2" class="form-control form-control-sm text-right" value="${datos.base_cap_inmob_2 || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
                <td><input type="text" id="f-1331-ret-cap-inmob-2" class="form-control form-control-sm text-right bg-light" value="${datos.ret_cap_inmob_2 || 0}" readonly /></td>
              </tr>
              <tr style="background:#eee; font-weight:bold;">
                <td style="padding:6px;">Total Base y Retención</td>
                <td><input type="text" id="f-1331-total-base-cap-inmob" class="form-control form-control-sm text-right bg-light" value="${datos.total_base_cap_inmob || 0}" readonly /></td>
                <td><input type="text" id="f-1331-total-ret-cap-inmob" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.total_ret_cap_inmob || 0}" readonly /></td>
              </tr>
            </tbody>
          </table>

          <div style="background:#eee; padding:4px 12px; font-weight:bold; font-size:11px; margin-top:10px;">6.2 RENTAS DE CAPITAL MOBILIARIO</div>
          <table style="width:100%; border-collapse:collapse; margin-top:5px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
            <thead>
              <tr style="background:#f2f2f2; font-weight:bold;">
                <th style="padding:4px; width:60%;">INGRESOS PERCIBIDOS POR O EN CONCEPTO DE</th>
                <th style="padding:4px; width:20%; text-align:center;">BASE</th>
                <th style="padding:4px; width:20%; text-align:center;">RETENCIÓN</th>
              </tr>
            </thead>
            <tbody>
              ${capitalMovableConcepts.map((c, i) => {
                const idx = i + 1;
                return `
                  <tr style="${i % 2 === 1 ? 'background:#f9f9f9;' : ''}">
                    <td style="padding:4px;">${c}</td>
                    <td><input type="number" step="0.01" id="f-1331-base-cap-mob-${idx}" class="form-control form-control-sm text-right" value="${datos[`base_cap_mob_${idx}`] || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
                    <td><input type="text" id="f-1331-ret-cap-mob-${idx}" class="form-control form-control-sm text-right bg-light" value="${datos[`ret_cap_mob_${idx}`] || 0}" readonly /></td>
                  </tr>
                `;
              }).join('')}
              <tr style="background:#eee; font-weight:bold;">
                <td style="padding:6px;">Total Base y Retención</td>
                <td><input type="text" id="f-1331-total-base-cap-mob" class="form-control form-control-sm text-right bg-light" value="${datos.total_base_cap_mob || 0}" readonly /></td>
                <td><input type="text" id="f-1331-total-ret-cap-mob" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.total_ret_cap_mob || 0}" readonly /></td>
              </tr>
            </tbody>
          </table>

          <div style="background:#eee; padding:4px 12px; font-weight:bold; font-size:11px; margin-top:10px;">6.3 RETENCIONES POR DISTRIBUCIÓN DE DIVIDENDOS, GANANCIAS Y UTILIDADES</div>
          <table style="width:100%; border-collapse:collapse; margin-top:5px; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
            <tbody>
              <tr>
                <td style="padding:6px; width:70%;">Cantidad de períodos</td>
                <td><input type="number" id="f-1331-div-period-cant" class="form-control form-control-sm text-right" value="${datos.div_period_cant || 0}" /></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:6px;">Indique el o los períodos que está declarando: ejemplo 2013,2014:</td>
                <td><input type="text" id="f-1331-div-period-text" class="form-control form-control-sm text-right" value="${datos.div_period_text || ''}" /></td>
              </tr>
              <tr>
                <td style="padding:6px;">Rentas por distribución de dividendos, ganancias y utilidades</td>
                <td><input type="number" step="0.01" id="f-1331-base-cap-div" class="form-control form-control-sm text-right" value="${datos.base_cap_div || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
              </tr>
              <tr style="background:#eee; font-weight:bold;">
                <td style="padding:6px;">Impuesto sobre Rentas de Distribución de dividendos, ganancias y utilidades</td>
                <td><input type="text" id="f-1331-ret-cap-div" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.ret_cap_div || 0}" readonly /></td>
              </tr>
              <tr style="background:#eee; font-weight:bold; border-top:2px solid #555;">
                <td style="padding:6px;">Total Base y Retención (Sección 6.3)</td>
                <td><input type="text" id="f-1331-total-base-cap-div-sum" class="form-control form-control-sm text-right bg-light" value="${datos.total_base_cap_div || 0}" readonly /></td>
                <td><input type="text" id="f-1331-total-ret-cap-div" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.total_ret_cap_div || 0}" readonly /></td>
              </tr>
              <tr style="background:#ddd; font-weight:bold; border-top:2px solid #333;">
                <td style="padding:6px;">TOTAL RENTAS DE CAPITAL (6.1 + 6.2 + 6.3)</td>
                <td><input type="text" id="f-1331-total-base-cap" class="form-control form-control-sm text-right bg-light" value="${datos.total_base_cap || 0}" readonly /></td>
                <td><input type="text" id="f-1331-total-ret-cap" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.total_ret_cap || 0}" readonly /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">7. DETERMINACIÓN DEL IMPUESTO A PAGAR</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr style="background:#e9f0fa; font-weight:bold; color:#1a365d;">
              <td style="padding:6px; width:70%;">Impuesto a pagar</td>
              <td><input type="text" id="f-1331-imp-pagar" class="form-control text-right bg-light font-weight-bold" style="color:#1a365d;" value="${datos.impuesto || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">8. CANTIDAD DE OPERACIONES REALIZADAS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Cantidad de retenciones sobre Actividades Lucrativas</td>
              <td><input type="number" id="f-1331-cant-lucrativas" class="form-control text-right" value="${datos.cant_lucrativas || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">Cantidad de retenciones sobre Facturas Especiales</td>
              <td><input type="number" id="f-1331-cant-especiales" class="form-control text-right" value="${datos.cant_especiales || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Cantidad de retenciones sobre Rentas del Trabajo</td>
              <td><input type="number" id="f-1331-cant-trabajo" class="form-control text-right" value="${datos.cant_trabajo || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">Cantidad de retenciones sobre Rentas de Capital</td>
              <td><input type="number" id="f-1331-cant-capital" class="form-control text-right" value="${datos.cant_capital || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
            </tr>
            <tr style="background:#eee; font-weight:bold;">
              <td style="padding:6px;">Suma Total de Constancias</td>
              <td><input type="text" id="f-1331-suma-constancias" class="form-control text-right bg-light" value="${datos.suma_constancias || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">9. RECTIFICACIÓN (opcional)</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">
                Número de formulario SAT-1331 que se rectifica
                <div style="font-size:9px; color:#666; font-weight:normal; margin-top:2px;">Son 11 dígitos que aparecen en la parte superior derecha del encabezado del formulario a corregir. Ejemplo 12345678901</div>
              </td>
              <td><input type="text" id="f-1331-rect-numero" class="form-control text-right" value="${datos.rect_numero || ''}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Impuesto ingresado con el formulario que se rectifica y anteriores</td>
              <td><input type="number" step="0.01" id="f-1331-rect-impuesto" class="form-control text-right" value="${datos.rect_impuesto || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(=) Impuesto a pagar</td>
              <td><input type="text" id="f-1331-rect-pagar" class="form-control text-right bg-light" value="${datos.rect_pagar || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(=) Impuesto a favor del contribuyente</td>
              <td><input type="text" id="f-1331-rect-favor" class="form-control text-right bg-light" value="${datos.rect_favor || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">10. ACCESORIOS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Fecha máxima de pago sin accesorios (Vencimiento de ley)</td>
              <td><input type="date" id="f-1331-fecha-max-pago" class="form-control text-right" value="${datos.fecha_max_pago || ''}" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">¿Cuándo pagará este formulario?</td>
              <td><input type="date" id="f-1331-fecha-pago" class="form-control text-right" value="${datos.fecha_pago || new Date().toISOString().substring(0, 10)}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Multa formal (por presentación extemporánea)</td>
              <td><input type="number" step="0.01" id="f-1331-multa" class="form-control text-right" value="${datos.multa || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Multa por omisión</td>
              <td><input type="number" step="0.01" id="f-1331-multa-omision" class="form-control text-right" value="${datos.multa_omision || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Multa por rectificación</td>
              <td><input type="number" step="0.01" id="f-1331-multa-rect" class="form-control text-right" value="${datos.multa_rect || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Intereses</td>
              <td><input type="number" step="0.01" id="f-1331-interes" class="form-control text-right" value="${datos.interes || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Mora</td>
              <td><input type="number" step="0.01" id="f-1331-mora" class="form-control text-right" value="${datos.mora || 0}" oninput="Modulos.contabilidad.sat.recalc1331()" /></td>
            </tr>
            <tr style="background:#eee; font-weight:bold;">
              <td style="padding:6px;">(=) Accesorios a pagar</td>
              <td><input type="text" id="f-1331-acc-pagar" class="form-control text-right bg-light" value="${datos.accesorios_pagar || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>
      `;
    } else if (tipo === 'SAT-2085') {
      subFormHtml = `
        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">3. IMPUESTO RETENIDO POR FACTURAS ESPECIALES</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Cantidad de facturas especiales emitidas</td>
              <td><input type="number" id="f-2085-cant" class="form-control text-right" value="${datos.cant || 0}" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">Monto base de facturas especiales</td>
              <td><input type="number" step="0.01" id="f-2085-monto" class="form-control text-right" value="${datos.monto || 0}" data-original="${datos.valores_originales?.monto ?? 0}" oninput="Modulos.contabilidad.sat.recalc2085(); Modulos.contabilidad.sat.verificarCambiosOperador(this);" /></td>
            </tr>
            <tr style="background:#e9f0fa; font-weight:bold; color:#1a365d;">
              <td style="padding:6px;">IVA retenido por facturas especiales determinado (12%)</td>
              <td><input type="text" id="f-2085-impuesto" class="form-control text-right bg-light font-weight-bold" style="color:#1a365d;" value="${datos.impuesto || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">4. RECTIFICACIÓN / 5. ACCESORIOS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Número de formulario que se rectifica</td>
              <td><input type="text" id="f-2085-rect-numero" class="form-control text-right" value="${datos.rect_numero || ''}" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Impuesto ingresado en formulario anterior</td>
              <td><input type="number" step="0.01" id="f-2085-rect-impuesto" class="form-control text-right" value="${datos.rect_impuesto || 0}" oninput="Modulos.contabilidad.sat.recalc2085()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Multas (formal, omisión, etc.)</td>
              <td><input type="number" step="0.01" id="f-2085-multa" class="form-control text-right" value="${datos.multa || 0}" oninput="Modulos.contabilidad.sat.recalc2085()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Intereses</td>
              <td><input type="number" step="0.01" id="f-2085-interes" class="form-control text-right" value="${datos.interes || 0}" oninput="Modulos.contabilidad.sat.recalc2085()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Mora</td>
              <td><input type="number" step="0.01" id="f-2085-mora" class="form-control text-right" value="${datos.mora || 0}" oninput="Modulos.contabilidad.sat.recalc2085()" /></td>
            </tr>
          </tbody>
        </table>
      `;
    } else if (tipo === 'SAT-1431') {
      subFormHtml = `
        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">3. DATOS DE LA ACTIVIDAD / 4. NIT DEL PATRONO</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:50%;">Actividad Económica Principal *</td>
              <td><input type="text" id="f-1431-actividad" class="form-control" value="${datos.actividad || 'Taller / Servicios'}" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">NIT del Último Patrono *</td>
              <td><input type="text" id="f-1431-patrono-nit" class="form-control" value="${datos.patrono_nit || ''}" /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">5. RENTAS DEL TRABAJO EN RELACIÓN DE DEPENDENCIA</div>
        <div style="font-size:12px; font-weight:bold; padding:4px 0; color:#1a365d;">5.1 RENTA BRUTA (Ingresos anuales)</div>
        <table style="width:100%; border-collapse:collapse; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:4px; width:70%;">Sueldos / Salarios Ordinarios</td>
              <td><input type="number" step="0.01" id="f-1431-sueldos" class="form-control form-control-sm text-right" value="${datos.sueldos || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:4px;">Horas Extras</td>
              <td><input type="number" step="0.01" id="f-1431-horas-extras" class="form-control form-control-sm text-right" value="${datos.horas_extras || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr>
              <td style="padding:4px;">Comisiones</td>
              <td><input type="number" step="0.01" id="f-1431-comisiones" class="form-control form-control-sm text-right" value="${datos.comisiones || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:4px;">Aguinaldo recibido</td>
              <td><input type="number" step="0.01" id="f-1431-aguinaldo" class="form-control form-control-sm text-right" value="${datos.aguinaldo || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr>
              <td style="padding:4px;">Bonificación Anual (Bono 14) recibida</td>
              <td><input type="number" step="0.01" id="f-1431-bono14" class="form-control form-control-sm text-right" value="${datos.bono14 || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:4px;">Viáticos, propinas u otros ingresos afectos</td>
              <td><input type="number" step="0.01" id="f-1431-otros-ing" class="form-control form-control-sm text-right" value="${datos.otros_ing || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr style="background:#eee; font-weight:bold;">
              <td style="padding:4px;">Total Renta Bruta</td>
              <td><input type="text" id="f-1431-renta-bruta" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.renta_bruta || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="font-size:12px; font-weight:bold; padding:10px 0 4px 0; color:#1a365d;">5.2 RENTAS EXENTAS (Exenciones de ley)</div>
        <table style="width:100%; border-collapse:collapse; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:4px; width:70%;">Indemnizaciones por despido o tiempo servido</td>
              <td><input type="number" step="0.01" id="f-1431-indem" class="form-control form-control-sm text-right" value="${datos.indemnizaciones || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:4px;">(-) Aguinaldo ordinario exento (hasta 100% de un sueldo ordinario)</td>
              <td><input type="number" step="0.01" id="f-1431-aguinaldo-ex" class="form-control form-control-sm text-right" value="${datos.aguinaldo_exento || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr>
              <td style="padding:4px;">(-) Bonificación anual exenta (Bono 14 ordinario hasta 100% de un sueldo)</td>
              <td><input type="number" step="0.01" id="f-1431-bono14-ex" class="form-control form-control-sm text-right" value="${datos.bono14_exento || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr style="background:#eee; font-weight:bold;">
              <td style="padding:4px;">Total Rentas Exentas</td>
              <td><input type="text" id="f-1431-rentas-exentas" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.rentas_exentas || 0}" readonly /></td>
            </tr>
            <tr style="background:#e9ecef; font-weight:bold;">
              <td style="padding:4px;">Renta Neta (Renta Bruta – Rentas Exentas)</td>
              <td><input type="text" id="f-1431-renta-neta" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.renta_neta || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="font-size:12px; font-weight:bold; padding:10px 0 4px 0; color:#1a365d;">5.3 DEDUCCIONES (Gastos personales y previsión)</div>
        <table style="width:100%; border-collapse:collapse; font-size:11px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:4px; width:70%;">Gastos personales sin comprobantes (Fijo de ley)</td>
              <td><input type="text" id="f-1431-deduc-fijo" class="form-control form-control-sm text-right bg-light" value="48000.00" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:4px;">Gastos personales comprobados según planilla IVA (máximo Q 12,000.00)</td>
              <td><input type="number" step="0.01" id="f-1431-planilla-iva" class="form-control form-control-sm text-right" value="${datos.planilla_iva || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr>
              <td style="padding:4px;">Donaciones al Estado, universidades o entidades culturales</td>
              <td><input type="number" step="0.01" id="f-1431-donaciones" class="form-control form-control-sm text-right" value="${datos.donaciones || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:4px;">Cuotas IGSS de seguridad social (4.83% de los ingresos ordinarios)</td>
              <td><input type="number" step="0.01" id="f-1431-igss" class="form-control form-control-sm text-right" value="${datos.igss || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr>
              <td style="padding:4px;">Primas de seguro de vida (cobertura exclusiva de muerte del trabajador)</td>
              <td><input type="number" step="0.01" id="f-1431-seguro-vida" class="form-control form-control-sm text-right" value="${datos.seguro_vida || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr style="background:#eee; font-weight:bold;">
              <td style="padding:4px;">Total Deducciones</td>
              <td><input type="text" id="f-1431-deducciones" class="form-control form-control-sm text-right bg-light font-weight-bold" value="${datos.deducciones || 48000}" readonly /></td>
            </tr>
            <tr style="background:#e9f0fa; font-weight:bold; color:#1a365d;">
              <td style="padding:4px;">Renta Imponible (Renta Neta - Total Deducciones)</td>
              <td><input type="text" id="f-1431-renta-imponible" class="form-control form-control-sm text-right bg-light font-weight-bold" style="color:#1a365d;" value="${datos.renta_imponible || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">6. DETERMINACIÓN DEL IMPUESTO A PAGAR</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Impuesto Sobre la Renta determinado (5% hasta Q300k, 7% sobre excedente)</td>
              <td><input type="text" id="f-1431-impuesto" class="form-control text-right bg-light font-weight-bold" value="${datos.impuesto || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Retenciones del ISR anual realizadas por el patrono</td>
              <td><input type="number" step="0.01" id="f-1431-retenciones-patrono" class="form-control text-right" value="${datos.retenciones_patrono || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr style="background:#e9f0fa; font-weight:bold; color:#1a365d;">
              <td style="padding:6px; font-size:12px;">IMPUESTO A PAGAR NETO</td>
              <td><input type="text" id="f-1431-imp-pagar" class="form-control text-right bg-light font-weight-bold" style="color:#1a365d;" value="${datos.impuesto_a_pagar || 0}" readonly /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px; color:#c05621;">Retenciones en exceso a devolver por el patrono</td>
              <td><input type="text" id="f-1431-ret-exceso" class="form-control text-right bg-light" style="color:#c05621;" value="${datos.ret_exceso || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">7. RECTIFICACIÓN / 8. ACCESORIOS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Número de formulario que se rectifica</td>
              <td><input type="text" id="f-1431-rect-numero" class="form-control text-right" value="${datos.rect_numero || ''}" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(-) Impuesto ingresado en declaración anterior</td>
              <td><input type="number" step="0.01" id="f-1431-rect-impuesto" class="form-control text-right" value="${datos.rect_impuesto || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Multas (formal, omisión, etc.)</td>
              <td><input type="number" step="0.01" id="f-1431-multa" class="form-control text-right" value="${datos.multa || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Intereses</td>
              <td><input type="number" step="0.01" id="f-1431-interes" class="form-control text-right" value="${datos.interes || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(+) Mora</td>
              <td><input type="number" step="0.01" id="f-1431-mora" class="form-control text-right" value="${datos.mora || 0}" oninput="Modulos.contabilidad.sat.recalc1431()" /></td>
            </tr>
          </tbody>
        </table>
      `;
    } else if (tipo === 'SAT-1411') {
      subFormHtml = `
        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">3. RENTA BRUTA DEL PERÍODO</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Ingresos netos del período (ventas sin IVA)</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-1411-renta-bruta" class="form-control text-right" value="${datos.renta_bruta || 0}" data-original="${datos.valores_originales?.renta_bruta ?? 0}" oninput="Modulos.contabilidad.sat.recalc1411()" /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">4. COSTOS Y GASTOS DEDUCIBLES (Art. 21 LAT)</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">Costo de producción y ventas (compras + inventario)</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-1411-costos-gastos" class="form-control text-right" value="${datos.costos_gastos || 0}" data-original="${datos.valores_originales?.costos_gastos ?? 0}" oninput="Modulos.contabilidad.sat.recalc1411()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">Sueldos y salarios del año</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-1411-sueldos" class="form-control text-right" value="${datos.sueldos_anuales || 0}" oninput="Modulos.contabilidad.sat.recalc1411()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">Depreciaciones del año (activos fijos)</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-1411-depreciaciones" class="form-control text-right" value="${datos.depreciaciones || 0}" oninput="Modulos.contabilidad.sat.recalc1411()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">Otros gastos deducibles (renta local, servicios, etc.)</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-1411-otros-gastos" class="form-control text-right" value="${datos.otros_gastos || 0}" oninput="Modulos.contabilidad.sat.recalc1411()" /></td>
            </tr>
            <tr style="background:#e9ecef; font-weight:bold;">
              <td style="padding:6px;">Total Costos y Gastos Deducibles</td>
              <td style="padding:6px;"><input type="text" id="f-1411-total-costos" class="form-control text-right bg-light" value="${datos.total_costos || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">5. RENTA IMPONIBLE E IMPUESTO DETERMINADO</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px; width:70%;">Renta Imponible (Renta Bruta − Costos y Gastos)</td>
              <td style="padding:6px;"><input type="text" id="f-1411-renta-imponible" class="form-control text-right bg-light" value="${datos.renta_imponible || 0}" readonly /></td>
            </tr>
            <tr style="background:#e9f0fa; font-weight:bold;">
              <td style="padding:6px; color:#1a365d;">Impuesto determinado (25% sobre Renta Imponible)</td>
              <td style="padding:6px;"><input type="text" id="f-1411-imp-determinado" class="form-control text-right bg-light font-weight-bold" style="color:#1a365d;" value="${datos.imp_determinado || 0}" readonly /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">6. LIQUIDACIÓN — CRÉDITOS A DEDUCIR</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">(−) Impuesto pagado en cuotas trimestrales SAT-1361 del año</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-1411-imp-trimestrales" class="form-control text-right" value="${datos.imp_trimestrales || 0}" data-original="${datos.valores_originales?.imp_trimestrales ?? 0}" oninput="Modulos.contabilidad.sat.recalc1411()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(−) ISO acreditado pagado (SAT-1608) del año</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-1411-iso-acreditado" class="form-control text-right" value="${datos.iso_acreditado || 0}" data-original="${datos.valores_originales?.iso_acreditado ?? 0}" oninput="Modulos.contabilidad.sat.recalc1411()" /></td>
            </tr>
            <tr>
              <td style="padding:6px;">(−) Retenciones de ISR que me efectuaron en el año</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-1411-ret-isr" class="form-control text-right" value="${datos.ret_isr || 0}" data-original="${datos.valores_originales?.ret_isr ?? 0}" oninput="Modulos.contabilidad.sat.recalc1411()" /></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px; margin-top:20px;">7. ACCESORIOS</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; color:#000;" border="1" bordercolor="#ccc">
          <tbody>
            <tr>
              <td style="padding:6px; width:70%;">(+) Multas</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-1411-multas" class="form-control text-right" value="${datos.multas || 0}" oninput="Modulos.contabilidad.sat.recalc1411()" /></td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:6px;">(+) Mora</td>
              <td style="padding:6px;"><input type="number" step="0.01" id="f-1411-mora" class="form-control text-right" value="${datos.mora || 0}" oninput="Modulos.contabilidad.sat.recalc1411()" /></td>
            </tr>
          </tbody>
        </table>
        <div style="font-size:11px;color:#666;margin-top:8px;padding:6px;background:#fffde7;border-left:3px solid #f9a825">
          📅 Plazo de presentación: dentro de los <b>3 meses</b> siguientes al cierre del ejercicio fiscal (31 de diciembre) — normalmente <b>hasta el 31 de marzo</b> del año siguiente. (LAT Decreto 10-2012 Art. 38)
        </div>
      `;
    }

    const headerHtml = `
      <div class="no-print" style="background:var(--bg-secondary); padding:12px; display:flex; gap:10px; border:1px dashed var(--border-color); border-radius:var(--radius-md); justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap;">
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" onclick="Modulos.contabilidad._renderTab()">← Volver</button>
          <button class="btn btn-success" onclick="Modulos.contabilidad.sat.guardarDeclaracion('${id || ''}', '${tipo}', '${nit}', '${mes}', '${anio}', '${accNum}', '${formNum}', 'preparacion')">💾 Guardar Borrador</button>
          <button class="btn btn-info" onclick="Modulos.contabilidad.sat.guardarDeclaracion('${id || ''}', '${tipo}', '${nit}', '${mes}', '${anio}', '${accNum}', '${formNum}', 'presentado')">🔒 Validar y Congelar</button>
          <button class="btn btn-primary" onclick="Modulos.contabilidad.sat.guardarDeclaracion('${id || ''}', '${tipo}', '${nit}', '${mes}', '${anio}', '${accNum}', '${formNum}', 'pagado')">💵 Pagar Impuesto</button>
        </div>
        <div style="font-size:12px; color:var(--text-secondary);">
          Formulario: <strong>${tipo}</strong> · Acceso: <strong>${accNum}</strong>
        </div>
      </div>
    `;

    const getDeclaraGuateHeader = (tipo, label, accNum, formNum, status) => {
      return `
        <div style="background:#fff; color:#000; padding:15px; border-bottom:3px solid #1a365d; font-family:sans-serif;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="font-size:28px; font-weight:800; color:#1a365d; font-family:sans-serif;">🏛️ SAT</div>
              <div style="border-left:1px solid #ccc; padding-left:12px; font-size:10px; color:#555; line-height:1.2;">
                SUPERINTENDENCIA DE<br/>ADMINISTRACION TRIBUTARIA
              </div>
            </div>
            <div style="text-align:center;">
              <h2 style="margin:0; font-size:20px; font-weight:800; color:#1a365d; font-family:sans-serif;">${label}</h2>
              <span style="font-size:11px; color:#555;">Declaración jurada y pago mensual / trimestral</span>
            </div>
            <div style="text-align:right;">
              <div style="font-size:20px; font-weight:bold; color:#1a365d; font-family:sans-serif;">${tipo}</div>
              <div style="font-size:9px; color:#666;">Release 1</div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; border-top:1px solid #eee; margin-top:15px; padding-top:15px; font-size:12px;">
            <div>
              <span style="color:#666;">Número de Acceso:</span><br/>
              <strong style="font-size:14px; letter-spacing:1px; color:#333;">${accNum}</strong>
            </div>
            <div style="text-align:center;">
              <span style="color:#666;">Estado del Formulario:</span><br/>
              <span class="badge ${status === 'Pagado' ? 'badge-success' : status === 'Presentado' ? 'badge-info' : 'badge-warning'}" style="font-size:12px; padding:3px 12px; border-radius:4px; font-weight:bold; color:#fff; background-color:${status === 'Pagado' ? '#2e7d32' : status === 'Presentado' ? '#0288d1' : '#f57c00'};">${status}</span>
            </div>
            <div style="text-align:right;">
              <span style="color:#666;">Número de Formulario:</span><br/>
              <strong style="font-size:14px; letter-spacing:1px; color:#333;">${formNum}</strong>
            </div>
          </div>
        </div>
      `;
    };

    container.innerHTML = `
      ${headerHtml}
      <div style="background:#fff; color:#000; border:1px solid #ccc; font-family:sans-serif; margin-top:20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 4px; overflow:hidden; text-align:left; max-width:850px; margin-left:auto; margin-right:auto;">
        ${getDeclaraGuateHeader(tipo, this.FORM_LABELS[tipo] || tipo, accNum, formNum, statusLabel)}
        <div style="padding:20px;">
          <div id="f-operador-warning" style="background:#fff3cd; color:#856404; border:1px solid #ffeeba; padding:12px; margin-bottom:20px; border-radius:4px; font-size:12px; font-weight:bold; display:${datos.valores_modificados_operador ? 'block' : 'none'};">
            ⚠️ NOTA: Este formulario contiene valores que fueron modificados manualmente a solicitud del operador y difieren de los registros automáticos de la aplicación.
          </div>
          <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; font-size:13px;">1. NIT DEL CONTRIBUYENTE</div>
          <div style="padding:15px; display:flex; gap:10px; align-items:center;">
            <div style="width:200px; font-weight:bold; font-size:13px; color:#000;">NIT *</div>
            <input type="text" id="f-nit" class="form-control" style="max-width:250px; background:#e9ecef; font-family:monospace; font-weight:bold; color:#000;" value="${nit}" readonly />
          </div>

          <div style="background:#f4f4f4; padding:8px 12px; font-weight:bold; border-bottom:2px solid #ccc; margin-top:20px; font-size:13px;">2. PERÍODO DE IMPOSICIÓN</div>
          <div style="padding:15px; display:flex; gap:30px; font-size:13px; color:#000;">
            <div><strong>Período:</strong> ${mes}</div>
            <div><strong>Año Fiscal:</strong> ${anio}</div>
          </div>

          ${subFormHtml}

          <div style="display:flex; justify-content:space-between; align-items:center; background:#1a365d; color:#fff; padding:15px; margin-top:30px; font-weight:bold; font-size:16px;">
            <span>TOTAL A PAGAR:</span>
            <span>Q <input type="text" id="f-total-pagar" style="background:transparent; color:#fff; border:none; text-align:right; font-size:18px; font-weight:800; width:150px; outline:none;" value="${(datos.total_pagar || 0).toFixed(2)}" readonly /></span>
          </div>

          <div class="no-print" style="text-align:center; margin-top:30px;">
            <button class="btn btn-primary" style="height:46px; padding:0 30px; font-weight:bold; background-color:#1a365d; color:#fff; border:none; border-radius:4px;" onclick="Modulos.contabilidad.sat.validarFormLocales('${tipo}')">✓ VALIDAR FORMULARIO</button>
          </div>
        </div>
      </div>
    `;

    // Trigger initial recalculations
    if (tipo === 'SAT-2046') this.recalc2046();
    else if (tipo === 'SAT-2237') this.recalc2237();
    else if (tipo === 'SAT-1311') this.recalc1311();
    else if (tipo === 'SAT-1361') this.recalc1361();
    else if (tipo === 'SAT-1608') this.recalc1608();
    else if (tipo === 'SAT-1331') this.recalc1331();
    else if (tipo === 'SAT-2085') this.recalc2085();
    else if (tipo === 'SAT-1431') this.recalc1431();
    else if (tipo === 'SAT-1411') this.recalc1411();

    /* ── Guardia de cambios sin guardar (solo en el editor real) ── */
    if (!targetContainer) {
      this._editorDirty = false;
      const marcar = () => { Modulos.contabilidad.sat._editorDirty = true; };
      container.addEventListener('input', marcar);
      container.addEventListener('change', marcar);
      /* Salida dentro de la app (cambiar módulo/pestaña) */
      App._unsavedGuard = () => !Modulos.contabilidad.sat._editorDirty ||
        window.confirm('⚠️ Tenés cambios sin guardar en la declaración.\n\n¿Salir sin guardar? (Aceptar = salir · Cancelar = quedarme)');
      /* Recargar / cerrar pestaña del navegador */
      window.onbeforeunload = (e) => {
        if (!Modulos.contabilidad.sat._editorDirty) return undefined;
        e.preventDefault(); e.returnValue = ''; return '';
      };
    }
  },

  recalc2046() {
    const ingresos = parseFloat(document.getElementById("f-2046-ingresos").value) || 0;
    const remanente = parseFloat(document.getElementById("f-2046-remanente-ant").value) || 0;
    const retenciones = parseFloat(document.getElementById("f-2046-retenciones").value) || 0;

    const impuesto = Math.round(ingresos * 0.05 * 100) / 100;
    document.getElementById("f-2046-impuesto").value = impuesto.toFixed(2);

    const totalDeducible = remanente + retenciones;
    const saldoSig = Math.max(0, totalDeducible - impuesto);
    const impPagar = Math.max(0, impuesto - totalDeducible);

    document.getElementById("f-2046-saldo-sig").value = saldoSig.toFixed(2);
    document.getElementById("f-2046-imp-pagar").value = impPagar.toFixed(2);

    // Rectificación
    const rectImp = parseFloat(document.getElementById("f-2046-rect-impuesto")?.value) || 0;
    const rectPagar = Math.max(0, impPagar - rectImp);
    const rectFavor = Math.max(0, rectImp - impPagar);
    if (document.getElementById("f-2046-rect-pagar")) {
      document.getElementById("f-2046-rect-pagar").value = rectPagar.toFixed(2);
      document.getElementById("f-2046-rect-favor").value = rectFavor.toFixed(2);
    }

    // Accesorios
    const multa = parseFloat(document.getElementById("f-2046-multa")?.value) || 0;
    const multaOmision = parseFloat(document.getElementById("f-2046-multa-omision")?.value) || 0;
    const multaRect = parseFloat(document.getElementById("f-2046-multa-rect")?.value) || 0;
    const interes = parseFloat(document.getElementById("f-2046-interes")?.value) || 0;
    const mora = parseFloat(document.getElementById("f-2046-mora")?.value) || 0;

    const accTotal = multa + multaOmision + multaRect + interes + mora;
    if (document.getElementById("f-2046-acc-pagar")) {
      document.getElementById("f-2046-acc-pagar").value = accTotal.toFixed(2);
    }

    const baseImpuesto = (document.getElementById("f-2046-rect-numero")?.value?.trim()) ? rectPagar : impPagar;
    const total = baseImpuesto + accTotal;
    document.getElementById("f-total-pagar").value = total.toFixed(2);
    this.verificarCambiosOperador();
  },

  recalc2237() {
    const exento = parseFloat(document.getElementById("f-2237-exento-base").value) || 0;
    const med = parseFloat(document.getElementById("f-2237-med-base").value) || 0;
    const d2989 = parseFloat(document.getElementById("f-2237-d2989-base").value) || 0;
    const veh2 = parseFloat(document.getElementById("f-2237-veh2-base").value) || 0;
    const veh1 = parseFloat(document.getElementById("f-2237-veh1-base").value) || 0;
    const ventas = parseFloat(document.getElementById("f-2237-ventas-base").value) || 0;
    const serv = parseFloat(document.getElementById("f-2237-serv-base").value) || 0;

    const veh1Deb = Math.round(veh1 * 0.12 * 100) / 100;
    const ventasDeb = Math.round(ventas * 0.12 * 100) / 100;
    const servDeb = Math.round(serv * 0.12 * 100) / 100;

    document.getElementById("f-2237-veh1-deb").value = veh1Deb.toFixed(2);
    document.getElementById("f-2237-ventas-deb").value = ventasDeb.toFixed(2);
    document.getElementById("f-2237-serv-deb").value = servDeb.toFixed(2);

    const debSumBase = exento + med + d2989 + veh2 + veh1 + ventas + serv;
    const debSumDeb = veh1Deb + ventasDeb + servDeb;
    document.getElementById("f-2237-deb-sum-base").value = debSumBase.toFixed(2);
    document.getElementById("f-2237-deb-sum-deb").value = debSumDeb.toFixed(2);

    // Créditos
    const compMed = parseFloat(document.getElementById("f-2237-comp-med-base").value) || 0;
    const compPeq = parseFloat(document.getElementById("f-2237-comp-peq-base").value) || 0;
    const compNoComp = parseFloat(document.getElementById("f-2237-comp-nocomp-base").value) || 0;
    const compVeh2Cre = parseFloat(document.getElementById("f-2237-comp-veh2-cre").value) || 0;
    const compVeh1Base = parseFloat(document.getElementById("f-2237-comp-veh1-base").value) || 0;
    const comb = parseFloat(document.getElementById("f-2237-comb-base").value) || 0;
    const compras = parseFloat(document.getElementById("f-2237-compras-base").value) || 0;
    const servAcq = parseFloat(document.getElementById("f-2237-serv-acq-base").value) || 0;
    const impCa = parseFloat(document.getElementById("f-2237-imp-ca-base").value) || 0;
    const fyduca = parseFloat(document.getElementById("f-2237-fyduca-base").value) || 0;
    const impMundo = parseFloat(document.getElementById("f-2237-imp-mundo-base").value) || 0;
    const activos = parseFloat(document.getElementById("f-2237-activos-base").value) || 0;
    const impActivos = parseFloat(document.getElementById("f-2237-imp-activos-base").value) || 0;
    const ivaExencion = parseFloat(document.getElementById("f-2237-iva-exencion").value) || 0;
    const remanenteIvaAnt = parseFloat(document.getElementById("f-2237-remanente-iva-ant").value) || 0;

    const compVeh1Cre = Math.round(compVeh1Base * 0.12 * 100) / 100;
    const combCre = Math.round(comb * 0.12 * 100) / 100;
    const comprasCre = Math.round(compras * 0.12 * 100) / 100;
    const servAcqCre = Math.round(servAcq * 0.12 * 100) / 100;
    const impCaCre = Math.round(impCa * 0.12 * 100) / 100;
    const fyducaCre = Math.round(fyduca * 0.12 * 100) / 100;
    const impMundoCre = Math.round(impMundo * 0.12 * 100) / 100;
    const activosCre = Math.round(activos * 0.12 * 100) / 100;
    const impActivosCre = Math.round(impActivos * 0.12 * 100) / 100;

    document.getElementById("f-2237-comp-veh1-cre").value = compVeh1Cre.toFixed(2);
    document.getElementById("f-2237-comb-cre").value = combCre.toFixed(2);
    document.getElementById("f-2237-compras-cre").value = comprasCre.toFixed(2);
    document.getElementById("f-2237-serv-acq-cre").value = servAcqCre.toFixed(2);
    document.getElementById("f-2237-imp-ca-cre").value = impCaCre.toFixed(2);
    document.getElementById("f-2237-fyduca-cre").value = fyducaCre.toFixed(2);
    document.getElementById("f-2237-imp-mundo-cre").value = impMundoCre.toFixed(2);
    document.getElementById("f-2237-activos-cre").value = activosCre.toFixed(2);
    document.getElementById("f-2237-imp-activos-cre").value = impActivosCre.toFixed(2);

    const creSumBase = compMed + compPeq + compNoComp + compVeh1Base + comb + compras + servAcq + impCa + fyduca + impMundo + activos + impActivos;
    const creSumCre = compVeh2Cre + compVeh1Cre + combCre + comprasCre + servAcqCre + impCaCre + fyducaCre + impMundoCre + activosCre + impActivosCre + ivaExencion + remanenteIvaAnt;

    document.getElementById("f-2237-cre-sum-base").value = creSumBase.toFixed(2);
    document.getElementById("f-2237-cre-sum-cre").value = creSumCre.toFixed(2);

    const creSiguiente = Math.max(0, creSumCre - debSumDeb);
    const impuestoDet = Math.max(0, debSumDeb - creSumCre);

    // Export calculations (always 0 in this simplified version since Section 6 is disabled)
    const creExportacion = 0;
    const impuestoDetExp = 0;
    const creSigExportacion = 0;
    const saldoImpuesto = impuestoDet + impuestoDetExp;

    document.getElementById("f-2237-cre-siguiente").value = creSiguiente.toFixed(2);
    document.getElementById("f-2237-cre-exportacion").value = creExportacion.toFixed(2);
    document.getElementById("f-2237-impuesto-det").value = impuestoDet.toFixed(2);
    document.getElementById("f-2237-impuesto-det-exp").value = impuestoDetExp.toFixed(2);
    document.getElementById("f-2237-cre-sig-exportacion").value = creSigExportacion.toFixed(2);
    document.getElementById("f-2237-saldo-impuesto").value = saldoImpuesto.toFixed(2);

    const remanenteRet = parseFloat(document.getElementById("f-2237-remanente-ret-ant").value) || 0;
    const retBancoMonto = parseFloat(document.getElementById("f-2237-ret-banco-monto").value) || 0;
    const remRetRecibidas = Math.max(0, remanenteRet - retBancoMonto);
    document.getElementById("f-2237-rem-ret-recibidas").value = remRetRecibidas.toFixed(2);

    const retencionesRec = parseFloat(document.getElementById("f-2237-retenciones-rec").value) || 0;
    const retencionesDisponibles = remRetRecibidas + retencionesRec;
    const saldoSig = Math.max(0, retencionesDisponibles - saldoImpuesto);
    const impPagar = Math.max(0, saldoImpuesto - retencionesDisponibles);

    document.getElementById("f-2237-saldo-sig").value = saldoSig.toFixed(2);
    document.getElementById("f-2237-imp-pagar").value = impPagar.toFixed(2);

    // Indicadores
    const indMargen = debSumBase - creSumBase;
    const indRazon = creSumBase > 0 ? (debSumBase / creSumBase) : 0;
    document.getElementById("f-2237-ind-margen").value = indMargen.toFixed(2);
    document.getElementById("f-2237-ind-razon").value = indRazon.toFixed(2);

    // Rectificación
    const rectImp = parseFloat(document.getElementById("f-2237-rect-impuesto")?.value) || 0;
    const rectPagar = Math.max(0, impPagar - rectImp);
    const rectFavor = Math.max(0, rectImp - impPagar);
    document.getElementById("f-2237-rect-pagar").value = rectPagar.toFixed(2);
    document.getElementById("f-2237-rect-favor").value = rectFavor.toFixed(2);

    // Accesorios
    const multa = parseFloat(document.getElementById("f-2237-multa")?.value) || 0;
    const multaOmision = parseFloat(document.getElementById("f-2237-multa-omision")?.value) || 0;
    const multaRect = parseFloat(document.getElementById("f-2237-multa-rect")?.value) || 0;
    const interes = parseFloat(document.getElementById("f-2237-interes")?.value) || 0;
    const mora = parseFloat(document.getElementById("f-2237-mora")?.value) || 0;

    const accTotal = multa + multaOmision + multaRect + interes + mora;
    document.getElementById("f-2237-acc-pagar").value = accTotal.toFixed(2);

    const baseImpuesto = (document.getElementById("f-2237-rect-numero")?.value?.trim()) ? rectPagar : impPagar;
    const total = baseImpuesto + accTotal;
    document.getElementById("f-total-pagar").value = total.toFixed(2);
    this.verificarCambiosOperador();
  },

  recalc1311() {
    const rentas = parseFloat(document.getElementById("f-1311-rentas").value) || 0;
    const exentas = parseFloat(document.getElementById("f-1311-exentas").value) || 0;

    const imponible = Math.max(0, rentas - exentas);
    document.getElementById("f-1311-imponible").value = imponible.toFixed(2);

    let impuesto = 0;
    if (imponible <= 30000) {
      impuesto = imponible * 0.05;
    } else {
      impuesto = 1500 + (imponible - 30000) * 0.07;
    }
    impuesto = Math.round(impuesto * 100) / 100;
    document.getElementById("f-1311-impuesto").value = impuesto.toFixed(2);

    const retenciones = parseFloat(document.getElementById("f-1311-retenciones").value) || 0;
    const remanente = parseFloat(document.getElementById("f-1311-remanente-ant").value) || 0;

    const saldoImp = Math.max(0, impuesto - retenciones - remanente);
    const exc = Math.max(0, (retenciones + remanente) - impuesto);

    document.getElementById("f-1311-saldo-imp").value = saldoImp.toFixed(2);
    document.getElementById("f-1311-exc").value = exc.toFixed(2);

    // ISO Acreditamiento
    const isoAnt = parseFloat(document.getElementById("f-1311-iso-ant")?.value) || 0;
    const isoAcred = Math.min(saldoImp, isoAnt);
    const isoSig = Math.max(0, isoAnt - isoAcred);
    const incentivos = parseFloat(document.getElementById("f-1311-incentivos")?.value) || 0;

    if (document.getElementById("f-1311-iso-acred")) {
      document.getElementById("f-1311-iso-acred").value = isoAcred.toFixed(2);
      document.getElementById("f-1311-iso-por-acred").value = isoSig.toFixed(2);
    }

    const impPagar = Math.max(0, saldoImp - isoAcred - incentivos);
    document.getElementById("f-1311-imp-pagar").value = impPagar.toFixed(2);

    // Rectificación & Accesorios
    const rectImp = parseFloat(document.getElementById("f-1311-rect-impuesto")?.value) || 0;
    const rectPagar = Math.max(0, impPagar - rectImp);

    const multa = parseFloat(document.getElementById("f-1311-multa")?.value) || 0;
    const interes = parseFloat(document.getElementById("f-1311-interes")?.value) || 0;
    const mora = parseFloat(document.getElementById("f-1311-mora")?.value) || 0;

    const baseImpuesto = (document.getElementById("f-1311-rect-numero")?.value?.trim()) ? rectPagar : impPagar;
    const total = baseImpuesto + multa + interes + mora;
    document.getElementById("f-total-pagar").value = total.toFixed(2);
    this.verificarCambiosOperador();
  },

  recalc1361() {
    const isCierres = document.getElementsByName("f-1361-metodo")[0]?.checked;

    let impDeterminado = 0;

    if (isCierres) {
      const rentas = parseFloat(document.getElementById("f-1361-rentas").value) || 0;
      const exentas = parseFloat(document.getElementById("f-1361-exentas").value) || 0;
      const retdef = parseFloat(document.getElementById("f-1361-retdef").value) || 0;
      const gastos = parseFloat(document.getElementById("f-1361-gastos").value) || 0;
      const gastosexentas = parseFloat(document.getElementById("f-1361-gastosexentas").value) || 0;
      const gastosretdef = parseFloat(document.getElementById("f-1361-gastosretdef").value) || 0;
      const nodeducibles = parseFloat(document.getElementById("f-1361-nodeducibles").value) || 0;

      const rentaNeta = Math.max(0, rentas - exentas - retdef - gastos + gastosexentas + gastosretdef + nodeducibles);
      document.getElementById("f-1361-renta-neta").value = rentaNeta.toFixed(2);

      const impuestoAcum = Math.round(rentaNeta * 0.25 * 100) / 100;
      document.getElementById("f-1361-impuesto-ac").value = impuestoAcum.toFixed(2);

      const impTrimAnt = parseFloat(document.getElementById("f-1361-imp-trim-ant").value) || 0;
      impDeterminado = Math.max(0, impuestoAcum - impTrimAnt);
      document.getElementById("f-1361-impuesto-c").value = impDeterminado.toFixed(2);
      document.getElementById("f-1361-imp-det-liq").value = impDeterminado.toFixed(2);
    } else {
      const bruta = parseFloat(document.getElementById("f-1361-estimada-bruta").value) || 0;
      const exentas = parseFloat(document.getElementById("f-1361-estimada-exentas").value) || 0;

      const neta = Math.max(0, bruta - exentas);
      const imponible = Math.round(neta * 0.08 * 100) / 100;
      impDeterminado = Math.round(imponible * 0.25 * 100) / 100;

      document.getElementById("f-1361-estimada-neta").value = neta.toFixed(2);
      document.getElementById("f-1361-estimada-imponible").value = imponible.toFixed(2);
      document.getElementById("f-1361-impuesto-e").value = impDeterminado.toFixed(2);
      document.getElementById("f-1361-imp-det-liq").value = impDeterminado.toFixed(2);
    }

    // Liquidación
    const isoAnt = parseFloat(document.getElementById("f-1361-iso-ant").value) || 0;
    const isoAcred = Math.min(impDeterminado, isoAnt);
    const isoSig = Math.max(0, isoAnt - isoAcred);
    const incentivos = parseFloat(document.getElementById("f-1361-incentivos").value) || 0;

    document.getElementById("f-1361-iso-acred").value = isoAcred.toFixed(2);
    document.getElementById("f-1361-iso-sig").value = isoSig.toFixed(2);

    const impPagar = Math.max(0, impDeterminado - isoAcred - incentivos);
    document.getElementById("f-1361-imp-pagar").value = impPagar.toFixed(2);

    // Rectificación & Accesorios
    const rectImp = parseFloat(document.getElementById("f-1361-rect-impuesto")?.value) || 0;
    const rectPagar = Math.max(0, impPagar - rectImp);

    const multa = parseFloat(document.getElementById("f-1361-multa")?.value) || 0;
    const interes = parseFloat(document.getElementById("f-1361-interes")?.value) || 0;
    const mora = parseFloat(document.getElementById("f-1361-mora")?.value) || 0;

    const baseImpuesto = (document.getElementById("f-1361-rect-numero")?.value?.trim()) ? rectPagar : impPagar;
    const total = baseImpuesto + multa + interes + mora;
    document.getElementById("f-total-pagar").value = total.toFixed(2);
    this.verificarCambiosOperador();
  },

  recalc1608() {
    const serv = parseFloat(document.getElementById("f-1608-ingresos-servicios").value) || 0;
    const ventas = parseFloat(document.getElementById("f-1608-ingresos-ventas").value) || 0;
    const costo = parseFloat(document.getElementById("f-1608-costo-ventas").value) || 0;

    const margenMonto = serv + ventas - costo;
    const margenPct = (serv + ventas) > 0 ? (margenMonto / (serv + ventas) * 100) : 0;

    document.getElementById("f-1608-margen-monto").value = margenMonto.toFixed(2);
    document.getElementById("f-1608-margen-pct").value = margenPct.toFixed(2) + "%";

    const actTotal = parseFloat(document.getElementById("f-1608-activo-total").value) || 0;
    const deprec = parseFloat(document.getElementById("f-1608-deprec").value) || 0;
    const amort = parseFloat(document.getElementById("f-1608-amort").value) || 0;
    const incob = parseFloat(document.getElementById("f-1608-incob").value) || 0;
    const credFisc = parseFloat(document.getElementById("f-1608-cred-fisc").value) || 0;

    const actNeto = Math.max(0, actTotal - deprec - amort - incob - credFisc);
    const actBase = actNeto / 4;
    const actImpT = actBase * 0.01;
    const iusi = parseFloat(document.getElementById("f-1608-iusi").value) || 0;
    const actImp = Math.max(0, actImpT - iusi);

    document.getElementById("f-1608-activo-neto").value = actNeto.toFixed(2);
    document.getElementById("f-1608-activo-base").value = actBase.toFixed(2);
    document.getElementById("f-1608-activo-impuesto-t").value = actImpT.toFixed(2);
    document.getElementById("f-1608-activo-impuesto").value = actImp.toFixed(2);

    const ingAnual = parseFloat(document.getElementById("f-1608-ingresos-anual").value) || 0;
    const ingSeguro = parseFloat(document.getElementById("f-1608-ingresos-seguro")?.value) || 0;
    const ingReaseguro = parseFloat(document.getElementById("f-1608-ingresos-reaseguro")?.value) || 0;
    const ingReafianzamiento = parseFloat(document.getElementById("f-1608-ingresos-reafianzamiento")?.value) || 0;
    const primasCedidas = parseFloat(document.getElementById("f-1608-primas-cedidas")?.value) || 0;

    const ingNeto = Math.max(0, ingAnual - ingSeguro - ingReaseguro - ingReafianzamiento - primasCedidas);
    const ingBase = ingNeto / 4;
    const ingImp = ingBase * 0.01;

    document.getElementById("f-1608-ingresos-neto").value = ingNeto.toFixed(2);
    document.getElementById("f-1608-ingresos-base").value = ingBase.toFixed(2);
    document.getElementById("f-1608-ingresos-impuesto").value = ingImp.toFixed(2);

    const impDeterminado = Math.max(actImp, ingImp);
    document.getElementById("f-1608-impuesto-det").value = impDeterminado.toFixed(2);

    const isrAnt = parseFloat(document.getElementById("f-1608-isr-ant").value) || 0;

    // Check if the user entered a custom accreditation amount (which is editable now)
    let isrAcred = parseFloat(document.getElementById("f-1608-isr-acred").value);
    const maxAllowed = Math.min(impDeterminado, isrAnt);

    if (isNaN(isrAcred)) {
      isrAcred = maxAllowed;
      document.getElementById("f-1608-isr-acred").value = isrAcred.toFixed(2);
    } else if (isrAcred > maxAllowed) {
      isrAcred = maxAllowed;
      document.getElementById("f-1608-isr-acred").value = isrAcred.toFixed(2);
    }

    const impPagar = Math.max(0, impDeterminado - isrAcred);
    document.getElementById("f-1608-imp-pagar").value = impPagar.toFixed(2);

    const rectImp = parseFloat(document.getElementById("f-1608-rect-impuesto")?.value) || 0;
    const rectPagar = Math.max(0, impPagar - rectImp);
    const rectFavor = Math.max(0, rectImp - impPagar);
    if (document.getElementById("f-1608-rect-pagar")) {
      document.getElementById("f-1608-rect-pagar").value = rectPagar.toFixed(2);
      document.getElementById("f-1608-rect-favor").value = rectFavor.toFixed(2);
    }

    const multa = parseFloat(document.getElementById("f-1608-multa")?.value) || 0;
    const multaOmision = parseFloat(document.getElementById("f-1608-multa-omision")?.value) || 0;
    const multaRect = parseFloat(document.getElementById("f-1608-multa-rect")?.value) || 0;
    const interes = parseFloat(document.getElementById("f-1608-interes")?.value) || 0;
    const mora = parseFloat(document.getElementById("f-1608-mora")?.value) || 0;

    const accTotal = multa + multaOmision + multaRect + interes + mora;
    if (document.getElementById("f-1608-acc-pagar")) {
      document.getElementById("f-1608-acc-pagar").value = accTotal.toFixed(2);
    }

    const baseImpuesto = rectPagar; // rectPagar is always correct: without rect, rectImp=0 so rectPagar=impPagar
    const total = baseImpuesto + accTotal;
    document.getElementById("f-total-pagar").value = total.toFixed(2);
    this.verificarCambiosOperador();
  },

  recalc1331() {
    const hasLucrativas = document.getElementById("f-1331-chk-lucrativas").checked;
    const hasEspeciales = document.getElementById("f-1331-chk-especiales").checked;
    const hasTrabajo = document.getElementById("f-1331-chk-trabajo").checked;
    const hasCapital = document.getElementById("f-1331-chk-capital").checked;

    // 3. Lucrativas
    let totalBaseLuc = 0;
    let totalRetLuc = 0;
    if (hasLucrativas) {
      for (let i = 1; i <= 20; i++) {
        const baseEl = document.getElementById(`f-1331-base-luc-${i}`);
        if (baseEl) {
          const base = parseFloat(baseEl.value) || 0;
          let ret = 0;
          if (base > 0) {
            if (base <= 30000) {
              ret = base * 0.05;
            } else {
              ret = 1500 + (base - 30000) * 0.07;
            }
          }
          ret = Math.round(ret * 100) / 100;
          totalBaseLuc += base;
          totalRetLuc += ret;
          const retEl = document.getElementById(`f-1331-ret-luc-${i}`);
          if (retEl) retEl.value = ret.toFixed(2);
        }
      }
    } else {
      for (let i = 1; i <= 20; i++) {
        const retEl = document.getElementById(`f-1331-ret-luc-${i}`);
        if (retEl) retEl.value = "0.00";
      }
    }
    const totBaseLucEl = document.getElementById("f-1331-total-base-luc");
    if (totBaseLucEl) totBaseLucEl.value = totalBaseLuc.toFixed(2);
    const totRetLucEl = document.getElementById("f-1331-total-ret-luc");
    if (totRetLucEl) totRetLucEl.value = totalRetLuc.toFixed(2);

    // 4. Especiales
    let totalBaseEsp = 0;
    let totalRetEsp = 0;
    if (hasEspeciales) {
      const base1El = document.getElementById("f-1331-base-esp-1");
      let base1 = base1El ? parseFloat(base1El.value) || 0 : 0;
      let ret1 = Math.round(base1 * 0.05 * 100) / 100;
      const ret1El = document.getElementById("f-1331-ret-esp-1");
      if (ret1El) ret1El.value = ret1.toFixed(2);

      const base2El = document.getElementById("f-1331-base-esp-2");
      let base2 = base2El ? parseFloat(base2El.value) || 0 : 0;
      let ret2 = Math.round(base2 * 0.06 * 100) / 100;
      const ret2El = document.getElementById("f-1331-ret-esp-2");
      if (ret2El) ret2El.value = ret2.toFixed(2);

      totalBaseEsp = base1 + base2;
      totalRetEsp = ret1 + ret2;
    } else {
      const ret1El = document.getElementById("f-1331-ret-esp-1");
      if (ret1El) ret1El.value = "0.00";
      const ret2El = document.getElementById("f-1331-ret-esp-2");
      if (ret2El) ret2El.value = "0.00";
    }
    const totBaseEspEl = document.getElementById("f-1331-total-base-esp");
    if (totBaseEspEl) totBaseEspEl.value = totalBaseEsp.toFixed(2);
    const totRetEspEl = document.getElementById("f-1331-total-ret-esp");
    if (totRetEspEl) totRetEspEl.value = totalRetEsp.toFixed(2);

    // 5. Trabajo
    let totalBaseTrab = 0;
    let totalRetTrab = 0;
    if (hasTrabajo) {
      const baseEl = document.getElementById("f-1331-base-trab");
      totalBaseTrab = baseEl ? parseFloat(baseEl.value) || 0 : 0;
      const retEl = document.getElementById("f-1331-ret-trab");
      totalRetTrab = retEl ? parseFloat(retEl.value) || 0 : 0;
    }
    const totBaseTrabEl = document.getElementById("f-1331-total-base-trab");
    if (totBaseTrabEl) totBaseTrabEl.value = totalBaseTrab.toFixed(2);
    const totRetTrabEl = document.getElementById("f-1331-total-ret-trab");
    if (totRetTrabEl) totRetTrabEl.value = totalRetTrab.toFixed(2);

    // 6. Capital
    let totalBaseCapInmob = 0;
    let totalRetCapInmob = 0;
    let totalBaseCapMob = 0;
    let totalRetCapMob = 0;
    let baseCapDiv = 0;
    let retCapDiv = 0;

    if (hasCapital) {
      // 6.1 Inmobiliario: 7%
      const baseInmob1El = document.getElementById("f-1331-base-cap-inmob-1");
      let baseInmob1 = baseInmob1El ? parseFloat(baseInmob1El.value) || 0 : 0;
      let retInmob1 = Math.round(baseInmob1 * 0.07 * 100) / 100;
      const retInmob1El = document.getElementById("f-1331-ret-cap-inmob-1");
      if (retInmob1El) retInmob1El.value = retInmob1.toFixed(2);

      const baseInmob2El = document.getElementById("f-1331-base-cap-inmob-2");
      let baseInmob2 = baseInmob2El ? parseFloat(baseInmob2El.value) || 0 : 0;
      let retInmob2 = Math.round(baseInmob2 * 0.07 * 100) / 100;
      const retInmob2El = document.getElementById("f-1331-ret-cap-inmob-2");
      if (retInmob2El) retInmob2El.value = retInmob2.toFixed(2);

      totalBaseCapInmob = baseInmob1 + baseInmob2;
      totalRetCapInmob = retInmob1 + retInmob2;

      // 6.2 Mobiliario: 10%
      for (let i = 1; i <= 7; i++) {
        const baseMobEl = document.getElementById(`f-1331-base-cap-mob-${i}`);
        if (baseMobEl) {
          const baseMob = parseFloat(baseMobEl.value) || 0;
          let retMob = Math.round(baseMob * 0.10 * 100) / 100;
          totalBaseCapMob += baseMob;
          totalRetCapMob += retMob;
          const retMobEl = document.getElementById(`f-1331-ret-cap-mob-${i}`);
          if (retMobEl) retMobEl.value = retMob.toFixed(2);
        }
      }

      // 6.3 Dividendos: 5%
      const baseDivEl = document.getElementById("f-1331-base-cap-div");
      baseCapDiv = baseDivEl ? parseFloat(baseDivEl.value) || 0 : 0;
      retCapDiv = Math.round(baseCapDiv * 0.05 * 100) / 100;
      const retDivEl = document.getElementById("f-1331-ret-cap-div");
      if (retDivEl) retDivEl.value = retCapDiv.toFixed(2);

    } else {
      const retInmob1El = document.getElementById("f-1331-ret-cap-inmob-1");
      if (retInmob1El) retInmob1El.value = "0.00";
      const retInmob2El = document.getElementById("f-1331-ret-cap-inmob-2");
      if (retInmob2El) retInmob2El.value = "0.00";
      for (let i = 1; i <= 7; i++) {
        const retMobEl = document.getElementById(`f-1331-ret-cap-mob-${i}`);
        if (retMobEl) retMobEl.value = "0.00";
      }
      const retDivEl = document.getElementById("f-1331-ret-cap-div");
      if (retDivEl) retDivEl.value = "0.00";
    }

    const totBaseCapInmobEl = document.getElementById("f-1331-total-base-cap-inmob");
    if (totBaseCapInmobEl) totBaseCapInmobEl.value = totalBaseCapInmob.toFixed(2);
    const totRetCapInmobEl = document.getElementById("f-1331-total-ret-cap-inmob");
    if (totRetCapInmobEl) totRetCapInmobEl.value = totalRetCapInmob.toFixed(2);

    const totBaseCapMobEl = document.getElementById("f-1331-total-base-cap-mob");
    if (totBaseCapMobEl) totBaseCapMobEl.value = totalBaseCapMob.toFixed(2);
    const totRetCapMobEl = document.getElementById("f-1331-total-ret-cap-mob");
    if (totRetCapMobEl) totRetCapMobEl.value = totalRetCapMob.toFixed(2);

    const totBaseCapDivSumEl = document.getElementById("f-1331-total-base-cap-div-sum");
    if (totBaseCapDivSumEl) totBaseCapDivSumEl.value = baseCapDiv.toFixed(2);
    const totRetCapDivEl = document.getElementById("f-1331-total-ret-cap-div");
    if (totRetCapDivEl) totRetCapDivEl.value = retCapDiv.toFixed(2);

    const totalBaseCap = totalBaseCapInmob + totalBaseCapMob + baseCapDiv;
    const totalRetCap = totalRetCapInmob + totalRetCapMob + retCapDiv;

    const totBaseCapEl = document.getElementById("f-1331-total-base-cap");
    if (totBaseCapEl) totBaseCapEl.value = totalBaseCap.toFixed(2);
    const totRetCapEl = document.getElementById("f-1331-total-ret-cap");
    if (totRetCapEl) totRetCapEl.value = totalRetCap.toFixed(2);

    // 7. Determinacion
    const impLucrativas = hasLucrativas ? totalRetLuc : 0;
    const impEspeciales = hasEspeciales ? totalRetEsp : 0;
    const impTrabajo = hasTrabajo ? totalRetTrab : 0;
    const impCapital = hasCapital ? totalRetCap : 0;

    const impPagar = impLucrativas + impEspeciales + impTrabajo + impCapital;
    document.getElementById("f-1331-imp-pagar").value = impPagar.toFixed(2);

    // 8. Cantidad de operaciones
    const cantLucrativas = parseInt(document.getElementById("f-1331-cant-lucrativas").value) || 0;
    const cantEspeciales = parseInt(document.getElementById("f-1331-cant-especiales").value) || 0;
    const cantTrabajo = parseInt(document.getElementById("f-1331-cant-trabajo").value) || 0;
    const cantCapital = parseInt(document.getElementById("f-1331-cant-capital").value) || 0;

    const sumConstancias = cantLucrativas + cantEspeciales + cantTrabajo + cantCapital;
    document.getElementById("f-1331-suma-constancias").value = sumConstancias;

    // 9. Rectificacion
    const rectNumero = document.getElementById("f-1331-rect-numero")?.value?.trim() || "";
    const rectImp = parseFloat(document.getElementById("f-1331-rect-impuesto")?.value) || 0;

    let rectPagar = 0;
    let rectFavor = 0;

    if (rectNumero !== "") {
      rectPagar = Math.max(0, impPagar - rectImp);
      rectFavor = Math.max(0, rectImp - impPagar);
    }

    const rectPagarEl = document.getElementById("f-1331-rect-pagar");
    if (rectPagarEl) rectPagarEl.value = rectPagar.toFixed(2);
    const rectFavorEl = document.getElementById("f-1331-rect-favor");
    if (rectFavorEl) rectFavorEl.value = rectFavor.toFixed(2);

    // 10. Accesorios
    const multa = parseFloat(document.getElementById("f-1331-multa")?.value) || 0;
    const multaOmision = parseFloat(document.getElementById("f-1331-multa-omision")?.value) || 0;
    const multaRect = parseFloat(document.getElementById("f-1331-multa-rect")?.value) || 0;
    const interes = parseFloat(document.getElementById("f-1331-interes")?.value) || 0;
    const mora = parseFloat(document.getElementById("f-1331-mora")?.value) || 0;

    const accesoriosPagar = multa + multaOmision + multaRect + interes + mora;
    const accPagarEl = document.getElementById("f-1331-acc-pagar");
    if (accPagarEl) accPagarEl.value = accesoriosPagar.toFixed(2);

    const baseImpuesto = (rectNumero !== "") ? rectPagar : impPagar;
    const total = baseImpuesto + accesoriosPagar;
    document.getElementById("f-total-pagar").value = total.toFixed(2);

    this.verificarCambiosOperador();
  },

  recalc2085() {
    const monto = parseFloat(document.getElementById("f-2085-monto").value) || 0;
    const impuesto = Math.round(monto * 0.12 * 100) / 100;
    document.getElementById("f-2085-impuesto").value = impuesto.toFixed(2);

    const rectImp = parseFloat(document.getElementById("f-2085-rect-impuesto")?.value) || 0;
    const rectPagar = Math.max(0, impuesto - rectImp);

    const multa = parseFloat(document.getElementById("f-2085-multa")?.value) || 0;
    const interes = parseFloat(document.getElementById("f-2085-interes")?.value) || 0;
    const mora = parseFloat(document.getElementById("f-2085-mora")?.value) || 0;

    const baseImpuesto = (document.getElementById("f-2085-rect-numero")?.value?.trim()) ? rectPagar : impuesto;
    const total = baseImpuesto + multa + interes + mora;
    document.getElementById("f-total-pagar").value = total.toFixed(2);
    this.verificarCambiosOperador();
  },

  recalc1431() {
    const sueldos = parseFloat(document.getElementById("f-1431-sueldos").value) || 0;
    const horasExtras = parseFloat(document.getElementById("f-1431-horas-extras").value) || 0;
    const comisiones = parseFloat(document.getElementById("f-1431-comisiones").value) || 0;
    const aguinaldo = parseFloat(document.getElementById("f-1431-aguinaldo").value) || 0;
    const bono14 = parseFloat(document.getElementById("f-1431-bono14").value) || 0;
    const otrosIng = parseFloat(document.getElementById("f-1431-otros-ing").value) || 0;

    const rentaBruta = sueldos + horasExtras + comisiones + aguinaldo + bono14 + otrosIng;
    document.getElementById("f-1431-renta-bruta").value = rentaBruta.toFixed(2);

    const indem = parseFloat(document.getElementById("f-1431-indem").value) || 0;
    const aguinEx = parseFloat(document.getElementById("f-1431-aguinaldo-ex").value) || 0;
    const bonoEx = parseFloat(document.getElementById("f-1431-bono14-ex").value) || 0;

    const rentasExentas = indem + aguinEx + bonoEx;
    const rentaNeta = Math.max(0, rentaBruta - rentasExentas);

    document.getElementById("f-1431-rentas-exentas").value = rentasExentas.toFixed(2);
    document.getElementById("f-1431-renta-neta").value = rentaNeta.toFixed(2);

    const planillaIva = parseFloat(document.getElementById("f-1431-planilla-iva").value) || 0;
    const donaciones = parseFloat(document.getElementById("f-1431-donaciones").value) || 0;
    const igss = parseFloat(document.getElementById("f-1431-igss").value) || 0;
    const segVida = parseFloat(document.getElementById("f-1431-seguro-vida").value) || 0;

    const deducciones = 48000 + planillaIva + donaciones + igss + segVida;
    const rentaImponible = Math.max(0, rentaNeta - deducciones);

    document.getElementById("f-1431-deducciones").value = deducciones.toFixed(2);
    document.getElementById("f-1431-renta-imponible").value = rentaImponible.toFixed(2);

    let isr = 0;
    if (rentaImponible <= 300000) {
      isr = rentaImponible * 0.05;
    } else {
      isr = 15000 + (rentaImponible - 300000) * 0.07;
    }
    isr = Math.round(isr * 100) / 100;
    document.getElementById("f-1431-impuesto").value = isr.toFixed(2);

    const retPatrono = parseFloat(document.getElementById("f-1431-retenciones-patrono").value) || 0;
    const impPagar = Math.max(0, isr - retPatrono);
    const retExceso = Math.max(0, retPatrono - isr);

    document.getElementById("f-1431-imp-pagar").value = impPagar.toFixed(2);
    document.getElementById("f-1431-ret-exceso").value = retExceso.toFixed(2);

    const rectImp = parseFloat(document.getElementById("f-1431-rect-impuesto")?.value) || 0;
    const rectPagar = Math.max(0, impPagar - rectImp);

    const multa = parseFloat(document.getElementById("f-1431-multa")?.value) || 0;
    const interes = parseFloat(document.getElementById("f-1431-interes")?.value) || 0;
    const mora = parseFloat(document.getElementById("f-1431-mora")?.value) || 0;

    const baseImpuesto = (document.getElementById("f-1431-rect-numero")?.value?.trim()) ? rectPagar : impPagar;
    const total = baseImpuesto + multa + interes + mora;
    document.getElementById("f-total-pagar").value = total.toFixed(2);
    this.verificarCambiosOperador();
  },

  async guardarDeclaracion(id, tipo, nit, mes, anio, accNum, formNum, estado) {
    const total_pagar = parseFloat(document.getElementById("f-total-pagar").value) || 0;
    let monto_impuesto = 0;
    let monto_accesorios = 0;

    if (tipo === 'SAT-2046') {
      monto_impuesto = parseFloat(document.getElementById("f-2046-imp-pagar")?.value) || 0;
      monto_accesorios = parseFloat(document.getElementById("f-2046-acc-pagar")?.value) || 0;
    } else if (tipo === 'SAT-2237') {
      monto_impuesto = parseFloat(document.getElementById("f-2237-imp-pagar")?.value) || 0;
      monto_accesorios = parseFloat(document.getElementById("f-2237-acc-pagar")?.value) || 0;
    } else if (tipo === 'SAT-1311') {
      monto_impuesto = parseFloat(document.getElementById("f-1311-imp-pagar")?.value) || 0;
      monto_accesorios = (parseFloat(document.getElementById("f-1311-multa")?.value) || 0) + (parseFloat(document.getElementById("f-1311-interes")?.value) || 0) + (parseFloat(document.getElementById("f-1311-mora")?.value) || 0);
    } else if (tipo === 'SAT-1361') {
      monto_impuesto = parseFloat(document.getElementById("f-1361-imp-pagar")?.value) || 0;
      monto_accesorios = (parseFloat(document.getElementById("f-1361-multa")?.value) || 0) + (parseFloat(document.getElementById("f-1361-interes")?.value) || 0) + (parseFloat(document.getElementById("f-1361-mora")?.value) || 0);
    } else if (tipo === 'SAT-1608') {
      monto_impuesto = parseFloat(document.getElementById("f-1608-imp-pagar")?.value) || 0;
      monto_accesorios = (parseFloat(document.getElementById("f-1608-multa")?.value) || 0) + (parseFloat(document.getElementById("f-1608-interes")?.value) || 0) + (parseFloat(document.getElementById("f-1608-mora")?.value) || 0);
    } else if (tipo === 'SAT-1331') {
      monto_impuesto = parseFloat(document.getElementById("f-1331-imp-pagar")?.value) || 0;
      monto_accesorios = (parseFloat(document.getElementById("f-1331-multa")?.value) || 0) + (parseFloat(document.getElementById("f-1331-interes")?.value) || 0) + (parseFloat(document.getElementById("f-1331-mora")?.value) || 0);
    } else if (tipo === 'SAT-2085') {
      monto_impuesto = parseFloat(document.getElementById("f-2085-impuesto")?.value) || 0;
      monto_accesorios = (parseFloat(document.getElementById("f-2085-multa")?.value) || 0) + (parseFloat(document.getElementById("f-2085-interes")?.value) || 0) + (parseFloat(document.getElementById("f-2085-mora")?.value) || 0);
    } else if (tipo === 'SAT-1431') {
      monto_impuesto = parseFloat(document.getElementById("f-1431-imp-pagar")?.value) || 0;
      monto_accesorios = (parseFloat(document.getElementById("f-1431-multa")?.value) || 0) + (parseFloat(document.getElementById("f-1431-interes")?.value) || 0) + (parseFloat(document.getElementById("f-1431-mora")?.value) || 0);
    }

    const datos = {};
    const inputs = document.querySelectorAll('input[id^="f-"], select[id^="f-"], textarea[id^="f-"]');
    inputs.forEach(el => {
      let key = el.id;
      const match = key.match(/^f-\d+-(.+)$/);
      let keyRaw = match ? match[1] : (key.startsWith('f-') ? key.substring(2) : key);
      let keyUnderscore = keyRaw.replace(/-/g, '_');

      let val;
      if (el.type === 'checkbox') {
        val = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) val = el.value;
        else return;
      } else {
        val = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      }

      datos[keyUnderscore] = val;
    });

    // Explicit aliases for compatibility
    if (tipo === 'SAT-2046') {
      datos.impuesto_determinado = datos.impuesto;
      datos.remanente_anterior = datos.remanente_ant;
      datos.retenciones_recibidas = datos.retenciones;
      datos.saldo_siguiente = datos.saldo_sig;
      datos.impuesto_a_pagar = datos.imp_pagar;
      datos.accesorios_pagar = datos.acc_pagar;
    } else if (tipo === 'SAT-2237') {
      datos.servicios_base = datos.serv_base;
      datos.servicios_deb = datos.serv_deb;
      datos.remanente_iva_anterior = datos.remanente_iva_ant;
      datos.remanente_ret_anterior = datos.remanente_ret_ant;
      datos.retenciones_recibidas = datos.retenciones_rec;
      datos.saldo_siguiente = datos.saldo_sig;
      datos.impuesto_a_pagar = datos.imp_pagar;
      datos.accesorios_pagar = datos.acc_pagar;
    } else if (tipo === 'SAT-1311') {
      datos.renta_imponible = datos.imponible;
      datos.impuesto_determinado = datos.impuesto;
      datos.remanente_anterior = datos.remanente_ant;
      datos.saldo_impuesto = datos.saldo_imp;
      datos.excedente_retenciones = datos.exc;
      datos.iso_anterior = datos.iso_ant;
      datos.iso_acreditamiento = datos.iso_acred;
      datos.iso_por_acreditar = datos.iso_por_acred;
      datos.impuesto_a_pagar = datos.imp_pagar;
    } else if (tipo === 'SAT-1361') {
      datos.impuesto_acumulado = datos.impuesto_ac;
      datos.imp_trim_anterior = datos.imp_trim_ant;
      datos.impuesto_determinado = datos.impuesto_c;
      datos.impuesto_determinado_e = datos.impuesto_e;
      datos.iso_anterior = datos.iso_ant;
      datos.iso_acreditamiento = datos.iso_acred;
      datos.iso_saldo_sig = datos.iso_sig;
      datos.impuesto_a_pagar = datos.imp_pagar;
    } else if (tipo === 'SAT-1608') {
      datos.depreciaciones = datos.deprec;
      datos.amortizaciones = datos.amort;
      datos.reserva_incobrables = datos.incob;
      datos.creditos_fiscales = datos.cred_fisc;
      datos.iusi_pagado = datos.iusi;
      datos.isr_anterior = datos.isr_ant;
      datos.isr_acreditamiento = datos.isr_acred;
      datos.impuesto_a_pagar = datos.imp_pagar;
      datos.accesorios_pagar = datos.acc_pagar;
    } else if (tipo === 'SAT-1331') {
      datos.has_lucrativas = datos.chk_lucrativas;
      datos.has_especiales = datos.chk_especiales;
      datos.has_trabajo = datos.chk_trabajo;
      datos.has_capital = datos.chk_capital;
      datos.impuesto = datos.imp_pagar;
    } else if (tipo === 'SAT-1431') {
      datos.impuesto_a_pagar = datos.imp_pagar;
    }

    datos.monto_impuesto = monto_impuesto;
    datos.monto_accesorios = monto_accesorios;
    datos.total_pagar = total_pagar;
    datos.valores_modificados_operador = this.verificarCambiosOperador();

    const payload = {
      tipo_formulario: tipo,
      nit,
      periodo_mes: mes,
      periodo_anio: anio,
      numero_formulario: formNum,
      numero_acceso: accNum,
      estado,
      datos_formulario: datos,
      monto_impuesto,
      monto_accesorios,
      total_pagar
    };

    if (id) {
      payload.id = id;
    }

    const { error } = await DB.upsertFormularioTributario(payload);
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    /* Cambios ya guardados → liberar el guardia de salida */
    this._editorDirty = false;
    App._unsavedGuard = null;
    window.onbeforeunload = null;
    UI.toast(estado==='preparacion' ? 'Borrador guardado ✓' : estado==='presentado' ? 'Declaración validada y congelada ✓' : 'Declaración guardada ✓');
    await Modulos.contabilidad._renderTab();
  },

  validarFormLocales(tipo) {
    if (tipo === 'SAT-2046') this.recalc2046();
    else if (tipo === 'SAT-2237') this.recalc2237();
    else if (tipo === 'SAT-1311') this.recalc1311();
    else if (tipo === 'SAT-1361') this.recalc1361();
    else if (tipo === 'SAT-1608') this.recalc1608();
    else if (tipo === 'SAT-1331') this.recalc1331();
    else if (tipo === 'SAT-2085') this.recalc2085();
    else if (tipo === 'SAT-1431') this.recalc1431();

    const nit = document.getElementById("f-nit")?.value?.trim();
    if (!nit) {
      UI.toast("El NIT del contribuyente es obligatorio.", "error");
      return;
    }

    UI.toast("Formulario validado exitosamente. Todos los cálculos son consistentes. Puede proceder a congelar o pagar.", "success");
  },

  verificarCambiosOperador() {
    const warningEl = document.getElementById("f-operador-warning");
    const inputsWithOriginal = document.querySelectorAll("input[data-original]");
    let hasChanges = false;
    inputsWithOriginal.forEach(el => {
      const originalVal = parseFloat(el.getAttribute("data-original")) || 0;
      const currentVal = parseFloat(el.value) || 0;
      if (Math.abs(currentVal - originalVal) > 0.009) {
        hasChanges = true;
      }
    });
    if (warningEl) {
      warningEl.style.display = hasChanges ? "block" : "none";
    }
    return hasChanges;
  },

  async imprimirFormulario(id) {
    const list = await DB.getFormulariosTributarios();
    const form = list.find(x => x.id === id);
    if (!form) {
      UI.toast("Formulario no encontrado.", "error");
      return;
    }
    const tipo = form.tipo_formulario;
    const nit = form.nit;
    const mes = form.periodo_mes || '';
    const anio = form.periodo_anio;
    const formNum = form.numero_formulario;
    const accNum = form.numero_acceso;
    const totalPagar = form.total_pagar;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      UI.toast("El navegador bloqueó la ventana emergente. Por favor permítala.", "warning");
      return;
    }

    try {
      // We will render a clone of the form container into the print window,
      // but without the toolbar and with print stylesheet.
      const label = this.FORM_LABELS[tipo] || tipo;
      const statusLabel = form.estado === 'pagado' ? 'Pagado' : form.estado === 'presentado' ? 'Presentado' : 'Borrador';

      // We need to copy styles
      const printStyles = `
        <style>
          body { font-family: sans-serif; color: #000; background: #fff; margin: 0; padding: 20px; }
          .no-print { display: none !important; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
          th, td { border: 1px solid #ccc; padding: 6px; }
          th { background: #f2f2f2; text-align: left; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .bg-light { background: #f9f9f9; }
          .font-weight-bold { font-weight: bold; }
          input, select, textarea {
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
            outline: none !important;
            font-weight: bold;
            font-family: inherit;
            color: #000;
            width: 100%;
            text-align: inherit;
          }
          /* Hide spinners */
          input::-webkit-outer-spin-button,
          input::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          input[type=number] {
            -moz-appearance: textfield;
          }
          @media print {
            body { padding: 0; }
            .page-break { page-break-before: always; }
          }
        </style>
      `;

      // Helper to generate the header
      const headerHtml = `
        <div style="background:#fff; color:#000; padding:15px; border-bottom:3px solid #1a365d; font-family:sans-serif;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="font-size:28px; font-weight:800; color:#1a365d;">🏛️ SAT</div>
              <div style="border-left:1px solid #ccc; padding-left:12px; font-size:10px; color:#555; line-height:1.2;">
                SUPERINTENDENCIA DE<br/>ADMINISTRACION TRIBUTARIA
              </div>
            </div>
            <div style="text-align:center;">
              <h2 style="margin:0; font-size:20px; font-weight:800; color:#1a365d;">${label}</h2>
              <span style="font-size:11px; color:#555;">Declaración jurada y pago mensual / trimestral</span>
            </div>
            <div style="text-align:right;">
              <div style="font-size:20px; font-weight:bold; color:#1a365d;">${tipo}</div>
              <div style="font-size:9px; color:#666;">Release 1</div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; border-top:1px solid #eee; margin-top:15px; padding-top:15px; font-size:12px;">
            <div>
              <span style="color:#666;">Número de Acceso:</span><br/>
              <strong style="font-size:14px; letter-spacing:1px; color:#333;">${accNum}</strong>
            </div>
            <div style="text-align:center;">
              <span style="color:#666;">Estado del Formulario:</span><br/>
              <span style="font-size:12px; padding:3px 12px; border-radius:4px; font-weight:bold; color:#fff; background-color:${statusLabel === 'Pagado' ? '#2e7d32' : statusLabel === 'Presentado' ? '#0288d1' : '#f57c00'};">${statusLabel}</span>
            </div>
            <div style="text-align:right;">
              <span style="color:#666;">Número de Formulario:</span><br/>
              <strong style="font-size:14px; letter-spacing:1px; color:#333;">${formNum}</strong>
            </div>
          </div>
        </div>
      `;

      // Copy the editor container's form structure and values
      // Create a temporary container off-screen to render the form and execute recalculations
      const tempContainer = document.createElement("div");
      tempContainer.id = "temp-print-container";
      tempContainer.style.position = "absolute";
      tempContainer.style.left = "-9999px";
      tempContainer.style.top = "-9999px";
      document.body.appendChild(tempContainer);

      // Render the form into the temporary container (which triggers initial recalculations)
      await this.abrirEditorFormulario(id, '', '', '', '', tempContainer);

      // Clone the DOM of the tempContainer
      const editorClone = document.createElement("div");
      editorClone.innerHTML = tempContainer.innerHTML;

      // Copy actual input values to their value attributes in the clone so they print correctly
      const clonedInputs = editorClone.querySelectorAll("input, select, textarea");
      clonedInputs.forEach(clonedEl => {
        const tempEl = tempContainer.querySelector(`#${clonedEl.id}`);
        if (tempEl) {
          if (clonedEl.type === 'checkbox' || clonedEl.type === 'radio') {
            clonedEl.checked = tempEl.checked;
            if (clonedEl.checked) {
              clonedEl.setAttribute("checked", "checked");
            } else {
              clonedEl.removeAttribute("checked");
            }
          } else {
            clonedEl.value = tempEl.value;
            clonedEl.setAttribute("value", tempEl.value);
          }
          clonedEl.setAttribute("readonly", "readonly");
          clonedEl.setAttribute("disabled", "disabled");
        }
      });

      // Remove the off-screen temporary container
      document.body.removeChild(tempContainer);

      // Remove all elements that should not print (e.g. toolbars, headers, action buttons)
      const topHeader = editorClone.querySelector("div[style*='border-bottom:3px solid #1a365d']");
      if (topHeader) topHeader.remove();
      const noPrints = editorClone.querySelectorAll(".no-print");
      noPrints.forEach(el => el.remove());

      // Add Boleta SAT-2000 print layout
      const boletaHtml = `
        <div class="page-break" style="border: 2px solid #000; padding: 20px; font-family: sans-serif; max-width: 700px; margin: 40px auto 20px auto; color: #000; background: #fff;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px;">
            <div>
              <div style="font-size: 20px; font-weight: bold; color: #1a365d;">🏛️ SAT</div>
              <div style="font-size: 8px; color: #555;">SUPERINTENDENCIA DE ADMINISTRACION TRIBUTARIA</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 16px; font-weight: bold;">BOLETA DE PAGO SAT-2000</div>
              <div style="font-size: 10px; color: #666;">Presente esta boleta en el banco para efectuar el pago</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 12px; font-weight: bold; border: 1px solid #000; padding: 3px 8px;">SAT-2000</div>
            </div>
          </div>

          <div style="margin-top: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px;">
            <div><strong>NIT del Contribuyente:</strong> ${nit}</div>
            <div><strong>Nombre/Razón Social:</strong> Taller / Contribuyente</div>
            <div><strong>Formulario a Pagar:</strong> ${tipo} - ${label}</div>
            <div><strong>Período Impositivo:</strong> ${mes ? mes + '/' : ''}${anio}</div>
            <div><strong>Número de Formulario SAT:</strong> ${formNum}</div>
            <div><strong>Número de Acceso:</strong> ${accNum}</div>
          </div>

          <div style="border: 1px dashed #000; margin: 20px 0; padding: 10px; text-align: center;">
            <div style="font-size: 12px; letter-spacing: 2px;">|||||||||| | |||||||| |||| ||| ||||||| |||||| |||||||||</div>
            <div style="font-size: 10px; font-weight: bold; margin-top: 5px;">*${formNum.replace(/\s+/g, '')}*</div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #000; padding-top: 10px; font-size: 14px; font-weight: bold;">
            <span>TOTAL A PAGAR EN BANCO:</span>
            <span style="font-size: 18px; color: #1a365d;">Q ${totalPagar.toFixed(2)}</span>
          </div>
        </div>
      `;

      const printHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${tipo} - ${nit} - ${mes}/${anio}</title>
          ${printStyles}
        </head>
        <body>
          <div style="max-width:850px; margin:0 auto; border:1px solid #ccc; border-radius:4px; overflow:hidden;">
            ${headerHtml}
            <div style="padding:20px;">
              ${editorClone.innerHTML}
            </div>
          </div>
          ${boletaHtml}
        </body>
        </html>
      `;

      printWindow.document.write(printHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 700);

    } catch (e) {
      console.error(e);
      UI.toast("Error al preparar la impresión.", "error");
    }
  },

  /* ── SAT-1411 ISR Anual Sobre Utilidades ──────── */
  recalc1411() {
    const v = id => parseFloat(document.getElementById(id)?.value)||0;
    const set = (id, val) => { const el=document.getElementById(id); if(el) el.value=val.toFixed(2); };

    const rentaBruta     = v('f-1411-renta-bruta');
    const costosGastos   = v('f-1411-costos-gastos');
    const sueldos        = v('f-1411-sueldos');
    const depreciaciones = v('f-1411-depreciaciones');
    const otrosGastos    = v('f-1411-otros-gastos');
    const totalCostos    = costosGastos + sueldos + depreciaciones + otrosGastos;
    set('f-1411-total-costos', totalCostos);

    const rentaImponible = Math.max(0, rentaBruta - totalCostos);
    set('f-1411-renta-imponible', rentaImponible);

    const impDeterminado = Math.round(rentaImponible * 0.25 * 100) / 100;
    set('f-1411-imp-determinado', impDeterminado);

    const impTrim      = v('f-1411-imp-trimestrales');
    const isoAcred     = v('f-1411-iso-acreditado');
    const retIsr       = v('f-1411-ret-isr');
    const multas       = v('f-1411-multas');
    const mora         = v('f-1411-mora');
    const totalDeduc   = impTrim + isoAcred + retIsr;
    const totalPagar   = Math.max(0, impDeterminado - totalDeduc + multas + mora);

    const tpEl = document.getElementById('f-total-pagar');
    if (tpEl) tpEl.value = totalPagar.toFixed(2);
  },
};


