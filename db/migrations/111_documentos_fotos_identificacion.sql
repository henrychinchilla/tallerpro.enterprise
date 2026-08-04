-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 111
-- El bucket 'documentos' (migración 015) solo aceptaba PDF, pensado
-- para documentos firmados. Ahora también sirve para adjuntar fotos
-- de identificación del cliente (DPI, licencia de tenencia/portación,
-- pasaporte) — a pedido de Henry para el módulo de Armería, aunque el
-- campo queda disponible para cualquier vertical que lo necesite.
--
-- Mismo bucket, mismas políticas de Storage (RLS por tenant_id en el
-- primer segmento del path, migración 015) — solo se amplían los tipos
-- de archivo aceptados y el tamaño máximo (una foto de celular pesa
-- más que un PDF de firma). Idempotente.
-- ═══════════════════════════════════════════════════════════════

update storage.buckets
set allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'],
    file_size_limit = 15728640
where id = 'documentos';
