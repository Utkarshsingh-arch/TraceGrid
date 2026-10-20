import React from 'react';
import { X, MapPin, ShieldCheck, UserCheck, AlertTriangle } from 'lucide-react';
import { LeadSighting } from '../../lib/api';
import { getLeadStatusBadge, formatSourceType } from './leadHelpers';
import { useAuth } from '../../app/AuthContext';

interface LeadDetailModalProps {
  lead: LeadSighting | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenAssign: (lead: LeadSighting) => void;
  onOpenOutcome: (lead: LeadSighting) => void;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  lead,
  isOpen,
  onClose,
  onOpenAssign,
  onOpenOutcome,
}) => {
  const { canAssign, canManageLeads } = useAuth();

  if (!isOpen || !lead) return null;

  const badge = getLeadStatusBadge(lead.verificationStatus);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="font-mono font-bold text-lg text-white">
                {lead.leadReference}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${badge.className}`}>
                {badge.label}
              </span>
            </div>
            <div className="text-xs text-slate-400">
              Source: <strong className="text-slate-200">{formatSourceType(lead.sourceType)}</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 rounded hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invariant Warnings & Provenance Badges */}
        {lead.verificationStatus === 'DISPROVED' && (
          <div className="p-3 bg-rose-950/30 border border-rose-800/60 rounded text-xs text-rose-300 space-y-1">
            <div className="font-semibold flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Lead Disproved by Investigation</span>
            </div>
            <p className="text-[11px] text-rose-300/80 leading-relaxed">
              This lead was verified as unfounded or refuted by evidence. In accordance with TraceGrid core operational rules, the <strong>parent case remains open</strong> and has not been closed.
            </p>
          </div>
        )}

        {lead.verificationStatus === 'DUPLICATE' && (
          <div className="p-3 bg-orange-950/30 border border-orange-800/60 rounded text-xs text-orange-300 space-y-1">
            <div className="font-semibold flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <span>Duplicate Lead Sighting</span>
            </div>
            <p className="text-[11px] text-orange-300/80 leading-relaxed">
              Grouped with canonical lead. Original provenance, tip metadata, and informant records are permanently preserved in the ledger.
            </p>
          </div>
        )}

        {/* Narrative Box */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
            Lead Narrative & Sighting Report
          </span>
          <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
            {lead.narrative}
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-950/50 p-3 rounded border border-slate-800/60">
          <div>
            <span className="text-slate-400 text-[11px] block">Observed Timestamp:</span>
            <span className="text-slate-200 font-mono">
              {lead.observedAt ? new Date(lead.observedAt).toLocaleString() : 'Not specified'}
            </span>
          </div>

          <div>
            <span className="text-slate-400 text-[11px] block">Reported Timestamp:</span>
            <span className="text-slate-200 font-mono">
              {new Date(lead.reportedAt).toLocaleString()}
            </span>
          </div>

          <div>
            <span className="text-slate-400 text-[11px] block">Assigned Investigator:</span>
            <span className="text-slate-200 font-semibold">
              {lead.assignedUser ? (
                <span>{lead.assignedUser.displayName} ({lead.assignedUser.badgeNumber || lead.assignedUser.role})</span>
              ) : (
                <span className="text-slate-500 italic">Unassigned</span>
              )}
            </span>
          </div>

          <div>
            <span className="text-slate-400 text-[11px] block">Source Contact / Informant:</span>
            <span className="text-slate-200 font-mono text-[11px]">
              {lead.sourceContact || 'Anonymous / Walk-in'}
            </span>
          </div>
        </div>

        {/* Geospatial Location Section */}
        <div className="p-3 bg-slate-950/60 rounded border border-slate-800 space-y-2 text-xs">
          <div className="flex items-center space-x-1.5 text-indigo-400 font-semibold">
            <MapPin className="w-3.5 h-3.5" />
            <span>Geospatial Sighting Coordinates</span>
          </div>
          {lead.latitude !== null && lead.longitude !== null ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px]">
              <div className="p-2 bg-slate-900 rounded border border-slate-800">
                <span className="text-slate-500 block text-[10px]">LATITUDE</span>
                <span className="text-slate-200">{lead.latitude.toFixed(6)}</span>
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800">
                <span className="text-slate-500 block text-[10px]">LONGITUDE</span>
                <span className="text-slate-200">{lead.longitude.toFixed(6)}</span>
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800">
                <span className="text-slate-500 block text-[10px]">UNCERTAINTY</span>
                <span className="text-slate-200">{lead.locationUncertaintyMeters ? `${lead.locationUncertaintyMeters} m` : 'N/A'}</span>
              </div>
              {lead.locationDescription && (
                <div className="col-span-1 sm:col-span-3 text-slate-300 text-xs pt-1">
                  <span className="text-slate-400 text-[11px]">Landmark / Area:</span> {lead.locationDescription}
                </div>
              )}
            </div>
          ) : (
            <div className="text-slate-500 italic py-1">
              No physical geospatial coordinates attached to this lead.
            </div>
          )}
        </div>

        {/* Findings Box */}
        {lead.findings && (
          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase text-cyan-400 tracking-wider">
              Investigative Verification Findings
            </span>
            <div className="p-3 bg-slate-950 rounded border border-cyan-900/40 text-xs text-cyan-200/90 leading-relaxed whitespace-pre-wrap">
              {lead.findings}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
          >
            Close
          </button>

          <div className="flex items-center space-x-2">
            {canAssign && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAssign(lead);
                }}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-xs font-medium transition flex items-center space-x-1"
              >
                <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Assign Investigator</span>
              </button>
            )}

            {canManageLeads && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenOutcome(lead);
                }}
                className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold transition flex items-center space-x-1"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Record Verification Outcome</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
