# Publicar NexusPro en Google Play — guía de trabajo

> Estado al 2026-08-26. Cuenta de desarrollador: **PERSONAL** (`CMTELECOMM`, región GT) — no
> de organización, como se creyó hasta hoy (punto 0.b). Ya está **VERIFICADA**: Google lo
> confirmó por escrito el **2026-08-25 21:02** (punto 1).
> **Lo que bloquea ahora es una sola cosa: la prueba cerrada con 12 verificadores durante 14
> días** (punto 1.b). El D-U-N-S **nunca hizo falta** y queda descartado.
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

## 0.b La cuenta es PERSONAL, no de organización (2026-08-26)

Esta guía dio por sentado durante días que la cuenta era de **Organización**. **No lo es.** Lo
delata la propia pantalla de Play Console que exige *«Ten al menos 12 verificadores que acepten
participar en la prueba cerrada»*: ese requisito **sólo aplica a cuentas personales creadas
después del 13/11/2023**, y las de organización están **exentas**. Si la cuenta fuera de
organización, esa pantalla no existiría.

Con eso encajan de golpe todas las piezas que no cuadraban:

| Lo que se observó | Qué significa, siendo cuenta personal |
|---|---|
| Cero correos de D&B / `dnb.com`, nunca | **El D-U-N-S nunca hizo falta**: sólo se lo exigen a las organizaciones |
| Los seis avisos de julio citaban **teléfono** e **identidad**, jamás el D-U-N-S | Son exactamente los requisitos de una cuenta personal |
| Google cerró la verificación el 25-ago sin que existiera ningún D-U-N-S | Coherente: no había nada que pedir |

**El D-U-N-S queda cerrado: ni se tramita, ni se necesita.** Todo el punto 1 pasa a ser historia.

### ¿Convertir la cuenta a Organización para saltarse los 12 verificadores?

Se puede — y aquí esta guía se equivocaba. Afirmaba que *«una cuenta Personal no se puede
convertir en Organización»*: **es falso**. Google sí admite ese sentido (crear un perfil de
pagos del tipo correcto, verificarlo y enlazarlo a la cuenta). Lo que **no** admite es el
inverso, de organización a personal.

**Aun así, ahora NO conviene:**

| | **Quedarse en Personal** ✅ recomendado | **Convertir a Organización** |
|---|---|---|
| Qué exige | 12 verificadores × 14 días | **D-U-N-S** (no se tiene: hasta 30 días, ~8 hábiles con exprés) + perfil de pagos nuevo |
| Verificación de la cuenta | **Ya está lista** | **Se vuelve a disparar** |
| Depende de | 12 personas que tú convocas | D&B y una revisión de Google |
| Plazo realista | ~2 semanas | 4–6 semanas |
| Riesgo | Que un verificador se salga y reinicie el conteo | **Volver a caer en cuenta restringida** |

El riesgo de la derecha no es teórico: la cuenta acaba de pasar **casi dos meses restringida**
(2 julio → 25 agosto) con el perfil y las apps **retiradas de Google Play**. Y el correo con el
que soporte cerró el caso avisa literalmente: *«any future changes or updates to your account
details **may trigger another verification process**»*. Tocar los datos de la cuenta justo ahora
es meter la mano en el mismo agujero del que se acaba de salir.

**Decisión: quedarse en Personal, hacer la prueba cerrada y publicar.** La conversión sigue
disponible **después**, con la app ya viva y sin prisa. Y como sí se puede convertir, publicar
hoy en Personal **no es una puerta de un solo sentido** — que era justamente el argumento con
el que esta guía la había descartado.

> Sobre la credibilidad comercial: el nombre con el que Google ya se dirige a la cuenta en sus
> propios correos es **CMTELECOMM**, no el de una persona, así que la ficha no sale a nombre de
> «Henry».

> **El representante legal (Karen) y el notario NO atrasan el lanzamiento** — y con cuenta
> personal dejan de ser parte de este trámite. El nombramiento sigue teniendo sentido por lo
> mercantil, pero ya no toca a Google Play.

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

Durante unas horas eso pareció un misterio: Google decía que la cuenta cumplía *todos* los
requisitos, y a una organización el D-U-N-S se lo exige sin excepción. **La explicación llegó
esa misma tarde: la cuenta no es de organización, es PERSONAL** (punto 0.b), y a las personales
no se les pide D-U-N-S. No hay correos de D&B porque **nunca hubo trámite que hacer**.

**Pregunta cerrada: el D-U-N-S no se necesita.** Lo que queda de este punto es sólo confirmar de
un vistazo, en Play Console, que ya no hay banner rojo de cuenta restringida.

> ⚠️ **No te fíes sólo del correo.** El aviso automático del 08-23 aún decía «Restricted» y el
> humano del 08-25 dice que todo está bien. Manda el más nuevo, pero **el estado real se ve en
> Play Console**, no en la bandeja de entrada.

### Si algún día se convierte a Organización (referencia — hoy NO es la ruta)

Sólo entonces Google exige un **D-U-N-S Number**. Es gratis y puede tardar **hasta 30 días**.
Ver el porqué de no hacerlo ahora en el punto 0.b.

### Antes de llenar nada: revisa si ya lo tienes
Muchas empresas ya están en la base de D&B sin saberlo (aparecen por importaciones, bancos,
proveedores). Búscalo primero — si ya existe, te ahorras las 4 semanas:
👉 https://service.dnb.com/ (buscador de D-U-N-S)

### Si no existe, solicítalo aquí
👉 https://www.dnb.com/duns/get-a-duns.html — es el enlace que da Google en su propia ayuda.
Gratis, hasta 30 días hábiles. Hay opción exprés de pago (unos 8 días hábiles) si urge.

