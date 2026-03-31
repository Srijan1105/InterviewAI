if (!getToken()) window.location.href = 'index.html';

// ===== CONFIG =====
const ROUNDS = [
  { id: 'hr',     label: 'HR Round',         icon: '👤', badge: 'round-hr',     desc: 'Background, motivation & culture fit',       interviewer: 'Sarah — HR Manager' },
  { id: 'tech',   label: 'Technical Round',  icon: '🧠', badge: 'round-tech',   desc: 'Role-specific technical knowledge & skills',  interviewer: 'Alex — Tech Lead' },
  { id: 'mgr',    label: 'Managerial Round', icon: '📋', badge: 'round-mgr',    desc: 'Leadership, conflict & decision-making',      interviewer: 'Priya — Engineering Manager' },
  { id: 'coding', label: 'Coding Round',     icon: '💻', badge: 'round-coding', desc: 'Live coding problem with AI code review',     interviewer: 'Dev — Senior Engineer' }
];

const ROUND_PROMPTS = {
  hr:     (role) => `You are Sarah, an experienced HR Manager conducting an HR interview for a ${role} position. Ask about background, motivation, strengths/weaknesses, culture fit, and career goals. Be warm but professional. Ask one question at a time.`,
  tech:   (role) => `You are Alex, a Tech Lead conducting a technical interview for a ${role} position. Ask deep technical questions specific to the role. Probe for understanding, not just memorized answers. Ask one question at a time.`,
  mgr:    (role) => `You are Priya, an Engineering Manager conducting a managerial/behavioral interview for a ${role} position. Ask about leadership, handling conflict, team collaboration, decision-making under pressure, and project management. Use STAR-based follow-ups. Ask one question at a time.`,
  coding: (role) => `You are Dev, a Senior Engineer conducting a coding interview for a ${role} position. First describe a coding problem clearly (arrays/strings/algorithms level). After the candidate submits code, review it and give feedback on correctness, time complexity, and edge cases. Be specific and technical.`
};

const FILLERS = ['uh','um','uhh','umm','like','you know','basically','literally','actually','i mean','kind of','sort of'];

// ===== STATE =====
let currentRoundIdx = 0;
let qCountPerRound = 3;
let currentQInRound = 0;
let role = 'Software Developer';
let sessionId = null;
let roundSessions = {};   // { hr: [{q,a,metrics}], tech: [...], ... }
let roundScores = {};     // { hr: score, tech: score, ... }
let mediaStream = null;
let cameraOn = true;
let micOn = true;
let recognition = null;
let isRecording = false;
let transcript = '';
let recordingStart = null;
let durationTimer = null;
let allMessages = [];     // flat log for debrief

// ===== SETUP =====
async function startSimulation() {
  role = document.getElementById('setupRole').value;
  qCountPerRound = parseInt(document.getElementById('setupQCount').value);
  const wantCamera = document.getElementById('enableCamera').checked;
  const wantMic = document.getElementById('enableMic').checked;

  // Init round data
  ROUNDS.forEach(r => { roundSessions[r.id] = []; });

  // Request camera/mic
  if (wantCamera || wantMic) {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: wantCamera, audio: wantMic });
      const vid = document.getElementById('userVideo');
      vid.srcObject = mediaStream;
      if (!wantCamera) showNoCameraPlaceholder();
    } catch (e) {
      showToast('Camera/mic access denied — continuing without media', 'info');
      showNoCameraPlaceholder();
    }
  } else {
    showNoCameraPlaceholder();
  }

  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('interviewScreen').classList.remove('hidden');

  startRound(0);
}

function showNoCameraPlaceholder() {
  document.getElementById('userVideo').style.display = 'none';
  document.getElementById('noCamera').style.display = 'flex';
}

