import { create } from 'zustand';
import { setAuthToken } from '../services/api';

type UserRole = 'ADMIN' | 'DOCTOR' | 'NURSE';

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
};

type AuthState = {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (payload: { user: User; accessToken: string }) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  login: ({ user, accessToken }) => {
    setAuthToken(accessToken);
    set({ user, accessToken, isAuthenticated: true });
  },
  logout: () => {
    setAuthToken(undefined);
    set({ user: null, accessToken: null, isAuthenticated: false });
  },
}));
