document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication status and update buttons
  try {
    const userResponse = await fetch('/api/me');
    const userData = await userResponse.json();
    const authButtonsContainer = document.getElementById('auth-buttons');
    
    if (userData.user) {
      authButtonsContainer.innerHTML = `
        <a href="/dashboard" class="login-btn">Dashboard</a>
        <button onclick="logout()" class="register-btn">Logout</button>
      `;
    }
  } catch (error) {
    console.error('Failed to check auth state:', error);
  }

  await loadAllCourses();
  setupFilters();
  
  // Check if logo exists, otherwise use a generic one
  const logo = document.getElementById('placeholder-logo');
  if (logo) {
    logo.onerror = function() {
      // If logo fails to load, use text instead
      logo.style.display = 'none';
    };
  }
});

let allCourses = [];

async function loadAllCourses() {
  try {
    const { courses } = await api('/api/public-courses', { method: 'GET' });
    allCourses = courses || [];
    
    // Populate teacher filter
    const teachers = [...new Set(allCourses.map(c => c.teacher_name || 'Unknown'))];
    const teacherFilter = document.getElementById('filter-teacher');
    teacherFilter.innerHTML = '<option value="">All Teachers</option>' + 
      teachers.map(teacher => `<option value="${teacher}">${teacher}</option>`).join('');
    
    displayCourses(allCourses);
  } catch (e) {
    console.error('Error loading courses:', e);
    document.getElementById('courses-grid').innerHTML = 
      '<div class="empty-state"><h3>Error loading courses</h3><p>Please try again later.</p></div>';
  }
}

function displayCourses(courses) {
  const grid = document.getElementById('courses-grid');
  
  if (!courses.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <h3>No courses found</h3>
        <p>There are no courses matching your filters at the moment.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = courses.map(course => {
    // Format pricing display
    let price = '';
    if (course.is_free) {
      price = '<span class="course-price">Free</span>';
    } else {
      const priceValue = Number(course.price) || 0;
      if (course.payment_type === 'monthly') {
        price = `<span class="course-price">PKR ${priceValue.toLocaleString()}/month</span>`;
      } else {
        price = `<span class="course-price">PKR ${priceValue.toLocaleString()}</span>`;
      }
    }
    
    const thumbnailUrl = course.thumbnail_url || '/assets/course-placeholder.jpg';
    
    return `
      <div class="course-card">
        <div class="course-image">
          <img src="${thumbnailUrl}" alt="${escapeHtml(course.title)}">
          ${price}
        </div>
        <div class="course-content">
          <span class="course-category">By ${escapeHtml(course.teacher_name || 'Unknown')}</span>
          <h3 class="course-title">${escapeHtml(course.title)}</h3>
          <p>${course.description ? escapeHtml(course.description.substring(0, 100)) + '...' : 'No description available'}</p>
        </div>
        <div class="course-stats">
          <span><i class="fas fa-book"></i> ${Number(course.lecture_count || 0)} Lectures</span>
          <span><i class="fas fa-tasks"></i> ${Number(course.assignment_count || 0)} Assignments</span>
          <span><i class="fas fa-question-circle"></i> ${Number(course.quiz_count || 0)} Quizzes</span>
        </div>
      </div>
    `;
  }).join('');
}

// Simple HTML escape function to prevent XSS
function escapeHtml(s) {
  if (!s && s !== 0) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setupFilters() {
  const searchInput = document.getElementById('search-courses');
  const teacherFilter = document.getElementById('filter-teacher');
  const freeCheck = document.getElementById('price-free');
  const paidCheck = document.getElementById('price-paid');
  const lecturesCheck = document.getElementById('feature-lectures');
  const assignmentsCheck = document.getElementById('feature-assignments');
  const quizzesCheck = document.getElementById('feature-quizzes');
  const clearFiltersBtn = document.getElementById('clear-filters');

  function filterCourses() {
    const searchTerm = (searchInput.value || '').toLowerCase();
    const selectedTeacher = teacherFilter.value;
    const showFree = freeCheck.checked;
    const showPaid = paidCheck.checked;
    const withLectures = lecturesCheck.checked;
    const withAssignments = assignmentsCheck.checked;
    const withQuizzes = quizzesCheck.checked;

    const filteredCourses = allCourses.filter(course => {
      // Search term filter
      const matchesSearch = 
        (course.title || '').toLowerCase().includes(searchTerm) || 
        (course.description || '').toLowerCase().includes(searchTerm);
      
      // Teacher filter
      const matchesTeacher = !selectedTeacher || (course.teacher_name === selectedTeacher);
      
      // Price filter
      const matchesPrice = 
        (course.is_free && showFree) || 
        (!course.is_free && showPaid);
      
      // Features filter
      const hasLectures = !withLectures || Number(course.lecture_count || 0) > 0;
      const hasAssignments = !withAssignments || Number(course.assignment_count || 0) > 0;
      const hasQuizzes = !withQuizzes || Number(course.quiz_count || 0) > 0;
      
      return matchesSearch && matchesTeacher && matchesPrice && hasLectures && hasAssignments && hasQuizzes;
    });

    displayCourses(filteredCourses);
  }

  // Add event listeners
  searchInput.addEventListener('input', filterCourses);
  teacherFilter.addEventListener('change', filterCourses);
  freeCheck.addEventListener('change', filterCourses);
  paidCheck.addEventListener('change', filterCourses);
  lecturesCheck.addEventListener('change', filterCourses);
  assignmentsCheck.addEventListener('change', filterCourses);
  quizzesCheck.addEventListener('change', filterCourses);
  
  // Clear filters button
  clearFiltersBtn.addEventListener('click', () => {
    searchInput.value = '';
    teacherFilter.value = '';
    freeCheck.checked = true;
    paidCheck.checked = true;
    lecturesCheck.checked = true;
    assignmentsCheck.checked = true;
    quizzesCheck.checked = true;
    filterCourses();
  });
}
