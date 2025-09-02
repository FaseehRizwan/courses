// Load course data when the page is ready
document.addEventListener('DOMContentLoaded', async function() {
  try {
    // Check authentication
    const userResponse = await api('/api/me');
    if (!userResponse.user || userResponse.user.role !== 'student') {
      location.href = '/login';
      return;
    }
    
    // Get course ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');
    
    if (!courseId) {
      alert('No course specified');
      location.href = '/student/dashboard';
      return;
    }
    
    // Get course details
    const courseData = await api(`/api/courses/${courseId}`);
    
    if (!courseData || !courseData.course) {
      alert('Course not found or you do not have access');
      location.href = '/student/dashboard';
      return;
    }
    
    // Update page with course data
    updateCourseHeader(courseData.course);
    
    // Load course content
    loadCourseContent(courseData.allContent);
    
  } catch (error) {
    console.error('Error loading course:', error);
    document.getElementById('course-content').innerHTML = `
      <div class="empty-state">
        <h3>Error Loading Course</h3>
        <p>There was a problem loading this course. Please try again later.</p>
      </div>
    `;
  }
});

// Update the course header with course information
function updateCourseHeader(course) {
  // Set course title in various places
  document.getElementById('course-title').textContent = course.title;
  document.getElementById('header-course-title').textContent = course.title;
  document.getElementById('breadcrumb-course').textContent = course.title;
  
  // Set course metadata
  document.getElementById('course-instructor').textContent = course.teacher_name || 'Instructor';
  document.getElementById('course-lectures').textContent = `${course.lecture_count || 0} Lectures`;
  document.getElementById('course-hours').textContent = `${course.projected_hours || 0} Hours`;
  
  // Set course progress
  const progressPercentage = calculateProgress(course);
  document.getElementById('course-progress-text').textContent = `Your progress: ${progressPercentage}% complete`;
  document.querySelector('.course-progress-fill').style.width = `${progressPercentage}%`;
}

// Calculate student's progress in the course
function calculateProgress(course) {
  // In a real application, this would come from the API
  // Here we're just using a placeholder value
  return 75;
}

// Load the course content (lectures, quizzes, etc.)
function loadCourseContent(contentItems) {
  const contentList = document.querySelector('.course-content-list');
  
  if (!contentItems || contentItems.length === 0) {
    contentList.innerHTML = '<li class="content-item"><a href="#">No content available</a></li>';
    return;
  }
  
  // Sort content by order_index
  contentItems.sort((a, b) => a.order_index - b.order_index);
  
  let contentHTML = '';
  let firstUnlockedId = null;
  
  contentItems.forEach(item => {
    let icon, itemTitle, itemUrl, itemClass = '';
    
    // Determine type-specific attributes
    switch (item.type) {
      case 'lecture':
        icon = 'video';
        itemTitle = item.title;
        itemUrl = `/student/lecture?id=${item.id}`;
        break;
      case 'grand_quiz':
        icon = 'question-circle';
        itemTitle = `Quiz: ${item.title}`;
        itemUrl = `/student/quiz?id=${item.id}`;
        break;
      case 'grand_assignment':
        icon = 'tasks';
        itemTitle = `Assignment: ${item.title}`;
        itemUrl = `/student/assignment?id=${item.id}`;
        break;
    }
    
    // Determine completion/locked status
    if (item.progress && item.progress.completed) {
      itemClass = 'completed';
    } else if (item.is_locked) {
      itemClass = 'locked';
    } else if (!firstUnlockedId) {
      firstUnlockedId = item.id;
      itemClass = 'active';
    }
    
    contentHTML += `
      <li class="content-item ${itemClass}">
        <a href="${item.is_locked ? '#' : itemUrl}">
          <i class="fas fa-${icon}"></i> ${itemTitle}
        </a>
      </li>
    `;
  });
  
  contentList.innerHTML = contentHTML;
}
