<#
  Cria o atalho "Star Bottons (Electron)" na área de trabalho — abre a versão
  Electron (janela nativa, Fase 0) com dois cliques, SEM terminal à mão.

  NÃO substitui o atalho "Star Bottons" (versão Chrome). Reutiliza o ícone
  starbottons.ico (gerado por create-desktop-shortcut.ps1). Rode uma vez:
    powershell -ExecutionPolicy Bypass -File scripts\create-electron-shortcut.ps1
#>

$ErrorActionPreference = 'Stop'
$proj     = Split-Path -Parent $PSScriptRoot
$startPs1 = Join-Path $PSScriptRoot 'start-electron.ps1'
$iconPath = Join-Path $PSScriptRoot 'starbottons.ico'

if (-not (Test-Path $iconPath)) {
  Write-Host 'Ícone não encontrado — gerando pelo create-desktop-shortcut.ps1...'
  & (Join-Path $PSScriptRoot 'create-desktop-shortcut.ps1')
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Star Bottons (Electron).lnk'
$shell   = New-Object -ComObject WScript.Shell
$sc      = $shell.CreateShortcut($lnkPath)
$sc.TargetPath       = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
$sc.Arguments        = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startPs1`""
$sc.WorkingDirectory = $proj
$sc.IconLocation     = "$iconPath,0"
$sc.Description       = 'Abre o Star Bottons na janela nativa (Electron / Fase 0)'
$sc.WindowStyle      = 7   # minimizado (a janela do PowerShell fica oculta)
$sc.Save()
Write-Host "Atalho criado: $lnkPath"
Write-Host 'Pronto! Dê dois cliques em "Star Bottons (Electron)" na área de trabalho.'
