if (!getToken()) window.location.href = 'index.html';

// ===== ROUND CONFIG: Coding → Technical → Managerial → HR =====
const ROUNDS = [
  { id:'coding', label:'Coding Round',     icon:'💻', badge:'round-coding', desc:'1 Easy + 1 Hard problem — changes every attempt', interviewer:'Dev — Senior Engineer',        minQ:2, maxQ:2  },
  { id:'tech',   label:'Technical Round',  icon:'🧠', badge:'round-tech',   desc:'Role-specific technical questions + AI follow-ups', interviewer:'Alex — Tech Lead',          minQ:4, maxQ:5  },
  { id:'mgr',    label:'Managerial Round', icon:'📋', badge:'round-mgr',    desc:'Situational & leadership questions + AI follow-ups', interviewer:'Priya — Engineering Manager', minQ:4, maxQ:5 },
  { id:'hr',     label:'HR Round',         icon:'👤', badge:'round-hr',     desc:'Background, motivation & culture fit + AI follow-ups', interviewer:'Sarah — HR Manager',      minQ:4, maxQ:5  }
];

const FILLERS = ['uh','um','uhh','umm','like','you know','basically','literally','actually','i mean','kind of','sort of'];

// ===== STATE =====
let currentRoundIdx = 0;
let currentQInRound = 0;
let role = 'Software Developer';
let sessionId = null;
let roundSessions = {};
let roundScores   = {};
let mediaStream   = null;
let cameraOn = true, micOn = true;
let recognition = null, isRecording = false;
let transcript = '', recordingStart = null, durationTimer = null;
let allMessages = [];
let lastUserAnswer = '';
let followUpCount  = 0;
let codingProblems = { easy: null, hard: null };
let currentCodingProblem = 0; // 0=easy, 1=hard
let simLang = 'javascript';

// ===== FALLBACK QUESTIONS =====
const FALLBACK = {
  tech: {
    'Software Developer': ['Explain the difference between stack and heap memory.','What is the time complexity of quicksort?','Describe SOLID principles with examples.','How does garbage collection work in your primary language?','Explain REST vs GraphQL.'],
    'Web Developer':      ['What is the virtual DOM and how does React use it?','Explain CSS specificity.','How does the browser render a webpage?','What are Web Workers?','Explain CORS and how to handle it.'],
    'Data Scientist':     ['Explain bias-variance tradeoff.','What is regularization and why is it used?','How do you handle class imbalance?','Explain gradient descent.','What is cross-validation?'],
    'ML Engineer':        ['How do you deploy a model to production?','What is model drift and how do you detect it?','Explain the difference between batch and online learning.','What is feature engineering?','How do you optimize inference latency?']
  },
  mgr: [
    'Tell me about a time you had to lead a team through a difficult project. What was your approach?',
    'Describe a situation where you disagreed with your manager. How did you handle it?',
    'Give an example of a time you had to make a critical decision with incomplete information.',
    'Tell me about a time a project failed. What did you learn?',
    'Describe how you prioritize tasks when everything feels urgent.',
    'Tell me about a time you had to give difficult feedback to a colleague.'
  ],
  hr: [
    'Tell me about yourself and your career journey.',
    'Why are you interested in this role and our company?',
    'What are your greatest strengths and how do they apply here?',
    'Where do you see yourself in 5 years?',
    'What motivates you in your work?',
    'How do you handle stress and pressure?'
  ]
};

const FOLLOW_UP_PROMPTS = [
  'Can you give me a specific example of that?',
  'Interesting — what was the biggest challenge in that situation?',
  'How did that experience shape your approach going forward?',
  'Can you quantify the impact of what you described?',
  'What would you do differently if you faced that again?'
];

// ===== SETUP =====
async function startSimulation() {
  role = document.getElementById('setupRole').value;
  const wantCam = document.getElementById('enableCamera').checked;
  const wantMic = document.getElementById('enableMic').checked;
  ROUNDS.forEach(r => { roundSessions[r.id] = []; });

  if (wantCam || wantMic) {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: wantCam, audio: wantMic });
      document.getElementById('userVideo').srcObject = mediaStream;
      if (!wantCam) showNoCamera();
    } catch { showNoCamera(); showToast('Camera/mic denied — continuing without', 'info'); }
  } else { showNoCamera(); }

  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('interviewScreen').classList.remove('hidden');
  startRound(0);
}

