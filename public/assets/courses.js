async function renderCourses() {
  const container = document.getElementById('courses-list');
  const user = await currentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
    location.href = '/login';
    return;
  }

  const { courses } = await api('/api/courses', { method: 'GET' });

  if (!courses.length) {
    container.innerHTML = '<p class="muted">No courses available.</p>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'list';

  courses.forEach(c => {
    const item = document.createElement('div');
    item.className = 'item';
    const info = document.createElement('div');
    info.innerHTML = `
      <h3>${c.title}</h3>
      <p><a href="/course?id=${c.id}">Open course</a></p>
    `;
    item.appendChild(info);
    list.appendChild(item);
  });

  container.innerHTML = '';
  container.appendChild(list);
}

document.addEventListener('DOMContentLoaded', renderCourses);
