import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chrome, Eye, EyeOff, Lightbulb, Lock, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import loginIllustration from '../../assets/pictures/login.jpg';
import vitaSenseLogo from '../../assets/pictures/VitaSense.png';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, tokens } = response.data.data;

      // Map _id to id for compatibility with auth store
      const mappedUser = {
        ...user,
        id: user._id || user.id,
      };

      login(mappedUser, tokens.accessToken, tokens.refreshToken);
      toast.success(`Welcome back, ${user.firstName}!`);
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-start px-4 py-10 md:px-16"
      style={{
        fontFamily: 'Nunito, sans-serif',
        backgroundImage: `url(${loginIllustration})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <section className="w-full max-w-md rounded-[36px] bg-white/50 backdrop-blur-[28px] px-10 py-12 shadow-[0_40px_120px_rgba(76,29,149,0.3)] md:ml-32">
          <div className="flex items-center justify-between text-sm font-semibold text-[#5c5a5f]">
            <div className="flex items-center gap-2 text-lg text-[#1a1a1c]">
              <img src={vitaSenseLogo} alt="VitaSense logo" className="h-12 w-12 rounded-full object-cover" />
              VitaSenser<span className="text-[#f05283]">.</span>
            </div>
            
          </div>

          <h1 className="mt-6 text-5xl font-bold text-[#1c1c21]">Sign in</h1>

          <div className="mt-8 flex items-center gap-3">
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-3 rounded-2xl bg-[#4d7df3] py-3 text-sm font-semibold text-white shadow-[0_20px_40px_rgba(77,125,243,0.35)]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21.35 11.1h-9.18v2.98h5.33c-.23 1.25-1.36 3.67-5.33 3.67a6.18 6.18 0 1 1 4.37-10.57l2.1-2.04A9.29 9.29 0 1 0 12 21.29c4.67 0 8.03-3.27 8.03-7.87 0-.53-.06-1.12-.16-1.53Z" fill="#34A853" />
                <path d="M3.16 7.1l2.46 1.81a6.18 6.18 0 0 1 10.04-2.23l2.1-2.05A9.29 9.29 0 0 0 2.71 7.7l.45-.6Z" fill="#EA4335" />
                <path d="M12 21.29c2.52 0 4.64-.83 6.18-2.26l-2.85-2.23c-.79.53-1.86.9-3.33.9-2.57 0-4.74-1.73-5.5-4.07H3.55v2.55A9.29 9.29 0 0 0 12 21.29Z" fill="#4285F4" />
                <path d="M6.5 13.63a5.53 5.53 0 0 1 0-3.26V7.82H3.55a9.3 9.3 0 0 0 0 8.36L6.5 13.63Z" fill="#FBBC05" />
              </svg>
              Sign in with Google
            </button>
            
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b7b81]">
                Username or Email Address
              </label>
              <div className="relative mt-2">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#cacfd8]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="katelova24@gmail.com"
                  className="w-full rounded-[18px] border-2 border-[#5594a5] bg-white py-3 pl-12 pr-4 text-base text-[#1f1f25] placeholder:text-[#a7a7ad] focus:border-[#5594a5] focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b7b81]">Password</label>
                <button type="button" className="text-sm font-semibold text-[#5c7cff] hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative mt-2">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#cacfd8]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-[18px] border-2 border-[#5594a5] bg-white py-3 pl-12 pr-12 text-base text-[#1f1f25] placeholder:text-[#a7a7ad] focus:border-[#5594a5] focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9ea3af]"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-[18px] bg-[#1f1f24] py-3 text-base font-semibold text-white transition disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </section>
    </div>
  );
}
