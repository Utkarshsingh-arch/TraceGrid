import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  User, 
  Clock, 
  MapPin, 
  Edit3, 
  UserCheck, 
  RotateCcw, 
  CheckCircle, 
  Activity, 
  X, 
  Check, 
  RefreshCw,
  Compass,
  Search,
  CheckSquare,
  Paperclip,
  ShieldAlert,
  Lightbulb
} from 'lucide-react';
import { 
  InvestigationCase, 
  CaseState, 
  TracingOutcome, 
  Priority, 
  AssignmentRole, 
  getCaseById, 
  updateCase, 
  transitionCaseState, 
  reopenCase, 
  assignCase, 
  updateCaseOutcome, 
  getEligibleAssignees,
  getCaseRecommendations
} from '../../lib/api';
import { useAuth } from '../../app/AuthContext';
import { CaseMapCanvas } from '../mapping/CaseMapCanvas';
import { LeadsLedger } from '../leads/LeadsLedger';
import { TasksQueue } from '../tasks/TasksQueue';
import { EvidenceCatalogue } from '../evidence/EvidenceCatalogue';
import { CaseActivityTimeline } from '../timeline/CaseActivityTimeline';
import { SupervisoryAuditTrail } from '../timeline/SupervisoryAuditTrail';
import { RecommendationDrawer } from '../coordination/RecommendationDrawer';

