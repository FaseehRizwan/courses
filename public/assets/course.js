function qp(name) { return new URLSearchParams(location.search).get(name); }

async function loadCourse() {
  const user = await currentUser();
  if (!user) {
    location.href = '/login';
    return;
  }

  const id = qp('id');
  if (!id) { 
    location.href = user.role === 'student' ? '/dashboard' : '/courses'; 
    return; 
  }

  try {
    const response = await api(`/api/courses/${id}`, { method: 'GET' });
    const { course, allContent } = response;

    // Course header with thumbnail
    const header = document.getElementById('course-header');
    const thumbnailStyle = course.thumbnail_url 
      ? `background-image: url('${course.thumbnail_url}'); background-size: cover; background-position: center;`
      : '';

    header.innerHTML = `
      <div style="display: flex; gap: 1.5rem; align-items: flex-start;">
        <div style="width: 200px; height: 120px; ${thumbnailStyle} background: var(--muted); border-radius: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--text-muted);">
          ${!course.thumbnail_url ? 'No Image' : ''}
        </div>
        <div style="flex: 1;">
          <h1>${course.title}</h1>
          <p><strong>Instructor:</strong> ${course.teacher_name}</p>
          ${course.projected_hours != null ? `<p><strong>Duration:</strong> ${course.projected_hours} hour(s)</p>` : ''}
          ${course.launch_date ? `<p><strong>Launch Date:</strong> ${course.launch_date}</p>` : ''}
          <p><strong>Total Content:</strong> ${course.total_content_count} items (${course.lecture_count} lectures, ${course.grand_quiz_count || 0} grand quizzes, ${course.grand_assignment_count || 0} grand assignments)</p>
          ${course.description ? `<p><strong>Description:</strong> ${course.description}</p>` : ''}
        </div>
      </div>
    `;

    // Render course content list with drag-and-drop
    const list = document.getElementById('lecture-list');
    list.innerHTML = '';

    if (!allContent || !allContent.length) {
      list.innerHTML = '<p class="muted">No content available yet.</p>';
      return;
    }

    // Create sortable list container
    const sortableContainer = document.createElement('div');
    sortableContainer.id = 'sortable-content';
    sortableContainer.className = 'sortable-container';

    allContent.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'content-item';
      div.draggable = user.role === 'admin' || user.id === course.teacher_id;
      div.dataset.type = item.type;
      div.dataset.id = item.id;
      div.dataset.order = i;
      
      // Determine item status and icon
      let statusClass = '';
      let statusIcon = '';
      let clickable = true;

      if (user.role === 'student') {
        if (item.is_locked) {
          statusClass = 'locked';
          statusIcon = '🔒';
          clickable = false;
        } else if (item.progress && item.progress.completed) {
          statusClass = 'completed';
          statusIcon = '✅';
        } else {
          statusClass = 'current';
          statusIcon = '▶️';
        }
      }

      // Get appropriate icon for content type
      let typeIcon = '';
      if (item.type === 'lecture') typeIcon = '🎥';
      else if (item.type === 'grand_quiz') typeIcon = '📝';
      else if (item.type === 'grand_assignment') typeIcon = '📋';

      const itemContent = `
        <div class="content-item-inner ${statusClass}">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
            <div style="flex: 1;">
              ${clickable ? `<a href="/${item.type.replace('grand_', '')}?id=${item.id}" style="text-decoration: none; color: inherit;">` : '<div>'}
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  ${statusIcon ? `<span>${statusIcon}</span>` : ''}
                  <span>${typeIcon}</span>
                  <strong>${i + 1}. ${item.title}</strong>
                  <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">(${item.type.replace('_', ' ')})</span>
                </div>
                ${item.description ? `<div style="font-size: 0.9rem; color: var(--text-muted); margin-top: 0.25rem;">${item.description}</div>` : ''}
                ${item.lecture_date ? `<div style="font-size: 0.8rem; color: var(--text-muted);">📅 ${item.lecture_date}</div>` : ''}
                ${item.type === 'lecture' && (item.resource_count > 0 || item.quiz_count > 0 || item.assignment_count > 0) ? `
                  <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">
                    ${item.resource_count > 0 ? `📎 ${item.resource_count} resource(s)` : ''}
                    ${item.quiz_count > 0 ? ` | 📝 ${item.quiz_count} quiz(s)` : ''}
                    ${item.assignment_count > 0 ? ` | 📋 ${item.assignment_count} assignment(s)` : ''}
                  </div>
                ` : ''}
              ${clickable ? '</a>' : '</div>'}
              
              ${user.role === 'student' && item.progress ? `
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${item.progress.percentage || 0}%"></div>
                </div>
              ` : ''}
            </div>
            
            ${(user.role === 'admin' || user.id === course.teacher_id) ? `
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <div class="drag-handle" style="cursor: grab; padding: 0.5rem; color: var(--text-muted); font-size: 1.2rem;">⋮⋮</div>
                <button onclick="editContent('${item.type}', ${item.id})" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Edit</button>
                <button onclick="deleteContent('${item.type}', ${item.id})" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #dc3545; color: white;">Delete</button>
              </div>
            ` : ''}
            
            ${!clickable ? '<span class="lock-icon">🔒</span>' : ''}
          </div>
        </div>
      `;

      div.innerHTML = itemContent;
      sortableContainer.appendChild(div);
    });

    list.appendChild(sortableContainer);

    // Add drag-and-drop functionality for teachers/admins
    if (user.role === 'admin' || user.id === course.teacher_id) {
      initializeDragAndDrop(sortableContainer, id);
      
      // Save order button
      const saveOrderBtn = document.createElement('button');
      saveOrderBtn.textContent = 'Save Content Order';
      saveOrderBtn.id = 'save-order-btn';
      saveOrderBtn.style.cssText = 'margin-top: 1rem; padding: 0.75rem 1.5rem; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer;';
      saveOrderBtn.onclick = () => saveContentOrder(id);
      list.appendChild(saveOrderBtn);
    }

    // Update player section
    const player = document.getElementById('player');
    if (player) {
      if (user.role === 'student') {
        const firstAccessible = allContent.find(item => !item.is_locked);
        if (firstAccessible) {
          player.innerHTML = `
            <h3>Welcome to ${course.title}</h3>
            <p>Complete each item in order to unlock the next one. You have lectures, quizzes, and assignments to complete.</p>
            <a href="/${firstAccessible.type.replace('grand_', '')}?id=${firstAccessible.id}" style="display: inline-block; padding: 1rem 2rem; background: var(--primary); color: white; text-decoration: none; border-radius: 6px; margin-top: 1rem;">
              Start with: ${firstAccessible.title}
            </a>
          `;
        } else {
          player.innerHTML = '<p class="muted">No content available yet.</p>';
        }
      } else {
        // For teachers/admins, show a preview of course content
        if (course.video_url) {
          player.innerHTML = `
            <h3>Course Preview</h3>
            <p>This is how students will see the course content:</p>
            <video controls style="width: 100%; max-height: 300px; border-radius: 8px;" preload="metadata">
              <source src="${course.video_url}" type="video/mp4">
              <source src="${course.video_url}" type="video/webm">
              <source src="${course.video_url}" type="video/ogg">
              Your browser does not support the video tag.
            </video>
          `;
        } else {
          player.innerHTML = `
            <h3>Course Management</h3>
            <p>Select content to preview or manage. Students will see course content in the order you've arranged.</p>
            <div style="padding: 1rem; background: var(--hover-bg); border-radius: 8px; margin-top: 1rem;">
              <strong>Course Structure:</strong>
              <ul style="margin: 0.5rem 0; padding-left: 1.5rem;">
                <li>${course.lecture_count} lectures</li>
                <li>${course.grand_quiz_count || 0} grand quizzes</li>
                <li>${course.grand_assignment_count || 0} grand assignments</li>
              </ul>
            </div>
          `;
        }
      }
    }

  } catch (e) {
    console.error('Course load error:', e);
    document.querySelector('.container').innerHTML = `<p class="error">Error loading course: ${e.message}</p>`;
  }
}

