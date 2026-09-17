-- El catálogo OEM no podía guardar un reset.
--
-- La app ofrece 12 tipos de definición (js/modulos/operacion/diagnostico_oem.js,
-- const TIPOS) y el CHECK de la tabla solo aceptaba 9: faltaban justamente
-- 'reset', 'immo_diagnostico' e 'immo_programacion'. El desplegable ofrecía
-- "reset", la validación del navegador lo daba por bueno y Postgres lo rechazaba
-- con 23514. Nadie pudo guardar nunca un reset — ni el botón "Cargar borradores",
-- que intenta insertar un reset de mantenimiento por cada vehículo del plan.
--
-- Es el MISMO patrón de la migración 136 (las unidades de inventario congeladas
-- en un CHECK): un catálogo de negocio no se congela en una restricción que vive
-- en otro archivo que nadie mira. Acá el CHECK sí se mantiene —es una escalera
-- de seguridad, no una lista de conveniencia— pero se sincroniza con la app y se
-- deja dicho de dónde sale.

alter table public.obd_oem_definiciones drop constraint if exists obd_oem_definiciones_tipo_check;
alter table public.obd_oem_definiciones add constraint obd_oem_definiciones_tipo_check
  check (tipo in ('did','reset','immo_diagnostico','immo_programacion','prueba_activa',
                  'calibracion','regeneracion_dpf','purga_abs','codificacion','reflash',
                  'security_access','procedimiento'));

comment on column public.obd_oem_definiciones.tipo is
  'Espeja const TIPOS de js/modulos/operacion/diagnostico_oem.js. Al agregar un tipo en la app hay que agregarlo también acá, o el guardado revienta con 23514.';

-- El índice único es (tenant, marca, modelo, ecu, tipo, identificador, version_fuente).
-- Dos resets del MISMO módulo —borrar códigos y reiniciar, por ejemplo— van los
-- dos con tipo 'reset' y, sin identificador, chocarían entre sí: el segundo no se
-- podría guardar. Por eso un reset lleva su objetivo como identificador. Queda
-- escrito acá porque la restricción vive en la base, no en la app.
comment on column public.obd_oem_definiciones.identificador is
  'DID de 4 hex para tipo did; para reset e immo_*, el objetivo (dtc_modulo, ecu_reinicio, identificacion...). Forma parte del índice único: sin él, dos resets del mismo módulo colisionan.';
