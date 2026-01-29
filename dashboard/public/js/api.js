// API Client for Ollama Assistant Dashboard

const API_BASE = '/api';

class ApiClient {
  constructor(baseUrl = API_BASE) {
    this.baseUrl = baseUrl;
    this.ws = null;
    this.wsCallbacks = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  // HTTP methods
  async request(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      return result;
    } catch (error) {
      console.error(`API Error [${method} ${endpoint}]:`, error);
      throw error;
    }
  }

  get(endpoint) {
    return this.request('GET', endpoint);
  }

  post(endpoint, data) {
    return this.request('POST', endpoint, data);
  }

  put(endpoint, data) {
    return this.request('PUT', endpoint, data);
  }

  patch(endpoint, data) {
    return this.request('PATCH', endpoint, data);
  }

  delete(endpoint) {
    return this.request('DELETE', endpoint);
  }

  // WebSocket connection
  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.emit('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.emit(message.type, message.data);
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.emit('disconnected');
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`Attempting reconnect in ${delay}ms...`);
      setTimeout(() => this.connect(), delay);
    }
  }

  // Event handling
  on(event, callback) {
    if (!this.wsCallbacks.has(event)) {
      this.wsCallbacks.set(event, new Set());
    }
    this.wsCallbacks.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.wsCallbacks.has(event)) {
      this.wsCallbacks.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.wsCallbacks.has(event)) {
      this.wsCallbacks.get(event).forEach(callback => callback(data));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Status API
export const statusApi = {
  getStatus: () => api.get('/status'),
  getOverview: () => api.get('/status/overview')
};

// Persona API
export const personaApi = {
  getAll: () => api.get('/personas'),
  getActive: () => api.get('/personas/active'),
  getById: (id) => api.get(`/personas/${id}`),
  activate: (id) => api.post(`/personas/${id}/activate`),
  applyFeedback: (id, feedback) => api.post(`/personas/${id}/feedback`, { feedback }),
  create: (data) => api.post('/personas', data),
  delete: (id) => api.delete(`/personas/${id}`)
};

// Memory API
export const memoryApi = {
  getStats: () => api.get('/memory/stats'),
  search: (query, options = {}) => {
    const params = new URLSearchParams({ q: query, ...options });
    return api.get(`/memory/search?${params}`);
  },
  getAll: (options = {}) => {
    const params = new URLSearchParams(options);
    return api.get(`/memory?${params}`);
  },
  add: (content, type = 'general', metadata = {}) =>
    api.post('/memory', { content, type, metadata }),
  delete: (id) => api.delete(`/memory/${id}`),
  clear: () => api.delete('/memory'),
  getDaily: (days = 7) => api.get(`/memory/daily?days=${days}`)
};

// Workers API
export const workersApi = {
  getAll: () => api.get('/workers'),
  getById: (id) => api.get(`/workers/${id}`),
  getStats: () => api.get('/workers/stats'),
  getByStatus: (status) => api.get(`/workers/filter/${status}`),
  create: (data) => api.post('/workers', data),
  cancel: (id) => api.post(`/workers/${id}/cancel`),
  retry: (id) => api.post(`/workers/${id}/retry`),
  generateTodo: (projectName, subtasks, options) =>
    api.post('/workers/todo', { projectName, subtasks, options }),
  cleanup: (olderThanDays = 7) => api.post('/workers/cleanup', { olderThanDays })
};

// Connectors API
export const connectorsApi = {
  getAll: () => api.get('/connectors'),
  getById: (id) => api.get(`/connectors/${id}`),
  create: (data) => api.post('/connectors', data),
  update: (id, data) => api.put(`/connectors/${id}`, data),
  delete: (id) => api.delete(`/connectors/${id}`),
  test: (id) => api.post(`/connectors/${id}/test`),
  setKey: (id, apiKey) => api.post(`/connectors/${id}/key`, { apiKey }),
  getWrapper: (id) => api.get(`/connectors/${id}/wrapper`),
  getDocs: (id) => api.get(`/connectors/${id}/docs`),
  getStats: () => api.get('/connectors/stats'),
  createCommon: (service) => api.post(`/connectors/common/${service}`)
};

// Chat API
export const chatApi = {
  send: (message, personaId = null) =>
    api.post('/chat', { message, personaId }),
  getHistory: (limit = 20) => api.get(`/chat/history?limit=${limit}`),
  clearHistory: () => api.delete('/chat/history'),
  getPersona: () => api.get('/chat/persona'),
  sendCommand: (command) => api.post('/chat/command', { command })
};

// Config API
export const configApi = {
  get: () => api.get('/config'),
  getValue: (key) => api.get(`/config/${key}`),
  update: (config) => api.put('/config', { config }),
  updateKey: (key, value) => api.put(`/config/${key}`, { value }),
  reset: () => api.post('/config/reset'),
  getSections: () => api.get('/config/sections'),
  export: () => api.get('/config/export')
};

// Health check
export const healthApi = {
  check: () => api.get('/health')
};

// Create singleton instance
export const api = new ApiClient();

// Auto-connect WebSocket
if (typeof window !== 'undefined') {
  api.connect();
}

export default api;
