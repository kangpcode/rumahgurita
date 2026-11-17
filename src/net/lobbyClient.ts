import { io, type Socket } from 'socket.io-client';
import type { CharacterId, FloorId, Vec3 } from '../game/types';
import {
  DEFAULT_COSMETICS,
  GAME_VERSION,
  sanitizeAndValidateNickname,
  type CoopActionEvent,
  type GhostSyncItem,
  type LobbyErrorCode,
  type PlayerCosmetics,
  type PublicRoomSummary,
  type RoomDifficulty,
  type RoomLanguage,
  type RoomRegion,
  type RoomSettings,
  type RoomSnapshot,
  type RtcSignalPayload,
  type SquadSyncPayload,
  type WorldActionBroadcast,
} from '../shared/lobbyProtocol';

const GUEST_ID_KEY = 'rg_guest_id_v1';
const NICKNAME_KEY = 'rg_nickname_v1';
const COSMETICS_KEY = 'rg_cosmetics_v1';

export interface GuestProfile {
  guestId: string;
  nickname: string;
  cosmetics: PlayerCosmetics;
}

export function loadOrCreateGuestProfile(): GuestProfile {
  let guestId = '';
  let nickname = 'Penyelidik';
  let cosmetics: PlayerCosmetics = { ...DEFAULT_COSMETICS };

  try {
    guestId = localStorage.getItem(GUEST_ID_KEY) || '';
    if (!guestId) {
      const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
      guestId = `guest_${Date.now().toString(36)}_${rand}`;
      localStorage.setItem(GUEST_ID_KEY, guestId);
    }

    const savedNick = localStorage.getItem(NICKNAME_KEY);
    if (savedNick) {
      const valid = sanitizeAndValidateNickname(savedNick);
      if (valid.ok) nickname = valid.nickname;
    } else {
      nickname = `Warga_${guestId.slice(-4).toUpperCase()}`;
      localStorage.setItem(NICKNAME_KEY, nickname);
    }

    const savedCosm = localStorage.getItem(COSMETICS_KEY);
    if (savedCosm) {
      const parsed = JSON.parse(savedCosm) as Partial<PlayerCosmetics>;
      cosmetics = {
        bagColor: parsed.bagColor ?? DEFAULT_COSMETICS.bagColor,
        accessory: parsed.accessory ?? DEFAULT_COSMETICS.accessory,
      };
    }
  } catch {
    if (!guestId) guestId = `guest_${Math.random().toString(36).slice(2, 10)}`;
  }

  return { guestId, nickname, cosmetics };
}

export function saveNickname(nickname: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    // ignore
  }
}

export function saveCosmetics(cosmetics: PlayerCosmetics): void {
  try {
    localStorage.setItem(COSMETICS_KEY, JSON.stringify(cosmetics));
  } catch {
    // ignore
  }
}

export interface LobbyClientEvents {
  onConnectionChange?: (connected: boolean) => void;
  onRoomState?: (room: RoomSnapshot) => void;
  onError?: (err: { code: LobbyErrorCode; message: string }) => void;
  onKicked?: (err: { code: LobbyErrorCode; message: string }) => void;
  onSquadSync?: (squad: SquadSyncPayload[]) => void;
  onWorldEvent?: (ev: WorldActionBroadcast) => void;
  onGhostSync?: (ghosts: GhostSyncItem[]) => void;
  onRtcSignal?: (sig: RtcSignalPayload) => void;
}

export class LobbyClient {
  private socket: Socket | null = null;
  private events: LobbyClientEvents = {};
  private pingTimer: number | null = null;
  private lastPingMs = 20;
  private activeGuestId = '';

  public setEvents(events: LobbyClientEvents) {
    this.events = events;
  }

  public connect(guestId: string): Socket {
    this.activeGuestId = guestId;
    if (this.socket && this.socket.connected) {
      return this.socket;
    }
    if (!this.socket) {
      this.socket = io({
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
      });

      this.socket.on('connect', () => {
        this.events.onConnectionChange?.(true);
        this.measurePing();
      });

      this.socket.on('disconnect', () => {
        this.events.onConnectionChange?.(false);
      });

      this.socket.on('room:state', (snap: RoomSnapshot) => {
        this.events.onRoomState?.(snap);
      });

      this.socket.on('room:error', (err: { code: LobbyErrorCode; message: string }) => {
        this.events.onError?.(err);
      });

      this.socket.on('room:kicked', (err: { code: LobbyErrorCode; message: string }) => {
        this.events.onKicked?.(err);
      });

      this.socket.on('player:positions', (squad: SquadSyncPayload[]) => {
        this.events.onSquadSync?.(squad);
      });

      this.socket.on('world:event', (ev: WorldActionBroadcast) => {
        this.events.onWorldEvent?.(ev);
      });

      this.socket.on('ghost:positions', (ghosts: GhostSyncItem[]) => {
        this.events.onGhostSync?.(ghosts);
      });

      this.socket.on('rtc:signal', (sig: RtcSignalPayload) => {
        this.events.onRtcSignal?.(sig);
      });

      this.pingTimer = window.setInterval(() => {
        this.measurePing();
      }, 4000);
    } else {
      this.socket.connect();
    }
    return this.socket;
  }

  private measurePing() {
    if (!this.socket || !this.socket.connected) return;
    const start = performance.now();
    this.socket.emit('ping:probe', start, () => {
      this.lastPingMs = Math.max(1, Math.round(performance.now() - start));
      if (this.activeGuestId) {
        this.socket?.emit('ping:report', {
          guestId: this.activeGuestId,
          pingMs: this.lastPingMs,
        });
      }
    });
  }

  public getLastPing(): number {
    return this.lastPingMs;
  }

