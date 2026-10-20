import React, { useState } from 'react';
import { X, FileText, AlertCircle, Check } from 'lucide-react';
import { 
  createCaseEvidence, 
  CreateEvidencePayload, 
  EvidenceType, 
  AccessClassification 
} from '../../lib/api';
import { useAuth } from '../../app/AuthContext';

interface RegisterEvidenceModalProps {
  caseId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  caseLeads: Array<{ id: string; leadReference: string; narrative: string }>;
}

export const RegisterEvidenceModal: React.FC<RegisterEvidenceModalProps> = ({
  caseId,
  isOpen,
  onClose,
  onSuccess,
  caseLeads,
}) => {
  const { canViewConfidential } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('PHYSICAL');
  const [sourceProvenance, setSourceProvenance] = useState('');
  const [eventTimestamp, setEventTimestamp] = useState('');
  const [accessClassification, setAccessClassification] = useState<AccessClassification>('INTERNAL');
  const [leadId, setLeadId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) {
      setError('Evidence title must be at least 3 characters.');
      return;
    }
    if (description.trim().length < 5) {
      setError('Description must be at least 5 characters.');
      return;
    }
    if (sourceProvenance.trim().length < 3) {
      setError('Chain of custody provenance documentation is required.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: CreateEvidencePayload = {
        title: title.trim(),
        description: description.trim(),
        evidenceType,
        sourceProvenance: sourceProvenance.trim(),
        eventTimestamp: eventTimestamp ? new Date(eventTimestamp).toISOString() : undefined,
        accessClassification,
        leadId: leadId || undefined,
      };

      await createCaseEvidence(caseId, payload);
      // Reset
      setTitle('');
      setDescription('');
      setEvidenceType('PHYSICAL');
      setSourceProvenance('');
      setEventTimestamp('');
      setAccessClassification('INTERNAL');
      setLeadId('');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register evidence');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-indigo-400">
            <FileText className="w-5 h-5" />
            <h3 className="font-semibold text-white text-base">Register Evidence Record</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 rounded hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
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
              Evidence Item Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Metro Gate 2 CCTV Camera #4 Footage Export"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Evidence Category <span className="text-rose-400">*</span>
              </label>
              <select
                value={evidenceType}
                onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
              >
                <option value="PHYSICAL">PHYSICAL — Tangible physical property</option>
                <option value="DIGITAL_IMAGE">DIGITAL IMAGE — Photos, digital captures</option>
                <option value="CCTV_FOOTAGE">CCTV FOOTAGE — Video surveillance clips</option>
                <option value="DOCUMENT">DOCUMENT — Paper or electronic documents</option>
                <option value="FORENSIC_REPORT">FORENSIC REPORT — Technical / lab findings</option>
                <option value="TRANSCRIPT">TRANSCRIPT — Witness / interview records</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Access Security Classification <span className="text-rose-400">*</span>
              </label>
              <select
                value={accessClassification}
                onChange={(e) => setAccessClassification(e.target.value as AccessClassification)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
              >
                <option value="INTERNAL">INTERNAL — Accessible to all case officers</option>
                <option value="RESTRICTED">RESTRICTED — Sworn officers and supervisors</option>
                {canViewConfidential && (
                  <option value="CONFIDENTIAL">CONFIDENTIAL — Supervisory clearance only</option>
                )}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Description & Specifics <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={2}
              required
              placeholder="Describe physical dimensions, model, serial numbers, file formats, or condition."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Source & Chain of Custody Provenance <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Recovered from DMRC Station Control Room by Insp. Sharma, logged into property room locker #14"
              value={sourceProvenance}
              onChange={(e) => setSourceProvenance(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Event Occurrence Time (When Incident Allegedly Occurred)
              </label>
              <input
                type="datetime-local"
                value={eventTimestamp}
                onChange={(e) => setEventTimestamp(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Associated Lead / Sighting (Optional)
              </label>
              <select
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
              >
                <option value="">No Lead Association</option>
                {caseLeads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.leadReference} — {lead.narrative.slice(0, 35)}...
                  </option>
                ))}
              </select>
            </div>
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
              className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{loading ? 'Registering...' : 'Register Evidence'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
