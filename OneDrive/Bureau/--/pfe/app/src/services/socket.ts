import { API_BASE_URL } from './api';

export function getSocketUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SOCKET_URL?.trim();
  if (fromEnv) return fromEnv;

  return API_BASE_URL.replace(/\/api\/v\d+\/?$/, '').replace(/\/$/, '');
}
