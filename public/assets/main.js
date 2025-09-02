(function () {
  const $ = sel => document.querySelector(sel);

  const THEME_KEY = 'theme';
  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = $('#theme-toggle');
    if (btn) btn.textContent = theme === 'light' ? '🌞' : '🌙';
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
    const next = current === 'light' ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  function linkEl({ label, href, onClick, isButton }) {
    if (isButton || onClick) {
      const b = document.createElement('button');
      b.className = 'linklike';
      b.textContent = label;
      if (onClick) b.addEventListener('click', onClick);
      return b;
    }
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    return a;
  }

  function buildLinks(user) {
    const links = [{ label: 'Home', href: '/' }];
    if (user) {
      // Only admins/teachers can see courses for now
      if (user.role === 'teacher' || user.role === 'admin') {
        links.push({ label: 'Courses', href: '/courses' });
        links.push({ label: 'Create Course', href: '/create-course' });
      }
      if (user.role === 'admin') {
        links.push({ label: 'Create Admin', href: '/admin/create-admin' });
      }
      links.push({ label: 'Dashboard', href: '/dashboard' });
      links.push({
        label: 'Logout',
        isButton: true,
        onClick: async () => { await api('/api/logout', { method: 'POST' }); location.href = '/'; }
      });
    } else {
      // Guests: no Courses link
      links.push({ label: 'Login', href: '/login' });
      links.push({ label: 'Register', href: '/register' });
    }
    return links;
  }

  function renderTopNav(links) {
    const nav = $('#nav-links');
    if (!nav) return;
    nav.innerHTML = '';
    links.forEach(cfg => nav.appendChild(linkEl(cfg)));
  }

  function renderSidebar(links) {
    const wrap = $('#sidebar-links');
    if (!wrap) return;
    wrap.innerHTML = '';
    links.forEach(cfg => wrap.appendChild(linkEl(cfg)));
  }

  function openSidebar() {
    $('#sidebar')?.classList.add('open');
    $('#overlay')?.classList.add('show');
  }
  function closeSidebar() {
    $('#sidebar')?.classList.remove('open');
    $('#overlay')?.classList.remove('show');
  }

  async function updateNavigation() {
    const user = await currentUser();
    const navLinks = document.getElementById('nav-links');
    const sidebarLinks = document.getElementById('sidebar-links');

    if (!user) {
      const guestNav = `
        <a href="/login">Login</a>
        <a href="/register">Register</a>
      `;
      if (navLinks) navLinks.innerHTML = guestNav;
      if (sidebarLinks) sidebarLinks.innerHTML = guestNav;
      return;
    }

    let navigation = '';
    
    // Role-specific navigation
    if (user.role === 'teacher') {
      navigation = `
        <a href="/">Home</a>
        <a href="/teacher/dashboard">Dashboard</a>
        <a href="/create-course">Create Course</a>
        <button onclick="logout()">Logout</button>
      `;
    } else if (user.role === 'admin') {
      navigation = `
        <a href="/">Home</a>
        <a href="/admin/dashboard">Dashboard</a>
        <a href="/admin/create-teacher">Create Teacher</a>
        <a href="/courses">View Courses</a>
        <button onclick="logout()">Logout</button>
      `;
    } else if (user.role === 'student') {
      navigation = `
        <a href="/">Home</a>
        <a href="/student/dashboard">Dashboard</a>
        <a href="/courses">Course View</a>
        <button onclick="logout()">Logout</button>
      `;
    }

    if (navLinks) navLinks.innerHTML = navigation;
    if (sidebarLinks) sidebarLinks.innerHTML = navigation;
  }

  // Fix logout function
  window.logout = async () => {
    try {
      await api('/api/logout', { method: 'POST' });
      location.href = '/login';
    } catch (e) {
      console.error('Logout error:', e);
      // Force redirect even if API call fails
      location.href = '/login';
    }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    // Theme
    applyTheme(getPreferredTheme());
    $('#theme-toggle')?.addEventListener('click', toggleTheme);

    // Build navs
    const user = await currentUser();
    const links = buildLinks(user);
    renderTopNav(links);
    renderSidebar(links);
    updateNavigation();

    // Mobile menu
    $('#menu-toggle')?.addEventListener('click', openSidebar);
    $('#sidebar-close')?.addEventListener('click', closeSidebar);
    $('#overlay')?.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSidebar();
    });
  });
})();
