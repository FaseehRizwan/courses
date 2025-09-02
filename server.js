const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { run, get, all, migrate } = require('./db');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

// Ensure media folder exists and serve it
const MEDIA_DIR = path.join(__dirname, 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
app.use('/media', express.static(MEDIA_DIR));

// Serve static assets under /assets (no .html routes exposed)
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// Page routes (clean paths)
function sendPage(res, file) {
  res.sendFile(path.join(__dirname, 'public', file));
}

// Add page-role guard
function requirePageRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (!roles.includes(req.session.user.role)) return res.status(403).send('Forbidden');
    next();
  };
}

// Page routes with strict role-based access
app.get('/', (req, res) => sendPage(res, 'index.html'));
app.get('/login', (req, res) => sendPage(res, 'login.html'));
app.get('/register', (req, res) => sendPage(res, 'register.html'));

// Role-specific dashboard routes
app.get('/dashboard', requireAuth, (req, res) => {
  // Redirect to role-specific dashboard
  const userRole = req.session.user.role;
  if (userRole === 'admin') {
    return res.redirect('/admin/dashboard');
  } else if (userRole === 'teacher') {
    return res.redirect('/teacher/dashboard');
  } else if (userRole === 'student') {
    return res.redirect('/student/dashboard');
  }
  return res.status(403).send('Invalid role');
});

// Dedicated dashboard routes for each role
app.get('/admin/dashboard', requirePageRole('admin'), (req, res) => sendPage(res, 'admin-dashboard.html'));
app.get('/teacher/dashboard', requirePageRole('teacher'), (req, res) => sendPage(res, 'teacher-dashboard.html'));
app.get('/student/dashboard', requirePageRole('student'), (req, res) => sendPage(res, 'student-dashboard.html'));

// TEACHER-ONLY routes
app.get('/create-course', requirePageRole('teacher'), (req, res) => sendPage(res, 'create-course.html'));
app.get('/course', requirePageRole('teacher'), (req, res) => sendPage(res, 'course.html'));
app.get('/lecture', requirePageRole('teacher'), (req, res) => sendPage(res, 'lecture.html'));

// ADMIN-ONLY routes
app.get('/admin/create-teacher', requirePageRole('admin'), (req, res) => sendPage(res, 'create-teacher.html'));

// Centralized course view (publicly accessible)
app.get('/courses', (req, res) => {
  // All users now get the centralized view
  sendPage(res, 'centralized-courses.html');
});

