document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('register-form');
  const err = document.getElementById('register-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Register failed');
        return j;
      });
      location.href = '/dashboard';
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
});
