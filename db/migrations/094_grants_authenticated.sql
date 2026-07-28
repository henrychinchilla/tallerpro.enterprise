-- 094_grants_authenticated.sql
-- Seis tablas se crearon otorgando permisos a `anon` y NO a `authenticated`,
-- exactamente al revés que el resto del esquema (comparar con ordenes o
-- vehiculos). PostgREST usa el rol `authenticated` para un usuario con sesión,
-- así que toda escritura y lectura moría con "permission denied for table".
--
-- Síntoma observado: el módulo de Diagnóstico OBD-II nunca pudo guardar un
-- escaneo y el listado salía vacío ("sin escaneos") porque el SELECT también
-- fallaba y el error se descartaba en silencio.
--
-- Se otorgan sólo los cuatro privilegios que la app necesita. A propósito NO se
-- incluye TRUNCATE: no está sujeto a RLS, así que dárselo a `authenticated`
-- permitiría a cualquier usuario con sesión vaciar la tabla entera.
--
-- Los permisos de `anon` se dejan como están: las filas siguen protegidas por
-- RLS (current_tenant_id() es null sin sesión, así que no calza ninguna), y
-- revocarlos acá podría romper el alta de comercios, que ocurre sin sesión.
-- Queda anotado como limpieza aparte, para hacerla mirando ese flujo.

grant select, insert, update, delete on public.diagnosticos_obd     to authenticated;
grant select, insert, update, delete on public.dtc_catalogo         to authenticated;
grant select, insert, update, delete on public.bitacora_comentarios to authenticated;
grant select, insert, update, delete on public.bitacora_ejecuciones to authenticated;
grant select, insert, update, delete on public.bitacora_soluciones  to authenticated;
grant select, insert, update, delete on public.solicitudes_comercio to authenticated;
