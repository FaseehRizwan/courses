document.addEventListener('DOMContentLoaded', async () => {
  const user = await currentUser();
  
  // Only admins can access this page
  if (!user || user.role !== 'admin') {
    location.href = '/login';
    return;
  }

  const form = document.getElementById('create-teacher-form');
  const error = document.getElementById('create-teacher-error');
  const success = document.getElementById('create-teacher-success');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    success.textContent = '';

    const formData = new FormData(form);
    const payload = {
      name: formData.get('name'),
      email: formData.get('email'),
      password: formData.get('password')
    };

    try {
      await api('/api/teachers', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      success.textContent = 'Teacher account created successfully!';
      form.reset();
      
      // Redirect after 2 seconds
      setTimeout(() => {
        location.href = '/admin/dashboard';
      }, 2000);
      
    } catch (e) {
      error.textContent = e.message;
    }
  });
});
