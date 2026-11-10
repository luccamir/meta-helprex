// Modo demonstração (variável DEMO=1): dados fictícios, sem chamar a API do HelpRex.
// Os números mudam conforme o dia, mas são sempre os mesmos para a mesma data.

export const ANALISTAS_DEMO = [
  { id: 'demo-ana', nome: 'Ana Souza' },
  { id: 'demo-bruno', nome: 'Bruno Lima' },
  { id: 'demo-carla', nome: 'Carla Mendes' },
  { id: 'demo-diego', nome: 'Diego Rocha' },
  { id: 'demo-elisa', nome: 'Elisa Martins' },
  { id: 'demo-felipe', nome: 'Felipe Costa' }
];

const CLIENTES = ['Empresa Alfa', 'Comércio Beta', 'Grupo Gama', 'Delta Serviços', 'Épsilon Ltda', 'Zeta Tecnologia', 'Ômega Contábil', 'Sigma Logística'];
const ASSUNTOS = [
  'Erro ao emitir relatório mensal', 'Dúvida sobre cadastro de clientes', 'Lentidão ao abrir a tela inicial',
  'Falha na importação de planilha', 'Configurar impressora de etiquetas', 'Nota fiscal rejeitada pela prefeitura',
  'Usuário sem permissão para editar', 'Atualização da versão do sistema', 'Backup não concluído',
  'Integração com e-mail parou', 'Ajuste no layout do recibo', 'Melhoria: filtro por período na pesquisa',
  'Senha bloqueada após tentativas', 'Erro de conexão com o servidor', 'Melhoria: exportar lista para Excel'
];
const GRUPOS = ['Suporte 1 - Atendimento Inicial', 'Suporte 2 - Análise', 'Desenvolvimento'];
const RESPOSTAS = [
  'Ajustei a configuração e o relatório voltou a sair normalmente.', 'Encaminhei para o desenvolvimento com os prints e o passo a passo.',
  'Orientei o cliente a atualizar para a versão mais recente.', 'Aguardando o cliente enviar o arquivo para análise.',
  'Reproduzi o erro na base de teste e registrei a causa na nota interna.'
];

// Gerador pseudoaleatório com semente (mesma data = mesmos dados)
function gerador(semente) {
  let s = 0;
  for (const c of semente) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

export function calcularDiaDemo(data, meta = 10) {
  const r = gerador(data);
  const escolhe = l => l[Math.floor(r() * l.length)];
  const hora = () => `${String(8 + Math.floor(r() * 10)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`;
  let numero = 5000 + Math.floor(r() * 1000);

  const analistas = ANALISTAS_DEMO.map((a, i) => {
    const total = 4 + Math.floor(r() * (i < 2 ? 12 : 9));
    const assuntos = ASSUNTOS.map(s => [r(), s]).sort((p, q) => p[0] - q[0]).map(p => p[1]);   // sem repetir no mesmo analista
    const chamados = [];
    for (let k = 0; k < total; k++) {
      const x = r();
      const categoria = x < 0.62 ? 'meta' : x < 0.72 ? 'semNome' : x < 0.92 ? 'encaminhado' : 'retorno';
      const assunto = assuntos[k % assuntos.length];
      const resolvido = categoria === 'meta' || categoria === 'semNome';
      const h = hora();
      chamados.push({
        categoria, numero: numero++, id: `demo-${data}-${i}-${k}`,
        assunto, cliente: escolhe(CLIENTES),
        status: resolvido || categoria === 'retorno' ? 'Resolvido' : escolhe(['Aguardando Cliente', 'Em análise', 'Desenvolvimento']),
        grupo: /Melhoria/.test(assunto) ? 'Melhorias' : escolhe(GRUPOS), tipo: '',
        melhoria: /Melhoria/.test(assunto), meuNome: categoria === 'meta',
        respostas: 1 + Math.floor(r() * 3), notas: Math.floor(r() * 2),
        resolvidoEm: resolvido ? h : '',
        ultimaMinha: resolvido ? '' : escolhe(RESPOSTAS),
        horaMinha: h,
        link: ''
      });
    }
    chamados.sort((p, q) => p.numero - q.numero);
    const conta = c => chamados.filter(x => x.categoria === c).length;
    return {
      id: a.id, nome: a.nome,
      contamNoPainel: conta('meta'), resolvidosPorMim: conta('meta') + conta('semNome'), semMeuNome: conta('semNome'),
      encaminhados: conta('encaminhado'), retornos: conta('retorno'),
      melhorias: chamados.filter(x => x.melhoria && (x.categoria === 'meta' || x.categoria === 'semNome')).length,
      chamados
    };
  }).sort((p, q) => q.resolvidosPorMim - p.resolvidosPorMim || p.nome.localeCompare(q.nome));

  const [ano, mes, dia] = data.split('-');
  const gerado = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(',', '');
  return { data, dataBr: `${dia}/${mes}/${ano}`, gerado: `${gerado} · demonstração`, meta, analistas };
}

export const modoDemo = () => /^(1|true|sim)$/i.test(String(process.env.DEMO || '').trim());
