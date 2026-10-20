import React, { useState } from 'react';
import { X, ShieldAlert, RotateCcw, AlertTriangle, Info, MapPin } from 'lucide-react';
import { 
  LocationObservation, 
  ObservationExclusion, 
  excludeCaseObservation, 
  reconsiderCaseObservation 
} from '../../lib/api';
import { useAuth } from '../../app/AuthContext';

interface ObservationExclusionModalProps {
  caseId: string;
  observation: LocationObservation;
  activeExclusion?: ObservationExclusion | null;
  currentHypothesisId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ObservationExclusionModal: React.FC<ObservationExclusionModalProps> = ({
  caseId,
  observation,
  activeExclusion,
  currentHypothesisId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const canMutate =
    user?.role === 'CASE_OFFICER' ||
    user?.role === 'SUPERVISOR' ||
    user?.role === 'SYSTEM_ADMIN';

  const [mode, setMode] = useState<'VIEW' | 'EXCLUDE' | 'RECONSIDER'>('VIEW');
  const [reason, setReason] = useState('');
  const [isCaseLevel, setIsCaseLevel] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExclude = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      setError('Please provide a substantive exclusion reason (minimum 5 characters)');
      return;
    }
    if (!confirmed) {
      setError('Please confirm that you understand this action removes the observation from active analysis');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await excludeCaseObservation(caseId, observation.id, {
        reason: reason.trim(),
        isCaseLevel,
        hypothesisId: isCaseLevel ? undefined : currentHypothesisId,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to exclude observation');
    } finally {
      setLoading(false);
    }
  };

  const handleReconsider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      setError('Please provide a justification for reconsidering this clue (minimum 5 characters)');
      return;
    }
    if (!confirmed) {
      setError('Please confirm re-admission of this clue to the active analysis pool');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await reconsiderCaseObservation(caseId, observation.id, {
        reason: reason.trim(),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reconsider observation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-lg ${activeExclusion ? 'bg-amber-950/60 border border-amber-800/80 text-amber-400' : 'bg-slate-800 border border-slate-700 text-slate-300'}`}>
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white font-mono flex items-center space-x-2">
                <span>Observation {observation.id.slice(0, 8)}</span>
                {activeExclusion ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-950/90 text-rose-400 border border-rose-800">
                    EXCLUDED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                    ACTIVE
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {observation.observationType.replace(/_/g, ' ')} &bull; {new Date(observation.observedAt).toLocaleString()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-lg flex items-start space-x-2 text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Observation Core Facts */}
          <div className="bg-slate-950/80 rounded-lg border border-slate-800 p-3.5 space-y-2.5">
            <div>
              <span className="text-slate-400 text-[11px] font-medium block">Source Narrative / Provenance:</span>
              <p className="text-slate-200 mt-0.5 font-sans leading-relaxed">{observation.sourceDescription}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
              <div>
                <span className="text-slate-400 text-[11px] block">Coordinates:</span>
                <span className="font-mono text-slate-300">
                  {observation.latitude.toFixed(5)}, {observation.longitude.toFixed(5)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Spatial Uncertainty:</span>
                <span className="font-mono text-amber-400">
                  &plusmn;{observation.locationUncertaintyMeters} meters
                </span>
              </div>
            </div>
          </div>

          {/* Active Exclusion Status Card */}
          {activeExclusion && (
            <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-900/60 space-y-2">
              <div className="flex items-center space-x-2 text-amber-400 font-semibold text-xs">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Analyst Exclusion on Record</span>
              </div>
              <p className="text-slate-300 italic text-[11px]">"{activeExclusion.reason}"</p>
              <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-amber-900/40">
                <span>Scope: {activeExclusion.isCaseLevel ? 'Case-Level Decision' : 'Hypothesis Specific'}</span>
                <span>{new Date(activeExclusion.excludedAt).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Educational Safety Banner */}
          <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg flex items-start space-x-2 text-slate-400 text-[11px]">
            <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              <strong>Operational Rule:</strong> Excluding an observation removes it from candidate radius buffers and velocity contradiction checks. The original observation record is <strong>never erased</strong> from the database.
            </span>
          </div>

          {/* Action Modes */}
          {mode === 'VIEW' && (
            <div className="pt-2 flex justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium transition"
              >
                Close
              </button>
              {canMutate && (
                <>
                  {activeExclusion ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('RECONSIDER');
                        setReason('');
                        setConfirmed(false);
                        setError(null);
                      }}
                      className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition flex items-center space-x-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reconsider Clue</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('EXCLUDE');
                        setReason('');
                        setConfirmed(false);
                        setError(null);
                      }}
                      className="px-3.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition flex items-center space-x-1.5"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Exclude from Analysis</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {mode === 'EXCLUDE' && (
            <form onSubmit={handleExclude} className="space-y-3 pt-2 border-t border-slate-800">
              <div className="font-semibold text-rose-300 text-xs flex items-center space-x-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Formulate Observation Exclusion</span>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium text-[11px]">
                  Exclusion Justification <span className="text-rose-400">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Sighting contradicted by corroborated CCTV footage; witness uncertain of precise time."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium text-[11px]">Exclusion Scope</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setIsCaseLevel(true)}
                    className={`p-2 rounded border text-left transition ${
                      isCaseLevel
                        ? 'bg-indigo-950/60 border-indigo-700 text-indigo-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold">Case-Level Exclusion</div>
                    <div className="text-[10px] text-slate-400">Excludes across all hypotheses in case</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsCaseLevel(false)}
                    className={`p-2 rounded border text-left transition ${
                      !isCaseLevel
                        ? 'bg-indigo-950/60 border-indigo-700 text-indigo-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold">Hypothesis-Specific</div>
                    <div className="text-[10px] text-slate-400">Excludes from current candidate zone only</div>
                  </button>
                </div>
              </div>

              <label className="flex items-start space-x-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
                />
                <span className="text-slate-300 text-[11px] leading-tight select-none">
                  I confirm this observation should be excluded from active calculations. The clue remains in the evidentiary record.
                </span>
              </label>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setMode('VIEW')}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !confirmed}
                  className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold transition flex items-center space-x-1.5"
                >
                  {loading ? 'Excluding...' : 'Submit Exclusion'}
                </button>
              </div>
            </form>
          )}

          {mode === 'RECONSIDER' && (
            <form onSubmit={handleReconsider} className="space-y-3 pt-2 border-t border-slate-800">
              <div className="font-semibold text-emerald-300 text-xs flex items-center space-x-1.5">
                <RotateCcw className="w-4 h-4 text-emerald-400" />
                <span>Reconsider & Restore Observation</span>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium text-[11px]">
                  Reconsideration Justification <span className="text-emerald-400">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. New corroborated evidence confirms sighting timestamp was accurate; re-admitting to analysis."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <label className="flex items-start space-x-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-950 text-emerald-600 focus:ring-0"
                />
                <span className="text-slate-300 text-[11px] leading-tight select-none">
                  I confirm this observation should be restored to the active contradiction and search area models.
                </span>
              </label>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setMode('VIEW')}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !confirmed}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition flex items-center space-x-1.5"
                >
                  {loading ? 'Restoring...' : 'Confirm Reconsideration'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
