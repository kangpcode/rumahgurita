import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Layers, LocateFixed, MapPin, Navigation, ShieldCheck, X, ZoomIn, ZoomOut } from 'lucide-react';
import { FURNITURE_SPECS, STAIR_ZONES, TREE_PLACEMENTS } from '../game/levelData';
import type { FloorId, GameMapSnapshot, MapMarker, MapWaypoint } from '../game/types';

interface MapModalProps {
  snapshot: GameMapSnapshot;
  waypoint: MapWaypoint | null;
  onRefreshSnapshot?: () => GameMapSnapshot | null;
  onSetWaypoint: (wp: MapWaypoint | null) => void;
  onClose: () => void;
}

type MapFilter = 'all' | 'mission' | 'doors' | 'safety';

const FLOOR_TABS: Array<{ id: FloorId; label: string; short: string }> = [
  { id: 'outside', label: 'Komplek Sukajadi', short: 'Luar' },
  { id: 'ground', label: 'Lantai 1 Rumah', short: 'Lt. 1' },
  { id: 'second', label: 'Lantai 2 Rumah', short: 'Lt. 2' },
  { id: 'roof', label: 'Atap & Altar', short: 'Atap' },
];

const ROOM_LABELS: Record<FloorId, Array<{ text: string; x: number; z: number; tone?: 'safe' | 'warn' | 'muted' }>> = {
  outside: [
    { text: 'JALAN SUKAJADI', x: -24, z: 25.5, tone: 'muted' },
    { text: 'HALAMAN DEPAN', x: 0, z: 16.5, tone: 'muted' },
    { text: 'KOLAM TAMAN', x: 5.8, z: 14.5 },
  ],
  ground: [
    { text: 'RUANG TAMU', x: -7.5, z: -3.5 },
    { text: 'KORIDOR TENGAH', x: 0, z: 4.0, tone: 'muted' },
    { text: 'DAPUR', x: 8.5, z: -5.5 },
    { text: 'KAMAR TENGGARA', x: 10.5, z: 4.5 },
    { text: 'RUANG DOA (AMAN)', x: -12.9, z: 0, tone: 'safe' },
  ],
  second: [
    { text: 'KAMAR UTAMA LT.2', x: -7.5, z: -5.5 },
    { text: 'RUANG KELUARGA', x: -7.2, z: 3.5 },
    { text: 'KORIDOR LT.2', x: 0, z: 3.5, tone: 'muted' },
    { text: 'KAMAR TENGGARA LT.2', x: 10.2, z: 4.5 },
    { text: 'RUANG DOA LT.2', x: -12.9, z: 0, tone: 'safe' },
    { text: 'CERUK TIMUR', x: 0, z: -8.0, tone: 'safe' },
  ],
  roof: [
    { text: 'ALTAR KUJANG PAMUNGKAS', x: 9.6, z: 0.6, tone: 'safe' },
    { text: 'MENARA RADIO', x: -6.8, z: -3.2 },
    { text: 'PATUNG GURITA', x: -7.6, z: 5.2, tone: 'warn' },
    { text: 'TEMPAT BERTEDUH', x: 3.3, z: -8.0, tone: 'safe' },
  ],
};

function getFloorBounds(floor: FloorId): { minX: number; maxX: number; minZ: number; maxZ: number } {
  if (floor === 'outside') {
    return { minX: -46, maxX: 46, minZ: -13, maxZ: 59 };
  }
  return { minX: -17.5, maxX: 17.5, minZ: -11.5, maxZ: 13.5 };
}

function markerColor(kind: MapMarker['kind']): string {
  switch (kind) {
    case 'evidence':
      return '#f0c45a';
    case 'key':
      return '#ffdf6b';
    case 'salt':
      return '#d9e3de';
    case 'battery':
      return '#7ab8ff';
    case 'hiding':
      return '#b88354';
    case 'door_locked':
      return '#ef5b50';
    case 'door_closed':
      return '#cfa15a';
    case 'door_open':
      return '#52a675';
    case 'crumble':
      return '#e67e45';
    case 'radio':
      return '#57d4ff';
    case 'kujang':
      return '#ffdf78';
    case 'npc':
      return '#6be09d';
    case 'stair':
      return '#a8b7d4';
    case 'landmark':
      return '#9aa79e';
    case 'safe_zone':
      return '#56c285';
    case 'ghost':
      return '#ff3b30';
  }
}

