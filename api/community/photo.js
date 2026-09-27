import { handleCommunity } from '../../server/community.js';
export default function handler(req,res) { return handleCommunity('photo',req,res); }
