async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function currentUser() {
  try {
    const { user } = await api('/api/me', { method: 'GET' });
    return user;
  } catch {
    return null;
  }
}

function renderNav(user) {
  const nav = document.getElementById('nav-links');
  if (!nav) return;
  if (user) {
    nav.innerHTML = `
      <a href="/">Home</a>
      <a href="/courses">Courses</a>
      <a href="/dashboard">Dashboard</a>
      <button id="logout-btn" class="linklike">Logout</button>
    `;
    const btn = document.getElementById('logout-btn');
    btn.onclick = async () => {
      await api('/api/logout', { method: 'POST' });
      location.href = '/';
    };
  } else {
    nav.innerHTML = `
      <a href="/">Home</a>
      <a href="/courses">Courses</a>
      <a href="/login">Login</a>
      <a href="/register">Register</a>
    `;
  }
}

// Stop auto-rendering nav; main.js will handle UI
// document.addEventListener('DOMContentLoaded', async () => {
//   const user = await currentUser();
//   renderNav(user);
// });

// Expose helpers for other scripts
window.api = api;
window.currentUser = currentUser;

// Ensure logout is available globally
window.logout = async () => {
  try {
    await api('/api/logout', { method: 'POST' });
    // Clear any cached user data
    window._currentUser = null;
    location.href = '/login';
  } catch (e) {
    console.error('Logout error:', e);
    // Force redirect even if API call fails
    window._currentUser = null;
    location.href = '/login';
  }
};

// utility for link-looking button
document.addEventListener('click', (e) => {
  if (e.target.matches('button.linklike')) {
    e.preventDefault();
    const link = e.target.dataset.link;
    if (link) location.href = link;
  }
});
