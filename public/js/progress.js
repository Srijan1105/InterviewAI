if (!getToken()) window.location.href = 'index.html';

Chart.defaults.color = '#8888aa';
Chart.defaults.borderColor = '#2e2e50';

async function loadProgress() {
  try {
    const res = await fetch('/api/progress', { headers: authHeaders() });
    const data = await res.json();

    if (!data.records || data.records.length === 0) {
      document.getElementById('emptyState').classList.remove('hidden');
      document.querySelectorAll('.chart-container, .grid-2').forEach(el => el.style.display = 'none');
      return;
    }

    // Stats
    document.getElementById('pTotal').textContent = data.totalSessions;
    document.getElementById('pTech').textContent = data.averages.technical + '/10';
    document.getElementById('pComm').textContent = data.averages.communication + '/10';
    document.getElementById('pConf').textContent = data.averages.confidence + '/10';

    const labels = data.records.map((_, i) => `Session ${i + 1}`);
    const tech = data.records.map(r => r.technical);
    const comm = data.records.map(r => r.communication);
    const conf = data.records.map(r => r.confidence);

    // Line Chart
    new Chart(document.getElementById('lineChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Technical', data: tech, borderColor: '#6c63ff', backgroundColor: 'rgba(108,99,255,0.1)', tension: 0.4, fill: true },
          { label: 'Communication', data: comm, borderColor: '#00d4aa', backgroundColor: 'rgba(0,212,170,0.1)', tension: 0.4, fill: true },
          { label: 'Confidence', data: conf, borderColor: '#ffd166', backgroundColor: 'rgba(255,209,102,0.1)', tension: 0.4, fill: true }
        ]
      },
      options: {
        responsive: true,
        scales: { y: { min: 0, max: 10, grid: { color: '#2e2e50' } }, x: { grid: { color: '#2e2e50' } } },
        plugins: { legend: { position: 'top' } }
      }
    });

    // Radar Chart
    new Chart(document.getElementById('radarChart'), {
      type: 'radar',
      data: {
        labels: ['Technical', 'Communication', 'Confidence'],
        datasets: [{
          label: 'Your Scores',
          data: [data.averages.technical, data.averages.communication, data.averages.confidence],
          borderColor: '#6c63ff',
          backgroundColor: 'rgba(108,99,255,0.2)',
          pointBackgroundColor: '#6c63ff'
        }]
      },
      options: {
        responsive: true,
        scales: { r: { min: 0, max: 10, grid: { color: '#2e2e50' }, pointLabels: { color: '#e8e8f0' }, ticks: { display: false } } },
        plugins: { legend: { display: false } }
      }
    });

    // Bar Chart
    new Chart(document.getElementById('barChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Technical', data: tech, backgroundColor: 'rgba(108,99,255,0.7)', borderRadius: 6 },
          { label: 'Communication', data: comm, backgroundColor: 'rgba(0,212,170,0.7)', borderRadius: 6 },
          { label: 'Confidence', data: conf, backgroundColor: 'rgba(255,209,102,0.7)', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        scales: { y: { min: 0, max: 10, grid: { color: '#2e2e50' } }, x: { grid: { color: '#2e2e50' } } },
        plugins: { legend: { position: 'top' } }
      }
    });

    // Weak / Strong areas
    const scores = { Technical: data.averages.technical, Communication: data.averages.communication, Confidence: data.averages.confidence };
    const sorted = Object.entries(scores).sort((a, b) => a[1] - b[1]);

    const tips = {
      Technical: 'Practice DSA problems daily and review system design concepts.',
      Communication: 'Structure answers using STAR method. Practice speaking clearly.',
      Confidence: 'Do more mock interviews. Preparation builds confidence naturally.'
    };

    const icons = { Technical: '🧠', Communication: '💬', Confidence: '💪' };

    document.getElementById('weakAreas').innerHTML = sorted.slice(0, 2).map(([name, score]) => `
      <div style="background:rgba(255,101,132,0.08);border:1px solid rgba(255,101,132,0.2);border-radius:10px;padding:1rem;margin-bottom:0.75rem;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:0.4rem;">
          <span>${icons[name]}</span>
          <strong>${name}</strong>
          <span style="margin-left:auto;color:var(--danger);font-weight:700;">${score}/10</span>
        </div>
        <p style="font-size:0.82rem;color:var(--text-muted);">${tips[name]}</p>
      </div>
    `).join('');

    document.getElementById('strongAreas').innerHTML = sorted.slice(-1).map(([name, score]) => `
      <div style="background:rgba(0,212,170,0.08);border:1px solid rgba(0,212,170,0.2);border-radius:10px;padding:1rem;margin-bottom:0.75rem;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:0.4rem;">
          <span>${icons[name]}</span>
          <strong>${name}</strong>
          <span style="margin-left:auto;color:var(--success);font-weight:700;">${score}/10</span>
        </div>
        <p style="font-size:0.82rem;color:var(--text-muted);">Keep it up! This is your strongest area.</p>
      </div>
    `).join('');

  } catch (e) {
    showToast('Error loading progress', 'error');
  }
}

loadProgress();