> 📌 **De aquí al final del punto 1, todo aplica SÓLO si algún día se convierte la cuenta a
> Organización.** Con la cuenta personal de hoy, Google **no** pide D-U-N-S, ni patente, ni
> RTU, ni nombramiento del representante legal. Se conserva porque la información costó
> reunirla y sigue siendo válida el día que se decida convertir.

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

## 1.b 🔴 LO QUE BLOQUEA HOY: prueba cerrada con 12 verificadores

Texto literal de Play Console, 2026-08-26:

> *Para poder solicitarlo, debes ejecutar una prueba cerrada que cumpla con nuestros criterios.*
> · Publica una versión de prueba cerrada
> · Ten al menos 12 verificadores que acepten participar — **actualmente, 0 aceptaron**
> · Ejecuta la prueba cerrada con un mínimo de 12 verificadores durante al menos **14 días**

### Las reglas que hacen fallar el conteo

- Los 14 días **no empiezan al subir el AAB**: empiezan cuando la versión está aprobada **y**
  hay **12 o más** verificadores con la participación **aceptada**.
- Si en algún momento el número **baja de 12, la continuidad se rompe** y el conteo vuelve a
  cero. Por eso se invita a **15–18**, no a doce justos: alguien siempre se sale o cambia de
  teléfono.
- Tienen que ser **personas reales, con cuenta de Google real y teléfono Android real**.
  Emuladores, cuentas duplicadas o granjas de testers no cuentan, y usarlas es motivo de rechazo.
- Aceptar la invitación **no basta**: al pedir producción, Google pregunta **cómo se reclutó a
  los verificadores y qué se cambió con lo que reportaron**. Conviene que de verdad abran la app
  y comenten algo.

### Cómo se hace

1. Play Console → **Prueba y lanzamiento** → **Pruebas** → **Prueba cerrada** → crear versión.
2. **Verificadores** → crear una **lista de correos** con 15–18 direcciones de Gmail.
3. Copiar el **enlace de participación** y mandárselo a cada uno: tiene que abrirlo y pulsar
   *Convertirme en verificador*. **Ese** es el "aceptar" que Google cuenta — no el correo.
4. Que instalen desde Play y entren al menos una vez (credenciales del punto 3).
5. Cumplidos los 14 días con ≥12 dentro: **Solicitar acceso a producción** y responder el
   cuestionario.

### Lo que conviene hacer YA, sin esperar a nadie

El cronómetro de 14 días es el camino largo que queda, y **se puede arrancar con el AAB que ya
existe** (`4.78.0`, firmado). Subir después la versión de Codex (4.81) a esa misma pista **no
reinicia el conteo**: lo que se cuenta es que los verificadores sigan dentro, no que el binario
no cambie.

> Secuencia correcta: **abrir la prueba cerrada y juntar a los verificadores hoy**; y mientras
> corren los 14 días, terminar la app, desplegar la rotación de llave y arreglar `assetlinks`.

### De dónde salen 12 personas

Empleados de CM Telecomm, familia, y los talleres y comercios que ya usan NexusPro — a estos
últimos les sirve de verdad, porque van a tener la app en Play. Sólo se necesita que tengan
teléfono Android y cuenta de Google.

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

1. 🔴 **HOY, sin esperar a nada: abrir la prueba cerrada y juntar 15–18 verificadores**
   (punto 1.b). Es el cronómetro de 14 días y el único camino largo que queda. Arranca con el
   AAB `4.78.0` que ya está firmado; subir luego el 4.81 **no reinicia el conteo**.
2. **Apenas suba ese primer AAB:** copiar de Play Console la huella de *Firma de apps* de Google
   y agregarla a `assetlinks.json` (punto 6), o los verificadores verán la barra de Chrome
   encima de la app.
3. ⏸️ **Esperar a que Codex termine** (va por 4.81) para el AAB definitivo.
4. 🔴 **Mergear a `main` y desplegar la rotación de llave.** Hoy vive sólo en la rama
   `worktree-app-android-actualizacion`: **producción sigue sirviendo la huella comprometida**
   en `/.well-known/assetlinks.json`.
5. ~~Rotar la llave de firma~~ ✅ hecho el 2026-08-25 — **respalda el keystore** (punto 7).
6. Confirmar los buzones `@cmtelecommgt.com` (punto 2).
7. Probar el ingreso del revisor en un teléfono limpio (punto 3) — y dárselo también a los
   verificadores.
8. Llenar ficha, Data Safety, clasificación y acceso.
9. Cumplidos los 14 días: **Solicitar acceso a producción** y responder el cuestionario sobre
   la prueba cerrada.
10. Enviar a revisión.

## Fuentes
- [Información necesaria para crear una cuenta de Play Console](https://support.google.com/googleplay/android-developer/answer/13628312?hl=es)
- [Elegir tipo de cuenta de desarrollador](https://support.google.com/googleplay/android-developer/answer/13634885)
- [Solicitar un D-U-N-S gratis (enlace que da Google)](https://www.dnb.com/duns/get-a-duns.html)
- [Buscador de D-U-N-S existente](https://service.dnb.com/)
- [Requisitos de prueba para cuentas personales nuevas — 12 verificadores / 14 días](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Guía de la comunidad: todo sobre el requisito de los 12 verificadores](https://support.google.com/googleplay/android-developer/community-guide/255621488/everything-about-the-12-testers-requirement)
- [Mantener actualizada la información de tu cuenta de desarrollador (cambio de tipo de cuenta)](https://support.google.com/googleplay/android-developer/answer/13634888)
