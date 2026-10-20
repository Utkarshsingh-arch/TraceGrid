import React from 'react';
import {
  BarChart3,
  TrendingUp,
  AlertOctagon,
  Clock,
  CheckCircle2,
  Users,
  Layers,
  FolderOpen,
} from 'lucide-react';
import {
  CaseloadAnalyticsResult,
  TrendsAnalyticsResult,
  TaskAnalyticsResult,
  PatternAnalyticsResult,
} from '../../lib/api';

interface OperationsDashboardProps {
  caseload: CaseloadAnalyticsResult | null;
  trends: TrendsAnalyticsResult | null;
  tasks: TaskAnalyticsResult | null;
  patterns: PatternAnalyticsResult | null;
  loading: boolean;
  selectedWindowDays: number;
  onWindowChange: (days: number) => void;
  selectedBucket: 'day' | 'week' | 'month';
  onBucketChange: (bucket: 'day' | 'week' | 'month') => void;
  onRefresh: () => void;
}

export const OperationsDashboard: React.FC<OperationsDashboardProps> = ({
  caseload,
  trends,
  tasks,
  patterns,
  loading: _loading,
  selectedWindowDays,
  onWindowChange,
  selectedBucket,
  onBucketChange,
  onRefresh: _onRefresh,
}) => {
  const caseData = caseload?.caseload;
  const taskData = tasks?.tasks;
  const trendSummary = trends?.summary;
  const timeSeries = trends?.timeSeries || [];

  // Caseload distribution percentages
  const totalCases = caseData?.totalCases || 0;
  const reportedPct = totalCases > 0 ? Math.round(((caseData?.byState.REPORTED || 0) / totalCases) * 100) : 0;
  const underReviewPct = totalCases > 0 ? Math.round(((caseData?.byState.UNDER_REVIEW || 0) / totalCases) * 100) : 0;
  const openPct = totalCases > 0 ? Math.round(((caseData?.byState.OPEN || 0) / totalCases) * 100) : 0;
  const closedPct = totalCases > 0 ? Math.round(((caseData?.byState.CLOSED || 0) / totalCases) * 100) : 0;

  // Max value in time series for SVG chart scaling
  const maxTrendVal = Math.max(
    1,
    ...timeSeries.map((t) =>
      Math.max(t.reportedCasesCount, t.closedCasesCount, t.reportedLeadsCount, t.completedTasksCount)
    )
  );

  return (
    <div className="space-y-6 text-xs">
      {/* 1. Primary Operational KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Total Cases */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-mono text-[11px]">Total Cases</span>
            <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {caseData?.totalCases ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Accessible Scope</span>
        </div>

        {/* Active Open */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-mono text-[11px]">Active Open</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {caseData?.byState.OPEN ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Under Active Tracing</span>
        </div>

        {/* Under Review */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-mono text-[11px]">Under Review</span>
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
          </div>
          <div className="text-xl font-bold font-mono text-indigo-300">
            {caseData?.byState.UNDER_REVIEW ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Triage & Intake</span>
        </div>

        {/* Closed Cases */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-mono text-[11px]">Resolved</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-400">
            {caseData?.byState.CLOSED ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Closed Lifecycle</span>
        </div>

        {/* Critical Priority */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-mono text-[11px]">Critical</span>
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-300">
            {caseData?.byPriority.CRITICAL ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">High Risk Tier</span>
        </div>

        {/* Active Open Tasks */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-mono text-[11px]">Open Tasks</span>
            <span className="w-2 h-2 rounded-full bg-blue-500" />
          </div>
          <div className="text-xl font-bold font-mono text-blue-300">
            {taskData?.openTasksCount ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Pending & In Progress</span>
        </div>

        {/* Overdue Tasks */}
        <div className={`rounded-lg p-3 space-y-1 border ${
          (taskData?.overdueTasksCount || 0) > 0
            ? 'bg-rose-950/40 border-rose-800'
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-mono text-[11px]">Overdue</span>
            <Clock className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className={`text-xl font-bold font-mono ${
            (taskData?.overdueTasksCount || 0) > 0 ? 'text-rose-400' : 'text-slate-400'
          }`}>
            {taskData?.overdueTasksCount ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Past SLA Target</span>
        </div>

        {/* Pattern Backlog */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-mono text-[11px]">Patterns</span>
            <Layers className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-300">
            {patterns?.backlog?.unverifiedCandidates ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Unverified Signals</span>
        </div>
      </div>

      {/* 2. Visual Distributions: State, Priority & Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Caseload Lifecycle & Priority Breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              <h3 className="font-semibold text-slate-200 uppercase font-mono text-xs">
                Caseload Lifecycle & Priority
              </h3>
            </div>
            <span className="font-mono text-[10px] text-slate-500">
              {caseData?.totalCases ?? 0} Total Active Records
            </span>
          </div>

          {/* State Proportional Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Lifecycle State Partition</span>
              <span className="text-slate-500 font-mono text-[10px]">
                {reportedPct}% Rep / {underReviewPct}% Rev / {openPct}% Open / {closedPct}% Clsd
              </span>
            </div>
            <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
              <div
                style={{ width: `${reportedPct}%` }}
                className="bg-amber-500/80 transition-all duration-500"
                title={`Reported: ${caseData?.byState.REPORTED || 0}`}
              />
              <div
                style={{ width: `${underReviewPct}%` }}
                className="bg-indigo-500/80 transition-all duration-500"
                title={`Under Review: ${caseData?.byState.UNDER_REVIEW || 0}`}
              />
              <div
                style={{ width: `${openPct}%` }}
                className="bg-emerald-500/80 transition-all duration-500"
                title={`Open: ${caseData?.byState.OPEN || 0}`}
              />
              <div
                style={{ width: `${closedPct}%` }}
                className="bg-slate-600/80 transition-all duration-500"
                title={`Closed: ${caseData?.byState.CLOSED || 0}`}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Reported: {caseData?.byState.REPORTED ?? 0}</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                <span>Review: {caseData?.byState.UNDER_REVIEW ?? 0}</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Open: {caseData?.byState.OPEN ?? 0}</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-slate-600" />
                <span>Closed: {caseData?.byState.CLOSED ?? 0}</span>
              </span>
            </div>
          </div>

          {/* Priority Distribution Table */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <span className="text-[11px] text-slate-400 font-medium">Priority Distribution</span>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-slate-950 p-2 rounded border border-rose-950/80">
                <div className="text-[10px] font-mono text-rose-400">CRITICAL</div>
                <div className="text-base font-bold font-mono text-rose-200">
                  {caseData?.byPriority.CRITICAL ?? 0}
                </div>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-amber-950/80">
                <div className="text-[10px] font-mono text-amber-400">HIGH</div>
                <div className="text-base font-bold font-mono text-amber-200">
                  {caseData?.byPriority.HIGH ?? 0}
                </div>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-blue-950/80">
                <div className="text-[10px] font-mono text-blue-400">MEDIUM</div>
                <div className="text-base font-bold font-mono text-blue-200">
                  {caseData?.byPriority.MEDIUM ?? 0}
                </div>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <div className="text-[10px] font-mono text-slate-400">LOW</div>
                <div className="text-base font-bold font-mono text-slate-300">
                  {caseData?.byPriority.LOW ?? 0}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Task Queue Backlog & Officer Workload */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-blue-400" />
              <h3 className="font-semibold text-slate-200 uppercase font-mono text-xs">
                Task Backlog & Officer Allocation
              </h3>
            </div>
            <span className="font-mono text-[10px] text-slate-500">
              {taskData?.unassignedOpenTasksCount ?? 0} Unassigned
            </span>
          </div>

          {/* Task Metrics Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 font-mono">Avg Completion</span>
              <div className="text-sm font-bold font-mono text-slate-200">
                {taskData?.averageCompletionHours !== null && taskData?.averageCompletionHours !== undefined
                  ? `${taskData.averageCompletionHours} hrs`
                  : 'N/A'}
              </div>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 font-mono">Median Completion</span>
              <div className="text-sm font-bold font-mono text-slate-200">
                {taskData?.medianCompletionHours !== null && taskData?.medianCompletionHours !== undefined
                  ? `${taskData.medianCompletionHours} hrs`
                  : 'N/A'}
              </div>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 font-mono">Overdue Ratio</span>
              <div className="text-sm font-bold font-mono text-rose-300">
                {taskData?.openTasksCount
                  ? `${Math.round(((taskData.overdueTasksCount || 0) / taskData.openTasksCount) * 100)}%`
                  : '0%'}
              </div>
            </div>
          </div>

          {/* Assignee Allocation Table */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] text-slate-400 font-medium">Assigned Officer Queue</span>
            <div className="max-h-36 overflow-y-auto border border-slate-800 rounded bg-slate-950/60 divide-y divide-slate-850">
              {(taskData?.openByAssignee || []).length === 0 ? (
                <div className="p-3 text-center text-slate-500 text-[11px]">
                  No active assigned tasks in queue.
                </div>
              ) : (
                taskData?.openByAssignee.map((assignee) => (
                  <div
                    key={assignee.userId}
                    className="flex items-center justify-between px-3 py-1.5 text-[11px] hover:bg-slate-800/40"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-slate-200">{assignee.displayName}</span>
                      {assignee.badgeNumber && (
                        <span className="font-mono text-[10px] text-slate-500">
                          #{assignee.badgeNumber}
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-semibold text-blue-400">
                      {assignee.openTasksCount} open
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Investigation Activity & Resolution Trends */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
        {/* Trend Controls Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-slate-200 uppercase font-mono text-xs">
                Activity & Resolution Trends (Time Series)
              </h3>
            </div>
            <p className="text-[11px] text-slate-500">
              Contiguous UTC reporting window ({trends?.metadata.startDate.slice(0, 10)} to{' '}
              {trends?.metadata.endDate.slice(0, 10)})
            </p>
          </div>

          {/* Window & Bucket Selectors */}
          <div className="flex items-center space-x-3 self-end sm:self-auto">
            {/* Window Days */}
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded border border-slate-800 text-[11px] font-mono">
              <button
                onClick={() => onWindowChange(7)}
                className={`px-2 py-0.5 rounded transition ${
                  selectedWindowDays === 7
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                7D
              </button>
              <button
                onClick={() => onWindowChange(30)}
                className={`px-2 py-0.5 rounded transition ${
                  selectedWindowDays === 30
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                30D
              </button>
              <button
                onClick={() => onWindowChange(90)}
                className={`px-2 py-0.5 rounded transition ${
                  selectedWindowDays === 90
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                90D
              </button>
            </div>

            {/* Bucket Granularity */}
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded border border-slate-800 text-[11px] font-mono">
              <button
                onClick={() => onBucketChange('day')}
                className={`px-2 py-0.5 rounded transition ${
                  selectedBucket === 'day'
                    ? 'bg-slate-700 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => onBucketChange('week')}
                className={`px-2 py-0.5 rounded transition ${
                  selectedBucket === 'week'
                    ? 'bg-slate-700 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => onBucketChange('month')}
                className={`px-2 py-0.5 rounded transition ${
                  selectedBucket === 'month'
                    ? 'bg-slate-700 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Month
              </button>
            </div>
          </div>
        </div>

        {/* Period Summary Totals */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
            <span className="text-[10px] font-mono text-slate-500">Reported In Period</span>
            <div className="text-base font-bold font-mono text-white">
              {trendSummary?.totalReportedInPeriod ?? 0}
            </div>
          </div>
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
            <span className="text-[10px] font-mono text-slate-500">Closed In Period</span>
            <div className="text-base font-bold font-mono text-emerald-400">
              {trendSummary?.totalClosedInPeriod ?? 0}
            </div>
          </div>
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
            <span className="text-[10px] font-mono text-slate-500">Avg Resolution</span>
            <div className="text-base font-bold font-mono text-slate-300">
              {trendSummary?.averageResolutionDays !== null && trendSummary?.averageResolutionDays !== undefined
                ? `${trendSummary.averageResolutionDays} days`
                : 'N/A'}
            </div>
          </div>
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
            <span className="text-[10px] font-mono text-slate-500">Median Resolution</span>
            <div className="text-base font-bold font-mono text-slate-300">
              {trendSummary?.medianResolutionDays !== null && trendSummary?.medianResolutionDays !== undefined
                ? `${trendSummary.medianResolutionDays} days`
                : 'N/A'}
            </div>
          </div>
        </div>

        {/* Trend Bar Chart Visualization */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Activity Volume per Bucket</span>
            <div className="flex items-center space-x-3 text-[10px]">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded bg-indigo-500" />
                <span>Cases Reported</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded bg-emerald-500" />
                <span>Cases Closed</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded bg-amber-500" />
                <span>Leads Logged</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded bg-blue-500" />
                <span>Tasks Completed</span>
              </span>
            </div>
          </div>

          {/* Time Series Bar Chart */}
          <div className="h-44 w-full bg-slate-950 rounded border border-slate-800 p-3 flex items-end space-x-1.5 overflow-x-auto">
            {timeSeries.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-slate-500 font-mono text-xs">
                No trend activity recorded in selected interval.
              </div>
            ) : (
              timeSeries.map((bucket, idx) => {
                const repHeight = Math.max(4, Math.round((bucket.reportedCasesCount / maxTrendVal) * 120));
                const closeHeight = Math.max(4, Math.round((bucket.closedCasesCount / maxTrendVal) * 120));
                const leadHeight = Math.max(4, Math.round((bucket.reportedLeadsCount / maxTrendVal) * 120));
                const taskHeight = Math.max(4, Math.round((bucket.completedTasksCount / maxTrendVal) * 120));

                return (
                  <div
                    key={idx}
                    className="flex-1 min-w-[20px] flex flex-col items-center justify-end h-full space-y-1 group relative"
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col bg-slate-800 border border-slate-700 p-2 rounded shadow-lg text-[10px] font-mono text-slate-200 z-30 whitespace-nowrap">
                      <div className="font-semibold text-white">{bucket.label}</div>
                      <div>Reported Cases: {bucket.reportedCasesCount}</div>
                      <div>Closed Cases: {bucket.closedCasesCount}</div>
                      <div>Leads Logged: {bucket.reportedLeadsCount}</div>
                      <div>Tasks Completed: {bucket.completedTasksCount}</div>
                    </div>

                    {/* Bars Container */}
                    <div className="flex items-end space-x-0.5 w-full justify-center">
                      <div
                        style={{ height: `${repHeight}px` }}
                        className="w-1.5 bg-indigo-500 rounded-t"
                        title={`Reported: ${bucket.reportedCasesCount}`}
                      />
                      <div
                        style={{ height: `${closeHeight}px` }}
                        className="w-1.5 bg-emerald-500 rounded-t"
                        title={`Closed: ${bucket.closedCasesCount}`}
                      />
                      <div
                        style={{ height: `${leadHeight}px` }}
                        className="w-1.5 bg-amber-500 rounded-t"
                        title={`Leads: ${bucket.reportedLeadsCount}`}
                      />
                      <div
                        style={{ height: `${taskHeight}px` }}
                        className="w-1.5 bg-blue-500 rounded-t"
                        title={`Tasks: ${bucket.completedTasksCount}`}
                      />
                    </div>

                    {/* Bucket Label */}
                    <span className="text-[9px] font-mono text-slate-500 truncate max-w-[32px]">
                      {bucket.startDate.slice(5, 10)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
