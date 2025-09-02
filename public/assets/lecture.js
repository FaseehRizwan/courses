function qp(name) { return new URLSearchParams(location.search).get(name); }

let currentLecture = null;
let currentCourse = null;
let allLectures = [];
let videoPlayer = null;

async function loadLecture() {
  const user = await currentUser();
  if (!user) {
    location.href = '/login';
    return;
  }

  const lectureId = qp('id');
  if (!lectureId) {
    location.href = user.role === 'student' ? '/dashboard' : '/courses';
    return;
  }

  try {
    // Get lecture details
    const lectureResponse = await api(`/api/lectures/${lectureId}`, { method: 'GET' });
    currentLecture = lectureResponse.lecture;
    
    // Get course details with all lectures
    const courseResponse = await api(`/api/courses/${currentLecture.course_id}`, { method: 'GET' });
    currentCourse = courseResponse.course;
    allLectures = courseResponse.lectures;

    // Check access for students
    if (user.role === 'student') {
      const targetLecture = allLectures.find(l => l.id == lectureId);
      if (targetLecture && targetLecture.is_locked) {
        alert('This lecture is locked. Please complete previous lectures first.');
        location.href = `/course?id=${currentCourse.id}`;
        return;
      }
    }

    renderLectureNavigation();
    renderLectureHeader();
    await renderVideoPlayer();
    await renderCourseLectures();
    renderResources();
    renderQuiz();
    renderAssignment();
    
    // For students, track viewing progress
    if (user.role === 'student') {
      setupProgressTracking();
    }

  } catch (e) {
    document.querySelector('.container').innerHTML = `<p class="error">Error loading lecture: ${e.message}</p>`;
  }
}

function renderLectureNavigation() {
  const nav = document.getElementById('lecture-navigation');
  const backLink = document.getElementById('back-to-course');
  const progressDiv = document.getElementById('lecture-progress');
  
  backLink.href = `/course?id=${currentCourse.id}`;
  backLink.textContent = `← Back to ${currentCourse.title}`;
  
  const currentIndex = allLectures.findIndex(l => l.id == currentLecture.id);
  const totalLectures = allLectures.length;
  
  progressDiv.innerHTML = `
    <div class="progress-indicator">
      <span>Lecture ${currentIndex + 1} of ${totalLectures}</span>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${((currentIndex + 1) / totalLectures) * 100}%"></div>
      </div>
    </div>
  `;
}

function renderLectureHeader() {
  const header = document.getElementById('lecture-head');
  header.innerHTML = `
    <div>
      <h1>${currentLecture.title}</h1>
      <p><strong>Course:</strong> ${currentCourse.title}</p>
      ${currentLecture.description ? `<p>${currentLecture.description}</p>` : ''}
      ${currentLecture.lecture_date ? `<p><strong>Date:</strong> ${currentLecture.lecture_date}</p>` : ''}
    </div>
  `;
}

function renderVideoPlayer() {
  const player = document.getElementById('lecture-player');
  const completion = document.getElementById('lecture-completion');
  
  if (currentLecture.video_url) {
    player.innerHTML = `
      <video id="main-video" controls style="width: 100%; max-height: 400px; border-radius: 8px;" preload="metadata" crossorigin="anonymous">
        <source src="${currentLecture.video_url}" type="video/mp4">
        <source src="${currentLecture.video_url}" type="video/webm">
        <source src="${currentLecture.video_url}" type="video/ogg">
        Your browser does not support the video tag.
      </video>
    `;
    
    videoPlayer = document.getElementById('main-video');
    
    // Add error handling for video
    videoPlayer.addEventListener('error', (e) => {
      console.error('Video error:', e);
      player.innerHTML = `
        <div style="text-align: center; padding: 3rem; background: var(--hover-bg); border-radius: 8px; border: 2px dashed var(--border);">
          <h3>Video Unavailable</h3>
          <p>There was an error loading the video. Please try refreshing the page or contact support.</p>
          <small style="color: var(--text-muted);">Error: ${e.message || 'Unknown video error'}</small>
        </div>
      `;
    });

    videoPlayer.addEventListener('loadstart', () => {
      console.log('Video loading started');
    });

    videoPlayer.addEventListener('canplay', () => {
      console.log('Video can start playing');
    });
    
    // Add completion button for students
    if (currentUser().then(u => u.role === 'student')) {
      completion.innerHTML = `
        <h4>Mark as Complete</h4>
        <p>Have you finished watching this lecture?</p>
        <button id="complete-btn" onclick="markAsComplete()" style="padding: 0.75rem 1.5rem; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer;">
          Mark as Complete
        </button>
        <div id="completion-status" style="margin-top: 1rem;"></div>
      `;
    }
  } else {
    player.innerHTML = `
      <div style="text-align: center; padding: 3rem; background: var(--hover-bg); border-radius: 8px;">
        <h3>No Video Available</h3>
        <p>This lecture doesn't have a video yet.</p>
      </div>
    `;
    
    // Still allow completion for text-based lectures
    if (currentUser().then(u => u.role === 'student')) {
      completion.innerHTML = `
        <button id="complete-btn" onclick="markAsComplete()" style="padding: 0.75rem 1.5rem; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer;">
          Mark as Complete
        </button>
      `;
    }
  }
}

