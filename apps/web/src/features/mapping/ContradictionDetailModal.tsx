import React from 'react';
import { X, AlertTriangle, Compass, Clock, ExternalLink, CheckCircle, Info } from 'lucide-react';
import { PairwiseComparisonResult } from '../../lib/api';

interface ContradictionDetailModalProps {
  pair: PairwiseComparisonResult | null;
  isOpen: boolean;
  onClose: () => void;
  onInspectObservation?: (observationId: string) => void;
}

export const ContradictionDetailModal: React.FC<ContradictionDetailModalProps> = ({
  pair,
  isOpen,
  onClose,
  onInspectObservation,
}) => {
  if (!isOpen || !pair) return null;

  const isConflict = pair.classification === 'POTENTIAL_VELOCITY_CONTRADICTION';

  const classificationBadge = () => {
    switch (pair.classification) {
      case 'POTENTIAL_VELOCITY_CONTRADICTION':
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase bg-rose-950 text-rose-400 border border-rose-800 flex items-center space-x-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Potential Velocity Contradiction</span>
          </span>
        );
      case 'DUPLICATE_CANDIDATE':
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase bg-amber-950 text-amber-400 border border-amber-800 flex items-center space-x-1">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Duplicate Observation Candidate</span>
          </span>
        );
      case 'INSUFFICIENT_INFORMATION':
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
            Insufficient Information
          </span>
        );
      case 'INVALID_OBSERVATION':
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase bg-rose-950 text-rose-400 border border-rose-800">
            Invalid Geographic Coordinates
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center space-x-1">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Physically Plausible</span>
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-lg ${isConflict ? 'bg-rose-950 border border-rose-800 text-rose-400' : 'bg-slate-800 border border-slate-700 text-slate-300'}`}>
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white font-mono flex items-center space-x-2">
                <span>Pairwise Velocity Analysis</span>
              </h2>
              <div className="mt-1">{classificationBadge()}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Observation Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Observation A */}
            <div className="bg-slate-950/80 rounded-lg border border-slate-800 p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="font-mono font-semibold text-indigo-400 text-[11px]">
                  Obs A: {pair.observationAId.slice(0, 8)}
                </span>
                {onInspectObservation && (
                  <button
                    onClick={() => onInspectObservation(pair.observationAId)}
                    className="text-slate-400 hover:text-indigo-300 transition flex items-center space-x-0.5 text-[10px]"
                  >
                    <span>Inspect</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-slate-300 text-[11px] leading-tight">{pair.observationASummary}</p>
              <div className="text-[10px] text-slate-400 font-mono flex items-center space-x-1 pt-1">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>{pair.observationATime ? new Date(pair.observationATime).toLocaleString() : 'N/A'}</span>
              </div>
            </div>

            {/* Observation B */}
            <div className="bg-slate-950/80 rounded-lg border border-slate-800 p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="font-mono font-semibold text-indigo-400 text-[11px]">
                  Obs B: {pair.observationBId.slice(0, 8)}
                </span>
                {onInspectObservation && (
                  <button
                    onClick={() => onInspectObservation(pair.observationBId)}
                    className="text-slate-400 hover:text-indigo-300 transition flex items-center space-x-0.5 text-[10px]"
                  >
                    <span>Inspect</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-slate-300 text-[11px] leading-tight">{pair.observationBSummary}</p>
              <div className="text-[10px] text-slate-400 font-mono flex items-center space-x-1 pt-1">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>{pair.observationBTime ? new Date(pair.observationBTime).toLocaleString() : 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Metric Grid */}
          <div className="bg-slate-950/90 rounded-lg border border-slate-800 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-medium">Raw Separation</span>
              <span className="font-mono text-slate-200 font-bold text-xs">{pair.rawDistanceKm} km</span>
            </div>

            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-medium">Effective Min Dist</span>
              <span className="font-mono text-slate-200 font-bold text-xs">{pair.effectiveMinDistanceKm} km</span>
              <span className="text-[9px] text-slate-500 block">(-{pair.uncertaintySubtractedKm}km unc.)</span>
            </div>

            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-medium">Time Interval</span>
              <span className="font-mono text-slate-200 font-bold text-xs">
                {pair.timeDeltaMinutes} min
              </span>
              <span className="text-[9px] text-slate-500 block">({pair.timeDeltaHours}h)</span>
            </div>

            <div className={`p-2 rounded border ${isConflict ? 'bg-rose-950/50 border-rose-900/80 text-rose-300' : 'bg-slate-900 border-slate-800 text-slate-200'}`}>
              <span className="text-[10px] text-slate-400 block font-medium">Required Velocity</span>
              <span className="font-mono font-bold text-xs">{pair.requiredSpeedKmh} km/h</span>
              <span className="text-[9px] text-slate-500 block">(Assumed max: {pair.assumedMaxSpeedKmh} km/h)</span>
            </div>
          </div>

          {/* Rationale & Explanation */}
          <div className="bg-slate-950/60 rounded-lg border border-slate-800 p-3 space-y-1.5">
            <span className="text-slate-400 font-semibold text-[11px] block">Analytical Explanation:</span>
            <p className="text-slate-300 text-xs leading-relaxed font-sans">{pair.calculationRationale}</p>
          </div>

          {/* Limitations Disclaimer */}
          <div className="p-3 bg-amber-950/20 border border-amber-900/50 rounded-lg flex items-start space-x-2 text-slate-400 text-[11px] leading-relaxed">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Investigative Caution:</strong> {pair.limitations}
            </span>
          </div>

          {/* Reported sequence note */}
          <div className="text-[10px] text-slate-500 font-mono text-center italic">
            "Reported sequence, not a verified route." Contradiction lines model spatio-temporal tension, not proven falsehoods.
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
