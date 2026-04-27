'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { adminAPI } from '@/lib/api';
import { useAdminStore } from '@/store/adminStore';

export default function AdminLogin() {
  const router = useRouter();
  const { setAuth } = useAdminStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: apiError } = await adminAPI.login(username, password);
      if (apiError || !data) {
        setError(apiError || 'Login failed. Check your credentials or Supabase configuration.');
        setLoading(false);
        return;
      }
      setAuth(data.user, data.token);
      router.push('/admin');
    } catch {
      setError('An unexpected error occurred.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem',
      background: '#F9F9F9',
      position: 'relative', overflow: 'hidden',
    }}>

      {/* Ambient glows */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(253,202,0,0.09) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(5,80,60,0.07) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>

        {/* ── CARD ─────────────────────────────────────────────── */}
        <div style={{
          background: 'rgba(255,255,255,0.80)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(5,80,60,0.08)',
          borderRadius: 28,
          padding: 'clamp(1.75rem, 5vw, 2.75rem)',
          boxShadow: '0 20px 60px rgba(5,80,60,0.09), 0 4px 16px rgba(5,80,60,0.05)',
        }}>

          {/* Top accent */}
          <div style={{ height: 3, background: 'linear-gradient(90deg, #fdca00, rgba(253,202,0,0.2))', borderRadius: '999px 999px 0 0', margin: '-2.75rem -2.75rem 2.25rem', marginLeft: '-2.75rem', marginRight: '-2.75rem', marginTop: '-2.75rem', marginBottom: '2.25rem' }} />

          {/* Icon */}
          <div style={{
            width: 56, height: 56, borderRadius: 18, marginBottom: '1.5rem',
            background: 'rgba(253,202,0,0.1)', border: '1.5px solid rgba(253,202,0,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={22} strokeWidth={1.75} style={{ color: '#fdca00' }} />
          </div>

          <h1 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.9rem', letterSpacing: '-0.04em', color: '#05503c', marginBottom: '0.35rem' }}>
            Sign In
          </h1>
          <p style={{ fontFamily: 'var(--font-instrument)', fontSize: '0.88rem', color: 'rgba(5,80,60,0.5)', marginBottom: '2rem' }}>
            ESET Cafe Management Dashboard
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Username */}
            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', fontFamily: 'var(--font-bricolage)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.45)', marginBottom: '0.5rem' }}>
                Username or Email
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                style={{
                  width: '100%', padding: '0.8rem 1.1rem', borderRadius: 14,
                  background: 'rgba(5,80,60,0.04)', border: '1.5px solid rgba(5,80,60,0.1)',
                  fontFamily: 'var(--font-instrument)', fontSize: '0.95rem', color: '#05503c',
                  outline: 'none', transition: 'border-color 0.2s ease, background 0.2s ease',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(253,202,0,0.6)'; e.target.style.background = '#ffffff'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(5,80,60,0.1)'; e.target.style.background = 'rgba(5,80,60,0.04)'; }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', fontFamily: 'var(--font-bricolage)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.45)', marginBottom: '0.5rem' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%', padding: '0.8rem 3rem 0.8rem 1.1rem', borderRadius: 14,
                    background: 'rgba(5,80,60,0.04)', border: '1.5px solid rgba(5,80,60,0.1)',
                    fontFamily: 'var(--font-instrument)', fontSize: '0.95rem', color: '#05503c',
                    outline: 'none', transition: 'border-color 0.2s ease, background 0.2s ease',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(253,202,0,0.6)'; e.target.style.background = '#ffffff'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(5,80,60,0.1)'; e.target.style.background = 'rgba(5,80,60,0.04)'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(5,80,60,0.35)', padding: 4,
                  }}
                >
                  {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                padding: '0.8rem 1rem', borderRadius: 12,
                background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)',
                color: '#dc2626', fontSize: '0.85rem',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="shimmer-btn"
              style={{
                marginTop: '0.5rem',
                width: '100%', padding: '0.9rem', borderRadius: 16, border: 'none',
                background: 'linear-gradient(135deg, #fdca00 0%, #ffd845 100%)',
                color: '#05503c', cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.95rem',
                letterSpacing: '-0.01em',
                boxShadow: '0 6px 24px rgba(253,202,0,0.32)',
                opacity: loading ? 0.7 : 1,
                transition: 'opacity 0.2s, transform 0.2s, box-shadow 0.2s',
              }}
            >
              {loading ? 'Authenticating…' : 'Enter Dashboard'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
