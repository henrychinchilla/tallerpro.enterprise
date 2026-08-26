# 📱 NexusPro — App Android nativa (sin Android Studio)

App Android **real** (APK firmado, publicable en Play Store) construida 100% por
línea de comandos. Es una **Trusted Web Activity**: un binario nativo cuyo motor
(Chrome) renderiza el sistema a pantalla completa — cámara, descargas CSV,
adjuntos y todo el runtime funcionan al 100%, y cada deploy web actualiza la app
sin recompilar ni re-publicar.

**Versión actual: `4.78.0` (versionCode 5)** · paquete `com.cmtelecom.nexuspro`

## Requisitos (ya instalados en esta máquina)
- JDK 17+ (tienes Temurin 21)
- Android SDK en `%LOCALAPPDATA%\Android\Sdk` (build-tools 34+)
- Gradle 8.9 en `%LOCALAPPDATA%\Gradle\gradle-8.9`

## Compilar
```powershell
cd D:\tallerpro-enterprise\android
& "$env:LOCALAPPDATA\Gradle\gradle-8.9\bin\gradle.bat" assembleRelease
# APK firmado → app\build\outputs\apk\release\app-release.apk
```
Para Play Store (bundle):
```powershell
& "$env:LOCALAPPDATA\Gradle\gradle-8.9\bin\gradle.bat" bundleRelease
# AAB → app\build\outputs\bundle\release\app-release.aab
```

## Instalar en un teléfono
- **Por cable:** `adb install app\build\outputs\apk\release\app-release.apk`
  (adb está en `%LOCALAPPDATA%\Android\Sdk\platform-tools`)
- **Sin cable:** copia el APK al teléfono (WhatsApp/Drive/USB), tócalo y acepta
  "instalar de origen desconocido".

---

## 🔁 SUBIR UNA VERSIÓN — los 3 archivos que van juntos

Publicar una app nueva toca tres lugares. Si uno se queda atrás, el aviso de
"hay versión nueva" que sale al entrar al sistema deja de funcionar o se
vuelve mentira:

| # | Archivo | Qué se cambia |
|---|---------|----------------|
| 1 | `android/app/build.gradle` | `appVersionCode` (+1, **obligatorio**) y `appVersionName` |
| 2 | *(compilar)* → copiar el APK a la **raíz del repo** como `nexuspro.apk` | es lo que sirve `/nexuspro.apk`, el botón de Descargas |
| 3 | `app-version.json` (raíz) | `versionCode`, `versionName`, `apkKB`, `fecha`, `novedades` |

> `reinstalarSiMenorQue` de ese archivo **NO se toca en cada versión**: sólo
> cuando cambia la LLAVE DE FIRMA. Es lo que dispara el aviso de "desinstala
> primero", y subirlo sin motivo obligaría a todo el mundo a reinstalar de balde.

Luego el deploy normal (`git push` + `npm run deploy`) y **subir `CACHE_VERSION`
en `sw.js`**, como cualquier cambio de JS.

### Cómo sabe la web qué versión trae el teléfono
Una TWA renderiza con Chrome: para el servidor es **indistinguible de una
pestaña normal**, el user-agent no dice "voy dentro de la app v5". Por eso la
app se identifica ella misma — `DEFAULT_URL` en `AndroidManifest.xml` abre el
sitio en:

```
https://nexuspro.cmtelecommgt.com/?app=android&appvc=5&appvn=4.78.0
```

Esos valores los inyecta `build.gradle` vía `manifestPlaceholders` (no se
escriben a mano en el manifest: se desincronizarían). `App._detectarAppAndroid()`
los guarda en `localStorage` y limpia la URL; `App.avisoAppAndroid()` los compara
contra `app-version.json` al iniciar sesión y decide si avisar.

> Los APK **anteriores al versionCode 4 no reportan versión**. Por eso el aviso
> trata "estoy dentro de la app pero no sé qué versión soy" como *desactualizado*:
> es justamente la firma de un APK viejo. No es un caso a corregir, es el que
> permite avisarle a la base ya instalada.

---

## 🔐 FIRMA — LEER ESTO

- **Keystore vigente: `nexuspro-2026.keystore`** (RSA 4096, válido hasta 2054),
  alias `nexuspro`. Junto a `keystore.properties` contiene la identidad de firma:
  **NO van a git** (.gitignore) — **RESPÁLDALOS** (Drive/USB cifrado): sin el
  keystore es IMPOSIBLE publicar actualizaciones de la app en Play Store.
