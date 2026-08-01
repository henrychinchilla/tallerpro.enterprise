// ═══════════════════════════════════════════════════════
// Edge Function: maga-sync
// Importa la serie mensual de precios mayoristas del MAGA (datos abiertos)
// a maga_productos / maga_precios.
//
// Se hace del lado del servidor y no desde el navegador porque el archivo es
// un ZIP de ~4.5 MB en Latin-1 y la escritura necesita service_role.
//
// Quién puede llamarla (verify_jwt=false, auth propia — igual que backup-tenants):
//   • pg_cron mensual → header x-cron-secret (Vault, vía RPC get_cron_secret)
//   • admin desde la app → su JWT normal
//
// Body opcional:
//   { anio_desde: 2020, anio_hasta: 2026 }  acota el rango (la carga inicial se
//                                           hace por bloques para no topar el
//                                           tiempo máximo de ejecución)
//   { url: "..." }                          fuerza un archivo puntual
//
// Deploy: supabase functions deploy maga-sync --no-verify-jwt
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";

const PAGINA = "https://precios.maga.gob.gt/otros/datos-abiertos/";
const BASE = "https://precios.maga.gob.gt";
const SUPERADMIN_EMAIL = "henry.chinchilla@gmail.com";
const LB_A_KG = 0.453592;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function esLlamadaAutorizada(req: Request, admin: any, url: string, anonKey: string): Promise<boolean> {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data } = await admin.rpc("get_cron_secret");
    if (data && cronSecret === data) return true;
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return false;
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asCaller.auth.getUser(token);
  const user = userData?.user;
  if (!user) return false;
  if (user.email === SUPERADMIN_EMAIL) return true;
  const { data: perfil } = await admin.from("usuarios").select("rol").eq("id", user.id).maybeSingle();
  return perfil?.rol === "superadmin" || perfil?.rol === "admin";
}

/* El nombre del archivo lleva el mes ("...a junio 2026 CSV.zip"), así que cambia
   cada mes: se descubre leyendo la página de datos abiertos en vez de hardcodearlo. */
async function descubrirURL(): Promise<string> {
  const html = await (await fetch(PAGINA)).text();
  /* Ojo: en esa página los href van SIN comillas (href=https://...CSV.zip download),
     así que el patrón tiene que aceptar las tres formas o no encuentra nada. */
  const re = /href\s*=\s*(?:"([^"]+?\.zip)"|'([^']+?\.zip)'|([^\s"'>]+?\.zip))/gi;
  const hrefs = [...html.matchAll(re)].map((m) => m[1] || m[2] || m[3]);
  const csv = hrefs.find((h) => /csv\.zip$/i.test(h.replace(/%20/g, " ")));
  if (!csv) throw new Error("No encontré el enlace al CSV en la página de datos abiertos del MAGA");
  return csv.startsWith("http") ? csv : BASE + (csv.startsWith("/") ? "" : "/") + csv;
}

/* 53 medidas distintas; 50 traen la equivalencia dentro del nombre.
   Sin pasar todo a kg no se pueden comparar productos ni cruzar con
   venta_granos.precio_kg. Las que no se pueden convertir (docena, manojo,
   mazo) quedan en null a propósito: inventar un peso sería peor que no tenerlo. */
function kgEquivalente(medida: string): number | null {
  const m = medida.trim();
  const parentesis = [...m.matchAll(/\(([^)]*)\)/g)].map((x) => x[1]);
  for (const p of parentesis) {
    const esKg = /\bkg\b/i.test(p), esLb = /\blb\b|\blibras?\b/i.test(p);
    if (!esKg && !esLb) continue;
    const nums = (p.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!nums.length) continue;
    const prom = nums.reduce((a, b) => a + b, 0) / nums.length;  // rangos "45 - 50 lb"
    return esLb ? +(prom * LB_A_KG).toFixed(4) : +prom.toFixed(4);
  }
  if (/^quintal/i.test(m)) return +(100 * LB_A_KG).toFixed(4);
  if (/^libra/i.test(m)) return LB_A_KG;
  if (/^arroba/i.test(m)) return +(25 * LB_A_KG).toFixed(4);
  return null;
}