function showNoCamera() {
  document.getElementById('userVideo').style.display = 'none';
  document.getElementById('noCamera').style.display = 'flex';
}

// ===== ROUND MANAGEMENT =====
function startRound(idx) {
  currentRoundIdx = idx;
  currentQInRound = 0;
  followUpCount   = 0;
  sessionId       = null;
  transcript      = '';
  lastUserAnswer  = '';
  currentCodingProblem = 0;

  const round = ROUNDS[idx];

  // Update step indicators
  ROUNDS.forEach((r, i) => {
    const el = document.getElementById(`step-${i}`);
    el.className = 'round-step' + (i < idx ? ' done' : i === idx ? ' active' : '');
  });

  document.getElementById('currentRoundBadge').className = `round-badge ${round.badge}`;
  document.getElementById('currentRoundBadge').textContent = `${round.icon} ${round.label}`;
  document.getElementById('roundDesc').textContent = round.desc;
  document.getElementById('interviewerName').textContent = `${round.icon} ${round.interviewer}`;
  updateQProgress();

  // Show/hide coding panel
  const isCoding = round.id === 'coding';
  document.getElementById('codingPanel').classList.toggle('hidden', !isCoding);
  document.getElementById('voiceInputArea').style.display = isCoding ? 'none' : 'flex';

  document.getElementById('simMessages').innerHTML = '';

  const greeting = idx === 0
    ? `Welcome! I'm ${round.interviewer.split('—')[0].trim()}. We'll start with the Coding Round — 2 problems, one easy and one hard. Ready?`
    : `Moving to the ${round.label}. I'm ${round.interviewer.split('—')[0].trim()}. Let's begin!`;

  appendMsg('ai', greeting);
  speakText(greeting);

  if (isCoding) {
    loadCodingProblems();
  } else {
    setTimeout(() => askNextQuestion(), 1500);
  }
}

// ===== CODING ROUND =====
function loadCodingProblems() {
  // Pick random easy and hard from problems.js bank
  codingProblems.easy = getNextProblem('easy');
  codingProblems.hard = getNextProblem('hard');
  showCodingProblem(0);
}

function showCodingProblem(idx) {
  currentCodingProblem = idx;
  const p = idx === 0 ? codingProblems.easy : codingProblems.hard;
  const label = idx === 0 ? '🟢 Easy' : '🔴 Hard';

  const problemHTML = `
    <div style="background:var(--bg2);border-radius:10px;padding:1rem;margin-bottom:0.75rem;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:0.5rem;">
        <span style="font-weight:700;">${label}: ${p.title}</span>
      </div>
      <p style="font-size:0.88rem;color:var(--text-muted);line-height:1.6;margin-bottom:0.75rem;">${p.description}</p>
      ${p.examples.map((ex,i) => `<div style="font-size:0.82rem;background:var(--card);border-radius:6px;padding:0.5rem;margin-bottom:4px;"><b>Example ${i+1}:</b> Input: ${ex.input} → Output: ${ex.output}</div>`).join('')}
    </div>`;

  appendMsg('ai', `Problem ${idx+1} of 2 — ${label}<br>${problemHTML}Write your solution in the editor below and click "Submit Code".`);
  document.getElementById('simCodeEditor').value = getSimStarterCode(p);
  document.getElementById('simCodeEditor').placeholder = `// Solve: ${p.title}`;
}

function getSimStarterCode(p) {
  if (!p?.starterCode) return getDefaultStarter();
  return p.starterCode[simLang] || p.starterCode['javascript'] || getDefaultStarter();
}

function getDefaultStarter() {
  const starters = {
    javascript: '// Write your solution here\nfunction solution() {\n  \n}',
    python:     '# Write your solution here\ndef solution():\n    pass',
    java:       '// Write your solution here\nclass Solution {\n    public void solution() {\n        \n    }\n}',
    cpp:        '// Write your solution here\n#include <bits/stdc++.h>\nusing namespace std;\n\nvoid solution() {\n    \n}'
  };
  return starters[simLang] || starters.javascript;
}

