// Shared utilities for Ollama Assistant Dashboard

// Toast notifications
class ToastManager {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    if (document.getElementById('toast-container')) return;

    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  }

  show(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
    };

    toast.innerHTML = `
      <div style="flex-shrink: 0; width: 20px; height: 20px;">${icons[type] || icons.info}</div>
      <span style="flex: 1;">${message}</span>
    `;

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  success(message) {
    this.show(message, 'success');
  }

  error(message) {
    this.show(message, 'error');
  }

  warning(message) {
    this.show(message, 'warning');
  }

  info(message) {
    this.show(message, 'info');
  }
}

export const toast = new ToastManager();

// Format utilities
export const format = {
  date: (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  },

  datetime: (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  relativeTime: (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return format.date(dateString);
  },

  uptime: (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  },

  number: (num) => {
    return new Intl.NumberFormat().format(num);
  },

  percent: (value, decimals = 1) => {
    return `${(value * 100).toFixed(decimals)}%`;
  }
};

// Active navigation highlighting
export function setActiveNav() {
  const path = window.location.pathname;
  const navLinks = document.querySelectorAll('.sidebar-nav a');

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (path === href || (path.startsWith(href) && href !== '/')) {
      link.classList.add('active');
    } else if (path === '/' && href === '/') {
      link.classList.add('active');
    }
  });
}

// Modal utilities
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

export function initModals() {
  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(modal => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      });
    }
  });
}

// Loading state
export function setLoading(element, loading) {
  if (loading) {
    element.classList.add('loading');
    element.dataset.originalContent = element.innerHTML;
    element.innerHTML = '<div class="spinner"></div>';
    element.disabled = true;
  } else {
    element.classList.remove('loading');
    element.innerHTML = element.dataset.originalContent || '';
    element.disabled = false;
  }
}

// Create loading spinner
export function createSpinner(size = 'md') {
  const sizes = { sm: 20, md: 40, lg: 60 };
  const spinner = document.createElement('div');
  spinner.className = 'loading';
  spinner.innerHTML = `<div class="spinner" style="width: ${sizes[size]}px; height: ${sizes[size]}px;"></div>`;
  return spinner;
}

// Status badge class
export function getStatusClass(status) {
  const classes = {
    active: 'badge-success',
    online: 'badge-success',
    running: 'badge-info',
    completed: 'badge-success',
    pending: 'badge-warning',
    failed: 'badge-danger',
    cancelled: 'badge-danger',
    inactive: 'badge-danger',
    offline: 'badge-danger'
  };
  return classes[status] || 'badge-primary';
}

// Priority class
export function getPriorityClass(priority) {
  const classes = {
    urgent: 'badge-danger',
    high: 'badge-warning',
    normal: 'badge-primary',
    low: 'badge-info'
  };
  return classes[priority] || 'badge-primary';
}

// Debounce utility
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttle utility
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Copy to clipboard
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
    return true;
  } catch (err) {
    toast.error('Failed to copy');
    return false;
  }
}

// API error handler
export function handleApiError(error, fallback = 'An error occurred') {
  console.error('API Error:', error);
  toast.error(error.message || fallback);
}

// Generate ID
export function generateId(length = 8) {
  return Math.random().toString(36).substring(2, 2 + length);
}

// Export data
export function downloadData(data, filename, type = 'application/json') {
  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Page-specific initialization
export function initPage(pageName) {
  setActiveNav();
  initModals();
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setActiveNav();
  initModals();
});
