// Área do administrador: usuários do site e registro de acessos.
import { buscarUsuario, excluirUsuario, hashSenha, listarUsuarios, normalizarLogin, publico, registrarAcesso, salvarUsuario, ultimosAcessos, usuarioDaSessao } from '../lib/auth.js';
import { getJSON, setJSON, redis } from '../lib/redis.js';
import { hx } from '../lib/helprex.js';
import { ANALISTAS_DEMO, modoDemo } from '../lib/demo.js';
import { corpo, ip, json, protegido } from '../lib/http.js';

// Meta diária do usuário: número de 1 a 200, ou null para usar a padrão (variável META)
function lerMeta(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1 || n > 200) throw Object.assign(new Error('A meta precisa ser um número de 1 a 200.'), { status: 400 });
  return n;
}

async function analistasHelpRex() {
  if (modoDemo()) return ANALISTAS_DEMO.map(a => ({ ...a, email: a.id.replace('demo-', '') + '@exemplo.com' }));
  let lista = await getJSON('cache:analistas');
  if (!lista) {
    lista = (await hx('users')).items.filter(u => u.isActive).map(u => ({ id: u.id, nome: u.name, email: u.email }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    await setJSON('cache:analistas', lista, 3600);
  }
  return lista;
}

export default protegido(async function handler(req, res) {
  const eu = await usuarioDaSessao(req);
  if (!eu) return json(res, 401, { erro: 'Sessão expirada. Entre de novo.' });
  if (!eu.admin) return json(res, 403, { erro: 'Somente o administrador acessa esta área.' });

  if (req.method === 'GET') {
    const [usuarios, acessos, analistas] = await Promise.all([listarUsuarios(), ultimosAcessos(150), analistasHelpRex()]);
    return json(res, 200, { eu: eu.login, metaPadrao: Number(process.env.META || 10), usuarios: usuarios.map(publico), acessos, analistas });
  }
  if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido' });

  const b = await corpo(req);
  const login = normalizarLogin(b.login);
  const origem = ip(req);
  if (!login) return json(res, 400, { erro: 'Informe o login.' });

  switch (b.acao) {
    case 'criar': {
      if (!/^[a-z0-9._-]{3,40}$/.test(login)) return json(res, 400, { erro: 'Login: 3 a 40 caracteres (letras, números, ponto, hífen ou _).' });
      if (await buscarUsuario(login)) return json(res, 409, { erro: 'Já existe um usuário com esse login.' });
      if (String(b.senha || '').length < 6) return json(res, 400, { erro: 'A senha padrão precisa ter pelo menos 6 caracteres.' });
      await salvarUsuario({
        login, nome: String(b.nome || login).trim(), helprexId: String(b.helprexId || ''),
        admin: !!b.admin, verTodos: b.verTodos !== false, ativo: true, trocarSenha: true, versao: 1, meta: lerMeta(b.meta),
        senha: hashSenha(String(b.senha)), criadoEm: new Date().toISOString(), ultimoAcesso: null
      });
      await registrarAcesso(eu.login, true, origem, `criou o usuário ${login}`);
      return json(res, 200, { ok: true });
    }
    case 'editar': {
      const u = await buscarUsuario(login);
      if (!u) return json(res, 404, { erro: 'Usuário não encontrado.' });
      if (login === eu.login && (b.admin === false || b.ativo === false)) return json(res, 400, { erro: 'Você não pode tirar o seu próprio acesso de administrador.' });
      if (b.nome !== undefined) u.nome = String(b.nome).trim() || u.nome;
      if (b.helprexId !== undefined) u.helprexId = String(b.helprexId);
      if (b.admin !== undefined) u.admin = !!b.admin;
      if (b.verTodos !== undefined) u.verTodos = !!b.verTodos;
      if (b.meta !== undefined) u.meta = lerMeta(b.meta);
      if (b.ativo !== undefined && !!b.ativo !== u.ativo) { u.ativo = !!b.ativo; u.versao += 1; }
      await salvarUsuario(u);
      await registrarAcesso(eu.login, true, origem, `editou o usuário ${login}`);
      return json(res, 200, { ok: true });
    }
    case 'resetar': {
      const u = await buscarUsuario(login);
      if (!u) return json(res, 404, { erro: 'Usuário não encontrado.' });
      if (String(b.senha || '').length < 6) return json(res, 400, { erro: 'A senha padrão precisa ter pelo menos 6 caracteres.' });
      u.senha = hashSenha(String(b.senha));
      u.trocarSenha = true;
      u.versao += 1;   // derruba as sessões abertas desse usuário
      await salvarUsuario(u);
      await redis('DEL', 'falhas:' + login);
      await registrarAcesso(eu.login, true, origem, `resetou a senha de ${login}`);
      return json(res, 200, { ok: true });
    }
    case 'excluir': {
      if (login === eu.login) return json(res, 400, { erro: 'Você não pode excluir o seu próprio usuário.' });
      await excluirUsuario(login);
      await registrarAcesso(eu.login, true, origem, `excluiu o usuário ${login}`);
      return json(res, 200, { ok: true });
    }
    default:
      return json(res, 400, { erro: 'Ação desconhecida.' });
  }
});
