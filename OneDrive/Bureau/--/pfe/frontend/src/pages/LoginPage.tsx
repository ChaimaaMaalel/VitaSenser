import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chrome, Eye, EyeOff, Lightbulb, Lock, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import loginVideo from '../../assets/pictures/login.webm';
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
      className="relative min-h-screen flex items-center justify-start overflow-hidden px-4 py-10 md:px-16"
      style={{
        fontFamily: 'Nunito, sans-serif',
      }}
    >
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={loginVideo}
        autoPlay
        loop
        muted
        playsInline
      />
      <div className="absolute inset-0 bg-black/20" />
      <section className="relative z-10 w-full max-w-md rounded-[36px] bg-white/50 backdrop-blur-[28px] px-10 py-12 shadow-[0_40px_120px_rgba(76,29,149,0.3)] md:ml-32">
          

          <h1 className="mt-6 text-5xl font-bold text-[#1c1c21]">Sign in</h1>

          

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b7b81]">
                Email Address
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
