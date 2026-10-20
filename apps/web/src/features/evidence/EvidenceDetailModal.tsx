import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Upload, 
  Clock, 
  Calendar, 
  CheckCircle, 
  AlertCircle, 
  FileCheck,
  RefreshCw 
} from 'lucide-react';
import { 
  EvidenceItem, 
  Attachment, 
  getEvidenceById, 
  uploadAttachment, 
  downloadAttachment, 
  triggerBlobDownload 
} from '../../lib/api';
import { useAuth } from '../../app/AuthContext';
import { getEvidenceTypeBadge, getClassificationBadge, formatBytes } from './evidenceHelpers';

interface EvidenceDetailModalProps {
  evidenceItem: EvidenceItem | null;
  isOpen: boolean;
  onClose: () => void;
  onRefreshList: () => void;
}

export const EvidenceDetailModal: React.FC<EvidenceDetailModalProps> = ({
  evidenceItem,
  isOpen,
  onClose,
  onRefreshList,
}) => {
  const { canUploadAttachment } = useAuth();

  const [detailedItem, setDetailedItem] = useState<EvidenceItem | null>(evidenceItem);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Sync with prop and fetch latest attachments
  useEffect(() => {
    if (evidenceItem && isOpen) {
      setDetailedItem(evidenceItem);
      const refreshDetail = async () => {
        try {
          const fresh = await getEvidenceById(evidenceItem.id);
          setDetailedItem(fresh);
        } catch {
          // Soft fallback
        }
      };
      refreshDetail();
    }
  }, [evidenceItem, isOpen]);

  if (!isOpen || !detailedItem) return null;

  const typeBadge = getEvidenceTypeBadge(detailedItem.evidenceType);
  const classBadge = getClassificationBadge(detailedItem.accessClassification);

  // Handle controlled file upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setActionError(null);
    setActionSuccess(null);

    // Client-side pre-validation: Max 10 MB
    const MAX_BYTES = 10 * 1024 * 1024; // 10,485,760 bytes
    if (file.size > MAX_BYTES) {
      setActionError(`File size exceeds strict 10 MB system limit (${(file.size / (1024 * 1024)).toFixed(1)} MB selected).`);
      e.target.value = '';
      return;
    }

    // Allowed extensions
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.pdf', '.txt', '.log', '.csv', '.json'];
    const fileNameLower = file.name.toLowerCase();
    const hasAllowedExt = allowedExtensions.some((ext) => fileNameLower.endsWith(ext));
    if (!hasAllowedExt) {
      setActionError(`Unsupported file format. Server accepts: ${allowedExtensions.join(', ')}.`);
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      await uploadAttachment(detailedItem.id, file);
      setActionSuccess(`Successfully uploaded and verified "${file.name}".`);
      // Refresh fresh attachments
      const updated = await getEvidenceById(detailedItem.id);
      setDetailedItem(updated);
      onRefreshList();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Handle authenticated download
  const handleDownload = async (attachment: Attachment) => {
    setDownloadingId(attachment.id);
    setActionError(null);
    try {
      const res = await downloadAttachment(attachment.id);
      triggerBlobDownload(res.blob, res.filename);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Download failed: unauthorized or file inaccessible');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="font-mono font-bold text-lg text-white">
                {detailedItem.evidenceReference}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${typeBadge.className}`}>
                {typeBadge.label}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${classBadge.className}`}>
                {classBadge.label}
              </span>
            </div>
            <h3 className="font-semibold text-slate-100 text-sm">{detailedItem.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 rounded hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {actionError && (
          <div className="p-3 rounded bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}

        {actionSuccess && (
          <div className="p-3 rounded bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs flex items-start space-x-2">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Description Box */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
            Evidence Item Description
          </span>
          <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
            {detailedItem.description}
          </div>
        </div>

        {/* Chain of Custody Provenance */}
        <div className="p-3 bg-slate-950/60 rounded border border-slate-800 space-y-1.5 text-xs">
          <div className="flex items-center space-x-1.5 text-indigo-400 font-semibold text-xs uppercase tracking-wider">
            <FileCheck className="w-4 h-4" />
            <span>Chain of Custody Provenance Documentation</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            {detailedItem.sourceProvenance}
          </p>
          <div className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-800/80">
            Note: TraceGrid logs initial provenance and access audits. Operational protocols apply for physical court admissibility.
          </div>
        </div>

        {/* Dual Timestamps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-950/50 p-3 rounded border border-slate-800/60">
          <div>
            <span className="text-slate-400 text-[11px] block flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>System Recorded Timestamp:</span>
            </span>
            <span className="text-slate-200 font-mono">
              {new Date(detailedItem.recordedAt).toLocaleString()}
            </span>
          </div>

          <div>
            <span className="text-slate-400 text-[11px] block flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Alleged Incident / Event Timestamp:</span>
            </span>
            <span className="text-slate-200 font-mono">
              {detailedItem.eventTimestamp ? new Date(detailedItem.eventTimestamp).toLocaleString() : 'Not recorded'}
            </span>
          </div>
        </div>

        {/* Private Attachments Section */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Secure File Attachments
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                ({detailedItem.attachments?.length || 0} files)
              </span>
            </div>

            {canUploadAttachment && (
              <label className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition cursor-pointer flex items-center space-x-1.5 shadow">
                <Upload className="w-3 h-3" />
                <span>{uploading ? 'Ingesting...' : 'Upload Attachment'}</span>
                <input
                  type="file"
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Attachments List */}
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {detailedItem.attachments && detailedItem.attachments.length > 0 ? (
              detailedItem.attachments.map((att) => (
                <div
                  key={att.id}
                  className="p-2.5 rounded bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-semibold text-slate-200 truncate">
                      {att.originalFileName}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono flex items-center space-x-2">
                      <span>{formatBytes(att.fileSizeBytes)}</span>
                      <span>&bull;</span>
                      <span>{att.mimeType}</span>
                      <span>&bull;</span>
                      <span className="truncate max-w-[140px] text-slate-500" title={att.sha256Checksum}>
                        SHA-256: {att.sha256Checksum.slice(0, 10)}...
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownload(att)}
                    disabled={downloadingId === att.id}
                    title="Download securely via authenticated stream"
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-[11px] font-medium transition flex items-center space-x-1 shrink-0"
                  >
                    {downloadingId === att.id ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    <span>{downloadingId === att.id ? 'Streaming...' : 'Download'}</span>
                  </button>
                </div>
              ))
            ) : (
              <div className="p-4 rounded bg-slate-950/40 border border-slate-800 text-slate-500 text-xs text-center italic">
                No binary attachments uploaded for this evidence record yet.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