// Enhanced drag-and-drop functionality
function initializeDragAndDrop(container, courseId) {
  let draggedElement = null;
  let placeholder = null;

  // Create placeholder element
  function createPlaceholder() {
    const div = document.createElement('div');
    div.className = 'drag-placeholder';
    div.style.cssText = `
      height: 4px;
      background: var(--primary);
      margin: 4px 0;
      border-radius: 2px;
      opacity: 0.7;
    `;
    return div;
  }

  container.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('content-item')) {
      draggedElement = e.target;
      e.target.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
      
      // Create and store placeholder
      placeholder = createPlaceholder();
    }
  });

  container.addEventListener('dragend', (e) => {
    if (e.target.classList.contains('content-item')) {
      e.target.style.opacity = '1';
      
      // Remove placeholder
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.removeChild(placeholder);
      }
      placeholder = null;
      draggedElement = null;
      
      // Update order numbers
      updateOrderNumbers();
    }
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (!draggedElement || !placeholder) return;
    
    const afterElement = getDragAfterElement(container, e.clientY);
    if (afterElement == null) {
      container.appendChild(placeholder);
    } else {
      container.insertBefore(placeholder, afterElement);
    }
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!draggedElement || !placeholder) return;
    
    // Replace placeholder with dragged element
    placeholder.parentNode.replaceChild(draggedElement, placeholder);
    
    // Enable save button
    const saveBtn = document.getElementById('save-order-btn');
    if (saveBtn) {
      saveBtn.style.background = '#28a745';
      saveBtn.textContent = 'Save Changes';
    }
  });

  // Helper function to determine drop position
  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.content-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
}

