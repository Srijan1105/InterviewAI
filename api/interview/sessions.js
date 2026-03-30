const connectDB = require('../_db');
const { Session } = require('../_models');
const { verifyToken } = require('../_auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const user = verifyToken(req);
    await connectDB();
    const sessions = await Session.find({ userId: user.id }).sort({ createdAt: -1 }).limit(10);
    res.json({ sessions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
