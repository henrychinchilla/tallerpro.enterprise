@echo off
:: TallerPro - Actualizar todos los archivos
:: Ejecutar desde dentro de la carpeta tallerpro-enterprise

set REPO=%~dp0

echo Copiando archivos desde %REPO%
echo.

copy /Y "%REPO%vehiculos.js"  "%REPO%js\modules\vehiculos.js"  && echo [OK] vehiculos.js  || echo [FALTA] Descarga vehiculos.js
copy /Y "%REPO%rrhh.js"       "%REPO%js\modules\rrhh.js"       && echo [OK] rrhh.js       || echo [FALTA] Descarga rrhh.js
copy /Y "%REPO%pages.js"      "%REPO%js\modules\pages.js"      && echo [OK] pages.js      || echo [FALTA] Descarga pages.js
copy /Y "%REPO%finanzas.js"   "%REPO%js\modules\finanzas.js"   && echo [OK] finanzas.js   || echo [FALTA] Descarga finanzas.js
copy /Y "%REPO%dashboard.js"  "%REPO%js\modules\dashboard.js"  && echo [OK] dashboard.js  || echo [FALTA] Descarga dashboard.js
copy /Y "%REPO%auth.js"       "%REPO%js\auth.js"               && echo [OK] auth.js       || echo [FALTA] Descarga auth.js
copy /Y "%REPO%db.js"         "%REPO%js\db.js"                 && echo [OK] db.js         || echo [FALTA] Descarga db.js
copy /Y "%REPO%base.css"      "%REPO%css\base.css"             && echo [OK] base.css      || echo [FALTA] Descarga base.css

echo.
echo === GIT PUSH ===
cd "%REPO%"
git add .
git commit -m "fix: actualizacion completa %date%"
git push
echo.
echo LISTO
pause
