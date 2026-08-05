/* ═══════════════════════════════════════════════════════════════════════════
   Armería — Declaraciones juradas imprimibles

   Documentos que el CLIENTE debe firmar ante notario para comprar un arma o
   tramitar su licencia. La app los llena con los datos que ya tiene y los
   deja listos para imprimir y llevar al notario.

   ⚠️ SOBRE EL "FORMULARIO IVE" QUE SE PIDIÓ — verificado en LEY Y REGLAMENTO:

   · Ley Contra el Lavado de Dinero (Decreto 67-2001), art. 18: enumera a las
     "personas obligadas" a reportar a la Intendencia de Verificación
     Especial (IVE) — entidades supervisadas por la SIB, corretaje de
     valores, tarjetas de crédito, off-shore, y quienes hagan canje de
     cheques, giros, transferencias sistemáticas, factoraje, arrendamiento
     financiero o compraventa de divisas.

   · Su REGLAMENTO (Acuerdo Gubernativo 118-2002), art. 5, subdivide esas
     personas obligadas en dos grupos y los lista completos:
       Grupo A — Banco de Guatemala, bancos del sistema, sociedades
         financieras, casas de cambio, corretaje de valores, emisores y
         operadores de tarjetas de crédito, entidades off-shore.
       Grupo B — transferencias sistemáticas de fondos, compañías de seguros
         y fianzas, canje de cheques, Instituto de Fomento de Hipotecas
         Aseguradas, factoraje, arrendamiento financiero, almacenes
         generales de depósito, otras que la legislación someta a vigilancia
         de la SIB, y cooperativas de ahorro y crédito (AG 438-2002).

   **Las armerías y la compraventa de armas NO aparecen en ninguno de los
   dos grupos.** El art. 8 del reglamento explica el único camino para
   incorporarlas: un Acuerdo Gubernativo del Presidente que modifique ese
   art. 5. Mientras no exista, un negocio de armas no es persona obligada.

   OJO CON LA FECHA: el Decreto 15-2026 (Ley Integral, vigente desde
   ~17/09/2026) reemplaza este marco, suma notarios, inmobiliarias y
   criptoactivos, y faculta a la SIB para incorporar más actividades con
   aval del Conclaft. Cuando entre en vigor hay que releer su reglamento.

   Por eso acá NO se genera un "formulario IVE": rotular un documento como
   obligación ante la IVE sin que la ley la imponga sería inventarle al
   negocio un requisito que no tiene. Lo que SÍ existe y cubre la misma
   necesidad —saber de dónde vienen los ingresos del comprador— es la
   declaración jurada del art. 59 de la Ley de Armas, que es obligatoria.
   Se incluye además una sección de origen de fondos como BUENA PRÁCTICA,
   marcada como tal.
   ═══════════════════════════════════════════════════════════════════════════ */
