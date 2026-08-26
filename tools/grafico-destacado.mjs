/* Gráfico destacado (feature graphic) de Google Play — 1024×500.

   POR QUÉ SE REHÍZO: los dos que había no servían.
     · `nexuspro_grafico_funciones.jpg` — bonito, pero enseña un **iPhone** y una
       interfaz que **no es la app**. Play desaconseja mostrar dispositivos de
       otra plataforma y su política de metadatos engañosos pide que lo que se
       muestre corresponda a la app de verdad. Dos motivos de rechazo del
       recurso, y un rechazo por política cuesta mucho más de revertir.
     · `screenshots/play-feature-graphic.png` — marca vieja ("TallerPro
       Enterprise"), el asistente todavía llamado "Beto" y el dominio muerto
       `tallerpro.telecommgt.com`.

   Éste no dibuja ningún teléfono ni ninguna pantalla falsa: sólo la marca real,
   el ícono real de la app y funciones que existen. Nada que contradecir.

   Uso:  node tools/grafico-destacado.mjs
*/
import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');
const SALIDA = process.env.PLAY_OUT || 'D:\\tallerpro-enterprise';
const DESTINO = path.join(SALIDA, 'play-grafico-destacado.png');

const icono = fs.readFileSync(path.join(RAIZ, 'icons', 'icon-512.png')).toString('base64');

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1024px;height:500px;overflow:hidden;
       font-family:Manrope,'Segoe UI',system-ui,sans-serif;
       background:radial-gradient(120% 140% at 82% 18%, #17356b 0%, #0d1c38 42%, #08101f 100%);
       color:#fff;display:flex;align-items:center;position:relative}
  /* Trama sutil, para que el fondo no quede plano */
  .malla{position:absolute;inset:0;opacity:.5;
    background-image:linear-gradient(rgba(59,130,246,.07) 1px,transparent 1px),
                     linear-gradient(90deg,rgba(59,130,246,.07) 1px,transparent 1px);
    background-size:44px 44px}
  .brillo{position:absolute;width:620px;height:620px;right:-190px;top:-230px;border-radius:50%;
    background:radial-gradient(circle,rgba(59,130,246,.34) 0%,transparent 62%)}
  .caja{position:relative;display:flex;align-items:center;gap:44px;padding:0 62px;width:100%}
  .izq{flex:1.15}
  .marca{display:flex;align-items:center;gap:18px;margin-bottom:20px}
  .marca img{width:76px;height:76px;border-radius:17px;box-shadow:0 8px 26px rgba(0,0,0,.45)}
  .nombre{font-family:'Bebas Neue',Impact,sans-serif;font-size:70px;letter-spacing:2.5px;line-height:.94}
  .nombre b{color:#3B82F6;font-weight:400}
  .lema{font-size:23px;font-weight:700;line-height:1.32;margin-bottom:14px;max-width:520px}
  .sub{font-size:15.5px;color:#9db4d6;line-height:1.5;max-width:500px;font-weight:600}
  .gt{display:inline-flex;align-items:center;gap:8px;background:rgba(59,130,246,.16);
      border:1px solid rgba(59,130,246,.42);color:#a9c8f5;border-radius:999px;
      padding:7px 16px;font-size:12.5px;font-weight:800;letter-spacing:1.4px;margin-bottom:22px}
  .der{width:352px;display:flex;flex-direction:column;gap:11px}
  .f{display:flex;align-items:center;gap:13px;background:rgba(255,255,255,.055);
     border:1px solid rgba(255,255,255,.1);border-radius:13px;padding:13px 16px}
  .f .ic{font-size:23px;width:29px;text-align:center}
  .f .t{font-size:15px;font-weight:800;line-height:1.2}
  .f .d{font-size:12px;color:#93a9c9;margin-top:2px}
  .pie{position:absolute;right:62px;bottom:24px;font-size:13px;color:#7f97ba;font-weight:700}
</style></head><body>
  <div class="malla"></div><div class="brillo"></div>
  <div class="caja">
    <div class="izq">
      <div class="gt">🇬🇹 HECHO EN GUATEMALA</div>
      <div class="marca">
        <img src="data:image/png;base64,${icono}" alt="">
        <div class="nombre">NEXUS<b>PRO</b></div>
      </div>
      <div class="lema">El sistema completo para tu taller o comercio</div>
      <div class="sub">Órdenes de trabajo, inventario, punto de venta y facturación electrónica FEL — desde el teléfono.</div>
    </div>
    <div class="der">
      <div class="f"><div class="ic">🧾</div><div><div class="t">Factura FEL · SAT</div><div class="d">Certificada, desde la orden</div></div></div>
      <div class="f"><div class="ic">🛒</div><div><div class="t">Punto de venta</div><div class="d">Cobra y descuenta inventario</div></div></div>
      <div class="f"><div class="ic">📦</div><div><div class="t">Inventario por bodegas</div><div class="d">Quintal, arroba, libra, galón</div></div></div>
      <div class="f"><div class="ic">🔧</div><div><div class="t">Órdenes de trabajo</div><div class="d">Con fotos y repuestos</div></div></div>
    </div>
  </div>
  <div class="pie">nexuspro.cmtelecommgt.com</div>
</body></html>`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await pagina.setContent(HTML, { waitUntil: 'load' });
/* Dar tiempo a que bajen las tipografías: sin ellas el texto salta a la de
   respaldo y el resultado se ve descuadrado. */
await pagina.waitForTimeout(2500);
await pagina.screenshot({ path: DESTINO });
await navegador.close();

const b = fs.readFileSync(DESTINO);
const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
console.log(`${path.basename(DESTINO)} → ${w}x${h}  ${Math.round(b.length / 1024)} KB`);
console.log(w === 1024 && h === 500 ? 'OK — medidas exactas que pide Play' : 'MAL — Play exige 1024x500');
if (!(w === 1024 && h === 500)) process.exitCode = 1;
