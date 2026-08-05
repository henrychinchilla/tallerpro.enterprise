-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 124
-- Auditoría de relaciones: índices que faltan y llaves foráneas no declaradas.
--
-- HALLAZGO A — 97 llaves foráneas sin índice, y entre ellas `tenant_id` en
-- decenas de tablas. tenant_id es la columna que TODA política RLS filtra: sin
-- índice, cada consulta de cada pantalla hace un recorrido secuencial de la
-- tabla completa. Con los datos de hoy no se nota; con un comercio real cargado
-- de órdenes y movimientos, se nota en todas partes a la vez.
-- Además, una FK sin índice obliga a escanear la tabla hija entera en CADA
-- borrado del padre (Postgres tiene que comprobar que no queden referencias).
--
-- HALLAZGO B — relaciones que existen en la práctica pero no están declaradas.
-- Se verificó que NO hay huérfanos hoy (0 en las 8 revisadas), así que se
-- declaran ahora, mientras están limpias, para que la base las sostenga sola.
--
-- Se dejan FUERA a propósito:
--   · actividad_log.usuario_id — tiene 10 huérfanos Y ESTÁ BIEN: la bitácora
--     debe sobrevivir al borrado del usuario. Ponerle FK obligaría a borrar el
--     rastro o a perder la autoría, que es justo lo que una auditoría no debe
--     permitir.
--   · entidad_id / referencia_id / registro_id — son polimórficas (apuntan a
--     tablas distintas según el tipo), no se pueden restringir con una FK.
--   · auth_user_id — vive en el esquema auth, que Supabase administra.
--   · mensajes.wa_message_id — no es un id nuestro: es el de WhatsApp.
--
-- Idempotente: los índices llevan IF NOT EXISTS y las FKs se agregan solo si
-- no existen.
-- ═══════════════════════════════════════════════════════════════

-- ── A. Un índice por cada llave foránea que no lo tenga ─────────────────
do $$
declare
  r record;
  nombre text;
begin
  for r in
    select tc.table_name as tabla, kcu.column_name as col
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.constraint_schema = tc.constraint_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and not exists (
        select 1 from pg_index i
        join pg_class c on c.oid = i.indrelid
        join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = tc.table_name
          and a.attname = kcu.column_name)
  loop
    -- Los nombres de índice topan en 63 caracteres; se recorta con el hash
    -- para que dos columnas largas de la misma tabla no colisionen.
    nombre := left('idx_' || r.tabla || '_' || r.col, 55) || '_' ||
              substr(md5(r.tabla || r.col), 1, 6);
    execute format('create index if not exists %I on public.%I (%I)',
                   nombre, r.tabla, r.col);
  end loop;
end $$;

-- ── B. Relaciones reales que faltaba declarar ───────────────────────────
-- ON DELETE: se elige por lo que significa el dato, no por comodidad.
--   · el detalle de un documento muere con su documento      → CASCADE
--   · un movimiento que apunta a algo borrado queda sin ese dato, no se borra
--     (perderíamos historia contable)                        → SET NULL
do $$
begin
  if not exists (select 1 from pg_constraint where conname='fk_compra_items_inventario') then
    alter table public.compra_items
      add constraint fk_compra_items_inventario
      foreign key (inventario_id) references public.inventario(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname='fk_traslado_items_inventario') then
    alter table public.traslado_items
      add constraint fk_traslado_items_inventario
      foreign key (inventario_id) references public.inventario(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname='fk_compras_egreso') then
    alter table public.compras
      add constraint fk_compras_egreso
      foreign key (egreso_id) references public.egresos(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname='fk_envios_cliente') then
    alter table public.envios
      add constraint fk_envios_cliente
      foreign key (cliente_id) references public.clientes(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname='fk_puntos_movimientos_factura') then
    alter table public.puntos_movimientos
      add constraint fk_puntos_movimientos_factura
      foreign key (factura_id) references public.facturas(id) on delete set null;
  end if;

  -- Los permisos de un usuario borrado no tienen a quién aplicar: se van con él.
  if not exists (select 1 from pg_constraint where conname='fk_usuario_permisos_usuario') then
    alter table public.usuario_permisos
      add constraint fk_usuario_permisos_usuario
      foreign key (usuario_id) references public.usuarios(id) on delete cascade;
  end if;
end $$;

-- Índices para las FKs recién creadas (el bloque A ya corrió).
create index if not exists idx_compra_items_inventario_id   on public.compra_items(inventario_id);
create index if not exists idx_traslado_items_inventario_id on public.traslado_items(inventario_id);
create index if not exists idx_compras_egreso_id            on public.compras(egreso_id);
create index if not exists idx_envios_cliente_id            on public.envios(cliente_id);
create index if not exists idx_puntos_mov_factura_id        on public.puntos_movimientos(factura_id);
create index if not exists idx_usuario_permisos_usuario_id  on public.usuario_permisos(usuario_id);

analyze;
