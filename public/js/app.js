// ==================== STATE ====================
let currentUser = null;
let currentSource = 'all';
let currentCategory = 'all';
let currentDays = 7;
let blogs = [];
let jobPollInterval = null;
let customSources = [];
let selectedEmoji = '📰';

// ==================== TOAST NOTIFICATIONS ====================
function showToast(type, title, message, duration = 4000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ'
  };
  
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ'}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  container.appendChild(toast);
  
  // Auto-remove after duration
  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadBlogs();
  loadJobStatus();
});

// ==================== JOB STATUS ====================
async function loadJobStatus() {
  try {
    const res = await fetch('/api/job-status');
    const data = await res.json();
    updateJobStatusUI(data);
  } catch (err) {
    console.error('Failed to load job status:', err);
  }
}

function updateJobStatusUI(data) {
  const badge = document.getElementById('job-badge');
  const message = document.getElementById('job-message');
  const sources = document.getElementById('job-sources');
  const progressBar = document.getElementById('job-progress-bar');
  const progressFill = document.getElementById('job-progress-fill');

  // Update badge
  badge.className = `job-status-badge ${data.status}`;
  badge.textContent = data.status.charAt(0).toUpperCase() + data.status.slice(1);

  // Update message
  message.textContent = data.message || 'No recent activity';

  // Update sources - filter out custom sources that don't belong to the current user
  if (data.sources && Object.keys(data.sources).length > 0) {
    // Built-in source fallback names
    const builtInSources = {
      meta: { name: 'Meta', logo: '🔵' },
      uber: { name: 'Uber', logo: '⚫' },
      cloudflare: { name: 'Cloudflare', logo: '🟠' },
      microsoft: { name: 'Microsoft', logo: '🟦' }
    };
    
    // Get current user's custom source IDs for filtering
    const userCustomSourceIds = new Set(customSources.map(s => s.id));
    
    sources.innerHTML = Object.entries(data.sources)
      .filter(([id, info]) => {
        // Always show built-in sources
        if (builtInSources[id]) return true;
        // Check if this is a custom source (either by flag or by ID prefix)
        const isCustomSource = info.isCustom || id.startsWith('custom_');
        if (isCustomSource) {
          // If not logged in, hide all custom sources
          if (!currentUser) return false;
          // If logged in, only show user's own custom sources
          return userCustomSourceIds.has(id);
        }
        return true;
      })
      .map(([id, info]) => {
        // Use source metadata from job status if available, otherwise fallback
        const sourceName = info.name || builtInSources[id]?.name || id;
        const sourceLogo = info.logo || builtInSources[id]?.logo || '📝';
        return `
          <div class="job-source-item">
            <span class="job-source-name">
              <span>${sourceLogo}</span>
              <span>${sourceName}</span>
            </span>
            <span class="job-source-stats ${info.status === 'completed' ? 'success' : ''}">
              ${info.status === 'completed' ? `✓ ${info.processed}/${info.articles}` : 
                info.status === 'error' ? '✗ Error' : 
                info.status === 'processing' ? `⏳ ${info.processed}/${info.articles}` : 
                '⏳ Fetching...'}
            </span>
          </div>
        `;
      }).join('');
  } else {
    sources.innerHTML = '';
  }

  // Update progress bar
  if (data.status === 'running' && data.totalArticles > 0) {
    progressBar.style.display = 'block';
    const percent = Math.round((data.processedArticles / data.totalArticles) * 100);
    progressFill.style.width = `${percent}%`;
  } else {
    progressBar.style.display = 'none';
  }

  // Auto-poll if running
  if (data.status === 'running') {
    if (!jobPollInterval) {
      jobPollInterval = setInterval(loadJobStatus, 2000);
    }
  } else {
    if (jobPollInterval) {
      clearInterval(jobPollInterval);
      jobPollInterval = null;
      // Reload blogs when job completes
      if (data.status === 'completed') {
        setTimeout(loadBlogs, 1000);
      }
    }
  }
}

// ==================== AUTHENTICATION ====================
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      updateAuthUI();
    }
  } catch (err) {
    console.error('Auth check failed:', err);
  }
}

