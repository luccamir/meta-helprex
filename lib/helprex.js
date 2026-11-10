// Acesso à API do HelpRex. A chave fica só na variável HELPREX_API_KEY do servidor.
const BASE = 'https://api.helprex.com/api/v1';

export async function hx(caminho) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch(`${BASE}/${caminho}`, {
      headers: { 'X-Api-Key': String(process.env.HELPREX_API_KEY || '').trim(), Accept: 'application/json' }
    });
    if (r.ok) return r.json();
    if (r.status === 429 || r.status >= 500) { await new Promise(ok => setTimeout(ok, 800 * (tentativa + 1))); continue; }
    throw new Error(`HelpRex respondeu ${r.status} em ${caminho.split('?')[0]}`);
  }
  throw new Error('HelpRex indisponível no momento');
}

// Executa fn em cada item com no máximo n chamadas ao mesmo tempo
export async function emLotes(itens, n, fn) {
  const saida = new Array(itens.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < itens.length) { const k = i++; saida[k] = await fn(itens[k]); }
  }));
  return saida;
}
