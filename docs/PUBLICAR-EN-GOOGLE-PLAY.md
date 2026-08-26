# Publicar NexusPro en Google Play — guía de trabajo

> Estado al 2026-08-26. Cuenta de desarrollador: **Organización — ya creada y VERIFICADA**
> (`CMTELECOMM`, región GT). Google lo confirmó por escrito el **2026-08-25 21:02**: la cuenta
> cumple *todos* los requisitos de verificación y está «in good standing» (punto 1).
> App firmada disponible: **`4.78.0` (versionCode 5)** en `android/play/NexusPro-4.78.0-play.aab`.
>
> ⏸️ **EN ESPERA (2026-08-26).** Codex está trabajando en el proyecto y va por **4.81**. La
> versión que se suba a Play debe salir de ese trabajo ya terminado, **no del 4.78.0**. Ojo:
> la rotación de llave (punto 7) sigue **sin mergear a `main` y sin desplegar** — vive sólo en
> la rama `worktree-app-android-actualizacion`, así que **producción todavía sirve la huella
> comprometida** en `/.well-known/assetlinks.json`.

Lo que sigue está en el orden en que Play Console lo pide. Lo que **bloquea** va primero.

---

## 0. Lo que ya está resuelto ✅

| Cosa | Estado |
|---|---|
| AAB firmado para subir | `android/play/NexusPro-4.78.0-play.aab` |
| Paquete | `com.cmtelecom.nexuspro` |
| Capturas de teléfono (8) | `play-movil-01..08-*.png` — 1080×1920, **9:16** |
| Capturas tablet 7" y 10" | `play-tablet7-*.png`, `play-tablet10-*.png` |
| Ícono 512×512 PNG | `icons/icon-512.png` |
| Gráfico destacado 1024×500 | `play-grafico-destacado.png` |
| Política de privacidad | https://nexuspro.cmtelecommgt.com/privacidad |
| Términos | https://nexuspro.cmtelecommgt.com/terminos |

---

## 0.b ¿Y si mejor cuenta Personal? — evaluado y descartado (2026-08-25)

Surgió la duda de si pasarse a cuenta **Personal** para no esperar el D-U-N-S. Los números no
dan lo que parece:

| | **Personal** | **Organización** (la actual) |
|---|---|---|
| D-U-N-S | No hace falta | Hasta 30 días · **0 si ya existe** · ~8 días hábiles con exprés de pago |
| Prueba cerrada obligatoria | **12 testers opt-in, 14 días continuos** | **Exenta** |
| Depende de terceros | Sí: 12 personas con cuenta de Google que se unan **y no se salgan** | No |
| Tiempo realista hasta producción | 3–5 semanas | 1–4 semanas (0 si el D-U-N-S ya existe) |
| Nombre visible en la tienda | El de una persona | El de la empresa |
| Ingresos y perfil fiscal | A título personal | A nombre de la S.A. |

**Lo que decide el asunto:** una cuenta **Personal no se puede convertir en Organización**
después. Cambiar más adelante obliga a crear otra cuenta y transferir la app, con su propio
trámite. Y NexusPro es un ERP B2B que factura FEL: publicarlo bajo un nombre personal le resta
credibilidad ante empresas y desordena la contabilidad de la sociedad.

Además, la ruta personal **no es más rápida**: cambia "esperar un trámite" por "conseguir 12
personas y sostenerlas 14 días seguidos" — que depende de terceros y se rompe si alguien se sale.

**Se mantiene Organización.**

### Cómo acelerar de verdad

1. **Busca primero si el D-U-N-S ya existe** en https://service.dnb.com/ — muchas empresas ya
   están en la base de D&B por bancos, aduanas o proveedores, sin saberlo. Si aparece, la espera
   es **cero**. Son cinco minutos y es lo primero que hay que hacer.
2. Si no existe, evalúa el **exprés de pago** (~8 días hábiles): sale más barato y más rápido que
   organizar 12 testers.
