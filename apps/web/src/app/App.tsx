import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { Navbar } from '../components/Navbar';
import { RouteLoadingFallback } from '../components/RouteLoadingFallback';
import { LoginPage } from '../features/auth/LoginPage';

// Route-level code-splitting with dynamic imports for bundle optimization
const CaseRegister = lazy(() =>
  import('../features/cases/CaseRegister').then((m) => ({ default: m.CaseRegister }))
);
const CaseWorkspace = lazy(() =>
  import('../features/cases/CaseWorkspace').then((m) => ({ default: m.CaseWorkspace }))
);
const OperationsHub = lazy(() =>
  import('../features/analytics/OperationsHub').then((m) => ({ default: m.OperationsHub }))
);

function AppContent(): React.JSX.Element {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 font-mono">
        <div className="flex items-center space-x-3 text-indigo-400">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Verifying authorization and session context...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Global Operations Navbar */}
      <Navbar />

      {/* Operational View Container with Route Suspense Boundary.
          Keying by user.id ensures all cached sensitive component state
          is immediately cleared upon role or persona change. */}
      <main key={user.id} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<CaseRegister />} />
            <Route path="/cases" element={<CaseRegister />} />
            <Route path="/cases/:id" element={<CaseWorkspace />} />
            <Route path="/operations" element={<OperationsHub initialTab="dashboard" />} />
            <Route path="/patterns" element={<OperationsHub initialTab="patterns" />} />
            <Route path="/reports" element={<OperationsHub initialTab="reports" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      {/* Restrained Operational Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-3.5 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-mono font-semibold text-slate-400">TRACEGRID</span>
            <span>&bull;</span>
            <span>Operational Investigation Dashboard</span>
          </div>
          <div className="flex items-center space-x-4 font-mono text-[11px] text-slate-500">
            <span>Jurisdiction: {user.jurisdiction?.name || 'Platform-Wide Global Scope'}</span>
            <span>&bull;</span>
            <span>Role: {user.role}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
