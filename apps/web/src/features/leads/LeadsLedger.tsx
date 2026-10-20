import React, { useState, useEffect, useCallback } from 'react';
import { 
  PlusCircle, 
  Search, 
  RefreshCw, 
  MapPin, 
  UserCheck, 
  ShieldCheck, 
  Eye, 
  AlertCircle,
  Inbox
} from 'lucide-react';
import { 
  LeadSighting, 
  LeadStatus, 
  LeadSource, 
  getCaseLeads, 
  getEligibleAssignees 
} from '../../lib/api';
import { useAuth } from '../../app/AuthContext';
import { getLeadStatusBadge, formatSourceType } from './leadHelpers';
import { LeadLodgementModal } from './LeadLodgementModal';
import { LeadDetailModal } from './LeadDetailModal';
import { AssignLeadModal } from './AssignLeadModal';
import { RecordOutcomeModal } from './RecordOutcomeModal';

interface LeadsLedgerProps {
  caseId: string;
}

export const LeadsLedger: React.FC<LeadsLedgerProps> = ({ caseId }) => {
  const { canLodgeLead, canAssign, canManageLeads } = useAuth();

  const [leads, setLeads] = useState<LeadSighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Eligible assignees
  const [eligibleAssignees, setEligibleAssignees] = useState<any[]>([]);

  // Modals state
  const [lodgeModalOpen, setLodgeModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [outcomeModalOpen, setOutcomeModalOpen] = useState(false);

  const [selectedLead, setSelectedLead] = useState<LeadSighting | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { limit: 100 };
      if (statusFilter !== 'ALL') params.verificationStatus = statusFilter as LeadStatus;
      if (sourceFilter !== 'ALL') params.sourceType = sourceFilter as LeadSource;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await getCaseLeads(caseId, params);
      setLeads(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch leads ledger');
    } finally {
      setLoading(false);
    }
  }, [caseId, statusFilter, sourceFilter, searchQuery]);

  // Load assignees
  useEffect(() => {
    const loadAssignees = async () => {
      try {
        const list = await getEligibleAssignees(caseId);
        setEligibleAssignees(list);
      } catch {
        // Soft fallback
      }
    };
    loadAssignees();
  }, [caseId]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

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
              <option value="NEW">NEW</option>
              <option value="ASSIGNED">ASSIGNED</option>
              <option value="UNDER_REVIEW">UNDER REVIEW</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="DISPROVED">DISPROVED</option>
              <option value="INCONCLUSIVE">INCONCLUSIVE</option>
              <option value="DUPLICATE">DUPLICATE</option>
            </select>
          </div>

          {/* Source Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Source:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 text-[11px]"
            >
              <option value="ALL">All Sources</option>
              <option value="CITIZEN_TIP">Citizen Tip</option>
              <option value="WITNESS_STATEMENT">Witness Statement</option>
              <option value="OFFICER_PATROL">Officer Patrol</option>
              <option value="CCTV_REVIEW">CCTV Review</option>
              <option value="SYNTHETIC_TELCO">Telco Observation</option>
              <option value="SYNTHETIC_FINANCIAL">Financial POS</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search narrative..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded pl-7 pr-2 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-[11px] w-36 sm:w-48"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1.5" />
          </div>

          <button
            onClick={() => fetchLeads()}
            title="Refresh Ledger"
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Primary Action: Lodge Lead */}
        {canLodgeLead ? (
          <button
            onClick={() => setLodgeModalOpen(true)}
            className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition flex items-center space-x-1.5 shadow"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Lodge Lead</span>
          </button>
        ) : (
          <div className="text-[11px] text-slate-500 italic">
            Read-Only Reviewer Mode
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Ledger Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 text-[10px] text-slate-400 uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Reference</th>
                <th className="py-2.5 px-3">Source</th>
                <th className="py-2.5 px-3">Narrative Summary</th>
                <th className="py-2.5 px-3">Observed / Reported</th>
                <th className="py-2.5 px-3">Outcome / Status</th>
                <th className="py-2.5 px-3">Investigator</th>
                <th className="py-2.5 px-3">Location</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 italic">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                    Loading leads ledger...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    <Inbox className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                    <span>No leads matching current filters.</span>
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const badge = getLeadStatusBadge(lead.verificationStatus);
                  const hasCoords = lead.latitude !== null && lead.longitude !== null;

                  return (
                    <tr 
                      key={lead.id} 
                      className="hover:bg-slate-800/40 transition group cursor-pointer"
                      onClick={() => {
                        setSelectedLead(lead);
                        setDetailModalOpen(true);
                      }}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-200 whitespace-nowrap">
                        {lead.leadReference}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="text-[11px] text-slate-300">
                          {formatSourceType(lead.sourceType)}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 max-w-xs truncate text-slate-200">
                        {lead.narrative}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px] text-slate-400 font-mono">
                        {lead.observedAt ? (
                          <div>Obs: {new Date(lead.observedAt).toLocaleDateString()}</div>
                        ) : null}
                        <div>Rep: {new Date(lead.reportedAt).toLocaleDateString()}</div>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                        {lead.assignedUser ? (
                          <span className="text-[11px] font-medium">{lead.assignedUser.displayName}</span>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">Unassigned</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {hasCoords ? (
                          <span className="inline-flex items-center text-[10px] text-emerald-400 font-mono bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-900/60">
                            <MapPin className="w-3 h-3 mr-0.5" />
                            GPS
                          </span>
                        ) : (
                          <span className="text-slate-600 text-[10px]">&mdash;</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => {
                              setSelectedLead(lead);
                              setDetailModalOpen(true);
                            }}
                            title="View Lead Details"
                            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {canAssign && (
                            <button
                              onClick={() => {
                                setSelectedLead(lead);
                                setAssignModalOpen(true);
                              }}
                              title="Assign Investigator"
                              className="p-1 rounded hover:bg-slate-700 text-indigo-400 hover:text-indigo-300 transition"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canManageLeads && (
                            <button
                              onClick={() => {
                                setSelectedLead(lead);
                                setOutcomeModalOpen(true);
                              }}
                              title="Record Verification Outcome"
                              className="p-1 rounded hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 transition"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>
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

      {/* Lodgement Modal */}
      <LeadLodgementModal
        caseId={caseId}
        isOpen={lodgeModalOpen}
        onClose={() => setLodgeModalOpen(false)}
        onSuccess={() => fetchLeads()}
        eligibleAssignees={eligibleAssignees}
      />

      {/* Detail Modal */}
      <LeadDetailModal
        lead={selectedLead}
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        onOpenAssign={(lead) => {
          setSelectedLead(lead);
          setAssignModalOpen(true);
        }}
        onOpenOutcome={(lead) => {
          setSelectedLead(lead);
          setOutcomeModalOpen(true);
        }}
      />

      {/* Assign Modal */}
      {selectedLead && (
        <AssignLeadModal
          leadId={selectedLead.id}
          leadReference={selectedLead.leadReference}
          isOpen={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          onSuccess={() => fetchLeads()}
          eligibleAssignees={eligibleAssignees}
        />
      )}

      {/* Record Outcome Modal */}
      {selectedLead && (
        <RecordOutcomeModal
          lead={selectedLead}
          allCaseLeads={leads}
          isOpen={outcomeModalOpen}
          onClose={() => setOutcomeModalOpen(false)}
          onSuccess={() => fetchLeads()}
        />
      )}
    </div>
  );
};
