<#
  Cria o atalho "Star Bottons" na área de trabalho do Windows.

  Rode UMA VEZ (clique direito > "Executar com o PowerShell", ou
  `powershell -ExecutionPolicy Bypass -File scripts\create-desktop-shortcut.ps1`).
  Gera um ícone (estrela sobre fundo roxo) e um .lnk que chama start-app.ps1:
  sobe a aplicação e abre o Chrome em modo app. Pode rodar de novo para recriar.
#>

$ErrorActionPreference = 'Stop'
$proj       = Split-Path -Parent $PSScriptRoot
$startPs1   = Join-Path $PSScriptRoot 'start-app.ps1'
$iconPath   = Join-Path $PSScriptRoot 'starbottons.ico'

# 1. Gera o ícone (estrela branca sobre fundo roxo) via System.Drawing.
Add-Type -AssemblyName System.Drawing
$size = 256
$bmp  = New-Object System.Drawing.Bitmap $size, $size
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(124, 58, 237))   # roxo (#7c3aef)
$font = New-Object System.Drawing.Font('Segoe UI Symbol', 150, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fmt  = New-Object System.Drawing.StringFormat
$fmt.Alignment     = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
$g.DrawString([char]0x2605, $font, [System.Drawing.Brushes]::White, $rect, $fmt)  # ★
$g.Dispose()

$hicon = $bmp.GetHicon()
$icon  = [System.Drawing.Icon]::FromHandle($hicon)
$fs    = [System.IO.File]::Create($iconPath)
$icon.Save($fs)
$fs.Close()
$icon.Dispose(); $bmp.Dispose()
Write-Host "Ícone criado: $iconPath"

# 2. Cria o atalho na área de trabalho.
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Star Bottons.lnk'
$shell   = New-Object -ComObject WScript.Shell
$sc      = $shell.CreateShortcut($lnkPath)
$sc.TargetPath       = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
$sc.Arguments        = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startPs1`""
$sc.WorkingDirectory = $proj
$sc.IconLocation     = "$iconPath,0"
$sc.Description       = 'Sobe o Star Bottons e abre no Chrome (modo app)'
$sc.WindowStyle      = 7   # inicia minimizado (a janela do PowerShell fica oculta)
$sc.Save()
Write-Host "Atalho criado: $lnkPath"
Write-Host 'Pronto! Dê dois cliques em "Star Bottons" na área de trabalho.'
