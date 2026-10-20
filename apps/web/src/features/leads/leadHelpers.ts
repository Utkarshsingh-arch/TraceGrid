import { 
  LeadStatus, 
  LeadSource 
} from '../../lib/api';

export function getLeadStatusBadge(status: LeadStatus) {
  switch (status) {
    case 'NEW':
      return {
        label: 'NEW',
        className: 'bg-slate-800 text-slate-300 border-slate-700',
      };
    case 'ASSIGNED':
      return {
        label: 'ASSIGNED',
        className: 'bg-blue-950/80 text-blue-300 border-blue-800',
      };
    case 'UNDER_REVIEW':
      return {
        label: 'UNDER REVIEW',
        className: 'bg-purple-950/80 text-purple-300 border-purple-800',
      };
    case 'VERIFIED':
      return {
        label: 'VERIFIED',
        className: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
      };
    case 'DISPROVED':
      return {
        label: 'DISPROVED',
        className: 'bg-rose-950/80 text-rose-300 border-rose-800',
      };
    case 'INCONCLUSIVE':
      return {
        label: 'INCONCLUSIVE',
        className: 'bg-amber-950/80 text-amber-300 border-amber-800',
      };
    case 'DUPLICATE':
      return {
        label: 'DUPLICATE',
        className: 'bg-orange-950/80 text-orange-300 border-orange-800',
      };
    default:
      return {
        label: status,
        className: 'bg-slate-800 text-slate-400 border-slate-700',
      };
  }
}

export function formatSourceType(source: LeadSource): string {
  switch (source) {
    case 'CITIZEN_TIP':
      return 'Citizen Tip';
    case 'WITNESS_STATEMENT':
      return 'Witness Statement';
    case 'OFFICER_PATROL':
      return 'Officer Patrol';
    case 'CCTV_REVIEW':
      return 'CCTV Review';
    case 'SYNTHETIC_TELCO':
      return 'Telco Sighting';
    case 'SYNTHETIC_FINANCIAL':
      return 'Financial POS';
    default:
      return source;
  }
}