function changeSimLang() {
  simLang = document.getElementById('simLangSelect').value;
  const p = currentCodingProblem === 0 ? codingProblems.easy : codingProblems.hard;
  if (p) document.getElementById('simCodeEditor').value = getSimStarterCode(p);
}

async function submitCodingAnswer() {
  const code = document.getElementById('simCodeEditor').value.trim();
  if (!code || code.startsWith('//')) { showToast('Write your solution first', 'error'); return; }

  const p = currentCodingProblem === 0 ? codingProblems.easy : codingProblems.hard;
  appendMsg('user', `\`\`\`javascript\n${code.slice(0, 300)}${code.length > 300 ? '\n...' : ''}\n\`\`\``);
  allMessages.push({ round: 'coding', role: 'user', content: `Code for ${p.title}: ${code.slice(0,200)}` });

  const btn = document.getElementById('simSendBtn');
  btn.disabled = true; btn.textContent = 'Reviewing...';

  // AI code review
  try {
    const res = await fetch('/api/interview/chat', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        message: `Review this ${simLang} solution for "${p.title}":\n\`\`\`\n${code.slice(0,500)}\n\`\`\`\nComment on: correctness, time/space complexity, edge cases. Be concise (3-4 sentences).`,
        sessionId, role, type: 'coding'
      })
    });
    const data = await res.json();
    sessionId = data.sessionId;
    appendMsg('ai', data.message);
    speakText(data.message);
    allMessages.push({ round: 'coding', role: 'ai', content: data.message });
    roundSessions.coding.push({ answer: code, metrics: captureMetrics(code) });
  } catch {
    const fb = `Thanks for your solution to ${p.title}. Make sure to consider edge cases and aim for optimal time complexity.`;
    appendMsg('ai', fb);
    roundSessions.coding.push({ answer: code, metrics: { confScore: 60, wpm: 0, fillers: 0, words: code.split(/\s+/).length } });
  }

  btn.disabled = false; btn.textContent = 'Submit Code';

  // Move to hard problem or end coding round
  if (currentCodingProblem === 0) {
    setTimeout(() => {
      appendMsg('ai', 'Great! Now let\'s move to the Hard problem.');
      setTimeout(() => showCodingProblem(1), 800);
    }, 1500);
  } else {
    setTimeout(() => promptEndRound(), 1500);
  }
}

// ===== QUESTION FLOW (Tech / Mgr / HR) =====
async function askNextQuestion() {
  const round = ROUNDS[currentRoundIdx];
  updateQProgress();

  const systemPrompts = {
    tech: `You are Alex, a Tech Lead interviewing a ${role} candidate. Ask ONE specific technical question. Be direct and technical. No preamble.`,
    mgr:  `You are Priya, an Engineering Manager. Ask ONE situational/behavioral question using real workplace scenarios. No preamble.`,
    hr:   `You are Sarah, an HR Manager. Ask ONE question about background, motivation, values, or culture fit. Be warm. No preamble.`
  };

  try {
    const res = await fetch('/api/interview/chat', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        message: currentQInRound === 0 ? `Start the ${round.id} interview. Ask the first question only.` : 'Ask the next question.',
        sessionId, role, type: round.id
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error();
    sessionId = data.sessionId;
    appendMsg('ai', data.message);
    speakText(data.message);
    allMessages.push({ round: round.id, role: 'ai', content: data.message });
  } catch {
    const q = getFallbackQ(round.id, currentQInRound);
    appendMsg('ai', q);
    speakText(q);
    allMessages.push({ round: round.id, role: 'ai', content: q });
  }
  currentQInRound++;
}

async function sendSimAnswer() {
  const round = ROUNDS[currentRoundIdx];
  if (round.id === 'coding') { submitCodingAnswer(); return; }

  const answer = transcript.trim() || document.getElementById('simInput').value.trim();
  if (!answer) { showToast('Please speak or type your answer', 'error'); return; }

  if (isRecording) stopSimRecording();
  const metrics = captureMetrics(answer);
  appendMsg('user', answer);
  allMessages.push({ round: round.id, role: 'user', content: answer });
  roundSessions[round.id].push({ answer, metrics });
  lastUserAnswer = answer;

  document.getElementById('simInput').value = '';
  transcript = '';
  document.getElementById('simTranscript').textContent = 'Your speech will appear here...';

  const btn = document.getElementById('simSendBtn');
  btn.disabled = true;

  // Get AI response + decide follow-up
  try {
    const res = await fetch('/api/interview/chat', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ message: answer, sessionId, role, type: round.id })
    });
    const data = await res.json();
    sessionId = data.sessionId;
    appendMsg('ai', data.message);
    speakText(data.message);
    allMessages.push({ round: round.id, role: 'ai', content: data.message });
  } catch {
    appendMsg('ai', 'Thank you. Let me continue.');
  }

  btn.disabled = false;

  // Decide: follow-up or next question?
  const shouldFollowUp = followUpCount < 1 && (metrics.words < 30 || metrics.confScore < 50);
  const doneWithRound  = currentQInRound >= ROUNDS[currentRoundIdx].maxQ && !shouldFollowUp;

  if (shouldFollowUp) {
    followUpCount++;
    setTimeout(() => askFollowUp(answer), 1800);
  } else if (doneWithRound) {
    setTimeout(() => promptEndRound(), 1800);
  } else {
    followUpCount = 0;
    setTimeout(() => askNextQuestion(), 1800);
  }
}

