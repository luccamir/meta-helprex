// Ajudantes que funcionam igual no Vercel e no servidor local (dev.js).

export function query(req) {
  return new URL(req.url, 'http://local').searchParams;
}

export async function corpo(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  let txt = '';
  for await (const parte of req) txt += parte;
  return txt ? JSON.parse(txt) : {};
}

export function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export function redirecionar(res, para) {
  res.statusCode = 302;
  res.setHeader('Location', para);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

// Envolve um handler de API: erro inesperado vira JSON com a mensagem (mostrada na tela)
export function protegido(fn) {
  return async (req, res) => {
    try { return await fn(req, res); }
    catch (e) { if (!e.status) console.error(e); if (!res.headersSent) json(res, e.status || 500, { erro: e.message || 'Erro no servidor' }); }
  };
}

export function ip(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}
