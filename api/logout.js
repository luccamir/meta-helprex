import { apagarCookie } from '../lib/auth.js';
import { redirecionar } from '../lib/http.js';

export default function handler(req, res) {
  apagarCookie(res);
  redirecionar(res, '/login');
}
