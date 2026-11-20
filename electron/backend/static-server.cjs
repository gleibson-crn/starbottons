// Servidor estático interno do Electron (ADR-032, Fase 5).
//
// Serve o `ng build` (dist/starbottons/browser) sob origem http://127.0.0.1:<porta
// efêmera>, com SPA fallback (rotas do Angular router caem no index.html). É o que
// substitui o `ng serve` no app EMPACOTADO (.exe) e no build local — o app roda sob
// a MESMA origem http:// do dev, então blob URLs, fetch e rotas funcionam idênticos.
// Sem dependência externa (http nativo).
const { createServer } = require('node:http');
const { createReadStream, existsSync, statSync } = require('node:fs');
const { join, normalize, extname } = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

/** Resolve o arquivo pedido dentro de root, BARRANDO path traversal; null se escapar. */
function safePath(root, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  const abs = normalize(join(root, clean));
  // startsWith(root) barra `..` que escape da raiz (normalize já colapsou os `..`).
  return abs === root || abs.startsWith(root + require('node:path').sep) ? abs : null;
}

function send(res, file, status = 200) {
  res.writeHead(status, {
    'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}

/**
 * Sobe o servidor estático e resolve com { url, close }. SPA fallback: toda rota
 * sem arquivo correspondente serve index.html (deep links do Angular router).
 */
function startStaticServer(root) {
  const index = join(root, 'index.html');
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const file = safePath(root, req.url || '/');
      if (file && existsSync(file) && statSync(file).isFile()) {
        send(res, file);
      } else {
        send(res, index); // rota do Angular / deep link
      }
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

module.exports = { startStaticServer };
