document.addEventListener('DOMContentLoaded', async () => {
  const user = await currentUser();
  
  // Strict access control - only admins allowed
  if (!user || user.role !== 'admin') {
    location.href = '/login';
    return;
  }

  // Load admin dashboard data
  await loadPlatformStats();
  await loadRecentActivity();
});

async function loadPlatformStats() {
  try {
    // Get all courses (admin can view but not modify)
    const { courses } = await api('/api/my-courses', { method: 'GET' });
    document.getElementById('total-platform-courses').textContent = courses.length;
    
    // TODO: Add user statistics when user management API is available
    document.getElementById('total-users').textContent = '---';
    document.getElementById('total-teachers').textContent = '---';
  } catch (e) {
    console.error('Error loading platform stats:', e);
  }
}

async function loadRecentActivity() {
  const activityList = document.getElementById('activity-list');
  activityList.innerHTML = '<p class="muted">Activity tracking coming soon...</p>';
}

// Admin action functions (no course modification allowed)
window.createTeacher = async () => {
  const name = prompt('Teacher Name:');
  if (!name) return;
  
  const email = prompt('Teacher Email:');
  if (!email) return;
  
  const password = prompt('Temporary Password:');
  if (!password) return;
  
  try {
    await api('/api/teachers', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    alert('Teacher account created successfully!');
  } catch (e) {
    alert('Error creating teacher: ' + e.message);
  }
};

window.viewAllCourses = () => {
  alert('Course browsing interface coming soon! Admins can view but not modify courses.');
};

window.viewSystemLogs = () => {
  alert('System logs interface coming soon!');
};

window.manageSettings = () => {
  alert('Settings management coming soon!');
};

window.generateReports = () => {
  alert('Reporting system coming soon!');
};
