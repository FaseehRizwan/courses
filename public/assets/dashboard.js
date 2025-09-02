async function fillUserInfo() {
  const info = document.getElementById('user-info');
  const user = await currentUser();
  if (!user) {
    location.href = '/login';
    return;
  }
  info.innerHTML = `
    <p><strong>Name:</strong> ${user.name}</p>
    <p><strong>Email:</strong> ${user.email}</p>
    <p><strong>Role:</strong> ${user.role}</p>
  `;

  if (user.role === 'teacher') {
    document.getElementById('teacher-panel').classList.remove('hidden');
    bindCreateCourse();
    loadMyCourses();
  } else if (user.role === 'student') {
    document.getElementById('student-panel').classList.remove('hidden');
    loadMyCourses();
  } else if (user.role === 'admin') {
    document.getElementById('admin-panel').classList.remove('hidden');
    loadMyCourses();
    bindCreateTeacher();
  }
}

function renderCourseList(el, courses) {
  el.innerHTML = '';
  if (!courses.length) {
    el.innerHTML = '<p class="muted">No courses yet.</p>';
    return;
  }
  
  const grid = document.createElement('div');
  grid.className = 'courses-grid';
  grid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  `;
  
  courses.forEach(c => {
    const card = document.createElement('div');
    card.className = 'course-card';
    card.style.cssText = `
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      transition: transform 0.2s;
      cursor: pointer;
    `;
    
    const thumbnailStyle = c.thumbnail_url 
      ? `background-image: url('${c.thumbnail_url}'); background-size: cover; background-position: center;`
      : 'background: var(--muted); display: flex; align-items: center; justify-content: center; color: var(--text-muted);';
    
    card.innerHTML = `
      <div style="width: 100%; height: 120px; border-radius: 6px; margin-bottom: 0.75rem; ${thumbnailStyle}">
        ${!c.thumbnail_url ? 'No Image' : ''}
      </div>
      <h3 style="margin: 0 0 0.5rem 0; font-size: 1.1rem;">${c.title}</h3>
      <p style="margin: 0 0 0.5rem 0; color: var(--text-muted); font-size: 0.9rem;">By ${c.teacher_name || '—'}</p>
      ${c.description ? `<p style="margin: 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.4;">${c.description.substring(0, 100)}${c.description.length > 100 ? '...' : ''}</p>` : ''}
      ${c.projected_hours ? `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-muted);">${c.projected_hours} hours</div>` : ''}
    `;
    
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
    });
    
    card.addEventListener('click', () => {
      window.location.href = `/course?id=${c.id}`;
    });
    
    grid.appendChild(card);
  });
  
  el.appendChild(grid);
}

async function loadMyCourses() {
  const user = await currentUser();
  if (!user) return;
  const data = await api('/api/my-courses', { method: 'GET' });
  if (user.role === 'teacher') {
    renderCourseList(document.getElementById('teacher-courses'), data.courses);
  } else if (user.role === 'student') {
    renderCourseList(document.getElementById('student-courses'), data.courses);
  } else if (user.role === 'admin') {
    renderCourseList(document.getElementById('admin-courses'), data.courses);
  }
}

function bindCreateCourse() {
  const form = document.getElementById('create-course-form');
  const err = document.getElementById('create-course-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await api('/api/courses', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      form.reset();
      await loadMyCourses();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
}

function bindCreateTeacher() {
  const form = document.getElementById('create-teacher-form');
  const err = document.getElementById('create-teacher-error');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await api('/api/teachers', { // CHANGED
        method: 'POST',
        body: JSON.stringify(data)
      });
      form.reset();
      err.style.color = 'limegreen';
      err.textContent = 'Teacher created.';
      setTimeout(() => (err.textContent = '', err.style.color = ''), 1500);
    } catch (ex) {
      err.style.color = '';
      err.textContent = ex.message;
    }
  }, { once: true });
}

document.addEventListener('DOMContentLoaded', fillUserInfo);
