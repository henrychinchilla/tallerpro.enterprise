# 📱 NexusPro — App Android nativa (sin Android Studio)

App Android **real** (APK firmado, publicable en Play Store) construida 100% por
línea de comandos. Es una **Trusted Web Activity**: un binario nativo cuyo motor
(Chrome) renderiza el sistema a pantalla completa — cámara, descargas CSV,
adjuntos y todo el runtime funcionan al 100%, y cada deploy web actualiza la app
sin recompilar ni re-publicar.

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

## 🔐 FIRMA — LEER ESTO
- `tallerpro.keystore` + `keystore.properties` contienen la identidad de firma.
  **NO van a git** (.gitignore) — **RESPÁLDALOS** (Drive/USB cifrado): sin el
  keystore es IMPOSIBLE publicar actualizaciones de la app en Play Store.
- Huella SHA256 del certificado (usada en `/.well-known/assetlinks.json` del
  sitio para que la app abra sin barra de URL):
  `8B:D8:E8:84:CE:2C:CA:68:59:4D:90:70:AB:F2:75:E3:00:C7:9A:3A:00:5D:E2:45:75:6F:95:75:5C:F7:F8:75`

## Cómo funciona el vínculo dominio ↔ app
1. La app declara confianza al sitio (`res/values/strings.xml → asset_statements`).
2. El sitio declara confianza a la app (`https://nexuspro.cmtelecommgt.com/.well-known/assetlinks.json`
   con el package id `com.cmtelecom.nexuspro` y la huella de arriba).
3. Android verifica ambos al instalar → la app abre a pantalla completa.
   Si cambias de keystore o dominio, regenera ambos lados.

## Subir versión
En `app/build.gradle`: incrementa `versionCode` (+1) y ajusta `versionName`,
recompila. (Solo necesario para cambios del CASCARÓN nativo — el contenido
del sistema se actualiza solo con cada `npm run deploy` del web.)