async function renderCourseLectures() {
  const list = document.getElementById('course-lectures');
  const user = await currentUser();
  
  list.innerHTML = '';
  
  allLectures.forEach((lecture, index) => {
    const div = document.createElement('div');
    let statusClass = '';
    let statusIcon = '';
    
    if (user && user.role === 'student') {
      if (lecture.is_locked) {
        statusClass = 'locked';
        statusIcon = '🔒';
      } else if (lecture.progress && lecture.progress.completed) {
        statusClass = 'completed';
        statusIcon = '✅';
      }
    }
    
    if (lecture.id == currentLecture.id) {
      statusClass += ' current';
    }
    
    div.className = `lecture-item ${statusClass}`;
    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        ${statusIcon ? `<span style="font-size: 0.8rem;">${statusIcon}</span>` : ''}
        <span>${index + 1}. ${lecture.title}</span>
      </div>
    `;
    
    if (!lecture.is_locked || (user && user.role !== 'student')) {
      div.style.cursor = 'pointer';
      div.onclick = () => {
        if (lecture.id != currentLecture.id) {
          location.href = `/lecture?id=${lecture.id}`;
        }
      };
    }
    
    list.appendChild(div);
  });
}

async function renderResources() {
  const resourcesDiv = document.getElementById('resources');
  
  try {
    const resources = await api(`/api/lectures/${currentLecture.id}/resources`, { method: 'GET' });
    
    if (!resources.resources || !resources.resources.length) {
      resourcesDiv.innerHTML = '<p class="muted">No resources available for this lecture.</p>';
      return;
    }
    
    const resourcesList = document.createElement('div');
    resourcesList.className = 'resources-list';
    
    resources.resources.forEach(resource => {
      const item = document.createElement('div');
      item.style.cssText = 'padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 0.5rem;';
      
      if (resource.file_url) {
        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${resource.name}</strong>
              <div style="font-size: 0.9rem; color: var(--text-muted);">📎 File</div>
            </div>
            <a href="${resource.file_url}" target="_blank" download style="padding: 0.5rem 1rem; background: var(--primary); color: white; text-decoration: none; border-radius: 4px;">Download</a>
          </div>
        `;
      } else if (resource.link_url) {
        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${resource.name}</strong>
              <div style="font-size: 0.9rem; color: var(--text-muted);">🔗 Link</div>
            </div>
            <a href="${resource.link_url}" target="_blank" style="padding: 0.5rem 1rem; background: var(--primary); color: white; text-decoration: none; border-radius: 4px;">Open</a>
          </div>
        `;
      } else if (resource.text_content) {
        item.innerHTML = `
          <div>
            <strong>${resource.name}</strong>
            <div style="margin-top: 0.5rem; padding: 0.75rem; background: var(--hover-bg); border-radius: 4px; white-space: pre-wrap;">${resource.text_content}</div>
          </div>
        `;
      }
      
      resourcesList.appendChild(item);
    });
    
    resourcesDiv.innerHTML = '';
    resourcesDiv.appendChild(resourcesList);
    
  } catch (e) {
    resourcesDiv.innerHTML = '<p class="muted">No resources available for this lecture.</p>';
  }
}

async function renderQuiz() {
  const quizDiv = document.getElementById('quiz');
  
  try {
    const quiz = await api(`/api/lectures/${currentLecture.id}/quiz`, { method: 'GET' });
    
    if (!quiz.quiz) {
      quizDiv.innerHTML = '<p class="muted">No quiz available for this lecture.</p>';
      return;
    }
    
    // For now, show basic quiz info - can be expanded to full interactive quiz
    quizDiv.innerHTML = `
      <div style="padding: 1rem; border: 1px solid var(--border); border-radius: 8px;">
        <h4>${quiz.quiz.title}</h4>
        <p>Quiz available - Interactive quiz functionality coming soon!</p>
        <button style="padding: 0.5rem 1rem; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;" onclick="alert('Quiz functionality will be implemented in future updates.')">
          Take Quiz
        </button>
      </div>
    `;
    
  } catch (e) {
    quizDiv.innerHTML = '<p class="muted">No quiz available for this lecture.</p>';
  }
}

async function renderAssignment() {
  const assignmentDiv = document.getElementById('assignment');
  
  try {
    const assignment = await api(`/api/lectures/${currentLecture.id}/assignment`, { method: 'GET' });
    
    if (!assignment.assignment) {
      assignmentDiv.innerHTML = '<p class="muted">No assignment available for this lecture.</p>';
      return;
    }
    
    const user = await currentUser();
    const assignmentData = assignment.assignment;
    
    assignmentDiv.innerHTML = `
      <div style="padding: 1rem; border: 1px solid var(--border); border-radius: 8px;">
        <h4>${assignmentData.title}</h4>
        ${assignmentData.description ? `<p>${assignmentData.description}</p>` : ''}
        
        ${assignmentData.file_url ? `
          <div style="margin: 1rem 0;">
            <a href="${assignmentData.file_url}" download style="padding: 0.5rem 1rem; background: var(--secondary); color: var(--text); text-decoration: none; border-radius: 4px; border: 1px solid var(--border);">
              📄 Download Assignment File
            </a>
          </div>
        ` : ''}
        
        ${user.role === 'student' ? `
          <div style="margin-top: 1rem;">
            <h5>Submit Your Work</h5>
            <input type="file" id="assignment-file" style="margin: 0.5rem 0;" />
            <br />
            <button onclick="submitAssignment(${assignmentData.id})" style="padding: 0.5rem 1rem; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
              Submit Assignment
            </button>
          </div>
        ` : ''}
      </div>
    `;
    
  } catch (e) {
    assignmentDiv.innerHTML = '<p class="muted">No assignment available for this lecture.</p>';
  }
}

function setupProgressTracking() {
  // Track video progress if video exists
  if (videoPlayer) {
    videoPlayer.addEventListener('timeupdate', () => {
      const progress = (videoPlayer.currentTime / videoPlayer.duration) * 100;
      if (progress > 80) { // Consider 80% as nearly complete
        // Could auto-mark as complete or show completion prompt
      }
    });
  }
}

async function markAsComplete() {
  try {
    await api(`/api/lectures/${currentLecture.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ completion_percentage: 100 })
    });
    
    document.getElementById('completion-status').innerHTML = `
      <div style="color: #4CAF50; font-weight: bold;">✅ Lecture marked as complete!</div>
    `;
    
    // Find next lecture
    const currentIndex = allLectures.findIndex(l => l.id == currentLecture.id);
    if (currentIndex < allLectures.length - 1) {
      const nextLecture = allLectures[currentIndex + 1];
      document.getElementById('completion-status').innerHTML += `
        <div style="margin-top: 1rem;">
          <a href="/lecture?id=${nextLecture.id}" style="padding: 0.75rem 1.5rem; background: var(--primary); color: white; text-decoration: none; border-radius: 6px;">
            Next: ${nextLecture.title} →
          </a>
        </div>
      `;
    } else {
      document.getElementById('completion-status').innerHTML += `
        <div style="margin-top: 1rem;">
          <a href="/course?id=${currentCourse.id}" style="padding: 0.75rem 1.5rem; background: #4CAF50; color: white; text-decoration: none; border-radius: 6px;">
            🎉 Course Complete! Return to Course
          </a>
        </div>
      `;
    }
    
  } catch (e) {
    alert('Error marking lecture as complete: ' + e.message);
  }
}

async function submitAssignment(assignmentId) {
  const fileInput = document.getElementById('assignment-file');
  const file = fileInput.files[0];
  
  if (!file) {
    alert('Please select a file to submit.');
    return;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const res = await fetch(`/api/assignments/${assignmentId}/submit`, {
      method: 'POST',
      body: formData
    });
    
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Submission failed');
    
    alert('Assignment submitted successfully!');
    fileInput.value = '';
  } catch (e) {
    alert('Error submitting assignment: ' + e.message);
  }
}

document.addEventListener('DOMContentLoaded', loadLecture);
