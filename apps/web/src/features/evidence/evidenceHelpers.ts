import { EvidenceType, AccessClassification } from '../../lib/api';

export function getEvidenceTypeBadge(type: EvidenceType) {
  switch (type) {
    case 'PHYSICAL':
      return { label: 'PHYSICAL', className: 'bg-emerald-950/80 text-emerald-300 border-emerald-800' };
    case 'DIGITAL_IMAGE':
      return { label: 'DIGITAL IMAGE', className: 'bg-indigo-950/80 text-indigo-300 border-indigo-800' };
    case 'CCTV_FOOTAGE':
      return { label: 'CCTV FOOTAGE', className: 'bg-cyan-950/80 text-cyan-300 border-cyan-800' };
    case 'DOCUMENT':
      return { label: 'DOCUMENT', className: 'bg-blue-950/80 text-blue-300 border-blue-800' };
    case 'FORENSIC_REPORT':
      return { label: 'FORENSIC', className: 'bg-purple-950/80 text-purple-300 border-purple-800' };
    case 'TRANSCRIPT':
      return { label: 'TRANSCRIPT', className: 'bg-slate-800 text-slate-300 border-slate-700' };
    default:
      return { label: type, className: 'bg-slate-800 text-slate-400 border-slate-700' };
  }
}

export function getClassificationBadge(classification: AccessClassification) {
  switch (classification) {
    case 'INTERNAL':
      return { label: 'INTERNAL', className: 'bg-slate-800 text-slate-300 border-slate-700' };
    case 'RESTRICTED':
      return { label: 'RESTRICTED', className: 'bg-amber-950/80 text-amber-300 border-amber-800' };
    case 'CONFIDENTIAL':
      return { label: 'CONFIDENTIAL', className: 'bg-rose-950/80 text-rose-300 border-rose-800 font-bold' };
    default:
      return { label: classification, className: 'bg-slate-800 text-slate-400 border-slate-700' };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
