document.addEventListener('DOMContentLoaded', async () => {
  const user = await currentUser();
  
  // Strict access control - only teachers allowed
  if (!user || user.role !== 'teacher') {
    location.href = '/login';
    return;
  }

  // Set teacher name
  document.getElementById('teacher-name').textContent = user.name;

  // Load dashboard data
  await loadTeacherStats();
  await loadTeacherCourses();
});

async function loadTeacherStats() {
  try {
    const { courses } = await api('/api/my-courses', { method: 'GET' });
    
    document.getElementById('total-courses').textContent = courses.length;
    
    let totalLectures = 0;
    let totalStudents = 0;
    
    for (const course of courses) {
      const { course: courseDetail } = await api(`/api/courses/${course.id}`, { method: 'GET' });
      totalLectures += courseDetail.lecture_count || 0;
      // TODO: Add student count when enrollment API is available
    }
    
    document.getElementById('total-lectures').textContent = totalLectures;
    document.getElementById('total-students').textContent = totalStudents;
  } catch (e) {
    console.error('Error loading teacher stats:', e);
  }
}

async function loadTeacherCourses() {
  try {
    const { courses } = await api('/api/my-courses', { method: 'GET' });
    const coursesList = document.getElementById('courses-list');
    
    if (!courses.length) {
      coursesList.innerHTML = '<p class="muted">No courses created yet. <a href="/create-course">Create your first course</a></p>';
      return;
    }
    
    coursesList.innerHTML = courses.map(course => `
      <div class="course-card" onclick="location.href='/course?id=${course.id}'">
        <div class="course-thumbnail" style="${course.thumbnail_url ? `background-image: url('${course.thumbnail_url}')` : ''}">
          ${!course.thumbnail_url ? 'No thumbnail' : ''}
        </div>
        <h3>${course.title}</h3>
        <p class="muted">${course.projected_hours ? `${course.projected_hours} hours` : ''}</p>
        ${course.description ? `<p>${course.description.substring(0, 100)}...</p>` : ''}
      </div>
    `).join('');
  } catch (e) {
    console.error('Error loading courses:', e);
  }
}

// Dashboard action functions
window.viewMyCourses = () => {
  location.href = '/create-course';
};

window.viewStudentProgress = () => {
  alert('Student progress tracking coming soon!');
};

window.createQuickLecture = () => {
  location.href = '/create-course';
};

window.createQuickQuiz = () => {
  location.href = '/create-course';
};

window.createQuickAssignment = () => {
  location.href = '/create-course';
};
