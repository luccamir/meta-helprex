// Informações públicas para a tela de login (ex.: mostrar o acesso de demonstração)
import { modoDemo } from '../lib/demo.js';
import { json } from '../lib/http.js';

export default function handler(req, res) {
  json(res, 200, { demo: modoDemo() });
}
