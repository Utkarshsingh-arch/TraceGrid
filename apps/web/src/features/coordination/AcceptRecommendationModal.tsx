import React, { useState } from 'react';
import { X, CheckSquare, AlertTriangle, ShieldCheck } from 'lucide-react';
import { 
  InvestigationTaskRecommendation, 
  InvestigationTask, 
  Priority, 
  acceptCaseRecommendation, 
  getEligibleAssignees 
} from '../../lib/api';

interface AcceptRecommendationModalProps {
  caseId: string;
  recommendation: InvestigationTaskRecommendation | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (task: InvestigationTask) => void;
}

export const AcceptRecommendationModal: React.FC<AcceptRecommendationModalProps> = ({
  caseId,
  recommendation,
  isOpen,
  onClose,
  onSuccess,
}) => {
  if (!isOpen || !recommendation) return null;

  const [title, setTitle] = useState(recommendation.title);
  const [description, setDescription] = useState(recommendation.description);
  const [priority, setPriority] = useState<Priority>(recommendation.suggestedPriority || 'MEDIUM');
  const [dueDate, setDueDate] = useState<string>(
    recommendation.suggestedDueDate
      ? new Date(recommendation.suggestedDueDate).toISOString().slice(0, 16)
      : new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16)
  );
  const [assignedUserId, setAssignedUserId] = useState<string>('');
  const [eligibleAssignees, setEligibleAssignees] = useState<any[]>([]);
  const [assigneesLoaded, setAssigneesLoaded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy load eligible assignees
  React.useEffect(() => {
    if (isOpen && !assigneesLoaded) {
      getEligibleAssignees(caseId)
        .then((data) => {
          setEligibleAssignees(data);
          setAssigneesLoaded(true);
        })
        .catch(() => {});
    }
  }, [isOpen, caseId, assigneesLoaded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || title.trim().length < 3) {
      setError('Task title must be at least 3 characters');
      return;
    }
    if (!description.trim() || description.trim().length < 5) {
      setError('Task description must be at least 5 characters');
      return;
    }
    if (!confirmed) {
      setError('Please confirm that you have reviewed and approved this operational task creation');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const createdTask = await acceptCaseRecommendation(caseId, {
        recommendationId: recommendation.id,
        title: title.trim(),
        description: description.trim(),
        dueDate: new Date(dueDate).toISOString(),
        priority,
        assignedUserId: assignedUserId || undefined,
        leadId: recommendation.relatedLeadId || undefined,
      });

      onSuccess(createdTask);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept recommendation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-indigo-950/60 border border-indigo-800 text-indigo-400">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white font-mono">Accept & Create Investigation Task</h2>
              <p className="text-xs text-slate-400 mt-0.5">Origin: Recommendation {recommendation.id}</p>
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
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-lg flex items-start space-x-2 text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Triggering rationale */}
          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1">
            <span className="text-slate-400 font-semibold text-[11px] block">Triggering Rationale:</span>
            <p className="text-slate-300 italic">{recommendation.triggeringConditions}</p>
          </div>

          <div>
            <label className="block text-slate-300 mb-1 font-medium text-[11px]">
              Task Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1 font-medium text-[11px]">
              Task Description & Directives <span className="text-rose-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1 font-medium text-[11px]">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 mb-1 font-medium text-[11px]">Target Due Date</label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 mb-1 font-medium text-[11px]">
              Assign Investigator (Optional)
            </label>
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">-- Unassigned (Triage in Tasks Queue) --</option>
              {eligibleAssignees.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} ({user.badgeNumber ? `Badge ${user.badgeNumber}` : user.role})
                </option>
              ))}
            </select>
          </div>

          {/* Operational Safety Notice */}
          <div className="p-3 bg-indigo-950/20 border border-indigo-900/50 rounded-lg space-y-1.5 text-[11px] text-slate-400">
            <div className="flex items-center space-x-1.5 text-indigo-300 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Operational Boundary Confirmation</span>
            </div>
            <p>
              Acceptance creates a formal <code>InvestigationTask</code> in the active queue with status <code>PENDING</code>. It strictly <strong>does not auto-dispatch personnel or contact witnesses</strong>.
            </p>
          </div>

          <label className="flex items-start space-x-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
            />
            <span className="text-slate-300 text-[11px] leading-tight select-none">
              I have reviewed this recommendation and confirm the creation of this investigative task.
            </span>
          </label>

          <div className="pt-2 flex justify-end space-x-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-3.5 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !confirmed}
              className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition flex items-center space-x-1.5 shadow"
            >
              {submitting ? 'Creating Task...' : 'Accept & Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
