document.addEventListener('DOMContentLoaded', async () => {
  const user = await currentUser();
  
  // Strict access control - only students allowed
  if (!user || user.role !== 'student') {
    location.href = '/login';
    return;
  }

  // Set student name
  document.getElementById('student-name').textContent = user.name;

  // Load dashboard data
  await loadStudentStats();
  await loadEnrolledCourses();
});

async function loadStudentStats() {
  try {
    const { courses } = await api('/api/my-courses', { method: 'GET' });
    
    document.getElementById('enrolled-courses').textContent = courses.length;
    
    let completedLectures = 0;
    let totalLectures = 0;
    
    for (const course of courses) {
      // Get progress for each course
      try {
        const { progress } = await api(`/api/courses/${course.id}/progress`, { method: 'GET' });
        completedLectures += progress.filter(p => p.completed).length;
        totalLectures += progress.length;
      } catch (e) {
        console.error('Error loading course progress:', e);
      }
    }
    
    document.getElementById('completed-lectures').textContent = completedLectures;
    const completionRate = totalLectures > 0 ? Math.round((completedLectures / totalLectures) * 100) : 0;
    document.getElementById('completion-rate').textContent = `${completionRate}%`;
  } catch (e) {
    console.error('Error loading student stats:', e);
  }
}

async function loadEnrolledCourses() {
  try {
    const { courses } = await api('/api/my-courses', { method: 'GET' });
    const coursesList = document.getElementById('student-courses');
    
    if (!courses.length) {
      coursesList.innerHTML = '<p class="muted">No courses enrolled yet. Browse available courses to get started!</p>';
      return;
    }
    
    coursesList.innerHTML = courses.map(course => `
      <div class="course-card" onclick="location.href='/student/course?id=${course.id}'">
        <div class="course-thumbnail" style="${course.thumbnail_url ? `background-image: url('${course.thumbnail_url}')` : ''}">
          ${!course.thumbnail_url ? 'No thumbnail' : ''}
        </div>
        <h3>${course.title}</h3>
        <p class="muted">by ${course.teacher_name}</p>
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%"></div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Error loading courses:', e);
  }
}

// Student action functions
window.continueLastCourse = async () => {
  try {
    const { courses } = await api('/api/my-courses', { method: 'GET' });
    if (courses.length > 0) {
      location.href = `/student/course?id=${courses[0].id}`;
    } else {
      alert('No courses enrolled yet!');
    }
  } catch (e) {
    alert('Error loading courses');
  }
};

window.browseCourses = () => {
  location.href = '/student/courses';
};
