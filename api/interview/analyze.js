const connectDB = require('../_db');
const { Session } = require('../_models');
const { verifyToken } = require('../_auth');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    verifyToken(req);
    const { sessionId, role, scores, conversationSummary } = req.body;

    const prompt = `You are an expert interview coach. Analyze this mock interview and provide a detailed debrief.

Role: ${role}
Scores: Technical ${scores.technical}/10, Communication ${scores.communication}/10, Confidence ${scores.confidence}/10

Interview conversation summary:
${conversationSummary}

Return ONLY valid JSON (no markdown):
{
  "strengths": [
    { "point": "specific strength observed", "detail": "brief explanation" }
  ],
  "weaknesses": [
    { "point": "specific weakness observed", "detail": "brief explanation" }
  ],
  "suggestions": [
    { "area": "area to improve", "action": "specific actionable advice" }
  ],
  "modelAnswerComparison": [
    {
      "topic": "topic/question area",
      "candidateApproach": "what the candidate did",
      "idealApproach": "what a strong candidate would say"
    }
  ],
  "nextPractice": [
    { "topic": "topic to practice", "reason": "why this is important", "resource": "what to study" }
  ],
  "overallFeedback": "2-3 sentence overall assessment of the candidate's performance"
}

Rules:
- strengths: 3-4 genuine strengths based on the conversation
- weaknesses: 3-4 specific areas that need work
- suggestions: 4-5 concrete, actionable improvement steps
- modelAnswerComparison: 2-3 key topics where the candidate could have answered better
- nextPractice: 3-4 specific topics to study before next interview`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1200,
      temperature: 0.4
    });

    const text = response.choices[0].message.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response');
    res.json(JSON.parse(jsonMatch[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
