-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 117
-- Armería: código de autorización de venta de munición (art. 21 del
-- Reglamento, Acuerdo Gubernativo 85-2011).
--
-- HALLAZGO AL LEER EL REGLAMENTO — el módulo tenía un hueco peligroso:
--
-- El art. 21 del reglamento dice que, ANTES DE CADA VENTA de munición, el
-- establecimiento debe "verificar en el sistema en línea con DIGECAM que la
-- persona no haya excedido del límite de munición que se pueda adquirir
-- mensualmente" y "obtener un código de autorización de venta en la
-- DIGECAM, por vía informática o telefónica, el cual debe anotarse en la
-- factura de venta".
--
-- Es decir: el tope mensual NO se verifica contra los registros del propio
-- negocio, sino contra el sistema de DIGECAM — porque el comprador pudo
-- haber comprado munición en OTRA armería el mismo mes. El conteo local que
-- hace la app (DB.getConsumoMunicionMes) sólo ve las ventas de ESTE
-- comercio, así que puede decir "le quedan 150" cuando en realidad el
-- cliente ya agotó su cupo en otro lado. Confiar en ese número llevaría a
-- exceder el límite legal creyendo estar cumpliendo.
--
-- La app no puede consultar el sistema de DIGECAM (no hay API pública), así
-- que lo correcto es: seguir mostrando el conteo local COMO REFERENCIA
-- PARCIAL, dejar claro que no sustituye la consulta en línea, y exigir el
-- código de autorización que DIGECAM devuelve — que es la prueba de que la
-- verificación sí se hizo.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.armeria_operaciones
  add column if not exists codigo_autorizacion_digecam text;

comment on column public.armeria_operaciones.codigo_autorizacion_digecam is
  'Código de autorización de venta de munición que extiende DIGECAM por vía informática o telefónica (art. 21 del Acuerdo Gubernativo 85-2011). Debe anotarse en la factura de venta.';

-- Índice para auditar rápido qué ventas de munición quedaron sin código.
create index if not exists idx_armeria_sin_codigo
  on public.armeria_operaciones(tenant_id, fecha)
  where categoria = 'munición' and tipo = 'venta' and codigo_autorizacion_digecam is null;