3. **Mientras tanto, sube el AAB a una prueba interna.** No requiere la verificación completa ni
   pasa por revisión, y sirve para comprobar hoy mismo que la app instala, abre y funciona
   firmada. Nada de lo administrativo te impide avanzar por ahí.

> **El tema del representante legal NO atrasa el lanzamiento.** El nombramiento se puede cambiar
> cuando se quiera; no hay que esperarlo para publicar. Se verifica con quien está inscrito hoy
> y se actualiza después.

---

## 1. ✅ Verificación de la cuenta — RESUELTA (2026-08-25)

**La cuenta de desarrollador ya existía y ya está verificada.** Eso invalida la premisa con la
que nació esta guía («el D-U-N-S bloquea y tarda hasta 30 días»): nunca hubo que *crear* una
cuenta, había que **destrabar** la que ya estaba restringida.

### Lo que de verdad pasó — fechas y evidencia

Encontrado el 2026-08-26 al revisar el correo de `henry.chinchilla@gmail.com`:

| Fecha (Guatemala) | Qué llegó |
|---|---|
| 2026-07-02 → 07-16 | Seis avisos «Notification from Google Play about CMTELECOMM»: estado **`Restricted developer account`** — perfil y apps **retirados** de Google Play, sin poder publicar. Dos problemas citados: **verificación de teléfono** e **identidad** |
| 2026-07-08 | Ticket de soporte `5-0879000040717` |
| 2026-08-19 | Ticket de soporte `7-8624000040975` (escalado el 08-20) |
| **2026-08-23 22:22** | «**Se verificó tu identidad**» — identidad ✅ |
| 2026-08-23 22:23 | Último aviso automático: ya sólo quedaba **Developer Phone Verification** |
| **2026-08-25 21:02** | Soporte (Jepoy) cierra el caso: «*We've reviewed your account and confirmed that you've met **all verification requirements**. Your account status is now updated and **in good standing**.*» |

> Ese último correo está en la bandeja como **«Re: [7-8624000040975] Your message about Google
> Play»**. Henry creía no haber recibido nada: sí llegó, anoche.

### ¿Y el D-U-N-S, entonces?

**No hay un solo correo de D&B ni de `dnb.com`** en la cuenta de Gmail, y la hoja de datos
(`D:\CM documentos\DUNS - hoja de datos para el formulario.md`) **no registra ningún número
asignado**. No hay evidencia de que el trámite se haya hecho por esa vía.

Y aun así Google afirma que la cuenta cumple *todos* los requisitos — y a una organización el
D-U-N-S se lo exige sin excepción. Sólo caben dos explicaciones:

1. El D-U-N-S **ya estaba en la cuenta** desde que se creó (es anterior a julio de 2026), o
2. la correspondencia de D&B llegó al buzón **`@cmtelecommgt.com`** (Microsoft 365), que no se
   puede consultar desde aquí.

**Cómo salir de la duda en un minuto** — es lo único pendiente de este punto:
Play Console → **Configuración** → **Detalles del desarrollador**. Si el campo **D-U-N-S** trae
número y no hay banner rojo de cuenta restringida, el tema está cerrado y **no hay que pedirle
nada a D&B**. Si estuviera vacío, o el banner siguiera, se sigue el trámite de más abajo.

> ⚠️ **No te fíes sólo del correo.** El automático del 08-23 aún decía «Restricted» y el humano
> del 08-25 dice que todo está bien. Manda el más nuevo, pero **el estado real se ve en Play
> Console**, no en la bandeja de entrada.

### Si hiciera falta pedirlo (referencia — ya no es la ruta principal)

Google exige un **D-U-N-S Number** para cuentas de organización. Es gratis y puede tardar
**hasta 30 días**.

### Antes de llenar nada: revisa si ya lo tienes
Muchas empresas ya están en la base de D&B sin saberlo (aparecen por importaciones, bancos,
proveedores). Búscalo primero — si ya existe, te ahorras las 4 semanas:
👉 https://service.dnb.com/ (buscador de D-U-N-S)

