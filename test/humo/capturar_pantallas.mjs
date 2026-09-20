import { chromium } from '@playwright/test';
import path from 'path';

const PATH_PROYECTO = "d:\\tallerpro-enterprise";
const BASE = "http://127.0.0.1:8080";

console.log("Iniciando navegador Playwright...");
const navegador = await chromium.launch();

// ----------------------------------------------------
// FLUJO 1: CAPTURAS DE MÓVIL (8 IMÁGENES)
// ----------------------------------------------------
console.log("=== CAPTURAS DE MÓVIL (390x844) ===");
const contextoMovil = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
});
await contextoMovil.addInitScript(() => { delete navigator.__proto__.serviceWorker; });
const pagina = await contextoMovil.newPage();

pagina.on('console', msg => console.log('MOVIL PAGE LOG:', msg.text()));
pagina.on('pageerror', err => console.error('MOVIL PAGE ERROR:', err.message));

async function entrar(pag) {
  try {
    await pag.goto(BASE + '/', { waitUntil: 'load' });
    await pag.waitForFunction(() => typeof window.getSB === 'function', null, { timeout: 20000 });
    await pag.waitForTimeout(500);

    // Limpiar localStorage previo para evitar tokens expirados
    await pag.evaluate(() => localStorage.clear());
    await pag.reload({ waitUntil: 'load' });
    await pag.waitForFunction(() => typeof window.getSB === 'function', null, { timeout: 10000 });

    const r = await pag.evaluate(async () => {
      const x = await getSB().auth.signInWithPassword({ email: 'robot.pruebas@nexuspro.test', password: 'RobotPruebas.2026' });
      return x.error ? ('error: ' + x.error.message) : 'ok';
    });

    if (String(r).startsWith('error:')) return { ok: false, motivo: r };

    await pag.waitForFunction(
      () => Object.keys(localStorage).some(k => /-auth-token$/.test(k)),
      null, { timeout: 15000 }).catch(() => {});
    await pag.goto(BASE + '/', { waitUntil: 'load' }).catch(() => {});

    // Bypass de 2FA si aparece la pantalla de configuración obligatoria
    const mfaVisible = await pag.waitForFunction(
      () => document.getElementById('mfa-enroll-code') || (document.getElementById('app')?.classList.contains('visible') && typeof App !== 'undefined'),
      null, { timeout: 20000 }).then(() => true).catch(() => false);
    
    if (mfaVisible) {
      const tieneMFA = await pag.evaluate(() => !!document.getElementById('mfa-enroll-code'));
      if (tieneMFA) {
        console.log("Se detectó pantalla de 2FA en el login. Posponiendo 2FA...");
        await pag.evaluate(() => loginPosponerMFA());
        await pag.waitForTimeout(2000);
      }
    }

    const dentro = await pag.waitForFunction(
      () => document.getElementById('app')?.classList.contains('visible') && typeof App !== 'undefined',
      null, { timeout: 20000 }).then(() => true).catch(() => false);
    return { ok: dentro, motivo: r };
  } catch (e) {
    return { ok: false, motivo: 'arranque: ' + e.message.slice(0, 70) };
  }
}

async function irA(pag, modulo) {
  await pag.evaluate((m) => App.navegarA(m), modulo);
  await pag.waitForFunction(() => {
    const el = document.getElementById('page-content');
    return el && el.innerText.trim().length > 0 && !/^\s*(cargando|⏳)/i.test(el.innerText);
  }, null, { timeout: 10000 }).catch(() => {});
  await pag.waitForTimeout(1500);
}