export const CaseWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { canManageState, canEditMetadata, canAssign, canViewAuditLogs } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  const handleTabChange = (tabKey: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tabKey === 'overview') {
        next.delete('tab');
      } else {
        next.set('tab', tabKey);
      }
      return next;
    });
  };

  const [caseRecord, setCaseRecord] = useState<InvestigationCase | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [stateModalOpen, setStateModalOpen] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [outcomeModalOpen, setOutcomeModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  const [recommendationCount, setRecommendationCount] = useState<number>(0);

  // Form states
  const [modalActionError, setModalActionError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);

  // State Transition Form
  const [targetState, setTargetState] = useState<CaseState>('UNDER_REVIEW');
  const [transitionReason, setTransitionReason] = useState<string>('');

  // Reopen Form
  const [reopenReason, setReopenReason] = useState<string>('');

  // Assign Form
  const [eligibleAssignees, setEligibleAssignees] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [assignmentRole, setAssignmentRole] = useState<AssignmentRole>('PRIMARY_OFFICER');
  const [reassignmentReason, setReassignmentReason] = useState<string>('');

  // Outcome Form
  const [targetOutcome, setTargetOutcome] = useState<TracingOutcome>('LOCATED_VERIFICATION_PENDING');
  const [outcomeNotes, setOutcomeNotes] = useState<string>('');

  // Edit Metadata Form
  const [editPriority, setEditPriority] = useState<Priority>('MEDIUM');
  const [editSummary, setEditSummary] = useState<string>('');

  // Fetch full case details
  const fetchCase = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCaseById(id);
      setCaseRecord(data);
      setEditPriority(data.priority);
      setEditSummary(data.incidentSummary);
      setTargetOutcome(data.tracingOutcome);

      // Concurrently query recommendations count for operational awareness
      try {
        const recData = await getCaseRecommendations(id);
        setRecommendationCount(recData.recommendations?.length || 0);
      } catch {
        // Non-blocking for workspace rendering
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve case workspace');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCase();
  }, [fetchCase]);

  // Load assignees when assign modal opens
  const openAssignModal = async () => {
    if (!id) return;
    setModalActionError(null);
    try {
      const list = await getEligibleAssignees(id);
      setEligibleAssignees(list);
      if (list.length > 0) setSelectedUserId(list[0].id);
      setAssignModalOpen(true);
    } catch (err) {
      setModalActionError(err instanceof Error ? err.message : 'Failed to fetch assignees');
    }
  };

  // State Transition Action
  const handleTransitionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !transitionReason.trim()) {
      setModalActionError('A valid operational rationale is required for state transitions.');
      return;
    }
    setSubmittingAction(true);
    setModalActionError(null);
    try {
      const updated = await transitionCaseState(id, targetState, transitionReason.trim());
      setCaseRecord(updated);
      setStateModalOpen(false);
      setTransitionReason('');
      fetchCase();
    } catch (err) {
      setModalActionError(err instanceof Error ? err.message : 'State transition failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Reopen Action
  const handleReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !reopenReason.trim()) {
      setModalActionError('Authorized reopening rationale is required.');
      return;
    }
    setSubmittingAction(true);
    setModalActionError(null);
    try {
      const updated = await reopenCase(id, reopenReason.trim());
      setCaseRecord(updated);
      setReopenModalOpen(false);
      setReopenReason('');
      fetchCase();
    } catch (err) {
      setModalActionError(err instanceof Error ? err.message : 'Reopen failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Assignment Action
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedUserId) {
      setModalActionError('Please select a target officer');
      return;
    }
    setSubmittingAction(true);
    setModalActionError(null);
    try {
      await assignCase(id, selectedUserId, assignmentRole, reassignmentReason.trim() || undefined);
      setAssignModalOpen(false);
      setReassignmentReason('');
      fetchCase();
    } catch (err) {
      setModalActionError(err instanceof Error ? err.message : 'Assignment update failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Outcome Update Action
  const handleOutcomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !outcomeNotes.trim()) {
      setModalActionError('Detailed outcome verification notes are required.');
      return;
    }
    setSubmittingAction(true);
    setModalActionError(null);
    try {
      const updated = await updateCaseOutcome(id, targetOutcome, outcomeNotes.trim());
      setCaseRecord(updated);
      setOutcomeModalOpen(false);
      setOutcomeNotes('');
      fetchCase();
    } catch (err) {
      setModalActionError(err instanceof Error ? err.message : 'Outcome update failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Metadata Edit Action
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !editSummary.trim()) {
      setModalActionError('Incident summary cannot be empty');
      return;
    }
    setSubmittingAction(true);
    setModalActionError(null);
    try {
      const updated = await updateCase(id, {
        priority: editPriority,
        incidentSummary: editSummary.trim(),
      });
      setCaseRecord(updated);
      setEditModalOpen(false);
      fetchCase();
    } catch (err) {
      setModalActionError(err instanceof Error ? err.message : 'Metadata update failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-400 font-mono text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-3 text-indigo-400" />
        Loading operational workspace records...
      </div>
    );
  }

  if (error || !caseRecord) {
    return (
      <div className="space-y-4">
        <Link to="/" className="inline-flex items-center space-x-1.5 text-xs text-indigo-400 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Case Register</span>
        </Link>
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
          {error || 'Investigation case record could not be found.'}
        </div>
      </div>
    );
  }

  // Calculate elapsed duration
  const missingDate = new Date(caseRecord.missingSince);
  const elapsedMs = Math.max(Date.now() - missingDate.getTime(), 0);
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  const elapsedHours = Math.floor((elapsedMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  const isClosed = caseRecord.caseState === 'CLOSED';
  const activePrimaryAssignment = caseRecord.assignments?.find(
    (a) => a.isActive && a.assignmentRole === 'PRIMARY_OFFICER'
  );

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Operational Action Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Link
              to="/"
              className="inline-flex items-center space-x-1 text-xs text-slate-400 hover:text-slate-200 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Register</span>
            </Link>
            <span className="text-slate-600">/</span>
            <span className="font-mono font-bold text-white text-lg tracking-tight">
              {caseRecord.caseReference}
            </span>
            <span className="font-mono text-xs text-slate-400">
              ({caseRecord.personProfile.syntheticId})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {/* Priority Badge */}
            <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase bg-slate-800 text-slate-200 border border-slate-700">
              PRIORITY: {caseRecord.priority}
            </span>

            {/* State Badge */}
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${
                caseRecord.caseState === 'OPEN'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                  : caseRecord.caseState === 'UNDER_REVIEW'
                  ? 'bg-purple-950/80 text-purple-300 border-purple-800'
                  : caseRecord.caseState === 'REPORTED'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              STATE: {caseRecord.caseState.replace('_', ' ')}
            </span>

            {/* Tracing Outcome Badge */}
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold uppercase border ${
                caseRecord.tracingOutcome === 'TRACED_VERIFIED'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                  : caseRecord.tracingOutcome === 'LOCATED_VERIFICATION_PENDING'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                  : caseRecord.tracingOutcome === 'LOCATION_REPORTED'
                  ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                  : caseRecord.tracingOutcome === 'OTHER_OUTCOME'
                  ? 'bg-purple-950/80 text-purple-300 border-purple-800'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              OUTCOME: {caseRecord.tracingOutcome.replace('_', ' ')}
            </span>

            {/* Jurisdiction Badge */}
            <span className="text-[10px] text-slate-400 flex items-center ml-1">
              <MapPin className="w-3 h-3 text-slate-500 mr-1" />
              {caseRecord.jurisdiction.name} ({caseRecord.jurisdiction.code})
            </span>
          </div>
        </div>

        {/* Operational Command Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Recommendations Drawer Trigger */}
          <button
            onClick={() => setRecommendationsOpen(true)}
            className="px-2.5 py-1.5 rounded bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-700/80 text-xs font-medium transition flex items-center space-x-1.5 shadow-xs"
          >
            <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
            <span>Recommendations</span>
            {recommendationCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-indigo-600 text-white font-mono">
                {recommendationCount}
              </span>
            )}
          </button>

          {/* Metadata Edit */}
          {canEditMetadata && (
            <button
              onClick={() => {
                setModalActionError(null);
                setEditModalOpen(true);
              }}
              className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition flex items-center space-x-1"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Metadata</span>
            </button>
          )}

          {/* Outcome Update */}
          {canEditMetadata && (
            <button
              onClick={() => {
                setModalActionError(null);
                setOutcomeModalOpen(true);
              }}
              className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-medium transition flex items-center space-x-1"
            >
              <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
              <span>Update Outcome</span>
            </button>
          )}

          {/* Assign Officer */}
          {canAssign && (
            <button
              onClick={openAssignModal}
              className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition flex items-center space-x-1"
            >
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>Assign / Transfer</span>
            </button>
          )}

          {/* State Transition or Reopen */}
          {canManageState && (
            <>
              {!isClosed ? (
                <button
                  onClick={() => {
                    setModalActionError(null);
                    setStateModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition flex items-center space-x-1.5 shadow"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Transition State</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setModalActionError(null);
                    setReopenModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold transition flex items-center space-x-1.5 shadow"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reopen Case</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Case Workspace Operational Navigation Tabs */}
      <div className="flex items-center space-x-1 border-b border-slate-800 pb-px overflow-x-auto text-xs">
        <button
          onClick={() => handleTabChange('overview')}
          className={`px-3.5 py-2 font-medium border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Overview & Map</span>
        </button>

        <button
          onClick={() => handleTabChange('leads')}
          className={`px-3.5 py-2 font-medium border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'leads'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Leads & Sightings</span>
        </button>

        <button
          onClick={() => handleTabChange('tasks')}
          className={`px-3.5 py-2 font-medium border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'tasks'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          <span>Tasks & Action Items</span>
          {caseRecord.overdueTasksCount ? (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
              {caseRecord.overdueTasksCount}
            </span>
          ) : null}
        </button>

        <button
          onClick={() => handleTabChange('evidence')}
          className={`px-3.5 py-2 font-medium border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'evidence'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Paperclip className="w-3.5 h-3.5" />
          <span>Evidence & Attachments</span>
        </button>

        <button
          onClick={() => handleTabChange('activity')}
          className={`px-3.5 py-2 font-medium border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'activity'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Activity</span>
        </button>

        {canViewAuditLogs && (
          <button
            onClick={() => handleTabChange('audit')}
            className={`px-3.5 py-2 font-medium border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'audit'
                ? 'border-rose-500 text-rose-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Supervisory Audit</span>
          </button>
        )}
      </div>

      {/* Main Workspace Layout (Overview / Map Tab) */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (Metadata, Subject, Timing, History): 5 Cols */}
        <div className="lg:col-span-5 space-y-5">
          {/* Subject Profile Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2 text-slate-200 font-semibold text-xs uppercase tracking-wider">
                <User className="w-4 h-4 text-indigo-400" />
                <span>Subject Person Profile</span>
              </div>
              <span className="font-mono text-[11px] text-slate-500">
                {caseRecord.personProfile.syntheticId}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 text-[11px] block">Full Name:</span>
                <span className="font-semibold text-slate-100 text-sm">
                  {caseRecord.personProfile.fullName}
                </span>
              </div>

              <div>
                <span className="text-slate-400 text-[11px] block">Sex / Age:</span>
                <span className="text-slate-200">
                  {caseRecord.personProfile.biologicalSex} &bull;{' '}
                  {caseRecord.personProfile.estimatedAge
                    ? `${caseRecord.personProfile.estimatedAge} years`
                    : 'Unspecified'}
                </span>
              </div>

              {caseRecord.personProfile.aliases.length > 0 && (
                <div className="col-span-2">
                  <span className="text-slate-400 text-[11px] block">Known Aliases:</span>
                  <span className="text-slate-300 font-mono text-[11px]">
                    {caseRecord.personProfile.aliases.join(', ')}
                  </span>
                </div>
              )}

              <div className="col-span-2 pt-1 border-t border-slate-800/80">
                <span className="text-slate-400 text-[11px] block">Identifying Characteristics:</span>
                <p className="text-slate-300 text-xs mt-0.5 leading-relaxed bg-slate-950/60 p-2 rounded border border-slate-800/80">
                  {caseRecord.personProfile.identifyingFeatures || 'None documented on registration.'}
                </p>
              </div>
            </div>
          </div>

          {/* Incident Circumstances Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2 text-slate-200 font-semibold text-xs uppercase tracking-wider">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Incident Timeline & Summary</span>
              </div>
              <span className="font-mono text-[11px] text-amber-400">
                Missing ~{elapsedDays}d {elapsedHours}h
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-slate-950/60 p-2 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px] block">MISSING SINCE</span>
                <span className="text-slate-200 text-[11px]">
                  {new Date(caseRecord.missingSince).toLocaleString()}
                </span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px] block">LODGED AT</span>
                <span className="text-slate-200 text-[11px]">
                  {new Date(caseRecord.reportedAt).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-400 text-[11px] block">Incident Narrative:</span>
              <p className="text-slate-300 text-xs leading-relaxed bg-slate-950/60 p-2.5 rounded border border-slate-800">
                {caseRecord.incidentSummary}
              </p>
            </div>

            {isClosed && (
              <div className="p-2.5 rounded bg-slate-800/80 border border-slate-700 text-xs space-y-1">
                <span className="text-slate-400 font-semibold block uppercase text-[10px]">
                  Closure Record
                </span>
                <div className="text-slate-300 text-[11px]">
                  Closed: {caseRecord.closedAt ? new Date(caseRecord.closedAt).toLocaleString() : 'N/A'}
                </div>
                <div className="text-slate-400 text-[11px]">
                  Reason: {caseRecord.closureReason || 'None recorded'}
                </div>
              </div>
            )}
          </div>

          {/* Officer Assignment Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2 text-slate-200 font-semibold text-xs uppercase tracking-wider">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>Investigative Responsibilities</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                {caseRecord.assignments?.length || 0} Records
              </span>
            </div>

            {activePrimaryAssignment ? (
              <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 text-xs">
                    {activePrimaryAssignment.user.displayName}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Badge: {activePrimaryAssignment.user.badgeNumber || 'N/A'} &bull; Role:{' '}
                    {activePrimaryAssignment.assignmentRole}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
                  ACTIVE
                </span>
              </div>
            ) : (
              <div className="p-2.5 rounded bg-slate-950/40 border border-slate-800 text-slate-500 text-xs italic text-center">
                No active primary officer assigned.
              </div>
            )}

            {/* Past Assignments History */}
            {caseRecord.assignments && caseRecord.assignments.filter((a) => !a.isActive).length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Assignment Reassignment Audit History
                </span>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {caseRecord.assignments
                    .filter((a) => !a.isActive)
                    .map((a) => (
                      <div
                        key={a.id}
                        className="p-1.5 rounded bg-slate-950/40 border border-slate-800/60 text-[10px] text-slate-400 flex items-start justify-between"
                      >
                        <div>
                          <div className="font-medium text-slate-300">
                            {a.user.displayName} ({a.assignmentRole})
                          </div>
                          <div className="text-slate-500">
                            {new Date(a.assignedAt).toLocaleDateString()} &rarr;{' '}
                            {a.unassignedAt ? new Date(a.unassignedAt).toLocaleDateString() : 'N/A'}
                          </div>
                          {a.reassignmentReason && (
                            <div className="text-slate-400 italic">
                              Reason: {a.reassignmentReason}
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] font-mono text-slate-500 uppercase">Archived</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Investigation Events Log */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2 text-slate-200 font-semibold text-xs uppercase tracking-wider">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>Investigation Event Log</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                {caseRecord.events?.length || 0} Events
              </span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {caseRecord.events && caseRecord.events.length > 0 ? (
                caseRecord.events.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-2 rounded bg-slate-950 border border-slate-800/80 text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span className="font-semibold text-indigo-400">{evt.eventType}</span>
                      <span>{new Date(evt.eventTimestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-tight">{evt.description}</p>
                    {evt.actorUser && (
                      <div className="text-[10px] text-slate-500 font-mono">
                        Actor: {evt.actorUser.displayName} ({evt.actorUser.role})
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-slate-500 text-xs italic text-center py-2">
                  No chronological events recorded.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (Map & Geospatial Analysis Canvas): 7 Cols */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-white font-mono flex items-center space-x-2">
                <Compass className="w-4 h-4 text-indigo-400" />
                <span>Geospatial Clue Chain & Search Workspace</span>
              </h2>
              <p className="text-xs text-slate-400">
                {caseRecord.observations?.length || 0} spatial observations recorded &bull; Linked clue sequence
              </p>
            </div>
            <button
              onClick={() => setRecommendationsOpen(true)}
              className="px-2.5 py-1 rounded bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-700/80 text-indigo-300 text-xs font-medium transition flex items-center space-x-1.5"
            >
              <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
              <span>Recommendations</span>
              {recommendationCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-indigo-600 text-white font-mono">
                  {recommendationCount}
                </span>
              )}
            </button>
          </div>

          {/* Interactive Leaflet Map Canvas */}
          <CaseMapCanvas
            caseId={caseRecord.id}
            observations={caseRecord.observations || []}
            hypotheses={caseRecord.hypotheses || []}
            onHypothesisCreated={() => {
              fetchCase();
            }}
            onRefreshRequested={() => {
              fetchCase();
            }}
          />

          {/* Spatial Observations Summary Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Observation Evidence Inventory
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                Spatial Accuracy & Verification
              </span>
            </div>

            <div className="overflow-x-auto max-h-56">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="text-[10px] text-slate-500 uppercase font-mono border-b border-slate-800">
                  <tr>
                    <th className="py-1.5 px-2">Type</th>
                    <th className="py-1.5 px-2">Observed Time</th>
                    <th className="py-1.5 px-2">Coordinates</th>
                    <th className="py-1.5 px-2">Uncertainty</th>
                    <th className="py-1.5 px-2">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans text-[11px]">
                  {caseRecord.observations && caseRecord.observations.length > 0 ? (
                    caseRecord.observations.map((obs, idx) => (
                      <tr key={obs.id} className="hover:bg-slate-800/40">
                        <td className="py-1.5 px-2 font-mono font-medium text-slate-200">
                          #{idx + 1} {obs.observationType.replace('_', ' ')}
                        </td>
                        <td className="py-1.5 px-2 text-slate-400">
                          {new Date(obs.observedAt).toLocaleString()}
                        </td>
                        <td className="py-1.5 px-2 font-mono text-[10px] text-slate-400">
                          {obs.latitude.toFixed(4)}, {obs.longitude.toFixed(4)}
                        </td>
                        <td className="py-1.5 px-2 font-mono text-[10px] text-amber-400">
                          &plusmn;{obs.locationUncertaintyMeters}m
                        </td>
                        <td className="py-1.5 px-2 text-slate-300 max-w-xs truncate">
                          {obs.sourceDescription}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500 italic">
                        No spatial observations logged for this investigation.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Leads & Sightings Tab */}
      {activeTab === 'leads' && (
        <LeadsLedger caseId={caseRecord.id} />
      )}

      {/* Tasks & Action Items Tab */}
      {activeTab === 'tasks' && (
        <TasksQueue caseId={caseRecord.id} />
      )}

      {/* Evidence & Attachments Tab */}
      {activeTab === 'evidence' && (
        <EvidenceCatalogue caseId={caseRecord.id} />
      )}

      {/* Case Chronological Activity Tab */}
      {activeTab === 'activity' && (
        <CaseActivityTimeline caseId={caseRecord.id} />
      )}

      {/* Supervisory Audit Trail Tab */}
      {activeTab === 'audit' && (
        <SupervisoryAuditTrail caseId={caseRecord.id} />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 1: State Transition */}
      {/* ------------------------------------------------------------------ */}
      {stateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white font-mono">Transition Case State</h3>
              </div>
              <button onClick={() => setStateModalOpen(false)} className="p-1 rounded hover:bg-slate-800 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalActionError && (
              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                {modalActionError}
              </div>
            )}

            <form onSubmit={handleTransitionSubmit} className="space-y-3">
              <div>
                <span className="text-slate-400 block text-[11px] mb-1">Current State:</span>
                <span className="font-mono font-bold text-indigo-300 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                  {caseRecord.caseState}
                </span>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300 block">Target Operational State *</label>
                <select
                  value={targetState}
                  onChange={(e) => setTargetState(e.target.value as CaseState)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  {caseRecord.caseState === 'REPORTED' && (
                    <>
                      <option value="UNDER_REVIEW">UNDER_REVIEW (Supervisor Assessment)</option>
                      <option value="CLOSED">CLOSED (Immediate Rejection/Closure)</option>
                    </>
                  )}
                  {caseRecord.caseState === 'UNDER_REVIEW' && (
                    <>
                      <option value="OPEN">OPEN (Active Investigation)</option>
                      <option value="CLOSED">CLOSED (Formal Case Closure)</option>
                    </>
                  )}
                  {caseRecord.caseState === 'OPEN' && (
                    <>
                      <option value="UNDER_REVIEW">UNDER_REVIEW (Supervisor Review)</option>
                      <option value="CLOSED">CLOSED (Formal Case Closure)</option>
                    </>
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300 block">Operational Rationale / Justification *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Record supervisor decision rationale, review notes or closure justification..."
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              {targetState === 'CLOSED' && (
                <div className="p-2 rounded bg-amber-950/40 border border-amber-800/50 text-amber-300 text-[11px] leading-tight">
                  <strong>Notice:</strong> Closing a case requires all outstanding investigation tasks to be completed or cancelled.
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setStateModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {submittingAction ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Confirm Transition</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 2: Reopen Case */}
      {/* ------------------------------------------------------------------ */}
      {reopenModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white font-mono">Reopen Closed Investigation</h3>
              </div>
              <button onClick={() => setReopenModalOpen(false)} className="p-1 rounded hover:bg-slate-800 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalActionError && (
              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                {modalActionError}
              </div>
            )}

            <form onSubmit={handleReopenSubmit} className="space-y-3">
              <p className="text-slate-300 text-xs">
                Reopening restores the investigation to <strong className="text-emerald-400">OPEN</strong> state and clears closure timestamps in accordance with supervisor authorization protocols.
              </p>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300 block">Supervisor Reopening Rationale *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="State new credible evidence, revised lead analysis or supervisory order requiring reopening..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReopenModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {submittingAction ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Authorize & Reopen</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 3: Assign / Transfer Responsibility */}
      {/* ------------------------------------------------------------------ */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white font-mono">Assign / Transfer Officer</h3>
              </div>
              <button onClick={() => setAssignModalOpen(false)} className="p-1 rounded hover:bg-slate-800 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalActionError && (
              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                {modalActionError}
              </div>
            )}

            <form onSubmit={handleAssignSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-300 block">Eligible Officer / Investigator *</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  {eligibleAssignees.map((officer) => (
                    <option key={officer.id} value={officer.id}>
                      {officer.displayName} ({officer.badgeNumber || 'No Badge'}) &bull; {officer.role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300 block">Assignment Role *</label>
                <select
                  value={assignmentRole}
                  onChange={(e) => setAssignmentRole(e.target.value as AssignmentRole)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="PRIMARY_OFFICER">PRIMARY_OFFICER (Lead Responsibility)</option>
                  <option value="ASSISTING_OFFICER">ASSISTING_OFFICER (Secondary)</option>
                  <option value="SUPERVISING_OFFICER">SUPERVISING_OFFICER (Supervisory Oversight)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300 block">Reassignment Reason / Transfer Notes</label>
                <textarea
                  rows={2}
                  placeholder="Shift transfer, departmental escalation, workload reallocation..."
                  value={reassignmentReason}
                  onChange={(e) => setReassignmentReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {submittingAction ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Assignment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 4: Update Tracing Outcome */}
      {/* ------------------------------------------------------------------ */}
      {outcomeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white font-mono">Update Physical Tracing Outcome</h3>
              </div>
              <button onClick={() => setOutcomeModalOpen(false)} className="p-1 rounded hover:bg-slate-800 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalActionError && (
              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                {modalActionError}
              </div>
            )}

            <form onSubmit={handleOutcomeSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-300 block">Authoritative Tracing Outcome *</label>
                <select
                  value={targetOutcome}
                  onChange={(e) => setTargetOutcome(e.target.value as TracingOutcome)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="NOT_TRACED">NOT_TRACED (Subject remains unlocated)</option>
                  <option value="LOCATION_REPORTED">LOCATION_REPORTED (Credible coordinate lead identified)</option>
                  <option value="LOCATED_VERIFICATION_PENDING">LOCATED_VERIFICATION_PENDING (Preliminary location; field verification in progress)</option>
                  <option value="TRACED_VERIFIED">TRACED_VERIFIED (Subject physical identity confirmed)</option>
                  <option value="OTHER_OUTCOME">OTHER_OUTCOME (Administrative / jurisdictional closure)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300 block">Verification Notes / Evidence Summary *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Record identity verification details, hospital/police report references or sighting disproof..."
                  value={outcomeNotes}
                  onChange={(e) => setOutcomeNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setOutcomeModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {submittingAction ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Update Outcome</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 5: Edit Case Metadata */}
      {/* ------------------------------------------------------------------ */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white font-mono">Edit Case Metadata</h3>
              </div>
              <button onClick={() => setEditModalOpen(false)} className="p-1 rounded hover:bg-slate-800 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalActionError && (
              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                {modalActionError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-300 block">Priority Level *</label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as Priority)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300 block">Incident Summary Narrative *</label>
                <textarea
                  required
                  rows={4}
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {submittingAction ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Metadata</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Feature D: Investigation Coordination & Recommendation Drawer */}
      <RecommendationDrawer
        caseId={caseRecord.id}
        isOpen={recommendationsOpen}
        onClose={() => setRecommendationsOpen(false)}
        onTaskCreated={(_task) => {
          fetchCase();
        }}
      />
    </div>
  );
};