- Huella SHA256 del certificado (la única declarada en
  `/.well-known/assetlinks.json`, que es lo que hace que la app abra sin barra
  de URL):
  `48:C9:1A:8C:47:51:3D:4A:F4:73:D7:78:44:A0:D5:36:FE:6D:3C:5F:28:37:EF:B6:EB:E8:8C:93:C8:6A:46:7C`
- ⚠️ `keystore.properties` debe guardarse **SIN BOM**. Gradle lo lee como
  `.properties` y un BOM se pega a la primera clave: `storeFile` deja de
  reconocerse, cae al valor por defecto y la compilación falla con un confuso
  "keystore password was incorrect" apuntando al archivo equivocado.

### ✅ 2026-08-25 — RESUELTO: el keystore estuvo público y se ROTÓ la llave

`.gitignore` protege el **repositorio**, no el **despliegue**: `wrangler deploy`
sube el *directorio de trabajo*. Como `.assetsignore` no excluía `android/`,
durante casi dos meses (desde el 2026-07-01) estas dos URLs respondieron **200**:

```
https://nexuspro.cmtelecommgt.com/android/tallerpro.keystore     (2814 bytes)
https://nexuspro.cmtelecommgt.com/android/keystore.properties    (con la contraseña)
```

Con ambos, cualquiera podía firmar un APK que Android aceptaría como
**actualización legítima** de NexusPro. Ya está tapado por dos vías
(`.assetsignore` excluye `android/` y `worker.js` responde 404 a esa ruta y a
`*.keystore` / `*.jks` / `keystore.properties`), pero **hay que asumir la llave
comprometida**: no hay forma de saber si alguien la descargó.

**La llave se rotó el 2026-08-25**, antes de publicar nada en Play — que era el
único momento en que salía barato. La vieja (`tallerpro.keystore`) queda
**muerta**: su huella ya no aparece en `assetlinks.json`, así que aunque alguien
la tenga no puede hacer pasar una app por NexusPro.

Consecuencia asumida: **Android rechaza actualizar sobre una firma distinta**.
Quien tenga instalado un APK anterior al versionCode 5 debe **desinstalar y
volver a instalar** (no pierde datos: viven en Supabase). El aviso de versión
nueva ya se lo explica paso a paso — lo dispara el campo
`reinstalarSiMenorQue` de `app-version.json`, y `test/app-android-version.js`
vigila que ese aviso siga saliendo.

### ⚠️ Al subir a Google Play: la app perderá la pantalla completa si no haces esto

Con **Play App Signing** (obligatorio para apps nuevas), Google **re-firma** el
AAB con su propia llave. La huella SHA-256 del APK que reciben los usuarios ya
**no será la de arriba** → `assetlinks.json` deja de coincidir → la TWA se abre
**con la barra de URL de Chrome** en vez de a pantalla completa.

Después de la primera subida:
1. Play Console → **Integridad de la app** → **Firma de apps**.
2. Copia el **SHA-256 del certificado de firma de la app** (el de Google, no el
   de carga).
3. **Agrégalo** al array de `/.well-known/assetlinks.json` — sin quitar el
   actual: se admiten varias huellas, y la de arriba sigue haciendo falta para
   quienes instalaron el APK directo.
4. Deploy del sitio y reinstalar la app para verificar que abre sin barra.

### Cuando la ficha esté viva en Play
Pon `"enPlayStore": true` en `app-version.json`. A partir de ahí, tanto el aviso
de login como la pantalla de Descargas mandan a Play (que actualiza solo, sin
pedirle al usuario permisos de "origen desconocido") en vez de al APK directo.
El AAB listo para subir queda en `android/play/NexusPro-4.78.0-play.aab`.

## Cómo funciona el vínculo dominio ↔ app
1. La app declara confianza al sitio (`res/values/strings.xml → asset_statements`).
2. El sitio declara confianza a la app (`https://nexuspro.cmtelecommgt.com/.well-known/assetlinks.json`
   con el package id `com.cmtelecom.nexuspro` y la huella de arriba).
3. Android verifica ambos al instalar → la app abre a pantalla completa.
   Si cambias de keystore o dominio, regenera ambos lados.
