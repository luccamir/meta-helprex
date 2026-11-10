import { buscarUsuario, confereSenha, garantirAdminInicial, garantirUsuarioDemo, gravarCookie, normalizarLogin, registrarAcesso, salvarUsuario } from '../lib/auth.js';
import { modoDemo } from '../lib/demo.js';
import { redis } from '../lib/redis.js';
import { corpo, ip, json, protegido } from '../lib/http.js';

const MAX_FALHAS = 8;          // tentativas erradas por login
const BLOQUEIO_SEG = 15 * 60;  // bloqueio de 15 minutos

export default protegido(async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST' });
  const { login: l, senha } = await corpo(req);
  const login = normalizarLogin(l);
  const origem = ip(req);
  if (!login || !senha) return json(res, 400, { erro: 'Informe usuário e senha.' });

  const chaveFalhas = 'falhas:' + login;
  if (Number(await redis('GET', chaveFalhas) || 0) >= MAX_FALHAS) {
    await registrarAcesso(login, false, origem, 'bloqueado');
    return json(res, 429, { erro: 'Muitas tentativas. Aguarde 15 minutos ou peça ao administrador.' });
  }

  const u = (await buscarUsuario(login)) || (await garantirAdminInicial(login)) || (modoDemo() ? await garantirUsuarioDemo(login) : null);
  if (!u || !u.ativo || !confereSenha(senha, u.senha)) {
    await redis('INCR', chaveFalhas);
    await redis('EXPIRE', chaveFalhas, BLOQUEIO_SEG);
    await registrarAcesso(login, false, origem, u && !u.ativo ? 'usuário desativado' : 'senha errada');
    return json(res, 401, { erro: 'Usuário ou senha inválidos.' });
  }

  await redis('DEL', chaveFalhas);
  u.ultimoAcesso = new Date().toISOString();
  await salvarUsuario(u);
  await registrarAcesso(login, true, origem);
  gravarCookie(res, u);
  json(res, 200, { ok: true, trocarSenha: !!u.trocarSenha, nome: u.nome });
});
