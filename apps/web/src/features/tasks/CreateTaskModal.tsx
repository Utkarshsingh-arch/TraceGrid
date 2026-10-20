import React, { useState } from 'react';
import { X, CheckSquare, AlertCircle, Check } from 'lucide-react';
import { createCaseTask, CreateTaskPayload, TaskPriority } from '../../lib/api';

interface CreateTaskModalProps {
  caseId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  eligibleAssignees: Array<{ id: string; displayName: string; badgeNumber: string | null; role: string }>;
  caseLeads: Array<{ id: string; leadReference: string; narrative: string }>;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  caseId,
  isOpen,
  onClose,
  onSuccess,
  eligibleAssignees,
  caseLeads,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [leadId, setLeadId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) {
      setError('Task title must be at least 3 characters.');
      return;
    }
    if (description.trim().length < 5) {
      setError('Task action description must be at least 5 characters.');
      return;
    }
    if (!dueDate) {
      setError('Target due date and time is mandatory for investigation task accountability.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: CreateTaskPayload = {
        title: title.trim(),
        description: description.trim(),
        priority,
        dueDate: new Date(dueDate).toISOString(),
        assignedUserId: assignedUserId || undefined,
        leadId: leadId || undefined,
      };

      await createCaseTask(caseId, payload);
      // Reset
      setTitle('');
      setDescription('');
      setPriority('MEDIUM');
      setDueDate('');
      setAssignedUserId('');
      setLeadId('');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-indigo-400">
            <CheckSquare className="w-5 h-5" />
            <h3 className="font-semibold text-white text-base">Create Operational Task</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 rounded hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
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
              Task Action Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Canvass shopkeepers near Gate 2 for CCTV footage"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Detailed Action Instructions <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              required
              placeholder="Provide specific instructions, contacts, addresses, or evidentiary standards required."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Priority Tier <span className="text-rose-400">*</span>
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Due Date & Time <span className="text-rose-400">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Assignee Officer (Optional)
              </label>
              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Leave Unassigned (Pool Task)</option>
                {eligibleAssignees.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} ({user.badgeNumber ? `Badge ${user.badgeNumber}` : user.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Related Lead / Sighting (Optional)
              </label>
              <select
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
              >
                <option value="">No Lead Association</option>
                {caseLeads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.leadReference} — {lead.narrative.slice(0, 35)}...
                  </option>
                ))}
              </select>
            </div>
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
              <span>{loading ? 'Creating...' : 'Create Task'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
