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
  btn.textContent = '🔍 Reading resume...';

  try {
    // Read PDF as text using FileReader (base64) then send text to API
    const arrayBuffer = await selectedFile.arrayBuffer();
    // Use pdf.js CDN to extract text client-side
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }

    btn.textContent = '🔍 Analyzing with AI...';

    const res = await fetch('/api/resume/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ resumeText: fullText })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    generatedQuestions = data.questions;
    document.getElementById('candidateSummary').textContent = data.summary;
    document.getElementById('qCount').textContent = data.questions.length;

    const list = document.getElementById('questionList');
    list.innerHTML = data.questions.map((q, i) => `
      <div class="question-item" onclick="copyQuestion(this)" data-q="${q.replace(/"/g,'&quot;')}">
        <div class="question-num">${i + 1}</div>
        <div style="flex:1;font-size:0.92rem;">${q}</div>
        <span style="font-size:0.75rem;color:var(--text-muted);">click to copy</span>
      </div>
    `).join('');

    document.getElementById('uploadSection').classList.add('hidden');
    document.getElementById('resultsSection').classList.remove('hidden');
    showToast('Questions generated!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Analyze Resume & Generate Questions';
  }
}

function copyQuestion(el) {
  const q = el.dataset.q;
  navigator.clipboard.writeText(q).then(() => showToast('Copied!', 'success'));
}

function startResumeInterview() {
  // Store questions and redirect to interview
  sessionStorage.setItem('resumeQuestions', JSON.stringify(generatedQuestions));
  window.location.href = 'interview.html';
}
