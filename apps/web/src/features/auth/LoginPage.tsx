import React, { useState } from 'react';
import { Shield, Lock, Mail, AlertTriangle, ArrowRight, UserCheck, KeyRound } from 'lucide-react';
import { useAuth, DEMO_ACCOUNTS, DemoUser } from '../../app/AuthContext';

export const LoginPage: React.FC = () => {
  const { loginUser, error: authError } = useAuth();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setFormError('Both email address and password are required.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await loginUser(email.trim(), password);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Authentication failed. Please verify credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickPersona = async (demo: DemoUser) => {
    setEmail(demo.email);
    setPassword('Password123!');
    setSubmitting(true);
    setFormError(null);

    try {
      await loginUser(demo.email, 'Password123!');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Demo authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeError = formError || authError;

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Official Access Warning Banner */}
      <div className="w-full max-w-md mb-6 p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 space-y-1">
        <div className="flex items-center space-x-1.5 font-mono font-semibold text-amber-400">
          <Lock className="w-3.5 h-3.5" />
          <span>RESTRICTED INVESTIGATION NETWORK</span>
        </div>
        <p className="leading-relaxed">
          Authorized personnel only. All access, queries, attachments, and case mutations are cryptographically signed, timestamped, and audited.
        </p>
      </div>

      {/* Main Authentication Card */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl shadow-black/80 overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-800/80 bg-slate-900/90">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-indigo-950 border border-indigo-700/60 flex items-center justify-center text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold tracking-tight text-white font-mono text-lg">TRACEGRID</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-800 text-slate-400 border border-slate-700">
                  SECURE GATEWAY
                </span>
              </div>
              <p className="text-xs text-slate-400">Investigation Operations Dashboard</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Enter your departmental credentials to access your jurisdiction&apos;s case register.
          </p>
        </div>

        {/* Error Alert */}
        {activeError && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{activeError}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Official Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="officer.sharma@tracegrid.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow transition disabled:opacity-50"
          >
            {submitting ? (
              <div className="flex items-center space-x-2">
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Authenticating...</span>
              </div>
            ) : (
              <>
                <span>Sign In to Case Register</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Quick Staging Demo Personas Panel */}
        <div className="px-6 pb-6 pt-2 border-t border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-slate-400 mb-2.5">
            <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Staging Demo Personas (One-Click Genuine Login)</span>
          </div>
          <div className="space-y-1.5">
            {DEMO_ACCOUNTS.map((demo) => (
              <button
                key={demo.email}
                type="button"
                onClick={() => handleQuickPersona(demo)}
                disabled={submitting}
                className="w-full text-left px-3 py-2 rounded-md bg-slate-900 hover:bg-slate-800/80 border border-slate-800 transition flex items-center justify-between text-xs group disabled:opacity-50"
              >
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-medium text-slate-200 group-hover:text-white">{demo.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">#{demo.badge}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    <span className="font-mono text-indigo-400/90">{demo.role}</span> &bull; {demo.jurisdiction}
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 group-hover:text-slate-300 font-mono">
                  Login &rarr;
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Security Footer Notice */}
      <div className="mt-8 text-center text-[11px] text-slate-600 font-mono space-y-1">
        <p>TraceGrid Staging Environment &bull; Strict Loopback Binding</p>
        <p>No synthetic investigation data is accessible without an authenticated session.</p>
      </div>
    </div>
  );
};
