const API = '/api';

// ===== AUTH HELPERS =====
const getToken = () => localStorage.getItem('token');
const getUser = () => JSON.parse(localStorage.getItem('user') || 'null');
const setAuth = (token, user) => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); };
const clearAuth = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); };

const authHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getToken()}`
});

// ===== TOAST =====
function showToast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ===== MODAL =====
let pendingRedirect = null;

function openModal(tab = 'login') {
  document.getElementById('authModal')?.classList.add('active');
  switchTab(tab);
}

function closeModal() {
  document.getElementById('authModal')?.classList.remove('active');
  pendingRedirect = null;
}

function switchTab(tab) {
  document.getElementById('loginForm')?.classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm')?.classList.toggle('hidden', tab !== 'register');
  document.getElementById('loginTab')?.classList.toggle('active', tab === 'login');
  document.getElementById('registerTab')?.classList.toggle('active', tab === 'register');
}

function requireAuth(e, url) {
  if (!getToken()) {
    e.preventDefault();
    pendingRedirect = url;
    openModal('login');
  }
}

// ===== AUTH FORMS =====
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Logging in...';
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('loginEmail').value, password: document.getElementById('loginPassword').value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setAuth(data.token, data.user);
    showToast(`Welcome back, ${data.user.name}!`, 'success');
    closeModal();
    setTimeout(() => window.location.href = pendingRedirect || 'dashboard.html', 500);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Login';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('registerBtn');
  btn.disabled = true; btn.textContent = 'Creating account...';
  try {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: document.getElementById('regName').value, email: document.getElementById('regEmail').value, password: document.getElementById('regPassword').value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setAuth(data.token, data.user);
    showToast('Account created! Welcome aboard 🎉', 'success');
    closeModal();
    setTimeout(() => window.location.href = pendingRedirect || 'dashboard.html', 500);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account';
  }
}

// ===== LOGOUT =====
function logout() {
  clearAuth();
  window.location.href = 'index.html';
}

// ===== REDIRECT IF LOGGED IN =====
if (getToken() && window.location.pathname.endsWith('index.html') || (getToken() && window.location.pathname === '/')) {
  // already logged in, update nav
  const navActions = document.querySelector('.nav-actions');
  if (navActions) {
    const user = getUser();
    navActions.innerHTML = `
      <span style="color:var(--text-muted);font-size:0.88rem;">Hi, ${user?.name?.split(' ')[0]}</span>
      <a href="dashboard.html" class="btn btn-primary btn-sm">Dashboard</a>
    `;
  }
}

// Close modal on overlay click
document.getElementById('authModal')?.addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