async function askFollowUp(prevAnswer) {
  const round = ROUNDS[currentRoundIdx];
  updateQProgress();

  // Show follow-up badge
  appendMsg('ai', '<span style="background:rgba(255,209,102,0.15);color:var(--warning);border:1px solid rgba(255,209,102,0.3);padding:2px 10px;border-radius:50px;font-size:0.75rem;font-weight:700;">↩ Follow-up</span>');

  try {
    const res = await fetch('/api/interview/chat', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        message: `The candidate answered: "${prevAnswer.slice(0,250)}". Ask ONE concise follow-up question to dig deeper.`,
        sessionId, role, type: round.id
      })
    });
    const data = await res.json();
    sessionId = data.sessionId;
    appendMsg('ai', data.message);
    speakText(data.message);
    allMessages.push({ round: round.id, role: 'ai', content: '↩ Follow-up: ' + data.message });
  } catch {
    const q = FOLLOW_UP_PROMPTS[Math.floor(Math.random() * FOLLOW_UP_PROMPTS.length)];
    appendMsg('ai', q);
    allMessages.push({ round: round.id, role: 'ai', content: q });
  }
  currentQInRound++;
}

function skipSimQuestion() {
  const round = ROUNDS[currentRoundIdx];
  if (round.id === 'coding') return;
  followUpCount = 0;
  if (currentQInRound >= round.maxQ) promptEndRound();
  else askNextQuestion();
}

function promptEndRound() {
  const round = ROUNDS[currentRoundIdx];
  const isLast = currentRoundIdx === ROUNDS.length - 1;
  const msg = isLast
    ? `That wraps up the HR Round and your full interview! Click "End Interview" to see your results.`
    : `That concludes the ${round.label}. Click "Next Round →" to continue.`;
  appendMsg('ai', msg);
  speakText(msg);
}

function endCurrentRound() {
  const rid = ROUNDS[currentRoundIdx].id;
  const answers = roundSessions[rid] || [];
  const avgConf = answers.length ? Math.round(answers.reduce((s,a)=>s+a.metrics.confScore,0)/answers.length) : 55;
  roundScores[rid] = Math.min(10, Math.max(1, Math.round(avgConf / 10)));
  if (currentRoundIdx < ROUNDS.length - 1) startRound(currentRoundIdx + 1);
  else endSimulation();
}

function endSimulation() {
  if (isRecording) stopSimRecording();
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  document.getElementById('interviewScreen').classList.add('hidden');
  document.getElementById('resultsScreen').classList.remove('hidden');
  renderResults();
}

// ===== SPEECH RECOGNITION =====
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function toggleSimRecording() { isRecording ? stopSimRecording() : startSimRecording(); }

