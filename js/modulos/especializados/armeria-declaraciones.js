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
  async modalDeclaraciones(operacionId, clienteId) {
    if (typeof DB !== 'undefined' && typeof DB.getClientes === 'function') {
      const cs = await DB.getClientes().catch(() => []);
      if (cs && cs.length) this._clientes = cs;
    }
    const o = operacionId ? this._data.find(x => x.id === operacionId) : null;
    const cli = o ? (this._clientes || []).find(c => c.id === o.cliente_id)
                  : (clienteId ? (this._clientes || []).find(c => c.id === clienteId) : null);
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
  async imprimirDeclaracion(tipo, operacionId, clienteId) {
    const d = this._DECLARACIONES[tipo]; if (!d) return;
    const o = (operacionId ? this._data.find(x => x.id === operacionId) : null) || {};
    
    const cid = o.cliente_id || clienteId;
    let cli = {};
    if (cid) {
      if (typeof DB !== 'undefined' && typeof DB.getClientes === 'function') {
        const cs = await DB.getClientes().catch(() => []);
        if (cs && cs.length) this._clientes = cs;
      }
      cli = (this._clientes || []).find(c => c.id === cid) || {};
    }
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
    const edad = (Modulos.clientesArmeria?.edadDe)
      ? Modulos.clientesArmeria.edadDe(cli.fecha_nacimiento, hoy) : null;

    const esFemenino = cli.sexo === 'femenino';
    const deGenero = (masc, fem) => esFemenino ? fem : masc;

    let estadoCivil = cli.estado_civil;
    if (estadoCivil && cli.sexo) {
      if (cli.sexo === 'masculino') {
        estadoCivil = estadoCivil.replace(/\(a\)/g, '');
      } else if (cli.sexo === 'femenino') {
        estadoCivil = estadoCivil.replace(/\(a\)/g, 'a');
      }
    }

    const nacionalidadNorm = (cli.nacionalidad || 'guatemalteca').toLowerCase().trim();
    let nacionalidadStr = cli.nacionalidad || 'guatemalteca';
    if (cli.sexo && (nacionalidadNorm === 'guatemala' || nacionalidadNorm === 'gtm' || nacionalidadNorm === 'guatemalteco' || nacionalidadNorm === 'guatemalteca')) {
      nacionalidadStr = deGenero('guatemalteco', 'guatemalteca');
    } else if (!cli.sexo && (nacionalidadNorm === 'guatemala' || nacionalidadNorm === 'gtm')) {
      nacionalidadStr = 'guatemalteca';
    }

    // Convertidor de DPI/CUI a letras
    const obtenerDpiTextoCompleto = (cuiRaw) => {
      if (!cuiRaw) return null;
      const cui = String(cuiRaw).replace(/\s|-/g, '');
      if (cui.length !== 13 || !/^\d+$/.test(cui)) return cuiRaw;
      
      const b1 = cui.slice(0, 4);
      const b2 = cui.slice(4, 9);
      const b3 = cui.slice(9, 13);
      
      const numeroALetras = (num) => {
        const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
        const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
        const especiales = {
          11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince',
          16: 'dieciséis', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve',
          21: 'veintiuno', 22: 'veintidós', 23: 'veintitrés', 24: 'veinticuatro',
          25: 'veinticinco', 26: 'veintiséis', 27: 'veintiséis', 28: 'veintiocho', 29: 'veintinueve'
        };
        const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
        
        const n = parseInt(num, 10);
        if (n === 0) return 'cero';
        if (n === 100) return 'cien';
        
        let letras = '';
        if (n >= 1000) {
          const miles = Math.floor(n / 1000);
          const resto = n % 1000;
          if (miles === 1) {
            letras += 'un mil ';
          } else {
            letras += numeroALetras(miles) + ' mil ';
          }
          if (resto > 0) letras += numeroALetras(resto);
          return letras.trim();
        }
        if (n >= 100) {
          const cents = Math.floor(n / 100);
          const resto = n % 100;
          letras += centenas[cents] + ' ';
          if (resto > 0) letras += numeroALetras(resto);
          return letras.trim();
        }
        if (n >= 10) {
          if (especiales[n]) return especiales[n];
          const decs = Math.floor(n / 10);
          const u = n % 10;
          if (u > 0) {
            letras += decenas[decs] + ' y ' + unidades[u];
          } else {
            letras += decenas[decs];
          }
          return letras.trim();
        }
        return unidades[n];
      };
      
      const bloqueALetras = (bloque) => {
        let ceros = '';
        let i = 0;
        while (i < bloque.length && bloque[i] === '0') {
          ceros += 'cero ';
          i++;
        }
        if (i === bloque.length) return ceros.trim();
        const resto = bloque.slice(i);
        return (ceros + numeroALetras(resto)).trim();
      };
      
      const textoLetras = `${bloqueALetras(b1)} ${bloqueALetras(b2)} ${bloqueALetras(b3)}`;
      const numeroFormateado = `${b1} ${b2} ${b3}`;
      return `${textoLetras} (${numeroFormateado})`;
    };

    const dpiVal = o.contraparte_dpi || cli.dpi;
    const dpiTexto = obtenerDpiTextoCompleto(dpiVal);

    const identificacion = `
      <p>Yo, ${L(cli.nombre, 300)}, de ${L(edad != null ? String(edad) : null, 60)} años de edad,
      ${L(estadoCivil, 90)} (estado civil), de nacionalidad ${L(nacionalidadStr, 130)},
      de profesión u oficio ${L(cli.profesion, 180)}, con residencia en
      ${L(cli.direccion, 340)}${cli.vivienda ? ` (vivienda ${UI.esc(cli.vivienda)})` : ''},
      del municipio de ${L(cli.residencia_municipio, 180)}, departamento de ${L(cli.residencia_departamento, 180)},
      me identifico con el Documento Personal de Identificación (DPI)
      número ${L(dpiTexto, 380)} extendido por el Registro Nacional
      de las Personas de la República de Guatemala${cli.nit || o.contraparte_nit ? `, con Número de Identificación Tributaria (NIT) ${L(cli.nit || o.contraparte_nit, 140)}` : ''}.</p>`;

    const cuerpos = {
      ingresos: `
        ${identificacion}
        <p>Por este medio, y bajo juramento solemne de decir verdad, debidamente ${deGenero('enterado', 'enterada')}
        de las penas relativas al delito de perjurio, <b>DECLARO</b>:</p>
        <p><b>PRIMERO:</b> Que mis ingresos mensuales ascienden aproximadamente a la cantidad de
        ${L(null, 200)} quetzales (Q ${L(null, 120)}).</p>
        <p><b>SEGUNDO:</b> Que dichos ingresos los obtengo de la siguiente actividad económica:
        ${L(cli.profesion ? `Mi actividad económica y comercial como ${cli.profesion}` : null, 420)}<br>${L(null, 560)}<br>${L(null, 560)}</p>
        <p><b>TERCERO:</b> Que por la naturaleza de la actividad económica antes descrita no me es
        posible presentar constancia de empleo ni certificación de ingresos.</p>
        <p><b>CUARTO:</b> Que los fondos con los que realizo la presente compra provienen
        lícitamente de la actividad declarada, y que me comprometo a informar de cualquier
        cambio en los datos aquí proporcionados.</p>`,

      portacion: `
        ${identificacion}
        <p>Por este medio, y bajo juramento solemne de decir verdad, debidamente ${deGenero('enterado', 'enterada')}
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
        el siguiente: ${L(cli.profesion ? `Ingresos provenientes de mi actividad económica como ${cli.profesion}` : null, 400)}<br>${L(null, 560)}</p>
        <p><b>SEGUNDO:</b> Que dichos fondos provienen de actividades lícitas y no tienen relación
        alguna con el lavado de dinero u otros activos ni con el financiamiento del terrorismo.</p>
        <p><b>TERCERO:</b> Que la operación la realizo por cuenta propia
        ${L('sí', 60)} (sí / no). En caso negativo, actúo por cuenta de:
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
      @page { margin: 0; }
      body {
        background: #f3f4f6;
        margin: 0;
        padding: 0;
        color: #1f2937;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      }
      
      .barra {
        position: sticky;
        top: 0;
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid #e5e7eb;
        padding: 12px 24px;
        display: flex;
        gap: 16px;
        align-items: center;
        z-index: 99;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      }
      .barra .info {
        font-size: 13px;
        color: #4b5563;
        font-family: Arial, sans-serif;
      }
      .barra .info b {
        color: #0f172a;
      }
      .barra button {
        font-family: Arial, sans-serif;
        font-size: 13px;
        font-weight: 500;
        padding: 7px 16px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        background: #ffffff;
        color: #374151;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .barra button:hover {
        background: #f9fafb;
        border-color: #9ca3af;
        color: #111827;
      }
      .barra button.primary {
        background: #0891b2;
        color: #ffffff;
        border-color: #0891b2;
      }
      .barra button.primary:hover {
        background: #0e7490;
        border-color: #0e7490;
      }
      
      .doc-wrapper {
        display: flex;
        justify-content: center;
        padding: 30px 10px;
      }
      
      .doc {
        background: #ffffff;
        width: 21.59cm;
        min-height: 27.94cm;
        padding: 3cm 2cm 3cm 2.5cm;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        box-sizing: border-box;
        font-family: 'Times New Roman', Times, Georgia, serif;
        font-size: 13px;
        line-height: 1.8;
        color: #000000;
      }
      
      .doc:focus {
        outline: none;
      }
      
      .enc {
        text-align: center;
        margin-bottom: 24px;
      }
      .enc h1 {
        font-size: 16px;
        font-weight: bold;
        margin: 0 0 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .enc .base {
        font-size: 11px;
        color: #4b5563;
        font-style: italic;
      }
      
      p {
        text-align: justify;
        margin: 12px 0;
        text-indent: 1.2cm;
      }
      
      .firmas p, .pie p, .sello p, .enc p {
        text-indent: 0;
      }
      
      .firmas {
        margin-top: 60px;
        display: flex;
        gap: 60px;
      }
      .firma {
        flex: 1;
        text-align: center;
      }
      .firma .linea {
        border-top: 1px solid #000;
        margin-bottom: 6px;
      }
      .firma .rol {
        font-size: 11px;
        color: #374151;
        margin-top: 2px;
      }
      
      .pie {
        margin-top: 40px;
        font-size: 10px;
        color: #4b5563;
        border-top: 1px dashed #d1d5db;
        padding-top: 12px;
        line-height: 1.5;
      }
      
      .sello {
        margin-top: 36px;
        border: 1px dashed #9ca3af;
        background: #f9fafb;
        border-radius: 4px;
        height: 120px;
        padding: 10px;
        font-size: 10.5px;
        color: #6b7280;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
      }
      
      @media print { .barra{display:none}
        body {
          background: #ffffff;
          color: #000000;
        }
        .barra {
          display: none !important;
        }
        .doc-wrapper {
          padding: 0;
        }
        .doc {
          width: 100%;
          min-height: auto;
          padding: 2.5cm 2cm 2.5cm 2.5cm;
          box-shadow: none;
          border: none;
        }
        .sello {
          background: none;
          border-color: #000;
        }
      }
    </style></head><body>
    <div class="barra">
      <div class="info">
        <b>✏️ Documento Editable:</b> podés corregir cualquier dato haciendo clic directo sobre la hoja (las correcciones son de este documento, no tocan la ficha del cliente).
      </div>
      <button id="btn-guardar" style="margin-left:auto">💾 Guardar en historial</button>
      <button onclick="window.print()" class="primary">🖨️ Imprimir Declaración</button>
    </div>
    <div class="doc-wrapper">
      <div class="doc" contenteditable="true" spellcheck="false">
    <div class="enc">
      <h1>${d.label}</h1>
      <div class="base">Fundamento: ${d.base}</div>
      ${t.name ? `<div class="base">Presentada ante: ${UI.esc(t.name)}${t.nit ? ` · NIT ${UI.esc(t.nit)}` : ''}</div>` : ''}
    </div>

    ${cuerpos[tipo]}
    ${detalleArma}

    <p>En fe de lo declarado, firmo la presente en el municipio de ${L(cli.vecindad_municipio, 180)},
    departamento de ${L(cli.vecindad_departamento, 180)}, a los ${fechaLetras}.</p>

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

    /* El botón se cablea desde acá y no con un onclick en el HTML: así el
       handler vive en ESTA ventana, con acceso a DB y a Modulos, y no hay que
       serializar nada dentro del documento. */
    const btn = w.document.getElementById('btn-guardar');
    if (btn) btn.onclick = () => this._guardarDeclaracion(w, btn, {
      tipo, titulo: d.label, base_legal: d.base,
      cliente_id: cli.id || null,
      operacion_id: o.id || null,
      cliente_nombre: cli.nombre || null,
      cliente_dpi: o.contraparte_dpi || cli.dpi || null,
    });
  },

  /* Quita de un documento guardado todo lo que puede ejecutar código.
     El texto sale de un contenteditable, así que alguien con acceso al módulo
     podría pegar HTML: al reimprimir se abre en una ventana con document.write
     y correría. Se limpia AL GUARDAR y otra vez AL REIMPRIMIR — lo segundo
     porque una fila puede haber entrado por otra vía (API, restauración de un
     respaldo) sin pasar por lo primero. */
  _sanearDocumento(html) {
    return String(html || '')
      .replace(/<\s*(script|iframe|object|embed|link|meta|base|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(script|iframe|object|embed|link|meta|base|form)\b[^>]*>/gi, '')
      /* Atributos on* (onclick, onerror, onload…), con y sin comillas. */
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
      /* href/src con javascript: o data: (data: permite incrustar HTML). */
      .replace(/\s(href|src|xlink:href)\s*=\s*(["'])\s*(javascript|data|vbscript):[^"']*\2/gi, ' $1="#"');
  },

  async _guardarDeclaracion(win, btn, meta) {
    const doc = win.document.querySelector('.doc');
    if (!doc) { UI.toast('No se encontró el contenido del documento', 'error'); return; }

    btn.disabled = true; btn.textContent = '⏳ Guardando…';
    const { data, error } = await DB.guardarDeclaracion({
      ...meta,
      contenido_html: this._sanearDocumento(doc.innerHTML),
    });

    if (error) {
      btn.disabled = false; btn.textContent = '💾 Guardar en historial';
      UI.toast(error.message || 'No se pudo guardar la declaración', 'error', 7000);
      return;
    }

    /* Se avisa en las dos ventanas: quien guardó está mirando el documento,
       no la app. */
    btn.textContent = `✓ Guardada (${data.num})`;
    btn.style.background = '#dcfce7';
    btn.style.borderColor = '#86efac';
    UI.toast(`✓ Declaración ${data.num} guardada en el historial`, 'success');
    if (this._tab === 'declaraciones') await this.renderDeclaraciones();
  },

  /* ══ HISTORIAL ══════════════════════════════════════════════════════════ */
  async renderDeclaraciones() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    /* Se cargan los clientes porque el menú de "Nueva declaración" los
       necesita para el selector, y esta pestaña puede ser la primera que abra
       el usuario (render() de operaciones podría no haber corrido). */
    const [decls, clientes] = await Promise.all([
      DB.getDeclaraciones().catch(() => []),
      (this._clientes && this._clientes.length) ? Promise.resolve(this._clientes)
        : DB.getClientes().catch(() => []),
    ]);
    this._declaraciones = decls;
    this._clientes = clientes;
    this._data = this._data || [];
    this._inventario = this._inventario || [];

    /* Mes activo por defecto, historial completo a pedido (regla 3). */
    const hoy = new Date();
    const delMes = decls.filter(x => {
      const f = new Date(x.fecha + 'T00:00:00');
      return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
    });

    const fila = x => `
      <tr>
        <td class="mono-sm">${UI.esc(x.num)}</td>
        <td class="mono-sm">${UI.fecha(x.fecha)}</td>
        <td>${UI.esc((this._DECLARACIONES[x.tipo] || {}).label || x.titulo)}</td>
        <td>${UI.esc(x.cliente_nombre || '—')}
            ${x.cliente_dpi ? `<div style="font-size:11px;color:var(--text3)">DPI ${UI.esc(x.cliente_dpi)}</div>` : ''}</td>
        <td style="font-size:11px;color:var(--text3)">${UI.esc(x.usuarios?.nombre || '—')}</td>
        <td style="text-align:right;white-space:nowrap">
          ${Modulos.btnAccion('ver', `Modulos.armeria.verDeclaracion('${x.id}')`)}
          ${Modulos.btnAccion('imprimir', `Modulos.armeria.reimprimirDeclaracion('${x.id}')`)}
          ${Modulos.btnAccion('eliminar', `Modulos.armeria.eliminarDeclaracion('${x.id}')`)}
        </td>
      </tr>`;

    const tabla = filas => `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>No.</th><th>Fecha</th><th>Tipo</th><th>Declarante</th><th>Emitió</th><th></th></tr></thead>
        <tbody>${filas.map(fila).join('')}</tbody>
      </table></div>`;

    el.innerHTML = `
      <div class="page-header"><h1 class="page-title">🎯 Armería</h1></div>
      <div class="page-body">
        ${this._tabsHTML()}

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;flex-wrap:wrap">
          <div style="font-size:12px;color:var(--text3);flex:1;min-width:240px">
            Cada declaración se guarda <b>tal como quedó tras editarla</b>: eso es lo que el cliente
            firmó ante notario y lo que sirve de respaldo si DIGECAM o la IVE preguntan.
          </div>
          <button class="btn btn-cyan btn-sm" onclick="Modulos.armeria.modalDeclaraciones('','')">
            ➕ Nueva declaración
          </button>
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center" class="mb-3">
            <div class="card-sub" style="margin-bottom:0">
              📄 Emitidas en ${UI.esc(hoy.toLocaleDateString('es-GT',{month:'long',year:'numeric'}))}
            </div>
            <button class="btn btn-sm btn-ghost" onclick="Modulos.armeria._verHistorialDeclaraciones()">
              📅 Ver historial completo (${decls.length})
            </button>
          </div>
          ${delMes.length ? tabla(delMes)
            : `<div class="empty-state">Sin declaraciones este mes. Generá una con <b>Nueva declaración</b>
               y guardala con el botón <b>💾 Guardar en historial</b> del documento.</div>`}
        </div>
      </div>`;
  },

  _verHistorialDeclaraciones() {
    const todas = this._declaraciones || [];
    if (!todas.length) { UI.toast('Todavía no hay declaraciones guardadas', 'info'); return; }
    UI.modal('📅 Historial completo de declaraciones', `
      <div class="table-wrap" style="max-height:60vh;overflow:auto"><table class="data-table">
        <thead><tr><th>No.</th><th>Fecha</th><th>Tipo</th><th>Declarante</th><th></th></tr></thead>
        <tbody>${todas.map(x => `<tr>
          <td class="mono-sm">${UI.esc(x.num)}</td>
          <td class="mono-sm">${UI.fecha(x.fecha)}</td>
          <td>${UI.esc((this._DECLARACIONES[x.tipo] || {}).label || x.titulo)}</td>
          <td>${UI.esc(x.cliente_nombre || '—')}</td>
          <td style="text-align:right;white-space:nowrap">
            ${Modulos.btnAccion('imprimir', `Modulos.armeria.reimprimirDeclaracion('${x.id}')`)}
          </td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button></div>
    `, '760px');
  },

  async verDeclaracion(id) {
    const x = (this._declaraciones || []).find(d => d.id === id);
    const html = await DB.getDeclaracionContenido(id);
    if (!html) { UI.toast('No se pudo leer el documento', 'error'); return; }
    UI.modal(`📄 ${UI.esc(x?.num || 'Declaración')}`, `
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px">
        ${UI.esc(x?.cliente_nombre || 'Sin cliente')} · ${UI.fecha(x?.fecha)} ·
        emitida por ${UI.esc(x?.usuarios?.nombre || '—')}
      </div>
      <div style="max-height:58vh;overflow:auto;background:#fff;color:#000;padding:18px;border-radius:6px;
                  font-family:'Times New Roman',Georgia,serif;font-size:12.5px;line-height:1.7">
        ${this._sanearDocumento(html)}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        <button class="btn btn-cyan" onclick="Modulos.armeria.reimprimirDeclaracion('${id}')">🖨️ Imprimir</button>
      </div>`, '820px');
  },

  async reimprimirDeclaracion(id) {
    const x = (this._declaraciones || []).find(d => d.id === id);
    const guardado = await DB.getDeclaracionContenido(id);
    if (!guardado) { UI.toast('No se pudo leer el documento', 'error'); return; }

    const w = window.open('', '_blank', 'width=880,height=800');
    if (!w) { UI.toast('Permití las ventanas emergentes para imprimir', 'error'); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${UI.esc(x?.titulo || 'Declaración')} ${UI.esc(x?.num || '')}</title>
      <style>
        @page { margin: 2.5cm; }
        body{font-family:'Times New Roman',Georgia,serif;font-size:12.5px;line-height:1.7;margin:0;color:#000}
        .barra{position:sticky;top:0;background:#eef6ff;border-bottom:1px solid #c7ddf5;padding:8px 12px;
               font-family:Arial,sans-serif;font-size:12px;display:flex;gap:10px;align-items:center;z-index:9}
        .barra button{font-family:Arial,sans-serif;font-size:12px;padding:5px 12px;border:1px solid #999;
               border-radius:5px;background:#fff;cursor:pointer}
        .doc{padding:0 4px}
        @media print { .barra{display:none} }
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
        <b>📄 Copia del historial — ${UI.esc(x?.num || '')}</b>
        <span style="color:#666">Es el documento tal como se guardó. Para cambiarlo, generá uno nuevo.</span>
        <button onclick="window.print()" style="margin-left:auto">🖨️ Imprimir</button>
      </div>
      <div class="doc">${this._sanearDocumento(guardado)}</div>
      </body></html>`);
    w.document.close();
    w.focus();
  },

  async eliminarDeclaracion(id) {
    const x = (this._declaraciones || []).find(d => d.id === id);
    if (!confirm(`¿Eliminar la declaración ${x?.num || ''} de ${x?.cliente_nombre || 'sin cliente'}?\n\n` +
                 'Se pierde el respaldo de lo que se declaró ese día. Esto no se puede deshacer.')) return;
    const ok = await DB.eliminarDeclaracion(id);
    UI.toast(ok ? 'Declaración eliminada' : 'No se pudo eliminar', ok ? 'success' : 'error');
    if (ok) await this.renderDeclaraciones();
  },
});