// ===== ROUND MANAGEMENT =====
function startRound(idx) {
  currentRoundIdx = idx;
  currentQInRound = 0;
  sessionId = null;
  transcript = '';

  const round = ROUNDS[idx];

  // Update steps
  ROUNDS.forEach((r, i) => {
    const el = document.getElementById(`step-${i}`);
    el.className = 'round-step' + (i < idx ? ' done' : i === idx ? ' active' : '');
  });

  // Update badge & desc
  document.getElementById('currentRoundBadge').className = `round-badge ${round.badge}`;
  document.getElementById('currentRoundBadge').textContent = `${round.icon} ${round.label}`;
  document.getElementById('roundDesc').textContent = round.desc;
  document.getElementById('interviewerName').textContent = `${round.icon} ${round.interviewer}`;
  updateQProgress();

  // Show/hide coding panel
  document.getElementById('codingPanel').classList.toggle('hidden', round.id !== 'coding');
  document.getElementById('voiceInputArea').style.display = round.id === 'coding' ? 'none' : 'flex';

  // Clear chat
  document.getElementById('simMessages').innerHTML = '';

  // Start with AI greeting
  const greeting = idx === 0
    ? `Hi! I'm ${round.interviewer.split('—')[0].trim()}. Welcome to your interview for the ${role} position. Let's get started!`
    : `Moving on to the ${round.label}. I'm ${round.interviewer.split('—')[0].trim()}. Ready?`;

  appendSimMessage('ai', greeting);
  speakText(greeting);
  setTimeout(() => askNextQuestion(), 1500);
}

async function askNextQuestion() {
  const round = ROUNDS[currentRoundIdx];
  updateQProgress();

  const systemPrompt = ROUND_PROMPTS[round.id](role);
  const msg = currentQInRound === 0
    ? `Ask the first ${round.id} interview question. Be concise.`
    : `Ask the next ${round.id} interview question. Be concise.`;

  try {
    const res = await fetch('/api/interview/chat', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message: msg, sessionId, role, type: round.id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error();
    sessionId = data.sessionId;
    appendSimMessage('ai', data.message);
    speakText(data.message);
    allMessages.push({ round: round.id, role: 'ai', content: data.message });
  } catch {
    const fallback = getFallbackQuestion(round.id, currentQInRound);
    appendSimMessage('ai', fallback);
    speakText(fallback);
    allMessages.push({ round: round.id, role: 'ai', content: fallback });
  }
  currentQInRound++;
}

async function sendSimAnswer() {
  const round = ROUNDS[currentRoundIdx];
  let answer = '';

  if (round.id === 'coding') {
    answer = document.getElementById('simCodeEditor').value.trim();
    if (!answer) { showToast('Write some code first', 'error'); return; }
  } else {
    answer = (transcript.trim() || document.getElementById('simInput').value.trim());
    if (!answer) { showToast('Please speak or type your answer', 'error'); return; }
  }

  if (isRecording) stopSimRecording();

  // Capture metrics
  const metrics = captureMetrics(answer);
  appendSimMessage('user', answer);
  allMessages.push({ round: round.id, role: 'user', content: answer });
  roundSessions[round.id].push({ answer, metrics });

  document.getElementById('simInput').value = '';
  transcript = '';
  document.getElementById('simTranscript').textContent = 'Your speech will appear here...';

  // Get AI response
  const btn = document.getElementById('simSendBtn');
  btn.disabled = true;

  try {
    const res = await fetch('/api/interview/chat', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message: answer, sessionId, role, type: round.id })
    });
    const data = await res.json();
    sessionId = data.sessionId;
    appendSimMessage('ai', data.message);
    speakText(data.message);
    allMessages.push({ round: round.id, role: 'ai', content: data.message });
  } catch {
    const fb = 'Thank you for your answer. Let me ask you the next question.';
    appendSimMessage('ai', fb);
  }

  btn.disabled = false;

  // Auto-advance if enough questions done
  if (currentQInRound < qCountPerRound) {
    setTimeout(() => askNextQuestion(), 2000);
  } else {
    setTimeout(() => promptEndRound(), 2000);
  }
}

function promptEndRound() {
  const round = ROUNDS[currentRoundIdx];
  const msg = currentRoundIdx < ROUNDS.length - 1
    ? `That concludes the ${round.label}. You did well! Click "End Round" to proceed to the next round.`
    : `That concludes the ${round.label} and the entire interview! Click "End Interview" to see your results.`;
  appendSimMessage('ai', msg);
  speakText(msg);
}

function endCurrentRound() {
  // Score this round based on answers
  const roundId = ROUNDS[currentRoundIdx].id;
  const answers = roundSessions[roundId];
  const avgConf = answers.length
    ? Math.round(answers.reduce((s, a) => s + a.metrics.confScore, 0) / answers.length)
    : 50;
  roundScores[roundId] = Math.round(avgConf / 10);

  if (currentRoundIdx < ROUNDS.length - 1) {
    startRound(currentRoundIdx + 1);
  } else {
    endSimulation();
  }
}

