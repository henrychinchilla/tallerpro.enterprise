-- ═══════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 149
-- Movimiento de stock ATÓMICO (ventas, garantías, armería)
-- ═══════════════════════════════════════════════════════
-- descontarInventarioVenta y moverStockArmeria leían el stock, restaban en
-- el navegador y escribían el resultado: dos ventas a la vez se pisaban, y
-- con Math.max(0, …) vender más de lo que había dejaba 0 en silencio.
--
-- Aquí: UPDATE … WHERE stock >= cantidad RETURNING, por ítem, todo en UNA
-- transacción. Si a un ítem no le alcanza, se aborta TODO (nada se
-- descuenta) con un mensaje que dice cuál y cuánto hay. El movimiento del
-- historial va en la misma transacción.
--
-- SECURITY INVOKER: la RLS de inventario/inventario_movimientos sigue
-- decidiendo qué comercio puede tocar qué fila.

CREATE OR REPLACE FUNCTION public.mover_stock(
  p_items      jsonb,           -- [{ "inventario_id": uuid, "cantidad": n }, …]
  p_tipo       text,            -- 'salida' | 'entrada'
  p_referencia text DEFAULT NULL,
  p_notas      text DEFAULT NULL
) RETURNS integer
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  it      jsonb;
  inv_id  uuid;
  cant    numeric;
  fila    record;
  quien   text;
  n       integer := 0;
  hoy     date := (now() AT TIME ZONE 'America/Guatemala')::date;
BEGIN
  IF p_tipo NOT IN ('salida','entrada') THEN RAISE EXCEPTION 'Tipo de movimiento inválido: %', p_tipo; END IF;
  SELECT coalesce(nombre, email) INTO quien FROM public.usuarios WHERE id = auth.uid();

  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) LOOP
    inv_id := nullif(it->>'inventario_id','')::uuid;
    cant   := coalesce((it->>'cantidad')::numeric, 0);
    CONTINUE WHEN inv_id IS NULL OR cant <= 0;

    -- Igual que antes: lo que no es un artículo de inventario visible (o es
    -- un servicio, que no lleva existencias) no mueve stock ni bloquea.
    PERFORM 1 FROM public.inventario
     WHERE id = inv_id AND lower(coalesce(unidad_medida,'')) <> 'servicio';
    CONTINUE WHEN NOT FOUND;

    IF p_tipo = 'salida' THEN
      UPDATE public.inventario
         SET stock = coalesce(stock,0) - cant, updated_at = now()
       WHERE id = inv_id AND coalesce(stock,0) >= cant
      RETURNING id, tenant_id, nombre, stock INTO fila;
      IF NOT FOUND THEN
        SELECT nombre, coalesce(stock,0) AS stock INTO fila FROM public.inventario WHERE id = inv_id;
        RAISE EXCEPTION 'Stock insuficiente de "%": hay %, se piden %', fila.nombre, fila.stock, cant
          USING errcode = 'P0001';
      END IF;
    ELSE
      UPDATE public.inventario
         SET stock = coalesce(stock,0) + cant, updated_at = now()
       WHERE id = inv_id
      RETURNING id, tenant_id, nombre, stock INTO fila;
    END IF;

    INSERT INTO public.inventario_movimientos
      (tenant_id, inventario_id, tipo, cantidad, referencia, notas, fecha, usuario_id, usuario_nombre)
    VALUES (fila.tenant_id, inv_id, p_tipo, cant, p_referencia, p_notas, hoy, auth.uid(), quien);
    n := n + 1;
  END LOOP;
  RETURN n;
END $function$;

REVOKE ALL ON FUNCTION public.mover_stock(jsonb,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mover_stock(jsonb,text,text,text) TO authenticated;
