if (!getToken()) window.location.href = 'index.html';

let sessionId = null;
let selectedRole = 'Software Developer';
let msgCount = 0;
let fallbackQIndex = 0;

const FALLBACK_INTERVIEW = {
  'Software Developer': [
    "Hello! I'm your AI interviewer today. Let's get started. Can you tell me about yourself and your experience as a software developer?",
    "Great! Can you describe a challenging technical problem you've solved recently and walk me through your approach?",
    "What programming languages and frameworks are you most comfortable with, and why?",
    "How do you approach code reviews? What do you look for when reviewing someone else's code?",
    "Tell me about a time you had to work under a tight deadline. How did you manage it?",
    "How do you stay updated with new technologies and industry trends?",
    "Describe your experience with version control systems like Git. Any branching strategies you prefer?",
    "Where do you see yourself in the next 3-5 years in your software development career?"
  ],
  'Web Developer': [
    "Hello! I'm your AI interviewer. Let's begin. Tell me about yourself and your web development journey.",
    "Can you explain the difference between CSS Flexbox and Grid, and when you'd use each?",
    "How do you approach making a website responsive across different screen sizes?",
    "Describe your experience with JavaScript frameworks like React, Vue, or Angular.",
    "How do you optimize a web application for performance?",
    "Tell me about a web project you're most proud of and the challenges you overcame.",
    "How do you handle cross-browser compatibility issues?",
    "What's your approach to web accessibility and why does it matter?"
  ],
  'Data Scientist': [
    "Hello! I'm your AI interviewer. Let's start. Tell me about yourself and your data science background.",
    "Can you explain the difference between supervised and unsupervised learning with examples?",
    "How do you handle missing or imbalanced data in a dataset?",
    "Walk me through a machine learning project you've worked on from data collection to deployment.",
    "What metrics do you use to evaluate classification vs regression models?",
    "How do you communicate complex data insights to non-technical stakeholders?",
    "Describe your experience with Python libraries like pandas, scikit-learn, or TensorFlow.",
    "How do you prevent overfitting in your models?"
  ],
  'ML Engineer': [
    "Hello! I'm your AI interviewer. Let's get started. Tell me about your machine learning engineering experience.",
    "How do you deploy a machine learning model to production? Walk me through your process.",
    "What's the difference between model training and model inference, and how do you optimize each?",
    "Describe your experience with MLOps tools and CI/CD pipelines for ML.",
    "How do you monitor a deployed model for performance degradation?",
    "Explain the concept of feature engineering and its importance.",
    "What distributed training frameworks have you worked with?",
    "How do you handle model versioning and reproducibility?"
  ]
};

const FALLBACK_EVALUATIONS = [
  "Good answer! You covered the key points well. Try to add more specific examples with measurable outcomes to strengthen your response.",
  "Nice response. Your explanation was clear and structured. Consider using the STAR method (Situation, Task, Action, Result) for behavioral questions.",
  "Solid answer. You demonstrated good knowledge. Adding real-world examples from your experience would make this even more compelling.",
  "Well done! You communicated confidently. Try to be slightly more concise and focus on the most impactful points.",
  "Good effort! Your answer showed genuine experience. Elaborating on the technical details would impress a technical interviewer."
];

function getFallbackResponse(message) {
  const questions = FALLBACK_INTERVIEW[selectedRole] || FALLBACK_INTERVIEW['Software Developer'];
  // If it's the opening message
  if (message.includes('Start the interview')) {
    fallbackQIndex = 0;
    return questions[0];
  }
  // If asking to end/wrap up
  if (message.includes('wrap up') || message.includes('final performance')) {
    return `Thank you for this interview! You've done a great job. Here's your performance summary:\n\nYou demonstrated solid knowledge and communication skills throughout our conversation. Keep practicing and you'll continue to improve.\n\nSCORES: Technical:7 Communication:7 Confidence:7`;
  }
  // Otherwise give evaluation + next question
  fallbackQIndex++;
  const eval_ = FALLBACK_EVALUATIONS[fallbackQIndex % FALLBACK_EVALUATIONS.length];
  const nextQ = questions[fallbackQIndex % questions.length];
  return `${eval_}\n\n${nextQ}`;
}

// Pre-select role from URL param
const urlRole = new URLSearchParams(window.location.search).get('role');
if (urlRole) {
  selectedRole = urlRole;
  document.querySelectorAll('.role-card').forEach(c => {
    c.classList.remove('selected');
    if (c.querySelector('.role-name').textContent.trim() === urlRole ||
        urlRole.includes(c.querySelector('.role-name').textContent.trim().split(' ')[0])) {
      c.classList.add('selected');
    }
  });
}

