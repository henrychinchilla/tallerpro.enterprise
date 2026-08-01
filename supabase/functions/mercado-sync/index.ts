// ═══════════════════════════════════════════════════════
// Edge Function: mercado-sync
// Precio de MENUDEO del mercado guatemalteco, para ponerlo al lado del
// mayorista del MAGA y ver el margen real.
//
// De dónde sale: varias cadenas guatemaltecas corren su tienda en línea sobre
// VTEX, que expone un endpoint PÚBLICO y sin autenticación — el mismo que usa
// su propio sitio para pintar el catálogo:
//   GET /api/catalog_system/pub/products/search?ft=<termino>
// No se raspa HTML ni se rodea ningún login. Se pide UNA vez al día y sólo un
// puñado de términos: es una carga menor que la de un cliente navegando.
//
// Lo que NO hace, a propósito: recorrer catálogos completos ni pedir en
// paralelo. Si algún día una cadena pide no ser consultada, se quita de FUENTES
// y listo.
//
// Quién puede llamarla (verify_jwt=false, auth propia — igual que maga-sync):
//   • pg_cron diario → header x-cron-secret (Vault)
//   • admin desde la app → su JWT
//
// Body opcional:
//   { terminos: ["frijol negro", ...] }   sobreescribe la lista
//   { por_termino: 8 }                    cuántos productos guardar por término
//
// Deploy: supabase functions deploy mercado-sync --no-verify-jwt
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPERADMIN_EMAIL = "henry.chinchilla@gmail.com";

/* Cadenas guatemaltecas con tienda VTEX. El nombre es el que se guarda como
   `fuente`, para que en pantalla se sepa de dónde salió cada precio. */
const FUENTES = [
  { fuente: "walmart.com.gt", base: "https://www.walmart.com.gt" },
  { fuente: "latorre.com.gt", base: "https://www.latorre.com.gt" },
];

/* Granos y básicos que mueve el agroservicio y la venta de granos. Se eligen
   términos que existan también en el catálogo del MAGA, porque la gracia es
   comparar las dos puntas. */
const TERMINOS = [
  /* Básicos que también cotiza el MAGA: sirven para el margen mayoreo/menudeo */
  "frijol negro", "maiz blanco", "arroz", "azucar", "aceite",
  "harina de maiz", "avena", "soya", "sal", "huevos",
  /* Insumos de las fórmulas de alimento. El supermercado NO vende melaza ni
     premezcla en presentación de finca, así que muchos de estos van a volver
     vacíos o con empaque de cocina — por eso el precio que salga de acá se
     marca TENTATIVO en pantalla y se puede corregir a mano. */
  "melaza", "salvado de trigo", "afrecho", "harina de soya", "harina de pescado",
  "carbonato de calcio", "sal comun",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function autorizada(req: Request, admin: any, url: string, anonKey: string): Promise<boolean> {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data } = await admin.rpc("get_cron_secret");
    if (data && cronSecret === data) return true;
  }
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await asCaller.auth.getUser();
  if (!u?.user) return false;
  if (u.user.email === SUPERADMIN_EMAIL) return true;
  const { data: perfil } = await admin.from("usuarios").select("rol").eq("id", u.user.id).maybeSingle();
  return ["admin", "superadmin"].includes(perfil?.rol);
}

/* El peso viene DENTRO del nombre ("Frijol Negro La Campana - 2000 g"), que es
   lo único que permite comparar contra el quintal del MAGA. Se aceptan sólo
   unidades de masa: un "1 L" de aceite no se convierte a kg alegremente, y un
   "x12" no es peso. Devuelve gramos, o null si no se puede saber. */
export function gramosDesdeNombre(nombre: string): number | null {
  const m = String(nombre).match(/(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|kilogramos?|grs?|gramos?|g|lbs?|libras?|oz|onzas?)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  if (!isFinite(n) || n <= 0) return null;
  const u = m[2].toLowerCase();
  if (/^(kg|kgs|kilo|kilos|kilogramo|kilogramos)$/.test(u)) return n * 1000;
  if (/^(lb|lbs|libra|libras)$/.test(u)) return n * 453.592;
  if (/^(oz|onza|onzas)$/.test(u)) return n * 28.3495;
  return n;                                        // g / gr / grs / gramos
}

async function buscar(base: string, termino: string, cuantos: number) {
  const url = `${base}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termino)}&_from=0&_to=${cuantos - 1}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  /* VTEX contesta 206 (contenido parcial) cuando se pide un rango: es normal
     y NO es error. */
  if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`);
  const arr = await r.json();
  return Array.isArray(arr) ? arr : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (!(await autorizada(req, admin, url, anonKey))) return json({ error: "No autorizado" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const terminos: string[] = Array.isArray(body.terminos) && body.terminos.length ? body.terminos : TERMINOS;
    const porTermino = Math.max(1, Math.min(Number(body.por_termino) || 8, 20));
    const hoy = new Date().toISOString().slice(0, 10);

    const filas: any[] = [];
    const problemas: any[] = [];

    for (const f of FUENTES) {
      for (const termino of terminos) {
        try {
          const prods = await buscar(f.base, termino, porTermino);
          for (const p of prods) {
            const it = (p.items || [])[0] || {};
            const oferta = ((it.sellers || [])[0] || {}).commertialOffer || {};
            const precio = Number(oferta.Price);
            /* Sin precio o sin existencias no sirve como referencia de compra. */
            if (!isFinite(precio) || precio <= 0) continue;
            if (Number(oferta.AvailableQuantity) <= 0) continue;
            const nombre = String(p.productName || "").trim();
            if (!nombre) continue;
            const gramos = gramosDesdeNombre(nombre);
            filas.push({
              fuente: f.fuente, termino, nombre,
              marca: p.brand || null,
              precio: +precio.toFixed(2),
              gramos: gramos ? +gramos.toFixed(2) : null,
              precio_kg: gramos ? +((precio / gramos) * 1000).toFixed(4) : null,
              url: p.linkText ? `${f.base}/${p.linkText}/p` : null,
              fecha: hoy,
            });
          }
        } catch (e) {
          /* Una cadena caída no puede tumbar la corrida entera: se anota y se
             sigue con la otra. */
          problemas.push({ fuente: f.fuente, termino, error: String((e as Error).message || e) });
        }
      }
    }

    /* Dedup por la clave única (fuente, nombre, fecha): el mismo producto sale
       en varias búsquedas ("arroz" y "arroz blanco"), y repetirlo en el mismo
       lote revienta el upsert. Se queda el más barato. */
    const porClave = new Map<string, any>();
    for (const f of filas) {
      const k = [f.fuente, f.nombre, f.fecha].join("||");
      const prev = porClave.get(k);
      if (!prev || f.precio < prev.precio) porClave.set(k, f);
    }
    const aGuardar = [...porClave.values()];

    for (let i = 0; i < aGuardar.length; i += 500) {
      const { error } = await admin.from("mercado_precios")
        .upsert(aGuardar.slice(i, i + 500), { onConflict: "fuente,nombre,fecha" });
      if (error) throw new Error("upsert mercado_precios: " + error.message);
    }

    return json({
      ok: true, fecha: hoy, fuentes: FUENTES.map((f) => f.fuente), terminos: terminos.length,
      encontrados: filas.length, guardados: aGuardar.length,
      con_peso: aGuardar.filter((f) => f.precio_kg !== null).length,
      problemas,
    });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
