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
    const { resumeText, jobDesc } = req.body;
    if (!resumeText) return res.status(400).json({ error: 'Resume text required' });

    const jobSection = jobDesc
      ? `\nJob Description to match against:\n${jobDesc.slice(0, 1500)}`
      : '\nNo job description provided — do a general ATS analysis.';

    const prompt = `You are an expert ATS (Applicant Tracking System) analyzer. Analyze this resume and return a detailed ATS compatibility report.

Resume Text:
${resumeText.slice(0, 3000)}
${jobSection}

Analyze these categories and return ONLY valid JSON (no markdown, no extra text):
{
  "overallScore": <number 0-100>,
  "categories": {
    "Keyword Optimization": <0-100>,
    "Formatting & Structure": <0-100>,
    "Contact Information": <0-100>,
    "Work Experience": <0-100>,
    "Education Section": <0-100>,
    "Skills Section": <0-100>
  },
  "keywordsFound": ["keyword1", "keyword2", ...],
  "keywordsMissing": ["keyword1", "keyword2", ...],
  "suggestions": [
    {
      "type": "critical",
      "title": "Short title of issue",
      "detail": "Detailed explanation and how to fix it"
    },
    {
      "type": "warning",
      "title": "Short title",
      "detail": "Explanation"
    },
    {
      "type": "good",
      "title": "What you did well",
      "detail": "Explanation"
    }
  ]
}

Rules:
- overallScore should reflect true ATS compatibility (be honest, not inflated)
- keywordsFound: list 8-15 strong keywords/skills found in the resume
- keywordsMissing: list 5-10 important keywords missing (based on job desc if provided, else industry standard)
- suggestions: provide 6-10 suggestions mixing critical issues, warnings, and positives
- critical = must fix to pass ATS, warning = should fix, good = already doing well`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1200,
      temperature: 0.3
    });

    const text = response.choices[0].message.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response format');

    const result = JSON.parse(jsonMatch[0]);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
