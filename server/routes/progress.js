const express = require('express');
const jwt = require('jsonwebtoken');
const Progress = require('../models/Progress');
const Session = require('../models/Session');
const router = express.Router();

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
};

router.get('/', auth, async (req, res) => {
  try {
    const records = await Progress.find({ userId: req.user.id }).sort({ date: 1 }).limit(20);
    const sessions = await Session.find({ userId: req.user.id, completed: true }).countDocuments();
    const totalSessions = await Session.find({ userId: req.user.id }).countDocuments();

    const avg = records.length ? {
      technical: Math.round(records.reduce((s, r) => s + r.technical, 0) / records.length * 10) / 10,
      communication: Math.round(records.reduce((s, r) => s + r.communication, 0) / records.length * 10) / 10,
      confidence: Math.round(records.reduce((s, r) => s + r.confidence, 0) / records.length * 10) / 10
    } : { technical: 0, communication: 0, confidence: 0 };

    res.json({ records, averages: avg, completedSessions: sessions, totalSessions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
