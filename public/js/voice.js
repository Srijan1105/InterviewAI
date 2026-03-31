if (!getToken()) window.location.href = 'index.html';

// ===== STATE =====
let recognition = null;
let isRecording = false;
let transcript = '';
let sessionId = null;
let questionCount = 0;
let maxQuestions = 6;
let recordingStartTime = null;
let durationTimer = null;
let answerHistory = [];
let currentQuestion = '';
let isFollowUp = false;
let lastAnswerText = '';

// ===== FILLER WORDS =====
const FILLERS = ['uh', 'um', 'uhh', 'umm', 'like', 'you know', 'basically', 'literally',
  'actually', 'so', 'right', 'okay', 'kind of', 'sort of', 'i mean', 'well'];

// ===== FALLBACK QUESTIONS =====
const FALLBACK_Q = {
  'Software Developer': [
    'Tell me about yourself and your software development experience.',
    'Describe a challenging technical problem you solved recently.',
    'How do you ensure code quality in your projects?',
    'Explain how you handle tight deadlines.',
    'What is your experience with version control and collaboration?',
    'Where do you see yourself in 3 years?',
    'How do you stay updated with new technologies?',
    'Describe your experience with system design.'
  ],
  'Web Developer': [
    'Tell me about yourself and your web development background.',
    'What frontend frameworks have you worked with and why do you prefer them?',
    'How do you approach web performance optimization?',
    'Describe a complex UI component you built.',
    'How do you handle cross-browser compatibility?',
    'Tell me about your experience with REST APIs.',
    'How do you approach responsive design?',
    'What is your testing strategy for web applications?'
  ],
  'Data Scientist': [
    'Tell me about yourself and your data science background.',
    'Walk me through a machine learning project end to end.',
    'How do you handle missing or imbalanced data?',
    'Explain the bias-variance tradeoff.',
    'How do you communicate results to non-technical stakeholders?',
    'What metrics do you use to evaluate your models?',
    'Describe your experience with Python and data libraries.',
    'How do you validate a machine learning model?'
  ],
  'ML Engineer': [
    'Tell me about yourself and your ML engineering experience.',
    'How do you deploy a machine learning model to production?',
    'What MLOps tools have you worked with?',
    'How do you monitor model performance after deployment?',
    'Explain the difference between batch and real-time inference.',
    'How do you handle model versioning?',
    'Describe your experience with distributed training.',
    'How do you optimize model inference speed?'
  ]
};

const FOLLOW_UP_TEMPLATES = [
  'Can you elaborate more on that? Give me a specific example.',
  'Interesting — what was the biggest challenge in that situation?',
  'How did that experience shape your approach going forward?',
  'What would you do differently if you faced that again?',
  'Can you quantify the impact of what you described?'
];

// ===== SPEECH RECOGNITION SETUP =====
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function startVoiceInterview() {
  if (!SpeechRecognition) {
    showToast('Speech recognition not supported. Please use Chrome.', 'error');
    return;
  }
  maxQuestions = parseInt(document.getElementById('questionCount').value);
  document.getElementById('voiceSetup').classList.add('hidden');
  document.getElementById('voiceInterview').classList.remove('hidden');
  updateProgress();
  loadNextQuestion(true);
}

// ===== QUESTION LOADING =====
async function loadNextQuestion(isFirst = false, forceFollowUp = false) {
  const role = document.getElementById('voiceRole').value;
  const qEl = document.getElementById('currentQuestion');
  qEl.textContent = 'Loading question...';
  document.getElementById('followUpBadge').classList.add('hidden');
  document.getElementById('aiFeedbackCard').style.display = 'none';
  resetRecordingUI();

  // Decide if we should ask a follow-up
  isFollowUp = forceFollowUp;

  if (forceFollowUp && lastAnswerText) {
    // Generate follow-up based on last answer
    const followUp = await getFollowUpQuestion(lastAnswerText, role);
    currentQuestion = followUp;
    qEl.textContent = followUp;
    document.getElementById('followUpBadge').classList.remove('hidden');
    speakText(followUp);
    return;
  }

  const msg = isFirst
    ? 'Start the interview. Ask the first question only. Be concise.'
    : 'Ask the next interview question. One question only, be concise.';

  try {
    const res = await fetch('/api/interview/chat', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message: msg, sessionId, role, type: 'mock' })
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    if (!data.message) throw new Error('Empty');
    sessionId = data.sessionId;
    currentQuestion = data.message;
    qEl.textContent = data.message;
    speakText(data.message);
  } catch {
    // Fallback
    const pool = FALLBACK_Q[role] || FALLBACK_Q['Software Developer'];
    const q = pool[questionCount % pool.length];
    currentQuestion = q;
    qEl.textContent = q;
    speakText(q);
  }
  questionCount++;
  updateProgress();
}

