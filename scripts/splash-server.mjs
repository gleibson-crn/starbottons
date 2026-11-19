#!/usr/bin/env node
/**
 * Splash LOCAL (127.0.0.1:4288) — tela de carregamento do atalho.
 *
 * O atalho (start-app.ps1) abre o Chrome AQUI imediatamente, enquanto o
 * `npm run up` ainda sobe Docker/Supabase/edge/web. A página mostra uma barra
 * de progresso e, quando o app responde, entra nele sozinha (redirect).
 *
 * Rotas:
 *   GET /        -> HTML da splash (inline).
 *   GET /status  -> {"stage","pct","port"} — estágio inferido SERVER-SIDE:
 *                   sem scripts/.web-port = "starting"; com .web-port mas app
 *                   sem responder = "compiling"; app respondendo = "ready".
 *
 * Só leitura; nada do cliente vira caminho/arquivo. EADDRINUSE encerra em
 * silêncio (outra instância já no ar). Processo filho do atalho, morto na
 * limpeza — nunca impede nem bloqueia o boot.
 */
import { readFileSync } from 'node:fs';
import { createServer, get as httpGet } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SPLASH_PORT = 4288;
const HERE = dirname(fileURLToPath(import.meta.url));
const PORT_FILE = join(HERE, '.web-port');

/** Porta do front escolhida pelo up.mjs (ou null se ainda não escolheu). */
function webPort() {
  try {
    const p = readFileSync(PORT_FILE, 'utf8').trim();
    return /^\d+$/.test(p) ? Number(p) : null;
  } catch {
    return null;
  }
}

/** true se `host:port` responde GET / com status < 400. */
function probe(host, port) {
  return new Promise((resolve) => {
    const req = httpGet({ host, port, path: '/', timeout: 1500 }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * true se o front já responde na porta. Sonda IPv4 E IPv6: no Windows o
 * `ng serve` costuma escutar só em `::1` (IPv6), onde `127.0.0.1` recusa —
 * se sondasse só IPv4, a splash nunca detectaria "pronto".
 */
async function appReady(port) {
  const results = await Promise.all([probe('127.0.0.1', port), probe('::1', port)]);
  return results.some(Boolean);
}

async function status() {
  const port = webPort();
  if (port === null) {
    return { stage: 'starting', pct: 25, port: null };
  }
  if (await appReady(port)) {
    return { stage: 'ready', pct: 100, port };
  }
  return { stage: 'compiling', pct: 65, port };
}

const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Iniciando Star Bottons…</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 28px; font-family: "Segoe UI", system-ui, sans-serif; color: #f3e8ff;
    background: radial-gradient(120% 120% at 50% 0%, #2a0f45 0%, #140a1f 60%, #0d0714 100%);
    user-select: none; -webkit-user-select: none;
  }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 30px; font-weight: 700; letter-spacing: .5px; }
  .star { color: #c084fc; animation: pulse 1.8s ease-in-out infinite; }
  .bar { width: min(420px, 72vw); height: 10px; border-radius: 999px; background: #3a2850; overflow: hidden; }
  .fill {
    height: 100%; width: 10%; border-radius: 999px;
    background: linear-gradient(90deg, #a855f7, #d8b4fe);
    transition: width .6s cubic-bezier(.4,0,.2,1);
    box-shadow: 0 0 12px #a855f7aa;
  }
  .label { font-size: 15px; color: #d8c7ef; min-height: 20px; }
  .hint { font-size: 12.5px; color: #9a84b8; max-width: 360px; text-align: center; line-height: 1.5; }
  @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .55; transform: scale(.9); } }
</style>
</head>
<body>
  <div class="brand"><span class="star">★</span> Star Bottons</div>
  <div class="bar"><div class="fill" id="fill"></div></div>
  <div class="label" id="label">Iniciando serviços…</div>
  <div class="hint">O sistema está carregando. Isso pode levar alguns instantes na primeira vez (banco e compilação).</div>
<script>
  var fill = document.getElementById('fill');
  var label = document.getElementById('label');
  var LABELS = {
    starting: 'Iniciando serviços…',
    compiling: 'Preparando o sistema…',
    ready: 'Pronto! Abrindo…'
  };
  var shown = 10;                       // % mostrado (sobe suave, nunca volta)
  var t0 = Date.now();
  var hint = document.querySelector('.hint');
  function tick() {
    fetch('/status', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (s) {
        label.textContent = LABELS[s.stage] || LABELS.starting;
        if (s.stage !== 'ready' && Date.now() - t0 > 360000) {
          hint.textContent = 'Está demorando mais que o normal. Confira a janela "Star Bottons (servidor)" na barra de tarefas.';
        }
        // nunca retrocede a barra; cresce um pouco a cada ciclo p/ parecer viva
        var target = Math.max(shown, s.pct || 10);
        if (s.stage !== 'ready' && target < 92) target = Math.min(92, target + 3);
        shown = target;
        fill.style.width = shown + '%';
        if (s.stage === 'ready' && s.port) {
          fill.style.width = '100%';
          setTimeout(function () {
            window.location.replace('http://localhost:' + s.port);
          }, 350);
          return;
        }
        setTimeout(tick, 700);
      })
      .catch(function () { setTimeout(tick, 1000); });
  }
  tick();
</script>
</body>
</html>`;

export function createSplashServer() {
  return createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    if (path === '/status') {
      status().then((s) => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(s));
      });
      return;
    }
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(HTML);
      return;
    }
    res.writeHead(404).end();
  });
}

/** Sobe o servidor; EADDRINUSE (outra instância) encerra em silêncio. */
export function startSplashServer(port = Number(process.env.SB_SPLASH_PORT) || SPLASH_PORT) {
  const server = createSplashServer();
  server.on('error', () => process.exit(0));
  server.listen(port, '127.0.0.1');
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  startSplashServer();
}
