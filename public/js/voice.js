if (!getToken()) window.location.href = 'index.html';

let recognition = null;
let isRecording = false;
let transcript = '';
let sessionId = null;
let questionCount = 0;
const MAX_QUESTIONS = 6;

// Fallback questions per role (used when API is unavailable)
const FALLBACK_QUESTIONS = {
  'Software Developer': [
    'Tell me about yourself and your experience as a software developer.',
    'Describe a challenging technical problem you solved. What was your approach?',
    'How do you ensure code quality in your projects?',
    'Explain the difference between object-oriented and functional programming.',
    'How do you handle tight deadlines and pressure?',
    'Where do you see yourself in 5 years as a developer?'
  ],
  'Web Developer': [
    'Tell me about yourself and your web development experience.',
    'What is the difference between CSS Flexbox and Grid? When do you use each?',
    'How do you optimize a website for performance?',
    'Explain how REST APIs work and how you have used them.',
    'Describe a web project you are most proud of.',
    'How do you stay updated with the latest web technologies?'
  ],
  'Data Scientist': [
    'Tell me about yourself and your data science background.',
    'Explain the difference between supervised and unsupervised learning.',
    'How do you handle missing data in a dataset?',
    'Describe a machine learning project you have worked on end to end.',
    'What metrics do you use to evaluate a classification model?',
    'How do you communicate complex data insights to non-technical stakeholders?'
  ],
  'ML Engineer': [
    'Tell me about yourself and your machine learning experience.',
    'How do you deploy a machine learning model to production?',
    'Explain the concept of overfitting and how you prevent it.',
    'What is the difference between batch and online learning?',
    'Describe your experience with MLOps tools and pipelines.',
    'How do you monitor a model after deployment?'
  ]
};

const FALLBACK_FEEDBACK = [
  'Good answer! You covered the key points clearly. Try to add more specific examples from your experience to make it stronger.',
  'Nice response. Your communication was clear. Consider structuring your answer using the STAR method for behavioral questions.',
  'Well done. You demonstrated good knowledge. Adding quantifiable results to your examples would make your answer even more impactful.',
  'Solid answer. You spoke confidently. Try to be a bit more concise and focus on the most relevant points.',
  'Good effort! Your answer showed genuine experience. Practice elaborating on the technical details to impress interviewers.'
];

// Check browser support
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  document.addEventListener('DOMContentLoaded', () => {
    showToast('Speech recognition not supported in this browser. Try Chrome.', 'error');
  });
}

function getRole() {
  return document.getElementById('voiceRole')?.value || 'Software Developer';
}

function getFallbackQuestion() {
  const role = getRole();
  const questions = FALLBACK_QUESTIONS[role] || FALLBACK_QUESTIONS['Software Developer'];
  return questions[questionCount % questions.length];
}

function startVoiceInterview() {
  document.getElementById('voiceSetup').classList.add('hidden');
  document.getElementById('voiceInterview').classList.remove('hidden');
  loadNextQuestion(true);
}

async function loadNextQuestion(isFirst = false) {
  const questionEl = document.getElementById('currentQuestion');
  questionEl.textContent = 'Loading question...';

  const msg = isFirst
    ? 'Start the voice interview. Ask the first question only. Keep it concise, one sentence.'
    : 'Ask the next interview question. Keep it concise, one sentence only.';

  try {
    const res = await fetch('/api/interview/chat', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message: msg, sessionId, role: getRole(), type: 'mock' })
    });

    if (!res.ok) throw new Error('API error');

    const data = await res.json();
    if (!data.message) throw new Error('Empty response');

    sessionId = data.sessionId;
    questionEl.textContent = data.message;
    speakText(data.message);
  } catch (e) {
    // Fallback to local questions
    const q = getFallbackQuestion();
    questionEl.textContent = q;
    speakText(q);
  }

  questionCount++;
}

function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  if (!SpeechRecognition) {
    showToast('Speech recognition not supported. Try Chrome.', 'error');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isRecording = true;
    document.getElementById('voiceOrb').classList.add('listening');
    document.getElementById('voiceOrb').textContent = '⏹️';
    document.getElementById('voiceStatus').textContent = '🔴 Recording... speak now';
    document.getElementById('transcript').textContent = '';
    transcript = '';
  };

  recognition.onresult = (e) => {
    let interim = '';
    let final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    transcript += final;
    document.getElementById('transcript').textContent = transcript + interim;
  };

  recognition.onerror = (e) => {
    showToast('Microphone error: ' + e.error, 'error');
    stopRecording();
  };

  recognition.onend = () => {
    if (isRecording) recognition.start();
  };

  recognition.start();
}

function stopRecording() {
  isRecording = false;
  recognition?.stop();
  document.getElementById('voiceOrb').classList.remove('listening');
  document.getElementById('voiceOrb').textContent = '🎙️';
  document.getElementById('voiceStatus').textContent = 'Recording stopped. Submit your answer or record again.';

  if (transcript.trim()) {
    document.getElementById('submitVoiceBtn').disabled = false;
  }
}

async function submitVoiceAnswer() {
  const answer = transcript.trim();
  if (!answer) { showToast('No answer recorded', 'error'); return; }

  const btn = document.getElementById('submitVoiceBtn');
  btn.disabled = true;
  btn.textContent = 'Evaluating...';

  try {
    const res = await fetch('/api/interview/chat', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        message: `My spoken answer: "${answer}". Please evaluate this answer briefly (2-3 sentences) focusing on content quality, clarity, and communication.`,
        sessionId,
        role: getRole(),
        type: 'mock'
      })
    });

    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    if (!data.message) throw new Error('Empty response');

    sessionId = data.sessionId;
    document.getElementById('feedbackText').textContent = data.message;
    speakText(data.message);
  } catch (e) {
    // Fallback feedback
    const feedback = FALLBACK_FEEDBACK[Math.floor(Math.random() * FALLBACK_FEEDBACK.length)];
    document.getElementById('feedbackText').textContent = feedback;
    speakText(feedback);
  }

  document.getElementById('aiFeedback').classList.remove('hidden');
  btn.textContent = 'Submit Answer ➤';
}

function nextQuestion() {
  document.getElementById('aiFeedback').classList.add('hidden');
  document.getElementById('submitVoiceBtn').disabled = true;
  document.getElementById('transcript').textContent = 'Your speech will appear here as you speak...';
  transcript = '';

  if (questionCount >= MAX_QUESTIONS) {
    endVoiceInterview();
    return;
  }

  loadNextQuestion();
}

function skipQuestion() {
  document.getElementById('aiFeedback').classList.add('hidden');
  document.getElementById('submitVoiceBtn').disabled = true;
  transcript = '';
  document.getElementById('transcript').textContent = 'Your speech will appear here as you speak...';

  if (questionCount >= MAX_QUESTIONS) {
    endVoiceInterview();
    return;
  }
  loadNextQuestion();
}

function endVoiceInterview() {
  if (isRecording) stopRecording();
  document.getElementById('voiceInterview').classList.add('hidden');
  document.getElementById('voiceResults').classList.remove('hidden');
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.name.includes('Google') || v.name.includes('Natural'));
  if (preferred) utterance.voice = preferred;
  window.speechSynthesis.speak(utterance);
}
