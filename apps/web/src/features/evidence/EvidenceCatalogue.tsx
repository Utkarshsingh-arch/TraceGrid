import React, { useState, useEffect, useCallback } from 'react';
import { 
  PlusCircle, 
  Search, 
  RefreshCw, 
  AlertCircle, 
  Paperclip, 
  Eye, 
  Inbox
} from 'lucide-react';
import { 
  EvidenceItem, 
  EvidenceType, 
  AccessClassification, 
  getCaseEvidence, 
  getCaseLeads 
} from '../../lib/api';
import { useAuth } from '../../app/AuthContext';
import { getEvidenceTypeBadge, getClassificationBadge } from './evidenceHelpers';
import { RegisterEvidenceModal } from './RegisterEvidenceModal';
import { EvidenceDetailModal } from './EvidenceDetailModal';

interface EvidenceCatalogueProps {
  caseId: string;
}

export const EvidenceCatalogue: React.FC<EvidenceCatalogueProps> = ({ caseId }) => {
  const { canLogEvidence, canViewConfidential } = useAuth();

  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Leads for association
  const [caseLeads, setCaseLeads] = useState<any[]>([]);

  // Modals state
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EvidenceItem | null>(null);

  const fetchEvidence = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { limit: 100 };
      if (typeFilter !== 'ALL') params.evidenceType = typeFilter as EvidenceType;
      if (classFilter !== 'ALL') params.accessClassification = classFilter as AccessClassification;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await getCaseEvidence(caseId, params);
      setEvidenceList(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch evidence catalogue');
    } finally {
      setLoading(false);
    }
  }, [caseId, typeFilter, classFilter, searchQuery]);

  // Load leads
  useEffect(() => {
    const loadLeads = async () => {
      try {
        const res = await getCaseLeads(caseId, { limit: 100 });
        setCaseLeads(res.data);
      } catch {
        // Soft fallback
      }
    };
    loadLeads();
  }, [caseId]);

  useEffect(() => {
    fetchEvidence();
  }, [fetchEvidence]);

  return (
    <div className="space-y-4">
      {/* Action and Filter Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Category Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Category:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
            >
              <option value="ALL">All Categories</option>
              <option value="PHYSICAL">PHYSICAL</option>
              <option value="DIGITAL_IMAGE">DIGITAL IMAGE</option>
              <option value="CCTV_FOOTAGE">CCTV FOOTAGE</option>
              <option value="DOCUMENT">DOCUMENT</option>
              <option value="FORENSIC_REPORT">FORENSIC</option>
              <option value="TRANSCRIPT">TRANSCRIPT</option>
            </select>
          </div>

          {/* Classification Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Classification:</span>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
            >
              <option value="ALL">All Tiers</option>
              <option value="INTERNAL">INTERNAL</option>
              <option value="RESTRICTED">RESTRICTED</option>
              {canViewConfidential && <option value="CONFIDENTIAL">CONFIDENTIAL</option>}
            </select>
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search evidence..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded pl-7 pr-2 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-[11px] w-36 sm:w-48"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1.5" />
          </div>

          <button
            onClick={() => fetchEvidence()}
            title="Refresh Evidence"
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Primary Action */}
        {canLogEvidence && (
          <button
            onClick={() => setRegisterModalOpen(true)}
            className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition flex items-center space-x-1.5 shadow"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Register Evidence</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Evidence Catalogue Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 text-[10px] text-slate-400 uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Reference</th>
                <th className="py-2.5 px-3">Title & Summary</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Classification</th>
                <th className="py-2.5 px-3">Chain of Custody Provenance</th>
                <th className="py-2.5 px-3">Recorded Time</th>
                <th className="py-2.5 px-3">Files</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && evidenceList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 italic">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                    Loading evidence catalogue...
                  </td>
                </tr>
              ) : evidenceList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    <Inbox className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                    <span>No evidence items match the specified filters.</span>
                  </td>
                </tr>
              ) : (
                evidenceList.map((item) => {
                  const typeBadge = getEvidenceTypeBadge(item.evidenceType);
                  const classBadge = getClassificationBadge(item.accessClassification);
                  const attachmentCount = item.attachments?.length ?? (item._count?.attachments || 0);

                  return (
                    <tr 
                      key={item.id} 
                      className="hover:bg-slate-800/40 transition group cursor-pointer"
                      onClick={() => {
                        setSelectedItem(item);
                        setDetailModalOpen(true);
                      }}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-200 whitespace-nowrap">
                        {item.evidenceReference}
                      </td>

                      <td className="py-2.5 px-3 max-w-xs">
                        <div className="font-semibold text-slate-100">{item.title}</div>
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{item.description}</p>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${typeBadge.className}`}>
                          {typeBadge.label}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${classBadge.className}`}>
                          {classBadge.label}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 max-w-xs truncate text-[11px] text-slate-300">
                        {item.sourceProvenance}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px] text-slate-400 font-mono">
                        <div>Rec: {new Date(item.recordedAt).toLocaleDateString()}</div>
                        {item.eventTimestamp && (
                          <div className="text-slate-500">Evt: {new Date(item.eventTimestamp).toLocaleDateString()}</div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center text-[10px] text-slate-300 font-mono bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                          <Paperclip className="w-3 h-3 mr-1 text-slate-400" />
                          {attachmentCount}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setSelectedItem(item);
                            setDetailModalOpen(true);
                          }}
                          title="View Details & Attachments"
                          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Evidence Modal */}
      <RegisterEvidenceModal
        caseId={caseId}
        isOpen={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        onSuccess={() => fetchEvidence()}
        caseLeads={caseLeads}
      />

      {/* Detail Modal */}
      <EvidenceDetailModal
        evidenceItem={selectedItem}
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        onRefreshList={() => fetchEvidence()}
      />
    </div>
  );
};
