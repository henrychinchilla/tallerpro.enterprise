// foto-modelo — la foto "de catálogo" de un modelo de vehículo.
//
// Henry, 2026-09-22: «en serio no pudiste conseguir una mejor foto.. hay
// muchas fotos de brochures de esos vehiculos». La API de imágenes de Google
// (Custom Search) está cerrada a clientes nuevos desde 2025, así que el camino
// es otro, y mejor: la foto de estudio que el FABRICANTE publica en la página
// del modelo o en su sala de prensa es la imagen principal de esa página
// (<meta property="og:image">). La IA encuentra esas páginas con búsqueda web;
// esta función lee su og:image, valida que sea una foto de verdad (tipo y
// tamaño: un logo pesa pocos KB), la copia a Storage para no depender de un
// enlace ajeno, y la deja en public.fotos_modelo para TODOS los talleres
// (mig 145). Se busca una sola vez por marca/modelo/año/color.
//
// Entrada: { marca, modelo, anio?, color? }   Salida: { ok, url, pagina } | { ok:false }

import { createClient } from "jsr:@supabase/supabase-js@2";

const MODELO = Deno.env.get("AI_MODEL") ?? "claude-haiku-4-5-20251001";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const COLORES_EN: Record<string, string> = {
  blanco: "white", negro: "black", gris: "grey", plata: "silver", plateado: "silver", rojo: "red",
  azul: "blue", verde: "green", amarillo: "yellow", naranja: "orange", "café": "brown", cafe: "brown",
  marron: "brown", "marrón": "brown", beige: "beige", vino: "red", corinto: "red", dorado: "gold", morado: "purple",
};

/* hyundaicanada.com escribe las URLs con "&#x26;" en vez de "&". */
const desEntidad = (u: string) => u.replace(/&amp;|&#x26;|&#38;/gi, "&");

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

async function conTope(url: string, ms: number, init: RequestInit = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, {
      ...init, signal: c.signal, redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "es,en;q=0.8",
        ...(init.headers || {}),
      },
    });
  } finally { clearTimeout(t); }
}

/* La imagen principal que la página declara para compartirse: og:image,
   twitter:image o link rel=image_src. Es la foto que el fabricante eligió. */
function imagenDePagina(html: string, base: string): string[] {
  const out: string[] = [];
  const rx = [
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["']/gi,
    /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/gi,
  ];
  for (const r of rx) for (const m of html.matchAll(r)) {
    try { out.push(new URL(desEntidad(m[1]), base).href); } catch (_) { /* url rota */ }
  }
  return [...new Set(out)].filter(u => u.startsWith("https://") && !/logo|icon|favicon|sprite|placeholder|default-share/i.test(u));
}

/* Plan B: la página no declara og:image (salas de prensa como hyundainews.com)
   pero sí trae las fotos en <img>. Se juntan src, data-src y la variante más
   grande de srcset; el filtro de tamaño decide después cuál es una foto. */
function fotosEnPagina(html: string, base: string, slug = ""): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (n: string) => (tag.match(new RegExp(`\\b${n}=["']([^"']+)["']`, "i")) || [])[1];
    const srcset = attr("srcset") || attr("data-srcset");
    const grande = srcset ? srcset.split(",").map(s => s.trim().split(/\s+/)[0]).pop() : null;
    for (const c of [grande, attr("data-src"), attr("src")]) {
      if (!c || c.startsWith("data:")) continue;
      try { out.push(new URL(desEntidad(c), base).href); } catch (_) { /* url rota */ }
    }
  }
  /* Primero las que nombran al modelo: hyundai.com trae el render de estudio
     como "accent-hc-quarter-view-silk-silver-thumb-pc.png" — dice "thumb" y
     es justo la foto buscada. A esas no se les aplica el filtro de "thumb". */
  const validas = [...new Set(out)].filter(u => u.startsWith("https://") && /\.(jpe?g|png|webp)(\?|$)/i.test(u) &&
    !/logo|icon|favicon|sprite|placeholder|badge|avatar|flag/i.test(u));
  const conModelo = slug ? validas.filter(u => norm(u).replace(/[^a-z0-9]/g, "").includes(slug)) : [];
  const otras = validas.filter(u => !conModelo.includes(u) && !/thumb/i.test(u));
  return [...conModelo, ...otras];
}

