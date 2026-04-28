# TallerPro Enterprise — Guía de Despliegue

## Stack Tecnológico
- **Frontend**: HTML5 / CSS3 / Vanilla JS — PWA instalable en Android
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **PDF**: Puppeteer (Node.js) o WeasyPrint
- **WhatsApp**: Twilio Business API
- **Email**: SendGrid
- **FEL**: INFILE / G4S / EDIAG (Guatemala SAT)
- **Android**: PWA instalable vía Chrome "Agregar a pantalla de inicio"

---

## 1. Configurar Supabase

```bash
# Crear proyecto en https://supabase.com
# Copiar URL y anon key del proyecto

# Aplicar schema
psql $SUPABASE_DB_URL -f schema.sql

# Crear primer taller
SELECT public.onboard_tenant(
  'Automotriz Torres', 
  'automotriz-torres', 
  'admin@torres.gt', 
  '1234567-8', 
  'pro'
);
```

## 2. Variables de Entorno

Crear archivo `.env` (nunca commitear):
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
SENDGRID_API_KEY=SG.xxx
INFILE_USER=xxx
INFILE_PASSWORD=xxx
```

## 3. Conectar Frontend a Supabase

En `index.html`, reemplazar el bloque `DB` por:

```javascript
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabase = createClient(
  'https://xxxx.supabase.co',
  'eyJ...' // anon key
)

// Ejemplo: cargar clientes del tenant
const { data: clientes } = await supabase
  .schema('taller_automotriz_torres')
  .from('clientes')
  .select('*')
  .order('nombre')
```

## 4. Instalar como App Android

1. Abrir Chrome en Android
2. Navegar a la URL de la aplicación
3. Menú (⋮) → "Agregar a pantalla de inicio"
4. La app se instala como app nativa

Para distribución por Play Store, usar **Capacitor**:
```bash
npm install @capacitor/core @capacitor/android
npx cap init TallerPro com.tallerpro.enterprise
npx cap add android
npx cap sync
npx cap open android  # Abre Android Studio
```

## 5. Módulos Core Implementados

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| Login Multi-tenant | ✅ | JWT + roles RBAC |
| Dashboard Gerencial | ✅ | KPIs, Charts, Alertas AI |
| Clientes & Vehículos | ✅ | CRUD completo |
| Órdenes de Trabajo | ✅ | Kanban + lista |
| Inventario + QR | ✅ | Stock, alertas, QR generator |
| Calendario | ✅ | Vista mensual + lista citas |
| Facturación FEL | ✅ | SAT Guatemala |
| RRHH & Nómina | ✅ | IGSS + MINTRAB |
| App Android (PWA) | ✅ | Offline-first |
| Configuración | ✅ | Gestión de tenant |

## 6. Roadmap de Integración Backend

### Fase 1 (Semanas 1-6): MVP
- [ ] Conectar Supabase Auth
- [ ] Migrar DB local a PostgreSQL
- [ ] Row Level Security por tenant
- [ ] Integración FEL INFILE
- [ ] PDF con Puppeteer

### Fase 2 (Semanas 7-12): Automatización
- [ ] WhatsApp Business (Twilio)
- [ ] Email transaccional (SendGrid)
- [ ] API CarMD para datos de vehículos
- [ ] Motor de recomendaciones AI
- [ ] Notificaciones push (Web Push API)

### Fase 3 (Semanas 13-20): Financiero
- [ ] Conciliación bancaria
- [ ] Cuentas por cobrar
- [ ] Nómina automática MINTRAB
- [ ] Reportes avanzados D3.js

### Fase 4 (Semanas 21-26): Escala
- [ ] Onboarding automatizado
- [ ] Marketing campaigns
- [ ] Pen-testing & hardening
- [ ] Capacitor → Play Store

## 7. Precios SaaS Sugeridos

| Plan | Precio/mes | Usuarios | Almacenamiento |
|------|-----------|----------|----------------|
| Starter | Q299 | 3 | 1 GB |
| Pro | Q699 | 10 | 5 GB |
| Enterprise | Q1,499 | Ilimitado | 20 GB |

## 8. Compliance Guatemala

- **SAT FEL**: Integrar con INFILE, G4S o EDIAG
- **IGSS**: Cálculo automático (4.83% laboral, 12.67% patronal)
- **MINTRAB**: Bonificación incentivo Q250, vacaciones 15 días
- **Audit Log**: Append-only, inmutable por PostgreSQL ROLE

---

*TallerPro Enterprise v2.0 — Arquitectura Multi-Tenant Cloud-Native*
