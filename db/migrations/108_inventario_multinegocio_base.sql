-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 108
-- FASE 1 de multi-negocio: cimiento del inventario por giro
--
-- EL PROBLEMA: la app nació para taller mecánico y el inventario quedó con su
-- forma. `inventario` tiene compat_marca / compat_modelo / compat_anio_ini /
-- compat_anio_fin / compat_motor / num_parte_oem / estado_articulo, que a una
-- venta de granos no le dicen nada — y peor: `stock` es INTEGER, así que hoy
-- es imposible tener 12.5 quintales de maíz o 3.75 kg de refrigerante. El
-- número se trunca en silencio, que es la peor forma de perder inventario.
--
-- POR QUÉ NO UNA TABLA POR MÓDULO: es tentador, pero compras, bodegas,
-- movimientos, facturación y el POS apuntan todos a `inventario.id`. Partir la
-- tabla obliga a partir esas cinco cosas y a que el POS consulte N catálogos
-- — justo el desastre que hay que evitar cuando un cliente tiene granos Y
-- electrónica. En vez de eso, el artículo declara SU GIRO y sus campos propios
-- viven en un jsonb: cada módulo filtra lo suyo, el POS sigue teniendo una
-- sola fuente, y agregar un giro mañana no toca la base.
--
-- ESTA MIGRACIÓN NO CAMBIA NINGUNA PANTALLA. Sólo agranda los tipos y agrega
-- columnas con valor por defecto, para que la app siga funcionando igual
-- mientras se construyen las fases siguientes.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Cantidades con decimales ────────────────────────────────
-- integer → numeric conserva todo lo que ya existe (no hay redondeo posible
-- hacia abajo), así que es seguro sobre datos en producción.
alter table public.inventario
  alter column stock     type numeric(14,3) using stock::numeric,
  alter column min_stock type numeric(14,3) using min_stock::numeric,
  alter column max_stock type numeric(14,3) using max_stock::numeric;

-- Una compra de 12.5 quintales entraba truncada a 12.
-- `subtotal` es una columna GENERADA a partir de cantidad, y Postgres no deja
-- cambiarle el tipo a una columna de la que depende una generada. Se quita, se
-- amplía y se repone con la misma fórmula — el valor se recalcula solo, no se
-- pierde nada porque nunca estuvo almacenado como dato propio.
alter table public.entradas_detalle drop column if exists subtotal;

alter table public.entradas_detalle
  alter column cantidad type numeric(14,3) using cantidad::numeric;

alter table public.entradas_detalle
  add column subtotal numeric generated always as (cantidad * precio_costo) stored;

-- ── 2. El artículo declara su giro ─────────────────────────────
-- 'general' a propósito como valor por defecto: lo que ya existe sigue
-- comportándose igual hasta que alguien lo clasifique.
alter table public.inventario
  add column if not exists tipo_item text not null default 'general',
  add column if not exists atributos jsonb not null default '{}'::jsonb;

comment on column public.inventario.tipo_item is
  'Giro del artículo (mecanico, granos, refrigeracion, electronica, herreria, peleteria, ferreteria, agroservicio, general). Decide qué campos y unidades muestra la app.';
comment on column public.inventario.atributos is
  'Campos propios del giro. Van en jsonb y no en columnas para no agregarle 6 columnas muertas a la tabla cada vez que se suma un giro.';

create index if not exists idx_inventario_tipo on public.inventario(tenant_id, tipo_item);

-- ── 3. Clasificar lo que ya existe ─────────────────────────────
-- Si un artículo trae datos de compatibilidad vehicular o número de parte OEM,
-- es de taller: no hay otra forma de que esos campos estén llenos. El resto se
-- queda en 'general' y lo clasifica el usuario — inventarle un giro a un
-- artículo ajeno sería peor que dejarlo sin clasificar.
update public.inventario
   set tipo_item = 'mecanico'
 where tipo_item = 'general'
   and (num_parte_oem is not null
        or compat_marca is not null or compat_modelo is not null
        or compat_motor is not null or compat_anio_ini is not null);

-- ── 4. Proveedores también tienen giro ─────────────────────────
-- Un proveedor de granos no surte compresores. Nullable: los que ya existen
-- siguen sirviendo para todo hasta que se les asigne uno.
alter table public.proveedores
  add column if not exists giro text;

comment on column public.proveedores.giro is
  'Giro que surte este proveedor. NULL = sirve para cualquiera (comportamiento previo).';

create index if not exists idx_proveedores_giro on public.proveedores(tenant_id, giro);