### Si no existe, solicítalo aquí
👉 https://www.dnb.com/duns/get-a-duns.html — es el enlace que da Google en su propia ayuda.
Gratis, hasta 30 días hábiles. Hay opción exprés de pago (unos 8 días hábiles) si urge.

### ⚠️ LA REGLA QUE TUMBA CUENTAS
El **nombre legal y la dirección** que registres en D&B tienen que coincidir **carácter por
carácter** con lo que pongas en el perfil de pagos de Play Console. Si Google detecta una
diferencia, te da un plazo para corregir y, si no se corrige, **retira todas tus apps de
Google Play**. No es una advertencia teórica: está en su documentación.

Consecuencia práctica: **decide AHORA el nombre exacto** y úsalo idéntico en los dos lados.
Cópialo tal cual de la **patente de comercio**. Ojo con:
- `S.A.` vs `Sociedad Anónima` vs `, S.A.`
- tildes y mayúsculas
- si el nombre legal lleva "CM" delante o no

### 📄 Los datos ya están listos

Se sacaron del **RTU de la SAT** y de la **Patente de Comercio de Sociedad**, y están en:

```
D:\CM documentos\DUNS - hoja de datos para el formulario.md
```

Esa hoja va **fuera del repositorio** a propósito: lleva NIT y datos de la representante legal.
Ahí está cada campo del formulario con lo que hay que escribir.

Lo esencial, para que quede dicho aquí:

- La entidad que se registra es **`CM INVESTMENTS, SOCIEDAD ANÓNIMA`** — con coma y escrito
  completo, **no "S.A."**. Las cuatro marcas (CM TELECOMM, CM MULTISERVICIOS, CM TRANSLOGISTICS,
  CM INVESTMENTS) son empresas mercantiles de esa única sociedad.
- **CM TELECOMM** es el nombre comercial correcto para NexusPro (Empresa Mercantil No. 336514):
  de ahí salen el dominio `cmtelecommgt.com` y el paquete `com.cmtelecom.nexuspro`.
- Domicilio en **Fraijanes, departamento de Guatemala**. Dirección física, **nunca** el
  apartado postal.
- Actividad para D&B: **NAICS 541511** (*Custom Computer Programming Services*).

**Ojo con la llamada de verificación:** D&B llama al teléfono registrado. Si no contestas, el
trámite se queda parado sin avisarte. Contesta números desconocidos esas semanas.

### El representante legal inscrito es Karen — plan decidido

Quien está **inscrito** como representante de CM INVESTMENTS, S.A. es **Karen Olanda Chinchilla
Corleto de Ruano**, **Administradora Única** (acta del 23/12/2024, Registro 770625, Folio 44,
Libro 841 de Auxiliares de Comercio; **plazo definido de 3 años, vence el 20/12/2027**).

Henry es el **dueño**, pero eso no es lo mismo ni es verificable por Google: las acciones de una
S.A. no constan en el Registro Mercantil, así que un revisor no tiene cómo comprobarlo. Sólo
puede mirar el nombramiento inscrito.

**Plan acordado — los dos a la vez:**

1. **Ahora (no bloquea nada):** la verificación de organización la respalda Karen —su DPI y el
   acta de nombramiento ya están en `D:\CM documentos`— y en Play Console se invita a
   **`henry.chinchilla@gmail.com`** como **Administrador** desde *Usuarios y permisos*. Henry
   gestiona todo: versiones, ficha, precios, reseñas.
2. **En paralelo, con el notario:** asamblea + acta notarial que nombre a Henry Administrador
   Único y Representante Legal, e inscripción en el Registro Mercantil. Al ser el dueño,
   controla la asamblea y no necesita autorización de nadie. Después se actualiza el
   representante en Play Console y en el RTU.

> **Para el D-U-N-S esto NO aplica:** D&B pide un *contacto*, no un representante inscrito, así
> que Henry va como contacto y el trámite arranca hoy.

