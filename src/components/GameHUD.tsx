import React, { useEffect, useRef, useState } from 'react';
import { Compass, Map as MapIcon, MessageSquare, Mic, MicOff, Navigation, Send, X } from 'lucide-react';
import type { GameHUDState, MapWaypoint } from '../game/types';
import type { VoiceStatus } from '../net/voiceChat';
import type { LobbyChatMessage } from '../shared/lobbyProtocol';

interface SquadMemberHud {
  id: string;
  name: string;
  characterName: string;
  isBot?: boolean;
  connected?: boolean;
  downed?: boolean;
  micOn?: boolean;
}

interface GameHUDProps {
  hud: GameHUDState;
  isMuted: boolean;
  toast: { message: string; tone: 'info' | 'warn' | 'fact' } | null;
  roomCode?: string | null;
  isMultiplayer?: boolean;
  squadRoster?: SquadMemberHud[];
  isSpectator?: boolean;
  chatMessages?: LobbyChatMessage[];
  chatOpen?: boolean;
  onSetChatOpen?: (open: boolean) => void;
  onSendChat?: (text: string) => void;
  voiceChatEnabled?: boolean;
  micOn?: boolean;
  voiceStatus?: VoiceStatus;
  onToggleMic?: () => void;
  onCheckpointSpawn?: () => void;
  onToggleMute: () => void;
  onOpenJournal: () => void;
  onOpenMap?: () => void;
  waypoint?: MapWaypoint | null;
  onClearWaypoint?: () => void;
  onOpenPause: () => void;
  onInteract: () => void;
  onToggleFlashlight: () => void;
  onToggleUV: () => void;
  onUseSalt: () => void;
  onSkipCutscene?: () => void;
}

