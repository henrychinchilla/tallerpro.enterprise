@echo off
rem NexusPro - Puente OBD USB (RP1210)
rem Ejecuta el puente dentro de PowerShell de 32 bits (la DLL RP1210 es x86).
rem No genera .exe: evita falsos positivos de antivirus en las PCs del taller.
cd /d "%~dp0"
%windir%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0puente.ps1"
pause
