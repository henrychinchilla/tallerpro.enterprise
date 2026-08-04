-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 110
-- Armería: guardar el DPI del comprador/vendedor (lo exige SIDIGECAM
-- junto con la licencia) y dejar la columna que soporta el control de
-- venta de munición por mes.
--
-- Límite legal de venta de munición (Ley de Armas y Municiones, según
-- reportaje de Prensa Libre "Mercado legal facilita tráfico de
-- municiones" — la ley no cita el número de artículo en esa nota;
-- confirmar directo con DIGECAM antes de tratarlo como definitivo):
--   - 200 cartuchos al mes para quien tiene tarjeta de TENENCIA
--   - 250 cartuchos al mes para quien tiene licencia de PORTACIÓN
--   - Venta libre dentro de un polígono de tiro, para uso ahí mismo
--     (ese caso no pasa por este módulo).
-- Cada armería debe llevar "un libro que registra cuántos cartuchos y
-- a quién se vendieron" — es lo que imprimirLibro() ya hace, ahora con
-- el DPI como identificador real de la persona (el nombre no alcanza:
-- dos clientes pueden compartir nombre, el DPI no).
--
-- El límite se aplica en la aplicación (armeria.js, antes de guardar),
-- no con un trigger: es una política de negocio que agrega el total ya
-- vendido en el mes, no una regla de una sola fila. Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.armeria_operaciones add column if not exists contraparte_dpi text;

-- El DPI es, junto a la licencia, el dato que SIDIGECAM pide del
-- comprador en toda venta de arma o munición (no en accesorios).
alter table public.armeria_operaciones drop constraint if exists armeria_licencia_si_venta_arma_o_municion;
alter table public.armeria_operaciones add constraint armeria_licencia_si_venta_arma_o_municion check (
  tipo <> 'venta' or categoria = 'accesorio' or (
    coalesce(contraparte_licencia_num, '') <> '' and coalesce(contraparte_dpi, '') <> ''
  )
);

-- Búsqueda rápida de "cuánta munición se le ha vendido a este DPI este mes".
create index if not exists idx_armeria_dpi_municion on public.armeria_operaciones(tenant_id, contraparte_dpi, categoria, fecha)
  where categoria = 'munición';
