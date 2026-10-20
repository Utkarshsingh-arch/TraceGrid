import { TaskStatus, TaskPriority } from '../../lib/api';

export function getTaskStatusBadge(status: TaskStatus) {
  switch (status) {
    case 'PENDING':
      return {
        label: 'PENDING',
        className: 'bg-slate-800 text-slate-300 border-slate-700',
      };
    case 'IN_PROGRESS':
      return {
        label: 'IN PROGRESS',
        className: 'bg-blue-950/80 text-blue-300 border-blue-800',
      };
    case 'COMPLETED':
      return {
        label: 'COMPLETED',
        className: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
      };
    case 'CANCELLED':
      return {
        label: 'CANCELLED',
        className: 'bg-rose-950/80 text-rose-300 border-rose-800',
      };
    default:
      return {
        label: status,
        className: 'bg-slate-800 text-slate-400 border-slate-700',
      };
  }
}

export function getTaskPriorityBadge(priority: TaskPriority) {
  switch (priority) {
    case 'CRITICAL':
      return {
        label: 'CRITICAL',
        className: 'bg-rose-950/80 text-rose-300 border-rose-800',
      };
    case 'HIGH':
      return {
        label: 'HIGH',
        className: 'bg-amber-950/80 text-amber-300 border-amber-800',
      };
    case 'MEDIUM':
      return {
        label: 'MEDIUM',
        className: 'bg-indigo-950/80 text-indigo-300 border-indigo-800',
      };
    case 'LOW':
      return {
        label: 'LOW',
        className: 'bg-slate-800 text-slate-400 border-slate-700',
      };
    default:
      return {
        label: priority,
        className: 'bg-slate-800 text-slate-400 border-slate-700',
      };
  }
}
