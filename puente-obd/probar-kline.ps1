# NexusPro - Sonda de K-line por J2534: ejecuta el C# dentro de PowerShell de 32 bits.
# Sin .exe en disco, igual que el puente (los antivirus marcan exes sin firma).
# Lanzar con probar-kline.bat, con el vehiculo enchufado y el switch en contacto.
$ErrorActionPreference = 'Stop'
if ([Environment]::Is64BitProcess) {
  # Relanzarse en PowerShell de 32 bits: las DLL J2534 son x86
  & "$env:windir\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -ExecutionPolicy Bypass -NoProfile -File $MyInvocation.MyCommand.Path
  exit $LASTEXITCODE
}
Add-Type -Path (Join-Path $PSScriptRoot 'NexusJ2534Kline.cs')
[SondaKline]::Main()
