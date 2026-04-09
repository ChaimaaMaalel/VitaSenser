import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const apiBaseUrl =
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:5000/api/v1';
const apiTimeoutMs = Number((import.meta as any).env?.VITE_API_TIMEOUT_MS || 15000);

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: Number.isFinite(apiTimeoutMs) && apiTimeoutMs > 0 ? apiTimeoutMs : 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
      delete (config.headers as any)['Content-Type'];
    }

    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Normalize timeout errors so callers can handle them consistently.
    if (error?.code === 'ECONNABORTED' || String(error?.message || '').toLowerCase().includes('timeout')) {
      error.isTimeout = true;
      error.userMessage = 'Request timeout. Please try again.';
    }

    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
