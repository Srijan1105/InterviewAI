const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Groq = require('groq-sdk');
const jwt = require('jsonwebtoken');
const router = express.Router();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
};

router.post('/upload', auth, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const data = await pdfParse(req.file.buffer);
    const resumeText = data.text.slice(0, 3000);

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Based on this resume, generate 12 targeted interview questions. Include:
- 4 questions about their projects/experience
- 4 technical questions based on their skills
- 2 behavioral questions
- 2 questions about their career goals

Resume:
${resumeText}

Return ONLY valid JSON in this format (no extra text):
{ "questions": ["question1", "question2", ...], "summary": "brief 2-sentence candidate profile" }`
      }],
      max_tokens: 800,
      temperature: 0.7
    });

    const text = response.choices[0].message.content;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response from AI');
    const result = JSON.parse(jsonMatch[0]);

    res.json({ ...result, resumeText: resumeText.slice(0, 500) + '...' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