function updateAuthUI() {
  const authSection = document.getElementById('auth-section');
  if (currentUser) {
    authSection.innerHTML = `
      <div class="user-info">
        <div class="user-avatar">${currentUser.name.charAt(0).toUpperCase()}</div>
        <span>${currentUser.name}</span>
        <button class="auth-btn logout-btn" onclick="handleLogout()">Sign Out</button>
      </div>
    `;
    // Load user's custom sources
    loadUserSources();
  } else {
    authSection.innerHTML = `<button class="auth-btn" onclick="showAuthModal()">Sign In</button>`;
    // Hide custom sources section
    document.getElementById('custom-sources-section').style.display = 'none';
    customSources = [];
    // Re-render source filters without custom sources
    renderSourceFilters();
  }
}

function showAuthModal() {
  document.getElementById('auth-modal').classList.add('active');
}

function closeAuthModal(event) {
  if (!event || event.target === event.currentTarget) {
    document.getElementById('auth-modal').classList.remove('active');
    document.getElementById('login-error').textContent = '';
    document.getElementById('register-error').textContent = '';
  }
}

function showLoginForm() {
  document.getElementById('login-tab').classList.add('active');
  document.getElementById('register-tab').classList.remove('active');
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('register-form').style.display = 'none';
}

function showRegisterForm() {
  document.getElementById('register-tab').classList.add('active');
  document.getElementById('login-tab').classList.remove('active');
  document.getElementById('register-form').style.display = 'block';
  document.getElementById('login-form').style.display = 'none';
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.error) {
      errorEl.textContent = data.error;
    } else {
      currentUser = data.user;
      updateAuthUI();
      closeAuthModal();
    }
  } catch (err) {
    errorEl.textContent = 'Login failed. Please try again.';
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const name = document.getElementById('register-name').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const errorEl = document.getElementById('register-error');
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (data.error) {
      errorEl.textContent = data.error;
    } else {
      currentUser = data.user;
      updateAuthUI();
      closeAuthModal();
    }
  } catch (err) {
    errorEl.textContent = 'Registration failed. Please try again.';
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    updateAuthUI();
  } catch (err) {
    console.error('Logout failed:', err);
  }
}

// ==================== BLOG FUNCTIONS ====================
async function loadBlogs() {
  const container = document.getElementById('blog-container');
  container.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <span>Loading blog summaries...</span>
    </div>
  `;
  try {
    const params = new URLSearchParams({
      source: currentSource,
      category: currentCategory,
      days: currentDays
    });
    const res = await fetch(`/api/blogs?${params}`);
    const data = await res.json();
    blogs = data.blogs || [];
    renderBlogs();
  } catch (err) {
    console.error('Failed to load blogs:', err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❌</div>
        <h3 class="empty-state-title">Failed to load blogs</h3>
        <p>Please try refreshing the page.</p>
      </div>
    `;
  }
}

