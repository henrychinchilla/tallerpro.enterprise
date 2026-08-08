-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 133
-- El cliente declara su giro (mismo patrón que el inventario, mig 108)
--
-- EL PROBLEMA: el expediente de armería (DPI completo, vecindad, licencia,
-- tenencias, documentos) ya se había separado de pantalla en su propio módulo,
-- pero seguía viviendo revuelto en la MISMA lista: el alta de clientes de
-- cualquier vertical mostraba a los compradores de armas, y la armería tenía
-- que buscar a su comprador entre los clientes del taller. Henry lo revisó y
-- pidió separarlos: "no es conveniente confundirlo".
--
-- POR QUÉ NO UNA TABLA APARTE: exactamente por lo mismo que el inventario no
-- se partió (mig 108). Órdenes, facturación, cotizaciones, citas, marketing y
-- el POS apuntan todos a `clientes.id`; partir la tabla obliga a partir esas
-- seis cosas. En vez de eso el cliente DECLARA SU GIRO y cada módulo filtra lo
-- suyo — el POS sigue teniendo una sola fuente y puede facturarle a cualquiera.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. La columna ──────────────────────────────────────────────
-- Nullable a propósito: NULL = cliente común, que es como se comportaba todo
-- hasta hoy. No se pone NOT NULL DEFAULT 'general' para no reescribir la tabla
-- entera ni obligar a los módulos viejos a mandar el campo.
alter table public.clientes
  add column if not exists giro text;

comment on column public.clientes.giro is
  'Giro dueño de este cliente (armeria, ...). NULL = cliente común, visible en el alta general. Mismo patrón que inventario.tipo_item.';

create index if not exists idx_clientes_giro on public.clientes(tenant_id, giro);

-- ── 2. Clasificar lo que ya existe ─────────────────────────────
-- Si un cliente trae licencia de armas, DPI de expediente o tenencias
-- registradas, es de la armería: esos campos sólo los llena esa pantalla
-- (js/modulos/especializados/clientes-armeria.js). El resto se queda en NULL
-- y sigue siendo un cliente común — inventarle un giro a un cliente ajeno
-- sería peor que dejarlo sin clasificar.
update public.clientes c
   set giro = 'armeria'
 where c.giro is null
   and (c.licencia_num is not null
        or c.licencia_tipo is not null
        or c.dpi is not null
        or exists (select 1 from public.cliente_tenencias t where t.cliente_id = c.id));
