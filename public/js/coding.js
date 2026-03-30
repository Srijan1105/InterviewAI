// coding.js — runs after main.js and problems.js are loaded
(function () {
  if (!getToken()) { window.location.href = 'index.html'; return; }

  let currentProblem = null;
  let currentLang = 'javascript';

  function loadProblem() {
    const diff = document.getElementById('difficultySelect').value;
    const btn = document.getElementById('newProblemBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Loading...'; }

    // getNextProblem is defined in problems.js — purely synchronous
    try {
      currentProblem = getNextProblem(diff);
    } catch (e) {
      console.error('Problem bank error:', e);
      if (btn) { btn.disabled = false; btn.textContent = '🔀 New Problem'; }
      return;
    }

    renderProblem();
    if (btn) { btn.disabled = false; btn.textContent = '🔀 New Problem'; }
  }

  function renderProblem() {
    const p = currentProblem;
    if (!p) return;

    const diff = document.getElementById('difficultySelect').value;
    const diffStyle = {
      easy:   'background:rgba(0,212,170,0.15);color:#00d4aa;border:1px solid rgba(0,212,170,0.3)',
      medium: 'background:rgba(255,209,102,0.15);color:#ffd166;border:1px solid rgba(255,209,102,0.3)',
      hard:   'background:rgba(255,101,132,0.15);color:#ff6584;border:1px solid rgba(255,101,132,0.3)'
    };

    document.getElementById('problemNum').textContent = 'Problem';
    document.getElementById('problemTitle').textContent = p.title;
    document.getElementById('problemDesc').textContent = p.description;
    document.getElementById('diffBadge').textContent = diff.charAt(0).toUpperCase() + diff.slice(1);
    document.getElementById('diffBadge').setAttribute('style',
      diffStyle[diff] + ';padding:2px 10px;border-radius:50px;font-size:0.72rem;font-weight:700;display:inline-block;');

    // Examples
    document.getElementById('examples').innerHTML = (p.examples || []).map((ex, i) => `
      <div style="background:var(--bg2);border-radius:8px;padding:0.75rem;margin-bottom:0.5rem;">
        <div style="font-weight:600;margin-bottom:4px;font-size:0.85rem;">Example ${i + 1}:</div>
        <div style="font-size:0.85rem;"><span style="color:var(--text-muted);">Input:</span> <code>${ex.input}</code></div>
        <div style="font-size:0.85rem;"><span style="color:var(--text-muted);">Output:</span> <code>${ex.output}</code></div>
        ${ex.explanation ? `<div style="color:var(--text-muted);font-size:0.8rem;margin-top:4px;">${ex.explanation}</div>` : ''}
      </div>
    `).join('');

    // Constraints
    document.getElementById('constraints').innerHTML = (p.constraints || []).length
      ? `<div style="font-weight:600;font-size:0.82rem;margin-bottom:4px;">Constraints:</div>` +
        p.constraints.map(c => `<div style="font-size:0.8rem;color:var(--text-muted);">• ${c}</div>`).join('')
      : '';

    // Test cases
    document.getElementById('testCases').innerHTML = (p.testCases || []).map((tc, i) => `
      <div style="background:var(--bg2);border-radius:8px;padding:0.75rem;display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
        <div style="font-size:0.83rem;flex:1;">
          <span style="color:var(--text-muted);">Input:</span> <code>${tc.input}</code> &nbsp;
          <span style="color:var(--text-muted);">Expected:</span> <code>${tc.expected}</code>
        </div>
        <span id="tc-${i}" style="font-size:0.8rem;color:var(--text-muted);flex-shrink:0;">pending</span>
      </div>
    `).join('');

    // Starter code
    document.getElementById('code-editor').value = getStarterCode();
    document.getElementById('outputPanel').textContent = '// Run your code to see output';

    // Store hint
    const hintEl = document.getElementById('hintText');
    hintEl.textContent = 'Click "Get Hint" for a nudge in the right direction.';
    hintEl.dataset.hint = p.hint || '';
  }

  function getStarterCode() {
    if (!currentProblem?.starterCode) return '// Write your solution here\n';
    return currentProblem.starterCode[currentLang]
      || currentProblem.starterCode['javascript']
      || '// Write your solution here\n';
  }

  function setLanguage() {
    currentLang = document.getElementById('langSelect').value;
    document.getElementById('editorLang').textContent =
      currentLang.charAt(0).toUpperCase() + currentLang.slice(1);
    if (currentProblem) document.getElementById('code-editor').value = getStarterCode();
  }

  function resetCode() {
    if (!currentProblem) return;
    document.getElementById('code-editor').value = getStarterCode();
    document.getElementById('outputPanel').textContent = '// Run your code to see output';
    (currentProblem.testCases || []).forEach((_, i) => {
      const el = document.getElementById(`tc-${i}`);
      if (el) { el.textContent = 'pending'; el.style.color = 'var(--text-muted)'; }
    });
  }

  function runCode() {
    if (!currentProblem) { showToast('Load a problem first', 'info'); return; }
    if (currentLang !== 'javascript') {
      showToast('Live execution is available for JavaScript only.', 'info');
      return;
    }

    const code = document.getElementById('code-editor').value;
    const output = document.getElementById('outputPanel');
    output.style.color = '#00d4aa';

    try {
      const fn = new Function(code + '\nreturn typeof solution !== "undefined" ? solution : null;')();
      if (!fn) {
        output.textContent = '// Name your function "solution" to run tests.\n// Example: function solution(nums, target) { ... }';
        return;
      }

      const results = [];
      (currentProblem.testCases || []).forEach((tc, i) => {
        try {
          const args = eval(`[${tc.input}]`);
          const result = fn(...args);
          const resultStr = JSON.stringify(result);
          let pass = false;
          try {
            pass = resultStr === tc.expected
              || String(result) === tc.expected
              || JSON.stringify(eval(tc.expected)) === resultStr;
          } catch (_) {
            pass = String(result) === tc.expected;
          }
          results.push(`Test ${i + 1}: ${pass ? '✅ PASS' : '❌ FAIL'} | Got: ${resultStr} | Expected: ${tc.expected}`);
          const el = document.getElementById(`tc-${i}`);
          if (el) { el.textContent = pass ? '✅ pass' : '❌ fail'; el.style.color = pass ? '#00d4aa' : '#ff6584'; }
        } catch (e) {
          results.push(`Test ${i + 1}: ❌ ERROR — ${e.message}`);
        }
      });

      output.textContent = results.join('\n');
    } catch (e) {
      output.style.color = '#ff6584';
      output.textContent = `Syntax Error: ${e.message}`;
    }
  }

  function submitCode() {
    runCode();
    showToast('Solution submitted! Check test results.', 'success');
  }

  async function getHint() {
    const btn = document.getElementById('hintBtn');
    const hintEl = document.getElementById('hintText');

    if (hintEl.dataset.hint) {
      hintEl.textContent = hintEl.dataset.hint;
      delete hintEl.dataset.hint;
      return;
    }

    btn.disabled = true;
    btn.textContent = '💭 Thinking...';
    try {
      const res = await fetch('/api/interview/chat', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          message: `Give me a 2-sentence hint (no solution) for: "${currentProblem?.title}". Focus on the algorithm approach.`,
          role: 'Software Developer',
          type: 'coding'
        })
      });
      const data = await res.json();
      hintEl.textContent = data.message || 'Think about which data structure gives O(1) lookup.';
    } catch (_) {
      hintEl.textContent = 'Think about the time complexity. Can you use a hash map or two pointers to reduce it?';
    } finally {
      btn.disabled = false;
      btn.textContent = '💡 Get Hint';
    }
  }

  // Expose to global scope so onclick handlers in HTML work
  window.loadProblem = loadProblem;
  window.setLanguage = setLanguage;
  window.resetCode = resetCode;
  window.runCode = runCode;
  window.submitCode = submitCode;
  window.getHint = getHint;

  // Load first problem immediately
  loadProblem();
})();