Detalle completo, modelo de carta de autorización y el encargo para el notario:
`D:\CM documentos\Acreditar a Henry ante Google Play.md` (fuera del repo).

### Documentos que Google pedirá aparte (además del D-U-N-S)
- `Patente de Comercio de Sociedad CM Investments SA.pdf` (constitución)
- `CM INVESTMENTS SA RTU.pdf` (identificación tributaria y domicilio)
- `KAREN CHINCHILLA DPI.pdf` (identidad del representante autorizado)

> El RTU disponible es del 09/07/2026 y **aún no incluye el establecimiento CM TELECOMM** (su
> patente es del 11/08/2026). Si Google pide un documento donde figure ese nombre comercial,
> baja un **RTU actualizado** desde la Agencia Virtual de la SAT.

---

## 2. ⚠️ Correos: `telecommgt.com` NO EXISTE

Verificado el 2026-08-25: el dominio `telecommgt.com` **no resuelve y no tiene servidor de
correo**. O sea que `privacidad@telecommgt.com` — el correo que aparecía en la política de
privacidad y en la ficha borrador — **rebota**. Un correo de contacto que rebota es motivo de
rechazo, y además te haría perder los avisos de Google.

El bueno es **`cmtelecommgt.com`**, que sí tiene correo (Microsoft 365).
Ya se corrigieron `privacidad.html` y `terminos.html`.

**Falta que confirmes** que estos buzones existen y los lees:
- `privacidad@cmtelecommgt.com`
- `legal@cmtelecommgt.com`
- el de soporte que pongas en la ficha

Si alguno no existe, créalo en Microsoft 365 antes de enviar la ficha a revisión.

---

## 3. 🔴 Acceso para el revisor de Google ("App access")

NexusPro **no se puede usar sin iniciar sesión**, así que Google exige credenciales de prueba.
Si el revisor no logra entrar, **rechaza la app** — y este es el motivo de rechazo más común
en apps de gestión.

Hay dos trampas específicas de NexusPro:

1. **El 2FA.** A una cuenta sin segundo factor, la app le muestra la pantalla de activación de
   2FA al entrar. **Es posponible** (botón para omitir por ahora), pero el revisor no tiene por
   qué adivinarlo: hay que decírselo por escrito.
2. **El vencimiento de la prueba.** Si la cuenta demo se queda sin suscripción, el revisor ve
   una pantalla de bloqueo. La cuenta que le des a Google **no debe vencer**.

### La cuenta ya existe — verificado en la base el 2026-08-25

No hay que crear nada. El comercio **`PRUEBAS (automatizadas)`** (slug `pruebas-humo`) está
`active = true`, con plan **empresarial** (o sea, todos los módulos a la vista) y
**`suscripcion_vence = NULL`** — es decir, **no caduca**, que es justo lo que hace falta para
que el revisor pueda entrar hoy y dentro de seis meses. Su único usuario es `admin` y activo.

| | |
|---|---|
| Usuario | `robot.pruebas@nexuspro.test` |
| Contraseña | la de `test/humo/credenciales.json` (fuera de git) |
| Comercio | PRUEBAS (automatizadas) · plan empresarial · sin vencimiento |
| Rol | admin — ve todos los módulos |

> El dominio `.test` no es real y da igual: Google no manda correo ahí, sólo la usa para
> entrar. Si prefieres no compartir la misma cuenta que usan las pruebas automáticas, crea una
> gemela en ese mismo comercio; pero **no** le pongas fecha de vencimiento.

### Qué poner en "Acceso a la app" (cópialo tal cual)

