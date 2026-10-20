import React, { useState } from 'react';
import { X, ShieldCheck, AlertCircle, Check, Info } from 'lucide-react';
import { 
  recordLeadOutcome, 
  RecordLeadOutcomePayload, 
  LeadStatus, 
  LeadSighting 
} from '../../lib/api';

interface RecordOutcomeModalProps {
  lead: LeadSighting;
  allCaseLeads: LeadSighting[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const RecordOutcomeModal: React.FC<RecordOutcomeModalProps> = ({
  lead,
  allCaseLeads,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [verificationStatus, setVerificationStatus] = useState<LeadStatus>('VERIFIED');
  const [findings, setFindings] = useState('');
  const [duplicateOfLeadId, setDuplicateOfLeadId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Potential canonical leads (same case, excluding current lead)
  const candidateCanonicalLeads = allCaseLeads.filter((l) => l.id !== lead.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (findings.trim().length < 5) {
      setError('Detailed investigative findings (minimum 5 characters) are required to record an outcome.');
      return;
    }

    if (verificationStatus === 'DUPLICATE' && !duplicateOfLeadId) {
      setError('Please select which canonical lead this record duplicates.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: RecordLeadOutcomePayload = {
        verificationStatus,
        findings: findings.trim(),
        duplicateOfLeadId: verificationStatus === 'DUPLICATE' ? duplicateOfLeadId : undefined,
      };
      await recordLeadOutcome(lead.id, payload);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record lead verification outcome');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-cyan-400">
            <ShieldCheck className="w-5 h-5" />
            <h3 className="font-semibold text-white text-base">Record Lead Verification Outcome</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 rounded hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded text-xs space-y-1">
          <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
            <span>Lead: <strong className="text-slate-200">{lead.leadReference}</strong></span>
            <span>Current Status: <strong className="text-indigo-400">{lead.verificationStatus}</strong></span>
          </div>
          <p className="text-slate-300 line-clamp-2 italic">
            "{lead.narrative}"
          </p>
        </div>

        {error && (
          <div className="p-3 rounded bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Select Verification Outcome <span className="text-rose-400">*</span>
            </label>
            <select
              value={verificationStatus}
              onChange={(e) => setVerificationStatus(e.target.value as LeadStatus)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
            >
              <option value="VERIFIED">VERIFIED — Corroborated with high confidence</option>
              <option value="UNDER_REVIEW">UNDER REVIEW — Return to active investigative triage</option>
              <option value="INCONCLUSIVE">INCONCLUSIVE — Investigated but unable to confirm or refute</option>
              <option value="DISPROVED">DISPROVED — Refuted by alibi, CCTV, or contradictory facts</option>
              <option value="DUPLICATE">DUPLICATE — Cross-reference to existing primary lead</option>
            </select>
          </div>

          {/* Critical Domain Invariant Banner for DISPROVED */}
          {verificationStatus === 'DISPROVED' && (
            <div className="p-3 rounded bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs space-y-1">
              <div className="flex items-center space-x-1.5 font-semibold text-amber-300">
                <Info className="w-4 h-4" />
                <span>Investigative Invariant Notice</span>
              </div>
              <p className="text-[11px] text-amber-300/90 leading-relaxed">
                Disproving this lead documents the negative findings for the case record. It <strong>strictly leaves the parent investigation case OPEN</strong>. Parent cases are never closed by a disproved lead.
              </p>
            </div>
          )}

          {/* Duplicate Lead Picker */}
          {verificationStatus === 'DUPLICATE' && (
            <div className="space-y-2 p-3 bg-orange-950/30 border border-orange-900/60 rounded">
              <div className="text-orange-300 font-semibold text-[11px] flex items-center space-x-1">
                <Info className="w-3.5 h-3.5" />
                <span>Select Canonical Primary Lead (Within Same Case)</span>
              </div>
              <select
                value={duplicateOfLeadId}
                onChange={(e) => setDuplicateOfLeadId(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
              >
                <option value="">-- Choose Canonical Lead Reference --</option>
                {candidateCanonicalLeads.map((cand) => (
                  <option key={cand.id} value={cand.id}>
                    {cand.leadReference} ({cand.sourceType}) — {cand.narrative.slice(0, 45)}...
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400">
                Provenance is preserved: original tip text and citizen details remain intact in the database.
              </p>
            </div>
          )}

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Investigative Findings & Rationale <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              required
              placeholder="State the concrete evidence, CCTV timestamps, witness re-interview findings, or rationale justifying this determination."
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{loading ? 'Recording...' : 'Save Verification Outcome'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