function renderBlogs() {
  const container = document.getElementById('blog-container');
  const countEl = document.getElementById('blog-count');
  if (blogs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h3 class="empty-state-title">No blog summaries yet</h3>
        <p>Click "Fetch Latest Blogs" to start aggregating tech blog posts.</p>
      </div>
    `;
    countEl.textContent = '0 articles';
    return;
  }
  countEl.textContent = `${blogs.length} article${blogs.length !== 1 ? 's' : ''}`;
  container.innerHTML = `
    <div class="blog-grid">
      ${blogs.map(blog => `
        <article class="blog-card" onclick="openBlogModal('${blog.id}')">
          <div class="blog-card-header">
            <span class="source-badge ${blog.source}">
              <span>${blog.sourceLogo}</span>
              <span>${blog.sourceName}</span>
            </span>
            <span class="category-badge">${blog.category}</span>
          </div>
          <h3 class="blog-card-title">${escapeHtml(blog.title)}</h3>
          <p class="blog-card-summary">${escapeHtml(getSummaryText(blog.summary))}</p>
          ${blog.technologies && blog.technologies.length > 0 ? `
            <div class="blog-card-tech">
              ${blog.technologies.slice(0, 4).map(tech => `<span class="tech-label">${escapeHtml(tech)}</span>`).join('')}
              ${blog.technologies.length > 4 ? `<span class="tech-label tech-more">+${blog.technologies.length - 4}</span>` : ''}
            </div>
          ` : ''}
          <div class="blog-card-footer">
            <span>${formatDate(blog.fetchedAt)}</span>
            <span class="read-more">Read summary →</span>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

async function openBlogModal(blogId) {
  const modal = document.getElementById('blog-modal');
  try {
    const res = await fetch(`/api/blogs/${blogId}`);
    const data = await res.json();
    if (data.error) {
      alert('Failed to load blog details');
      return;
    }
    const blog = data.blog;
    document.getElementById('modal-title').textContent = blog.title;
    document.getElementById('modal-meta').innerHTML = `
      <span class="source-badge ${blog.source}">
        <span>${blog.sourceLogo}</span>
        <span>${blog.sourceName}</span>
      </span>
      <span class="category-badge">${blog.category}</span>
      <span style="color: var(--text-muted); font-size: 0.85rem;">${formatDate(blog.fetchedAt)}</span>
    `;
    document.getElementById('modal-summary').textContent = getSummaryText(blog.fullSummary || blog.summary);
    const keyPointsList = document.getElementById('modal-key-points');
    keyPointsList.innerHTML = (blog.keyPoints || []).map(point => 
      `<li>${escapeHtml(point)}</li>`
    ).join('');
    const techSection = document.getElementById('modal-tech-section');
    const techTags = document.getElementById('modal-technologies');
    if (blog.technologies && blog.technologies.length > 0) {
      techSection.style.display = 'block';
      techTags.innerHTML = blog.technologies.map(tech => 
        `<span class="tech-tag">${escapeHtml(tech)}</span>`
      ).join('');
    } else {
      techSection.style.display = 'none';
    }
    document.getElementById('modal-link').href = blog.url;
    modal.classList.add('active');
  } catch (err) {
    console.error('Failed to load blog details:', err);
    alert('Failed to load blog details');
  }
}

function closeBlogModal(event) {
  if (!event || event.target === event.currentTarget) {
    document.getElementById('blog-modal').classList.remove('active');
  }
}

async function refreshBlogs() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.classList.add('loading');
  btn.innerHTML = '<span class="refresh-icon">🔄</span><span>Starting...</span>';

  try {
    const res = await fetch('/api/refresh', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      btn.innerHTML = '<span class="refresh-icon">🔄</span><span>Fetching...</span>';
      // Start polling job status
      setTimeout(loadJobStatus, 500);
    }
  } catch (err) {
    console.error('Refresh failed:', err);
    alert('Failed to start blog refresh');
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.innerHTML = '<span class="refresh-icon">🔄</span><span>Fetch Latest Blogs</span>';
  }

  // Re-enable button after delay
  setTimeout(() => {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.innerHTML = '<span class="refresh-icon">🔄</span><span>Fetch Latest Blogs</span>';
  }, 5000);
}

async function clearCache() {
  if (!confirm('Are you sure you want to clear all cached blog summaries? You will need to fetch blogs again.')) {
    return;
  }
  
  const btn = document.getElementById('clear-cache-btn');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span><span>Clearing...</span>';

  try {
    const res = await fetch('/api/clear-cache', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      blogs = [];
      renderBlogs();
      alert('Cache cleared successfully! Click "Fetch Latest Blogs" to fetch new summaries.');
    } else {
      alert('Failed to clear cache: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Clear cache failed:', err);
    alert('Failed to clear cache');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🗑️</span><span>Clear Cache</span>';
  }
}

// ==================== FILTERS ====================
function setSourceFilter(source) {
  currentSource = source;
  document.querySelectorAll('#source-filters .filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.source === source);
  });
  loadBlogs();
}

function setCategoryFilter(category) {
  currentCategory = category;
  document.querySelectorAll('#category-filters .filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });
  loadBlogs();
}

function setDaysFilter(days) {
  currentDays = parseInt(days);
  loadBlogs();
}

// ==================== UTILITIES ====================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper to extract summary text from potentially malformed data
function getSummaryText(summary) {
  if (!summary) return 'No summary available';
  // If summary looks like JSON, try to extract brief
  if (typeof summary === 'string' && summary.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(summary);
      return parsed.brief || parsed.detailed || summary;
    } catch (e) {
      // Try to extract brief with regex
      const match = summary.match(/"brief"\s*:\s*"([^"]+)"/);
      if (match) return match[1];
    }
  }
  return summary;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ==================== KEYBOARD SHORTCUTS ====================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeBlogModal();
    closeAuthModal();
    hideAddSourceForm();
  }
});

// ==================== CUSTOM SOURCES ====================
async function loadUserSources() {
  if (!currentUser) {
    document.getElementById('custom-sources-section').style.display = 'none';
    return;
  }

  try {
    const res = await fetch('/api/user/sources');
    const data = await res.json();
    if (data.sources) {
      customSources = data.sources;
      renderCustomSources();
      document.getElementById('custom-sources-section').style.display = 'block';
    }
  } catch (err) {
    console.error('Failed to load user sources:', err);
  }
}

function renderCustomSources() {
  const container = document.getElementById('custom-sources-list');
  if (customSources.length === 0) {
    container.innerHTML = '<p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">No custom sources yet</p>';
  } else {
    container.innerHTML = customSources.map(source => `
      <div class="custom-source-item">
        <div class="custom-source-info">
          <span>${source.logo}</span>
          <span class="custom-source-name" title="${escapeHtml(source.name)}">${escapeHtml(source.name)}</span>
        </div>
        <button class="custom-source-delete" onclick="deleteCustomSource('${source.id}')" title="Remove source">✕</button>
      </div>
    `).join('');
  }
  
  // Also update the Sources filter list with custom sources
  renderSourceFilters();
}

function renderSourceFilters() {
  const container = document.getElementById('source-filters');
  
  // Built-in sources
  const builtInSources = [
    { id: 'all', name: 'All Sources', icon: '📚' },
    { id: 'meta', name: 'Meta Engineering', icon: '🔵' },
    { id: 'uber', name: 'Uber Engineering', icon: '⚫' },
    { id: 'cloudflare', name: 'Cloudflare Engineering', icon: '🟠' },
    { id: 'microsoft', name: 'Microsoft DevBlogs', icon: '🟦' }
  ];
  
  // Combine built-in and custom sources
  const allSources = [...builtInSources];
  customSources.forEach(source => {
    allSources.push({ id: source.id, name: source.name, icon: source.logo });
  });
  
  container.innerHTML = allSources.map(source => `
    <button class="filter-btn ${currentSource === source.id ? 'active' : ''}" data-source="${source.id}" onclick="setSourceFilter('${source.id}')">
      <span class="filter-icon">${source.icon}</span>
      <span>${escapeHtml(source.name)}</span>
    </button>
  `).join('');
}

function showAddSourceForm() {
  document.getElementById('add-source-form').style.display = 'block';
  document.getElementById('add-source-btn').style.display = 'none';
  document.getElementById('source-name').focus();
}

function hideAddSourceForm() {
  document.getElementById('add-source-form').style.display = 'none';
  document.getElementById('add-source-btn').style.display = 'flex';
  // Reset form
  document.getElementById('source-name').value = '';
  document.getElementById('source-url').value = '';
  selectedEmoji = '📰';
  document.querySelectorAll('.emoji-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.emoji === '📰');
  });
}

// Emoji picker
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('emoji-option')) {
    selectedEmoji = e.target.dataset.emoji;
    document.querySelectorAll('.emoji-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.emoji === selectedEmoji);
    });
  }
});

async function submitAddSource() {
  const name = document.getElementById('source-name').value.trim();
  const url = document.getElementById('source-url').value.trim();

  if (!name || !url) {
    showToast('error', 'Missing Fields', 'Please enter both name and URL');
    return;
  }

  try {
    const res = await fetch('/api/user/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, logo: selectedEmoji })
    });

    const data = await res.json();
    if (data.error) {
      showToast('error', 'Failed to Add', data.error);
      return;
    }

    customSources.push(data.source);
    renderCustomSources();
    hideAddSourceForm();
    showToast('success', 'Source Added', `"${name}" has been added to your sources`);
  } catch (err) {
    console.error('Failed to add source:', err);
    showToast('error', 'Error', 'Failed to add source. Please try again.');
  }
}

async function deleteCustomSource(sourceId) {
  if (!confirm('Remove this source?')) return;

  try {
    const res = await fetch(`/api/user/sources/${sourceId}`, { method: 'DELETE' });
    const data = await res.json();
    
    if (data.success) {
      const deletedSource = customSources.find(s => s.id === sourceId);
      customSources = customSources.filter(s => s.id !== sourceId);
      renderCustomSources();
      showToast('success', 'Source Removed', deletedSource ? `"${deletedSource.name}" has been removed` : 'Source removed successfully');
    } else {
      showToast('error', 'Failed to Remove', data.error || 'Failed to delete source');
    }
  } catch (err) {
    console.error('Failed to delete source:', err);
    showToast('error', 'Error', 'Failed to delete source. Please try again.');
  }
}