const CLAVES: Record<string, string[]> = {
  grano: ["arroz", "frijol", "maiz", "maíz", "sorgo", "haba", "trigo", "ajonjoli", "ajonjolí"],
  fruta: ["sandia", "sandía", "melon", "melón", "papaya", "piña", "mango", "naranja", "banano",
    "platano", "plátano", "fresa", "limon", "limón", "aguacate", "manzana", "mandarina", "uva",
    "pera", "durazno", "coco", "guayaba", "jocote", "zapote", "granadilla", "maracuya", "maracuyá",
    "melocoton", "melocotón", "ciruela", "tamarindo", "nance", "mora"],
  hortaliza: ["tomate", "cebolla", "papa", "zanahoria", "chile", "repollo", "lechuga", "apio",
    "brocoli", "brócoli", "coliflor", "pepino", "guisquil", "güisquil", "ejote", "arveja",
    "remolacha", "rabano", "rábano", "acelga", "espinaca", "ajo", "yuca", "camote", "calabaza",
    "ayote", "berenjena", "loroco", "perejil", "cilantro", "hierba", "champiñon", "champiñón"],
};
function categoria(nombre: string): string {
  const n = nombre.toLowerCase();
  for (const [cat, claves] of Object.entries(CLAVES)) {
    if (claves.some((k) => n.includes(k))) return cat;
  }
  return "otro";
}

/* CSV con campos entrecomillados (los nombres traen comas) */
function parseCSV(texto: string): string[][] {
  const filas: string[][] = [];
  let campo = "", fila: string[] = [], enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else enComillas = false;
      } else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

/* ── SINCRONIZACIÓN DIARIA ─────────────────────────────────────
   La página de datos abiertos arma la lista de archivos diarios por AJAX
   (js/datosabiertosdiarios.js): un POST devuelve los nombres y el archivo
   cuelga de /diarios/individuales/. Sólo quedan expuestos los últimos días,
   así que esto corre a diario y no reconstruye historia.

   El nombre trae acentos ("agrícolas") y hay que codificarlo al pedirlo, si
   no el servidor responde 404. */
async function descubrirDiarios(): Promise<string[]> {
  const r = await fetch(`${BASE}/diarios/dadindividuales.php`, { method: "POST" });
  if (!r.ok) throw new Error(`El MAGA no listó los archivos diarios (HTTP ${r.status})`);
  const lista = await r.json();
  return (Array.isArray(lista) ? lista : []).filter((n: string) => /\.json$/i.test(n)).sort();
}

