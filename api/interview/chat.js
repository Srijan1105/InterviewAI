const connectDB = require('../_db');
const { Session, Progress } = require('../_models');
const { verifyToken } = require('../_auth');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ROLE_PROMPTS = {
  'Software Developer': 'Focus on OOP, data structures, system design, and common frameworks.',
  'Web Developer': 'Focus on HTML/CSS/JS, React/Vue, REST APIs, and web performance.',
  'Data Scientist': 'Focus on ML algorithms, statistics, Python, pandas, and model evaluation.',
  'ML Engineer': 'Focus on deep learning, model deployment, MLOps, and optimization.'
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = verifyToken(req);
    await connectDB();
    const { message, sessionId, role = 'Software Developer', type = 'mock' } = req.body;

    let session = sessionId ? await Session.findById(sessionId) : null;
    if (!session) session = await Session.create({ userId: user.id, role, type, messages: [] });

    const systemPrompt = `You are an expert technical interviewer for a ${role} position.
${ROLE_PROMPTS[role] || ''}
Ask one question at a time. After user answers, briefly evaluate (2-3 sentences), then ask next question.
After 8-10 exchanges, provide final summary with scores out of 10.
Format final scores exactly as: SCORES: Technical:X Communication:X Confidence:X`;

    session.messages.push({ role: 'user', content: message });

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...session.messages.map(m => ({ role: m.role, content: m.content }))
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    const aiMessage = response.choices[0].message.content;
    session.messages.push({ role: 'assistant', content: aiMessage });

    const scoreMatch = aiMessage.match(/SCORES:\s*Technical:(\d+)\s*Communication:(\d+)\s*Confidence:(\d+)/i);
    if (scoreMatch) {
      session.scores = { technical: +scoreMatch[1], communication: +scoreMatch[2], confidence: +scoreMatch[3] };
      session.completed = true;
      await Progress.create({ userId: user.id, ...session.scores, sessionId: session._id });
    }

    await session.save();
    res.json({ message: aiMessage, sessionId: session._id, scores: session.scores, completed: session.completed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
