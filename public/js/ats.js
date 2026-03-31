if (!getToken()) window.location.href = 'index.html';

let selectedFile = null;

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
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
}
function handleFileSelect(e) {
  if (e.target.files[0]) setFile(e.target.files[0]);
}

function setFile(file) {
  if (file.type !== 'application/pdf') { showToast('Please upload a PDF file', 'error'); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('File too large. Max 5MB', 'error'); return; }
  selectedFile = file;
  document.getElementById('atsFileName').textContent = file.name;
  document.getElementById('atsFileSize').textContent = (file.size / 1024).toFixed(1) + ' KB';
  document.getElementById('filePreview').classList.remove('hidden');
}

function clearFile() {
  selectedFile = null;
  document.getElementById('atsFileInput').value = '';
  document.getElementById('filePreview').classList.add('hidden');
}

function resetChecker() {
  clearFile();
  document.getElementById('resultsSection').classList.add('hidden');
  document.getElementById('uploadSection').classList.remove('hidden');
  document.getElementById('jobDesc').value = '';
}

async function checkATS() {
  if (!selectedFile) { showToast('Please upload a resume first', 'error'); return; }

  document.getElementById('uploadSection').classList.add('hidden');
  document.getElementById('loadingSection').classList.remove('hidden');

  try {
    // Extract text client-side using pdf.js
    const arrayBuffer = await selectedFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let resumeText = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 6); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      resumeText += content.items.map(item => item.str).join(' ') + '\n';
    }

    const jobDesc = document.getElementById('jobDesc').value.trim();

    const res = await fetch('/api/ats/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ resumeText, jobDesc })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Analysis failed');

    document.getElementById('loadingSection').classList.add('hidden');
    renderResults(data);
  } catch (e) {
    document.getElementById('loadingSection').classList.add('hidden');
    document.getElementById('uploadSection').classList.remove('hidden');
    showToast('Error: ' + e.message, 'error');
  }
}

function renderResults(data) {
  document.getElementById('resultsSection').classList.remove('hidden');

  const score = data.overallScore || 0;

  // Score ring color
  const ring = document.getElementById('scoreRing');
  const color = score >= 80 ? '#00d4aa' : score >= 60 ? '#ffd166' : '#ff6584';
  ring.style.background = `conic-gradient(${color} ${score * 3.6}deg, var(--bg2) 0deg)`;
  ring.style.boxShadow = `0 0 30px ${color}40`;

  // Animate score number
  let current = 0;
  const interval = setInterval(() => {
    current = Math.min(current + 2, score);
    document.getElementById('overallScore').textContent = current;
    if (current >= score) clearInterval(interval);
  }, 20);

  // Verdict
  const verdicts = {
    high:   { text: 'Excellent ATS Compatibility', desc: 'Your resume is well-optimized for ATS systems. Minor tweaks can push it even higher.' },
    medium: { text: 'Good — Needs Some Improvements', desc: 'Your resume passes basic ATS checks but has room for improvement in keywords and formatting.' },
    low:    { text: 'Needs Significant Work', desc: 'Your resume may be filtered out by ATS systems. Follow the suggestions below to improve your score.' }
  };
  const level = score >= 80 ? 'high' : score >= 55 ? 'medium' : 'low';
  document.getElementById('scoreVerdict').textContent = verdicts[level].text;
  document.getElementById('scoreVerdict').style.color = color;
  document.getElementById('scoreDesc').textContent = verdicts[level].desc;

  // Category breakdown
  const cats = data.categories || {};
  const catColors = { '#00d4aa': 70, '#ffd166': 50, '#ff6584': 0 };
  document.getElementById('categoryBreakdown').innerHTML = Object.entries(cats).map(([name, val]) => {
    const c = val >= 70 ? '#00d4aa' : val >= 50 ? '#ffd166' : '#ff6584';
    return `<div class="category-score">
      <div class="cat-label">${name}</div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${val}%;background:${c}"></div></div>
      <div class="cat-val" style="color:${c}">${val}%</div>
    </div>`;
  }).join('');

  // Keywords
  const found = data.keywordsFound || [];
  const missing = data.keywordsMissing || [];
  document.getElementById('keywordsFound').innerHTML = found.length
    ? found.map(k => `<span class="keyword-chip keyword-found">✓ ${k}</span>`).join('')
    : '<p class="text-muted" style="font-size:0.85rem;">No strong keywords detected</p>';
  document.getElementById('keywordsMissing').innerHTML = missing.length
    ? missing.map(k => `<span class="keyword-chip keyword-missing">✗ ${k}</span>`).join('')
    : '<p class="text-success" style="font-size:0.85rem;">Great! No critical missing keywords</p>';

  // Suggestions
  const suggestions = data.suggestions || [];
  document.getElementById('suggestions').innerHTML = suggestions.map(s => `
    <div class="suggestion-item ${s.type}">
      <div class="suggestion-icon">${s.type === 'critical' ? '🔴' : s.type === 'warning' ? '🟡' : '🟢'}</div>
      <div>
        <div style="font-weight:600;margin-bottom:3px;">${s.title}</div>
        <div style="color:var(--text-muted);">${s.detail}</div>
      </div>
    </div>
  `).join('');
}
