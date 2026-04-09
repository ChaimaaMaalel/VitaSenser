import axios from 'axios';

const defaultBaseUrl = 'http://192.168.1.68:5000/api/v1';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() || defaultBaseUrl;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export function setAuthToken(token?: string) {
  if (!token) {
    delete api.defaults.headers.common.Authorization;
    return;
  }

  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}
