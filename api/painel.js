// Painel da meta: calcula (ou pega do cache) o dia e entrega o template com os dados da pessoa logada.
import fs from 'node:fs';
import path from 'node:path';
import { listarUsuarios, usuarioDaSessao } from '../lib/auth.js';
import { getJSON, setJSON } from '../lib/redis.js';
import { calcularDia, hojeBR } from '../lib/meta.js';
import { calcularDiaDemo, modoDemo } from '../lib/demo.js';
import { protegido, query, redirecionar } from '../lib/http.js';

const TEMPLATE = fs.readFileSync(path.join(process.cwd(), 'templates', 'meta.html'), 'utf8');
const CAMPOS = ['contamNoPainel', 'resolvidosPorMim', 'semMeuNome', 'encaminhados', 'retornos', 'melhorias', 'chamados'];

function html(res, status, corpo) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(corpo);
}

export default protegido(async function handler(req, res) {
  const u = await usuarioDaSessao(req);
  if (!u) return redirecionar(res, '/login');
  if (u.trocarSenha) return redirecionar(res, '/login?trocar=1');

  const q = query(req);
  let data = q.get('data');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) data = hojeBR();
  const atualizar = q.get('atualizar') === '1';
  const chave = 'meta:' + data;

  let dados = atualizar ? null : await getJSON(chave);
  if (!dados) {
    try {
      dados = modoDemo() ? calcularDiaDemo(data, Number(process.env.META || 10)) : await calcularDia(data, Number(process.env.META || 10));
      // Hoje muda o tempo todo: cache curto. Dias passados quase não mudam.
      await setJSON(chave, dados, data === hojeBR() ? 300 : 6 * 3600);
    } catch (e) {
      return html(res, 502, `<meta charset="utf-8"><body style="font-family:sans-serif;padding:30px"><h2>Não foi possível consultar o HelpRex</h2><p>${String(e.message).replace(/</g, '&lt;')}</p><p><a href="/?data=${data}">Tentar de novo</a></p></body>`);
    }
  }
  if (atualizar) return redirecionar(res, `/?data=${data}`);

  // Meta de cada analista: a definida no usuário dele no Admin, senão a padrão
  const metaPadrao = Number(process.env.META || 10);
  const metaPor = {};
  for (const x of await listarUsuarios()) if (x.helprexId && x.meta) metaPor[x.helprexId] = x.meta;
  const comMeta = a => ({ ...a, meta: metaPor[a.id] || metaPadrao });

  // Visão da pessoa logada: campos do topo = analista dela; seletor só se ela puder ver os outros
  const vazio = { id: u.helprexId, nome: u.nome, contamNoPainel: 0, resolvidosPorMim: 0, semMeuNome: 0, encaminhados: 0, retornos: 0, melhorias: 0, chamados: [] };
  const meu = comMeta(dados.analistas.find(a => a.id === u.helprexId) || vazio);
  let analistas = u.verTodos ? dados.analistas.map(comMeta) : [];
  if (u.verTodos && u.helprexId && !analistas.some(a => a.id === u.helprexId)) analistas.unshift(meu);
  if (u.helprexId) analistas.sort((a, b) => (b.id === u.helprexId) - (a.id === u.helprexId));

  const visao = {
    data: dados.data, dataBr: dados.dataBr, gerado: dados.gerado, meta: meu.meta,
    eu: u.helprexId, nomeEu: meu.nome || u.nome,
    ...Object.fromEntries(CAMPOS.map(c => [c, meu[c]])),
    analistas,
    usuario: { nome: u.nome, admin: !!u.admin }
  };
  html(res, 200, TEMPLATE.replace('__DADOS__', JSON.stringify(visao).replace(/</g, '\\u003c')));
});
