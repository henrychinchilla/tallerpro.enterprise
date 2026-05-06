@echo off
:: TallerPro - Actualizar todos los archivos
:: Ejecutar desde la carpeta raiz del repo: tallerpro-enterprise\
echo Actualizando archivos de TallerPro...

:: Verificar que estamos en la carpeta correcta
if not exist "index.html" (
    echo ERROR: Ejecuta este script desde la carpeta tallerpro-enterprise
    pause
    exit /b 1
)

echo [1/8] Actualizando vehiculos.js...
copy /Y "%~dp0vehiculos.js" "js\modules\vehiculos.js"

echo [2/8] Actualizando rrhh.js...
copy /Y "%~dp0rrhh.js" "js\modules\rrhh.js"

echo [3/8] Actualizando pages.js...
copy /Y "%~dp0pages.js" "js\modules\pages.js"

echo [4/8] Actualizando auth.js...
copy /Y "%~dp0auth.js" "js\auth.js"

echo [5/8] Actualizando db.js...
copy /Y "%~dp0db.js" "js\db.js"

echo [6/8] Actualizando finanzas.js...
copy /Y "%~dp0finanzas.js" "js\modules\finanzas.js"

echo [7/8] Actualizando base.css...
copy /Y "%~dp0base.css" "css\base.css"

echo [8/8] Actualizando dashboard.js...
copy /Y "%~dp0dashboard.js" "js\modules\dashboard.js"

echo.
echo === VERIFICANDO CAMBIOS ===
findstr /C:"title=\"Editar\">Editar" "js\modules\vehiculos.js" > nul
if %errorlevel%==0 (echo [OK] vehiculos.js - boton Editar presente) else (echo [ERROR] vehiculos.js - boton Editar NO encontrado)

findstr /C:"cambiarEstadoFactura" "js\modules\pages.js" > nul
if %errorlevel%==0 (echo [OK] pages.js - cambio estado FEL presente) else (echo [ERROR] pages.js - cambio estado FEL NO encontrado)

findstr /C:"getTenantId" "js\db.js" > nul
if %errorlevel%==0 (echo [OK] db.js - correcto) else (echo [ERROR] db.js - problema)

echo.
echo === HACIENDO GIT PUSH ===
git add .
git status
git commit -m "fix: actualizacion completa %date% %time%"
git push

echo.
echo LISTO. Espera 1-2 minutos y recarga la aplicacion.
pause