try {
  // Captura 1: Login
  console.log("Accediendo a la pantalla de Login...");
  await pagina.goto(BASE + '/', { waitUntil: 'load' });
  await pagina.waitForTimeout(2000);
  await pagina.screenshot({ path: path.join(PATH_PROYECTO, 'screenshot_movil_1_login.png') });
  console.log("Captura 1 guardada.");

  // Loguearse
  console.log("Iniciando sesión con reintentos...");
  let entro = false;
  for (let i = 1; i <= 3 && !entro; i++) {
    const r = await entrar(pagina);
    entro = r.ok;
    if (!entro) console.log('Reintentando ingreso (' + r.motivo + ')...');
  }

  if (!entro) {
    await pagina.screenshot({ path: path.join(PATH_PROYECTO, 'screenshot_error_login.png') });
    throw new Error("No se pudo iniciar sesión de prueba.");
  }
  console.log("Sesión iniciada con éxito en móvil.");

  // Capturas Móviles
  await pagina.screenshot({ path: path.join(PATH_PROYECTO, 'screenshot_movil_2_dashboard.png') });
  console.log("Captura 2 (Dashboard) guardada.");

  await pagina.goto(BASE + '/pos.html', { waitUntil: 'load' });
  await pagina.waitForTimeout(4000);
  await pagina.screenshot({ path: path.join(PATH_PROYECTO, 'screenshot_movil_3_pos.png') });
  console.log("Captura 3 (POS) guardada.");

  await pagina.goto(BASE + '/', { waitUntil: 'load' }).catch(() => {});
  await pagina.waitForFunction(
    () => document.getElementById('app')?.classList.contains('visible') && typeof App !== 'undefined',
    null, { timeout: 15000 });

  await irA(pagina, 'clientes');
  await pagina.screenshot({ path: path.join(PATH_PROYECTO, 'screenshot_movil_4_clientes.png') });
  console.log("Captura 4 (Clientes) guardada.");

  await irA(pagina, 'vehiculos');
  await pagina.screenshot({ path: path.join(PATH_PROYECTO, 'screenshot_movil_5_vehiculos.png') });
  console.log("Captura 5 (Vehículos) guardada.");

  await irA(pagina, 'inventario');
  await pagina.screenshot({ path: path.join(PATH_PROYECTO, 'screenshot_movil_6_inventario.png') });
  console.log("Captura 6 (Inventario) guardada.");

  await irA(pagina, 'ordenes');
  await pagina.screenshot({ path: path.join(PATH_PROYECTO, 'screenshot_movil_7_ordenes.png') });
  console.log("Captura 7 (Órdenes) guardada.");

  await irA(pagina, 'configuracion');
  await pagina.screenshot({ path: path.join(PATH_PROYECTO, 'screenshot_movil_8_configuracion.png') });
  console.log("Captura 8 (Configuración) guardada.");

} catch (err) {
  console.error("Error en flujo móvil:", err);
} finally {
  await contextoMovil.close();
}

// ----------------------------------------------------
// FLUJO 2: CAPTURAS DE TABLET 7 PULGADAS (2 IMÁGENES)
// ----------------------------------------------------
console.log("=== CAPTURAS DE TABLET 7\" (768x1024) ===");
const contextoTab7 = await navegador.newContext({
  viewport: { width: 1200, height: 1920 }
});
await contextoTab7.addInitScript(() => { delete navigator.__proto__.serviceWorker; });
const paginaTab7 = await contextoTab7.newPage();
try {
  const loginTab7 = await entrar(paginaTab7);
  if (loginTab7.ok) {
    // Captura 1: Dashboard
    await paginaTab7.screenshot({ path: path.join(PATH_PROYECTO, 'screenshot_tablet7_1_dashboard.png') });
    console.log("Captura Tablet 7\" 1 (Dashboard) guardada.");

    // Captura 2: Clientes
    await irA(paginaTab7, 'clientes');
    await paginaTab7.screenshot({ path: path.join(PATH_PROYECTO, 'screenshot_tablet7_2_clientes.png') });
    console.log("Captura Tablet 7\" 2 (Clientes) guardada.");
  } else {
    console.error("No se pudo ingresar en Tablet 7\" para capturas.");
  }
} catch (err) {
  console.error("Error en flujo Tablet 7\":", err);
} finally {
  await contextoTab7.close();
}

// ----------------------------------------------------
// FLUJO 3: CAPTURAS DE TABLET 10 PULGADAS (2 IMÁGENES)
// ----------------------------------------------------
console.log("=== CAPTURAS DE TABLET 10\" (1280x800) ===");
const contextoTab10 = await navegador.newContext({
  viewport: { width: 2560, height: 1600 }
});
await contextoTab10.addInitScript(() => { delete navigator.__proto__.serviceWorker; });
const paginaTab10 = await contextoTab10.newPage();
try {
  const loginTab10 = await entrar(paginaTab10);
  if (loginTab10.ok) {
    // Captura 1: Dashboard
    await paginaTab10.screenshot({ path: path.join(PATH_PROYECTO, 'screenshot_tablet10_1_dashboard.png') });
    console.log("Captura Tablet 10\" 1 (Dashboard) guardada.");

    // Captura 2: POS (pantalla completa ideal para tablets de 10")
    await paginaTab10.goto(BASE + '/pos.html', { waitUntil: 'load' });
    await paginaTab10.waitForTimeout(4000);
    await paginaTab10.screenshot({ path: path.join(PATH_PROYECTO, 'screenshot_tablet10_2_pos.png') });
    console.log("Captura Tablet 10\" 2 (POS) guardada.");
  } else {
    console.error("No se pudo ingresar en Tablet 10\" para capturas.");
  }
} catch (err) {
  console.error("Error en flujo Tablet 10\":", err);
} finally {
  await contextoTab10.close();
}

await navegador.close();
console.log("=== PROCESO COMPLETO FINALIZADO ===");
