// Servidor local para testar antes de publicar: imita as rotas do vercel.json.
// Uso: node dev.js   (lê a chave da API de %USERPROFILE%\.helprex\apikey.txt se HELPREX_API_KEY não existir)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// No modo demonstração (DEMO=1) não precisa da chave do HelpRex
const arqChave = path.join(os.homedir(), '.helprex', 'apikey.txt');
if (!process.env.HELPREX_API_KEY && fs.existsSync(arqChave)) process.env.HELPREX_API_KEY = fs.readFileSync(arqChave, 'utf8').trim();
process.env.ADMIN_LOGIN ||= 'admin';
process.env.ADMIN_SENHA_INICIAL ||= 'trocar123';
process.env.ADMIN_NOME ||= 'Administrador';

const PORTA = Number(process.env.PORT || 3000);
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const rotas = { '/': '/api/painel', '/atualizar': '/api/painel?atualizar=1', '/login': '/login.html', '/admin': '/admin.html' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORTA}`);
    let destino = rotas[url.pathname];
    if (destino) {
      const d = new URL(destino, url);
      for (const [k, v] of url.searchParams) if (!d.searchParams.has(k)) d.searchParams.set(k, v);
      req.url = d.pathname + d.search;
    }
    const caminho = new URL(req.url, url).pathname;
    if (caminho.startsWith('/api/')) {
      const arq = path.join(process.cwd(), 'api', caminho.slice(5) + '.js');
      if (!fs.existsSync(arq)) { res.statusCode = 404; return res.end('Não encontrado'); }
      const mod = await import('file://' + arq.replace(/\\/g, '/'));
      return await mod.default(req, res);
    }
    const arq = path.join(process.cwd(), 'public', path.normalize(caminho).replace(/^([\\/])+/, ''));
    if (!arq.startsWith(path.join(process.cwd(), 'public')) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.statusCode = 404; return res.end('Não encontrado'); }
    res.setHeader('Content-Type', tipos[path.extname(arq)] || 'application/octet-stream');
    fs.createReadStream(arq).pipe(res);
  } catch (e) {
    console.error(e);
    res.statusCode = 500; res.end('Erro: ' + e.message);
  }
}).listen(PORTA, () => console.log(`Teste local em http://localhost:${PORTA}  (admin inicial: ${process.env.ADMIN_LOGIN} / ${process.env.ADMIN_SENHA_INICIAL})`));
