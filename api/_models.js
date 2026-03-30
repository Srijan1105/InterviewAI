const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// User
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'Software Developer' },
  createdAt: { type: Date, default: Date.now }
});
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
userSchema.methods.comparePassword = function(p) { return bcrypt.compare(p, this.password); };

// Session
const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user','assistant'] },
  content: String,
  timestamp: { type: Date, default: Date.now }
});
const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, default: 'mock' },
  role: { type: String, default: 'Software Developer' },
  messages: [messageSchema],
  scores: { technical: Number, communication: Number, confidence: Number },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Progress
const progressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: { type: Date, default: Date.now },
  technical: Number,
  communication: Number,
  confidence: Number,
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' }
});

module.exports = {
  User: mongoose.models.User || mongoose.model('User', userSchema),
  Session: mongoose.models.Session || mongoose.model('Session', sessionSchema),
  Progress: mongoose.models.Progress || mongoose.model('Progress', progressSchema)
};
