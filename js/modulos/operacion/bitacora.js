/* NexusPro — Bitácora de Soluciones Técnicas
   Memoria técnica: hallazgos y soluciones ya probadas por los mecánicos,
   para que un problema conocido se resuelva con lo que ya funcionó antes
   en vez de reinventarlo cada vez. No es un log por mes (como OT/compras):
   es una base de conocimiento que se acumula — por defecto ordenada por
   "más usada" para que las soluciones más probadas salgan primero. */
Modulos.bitacora = {
  _data: [], _categoria: '', _busca: '', _orden: 'usadas',

  _CATEGORIAS: {
    motor:'🔧 Motor', electrico:'⚡ Eléctrico', transmision:'⚙️ Transmisión',
    frenos:'🛑 Frenos', suspension:'🔩 Suspensión/Dirección', ac_clima:'❄️ A/C y Clima',
    combustible:'⛽ Combustible/Inyección', escape:'💨 Escape/Emisiones',
    carroceria:'🚗 Carrocería/Eléctrico auxiliar', general:'📌 General',
  },
  _catLabel(c) { return this._CATEGORIAS[c] || this._CATEGORIAS.general; },

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._data = await DB.getBitacora({ categoria: this._categoria || null, busca: this._busca || null, orden: this._orden });
    const puedeEditar = typeof puedeAccion !== 'function' || puedeAccion('bitacora','editar');

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">📖 Bitácora de Soluciones</h1>
          <p class="page-subtitle">// Memoria técnica: lo que ya funcionó, para no reinventarlo cada vez</p>
        </div>
        <div class="page-actions">
          ${puedeEditar ? `<button class="btn btn-brand" onclick="Modulos.bitacora.modalNueva()">➕ Nueva Solución</button>` : ''}
        </div>
      </div>
      <div class="page-body">
        <div class="card" style="padding:12px;margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input class="form-input" id="bit-busca" placeholder="Buscar por título, síntoma, marca, modelo..." style="flex:2;min-width:200px" value="${this._busca}"
                 onkeydown="if(event.key==='Enter')Modulos.bitacora.filtrar()">
          <select class="form-select" id="bit-cat" style="width:200px" onchange="Modulos.bitacora.filtrar()">
            <option value="">Todas las categorías</option>
            ${Object.entries(this._CATEGORIAS).map(([k,l])=>`<option value="${k}" ${k===this._categoria?'selected':''}>${l}</option>`).join('')}
          </select>
          <select class="form-select" id="bit-orden" style="width:160px" onchange="Modulos.bitacora.filtrar()">
            <option value="usadas"    ${this._orden==='usadas'?'selected':''}>Más usadas</option>
            <option value="recientes" ${this._orden==='recientes'?'selected':''}>Más recientes</option>
          </select>
          <button class="btn btn-ghost" onclick="Modulos.bitacora.filtrar()">🔍 Buscar</button>
        </div>
        <div class="card" style="padding:0;overflow:auto">
          <table class="table">
            <thead><tr><th>Solución</th><th>Categoría</th><th>Vehículo</th><th>DTC</th><th>Veces ejecutada</th><th>Agregada por</th><th style="text-align:right">Acciones</th></tr></thead>
            <tbody>
              ${this._data.length ? this._data.map(b => `
                <tr style="cursor:pointer" onclick="Modulos.bitacora.ver('${b.id}')">
                  <td><b>${UI.esc(b.titulo)}</b>${b.sintoma ? `<div style="font-size:11px;color:var(--text3)">${UI.esc(b.sintoma)}</div>` : ''}</td>
                  <td>${this._catLabel(b.categoria)}</td>
                  <td>${UI.esc([b.marca,b.modelo].filter(Boolean).join(' ') || '—')}</td>
                  <td style="font-family:monospace;font-size:11px">${UI.esc((b.dtc_codigos||[]).join(', ') || '—')}</td>
                  <td><span class="badge ${b.veces_ejecutada>1?'badge-green':'badge-gray'}">${b.veces_ejecutada}×</span></td>
                  <td style="font-size:12px">${UI.esc(b.creado_por_nombre || '—')}</td>
                  <td style="text-align:right;white-space:nowrap">
                    ${Modulos.btnAccion('ver', `Modulos.bitacora.ver('${b.id}')`)}
                    ${puedeEditar ? Modulos.btnAccion('editar', `Modulos.bitacora.modalEditar('${b.id}')`) : ''}
                    ${puedeEditar ? Modulos.btnAccion('eliminar', `Modulos.bitacora.eliminar('${b.id}')`) : ''}
                  </td></tr>`).join('') : `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">
                Todavía no hay soluciones registradas. ${puedeEditar?'Cuando resuelvas algo que valga la pena recordar, agrégalo con ➕ Nueva Solución.':''}
              </td></tr>`}
            </tbody>
          </table>
        </div>
        ${this._data.length ? `<p style="color:var(--text3);font-size:12px;margin-top:8px">${this._data.length} solución(es) en la memoria técnica</p>` : ''}
      </div>`;
  },

  filtrar() {
    this._busca = document.getElementById('bit-busca')?.value.trim() || '';
    this._categoria = document.getElementById('bit-cat')?.value || '';
    this._orden = document.getElementById('bit-orden')?.value || 'usadas';
    this.render();
  },

  _form(d = {}) {
    return `
      <div class="form-group">
        <label class="form-label">Título / problema resuelto *</label>
          <input class="form-input" id="bit-titulo" placeholder="Ej. Ralentí inestable con Check Engine intermitente" value="${UI.esc(d.titulo||'')}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Categoría *</label>
          <select class="form-select" id="bit-f-cat">
            ${Object.entries(this._CATEGORIAS).map(([k,l])=>`<option value="${k}" ${k===(d.categoria||'general')?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Códigos DTC relacionados (opcional)</label>
          <input class="form-input" id="bit-dtc" placeholder="P0420, P0171" value="${UI.esc((d.dtc_codigos||[]).join(', '))}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Marca (opcional)</label>
          <input class="form-input" id="bit-marca" placeholder="Toyota" value="${UI.esc(d.marca||'')}">
        </div>
        <div class="form-group">
          <label class="form-label">Modelo (opcional)</label>
          <input class="form-input" id="bit-modelo" placeholder="Hilux" value="${UI.esc(d.modelo||'')}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Síntoma / cómo se presentó</label>
          <input class="form-input" id="bit-sintoma" placeholder="Ej. tironeaba en frío, se quitaba al calentar" value="${UI.esc(d.sintoma||'')}">
      </div>
      <div class="form-group">
        <label class="form-label">Solución ejecutada / hallazgo técnico *</label>
        <textarea class="form-input" id="bit-desc" rows="6" placeholder="Qué se revisó, qué se encontró y qué se hizo para resolverlo...">${UI.esc(d.descripcion||'')}</textarea>
      </div>`;
  },

  modalNueva() {
    UI.modal('➕ Nueva Solución', `
      ${this._form()}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-brand" onclick="Modulos.bitacora.guardarNueva()">Guardar</button>
      </div>`, '600px');
  },

  _leerForm() {
    const titulo = document.getElementById('bit-titulo')?.value.trim();
    const descripcion = document.getElementById('bit-desc')?.value.trim();
    if (!titulo || !descripcion) { UI.toast('Título y descripción de la solución son obligatorios', 'error'); return null; }
    const dtc = document.getElementById('bit-dtc')?.value.trim();
    return {
      titulo, descripcion,
      categoria: document.getElementById('bit-f-cat')?.value || 'general',
      sintoma: document.getElementById('bit-sintoma')?.value.trim() || null,
      marca: document.getElementById('bit-marca')?.value.trim() || null,
      modelo: document.getElementById('bit-modelo')?.value.trim() || null,
      dtc_codigos: dtc ? dtc.split(',').map(c => c.trim().toUpperCase()).filter(Boolean) : null,
    };
  },

  async guardarNueva() {
    const fields = this._leerForm();
    if (!fields) return;
    const { error } = await DB.upsertBitacora(fields);
    if (error) { UI.toast('Error al guardar: ' + error.message, 'error'); return; }
    UI.toast('Solución agregada a la bitácora ✓');
    UI.cerrarModal(); this.render();
  },

  modalEditar(id) {
    const d = this._data.find(x => x.id === id);
    if (!d) return;
    UI.modal('✏️ Editar Solución', `
      ${this._form(d)}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-brand" onclick="Modulos.bitacora.guardarEdicion('${id}')">Guardar</button>
      </div>`, '600px');
  },

  async guardarEdicion(id) {
    const fields = this._leerForm();
    if (!fields) return;
    const { error } = await DB.upsertBitacora({ id, ...fields });
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.toast('Actualizado ✓'); UI.cerrarModal(); this.render();
  },

  eliminar(id) {
    const d = this._data.find(x => x.id === id);
    Modulos.eliminarRegistro('bitacora_soluciones', id, `la solución "${d?.titulo || ''}"`, () => this.render());
  },

  async ver(id) {
    const d = this._data.find(x => x.id === id);
    if (!d) return;
    UI.modal('📖 ' + d.titulo, `<div id="bit-ver-body">${await this._verHTML(d)}</div>`, '640px');
  },

  async _verHTML(d) {
    const [ejecs, comentarios] = await Promise.all([
      DB.getEjecucionesBitacora(d.id), DB.getComentariosBitacora(d.id)
    ]);
    const puedeEditar = typeof puedeAccion !== 'function' || puedeAccion('bitacora','editar');
    return `
      <div style="font-size:13px">
        <p>
          <span class="badge badge-cyan">${this._catLabel(d.categoria)}</span>
          <span class="badge ${d.veces_ejecutada>1?'badge-green':'badge-gray'}">✅ ${d.veces_ejecutada}× ejecutada</span>
          ${(d.dtc_codigos||[]).map(c=>`<span class="badge badge-amber" style="font-family:monospace">${c}</span>`).join('')}
        </p>
        <p style="margin-top:6px;color:var(--text2)">
          ${[d.marca,d.modelo].filter(Boolean).join(' ') ? `<b>Vehículo:</b> ${UI.esc([d.marca,d.modelo].filter(Boolean).join(' '))}<br>` : ''}
          ${d.sintoma ? `<b>Síntoma:</b> ${UI.esc(d.sintoma)}<br>` : ''}
          <b>Agregada por:</b> ${UI.esc(d.creado_por_nombre || '—')} · ${UI.fecha(d.created_at)}
        </p>
        <div class="card" style="padding:10px;margin-top:8px">
          <b style="font-size:12px">SOLUCIÓN EJECUTADA</b>
          <div style="white-space:pre-wrap;margin-top:6px">${UI.esc(d.descripcion)}</div>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-cyan" onclick="Modulos.bitacora.ejecutar('${d.id}')">✅ Yo también resolví esto así</button>
        </div>
        ${ejecs.length ? `<div class="card" style="padding:10px;margin-top:8px">
          <b style="font-size:12px">HISTORIAL DE EJECUCIONES</b>
          <div style="margin-top:6px;font-size:12px">
            ${ejecs.map(e => `<div style="padding:4px 0;border-bottom:1px solid var(--border)">
              <b>${UI.esc(e.usuario_nombre||'—')}</b> · ${UI.fecha(e.created_at)}
              ${e.vehiculos ? ` · ${UI.esc(`${e.vehiculos.placa||''} ${e.vehiculos.marca||''} ${e.vehiculos.modelo||''}`)}` : ''}
              ${e.ordenes?.num ? ` · OT #${e.ordenes.num}` : ''}
              ${e.nota ? `<div style="color:var(--text3)">${UI.esc(e.nota)}</div>` : ''}
            </div>`).join('')}
          </div>
        </div>` : ''}
        <div class="card" style="padding:10px;margin-top:8px">
          <b style="font-size:12px">COMENTARIOS (${comentarios.length})</b>
          <div id="bit-comentarios" style="margin-top:6px;font-size:12px">
            ${comentarios.length ? comentarios.map(c => `<div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:8px">
              <div><b>${UI.esc(c.usuario_nombre||'—')}</b> · <span style="color:var(--text3)">${UI.fecha(c.created_at)}</span><div>${UI.esc(c.comentario)}</div></div>
              ${puedeEditar ? `<button class="btn btn-ghost btn-sm" title="Eliminar" style="padding:2px 8px" onclick="Modulos.bitacora.eliminarComentario('${d.id}','${c.id}')">✕</button>` : ''}
            </div>`).join('') : '<span style="color:var(--text3)">Sin comentarios todavía</span>'}
          </div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <input class="form-input" id="bit-nuevo-comentario" placeholder="Agregar un comentario..." style="flex:1"
                   onkeydown="if(event.key==='Enter')Modulos.bitacora.comentar('${d.id}')">
            <button class="btn btn-sm btn-ghost" onclick="Modulos.bitacora.comentar('${d.id}')">Enviar</button>
          </div>
        </div>
      </div>`;
  },

  async _refrescarVer(id) {
    const d = this._data.find(x => x.id === id);
    const body = document.getElementById('bit-ver-body');
    if (d && body) body.innerHTML = await this._verHTML(d);
  },

  async ejecutar(id) {
    const nota = (prompt('¿Algo distinto que notaste esta vez? (opcional, Cancelar para omitir)') || '').trim();
    const ok = await DB.ejecutarBitacora(id, { nota: nota || null });
    if (!ok) { UI.toast('No se pudo registrar', 'error'); return; }
    const d = this._data.find(x => x.id === id);
    if (d) d.veces_ejecutada = (d.veces_ejecutada || 1) + 1;
    UI.toast('Registrado — gracias por nutrir la bitácora ✓');
    this._refrescarVer(id);
  },

  async comentar(id) {
    const input = document.getElementById('bit-nuevo-comentario');
    const texto = input?.value.trim();
    if (!texto) return;
    const ok = await DB.agregarComentarioBitacora(id, texto);
    if (!ok) { UI.toast('No se pudo enviar el comentario', 'error'); return; }
    if (input) input.value = '';
    this._refrescarVer(id);
  },

  async eliminarComentario(bitacoraId, comentarioId) {
    const ok = await UI.confirmar('¿Eliminar este comentario?', 'Eliminar comentario');
    if (!ok) return;
    await DB.eliminarComentarioBitacora(comentarioId);
    this._refrescarVer(bitacoraId);
  },
};
