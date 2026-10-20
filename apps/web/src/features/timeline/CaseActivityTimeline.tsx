import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Clock, RefreshCw, AlertCircle, Inbox, User } from 'lucide-react';
import { CaseEvent, getCaseEvents } from '../../lib/api';

interface CaseActivityTimelineProps {
  caseId: string;
}

export function getEventTypeBadge(type: string) {
  switch (type) {
    case 'CASE_CREATED':
      return { label: 'CASE CREATED', className: 'text-indigo-400 bg-indigo-950/60 border-indigo-800' };
    case 'STATE_TRANSITION':
      return { label: 'STATE CHANGE', className: 'text-purple-400 bg-purple-950/60 border-purple-800' };
    case 'OUTCOME_UPDATED':
      return { label: 'OUTCOME', className: 'text-cyan-400 bg-cyan-950/60 border-cyan-800' };
    case 'ASSIGNMENT_CHANGED':
      return { label: 'ASSIGNMENT', className: 'text-blue-400 bg-blue-950/60 border-blue-800' };
    case 'LEAD_REGISTERED':
      return { label: 'LEAD LODGED', className: 'text-amber-400 bg-amber-950/60 border-amber-800' };
    case 'LEAD_VERIFIED':
      return { label: 'LEAD VETTED', className: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' };
    case 'EVIDENCE_LOGGED':
      return { label: 'EVIDENCE', className: 'text-cyan-300 bg-cyan-950/60 border-cyan-800' };
    case 'TASK_COMPLETED':
      return { label: 'TASK DONE', className: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' };
    case 'HYPOTHESIS_GENERATED':
      return { label: 'HYPOTHESIS', className: 'text-pink-400 bg-pink-950/60 border-pink-800' };
    default:
      return { label: type, className: 'text-slate-400 bg-slate-800 border-slate-700' };
  }
}

export const CaseActivityTimeline: React.FC<CaseActivityTimelineProps> = ({ caseId }) => {
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCaseEvents(caseId);
      // Sort reverse-chronological by default
      const sorted = [...data].sort(
        (a, b) => new Date(b.eventTimestamp).getTime() - new Date(a.eventTimestamp).getTime()
      );
      setEvents(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve timeline events');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center space-x-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>Chronological Case Event Timeline</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Immutable log of all operational events and status transitions.
          </p>
        </div>

        <button
          onClick={() => fetchEvents()}
          title="Refresh Timeline"
          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && events.length === 0 ? (
        <div className="p-8 text-center text-slate-500 italic bg-slate-900/40 rounded-xl border border-slate-800">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
          Loading case events...
        </div>
      ) : events.length === 0 ? (
        <div className="p-10 text-center text-slate-500 bg-slate-900/40 rounded-xl border border-slate-800">
          <Inbox className="w-6 h-6 mx-auto mb-2 text-slate-600" />
          <span>No chronological events recorded for this case.</span>
        </div>
      ) : (
        <div className="space-y-3 relative before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-slate-800">
          {events.map((evt) => {
            const badge = getEventTypeBadge(evt.eventType);

            return (
              <div key={evt.id} className="relative flex items-start space-x-3.5 pl-2">
                {/* Node circle */}
                <div className="w-6 h-6 rounded-full bg-slate-900 border-2 border-indigo-500/80 flex items-center justify-center shrink-0 z-10 mt-0.5 shadow">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                </div>

                {/* Event Card */}
                <div className="flex-1 bg-slate-900/70 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5 hover:border-slate-700 transition">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                    <span className={`px-2 py-0.5 rounded font-mono font-bold text-[9px] uppercase border ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className="text-slate-400 font-mono flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{new Date(evt.eventTimestamp).toLocaleString()}</span>
                    </span>
                  </div>

                  <p className="text-slate-200 text-xs leading-relaxed">
                    {evt.description}
                  </p>

                  {evt.actorUser && (
                    <div className="text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-800/80 flex items-center space-x-1">
                      <User className="w-3 h-3 text-slate-500" />
                      <span>
                        Recorded by {evt.actorUser.displayName} ({evt.actorUser.badgeNumber ? `Badge ${evt.actorUser.badgeNumber}` : evt.actorUser.role})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
