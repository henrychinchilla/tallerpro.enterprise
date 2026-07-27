-- 092_obd_monitores.sql
-- Modo 06 (resultados de los monitores a bordo): guarda por cada prueba el
-- valor medido junto a los límites del fabricante. Es la única fuente en
-- OBD-II genérico de los contadores de fallo de encendido por cilindro.
--
-- Forma: [{ mid, tid, uas, val, min, max, cilindro, ok }, ...]
-- Los valores quedan en la escala interna de la ECU a propósito: el byte UAS
-- (unidad y escala) no está verificado contra el hardware, y convertir de
-- memoria mostraría cifras falsas. El veredicto ok se calcula comparando
-- contra los límites, que vienen en la misma escala, así que es válido igual.

alter table public.diagnosticos_obd
  add column if not exists monitores jsonb;

comment on column public.diagnosticos_obd.monitores is
  'Modo 06: pruebas de monitores a bordo con valor medido y límites del fabricante (escala interna de la ECU)';
