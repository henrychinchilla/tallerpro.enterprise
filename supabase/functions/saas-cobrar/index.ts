// ═══════════════════════════════════════════════════════
// Edge Function: saas-cobrar — Canal A (CM → comercio)
// Cobro automático de la suscripción con la tarjeta del comercio
// (tenant_tarjetas, token cifrado) y credenciales de CM (secrets de la
// plataforma). NUNCA lee credenciales del comercio (Canal B).
//
// Política (saas_config.billing_auto, mig 152):
//   D−3 / D−1 / D0 → intento de cargo · fallo → reintentos D+1 / D+3
//   pasada la gracia sin pago → corte (active=false, "Suspendido")
//   éxito → registrar_cobro_saas (mismo RPC que el cobro manual y el voucher)
//
// Mientras billing_auto.activo = false, o con { dry_run: true }, SOLO
// SIMULA: devuelve qué haría y no escribe nada. Hoy ninguna pasarela tiene
// conector (CM no tiene contrato): un intento real falla con un error
// explícito, nunca con un "pagado" falso.
//
// Quién la llama (verify_jwt=false, auth propia):
//   • pg_cron diario → header x-cron-secret
//   • Panel SaaS → JWT de un superadmin TOTAL (dueño o saas_rol total)
//
// Body: { dry_run?: boolean, tenant_id?: uuid }
// Deploy: supabase functions deploy saas-cobrar --no-verify-jwt
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const DUENO = "henry.chinchilla@gmail.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/* ── Conectores de pasarela (Canal A, cuenta de CM) ──
   Cada pasarela recibe el token de la tarjeta del comercio y cobra con las
   credenciales de CM (Deno.env). Ninguna está implementada todavía: se
   agregan aquí cuando CM firme contrato y tenga sandbox. Devolver ok:false
   es lo correcto: un cargo que no ocurrió nunca debe renovar. */
type Cargo = { ok: true; autorizacion: string } | { ok: false; error: string };
const CONECTORES: Record<string, (token: string, monto: number, ref: string) => Promise<Cargo>> = {};
const PASARELAS_PREVISTAS = ["credomatic", "visanet", "stripe", "recurrente"];

async function cobrar(gateway: string | null, token: string, monto: number, ref: string): Promise<Cargo> {
  if (!gateway) return { ok: false, error: "No hay pasarela de CM configurada (saas_config.billing_auto.gateway)" };
  const fn = CONECTORES[gateway];
  if (!fn) return { ok: false, error: `Sin conector para "${gateway}": falta contrato/credenciales de CM` };
  try { return await fn(token, monto, ref); }
  catch (e) { return { ok: false, error: `Error de la pasarela: ${(e as Error).message}` }; }
}

const hoyGT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guatemala" }).format(new Date());
const dias = (desde: string, hasta: string) =>
  Math.round((new Date(hasta + "T00:00:00Z").getTime() - new Date(desde + "T00:00:00Z").getTime()) / 86400000);