function selectRole(el, role) {
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedRole = role;
}

function startInterview() {
  const type = document.getElementById('interviewType').value;
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('chatScreen').classList.remove('hidden');
  document.getElementById('chatTitle').textContent = `${selectedRole} Interview`;

  // Send initial message
  sendMessage('Start the interview. Introduce yourself briefly and ask the first question.');
}

function resetInterview() {
  sessionId = null;
  msgCount = 0;
  document.getElementById('chatMessages').innerHTML = '';
  document.getElementById('resultsScreen').classList.add('hidden');
  document.getElementById('chatScreen').classList.add('hidden');
  document.getElementById('setupScreen').classList.remove('hidden');
}

function endInterview() {
  sendMessage('Please wrap up the interview and give me my final performance evaluation with scores.');
}

async function sendMessage(overrideMsg) {
  const input = document.getElementById('userInput');
  const message = overrideMsg || input.value.trim();
  if (!message) return;

  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;

  if (!overrideMsg) {
    appendMessage('user', message);
    input.value = '';
    input.style.height = 'auto';
    msgCount++;
    document.getElementById('msgCount').textContent = `${msgCount} exchanges`;
  }

  // Show typing
  const typingId = showTyping();

  try {
    const res = await fetch('/api/interview/chat', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message, sessionId, role: selectedRole, type: document.getElementById('interviewType')?.value || 'mock' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API error');
    if (!data.message) throw new Error('Empty response');

    removeTyping(typingId);
    sessionId = data.sessionId;
    appendMessage('ai', data.message);

    if (data.completed && data.scores) {
      setTimeout(() => showResults(data.scores), 1000);
    }
  } catch (err) {
    removeTyping(typingId);
    // Use fallback questions when API is unavailable
    const fallback = getFallbackResponse(message);
    appendMessage('ai', fallback);

    // Check if fallback contains scores
    const scoreMatch = fallback.match(/SCORES:\s*Technical:(\d+)\s*Communication:(\d+)\s*Confidence:(\d+)/i);
    if (scoreMatch) {
      setTimeout(() => showResults({
        technical: parseInt(scoreMatch[1]),
        communication: parseInt(scoreMatch[2]),
        confidence: parseInt(scoreMatch[3])
      }), 1000);
    }
  } finally {
    sendBtn.disabled = false;
  }
}

function appendMessage(role, content) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `
    <div class="message-avatar">${role === 'ai' ? '🤖' : '👤'}</div>
    <div class="message-bubble">${content.replace(/\n/g, '<br>')}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('chatMessages');
  const id = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.className = 'message ai';
  div.id = id;
  div.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTyping(id) {
  document.getElementById(id)?.remove();
}

function showResults(scores) {
  document.getElementById('chatScreen').classList.add('hidden');
  document.getElementById('resultsScreen').classList.remove('hidden');

  const overall = ((scores.technical + scores.communication + scores.confidence) / 3).toFixed(1);

  document.getElementById('scoreCards').innerHTML = `
    <div style="text-align:center;background:rgba(108,99,255,0.1);border:1px solid rgba(108,99,255,0.3);border-radius:12px;padding:1.2rem;">
      <div style="font-size:2rem;font-weight:800;color:var(--primary)">${scores.technical}/10</div>
      <div style="font-size:0.82rem;color:var(--text-muted)">Technical</div>
    </div>
    <div style="text-align:center;background:rgba(0,212,170,0.1);border:1px solid rgba(0,212,170,0.3);border-radius:12px;padding:1.2rem;">
      <div style="font-size:2rem;font-weight:800;color:var(--secondary)">${scores.communication}/10</div>
      <div style="font-size:0.82rem;color:var(--text-muted)">Communication</div>
    </div>
    <div style="text-align:center;background:rgba(255,209,102,0.1);border:1px solid rgba(255,209,102,0.3);border-radius:12px;padding:1.2rem;">
      <div style="font-size:2rem;font-weight:800;color:var(--warning)">${scores.confidence}/10</div>
      <div style="font-size:0.82rem;color:var(--text-muted)">Confidence</div>
    </div>
  `;

  document.getElementById('rTech').textContent = scores.technical + '/10';
  document.getElementById('rComm').textContent = scores.communication + '/10';
  document.getElementById('rConf').textContent = scores.confidence + '/10';

  setTimeout(() => {
    document.getElementById('rTechBar').style.width = (scores.technical * 10) + '%';
    document.getElementById('rCommBar').style.width = (scores.communication * 10) + '%';
    document.getElementById('rConfBar').style.width = (scores.confidence * 10) + '%';
  }, 100);
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}
