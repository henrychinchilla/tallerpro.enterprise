// ═══════════════════════════════════════════════════════
// Edge Function: nit-sat
// Verifica un NIT guatemalteco.
//
//  1) Siempre valida el DÍGITO VERIFICADOR localmente (algoritmo SAT,
//     módulo 11). Esto no depende de internet y nunca falla.
//  2) Si están configurados los secrets del CERTIFICADOR FEL, además
//     consulta en línea el NOMBRE del contribuyente. Si no, devuelve
//     solo la validez del dígito con un aviso (no rompe la app).
//
// Body: { nit }
// Respuesta: { ok, nit, valido, cf, nombre?, fuente, mensaje? }
//
// Deploy: supabase functions deploy nit-sat
// Secrets del certificador (INFILE u otro) — opcionales:
//   NIT_LOOKUP_URL      Endpoint de consulta de NIT. Puede contener {nit}
//                       como marcador; si no, se agrega ?nit=...
//   NIT_LOOKUP_METHOD   GET (por defecto) o POST
//   NIT_LOOKUP_USUARIO  Cabecera "usuario" (estilo INFILE)
//   NIT_LOOKUP_LLAVE    Cabecera "llave"   (estilo INFILE / API key)
//   NIT_LOOKUP_TOKEN    Alternativa: Authorization: Bearer <token>
// ═══════════════════════════════════════════════════════

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/* Normaliza: quita espacios y guiones, mayúsculas */
function limpiar(nit: string): string {
  return (nit ?? "").toString().replace(/[\s-]/g, "").toUpperCase();
}

/* Validación del dígito verificador (algoritmo oficial SAT, módulo 11) */
function digitoValido(nit: string): boolean {
  const n = limpiar(nit);
  if (!/^[0-9]+K?$/.test(n)) return false;
  const verif = n.slice(-1);
  const numero = n.slice(0, -1);
  if (!/^\d+$/.test(numero) || numero.length === 0) return false;
  let suma = 0;
  const L = numero.length;
  for (let i = 0; i < L; i++) suma += Number(numero[i]) * (L - i + 1);
  const comp = (11 - (suma % 11)) % 11;
  const calc = comp === 10 ? "K" : String(comp);
  return calc === verif;
}

/* Busca recursivamente un campo con pinta de "nombre" en la respuesta JSON */
function extraerNombre(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  const claves = ["nombre", "nombre_completo", "razon_social", "razonSocial",
    "tax_name", "taxName", "nombreCompleto", "nombre_contribuyente"];
  for (const k of claves) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const k of Object.keys(obj)) {
    const hijo = extraerNombre(obj[k]);
    if (hijo) return hijo;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const nit = limpiar(body.nit);
  if (!nit || nit === "CF" || nit === "C/F") {
    return json({ ok: true, nit: "CF", cf: true, valido: true, fuente: "local" });
  }

  const valido = digitoValido(nit);

  // ── Consulta en línea (certificador FEL) ──
  const url = Deno.env.get("NIT_LOOKUP_URL");
  if (!url) {
    return json({
      ok: true, nit, valido, cf: false, fuente: "local",
      mensaje: valido
        ? "Dígito verificador válido. Conecta tu certificador FEL para traer el nombre."
        : "El dígito verificador del NIT no es válido.",
    });
  }

  const method = (Deno.env.get("NIT_LOOKUP_METHOD") ?? "GET").toUpperCase();
  const usuario = Deno.env.get("NIT_LOOKUP_USUARIO");
  const llave = Deno.env.get("NIT_LOOKUP_LLAVE");
  const token = Deno.env.get("NIT_LOOKUP_TOKEN");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (usuario) headers["usuario"] = usuario;
  if (llave) headers["llave"] = llave;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const endpoint = url.includes("{nit}")
    ? url.replace("{nit}", encodeURIComponent(nit))
    : (method === "GET" ? `${url}${url.includes("?") ? "&" : "?"}nit=${encodeURIComponent(nit)}` : url);

  try {
    const r = await fetch(endpoint, {
      method,
      headers,
      ...(method === "POST" ? { body: JSON.stringify({ nit }) } : {}),
    });
    const ct = r.headers.get("content-type") ?? "";
    const data = ct.includes("json") ? await r.json() : await r.text();
    if (!r.ok) {
      return json({ ok: true, nit, valido, cf: false, fuente: "local",
        mensaje: `No se pudo consultar en línea (HTTP ${r.status}). Dígito ${valido ? "válido" : "inválido"}.` });
    }
    const nombre = typeof data === "string" ? null : extraerNombre(data);
    return json({
      ok: true, nit, valido, cf: false, fuente: "fel",
      nombre: nombre ?? null,
      mensaje: nombre ? null : "Consulta realizada pero sin nombre en la respuesta.",
    });
  } catch (e: any) {
    return json({ ok: true, nit, valido, cf: false, fuente: "local",
      mensaje: `No se pudo consultar en línea (${e?.message ?? "error de red"}). Dígito ${valido ? "válido" : "inválido"}.` });
  }
});
