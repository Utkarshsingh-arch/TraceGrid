import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle,
  Clock,
  MapPin,
  Layers,
  ExternalLink,
  Info,
} from 'lucide-react';
import {
  CandidatePatternDetail,
  PatternReviewDecision,
  getCasePatternById,
  recordPatternReview,
  Role,
} from '../../lib/api';

interface PatternDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  patternId: string | null;
  initiatingCaseId: string | null;
  onReviewSuccess: () => void;
  userRole?: Role;
}

export const PatternDetailModal: React.FC<PatternDetailModalProps> = ({
  isOpen,
  onClose,
  patternId,
  initiatingCaseId,
  onReviewSuccess,
  userRole,
}) => {
  const [pattern, setPattern] = useState<CandidatePatternDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Review Form State
  const [decision, setDecision] = useState<PatternReviewDecision>('RELEVANT_FOR_FOLLOWUP');
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const canReview = userRole === 'CASE_OFFICER' || userRole === 'SUPERVISOR' || userRole === 'SYSTEM_ADMIN';

  useEffect(() => {
    if (!isOpen || !patternId || !initiatingCaseId) {
      setPattern(null);
      setError(null);
      setRationale('');
      setSubmitError(null);
      setSubmitSuccess(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getCasePatternById(initiatingCaseId, patternId)
      .then((data) => {
        if (isMounted) {
          setPattern(data);
          if (data.reviewHistory) {
            setDecision(data.reviewHistory.decision as PatternReviewDecision);
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load pattern details');
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, patternId, initiatingCaseId]);

  if (!isOpen) return null;

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patternId || !initiatingCaseId) return;

    if (rationale.trim().length < 5) {
      setSubmitError('Operational rationale must be at least 5 characters long.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError(null);
      const updated = await recordPatternReview(initiatingCaseId, patternId, {
        decision,
        rationale: rationale.trim(),
      });
      setPattern(updated);
      setSubmitSuccess(true);
      onReviewSuccess();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit pattern review decision');
    } finally {
      setSubmitting(false);
    }
  };

  const getPriorityBadgeClass = (p: string) => {
    switch (p) {
      case 'HIGH':
        return 'bg-rose-950/80 text-rose-300 border-rose-800';
      case 'MEDIUM':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'LOW':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const getStatusBadgeClass = (s: string) => {
    switch (s) {
      case 'RELEVANT_FOR_FOLLOWUP':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
      case 'UNDER_REVIEW':
        return 'bg-indigo-950/80 text-indigo-300 border-indigo-800';
      case 'NOT_RELEVANT':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      case 'UNVERIFIED_CANDIDATE':
      default:
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-indigo-950/80 border border-indigo-800 flex items-center justify-center text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                  Cross-Case Pattern Analysis
                </h2>
                {pattern && (
                  <>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${getPriorityBadgeClass(
                        pattern.reviewPriority
                      )}`}
                    >
                      {pattern.reviewPriority} PRIORITY
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${getStatusBadgeClass(
                        pattern.reviewStatus
                      )}`}
                    >
                      {pattern.reviewStatus.replace(/_/g, ' ')}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Pattern ID: <span className="text-slate-300">{patternId || '...'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Mandatory Investigation Disclaimer */}
          <div className="rounded-lg bg-amber-950/40 border border-amber-800/80 p-3.5 flex items-start space-x-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-300 text-xs">
                Decision-Support Association Notice
              </p>
              <p className="text-[11px] text-amber-200/90 leading-relaxed font-sans">
                Unverified analytical association. Similarity does not establish identity, common causation, suspect status, or a confirmed connection between cases. All matches require independent human review.
              </p>
            </div>
          </div>

          {loading && (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="font-mono text-xs">Loading explainable pattern telemetry...</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-rose-950/60 border border-rose-800 p-4 text-rose-300 flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {pattern && !loading && (
            <>
              {/* Linked Cases Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-indigo-400 uppercase font-semibold">
                      Initiating Case
                    </span>
                    <a
                      href={`/cases/${pattern.initiatingCaseId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-slate-400 hover:text-indigo-300 inline-flex items-center space-x-1"
                    >
                      <span>Open Workspace</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="font-mono text-base font-bold text-white">
                    {pattern.initiatingCaseReference}
                  </div>
                  <div className="text-[11px] text-slate-400 space-y-1">
                    <div className="flex items-center space-x-1">
                      <span className="text-slate-500">Record Type:</span>
                      <span className="font-mono text-slate-300">
                        {pattern.supportingRecords.initiatingRecord.recordType} ({pattern.supportingRecords.initiatingRecord.referenceOrType})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Observation:</span>{' '}
                      <span className="text-slate-300">
                        {pattern.supportingRecords.initiatingRecord.description}
                      </span>
                    </div>
                    {pattern.supportingRecords.initiatingRecord.timestamp && (
                      <div className="flex items-center space-x-1 text-slate-400">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>
                          {new Date(pattern.supportingRecords.initiatingRecord.timestamp).toUTCString()}
                        </span>
                      </div>
                    )}
                    {pattern.supportingRecords.initiatingRecord.latitude !== undefined && (
                      <div className="flex items-center space-x-1 font-mono text-[10px] text-slate-400">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span>
                          {pattern.supportingRecords.initiatingRecord.latitude?.toFixed(5)},{' '}
                          {pattern.supportingRecords.initiatingRecord.longitude?.toFixed(5)}{' '}
                          (±{pattern.supportingRecords.initiatingRecord.uncertaintyMeters ?? 0}m)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-indigo-400 uppercase font-semibold">
                      Candidate Peer Case
                    </span>
                    <a
                      href={`/cases/${pattern.candidateCaseId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-slate-400 hover:text-indigo-300 inline-flex items-center space-x-1"
                    >
                      <span>Open Workspace</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="font-mono text-base font-bold text-white">
                    {pattern.candidateCaseReference}
                  </div>
                  <div className="text-[11px] text-slate-400 space-y-1">
                    <div className="flex items-center space-x-1">
                      <span className="text-slate-500">Record Type:</span>
                      <span className="font-mono text-slate-300">
                        {pattern.supportingRecords.candidateRecord.recordType} ({pattern.supportingRecords.candidateRecord.referenceOrType})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Observation:</span>{' '}
                      <span className="text-slate-300">
                        {pattern.supportingRecords.candidateRecord.description}
                      </span>
                    </div>
                    {pattern.supportingRecords.candidateRecord.timestamp && (
                      <div className="flex items-center space-x-1 text-slate-400">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>
                          {new Date(pattern.supportingRecords.candidateRecord.timestamp).toUTCString()}
                        </span>
                      </div>
                    )}
                    {pattern.supportingRecords.candidateRecord.latitude !== undefined && (
                      <div className="flex items-center space-x-1 font-mono text-[10px] text-slate-400">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span>
                          {pattern.supportingRecords.candidateRecord.latitude?.toFixed(5)},{' '}
                          {pattern.supportingRecords.candidateRecord.longitude?.toFixed(5)}{' '}
                          (±{pattern.supportingRecords.candidateRecord.uncertaintyMeters ?? 0}m)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Priority Rationale & Signal Count */}
              <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Priority Assessment Rationale</span>
                  <span className="font-mono text-[11px] text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60">
                    {pattern.signalsCount} Independent Signal{pattern.signalsCount > 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">{pattern.priorityRationale}</p>
              </div>

              {/* Contributing Signals Detail */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wide font-mono">
                  Contributing Analytical Signals ({pattern.signals.length})
                </h3>
                <div className="space-y-2.5">
                  {pattern.signals.map((sig, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-slate-200">{sig.signalName}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {sig.category}
                          </span>
                        </div>
                        {sig.metrics.distanceKm !== undefined && (
                          <span className="font-mono text-[11px] text-indigo-300">
                            Δ {sig.metrics.distanceKm} km
                          </span>
                        )}
                        {sig.metrics.timeDeltaHours !== undefined && (
                          <span className="font-mono text-[11px] text-amber-300">
                            Δ {sig.metrics.timeDeltaHours} hrs
                          </span>
                        )}
                      </div>
                      <p className="text-slate-300 text-xs">{sig.summary}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-900">
                        <div>
                          <span className="text-slate-500 font-medium">Analytical Rationale:</span>{' '}
                          <span className="text-slate-400">{sig.rationale}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Model Limitations:</span>{' '}
                          <span className="text-slate-400">{sig.limitations}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Existing Review Audit History */}
              {pattern.reviewHistory && (
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span className="font-semibold text-slate-200">Latest Review Decision</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">
                      {new Date(pattern.reviewHistory.reviewedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-slate-500">Decision:</span>{' '}
                      <span className="font-mono font-semibold text-slate-200">
                        {pattern.reviewHistory.decision.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Reviewed By:</span>{' '}
                      <span className="text-slate-300">
                        {pattern.reviewHistory.reviewedBy.displayName} ({pattern.reviewHistory.reviewedBy.role})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Recorded Rationale:</span>{' '}
                      <span className="text-slate-300 italic">"{pattern.reviewHistory.rationale}"</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Review Decision Submission Form */}
              {canReview ? (
                <form
                  onSubmit={handleSubmitReview}
                  className="bg-slate-950/90 border border-indigo-950 rounded-lg p-4 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-200 font-mono uppercase tracking-wide">
                      Submit Human Triage Decision
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Authorised Role: {userRole}
                    </span>
                  </div>

                  {submitSuccess && (
                    <div className="p-2.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4" />
                      <span>Review decision successfully recorded and audit-logged.</span>
                    </div>
                  )}

                  {submitError && (
                    <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-slate-400 font-medium">Evaluation Decision</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setDecision('RELEVANT_FOR_FOLLOWUP')}
                        className={`px-3 py-2 rounded border text-xs font-medium text-left transition ${
                          decision === 'RELEVANT_FOR_FOLLOWUP'
                            ? 'bg-emerald-950/80 border-emerald-600 text-emerald-200 font-semibold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="font-semibold">Relevant for Follow-up</div>
                        <div className="text-[10px] opacity-75">Merits investigative enquiry</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDecision('UNDER_REVIEW')}
                        className={`px-3 py-2 rounded border text-xs font-medium text-left transition ${
                          decision === 'UNDER_REVIEW'
                            ? 'bg-indigo-950/80 border-indigo-600 text-indigo-200 font-semibold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="font-semibold">Under Review</div>
                        <div className="text-[10px] opacity-75">Needs further corroboration</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDecision('NOT_RELEVANT')}
                        className={`px-3 py-2 rounded border text-xs font-medium text-left transition ${
                          decision === 'NOT_RELEVANT'
                            ? 'bg-slate-800 border-slate-600 text-slate-200 font-semibold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="font-semibold">Not Relevant</div>
                        <div className="text-[10px] opacity-75">Coincidental association</div>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="rationale" className="text-slate-400 font-medium">
                        Investigative Rationale (Mandatory)
                      </label>
                      <span
                        className={`font-mono text-[10px] ${
                          rationale.trim().length >= 5 ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        {rationale.trim().length} / 5 min chars
                      </span>
                    </div>
                    <textarea
                      id="rationale"
                      rows={3}
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                      placeholder="Explain the factual reason for marking this pattern as relevant, under review, or not relevant..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-md p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || rationale.trim().length < 5}
                      className="px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {submitting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Recording...</span>
                        </>
                      ) : (
                        <span>Submit Review Decision</span>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-slate-400 text-xs flex items-center space-x-2">
                  <Info className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>
                    Your active role ({userRole}) has read-only access. Recording pattern review decisions requires CASE_OFFICER, SUPERVISOR, or SYSTEM_ADMIN permissions.
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
