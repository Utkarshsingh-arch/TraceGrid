import React, { useState } from 'react';
import { X, Ban, AlertCircle, Check } from 'lucide-react';
import { cancelTask, CancelTaskPayload, InvestigationTask } from '../../lib/api';

interface CancelTaskModalProps {
  task: InvestigationTask;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CancelTaskModal: React.FC<CancelTaskModalProps> = ({
  task,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [cancellationReason, setCancellationReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cancellationReason.trim().length < 5) {
      setError('Operational cancellation reason (minimum 5 characters) is required.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: CancelTaskPayload = {
        cancellationReason: cancellationReason.trim(),
      };
      await cancelTask(task.id, payload);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-rose-400">
            <Ban className="w-5 h-5" />
            <h3 className="font-semibold text-white text-base">Cancel Investigation Task</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 rounded hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded text-xs space-y-1">
          <div className="font-mono text-slate-200 font-bold">{task.taskReference}</div>
          <div className="text-slate-300 font-medium">{task.title}</div>
        </div>

        {error && (
          <div className="p-3 rounded bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Cancellation Reason & Rationale <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              required
              placeholder="Explain why this action item is no longer required or rendered moot by other evidence."
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-slate-200 focus:outline-none focus:border-rose-500 leading-relaxed"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Keep Task
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{loading ? 'Cancelling...' : 'Confirm Cancellation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
