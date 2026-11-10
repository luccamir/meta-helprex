// Usuários, senhas (scrypt com sal) e sessão em cookie assinado (HMAC).
import crypto from 'node:crypto';
import { redis, getJSON, setJSON } from './redis.js';
import { modoDemo } from './demo.js';

const SEGREDO = () => String(process.env.SESSION_SECRET || '').trim() || 'troque-este-segredo-local';
const HORAS_SESSAO = 12;

export function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString('hex');
  return `${sal}:${crypto.scryptSync(senha, sal, 64).toString('hex')}`;
}

export function confereSenha(senha, guardada) {
  if (!guardada) return false;
  const [sal, hash] = guardada.split(':');
  const calc = crypto.scryptSync(senha, sal, 64);
  const esperado = Buffer.from(hash, 'hex');
  return calc.length === esperado.length && crypto.timingSafeEqual(calc, esperado);
}

const assinar = p => crypto.createHmac('sha256', SEGREDO()).update(p).digest('base64url');

// A sessão guarda a "versão" do usuário: resetar senha ou desativar invalida as sessões abertas
export function criarToken(usuario) {
  const p = Buffer.from(JSON.stringify({ l: usuario.login, v: usuario.versao, e: Date.now() + HORAS_SESSAO * 3600e3 })).toString('base64url');
  return `${p}.${assinar(p)}`;
}

function lerToken(token) {
  if (!token) return null;
  const [p, s] = token.split('.');
  if (!p || !s) return null;
  const esperado = assinar(p);
  if (esperado.length !== s.length || !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(s))) return null;
  const o = JSON.parse(Buffer.from(p, 'base64url').toString());
  return o.e > Date.now() ? o : null;
}

function cookies(req) {
  const o = {};
  for (const c of String(req.headers.cookie || '').split(';')) {
    const i = c.indexOf('=');
    if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  }
  return o;
}

export function gravarCookie(res, usuario) {
  res.setHeader('Set-Cookie', `sessao=${criarToken(usuario)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${HORAS_SESSAO * 3600}`);
}

export function apagarCookie(res) {
  res.setHeader('Set-Cookie', 'sessao=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
}

export const normalizarLogin = l => String(l || '').trim().toLowerCase();
export const buscarUsuario = login => getJSON('user:' + normalizarLogin(login));

export async function salvarUsuario(u) {
  await setJSON('user:' + u.login, u);
  await redis('SADD', 'usuarios', u.login);
}

export async function excluirUsuario(login) {
  await redis('DEL', 'user:' + login);
  await redis('SREM', 'usuarios', login);
}

export async function listarUsuarios() {
  const logins = await redis('SMEMBERS', 'usuarios');
  const lista = await Promise.all(logins.map(buscarUsuario));
  return lista.filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function usuarioDaSessao(req) {
  const t = lerToken(cookies(req).sessao);
  if (!t) return null;
  let u = await buscarUsuario(t.l);
  // Demonstração sem banco: cada instância do servidor tem a própria memória, então recria o visitante
  if (!u && modoDemo() && t.l === LOGIN_DEMO) u = await garantirUsuarioDemo(t.l);
  return u && u.ativo && u.versao === t.v ? u : null;
}

// Primeiro acesso: o admin vem das variáveis ADMIN_LOGIN / ADMIN_SENHA_INICIAL (troca a senha no 1º login)
export async function garantirAdminInicial(login) {
  const env = k => String(process.env[k] || '').trim();
  const adm = normalizarLogin(env('ADMIN_LOGIN'));
  if (!adm || login !== adm || !env('ADMIN_SENHA_INICIAL')) return null;
  if (await buscarUsuario(adm)) return null;
  const u = {
    login: adm, nome: env('ADMIN_NOME') || 'Administrador', helprexId: env('ADMIN_HELPREX_ID'),
    admin: true, verTodos: true, ativo: true, trocarSenha: true, versao: 1,
    senha: hashSenha(env('ADMIN_SENHA_INICIAL')), criadoEm: new Date().toISOString(), ultimoAcesso: null
  };
  await salvarUsuario(u);
  return u;
}

// Modo demonstração: visitante "demo" / "demo123", vê todos os analistas fictícios, não é admin
export const LOGIN_DEMO = 'demo';
export async function garantirUsuarioDemo(login) {
  if (login !== LOGIN_DEMO || (await buscarUsuario(LOGIN_DEMO))) return null;
  const u = {
    login: LOGIN_DEMO, nome: 'Visitante', helprexId: 'demo-ana', admin: false, verTodos: true, ativo: true,
    trocarSenha: false, versao: 1, meta: null, senha: hashSenha('demo123'), criadoEm: new Date().toISOString(), ultimoAcesso: null
  };
  await salvarUsuario(u);
  return u;
}

export async function registrarAcesso(login, ok, ip, detalhe = '') {
  await redis('LPUSH', 'acessos', JSON.stringify({ login, ok, ip, detalhe, quando: new Date().toISOString() }));
  await redis('LTRIM', 'acessos', 0, 499);
}

export async function ultimosAcessos(n = 100) {
  return (await redis('LRANGE', 'acessos', 0, n - 1)).map(x => JSON.parse(x));
}

// Dados do usuário que podem ir para o navegador (nunca a senha)
export const publico = u => ({
  login: u.login, nome: u.nome, helprexId: u.helprexId, admin: u.admin, verTodos: u.verTodos, meta: u.meta ?? null,
  ativo: u.ativo, trocarSenha: u.trocarSenha, criadoEm: u.criadoEm, ultimoAcesso: u.ultimoAcesso
});
