import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldAlert, 
  Lock, 
  RefreshCw, 
  AlertCircle, 
  ChevronRight,
  Inbox
} from 'lucide-react';
import { AuditLog, getCaseAuditLogs } from '../../lib/api';
import { useAuth } from '../../app/AuthContext';

interface SupervisoryAuditTrailProps {
  caseId: string;
}

export const SupervisoryAuditTrail: React.FC<SupervisoryAuditTrailProps> = ({ caseId }) => {
  const { canViewAuditLogs, user } = useAuth();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchAuditLogs = useCallback(async () => {
    if (!canViewAuditLogs) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getCaseAuditLogs(caseId);
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Access denied or failed to fetch audit records');
    } finally {
      setLoading(false);
    }
  }, [caseId, canViewAuditLogs]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // If user lacks permission client-side
  if (!canViewAuditLogs) {
    return (
      <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-rose-950/60 border border-rose-800 text-rose-400 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-rose-200 text-sm">Supervisory Audit Clearance Required</h3>
          <p className="text-xs text-rose-300/80 max-w-md mx-auto leading-relaxed">
            Supervisory audit trails contain sensitive investigator provenance, cryptographic access events, and internal state diffs. This section is strictly restricted to <strong>SUPERVISOR</strong> and <strong>SYSTEM_ADMIN</strong> roles.
          </p>
        </div>
        <div className="text-[11px] font-mono text-slate-500">
          Current Role: {user?.role || 'ANONYMOUS'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>Supervisory Audit Trail & State History</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Immutable, cryptographically verifiable supervisory audit records with entity delta changes.
          </p>
        </div>

        <button
          onClick={() => fetchAuditLogs()}
          title="Refresh Audit Logs"
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

      {/* Audit Log Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 text-[10px] text-slate-400 uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Supervisory Actor</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Affected Entity</th>
                <th className="py-2.5 px-3">Reason / Context</th>
                <th className="py-2.5 px-3 text-right">State Diffs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-rose-400" />
                    Fetching supervisory audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <Inbox className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                    <span>No supervisory audit records logged for this case.</span>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const hasDiff = log.previousStateJson || log.newStateJson;

                  return (
                    <React.Fragment key={log.id}>
                      <tr 
                        className="hover:bg-slate-800/40 transition cursor-pointer"
                        onClick={() => hasDiff && setExpandedLogId(isExpanded ? null : log.id)}
                      >
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] text-slate-400">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-200">
                          {log.actorUser ? (
                            <div>
                              <span className="font-semibold">{log.actorUser.displayName}</span>
                              <span className="text-[10px] text-slate-500 font-mono ml-1">
                                ({log.actorUser.badgeNumber || log.actorUser.role})
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">SYSTEM</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-900/60 font-bold">
                            {log.action}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] text-slate-300">
                          <span className="text-slate-400">{log.entityType}</span>
                          {log.entityId && (
                            <span className="text-slate-500 text-[10px] block truncate max-w-[140px]">
                              {log.entityId}
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 max-w-xs text-slate-300 text-xs">
                          {log.reason || <span className="text-slate-600 italic">No notes</span>}
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {hasDiff ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedLogId(isExpanded ? null : log.id);
                              }}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-mono inline-flex items-center space-x-0.5"
                            >
                              <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>
                          ) : (
                            <span className="text-slate-600 text-[11px]">&mdash;</span>
                          )}
                        </td>
                      </tr>

                      {/* Expandable JSON State Diffs */}
                      {isExpanded && (
                        <tr className="bg-slate-950/80">
                          <td colSpan={6} className="p-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                              {log.previousStateJson && (
                                <div className="space-y-1">
                                  <span className="text-[10px] font-mono font-semibold text-rose-400 uppercase tracking-wider">
                                    Previous State
                                  </span>
                                  <pre className="p-2.5 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-slate-300 overflow-x-auto">
                                    {JSON.stringify(log.previousStateJson, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {log.newStateJson && (
                                <div className="space-y-1">
                                  <span className="text-[10px] font-mono font-semibold text-emerald-400 uppercase tracking-wider">
                                    New State
                                  </span>
                                  <pre className="p-2.5 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-slate-300 overflow-x-auto">
                                    {JSON.stringify(log.newStateJson, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