async function autorizado(req: Request, admin: any, url: string, anonKey: string): Promise<boolean> {
  const cron = req.headers.get("x-cron-secret");
  if (cron) {
    const { data } = await admin.rpc("get_cron_secret");
    if (data && cron === data) return true;
  }
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  if (!token) return false;
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: u } = await caller.auth.getUser(token);
  if (!u?.user) return false;
  if (u.user.email === DUENO) return true;
  const { data: p } = await admin.from("usuarios").select("rol, activo, permisos_custom").eq("id", u.user.id).maybeSingle();
  return p?.rol === "superadmin" && p?.activo !== false && (p?.permisos_custom?.saas_rol ?? "soporte") === "total";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!(await autorizado(req, admin, url, anonKey))) return json({ error: "No autorizado" }, 401);

  let body: { dry_run?: boolean; tenant_id?: string } = {};
  try { body = await req.json(); } catch { /* body vacío = cron */ }

  const { data: cfgRow } = await admin.from("saas_config").select("valor").eq("clave", "billing_auto").maybeSingle();
  const cfg = cfgRow?.valor ?? {};
  const simular = body.dry_run === true || cfg.activo !== true;
  const gracia = Number(cfg.gracia_dias ?? 5);
  const previos: number[] = cfg.dias_previos ?? [3, 1, 0];
  const reintentos: number[] = cfg.reintentos_dias ?? [1, 3];
  const hoy = hoyGT();

  let q = admin.from("tenants")
    .select("id, name, slug, active, precio_mensual, suscripcion_vence, billing_intentos")
    .not("suscripcion_vence", "is", null).gt("precio_mensual", 0);
  if (body.tenant_id) q = q.eq("id", body.tenant_id);
  const { data: tenants, error: tErr } = await q;
  if (tErr) return json({ error: tErr.message }, 500);
  const { data: tarjetas } = await admin.from("tenant_tarjetas").select("tenant_id, cargo_automatico, marca, ultimos4");
  /* El comercio propio de CM (el del perfil del dueño) no se cobra ni se corta. */
  const { data: duenoPerfil } = await admin.from("usuarios").select("tenant_id").eq("email", DUENO).maybeSingle();

  const plan: any[] = [];
  for (const t of tenants ?? []) {
    if (t.id === duenoPerfil?.tenant_id) continue;
    const tj = (tarjetas ?? []).find((x: any) => x.tenant_id === t.id);
    const d = dias(hoy, t.suscripcion_vence);          // >0 faltan, <0 vencido hace -d
    let accion: "cobrar" | "cortar" | null = null;
    if (body.tenant_id) {
      // "Cobrar ahora" del Panel SaaS: intenta aunque no toque hoy (o esté suspendido).
      if (d <= Math.max(...previos)) accion = "cobrar";
    } else if (t.active !== false) {
      if (d >= 0 && previos.includes(d)) accion = "cobrar";
      else if (d < 0 && reintentos.includes(-d)) accion = "cobrar";
      else if (d < 0 && -d > gracia) accion = "cortar";
    }
    if (!accion) continue;
    if (accion === "cobrar" && !tj?.cargo_automatico) {
      plan.push({ tenant: t.name ?? t.slug, id: t.id, dias: d, accion: "omitido", motivo: "sin tarjeta con cargo automático" });
      continue;
    }
    const fila: any = { tenant: t.name ?? t.slug, id: t.id, dias: d, accion, monto: Number(t.precio_mensual) };

    if (simular) { fila.resultado = "simulado"; plan.push(fila); continue; }

    if (accion === "cortar") {
      await admin.from("tenants").update({
        active: false, updated_at: new Date().toISOString(),
        notas_admin: `Suspendido por falta de pago el ${hoy} (gracia de ${gracia} días agotada)`,
      }).eq("id", t.id);
      fila.resultado = "suspendido"; plan.push(fila); continue;
    }

    const { data: token } = await admin.rpc("leer_token_tarjeta", { p_tenant_id: t.id });
    const r = token
      ? await cobrar(cfg.gateway ?? null, token, Number(t.precio_mensual), `NexusPro ${t.slug ?? t.id} ${hoy}`)
      : { ok: false as const, error: "La tarjeta no tiene token del gateway" };
    if (r.ok) {
      const { error } = await admin.rpc("registrar_cobro_saas", {
        p_tenant_id: t.id, p_monto: Number(t.precio_mensual), p_metodo: "Tarjeta", p_estado: "pagado",
        p_referencia: `Cargo automático ${cfg.gateway} · Aut. ${r.autorizacion}${tj?.ultimos4 ? ` · ****${tj.ultimos4}` : ""}`,
        p_meses: 1,
      });
      fila.resultado = error ? "cobrado_sin_registrar" : "cobrado";
      if (error) fila.error = `CARGO HECHO pero no se registró: ${error.message} — registrar a mano`;
    } else {
      await admin.from("tenants").update({
        billing_intentos: (t.billing_intentos ?? 0) + 1,
        billing_ultimo_intento: new Date().toISOString(),
        billing_ultimo_error: r.error,
      }).eq("id", t.id);
      fila.resultado = "fallido"; fila.error = r.error;
    }
    plan.push(fila);
  }

  return json({ ok: true, simulado: simular, activo: cfg.activo === true, gateway: cfg.gateway ?? null,
                pasarelas_previstas: PASARELAS_PREVISTAS, con_conector: Object.keys(CONECTORES), hoy, plan });
});
