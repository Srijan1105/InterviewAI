const connectDB = require('../_db');
const { Progress, Session } = require('../_models');
const { verifyToken } = require('../_auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const user = verifyToken(req);
    await connectDB();
    const records = await Progress.find({ userId: user.id }).sort({ date: 1 }).limit(20);
    const completedSessions = await Session.countDocuments({ userId: user.id, completed: true });
    const totalSessions = await Session.countDocuments({ userId: user.id });

    const avg = records.length ? {
      technical: +(records.reduce((s,r) => s+r.technical,0)/records.length).toFixed(1),
      communication: +(records.reduce((s,r) => s+r.communication,0)/records.length).toFixed(1),
      confidence: +(records.reduce((s,r) => s+r.confidence,0)/records.length).toFixed(1)
    } : { technical:0, communication:0, confidence:0 };

    res.json({ records, averages: avg, completedSessions, totalSessions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
