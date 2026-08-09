/* CRUD DE VERDAD, EJECUTADO.

   La regla 1 de CLAUDE.md dice que cada módulo debe tener Crear, Ver, Editar y
   Eliminar, y Henry avisa que es lo que más se olvida. Hasta hoy eso se
   "verificaba" buscando el texto btnAccion('eliminar') dentro del código: eso
   prueba que el BOTÓN existe, no que la operación funcione. Un guardado que
   revienta contra la base, un borrado sin permiso, un editar que no persiste —
   todos pasaban esa revisión sin despeinarse (el borrado de usuarios, de hecho,
   nunca funcionó para nadie).

   Acá se hace el ciclo completo contra la base real del comercio de PRUEBAS:
   se crea, se busca en la lista, se edita, se comprueba el cambio, se borra y
   se comprueba que ya no está. Si algo no persiste, falla.

   Cada registro lleva la marca "ZZ-PRUEBA" en el nombre para que se distinga a
   simple vista y para poder limpiarlo si algo queda a medias. */
import { abrirSesion, irA, textoPantalla, marcador, cerrar, aceptarConfirmacion } from './ayuda.mjs';

const sesion = await abrirSesion();
if (!sesion) { console.log('⚠️  Sin credenciales o sin poder entrar — CRUD no corre.'); process.exit(0); }
const { pagina, errores } = sesion;
const { estado, ok } = marcador();

const marca = 'ZZ-PRUEBA';
const sello = String(Date.now()).slice(-6);

/* Los módulos y cómo se llena su alta. `campos` son ids del formulario. */
const CASOS = [
  {
    modulo: 'clientes',
    abrir: () => Modulos.clientes.modalForm(),
    campos: (n) => ({ 'cli-nombre': n, 'cli-tel': '5555-0000', 'cli-nit': 'CF' }),
    editar: { id: 'cli-tel', valor: '4444-1111' },
    verEditado: '4444-1111',
    guardar: /Crear Cliente|Guardar Cambios/i,
    abrirEditar: (id) => Modulos.clientes.modalForm(id),
    idDe: (n) => (Modulos.clientes._data.find(x => x.nombre === n) || {}).id,
    borrar: (id, n) => Modulos.clientes.eliminar(id, n),
  },
  {
    modulo: 'proveedores',
    abrir: () => Modulos.proveedores.modalForm(),
    campos: (n) => ({ 'prov-nombre': n, 'prov-nit': 'CF' }),
    editar: { id: 'prov-nombre', valor: null },   // se completa abajo con el nombre editado
    guardar: /Crear Proveedor|Guardar Cambios/i,
    abrirEditar: (id) => Modulos.proveedores.modalForm(id),
    idDe: (n) => (Modulos.proveedores._data.find(x => x.nombre === n) || {}).id,
    /* Proveedores no tiene método propio: borra con el helper estándar, igual
       que hace su botón de la lista. */
    borrar: (id, n) => Modulos.eliminarRegistro('proveedores', id, n, () => Modulos.proveedores.render()),
  },
  {
    modulo: 'inventario',
    abrir: () => Modulos.inventario.modalForm(),
    campos: (n) => ({ 'inv-codigo': 'ZZP-' + sello, 'inv-nombre': n, 'inv-venta': '99.50', 'inv-stock': '7' }),
    editar: { id: 'inv-venta', valor: '123.45' },
    verEditado: '123.45',
    guardar: /Crear Artículo|Guardar Cambios/i,
    abrirEditar: (id) => Modulos.inventario.modalForm(id),
    idDe: (n) => (Modulos.inventario._data.find(x => x.nombre === n) || {}).id,
    borrar: (id, n) => Modulos.inventario.eliminar(id, n),
  },
];

/* Llena los campos del modal disparando los eventos que la app escucha: poner
   .value a mano no avisa a nadie, y hay formularios que recalculan al cambiar. */
async function llenar(pagina, campos) {
  await pagina.evaluate((c) => {
    for (const [id, val] of Object.entries(c)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, campos);
}

for (const caso of CASOS) {
  const nombre = `${marca} ${caso.modulo} ${sello}`;
  const nombreEditado = nombre + ' EDITADO';
  errores.length = 0;

  try {
    await irA(pagina, caso.modulo);

    /* ── CREAR ─────────────────────────────────────────────────────────── */
    await pagina.evaluate(`(${caso.abrir.toString()})()`);
    await pagina.waitForSelector('.modal, [class*="modal"]', { timeout: 5000 }).catch(() => {});
    await llenar(pagina, caso.campos(nombre));
    await pagina.getByRole('button', { name: caso.guardar }).last().click();
    await pagina.waitForTimeout(2500);

    let texto = await textoPantalla(pagina);
    ok(`${caso.modulo}: CREAR deja el registro en la lista`, texto.includes(nombre),
       errores[0] || texto.slice(0, 200));
    if (!texto.includes(nombre)) continue;

    /* ── EDITAR ────────────────────────────────────────────────────────── */
    const id = await pagina.evaluate(`(${caso.idDe.toString()})(${JSON.stringify(nombre)})`);
    ok(`${caso.modulo}: el registro creado tiene id`, !!id);
    if (!id) continue;

    await pagina.evaluate(`(${caso.abrirEditar.toString()})(${JSON.stringify(id)})`);
    await pagina.waitForTimeout(800);
    const cambio = caso.editar.valor === null
      ? { [caso.editar.id]: nombreEditado }
      : { [caso.editar.id]: caso.editar.valor };
    await llenar(pagina, cambio);
    await pagina.getByRole('button', { name: /Guardar Cambios/i }).last().click();
    await pagina.waitForTimeout(2500);

    texto = await textoPantalla(pagina);
    const esperado = caso.editar.valor === null ? nombreEditado : caso.verEditado;
    ok(`${caso.modulo}: EDITAR persiste el cambio`, texto.includes(esperado),
       errores[0] || texto.slice(0, 200));

    /* ── ELIMINAR ──────────────────────────────────────────────────────── */
    const nombreFinal = caso.editar.valor === null ? nombreEditado : nombre;
    const idFinal = await pagina.evaluate(`(${caso.idDe.toString()})(${JSON.stringify(nombreFinal)})`) || id;
    /* `void` a propósito: eliminar() abre UI.confirmar y NO resuelve hasta que
       alguien toca el botón. Si el evaluate esperara esa promesa, quedaría
       colgado esperando un clic que sólo puede darse después — y al repintarse
       la lista, el contexto muere con "Execution context was destroyed". Se
       dispara y se confirma aparte. */
    await pagina.evaluate(`void (${caso.borrar.toString()})(${JSON.stringify(idFinal)}, ${JSON.stringify(nombreFinal)})`);
    await pagina.waitForTimeout(700);
    await aceptarConfirmacion(pagina);
    await pagina.waitForTimeout(2500);

    await irA(pagina, caso.modulo);
    texto = await textoPantalla(pagina);
    ok(`${caso.modulo}: ELIMINAR lo saca de la lista`, !texto.includes(nombreFinal),
       errores[0] || 'sigue apareciendo');

    ok(`${caso.modulo}: el ciclo completo no tiró errores de JavaScript`,
       errores.length === 0, errores[0]);
  } catch (e) {
    ok(`${caso.modulo}: el ciclo CRUD se pudo ejecutar`, false, e.message);
  }
}

console.log(`\n${estado.pasadas} pasadas, ${estado.fallidas} fallidas`);
await cerrar(sesion, estado.fallidas);
process.exit(estado.fallidas ? 1 : 0);
