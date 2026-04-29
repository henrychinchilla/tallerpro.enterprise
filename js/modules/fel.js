/* ═══════════════════════════════════════════════════════
   fel.js — Módulo FEL INFILE Guatemala
   TallerPro Enterprise v2.0

   Endpoints INFILE:
   Sandbox:    https://api.infile.com.gt/fel/sandbox
   Producción: https://api.infile.com.gt/fel

   Para activar producción: cambiar INFILE_SANDBOX = false
   y agregar credenciales reales.
═══════════════════════════════════════════════════════ */

const FEL = {

  /* ── CONFIGURACIÓN ────────────────────────────────── */
  SANDBOX:  true,
  BASE_URL: 'https://api.infile.com.gt/fel',
  USUARIO:  'TU_USUARIO_INFILE',   // reemplazar con credenciales reales
  CLAVE:    'TU_CLAVE_INFILE',

  get endpoint() {
    return this.SANDBOX
      ? 'https://api.infile.com.gt/fel/sandbox'
      : 'https://api.infile.com.gt/fel';
  },

  /* ── GENERAR XML FEL ──────────────────────────────── */
  generarXML(factura, tenant, cliente) {
    const fecha     = new Date().toISOString().slice(0, 19);
    const nitEmisor = tenant.nit || '0';
    const nitRecep  = factura.nit || 'CF';
    const nombreRec = cliente?.nombre || 'Consumidor Final';
    const subtotal  = Number(factura.subtotal || 0).toFixed(2);
    const iva       = Number(factura.iva       || 0).toFixed(2);
    const total     = Number(factura.total     || 0).toFixed(2);

    return `<?xml version="1.0" encoding="UTF-8"?>
<dte:GTDocumento xmlns:dte="http://www.sat.gob.gt/dte/fel/0.2.0"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 Version="0.1">
  <dte:SAT ClaseDocumento="dte">
    <dte:DTE ID="DatosCertificados">
      <dte:DatosEmision ID="DatosEmision">

        <dte:DatosGenerales
          CodigoMoneda="GTQ"
          FechaHoraEmision="${fecha}"
          Tipo="FACT"/>

        <dte:Emisor
          AfiliacionIVA="GEN"
          CodigoEstablecimiento="1"
          CorreoEmisor="${tenant.email || ''}"
          NITEmisor="${nitEmisor}"
          NombreComercial="${tenant.name}"
          NombreEmisor="${tenant.name}">
          <dte:DireccionEmisor>
            <dte:Direccion>${tenant.address || 'Guatemala'}</dte:Direccion>
            <dte:CodigoPostal>01001</dte:CodigoPostal>
            <dte:Municipio>Guatemala</dte:Municipio>
            <dte:Departamento>Guatemala</dte:Departamento>
            <dte:Pais>GT</dte:Pais>
          </dte:DireccionEmisor>
        </dte:Emisor>

        <dte:Receptor
          IDReceptor="${nitRecep}"
          NombreReceptor="${nombreRec}"
          CorreoReceptor="${cliente?.email || ''}">
          <dte:DireccionReceptor>
            <dte:Direccion>${cliente?.direccion || 'Guatemala'}</dte:Direccion>
            <dte:CodigoPostal>01001</dte:CodigoPostal>
            <dte:Municipio>Guatemala</dte:Municipio>
            <dte:Departamento>Guatemala</dte:Departamento>
            <dte:Pais>GT</dte:Pais>
          </dte:DireccionReceptor>
        </dte:Receptor>

        <dte:Items>
          <dte:Item BienOServicio="S" NumeroLinea="1" Cantidad="1"
                    UnidadMedida="UND" Descripcion="${factura.descripcion || 'Servicios de taller'}"
                    PrecioUnitario="${subtotal}" Precio="${subtotal}"
                    Descuento="0">
            <dte:Impuestos>
              <dte:Impuesto>
                <dte:NombreCorto>IVA</dte:NombreCorto>
                <dte:CodigoUnidadGravable>1</dte:CodigoUnidadGravable>
                <dte:MontoGravable>${subtotal}</dte:MontoGravable>
                <dte:MontoImpuesto>${iva}</dte:MontoImpuesto>
              </dte:Impuesto>
            </dte:Impuestos>
            <dte:Total>${total}</dte:Total>
          </dte:Item>
        </dte:Items>

        <dte:Totales>
          <dte:TotalImpuestos>
            <dte:TotalImpuesto NombreCorto="IVA" TotalMontoImpuesto="${iva}"/>
          </dte:TotalImpuestos>
          <dte:GranTotal>${total}</dte:GranTotal>
        </dte:Totales>

      </dte:DatosEmision>
    </dte:DTE>
  </dte:SAT>
</dte:GTDocumento>`;
  },

  /* ── CERTIFICAR EN INFILE ─────────────────────────── */
  async certificar(facturaId) {
    try {
      /* Cargar datos */
      const facturas = await DB.getFacturas();
      const factura  = facturas.find(f => f.id === facturaId);
      if (!factura) throw new Error('Factura no encontrada');

      const clientes = await DB.getClientes();
      const cliente  = clientes.find(c => c.id === factura.cliente_id);
      const tenant   = Auth.tenant;

      /* Generar XML */
      const xml = FEL.generarXML(factura, tenant, cliente);

      /* Si es sandbox simulado (sin credenciales reales aún) */
      if (FEL.USUARIO === 'TU_USUARIO_INFILE') {
        return await FEL._simularCertificacion(facturaId, factura.num);
      }

      /* Llamada real a INFILE */
      const response = await fetch(FEL.endpoint + '/certificar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + btoa(FEL.USUARIO + ':' + FEL.CLAVE)
        },
        body: JSON.stringify({
          nit_emisor: tenant.nit,
          xml_dte:    btoa(unescape(encodeURIComponent(xml)))
        })
      });

      const result = await response.json();

      if (!response.ok || result.codigo !== '0000') {
        throw new Error(result.descripcion || 'Error en certificación');
      }

      /* Guardar UUID y datos FEL */
      await DB.updateFactura(facturaId, {
        estado:     'certificada',
        fel_uuid:   result.uuid,
        fel_serie:  result.serie,
        fel_numero: result.numero
      });

      return { ok: true, uuid: result.uuid };

    } catch (err) {
      console.error('FEL Error:', err);
      return { ok: false, error: err.message };
    }
  },

  /* ── SIMULACIÓN SANDBOX (sin credenciales) ────────── */
  async _simularCertificacion(facturaId, num) {
    /* Simula respuesta de INFILE en 1.5 segundos */
    await new Promise(r => setTimeout(r, 1500));

    const uuid   = 'FEL-' + Date.now() + '-' + Math.random().toString(36).slice(2,8).toUpperCase();
    const serie  = 'A' + new Date().getFullYear();
    const numero = String(Math.floor(Math.random() * 99999)).padStart(8, '0');

    await DB.updateFactura(facturaId, {
      estado:     'certificada',
      fel_uuid:   uuid,
      fel_serie:  serie,
      fel_numero: numero
    });

    return { ok: true, uuid, serie, numero, simulado: true };
  },

  /* ── ANULAR FACTURA ───────────────────────────────── */
  async anular(facturaId, motivo = 'Anulación solicitada por emisor') {
    try {
      const facturas = await DB.getFacturas();
      const factura  = facturas.find(f => f.id === facturaId);
      if (!factura) throw new Error('Factura no encontrada');
      if (factura.estado !== 'certificada') throw new Error('Solo se pueden anular facturas certificadas');

      /* Simulación si no hay credenciales */
      if (FEL.USUARIO === 'TU_USUARIO_INFILE') {
        await new Promise(r => setTimeout(r, 1000));
        await DB.updateFactura(facturaId, { estado: 'anulada' });
        return { ok: true, simulado: true };
      }

      /* Llamada real a INFILE */
      const response = await fetch(FEL.endpoint + '/anular', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + btoa(FEL.USUARIO + ':' + FEL.CLAVE)
        },
        body: JSON.stringify({
          nit_emisor: Auth.tenant.nit,
          uuid:       factura.fel_uuid,
          motivo
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.descripcion || 'Error al anular');

      await DB.updateFactura(facturaId, { estado: 'anulada' });
      return { ok: true };

    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /* ── GENERAR PDF (descarga local si no hay API) ───── */
  async descargarPDF(facturaId) {
    const facturas = await DB.getFacturas();
    const factura  = facturas.find(f => f.id === facturaId);
    if (!factura) return;

    const clientes = await DB.getClientes();
    const cliente  = clientes.find(c => c.id === factura.cliente_id);

    /* Genera HTML del PDF y abre ventana de impresión */
    const html = FEL._htmlPDF(factura, cliente, Auth.tenant);
    const win  = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  },

  /* ── HTML PARA PDF ────────────────────────────────── */
  _htmlPDF(factura, cliente, tenant) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Factura ${factura.num}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 20px; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 16px; }
  .title { font-size: 20px; font-weight: bold; }
  .fel-badge { background: #f59e0b; color: #000; padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { background: #f3f4f6; padding: 8px; text-align: left; border: 1px solid #ddd; }
  td { padding: 8px; border: 1px solid #ddd; }
  .totals { text-align: right; margin-top: 10px; }
  .total-final { font-size: 16px; font-weight: bold; }
  .uuid { font-family: monospace; font-size: 10px; color: #666; margin-top: 16px; border-top: 1px dashed #999; padding-top: 10px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">${tenant?.name || 'TallerPro'}</div>
      <div>NIT: ${tenant?.nit || '—'}</div>
      <div>${tenant?.address || ''}</div>
      <div>${tenant?.tel || ''}</div>
    </div>
    <div style="text-align:right">
      <div class="fel-badge">FACTURA FEL</div>
      <div style="margin-top:8px;font-size:14px;font-weight:bold">${factura.num}</div>
      <div>Fecha: ${factura.fecha}</div>
      ${factura.fel_serie ? `<div>Serie: ${factura.fel_serie}-${factura.fel_numero}</div>` : ''}
    </div>
  </div>

  <div style="margin-bottom:16px">
    <strong>Receptor:</strong><br>
    ${cliente?.nombre || 'Consumidor Final'}<br>
    NIT: ${factura.nit || 'CF'}<br>
    ${cliente?.direccion || ''}
  </div>

  <table>
    <thead>
      <tr><th>Descripción</th><th>Subtotal</th><th>IVA 12%</th><th>Total</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${factura.descripcion || 'Servicios de taller mecánico'}</td>
        <td>Q${Number(factura.subtotal).toFixed(2)}</td>
        <td>Q${Number(factura.iva).toFixed(2)}</td>
        <td>Q${Number(factura.total).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div>Subtotal: Q${Number(factura.subtotal).toFixed(2)}</div>
    <div>IVA (12%): Q${Number(factura.iva).toFixed(2)}</div>
    <div class="total-final">TOTAL: Q${Number(factura.total).toFixed(2)}</div>
  </div>

  ${factura.fel_uuid ? `
  <div class="uuid">
    <strong>Datos de Certificación SAT:</strong><br>
    UUID: ${factura.fel_uuid}<br>
    Certificado por: ${tenant?.fel_certificador || 'INFILE'}<br>
    Estado: CERTIFICADA
  </div>` : ''}

  <div style="margin-top:20px;text-align:center;font-size:10px;color:#999">
    Documento generado por TallerPro Enterprise · app.cmtelecommgt.com
  </div>
</body>
</html>`;
  }
};
