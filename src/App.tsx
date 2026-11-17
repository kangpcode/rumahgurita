import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameHUD } from './components/GameHUD';
import { JournalModal } from './components/JournalModal';
import { JumpscareOverlay } from './components/JumpscareOverlay';
import { LoadingScreen } from './components/LoadingScreen';
import { MapModal } from './components/MapModal';
import { MobileTouchControls } from './components/MobileTouchControls';
import { MultiplayerModal } from './components/MultiplayerModal';
import { NpcDialogModal, RadioPuzzleModal } from './components/PuzzleModal';
import { CreditsModal, GameOverModal, PauseModal, SettingsModal } from './components/StatusModals';
import { TitleScreen } from './components/TitleScreen';
import { CHARACTERS, INITIAL_RUMORS, NPC_DIALOGS } from './game/data';
import { HorrorWorld } from './game/HorrorWorld';
import type {
  AudioSettings,
  CharacterId,
  GameHUDState,
  GameMapSnapshot,
  GamePhase,
  GraphicsQuality,
  JumpscareEvent,
  LoadingKind,
  MapWaypoint,
  RumorEntry,
  RunSummary,
  VisualSettings,
} from './game/types';
import {
  LobbyClient,
  loadOrCreateGuestProfile,
  saveCosmetics,
  saveNickname,
} from './net/lobbyClient';
import { CoopVoiceManager, type VoiceStatus } from './net/voiceChat';
import {
  normalizeRoomCode,
  type PlayerCosmetics,
  type RoomDifficulty,
  type RoomSnapshot,
} from './shared/lobbyProtocol';

const AUDIO_STORAGE_KEY = 'rumah_gurita_audio_settings_v1';
const VISUAL_STORAGE_KEY = 'rumah_gurita_visual_settings_v1';

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 80,
  musicVolume: 65,
  sfxVolume: 85,
  bgmVolume: 75,
  masterEnabled: true,
  bgmEnabled: true,
  musicEnabled: true,
  sfxEnabled: true,
  voiceEnabled: true,
};

const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  brightness: 1.05,
  fov: 72,
  sensitivity: 1.0,
  cinematicEffects: true,
};

function loadInitialVisualSettings(): VisualSettings {
  try {
    const raw = localStorage.getItem(VISUAL_STORAGE_KEY);
    if (!raw) return DEFAULT_VISUAL_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<VisualSettings>;
    return {
      brightness: typeof parsed.brightness === 'number' ? parsed.brightness : 1.05,
      fov: typeof parsed.fov === 'number' ? parsed.fov : 72,
      sensitivity: typeof parsed.sensitivity === 'number' ? parsed.sensitivity : 1.0,
      cinematicEffects:
        typeof parsed.cinematicEffects === 'boolean' ? parsed.cinematicEffects : true,
    };
  } catch {
    return DEFAULT_VISUAL_SETTINGS;
  }
}

function loadInitialAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      masterVolume: typeof parsed.masterVolume === 'number' ? parsed.masterVolume : 80,
      musicVolume: typeof parsed.musicVolume === 'number' ? parsed.musicVolume : 65,
      sfxVolume: typeof parsed.sfxVolume === 'number' ? parsed.sfxVolume : 85,
      bgmVolume: typeof parsed.bgmVolume === 'number' ? parsed.bgmVolume : 75,
      masterEnabled: typeof parsed.masterEnabled === 'boolean' ? parsed.masterEnabled : true,
      bgmEnabled: typeof parsed.bgmEnabled === 'boolean' ? parsed.bgmEnabled : true,
      musicEnabled: typeof parsed.musicEnabled === 'boolean' ? parsed.musicEnabled : true,
      sfxEnabled: typeof parsed.sfxEnabled === 'boolean' ? parsed.sfxEnabled : true,
      voiceEnabled: typeof parsed.voiceEnabled === 'boolean' ? parsed.voiceEnabled : true,
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

