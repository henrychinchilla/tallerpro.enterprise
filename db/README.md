# Base de datos — Seguridad y migraciones

## ✅ Estado (2026-06-07)

- **Migración 001 (RLS por tenant) — APLICADA** en producción
  (`20260607191106_rls_tenant_isolation_full_coverage`). Versión integral
  y dinámica: cubre las ~40 tablas reales, no solo las 23 de `schema_v3.sql`.
- **Migración 003 (hardening de funciones definer) — APLICADA**
  (`20260607191426_harden_security_definer_functions`).
- **Edge Function `crear-usuario` — DESPLEGADA** (v1, `verify_jwt=true`).
- Verificado: `anon` no lee ninguna tabla; un usuario de un tenant no ve
  datos de otro; el superadmin ve todo; alta de equipo y registro funcionan.
- ⏳ **Único paso manual pendiente:** desactivar *"Confirm email"* en
  Authentication → Providers → Email (necesario para el auto-registro).

## ⚠️ Por qué existe la migración 001

El `schema_v3.sql` original activaba RLS pero con políticas **abiertas**
(`USING (true)`), así que cualquiera con la `anon key` (que es pública,
está en `js/core/config.js`) podía leer/escribir/borrar **todos los datos
de todos los talleres**. Comprobado:

```bash
curl "https://oanguccrxleznozumpbi.supabase.co/rest/v1/clientes?select=id&limit=1" \
  -H "apikey: <ANON_KEY>"
# Antes: 200 + datos reales  ❌
# Después de 001: 0 filas / 401  ✅
```

La migración `001_rls_tenant_isolation.sql` reemplaza esas políticas por
**aislamiento estricto por tenant**.

---

## Orden de despliegue (importante)

### 1. Desactivar confirmación de email (si usas auto-registro)
Supabase → **Authentication → Providers → Email** → desactiva
*"Confirm email"*. El auto-registro hace `signUp()` y necesita que la
sesión quede activa de inmediato para llamar al RPC.

### 2. Desplegar la Edge Function `crear-usuario`  ✅ HECHO
La creación de usuarios del equipo pasa por una función con service role
(el admin nunca pierde su sesión). Ya está desplegada. Para redeploy:

```bash
npx supabase login
npx supabase link --project-ref oanguccrxleznozumpbi
npx supabase functions deploy crear-usuario
```
> `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_ANON_KEY` ya
> vienen inyectadas por Supabase en el entorno de la función.

### 3. Aplicar las migraciones SQL  ✅ HECHO
Aplicadas `001_rls_tenant_isolation.sql` y `003_harden_definer_functions.sql`.
Para reaplicar (idempotentes): Supabase → **SQL Editor → New Query** → pega
el contenido → **RUN**.

### 4. Publicar el frontend
`auth.js` ya está adaptado (registro vía RPC, usuarios vía Edge Function).
Despliega como siempre (`npm run deploy`).

---

## Verificación (hazla después de aplicar)

**A. Que anon ya NO puede leer datos:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://oanguccrxleznozumpbi.supabase.co/rest/v1/clientes?select=id&limit=1" \
  -H "apikey: <ANON_KEY>"
# Esperado: 401  (o 200 con []  →  0 filas)
```

**B. Que un usuario logueado SÍ ve solo su taller:** entra a la app,
revisa que clientes/órdenes/inventario cargan normal.

**C. Auto-registro:** crea un taller nuevo desde la pantalla de registro;
debe crear tenant + licencia + admin y entrar directo.

**D. Crear usuario:** como admin, crea un usuario del equipo; tu sesión
no debe cerrarse y el usuario nuevo debe aparecer en su tenant.

**E. Aislamiento cruzado (la prueba clave):** loguéate en el taller A e
intenta (vía consola del navegador) leer un id del taller B
(`getSB().from('clientes').select('*').eq('tenant_id','<otro-tenant>')`).
Debe devolver `[]`.

---

## Rollback de emergencia
Si algo se rompe en producción, corre
`db/migrations/001_rollback.sql` en el SQL Editor. ⚠️ Esto **reabre** el
acceso (vuelve al estado inseguro) — úsalo solo para destrabar y vuelve a
intentar la migración cuanto antes.

---

## Notas
- El superadmin (`henry.chinchilla@gmail.com`) tiene acceso completo a
  todos los tenants vía la función `is_superadmin()`.
- `schema_v3.sql` sigue sirviendo para crear la estructura desde cero,
  pero su bloque de políticas abiertas quedó **obsoleto**: en una
  instalación nueva, corre el schema y luego la migración 001.