const FLOOR_LABELS: Record<GameHUDState['floor'], string> = {
  outside: 'SUKAJADI · DUNIA NYATA',
  ground: 'ACT 1 · LANTAI DASAR',
  second: 'ACT 2 · LANTAI 2',
  roof: 'ACT 3 · ROOFTOP GURITA',
};

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  isMuted,
  toast,
  roomCode,
  isMultiplayer = false,
  squadRoster = [],
  isSpectator = false,
  chatMessages = [],
  chatOpen = false,
  onSetChatOpen,
  onSendChat,
  voiceChatEnabled = false,
  micOn = false,
  voiceStatus = 'disabled',
  onToggleMic,
  onCheckpointSpawn,
  onToggleMute,
  onOpenJournal,
  onOpenMap,
  waypoint = null,
  onClearWaypoint,
  onOpenPause,
  onInteract,
  onToggleFlashlight,
  onToggleUV,
  onUseSalt,
  onSkipCutscene,
}) => {
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const lowSanity = hud.sanity < 45;
  const dangerAlpha = lowSanity ? Math.min(0.65, (45 - hud.sanity) / 45) : 0;

  useEffect(() => {
    if (chatOpen) {
      window.setTimeout(() => chatInputRef.current?.focus(), 20);
    }
  }, [chatOpen]);

  const recentChat = chatMessages.slice(-4);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none">
      {/* Vignette Ketakutan saat Sanity rendah */}
      {dangerAlpha > 0 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            boxShadow: `inset 0 0 110px rgba(145, 18, 18, ${dangerAlpha.toFixed(2)})`,
          }}
        />
      )}

      {/* Bayangan sudut ruang sempit saat berada di dalam lemari kayu */}
      {hud.isHiding && (
        <div
          data-testid="closet-hiding-vignette"
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(0,0,0,0) 42%, rgba(8,5,3,0.52) 78%, rgba(4,3,2,0.88) 100%)',
          }}
        />
      )}

      {/* Overlay Kamera Ponsel UV */}
      {hud.uvMode && (
        <div className="fixed inset-0 pointer-events-none uv-scanlines border-[3px] border-[#8f6be8]/55">
          <div className="absolute top-16 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#160f26]/95 border border-[#8f6be8]/60 text-[#d8c8ff] text-[11px] font-mono-num tracking-widest uppercase">
            KAMERA UV · {hud.uvBattery}%
          </div>
        </div>
      )}

      {/* TOP-LEFT: Lokasi, Progres, Zona Aman & Tim */}
      <div className="absolute top-2 left-2 sm:top-4 sm:left-4 flex flex-col gap-1 max-w-[11.2rem] sm:max-w-none">
        <div className="archival-panel rounded-sm px-2 py-1 sm:px-3.5 sm:py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="font-display text-[9.5px] sm:text-[11px] font-bold tracking-[0.12em] uppercase text-[#ebe7dc] truncate">
              {FLOOR_LABELS[hud.floor]}
            </div>
            {roomCode && (
              <span className="text-[9.5px] sm:text-[10px] font-mono-num font-bold text-[#cfa15a] shrink-0">
                {roomCode}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-[#98a29b] font-mono-num">
            <span>
              Segel{' '}
              <strong className="text-[#cfa15a]">
                {hud.segelBroken}/{hud.totalSegel}
              </strong>
            </span>
            <span className="text-[#4a544e]">/</span>
            <span>
              Fakta{' '}
              <strong className="text-[#7ec99e]">
                {hud.evidenceCount}/{hud.totalEvidence}
              </strong>
            </span>
            {hud.keysInventory.length > 0 && (
              <>
                <span className="text-[#4a544e]">/</span>
                <span className="text-[#e8c674]">Kunci: {hud.keysInventory.length}</span>
              </>
            )}
          </div>
          <p
            data-testid="hud-objective"
            className="mt-1 pt-1 border-t border-[rgba(207,161,90,0.16)] text-[9px] sm:text-[11px] text-[#d6dbd7] leading-snug line-clamp-2 max-w-[10.8rem] sm:max-w-[23rem]"
          >
            <strong className="text-[#cfa15a] font-semibold">Misi:</strong> {hud.currentObjective}
          </p>
        </div>

        {hud.inSafeZone && (
          <div
            data-testid="safe-zone-badge"
            className="px-2.5 py-1 bg-[#0e2117]/95 border border-[#689f7d]/60 text-[#a9e3bf] text-[10px] font-bold tracking-[0.08em] uppercase rounded-sm w-fit"
          >
            {hud.safeZoneName ?? 'Zona Aman'} · Bebas Serangan
          </div>
        )}

        {hud.isHiding && (
          <div className="px-2.5 py-1 bg-[#1e1810]/95 border border-[#cfa15a]/70 text-[#f5dfb3] text-[10px] font-bold tracking-[0.08em] uppercase rounded-sm w-fit">
            Di Dalam Lemari · Mengintip · [E] Keluar
          </div>
        )}

        {hud.ditoSenseHint && (
          <div className="px-2.5 py-1 bg-[#1b142a]/95 border border-[#8f6be8]/60 text-[#d8c8ff] text-[11px] font-semibold rounded-sm w-fit">
            {hud.ditoSenseHint}
          </div>
        )}
      </div>

      {/* Mode Penonton Late Join */}
      {isSpectator && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-auto archival-card border border-[#cfa15a]/70 rounded-sm px-4 py-3 flex flex-col sm:flex-row items-center gap-3">
          <div className="text-xs text-[#ebe7dc]">
            <strong className="text-[#cfa15a] uppercase tracking-wider mr-1.5">
              Mode Penonton (Late Join)
            </strong>
            <span>Ekspedisi sedang berjalan. Kamu bisa langsung turun di Checkpoint Sukajadi.</span>
          </div>
          {onCheckpointSpawn && (
            <button
              type="button"
              data-testid="btn-checkpoint-spawn"
              onClick={onCheckpointSpawn}
              className="px-4 py-2 bg-[#1c5c3b] hover:bg-[#24734a] border border-[#689f7d] text-[#f5faf6] text-xs font-bold uppercase tracking-wider rounded-sm cursor-pointer whitespace-nowrap"
            >
              Masuk di Checkpoint
            </button>
          )}
        </div>
      )}

      {/* TOP-CENTER: Kompas Tujuan Waypoint (jika ada pin di Peta) */}
      {waypoint && !hud.cutscene && hud.playerX !== undefined && hud.playerZ !== undefined && (
        (() => {
          const dx = waypoint.x - hud.playerX!;
          const dz = waypoint.z - hud.playerZ!;
          const dist = Math.round(Math.hypot(dx, dz));
          const yaw = hud.playerYaw ?? 0;
          const fx = -Math.sin(yaw);
          const fz = -Math.cos(yaw);
          const rx = Math.cos(yaw);
          const rz = -Math.sin(yaw);
          const relDeg = (Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz) * 180) / Math.PI;
          const floorMismatch = waypoint.floor !== hud.floor;
          const floorHint =
            waypoint.floor === 'outside'
              ? 'Luar'
              : waypoint.floor === 'ground'
                ? 'Lt.1'
                : waypoint.floor === 'second'
                  ? 'Lt.2'
                  : 'Atap';
          return (
            <div
              data-testid="waypoint-compass-pill"
              className="fixed top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto px-3 py-1.5 archival-panel border border-[#cfa15a]/65 rounded-sm flex items-center gap-2 text-xs shadow-lg"
            >
              <Navigation
                className="w-3.5 h-3.5 text-[#f5c96b] shrink-0 transition-transform duration-75"
                style={{ transform: `rotate(${Math.round(relDeg)}deg)` }}
              />
              <span className="font-semibold text-[#f5dfb3] truncate max-w-[140px] sm:max-w-[220px]">
                {waypoint.label}
              </span>
              <span className="font-mono-num text-[#cfa15a] font-bold">{dist}m</span>
              {floorMismatch && (
                <span className="px-1.5 py-0.5 bg-[#2a2216] border border-[#cfa15a]/40 text-[9px] uppercase rounded text-[#f3cf82]">
                  {floorHint}
                </span>
              )}
              {onClearWaypoint && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Hapus Pin Tujuan"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onClearWaypoint();
                  }}
                  className="text-[#9aa7a0] hover:text-[#ebe7dc] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })()
      )}

      {/* TOP-RIGHT: Utilitas Ringkas + Mini-Radar Peta + Regu Penyelidik */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex flex-col items-end gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          {onOpenMap && (
            <button
              type="button"
              tabIndex={-1}
              data-testid="btn-open-map"
              aria-label="Buka Peta Interaktif"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenMap();
              }}
              className="h-9 px-2.5 sm:px-3 archival-panel hover:bg-[#19211d] border border-[#cfa15a]/45 text-[#f3dfb6] text-xs font-semibold rounded-sm flex items-center gap-1.5 cursor-pointer"
              title="Peta Interaktif [Tab / N]"
            >
              <MapIcon className="w-4 h-4 text-[#cfa15a]" />
              <span className="hidden sm:inline">Peta [Tab]</span>
              <span className="sm:hidden">Peta</span>
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            aria-label="Jurnal Mitos vs Fakta"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenJournal();
            }}
            className="h-9 px-2.5 sm:px-3 archival-panel hover:bg-[#19211d] text-[#ebe7dc] text-xs font-semibold rounded-sm flex items-center gap-1.5 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.8">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span className="hidden sm:inline">Jurnal [J]</span>
            <span className="sm:hidden">Jurnal</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={isMuted ? 'Nyalakan Audio' : 'Bisukan Audio'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-9 h-9 archival-panel hover:bg-[#19211d] text-[#ebe7dc] rounded-sm flex items-center justify-center cursor-pointer"
            title="Audio [M]"
          >
            {isMuted ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.8">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.8">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenPause();
            }}
            className="w-9 h-9 archival-panel hover:bg-[#19211d] text-[#ebe7dc] rounded-sm flex items-center justify-center cursor-pointer"
            title="Pause [Esc]"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.8">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          </button>
        </div>

        {/* Live Mini-Radar Klik untuk Buka Peta */}
        {onOpenMap && !hud.cutscene && hud.playerX !== undefined && hud.playerZ !== undefined && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenMap();
            }}
            title="Klik untuk Peta Lengkap [Tab / N]"
            className="pointer-events-auto relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#090e0c]/90 border border-[#cfa15a]/50 shadow-lg overflow-hidden cursor-pointer group hover:border-[#f0c778] transition"
          >
            <svg viewBox="-26 -26 52 52" className="w-full h-full">
              <circle r="24.5" fill="none" stroke="rgba(207,161,90,0.22)" strokeWidth="0.6" />
              <circle r="14" fill="none" stroke="rgba(120,165,140,0.18)" strokeWidth="0.4" strokeDasharray="1.5 1.5" />
              {/* Rotasikan lingkungan lokal mengikuti arah pandang pemain agar atas = depan */}
              <g transform={`rotate(${((hud.playerYaw ?? 0) * 180) / Math.PI}) translate(${-hud.playerX}, ${-hud.playerZ})`}>
                {hud.floor === 'outside' ? (
                  <>
                    {/* Jalan Sukajadi & Komplek */}
                    <rect x="-52" y="21.5" width="104" height="8" fill="#1b2220" />
                    <rect x="-4" y="10.5" width="8" height="46" fill="#1b2220" />
                    <rect x="-14.8" y="-9.8" width="30" height="20" fill="rgba(170,110,95,0.28)" stroke="#cf8a78" strokeWidth="0.9" />
                    <rect x="-14.5" y="46.9" width="6" height="5.2" fill="rgba(207,161,90,0.3)" stroke="#cfa15a" strokeWidth="0.7" />
                    <rect x="24.8" y="31.8" width="10.4" height="10.4" fill="rgba(86,194,133,0.26)" stroke="#56c285" strokeWidth="0.8" />
                    <rect x="-13.2" y="34" width="3.6" height="3.6" fill="rgba(160,180,170,0.25)" stroke="#9aa79e" strokeWidth="0.6" />
                  </>
                ) : (
                  <>
                    {/* Denah Interior Lantai Aktif Rumah Gurita */}
                    <rect x="-14.8" y="-9.8" width="30" height="20" fill="rgba(26,34,30,0.68)" stroke="rgba(207,161,90,0.6)" strokeWidth="0.9" />
                    <line x1="-2.5" y1="-9.8" x2="-2.5" y2="10.2" stroke="rgba(170,185,175,0.45)" strokeWidth="0.7" />
                    <line x1="5.0" y1="-9.8" x2="5.0" y2="10.2" stroke="rgba(170,185,175,0.45)" strokeWidth="0.7" />
                    <line x1="-14.8" y1="-1.5" x2="15.2" y2="-1.5" stroke="rgba(170,185,175,0.45)" strokeWidth="0.7" />
                    {/* Zona Aman Ruang Doa & Altar */}
                    <rect x="-14.6" y="-2.2" width="3.4" height="4.4" fill="rgba(86,194,133,0.28)" stroke="#56c285" strokeWidth="0.7" />
                    {hud.floor === 'roof' && (
                      <rect x="7.2" y="-1.6" width="4.7" height="4.4" fill="rgba(240,196,90,0.25)" stroke="#f0c45a" strokeWidth="0.7" />
                    )}
                  </>
                )}
                {/* Pin Waypoint Berdenyut */}
                {waypoint && (
                  <g transform={`translate(${waypoint.x}, ${waypoint.z})`}>
                    <circle r="3.4" fill="rgba(255,223,120,0.28)">
                      <animate attributeName="r" values="2.2;4.4;2.2" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                    <circle r="2.2" fill="#ffdf78" stroke="#080a09" strokeWidth="0.7" />
                  </g>
                )}
              </g>
              {/* Indikator Arah Mata Angin pada Rim Mini-Radar */}
              <g transform={`rotate(${((hud.playerYaw ?? 0) * 180) / Math.PI})`} pointerEvents="none">
                <text x="0" y="-21.2" textAnchor="middle" dominantBaseline="central" fill="#f3cf82" fontSize="3.6" fontWeight="bold">U</text>
                <text x="21.2" y="0" textAnchor="middle" dominantBaseline="central" fill="#8c9a92" fontSize="3.2" fontWeight="bold">T</text>
                <text x="0" y="21.2" textAnchor="middle" dominantBaseline="central" fill="#8c9a92" fontSize="3.2" fontWeight="bold">S</text>
                <text x="-21.2" y="0" textAnchor="middle" dominantBaseline="central" fill="#8c9a92" fontSize="3.2" fontWeight="bold">B</text>
              </g>
              {/* Pancaran Sorot Senter di Mini-Radar */}
              <path d="M 0 0 L -8 -19 A 21 21 0 0 1 8 -19 Z" fill="rgba(255,235,160,0.18)" />
              {/* Indikator Pemain di Tengah (menghadap ke atas) */}
              <path d="M 0 0 L -7 -16 A 17 17 0 0 1 7 -16 Z" fill="rgba(107,232,156,0.22)" />
              <polygon points="0,-4 3.2,3.2 0,1.4 -3.2,3.2" fill="#6be89c" />
            </svg>
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.2 bg-[#050807]/85 rounded text-[8px] font-bold tracking-wider uppercase text-[#cfa15a] flex items-center gap-0.5">
              <Compass className="w-2.5 h-2.5" />
              Peta
            </span>
          </button>
        )}

        {squadRoster.length > 0 && (
          <div className="px-2.5 py-1.5 archival-panel rounded-sm w-fit flex flex-col gap-0.5 text-[10px] text-right">
            <span className="uppercase tracking-[0.12em] text-[#cfa15a] font-semibold">
              Regu Penyelidik ({squadRoster.length})
            </span>
            {squadRoster.map((m) => (
              <div key={m.id} className="text-[#cdd4cf] font-mono-num flex items-center justify-end gap-1.5">
                {m.downed ? (
                  <span className="text-[#ff7c6e] font-bold">TUMBANG</span>
                ) : (
                  <span className={m.connected === false ? 'text-[#d97b73]' : 'text-[#7ec99e]'}>●</span>
                )}
                <span>{m.name}</span>
                <span className="text-[#8e9a92]">({m.characterName})</span>
                {m.micOn && <Mic className="w-2.5 h-2.5 text-[#7ec99e] shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status Tumbang (Multiplayer Co-op) */}
      {hud.isDowned && (
        <div
          data-testid="downed-banner"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-[#36110e]/95 border border-[#e0564a] text-[#ffdcd8] text-xs font-semibold tracking-wide rounded-sm shadow-xl text-center max-w-md"
        >
          KAMU TUMBANG · Merangkak mendekati rekan regu agar ditolong dengan tombol [E]
        </div>
      )}

      {/* Overlay Cutscene Sinematik (Kedatangan Mobil & Ending 3D) */}
      {hud.cutscene && (
        <div
          data-testid="cutscene-overlay"
          data-cutscene-kind={hud.cutscene.kind}
          className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between"
        >
          <div className="w-full h-10 sm:h-12 bg-gradient-to-b from-black/95 to-transparent" />
          <div className="w-full bg-gradient-to-t from-black/95 via-black/80 to-transparent px-4 py-4 sm:py-5 flex flex-col items-center gap-2 text-center">
            <span className="text-[10px] font-mono-num font-bold tracking-[0.24em] uppercase text-[#cfa15a]">
              {hud.cutscene.stage}
            </span>
            <p className="text-xs sm:text-sm text-[#ebe7dc] max-w-2xl leading-relaxed hud-text-shadow">
              {hud.cutscene.caption}
            </p>
            <div className="flex items-center gap-3 mt-0.5">
              {hud.cutscene.subcaption && (
                <span className="text-[11px] text-[#98a29b]">{hud.cutscene.subcaption}</span>
              )}
              {hud.cutscene.canSkip && onSkipCutscene && (
                <button
                  type="button"
                  data-testid="btn-skip-cutscene"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSkipCutscene();
                  }}
                  className="pointer-events-auto px-3 py-1 bg-[#141a17]/90 hover:bg-[#202924] border border-[#cfa15a]/55 text-[#f0dec0] text-[11px] font-bold uppercase tracking-wider rounded-sm cursor-pointer"
                >
                  {hud.cutscene.kind === 'intro_car' ? 'Lewati [Spasi]' : 'Lanjutkan [Spasi]'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CENTER CROSSHAIR & PROMPT INTERAKSI */}
      {!hud.cutscene && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 pointer-events-none">
          <div className="w-1.5 h-1.5 rounded-full bg-[#ebe7dc]/80 shadow" />
          {hud.nearestPrompt && (
            <button
              type="button"
              tabIndex={-1}
              data-testid="interact-prompt"
              onClick={(e) => {
                e.currentTarget.blur();
                onInteract();
              }}
              className="pointer-events-auto px-3.5 py-1.5 bg-[#0f1311]/95 border border-[#cfa15a]/75 text-[#f7ebd1] text-xs font-bold tracking-wide rounded-sm shadow-xl cursor-pointer"
            >
              {hud.nearestPrompt}
            </button>
          )}
        </div>
      )}

      {/* TOAST NOTIFIKASI */}
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 max-w-md px-4 py-2 rounded-sm border text-xs font-medium text-center shadow-xl ${
            toast.tone === 'warn'
              ? 'bg-[#28110f]/95 border-[#b53429] text-[#ffd4cf]'
              : toast.tone === 'fact'
                ? 'bg-[#102318]/95 border-[#689f7d] text-[#d4f5df]'
                : 'bg-[#101412]/95 border-[rgba(207,161,90,0.35)] text-[#ebe7dc]'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* BOTTOM-LEFT: Sanity, Stamina, Baterai Senter & Baterai UV (Kompak di Mobile agar tidak menumpuk tombol) */}
      <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 w-32 sm:w-56 archival-panel rounded-sm p-1.5 sm:p-3 flex flex-col gap-0.5 sm:gap-1.5">
        <div>
          <div className="flex justify-between text-[9px] sm:text-[10px] tracking-[0.08em] uppercase text-[#a3afa7] font-mono-num">
            <span>Sanity</span>
            <span className={lowSanity ? 'text-[#e0564a] font-bold' : ''}>{hud.sanity}%</span>
          </div>
          <div className="h-1.5 bg-[#181f1b] rounded-sm overflow-hidden mt-0.5">
            <div
              className="h-full transition-all duration-150"
              style={{
                width: `${hud.sanity}%`,
                backgroundColor: lowSanity ? '#b53429' : '#689f7d',
              }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[9px] sm:text-[10px] tracking-[0.08em] uppercase text-[#a3afa7] font-mono-num">
            <span>
              {hud.isCrouching ? 'Jongkok' : hud.isSprinting ? 'Lari' : 'Stamina'}
            </span>
            <span>{hud.stamina}%</span>
          </div>
          <div className="h-1.5 bg-[#181f1b] rounded-sm overflow-hidden mt-0.5">
            <div
              className="h-full bg-[#cfa15a] transition-all duration-100"
              style={{ width: `${hud.stamina}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5 border-t border-[rgba(207,161,90,0.16)]">
          <div>
            <div className="flex justify-between text-[9px] tracking-[0.04em] uppercase text-[#d8c493] font-mono-num whitespace-nowrap">
              <span>Senter</span>
              <span>{hud.flashlightBattery}%</span>
            </div>
            <div className="h-1.5 bg-[#181f1b] rounded-sm overflow-hidden mt-0.5">
              <div
                className="h-full bg-[#e0b863] transition-all duration-150"
                style={{ width: `${hud.flashlightBattery}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[9px] tracking-[0.04em] uppercase text-[#bca6f5] font-mono-num whitespace-nowrap">
              <span>UV</span>
              <span>{hud.uvBattery}%</span>
            </div>
            <div className="h-1.5 bg-[#181f1b] rounded-sm overflow-hidden mt-0.5">
              <div
                className="h-full bg-[#8f6be8] transition-all duration-150"
                style={{ width: `${hud.uvBattery}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* CHAT REGU IN-GAME (Multiplayer) — digeser di atas panel kanan-atas atau tengah-kiri agar aman dari joystick */}
      {isMultiplayer && (
        <div className="absolute bottom-24 left-28 sm:bottom-36 sm:left-4 w-44 sm:w-72 flex flex-col gap-1 pointer-events-auto">
          {recentChat.length > 0 && (
            <div
              data-testid="ingame-chat-feed"
              className="archival-panel rounded-sm px-2.5 py-1.5 flex flex-col gap-0.5 text-[10px] leading-snug"
            >
              {recentChat.map((m) => (
                <div
                  key={m.id}
                  className={m.system ? 'text-[#cfa15a] italic' : 'text-[#e3e7e4]'}
                >
                  {!m.system && <strong className="text-[#ebe7dc] mr-1">{m.senderName}:</strong>}
                  <span>{m.text}</span>
                </div>
              ))}
            </div>
          )}

          {chatOpen ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (chatInput.trim() && onSendChat) {
                  onSendChat(chatInput);
                }
                setChatInput('');
                onSetChatOpen?.(false);
              }}
              className="flex items-center gap-1"
            >
              <input
                ref={chatInputRef}
                type="text"
                maxLength={160}
                data-testid="ingame-chat-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.code === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    onSetChatOpen?.(false);
                  }
                }}
                placeholder="Pesan regu... (Enter)"
                className="flex-1 bg-[#0b0e0c]/95 border border-[#cfa15a]/65 rounded-sm px-2.5 py-1.5 text-[11px] text-[#ebe7dc] focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Kirim chat regu"
                className="px-2 py-1.5 bg-[#1b3a29] border border-[#689f7d]/70 text-[#ebe7dc] rounded-sm cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <button
              type="button"
              tabIndex={-1}
              data-testid="btn-open-ingame-chat"
              onClick={(e) => {
                e.currentTarget.blur();
                onSetChatOpen?.(true);
              }}
              className="w-fit px-2 py-1 archival-panel hover:bg-[#19211d] text-[10px] text-[#c8d0ca] rounded-sm flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <MessageSquare className="w-3 h-3 text-[#cfa15a]" />
              <span>Chat Regu [T]</span>
            </button>
          )}
        </div>
      )}

      {/* BOTTOM-RIGHT: Slot Peralatan Cepat + Mic Radio */}
      <div
        className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 flex items-center gap-1 sm:gap-2 pointer-events-auto"
        onTouchStart={(e) => e.stopPropagation()}
      >
        {isMultiplayer && voiceChatEnabled && onToggleMic && (
          <button
            type="button"
            tabIndex={-1}
            data-testid="btn-ingame-mic"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMic();
            }}
            title={
              voiceStatus === 'denied'
                ? 'Izin mikrofon ditolak browser'
                : voiceStatus === 'unavailable'
                  ? 'Perangkat audio WebRTC tidak tersedia'
                  : 'Toggle Mikrofon / Radio HT [B]'
            }
            className={`px-1.5 py-1.5 sm:px-3 sm:py-2 rounded-sm border text-[10px] sm:text-xs font-semibold font-mono-num flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              micOn && voiceStatus !== 'denied'
                ? 'bg-[#152e20]/95 border-[#689f7d] text-[#c7f2d6]'
                : 'bg-[#0e1411]/90 border-[#2e3832] text-[#8d9991]'
            }`}
          >
            {micOn && voiceStatus !== 'denied' ? (
              <Mic className="w-3.5 h-3.5" />
            ) : (
              <MicOff className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {voiceStatus === 'denied'
                ? 'Mic Ditolak'
                : micOn
                  ? 'Mic [B] · Aktif'
                  : 'Mic [B] · Mati'}
            </span>
          </button>
        )}

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleFlashlight();
          }}
          className={`px-1.5 py-1.5 sm:px-3 sm:py-2 rounded-sm border text-[10px] sm:text-xs font-semibold font-mono-num cursor-pointer whitespace-nowrap ${
            hud.flashlightOn
              ? 'bg-[#2a2112]/95 border-[#cfa15a] text-[#ffe8b5]'
              : 'bg-[#0e1411]/90 border-[#2e3832] text-[#8d9991]'
          }`}
        >
          <span className="hidden sm:inline">Senter [F] · {hud.flashlightBattery}%</span>
          <span className="sm:hidden">Senter {hud.flashlightBattery}%</span>
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleUV();
          }}
          className={`px-1.5 py-1.5 sm:px-3 sm:py-2 rounded-sm border text-[10px] sm:text-xs font-semibold font-mono-num cursor-pointer whitespace-nowrap ${
            hud.uvMode
              ? 'bg-[#21153b]/95 border-[#8f6be8] text-[#e1d4ff]'
              : 'bg-[#0e1411]/90 border-[#2e3832] text-[#8d9991]'
          }`}
        >
          <span className="hidden sm:inline">UV [Q] · {hud.uvBattery}%</span>
          <span className="sm:hidden">UV {hud.uvBattery}%</span>
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onUseSalt();
          }}
          className="px-1.5 py-1.5 sm:px-3 sm:py-2 rounded-sm border bg-[#0e1411]/90 hover:bg-[#1a221e] border-[#3d4a42] text-[#ebe7dc] text-[10px] sm:text-xs font-semibold font-mono-num cursor-pointer whitespace-nowrap"
        >
          <span className="hidden sm:inline">Garam [G]: {hud.saltCount}</span>
          <span className="sm:hidden">Garam:{hud.saltCount}</span>
        </button>
      </div>
    </div>
  );
};
