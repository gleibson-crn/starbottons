// Ressincroniza o relógio do WSL/Docker com o do Windows.
//
// Por que existe: no WSL2/Docker Desktop o relógio da VM costuma "adiantar"
// depois que a máquina hiberna. Isso faz os tokens do Supabase local nascerem
// com timestamp no futuro e o servidor rejeita com "JWT issued at future"
// (login/upload falham). Rodar `npm run fix:clock` corrige na hora.
import { execSync } from 'node:child_process';

const epoch = Math.floor(Date.now() / 1000);
try {
  execSync(`wsl -d docker-desktop --exec date -s "@${epoch}"`, { stdio: 'inherit' });
  console.log('OK: relógio do WSL/Docker ressincronizado. Recarregue a página (Ctrl+Shift+R).');
} catch (err) {
  console.error(
    'Não foi possível ressincronizar automaticamente.\n' +
      'Alternativa: reinicie o Docker Desktop.\n' +
      'Detalhe: ' + (err && err.message ? err.message : err),
  );
  process.exit(1);
}