function skipSimQuestion() {
  if (currentQInRound < qCountPerRound) askNextQuestion();
  else promptEndRound();
}

function endSimulation() {
  if (isRecording) stopSimRecording();
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  document.getElementById('interviewScreen').classList.add('hidden');
  document.getElementById('resultsScreen').classList.remove('hidden');
  renderResults();
}

// ===== RECORDING =====
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function toggleSimRecording() {
  isRecording ? stopSimRecording() : startSimRecording();
}

function startSimRecording() {
  if (!SpeechRecognition) { showToast('Use Chrome for speech recognition', 'error'); return; }
  recognition = new SpeechRecognition();
  recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
  recognition.onstart = () => {
    isRecording = true; recordingStart = Date.now(); transcript = '';
    document.getElementById('simMicBtn').textContent = '⏹️';
    document.getElementById('simMicBtn').classList.replace('on','off');
    document.getElementById('miniWave').classList.add('active');
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
    document.getElementById('simTranscript').textContent = full;
    document.getElementById('simInput').value = full;
    updateLiveMetrics(full);
  };
  recognition.onerror = () => stopSimRecording();
  recognition.onend = () => { if (isRecording) recognition.start(); };
  recognition.start();
}

function stopSimRecording() {
  isRecording = false; recognition?.stop(); clearInterval(durationTimer);
  document.getElementById('simMicBtn').textContent = '🎙️';
  document.getElementById('simMicBtn').classList.replace('off','on');
  document.getElementById('miniWave').classList.remove('active');
}

function startDurationTimer() {
  durationTimer = setInterval(() => {
    const secs = (Date.now() - recordingStart) / 1000;
    const words = transcript.trim().split(/\s+/).filter(Boolean).length;
    if (secs > 0) document.getElementById('lmWPM').textContent = Math.round(words / (secs / 60));
  }, 500);
}

function updateLiveMetrics(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const fillers = FILLERS.reduce((c, f) => c + (text.toLowerCase().match(new RegExp('\\b'+f+'\\b','g'))||[]).length, 0);
  document.getElementById('lmFillers').textContent = fillers;
  const { label, color } = calcConf(words, fillers, text);
  document.getElementById('lmConf').textContent = label;
  document.getElementById('lmConf').style.color = color;
}

function captureMetrics(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const fillers = FILLERS.reduce((c, f) => c + (text.toLowerCase().match(new RegExp('\\b'+f+'\\b','g'))||[]).length, 0);
  const secs = recordingStart ? (Date.now() - recordingStart) / 1000 : 0;
  const wpm = secs > 0 ? Math.round(words / (secs / 60)) : 0;
  const { score: confScore, label: confidence } = calcConf(words, fillers, text);
  return { words, fillers, wpm, confScore, confidence };
}

function calcConf(words, fillers, text) {
  let score = 50;
  if (words > 80) score += 20; else if (words > 40) score += 10; else if (words < 15) score -= 15;
  const ratio = words > 0 ? fillers / words : 0;
  if (ratio > 0.1) score -= 20; else if (ratio > 0.05) score -= 10; else if (ratio === 0) score += 10;
  score = Math.max(10, Math.min(95, score));
  const label = score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low';
  const color = score >= 70 ? '#00d4aa' : score >= 45 ? '#ffd166' : '#ff6584';
  return { score, label, color };
}

// ===== CAMERA / MIC TOGGLE =====
function toggleCamera() {
  if (!mediaStream) return;
  const track = mediaStream.getVideoTracks()[0];
  if (!track) return;
  cameraOn = !cameraOn; track.enabled = cameraOn;
  document.getElementById('camBtn').className = `vid-btn ${cameraOn ? 'on' : 'off'}`;
  document.getElementById('userVideo').style.display = cameraOn ? 'block' : 'none';
  document.getElementById('noCamera').style.display = cameraOn ? 'none' : 'flex';
}

function toggleMic() {
  if (!mediaStream) return;
  const track = mediaStream.getAudioTracks()[0];
  if (!track) return;
  micOn = !micOn; track.enabled = micOn;
  document.getElementById('micBtn').className = `vid-btn ${micOn ? 'on' : 'off'}`;
}

// ===== CODING ROUND =====
function runSimCode() {
  const code = document.getElementById('simCodeEditor').value.trim();
  if (!code) { showToast('Write some code first', 'error'); return; }
  sendSimAnswer();
}