```
La aplicación requiere iniciar sesión con una cuenta de negocio.

Usuario:    robot.pruebas@nexuspro.test
Contraseña: <la de test/humo/credenciales.json>

Instrucciones:
1. Abre la app y escribe el usuario y la contraseña de arriba.
2. Aparecerá una pantalla que propone activar la verificación en dos pasos.
   Pulsa el botón "Ahora no — activarlo después". No es obligatoria para
   revisar la aplicación.
3. Entrarás al panel principal, con datos de demostración cargados.

La app es un sistema de gestión (ERP) para talleres y pequeños comercios de
Guatemala. No tiene contenido generado por usuarios ni compras dentro de la
aplicación: la suscripción se contrata fuera de Google Play.
```

> El texto del botón está copiado **literal** de `js/core/login.js`. Es la diferencia entre que
> el revisor entre o se dé por vencido en la pantalla del 2FA: sin esa frase, lo normal es
> pensar que la verificación es obligatoria y cerrar la app.

**Antes de enviar:** entra tú mismo desde un teléfono limpio, sin sesión previa, siguiendo esos
tres pasos al pie de la letra. Si tú te trabas, el revisor también.

---

## 4. Seguridad de los datos (Data Safety)

Formulario obligatorio. Estas respuestas salen de lo que declara `privacidad.html`:

| Pregunta | Respuesta |
|---|---|
| ¿Recopila o comparte datos? | **Sí** |
| ¿Se transmiten cifrados? | **Sí** (HTTPS/TLS) |
| ¿El usuario puede pedir que se borren sus datos? | **Sí** — se pide al correo de privacidad |
| ¿Hay compras dentro de la app? | **No** (la suscripción se cobra fuera de Play) |
| ¿Hay anuncios? | **No** |

**Tipos de datos a declarar** (recopilados, vinculados a la identidad, para funcionalidad de la app):
- Información personal: **nombre**, **correo**, **teléfono**, **otros ID** (NIT)
- Información financiera: **otra información financiera** (facturación, ventas del comercio)
- Fotos y videos: **fotos** (adjuntos de órdenes, documentos, vouchers)
- Archivos y documentos
- Actividad en la app: **interacciones**
- Registros: **registros de fallos** y **diagnósticos**, si aplica

> Los datos de los **clientes finales del taller** los sube el comercio, no el usuario de la
> app. Aun así se declaran: Play mira lo que la app envía a un servidor, sin importar de quién
> sea el dato.

---

## 5. Resto del cuestionario

| Sección | Respuesta |
|---|---|
| Categoría | **Empresa / Negocios** |
| Etiquetas | Gestión, Productividad, Facturación |
| Clasificación de contenido | Cuestionario todo **NO** → resultado "Para todos" |
| Público objetivo | **18 años en adelante** (herramienta de trabajo) |
| ¿Dirigida a menores? | **No** |
| Anuncios | **No contiene anuncios** |
| Países | Guatemala + Centroamérica (o todos) |
| Gratis / de pago | **Gratis** (suscripción externa) |
| App financiera / gubernamental | **No** — factura con FEL, pero no es una app financiera regulada |

---

## 6. ⚠️ DESPUÉS de subir el AAB: la app perderá la pantalla completa

Esto no lo avisa nadie y es el error más difícil de diagnosticar después.

NexusPro es una **TWA**: se abre a pantalla completa sólo si Android verifica que la app y el
sitio se reconocen mutuamente (`/.well-known/assetlinks.json` ↔ huella del certificado).

Con **Play App Signing** (obligatorio), **Google re-firma tu AAB con SU propia llave**. La
huella del APK que instala el usuario **ya no es la tuya** → assetlinks deja de coincidir → la
app se abre **con la barra de URL de Chrome encima**. Se ve como una página web, no como app.

### Cómo arreglarlo (hazlo apenas subas la primera versión)
1. Play Console → **Integridad de la app** → **Firma de apps**.
2. Copia el **SHA-256 del "certificado de firma de la app"** (el de Google, **no** el de carga).
3. Agrégalo al array `sha256_cert_fingerprints` de `.well-known/assetlinks.json`, **junto a la
   huella vigente** (`48:C9:1A:8C:…:6A:46:7C`, la de `android/nexuspro-2026.keystore`): el
   array admite varias, y la propia sigue haciendo falta para quien instale el APK directo.
   ⚠️ **NO vuelvas a meter `8B:D8:…:F8:75`.** Esa es la llave que estuvo publicada en el CDN y
   se dio por comprometida (punto 7): volver a autorizarla desharía la rotación entera.
