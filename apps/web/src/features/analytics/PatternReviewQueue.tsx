import React, { useState, useMemo } from 'react';
import {
  Search,
  AlertTriangle,
  ArrowRight,
  Eye,
  RefreshCw,
} from 'lucide-react';
import {
  PatternAnalyticsResult,
  Role,
} from '../../lib/api';
import { PatternDetailModal } from './PatternDetailModal';

interface PatternReviewQueueProps {
  data: PatternAnalyticsResult | null;
  loading: boolean;
  onRefresh: () => void;
  userRole?: Role;
}

export const PatternReviewQueue: React.FC<PatternReviewQueueProps> = ({
  data,
  loading,
  onRefresh,
  userRole,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Modal State
  const [activeModalPattern, setActiveModalPattern] = useState<{
    patternId: string;
    initiatingCaseId: string;
  } | null>(null);

  const patterns = data?.backlog;
  const items = data?.reviewQueueItems || [];

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Text search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesRef =
          item.initiatingCaseReference.toLowerCase().includes(query) ||
          item.candidateCaseReference.toLowerCase().includes(query) ||
          item.patternId.toLowerCase().includes(query);
        if (!matchesRef) return false;
      }

      // Priority filter
      if (selectedPriority !== 'ALL' && item.reviewPriority !== selectedPriority) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'ALL' && item.primaryCategory !== selectedCategory) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'ALL' && item.reviewStatus !== selectedStatus) {
        return false;
      }

      return true;
    });
  }, [items, searchTerm, selectedPriority, selectedCategory, selectedStatus]);

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
    <div className="space-y-6">
      {/* Triage Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1">
          <span className="text-[11px] font-mono text-slate-400">Total Patterns</span>
          <div className="text-xl font-bold font-mono text-white">
            {patterns?.totalDistinctPatterns ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Distinct Case Pairs</span>
        </div>

        <div className="bg-slate-900 border border-amber-900/40 rounded-lg p-3 space-y-1">
          <span className="text-[11px] font-mono text-amber-400">Unverified</span>
          <div className="text-xl font-bold font-mono text-amber-300">
            {patterns?.unverifiedCandidates ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Awaiting Triage</span>
        </div>

        <div className="bg-slate-900 border border-emerald-900/40 rounded-lg p-3 space-y-1">
          <span className="text-[11px] font-mono text-emerald-400">Relevant Followup</span>
          <div className="text-xl font-bold font-mono text-emerald-300">
            {patterns?.relevantForFollowup ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Action Recommended</span>
        </div>

        <div className="bg-slate-900 border border-indigo-900/40 rounded-lg p-3 space-y-1">
          <span className="text-[11px] font-mono text-indigo-400">Under Review</span>
          <div className="text-xl font-bold font-mono text-indigo-300">
            {patterns?.underReview ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Corroboration Ongoing</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1">
          <span className="text-[11px] font-mono text-slate-400">Not Relevant</span>
          <div className="text-xl font-bold font-mono text-slate-400">
            {patterns?.notRelevant ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Coincidental / Dismissed</span>
        </div>
      </div>

      {/* Mandatory Governance Warning */}
      <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-3.5 flex items-start space-x-3 text-xs">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold text-slate-200">Investigation Triage Disclaimer</span>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Unverified analytical association. Similarity does not establish identity, common causation, suspect status, or a confirmed connection between cases. Cross-case review is an investigative triage aid and must be verified by sworn personnel.
          </p>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search reference or pattern ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Priority Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 font-mono text-[11px]">Priority:</span>
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Priorities</option>
              <option value="HIGH">High Priority</option>
              <option value="MEDIUM">Medium Priority</option>
              <option value="LOW">Low Priority</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 font-mono text-[11px]">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="UNVERIFIED_CANDIDATE">Unverified Candidate</option>
              <option value="RELEVANT_FOR_FOLLOWUP">Relevant for Follow-up</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="NOT_RELEVANT">Not Relevant</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 font-mono text-[11px]">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Categories</option>
              <option value="SPATIAL_PROXIMITY">Spatial Proximity</option>
              <option value="TEMPORAL_WINDOW_OVERLAP">Temporal Overlap</option>
              <option value="DESCRIPTOR_CORRELATION">Descriptor Match</option>
              <option value="MULTI_SIGNAL_ASSOCIATION">Multi-Signal</option>
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
          <span className="text-[11px] font-mono text-slate-400">
            Showing {filteredItems.length} of {items.length}
          </span>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition disabled:opacity-50"
            title="Refresh review queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Review Queue Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-mono text-[11px]">
                <th className="py-3 px-4 font-semibold">Pattern ID</th>
                <th className="py-3 px-3 font-semibold">Priority</th>
                <th className="py-3 px-3 font-semibold">Primary Signal</th>
                <th className="py-3 px-4 font-semibold">Associated Cases</th>
                <th className="py-3 px-3 font-semibold">Signals</th>
                <th className="py-3 px-3 font-semibold">Review Status</th>
                <th className="py-3 px-4 font-semibold">Last Reviewed</th>
                <th className="py-3 px-4 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      <span className="font-mono text-xs">Evaluating cross-case signals...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <p className="font-mono text-xs">No pattern candidates match the current filters.</p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr
                    key={item.patternId}
                    className="hover:bg-slate-800/40 transition group cursor-pointer"
                    onClick={() =>
                      setActiveModalPattern({
                        patternId: item.patternId,
                        initiatingCaseId: item.initiatingCaseId,
                      })
                    }
                  >
                    {/* Pattern ID */}
                    <td className="py-3 px-4 font-mono font-medium text-slate-300">
                      <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[11px] group-hover:border-slate-700">
                        {item.patternId.slice(0, 16)}...
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${getPriorityBadgeClass(
                          item.reviewPriority
                        )}`}
                      >
                        {item.reviewPriority}
                      </span>
                    </td>

                    {/* Primary Signal */}
                    <td className="py-3 px-3">
                      <span className="text-[11px] font-mono text-slate-300">
                        {item.primaryCategory.replace(/_/g, ' ')}
                      </span>
                    </td>

                    {/* Associated Cases */}
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-1.5 font-mono text-xs">
                        <span className="text-white font-semibold">{item.initiatingCaseReference}</span>
                        <ArrowRight className="w-3 h-3 text-slate-500" />
                        <span className="text-slate-300">{item.candidateCaseReference}</span>
                      </div>
                    </td>

                    {/* Signals Count */}
                    <td className="py-3 px-3 font-mono text-[11px] text-indigo-400">
                      {item.signalsCount} signal{item.signalsCount > 1 ? 's' : ''}
                    </td>

                    {/* Review Status */}
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${getStatusBadgeClass(
                          item.reviewStatus
                        )}`}
                      >
                        {item.reviewStatus.replace(/_/g, ' ')}
                      </span>
                    </td>

                    {/* Last Reviewed */}
                    <td className="py-3 px-4 text-[11px] text-slate-400">
                      {item.lastReviewedAt ? (
                        <div>
                          <div>{new Date(item.lastReviewedAt).toLocaleDateString()}</div>
                          <div className="text-[10px] text-slate-500">{item.reviewedBy}</div>
                        </div>
                      ) : (
                        <span className="text-slate-600 font-mono">Unreviewed</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveModalPattern({
                            patternId: item.patternId,
                            initiatingCaseId: item.initiatingCaseId,
                          });
                        }}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition"
                      >
                        <Eye className="w-3 h-3 text-indigo-400" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pattern Detail Modal */}
      <PatternDetailModal
        isOpen={!!activeModalPattern}
        patternId={activeModalPattern?.patternId || null}
        initiatingCaseId={activeModalPattern?.initiatingCaseId || null}
        onClose={() => setActiveModalPattern(null)}
        onReviewSuccess={onRefresh}
        userRole={userRole}
      />
    </div>
  );
};
