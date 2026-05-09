@echo off
cd /d "%~dp0"
echo Moviendo archivos...

:: Crear carpetas si no existen
if not exist "electron" mkdir electron
if not exist "js\modules" mkdir js\modules

:: Archivos JS del sistema
if exist "auth.js"      move /Y "auth.js"      "js\auth.js"
if exist "db.js"        move /Y "db.js"         "js\db.js"
if exist "version.js"   move /Y "version.js"    "js\version.js"
if exist "app.js"       move /Y "app.js"        "js\app.js"

:: Módulos
if exist "vehiculos.js"  move /Y "vehiculos.js"  "js\modules\vehiculos.js"
if exist "rrhh.js"       move /Y "rrhh.js"        "js\modules\rrhh.js"
if exist "pages.js"      move /Y "pages.js"       "js\modules\pages.js"
if exist "finanzas.js"   move /Y "finanzas.js"    "js\modules\finanzas.js"
if exist "dashboard.js"  move /Y "dashboard.js"   "js\modules\dashboard.js"
if exist "clientes.js"   move /Y "clientes.js"    "js\modules\clientes.js"
if exist "ordenes.js"    move /Y "ordenes.js"     "js\modules\ordenes.js"
if exist "inventario.js" move /Y "inventario.js"  "js\modules\inventario.js"
if exist "proveedores.js" move /Y "proveedores.js" "js\modules\proveedores.js"

:: CSS
if exist "base.css"     move /Y "base.css"      "css\base.css"

:: Electron
if exist "main.js"      move /Y "main.js"       "electron\main.js"
if exist "offline.html" move /Y "offline.html"  "electron\offline.html"

:: Raiz
:: manifest.json, sw.js, package.json, index.html — quedan en raiz

echo.
echo === GIT PUSH ===
git add .gitignore electron\ js\ css\ manifest.json sw.js package.json index.html LICENSE.txt
git status
git commit -m "update: %date%"
git push
echo LISTO
pause
