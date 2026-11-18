<#
  Star Bottons — inicia a aplicação, abre o Chrome em modo "app" e, ao fechar
  a janela, desliga o que ESTE projeto subiu.

  Chamado pelo atalho da área de trabalho (ver create-desktop-shortcut.ps1).
  Sobe tudo com `npm run up` numa janela de console PRÓPRIA (minimizada). O
  `up.mjs` escolhe a porta do front (prefere a 4200; se ocupada, usa a próxima
  livre) e grava o número em `scripts\.web-port`. Este script lê essa porta e,
  quando o front responde, abre o Chrome em `--app` com um PERFIL DEDICADO
  (`scripts\.chrome-profile`) — sem isso o Chrome delega a uma instância já
  aberta e o processo lançado sai na hora, impedindo de aguardar o fechamento.

  Ao fechar o Chrome (botão "Sair" do app ou o X): LIMPEZA
    (a) encerra a árvore do servidor por PID (taskkill /T /F);
    (b) libera a porta do front e apaga scripts\.web-port;
    (c) `supabase stop` NA PASTA DO PROJETO;
    (d) se existir scripts\.do-update (gravado pelo botão "Atualizar agora" via
        POST http://localhost:4299/do-update): roda `node scripts/update.mjs apply`
        (com o servidor JÁ parado, senão node_modules fica travado) e, em sucesso,
        RE-LANÇA o app (no máx. 1 vez). Em falha mostra a mensagem e encerra.
  Antes de subir, roda `node scripts/update.mjs check` (tolerante) para o front já
  enxergar o flag scripts\.update-available.
  NUNCA encerra o Docker Desktop, NUNCA usa `supabase stop --all`: Docker e os
  outros projetos (Controle Fitness, Nexgency) ficam intactos.

  Fallback: sem Chrome abre o navegador padrão (não dá para aguardá-lo, então
  não há limpeza automática — feche a janela "Star Bottons (servidor)").
#>

$ErrorActionPreference = 'SilentlyContinue'
$proj       = Split-Path -Parent $PSScriptRoot
$portFile   = Join-Path $PSScriptRoot '.web-port'
$profileDir = Join-Path $PSScriptRoot '.chrome-profile'

function Find-Chrome {
  $paths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  return ($paths | Where-Object { Test-Path $_ } | Select-Object -First 1)
}

# Abre o app e devolve o Process do Chrome (para aguardar), ou $null no
# fallback do navegador padrão (não há como aguardá-lo).
function Open-App([string]$url) {
  $chrome = Find-Chrome
  if ($chrome) {
    New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
    return Start-Process -FilePath $chrome -PassThru -ArgumentList @(
      "--user-data-dir=`"$profileDir`"", "--app=$url",
      '--no-first-run', '--no-default-browser-check')
  }
  Start-Process $url   # fallback: navegador padrão
  return $null
}

# Encerra o servidor e libera o que ESTE projeto subiu (ver cabeçalho).
function Stop-AppStack($serverProc) {
  # (a) árvore do servidor (cmd -> npm -> node ...) pelo PID capturado
  if ($serverProc) { & taskkill.exe /PID $serverProc.Id /T /F 2>&1 | Out-Null }

  # (b) porta do front: só mata se ainda houver um node escutando nela
  if (Test-Path $portFile) {
    $p = (Get-Content $portFile -Raw).Trim()
    if ($p -match '^\d+$') {
      Get-NetTCPConnection -LocalPort ([int]$p) -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object {
          $owner = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
          if ($owner -and $owner.ProcessName -eq 'node') {
            & taskkill.exe /PID $owner.Id /T /F 2>&1 | Out-Null
          }
        }
    }
    Remove-Item $portFile -ErrorAction SilentlyContinue
  }

  # (c) só os containers DESTE projeto (config.toml da pasta). Docker segue de pé.
  Push-Location $proj
  try { & supabase stop 2>&1 | Out-Null } finally { Pop-Location }
}

$doUpdateFile = Join-Path $PSScriptRoot '.do-update'
$resultFile   = Join-Path $PSScriptRoot '.update-result'
$updateMjs    = Join-Path $PSScriptRoot 'update.mjs'

# Checa se há versão nova (tolerante: offline/erro = sem update; nunca trava a abertura).
function Invoke-UpdateCheck {
  try { & node $updateMjs check 2>&1 | Out-Null } catch { }
}

# Aplica o update pedido (flag .do-update). Devolve $true se aplicou, $false se
# falhou, $null se não havia pedido. Chamado SÓ depois de Stop-AppStack.
function Invoke-PendingUpdate {
  if (-not (Test-Path $doUpdateFile)) { return $null }
  Remove-Item $doUpdateFile -ErrorAction SilentlyContinue
  Remove-Item $resultFile -ErrorAction SilentlyContinue
  Push-Location $proj
  try { & node $updateMjs apply 2>&1 | Out-Null } finally { Pop-Location }
  $applied = ($LASTEXITCODE -eq 0)
  if (-not $applied) {
    $msg = 'A atualização não pôde ser concluída.'
    if (Test-Path $resultFile) {
      try { $msg = (Get-Content $resultFile -Raw -Encoding UTF8 | ConvertFrom-Json).message } catch { }
    }
    (New-Object -ComObject WScript.Shell).Popup(
      "$msg`n`nDetalhes: scripts\.update.log", 0, 'Star Bottons', 48) | Out-Null
  }
  return $applied
}

# Uma sessão completa: sobe servidor, abre o Chrome, aguarda fechar e limpa.
function Start-Session {
  # Limpa a porta da execução anterior (o up.mjs grava a nova ao escolhê-la).
  Remove-Item $portFile -ErrorAction SilentlyContinue

  # Sobe a aplicação numa janela de console própria (= o servidor), minimizada:
  # aparece só na barra de tarefas (clique nela para ver os logs). PID capturado.
  $server = Start-Process -FilePath 'cmd.exe' -PassThru -WindowStyle Minimized `
    -ArgumentList '/k', "title Star Bottons (servidor) && cd /d `"$proj`" && npm run up"

  $deadline = (Get-Date).AddMinutes(12)

  # 1) Espera o up.mjs gravar a porta escolhida (após Docker+Supabase+clock).
  $port = $null
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $portFile) {
      $port = (Get-Content $portFile -Raw).Trim()
      if ($port) { break }
    }
    Start-Sleep -Seconds 2
  }
  if (-not $port) { $port = '4200' }   # fallback
  $url = "http://localhost:$port"

  # 2) Espera o front responder nessa porta.
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    try {
      if ((Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3).StatusCode -ge 200) { $ready = $true; break }
    } catch { Start-Sleep -Seconds 3 }
  }

  # 3) Abre o Chrome em modo app (perfil dedicado), aguarda fechar e limpa.
  if ($ready) {
    $chromeProc = Open-App $url
    if ($chromeProc) {
      Wait-Process -Id $chromeProc.Id
      Stop-AppStack $server
    }
  } else {
    (New-Object -ComObject WScript.Shell).Popup(
      'O Star Bottons demorou a subir. Confira a janela "Star Bottons (servidor)".',
      15, 'Star Bottons', 48) | Out-Null
  }
}

# Ciclo: check -> sessão -> (se o dono pediu) apply -> re-lança no máximo 1 vez.
# Em falha do apply NÃO re-lança (sem loop): mostra a mensagem e encerra.
$relaunched = $false
do {
  Invoke-UpdateCheck
  Start-Session
  $applied = Invoke-PendingUpdate
  $again = ($applied -eq $true) -and (-not $relaunched)
  if ($again) { $relaunched = $true }
} while ($again)
