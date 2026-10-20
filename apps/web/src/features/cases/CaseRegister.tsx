import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Search, 
  Plus, 
  RefreshCw, 
  AlertTriangle, 
  ChevronLeft, 
  ChevronRight, 
  UserPlus, 
  X, 
  Check, 
  ExternalLink 
} from 'lucide-react';
import { 
  InvestigationCase, 
  Jurisdiction, 
  CaseState, 
  Priority, 
  TracingOutcome, 
  BiologicalSex, 
  getCases, 
  getJurisdictions, 
  createCase, 
  CreateCasePayload 
} from '../../lib/api';
import { useAuth } from '../../app/AuthContext';

export const CaseRegister: React.FC = () => {
  const navigate = useNavigate();
  const { user, canLodgeCase } = useAuth();

  // Data state
  const [cases, setCases] = useState<InvestigationCase[]>([]);
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filter state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>('ALL');

  // Lodgement Modal State
  const [lodgeModalOpen, setLodgeModalOpen] = useState<boolean>(false);
  const [submittingLodge, setSubmittingLodge] = useState<boolean>(false);
  const [lodgeError, setLodgeError] = useState<string | null>(null);

  const [newLodgeForm, setNewLodgeForm] = useState<{
    fullName: string;
    aliases: string;
    estimatedAge: string;
    biologicalSex: BiologicalSex;
    identifyingFeatures: string;
    jurisdictionId: string;
    missingSince: string;
    reportedAt: string;
    priority: Priority;
    incidentSummary: string;
  }>({
    fullName: '',
    aliases: '',
    estimatedAge: '',
    biologicalSex: 'UNKNOWN',
    identifyingFeatures: '',
    jurisdictionId: '',
    missingSince: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    reportedAt: new Date().toISOString().slice(0, 16),
    priority: 'MEDIUM',
    incidentSummary: '',
  });

  // Load Jurisdictions
  useEffect(() => {
    getJurisdictions()
      .then((data) => {
        setJurisdictions(data);
        if (data.length > 0 && !newLodgeForm.jurisdictionId) {
          const userJur = data.find((j) => j.id === user?.jurisdictionId);
          setNewLodgeForm((prev) => ({
            ...prev,
            jurisdictionId: userJur ? userJur.id : data[0].id,
          }));
        }
      })
      .catch((err) => console.error('Failed to load jurisdictions:', err));
  }, [user]);

  // Reset jurisdiction filter if user is not SYSTEM_ADMIN
  useEffect(() => {
    if (user && user.role !== 'SYSTEM_ADMIN') {
      setJurisdictionFilter('ALL');
    }
  }, [user]);

  // Fetch Cases
  const fetchCaseList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const isSysAdmin = user?.role === 'SYSTEM_ADMIN';
      const res = await getCases({
        page,
        limit,
        search: searchTerm || undefined,
        caseState: stateFilter !== 'ALL' ? (stateFilter as CaseState) : undefined,
        priority: priorityFilter !== 'ALL' ? (priorityFilter as Priority) : undefined,
        tracingOutcome: outcomeFilter !== 'ALL' ? (outcomeFilter as TracingOutcome) : undefined,
        jurisdictionId: isSysAdmin && jurisdictionFilter !== 'ALL' ? jurisdictionFilter : undefined,
        sortBy: 'reportedAt',
        sortOrder: 'desc',
      });
      setCases(res.data);
      setTotal(res.meta.total);
      setTotalPages(res.meta.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve cases');
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchTerm, stateFilter, priorityFilter, outcomeFilter, jurisdictionFilter, user?.id, user?.role, user?.jurisdictionId]);

  useEffect(() => {
    fetchCaseList();
  }, [fetchCaseList]);

  // Handle Lodgement Submission
  const handleLodgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLodgeForm.fullName.trim() || !newLodgeForm.incidentSummary.trim()) {
      setLodgeError('Subject Name and Incident Summary are mandatory.');
      return;
    }

    setSubmittingLodge(true);
    setLodgeError(null);

    try {
      const payload: CreateCasePayload = {
        personProfile: {
          fullName: newLodgeForm.fullName.trim(),
          aliases: newLodgeForm.aliases ? newLodgeForm.aliases.split(',').map((s) => s.trim()) : [],
          estimatedAge: newLodgeForm.estimatedAge ? parseInt(newLodgeForm.estimatedAge, 10) : undefined,
          biologicalSex: newLodgeForm.biologicalSex,
          identifyingFeatures: newLodgeForm.identifyingFeatures.trim() || undefined,
        },
        case: {
          jurisdictionId: newLodgeForm.jurisdictionId,
          missingSince: new Date(newLodgeForm.missingSince).toISOString(),
          reportedAt: new Date(newLodgeForm.reportedAt).toISOString(),
          priority: newLodgeForm.priority,
          incidentSummary: newLodgeForm.incidentSummary.trim(),
        },
      };

      const created = await createCase(payload);
      setLodgeModalOpen(false);
      navigate(`/cases/${created.id}`);
    } catch (err) {
      setLodgeError(err instanceof Error ? err.message : 'Case creation failed');
    } finally {
      setSubmittingLodge(false);
    }
  };

  // Helper Badge Renderers
  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-rose-950/80 text-rose-300 border-rose-800/80 font-bold';
      case 'HIGH':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/80 font-semibold';
      case 'MEDIUM':
        return 'bg-blue-950/80 text-blue-300 border-blue-800/80';
      case 'LOW':
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getStateBadge = (state: CaseState) => {
    switch (state) {
      case 'OPEN':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80';
      case 'UNDER_REVIEW':
        return 'bg-purple-950/80 text-purple-300 border-purple-800/80';
      case 'REPORTED':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/80';
      case 'CLOSED':
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const getOutcomeBadge = (outcome: TracingOutcome) => {
    switch (outcome) {
      case 'TRACED_VERIFIED':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800 font-semibold';
      case 'LOCATED_VERIFICATION_PENDING':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'LOCATION_REPORTED':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-800';
      case 'NOT_TRACED':
        return 'bg-slate-800/60 text-slate-400 border-slate-800';
      case 'OTHER_OUTCOME':
        return 'bg-purple-950/80 text-purple-300 border-purple-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Actions Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold tracking-tight text-white font-mono">Case Register</h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-400 border border-slate-700">
              {total} Records
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative operational case ledger & intake records
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchCaseList()}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Refresh case register"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {canLodgeCase && (
            <button
              onClick={() => setLodgeModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Lodge New Case</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
        {/* Search Input */}
        <div className="md:col-span-2 relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search by Case Ref, Subject Name, Summary..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* State Filter */}
        <div>
          <select
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All States</option>
            <option value="REPORTED">Reported</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        {/* Priority Filter */}
        <div>
          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        {/* Tracing Outcome Filter */}
        <div>
          <select
            value={outcomeFilter}
            onChange={(e) => {
              setOutcomeFilter(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Outcomes</option>
            <option value="NOT_TRACED">Not Traced</option>
            <option value="LOCATION_REPORTED">Location Reported</option>
            <option value="LOCATED_VERIFICATION_PENDING">Located (Verification Pending)</option>
            <option value="TRACED_VERIFIED">Traced & Verified</option>
            <option value="OTHER_OUTCOME">Other Outcome</option>
          </select>
        </div>

        {/* Jurisdiction Filter (Admin only) */}
        {user?.role === 'SYSTEM_ADMIN' && (
          <div className="md:col-span-5 pt-1 border-t border-slate-800 flex items-center space-x-2">
            <span className="text-[11px] text-purple-400 font-mono">System Admin Jurisdiction Scope:</span>
            <select
              value={jurisdictionFilter}
              onChange={(e) => {
                setJurisdictionFilter(e.target.value);
                setPage(1);
              }}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Operational Jurisdictions</option>
              {jurisdictions.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name} ({j.code})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Case Table */}
      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-mono">
              <tr>
                <th className="py-2.5 px-3">Case Ref</th>
                <th className="py-2.5 px-3">Subject Profile</th>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">State</th>
                <th className="py-2.5 px-3">Physical Outcome</th>
                <th className="py-2.5 px-3">Jurisdiction</th>
                <th className="py-2.5 px-3">Reported / Missing</th>
                <th className="py-2.5 px-3">Assigned Lead</th>
                <th className="py-2.5 px-3">Tasks</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 font-mono">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-indigo-400" />
                    Querying authoritative case register...
                  </td>
                </tr>
              ) : cases.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 font-mono">
                    No investigation records found matching criteria.
                  </td>
                </tr>
              ) : (
                cases.map((c) => {
                  const hasOverdue = (c.overdueTasksCount ?? 0) > 0;
                  return (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition">
                      {/* Case Ref */}
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-300">
                        <Link to={`/cases/${c.id}`} className="hover:underline flex items-center space-x-1">
                          <span>{c.caseReference}</span>
                        </Link>
                      </td>

                      {/* Subject Name */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-100">{c.personProfile.fullName}</div>
                        <div className="text-[10px] text-slate-400">
                          {c.personProfile.biologicalSex} &bull; {c.personProfile.estimatedAge ? `${c.personProfile.estimatedAge} yrs` : 'Age Unspecified'}
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-2.5 px-3 font-mono">
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${getPriorityBadge(c.priority)}`}>
                          {c.priority}
                        </span>
                      </td>

                      {/* State */}
                      <td className="py-2.5 px-3 font-mono">
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${getStateBadge(c.caseState)}`}>
                          {c.caseState.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Outcome */}
                      <td className="py-2.5 px-3 font-mono">
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${getOutcomeBadge(c.tracingOutcome)}`}>
                          {c.tracingOutcome.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Jurisdiction */}
                      <td className="py-2.5 px-3 text-[11px] text-slate-400">
                        {c.jurisdiction.name}
                      </td>

                      {/* Dates */}
                      <td className="py-2.5 px-3 text-[11px] text-slate-400">
                        <div>Rep: {new Date(c.reportedAt).toLocaleDateString()}</div>
                        <div className="text-[10px] text-slate-500">
                          Missing: {new Date(c.missingSince).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Assigned Officer */}
                      <td className="py-2.5 px-3 text-[11px]">
                        {c.primaryAssignment ? (
                          <div className="text-slate-200">
                            {c.primaryAssignment.user.displayName}
                            {c.primaryAssignment.user.badgeNumber && (
                              <span className="font-mono text-[10px] text-slate-400 ml-1">
                                #{c.primaryAssignment.user.badgeNumber}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Tasks & Overdue */}
                      <td className="py-2.5 px-3 font-mono">
                        {hasOverdue ? (
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800 text-[10px] font-bold">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>{c.overdueTasksCount} Overdue</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">Normal</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        <Link
                          to={`/cases/${c.id}`}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition"
                        >
                          <span>Workspace</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-4 py-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-slate-900/60 font-mono">
          <div className="flex items-center space-x-3">
            <span>
              Showing {cases.length > 0 ? (page - 1) * limit + 1 : 0} to{' '}
              {Math.min(page * limit, total)} of {total} cases
            </span>
            <div className="flex items-center space-x-1.5 text-[11px] text-slate-400">
              <span>Show:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-slate-300"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1 || loading}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2">
              Page {page} of {totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages || loading}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Lodgement Modal */}
      {lodgeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl text-xs text-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white font-mono">Lodge New Investigation Case</h3>
              </div>
              <button
                onClick={() => setLodgeModalOpen(false)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {lodgeError && (
              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                {lodgeError}
              </div>
            )}

            <form onSubmit={handleLodgeSubmit} className="space-y-4">
              <div className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                1. Subject Person Profile
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">Subject Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={newLodgeForm.fullName}
                    onChange={(e) => setNewLodgeForm({ ...newLodgeForm, fullName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-slate-300">Biological Sex</label>
                  <select
                    value={newLodgeForm.biologicalSex}
                    onChange={(e) =>
                      setNewLodgeForm({ ...newLodgeForm, biologicalSex: e.target.value as BiologicalSex })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                    <option value="UNKNOWN">Unknown</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-slate-300">Estimated Age</label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    placeholder="e.g. 29"
                    value={newLodgeForm.estimatedAge}
                    onChange={(e) => setNewLodgeForm({ ...newLodgeForm, estimatedAge: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-slate-300">Aliases (Comma separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. Tony, Ramu"
                    value={newLodgeForm.aliases}
                    onChange={(e) => setNewLodgeForm({ ...newLodgeForm, aliases: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-slate-300">Identifying Features / Clothing</label>
                <textarea
                  rows={2}
                  placeholder="Physical marks, scars, tattoos, attire last observed..."
                  value={newLodgeForm.identifyingFeatures}
                  onChange={(e) =>
                    setNewLodgeForm({ ...newLodgeForm, identifyingFeatures: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] pt-2 border-t border-slate-800">
                2. Incident Particulars & Scope
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">Jurisdiction *</label>
                  <select
                    value={newLodgeForm.jurisdictionId}
                    onChange={(e) => setNewLodgeForm({ ...newLodgeForm, jurisdictionId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {jurisdictions.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name} ({j.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-slate-300">Priority Level *</label>
                  <select
                    value={newLodgeForm.priority}
                    onChange={(e) => setNewLodgeForm({ ...newLodgeForm, priority: e.target.value as Priority })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-slate-300">Missing Since *</label>
                  <input
                    type="datetime-local"
                    required
                    value={newLodgeForm.missingSince}
                    onChange={(e) => setNewLodgeForm({ ...newLodgeForm, missingSince: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-slate-300">Report Lodged At *</label>
                  <input
                    type="datetime-local"
                    required
                    value={newLodgeForm.reportedAt}
                    onChange={(e) => setNewLodgeForm({ ...newLodgeForm, reportedAt: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-slate-300">Incident Narrative Summary *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Factual summary of circumstances, last known location and reporting party notes..."
                  value={newLodgeForm.incidentSummary}
                  onChange={(e) => setNewLodgeForm({ ...newLodgeForm, incidentSummary: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setLodgeModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingLodge}
                  className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {submittingLodge ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Lodging Case...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Formalise & Lodge Case</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
