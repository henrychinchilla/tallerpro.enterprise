# Registro de seguridad

## 2026-07-24 — Endurecimiento posterior a auditoría

- Se eliminó la asignación de tenant y rol desde `user_metadata` al crear cuentas.
- Se cerró el acceso de cuentas sin perfil a IA, correo y WhatsApp.
- Se limitó el registro Google a identidades Google con correo confirmado.
- El feedback público continúa disponible; los puntos requieren un enlace individual, vigente y de un solo uso.
- Se codificaron los datos no confiables en las vistas de feedback, bitácora, login y Panel SaaS.
- Los backups cifrados ahora requieren una contraseña elegida por el usuario y una sal aleatoria.
- Se añadieron cabeceras de seguridad, una barrera de Worker y exclusiones de despliegue para archivos locales.
- Migraciones aplicadas en Supabase: `078_security_hardening_auth_feedback` y `079_security_advisor_followup`.
- Funciones Edge desplegadas: `email-send`, `whatsapp-send`, `ai-assistant`, `registrar-comercio-google`, `feedback-submit` y `create-feedback-token`.

Pendiente manual: activar **Leaked Password Protection** en Supabase Auth, ya que no está expuesto por la API disponible en esta sesión.
