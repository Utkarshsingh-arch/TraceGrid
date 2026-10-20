import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Lightbulb, 
  CheckSquare, 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  ShieldAlert, 
  Info, 
  Compass, 
  UserCheck 
} from 'lucide-react';
import { 
  InvestigationTaskRecommendation, 
  InvestigationTask, 
  getCaseRecommendations 
} from '../../lib/api';
import { useAuth } from '../../app/AuthContext';
import { AcceptRecommendationModal } from './AcceptRecommendationModal';

interface RecommendationDrawerProps {
  caseId: string;
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated?: (task: InvestigationTask) => void;
}

export const RecommendationDrawer: React.FC<RecommendationDrawerProps> = ({
  caseId,
  isOpen,
  onClose,
  onTaskCreated,
}) => {
  const { user } = useAuth();
  const canAccept =
    user?.role === 'CASE_OFFICER' ||
    user?.role === 'SUPERVISOR' ||
    user?.role === 'SYSTEM_ADMIN';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<InvestigationTaskRecommendation[]>([]);
  const [disclaimer, setDisclaimer] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

  // Selected recommendation for acceptance modal
  const [selectedRec, setSelectedRec] = useState<InvestigationTaskRecommendation | null>(null);
  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [acceptedRecIds, setAcceptedRecIds] = useState<string[]>([]);

  const fetchRecommendations = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCaseRecommendations(caseId);
      setRecommendations(data.recommendations || []);
      setDisclaimer(data.disclaimer || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve recommendations');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    if (isOpen) {
      fetchRecommendations();
    }
  }, [isOpen, fetchRecommendations]);

  if (!isOpen) return null;

  const filteredRecs = recommendations.filter((r) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'LEAD' && r.type === 'UNASSIGNED_LEAD_VERIFICATION') return true;
    if (activeFilter === 'CONTRADICTION' && r.type === 'CONTRADICTORY_OBSERVATION_CLARIFICATION') return true;
    if (activeFilter === 'STALE' && r.type === 'STALE_LEAD_TRIAGE') return true;
    if (activeFilter === 'SEARCH' && r.type === 'UNCHECKED_SEARCH_AREA_CANVASS') return true;
    return false;
  });

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800">CRITICAL</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">HIGH</span>;
      case 'LOW':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">LOW</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-400 border border-indigo-800">MEDIUM</span>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'UNASSIGNED_LEAD_VERIFICATION':
        return <UserCheck className="w-4 h-4 text-emerald-400" />;
      case 'CONTRADICTORY_OBSERVATION_CLARIFICATION':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      case 'STALE_LEAD_TRIAGE':
        return <Clock className="w-4 h-4 text-amber-400" />;
      case 'UNCHECKED_SEARCH_AREA_CANVASS':
        return <Compass className="w-4 h-4 text-cyan-400" />;
      default:
        return <Lightbulb className="w-4 h-4 text-indigo-400" />;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
        <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-lg bg-indigo-950/70 border border-indigo-800/80 text-indigo-400">
                <Lightbulb className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white font-mono flex items-center space-x-2">
                  <span>Investigation Task Recommendations</span>
                  <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-indigo-900 text-indigo-300 font-mono">
                    {recommendations.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Automated clue triage & follow-up advisory drawer</p>
              </div>
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={fetchRecommendations}
                disabled={loading}
                title="Refresh recommendations"
                className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Safety Disclaimer Banner */}
          <div className="px-4 py-2.5 bg-amber-950/20 border-b border-amber-900/40 text-[11px] text-slate-300 flex items-start space-x-2 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Decision-Support Guardrail:</strong> {disclaimer || 'Recommendations are advisory only. Systems strictly never auto-dispatch personnel or contact witnesses. Human review and explicit confirmation are required.'}
            </span>
          </div>

          {/* Filter Pills */}
          <div className="p-3 border-b border-slate-800/80 flex items-center space-x-1.5 overflow-x-auto text-[11px]">
            <button
              onClick={() => setActiveFilter('ALL')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                activeFilter === 'ALL'
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({recommendations.length})
            </button>
            <button
              onClick={() => setActiveFilter('LEAD')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                activeFilter === 'LEAD'
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Leads
            </button>
            <button
              onClick={() => setActiveFilter('CONTRADICTION')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                activeFilter === 'CONTRADICTION'
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Velocity Conflicts
            </button>
            <button
              onClick={() => setActiveFilter('STALE')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                activeFilter === 'STALE'
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Stale Clues
            </button>
            <button
              onClick={() => setActiveFilter('SEARCH')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                activeFilter === 'SEARCH'
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Search Areas
            </button>
          </div>

          {/* Recommendation List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
            {error && (
              <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-lg flex items-start space-x-2 text-rose-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {loading && recommendations.length === 0 && (
              <div className="text-center py-12 text-slate-500 space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-400" />
                <p>Evaluating active clues & contradictions...</p>
              </div>
            )}

            {!loading && filteredRecs.length === 0 && (
              <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl p-6 space-y-2">
                <CheckSquare className="w-8 h-8 mx-auto text-slate-600" />
                <p className="font-medium text-slate-400">No pending recommendations for current filter.</p>
                <p className="text-[11px] text-slate-500">All reviewed sightings and search areas have active operational tasks or verified outcomes.</p>
              </div>
            )}

            {filteredRecs.map((rec) => {
              const isAccepted = acceptedRecIds.includes(rec.id);
              return (
                <div
                  key={rec.id}
                  className={`rounded-xl border p-4 space-y-3 transition ${
                    isAccepted
                      ? 'bg-emerald-950/20 border-emerald-900/60 opacity-80'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                        {getTypeIcon(rec.type)}
                      </div>
                      <span className="font-semibold text-slate-200 text-xs">{rec.title}</span>
                    </div>
                    <div className="shrink-0">{getPriorityBadge(rec.suggestedPriority)}</div>
                  </div>

                  <p className="text-slate-300 text-[11px] leading-relaxed">{rec.description}</p>

                  {/* Operational directive / action */}
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80 space-y-1">
                    <span className="text-indigo-400 font-semibold text-[10px] uppercase tracking-wider block">
                      Proposed Action Directive:
                    </span>
                    <p className="text-slate-200 text-xs font-medium">{rec.suggestedAction}</p>
                  </div>

                  {/* Why Human Review Required */}
                  <div className="text-[10px] text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-800/60 space-y-0.5">
                    <span className="font-semibold text-amber-400 flex items-center space-x-1">
                      <ShieldAlert className="w-3 h-3" />
                      <span>Why Human Review Is Mandatory:</span>
                    </span>
                    <p className="leading-tight text-slate-400">{rec.whyHumanReviewRequired}</p>
                  </div>

                  {/* Action row */}
                  <div className="pt-1 flex items-center justify-between border-t border-slate-800/80">
                    <div className="text-[10px] text-slate-500 font-mono">
                      Ref: {rec.id.length > 28 ? `${rec.id.slice(0, 24)}...` : rec.id}
                    </div>

                    {isAccepted ? (
                      <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold flex items-center space-x-1">
                        <CheckSquare className="w-3 h-3" />
                        <span>TASK CREATED</span>
                      </span>
                    ) : (
                      canAccept && (
                        <button
                          onClick={() => {
                            setSelectedRec(rec);
                            setAcceptModalOpen(true);
                          }}
                          className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition flex items-center space-x-1 shadow"
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                          <span>Review & Accept</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Acceptance Modal */}
      {selectedRec && (
        <AcceptRecommendationModal
          caseId={caseId}
          recommendation={selectedRec}
          isOpen={acceptModalOpen}
          onClose={() => {
            setAcceptModalOpen(false);
            setSelectedRec(null);
          }}
          onSuccess={(task) => {
            setAcceptedRecIds((prev) => [...prev, selectedRec.id]);
            if (onTaskCreated) {
              onTaskCreated(task);
            }
          }}
        />
      )}
    </>
  );
};