function startSimRecording() {
  if (!SpeechRecognition) { showToast('Use Chrome for speech recognition', 'error'); return; }
  recognition = new SpeechRecognition();
  recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
  recognition.onstart = () => {
    isRecording = true; recordingStart = Date.now(); transcript = '';
    document.getElementById('simMicBtn').textContent = '⏹️';
    document.getElementById('simMicBtn').classList.replace('on','off');
    document.getElementById('miniWave').classList.add('active');
    startDurTimer();
  };
  recognition.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    transcript += final;
    const full = transcript + interim;
    document.getElementById('simTranscript').textContent = full;
    document.getElementById('simInput').value = full;
    updateLiveMetrics(full);
  };
  recognition.onerror = () => stopSimRecording();
  recognition.onend   = () => { if (isRecording) recognition.start(); };
  recognition.start();
}

function stopSimRecording() {
  isRecording = false; recognition?.stop(); clearInterval(durationTimer);
  document.getElementById('simMicBtn').textContent = '🎙️';
  document.getElementById('simMicBtn').classList.replace('off','on');
  document.getElementById('miniWave').classList.remove('active');
}

function startDurTimer() {
  durationTimer = setInterval(() => {
    const secs = (Date.now() - recordingStart) / 1000;
    const words = transcript.trim().split(/\s+/).filter(Boolean).length;
    if (secs > 0) document.getElementById('lmWPM').textContent = Math.round(words / (secs / 60));
  }, 500);
}

function updateLiveMetrics(text) {
  const words   = text.trim().split(/\s+/).filter(Boolean).length;
  const fillers = FILLERS.reduce((c,f) => c + (text.toLowerCase().match(new RegExp('\\b'+f+'\\b','g'))||[]).length, 0);
  document.getElementById('lmFillers').textContent = fillers;
  const { label, color } = calcConf(words, fillers);
  document.getElementById('lmConf').textContent = label;
  document.getElementById('lmConf').style.color  = color;
}

function captureMetrics(text) {
  const words   = text.trim().split(/\s+/).filter(Boolean).length;
  const fillers = FILLERS.reduce((c,f) => c + (text.toLowerCase().match(new RegExp('\\b'+f+'\\b','g'))||[]).length, 0);
  const secs    = recordingStart ? (Date.now() - recordingStart) / 1000 : 0;
  const wpm     = secs > 0 ? Math.round(words / (secs / 60)) : 0;
  const { score: confScore, label: confidence } = calcConf(words, fillers);
  return { words, fillers, wpm, confScore, confidence };
}

function calcConf(words, fillers) {
  let score = 50;
  if (words > 80) score += 20; else if (words > 40) score += 10; else if (words < 15) score -= 15;
  const ratio = words > 0 ? fillers / words : 0;
  if (ratio > 0.1) score -= 20; else if (ratio > 0.05) score -= 10; else if (ratio === 0) score += 10;
  score = Math.max(10, Math.min(95, score));
  const label = score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low';
  const color = score >= 70 ? '#00d4aa' : score >= 45 ? '#ffd166' : '#ff6584';
  return { score, label, color };
}

// ===== CAMERA / MIC =====
function toggleCamera() {
  if (!mediaStream) return;
  const t = mediaStream.getVideoTracks()[0]; if (!t) return;
  cameraOn = !cameraOn; t.enabled = cameraOn;
  document.getElementById('camBtn').className = `vid-btn ${cameraOn?'on':'off'}`;
  document.getElementById('userVideo').style.display = cameraOn ? 'block' : 'none';
  document.getElementById('noCamera').style.display  = cameraOn ? 'none'  : 'flex';
}
function toggleMic() {
  if (!mediaStream) return;
  const t = mediaStream.getAudioTracks()[0]; if (!t) return;
  micOn = !micOn; t.enabled = micOn;
  document.getElementById('micBtn').className = `vid-btn ${micOn?'on':'off'}`;
}

// ===== HELPERS =====
function appendMsg(role, content) {
  const c = document.getElementById('simMessages');
  const d = document.createElement('div');
  d.className = `sim-msg ${role}`;
  d.innerHTML = `<div class="avatar">${role==='ai'?'🤖':'👤'}</div><div class="bubble">${content.replace(/\n/g,'<br>')}</div>`;
  c.appendChild(d); c.scrollTop = c.scrollHeight;
}

