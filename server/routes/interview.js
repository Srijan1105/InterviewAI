const express = require('express');
const Groq = require('groq-sdk');
const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const Progress = require('../models/Progress');
const router = express.Router();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const ROLE_PROMPTS = {
  'Software Developer': 'Focus on OOP, data structures, system design, and common frameworks.',
  'Web Developer': 'Focus on HTML/CSS/JS, React/Vue, REST APIs, and web performance.',
  'Data Scientist': 'Focus on ML algorithms, statistics, Python, pandas, and model evaluation.',
  'ML Engineer': 'Focus on deep learning, model deployment, MLOps, and optimization.',
  'System Designer': 'Focus on distributed systems, scalability, databases, and architecture.'
};

async function groqChat(messages, maxTokens = 500) {
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    max_tokens: maxTokens,
    temperature: 0.7
  });
  return response.choices[0].message.content;
}

// Start or continue a session
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, sessionId, role = 'Software Developer', type = 'mock' } = req.body;

    let session;
    if (sessionId) {
      session = await Session.findById(sessionId);
    }
    if (!session) {
      session = await Session.create({ userId: req.user.id, role, type, messages: [] });
    }

    const systemPrompt = `You are an expert technical interviewer conducting a ${type} interview for a ${role} position.
${ROLE_PROMPTS[role] || ''}
Rules:
- Ask one question at a time
- After user answers, briefly evaluate (2-3 sentences), then ask the next question
- Mix technical, behavioral, and situational questions
- Be professional but encouraging
- After 8-10 exchanges, provide a final performance summary with scores out of 10 for: Technical Knowledge, Communication, and Confidence
- Format final scores exactly as: SCORES: Technical:X Communication:X Confidence:X`;

    session.messages.push({ role: 'user', content: message });

    const aiMessage = await groqChat([
      { role: 'system', content: systemPrompt },
      ...session.messages.map(m => ({ role: m.role, content: m.content }))
    ]);

    session.messages.push({ role: 'assistant', content: aiMessage });

    // Extract scores if present
    const scoreMatch = aiMessage.match(/SCORES:\s*Technical:(\d+)\s*Communication:(\d+)\s*Confidence:(\d+)/i);
    if (scoreMatch) {
      session.scores = {
        technical: parseInt(scoreMatch[1]),
        communication: parseInt(scoreMatch[2]),
        confidence: parseInt(scoreMatch[3])
      };
      session.completed = true;
      await Progress.create({
        userId: req.user.id,
        technical: session.scores.technical,
        communication: session.scores.communication,
        confidence: session.scores.confidence,
        sessionId: session._id
      });
    }

    await session.save();
    res.json({ message: aiMessage, sessionId: session._id, scores: session.scores, completed: session.completed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get role-specific questions
router.get('/questions/:role', auth, async (req, res) => {
  try {
    const role = decodeURIComponent(req.params.role);
    const text = await groqChat([{
      role: 'user',
      content: `Generate 10 interview questions for a ${role} position. Mix technical and behavioral. Return as JSON array of strings only, no extra text.`
    }], 600);
    const questions = JSON.parse(text.match(/\[[\s\S]*\]/)[0]);
    res.json({ questions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get session history
router.get('/sessions', auth, async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(10);
    res.json({ sessions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
