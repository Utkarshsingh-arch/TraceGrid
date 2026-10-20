import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  FileSpreadsheet,
  RefreshCw,
  MapPin,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../app/AuthContext';
import {
  CaseloadAnalyticsResult,
  TrendsAnalyticsResult,
  TaskAnalyticsResult,
  PatternAnalyticsResult,
  Jurisdiction,
  getCaseloadSummary,
  getActivityAndResolutionTrends,
  getTaskBacklogMetrics,
  getPatternReviewBacklog,
  getJurisdictions,
} from '../../lib/api';
import { OperationsDashboard } from './OperationsDashboard';
import { PatternReviewQueue } from './PatternReviewQueue';
import { OperationalReports } from './OperationalReports';

export type OperationsTab = 'dashboard' | 'patterns' | 'reports';

interface OperationsHubProps {
  initialTab?: OperationsTab;
}

export const OperationsHub: React.FC<OperationsHubProps> = ({ initialTab = 'dashboard' }) => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Tab Management
  const tabParam = (searchParams.get('tab') as OperationsTab) || initialTab;
  const [activeTab, setActiveTab] = useState<OperationsTab>(
    ['dashboard', 'patterns', 'reports'].includes(tabParam) ? tabParam : 'dashboard'
  );

  const handleTabChange = (tab: OperationsTab) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'dashboard') {
        next.delete('tab');
      } else {
        next.set('tab', tab);
      }
      return next;
    });
  };

  // Jurisdiction Scoping State
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([]);
  const isSystemAdmin = user?.role === 'SYSTEM_ADMIN';
  const [selectedJurisdictionId, setSelectedJurisdictionId] = useState<string | undefined>(
    isSystemAdmin ? undefined : user?.jurisdictionId || undefined
  );

  // Interval & Bucket State
  const [windowDays, setWindowDays] = useState<number>(30);
  const [bucket, setBucket] = useState<'day' | 'week' | 'month'>('day');

  // Analytics Data State
  const [caseload, setCaseload] = useState<CaseloadAnalyticsResult | null>(null);
  const [trends, setTrends] = useState<TrendsAnalyticsResult | null>(null);
  const [tasks, setTasks] = useState<TaskAnalyticsResult | null>(null);
  const [patterns, setPatterns] = useState<PatternAnalyticsResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Load available jurisdictions for SYSTEM_ADMIN dropdown
  useEffect(() => {
    getJurisdictions()
      .then((jurs) => setJurisdictions(jurs))
      .catch((err) => console.warn('Could not load jurisdictions list:', err));
  }, []);

  // Update scope when switching persona
  useEffect(() => {
    if (user?.role === 'SYSTEM_ADMIN') {
      setSelectedJurisdictionId(undefined);
    } else {
      setSelectedJurisdictionId(user?.jurisdictionId || undefined);
    }
  }, [user?.role, user?.jurisdictionId]);

  // Unified Data Fetcher
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const jurId = selectedJurisdictionId;
      const [caseRes, trendRes, taskRes, patternRes] = await Promise.all([
        getCaseloadSummary({ jurisdictionId: jurId }),
        getActivityAndResolutionTrends({
          jurisdictionId: jurId,
          windowDays,
          bucket,
        }),
        getTaskBacklogMetrics({ jurisdictionId: jurId }),
        getPatternReviewBacklog({ jurisdictionId: jurId }),
      ]);

      setCaseload(caseRes);
      setTrends(trendRes);
      setTasks(taskRes);
      setPatterns(patternRes);
      setLastRefreshedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve operational analytics');
    } finally {
      setLoading(false);
    }
  }, [selectedJurisdictionId, windowDays, bucket]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute label for scope indicator
  const scopeLabel = isSystemAdmin
    ? selectedJurisdictionId
      ? jurisdictions.find((j) => j.id === selectedJurisdictionId)?.name || 'Filtered District'
      : 'Platform-Wide (All Jurisdictions)'
    : user?.jurisdiction?.name || 'Assigned Jurisdiction';

  return (
    <div className="space-y-6">
      {/* Top Operational Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-bold text-white font-mono tracking-tight">
              OPERATIONS & ANALYTICS
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-indigo-950 text-indigo-300 border border-indigo-800">
              OPS HUB
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Real-time caseload metrics, cross-case pattern review queue, and compliance reporting.
          </p>
        </div>

        {/* Scope Pill & Refresh Action */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Scope Indicator / Dropdown */}
          <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-md text-xs font-mono text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            {isSystemAdmin ? (
              <select
                value={selectedJurisdictionId || ''}
                onChange={(e) => setSelectedJurisdictionId(e.target.value || undefined)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-slate-200">
                  Platform-Wide (All Districts)
                </option>
                {jurisdictions.map((j) => (
                  <option key={j.id} value={j.id} className="bg-slate-900 text-slate-200">
                    {j.name} ({j.code})
                  </option>
                ))}
              </select>
            ) : (
              <span>{scopeLabel}</span>
            )}
          </div>

          {/* Last Refreshed & Refresh Button */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
              Refreshed {lastRefreshedAt.toLocaleTimeString()}
            </span>
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary Sub-Navigation Tabs */}
      <div className="flex items-center space-x-1 border-b border-slate-800 pb-px overflow-x-auto text-xs">
        <button
          onClick={() => handleTabChange('dashboard')}
          className={`px-4 py-2.5 font-medium border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'dashboard'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Operations Dashboard</span>
        </button>

        <button
          onClick={() => handleTabChange('patterns')}
          className={`px-4 py-2.5 font-medium border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'patterns'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Cross-Case Pattern Queue</span>
          {patterns?.backlog?.unverifiedCandidates ? (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
              {patterns.backlog.unverifiedCandidates}
            </span>
          ) : null}
        </button>

        <button
          onClick={() => handleTabChange('reports')}
          className={`px-4 py-2.5 font-medium border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'reports'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Operational Reports</span>
        </button>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="rounded-lg bg-rose-950/60 border border-rose-800 p-4 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadData}
            className="px-2.5 py-1 rounded bg-rose-900/60 hover:bg-rose-900 text-white font-medium text-[11px] transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tab Panels */}
      {activeTab === 'dashboard' && (
        <OperationsDashboard
          caseload={caseload}
          trends={trends}
          tasks={tasks}
          patterns={patterns}
          loading={loading}
          selectedWindowDays={windowDays}
          onWindowChange={setWindowDays}
          selectedBucket={bucket}
          onBucketChange={setBucket}
          onRefresh={loadData}
        />
      )}

      {activeTab === 'patterns' && (
        <PatternReviewQueue
          data={patterns}
          loading={loading}
          onRefresh={loadData}
          userRole={user?.role}
        />
      )}

      {activeTab === 'reports' && (
        <OperationalReports
          jurisdictionId={selectedJurisdictionId}
          userRole={user?.role}
        />
      )}
    </div>
  );
};
