@echo off
rem NexusPro - Instalador del Puente OBD USB (RP1210)
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
echo Configurando arranque automatico con Windows...
powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([Environment]::GetFolderPath('Startup')+'\NexusPro Puente OBD.lnk'); $s.TargetPath='%PS32%'; $s.Arguments='-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \"%DEST%\puente.ps1\"'; $s.WorkingDirectory='%DEST%'; $s.Save(); $d=$w.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Puente OBD USB.lnk'); $d.TargetPath='%DEST%\iniciar-puente.bat'; $d.WorkingDirectory='%DEST%'; $d.IconLocation='%SystemRoot%\System32\shell32.dll,12'; $d.Save()"
echo Iniciando puente en segundo plano...
start "" "%PS32%" -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "%DEST%\puente.ps1"
echo.
echo LISTO. El puente ya esta corriendo, oculto, y arrancara solo con Windows.
echo (El icono "Puente OBD USB" del escritorio es opcional, para verlo en modo visible.)
timeout /t 8 >nul
endlocal
