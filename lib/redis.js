// Banco dos usuários, acessos e cache da meta: Upstash Redis pela API REST.
// No Vercel as variáveis vêm da integração Upstash (KV_REST_API_URL / KV_REST_API_TOKEN).
// Sem essas variáveis (teste local) usa memória, que some ao reiniciar.
const URL_ = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const memoria = new Map();
const expira = new Map();

function memo(cmd, ...a) {
  const agora = Date.now();
  for (const [k, t] of expira) if (t < agora) { memoria.delete(k); expira.delete(k); }
  switch (cmd) {
    case 'GET': return memoria.get(a[0]) ?? null;
    case 'SET': memoria.set(a[0], a[1]); if (a[2] === 'EX') expira.set(a[0], agora + Number(a[3]) * 1000); else expira.delete(a[0]); return 'OK';
    case 'DEL': memoria.delete(a[0]); expira.delete(a[0]); return 1;
    case 'INCR': { const v = Number(memoria.get(a[0]) || 0) + 1; memoria.set(a[0], String(v)); return v; }
    case 'EXPIRE': expira.set(a[0], agora + Number(a[1]) * 1000); return 1;
    case 'SADD': { const s = memoria.get(a[0]) || new Set(); s.add(a[1]); memoria.set(a[0], s); return 1; }
    case 'SREM': { const s = memoria.get(a[0]); if (s) s.delete(a[1]); return 1; }
    case 'SMEMBERS': return [...(memoria.get(a[0]) || [])];
    case 'LPUSH': { const l = memoria.get(a[0]) || []; l.unshift(a[1]); memoria.set(a[0], l); return l.length; }
    case 'LTRIM': { const l = memoria.get(a[0]) || []; memoria.set(a[0], l.slice(Number(a[1]), Number(a[2]) + 1)); return 'OK'; }
    case 'LRANGE': return (memoria.get(a[0]) || []).slice(Number(a[1]), Number(a[2]) + 1);
    default: throw new Error('Comando não suportado na memória: ' + cmd);
  }
}

export async function redis(cmd, ...args) {
  if (!URL_ && process.env.VERCEL) throw new Error('Banco não configurado: conecte o Upstash Redis ao projeto no painel do Vercel.');
  if (!URL_) return memo(cmd, ...args);
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([cmd, ...args.map(String)])
  });
  const j = await r.json();
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}

export async function getJSON(chave) {
  const v = await redis('GET', chave);
  return v ? JSON.parse(v) : null;
}

export function setJSON(chave, valor, segundos) {
  return segundos ? redis('SET', chave, JSON.stringify(valor), 'EX', segundos) : redis('SET', chave, JSON.stringify(valor));
}
