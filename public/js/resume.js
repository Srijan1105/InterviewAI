if (!getToken()) window.location.href = 'index.html';

let selectedFile = null;
let generatedQuestions = [];

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.add('dragover');
}

function handleDragLeave() {
  document.getElementById('uploadZone').classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) setFile(file);
}

function setFile(file) {
  if (file.type !== 'application/pdf') {
    showToast('Please upload a PDF file', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('File too large. Max 5MB', 'error');
    return;
  }
  selectedFile = file;
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = (file.size / 1024).toFixed(1) + ' KB';
  document.getElementById('filePreview').classList.remove('hidden');
}

function clearFile() {
  selectedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('filePreview').classList.add('hidden');
}

function resetUpload() {
  clearFile();
  document.getElementById('resultsSection').classList.add('hidden');
  document.getElementById('uploadSection').classList.remove('hidden');
}

async function analyzeResume() {
  if (!selectedFile) return;
  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true;
  btn.textContent = '🔍 Analyzing resume...';

  try {
    const formData = new FormData();
    formData.append('resume', selectedFile);

    const res = await fetch('/api/resume/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    generatedQuestions = data.questions;
    document.getElementById('candidateSummary').textContent = data.summary;
    document.getElementById('qCount').textContent = data.questions.length;

    const list = document.getElementById('questionList');
    list.innerHTML = data.questions.map((q, i) => `
      <div class="question-item" onclick="copyQuestion('${q.replace(/'/g, "\\'")}')">
        <div class="question-num">${i + 1}</div>
        <div style="flex:1;font-size:0.92rem;">${q}</div>
        <span style="font-size:0.75rem;color:var(--text-muted);">click to copy</span>
      </div>
    `).join('');

    document.getElementById('uploadSection').classList.add('hidden');
    document.getElementById('resultsSection').classList.remove('hidden');
    showToast('Questions generated successfully!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Analyze Resume & Generate Questions';
  }
}

function copyQuestion(q) {
  navigator.clipboard.writeText(q).then(() => showToast('Question copied!', 'success'));
}

function startResumeInterview() {
  // Store questions and redirect to interview
  sessionStorage.setItem('resumeQuestions', JSON.stringify(generatedQuestions));
  window.location.href = 'interview.html';
}
