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

## 6. LA APP MÓVIL ES NATIVA. SIN EXCEPCIONES (innegociable)
Henry lo pidió el 2026-09-16, después de dos arquitecturas fallidas:
**se acabaron las apps que no son nativas.** Nada de TWA, nada de cascarón WebView,
nada de "envolver el sitio". Si el entregable es una app de Android, es **Flutter
nativo** (`app_flutter/`, SDK en `D:\flutter`).

- **NO proponer** una TWA ni una WebView como atajo, ni "por ahora", ni "para salir
  rápido". Ese atajo ya se tomó dos veces y las dos veces terminó igual: el Bluetooth
  no alcanzaba los dongles (una TWA renderiza con Chrome = solo BLE), y cuando se
  cambió a WebView + puente Java se rompió el login con Google, porque Google rechaza
  OAuth dentro de una WebView (`disallowed_useragent`).
- **No decirle "nativa" a algo que no lo es.** La 4.96.0 se anunció como "app NATIVA"
  siendo un cascarón WebView. Es exactamente lo que lo hizo perder la confianza.
  Cascarón nativo + UI web = **híbrida**, y así hay que llamarla.
- Lo que SÍ se conserva: **Supabase entero** (auth, RLS, datos, Edge Functions) y la
  lógica de protocolo OBD ya depurada en Java (`PuenteBluetooth.java`), que se reusa
  desde Flutter por *platform channel* — Flutter no trae Bluetooth clásico/SPP.
- El sitio web sigue existiendo para escritorio. Lo que se termina es **envolverlo y
  llamarlo app**.

## 7. Datos / integridad
- Importaciones idempotentes (upsert con `onConflict`), nunca crear duplicados.
- Excluir del CDN archivos sensibles vía `.assetsignore` (*.pdf, *.xls, *.xlsx).
  OJO: `wrangler deploy` **ignora** `.cfignore` — ese archivo no excluye nada.

---
Memoria extendida del proyecto: `C:\Users\henry\.claude\projects\D--tallerpro-enterprise\memory\MEMORY.md`
