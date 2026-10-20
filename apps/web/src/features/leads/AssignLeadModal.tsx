import React, { useState } from 'react';
import { X, UserCheck, AlertCircle, Check } from 'lucide-react';
import { assignLead, AssignLeadPayload } from '../../lib/api';

interface AssignLeadModalProps {
  leadId: string;
  leadReference: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  eligibleAssignees: Array<{ id: string; displayName: string; badgeNumber: string | null; role: string }>;
}

export const AssignLeadModal: React.FC<AssignLeadModalProps> = ({
  leadId,
  leadReference,
  isOpen,
  onClose,
  onSuccess,
  eligibleAssignees,
}) => {
  const [assignedUserId, setAssignedUserId] = useState(
    eligibleAssignees.length > 0 ? eligibleAssignees[0].id : ''
  );
  const [reassignmentReason, setReassignmentReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignedUserId) {
      setError('Please select an investigator from the eligible pool.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: AssignLeadPayload = {
        assignedUserId,
        reassignmentReason: reassignmentReason.trim() || undefined,
      };
      await assignLead(leadId, payload);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-indigo-400">
            <UserCheck className="w-5 h-5" />
            <h3 className="font-semibold text-white text-base">Assign Lead Investigator</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 rounded hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-xs text-slate-400">
          Assigning investigator to lead <span className="font-mono font-bold text-slate-200">{leadReference}</span>.
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
              Select Officer / Investigator <span className="text-rose-400">*</span>
            </label>
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {eligibleAssignees.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} ({user.badgeNumber ? `Badge ${user.badgeNumber}` : user.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Tasking Notes / Assignment Rationale
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Field verification assigned for local CCTV pull and shopkeeper inquiries."
              value={reassignmentReason}
              onChange={(e) => setReassignmentReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{loading ? 'Assigning...' : 'Confirm Assignment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
