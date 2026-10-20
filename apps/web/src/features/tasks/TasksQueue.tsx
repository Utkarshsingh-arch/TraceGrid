import React, { useState, useEffect, useCallback } from 'react';
import { 
  PlusCircle, 
  Search, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Ban, 
  UserCheck, 
  Clock, 
  Inbox,
  AlertTriangle
} from 'lucide-react';
import { 
  InvestigationTask, 
  TaskStatus, 
  TaskPriority, 
  getCaseTasks, 
  getEligibleAssignees,
  getCaseLeads 
} from '../../lib/api';
import { useAuth } from '../../app/AuthContext';
import { getTaskStatusBadge, getTaskPriorityBadge } from './taskHelpers';
import { CreateTaskModal } from './CreateTaskModal';
import { CompleteTaskModal } from './CompleteTaskModal';
import { CancelTaskModal } from './CancelTaskModal';
import { AssignTaskModal } from './AssignTaskModal';

interface TasksQueueProps {
  caseId: string;
}

export const TasksQueue: React.FC<TasksQueueProps> = ({ caseId }) => {
  const { canCreateTask, canManageTasks } = useAuth();

  const [tasks, setTasks] = useState<InvestigationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Eligible assignees and leads for association
  const [eligibleAssignees, setEligibleAssignees] = useState<any[]>([]);
  const [caseLeads, setCaseLeads] = useState<any[]>([]);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  const [selectedTask, setSelectedTask] = useState<InvestigationTask | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { limit: 100 };
      if (statusFilter !== 'ALL') params.status = statusFilter as TaskStatus;
      if (priorityFilter !== 'ALL') params.priority = priorityFilter as TaskPriority;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await getCaseTasks(caseId, params);
      setTasks(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch task queue');
    } finally {
      setLoading(false);
    }
  }, [caseId, statusFilter, priorityFilter, searchQuery]);

  // Load assignees & leads
  useEffect(() => {
    const loadPrerequisites = async () => {
      try {
        const [assignees, leadsRes] = await Promise.all([
          getEligibleAssignees(caseId),
          getCaseLeads(caseId, { limit: 100 }),
        ]);
        setEligibleAssignees(assignees);
        setCaseLeads(leadsRes.data);
      } catch {
        // Soft fallback
      }
    };
    loadPrerequisites();
  }, [caseId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const activeCount = tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length;
  const overdueCount = tasks.filter((t) => t.isOverdue).length;

  return (
    <div className="space-y-4">
      {/* Action and Filter Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Status Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="IN_PROGRESS">IN PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded pl-7 pr-2 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-[11px] w-36 sm:w-48"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1.5" />
          </div>

          <button
            onClick={() => fetchTasks()}
            title="Refresh Tasks"
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Primary Action */}
        <div className="flex items-center space-x-2">
          {overdueCount > 0 && (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800 flex items-center space-x-1">
              <AlertTriangle className="w-3 h-3" />
              <span>{overdueCount} OVERDUE</span>
            </span>
          )}

          {canCreateTask && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition flex items-center space-x-1.5 shadow"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Create Task</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Closure Invariant Notice */}
      {activeCount > 0 && (
        <div className="px-3 py-2 bg-slate-950/50 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {activeCount} active task{activeCount > 1 ? 's' : ''} in progress. Active tasks prevent case closure until resolved or cancelled.
            </span>
          </div>
          <span className="font-mono text-slate-500 text-[10px]">INVARIANT GUARD</span>
        </div>
      )}

      {/* Task Queue Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 text-[10px] text-slate-400 uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Reference</th>
                <th className="py-2.5 px-3">Task Details</th>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Due Date</th>
                <th className="py-2.5 px-3">Assigned Officer</th>
                <th className="py-2.5 px-3">Related Lead</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && tasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 italic">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                    Loading investigation tasks...
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    <Inbox className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                    <span>No tasks found matching current filters.</span>
                  </td>
                </tr>
              ) : (
                tasks.map((task) => {
                  const statusBadge = getTaskStatusBadge(task.status);
                  const priorityBadge = getTaskPriorityBadge(task.priority);
                  const isClosed = task.status === 'COMPLETED' || task.status === 'CANCELLED';

                  return (
                    <tr key={task.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-200 whitespace-nowrap">
                        {task.taskReference}
                      </td>

                      <td className="py-2.5 px-3 max-w-sm">
                        <div className="font-semibold text-slate-100">{task.title}</div>
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{task.description}</p>
                        {task.outcomeNotes && (
                          <p className="text-[10px] text-emerald-400/90 font-mono mt-0.5 line-clamp-1">
                            Outcome: {task.outcomeNotes}
                          </p>
                        )}
                        {task.cancellationReason && (
                          <p className="text-[10px] text-rose-400/90 font-mono mt-0.5 line-clamp-1">
                            Cancelled: {task.cancellationReason}
                          </p>
                        )}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${priorityBadge.className}`}>
                          {priorityBadge.label}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${statusBadge.className}`}>
                          {statusBadge.label}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px] font-mono">
                        <div className={task.isOverdue ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                          {new Date(task.dueDate).toLocaleDateString()} {new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {task.isOverdue && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-mono uppercase bg-rose-950 text-rose-300 border border-rose-800 inline-block mt-0.5">
                            OVERDUE
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                        {task.assignedUser ? (
                          <span className="text-[11px] font-medium">{task.assignedUser.displayName}</span>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">Unassigned</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]">
                        {task.lead ? (
                          <span className="text-indigo-400 hover:underline">
                            {task.lead.leadReference}
                          </span>
                        ) : (
                          <span className="text-slate-600">&mdash;</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1">
                          {canManageTasks && !isClosed && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedTask(task);
                                  setAssignModalOpen(true);
                                }}
                                title="Reassign Task"
                                className="p-1 rounded hover:bg-slate-700 text-indigo-400 hover:text-indigo-300 transition"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedTask(task);
                                  setCompleteModalOpen(true);
                                }}
                                title="Mark Completed (Notes Mandatory)"
                                className="p-1 rounded hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 transition"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedTask(task);
                                  setCancelModalOpen(true);
                                }}
                                title="Cancel Task (Reason Mandatory)"
                                className="p-1 rounded hover:bg-slate-700 text-rose-400 hover:text-rose-300 transition"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Task Modal */}
      <CreateTaskModal
        caseId={caseId}
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => fetchTasks()}
        eligibleAssignees={eligibleAssignees}
        caseLeads={caseLeads}
      />

      {/* Assign Modal */}
      {selectedTask && (
        <AssignTaskModal
          task={selectedTask}
          isOpen={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          onSuccess={() => fetchTasks()}
          eligibleAssignees={eligibleAssignees}
        />
      )}

      {/* Complete Modal */}
      {selectedTask && (
        <CompleteTaskModal
          task={selectedTask}
          isOpen={completeModalOpen}
          onClose={() => setCompleteModalOpen(false)}
          onSuccess={() => fetchTasks()}
        />
      )}

      {/* Cancel Modal */}
      {selectedTask && (
        <CancelTaskModal
          task={selectedTask}
          isOpen={cancelModalOpen}
          onClose={() => setCancelModalOpen(false)}
          onSuccess={() => fetchTasks()}
        />
      )}
    </div>
  );
};