  public async fetchPublicRooms(filter: {
    search?: string;
    difficulty?: RoomDifficulty | 'any';
    language?: RoomLanguage | 'any';
    region?: RoomRegion | 'any';
    hideFull?: boolean;
  }): Promise<PublicRoomSummary[]> {
    const params = new URLSearchParams();
    if (filter.search) params.set('search', filter.search);
    if (filter.difficulty && filter.difficulty !== 'any') params.set('difficulty', filter.difficulty);
    if (filter.language && filter.language !== 'any') params.set('language', filter.language);
    if (filter.region && filter.region !== 'any') params.set('region', filter.region);
    if (filter.hideFull) params.set('hideFull', 'true');

    const res = await fetch(`/api/rooms?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { rooms?: PublicRoomSummary[] };
    return data.rooms ?? [];
  }

  public createRoom(payload: {
    guestId: string;
    nickname: string;
    preferredCharacter?: CharacterId;
    cosmetics?: PlayerCosmetics;
    roomName: string;
    isPublic: boolean;
    password?: string;
    maxPlayers: number;
    difficulty: RoomDifficulty;
    voiceChat: boolean;
    allowLateJoin: boolean;
    language: RoomLanguage;
    region: RoomRegion;
  }): Promise<{ ok: boolean; room?: RoomSnapshot; message?: string }> {
    const s = this.connect(payload.guestId);
    return new Promise((resolve) => {
      s.emit('room:create', { ...payload, clientVersion: GAME_VERSION }, resolve);
    });
  }

  public joinRoom(payload: {
    code: string;
    guestId: string;
    nickname: string;
    password?: string;
    preferredCharacter?: CharacterId;
    cosmetics?: PlayerCosmetics;
  }): Promise<{ ok: boolean; room?: RoomSnapshot; code?: LobbyErrorCode; message?: string }> {
    const s = this.connect(payload.guestId);
    return new Promise((resolve) => {
      s.emit('room:join', { ...payload, clientVersion: GAME_VERSION }, resolve);
    });
  }

  public quickPlay(payload: {
    guestId: string;
    nickname: string;
    preferredCharacter?: CharacterId;
    cosmetics?: PlayerCosmetics;
    language?: RoomLanguage | 'any';
    region?: RoomRegion | 'any';
    difficulty?: RoomDifficulty | 'any';
  }): Promise<{ ok: boolean; room?: RoomSnapshot; message?: string }> {
    const s = this.connect(payload.guestId);
    return new Promise((resolve) => {
      s.emit('room:quickplay', { ...payload, clientVersion: GAME_VERSION }, resolve);
    });
  }

  public leaveRoom(guestId: string) {
    this.socket?.emit('room:leave', { guestId });
  }

  public toggleReady(code: string, guestId: string, ready?: boolean) {
    this.socket?.emit('room:ready', { code, guestId, ready });
  }

  public selectCharacter(code: string, guestId: string, characterId: CharacterId) {
    this.socket?.emit('room:character', { code, guestId, characterId });
  }

  public selectCosmetics(code: string, guestId: string, cosmetics: PlayerCosmetics) {
    this.socket?.emit('room:cosmetics', { code, guestId, cosmetics });
  }

  public toggleMic(code: string, guestId: string, micOn?: boolean) {
    this.socket?.emit('room:mic', { code, guestId, micOn });
  }

  public sendChat(code: string, guestId: string, text: string) {
    this.socket?.emit('room:chat', { code, guestId, text });
  }

  public updateSettings(
    code: string,
    guestId: string,
    patch: Partial<Omit<RoomSettings, 'friendlyFire' | 'hasPassword'>> & { password?: string }
  ) {
    this.socket?.emit('room:settings', { code, guestId, patch });
  }

  public kickPlayer(code: string, guestId: string, targetGuestId: string) {
    this.socket?.emit('room:kick', { code, guestId, targetGuestId });
  }

  public startMatch(code: string, guestId: string, withBots = false, botCount?: number) {
    this.socket?.emit('room:start', { code, guestId, withBots, botCount });
  }

  public keepWaiting(code: string) {
    this.socket?.emit('room:keepWaiting', { code });
  }

  public requestCheckpointSpawn(code: string, guestId: string) {
    this.socket?.emit('room:checkpointSpawn', { code, guestId });
  }

  public endMatch(
    code: string,
    summary: {
      outcome: 'victory' | 'defeat';
      title: string;
      subtitle: string;
      durationSec: number;
    }
  ) {
    this.socket?.emit('room:end', { code, summary });
  }

  public returnToLobby(code: string, guestId: string) {
    this.socket?.emit('room:returnLobby', { code, guestId });
  }

  public sendWorldAction(code: string, guestId: string, action: CoopActionEvent) {
    if (!this.socket?.connected) return;
    this.socket.emit('world:action', { code, guestId, action });
  }

  public sendGhostSync(code: string, guestId: string, ghosts: GhostSyncItem[]) {
    if (!this.socket?.connected) return;
    this.socket.emit('ghost:sync', { code, guestId, ghosts });
  }

  public sendRtcSignal(signal: RtcSignalPayload) {
    if (!this.socket?.connected) return;
    this.socket.emit('rtc:signal', signal);
  }

  public sendPlayerSync(payload: {
    code: string;
    guestId: string;
    position: Vec3;
    yaw: number;
    floor: FloorId;
    sanity: number;
    flashlightOn?: boolean;
    isCrouching?: boolean;
    downed?: boolean;
  }) {
    if (!this.socket?.connected) return;
    this.socket.emit('player:sync', payload);
  }

  public dispose() {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.socket?.disconnect();
    this.socket = null;
  }
}
