import { handlePublicStatus } from '../server/admin-auth.js';
export default function handler(req, res) { return handlePublicStatus(req, res); }
