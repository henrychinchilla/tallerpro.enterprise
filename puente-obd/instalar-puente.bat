@echo off
rem NexusPro - Instalador del Puente OBD USB/RP1210 y Bluetooth clasico SPP
rem Un doble clic: descarga el puente, lo deja arrancando AUTOMATICAMENTE con
rem Windows (oculto, sin ventana) y lo inicia ya. No hay que correr nada a mano.
setlocal
set DEST=%USERPROFILE%\NexusPro\puente-obd
set URL=https://nexuspro.cmtelecommgt.com/puente-obd
set PS32=%windir%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe
if not exist "%DEST%" mkdir "%DEST%"
echo Descargando puente desde NexusPro...
curl -s -f -o "%DEST%\iniciar-puente.bat" %URL%/iniciar-puente.bat && curl -s -f -o "%DEST%\puente.ps1" %URL%/puente.ps1 && curl -s -f -o "%DEST%\NexusPuenteOBD.cs" %URL%/NexusPuenteOBD.cs
if errorlevel 1 (
  echo ERROR de descarga. Revisa la conexion a internet e intenta de nuevo.
  pause
  exit /b 1
)
rem Sonda de K-line por J2534: herramienta de diagnostico aparte, para vehiculos
rem livianos anteriores a ~2006 (K-line, no CAN). Que falle NO debe romper la
rem instalacion del puente, que es lo que la app necesita para escanear.
curl -s -f -o "%DEST%\probar-kline.bat" %URL%/probar-kline.bat >nul 2>&1
curl -s -f -o "%DEST%\probar-kline.ps1" %URL%/probar-kline.ps1 >nul 2>&1
curl -s -f -o "%DEST%\NexusJ2534Kline.cs" %URL%/NexusJ2534Kline.cs >nul 2>&1
echo Configurando arranque automatico con Windows (registro)...
rem HKCU\...\Run: queda en el registro de la maquina y no pide permisos de admin.
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "NexusPro Puente OBD" /t REG_SZ /d "\"%PS32%\" -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \"%DEST%\puente.ps1\"" /f >nul
rem Quita el acceso directo de Inicio que dejaban las versiones anteriores (evita doble arranque).
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\NexusPro Puente OBD.lnk" >nul 2>&1
rem Icono opcional en el escritorio, para verlo en modo visible.
powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $d=$w.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Puente OBD USB.lnk'); $d.TargetPath='%DEST%\iniciar-puente.bat'; $d.WorkingDirectory='%DEST%'; $d.IconLocation='%SystemRoot%\System32\shell32.dll,12'; $d.Save()"
echo Iniciando puente en segundo plano...
rem Si ya hay uno escuchando en 17210, no levantar otro (el segundo no podria abrir el puerto).
netstat -ano | findstr ":17210" >nul || start "" "%PS32%" -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "%DEST%\puente.ps1"
echo.
echo LISTO. El puente ya esta corriendo, oculto, y arrancara solo con Windows.
echo (El icono "Puente OBD USB" del escritorio es opcional, para verlo en modo visible.)
echo.
echo Extra: %DEST%\probar-kline.bat prueba K-line por J2534 en vehiculos
echo livianos anteriores a ~2006 (Mitsubishi, Suzuki, etc). Se corre a mano.
timeout /t 8 >nul
endlocal
