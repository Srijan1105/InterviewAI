const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now },
  technical: { type: Number, default: 0 },
  communication: { type: Number, default: 0 },
  confidence: { type: Number, default: 0 },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' }
});

module.exports = mongoose.model('Progress', progressSchema);
