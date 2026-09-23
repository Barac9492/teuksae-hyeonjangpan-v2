import { handleAdmin } from '../../server/admin-auth.js';

export default function handler(req, res) {
  return handleAdmin('logout', req, res);
}
