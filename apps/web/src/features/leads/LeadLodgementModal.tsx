import React, { useState } from 'react';
import { X, AlertCircle, PlusCircle, MapPin, Check } from 'lucide-react';
import { createCaseLead, CreateLeadPayload, LeadSource } from '../../lib/api';

interface LeadLodgementModalProps {
  caseId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  eligibleAssignees: Array<{ id: string; displayName: string; badgeNumber: string | null; role: string }>;
}

export const LeadLodgementModal: React.FC<LeadLodgementModalProps> = ({
  caseId,
  isOpen,
  onClose,
  onSuccess,
  eligibleAssignees,
}) => {
  const [sourceType, setSourceType] = useState<LeadSource>('CITIZEN_TIP');
  const [narrative, setNarrative] = useState('');
  const [sourceContact, setSourceContact] = useState('');
  const [observedAt, setObservedAt] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [uncertaintyMeters, setUncertaintyMeters] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (narrative.trim().length < 5) {
      setError('Narrative must be at least 5 characters describing the sighting or information.');
      return;
    }

    const hasLat = latitude.trim() !== '';
    const hasLng = longitude.trim() !== '';

    if (hasLat !== hasLng) {
      setError('Both latitude and longitude must be provided together, or leave both empty.');
      return;
    }

    let latNum: number | undefined = undefined;
    let lngNum: number | undefined = undefined;

    if (hasLat && hasLng) {
      latNum = parseFloat(latitude.trim());
      lngNum = parseFloat(longitude.trim());

      if (isNaN(latNum) || latNum < -90 || latNum > 90) {
        setError('Latitude must be a valid number between -90 and 90 degrees.');
        return;
      }
      if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        setError('Longitude must be a valid number between -180 and 180 degrees.');
        return;
      }
    }

    let uncertaintyNum: number | undefined = undefined;
    if (uncertaintyMeters.trim() !== '') {
      uncertaintyNum = parseFloat(uncertaintyMeters.trim());
      if (isNaN(uncertaintyNum) || uncertaintyNum <= 0) {
        setError('Location uncertainty must be a positive number in meters.');
        return;
      }
    }

    const payload: CreateLeadPayload = {
      sourceType,
      narrative: narrative.trim(),
      sourceContact: sourceContact.trim() || undefined,
      observedAt: observedAt ? new Date(observedAt).toISOString() : undefined,
      latitude: latNum,
      longitude: lngNum,
      locationUncertaintyMeters: uncertaintyNum,
      locationDescription: locationDescription.trim() || undefined,
      assignedUserId: assignedUserId || undefined,
    };

    setLoading(true);
    try {
      await createCaseLead(caseId, payload);
      // Reset form
      setNarrative('');
      setSourceContact('');
      setObservedAt('');
      setLatitude('');
      setLongitude('');
      setUncertaintyMeters('');
      setLocationDescription('');
      setAssignedUserId('');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lodge lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-indigo-400">
            <PlusCircle className="w-5 h-5" />
            <h3 className="font-semibold text-white text-base">Lodge New Lead / Sighting</h3>
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
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Source Type <span className="text-rose-400">*</span>
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as LeadSource)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="CITIZEN_TIP">Citizen Tip</option>
                <option value="WITNESS_STATEMENT">Witness Statement</option>
                <option value="OFFICER_PATROL">Officer Patrol Sighting</option>
                <option value="CCTV_REVIEW">CCTV Review</option>
                <option value="SYNTHETIC_TELCO">Telco Signal Observation</option>
                <option value="SYNTHETIC_FINANCIAL">Financial POS Transaction</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Source Informant Contact
              </label>
              <input
                type="text"
                placeholder="Phone, email or anonymous ref"
                value={sourceContact}
                onChange={(e) => setSourceContact(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Observation Timestamp (Alleged Sighting Time)
            </label>
            <input
              type="datetime-local"
              value={observedAt}
              onChange={(e) => setObservedAt(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Lead Narrative / Sighting Details <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              required
              placeholder="Detailed description of what was observed, clothes worn, direction of travel, demeanor, etc."
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
            />
          </div>

          {/* Spatial Coordinates Section */}
          <div className="p-3 bg-slate-950/60 rounded border border-slate-800/80 space-y-2.5">
            <div className="flex items-center space-x-1.5 text-indigo-400 font-semibold">
              <MapPin className="w-3.5 h-3.5" />
              <span>Geospatial Coordinates (Optional Sighting Location)</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Only provide coordinates if a physical sighting was reported at a specific location. Never invent locations.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-slate-400 text-[11px] mb-0.5">Latitude</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 28.6692"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-0.5">Longitude</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 77.1325"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-0.5">Uncertainty (meters)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 150"
                  value={uncertaintyMeters}
                  onChange={(e) => setUncertaintyMeters(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 text-[11px] mb-0.5">Location Landmark / Description</label>
              <input
                type="text"
                placeholder="e.g. Near Metro Gate 2 tea stall"
                value={locationDescription}
                onChange={(e) => setLocationDescription(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Assigned Officer Selection */}
          {eligibleAssignees.length > 0 && (
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Assign Directly to Case Officer (Optional)
              </label>
              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Leave Unassigned (Triage in Queue)</option>
                {eligibleAssignees.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} ({user.badgeNumber ? `Badge ${user.badgeNumber}` : user.role})
                  </option>
                ))}
              </select>
            </div>
          )}

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
              <span>{loading ? 'Submitting...' : 'Register Lead'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