Object.assign(Modulos.armeria, {

  _DECLARACIONES: {
    ingresos: {
      label: 'Declaración jurada de ingresos',
      base: 'Artículo 59 de la Ley de Armas y Municiones (Decreto 15-2009)',
      cuando: 'Para comprar un arma cuando el comprador no puede presentar constancia de empleo o certificación de ingresos.',
    },
    portacion: {
      label: 'Declaración jurada para licencia de portación',
      base: 'Artículo 72 literal a) numeral 3 de la Ley de Armas y Municiones',
      cuando: 'La adjunta el cliente a su solicitud de licencia de portación ante DIGECAM.',
    },
    origen_fondos: {
      label: 'Declaración de origen de fondos (buena práctica)',
      base: 'No exigida por la Ley de Armas ni por el art. 18 del Decreto 67-2001',
      cuando: 'Control interno voluntario del negocio para documentar la procedencia del dinero.',
    },
  },

  /* Menú de declaraciones. Se puede abrir de dos formas:
       · desde una operación (trae los datos de esa venta), o
       · suelto, eligiendo el cliente —  porque un cliente puede necesitar
         una declaración SIN comprar nada. La del art. 72, por ejemplo, es
         para tramitar su licencia de portación de un arma que YA tiene:
         no hay venta de por medio. Amarrar las declaraciones a una venta
         dejaba ese caso sin salida.
     `clienteId` permite elegir el cliente cuando no hay operación. */
  modalDeclaraciones(operacionId, clienteId) {
    const o = operacionId ? this._data.find(x => x.id === operacionId) : null;
    const cli = o ? this._clientes.find(c => c.id === o.cliente_id)
                  : (clienteId ? this._clientes.find(c => c.id === clienteId) : null);
    const dpi = o?.contraparte_dpi || cli?.dpi;

    UI.modal('📄 Declaraciones juradas', `
      ${!o ? `<div class="form-group">
        <label class="form-label">Cliente</label>
        <select class="form-select" onchange="Modulos.armeria.modalDeclaraciones('', this.value)">
          <option value="">— Sin cliente (documento en blanco) —</option>
          ${this._clientes.map(c => `<option value="${c.id}" ${cli?.id === c.id ? 'selected' : ''}>${UI.esc(c.nombre)}</option>`).join('')}
        </select>
        <div style="font-size:11px;color:var(--text3);margin-top:3px">
          No hace falta una venta: un cliente puede necesitar sólo la declaración (por ejemplo, para tramitar
          su licencia de portación de un arma que ya tiene).
        </div>
      </div>` : ''}

      ${cli ? `<div style="background:var(--card2);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px">
        <b>${UI.esc(cli.nombre)}</b>
        <div style="font-size:11px;color:var(--text3)">
          DPI: ${UI.esc(dpi || '—')} · NIT: ${UI.esc(cli.nit || o?.contraparte_nit || '—')}
          ${cli.direccion ? '<br>' + UI.esc(cli.direccion) : ''}
        </div>
        ${o ? `<div style="font-size:11px;color:var(--cyan);margin-top:4px">Operación ${UI.esc(o.num || '')}</div>` : ''}
      </div>` : `<div style="background:var(--card2);border-left:3px solid var(--amber);border-radius:6px;padding:10px;margin-bottom:12px;font-size:12px">
        Sin cliente seleccionado: los documentos saldrán con los espacios en blanco para llenarlos a mano.
      </div>`}

      ${Object.entries(this._DECLARACIONES).map(([k, d]) => `
        <div class="card" style="padding:12px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div style="flex:1">
              <b style="font-size:13px">${d.label}</b>
              <div style="font-size:11px;color:var(--text3);margin-top:3px">${d.base}</div>
              <div style="font-size:11.5px;margin-top:5px">${d.cuando}</div>
            </div>
            <button class="btn btn-sm btn-cyan" style="flex-shrink:0"
              onclick="Modulos.armeria.imprimirDeclaracion('${k}','${operacionId || ''}','${cli?.id || ''}')">🖨️ Generar</button>
          </div>
        </div>`).join('')}

      <div style="font-size:11px;color:var(--text3);margin-top:10px;border-top:1px dashed var(--border);padding-top:10px">
        ⚖️ Estos documentos se firman <b>ante notario público</b>. La app los deja llenos y listos para
        imprimir; la fe pública la da el notario, no el sistema.
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
      </div>`, '620px');
  },

  /* Genera el documento imprimible. `tipo` es una clave de _DECLARACIONES. */
  imprimirDeclaracion(tipo, operacionId, clienteId) {
    const d = this._DECLARACIONES[tipo]; if (!d) return;
    const o = (operacionId ? this._data.find(x => x.id === operacionId) : null) || {};
    /* El cliente puede venir de la operación o elegirse suelto (declaración
       a demanda, sin venta). */
    const cli = this._clientes.find(c => c.id === (o.cliente_id || clienteId)) || {};
    const t = window.Auth?.tenant || {};
    const inv = o.inventario_id ? this._inventario.find(i => i.id === o.inventario_id) : null;
    const a = inv?.atributos || {};

    /* Una raya para llenar a mano cuando el dato no está. Se prefiere eso a
       dejar el hueco invisible: un notario necesita ver qué falta. */
    const L = (v, ancho = 220) => v
      ? `<b>${UI.esc(v)}</b>`
      : `<span style="display:inline-block;border-bottom:1px solid #000;min-width:${ancho}px">&nbsp;</span>`;

    const hoy = new Date();
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fechaLetras = `${hoy.getDate()} de ${meses[hoy.getMonth()]} de ${hoy.getFullYear()}`;

    /* La edad se DERIVA de la fecha de nacimiento en el momento de generar
       el documento. Guardarla la dejaría vencida cada cumpleaños, y esto se
       firma bajo juramento: un dato viejo acá es un dato falso. */
    const edad = (Modulos.clientes?.edadDe)
      ? Modulos.clientes.edadDe(cli.fecha_nacimiento, hoy) : null;

    const identificacion = `
      <p>Yo, ${L(cli.nombre, 300)}, de ${L(edad != null ? String(edad) : null, 60)} años de edad,
      ${L(cli.estado_civil, 90)} (estado civil), de nacionalidad ${L(cli.nacionalidad || 'guatemalteca', 130)},
      de profesión u oficio ${L(cli.profesion, 180)}, con residencia en
      ${L(cli.direccion, 340)}${cli.vivienda ? ` (vivienda ${UI.esc(cli.vivienda)})` : ''},
      me identifico con el Documento Personal de Identificación (DPI)
      número ${L(o.contraparte_dpi || cli.dpi, 200)} extendido por el Registro Nacional
      de las Personas de la República de Guatemala${cli.nit || o.contraparte_nit ? `, con Número de Identificación Tributaria (NIT) ${L(cli.nit || o.contraparte_nit, 140)}` : ''}.</p>`;

    const cuerpos = {
      ingresos: `
        ${identificacion}
        <p>Por este medio, y bajo juramento solemne de decir verdad, debidamente enterado(a)
        de las penas relativas al delito de perjurio, <b>DECLARO</b>:</p>
        <p><b>PRIMERO:</b> Que mis ingresos mensuales ascienden aproximadamente a la cantidad de
        ${L(null, 200)} quetzales (Q ${L(null, 120)}).</p>
        <p><b>SEGUNDO:</b> Que dichos ingresos los obtengo de la siguiente actividad económica:
        ${L(null, 420)}<br>${L(null, 560)}<br>${L(null, 560)}</p>
        <p><b>TERCERO:</b> Que por la naturaleza de la actividad económica antes descrita no me es
        posible presentar constancia de empleo ni certificación de ingresos.</p>
        <p><b>CUARTO:</b> Que los fondos con los que realizo la presente compra provienen
        lícitamente de la actividad declarada, y que me comprometo a informar de cualquier
        cambio en los datos aquí proporcionados.</p>`,

      portacion: `
        ${identificacion}
        <p>Por este medio, y bajo juramento solemne de decir verdad, debidamente enterado(a)
        de las penas relativas al delito de perjurio, <b>DECLARO</b>:</p>
        <p><b>PRIMERO:</b> Que no padezco ni he padecido de enfermedades mentales.</p>
        <p><b>SEGUNDO:</b> Que no soy desertor del Ejército de Guatemala.</p>
        <p><b>TERCERO:</b> Que no he abandonado empleo en la Policía Nacional Civil.</p>
        <p><b>CUARTO:</b> Que toda la información y documentación que remito a la Dirección General
        de Control de Armas y Municiones -DIGECAM- es verídica.</p>
        <p>La presente declaración se rinde para efectos de la solicitud de licencia de portación
        de arma de fuego, conforme al artículo 72 literal a) numeral 3 de la Ley de Armas y Municiones.</p>`,

      origen_fondos: `
        ${identificacion}
        <p>Por este medio <b>DECLARO</b>, para efectos del control interno del establecimiento:</p>
        <p><b>PRIMERO:</b> Que el origen de los fondos con los que realizo la presente operación es
        el siguiente: ${L(null, 400)}<br>${L(null, 560)}</p>
        <p><b>SEGUNDO:</b> Que dichos fondos provienen de actividades lícitas y no tienen relación
        alguna con el lavado de dinero u otros activos ni con el financiamiento del terrorismo.</p>
        <p><b>TERCERO:</b> Que la operación la realizo por cuenta propia
        ${L(null, 60)} (sí / no). En caso negativo, actúo por cuenta de:
        ${L(null, 340)}</p>
        <p style="font-size:11px;color:#555;border:1px solid #ccc;padding:8px;border-radius:4px">
        <b>Nota sobre este documento:</b> no es un formulario de la Intendencia de Verificación
        Especial (IVE). El artículo 18 del Decreto 67-2001 y el artículo 5 de su Reglamento
        (Acuerdo Gubernativo 118-2002) enumeran a las personas obligadas a reportar ante la IVE
        —Grupo A y Grupo B— y no incluyen a las armerías ni a la compraventa de armas y municiones.
        Este documento es un control interno voluntario del establecimiento. Verifique con su
        asesor legal, especialmente a partir de la vigencia del Decreto 15-2026.</p>`,
    };

    const detalleArma = (tipo !== 'origen_fondos' && (o.marca || o.numero_serie)) ? `
      <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:11px">
        <tr><td colspan="4" style="background:#eee;font-weight:700;padding:4px 6px;border:1px solid #999">Arma objeto de la operación</td></tr>
        <tr>
          <td style="border:1px solid #999;padding:4px 6px"><b>Marca</b><br>${UI.esc(o.marca || '—')}</td>
          <td style="border:1px solid #999;padding:4px 6px"><b>Modelo</b><br>${UI.esc(o.modelo || '—')}</td>
          <td style="border:1px solid #999;padding:4px 6px"><b>Calibre</b><br>${UI.esc(o.calibre || '—')}</td>
          <td style="border:1px solid #999;padding:4px 6px"><b>No. de serie</b><br>${UI.esc(o.numero_serie || '—')}</td>
        </tr>
        <tr>
          <td style="border:1px solid #999;padding:4px 6px"><b>Largo del cañón</b><br>${a.largo_canon ? UI.esc(a.largo_canon) + '"' : '—'}</td>
          <td style="border:1px solid #999;padding:4px 6px"><b>Conversiones</b><br>${UI.esc(a.conversiones_calibre || 'ninguna')}</td>
          <td style="border:1px solid #999;padding:4px 6px"><b>País de origen</b><br>${UI.esc(o.pais_origen || '—')}</td>
          <td style="border:1px solid #999;padding:4px 6px"><b>Operación</b><br>${UI.esc(o.num || '—')}</td>
        </tr>
      </table>` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${d.label}</title>
    <style>
      @page { margin: 2.5cm; }
      body{font-family:'Times New Roman',Georgia,serif;font-size:12.5px;line-height:1.7;margin:0;color:#000}
      /* La barra de edición no debe salir impresa: es andamio, no documento. */
      .barra{position:sticky;top:0;background:#fffbe6;border-bottom:1px solid #e0d9b0;padding:8px 12px;
             font-family:Arial,sans-serif;font-size:12px;display:flex;gap:10px;align-items:center;z-index:9}
      .barra button{font-family:Arial,sans-serif;font-size:12px;padding:5px 12px;border:1px solid #999;
             border-radius:5px;background:#fff;cursor:pointer}
      .doc{padding:0 4px}
      .doc:focus{outline:2px dashed #c9a227;outline-offset:6px}
      @media print { .barra{display:none} .doc:focus{outline:none} }
      .enc{text-align:center;margin-bottom:18px}
      .enc h1{font-size:15px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px}
      .enc .base{font-size:10.5px;color:#444}
      p{text-align:justify;margin:9px 0}
      .firmas{margin-top:48px;display:flex;gap:40px}
      .firma{flex:1;text-align:center}
      .firma .linea{border-top:1px solid #000;margin-bottom:4px}
      .firma .rol{font-size:10.5px}
      .pie{margin-top:26px;font-size:9.5px;color:#666;border-top:1px dashed #bbb;padding-top:8px}
      .sello{margin-top:34px;border:1px dashed #999;height:110px;padding:6px;font-size:10px;color:#777}
    </style></head><body>
    <div class="barra">
      <b>✏️ Podés corregir cualquier dato haciendo clic sobre él.</b>
      <span style="color:#666">Los cambios son sólo para esta impresión — no se guardan en la ficha del cliente.</span>
      <button onclick="window.print()" style="margin-left:auto">🖨️ Imprimir</button>
    </div>
    <div class="doc" contenteditable="true" spellcheck="false">
    <div class="enc">
      <h1>${d.label}</h1>
      <div class="base">Fundamento: ${d.base}</div>
      ${t.name ? `<div class="base">Presentada ante: ${UI.esc(t.name)}${t.nit ? ` · NIT ${UI.esc(t.nit)}` : ''}</div>` : ''}
    </div>

    ${cuerpos[tipo]}
    ${detalleArma}

    <p>En fe de lo declarado, firmo la presente en el municipio de ${L(null, 180)},
    departamento de ${L(null, 180)}, a los ${fechaLetras}.</p>

    <div class="firmas">
      <div class="firma">
        <div class="linea"></div>
        <div><b>${UI.esc(cli.nombre || '')}</b></div>
        <div class="rol">Declarante · DPI ${UI.esc(o.contraparte_dpi || cli.dpi || '')}</div>
      </div>
      <div class="firma">
        <div class="linea"></div>
        <div class="rol">Firma y sello del Notario</div>
        <div class="rol">Colegiado No. ______________</div>
      </div>
    </div>

    <div class="sello">Espacio para el sello y timbres notariales / razón de legalización de firma.</div>

    <div class="pie">
      Documento generado por NexusPro el ${hoy.toLocaleString('es-GT')}. Este sistema únicamente
      prepara el formato con los datos registrados; <b>la fe pública la otorga el notario</b>.
      Verifique el contenido antes de firmar.
    </div>
    </div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=880,height=800');
    if (!w) { UI.toast('Permití las ventanas emergentes para generar el documento', 'error'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    /* NO se imprime solo: Henry pidió poder editar antes. La barra tiene su
       propio botón de imprimir, y el documento es editable hasta que la
       persona decida. Imprimir de una haría inútil la edición. */
  },
});
