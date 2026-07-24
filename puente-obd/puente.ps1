# NexusPro - Puente OBD USB: ejecuta el C# dentro de PowerShell de 32 bits.
# Sin .exe en disco (los antivirus marcan exes sin firma como falso positivo);
# el codigo corre dentro de powershell.exe, firmado por Microsoft.
# Lanzar con iniciar-puente.bat (o doble clic aqui con "Ejecutar con PowerShell").
$ErrorActionPreference = 'Stop'
if ([Environment]::Is64BitProcess) {
  # Relanzarse en PowerShell de 32 bits: la DLL RP1210 (NXULNK32) es x86
  & "$env:windir\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -ExecutionPolicy Bypass -NoProfile -File $MyInvocation.MyCommand.Path
  exit $LASTEXITCODE
}
Add-Type -Path (Join-Path $PSScriptRoot 'NexusPuenteOBD.cs') -ReferencedAssemblies 'System.Web.Extensions'
[PuenteOBD]::Main()