/* La IA busca las páginas; no inventa URLs de imagen (no las ve). */
/* La búsqueda web no devuelve siempre lo mismo. Dos rondas: primero SOLO el
   sitio oficial de la marca (páginas de modelo: traen el render de estudio),
   después prensa y concesionarios oficiales. */
async function paginasCandidatas(apiKey: string, marca: string, modelo: string, anio: number | null, color: string, ronda: number) {
  const veh = `${marca} ${modelo}${anio ? ` año ${anio}` : ""}${color ? `, color ${color}` : ""}`;
  const pedido = ronda === 1
    ? `Vehículo: ${veh}.
Encontrá hasta 6 URLs de PÁGINAS del sitio OFICIAL del fabricante ${marca} (su dominio propio, de cualquier país:
por ejemplo ${norm(marca).replace(/[^a-z0-9]/g, "")}.com/<pais>/...) que sean la página de ESTE modelo: showroom, especificaciones,
galería o "find a car". Nada de PDFs, archive.org, foros ni clasificados.
Respondé SOLO con un arreglo JSON de URLs, sin texto alrededor. Ejemplo: ["https://...","https://..."]`
    : `Vehículo: ${veh}.
Encontrá hasta 6 URLs de PÁGINAS web (no de imágenes ni PDFs) donde este modelo aparezca en foto de estudio o de catálogo:
la sala de prensa del fabricante (galería o comunicado de ese modelo y generación) o la ficha del modelo en un concesionario
oficial. Tiene que ser la GENERACIÓN que corresponde al año${anio ? ` ${anio}` : ""}. Nada de foros, clasificados ni videos.
Respondé SOLO con un arreglo JSON de URLs, sin texto alrededor. Ejemplo: ["https://...","https://..."]`;
  const cuerpo: any = {
    model: MODELO, max_tokens: 1500,
    messages: [{ role: "user", content: pedido }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
  };
  let msgs = cuerpo.messages, texto = "";
  for (let i = 0; i < 3; i++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ ...cuerpo, messages: msgs }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message ?? `IA HTTP ${r.status}`);
    texto += (d.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    if (d.stop_reason !== "pause_turn") break;
    msgs = [...msgs, { role: "assistant", content: d.content }];
  }
  const ini = texto.indexOf("["), fin = texto.lastIndexOf("]");
  if (ini < 0 || fin <= ini) return [];
  try {
    return (JSON.parse(texto.slice(ini, fin + 1)) as unknown[])
      .map(String).filter(u => /^https:\/\//.test(u)).slice(0, 6);
  } catch (_) { return []; }
}

/* La foto tiene que ser DE ESE MODELO. La primera versión guardó un Hyundai
   Kona como "Accent 2017": salió de una página genérica de brochures de la
   marca. Ahora la IA mira la imagen y confirma modelo y generación; ante la
   duda, no. */
function aBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function esElModelo(apiKey: string, bytes: Uint8Array, tipo: string, marca: string, modelo: string, anio: number | null) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO, max_tokens: 200,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: tipo, data: aBase64(bytes) } },
        /* Lo que se descarta es OTRO modelo (el Kona por el Accent), un
           interior, un detalle o algo que no es el vehículo. La generación NO
           se exige: en años de cambio (el Accent 2017 era RB en un país y HC
           en otro) la IA rechazaba la foto buena de catálogo. */
        { type: "text", text: `¿Esta foto muestra el EXTERIOR de un ${marca} ${modelo}${anio ? ` (el vehículo real es de ${anio})` : ""}? ` +
          `Respondé "es": false SOLO si es OTRO modelo (aunque sea de la misma marca), si es un interior o un detalle, ` +
          `o si el vehículo no es el protagonista. Una generación distinta del mismo modelo NO es motivo para rechazar. ` +
          `Respondé SOLO JSON: {"es": true|false, "motivo": "..."}` },
      ] }],
    }),
  });
  if (!r.ok) return false;
  const d = await r.json();
  const t = (d.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  const m = t.match(/\{[\s\S]*\}/);
  try { return !!(m && JSON.parse(m[0]).es === true); } catch (_) { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Falta sesión" }, 401);
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: u, error: ue } = await asCaller.auth.getUser(token);
  if (ue || !u?.user) return json({ error: "Sesión inválida" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const marca = String(body.marca ?? "").trim().slice(0, 40);
  const modelo = String(body.modelo ?? "").trim().slice(0, 60);
  const anio = Number.isFinite(Number(body.anio)) && Number(body.anio) > 1950 ? Number(body.anio) : null;
  const colorEn = COLORES_EN[norm(body.color)] ?? "";
  if (!marca || !modelo) return json({ error: "Faltan marca y modelo" }, 400);

  const clave = [norm(marca), norm(modelo), anio ?? "", colorEn].join("|");
  const admin = createClient(url, serviceKey);

  const { data: ya } = await admin.from("fotos_modelo").select("url, pagina").eq("clave", clave).maybeSingle();
  if (ya) return json({ ok: true, url: ya.url, pagina: ya.pagina, cache: true });
  if (!apiKey) return json({ ok: false, error: "La IA no está configurada" });

  /* Una página que no nombra al modelo en su dirección es de la marca en
     general (así entró el Kona como Accent): no se usa. */
  const slugModelo = norm(modelo).split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
  const vistas: string[] = [];
  const traza: string[] = [];   // qué pasó con cada página/imagen: vuelve en la respuesta de error
  for (const ronda of [1, 2]) {
  let paginas: string[] = [];
  try { paginas = await paginasCandidatas(apiKey, marca, modelo, anio, colorEn, ronda); }
  catch (e) { if (ronda === 2) return json({ ok: false, error: `No se pudo buscar: ${(e as Error).message}` }); continue; }
  paginas = paginas.filter(p => !vistas.includes(p) && !/\.pdf(\?|$)|archive\.org/i.test(p));
  vistas.push(...paginas);
  for (const pagina of paginas.filter(p => norm(p).replace(/[^a-z0-9]/g, "").includes(slugModelo))) {
    let html = "";
    try {
      const r = await conTope(pagina, 8000);
      if (!r.ok || !/text\/html/i.test(r.headers.get("content-type") ?? "")) { traza.push(`pagina ${r.status} ${pagina}`); continue; }
      html = (await r.text()).slice(0, 400_000);
    } catch (e) { traza.push(`pagina ERR ${(e as Error).message} ${pagina}`); continue; }

    const declaradas = imagenDePagina(html, pagina).slice(0, 3);
    const enPagina = fotosEnPagina(html, pagina, slugModelo);
    const nombran = enPagina.filter(u => norm(u).replace(/[^a-z0-9]/g, "").includes(slugModelo));
    const candidatas = [...declaradas.map(u => ({ u, min: 30_000 })),
                        ...nombran.slice(0, 5).map(u => ({ u, min: 25_000 })),
                        ...enPagina.filter(u => !nombran.includes(u)).slice(0, 3).map(u => ({ u, min: 60_000 }))];
    for (const { u: img, min } of candidatas) {
      try {
        const r = await conTope(img, 10000, { headers: { Accept: "image/jpeg,image/png,image/webp;q=0.9", Referer: pagina } });
        const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        if (!r.ok || !["image/jpeg", "image/png", "image/webp"].includes(tipo)) { traza.push(`img ${r.status} ${tipo} ${img}`); continue; }
        const bytes = new Uint8Array(await r.arrayBuffer());
        /* Un logo o un ícono pesa pocos KB; una foto de estudio, bastante más.
           A las del plan B se les pide más: en una página hay de todo. */
        if (bytes.length < min || bytes.length > 5_000_000) { traza.push(`img tamaño ${bytes.length} ${img}`); continue; }
        if (!(await esElModelo(apiKey, bytes, tipo, marca, modelo, anio))) { traza.push(`img no es el modelo ${img}`); continue; }
        const ext = tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
        const ruta = `${clave.replace(/[^a-z0-9|]/g, "-").replace(/\|/g, "/")}.${ext}`;
        const { error: se } = await admin.storage.from("fotos-modelo").upload(ruta, bytes, { contentType: tipo, upsert: true });
        if (se) continue;
        const pub = admin.storage.from("fotos-modelo").getPublicUrl(ruta).data.publicUrl;
        await admin.from("fotos_modelo").upsert({
          clave, marca, modelo, anio, color: colorEn || null, url: pub, pagina,
        }, { onConflict: "clave" });
        return json({ ok: true, url: pub, pagina });
      } catch (e) { traza.push(`img ERR ${(e as Error).message} ${img}`); }
    }
  }
  }
  return json({ ok: false, error: "No se encontró una foto oficial utilizable", paginas: vistas, traza: traza.slice(0, 40) });
});
