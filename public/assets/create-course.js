document.addEventListener('DOMContentLoaded', async () => {
  const user = await currentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    location.href = '/login';
    return;
  }

  // Modal elements
  const courseModal = document.getElementById('course-creation-modal');
  const manageModal = document.getElementById('manage-modal');
  const overlay = document.getElementById('overlay');

  // Course creation
  const addCourseBtn = document.getElementById('add-new-course-btn');
  const cancelCourseBtn = document.getElementById('cancel-course-btn');
  const createCourseForm = document.getElementById('create-course-form');
  const createCourseError = document.getElementById('create-course-error');

  // Show/hide modals
  function showModal(modal) {
    modal.classList.remove('hidden');
  }

  function hideModal(modal) {
    modal.classList.add('hidden');
  }

  // Course creation flow
  addCourseBtn?.addEventListener('click', () => {
    showModal(courseModal);
  });

  cancelCourseBtn?.addEventListener('click', () => {
    hideModal(courseModal);
    createCourseForm?.reset();
    createCourseError.textContent = '';
  });

  createCourseForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    createCourseError.textContent = '';
    
    const formData = new FormData(createCourseForm);
    const data = Object.fromEntries(formData.entries());
    
    try {
      await api('/api/courses/create-initial', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      
      hideModal(courseModal);
      createCourseForm.reset();
      await renderCourses();
      
      createCourseError.style.color = 'green';
      createCourseError.textContent = 'Course created successfully!';
      setTimeout(() => {
        createCourseError.textContent = '';
        createCourseError.style.color = '';
      }, 3000);
    } catch (ex) {
      createCourseError.textContent = ex.message;
    }
  });

  // Close modals when clicking outside
  courseModal?.addEventListener('click', (e) => {
    if (e.target === courseModal) {
      hideModal(courseModal);
    }
  });

  manageModal?.addEventListener('click', (e) => {
    if (e.target === manageModal) {
      hideModal(manageModal);
    }
  });

  // Render courses grid
  async function renderCourses() {
    const grid = document.getElementById('courses-grid');
    if (!grid) return;

    try {
      const data = await api('/api/my-courses', { method: 'GET' });
      const courses = data.courses || [];

      grid.innerHTML = '';

      if (!courses.length) {
        grid.innerHTML = '<p class="muted">No courses created yet. Click "Add New Course" to get started!</p>';
        return;
      }

      courses.forEach(course => {
        const courseCard = createCourseCard(course);
        grid.appendChild(courseCard);
      });
    } catch (e) {
      grid.innerHTML = `<p class="error">Error loading courses: ${e.message}</p>`;
    }
  }

  // Create course card element
  function createCourseCard(course) {
    const card = document.createElement('div');
    card.className = 'course-card';
    card.style.cursor = 'pointer';

    const thumbnailStyle = course.thumbnail_url 
      ? `background-image: url('${course.thumbnail_url}')`
      : '';

    // Format pricing display
    let pricingDisplay = '';
    if (course.is_free) {
      pricingDisplay = '<span class="price-tag free">FREE</span>';
    } else {
      const price = Number(course.price) || 0;
      if (course.payment_type === 'monthly') {
        pricingDisplay = `<span class="price-tag paid">PKR ${price.toLocaleString()}/month</span>`;
        if (course.monthly_payment_month) {
          pricingDisplay += `<small class="payment-month">${course.monthly_payment_month}</small>`;
        }
      } else {
        pricingDisplay = `<span class="price-tag paid">PKR ${price.toLocaleString()}</span>`;
      }
    }

    card.innerHTML = `
      <div class="course-thumbnail" style="${thumbnailStyle}">
        ${!course.thumbnail_url ? 'No thumbnail' : ''}
      </div>
      <h3>${course.title}</h3>
      <p class="muted">
        ${course.projected_hours ? `${course.projected_hours} hours` : ''} 
        ${course.total_lectures ? `• ${course.total_lectures} lectures planned` : ''}
      </p>
      ${course.description ? `<p>${course.description}</p>` : ''}
      
      <div class="course-pricing">
        ${pricingDisplay}
      </div>
      
      <div class="course-actions">
        <button class="btn-primary" onclick="event.stopPropagation(); uploadThumbnail(${course.id})">Add Thumbnail</button>
        <button class="btn-primary" onclick="event.stopPropagation(); addLecture(${course.id})">Add Lecture</button>
        <button class="btn-primary" onclick="event.stopPropagation(); addQuiz(${course.id})">Add Quiz</button>
        <button class="btn-primary" onclick="event.stopPropagation(); addAssignment(${course.id})">Add Assignment</button>
        <button class="btn-primary" onclick="event.stopPropagation(); addGrandQuiz(${course.id})">Add Grand Quiz</button>
        <button class="btn-primary" onclick="event.stopPropagation(); addGrandAssignment(${course.id})">Add Grand Assignment</button>
        <button class="btn-secondary" onclick="event.stopPropagation(); updateCourse(${course.id})">Update</button>
        <button class="btn-danger" onclick="event.stopPropagation(); deleteCourse(${course.id})">Delete</button>
      </div>
    `;

    // Add click handler to navigate to course page
    card.addEventListener('click', () => {
      location.href = `/course?id=${course.id}`;
    });

    return card;
  }

  // Initialize course creation modal
  document.getElementById('add-new-course-btn').addEventListener('click', () => {
    document.getElementById('course-creation-modal').classList.remove('hidden');
  });

  document.getElementById('cancel-course-btn').addEventListener('click', () => {
    document.getElementById('course-creation-modal').classList.add('hidden');
  });

  // Handle course creation form submission
  document.getElementById('create-course-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = document.getElementById('create-course-error');
    error.textContent = '';

    const formData = new FormData(e.target);
    const isFree = formData.get('is_free') === 'on';
    const paymentType = formData.get('payment_type');
    const price = formData.get('price');
    const monthlyMonth = formData.get('monthly_payment_month');

    // Validation
    if (!isFree) {
      if (!price || Number(price) <= 0) {
        error.textContent = 'Please enter a valid price for paid courses.';
        return;
      }
      if (paymentType === 'monthly' && !monthlyMonth) {
        error.textContent = 'Please select a payment month for monthly payments.';
        return;
      }
    }

    const payload = {
      title: formData.get('title'),
      description: formData.get('description'),
      projected_hours: formData.get('projected_hours') ? Number(formData.get('projected_hours')) : null,
      total_lectures: formData.get('total_lectures') ? Number(formData.get('total_lectures')) : null,
      is_free: isFree,
      price: isFree ? 0 : Number(price),
      payment_type: isFree ? 'one_time' : paymentType,
      monthly_payment_month: (paymentType === 'monthly' && !isFree) ? monthlyMonth : null
    };

    try {
      await api('/api/courses/basic', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      document.getElementById('course-creation-modal').classList.add('hidden');
      document.getElementById('create-course-form').reset();
      await renderCourses();
      alert('Course created successfully!');
    } catch (ex) {
      error.textContent = ex.message;
    }
  });

  // Global helpers so injected HTML onchange handlers work
  window.togglePricingUpdate = function (checkbox) {
    const pricingFields = document.getElementById('pricing-fields-update');
    if (!pricingFields) return;
    if (checkbox.checked) pricingFields.classList.add('hidden');
    else pricingFields.classList.remove('hidden');
  };

  window.toggleMonthFieldUpdate = function (_select) {
    // Month selection is no longer required. This is a no-op kept for compatibility.
    return;
  };

  window.updateCourse = async (courseId) => {
    if (!confirm('Do you want to update this course?')) {
      return;
    }

    try {
      // Get current course data first
      const { course } = await api(`/api/courses/${courseId}`, { method: 'GET' });
      
      showManageModal(`
        <h3>Update Course</h3>
        <form id="update-course-form" class="form">
          <label>Course Title *
            <input type="text" name="title" value="${course.title}" required />
          </label>
          <label>Description
            <textarea name="description" rows="3">${course.description || ''}</textarea>
          </label>
          <label>Estimated Project Hours
            <input type="number" name="projected_hours" min="0" step="0.5" value="${course.projected_hours || ''}" placeholder="e.g. 12" />
          </label>
          <label>Total Lectures (planned)
            <input type="number" name="total_lectures" min="0" value="${course.total_lectures || ''}" placeholder="e.g. 10" />
          </label>
          
          <!-- Pricing Section -->
          <div class="pricing-section">
            <h3>Course Pricing</h3>
            
            <label class="checkbox-label">
              <input type="checkbox" name="is_free" ${course.is_free ? 'checked' : ''} onchange="togglePricingUpdate(this)" />
              This is a free course
            </label>
            
            <div id="pricing-fields-update" class="pricing-fields ${course.is_free ? 'hidden' : ''}">
              <label>Course Price (PKR) *
                <input type="number" name="price" min="0" step="1" value="${course.price || ''}" placeholder="e.g. 5000" />
              </label>
              
              <label>Payment Type *
                <select name="payment_type" onchange="toggleMonthFieldUpdate(this)">
                  <option value="one_time" ${course.payment_type === 'one_time' ? 'selected' : ''}>One-time Payment</option>
                  <option value="monthly" ${course.payment_type === 'monthly' ? 'selected' : ''}>Monthly Payment</option>
                </select>
              </label>

              <div class="currency-note">All pricing in PKR (Pakistani Rupees). Monthly option does not require selecting a specific month.</div>
            </div>
          </div>
          
          <div class="form-actions">
            <button type="button" onclick="hideManageModal()">Cancel</button>
            <button type="submit">Update Course</button>
          </div>
          <div id="manage-error" class="error"></div>
        </form>
      `);

      const form = document.getElementById('update-course-form');
      const error = document.getElementById('manage-error');

      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        error.textContent = '';

        const formData = new FormData(form);
        const isFree = formData.get('is_free') === 'on';
        const paymentType = formData.get('payment_type');
        const price = formData.get('price');

        // Validation
        if (!isFree) {
          if (!price || Number(price) <= 0) {
            error.textContent = 'Please enter a valid price for paid courses.';
            return;
          }
          // Monthly does not require a month selection anymore
        }

        const payload = {
          title: formData.get('title'),
          description: formData.get('description'),
          projected_hours: formData.get('projected_hours') ? Number(formData.get('projected_hours')) : null,
          total_lectures: formData.get('total_lectures') ? Number(formData.get('total_lectures')) : null,
          is_free: isFree,
          price: isFree ? 0 : Number(price),
          payment_type: isFree ? 'one_time' : paymentType,
          monthly_payment_month: null
        };

        try {
          await api(`/api/courses/${courseId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
          });

          hideManageModal();
          await renderCourses();
          alert('Course updated successfully!');
        } catch (ex) {
          error.textContent = ex.message;
        }
      });

    } catch (e) {
      alert('Error loading course data: ' + e.message);
    }
  };

  window.deleteCourse = async (courseId) => {
    if (!confirm('Are you sure you want to delete this course? This action cannot be undone.\n\nAll lectures, quizzes, and assignments will be permanently deleted.')) {
      return;
    }

    try {
      await api(`/api/courses/${courseId}`, { method: 'DELETE' });
      await renderCourses();
      alert('Course deleted successfully.');
    } catch (e) {
      alert('Error deleting course: ' + e.message);
      alert('Error deleting course: ' + e.message);
    }
  };

  // Helper functions
  function showManageModal(html) {
    const content = document.getElementById('manage-modal-content');
    if (content) {
      content.innerHTML = html;
      showModal(manageModal);
    }
  }

  window.hideManageModal = () => {
    hideModal(manageModal);
  };

  async function getCourseLectures(courseId) {
    try {
      const { lectures } = await api(`/api/courses/${courseId}`, { method: 'GET' });
      return lectures || [];
    } catch {
      return [];
    }
  }

  // Initial render
  await renderCourses();
});