const INITIAL_HUD: GameHUDState = {
  phase: 'title',
  floor: 'outside',
  actNumber: 0,
  currentObjective:
    'Tanya Ceu Titin / Anak Muda [E], lalu susuri Jalan Sukajadi ke utara melewati Baliho Windah menuju Gerbang Rumah Gurita.',
  inDimensiGaib: false,
  inSafeZone: true,
  safeZoneName: 'Jalan Sukajadi (Zona Aman)',
  sanity: 100,
  maxSanity: 100,
  stamina: 100,
  maxStamina: 100,
  flashlightBattery: 100,
  maxFlashlightBattery: 100,
  uvBattery: 100,
  maxUvBattery: 100,
  flashlightOn: true,
  uvMode: false,
  isCrouching: false,
  isSprinting: false,
  isHiding: false,
  perspective: 'first-person',
  noiseLevel: 0,
  saltCount: 2,
  keysInventory: [],
  segelBroken: 0,
  totalSegel: INITIAL_RUMORS.length,
  evidenceCount: 0,
  totalEvidence: INITIAL_RUMORS.length,
  kujangClaimed: false,
  raniRescued: false,
  nearestPrompt: null,
  nearestGhostDist: 999,
  nearestGhostName: null,
  ditoSenseHint: null,
  elapsedSeconds: 0,
  fps: 60,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HorrorWorld | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const jumpscareTimerRef = useRef<number | null>(null);
  const lobbyClientRef = useRef<LobbyClient | null>(null);
  const voiceRef = useRef<CoopVoiceManager | null>(null);
  const prevRoomPhaseRef = useRef<RoomSnapshot['phase'] | null>(null);
  const mpRoomRef = useRef<RoomSnapshot | null>(null);
  const guestIdRef = useRef<string>('');
  const hudRef = useRef<GameHUDState>(INITIAL_HUD);

  const [guestProfile, setGuestProfile] = useState(() => loadOrCreateGuestProfile());
  const [inviteCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('room');
    const norm = raw ? normalizeRoomCode(raw) : '';
    return norm.length >= 4 ? norm : null;
  });

  const [phase, setPhase] = useState<GamePhase>('title');
  const [loadingKind, setLoadingKind] = useState<LoadingKind | null>(() => {
    if (typeof window === 'undefined') return 'boot';
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' || params.get('room')) return null;
    return 'boot';
  });

  const [selectedCharacter, setSelectedCharacter] = useState<CharacterId>('raka');
  const [soloDifficulty, setSoloDifficulty] = useState<RoomDifficulty>('Normal');
  const [aiCompanionCount, setAiCompanionCount] = useState<number>(0);
  const [quality, setQuality] = useState<GraphicsQuality>('medium');
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(loadInitialAudioSettings);
  const [visualSettings, setVisualSettings] = useState<VisualSettings>(loadInitialVisualSettings);
  const [touchControlsEnabled, setTouchControlsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.innerWidth < 768 ||
      (window.matchMedia?.('(pointer: coarse)').matches ?? false) ||
      (navigator.maxTouchPoints ?? 0) > 0
    );
  });
  const [hud, setHud] = useState<GameHUDState>(INITIAL_HUD);
  const [rumors, setRumors] = useState<RumorEntry[]>(INITIAL_RUMORS);
  const [isMuted, setIsMuted] = useState(false);
  const [jumpscare, setJumpscare] = useState<JumpscareEvent | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'warn' | 'fact' } | null>(
    null
  );

  // Main menu & gameplay modals
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalArchiveOpen, setJournalArchiveOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapSnapshot, setMapSnapshot] = useState<GameMapSnapshot | null>(null);
  const [waypoint, setWaypoint] = useState<MapWaypoint | null>(null);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [multiplayerOpen, setMultiplayerOpen] = useState<boolean>(() => Boolean(inviteCode));
  const [activeNpcId, setActiveNpcId] = useState<string | null>(null);
  const [radioOpen, setRadioOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);

  // Multiplayer room state
  const [mpConnected, setMpConnected] = useState(false);
  const [mpRoom, setMpRoom] = useState<RoomSnapshot | null>(null);
  const [mpError, setMpError] = useState<string | null>(null);
  const [ingameChatOpen, setIngameChatOpen] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('disabled');

  mpRoomRef.current = mpRoom;
  guestIdRef.current = guestProfile.guestId;
  hudRef.current = hud;

  if (!lobbyClientRef.current) {
    lobbyClientRef.current = new LobbyClient();
  }
  const lobbyClient = lobbyClientRef.current;

  if (!voiceRef.current) {
    voiceRef.current = new CoopVoiceManager(lobbyClient, (st) => setVoiceStatus(st));
  }

  const showToast = useCallback((message: string, tone: 'info' | 'warn' | 'fact' = 'info') => {
    setToast({ message, tone });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => {
    document.body.dataset.state = loadingKind ? `loading_${loadingKind}` : phase;
  }, [phase, loadingKind]);

  // Setup LobbyClient event handlers + ?room=XXXXX deep-link auto-join
  useEffect(() => {
    lobbyClient.setEvents({
      onConnectionChange: (isConn) => setMpConnected(isConn),
      onRoomState: (snap) => {
        setMpRoom(snap);
        setMpError(null);
      },
      onError: (err) => setMpError(err.message),
      onKicked: (err) => {
        setMpRoom(null);
        setPhase('title');
        worldRef.current?.setPhase('title');
        setMultiplayerOpen(true);
        setMpError(err.message);
      },
      onSquadSync: (squad) => {
        worldRef.current?.syncRemotePlayers(squad, guestIdRef.current);
      },
      onWorldEvent: (ev) => {
        worldRef.current?.applyRemoteWorldEvent(ev, guestIdRef.current);
      },
      onGhostSync: (ghosts) => {
        worldRef.current?.applyRemoteGhosts(ghosts);
      },
      onRtcSignal: (sig) => {
        void voiceRef.current?.handleSignal(sig);
      },
    });

    if (inviteCode) {
      void lobbyClient
        .joinRoom({
          code: inviteCode,
          guestId: guestProfile.guestId,
          nickname: guestProfile.nickname,
          preferredCharacter: selectedCharacter,
          cosmetics: guestProfile.cosmetics,
        })
        .then((res) => {
          if (!res.ok && res.message) {
            setMpError(res.message);
          }
        });
    }

    return () => {
      voiceRef.current?.dispose();
      lobbyClient.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Room Phase State Machine: LOBBY -> LOADING -> PLAYING -> ENDED -> LOBBY
  useEffect(() => {
    const prev = prevRoomPhaseRef.current;
    const next = mpRoom?.phase ?? null;
    prevRoomPhaseRef.current = next;

    if (!mpRoom) {
      setIngameChatOpen(false);
      if (prev && prev !== 'LOBBY' && phase !== 'title') {
        setPhase('title');
        worldRef.current?.setPhase('title');
      }
      return;
    }

    const myIndex = Math.max(
      0,
      mpRoom.players.findIndex((p) => p.guestId === guestProfile.guestId)
    );
    const me = mpRoom.players[myIndex];
    if (me) {
      worldRef.current?.setCharacter(me.characterId);
      worldRef.current?.setCosmetics(me.cosmetics);
    }

    if (next === 'LOADING' && prev !== 'LOADING') {
      setMultiplayerOpen(false);
      setRunSummary(null);
      setIngameChatOpen(false);
      setLoadingKind('enter_world');
      worldRef.current?.setMultiplayerConfig({
        isMultiplayer: true,
        isSpectator: false,
        isHost: Boolean(me?.isHost),
        spawnSlot: myIndex,
        difficulty: mpRoom.settings.difficulty,
      });
    } else if (next === 'PLAYING' && prev !== 'PLAYING') {
      const world = worldRef.current;
      const isLateSpectator = me?.role === 'spectator';
      setLoadingKind(null);
      setMultiplayerOpen(false);
      setRunSummary(null);
      setIngameChatOpen(false);
      setPhase('playing');
      if (world) {
        world.setMultiplayerConfig({
          isMultiplayer: true,
          isSpectator: Boolean(isLateSpectator),
          isHost: Boolean(me?.isHost),
          spawnSlot: myIndex,
          difficulty: mpRoom.settings.difficulty,
        });
        world.startNewGame();
        world.applyRemoteWorldState(mpRoom.world);
      }
      showToast(
        isLateSpectator
          ? 'Kamu bergabung sebagai Penonton (Late Join). Tekan "Masuk di Checkpoint" untuk ikut bermain!'
          : `Room ${mpRoom.code}: Selamat datang di Warung Ceu Titin!`,
        'info'
      );
    } else if (next === 'PLAYING') {
      worldRef.current?.setMultiplayerConfig({
        isMultiplayer: true,
        isSpectator: me?.role === 'spectator',
        isHost: Boolean(me?.isHost),
        spawnSlot: myIndex,
        difficulty: mpRoom.settings.difficulty,
      });
    } else if (next === 'ENDED' && prev !== 'ENDED') {
      setLoadingKind(null);
      setJournalOpen(false);
      setActiveNpcId(null);
      setRadioOpen(false);
      setIngameChatOpen(false);
      setJumpscare(null);
      const summary = mpRoom.lastSummary;
      const broken = worldRef.current
        ? worldRef.current.getRumors().filter((r) => r.debunked).length
        : mpRoom.world.debunkedRumorIds.length;
      const evidenceFound = worldRef.current
        ? worldRef.current.getRumors().filter((r) => r.discoveredFact).length
        : mpRoom.world.discoveredFactIds.length;
      const charName =
        CHARACTERS.find((c) => c.id === me?.characterId)?.name ?? guestProfile.nickname;
      setRunSummary({
        ending: summary?.outcome === 'defeat' ? 'bad' : broken >= INITIAL_RUMORS.length ? 'true' : 'normal',
        endingTitle: summary?.title ?? 'Ekspedisi Selesai',
        endingSubtitle: summary?.subtitle ?? 'Hasil ekspedisi regu Sukajadi.',
        endingMessage:
          summary?.outcome === 'defeat'
            ? 'Seluruh penyelidik kehilangan kendali di dalam Dimensi Gaib Sukajadi.'
            : 'Regu Klub Penasaran menuntaskan investigasi di Rumah Gurita Bandung.',
        characterName: charName,
        segelBroken: broken,
        totalSegel: INITIAL_RUMORS.length,
        evidenceCount: evidenceFound,
        totalEvidence: INITIAL_RUMORS.length,
        elapsedSeconds: summary?.durationSec ?? hudRef.current.elapsedSeconds,
        ghostHits: 0,
        raniRescued: mpRoom.world.raniRescued,
      });
      setPhase('gameover');
      worldRef.current?.setPhase('gameover');
    } else if (next === 'LOBBY' && (prev === 'PLAYING' || prev === 'ENDED')) {
      setLoadingKind(null);
      setRunSummary(null);
      setIngameChatOpen(false);
      setPhase('title');
      worldRef.current?.setPhase('title');
      setMultiplayerOpen(true);
    }
  }, [mpRoom, guestProfile.guestId, phase, showToast]);

  // WebRTC Voice Chat lifecycle sync
  useEffect(() => {
    if (!voiceRef.current) return;
    if (!mpRoom || (mpRoom.phase !== 'LOBBY' && mpRoom.phase !== 'PLAYING')) {
      void voiceRef.current.configure({
        roomCode: '',
        localGuestId: guestProfile.guestId,
        enabled: false,
        micOn: false,
        players: [],
      });
      return;
    }
    const me = mpRoom.players.find((p) => p.guestId === guestProfile.guestId);
    void voiceRef.current.configure({
      roomCode: mpRoom.code,
      localGuestId: guestProfile.guestId,
      enabled: mpRoom.settings.voiceChat,
      micOn: Boolean(me?.micOn),
      players: mpRoom.players,
    });
  }, [mpRoom, guestProfile.guestId]);

  // ~8Hz Multiplayer Position, Host Ghost Authority & Spatial Voice Attenuation
  useEffect(() => {
    if (!mpRoom || mpRoom.phase !== 'PLAYING' || phase === 'title') return;
    const me = mpRoom.players.find((p) => p.guestId === guestProfile.guestId);
    const isHost = Boolean(me?.isHost);
    const interval = window.setInterval(() => {
      const world = worldRef.current;
      if (!world) return;
      const payload = world.getPlayerSyncPayload();
      lobbyClient.sendPlayerSync({
        code: mpRoom.code,
        guestId: guestProfile.guestId,
        ...payload,
      });
      if (isHost) {
        lobbyClient.sendGhostSync(mpRoom.code, guestProfile.guestId, world.getGhostSyncPayload());
      }
      if (voiceRef.current && mpRoom.settings.voiceChat) {
        voiceRef.current.updateSpatialPositions(
          world.getLocalPlayerPosition(),
          world.getRemotePlayerPositions()
        );
      }
    }, 120);
    return () => window.clearInterval(interval);
  }, [mpRoom, phase, guestProfile.guestId, lobbyClient]);

  const finishStartSolo = useCallback(() => {
    const world = worldRef.current;
    setLoadingKind(null);
    if (!world) return;
    setJournalOpen(false);
    setJournalArchiveOpen(false);
    setSettingsMenuOpen(false);
    setMultiplayerOpen(false);
    setActiveNpcId(null);
    setRadioOpen(false);
    setCreditsOpen(false);
    setRunSummary(null);
    setJumpscare(null);
    setPhase('playing');
    world.setCharacter(selectedCharacter);
    world.setCosmetics(guestProfile.cosmetics);
    world.setSoloOptions({
      difficulty: soloDifficulty,
      aiCompanionCount,
    });
    world.startNewGame();
    showToast(
      'Kamu tiba di Warung Ceu Titin! Tanya Ceu Titin / Anak Muda [E], lalu susuri jalan melewati Baliho Windah ke Rumah Gurita.',
      'info'
    );
  }, [selectedCharacter, guestProfile.cosmetics, soloDifficulty, aiCompanionCount, showToast]);

  const startSoloGame = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setJournalOpen(false);
    setJournalArchiveOpen(false);
    setSettingsMenuOpen(false);
    setMultiplayerOpen(false);
    setActiveNpcId(null);
    setRadioOpen(false);
    setCreditsOpen(false);
    setRunSummary(null);
    setJumpscare(null);
    worldRef.current?.setPhase('paused');
    setLoadingKind('enter_world');
  }, []);

  // Mount Three.js HorrorWorld once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const world = new HorrorWorld(container, {
      onHudUpdate: (nextHud) => setHud(nextHud),
      onToast: (msg, tone) => showToast(msg, tone),
      onCoopAction: (action) => {
        const room = mpRoomRef.current;
        if (room) {
          lobbyClient.sendWorldAction(room.code, guestIdRef.current, action);
        }
      },
      onOpenNpcDialog: (npcId) => {
        if (!mpRoomRef.current) world.setPhase('paused');
        else world.setInputSuspended(true);
        const dialog = NPC_DIALOGS[npcId];
        if (dialog?.unlockRumorId) {
          world.discoverRumor(dialog.unlockRumorId);
        }
        setActiveNpcId(npcId);
      },
      onOpenRadioPuzzle: () => {
        if (!mpRoomRef.current) world.setPhase('paused');
        else world.setInputSuspended(true);
        setRadioOpen(true);
      },
      onRumorsChanged: (nextRumors) => setRumors(nextRumors),
      onJumpscare: (event) => {
        setJumpscare(event);
        if (jumpscareTimerRef.current) window.clearTimeout(jumpscareTimerRef.current);
        jumpscareTimerRef.current = window.setTimeout(() => setJumpscare(null), 780);
      },
      onGameOver: (summary) => {
        setJumpscare(null);
        setRunSummary(summary);
        setPhase('gameover');
        const room = mpRoomRef.current;
        if (room && room.phase !== 'ENDED') {
          lobbyClient.endMatch(room.code, {
            outcome: summary.ending === 'bad' ? 'defeat' : 'victory',
            title: summary.endingTitle,
            subtitle: summary.endingSubtitle,
            durationSec: summary.elapsedSeconds,
          });
        }
      },
      onToggleJournal: () => {
        setJournalOpen((prev) => {
          const next = !prev;
          if (!mpRoomRef.current) world.setPhase(next ? 'paused' : 'playing');
          else world.setInputSuspended(next);
          return next;
        });
      },
      onPauseRequest: () => {
        setJournalOpen(false);
        setActiveNpcId(null);
        setRadioOpen(false);
        setIngameChatOpen(false);
        setPhase('paused');
        if (!mpRoomRef.current) world.setPhase('paused');
        else world.setInputSuspended(true);
      },
    });
    worldRef.current = world;
    world.audio.setAudioSettings(audioSettings);
    world.setVisualSettings(visualSettings);

    const onResizeCheck = () => {
      if (window.innerWidth < 768) {
        setTouchControlsEnabled(true);
      }
    };
    window.addEventListener('resize', onResizeCheck);

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      setPhase('playing');
      world.startNewGame();
    }

    return () => {
      window.removeEventListener('resize', onResizeCheck);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (jumpscareTimerRef.current) window.clearTimeout(jumpscareTimerRef.current);
      world.dispose();
      worldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (ingameChatOpen && e.code === 'Escape') {
        e.preventDefault();
        setIngameChatOpen(false);
        if (mpRoom) worldRef.current?.setInputSuspended(false);
        return;
      }

      if (isTyping) return;

      if (e.code === 'KeyM' && !multiplayerOpen) {
        const muted = worldRef.current?.audio.toggleMute() ?? false;
        setIsMuted(muted);
        return;
      }
      if (
        e.code === 'KeyT' &&
        mpRoom &&
        phase === 'playing' &&
        !loadingKind &&
        !journalOpen &&
        !activeNpcId &&
        !radioOpen &&
        !multiplayerOpen
      ) {
        e.preventDefault();
        setIngameChatOpen(true);
        worldRef.current?.setInputSuspended(true);
        return;
      }
      if (
        e.code === 'KeyB' &&
        mpRoom?.settings.voiceChat &&
        phase === 'playing' &&
        !loadingKind &&
        !journalOpen &&
        !activeNpcId &&
        !radioOpen &&
        !multiplayerOpen
      ) {
        e.preventDefault();
        lobbyClient.toggleMic(mpRoom.code, guestProfile.guestId);
        return;
      }
      if (journalArchiveOpen && (e.code === 'KeyJ' || e.code === 'Escape')) {
        e.preventDefault();
        setJournalArchiveOpen(false);
        return;
      }
      if (settingsMenuOpen && e.code === 'Escape') {
        e.preventDefault();
        setSettingsMenuOpen(false);
        return;
      }
      if (journalOpen && (e.code === 'KeyJ' || e.code === 'Escape')) {
        e.preventDefault();
        setJournalOpen(false);
        if (mpRoom) worldRef.current?.setInputSuspended(false);
        else worldRef.current?.setPhase('playing');
        return;
      }
      if (mapOpen && (e.code === 'Tab' || e.code === 'KeyN' || e.code === 'Escape')) {
        e.preventDefault();
        setMapOpen(false);
        if (mpRoom) worldRef.current?.setInputSuspended(false);
        else worldRef.current?.setPhase('playing');
        return;
      }
      if (
        !mapOpen &&
        phase === 'playing' &&
        !loadingKind &&
        !journalOpen &&
        !activeNpcId &&
        !radioOpen &&
        !multiplayerOpen &&
        (e.code === 'Tab' || e.code === 'KeyN')
      ) {
        e.preventDefault();
        setIngameChatOpen(false);
        const snap = worldRef.current?.getMapSnapshot() ?? null;
        if (snap) {
          setMapSnapshot(snap);
          setMapOpen(true);
          if (mpRoom) worldRef.current?.setInputSuspended(true);
          else worldRef.current?.setPhase('paused');
        }
        return;
      }
      if ((activeNpcId || radioOpen) && e.code === 'Escape') {
        e.preventDefault();
        setActiveNpcId(null);
        setRadioOpen(false);
        if (mpRoom) worldRef.current?.setInputSuspended(false);
        else worldRef.current?.setPhase('playing');
        return;
      }
      if (
        phase === 'paused' &&
        !loadingKind &&
        !journalOpen &&
        !mapOpen &&
        !activeNpcId &&
        !radioOpen &&
        (e.code === 'Escape' || e.code === 'KeyP')
      ) {
        e.preventDefault();
        setPhase('playing');
        if (mpRoom) worldRef.current?.setInputSuspended(false);
        else worldRef.current?.setPhase('playing');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    phase,
    loadingKind,
    journalOpen,
    mapOpen,
    journalArchiveOpen,
    settingsMenuOpen,
    multiplayerOpen,
    activeNpcId,
    radioOpen,
    ingameChatOpen,
    mpRoom,
    guestProfile.guestId,
    lobbyClient,
  ]);

  // Otomatis bersihkan Pin Kompas ketika pemain tiba di tujuan pada lantai yang sama
  useEffect(() => {
    if (!waypoint || hud.playerX === undefined || hud.playerZ === undefined) return;
    if (waypoint.floor !== hud.floor) return;
    const dist = Math.hypot(waypoint.x - hud.playerX, waypoint.z - hud.playerZ);
    if (dist < 2.6) {
      showToast(`Tiba di lokasi pin: ${waypoint.label}`, 'fact');
      setWaypoint(null);
    }
  }, [waypoint, hud.playerX, hud.playerZ, hud.floor, showToast]);

  const handleSelectCharacter = (id: CharacterId) => {
    setSelectedCharacter(id);
    worldRef.current?.setCharacter(id);
  };

  const handleResume = () => {
    setJournalOpen(false);
    setMapOpen(false);
    setActiveNpcId(null);
    setRadioOpen(false);
    setPhase('playing');
    if (mpRoom) worldRef.current?.setInputSuspended(false);
    else worldRef.current?.setPhase('playing');
  };

  const finishExitTitle = useCallback(() => {
    setLoadingKind(null);
    setJournalOpen(false);
    setMapOpen(false);
    setWaypoint(null);
    setActiveNpcId(null);
    setRadioOpen(false);
    setRunSummary(null);
    setJumpscare(null);
    setPhase('title');
    worldRef.current?.setMultiplayerConfig({
      isMultiplayer: false,
      isSpectator: false,
      difficulty: soloDifficulty,
    });
    worldRef.current?.setPhase('title');
  }, [soloDifficulty]);

  const handleExitTitle = useCallback(() => {
    if (mpRoom) {
      lobbyClient.leaveRoom(guestProfile.guestId);
      setMpRoom(null);
    }
    setJournalOpen(false);
    setActiveNpcId(null);
    setRadioOpen(false);
    setRunSummary(null);
    setJumpscare(null);
    worldRef.current?.setPhase('paused');
    setLoadingKind('return_menu');
  }, [mpRoom, guestProfile.guestId, lobbyClient]);

  const handleLoadingComplete = useCallback(() => {
    if (loadingKind === 'boot') {
      setLoadingKind(null);
    } else if (loadingKind === 'enter_world') {
      if (mpRoom) {
        // Server tick advances LOADING -> PLAYING and triggers world start + remote sync
        if (mpRoom.phase === 'PLAYING') {
          setLoadingKind(null);
          setPhase('playing');
        }
      } else {
        finishStartSolo();
      }
    } else if (loadingKind === 'return_menu') {
      finishExitTitle();
    }
  }, [loadingKind, mpRoom, finishStartSolo, finishExitTitle]);

  const handleAudioSettingsChange = useCallback((next: AudioSettings) => {
    setAudioSettings(next);
    worldRef.current?.audio.setAudioSettings(next);
    try {
      localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const handleVisualSettingsChange = useCallback((next: VisualSettings) => {
    setVisualSettings(next);
    worldRef.current?.setVisualSettings(next);
    try {
      localStorage.setItem(VISUAL_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const handleChangeNickname = (nick: string) => {
    setGuestProfile((prev) => ({ ...prev, nickname: nick }));
    saveNickname(nick);
  };

  const handleChangeCosmetics = (c: PlayerCosmetics) => {
    setGuestProfile((prev) => ({ ...prev, cosmetics: c }));
    saveCosmetics(c);
    worldRef.current?.setCosmetics(c);
  };

  const squadRoster = useMemo(() => {
    if (mpRoom) {
      return mpRoom.players.map((p) => ({
        id: p.guestId,
        name: p.nickname,
        characterName: CHARACTERS.find((c) => c.id === p.characterId)?.name ?? p.characterId,
        isBot: p.isBot,
        connected: p.connected,
        downed: p.downed,
        micOn: p.micOn,
      }));
    }
    if (aiCompanionCount > 0) {
      const companions = CHARACTERS.filter((c) => c.id !== selectedCharacter)
        .slice(0, aiCompanionCount)
        .map((c) => ({
          id: `ai_${c.id}`,
          name: `AI ${c.name}`,
          characterName: c.skillName,
          isBot: true,
          connected: true,
        }));
      const selfChar = CHARACTERS.find((c) => c.id === selectedCharacter) ?? CHARACTERS[0];
      return [
        {
          id: 'self',
          name: guestProfile.nickname,
          characterName: selfChar.name,
          isBot: false,
          connected: true,
        },
        ...companions,
      ];
    }
    return [];
  }, [mpRoom, aiCompanionCount, selectedCharacter, guestProfile.nickname]);

  const localMpPlayer = mpRoom?.players.find((p) => p.guestId === guestProfile.guestId);
  const isMultiplayerHost = Boolean(localMpPlayer?.isHost);
  const isSpectator = Boolean(mpRoom && localMpPlayer?.role === 'spectator');
  const anyGameplayModalOpen = journalOpen || mapOpen || activeNpcId !== null || radioOpen;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#070908]">
      {/* Isolated WebGL Canvas Container */}
      <div ref={mountRef} data-testid="webgl-viewport" className="fixed inset-0 z-0" />

      {/* Title Screen (5 Aksi Menu Utama) */}
      {phase === 'title' && !loadingKind && !multiplayerOpen && (
        <TitleScreen
          selectedCharacter={selectedCharacter}
          onSelectCharacter={handleSelectCharacter}
          soloDifficulty={soloDifficulty}
          onChangeSoloDifficulty={setSoloDifficulty}
          aiCompanionCount={aiCompanionCount}
          onChangeAiCompanions={setAiCompanionCount}
          onStartSolo={startSoloGame}
          onOpenMultiplayer={() => {
            setMpError(null);
            lobbyClient.connect(guestProfile.guestId);
            setMultiplayerOpen(true);
          }}
          onOpenSettings={() => setSettingsMenuOpen(true)}
          onOpenJournalArchive={() => setJournalArchiveOpen(true)}
          onShowCredits={() => setCreditsOpen(true)}
        />
      )}

      {/* Multiplayer Hub & Lobby Room Modal */}
      {multiplayerOpen && (
        <MultiplayerModal
          client={lobbyClient}
          guestId={guestProfile.guestId}
          nickname={guestProfile.nickname}
          onChangeNickname={handleChangeNickname}
          cosmetics={guestProfile.cosmetics}
          onChangeCosmetics={handleChangeCosmetics}
          selectedCharacter={selectedCharacter}
          onSelectSoloCharacter={handleSelectCharacter}
          soloDifficulty={soloDifficulty}
          onChangeSoloDifficulty={setSoloDifficulty}
          aiCompanionCount={aiCompanionCount}
          onChangeAiCompanions={setAiCompanionCount}
          onStartSolo={startSoloGame}
          room={mpRoom}
          connected={mpConnected}
          errorBanner={mpError}
          onClearError={() => setMpError(null)}
          initialJoinCode={inviteCode}
          onClose={() => {
            if (!mpRoom) setMultiplayerOpen(false);
          }}
        />
      )}

      {/* Active Gameplay HUD */}
      {phase === 'playing' && !loadingKind && !anyGameplayModalOpen && (
        <>
          <GameHUD
            hud={hud}
            isMuted={isMuted}
            toast={toast}
            roomCode={mpRoom?.code ?? null}
            isMultiplayer={Boolean(mpRoom)}
            squadRoster={squadRoster}
            isSpectator={isSpectator}
            chatMessages={mpRoom?.chat ?? []}
            chatOpen={ingameChatOpen}
            onSetChatOpen={(open) => {
              setIngameChatOpen(open);
              if (mpRoom) worldRef.current?.setInputSuspended(open);
            }}
            onSendChat={(text) => {
              if (mpRoom) lobbyClient.sendChat(mpRoom.code, guestProfile.guestId, text);
            }}
            voiceChatEnabled={Boolean(mpRoom?.settings.voiceChat)}
            micOn={Boolean(localMpPlayer?.micOn)}
            voiceStatus={voiceStatus}
            onToggleMic={() => {
              if (mpRoom) lobbyClient.toggleMic(mpRoom.code, guestProfile.guestId);
            }}
            onCheckpointSpawn={() => {
              if (!mpRoom) return;
              lobbyClient.requestCheckpointSpawn(mpRoom.code, guestProfile.guestId);
              worldRef.current?.enterFromCheckpoint();
              worldRef.current?.applyRemoteWorldState(mpRoom.world);
            }}
            onToggleMute={() => setIsMuted(worldRef.current?.audio.toggleMute() ?? false)}
            onOpenJournal={() => {
              setIngameChatOpen(false);
              setJournalOpen(true);
              if (mpRoom) worldRef.current?.setInputSuspended(true);
              else worldRef.current?.setPhase('paused');
            }}
            onOpenMap={() => {
              setIngameChatOpen(false);
              const snap = worldRef.current?.getMapSnapshot() ?? null;
              if (snap) {
                setMapSnapshot(snap);
                setMapOpen(true);
                if (mpRoom) worldRef.current?.setInputSuspended(true);
                else worldRef.current?.setPhase('paused');
              }
            }}
            waypoint={waypoint}
            onClearWaypoint={() => setWaypoint(null)}
            onOpenPause={() => {
              setIngameChatOpen(false);
              setPhase('paused');
              if (mpRoom) worldRef.current?.setInputSuspended(true);
              else worldRef.current?.setPhase('paused');
            }}
            onInteract={() => worldRef.current?.interactNearest()}
            onToggleFlashlight={() => worldRef.current?.toggleFlashlight()}
            onToggleUV={() => worldRef.current?.toggleUVMode()}
            onUseSalt={() => worldRef.current?.useSalt()}
            onSkipCutscene={() => worldRef.current?.skipCutscene()}
          />
          {touchControlsEnabled && !hud.cutscene && (
            <MobileTouchControls
              isCrouching={hud.isCrouching}
              isSprinting={hud.isSprinting}
              onMoveVector={(f, r) => worldRef.current?.setVirtualMove(f, r)}
              onToggleCrouch={() => worldRef.current?.setVirtualCrouch(!hud.isCrouching)}
              onSprintChange={(s) => worldRef.current?.setVirtualSprint(s)}
              onTogglePerspective={() => worldRef.current?.togglePerspective()}
            />
          )}
        </>
      )}

      {/* Ghost-Specific Jumpscare Visual Overlay */}
      <JumpscareOverlay event={jumpscare} />

      {/* Jurnal Mitos vs Fakta (Gameplay) */}
      {journalOpen && (
        <JournalModal
          rumors={rumors}
          currentFloor={hud.floor}
          raniRescued={hud.raniRescued}
          onDebunk={(rumorId) => {
            worldRef.current?.tryDebunkRumor(rumorId);
          }}
          onClose={() => {
            setJournalOpen(false);
            if (mpRoom) worldRef.current?.setInputSuspended(false);
            else worldRef.current?.setPhase('playing');
          }}
        />
      )}

      {/* Jurnal/Arsip dari Menu Utama */}
      {journalArchiveOpen && (
        <JournalModal
          rumors={INITIAL_RUMORS}
          currentFloor="outside"
          raniRescued={false}
          archiveMode
          onDebunk={() => {}}
          onClose={() => setJournalArchiveOpen(false)}
        />
      )}

      {/* Dialog NPC (Satpam, Ceu Titin & Pedagang) */}
      {activeNpcId && (
        <NpcDialogModal
          npcId={activeNpcId}
          onPlayVoice={(voiceId, lineIdx, lineText) => {
            worldRef.current?.speakNpcDialogueLine(activeNpcId, lineText, voiceId, lineIdx);
          }}
          onClose={() => {
            worldRef.current?.stopDialogueSpeech();
            setActiveNpcId(null);
            if (mpRoom) worldRef.current?.setInputSuspended(false);
            else worldRef.current?.setPhase('playing');
          }}
        />
      )}

      {/* Puzzle Menara Radio Rooftop */}
      {radioOpen && (
        <RadioPuzzleModal
          alreadyRescued={hud.raniRescued}
          onSuccess={() => worldRef.current?.completeRadioPuzzle()}
          onClose={() => {
            setRadioOpen(false);
            if (mpRoom) worldRef.current?.setInputSuspended(false);
            else worldRef.current?.setPhase('playing');
          }}
        />
      )}

      {/* Peta Interaktif Komplek Sukajadi & Rumah Gurita */}
      {mapOpen && mapSnapshot && (
        <MapModal
          snapshot={mapSnapshot}
          waypoint={waypoint}
          onRefreshSnapshot={() => worldRef.current?.getMapSnapshot() ?? null}
          onSetWaypoint={(wp) => {
            setWaypoint(wp);
            if (wp) showToast(`Pin kompas dipasang: ${wp.label}`, 'info');
          }}
          onClose={() => {
            setMapOpen(false);
            if (mpRoom) worldRef.current?.setInputSuspended(false);
            else worldRef.current?.setPhase('playing');
          }}
        />
      )}

      {/* Pengaturan dari Menu Utama */}
      {settingsMenuOpen && (
        <SettingsModal
          quality={quality}
          onChangeQuality={(q) => {
            setQuality(q);
            worldRef.current?.setQuality(q);
          }}
          audioSettings={audioSettings}
          onChangeAudioSettings={handleAudioSettingsChange}
          visualSettings={visualSettings}
          onChangeVisualSettings={handleVisualSettingsChange}
          touchControlsEnabled={touchControlsEnabled}
          onToggleTouchControls={() => setTouchControlsEnabled((v) => !v)}
          onClose={() => setSettingsMenuOpen(false)}
        />
      )}

      {/* Pause Modal */}
      {phase === 'paused' && !anyGameplayModalOpen && (
        <PauseModal
          isMultiplayer={Boolean(mpRoom)}
          quality={quality}
          onChangeQuality={(q) => {
            setQuality(q);
            worldRef.current?.setQuality(q);
          }}
          audioSettings={audioSettings}
          onChangeAudioSettings={handleAudioSettingsChange}
          visualSettings={visualSettings}
          onChangeVisualSettings={handleVisualSettingsChange}
          touchControlsEnabled={touchControlsEnabled}
          onToggleTouchControls={() => setTouchControlsEnabled((v) => !v)}
          onResume={handleResume}
          onRestart={startSoloGame}
          onReturnToLobby={
            mpRoom && isMultiplayerHost
              ? () => {
                  lobbyClient.returnToLobby(mpRoom.code, guestProfile.guestId);
                }
              : undefined
          }
          onExitTitle={handleExitTitle}
        />
      )}

      {/* Game Over / Ending Modal */}
      {phase === 'gameover' && runSummary && (
        <GameOverModal
          summary={runSummary}
          isMultiplayer={Boolean(mpRoom)}
          isHost={isMultiplayerHost}
          onPlayAgain={startSoloGame}
          onReturnToLobby={
            mpRoom && isMultiplayerHost
              ? () => {
                  lobbyClient.returnToLobby(mpRoom.code, guestProfile.guestId);
                }
              : undefined
          }
          onExitTitle={handleExitTitle}
        />
      )}

      {/* Credits & Ethics Disclaimer Modal */}
      {creditsOpen && <CreditsModal onClose={() => setCreditsOpen(false)} />}

      {/* 3 Varied Loading Screens (Boot, Enter World, Return to Menu) */}
      {loadingKind && (
        <LoadingScreen
          kind={loadingKind}
          characterId={selectedCharacter}
          onComplete={handleLoadingComplete}
        />
      )}
    </div>
  );
}