function matchesFilter(kind: MapMarker['kind'], filter: MapFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'mission') {
    return (
      kind === 'evidence' ||
      kind === 'key' ||
      kind === 'crumble' ||
      kind === 'radio' ||
      kind === 'kujang' ||
      kind === 'battery' ||
      kind === 'salt' ||
      kind === 'ghost'
    );
  }
  if (filter === 'doors') {
    return kind === 'door_open' || kind === 'door_closed' || kind === 'door_locked' || kind === 'stair';
  }
  return kind === 'hiding' || kind === 'npc' || kind === 'landmark' || kind === 'safe_zone' || kind === 'ghost';
}

export const MapModal: React.FC<MapModalProps> = ({
  snapshot: initialSnapshot,
  waypoint,
  onRefreshSnapshot,
  onSetWaypoint,
  onClose,
}) => {
  const [snapshot, setSnapshot] = useState<GameMapSnapshot>(initialSnapshot);
  const [selectedFloor, setSelectedFloor] = useState<FloorId>(initialSnapshot.player.floor);
  const [filter, setFilter] = useState<MapFilter>('all');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; moved: boolean }>({
    active: false,
    lastX: 0,
    lastY: 0,
    moved: false,
  });
  const svgRef = useRef<SVGSVGElement | null>(null);

  const bounds = useMemo(() => getFloorBounds(selectedFloor), [selectedFloor]);
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const viewW = spanX / zoom;
  const viewH = spanZ / zoom;
  const centerX = (bounds.minX + bounds.maxX) * 0.5 + pan.x;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5 + pan.y;
  const vbX = centerX - viewW * 0.5;
  const vbY = centerZ - viewH * 0.5;

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  // Navigasi keyboard interaktif pada peta: [F / Space] fokus pemain, [+ / -] zoom, [Panah / WASD] geser denah
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'KeyF' || e.code === 'Space') {
        e.preventDefault();
        focusOnPlayer();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(3.6, z * 1.25));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom((z) => Math.max(0.75, z * 0.8));
      } else if (e.code === 'ArrowLeft') {
        setPan((p) => ({ ...p, x: p.x - viewW * 0.12 }));
      } else if (e.code === 'ArrowRight') {
        setPan((p) => ({ ...p, x: p.x + viewW * 0.12 }));
      } else if (e.code === 'ArrowUp') {
        setPan((p) => ({ ...p, y: p.y - viewH * 0.12 }));
      } else if (e.code === 'ArrowDown') {
        setPan((p) => ({ ...p, y: p.y + viewH * 0.12 }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFloor, snapshot.player.floor, snapshot.player.x, snapshot.player.z, viewW, viewH]);

  const floorRects = useMemo(
    () => snapshot.rects.filter((r) => r.floor === selectedFloor),
    [snapshot.rects, selectedFloor]
  );

  const floorFurniture = useMemo(() => {
    if (selectedFloor === 'outside' || selectedFloor === 'roof') return [];
    const targetY = selectedFloor === 'second' ? 4.0 : 0;
    return FURNITURE_SPECS.filter((f) => Math.abs(f.y - targetY) < 1.5);
  }, [selectedFloor]);

  const floorStairs = useMemo(() => {
    return STAIR_ZONES.filter(
      (s) =>
        (s.id === 'stair_ground_to_second' && (selectedFloor === 'ground' || selectedFloor === 'second')) ||
        (s.id === 'stair_second_to_roof' && (selectedFloor === 'second' || selectedFloor === 'roof'))
    );
  }, [selectedFloor]);

  const floorMarkers = useMemo(
    () =>
      snapshot.markers
        .filter((m) => m.floor === selectedFloor && matchesFilter(m.kind, filter))
        .sort((a, b) => {
          const da = Math.hypot(a.x - snapshot.player.x, a.z - snapshot.player.z);
          const db = Math.hypot(b.x - snapshot.player.x, b.z - snapshot.player.z);
          return da - db;
        }),
    [snapshot.markers, selectedFloor, filter, snapshot.player.x, snapshot.player.z]
  );

  const missionCountByFloor = useMemo(() => {
    const counts: Record<FloorId, number> = { outside: 0, ground: 0, second: 0, roof: 0 };
    for (const m of snapshot.markers) {
      if (m.kind === 'evidence' || m.kind === 'key' || m.kind === 'radio' || m.kind === 'kujang') {
        counts[m.floor] += 1;
      }
    }
    return counts;
  }, [snapshot.markers]);

  const handleFloorChange = (nextFloor: FloorId) => {
    setSelectedFloor(nextFloor);
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setSelectedMarker(null);
  };

  const focusOnPlayer = () => {
    setSelectedFloor(snapshot.player.floor);
    const b = getFloorBounds(snapshot.player.floor);
    const midX = (b.minX + b.maxX) * 0.5;
    const midZ = (b.minZ + b.maxZ) * 0.5;
    setZoom(snapshot.player.floor === 'outside' ? 1.55 : 1.35);
    setPan({ x: snapshot.player.x - midX, y: snapshot.player.z - midZ });
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.active || !svgRef.current) return;
    const dxPx = e.clientX - dragRef.current.lastX;
    const dyPx = e.clientY - dragRef.current.lastY;
    if (Math.hypot(dxPx, dyPx) > 3) {
      dragRef.current.moved = true;
    }
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const worldDx = (dxPx / rect.width) * viewW;
    const worldDz = (dyPx / rect.height) * viewH;
    setPan((prev) => ({
      x: Math.max(-spanX * 0.45, Math.min(spanX * 0.45, prev.x - worldDx)),
      y: Math.max(-spanZ * 0.45, Math.min(spanZ * 0.45, prev.y - worldDz)),
    }));
  };

  const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const wasDrag = dragRef.current.moved;
    dragRef.current.active = false;
    if (!wasDrag && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const rx = (e.clientX - rect.left) / rect.width;
        const ry = (e.clientY - rect.top) / rect.height;
        const wx = Math.round((vbX + rx * viewW) * 10) / 10;
        const wz = Math.round((vbY + ry * viewH) * 10) / 10;
        onSetWaypoint({
          id: `custom_${selectedFloor}`,
          label: `Titik Pin (${FLOOR_TABS.find((t) => t.id === selectedFloor)?.short ?? selectedFloor})`,
          floor: selectedFloor,
          x: wx,
          z: wz,
        });
      }
    }
  };

  const pinMarker = (m: MapMarker) => {
    setSelectedMarker(m);
    onSetWaypoint({
      id: m.id,
      label: m.label,
      floor: m.floor,
      x: m.x,
      z: m.z,
    });
  };

  const playerHeadingDeg = (-snapshot.player.yaw * 180) / Math.PI;
  const markerRadius = Math.max(0.42, viewW * 0.0125);

  return (
    <div
      data-testid="map-modal"
      className="fixed inset-0 z-30 flex items-center justify-center p-2 sm:p-4 bg-[#050706]/88 backdrop-blur-sm"
    >
      <div className="w-full max-w-5xl max-h-[94vh] archival-card rounded-sm p-3.5 sm:p-5 flex flex-col gap-3 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-[rgba(207,161,90,0.22)]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-[#cfa15a] font-semibold flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" />
              Denah Arsitektur &amp; Navigasi · Sukajadi No. 666
            </div>
            <h2 className="font-display text-base sm:text-xl font-bold tracking-[0.12em] text-[#ebe7dc] uppercase mt-0.5">
              Peta Interaktif &amp; Pin Kompas
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-[#171c19] hover:bg-[#222a25] border border-[rgba(207,161,90,0.3)] text-xs font-semibold rounded-sm text-[#ebe7dc] flex items-center gap-1 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            <span>Tutup [Tab]</span>
          </button>
        </div>

        {/* Floor tabs & category filters */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {FLOOR_TABS.map((tab) => {
              const active = selectedFloor === tab.id;
              const isHere = snapshot.player.floor === tab.id;
              const badge = missionCountByFloor[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleFloorChange(tab.id)}
                  className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-sm border flex items-center gap-1.5 cursor-pointer transition ${
                    active
                      ? 'bg-[#2a2216] border-[#cfa15a] text-[#f4dfb6]'
                      : 'bg-[#101512] border-white/10 text-[#9da8a1] hover:text-[#ebe7dc]'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>{tab.label}</span>
                  {isHere && <span className="w-1.5 h-1.5 rounded-full bg-[#68d99a]" title="Posisi Kamu" />}
                  {badge > 0 && (
                    <span className="px-1 py-0.2 bg-[#cfa15a]/20 text-[#f3cf82] text-[10px] rounded font-mono-num">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                ['all', 'Semua'],
                ['mission', 'Bukti & Kunci'],
                ['doors', 'Pintu & Tangga'],
                ['safety', 'Aman & Lemari'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`px-2 py-1 text-[10px] font-semibold rounded-sm border cursor-pointer transition ${
                  filter === id
                    ? 'bg-[#183123] border-[#689f7d] text-[#c7f2d6]'
                    : 'bg-[#0d120f] border-white/10 text-[#8c9790] hover:text-[#ebe7dc]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_275px] gap-3 min-h-0 flex-1 overflow-hidden">
          {/* Interactive Blueprint SVG */}
          <div className="relative bg-[#060a08] border border-[rgba(207,161,90,0.28)] rounded-sm overflow-hidden min-h-[290px] sm:min-h-[390px] flex flex-col shadow-inner">
            <svg
              ref={svgRef}
              viewBox={`${vbX} ${vbY} ${viewW} ${viewH}`}
              preserveAspectRatio="xMidYMid meet"
              onPointerDown={handleSvgPointerDown}
              onPointerMove={handleSvgPointerMove}
              onPointerUp={handleSvgPointerUp}
              onWheel={(e) => {
                e.preventDefault();
                setZoom((z) => Math.max(0.75, Math.min(3.6, z * (e.deltaY < 0 ? 1.18 : 0.85))));
              }}
              onDoubleClick={(e) => {
                if (!svgRef.current) return;
                const rect = svgRef.current.getBoundingClientRect();
                if (rect.width < 1 || rect.height < 1) return;
                const rx = (e.clientX - rect.left) / rect.width;
                const ry = (e.clientY - rect.top) / rect.height;
                const wx = vbX + rx * viewW;
                const wz = vbY + ry * viewH;
                const b = getFloorBounds(selectedFloor);
                const midX = (b.minX + b.maxX) * 0.5;
                const midZ = (b.minZ + b.maxZ) * 0.5;
                setZoom((z) => Math.min(3.4, z * 1.45));
                setPan({ x: wx - midX, y: wz - midZ });
              }}
              className="w-full h-full flex-1 cursor-crosshair touch-none select-none"
            >
              <defs>
                <pattern id="mapGrid" width="4" height="4" patternUnits="userSpaceOnUse">
                  <path d="M 4 0 L 0 0 0 4" fill="none" stroke="rgba(120,165,142,0.08)" strokeWidth="0.08" />
                </pattern>
                <radialGradient id="playerGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(107,232,156,0.38)" />
                  <stop offset="100%" stopColor="rgba(107,232,156,0)" />
                </radialGradient>
              </defs>

              <rect x={vbX - 24} y={vbY - 24} width={viewW + 48} height={viewH + 48} fill="url(#mapGrid)" />

              {/* Latar taman / halaman hijau halus di area luar */}
              {selectedFloor === 'outside' && (
                <rect x={-46} y={10.2} width={92} height={48.8} fill="rgba(22,38,28,0.25)" />
              )}

              {/* Geometri Jalan, Bangunan, Kolam, Zona Aman & Dinding */}
              {floorRects.map((r) => {
                const w = Math.max(0.18, r.maxX - r.minX);
                const h = Math.max(0.18, r.maxZ - r.minZ);
                if (r.kind === 'road') {
                  return (
                    <g key={r.id}>
                      <rect x={r.minX} y={r.minZ} width={w} height={h} fill="#141a19" stroke="rgba(205,215,210,0.12)" strokeWidth="0.14" />
                      {w > 30 && (
                        <line
                          x1={r.minX + 2}
                          y1={(r.minZ + r.maxZ) * 0.5}
                          x2={r.maxX - 2}
                          y2={(r.minZ + r.maxZ) * 0.5}
                          stroke="rgba(225,195,120,0.32)"
                          strokeWidth="0.18"
                          strokeDasharray="1.8 1.6"
                        />
                      )}
                    </g>
                  );
                }
                if (r.kind === 'floor_pad') {
                  return (
                    <rect
                      key={r.id}
                      x={r.minX}
                      y={r.minZ}
                      width={w}
                      height={h}
                      rx="0.25"
                      fill="#0d1411"
                      stroke="rgba(207,161,90,0.22)"
                      strokeWidth="0.18"
                    />
                  );
                }
                if (r.kind === 'house') {
                  return (
                    <rect
                      key={r.id}
                      x={r.minX}
                      y={r.minZ}
                      width={w}
                      height={h}
                      rx="0.25"
                      fill="#171f1d"
                      stroke="rgba(165,180,170,0.28)"
                      strokeWidth="0.16"
                    />
                  );
                }
                if (r.kind === 'water') {
                  return (
                    <rect
                      key={r.id}
                      x={r.minX}
                      y={r.minZ}
                      width={w}
                      height={h}
                      rx="0.4"
                      fill="#0e2c3b"
                      stroke="#4893b5"
                      strokeWidth="0.16"
                    />
                  );
                }
                if (r.kind === 'safe_zone') {
                  return (
                    <rect
                      key={r.id}
                      x={r.minX}
                      y={r.minZ}
                      width={w}
                      height={h}
                      rx="0.25"
                      fill="rgba(56,161,105,0.18)"
                      stroke="#58b982"
                      strokeDasharray="0.4 0.3"
                      strokeWidth="0.15"
                    />
                  );
                }
                return <rect key={r.id} x={r.minX} y={r.minZ} width={w} height={h} fill="#76847c" rx="0.06" />;
              })}

              {/* Pepohonan Sukajadi di Peta Luar */}
              {selectedFloor === 'outside' &&
                TREE_PLACEMENTS.map((tr, ti) => (
                  <g key={`tr_${ti}`} transform={`translate(${tr.x}, ${tr.z})`} opacity={0.55}>
                    <circle r={tr.scale * 1.45} fill="#183021" stroke="#2d573b" strokeWidth="0.14" />
                    <circle r={tr.scale * 0.45} fill="#2e543a" />
                  </g>
                ))}

              {/* Arsir Anak Tangga Realistis */}
              {floorStairs.map((st) => {
                const steps = 7;
                const sw = st.maxX - st.minX;
                const sd = st.maxZ - st.minZ;
                return (
                  <g key={`stair_${st.id}`}>
                    <rect
                      x={st.minX}
                      y={st.minZ}
                      width={sw}
                      height={sd}
                      fill="rgba(140,165,205,0.14)"
                      stroke="#89a0c7"
                      strokeWidth="0.12"
                    />
                    {Array.from({ length: steps }, (_, i) => {
                      const zPos = st.minZ + ((i + 1) / (steps + 1)) * sd;
                      return (
                        <line
                          key={i}
                          x1={st.minX + 0.15}
                          y1={zPos}
                          x2={st.maxX - 0.15}
                          y2={zPos}
                          stroke="rgba(168,185,215,0.45)"
                          strokeWidth="0.1"
                        />
                      );
                    })}
                  </g>
                );
              })}

              {/* Siluet Furnitur Interior (Sofa, Ranjang, Meja, Lemari) */}
              {floorFurniture.map((f) => {
                const rotSwap = Math.abs(Math.sin(f.ry ?? 0)) > 0.7;
                const fw = rotSwap ? f.d : f.w;
                const fd = rotSwap ? f.w : f.d;
                return (
                  <rect
                    key={f.id}
                    x={f.x - fw * 0.5}
                    y={f.z - fd * 0.5}
                    width={fw}
                    height={fd}
                    rx="0.1"
                    fill={f.kind === 'closet' ? 'rgba(184,131,84,0.28)' : 'rgba(130,145,136,0.16)'}
                    stroke="rgba(200,208,200,0.22)"
                    strokeWidth="0.08"
                  />
                );
              })}

              {/* Label Zona & Ruangan */}
              {ROOM_LABELS[selectedFloor].map((rl, idx) => (
                <text
                  key={`rl_${idx}`}
                  x={rl.x}
                  y={rl.z}
                  textAnchor="middle"
                  fill={
                    rl.tone === 'safe'
                      ? 'rgba(130,225,168,0.68)'
                      : rl.tone === 'warn'
                        ? 'rgba(240,120,108,0.72)'
                        : 'rgba(180,194,186,0.42)'
                  }
                  fontSize={selectedFloor === 'outside' ? 1.55 : 0.78}
                  fontWeight="700"
                  letterSpacing="0.06em"
                  pointerEvents="none"
                >
                  {rl.text}
                </text>
              ))}

              {/* Garis Panduan Waypoint */}
              {waypoint && waypoint.floor === selectedFloor && (
                <line
                  x1={snapshot.player.x}
                  y1={snapshot.player.z}
                  x2={waypoint.x}
                  y2={waypoint.z}
                  stroke="#f5c96b"
                  strokeWidth={markerRadius * 0.34}
                  strokeDasharray={`${markerRadius * 1.15} ${markerRadius * 0.75}`}
                  opacity={0.82}
                />
              )}

              {/* Penanda Pintu + Busur Engsel, Item, & NPC */}
              {floorMarkers.map((m) => {
                const col = markerColor(m.kind);
                const isSel = selectedMarker?.id === m.id || waypoint?.id === m.id;
                const r = m.kind === 'landmark' ? markerRadius * 0.92 : markerRadius;
                return (
                  <g
                    key={m.id}
                    transform={`translate(${m.x}, ${m.z})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      pinMarker(m);
                    }}
                    className="cursor-pointer"
                  >
                    {m.kind === 'ghost' && (
                      <circle r={r * 2.2} fill="rgba(255,59,48,0.18)" stroke="#ff3b30" strokeWidth={r * 0.2}>
                        <animate attributeName="r" values={`${r * 1.4};${r * 2.7};${r * 1.4}`} dur="1.3s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.8;0.15;0.8" dur="1.3s" repeatCount="indefinite" />
                      </circle>
                    )}
                    {isSel && (
                      <circle r={r * 1.95} fill="none" stroke="#f5c96b" strokeWidth={r * 0.26} strokeDasharray={`${r * 0.7} ${r * 0.45}`} />
                    )}
                    {m.kind === 'hiding' ? (
                      <rect x={-r * 0.85} y={-r * 0.85} width={r * 1.7} height={r * 1.7} rx={r * 0.22} fill={col} stroke="#1a120a" strokeWidth={r * 0.2} />
                    ) : m.kind.startsWith('door_') ? (
                      <g>
                        <path
                          d={`M ${-r * 0.8} 0 A ${r * 1.6} ${r * 1.6} 0 0 1 ${r * 0.8} ${-r * 1.3}`}
                          fill="none"
                          stroke={col}
                          strokeWidth={r * 0.14}
                          strokeDasharray={`${r * 0.35} ${r * 0.25}`}
                          opacity={0.75}
                        />
                        <rect x={-r * 0.8} y={-r * 0.42} width={r * 1.6} height={r * 0.84} rx={r * 0.14} fill={col} stroke="#0a0e0c" strokeWidth={r * 0.16} />
                      </g>
                    ) : m.kind === 'stair' ? (
                      <polygon points={`0,${-r} ${r},${r * 0.85} ${-r},${r * 0.85}`} fill={col} stroke="#0a0e0c" strokeWidth={r * 0.16} />
                    ) : (
                      <circle r={r * 0.92} fill={col} stroke="#090c0b" strokeWidth={r * 0.22} />
                    )}
                    {(m.kind === 'landmark' || m.kind === 'kujang' || m.kind === 'radio' || m.kind === 'npc') && (
                      <text
                        y={-r * 1.4}
                        textAnchor="middle"
                        fill="#e4ebe6"
                        fontSize={markerRadius * 1.7}
                        fontWeight="600"
                        paintOrder="stroke"
                        stroke="#050807"
                        strokeWidth={markerRadius * 0.44}
                      >
                        {m.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Rekan Regu & AI Companions */}
              {snapshot.companions
                .filter((c) => c.floor === selectedFloor)
                .map((c) => (
                  <g key={c.id} transform={`translate(${c.x}, ${c.z})`}>
                    <circle
                      r={markerRadius * 1.02}
                      fill={c.downed ? '#ff594f' : '#58c9ff'}
                      stroke="#060b0e"
                      strokeWidth={markerRadius * 0.24}
                    />
                    <text
                      y={markerRadius * 2.4}
                      textAnchor="middle"
                      fill="#bce7ff"
                      fontSize={markerRadius * 1.55}
                      paintOrder="stroke"
                      stroke="#050807"
                      strokeWidth={markerRadius * 0.4}
                    >
                      {c.name}
                    </text>
                  </g>
                ))}

              {/* Pin Waypoint Berdenyut */}
              {waypoint && waypoint.floor === selectedFloor && (
                <g transform={`translate(${waypoint.x}, ${waypoint.z})`} pointerEvents="none">
                  <circle r={markerRadius * 1.75} fill="rgba(245,201,107,0.22)" stroke="#f5c96b" strokeWidth={markerRadius * 0.25}>
                    <animate attributeName="r" values={`${markerRadius * 1.2};${markerRadius * 2.4};${markerRadius * 1.2}`} dur="1.8s" repeatCount="indefinite" />
                  </circle>
                  <circle r={markerRadius * 0.6} fill="#ffdf80" />
                </g>
              )}

              {/* Posisi Pemain + Pancaran Senter */}
              {snapshot.player.floor === selectedFloor && (
                <g transform={`translate(${snapshot.player.x}, ${snapshot.player.z}) rotate(${playerHeadingDeg})`} pointerEvents="none">
                  <circle r={markerRadius * 3.0} fill="url(#playerGlow)" />
                  <path
                    d={`M 0 0 L ${-markerRadius * 2.5} ${-markerRadius * 5.6} A ${markerRadius * 6.0} ${markerRadius * 6.0} 0 0 1 ${markerRadius * 2.5} ${-markerRadius * 5.6} Z`}
                    fill="rgba(120,235,165,0.24)"
                  />
                  <polygon
                    points={`0,${-markerRadius * 1.5} ${markerRadius * 1.08},${markerRadius * 1.08} 0,${markerRadius * 0.58} ${-markerRadius * 1.08},${markerRadius * 1.08}`}
                    fill="#6be89c"
                    stroke="#06120b"
                    strokeWidth={markerRadius * 0.24}
                  />
                </g>
              )}
            </svg>

            {/* Mawar Kompas Utara */}
            <div className="absolute top-2.5 right-2.5 w-11 h-11 rounded-full bg-[#080d0b]/90 border border-[#cfa15a]/40 flex flex-col items-center justify-center text-[9px] font-mono-num text-[#cfa15a] pointer-events-none">
              <span className="font-bold text-[#f3cf82] leading-none">U</span>
              <span className="text-[7px] text-[#7c8c82] leading-tight">B · T</span>
              <span className="text-[7px] text-[#7c8c82] leading-none">S</span>
            </div>

            {/* Kontrol Zoom & Fokus */}
            <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={focusOnPlayer}
                title="Fokus ke Posisi Pemain"
                className="h-8 px-2.5 bg-[#101814]/95 hover:bg-[#192820] border border-[#689f7d]/60 text-[#bfead0] text-[11px] font-semibold rounded-sm flex items-center gap-1 cursor-pointer"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>Posisi Saya</span>
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3.5, z * 1.24))}
                aria-label="Perbesar Peta"
                className="w-8 h-8 bg-[#101814]/95 hover:bg-[#1c2420] border border-white/15 text-[#ebe7dc] rounded-sm flex items-center justify-center cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.75, z * 0.8))}
                aria-label="Perkecil Peta"
                className="w-8 h-8 bg-[#101814]/95 hover:bg-[#1c2420] border border-white/15 text-[#ebe7dc] rounded-sm flex items-center justify-center cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="absolute top-2.5 left-2.5 px-2 py-1 bg-[#080c0a]/90 border border-white/10 rounded-sm text-[10px] text-[#9aa89f] pointer-events-none">
              Klik area / ikon peta untuk Pin Kompas · Seret untuk geser · Scroll zoom
            </div>
          </div>

          {/* Interactive Marker Sidebar + Legend */}
          <div className="flex flex-col gap-2.5 min-h-0 overflow-hidden bg-[#0a0f0d] border border-white/10 rounded-sm p-2.5">
            {waypoint ? (
              <div className="p-2 bg-[#1c160c] border border-[#cfa15a]/55 rounded-sm flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-[#cfa15a] font-bold flex items-center gap-1">
                    <Navigation className="w-3 h-3" /> Pin Aktif
                  </div>
                  <div className="text-xs font-semibold text-[#f5e3bf] truncate">{waypoint.label}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onSetWaypoint(null)}
                  className="px-2 py-1 bg-[#2b2012] hover:bg-[#3c2d19] border border-[#cfa15a]/40 text-[10px] text-[#f5e3bf] rounded-sm cursor-pointer shrink-0"
                >
                  Hapus
                </button>
              </div>
            ) : (
              <div className="p-2 bg-[#101613] border border-white/10 rounded-sm text-[11px] text-[#9aa7a0]">
                Pilih titik di bawah atau klik langsung peta untuk mengaktifkan penunjuk arah di kompas HUD.
              </div>
            )}

            <div className="text-[10px] uppercase tracking-[0.14em] text-[#93a199] font-semibold">
              Titik Penting · {FLOOR_TABS.find((t) => t.id === selectedFloor)?.short} ({floorMarkers.length})
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1 max-h-[210px] lg:max-h-none">
              {floorMarkers.map((m) => {
                const dist = Math.round(Math.hypot(m.x - snapshot.player.x, m.z - snapshot.player.z));
                const pinned = waypoint?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pinMarker(m)}
                    className={`w-full text-left px-2 py-1.5 rounded-sm border flex items-center justify-between gap-2 cursor-pointer transition ${
                      pinned
                        ? 'bg-[#211a0e] border-[#cfa15a]/70 text-[#f5dfb3]'
                        : 'bg-[#0f1512] border-white/5 hover:border-white/20 text-[#d3dbd6]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: markerColor(m.kind) }}
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold truncate">{m.label}</div>
                        {m.detail && <div className="text-[9px] text-[#94a199] truncate">{m.detail}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-[10px] font-mono-num text-[#9aa89f]">
                      <span>{dist}m</span>
                      <MapPin className="w-3 h-3 text-[#cfa15a]" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Compact Color Legend */}
            <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-[#9aa79f]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#6be89c]" /> Kamu / Rekan
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#f0c45a]" /> Bukti / Kunci
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-[#b88354]" /> Lemari Sembunyi
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#ef5b50]" /> Pintu Terkunci
              </div>
              <div className="flex items-center gap-1.5 col-span-2">
                <ShieldCheck className="w-3 h-3 text-[#56c285]" /> Zona Aman &amp; NPC Penolong
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
