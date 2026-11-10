import { LOGIN_DEMO, confereSenha, gravarCookie, hashSenha, registrarAcesso, salvarUsuario, usuarioDaSessao } from '../lib/auth.js';
import { modoDemo } from '../lib/demo.js';
import { corpo, ip, json, protegido } from '../lib/http.js';

export default protegido(async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST' });
  const u = await usuarioDaSessao(req);
  if (!u) return json(res, 401, { erro: 'Sessão expirada. Entre de novo.' });
  if (modoDemo() && u.login === LOGIN_DEMO) return json(res, 400, { erro: 'Na demonstração a senha do visitante não pode ser trocada.' });
  const { atual, nova } = await corpo(req);
  if (!confereSenha(String(atual || ''), u.senha)) return json(res, 400, { erro: 'A senha atual está errada.' });
  if (String(nova || '').length < 6) return json(res, 400, { erro: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  if (nova === atual) return json(res, 400, { erro: 'A nova senha precisa ser diferente da atual.' });

  u.senha = hashSenha(nova);
  u.trocarSenha = false;
  u.versao += 1;   // encerra outras sessões abertas com a senha antiga
  await salvarUsuario(u);
  await registrarAcesso(u.login, true, ip(req), 'trocou a senha');
  gravarCookie(res, u);
  json(res, 200, { ok: true });
});
