@echo off
rem NexusPro - Sonda de K-line por J2534 (USB-Link)
rem Corre en PowerShell de 32 bits: las DLL J2534 son x86.
rem Vehiculo enchufado y switch en contacto. No modifica nada del vehiculo.
cd /d "%~dp0"
%windir%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0probar-kline.ps1"
pause
