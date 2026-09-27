import { handleCommunity } from '../../server/community.js';
export default function handler(req,res) { return handleCommunity('admin',req,res); }
