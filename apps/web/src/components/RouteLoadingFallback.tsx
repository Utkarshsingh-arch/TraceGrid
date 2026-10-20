import React from 'react';
import { Loader2 } from 'lucide-react';

export function RouteLoadingFallback(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center" role="status" aria-live="polite">
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl shadow-lg mb-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-slate-300">Loading Operational Workspace...</p>
      <p className="text-xs text-slate-500 mt-1">Preparing deterministic investigation views and assets</p>
    </div>
  );
}
