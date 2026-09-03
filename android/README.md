# 📱 NexusPro — App Android nativa (sin Android Studio)

App Android **real** (APK firmado, publicable en Play Store) construida 100% por
línea de comandos. Desde la 4.96.0 es un **cascarón nativo con WebView**
(`MainActivity` + `PuenteBluetooth`), no una TWA. El sitio se sigue desplegando
con `npm run deploy` y la app se actualiza sola: acá adentro no vive ninguna
regla de negocio.

**Versión actual: `4.96.0` (versionCode 10)** · paquete `com.cmtelecom.nexuspro`

### Por qué dejó de ser una Trusted Web Activity
No fue por gusto. Una TWA **renderiza con Chrome**, así que solo tiene Web
Bluetooth — que es **BLE y nada más**. La mayoría de los dongles OBD hablan
Bluetooth **clásico (SPP/RFCOMM)**: el Vgate vLinker MS en modo MFi, los
Thinkcar y casi todo lo barato. Verificado el 2026-09-02 contra un vLinker MS
09327: en ese modo publica iAP + SPP y **cero BLE**, así que ningún navegador lo
ve, por bien emparejado que esté el teléfono. Eso explica que InfoCar conecte y
NexusPro no: no era un bug, era el techo de la arquitectura.

`PuenteBluetooth.java` expone **las dos radios** al JavaScript
(`@JavascriptInterface`, objeto `NexusBT`) y solo mueve bytes: el protocolo
ELM327 / ISO-TP / J1939 sigue viviendo en
`js/modulos/operacion/diagnostico_obd.js` y se actualiza con cada deploy, sin
recompilar la app. Expone BLE **además** de SPP a propósito: la WebView tampoco
implementa Web Bluetooth, así que sin eso se cambiaría un hueco por otro.

**Lo que se paga a cambio** (y por eso `MainActivity` es larga): la WebView no
trae de fábrica lo que Chrome regalaba — selector de archivos, cámara,
descargas, geolocalización y el botón Atrás van cableados a mano. Si algo de eso
deja de funcionar, se arregla ahí, no en la web.

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
El servidor no puede saberlo solo: la WebView se presenta como un Chrome de
Android, el user-agent no dice "voy dentro de la app v10". Por eso la app se
identifica ella misma — `MainActivity.INICIO` abre el sitio en:

```
https://nexuspro.cmtelecommgt.com/?app=android&nativo=1&appvc=10&appvn=4.96.0
```

Los valores salen de `BuildConfig`, que los inyecta `build.gradle`
(`buildConfigField`): un solo origen, para que no se desincronicen. `nativo=1`
avisa que acá SÍ hay puente Bluetooth — aunque el módulo de diagnóstico decide
mirando si existe `window.NexusBT`, que es lo que de verdad importa. `App._detectarAppAndroid()`
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

### ⚠️ Al subir a Google Play: agregar la huella con la que Play re-firma

Con **Play App Signing** (obligatorio para apps nuevas), Google **re-firma** el
AAB con su propia llave, así que la huella SHA-256 del APK que reciben los
usuarios **no será la de arriba** y `assetlinks.json` deja de coincidir.

> Ojo, esto cambió con el cascarón nativo: **ya no se pierde la pantalla
> completa**. Eso era un síntoma de la TWA (Chrome mostraba su barra de URL
> cuando el vínculo no verificaba); una WebView nunca dibuja esa barra. Lo que
> sí se rompe es que los **enlaces del sistema** —un correo, un WhatsApp— abran
> dentro de la app en vez del navegador. Sigue valiendo la pena hacerlo, pero no
> es lo que era: no bloquea el uso normal de la app.

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
El AAB listo para subir queda en `android/play/` (el más reciente manda).

## Cómo funciona el vínculo dominio ↔ app
1. La app declara confianza al sitio (`res/values/strings.xml → asset_statements`).
2. El sitio declara confianza a la app (`https://nexuspro.cmtelecommgt.com/.well-known/assetlinks.json`
   con el package id `com.cmtelecom.nexuspro` y la huella de arriba).
3. Android verifica ambos al instalar → los enlaces al dominio abren dentro de
   la app. Si cambias de keystore o dominio, regenera ambos lados.
   (La pantalla completa ya no depende de esto: la dibuja la propia app.)
