import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Shield, 
  UserCheck, 
  ChevronDown, 
  RefreshCw, 
  CheckCircle2, 
  MapPin,
  LogOut 
} from 'lucide-react';
import { useAuth, DEMO_ACCOUNTS } from '../app/AuthContext';

export const Navbar: React.FC = () => {
  const { user, switching, switchRole, logoutUser } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleBadgeStyle = (role?: string) => {
    switch (role) {
      case 'SYSTEM_ADMIN':
        return 'bg-purple-950/80 text-purple-300 border-purple-800/80';
      case 'SUPERVISOR':
        return 'bg-blue-950/80 text-blue-300 border-blue-800/80';
      case 'CASE_OFFICER':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80';
      case 'DATA_CLERK':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/80';
      case 'READ_ONLY_REVIEWER':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/95 sticky top-0 z-40 text-slate-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        {/* Brand & Main Nav */}
        <div className="flex items-center space-x-6">
          <Link to="/" className="flex items-center space-x-2.5 group">
            <div className="w-8 h-8 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 group-hover:border-indigo-500/50 transition">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold tracking-tight text-white font-mono text-base">TRACEGRID</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-800 text-slate-400 border border-slate-700">
                  OPS-v0.1
                </span>
              </div>
              <p className="text-[10px] text-slate-400 -mt-0.5">Investigation Operations</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center space-x-1 pl-4 border-l border-slate-800">
            <Link
              to="/"
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                location.pathname === '/' || location.pathname.startsWith('/cases')
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Case Register
            </Link>
            <Link
              to="/operations"
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                location.pathname === '/operations'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Operations Dashboard
            </Link>
            <Link
              to="/patterns"
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                location.pathname === '/patterns'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Pattern Queue
            </Link>
            <Link
              to="/reports"
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                location.pathname === '/reports'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Reports & CSV
            </Link>
          </nav>
        </div>

        {/* Right Section: Active Identity & Demo Persona Switcher */}
        <div className="flex items-center space-x-3">
          {/* Active User Pill */}
          {user && (
            <div className="hidden sm:flex items-center space-x-2 text-xs bg-slate-950/70 border border-slate-800 px-2.5 py-1 rounded-md">
              <span className="font-medium text-slate-200">{user.displayName}</span>
              {user.badgeNumber && (
                <span className="font-mono text-[11px] text-slate-400 bg-slate-900 px-1 rounded border border-slate-800">
                  #{user.badgeNumber}
                </span>
              )}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold border ${getRoleBadgeStyle(
                  user.role
                )}`}
              >
                {user.role.replace('_', ' ')}
              </span>
              <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                <MapPin className="w-3 h-3 text-slate-500 inline mr-0.5" />
                {user.jurisdiction ? user.jurisdiction.name : 'Global'}
              </span>
            </div>
          )}

          {/* Persona Switcher Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              disabled={switching}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
              title="Switch demo persona account"
            >
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-mono">Persona</span>
              {switching ? (
                <RefreshCw className="w-3 h-3 animate-spin text-amber-400 ml-1" />
              ) : (
                <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
              )}
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-72 bg-slate-900 border border-slate-700 rounded-lg shadow-xl shadow-black/50 py-1.5 z-50 text-xs">
                <div className="px-3 py-1.5 border-b border-slate-800 text-[11px] text-slate-400 font-medium">
                  Switch Active Demo Persona (Real Auth)
                </div>
                <div className="py-1">
                  {DEMO_ACCOUNTS.map((account) => {
                    const isCurrent = user?.email === account.email;
                    return (
                      <button
                        key={account.email}
                        onClick={() => {
                          switchRole(account.email);
                          setDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-start justify-between transition hover:bg-slate-800 ${
                          isCurrent ? 'bg-slate-800/80 font-medium' : ''
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-slate-100 font-semibold">{account.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">#{account.badge}</span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {account.label} &bull; <span className="text-slate-400">{account.jurisdiction}</span>
                          </div>
                        </div>
                        {isCurrent && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-1 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="px-3 py-1.5 border-t border-slate-800 text-[10px] text-slate-500 font-mono">
                  All accounts seeded with demo credentials.
                </div>
              </div>
            )}
          </div>

          {/* Explicit Sign Out Button */}
          <button
            onClick={() => logoutUser()}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 hover:bg-rose-950/80 hover:text-rose-200 hover:border-rose-800 text-slate-300 border border-slate-700 transition"
            title="Explicit session sign-out"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-300" />
            <span className="hidden sm:inline font-mono">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