// Update visual order numbers after drag-and-drop
function updateOrderNumbers() {
  const items = document.querySelectorAll('.content-item');
  items.forEach((item, index) => {
    const titleElement = item.querySelector('strong');
    if (titleElement) {
      const text = titleElement.textContent;
      titleElement.textContent = text.replace(/^\d+\.\s*/, `${index + 1}. `);
    }
    item.dataset.order = index;
  });
}

// Save content order
async function saveContentOrder(courseId) {
  if (!confirm('Save the current content order? This will affect the sequence for students.')) return;
  
  try {
    const items = Array.from(document.querySelectorAll('.content-item')).map((el, index) => ({
      type: el.dataset.type,
      id: parseInt(el.dataset.id),
      order: index
    }));
    
    const response = await api(`/api/courses/${courseId}/reorder-content`, {
      method: 'PUT',
      body: JSON.stringify({ items })
    });
    
    alert('Content order saved successfully!');
    
    // Reset save button
    const saveBtn = document.getElementById('save-order-btn');
    if (saveBtn) {
      saveBtn.style.background = 'var(--primary)';
      saveBtn.textContent = 'Save Content Order';
    }
    
    // Optional: reload to confirm changes
    // location.reload();
  } catch (e) {
    alert('Error saving order: ' + e.message);
  }
}

// Content management functions
window.editContent = async (type, id) => {
  if (!confirm(`Do you want to edit this ${type.replace('_', ' ')}?`)) return;
  
  try {
    // Simple edit for now - can be enhanced with proper modals
    const newTitle = prompt('Enter new title:');
    if (!newTitle) return;
    
    const newDesc = prompt('Enter new description (optional):');
    if (newDesc === null) return;
    
    const endpoint = type === 'lecture' ? `/api/lectures/${id}` : 
                    type === 'grand_quiz' ? `/api/grand-quizzes/${id}` :
                    `/api/grand-assignments/${id}`;
    
    const payload = { title: newTitle };
    if (newDesc) payload.description = newDesc;
    
    await api(endpoint, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    
    alert('Content updated successfully!');
    location.reload();
  } catch (e) {
    alert('Error updating content: ' + e.message);
  }
};

window.deleteContent = async (type, id) => {
  const typeName = type.replace('_', ' ');
  if (!confirm(`Are you sure you want to delete this ${typeName}?\n\nThis action cannot be undone and will remove all associated data.`)) {
    return;
  }
  
  try {
    const endpoint = type === 'lecture' ? `/api/lectures/${id}` : 
                    type === 'grand_quiz' ? `/api/grand-quizzes/${id}` :
                    `/api/grand-assignments/${id}`;
    
    await api(endpoint, { method: 'DELETE' });
    alert(`${typeName.charAt(0).toUpperCase() + typeName.slice(1)} deleted successfully!`);
    location.reload();
  } catch (e) {
    alert(`Error deleting ${typeName}: ` + e.message);
  }
};

document.addEventListener('DOMContentLoaded', loadCourse);
