// ═══════════════════════════════════════════════════════
// Edge Function: verificar-voucher
// El comercio (demo vencido / suspendido) sube la foto de su voucher de
// transferencia o depósito. Esta función:
//   1. Autentica al usuario y resuelve su comercio (tenant).
//   2. Guarda el voucher en vouchers_pago (estado 'revision').
//   3. Lo lee con Claude (vision): monto, banco, cuenta destino, referencia.
//   4. Si TODO coincide (monto ≥ esperado, cuenta destino es una de las
//      configuradas en saas_config.pago, referencia no repetida, fecha
//      reciente) → aprobar_voucher() activa el servicio al instante.
//   5. Si algo no coincide o falta ANTHROPIC_API_KEY → queda en revisión
//      manual (Panel SaaS → Cobros).
//
// Body: { imagen_base64, monto?, banco?, referencia?, fecha_deposito? }
// Respuesta: { estado: 'aprobado'|'revision', mensaje, vence? }
//
// Deploy: supabase functions deploy verificar-voucher --no-verify-jwt
// ═══════════════════════════════════════════════════════
import { createClient } from "jsr:@supabase/supabase-js@2";

const MODELO = Deno.env.get("AI_MODEL_VOUCHER") ?? "claude-haiku-4-5-20251001";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

/* Solo dígitos, para comparar números de cuenta sin guiones/espacios */
const soloDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  /* ── 1. Usuario y comercio ── */
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Sesión requerida" }, 401);
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asCaller.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: "Sesión inválida" }, 401);

  const { data: perfil } = await admin.from("usuarios")
    .select("tenant_id, rol, nombre").eq("id", user.id).maybeSingle();
  if (!perfil?.tenant_id) return json({ error: "Usuario sin comercio asociado" }, 403);

  const { data: tenant } = await admin.from("tenants")
    .select("id, name, slug, plan, precio_mensual, suscripcion_vence, active")
    .eq("id", perfil.tenant_id).single();
  if (!tenant) return json({ error: "Comercio no encontrado" }, 404);

  /* ── 2. Voucher recibido ── */
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const imagen = String(b.imagen_base64 ?? "");
  if (!imagen.startsWith("data:image/")) return json({ error: "Falta la imagen del voucher" }, 400);
  if (imagen.length > 2_500_000) return json({ error: "La imagen es demasiado grande" }, 400);

  /* Anti-abuso: máx 5 por día (el trigger de BD también lo valida) */
  const hoy = new Date().toISOString().slice(0, 10);
  const { count } = await admin.from("vouchers_pago")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id).gte("created_at", hoy);
  if ((count ?? 0) >= 5) return json({ error: "Límite de vouchers por día alcanzado. Contacta a soporte." }, 429);

  const { data: voucher, error: insErr } = await admin.from("vouchers_pago").insert({
    tenant_id: tenant.id,
    monto: Number(b.monto) || null,
    banco: String(b.banco ?? "").slice(0, 80) || null,
    referencia: String(b.referencia ?? "").slice(0, 80) || null,
    fecha_deposito: b.fecha_deposito || null,
    imagen_base64: imagen,
    creado_por: user.id,
    estado: "revision",
  }).select("id").single();
  if (insErr) return json({ error: "No se pudo guardar el voucher: " + insErr.message }, 500);

  const enRevision = (motivo: string) =>
    json({
      estado: "revision", voucher_id: voucher.id,
      mensaje: "Tu comprobante fue recibido y está en revisión. Te activaremos el servicio en cuanto se confirme el pago." ,
      detalle: motivo,
    });

  /* ── 3. Config de pagos y monto esperado ── */
  const { data: cfgRow } = await admin.from("saas_config").select("valor").eq("clave", "pago").maybeSingle();
  const cfg = cfgRow?.valor ?? {};
  const cuentas: any[] = Array.isArray(cfg.cuentas) ? cfg.cuentas : [];
  const montosPlanes = cfg.montos_planes ?? { basico: 199, pro: 499, empresarial: 999 };
  const esperado = Number(tenant.precio_mensual) > 0
    ? Number(tenant.precio_mensual)
    : Number(montosPlanes[tenant.plan] ?? 0);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return enRevision("Verificación automática no configurada (sin API key)");
  if (!cuentas.length) return enRevision("Sin cuentas bancarias configuradas para comparar");
  if (!esperado) return enRevision("Comercio sin precio mensual definido");

  /* ── 4. Leer el voucher con Claude (vision) ── */
  const [, mime, b64] = imagen.match(/^data:(image\/\w+);base64,(.+)$/) ?? [];
  if (!b64) return enRevision("Formato de imagen no reconocido");

  let analisis: any = null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 700,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
            { type: "text", text:
`Analiza este comprobante de pago bancario de Guatemala (voucher de transferencia, depósito o pago móvil).
Extrae los datos y responde SOLO un JSON válido, sin texto adicional:
{
 "es_comprobante": true/false,      // ¿es realmente un comprobante de pago?
 "monto": 0.00,                     // monto pagado (número)
 "moneda": "GTQ",
 "fecha": "YYYY-MM-DD",             // fecha de la operación (null si no se ve)
 "banco": "...",                    // banco emisor del comprobante
 "cuenta_destino": "...",           // número de cuenta o destino al que se pagó (null si no se ve)
 "nombre_destino": "...",           // nombre del beneficiario/destino si aparece
 "referencia": "...",               // no. de boleta/autorización/referencia
 "nombre_ordenante": "...",         // quién pagó, si aparece
 "confianza": 0.0                   // 0 a 1: qué tan legibles/confiables son los datos
}` },
          ],
        }],
      }),
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    const data = await r.json();
    const txt = (data?.content?.[0]?.text ?? "").replace(/```json|```/g, "").trim();
    analisis = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
  } catch (e) {
    await admin.from("vouchers_pago").update({ analisis: { error: String(e) } }).eq("id", voucher.id);
    return enRevision("No se pudo leer el comprobante automáticamente");
  }

  /* ── 5. Validaciones de negocio ── */
  const checks: string[] = [];
  const monto = Number(analisis?.monto) || 0;
  const confianza = Number(analisis?.confianza) || 0;

  if (!analisis?.es_comprobante) checks.push("La imagen no parece un comprobante de pago");
  if (confianza < 0.75) checks.push("Legibilidad baja del comprobante");
  if (monto < esperado * 0.99) checks.push(`Monto leído (Q${monto}) menor al esperado (Q${esperado})`);
  if ((analisis?.moneda ?? "GTQ").toUpperCase() !== "GTQ") checks.push("Moneda distinta de GTQ");

  /* Cuenta destino debe coincidir con alguna cuenta configurada (por dígitos,
     tolera que el voucher muestre la cuenta parcialmente enmascarada) */
  const destino = soloDigitos(analisis?.cuenta_destino);
  const coincideCuenta = cuentas.some((c) => {
    const nuestra = soloDigitos(c.numero);
    return !!nuestra && destino.length >= 6 &&
      (nuestra.includes(destino) || destino.includes(nuestra));
  });
  if (destino.length < 6) checks.push("No se pudo leer la cuenta destino completa");
  else if (!coincideCuenta) checks.push("La cuenta destino no coincide con las cuentas de NexusPro");

  /* Fecha razonable: no más de 60 días atrás ni futura */
  if (analisis?.fecha) {
    const f = new Date(analisis.fecha).getTime();
    const dias = (Date.now() - f) / 86400000;
    if (isNaN(f) || dias > 60 || dias < -1) checks.push("Fecha del comprobante fuera de rango");
  }

  /* Referencia no usada antes en un voucher aprobado (evita re-usar el mismo voucher) */
  const ref = String(analisis?.referencia ?? "").trim();
  if (ref) {
    const { data: dup } = await admin.from("vouchers_pago")
      .select("id").eq("estado", "aprobado").eq("referencia_detectada", ref).limit(1);
    if (dup?.length) checks.push("Referencia ya utilizada en otro pago");
  }

  await admin.from("vouchers_pago").update({
    analisis: { ...analisis, checks, esperado },
    monto: monto || undefined,
    banco: analisis?.banco || undefined,
    referencia_detectada: ref || null,
  }).eq("id", voucher.id);

  if (checks.length) return enRevision(checks.join(" · "));

  /* ── 6. Todo coincide → activar automáticamente ── */
  const meses = Math.max(1, Math.min(24, Math.round(monto / esperado)));
  const { data: res, error: rpcErr } = await admin.rpc("aprobar_voucher", {
    p_voucher_id: voucher.id, p_monto: monto, p_meses: meses,
  });
  if (rpcErr) return enRevision("Validado, pero la activación requiere revisión: " + rpcErr.message);

  return json({
    estado: "aprobado",
    mensaje: `¡Pago confirmado! Tu servicio quedó activo${meses > 1 ? ` por ${meses} meses` : ""}.`,
    vence: res?.suscripcion_vence ?? null,
  });
});