async function getFollowUpQuestion(answer, role) {
  try {
    const res = await fetch('/api/interview/chat', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        message: `The candidate just answered: "${answer.slice(0, 300)}". Ask ONE concise follow-up question to dig deeper into their answer.`,
        sessionId, role, type: 'mock'
      })
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.message || FOLLOW_UP_TEMPLATES[Math.floor(Math.random() * FOLLOW_UP_TEMPLATES.length)];
  } catch {
    return FOLLOW_UP_TEMPLATES[Math.floor(Math.random() * FOLLOW_UP_TEMPLATES.length)];
  }
}

// ===== RECORDING =====
function toggleRecording() {
  isRecording ? stopRecording() : startRecording();
}

function startRecording() {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isRecording = true;
    recordingStartTime = Date.now();
    transcript = '';
    document.getElementById('voiceOrb').classList.add('listening');
    document.getElementById('voiceOrb').textContent = '⏹️';
    document.getElementById('waveform').classList.add('active');
    document.getElementById('voiceStatus').textContent = '🔴 Recording... speak now';
    document.getElementById('transcript').textContent = '';
    document.getElementById('submitVoiceBtn').disabled = true;
    startDurationTimer();
  };

  recognition.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    transcript += final;
    const full = transcript + interim;
    document.getElementById('transcript').textContent = full;
    updateLiveMetrics(full);
  };

  recognition.onerror = (e) => {
    if (e.error !== 'no-speech') showToast('Mic error: ' + e.error, 'error');
    stopRecording();
  };

  recognition.onend = () => { if (isRecording) recognition.start(); };
  recognition.start();
}

function stopRecording() {
  isRecording = false;
  recognition?.stop();
  clearInterval(durationTimer);
  document.getElementById('voiceOrb').classList.remove('listening');
  document.getElementById('voiceOrb').textContent = '🎙️';
  document.getElementById('waveform').classList.remove('active');
  document.getElementById('voiceStatus').textContent = 'Recording stopped. Review and submit.';
  if (transcript.trim().length > 3) {
    document.getElementById('submitVoiceBtn').disabled = false;
  }
  // Final metrics update
  updateLiveMetrics(transcript);
}

function startDurationTimer() {
  durationTimer = setInterval(() => {
    const secs = Math.floor((Date.now() - recordingStartTime) / 1000);
    document.getElementById('durationVal').textContent = secs + 's';
    // Update WPM live
    const words = transcript.trim().split(/\s+/).filter(Boolean).length;
    const mins = secs / 60;
    if (mins > 0) {
      const wpm = Math.round(words / mins);
      document.getElementById('wpmVal').textContent = wpm;
    }
  }, 500);
}

// ===== METRICS =====
function updateLiveMetrics(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  document.getElementById('wordCountVal').textContent = wordCount;

  // Filler detection
  const lowerText = text.toLowerCase();
  const fillerFound = [];
  const fillerCounts = {};
  FILLERS.forEach(f => {
    const regex = new RegExp('\\b' + f + '\\b', 'gi');
    const matches = lowerText.match(regex);
    if (matches && matches.length > 0) {
      fillerCounts[f] = matches.length;
      fillerFound.push(f);
    }
  });
  const totalFillers = Object.values(fillerCounts).reduce((a, b) => a + b, 0);
  document.getElementById('fillerVal').textContent = totalFillers;

  // Filler chips
  const chipsEl = document.getElementById('fillerChips');
  if (fillerFound.length > 0) {
    chipsEl.innerHTML = fillerFound.map(f =>
      `<span class="filler-chip">"${f}" ×${fillerCounts[f]}</span>`
    ).join('');
  } else {
    chipsEl.innerHTML = '<span style="font-size:0.82rem;color:var(--success);">✅ No fillers detected</span>';
  }

  // Confidence scoring
  const { score, label, color } = calcConfidence(wordCount, totalFillers, text);
  document.getElementById('confidenceLabel').textContent = label;
  document.getElementById('confidenceLabel').style.color = color;
  document.getElementById('confidenceFill').style.width = score + '%';
  document.getElementById('confidenceFill').style.background = color;
}