function updateQProgress() {
  const round = ROUNDS[currentRoundIdx];
  document.getElementById('qProgress').textContent = `Q ${currentQInRound}/${round.maxQ}`;
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/<[^>]*>/g,'').slice(0,250));
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

function getFallbackQ(roundId, idx) {
  if (roundId === 'tech') {
    const pool = FALLBACK.tech[role] || FALLBACK.tech['Software Developer'];
    return pool[idx % pool.length];
  }
  const pool = FALLBACK[roundId] || FALLBACK.hr;
  return pool[idx % pool.length];
}

// ===== RESULTS =====
function renderResults() {
  ROUNDS.forEach(r => { if (!roundScores[r.id]) roundScores[r.id] = 5; });
  const scores  = Object.values(roundScores);
  const overall = Math.round(scores.reduce((a,b)=>a+b,0) / scores.length * 10);

  const roundColors = { coding:'var(--danger)', tech:'var(--secondary)', mgr:'var(--warning)', hr:'var(--primary)' };
  const roundIcons  = { coding:'💻', tech:'🧠', mgr:'📋', hr:'👤' };

  document.getElementById('roundScores').innerHTML = ROUNDS.map(r => `
    <div class="round-score-card">
      <div class="rs-icon">${roundIcons[r.id]}</div>
      <div class="rs-score" style="color:${roundColors[r.id]}">${roundScores[r.id]}/10</div>
      <div class="rs-label">${r.label}</div>
    </div>`).join('');

  document.getElementById('overallScoreNum').textContent = overall + '%';
  const verdict = overall >= 75 ? '🌟 Excellent Performance' : overall >= 55 ? '👍 Good Performance' : '📈 Needs Improvement';
  document.getElementById('overallVerdict').textContent  = verdict;
  document.getElementById('overallSummary').textContent  = overall >= 75
    ? 'You performed strongly across all 4 rounds. You are well-prepared for real interviews.'
    : overall >= 55
    ? 'Solid performance with some areas to polish. Review the feedback below and practice regularly.'
    : 'This simulation highlighted key areas to work on. Use the recommendations below to improve.';

  fetchFullDebrief(overall);
}

