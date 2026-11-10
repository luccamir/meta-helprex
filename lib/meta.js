// Cálculo da meta do dia para todos os analistas ativos (mesmas regras do hx-meta.ps1).
import { hx, emLotes } from './helprex.js';

const TIPOS_MELHORIA = ['Novos recursos', 'Melhorias em recursos', 'Ajustes / Melhorias'];
// Endereço do painel do HelpRex da empresa (ex.: https://suaempresa.helprex.com), usado nos links dos chamados
const PAINEL = String(process.env.HELPREX_PAINEL_URL || '').trim().replace(/\/+$/, '');
const linkChamado = id => (PAINEL ? `${PAINEL}/Tickets/Detail/${id}` : '');
const FECHADO = ['Resolved', 'Closed'];
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtGerado = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

const hora = iso => (iso ? fmtHora.format(new Date(iso)) : '');
const quando = iso => Date.parse(iso);
const porData = campo => (a, b) => quando(a[campo]) - quando(b[campo]);

function texto(s, max = 160) {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export function hojeBR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export async function calcularDia(data, meta = 10) {
  const ini = Date.parse(`${data}T00:00:00-03:00`);
  const fim = ini + 864e5;
  const noDia = iso => { if (!iso) return false; const t = quando(iso); return t >= ini && t < fim; };

  const [grupos, usuarios] = await Promise.all([hx('groups'), hx('users')]);
  const nomeGrupo = Object.fromEntries(grupos.items.map(g => [g.id, g.name]));
  const ativos = usuarios.items.filter(u => u.isActive);

  // 1. Lista os chamados de cada status. A API ordena por lastActivityAt (mais recente primeiro),
  //    então para de paginar quando a página termina antes do dia.
  const listas = await Promise.all(['New', 'Open', 'Pending', 'Resolved', 'Closed'].map(async status => {
    const itens = [];
    let cursor = null;
    do {
      const r = await hx(`tickets?status=${status}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      itens.push(...r.items);
      cursor = r.nextCursor;
      const ultimo = r.items[r.items.length - 1];
      if (ultimo && quando(ultimo.lastActivityAt) < ini) cursor = null;
    } while (cursor);
    return itens;
  }));
  const candidatos = listas.flat().filter(t => noDia(t.lastActivityAt) || noDia(t.updatedAt) || noDia(t.sla?.resolvedAt));

  // 2. Mensagens e histórico de status dos candidatos, 12 chamados por vez
  const detalhes = await emLotes(candidatos, 12, async t => {
    const [d, h] = await Promise.all([hx(`tickets/${t.id}`), hx(`tickets/${t.id}/status-history`)]);
    return { t, d, hist: (h.items || []).slice().sort(porData('changedAt')) };
  });

  // 3. Classifica os chamados do ponto de vista de um analista (uid)
  function linhas(uid) {
    const saida = [];
    for (const { t, d, hist } of detalhes) {
      const msgs = d.messages || [];
      const minhas = msgs.filter(m => m.authorUserId === uid && noDia(m.createdAt)).sort(porData('createdAt'));
      const meuNome = t.assignedUserId === uid;
      const fechado = FECHADO.includes(t.status);
      // Resolvido no dia = pelo histórico, passou para Resolvido/Fechado nesse dia (vindo de um status aberto)
      // e terminou o dia assim. sla.resolvedAt guarda só a 1ª resolução: usado só sem histórico.
      const fimDoDia = hist.filter(x => quando(x.changedAt) < fim).at(-1);
      const resolucao = hist.filter(x => noDia(x.changedAt) && FECHADO.includes(x.to?.baseStatus) && !FECHADO.includes(x.from?.baseStatus)).at(-1);
      let resolvidoNoDia, horaResolucao;
      if (hist.length) {
        resolvidoNoDia = !!resolucao && FECHADO.includes(fimDoDia?.to?.baseStatus);
        horaResolucao = resolucao ? resolucao.changedAt : t.sla?.resolvedAt;
      } else {
        resolvidoNoDia = fechado && noDia(t.sla?.resolvedAt);
        horaResolucao = t.sla?.resolvedAt;
      }
      const resolveuFoiEu = !!resolucao && resolucao.changedByUserId === uid;
      // Última mensagem de agente: se for do analista, o chamado é dele mesmo sem estar no nome dele
      const ultimaAgente = msgs.filter(m => m.authorType === 'User' && m.authorUserId).sort(porData('createdAt')).at(-1);
      const ultimaEhMinha = (!!ultimaAgente && ultimaAgente.authorUserId === uid) || resolveuFoiEu;
      if (!meuNome && minhas.length === 0 && !(resolvidoNoDia && ultimaEhMinha)) continue;

      const grupo = nomeGrupo[t.groupId] || '';
      const melhoria = TIPOS_MELHORIA.includes(t.type) || /Melhoria/.test(grupo) || /melhoria/i.test(t.subject || '');
      let categoria = null;
      if (resolvidoNoDia && meuNome) categoria = 'meta';
      else if (resolvidoNoDia && ultimaEhMinha) categoria = 'semNome';
      else if (resolvidoNoDia) categoria = null;
      else if (fechado && minhas.length) categoria = 'retorno';   // resolvido em outro dia, respondeu hoje sem resolver de novo
      else if (minhas.length) categoria = 'encaminhado';
      if (!categoria) continue;

      const ultima = minhas.at(-1);
      saida.push({
        categoria, numero: t.number, id: t.id,
        assunto: texto(t.subject, 90), cliente: t.companyName, status: t.statusName, grupo, tipo: t.type,
        melhoria, meuNome,
        respostas: minhas.filter(m => !m.isInternal).length,
        notas: minhas.filter(m => m.isInternal).length,
        resolvidoEm: resolvidoNoDia && horaResolucao ? hora(horaResolucao) : '',
        ultimaMinha: ultima ? texto(ultima.bodyText, 220) : '',
        horaMinha: ultima ? hora(ultima.createdAt) : '',
        link: linkChamado(t.id)
      });
    }
    return saida.sort((a, b) => a.numero - b.numero);
  }

  // 4. Resumo de cada analista com movimento no dia
  const analistas = [];
  for (const u of ativos) {
    const ls = linhas(u.id);
    if (!ls.length) continue;
    const conta = cat => ls.filter(x => x.categoria === cat).length;
    const naMeta = conta('meta'), semNome = conta('semNome');
    analistas.push({
      id: u.id, nome: u.name,
      contamNoPainel: naMeta, resolvidosPorMim: naMeta + semNome, semMeuNome: semNome,
      encaminhados: conta('encaminhado'), retornos: conta('retorno'),
      melhorias: ls.filter(x => x.melhoria && (x.categoria === 'meta' || x.categoria === 'semNome')).length,
      chamados: ls
    });
  }
  analistas.sort((a, b) => b.resolvidosPorMim - a.resolvidosPorMim || a.nome.localeCompare(b.nome));

  const [a, m, d] = data.split('-');
  return { data, dataBr: `${d}/${m}/${a}`, gerado: fmtGerado.format(new Date()).replace(',', ''), meta, analistas };
}