function calcConfidence(wordCount, fillers, text) {
  let score = 50;
  // Word count: more words = more confident (up to a point)
  if (wordCount > 80) score += 20;
  else if (wordCount > 40) score += 10;
  else if (wordCount < 15) score -= 15;

  // Filler ratio
  const fillerRatio = wordCount > 0 ? fillers / wordCount : 0;
  if (fillerRatio > 0.1) score -= 20;
  else if (fillerRatio > 0.05) score -= 10;
  else if (fillerRatio === 0) score += 10;

  // Hesitation patterns
  const hesitations = (text.match(/\.\.\.|—|,\s*,/g) || []).length;
  score -= hesitations * 3;

  score = Math.max(10, Math.min(95, score));

  let label, color;
  if (score >= 70) { label = 'High'; color = '#00d4aa'; }
  else if (score >= 45) { label = 'Medium'; color = '#ffd166'; }
  else { label = 'Low'; color = '#ff6584'; }

  return { score, label, color };
}

function getWPM() {
  if (!recordingStartTime) return 0;
  const secs = (Date.now() - recordingStartTime) / 1000;
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  return secs > 0 ? Math.round(words / (secs / 60)) : 0;
}

// ===== SUBMIT ANSWER =====
async function submitAnswer() {
  const answer = transcript.trim();
  if (!answer) { showToast('No answer recorded', 'error'); return; }

  const btn = document.getElementById('submitVoiceBtn');
  btn.disabled = true;
  btn.textContent = 'Evaluating...';

  // Capture metrics for this answer
  const words = answer.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const wpm = getWPM();
  const fillerCounts = {};
  FILLERS.forEach(f => {
    const matches = answer.toLowerCase().match(new RegExp('\\b' + f + '\\b', 'gi'));
    if (matches) fillerCounts[f] = matches.length;
  });
  const totalFillers = Object.values(fillerCounts).reduce((a, b) => a + b, 0);
  const { score: confScore, label: confLabel } = calcConfidence(wordCount, totalFillers, answer);
  const duration = recordingStartTime ? Math.floor((Date.now() - recordingStartTime) / 1000) : 0;

  lastAnswerText = answer;

  // Save to history
  answerHistory.push({
    question: currentQuestion,
    answer,
    wpm,
    wordCount,
    fillers: totalFillers,
    fillerWords: Object.keys(fillerCounts),
    confidence: confLabel,
    confScore,
    duration,
    isFollowUp
  });

  // Get AI feedback
  let feedback = '';
  try {
    const res = await fetch('/api/interview/chat', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        message: `My answer: "${answer.slice(0, 400)}". Give brief feedback (2-3 sentences) on content quality and communication.`,
        sessionId,
        role: document.getElementById('voiceRole').value,
        type: 'mock'
      })
    });
    const data = await res.json();
    feedback = data.message || getLocalFeedback(confLabel);
  } catch {
    feedback = getLocalFeedback(confLabel);
  }

  document.getElementById('aiFeedbackText').textContent = feedback;
  document.getElementById('aiFeedbackCard').style.display = 'block';
  btn.textContent = 'Submit Answer ➤';

  // Decide: follow-up or next question?
  // Ask follow-up if answer was short or low confidence (and not already a follow-up)
  const shouldFollowUp = !isFollowUp && (wordCount < 30 || confScore < 45) && questionCount < maxQuestions;
  const nextBtn = document.getElementById('aiFeedbackCard').querySelector('button');
  if (shouldFollowUp) {
    nextBtn.textContent = 'Answer Follow-up ➤';
    nextBtn.onclick = () => loadNextQuestion(false, true);
  } else {
    nextBtn.textContent = questionCount >= maxQuestions ? 'See Results ➤' : 'Next Question ➤';
    nextBtn.onclick = nextQuestion;
  }
}