async function fetchFullDebrief(overall) {
  const summary = allMessages.slice(-40)
    .map(m => `[${m.round.toUpperCase()}] ${m.role==='ai'?'Interviewer':'Candidate'}: ${m.content.slice(0,150)}`)
    .join('\n');

  try {
    const res = await fetch('/api/interview/analyze', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        role,
        scores: { technical: roundScores.tech||5, communication: roundScores.hr||5, confidence: roundScores.mgr||5 },
        conversationSummary: summary
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error();
    renderDebrief(data);
  } catch { renderDebrief(buildFallbackDebrief(overall)); }
}

function buildFallbackDebrief(overall) {
  return {
    strengths: [
      { point:'Completed all 4 rounds', detail:'You showed commitment by going through the full simulation.' },
      { point:'Coding engagement', detail:'You attempted both coding problems showing technical initiative.' },
      { point:'Communication effort', detail:'You engaged with every question across all rounds.' }
    ],
    weaknesses: [
      { point:'Answer depth', detail:'Some answers lacked specific examples or quantifiable results.' },
      { point:'Structured responses', detail:'Using STAR method consistently would strengthen behavioral answers.' },
      { point:'Technical precision', detail:'Technical answers could be more precise with concrete implementations.' }
    ],
    suggestions: [
      { area:'Use STAR Method', action:'Structure every behavioral answer: Situation → Task → Action → Result.' },
      { area:'Prepare 5 core stories', action:'Have 5 strong examples ready covering leadership, failure, success, conflict, and innovation.' },
      { area:'Practice coding daily', action:'Solve 1-2 LeetCode problems daily focusing on arrays, trees, and DP.' },
      { area:'Mock interviews weekly', action:'Do at least 2 full simulations per week to build fluency across all rounds.' }
    ],
    nextPractice: [
      { topic:'System Design', reason:'Critical for technical rounds', resource:'Study scalability, load balancing, caching, and database design.' },
      { topic:'Behavioral Questions', reason:'HR and Managerial rounds', resource:'Prepare STAR stories for 10 common behavioral questions.' },
      { topic:'Data Structures & Algorithms', reason:'Coding round preparation', resource:'Focus on arrays, linked lists, trees, and dynamic programming.' },
      { topic:'Leadership & Conflict', reason:'Managerial round', resource:'Study conflict resolution frameworks and leadership principles.' }
    ]
  };
}

function renderDebrief(data) {
  document.getElementById('debriefLoading').classList.add('hidden');
  document.getElementById('fullDebrief').classList.remove('hidden');

  const roundColors = { coding:'var(--danger)', tech:'var(--secondary)', mgr:'var(--warning)', hr:'var(--primary)' };

  // Per-round breakdown
  document.getElementById('roundFeedbacks').innerHTML = ROUNDS.map(r => {
    const answers = roundSessions[r.id] || [];
    const avgConf = answers.length ? Math.round(answers.reduce((s,a)=>s+a.metrics.confScore,0)/answers.length) : 50;
    const avgWPM  = answers.length ? Math.round(answers.reduce((s,a)=>s+a.metrics.wpm,0)/answers.length) : 0;
    const totalF  = answers.reduce((s,a)=>s+a.metrics.fillers,0);
    const { label: cLabel, color: cColor } = calcConf(avgConf > 0 ? 50 : 0, 0);
    const confLabel = avgConf>=70?'High':avgConf>=45?'Medium':'Low';
    const confColor = avgConf>=70?'#00d4aa':avgConf>=45?'#ffd166':'#ff6584';
    return `
      <div class="card mb-2">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
          <span class="round-badge ${r.badge}">${r.icon} ${r.label}</span>
          <span style="font-size:1.2rem;font-weight:800;color:${roundColors[r.id]}">${roundScores[r.id]}/10</span>
        </div>
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;font-size:0.85rem;">
          <div>Avg Speed: <strong>${avgWPM > 0 ? avgWPM + ' wpm' : 'N/A'}</strong></div>
          <div>Filler Words: <strong>${totalF}</strong></div>
          <div>Confidence: <strong style="color:${confColor}">${confLabel}</strong></div>
          <div>Questions: <strong>${answers.length}</strong></div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('strengthsList').innerHTML = (data.strengths||[]).map(s=>`
    <div style="display:flex;gap:8px;margin-bottom:0.6rem;font-size:0.88rem;">
      <span style="color:var(--success);flex-shrink:0;">✔</span>
      <div><div style="font-weight:600;">${s.point}</div><div style="color:var(--text-muted);font-size:0.82rem;">${s.detail}</div></div>
    </div>`).join('');

  document.getElementById('weaknessesList').innerHTML = (data.weaknesses||[]).map(w=>`
    <div style="display:flex;gap:8px;margin-bottom:0.6rem;font-size:0.88rem;">
      <span style="color:var(--danger);flex-shrink:0;">✖</span>
      <div><div style="font-weight:600;">${w.point}</div><div style="color:var(--text-muted);font-size:0.82rem;">${w.detail}</div></div>
    </div>`).join('');

  document.getElementById('suggestionsList').innerHTML = (data.suggestions||[]).map(s=>`
    <div style="display:flex;gap:10px;background:var(--bg2);border-radius:10px;padding:0.9rem;margin-bottom:0.5rem;">
      <span style="color:var(--primary);">→</span>
      <div><div style="font-weight:600;font-size:0.88rem;">${s.area}</div><div style="color:var(--text-muted);font-size:0.83rem;margin-top:2px;">${s.action}</div></div>
    </div>`).join('');

  document.getElementById('nextPractice').innerHTML = (data.nextPractice||[]).map((p,i)=>`
    <div style="display:flex;gap:12px;background:var(--bg2);border-radius:10px;padding:0.9rem;margin-bottom:0.5rem;">
      <div style="width:28px;height:28px;background:linear-gradient(135deg,var(--primary),var(--secondary));border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:800;flex-shrink:0;">${i+1}</div>
      <div>
        <div style="font-weight:700;font-size:0.88rem;">${p.topic}</div>
        <div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px;">${p.reason}</div>
        <div style="font-size:0.8rem;color:var(--primary);margin-top:4px;">📖 ${p.resource}</div>
      </div>
    </div>`).join('');
}
