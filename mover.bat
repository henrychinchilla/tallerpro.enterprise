@echo off
:: Mover archivos de la raiz a sus carpetas correctas
cd /d "%~dp0"

echo Moviendo archivos a sus carpetas correctas...

if exist "vehiculos.js"  (move /Y "vehiculos.js"  "js\modules\vehiculos.js"  && echo [OK] vehiculos.js)
if exist "rrhh.js"       (move /Y "rrhh.js"       "js\modules\rrhh.js"       && echo [OK] rrhh.js)
if exist "pages.js"      (move /Y "pages.js"       "js\modules\pages.js"      && echo [OK] pages.js)
if exist "finanzas.js"   (move /Y "finanzas.js"    "js\modules\finanzas.js"   && echo [OK] finanzas.js)
if exist "dashboard.js"  (move /Y "dashboard.js"   "js\modules\dashboard.js"  && echo [OK] dashboard.js)
if exist "auth.js"       (move /Y "auth.js"        "js\auth.js"               && echo [OK] auth.js)
if exist "db.js"         (move /Y "db.js"          "js\db.js"                 && echo [OK] db.js)
if exist "base.css"      (move /Y "base.css"       "css\base.css"             && echo [OK] base.css)

echo.
echo === GIT PUSH ===
git add .
git commit -m "fix: mover archivos a carpetas correctas"
git push

echo LISTO - Espera 2 minutos y recarga
pause