function getLocalFeedback(confidence) {
  const map = {
    High: 'Great answer! You spoke confidently and covered the key points well. Keep up the structured approach.',
    Medium: 'Good effort. Your answer had solid content — try to reduce filler words and speak with more conviction.',
    Low: 'Your answer needs more depth. Practice structuring responses using the STAR method and aim for 60-90 seconds per answer.'
  };
  return map[confidence] || map.Medium;
}

function nextQuestion() {
  if (questionCount >= maxQuestions) {
    showResults();
    return;
  }
  loadNextQuestion(false, false);
}

function skipQuestion() {
  if (isRecording) stopRecording();
  if (questionCount >= maxQuestions) { showResults(); return; }
  loadNextQuestion(false, false);
}

function resetRecordingUI() {
  if (isRecording) stopRecording();
  transcript = '';
  document.getElementById('transcript').textContent = 'Your speech will appear here...';
  document.getElementById('submitVoiceBtn').disabled = true;
  document.getElementById('wpmVal').textContent = '—';
  document.getElementById('fillerVal').textContent = '0';
  document.getElementById('wordCountVal').textContent = '0';
  document.getElementById('durationVal').textContent = '0s';
  document.getElementById('confidenceLabel').textContent = '—';
  document.getElementById('confidenceFill').style.width = '0%';
  document.getElementById('fillerChips').innerHTML = '<span style="font-size:0.82rem;color:var(--text-muted);">None detected yet</span>';
}

function updateProgress() {
  document.getElementById('questionProgress').textContent =
    `Question ${Math.min(questionCount + 1, maxQuestions)} of ${maxQuestions}`;
}

// ===== RESULTS =====
function showResults() {
  if (isRecording) stopRecording();
  document.getElementById('voiceInterview').classList.add('hidden');
  document.getElementById('voiceResults').classList.remove('hidden');

  if (answerHistory.length === 0) {
    document.getElementById('summaryMetrics').innerHTML = '<p class="text-muted">No answers recorded.</p>';
    return;
  }

  // Averages
  const avgWPM = Math.round(answerHistory.reduce((s, a) => s + a.wpm, 0) / answerHistory.length);
  const totalFillers = answerHistory.reduce((s, a) => s + a.fillers, 0);
  const avgConf = Math.round(answerHistory.reduce((s, a) => s + a.confScore, 0) / answerHistory.length);
  const confLabel = avgConf >= 70 ? 'High' : avgConf >= 45 ? 'Medium' : 'Low';
  const confColor = avgConf >= 70 ? '#00d4aa' : avgConf >= 45 ? '#ffd166' : '#ff6584';
  const totalWords = answerHistory.reduce((s, a) => s + a.wordCount, 0);

  document.getElementById('summaryMetrics').innerHTML = `
    <div class="metric-card"><div class="metric-icon">🚀</div><div><div class="metric-val">${avgWPM}</div><div class="metric-label">Avg WPM</div></div></div>
    <div class="metric-card"><div class="metric-icon">🔴</div><div><div class="metric-val">${totalFillers}</div><div class="metric-label">Total Fillers</div></div></div>
    <div class="metric-card"><div class="metric-icon">💪</div><div><div class="metric-val" style="color:${confColor}">${confLabel}</div><div class="metric-label">Confidence</div></div></div>
    <div class="metric-card"><div class="metric-icon">📝</div><div><div class="metric-val">${totalWords}</div><div class="metric-label">Total Words</div></div></div>
    <div class="metric-card"><div class="metric-icon">❓</div><div><div class="metric-val">${answerHistory.length}</div><div class="metric-label">Questions Done</div></div></div>
    <div class="metric-card"><div class="metric-icon">↩</div><div><div class="metric-val">${answerHistory.filter(a=>a.isFollowUp).length}</div><div class="metric-label">Follow-ups</div></div></div>
  `;

  // Per-answer breakdown
  document.getElementById('answerHistory').innerHTML = answerHistory.map((a, i) => `
    <div class="answer-item">
      <div class="q-label">${a.isFollowUp ? '↩ Follow-up' : `Q${i + 1}`}: ${a.question.slice(0, 80)}${a.question.length > 80 ? '...' : ''}</div>
      <div class="a-text">${a.answer.slice(0, 200)}${a.answer.length > 200 ? '...' : ''}</div>
      <div class="a-metrics">
        <div class="a-metric">Speed: <span>${a.wpm} wpm</span></div>
        <div class="a-metric">Words: <span>${a.wordCount}</span></div>
        <div class="a-metric">Fillers: <span>${a.fillers}</span></div>
        <div class="a-metric">Confidence: <span style="color:${a.confScore>=70?'#00d4aa':a.confScore>=45?'#ffd166':'#ff6584'}">${a.confidence}</span></div>
        <div class="a-metric">Duration: <span>${a.duration}s</span></div>
      </div>
      ${a.fillerWords.length ? `<div style="margin-top:6px;">${a.fillerWords.map(f=>`<span class="filler-chip">${f}</span>`).join('')}</div>` : ''}
    </div>
  `).join('');

  // Tips
  const tips = generateTips(avgWPM, totalFillers, avgConf, answerHistory);
  document.getElementById('improvementTips').innerHTML = tips.map(t => `
    <div class="suggestion-item ${t.type}" style="margin-bottom:0.5rem;">
      <div class="suggestion-icon">${t.type === 'critical' ? '🔴' : t.type === 'warning' ? '🟡' : '🟢'}</div>
      <div><div style="font-weight:600;margin-bottom:2px;">${t.title}</div><div style="color:var(--text-muted);font-size:0.85rem;">${t.detail}</div></div>
    </div>
  `).join('');
}

