import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import {
  OperationalReportJsonResult,
  getOperationalReportJson,
  downloadOperationalReportCsv,
  Role,
} from '../../lib/api';

interface OperationalReportsProps {
  jurisdictionId?: string;
  userRole?: Role;
}

export const OperationalReports: React.FC<OperationalReportsProps> = ({
  jurisdictionId,
  userRole: _userRole,
}) => {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [report, setReport] = useState<OperationalReportJsonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CSV Download State
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const fetchReport = async (days: number) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getOperationalReportJson({
        jurisdictionId,
        windowDays: days,
      });
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate operational report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(windowDays);
  }, [windowDays, jurisdictionId]);

  const handleDownloadCsv = async () => {
    try {
      setDownloading(true);
      setDownloadError(null);
      setDownloadSuccess(null);

      const result = await downloadOperationalReportCsv({
        jurisdictionId,
        windowDays,
      });

      setDownloadSuccess(`Downloaded "${result.filename}" (${Math.round(result.sizeBytes / 1024)} KB)`);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'CSV export request failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      {/* Top Controls Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <h2 className="font-semibold text-slate-200 uppercase font-mono text-xs">
              Operational Reporting & CSV Export
            </h2>
          </div>
          <p className="text-slate-400 text-[11px]">
            Audit-ready caseload, task backlog, and cross-case pattern telemetry export.
          </p>
        </div>

        {/* Reporting Window Controls & Export Action */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-400 font-mono text-[11px]">Window:</span>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(parseInt(e.target.value, 10))}
              className="bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="60">Last 60 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="180">Last 180 Days</option>
              <option value="365">Last 365 Days</option>
            </select>
          </div>

          <button
            onClick={handleDownloadCsv}
            disabled={downloading || loading}
            className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition disabled:opacity-50 shadow-sm"
          >
            {downloading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Generating CSV...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Export Standard CSV</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {downloadSuccess && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{downloadSuccess}</span>
        </div>
      )}

      {downloadError && (
        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{downloadError}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Report Preview */}
      {loading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-12 text-center text-slate-500">
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="font-mono text-xs">Compiling operational report...</span>
          </div>
        </div>
      ) : report ? (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-5">
          {/* Metadata Header */}
          <div className="border-b border-slate-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-[11px] font-mono">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-white text-sm">TraceGrid Operational Report</span>
                <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
                  {report.reportId}
                </span>
              </div>
              <div className="text-slate-400">
                Generated: {new Date(report.generatedAt).toUTCString()} by {report.generatedBy.displayName} ({report.generatedBy.role})
              </div>
            </div>
            <div className="text-right text-slate-400 space-y-0.5">
              <div>
                Scope:{' '}
                <span className="text-indigo-400 font-semibold">
                  {report.scope.jurisdictionCode || 'ALL_JURISDICTIONS'}
                </span>
              </div>
              <div>
                Interval: {report.reportingInterval.startDate} to {report.reportingInterval.endDate} ({report.reportingInterval.windowDays} days)
              </div>
            </div>
          </div>

          {/* Section 1: Caseload Summary */}
          <div className="space-y-2">
            <h3 className="font-mono font-semibold text-slate-200 uppercase text-xs">
              Section 1: Caseload Summary
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px]">Total Accessible Cases</span>
                <div className="text-base font-bold font-mono text-white">
                  {report.caseload.totalCases}
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px]">Active Open</span>
                <div className="text-base font-bold font-mono text-emerald-400">
                  {report.caseload.byState.OPEN}
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px]">Under Review</span>
                <div className="text-base font-bold font-mono text-indigo-300">
                  {report.caseload.byState.UNDER_REVIEW}
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px]">Resolved Closed</span>
                <div className="text-base font-bold font-mono text-slate-400">
                  {report.caseload.byState.CLOSED}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Task Backlog & Overdue SLA */}
          <div className="space-y-2">
            <h3 className="font-mono font-semibold text-slate-200 uppercase text-xs">
              Section 2: Investigation Tasks Backlog
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px]">Total Recorded Tasks</span>
                <div className="text-base font-bold font-mono text-white">
                  {report.tasks.totalTasks}
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px]">Open Active Tasks</span>
                <div className="text-base font-bold font-mono text-blue-300">
                  {report.tasks.openTasksCount}
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px]">Overdue Past Due Date</span>
                <div className={`text-base font-bold font-mono ${
                  report.tasks.overdueTasksCount > 0 ? 'text-rose-400' : 'text-slate-400'
                }`}>
                  {report.tasks.overdueTasksCount}
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px]">Avg Completion Time</span>
                <div className="text-base font-bold font-mono text-slate-300">
                  {report.tasks.averageCompletionHours !== null
                    ? `${report.tasks.averageCompletionHours} hrs`
                    : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Cross-Case Pattern Review Queue */}
          <div className="space-y-2">
            <h3 className="font-mono font-semibold text-slate-200 uppercase text-xs">
              Section 3: Cross-Case Pattern Review Queue
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px]">Total Distinct Patterns</span>
                <div className="text-base font-bold font-mono text-white">
                  {report.patterns.totalDistinctPatterns}
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px]">Unverified Candidates</span>
                <div className="text-base font-bold font-mono text-amber-300">
                  {report.patterns.unverifiedCandidates}
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px]">Relevant for Follow-up</span>
                <div className="text-base font-bold font-mono text-emerald-300">
                  {report.patterns.relevantForFollowup}
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px]">Under Active Review</span>
                <div className="text-base font-bold font-mono text-indigo-300">
                  {report.patterns.underReview}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Governance Disclaimer */}
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-3.5 space-y-1">
            <div className="flex items-center space-x-2 text-slate-300 font-semibold font-mono text-[11px]">
              <ShieldAlert className="w-4 h-4 text-slate-400" />
              <span>Section 4: Operational Governance & Legal Notice</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              {report.disclaimer}
            </p>
          </div>

          {/* CSV Security Defense Footnote */}
          <div className="text-[10px] text-slate-500 font-mono pt-2 border-t border-slate-800/80">
            Security Compliance: RFC-4180 standard formatting. Hardened against CSV Spreadsheet Formula Injection (CWE-1236).
          </div>
        </div>
      ) : null}
    </div>
  );
};
