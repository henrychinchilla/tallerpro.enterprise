-- ═══════════════════════════════════════════════════════
-- 073 — Métodos de pago habilitables por comercio (Panel SaaS)
--   El botón "Pagar con tarjeta" (y PayPal) solo aparece al cliente si el
--   superadmin lo habilita para ese comercio. Apagado por defecto: mientras
--   no exista pasarela integrada, nadie ve una opción que no funciona.
--   La transferencia con voucher queda siempre disponible.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS pago_tarjeta_habilitado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pago_paypal_habilitado  boolean DEFAULT false;
