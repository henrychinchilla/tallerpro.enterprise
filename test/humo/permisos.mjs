/* LOS PERMISOS, EJECUTADOS.

   Hoy los permisos se "verifican" leyendo config.js con expresiones regulares:
   se comprueba que la tabla PERMISOS diga lo correcto. Eso no prueba que el
   menú obedezca — y de hecho no obedecía: el superadmin veía TODOS los módulos
   dentro de cualquier comercio porque `renderSidebar` tenía su propio atajo,
   aparte de los permisos. Se descubrió usando la app, no leyendo la tabla.

   Acá se cambia el rol EN VIVO y se mira qué queda en pantalla. Es la única
   forma de saber que lo que la tabla promete es lo que el usuario ve.

   No se crean usuarios nuevos por cada rol: se cambia el rol del robot en
   memoria y se repinta. Lo que se está probando es la DECISIÓN de la app
   (nivelAcceso + renderSidebar), no el login. */
import { abrirSesion, marcador, cerrar } from './ayuda.mjs';

const sesion = await abrirSesion();
if (!sesion) { console.log('⚠️  Sin credenciales o sin poder entrar — permisos no se prueban.'); process.exit(0); }
const { pagina, errores } = sesion;
const { estado, ok } = marcador();

/* Devuelve los módulos que el menú muestra para un rol y unos módulos activos
   del comercio. Se restaura todo al final para no dejar la sesión torcida. */
async function menuPara(rol, modulosActivos) {
  return pagina.evaluate(({ rol, mods }) => {
    const rolAntes = Auth.user.rol;
    const modsAntes = Auth.tenant.modulos_activos;
    Auth.user.rol = rol;
    if (mods) Auth.tenant.modulos_activos = mods;
    App.renderSidebar();
    /* Los módulos normales son <li class="nav-item" onclick="App.navegarA('id')">;
       sólo los externos (el POS) son <a class="nav-link" href>. Se leen los dos:
       mirar sólo uno devolvía una lista casi vacía, y entonces las
       verificaciones NEGATIVAS pasaban por falta de datos — un verde mentiroso,
       que es peor que un rojo. */
    const items = [];
    document.querySelectorAll('.nav-item[onclick]').forEach(li => {
      const m = /navegarA\('([^']+)'\)/.exec(li.getAttribute('onclick') || '');
      if (m) items.push(m[1]);
    });
    document.querySelectorAll('a.nav-link[href]').forEach(a => {
      items.push((a.getAttribute('href') || '').replace(/[#/]|\.html/g, '').trim());
    });
    Auth.user.rol = rolAntes;
    Auth.tenant.modulos_activos = modsAntes;
    App.renderSidebar();
    return items;
  }, { rol, mods: modulosActivos });
}

const tiene = (lista, txt) => lista.some(x => new RegExp(txt, 'i').test(x));

/* Una lista vacía haría pasar todas las verificaciones de "NO aparece": eso
   sería un verde mentiroso. Se exige que el menú traiga algo antes de creerle. */
const menuUtil = (lista, quien) => {
  const util = lista.length >= 3;
  ok(`el menú de ${quien} trae módulos (${lista.length})`, util, lista.join(', '));
  return util;
};

try {
  /* ── Un mecánico no ve lo que no es suyo ────────────────────────────── */
  const mecanico = await menuPara('mecanico', null);
  menuUtil(mecanico, 'el mecánico');
  ok('el mecánico ve las órdenes de trabajo', tiene(mecanico, 'ordenes'), mecanico.join(', '));
  ok('...pero NO ve armería', !tiene(mecanico, 'armeria'), mecanico.join(', '));
  ok('...ni finanzas', !tiene(mecanico, 'finanzas'), mecanico.join(', '));
  ok('...ni usuarios', !tiene(mecanico, 'usuarios'), mecanico.join(', '));

  /* ── El admin del comercio sí ───────────────────────────────────────── */
  const admin = await menuPara('admin', null);
  ok('el admin del negocio ve usuarios', tiene(admin, 'usuarios'), admin.join(', '));
  ok('...y configuración', tiene(admin, 'configuracion'), admin.join(', '));

  /* ── EL MENÚ ES DEL COMERCIO, TAMBIÉN PARA EL SUPERADMIN ────────────
     Éste es el que estaba roto: entrar a un negocio de granos y ver todos los
     módulos hacía parecer que nunca se había entrado. */
  const soloGranos = ['venta_granos', 'inventario', 'clientes'];
  const superEnGranos = await menuPara('superadmin', soloGranos);
  menuUtil(superEnGranos, 'el superadmin en granos');
  ok('en un comercio de granos, el superadmin ve granos',
     tiene(superEnGranos, 'venta_granos'), superEnGranos.join(', '));
  ok('...pero NO ve armería, que ese negocio no tiene',
     !tiene(superEnGranos, 'armeria'), superEnGranos.join(', '));
  ok('...ni refrigeración', !tiene(superEnGranos, 'refrigeracion'), superEnGranos.join(', '));
  ok('...y conserva su Panel SaaS, que no es de ningún comercio',
     tiene(superEnGranos, 'superadmin'), superEnGranos.join(', '));

  /* Y con el comercio completo, sí los ve: la diferencia la hace el COMERCIO,
     no el rol. */
  const superCompleto = await menuPara('superadmin', ['armeria', 'venta_granos', 'inventario']);
  ok('en un comercio con armería, el superadmin sí la ve',
     tiene(superCompleto, 'armeria'), superCompleto.join(', '));

  /* ── Las acciones, no sólo la vista ─────────────────────────────────── */
  const acciones = await pagina.evaluate(() => {
    const rolAntes = Auth.user.rol;
    const r = {};
    Auth.user.rol = 'mecanico';
    r.mecanicoBorraClientes = puedeAccion('clientes', 'eliminar');
    r.mecanicoVeOrdenes = puedeAccion('ordenes', 'ver');
    Auth.user.rol = 'superadmin';
    r.superBorraClientes = puedeAccion('clientes', 'eliminar');
    Auth.user.rol = rolAntes;
    return r;
  });
  ok('el mecánico NO puede eliminar clientes', acciones.mecanicoBorraClientes === false);
  ok('...pero sí ve las órdenes', acciones.mecanicoVeOrdenes === true);
  ok('el superadmin sí puede eliminar', acciones.superBorraClientes === true);

  ok('probar permisos no tiró errores de JavaScript', errores.length === 0, errores[0]);
} catch (e) {
  ok('los permisos se pudieron probar', false, e.message);
}

console.log(`\n${estado.pasadas} pasadas, ${estado.fallidas} fallidas`);
await cerrar(sesion, estado.fallidas);
process.exit(estado.fallidas ? 1 : 0);