// Make courses listing API public
app.get('/api/public-courses', async (req, res) => {
  try {
    const rows = await all(
      `SELECT 
         c.id,
         c.title,
         c.description,
         c.thumbnail_url,
         c.projected_hours,
         c.price,
         c.payment_type,
         c.is_free,
         u.name AS teacher_name,
         (SELECT COUNT(*) FROM lectures l WHERE l.course_id = c.id) AS lecture_count,
         (SELECT COUNT(*) FROM lecture_assignments la WHERE la.lecture_id IN (SELECT id FROM lectures WHERE course_id = c.id)) AS assignment_count,
         (SELECT COUNT(*) FROM lecture_quizzes lq WHERE lq.lecture_id IN (SELECT id FROM lectures WHERE course_id = c.id)) AS quiz_count
       FROM courses c
       JOIN users u ON u.id = c.teacher_id
       ORDER BY c.created_at DESC`
    );
    res.json({ courses: rows });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('GET /api/public-courses error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add these public page routes
app.get('/about', (req, res) => sendPage(res, 'about.html'));
app.get('/contact', (req, res) => sendPage(res, 'contact.html'));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// API routes
app.post('/api/register', async (req, res) => {
  try {
    // CHANGED: force student role, no role from client
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const role = 'student';
    const existing = await get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 12);
    const result = await run(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
      [name, email.toLowerCase(), hash, role]
    );
    // Auto-login after registration
    req.session.user = { id: result.lastID, name, email: email.toLowerCase(), role };
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    const user = await get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// Restrict listing to admin/teacher; limit content on client side
app.get('/api/courses', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const rows = await all(
      `SELECT c.id, c.title
       FROM courses c
       ORDER BY c.created_at DESC`
    );
    res.json({ courses: rows });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Allow JSON creation with projected_hours and pricing
app.post('/api/courses', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const { title, description, video_url, projected_hours, price, payment_type, monthly_payment_month, is_free } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    
    const teacherId = req.session.user.role === 'teacher' ? req.session.user.id : (req.body.teacher_id || req.session.user.id);
    
    const result = await run(
      'INSERT INTO courses (title, description, video_url, teacher_id, projected_hours, price, payment_type, monthly_payment_month, is_free) VALUES (?,?,?,?,?,?,?,?,?)',
      [
        title, 
        description || '', 
        video_url || '', 
        teacherId, 
        projected_hours != null ? Number(projected_hours) : null,
        price != null ? Number(price) : 0,
        payment_type || 'one_time',
        monthly_payment_month || null,
        is_free != null ? (is_free ? 1 : 0) : 1
      ]
    );
    res.json({ ok: true, id: result.lastID });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: create basic course details with pricing
app.post('/api/courses/basic', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const { title, description, projected_hours, launch_date, is_published, price, payment_type, monthly_payment_month, is_free } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    
    const teacherId = req.session.user.role === 'teacher' ? req.session.user.id : (req.body.teacher_id || req.session.user.id);
    
    const result = await run(
      'INSERT INTO courses (title, description, video_url, teacher_id, projected_hours, launch_date, is_published, price, payment_type, monthly_payment_month, is_free) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [
        title, 
        description || '', 
        '', 
        teacherId,
        projected_hours != null ? Number(projected_hours) : null,
        launch_date || null,
        is_published ? 1 : 0,
        price != null ? Number(price) : 0,
        payment_type || 'one_time',
        monthly_payment_month || null,
        is_free != null ? (is_free ? 1 : 0) : 1
      ]
    );
    res.json({ ok: true, id: result.lastID });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/enroll', requireRole('student'), async (req, res) => {
  try {
    const { course_id } = req.body;
    if (!course_id) return res.status(400).json({ error: 'course_id required' });
    await run('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?,?)', [
      req.session.user.id,
      course_id
    ]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/my-courses', requireAuth, async (req, res) => {
  try {
    const role = req.session.user.role;
    const userId = req.session.user.id;

    if (role === 'student') {
      const rows = await all(
        `SELECT c.*, u.name AS teacher_name
         FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         JOIN users u ON u.id = c.teacher_id
         WHERE e.user_id = ?
         ORDER BY e.created_at DESC`,
        [userId]
      );
      return res.json({ courses: rows });
    }

    if (role === 'teacher') {
      const rows = await all(
        `SELECT c.*, u.name AS teacher_name
         FROM courses c
         JOIN users u ON u.id = c.teacher_id
         WHERE c.teacher_id = ?
         ORDER BY c.created_at DESC`,
        [userId]
      );
      return res.json({ courses: rows });
    }

    // admin
    const rows = await all(
      `SELECT c.*, u.name AS teacher_name
       FROM courses c
       JOIN users u ON u.id = c.teacher_id
       ORDER BY c.created_at DESC`
    );
    res.json({ courses: rows });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload config (videos only)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MEDIA_DIR),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const base = (file.originalname || 'video').toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-');
    cb(null, `${ts}-${base}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 500 }, // 500MB
  fileFilter: (req, file, cb) => {
    if ((file.mimetype || '').startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files are allowed'));
  }
});
// Additional uploader for any resource file types
const uploadAny = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 200 } // 200MB for resources
});
// Additional uploader for images (thumbnails)
const uploadImage = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 10 }, // Increased to 10MB for images
  fileFilter: (req, file, cb) => {
    if ((file.mimetype || '').startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// Update multer to handle mixed file types
const uploadMixed = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 500 }, // 500MB for videos
  fileFilter: (req, file, cb) => {
    // Allow all file types but check field name for specific restrictions
    if (file.fieldname === 'video') {
      if ((file.mimetype || '').startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Only video files are allowed for video field'));
      }
    } else {
      // Allow any file type for resource field
      cb(null, true);
    }
  }
});

// Create course with direct video upload (teacher/admin) + projected_hours
app.post('/api/courses/upload', requireRole('teacher', 'admin'), upload.single('video'), async (req, res) => {
  try {
    const { title, description, projected_hours } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    if (!req.file) return res.status(400).json({ error: 'Video file required' });

    const video_url = `/media/${req.file.filename}`;
    const teacherId =
      req.session.user.role === 'teacher' ? req.session.user.id : (req.body.teacher_id || req.session.user.id);

    const result = await run(
      'INSERT INTO courses (title, description, video_url, teacher_id, projected_hours) VALUES (?,?,?,?,?)',
      [title, description || '', video_url, teacherId, projected_hours != null ? Number(projected_hours) : null]
    );
    const courseId = result.lastID;

    // Auto-create first lecture for this course
    await run(
      'INSERT INTO lectures (course_id, title, description, video_url, order_index) VALUES (?,?,?,?,?)',
      [courseId, title, description || '', video_url, 0]
    );

    res.json({ ok: true, id: courseId, video_url });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload and create a lecture under an existing course (teacher/admin)
app.post('/api/lectures/upload', requireRole('teacher', 'admin'), upload.single('video'), async (req, res) => {
  try {
    const { course_id, title, description, order_index, lecture_date } = req.body;
    if (!course_id || !title) return res.status(400).json({ error: 'course_id and title required' });
    if (!req.file) return res.status(400).json({ error: 'Video file required' });

    // Optional: ensure teacher owns course unless admin
    if (req.session.user.role === 'teacher') {
      const owns = await get('SELECT 1 FROM courses WHERE id=? AND teacher_id=?', [course_id, req.session.user.id]);
      if (!owns) return res.status(403).json({ error: 'Forbidden' });
    }

    const video_url = `/media/${req.file.filename}`;
    const ins = await run(
      'INSERT INTO lectures (course_id, title, description, video_url, order_index, lecture_date) VALUES (?,?,?,?,?,?)',
      [course_id, title, description || '', video_url, Number.isFinite(+order_index) ? +order_index : 0, lecture_date || null]
    );
    res.json({ ok: true, id: ins.lastID, video_url });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: Upload lecture with optional resource file (accept all file types)
app.post('/api/lectures/upload-with-resource', requireRole('teacher', 'admin'), (req, res) => {
  const upload_fields = uploadMixed.fields([
    { name: 'video', maxCount: 1 },
    { name: 'resource', maxCount: 1 }
  ]);
  
  upload_fields(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message });
    }
    
    try {
      const { course_id, title, description, order_index, lecture_date, resource_name } = req.body;
      if (!course_id || !title) return res.status(400).json({ error: 'course_id and title required' });
      if (!req.files?.video?.[0]) return res.status(400).json({ error: 'Video file required' });

      // Check ownership
      if (req.session.user.role === 'teacher') {
        const owns = await get('SELECT 1 FROM courses WHERE id=? AND teacher_id=?', [course_id, req.session.user.id]);
        if (!owns) return res.status(403).json({ error: 'Forbidden' });
      }

      await run('BEGIN');
      
      const video_url = `/media/${req.files.video[0].filename}`;
      const lectureResult = await run(
        'INSERT INTO lectures (course_id, title, description, video_url, order_index, lecture_date) VALUES (?,?,?,?,?,?)',
        [course_id, title, description || '', video_url, Number.isFinite(+order_index) ? +order_index : 0, lecture_date || null]
      );
      
      const lectureId = lectureResult.lastID;
      
      // Add resource if provided
      if (req.files && req.files.resource && req.files.resource[0]) {
        const resource_url = `/media/${req.files.resource[0].filename}`;
        const resourceName = resource_name || req.files.resource[0].originalname;
        await run(
          'INSERT INTO lecture_resources (lecture_id, name, file_url) VALUES (?,?,?)',
          [lectureId, resourceName, resource_url]
        );
      }
      
      await run('COMMIT');
      res.json({ ok: true, id: lectureId, video_url });
    } catch (dbErr) {
      await run('ROLLBACK').catch(() => {});
      console.error('Database error:', dbErr);
      res.status(500).json({ error: 'Database error' });
    }
  });
});

// NEW: Create grand quiz
app.post('/api/courses/:id/grand-quiz', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const courseId = req.params.id;
    const { title, description, questions, order_index } = req.body;
    
    if (!title || !Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ error: 'title and questions array required' });
    }
    
    if (req.session.user.role === 'teacher') {
      const owns = await get('SELECT 1 FROM courses WHERE id=? AND teacher_id=?', [courseId, req.session.user.id]);
      if (!owns) return res.status(403).json({ error: 'Forbidden' });
    }

    const content_json = JSON.stringify(questions);
    const result = await run(
      'INSERT INTO grand_quizzes (course_id, title, description, content_json, order_index) VALUES (?,?,?,?,?)',
      [courseId, title, description || '', content_json, Number.isFinite(+order_index) ? +order_index : 0]
    );
    
    res.json({ ok: true, id: result.lastID });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: Create grand assignment
app.post('/api/courses/:id/grand-assignment', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const courseId = req.params.id;
    const { title, description, file_url, order_index } = req.body;
    
    if (!title) return res.status(400).json({ error: 'title required' });
    
    if (req.session.user.role === 'teacher') {
      const owns = await get('SELECT 1 FROM courses WHERE id=? AND teacher_id=?', [courseId, req.session.user.id]);
      if (!owns) return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await run(
      'INSERT INTO grand_assignments (course_id, title, description, file_url, order_index) VALUES (?,?,?,?,?)',
      [courseId, title, description || '', file_url || null, Number.isFinite(+order_index) ? +order_index : 0]
    );
    
    res.json({ ok: true, id: result.lastID });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: Upload grand assignment file
app.post('/api/courses/:id/grand-assignment/upload', requireRole('teacher', 'admin'), uploadAny.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required' });
    const file_url = `/media/${req.file.filename}`;
    res.json({ ok: true, file_url });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: Reorder course content (lectures, grand quizzes, grand assignments)
app.put('/api/courses/:id/reorder-content', requireRole('teacher'), async (req, res) => {
  try {
    const courseId = req.params.id;
    const { items } = req.body; // Array of {type: 'lecture|grand_quiz|grand_assignment', id: number, order: number}
    
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'items array required' });
    }
    
    if (req.session.user.role === 'teacher') {
      const owns = await get('SELECT 1 FROM courses WHERE id=? AND teacher_id=?', [courseId, req.session.user.id]);
      if (!owns) return res.status(403).json({ error: 'Forbidden' });
    }

    await run('BEGIN');
    
    for (const item of items) {
      if (item.type === 'lecture') {
        await run('UPDATE lectures SET order_index=? WHERE id=? AND course_id=?', [item.order, item.id, courseId]);
      } else if (item.type === 'grand_quiz') {
        await run('UPDATE grand_quizzes SET order_index=? WHERE id=? AND course_id=?', [item.order, item.id, courseId]);
      } else if (item.type === 'grand_assignment') {
        await run('UPDATE grand_assignments SET order_index=? WHERE id=? AND course_id=?', [item.order, item.id, courseId]);
      }
    }
    
    await run('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await run('ROLLBACK').catch(() => {});
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: Submit grand quiz
app.post('/api/grand-quizzes/:id/submit', requireRole('student'), async (req, res) => {
  try {
    const quizId = req.params.id;
    const { answers } = req.body;
    
    if (!answers) return res.status(400).json({ error: 'answers required' });
    
    const answers_json = JSON.stringify(answers);
    await run(
      'INSERT OR REPLACE INTO grand_quiz_submissions (quiz_id, student_id, answers_json) VALUES (?,?,?)',
      [quizId, req.session.user.id, answers_json]
    );
    
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: Submit grand assignment
app.post('/api/grand-assignments/:id/submit', requireRole('student'), uploadAny.single('file'), async (req, res) => {
  try {
    const assignmentId = req.params.id;
    if (!req.file) return res.status(400).json({ error: 'File required' });
    
    const file_url = `/media/${req.file.filename}`;
    await run(
      'INSERT OR REPLACE INTO grand_assignment_submissions (assignment_id, student_id, file_url) VALUES (?,?,?)',
      [assignmentId, req.session.user.id, file_url]
    );
    
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update course details endpoint to work for all user types
app.get('/api/courses/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const user = req.session.user;
    
    const course = await get(
      `SELECT c.*, u.name AS teacher_name
       FROM courses c
       JOIN users u ON u.id = c.teacher_id
       WHERE c.id = ?`,
      [id]
    );
    if (!course) return res.status(404).json({ error: 'Not found' });

    // Check access permissions
    if (user.role === 'student') {
      const enrolled = await get(
        'SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?',
        [user.id, id]
      );
      if (!enrolled) return res.status(403).json({ error: 'Not enrolled in this course' });
    }

    // Get all course content
    const lectures = await all(
      `SELECT l.*, 
        (SELECT COUNT(*) FROM lecture_resources WHERE lecture_id = l.id) as resource_count,
        (SELECT COUNT(*) FROM lecture_quizzes WHERE lecture_id = l.id) as quiz_count,
        (SELECT COUNT(*) FROM lecture_assignments WHERE lecture_id = l.id) as assignment_count
       FROM lectures l 
       WHERE l.course_id = ? 
       ORDER BY l.order_index ASC, l.created_at ASC`,
      [id]
    );

    const grandQuizzes = await all(
      'SELECT * FROM grand_quizzes WHERE course_id = ? ORDER BY order_index ASC, created_at ASC',
      [id]
    );

    const grandAssignments = await all(
      'SELECT * FROM grand_assignments WHERE course_id = ? ORDER BY order_index ASC, created_at ASC',
      [id]
    );

    // Combine all content for sequential ordering
    const allContent = [
      ...lectures.map(l => ({ ...l, type: 'lecture' })),
      ...grandQuizzes.map(q => ({ ...q, type: 'grand_quiz' })),
      ...grandAssignments.map(a => ({ ...a, type: 'grand_assignment' }))
    ].sort((a, b) => a.order_index - b.order_index);

    // For students, add progress information and sequential locking
    if (user.role === 'student') {
      // Get progress for lectures
      const lectureProgress = await all(
        `SELECT lecture_id as item_id, completed, completion_percentage FROM student_progress WHERE user_id = ?`,
        [user.id]
      );
      
      // Get progress for grand quizzes
      const quizSubmissions = await all(
        `SELECT quiz_id as item_id FROM grand_quiz_submissions WHERE student_id = ?`,
        [user.id]
      );
      
      // Get progress for grand assignments
      const assignmentSubmissions = await all(
        `SELECT assignment_id as item_id FROM grand_assignment_submissions WHERE student_id = ?`,
        [user.id]
      );
      
      const progressMap = {};
      lectureProgress.forEach(p => {
        progressMap[`lecture_${p.item_id}`] = { completed: p.completed, percentage: p.completion_percentage };
      });
      quizSubmissions.forEach(q => {
        progressMap[`grand_quiz_${q.item_id}`] = { completed: 1, percentage: 100 };
      });
      assignmentSubmissions.forEach(a => {
        progressMap[`grand_assignment_${a.item_id}`] = { completed: 1, percentage: 100 };
      });
      
      // Add progress and lock status
      allContent.forEach((item, index) => {
        const progressKey = `${item.type}_${item.id}`;
        item.progress = progressMap[progressKey] || { completed: 0, percentage: 0 };
        
        // First item is always unlocked
        if (index === 0) {
          item.is_locked = false;
        } else {
          // Subsequent items are locked until previous is completed
          const prevItem = allContent[index - 1];
          const prevProgressKey = `${prevItem.type}_${prevItem.id}`;
          const prevProgress = progressMap[prevProgressKey];
          item.is_locked = !(prevProgress && prevProgress.completed);
        }
      });
    }

    // Get resources for admin/teacher view
    if (user.role === 'admin' || user.role === 'teacher') {
      const lectureIds = lectures.map(l => l.id);
      let resources = [];
      if (lectureIds.length) {
        const placeholders = lectureIds.map(() => '?').join(',');
        resources = await all(
          `SELECT * FROM lecture_resources WHERE lecture_id IN (${placeholders}) ORDER BY created_at ASC`,
          lectureIds
        );
      }
      const resMap = {};
      resources.forEach(r => {
        resMap[r.lecture_id] = resMap[r.lecture_id] || [];
        resMap[r.lecture_id].push(r);
      });
      lectures.forEach(l => (l.resources = resMap[l.id] || []));
    }

    const courseOut = { 
      ...course, 
      lecture_count: lectures.length,
      grand_quiz_count: grandQuizzes.length,
      grand_assignment_count: grandAssignments.length,
      total_content_count: allContent.length
    };
    
    res.json({ 
      course: courseOut, 
      lectures, 
      grandQuizzes, 
      grandAssignments,
      allContent
    });
  } catch (error) {
    console.error('Course fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: Get individual lecture details
app.get('/api/lectures/:id', requireAuth, async (req, res) => {
  try {
    const lectureId = req.params.id;
    const user = req.session.user;
    
    // Get lecture with course info
    const lecture = await get(
      `SELECT l.*, c.id as course_id, c.title as course_title, c.teacher_id
       FROM lectures l
       JOIN courses c ON c.id = l.course_id
       WHERE l.id = ?`,
      [lectureId]
    );
    
    if (!lecture) return res.status(404).json({ error: 'Lecture not found' });
    
    // Check access permissions
    if (user.role === 'student') {
      const enrolled = await get(
        'SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?',
        [user.id, lecture.course_id]
      );
      if (!enrolled) return res.status(403).json({ error: 'Not enrolled in this course' });
      
      // Check if lecture is unlocked
      const progress = await all(
        `SELECT lecture_id, completed FROM student_progress WHERE user_id = ?`,
        [user.id]
      );
      const progressMap = {};
      progress.forEach(p => {
        progressMap[p.lecture_id] = p.completed;
      });
      
      // Get all lectures in order to check sequential access
      const allLectures = await all(
        `SELECT id FROM lectures WHERE course_id = ? ORDER BY order_index ASC, created_at ASC`,
        [lecture.course_id]
      );
      
      const lectureIndex = allLectures.findIndex(l => l.id == lectureId);
      if (lectureIndex > 0) {
        // Check if previous lecture is completed
        const prevLecture = allLectures[lectureIndex - 1];
        if (!progressMap[prevLecture.id]) {
          return res.status(403).json({ error: 'Previous lecture must be completed first' });
        }
      }
    } else if (user.role === 'teacher' && user.id !== lecture.teacher_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({ lecture });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: Get lecture resources
app.get('/api/lectures/:id/resources', requireAuth, async (req, res) => {
  try {
    const lectureId = req.params.id;
    const user = req.session.user;
    
    // Verify access to lecture first
    const lecture = await get(
      `SELECT l.*, c.teacher_id, c.id as course_id
       FROM lectures l
       JOIN courses c ON c.id = l.course_id
       WHERE l.id = ?`,
      [lectureId]
    );
    
    if (!lecture) return res.status(404).json({ error: 'Lecture not found' });
    
    // Check permissions
    if (user.role === 'student') {
      const enrolled = await get(
        'SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?',
        [user.id, lecture.course_id]
      );
      if (!enrolled) return res.status(403).json({ error: 'Not enrolled' });
    } else if (user.role === 'teacher' && user.id !== lecture.teacher_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const resources = await all(
      'SELECT * FROM lecture_resources WHERE lecture_id = ? ORDER BY created_at ASC',
      [lectureId]
    );
    
    res.json({ resources });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: Get lecture quiz
app.get('/api/lectures/:id/quiz', requireAuth, async (req, res) => {
  try {
    const lectureId = req.params.id;
    const user = req.session.user;
    
    // Verify access to lecture
    const lecture = await get(
      `SELECT l.*, c.teacher_id, c.id as course_id
       FROM lectures l
       JOIN courses c ON c.id = l.course_id
       WHERE l.id = ?`,
      [lectureId]
    );
    
    if (!lecture) return res.status(404).json({ error: 'Lecture not found' });
    
    // Check permissions
    if (user.role === 'student') {
      const enrolled = await get(
        'SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?',
        [user.id, lecture.course_id]
      );
      if (!enrolled) return res.status(403).json({ error: 'Not enrolled' });
    } else if (user.role === 'teacher' && user.id !== lecture.teacher_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const quiz = await get(
      'SELECT * FROM lecture_quizzes WHERE lecture_id = ?',
      [lectureId]
    );
    
    if (!quiz) {
      return res.json({ quiz: null });
    }
    
    // If it's a live quiz, get questions and options
    if (quiz.is_live) {
      const questions = await all(
        'SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC',
        [quiz.id]
      );
      
      for (let question of questions) {
        question.options = await all(
          'SELECT * FROM quiz_answer_options WHERE question_id = ? ORDER BY order_index ASC',
          [question.id]
        );
      }
      
      quiz.questions = questions;
    }
    
    res.json({ quiz });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: Get lecture assignment
app.get('/api/lectures/:id/assignment', requireAuth, async (req, res) => {
  try {
    const lectureId = req.params.id;
    const user = req.session.user;
    
    // Verify access to lecture
    const lecture = await get(
      `SELECT l.*, c.teacher_id, c.id as course_id
       FROM lectures l
       JOIN courses c ON c.id = l.course_id
       WHERE l.id = ?`,
      [lectureId]
    );
    
    if (!lecture) return res.status(404).json({ error: 'Lecture not found' });
    
    // Check permissions
    if (user.role === 'student') {
      const enrolled = await get(
        'SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?',
        [user.id, lecture.course_id]
      );
      if (!enrolled) return res.status(403).json({ error: 'Not enrolled' });
    } else if (user.role === 'teacher' && user.id !== lecture.teacher_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const assignment = await get(
      'SELECT * FROM lecture_assignments WHERE lecture_id = ?',
      [lectureId]
    );
    
    res.json({ assignment });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: Delete a lecture
app.delete('/api/lectures/:id', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const lectureId = req.params.id;
    
    // Check ownership for teachers
    if (req.session.user.role === 'teacher') {
      const owns = await get(
        `SELECT 1 FROM lectures l 
         JOIN courses c ON c.id = l.course_id 
         WHERE l.id = ? AND c.teacher_id = ?`,
        [lectureId, req.session.user.id]
      );
      if (!owns) return res.status(403).json({ error: 'Forbidden' });
    }

    // Get lecture details for cleanup
    const lecture = await get('SELECT video_url FROM lectures WHERE id = ?', [lectureId]);
    
    // Delete from database (cascade will handle related resources)
    await run('DELETE FROM lectures WHERE id = ?', [lectureId]);
    
    // Optional: Clean up video file from filesystem
    if (lecture && lecture.video_url && lecture.video_url.startsWith('/media/')) {
      const filePath = path.join(MEDIA_DIR, lecture.video_url.replace('/media/', ''));
      fs.unlink(filePath, () => {}); // Silent cleanup
    }
    
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: Update lecture details
app.put('/api/lectures/:id', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const lectureId = req.params.id;
    const { title, description, lecture_date } = req.body;
    
    if (!title && !description && !lecture_date) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    // Check ownership for teachers
    if (req.session.user.role === 'teacher') {
      const owns = await get(
        `SELECT 1 FROM lectures l 
         JOIN courses c ON c.id = l.course_id 
         WHERE l.id = ? AND c.teacher_id = ?`,
        [lectureId, req.session.user.id]
      );
      if (!owns) return res.status(403).json({ error: 'Forbidden' });
    }

    const current = await get('SELECT * FROM lectures WHERE id = ?', [lectureId]);
    if (!current) return res.status(404).json({ error: 'Lecture not found' });

    const newTitle = title ?? current.title;
    const newDesc = description ?? current.description;
    const newDate = lecture_date ?? current.lecture_date;

    await run(
      'UPDATE lectures SET title = ?, description = ?, lecture_date = ? WHERE id = ?',
      [newTitle, newDesc, newDate, lectureId]
    );

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add endpoints for grand content management
app.delete('/api/grand-quizzes/:id', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const quizId = req.params.id;
    
    if (req.session.user.role === 'teacher') {
      const owns = await get(
        `SELECT 1 FROM grand_quizzes gq 
         JOIN courses c ON c.id = gq.course_id 
         WHERE gq.id = ? AND c.teacher_id = ?`,
        [quizId, req.session.user.id]
      );
      if (!owns) return res.status(403).json({ error: 'Forbidden' });
    }

    await run('DELETE FROM grand_quizzes WHERE id = ?', [quizId]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Fix lecture assignment creation endpoint
app.post('/api/lectures/:id/assignment', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const lectureId = req.params.id;
    const { title, description, file_url } = req.body;
    console.log(`Creating assignment for lecture ${lectureId}:`, { title, description, file_url });
    
    if (!title) return res.status(400).json({ error: 'title required' });
    
    if (req.session.user.role === 'teacher') {
      const owns = await get(
        `SELECT 1 FROM lectures l JOIN courses c ON c.id = l.course_id WHERE l.id = ? AND c.teacher_id = ?`,
        [lectureId, req.session.user.id]
      );
      if (!owns) return res.status(403).json({ error: 'Forbidden' });
    }
    
    const result = await run(
      'INSERT INTO lecture_assignments (lecture_id, title, description, file_url) VALUES (?,?,?,?)',
      [lectureId, title, description || '', file_url || null]
    );
    
    console.log('Assignment created successfully with ID:', result.lastID);
    res.json({ ok: true, id: result.lastID });
  } catch (error) {
    console.error('Assignment creation error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Update lecture quiz creation to use the same structure as grand quizzes
app.post('/api/lectures/:id/quiz', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const lectureId = req.params.id;
    const { title, content_json } = req.body;
    if (!title || !content_json) return res.status(400).json({ error: 'title and content_json required' });
    
    if (req.session.user.role === 'teacher') {
      const owns = await get(
        `SELECT 1 FROM lectures l JOIN courses c ON c.id = l.course_id WHERE l.id = ? AND c.teacher_id = ?`,
        [lectureId, req.session.user.id]
      );
      if (!owns) return res.status(403).json({ error: 'Forbidden' });
    }
    
    const exists = await get('SELECT id FROM lecture_quizzes WHERE lecture_id=?', [lectureId]);
    if (exists) {
      await run('UPDATE lecture_quizzes SET title=?, content_json=? WHERE lecture_id=?', [title, content_json, lectureId]);
      res.json({ ok: true, id: exists.id });
    } else {
      const result = await run(
        'INSERT INTO lecture_quizzes (lecture_id, title, content_json) VALUES (?,?,?)', 
        [lectureId, title, content_json]
      );
      res.json({ ok: true, id: result.lastID });
    }
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a course
app.put('/api/courses/:id', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const { title, description, projected_hours, total_lectures, price, payment_type, monthly_payment_month, is_free } = req.body;
    if (!(title || description !== undefined || projected_hours !== undefined || total_lectures !== undefined || 
          price !== undefined || payment_type !== undefined || monthly_payment_month !== undefined || is_free !== undefined)) {
      return res.status(400).json({ error: 'Nothing to update' });
    }
    
    // ownership for teachers
    if (req.session.user.role === 'teacher') {
      const owns = await get('SELECT 1 FROM courses WHERE id=? AND teacher_id=?', [id, req.session.user.id]);
      if (!owns) return res.status(403).json({ error: 'Forbidden' });
    }
    
    const current = await get('SELECT * FROM courses WHERE id=?', [id]);
    if (!current) return res.status(404).json({ error: 'Not found' });

    const newTitle = title ?? current.title;
    const newDesc = description !== undefined ? description : current.description;
    const newHours = projected_hours !== undefined ? (projected_hours !== null ? Number(projected_hours) : null) : current.projected_hours;
    const newTotalLectures = total_lectures !== undefined ? (total_lectures !== null ? Number(total_lectures) : null) : current.total_lectures;
    const newPrice = price !== undefined ? Number(price) : (current.price !== undefined ? current.price : 0);
    const newPaymentType = payment_type ?? (current.payment_type || 'one_time');
    const newMonthlyMonth = monthly_payment_month !== undefined ? monthly_payment_month : current.monthly_payment_month;
    const newIsFree = is_free !== undefined ? (is_free ? 1 : 0) : (current.is_free != null ? current.is_free : 1);

    await run(
      'UPDATE courses SET title=?, description=?, projected_hours=?, total_lectures=?, price=?, payment_type=?, monthly_payment_month=?, is_free=? WHERE id=?',
      [
        newTitle,
        newDesc,
        newHours,
        newTotalLectures,
        newPrice,
        newPaymentType,
        newMonthlyMonth,
        newIsFree,
        id
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    // Log detailed error server-side to help debugging, return generic message to client
    // eslint-disable-next-line no-console
    console.error('PUT /api/courses/:id error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Server error' });
  }
});

// NEW: Public listing for centralized course view (authenticated users)
app.get('/api/public-courses', requireAuth, async (req, res) => {
  try {
    const rows = await all(
      `SELECT 
         c.id,
         c.title,
         c.description,
         c.thumbnail_url,
         c.projected_hours,
         c.price,
         c.payment_type,
         c.is_free,
         u.name AS teacher_name,
         (SELECT COUNT(*) FROM lectures l WHERE l.course_id = c.id) AS lecture_count,
         (SELECT COUNT(*) FROM lecture_assignments la WHERE la.lecture_id IN (SELECT id FROM lectures WHERE course_id = c.id)) AS assignment_count,
         (SELECT COUNT(*) FROM lecture_quizzes lq WHERE lq.lecture_id IN (SELECT id FROM lectures WHERE course_id = c.id)) AS quiz_count
       FROM courses c
       JOIN users u ON u.id = c.teacher_id
       ORDER BY c.created_at DESC`
    );
    res.json({ courses: rows });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('GET /api/public-courses error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add API endpoint for creating teachers
app.post('/api/teachers', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, bio, specialization } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    
    const existing = await get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    const hash = await bcrypt.hash(password, 12);
    const result = await run(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
      [name, email.toLowerCase(), hash, 'teacher']
    );
    
    res.json({ ok: true, id: result.lastID });
  } catch (err) {
    console.error('Create teacher error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add API endpoint for getting teachers list
app.get('/api/teachers', requireRole('admin'), async (req, res) => {
  try {
    const teachers = await all(
      `SELECT 
         u.id, u.name, u.email, u.created_at,
         COUNT(DISTINCT c.id) as course_count,
         COUNT(DISTINCT e.user_id) as student_count
       FROM users u
       LEFT JOIN courses c ON c.teacher_id = u.id
       LEFT JOIN enrollments e ON e.course_id = c.id
       WHERE u.role = 'teacher'
       GROUP BY u.id, u.name, u.email, u.created_at
       ORDER BY u.created_at DESC`
    );
    
    res.json({ teachers });
  } catch (err) {
    console.error('Get teachers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add API endpoint for deleting teachers
app.delete('/api/teachers/:id', requireRole('admin'), async (req, res) => {
  try {
    const teacherId = req.params.id;
    
    // Check if teacher exists and is actually a teacher
    const teacher = await get('SELECT id, role FROM users WHERE id = ? AND role = ?', [teacherId, 'teacher']);
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    // Delete teacher (courses will be cascade deleted)
    await run('DELETE FROM users WHERE id = ?', [teacherId]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete teacher error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add API endpoint for admin dashboard stats
app.get('/api/admin/stats', requireRole('admin'), async (req, res) => {
  try {
    const studentCount = await get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['student']);
    const teacherCount = await get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['teacher']);
    const courseCount = await get('SELECT COUNT(*) as count FROM courses');
    const lectureCount = await get('SELECT COUNT(*) as count FROM lectures');
    
    res.json({
      students: studentCount.count,
      teachers: teacherCount.count,
      courses: courseCount.count,
      lectures: lectureCount.count
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add API endpoint for recent users
app.get('/api/admin/recent-users', requireRole('admin'), async (req, res) => {
  try {
    const recentUsers = await all(
      `SELECT name, email, role, created_at 
       FROM users 
       WHERE role IN ('student', 'teacher')
       ORDER BY created_at DESC 
       LIMIT 10`
    );
    
    res.json({ users: recentUsers });
  } catch (err) {
    console.error('Recent users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add API endpoint for teacher dashboard stats
app.get('/api/teacher/stats', requireRole('teacher'), async (req, res) => {
  try {
    const teacherId = req.session.user.id;
    
    const courseCount = await get('SELECT COUNT(*) as count FROM courses WHERE teacher_id = ?', [teacherId]);
    const lectureCount = await get(
      'SELECT COUNT(*) as count FROM lectures l JOIN courses c ON c.id = l.course_id WHERE c.teacher_id = ?', 
      [teacherId]
    );
    const studentCount = await get(
      'SELECT COUNT(DISTINCT e.user_id) as count FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.teacher_id = ?', 
      [teacherId]
    );
    
    res.json({
      courses: courseCount.count,
      lectures: lectureCount.count,
      students: studentCount.count,
      rating: 4.8 // Placeholder for now
    });
  } catch (err) {
    console.error('Teacher stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Bootstrap DB and seed admin, then start server
(async () => {
  await migrate();

  // Ensure new columns exist (safe ALTERs)
  try { await run('ALTER TABLE courses ADD COLUMN thumbnail_url TEXT'); } catch (e) {}
  try { await run('ALTER TABLE courses ADD COLUMN total_lectures INTEGER DEFAULT 0'); } catch (e) {}
  try { await run('ALTER TABLE lecture_quizzes ADD COLUMN is_live INTEGER DEFAULT 1'); } catch (e) {}

  // Ensure projected_hours column exists (safe ALTER)
  try { await run('ALTER TABLE courses ADD COLUMN projected_hours REAL'); } catch (e) {}
  // NEW: safe ALTERs for pricing columns
  try { await run('ALTER TABLE courses ADD COLUMN price REAL DEFAULT 0'); } catch (e) {}
  try { await run("ALTER TABLE courses ADD COLUMN payment_type TEXT DEFAULT 'one_time'"); } catch (e) {}
  try { await run('ALTER TABLE courses ADD COLUMN monthly_payment_month TEXT'); } catch (e) {}
  try { await run('ALTER TABLE courses ADD COLUMN is_free INTEGER DEFAULT 1'); } catch (e) {}

  try { await run('ALTER TABLE courses ADD COLUMN launch_date TEXT'); } catch (e) {}
  try { await run('ALTER TABLE courses ADD COLUMN is_published INTEGER DEFAULT 0'); } catch (e) {}
  try { await run('ALTER TABLE lectures ADD COLUMN lecture_date TEXT'); } catch (e) {}
  try { await run('ALTER TABLE lecture_resources ADD COLUMN text_content TEXT'); } catch (e) {}

  // Create new tables for grand content
  try {
    await run(`CREATE TABLE IF NOT EXISTS grand_quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      content_json TEXT,
      is_live INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0,
      is_required INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )`);
  } catch (e) {}

  try {
    await run(`CREATE TABLE IF NOT EXISTS grand_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      file_url TEXT,
      order_index INTEGER DEFAULT 0,
      is_required INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )`);
  } catch (e) {}

  try {
    await run(`CREATE TABLE IF NOT EXISTS grand_quiz_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      answers_json TEXT,
      score REAL DEFAULT 0,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quiz_id) REFERENCES grand_quizzes(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
  } catch (e) {}

  try {
    await run(`CREATE TABLE IF NOT EXISTS grand_assignment_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      file_url TEXT NOT NULL,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assignment_id) REFERENCES grand_assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
  } catch (e) {}

  // Seed admin if not exists (configurable via env)
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const exists = await get('SELECT id FROM users WHERE email = ?', [adminEmail]);
  if (!exists) {
    const hash = await bcrypt.hash(adminPassword, 12);
    await run(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
      ['Admin', adminEmail, hash, 'admin']
    );
    // eslint-disable-next-line no-console
    console.log('Seeded admin account:', adminEmail, 'password:', adminPassword);
  }

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${PORT}`);
  });
})();