async function sincronizarDiario(admin: any, body: any) {
  const archivos = body.archivo ? [body.archivo] : await descubrirDiarios();
  if (!archivos.length) throw new Error("El MAGA no publicó ningún archivo diario JSON");

  /* Por defecto sólo el más reciente; { dias: 4 } rellena lo que haya quedado
     sin bajar si el cron falló un día. */
  const cuantos = Math.max(1, Math.min(Number(body.dias) || 1, archivos.length));
  const aBajar = archivos.slice(-cuantos);

  const productos = new Map<string, string>();
  const lecturas: { nombre: string; medida: string; mercado: string; fecha: string; precio: number; actor: string }[] = [];
  let sinPrecio = 0;

  for (const archivo of aBajar) {
    const url = `${BASE}/diarios/individuales/${encodeURIComponent(archivo)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo bajar ${archivo} (HTTP ${res.status})`);
    const filas = await res.json();
    for (const f of Array.isArray(filas) ? filas : []) {
      /* Precio null es normal: el producto se cotiza pero ese día no hubo
         registro. Se cuenta y se descarta; guardar 0 mentiría. */
      const precio = parseFloat(String(f.Precio ?? "").trim());
      if (!isFinite(precio) || precio <= 0) { sinPrecio++; continue; }
      const nombre = String(f.Producto || "").trim();
      const medida = String(f.Medida || "").trim();
      const mercado = String(f.Mercado || "").trim();
      const fecha = String(f.Fecha || "").trim().slice(0, 10);
      if (!nombre || !medida || !mercado || !fecha) continue;
      productos.set(nombre + "||" + medida, medida);
      lecturas.push({ nombre, medida, mercado, fecha, precio, actor: String(f.Actor || "").trim() });
    }
  }

  /* Mismo catálogo que la serie mensual: un producto seguido en una vista es
     el mismo en la otra. */
  const filasProd = [...productos.keys()].map((k) => {
    const [nombre, medida] = k.split("||");
    return { nombre, medida, categoria: categoria(nombre), kg_equiv: kgEquivalente(medida) };
  });
  for (let i = 0; i < filasProd.length; i += 500) {
    const { error } = await admin.from("maga_productos")
      .upsert(filasProd.slice(i, i + 500), { onConflict: "nombre,medida" });
    if (error) throw new Error("upsert productos: " + error.message);
  }
  const { data: catalogo, error: eCat } = await admin.from("maga_productos").select("id,nombre,medida,kg_equiv");
  if (eCat) throw new Error("leer catálogo: " + eCat.message);
  const idPorClave = new Map<string, { id: number; kg: number | null }>();
  (catalogo || []).forEach((p: any) => idPorClave.set(p.nombre + "||" + p.medida, { id: p.id, kg: p.kg_equiv }));

  /* Dedup por (producto, mercado, fecha): el upsert falla si el mismo lote
     trae dos veces la misma clave ("ON CONFLICT DO UPDATE command cannot
     affect row a second time"). Se queda la última lectura. */
  const porClave = new Map<string, any>();
  for (const l of lecturas) {
    const ref = idPorClave.get(l.nombre + "||" + l.medida);
    if (!ref) continue;
    porClave.set([ref.id, l.mercado, l.fecha].join("||"), {
      producto_id: ref.id, mercado: l.mercado, fecha: l.fecha, precio: l.precio,
      precio_kg: ref.kg ? +(l.precio / ref.kg).toFixed(4) : null,
      actor: l.actor || null,
    });
  }
  const filasPrecio = [...porClave.values()];
  for (let i = 0; i < filasPrecio.length; i += 1000) {
    const { error } = await admin.from("maga_precios_diarios")
      .upsert(filasPrecio.slice(i, i + 1000), { onConflict: "producto_id,mercado,fecha" });
    if (error) throw new Error("upsert precios diarios: " + error.message);
  }

  const fechas = [...new Set(filasPrecio.map((f) => f.fecha))].sort();
  return json({
    ok: true, modo: "diario", archivos: aBajar, fechas,
    leidas: lecturas.length + sinPrecio, sin_precio: sinPrecio,
    productos: filasProd.length, precios: filasPrecio.length,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (!(await esLlamadaAutorizada(req, admin, url, anonKey))) {
    return json({ error: "No autorizado" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));

    /* Modo diario: archivo del día, JSON suelto y chico (~186 lecturas).
       Va acá y no en otra función para no duplicar la autorización, el
       catálogo de productos ni las tablas de equivalencia en kg. */
    if (body.modo === "diario") return await sincronizarDiario(admin, body);

    const anioDesde = Number(body.anio_desde) || 1990;
    const anioHasta = Number(body.anio_hasta) || 2100;

    const archivo = body.url || (await descubrirURL());
    const zipBytes = new Uint8Array(await (await fetch(archivo)).arrayBuffer());
    const contenido = unzipSync(zipBytes);
    const nombreCsv = Object.keys(contenido).find((k) => /\.csv$/i.test(k));
    if (!nombreCsv) throw new Error("El ZIP del MAGA no trae ningún CSV");
    /* El archivo del MAGA es UTF-8 (verificado decodificando el archivo entero).
       Decodificarlo como Latin-1 "funciona" sin lanzar error pero deja los
       nombres doblemente codificados ("Limón" → "LimÃ³n"), y de paso rompe la
       clasificación por palabra clave. Se intenta UTF-8 estricto y solo si el
       archivo dejara de serlo se cae a Latin-1. */
    const bytes = contenido[nombreCsv];
    let texto: string;
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      texto = new TextDecoder("iso-8859-1").decode(bytes);
    }

    const filas = parseCSV(texto);
    const cab = filas[0].map((h) => h.trim());
    const iMercado = cab.indexOf("Mercado"), iProd = cab.indexOf("Producto");
    const iMedida = cab.indexOf("Medida"), iFecha = cab.indexOf("Fecha"), iPrecio = cab.indexOf("Precio");
    if ([iMercado, iProd, iMedida, iFecha, iPrecio].some((x) => x < 0)) {
      throw new Error("El CSV no trae las columnas esperadas: " + cab.join(","));
    }

    /* Agrupar y promediar: quedan 182 casos con dos precios para el mismo
       producto/medida/mercado/mes (lecturas repetidas de la encuesta). */
    const acum = new Map<string, { p: string; me: string; mer: string; f: string; suma: number; n: number }>();
    const productos = new Map<string, string>();   // "nombre||medida"
    let leidas = 0, sinPrecio = 0, fueraRango = 0;

    for (let i = 1; i < filas.length; i++) {
      const f = filas[i];
      if (f.length <= iPrecio) continue;
      leidas++;
      const precio = parseFloat((f[iPrecio] || "").trim());
      if (!isFinite(precio) || precio <= 0) { sinPrecio++; continue; }
      const fecha = (f[iFecha] || "").trim().slice(0, 10);
      const anio = Number(fecha.slice(0, 4));
      if (!(anio >= anioDesde && anio <= anioHasta)) { fueraRango++; continue; }
      const nombre = (f[iProd] || "").trim(), medida = (f[iMedida] || "").trim();
      const mercado = (f[iMercado] || "").trim();
      if (!nombre || !medida || !mercado || !fecha) continue;
      productos.set(nombre + "||" + medida, medida);
      const k = [nombre, medida, mercado, fecha].join("||");
      const a = acum.get(k);
      if (a) { a.suma += precio; a.n++; }
      else acum.set(k, { p: nombre, me: medida, mer: mercado, f: fecha, suma: precio, n: 1 });
    }

    // 1) productos
    const filasProd = [...productos.keys()].map((k) => {
      const [nombre, medida] = k.split("||");
      return { nombre, medida, categoria: categoria(nombre), kg_equiv: kgEquivalente(medida) };
    });
    for (let i = 0; i < filasProd.length; i += 500) {
      const { error } = await admin.from("maga_productos")
        .upsert(filasProd.slice(i, i + 500), { onConflict: "nombre,medida" });
      if (error) throw new Error("upsert productos: " + error.message);
    }
    const { data: catalogo, error: eCat } = await admin.from("maga_productos").select("id,nombre,medida,kg_equiv");
    if (eCat) throw new Error("leer catálogo: " + eCat.message);
    const idPorClave = new Map<string, { id: number; kg: number | null }>();
    (catalogo || []).forEach((p: any) => idPorClave.set(p.nombre + "||" + p.medida, { id: p.id, kg: p.kg_equiv }));

    // 2) precios
    const filasPrecio: any[] = [];
    let promediados = 0;
    for (const v of acum.values()) {
      const ref = idPorClave.get(v.p + "||" + v.me);
      if (!ref) continue;
      if (v.n > 1) promediados++;
      const precio = +(v.suma / v.n).toFixed(2);
      filasPrecio.push({
        producto_id: ref.id, mercado: v.mer, fecha: v.f, precio,
        precio_kg: ref.kg ? +(precio / ref.kg).toFixed(4) : null,
      });
    }
    let insertadas = 0;
    for (let i = 0; i < filasPrecio.length; i += 1000) {
      const { error } = await admin.from("maga_precios")
        .upsert(filasPrecio.slice(i, i + 1000), { onConflict: "producto_id,mercado,fecha" });
      if (error) throw new Error("upsert precios: " + error.message);
      insertadas += Math.min(1000, filasPrecio.length - i);
    }

    await admin.rpc("maga_refrescar_cobertura");

    return json({
      ok: true, archivo, leidas, sin_precio: sinPrecio, fuera_de_rango: fueraRango,
      productos: filasProd.length, precios: insertadas, promediados,
      sin_kg: filasProd.filter((p) => p.kg_equiv === null).length,
    });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
