document.addEventListener('DOMContentLoaded', async () => {
  const user = await currentUser();
  if (!user || user.role !== 'admin') {
    location.href = '/login';
    return;
  }
  const form = document.getElementById('create-admin-form');
  const err = document.getElementById('create-admin-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await api('/api/admins', { // CHANGED
        method: 'POST',
        body: JSON.stringify(data)
      });
      form.reset();
      err.style.color = 'limegreen';
      err.textContent = 'Admin created.';
      setTimeout(() => (err.textContent = '', err.style.color = ''), 1500);
    } catch (ex) {
      err.style.color = '';
      err.textContent = ex.message;
    }
  });
});
