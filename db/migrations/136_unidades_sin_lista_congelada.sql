-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 136
-- La base rechazaba las unidades que la app ofrece
--
-- LO ENCONTRADO (con el navegador, no leyendo código): `inventario` tenía
--   CHECK (unidad_medida IN ('pieza','litro','juego','metro','kilogramo','caja','par','kit'))
-- una lista de cuando la app era sólo para talleres mecánicos. Mientras tanto
-- js/core/giros.js ofrece quintal, libra, arroba, saco, galón, onza, gramo,
-- yarda, pie, pulgada, cilindro, lámina, tonelada... y hasta 'unidad', que
-- tampoco estaba. Ni siquiera 'kg' pasaba: la lista dice 'kilogramo'.
--
-- Resultado: el dropdown ofrecía la unidad, el usuario guardaba, y Postgres
-- respondía 23514. Los 22 artículos que existen usan sólo juego/kit/litro/pieza
-- — o sea que NADIE pudo cargar nunca un quintal de maíz ni una libra de gas.
-- Lo mismo con estado_articulo: la app ofrece 'remanufacturado' y la lista de
-- la base sólo tiene nuevo/reconstruido/usado/defectuoso.
--
-- POR QUÉ SE QUITAN Y NO SE AMPLÍAN: el catálogo de unidades es de NEGOCIO y
-- cambia con cada giro nuevo (un agroservicio suma quintales, una peletería
-- yardas, una gasolinera galones). Congelarlo en un CHECK obliga a una
-- migración por cada giro y garantiza que se vuelva a desincronizar — que es
-- exactamente lo que pasó. La lista vive en js/core/giros.js, que es de donde
-- se pinta el desplegable, y hay una prueba (test/unidades-guatemala.js) que
-- verifica que ningún giro ofrezca una unidad fuera de ese catálogo.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.inventario
  drop constraint if exists inventario_unidad_medida_check;

alter table public.inventario
  drop constraint if exists inventario_estado_articulo_check;

comment on column public.inventario.unidad_medida is
  'Unidad de venta. El catálogo válido vive en js/core/giros.js (UNIDADES_GT) y depende del giro: NO se congela acá con un CHECK, porque cada giro nuevo lo ampliaría y la base terminaba rechazando lo que la app ofrecía.';

-- Lo que sí se cuida: que no entre vacío. Un artículo sin unidad no se puede
-- ni vender ni contar, y eso no depende del giro.
alter table public.inventario
  drop constraint if exists inventario_unidad_no_vacia;
alter table public.inventario
  add constraint inventario_unidad_no_vacia
  check (unidad_medida is null or length(btrim(unidad_medida)) > 0);
