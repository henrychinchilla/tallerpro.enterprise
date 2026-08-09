-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 137
-- NADIE PODÍA CERRAR UNA VENTA: faltaba un GRANT EXECUTE
--
-- Encontrado con la prueba de venta completa (Playwright): al cobrar en el POS,
-- PostgREST devolvía 403 en /rest/v1/facturas. La política RLS de `facturas`
-- estaba perfecta y los GRANT de tabla también. El error real, reproducido
-- como el propio usuario, era:
--     42501 permission denied for function contiene_posible_pan
--
-- POR QUÉ. `contiene_posible_pan(text)` es el guardia anti-tarjetas (impide
-- guardar un número de tarjeta en texto). La llaman TRES funciones de trigger:
--     validar_sin_pan_factura   → facturas
--     validar_sin_pan_tarjeta   → datos de tarjeta
--     validar_voucher_pago      → vouchers
-- Ninguna de las tres es SECURITY DEFINER, así que al llamarla mandan los
-- permisos de quien hace el INSERT. Y `authenticated` no tenía EXECUTE sobre
-- ella (se lo llevó puesto el endurecimiento de la migración 123, que revocó
-- EXECUTE sobre las funciones de public).
--
-- Resultado: **el camino del dinero entero estaba muerto** — no se podía
-- facturar una venta del POS, ni guardar un voucher, ni registrar un pago con
-- tarjeta. Y fallaba con un 403 mudo, que se ve igual que un problema de
-- permisos del usuario.
--
-- LO QUE SE HACE: darle EXECUTE a authenticated. Es una función de lectura pura
-- (mira un texto con una expresión regular y devuelve true/false); no toca
-- tablas ni datos de nadie, así que ejecutarla no habilita nada. Se prefiere
-- esto antes que volver SECURITY DEFINER a los tres triggers: elevar
-- privilegios para arreglar un permiso es cambiar un problema chico por uno
-- grande.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

grant execute on function public.contiene_posible_pan(text) to authenticated;

-- A anon NO: nadie sin sesión tiene por qué escribir facturas.
revoke execute on function public.contiene_posible_pan(text) from anon;

comment on function public.contiene_posible_pan(text) is
  'Guardia anti-PAN: true si el texto parece un número de tarjeta. La llaman tres triggers (facturas, tarjeta, voucher) que NO son SECURITY DEFINER, así que authenticated necesita EXECUTE o toda venta muere con 42501/403.';
