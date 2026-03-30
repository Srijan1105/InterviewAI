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
    const { resumeText } = req.body;
    if (!resumeText) return res.status(400).json({ error: 'Resume text required' });

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Based on this resume, generate 12 targeted interview questions (4 about projects/experience, 4 technical, 2 behavioral, 2 career goals).

Resume:
${resumeText.slice(0, 2000)}

Return ONLY valid JSON: { "questions": ["q1","q2",...], "summary": "2-sentence candidate profile" }`
      }],
      max_tokens: 700,
      temperature: 0.7
    });

    const text = response.choices[0].message.content;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response');
    res.json(JSON.parse(jsonMatch[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