// ===== HELPERS =====
function appendSimMessage(role, content) {
  const container = document.getElementById('simMessages');
  const div = document.createElement('div');
  div.className = `sim-msg ${role}`;
  div.innerHTML = `
    <div class="avatar">${role === 'ai' ? '🤖' : '👤'}</div>
    <div class="bubble">${content.replace(/\n/g,'<br>')}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function updateQProgress() {
  document.getElementById('qProgress').textContent = `Q ${currentQInRound}/${qCountPerRound}`;
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 300));
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

function getFallbackQuestion(roundId, idx) {
  const q = {
    hr:     ['Tell me about yourself.','Why are you interested in this role?','What are your greatest strengths?','Where do you see yourself in 5 years?'],
    tech:   ['Explain your most complex technical project.','How do you approach debugging a production issue?','Describe your experience with system design.','What technologies are you most proficient in?'],
    mgr:    ['Tell me about a time you led a team through a challenge.','How do you handle conflict with a colleague?','Describe a situation where you had to make a tough decision.','How do you prioritize tasks under pressure?'],
    coding: ['Write a function to find two numbers in an array that sum to a target.','Implement a function to check if a string is a palindrome.','Write a function to find the maximum subarray sum.','Implement binary search on a sorted array.']
  };
  return (q[roundId] || q.hr)[idx % 4];
}

// ===== RESULTS =====
function renderResults() {
  const roundColors = { hr:'var(--primary)', tech:'var(--secondary)', mgr:'var(--warning)', coding:'var(--danger)' };
  const roundIcons  = { hr:'👤', tech:'🧠', mgr:'📋', coding:'💻' };

  // Fill missing scores
  ROUNDS.forEach(r => { if (!roundScores[r.id]) roundScores[r.id] = 5; });

  const scores = Object.values(roundScores);
  const overall = Math.round(scores.reduce((a,b)=>a+b,0) / scores.length * 10);

  // Round score cards
  document.getElementById('roundScores').innerHTML = ROUNDS.map(r => `
    <div class="round-score-card">
      <div class="rs-icon">${roundIcons[r.id]}</div>
      <div class="rs-score" style="color:${roundColors[r.id]}">${roundScores[r.id]}/10</div>
      <div class="rs-label">${r.label}</div>
    </div>
  `).join('');

  document.getElementById('overallScoreNum').textContent = overall + '%';
  const verdict = overall >= 75 ? '🌟 Excellent Performance' : overall >= 55 ? '👍 Good Performance' : '📈 Needs Improvement';
  document.getElementById('overallVerdict').textContent = verdict;
  document.getElementById('overallSummary').textContent = overall >= 75
    ? 'You performed strongly across all rounds. You are well-prepared for real interviews.'
    : overall >= 55
    ? 'Solid performance with some areas to polish. Review the feedback below and practice regularly.'
    : 'This simulation highlighted key areas to work on. Use the recommendations below to improve.';

  // Fetch AI debrief
  fetchFullDebrief(overall);
}

async function fetchFullDebrief(overall) {
  const summary = allMessages.slice(-30).map(m => `[${m.round.toUpperCase()}] ${m.role === 'ai' ? 'Interviewer' : 'Candidate'}: ${m.content.slice(0,150)}`).join('\n');

  try {
    const res = await fetch('/api/interview/analyze', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        role,
        scores: { technical: roundScores.tech || 5, communication: roundScores.hr || 5, confidence: roundScores.mgr || 5 },
        conversationSummary: summary
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error();
    renderDebrief(data);
  } catch {
    renderDebrief(generateFallback(overall));
  }
}

function generateFallback(overall) {
  return {
    strengths: [
      { point: 'Completed all 4 rounds', detail: 'You showed commitment by going through the full simulation.' },
      { point: 'Communication effort', detail: 'You engaged with every question across all rounds.' },
      { point: 'Technical awareness', detail: 'You demonstrated awareness of role-specific requirements.' }
    ],
    weaknesses: [
      { point: 'Answer depth', detail: 'Some answers lacked specific examples or quantifiable results.' },
      { point: 'Structured responses', detail: 'Using STAR method consistently would strengthen behavioral answers.' },
      { point: 'Technical precision', detail: 'Technical answers could be more precise with concrete implementations.' }
    ],
    suggestions: [
      { area: 'Use STAR Method', action: 'Structure every behavioral answer: Situation → Task → Action → Result.' },
      { area: 'Prepare 5 core stories', action: 'Have 5 strong examples ready covering leadership, failure, success, conflict, and innovation.' },
      { area: 'Practice coding daily', action: 'Solve 1-2 LeetCode problems daily focusing on arrays, trees, and DP.' },
      { area: 'Mock interviews weekly', action: 'Do at least 2 full simulations per week to build fluency across all rounds.' }
    ],
    nextPractice: [
      { topic: 'System Design', reason: 'Critical for technical rounds', resource: 'Study scalability, load balancing, caching, and database design.' },
      { topic: 'Behavioral Questions', reason: 'HR and Managerial rounds', resource: 'Prepare STAR stories for 10 common behavioral questions.' },
      { topic: 'Data Structures & Algorithms', reason: 'Coding round preparation', resource: 'Focus on arrays, linked lists, trees, and dynamic programming.' },
      { topic: 'Leadership & Conflict', reason: 'Managerial round', resource: 'Study conflict resolution frameworks and leadership principles.' }
    ]
  };
}

function renderDebrief(data) {
  document.getElementById('debriefLoading').classList.add('hidden');
  document.getElementById('fullDebrief').classList.remove('hidden');

  // Per-round feedback
  const roundColors = { hr:'var(--primary)', tech:'var(--secondary)', mgr:'var(--warning)', coding:'var(--danger)' };
  document.getElementById('roundFeedbacks').innerHTML = ROUNDS.map(r => {
    const answers = roundSessions[r.id] || [];
    const avgConf = answers.length ? Math.round(answers.reduce((s,a)=>s+a.metrics.confScore,0)/answers.length) : 50;
    const avgWPM  = answers.length ? Math.round(answers.reduce((s,a)=>s+a.metrics.wpm,0)/answers.length) : 0;
    const totalFillers = answers.reduce((s,a)=>s+a.metrics.fillers,0);
    const confLabel = avgConf>=70?'High':avgConf>=45?'Medium':'Low';
    const confColor = avgConf>=70?'#00d4aa':avgConf>=45?'#ffd166':'#ff6584';
    return `
      <div class="card mb-2">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
          <span class="round-badge ${r.badge}">${r.icon} ${r.label}</span>
          <span style="font-size:1.2rem;font-weight:800;color:${roundColors[r.id]}">${roundScores[r.id]}/10</span>
        </div>
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;font-size:0.85rem;">
          <div>Avg Speed: <strong>${avgWPM} wpm</strong></div>
          <div>Filler Words: <strong>${totalFillers}</strong></div>
          <div>Confidence: <strong style="color:${confColor}">${confLabel}</strong></div>
          <div>Questions: <strong>${answers.length}</strong></div>
        </div>
      </div>`;
  }).join('');

  // Strengths
  document.getElementById('strengthsList').innerHTML = (data.strengths||[]).map(s=>`
    <div style="display:flex;gap:8px;margin-bottom:0.6rem;font-size:0.88rem;">
      <span style="color:var(--success);flex-shrink:0;">✔</span>
      <div><div style="font-weight:600;">${s.point}</div><div style="color:var(--text-muted);font-size:0.82rem;">${s.detail}</div></div>
    </div>`).join('');

  // Weaknesses
  document.getElementById('weaknessesList').innerHTML = (data.weaknesses||[]).map(w=>`
    <div style="display:flex;gap:8px;margin-bottom:0.6rem;font-size:0.88rem;">
      <span style="color:var(--danger);flex-shrink:0;">✖</span>
      <div><div style="font-weight:600;">${w.point}</div><div style="color:var(--text-muted);font-size:0.82rem;">${w.detail}</div></div>
    </div>`).join('');

  // Suggestions
  document.getElementById('suggestionsList').innerHTML = (data.suggestions||[]).map(s=>`
    <div style="display:flex;gap:10px;background:var(--bg2);border-radius:10px;padding:0.9rem;margin-bottom:0.5rem;">
      <span style="color:var(--primary);">→</span>
      <div><div style="font-weight:600;font-size:0.88rem;">${s.area}</div><div style="color:var(--text-muted);font-size:0.83rem;margin-top:2px;">${s.action}</div></div>
    </div>`).join('');

  // Next Practice
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