4. `npm run deploy` y reinstala la app para comprobar que abre sin barra.

---

## 7. ✅ Llave de firma ROTADA (2026-08-25)

El keystore anterior y su contraseña estuvieron públicos en el CDN casi dos meses
(2026-07-01 → 2026-08-25), así que se dio la llave por comprometida y **se rotó antes de
publicar nada en Play** — el único momento en que salía barato.

| | |
|---|---|
| Keystore vigente | `android/nexuspro-2026.keystore` (RSA 4096, válido hasta 2054) |
| Huella SHA-256 | `48:C9:1A:8C:47:51:3D:4A:F4:73:D7:78:44:A0:D5:36:FE:6D:3C:5F:28:37:EF:B6:EB:E8:8C:93:C8:6A:46:7C` |
| `assetlinks.json` | Declara **sólo** esa huella. La comprometida ya no está autorizada |
| App firmada con ella | `4.78.0` (versionCode 5) |

🔐 **RESPÁLDALO YA** (Drive o USB cifrado), junto con `android/keystore.properties`. Sin ese
archivo **no podrás publicar ninguna actualización nunca más**. No está en git, a propósito.

**Consecuencia asumida:** Android rechaza instalar encima cuando la firma cambia. Quien tenga un
APK anterior al versionCode 5 debe **desinstalar y volver a instalar** — no pierde datos, viven
en Supabase. El aviso de versión nueva ya se lo explica paso a paso; lo dispara el campo
`reinstalarSiMenorQue` de `app-version.json` y hay pruebas que vigilan que siga saliendo.

---

## 8. Orden sugerido

> Reordenado el 2026-08-26. **Lo administrativo dejó de ser el cuello de botella** (punto 1);
> ahora lo que falta es la app final y un despliegue nuestro.

1. ⏸️ **Esperar a que Codex termine** el trabajo en curso (va por 4.81). El AAB que se suba a
   Play sale de ahí, no del 4.78.0.
2. 🔴 **Mergear a `main` y desplegar la rotación de llave.** Hoy vive sólo en la rama
   `worktree-app-android-actualizacion`: **producción sigue sirviendo la huella comprometida**
   en `/.well-known/assetlinks.json`. Compilar el AAB definitivo ya con la llave nueva.
3. Confirmar en Play Console que no queda banner de cuenta restringida y que el D-U-N-S figura
   (punto 1). Un minuto.
4. ~~Rotar la llave de firma~~ ✅ hecho el 2026-08-25 — **respalda el keystore** (punto 7).
5. Confirmar los buzones `@cmtelecommgt.com` (punto 2).
6. Probar el ingreso del revisor en un teléfono limpio (punto 3).
7. Subir el AAB a una **prueba interna** — no requiere revisión y sirve para comprobar que
   instala y abre.
8. Llenar ficha, Data Safety, clasificación y acceso.
9. Invitar a `henry.chinchilla@gmail.com` como Administrador en *Usuarios y permisos*.
10. Enviar a revisión.
11. **Apenas quede publicada:** arreglar `assetlinks.json` con la huella de Google (punto 6),
    o la app abrirá con la barra de Chrome encima.

## Fuentes
- [Información necesaria para crear una cuenta de Play Console](https://support.google.com/googleplay/android-developer/answer/13628312?hl=es)
- [Elegir tipo de cuenta de desarrollador](https://support.google.com/googleplay/android-developer/answer/13634885)
- [Solicitar un D-U-N-S gratis (enlace que da Google)](https://www.dnb.com/duns/get-a-duns.html)
- [Buscador de D-U-N-S existente](https://service.dnb.com/)
