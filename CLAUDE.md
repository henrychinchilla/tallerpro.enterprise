# NexusPro Enterprise — Reglas permanentes

> Este archivo se carga automáticamente en CADA sesión. Son reglas que NO hay que volver a pedir.
> Si Henry dice "ya te lo había dicho", revisar aquí y agregarlo si falta.

## 1. CRUD SIEMPRE COMPLETO (innegociable)
Cada módulo y cada tabla debe tener las 4 operaciones: **Crear, Ver, Editar, Eliminar**.
No basta "Nueva" + "Ver". Antes de dar por terminado cualquier módulo, verificar que existan
Editar y Eliminar. Es lo que más se olvida y lo que más molesta a Henry.

## 2. Convención de botones de acción
Usar SIEMPRE los helpers estandarizados (definidos en `js/core/app.js`):
- `Modulos.btnAccion('ver'|'editar'|'imprimir'|'eliminar', onclick, opts)`
- `Modulos.eliminarRegistro(tabla, id, nombre, callback)` o un eliminar dedicado si hay efectos
  colaterales (ej. revertir inventario/egreso).
- Nunca usar una ✕ suelta ni "Editar" sin ícono.

## 3. Listas con datos por fecha
Mostrar por defecto el **mes activo** y dejar los meses/años anteriores como **historial on-demand**
(selector de mes/año). Igual que Contabilidad y Compras.

## 4. Flujo de despliegue (auto, sin pedir confirmación)
Al terminar cambios OK: commit + push a `main` y `npm run deploy`, automáticamente.
- Trabajar en el worktree, mergear a `main`, push, deploy.
- Deploy: `git pull origin main && npm run deploy` (Cloudflare Workers).
- URL producción: `https://nexuspro.cmtelecommgt.com`
- **SIEMPRE subir `CACHE_VERSION` en `sw.js` cuando se cambian JS/CSS/HTML.** Si no,
  el Service Worker sirve código viejo y "no se ven los cambios". El index ya tiene
  auto-recarga al detectar SW nuevo, pero depende de que `CACHE_VERSION` cambie.

## 5. Migraciones de BD
- Archivos en `db/migrations/NNN_*.sql` con número correlativo. Siempre guardar el `.sql`
  en el repo aunque se aplique por otra vía.
- **Aplicarlas con el CLI, que ya está autenticado en esta máquina** (no hace falta pedirle
  nada a Henry):
  ```
  npx supabase link --project-ref oanguccrxleznozumpbi --yes
  npx supabase db query --linked -f db/migrations/NNN_x.sql
  ```
  `db query --linked` va por la Management API: no pide la contraseña de la BD y no toca
  el historial de migraciones (nada de `db push`, que intentaría reaplicar las 99 viejas).
- El MCP de Supabase pide OAuth por navegador y su enlace ha devuelto
  "Unrecognized client_id" (2026-07-31): no es el camino, usar el CLI.
- Verificar SIEMPRE contra la BD después de aplicar (`information_schema`, `pg_trigger`),
  y si la migración trae reglas de seguridad, probarlas con un `do $$ ... $$` que termine
  en `raise exception` para que la transacción se aborte y no escriba nada.

## 6. Datos / integridad
- Importaciones idempotentes (upsert con `onConflict`), nunca crear duplicados.
- Excluir del CDN archivos sensibles vía `.assetsignore` (*.pdf, *.xls, *.xlsx).
  OJO: `wrangler deploy` **ignora** `.cfignore` — ese archivo no excluye nada.

---
Memoria extendida del proyecto: `C:\Users\henry\.claude\projects\D--tallerpro-enterprise\memory\MEMORY.md`
