import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { 
  Compass, 
  AlertTriangle, 
  Info, 
  Sliders, 
  Check, 
  X, 
  RefreshCw,
  Layers
} from 'lucide-react';
import { 
  LocationObservation, 
  SearchZoneHypothesis, 
  SearchRadiusResult, 
  calculateSearchRadius,
  getCaseContradictions,
  getCaseHypotheses,
  MultiObservationAnalysisResult,
  PairwiseComparisonResult
} from '../../lib/api';
import { useAuth } from '../../app/AuthContext';
import { ObservationExclusionModal } from './ObservationExclusionModal';
import { ContradictionDetailModal } from './ContradictionDetailModal';

interface CaseMapCanvasProps {
  caseId: string;
  observations: LocationObservation[];
  hypotheses?: SearchZoneHypothesis[];
  onHypothesisCreated?: (result: SearchRadiusResult) => void;
  onRefreshRequested?: () => void;
}

export const CaseMapCanvas: React.FC<CaseMapCanvasProps> = ({
  caseId,
  observations,
  hypotheses = [],
  onHypothesisCreated,
  onRefreshRequested,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const { canCalculateHypothesis } = useAuth();

  // Search calculation drawer state
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Form parameters
  const [selectedAnchorId, setSelectedAnchorId] = useState<string>(
    observations.length > 0 ? observations[observations.length - 1].id : ''
  );
  const [travelMode, setTravelMode] = useState<'PEDESTRIAN' | 'TRANSIT' | 'VEHICULAR'>('PEDESTRIAN');
  const [customSpeed, setCustomSpeed] = useState<number>(4.5);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [exclusionReasons, setExclusionReasons] = useState<Record<string, string>>({});
  const [latestCalcResult, setLatestCalcResult] = useState<SearchRadiusResult | null>(null);

  // Feature A: Multi-Observation Contradiction Data
  const [contradictionData, setContradictionData] = useState<MultiObservationAnalysisResult | null>(null);
  const [selectedPair, setSelectedPair] = useState<PairwiseComparisonResult | null>(null);
  const [pairModalOpen, setPairModalOpen] = useState(false);

  // Feature B: Observation Detail & Exclusion Modal
  const [selectedObsForExclusion, setSelectedObsForExclusion] = useState<LocationObservation | null>(null);
  const [exclusionModalOpen, setExclusionModalOpen] = useState(false);

  // Feature C: Competing Search-Hypothesis Switcher
  const [caseHypotheses, setCaseHypotheses] = useState<SearchZoneHypothesis[]>(hypotheses);
  const [selectedHypothesisId, setSelectedHypothesisId] = useState<string>('');
  const [showHypothesisSelector, setShowHypothesisSelector] = useState(false);

  // Sync external hypotheses prop
  useEffect(() => {
    if (hypotheses && hypotheses.length > 0) {
      setCaseHypotheses(hypotheses);
      if (!selectedHypothesisId) {
        const active = hypotheses.find((h) => h.isActive) || hypotheses[0];
        setSelectedHypothesisId(active.id);
      }
    }
  }, [hypotheses, selectedHypothesisId]);

  // Fetch Contradiction Analysis from Backend
  const fetchContradictions = useCallback(async () => {
    if (!caseId) return;
    try {
      const result = await getCaseContradictions(caseId, {
        assumedTravelMode: travelMode,
        maxSpeedKmh: customSpeed,
      });
      setContradictionData(result);
    } catch (err) {
      console.warn('Contradiction analysis fetch warning:', err);
    }
  }, [caseId, travelMode, customSpeed]);

  // Fetch Historical Hypotheses
  const fetchHypotheses = useCallback(async () => {
    if (!caseId) return;
    try {
      const list = await getCaseHypotheses(caseId);
      if (list && list.length > 0) {
        setCaseHypotheses(list);
        if (!selectedHypothesisId) {
          const active = list.find((h) => h.isActive) || list[0];
          setSelectedHypothesisId(active.id);
        }
      }
    } catch (err) {
      console.warn('Hypotheses fetch warning:', err);
    }
  }, [caseId, selectedHypothesisId]);

  useEffect(() => {
    fetchContradictions();
    fetchHypotheses();
  }, [fetchContradictions, fetchHypotheses]);

  // Determine currently viewed hypothesis
  const currentDisplayedHypothesis =
    caseHypotheses.find((h) => h.id === selectedHypothesisId) ||
    latestCalcResult?.hypothesis ||
    caseHypotheses.find((h) => h.isActive) ||
    null;

  // Update default anchor when observations change
  useEffect(() => {
    if (observations.length > 0 && !selectedAnchorId) {
      setSelectedAnchorId(observations[observations.length - 1].id);
    }
  }, [observations, selectedAnchorId]);

  // Mode speeds
  const handleModeChange = (mode: 'PEDESTRIAN' | 'TRANSIT' | 'VEHICULAR') => {
    setTravelMode(mode);
    if (mode === 'PEDESTRIAN') setCustomSpeed(4.5);
    else if (mode === 'TRANSIT') setCustomSpeed(25.0);
    else if (mode === 'VEHICULAR') setCustomSpeed(45.0);
  };

  const toggleExcludeObservation = (obsId: string) => {
    if (excludedIds.includes(obsId)) {
      setExcludedIds(excludedIds.filter((id) => id !== obsId));
      const nextReasons = { ...exclusionReasons };
      delete nextReasons[obsId];
      setExclusionReasons(nextReasons);
    } else {
      setExcludedIds([...excludedIds, obsId]);
      setExclusionReasons({
        ...exclusionReasons,
        [obsId]: 'Velocity threshold contradiction under assumed mode',
      });
    }
  };

  // Open Exclusion Modal for an observation
  const handleOpenExclusionModal = (obsId: string) => {
    const obs = observations.find((o) => o.id === obsId);
    if (obs) {
      setSelectedObsForExclusion(obs);
      setExclusionModalOpen(true);
    }
  };

  // Lifecycle callback after exclusion or reconsideration
  const handleExclusionSuccess = () => {
    fetchContradictions();
    fetchHypotheses();
    if (onRefreshRequested) {
      onRefreshRequested();
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultCenter: [number, number] = observations.length > 0
        ? [observations[0].latitude, observations[0].longitude]
        : [28.6139, 77.2090]; // Delhi reference

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 13,
        zoomControl: false,
      });

      L.control.zoom({ position: 'topright' }).addTo(map);

      // OpenStreetMap base tile layer (replaces previous CARTO provider to eliminate API key watermark)
      const tileUrl = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      const tileAttribution =
        import.meta.env.VITE_MAP_ATTRIBUTION ||
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

      L.tileLayer(tileUrl, {
        attribution: tileAttribution,
        maxZoom: 19,
      }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      mapInstanceRef.current = map;
    }
  }, []);

  // Render Map Layers: Markers, Sequence Polyline, Contradiction Vectors, Search Zone
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    if (observations.length === 0) return;

    const bounds = L.latLngBounds([]);

    // Sort observations chronologically
    const sortedObs = [...observations].sort(
      (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()
    );

    // Set of observation IDs that have active potential velocity contradictions
    const contradictoryObsIds = new Set<string>();
    if (contradictionData?.pairwiseMatrix) {
      contradictionData.pairwiseMatrix.forEach((pair) => {
        if (pair.isContradictory && pair.classification === 'POTENTIAL_VELOCITY_CONTRADICTION') {
          contradictoryObsIds.add(pair.observationAId);
          contradictoryObsIds.add(pair.observationBId);
        }
      });
    }

    // 1. Draw Chronological Clue Sequence Line (Base Polyline)
    if (sortedObs.length > 1) {
      const lineCoords: [number, number][] = sortedObs
        .filter((o) => o.latitude != null && o.longitude != null)
        .map((o) => [o.latitude, o.longitude]);

      if (lineCoords.length > 1) {
        const polyline = L.polyline(lineCoords, {
          color: '#4f46e5',
          weight: 2,
          opacity: 0.7,
          dashArray: '6, 8',
        });
        polyline.bindTooltip('Reported chronological clue sequence (not verified travel route)', {
          sticky: true,
          className: 'bg-slate-900 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700',
        });
        layerGroup.addLayer(polyline);
      }
    }

    // 2. Feature A: Draw Contradiction Overlays / Warning Vectors
    if (contradictionData?.pairwiseMatrix) {
      contradictionData.pairwiseMatrix.forEach((pair) => {
        if (pair.isContradictory && pair.classification === 'POTENTIAL_VELOCITY_CONTRADICTION') {
          const obsA = observations.find((o) => o.id === pair.observationAId);
          const obsB = observations.find((o) => o.id === pair.observationBId);

          if (obsA && obsB && obsA.latitude != null && obsB.latitude != null) {
            const warningLine = L.polyline(
              [
                [obsA.latitude, obsA.longitude],
                [obsB.latitude, obsB.longitude],
              ],
              {
                color: '#f43f5e',
                weight: 2.5,
                opacity: 0.9,
                dashArray: '4, 6',
              }
            );

            warningLine.bindTooltip(
              `<div style="font-family: sans-serif; font-size: 11px; line-height: 1.3;">
                <div style="font-weight: bold; color: #f43f5e; margin-bottom: 2px;">Potential Velocity Contradiction</div>
                <div>Required speed: <strong>${pair.requiredSpeedKmh} km/h</strong></div>
                <div style="color: #94a3b8;">Effective sep: ${pair.effectiveMinDistanceKm} km in ${pair.timeDeltaMinutes} min</div>
                <div style="font-size: 9px; color: #cbd5e1; margin-top: 2px;">(Click vector for analytical details)</div>
              </div>`,
              { sticky: true }
            );

            // On click, open ContradictionDetailModal
            warningLine.on('click', () => {
              setSelectedPair(pair);
              setPairModalOpen(true);
            });

            layerGroup.addLayer(warningLine);
          }
        }
      });
    }

    // 3. Render Observations & Uncertainty Circles
    sortedObs.forEach((obs, index) => {
      if (obs.latitude == null || obs.longitude == null) return;
      const latLng: [number, number] = [obs.latitude, obs.longitude];
      bounds.extend(latLng);

      const isAnchor = obs.id === selectedAnchorId;
      const isExcluded = excludedIds.includes(obs.id);
      const hasConflict = contradictoryObsIds.has(obs.id);

      // Uncertainty Circle
      const circle = L.circle(latLng, {
        radius: obs.locationUncertaintyMeters || 100,
        color: isExcluded ? '#94a3b8' : hasConflict ? '#f43f5e' : isAnchor ? '#eab308' : '#3b82f6',
        fillColor: isExcluded ? '#cbd5e1' : hasConflict ? '#fda4af' : isAnchor ? '#fef08a' : '#93c5fd',
        fillOpacity: isExcluded ? 0.08 : hasConflict ? 0.16 : isAnchor ? 0.2 : 0.14,
        weight: isExcluded ? 1 : hasConflict ? 2 : 1.5,
        dashArray: isExcluded ? '4, 4' : undefined,
      });
      layerGroup.addLayer(circle);

      // Marker Icon creation
      let markerColor = '#2563eb';
      let badgeLabel = `${index + 1}`;
      if (isExcluded) {
        markerColor = '#64748b';
      } else if (hasConflict) {
        markerColor = '#e11d48'; // Rose for conflict
      } else if (isAnchor) {
        markerColor = '#ca8a04';
      }

      const iconHtml = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; cursor: pointer;">
          <div style="background-color: ${markerColor}; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 11px; font-weight: bold; font-family: monospace;">
            ${badgeLabel}
          </div>
          ${isAnchor ? '<div style="position: absolute; top: -5px; right: -5px; background-color: #ca8a04; border-radius: 50%; width: 10px; height: 10px; border: 1.5px solid #fff;" title="Active Anchor"></div>' : ''}
          ${hasConflict && !isExcluded ? '<div style="position: absolute; top: -5px; left: -5px; background-color: #e11d48; border-radius: 50%; width: 10px; height: 10px; border: 1.5px solid #fff; display: flex; align-items: center; justify-content: center; font-size: 7px; color: #fff; font-weight: bold;" title="Velocity Conflict Detected">!</div>' : ''}
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-map-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker(latLng, { icon: customIcon });

      const popupContent = document.createElement('div');
      popupContent.style.fontFamily = 'sans-serif';
      popupContent.style.fontSize = '12px';
      popupContent.style.color = '#0f172a';
      popupContent.style.maxWidth = '250px';
      popupContent.style.lineHeight = '1.4';

      popupContent.innerHTML = `
        <div style="font-weight: bold; color: #1e293b; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
          <span>#${index + 1} ${obs.observationType.replace(/_/g, ' ')}</span>
          ${isAnchor ? '<span style="color: #ca8a04; font-size: 10px; font-weight: bold;">[ANCHOR]</span>' : ''}
        </div>
        <div style="font-size: 11px; color: #475569; margin-bottom: 4px;">
          ${new Date(obs.observedAt).toLocaleString()}
        </div>
        <div style="margin-bottom: 6px; color: #334155; font-size: 11px;">
          ${obs.sourceDescription}
        </div>
        <div style="font-size: 10px; font-family: monospace; color: #64748b; background: #f1f5f9; padding: 3px 6px; border-radius: 4px; margin-bottom: 6px;">
          Lat: ${obs.latitude.toFixed(5)}, Lng: ${obs.longitude.toFixed(5)}<br/>
          Spatial Uncertainty: &plusmn;${obs.locationUncertaintyMeters || 100}m
        </div>
        ${hasConflict && !isExcluded ? `
          <div style="font-size: 10px; color: #e11d48; background: #ffe4e6; padding: 3px 6px; border-radius: 4px; margin-bottom: 6px; font-weight: 600;">
            ⚠ Potential velocity contradiction flagged
          </div>
        ` : ''}
        ${isExcluded ? `
          <div style="font-size: 10px; color: #64748b; background: #f1f5f9; padding: 3px 6px; border-radius: 4px; margin-bottom: 6px; font-style: italic;">
            Excluded from active search analysis
          </div>
        ` : ''}
        <button id="btn-inspect-${obs.id}" style="width: 100%; padding: 4px 8px; background-color: #3b82f6; color: #ffffff; border: none; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
          Inspect / Exclusion Lifecycle &rarr;
        </button>
      `;

      // Wire up button click inside popup
      const inspectBtn = popupContent.querySelector(`#btn-inspect-${obs.id}`);
      if (inspectBtn) {
        inspectBtn.addEventListener('click', (e) => {
          e.preventDefault();
          handleOpenExclusionModal(obs.id);
        });
      }

      marker.bindPopup(popupContent);
      layerGroup.addLayer(marker);
    });

    // 4. Feature C: Render Candidate Search Zone Hypothesis (Primary or Selected Alternate)
    if (currentDisplayedHypothesis?.geometryGeojson) {
      try {
        const isAlternate = (currentDisplayedHypothesis as any).isAlternateHypothesis || !currentDisplayedHypothesis.isActive;
        const geojsonLayer = L.geoJSON(currentDisplayedHypothesis.geometryGeojson, {
          style: {
            color: isAlternate ? '#8b5cf6' : '#d97706',
            fillColor: isAlternate ? '#a78bfa' : '#f59e0b',
            fillOpacity: isAlternate ? 0.14 : 0.18,
            weight: 2,
            dashArray: isAlternate ? '6, 6' : '4, 4',
          },
        });

        geojsonLayer.bindTooltip(
          `<div>
            <div style="font-weight: bold; font-size: 11px; color: ${isAlternate ? '#8b5cf6' : '#d97706'};">
              ${isAlternate ? 'Alternate Candidate Zone' : 'Primary Candidate Zone'}
            </div>
            <div style="font-size: 10px; color: #64748b;">${currentDisplayedHypothesis.title}</div>
            <div style="font-size: 9px; color: #94a3b8; font-style: italic; margin-top: 2px;">
              ${isAlternate ? 'Alternative proposal for consideration' : 'Active triage hypothesis'}
            </div>
          </div>`,
          { sticky: true }
        );

        layerGroup.addLayer(geojsonLayer);
        bounds.extend(geojsonLayer.getBounds());
      } catch (err) {
        console.error('Failed to render search zone geojson:', err);
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [
    observations, 
    currentDisplayedHypothesis, 
    selectedAnchorId, 
    excludedIds, 
    contradictionData
  ]);

  // Execute Search Radius Calculation
  const handleCalculateRadius = async () => {
    if (!selectedAnchorId) {
      setCalcError('Please select an anchor observation');
      return;
    }

    setCalculating(true);
    setCalcError(null);

    try {
      const result = await calculateSearchRadius(caseId, {
        anchorObservationId: selectedAnchorId,
        assumedTravelMode: travelMode,
        maxSpeedKmh: customSpeed,
        excludedObservationIds: excludedIds,
        exclusionReasons,
      });

      setLatestCalcResult(result);
      if (onHypothesisCreated) {
        onHypothesisCreated(result);
      }

      // Refresh hypotheses and contradictions
      fetchHypotheses();
      fetchContradictions();
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const anchorObs = observations.find((o) => o.id === selectedAnchorId);
  const activeContradictionCount = contradictionData?.contradictionPairsCount || 0;
  const isViewingAlternate = currentDisplayedHypothesis && (currentDisplayedHypothesis as any).isAlternateHypothesis;

  return (
    <div className="relative w-full h-[540px] rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex flex-col shadow-md">
      {/* Top Map Operational Banners */}
      <div className="absolute top-3 left-3 z-20 flex flex-col space-y-1.5 pointer-events-none max-w-md">
        {/* Sequence Disclaimer Pill */}
        <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-900/90 backdrop-blur-sm border border-slate-700/80 text-[11px] text-slate-300 shadow-lg pointer-events-auto">
          <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="font-medium">Reported sequence, not a verified route</span>
        </div>

        {/* Feature A: Contradiction Alert Pill */}
        {activeContradictionCount > 0 && (
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded bg-rose-950/90 backdrop-blur-sm border border-rose-700/80 text-[11px] text-rose-200 shadow-lg pointer-events-auto">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />
            <span className="font-medium font-mono">
              {activeContradictionCount} Velocity Contradiction{activeContradictionCount > 1 ? 's' : ''} Flagged
            </span>
          </div>
        )}

        {/* Feature C: Active Hypothesis Pill */}
        {currentDisplayedHypothesis && (
          <div className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded backdrop-blur-sm border text-[11px] shadow-lg pointer-events-auto ${
            isViewingAlternate
              ? 'bg-purple-950/90 border-purple-700/80 text-purple-200'
              : 'bg-amber-950/90 border-amber-700/80 text-amber-200'
          }`}>
            <Compass className={`w-3.5 h-3.5 shrink-0 ${isViewingAlternate ? 'text-purple-400' : 'text-amber-400'}`} />
            <span className="font-medium">
              {isViewingAlternate ? 'Alternate Proposal' : 'Primary Candidate Zone'}: {currentDisplayedHypothesis.title.slice(0, 36)}...
            </span>
          </div>
        )}
      </div>

      {/* Top Right Action Controls: Hypothesis Switcher & Calculator */}
      <div className="absolute top-3 right-12 z-20 flex items-center space-x-2">
        {/* Feature C: Competing Hypotheses Switcher Button */}
        {caseHypotheses.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setShowHypothesisSelector(!showHypothesisSelector)}
              className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded border text-xs font-medium shadow-lg backdrop-blur-sm transition ${
                isViewingAlternate
                  ? 'bg-purple-900/90 hover:bg-purple-800 text-purple-100 border-purple-600'
                  : 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Hypotheses ({caseHypotheses.length})</span>
            </button>

            {/* Hypotheses Switcher Dropdown */}
            {showHypothesisSelector && (
              <div className="absolute right-0 mt-1.5 w-72 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-2 space-y-1 text-xs z-30">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1 border-b border-slate-800">
                  Competing Search Hypotheses
                </div>
                {caseHypotheses.map((hyp) => {
                  const isAlt = (hyp as any).isAlternateHypothesis || !hyp.isActive;
                  const isSelected = hyp.id === selectedHypothesisId;
                  return (
                    <button
                      key={hyp.id}
                      onClick={() => {
                        setSelectedHypothesisId(hyp.id);
                        setShowHypothesisSelector(false);
                      }}
                      className={`w-full text-left p-2 rounded transition flex flex-col space-y-0.5 ${
                        isSelected
                          ? isAlt
                            ? 'bg-purple-950/80 border border-purple-700 text-purple-200 font-semibold'
                            : 'bg-amber-950/80 border border-amber-700 text-amber-200 font-semibold'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{hyp.title}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {isAlt ? 'Alternate proposal (Competing Cluster)' : 'Authoritative Primary Zone'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Decision Support / Search Radius Trigger */}
        {canCalculateHypothesis && (
          <button
            onClick={() => setCalculatorOpen(!calculatorOpen)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium shadow-lg backdrop-blur-sm transition"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span>Search Radius Calculator</span>
          </button>
        )}
      </div>

      {/* Leaflet Map DOM Element */}
      <div ref={mapContainerRef} className="flex-1 w-full h-full z-0" />

      {/* Bottom Map Legend */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center space-x-3 px-3 py-1.5 rounded bg-slate-900/90 backdrop-blur-sm border border-slate-800 text-[11px] text-slate-300 shadow-lg">
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
          <span>Observation</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
          <span>Velocity Conflict</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block"></span>
          <span>Excluded</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-4 h-0.5 border-t border-dashed border-rose-500 inline-block"></span>
          <span>Contradiction Vector</span>
        </div>
        {currentDisplayedHypothesis && (
          <div className="flex items-center space-x-1.5">
            <span className={`w-3 h-3 rounded border inline-block ${
              isViewingAlternate ? 'bg-purple-500/20 border-purple-500' : 'bg-amber-500/20 border-amber-500'
            }`}></span>
            <span>{isViewingAlternate ? 'Alternate Zone' : 'Primary Zone'}</span>
          </div>
        )}
      </div>

      {/* Feature C: Hypothesis Rationale & Non-Guaranteed Disclaimer Banner (Footer) */}
      {currentDisplayedHypothesis && (
        <div className="bg-slate-950 border-t border-slate-800 px-4 py-2 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center space-x-2 truncate">
            <Compass className={`w-3.5 h-3.5 shrink-0 ${isViewingAlternate ? 'text-purple-400' : 'text-amber-400'}`} />
            <span className="font-medium text-slate-300 truncate">
              {currentDisplayedHypothesis.title}
            </span>
            <span className="text-slate-500">&bull;</span>
            <span className="truncate italic">
              "Candidate search area based on stated assumptions; not a confirmed location or guaranteed boundary."
            </span>
          </div>
          {isViewingAlternate && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800 shrink-0">
              ALTERNATIVE PROPOSAL
            </span>
          )}
        </div>
      )}

      {/* Decision Support / Calculator Flyout */}
      {calculatorOpen && (
        <div className="absolute top-0 right-0 bottom-0 w-96 bg-slate-900/95 backdrop-blur-md border-l border-slate-800 z-30 p-4 overflow-y-auto flex flex-col space-y-4 text-xs text-slate-200 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-2">
              <Compass className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-slate-100 text-sm">Deterministic Search Radius</span>
            </div>
            <button
              onClick={() => setCalculatorOpen(false)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-2.5 rounded bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-300/90 leading-tight">
            <strong>Decision Support Note:</strong> Evaluates plausible travel distance based on velocity assumptions from an anchor clue. Does not guarantee subject presence.
          </div>

          {calcError && (
            <div className="p-2 rounded bg-rose-950/40 border border-rose-800/50 text-rose-300 text-[11px]">
              {calcError}
            </div>
          )}

          {/* Anchor Selection */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300 block">Anchor Observation</label>
            <select
              value={selectedAnchorId}
              onChange={(e) => setSelectedAnchorId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {observations.map((obs, idx) => (
                <option key={obs.id} value={obs.id}>
                  #{idx + 1} {obs.observationType.replace(/_/g, ' ')} — {new Date(obs.observedAt).toLocaleTimeString()} (&plusmn;{obs.locationUncertaintyMeters || 100}m)
                </option>
              ))}
            </select>
            {anchorObs && (
              <div className="text-[10px] text-slate-400 font-mono">
                {anchorObs.sourceDescription} ({anchorObs.latitude.toFixed(4)}, {anchorObs.longitude.toFixed(4)})
              </div>
            )}
          </div>

          {/* Travel Mode & Assumed Speed */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300 block">Assumed Mobility Mode</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['PEDESTRIAN', 'TRANSIT', 'VEHICULAR'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleModeChange(mode)}
                  className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition ${
                    travelMode === mode
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {mode === 'PEDESTRIAN' && 'Foot (4.5 km/h)'}
                  {mode === 'TRANSIT' && 'Transit (25 km/h)'}
                  {mode === 'VEHICULAR' && 'Vehicle (45 km/h)'}
                </button>
              ))}
            </div>
            <div className="flex items-center space-x-2 pt-1">
              <span className="text-[11px] text-slate-400">Custom Max Speed (km/h):</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="160"
                value={customSpeed}
                onChange={(e) => setCustomSpeed(parseFloat(e.target.value) || 1)}
                className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none"
              />
            </div>
          </div>

          {/* Contradiction Analysis & Exclusion List */}
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-300">Observation Contradiction Check</label>
              <span className="text-[10px] text-slate-400">Exclusion without deletion</span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {observations
                .filter((o) => o.id !== selectedAnchorId)
                .map((obs, idx) => {
                  const isExcluded = excludedIds.includes(obs.id);
                  return (
                    <div
                      key={obs.id}
                      className={`p-2 rounded border transition ${
                        isExcluded
                          ? 'bg-slate-950/50 border-slate-800 text-slate-500'
                          : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-[11px] flex items-center space-x-1.5">
                            <span>#{idx + 1} {obs.observationType.replace(/_/g, ' ')}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {obs.sourceDescription.slice(0, 32)}...
                          </div>
                        </div>

                        <label className="flex items-center space-x-1 text-[10px] font-mono cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isExcluded}
                            onChange={() => toggleExcludeObservation(obs.id)}
                            className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                          />
                          <span>Exclude</span>
                        </label>
                      </div>

                      {isExcluded && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800/80">
                          <input
                            type="text"
                            placeholder="Reason for exclusion..."
                            value={exclusionReasons[obs.id] || ''}
                            onChange={(e) =>
                              setExclusionReasons({ ...exclusionReasons, [obs.id]: e.target.value })
                            }
                            className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-300 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={handleCalculateRadius}
              disabled={calculating}
              className="w-full py-2 px-3 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs transition flex items-center justify-center space-x-1.5 shadow disabled:opacity-50"
            >
              {calculating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Computing Polygon...</span>
                </>
              ) : (
                <>
                  <Compass className="w-3.5 h-3.5" />
                  <span>Generate Candidate Search Zone</span>
                </>
              )}
            </button>
          </div>

          {/* Result Breakdown Card */}
          {latestCalcResult && (
            <div className="p-2.5 rounded bg-slate-950 border border-amber-900/50 space-y-2 text-[11px]">
              <div className="font-semibold text-amber-400 flex items-center space-x-1">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Deterministic Calculation Output</span>
              </div>
              <div className="font-mono text-[10px] space-y-1 text-slate-300">
                <div>Elapsed: {latestCalcResult.calculationDetails.elapsedHours} hours</div>
                <div>Travel Buffer: {(latestCalcResult.calculationDetails.travelDistanceMeters / 1000).toFixed(1)} km</div>
                <div>Anchor Uncertainty: &plusmn;{latestCalcResult.calculationDetails.anchorObservation.uncertaintyMeters} m</div>
                <div className="font-bold text-amber-300">
                  Candidate Radius: {(latestCalcResult.calculationDetails.candidateRadiusMeters / 1000).toFixed(1)} km
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                {latestCalcResult.calculationDetails.rationale}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Feature A: Contradiction Detail Modal */}
      {selectedPair && (
        <ContradictionDetailModal
          pair={selectedPair}
          isOpen={pairModalOpen}
          onClose={() => {
            setPairModalOpen(false);
            setSelectedPair(null);
          }}
          onInspectObservation={(obsId) => {
            setPairModalOpen(false);
            handleOpenExclusionModal(obsId);
          }}
        />
      )}

      {/* Feature B: Observation Exclusion Lifecycle Modal */}
      {selectedObsForExclusion && (
        <ObservationExclusionModal
          caseId={caseId}
          observation={selectedObsForExclusion}
          activeExclusion={
            contradictionData?.pairwiseMatrix ? null : undefined
          }
          currentHypothesisId={currentDisplayedHypothesis?.id}
          isOpen={exclusionModalOpen}
          onClose={() => {
            setExclusionModalOpen(false);
            setSelectedObsForExclusion(null);
          }}
          onSuccess={handleExclusionSuccess}
        />
      )}
    </div>
  );
};