function generateTips(avgWPM, totalFillers, avgConf, history) {
  const tips = [];
  if (avgWPM < 100) tips.push({ type: 'warning', title: 'Speaking too slowly', detail: `Your average speed was ${avgWPM} wpm. Aim for 120-150 wpm for natural conversation.` });
  else if (avgWPM > 180) tips.push({ type: 'warning', title: 'Speaking too fast', detail: `${avgWPM} wpm is quite fast. Slow down to 130-160 wpm so interviewers can follow.` });
  else tips.push({ type: 'good', title: 'Good speaking pace', detail: `${avgWPM} wpm is a natural, comfortable pace for interviews.` });

  if (totalFillers > 10) tips.push({ type: 'critical', title: 'Too many filler words', detail: `You used ${totalFillers} filler words. Practice pausing silently instead of saying "uh" or "um".` });
  else if (totalFillers > 4) tips.push({ type: 'warning', title: 'Reduce filler words', detail: `${totalFillers} fillers detected. Record yourself practicing and consciously replace fillers with pauses.` });
  else tips.push({ type: 'good', title: 'Minimal filler words', detail: 'Great job keeping filler words low. This signals confidence and preparation.' });

  if (avgConf < 45) tips.push({ type: 'critical', title: 'Build confidence', detail: 'Practice answers out loud daily. Use the STAR method (Situation, Task, Action, Result) to structure responses.' });
  else if (avgConf < 70) tips.push({ type: 'warning', title: 'Improve confidence', detail: 'You showed moderate confidence. Prepare specific examples and practice until answers feel natural.' });
  else tips.push({ type: 'good', title: 'Strong confidence', detail: 'You came across as confident and prepared. Keep it up!' });

  const shortAnswers = history.filter(a => a.wordCount < 30).length;
  if (shortAnswers > 1) tips.push({ type: 'warning', title: 'Expand your answers', detail: `${shortAnswers} answers were too brief. Aim for 60-120 seconds per answer with specific examples.` });

  return tips;
}

function endVoiceInterview() {
  if (isRecording) stopRecording();
  if (answerHistory.length > 0) showResults();
  else { document.getElementById('voiceInterview').classList.add('hidden'); document.getElementById('voiceSetup').classList.remove('hidden'); }
}

// ===== TTS =====
function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95; u.pitch = 1;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.name.includes('Google') || v.name.includes('Natural'));
  if (preferred) u.voice = preferred;
  window.speechSynthesis.speak(u);
}
