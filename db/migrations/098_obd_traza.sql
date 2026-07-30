-- 098_obd_traza.sql
-- La bitácora técnica del escaneo, guardada junto al escaneo.
--
-- El módulo OBD se valida contra vehículos reales, y cuando algo falla en el
-- taller lo que llega es "no funcionó". La bitácora (PR #22) captura el diálogo
-- crudo con el vehículo — comando y respuesta tal cual — para poder diagnosticar
-- sin tenerlo enfrente.
--
-- Pero vivía sólo en memoria: al cerrar el modal se perdía, y recuperarla
-- obligaba a volver a enchufar el vehículo, que es exactamente lo que vino a
-- evitar. Ahora viaja con el escaneo y el reporte guardado la puede copiar
-- semanas después.
--
--   traza  [{q, r}] pedido y respuesta, o {nota} para los resúmenes
--          (el barrido de 240 direcciones se resume en una línea)
--
-- Tope de 400 entradas puesto en el cliente: es una ayuda de diagnóstico, no un
-- registro de auditoría, y un jsonb sin techo por escaneo se paga en storage.

alter table public.diagnosticos_obd
  add column if not exists traza jsonb;

comment on column public.diagnosticos_obd.traza is
  'Bitacora tecnica: dialogo crudo con el vehiculo [{q,r}|{nota}], para diagnosticar un escaneo fallido sin el vehiculo enfrente';
