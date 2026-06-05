# Módulos

Cada módulo es un archivo JS independiente que se auto-registra en el
objeto global `Modulos` (definido en `js/core/app.js`).

## Organización por dominio

```
js/modulos/
  principal/      dashboard
  operacion/      clientes, vehiculos, ordenes, inventario, bodegas, proveedores
  finanzas/       facturacion, bancos, finanzas
  rrhh/           rrhh
  marketing/      marketing
  herramientas/   calendario, comunicaciones
  admin/          configuracion, usuarios, admin
```

El **dominio** de cada módulo se declara en `MODULOS[].grupo` (en
`js/core/config.js`). El **orden y los encabezados** del menú se definen en
`GRUPOS` (mismo archivo). Para agregar/mover un módulo de sección basta con
cambiar su `grupo` — el sidebar se reorganiza solo.

## Patrón estándar de un módulo

```js
/* js/modulos/<dominio>/<modulo>.js */
Modulos.<id> = {

  /* Punto de entrada. App.navegarA() llama a render(). */
  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);                         // estado de carga
    const datos = await DB.getAlgo();        // capa de datos (siempre por tenant)
    el.innerHTML = `...`;                    // pinta la vista
  },

  /* Acciones (abrir modal, guardar, borrar...) */
  abrir(id) { UI.modal('Título', `...formulario...`); },

  async guardar(id) {
    const r = await DB.upsertAlgo({ ... });
    if (r.error) { UI.error('No se pudo guardar', r.error); return; }
    UI.cerrarModal();
    UI.toast('Guardado ✓');
    Modulos.<id>.render();                    // refresca
  }
};
```

### Convenciones
- **Registro:** `Modulos.<id> = { ... }` (el `<id>` coincide con `MODULOS[].id`).
- **Entrada:** método `render()` obligatorio.
- **Datos:** toda lectura/escritura va por `DB.*` (filtra por `tenant_id`).
- **UI:** usa `UI.modal`, `UI.toast`, `UI.error`, `UI.loading`, `UI.confirmar`,
  `UI.q` (moneda Q) y las clases de `css/` — evita estilos inline nuevos.
- **Carga:** registra el `<script>` en `index.html` y en el precache de `sw.js`
  (sube `CACHE_VERSION`).
