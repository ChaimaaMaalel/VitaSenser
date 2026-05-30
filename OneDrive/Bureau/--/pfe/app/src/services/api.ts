import axios from 'axios';
import Constants from 'expo-constants';

const defaultBaseUrl = 'http://192.168.0.124:5000/api/v1';

const getDevBaseUrl = () => {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri;

  if (!hostUri) {
    return undefined;
  }

  const host = hostUri.split(':')[0];
  return `http://${host}:5000/api/v1`;
};

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  getDevBaseUrl() ||
  defaultBaseUrl;

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
