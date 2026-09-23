import { handleAdmin } from '../../server/admin-auth.js';

export default function handler(req, res) {
  return handleAdmin('dashboard', req, res);
}
