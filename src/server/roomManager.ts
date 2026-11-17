import type { CharacterId, FloorId, Vec3 } from '../game/types';
import {
  ALL_CHARACTER_IDS,
  DEFAULT_COSMETICS,
  GAME_VERSION,
  LOADING_TRANSITION_MS,
  QUICK_PLAY_BOT_OFFER_MS,
  RECONNECT_GRACE_MS,
  createInitialRoomWorldState,
  generateRoomCode,
  normalizeRoomCode,
  sanitizeAndValidateNickname,
  sanitizeChatText,
  sanitizeRoomName,
  type CoopActionEvent,
  type LobbyChatMessage,
  type LobbyErrorCode,
  type LobbyPlayer,
  type PlayerCosmetics,
  type PublicRoomSummary,
  type RoomDifficulty,
  type RoomLanguage,
  type RoomRegion,
  type RoomSettings,
  type RoomSnapshot,
  type RoomWorldState,
  type WorldActionBroadcast,
} from '../shared/lobbyProtocol.ts';

export interface RoomRecord {
  code: string;
  phase: RoomSnapshot['phase'];
  settings: RoomSettings;
  passwordPlain: string;
  players: LobbyPlayer[];
  chat: LobbyChatMessage[];
  world: RoomWorldState;
  createdAt: number;
  nextJoinOrder: number;
  isQuickPlay: boolean;
  quickPlayWaitingSince: number | null;
  quickPlayOfferBots: boolean;
  loadingStartedAt: number | null;
  lastSummary: RoomSnapshot['lastSummary'];
}

export type ManagerResult<T = RoomSnapshot> =
  | { ok: true; data: T }
  | { ok: false; code: LobbyErrorCode; message?: string };

export interface CreateRoomInput {
  guestId: string;
  nickname: string;
  clientVersion: string;
  preferredCharacter?: CharacterId;
  cosmetics?: PlayerCosmetics;
  roomName?: string;
  isPublic?: boolean;
  password?: string;
  maxPlayers?: number;
  difficulty?: RoomDifficulty;
  voiceChat?: boolean;
  allowLateJoin?: boolean;
  language?: RoomLanguage;
  region?: RoomRegion;
  isQuickPlay?: boolean;
  now?: number;
}

export interface JoinRoomInput {
  code: string;
  guestId: string;
  nickname: string;
  clientVersion: string;
  password?: string;
  preferredCharacter?: CharacterId;
  cosmetics?: PlayerCosmetics;
  now?: number;
}

export interface QuickPlayInput {
  guestId: string;
  nickname: string;
  clientVersion: string;
  preferredCharacter?: CharacterId;
  cosmetics?: PlayerCosmetics;
  language?: RoomLanguage | 'any';
  region?: RoomRegion | 'any';
  difficulty?: RoomDifficulty | 'any';
  now?: number;
}

export interface ListRoomsFilter {
  search?: string;
  difficulty?: RoomDifficulty | 'any';
  language?: RoomLanguage | 'any';
  region?: RoomRegion | 'any';
  hideFull?: boolean;
}

const DEFAULT_SPAWN: Vec3 = { x: -2.4, y: 0, z: 53.2 };

export class RoomManager {
  private rooms = new Map<string, RoomRecord>();
  private playerToRoom = new Map<string, string>();
  private chatSeq = 1;

  public getRoomSnapshot(code: string): RoomSnapshot | null {
    const rec = this.rooms.get(normalizeRoomCode(code));
    return rec ? this.toSnapshot(rec) : null;
  }

  public getRoomCodeForPlayer(guestId: string): string | null {
    return this.playerToRoom.get(guestId) ?? null;
  }

  private cloneWorld(w: RoomWorldState): RoomWorldState {
    return {
      openDoors: { ...w.openDoors },
      unlockedDoors: [...w.unlockedDoors],
      collectedItemIds: [...w.collectedItemIds],
      collectedKeyIds: [...w.collectedKeyIds],
      collectedKeyLabels: [...w.collectedKeyLabels],
      discoveredRumorIds: [...w.discoveredRumorIds],
      discoveredFactIds: [...w.discoveredFactIds],
      debunkedRumorIds: [...w.debunkedRumorIds],
      brokenWalls: [...w.brokenWalls],
      raniRescued: w.raniRescued,
      kujangClaimed: w.kujangClaimed,
      inDimensiGaib: w.inDimensiGaib,
      lastSaltAt: w.lastSaltAt,
      lastSaltBy: w.lastSaltBy,
    };
  }

  private toSnapshot(rec: RoomRecord): RoomSnapshot {
    return {
      code: rec.code,
      phase: rec.phase,
      settings: { ...rec.settings },
      players: rec.players.map((p) => ({
        ...p,
        cosmetics: { ...p.cosmetics },
        position: { ...p.position },
      })),
      chat: rec.chat.map((c) => ({ ...c })),
      world: this.cloneWorld(rec.world),
      createdAt: rec.createdAt,
      isQuickPlay: rec.isQuickPlay,
      quickPlayWaitingSince: rec.quickPlayWaitingSince,
      quickPlayOfferBots: rec.quickPlayOfferBots,
      loadingStartedAt: rec.loadingStartedAt,
      lastSummary: rec.lastSummary ? { ...rec.lastSummary } : null,
    };
  }

  private pushSystemChat(rec: RoomRecord, text: string, now: number): void {
    rec.chat.push({
      id: `sys-${this.chatSeq++}`,
      senderId: 'system',
      senderName: 'Sistem',
      text,
      timestamp: now,
      system: true,
    });
    if (rec.chat.length > 60) {
      rec.chat.splice(0, rec.chat.length - 60);
    }
  }

  private pickAvailableCharacter(rec: RoomRecord, preferred?: CharacterId): CharacterId {
    const used = new Set(rec.players.map((p) => p.characterId));
    if (preferred && !used.has(preferred)) {
      return preferred;
    }
    const free = ALL_CHARACTER_IDS.find((id) => !used.has(id));
    return free ?? ALL_CHARACTER_IDS[0];
  }

  private updateQuickPlayTimer(rec: RoomRecord, now: number): void {
    const connectedHumans = rec.players.filter((p) => !p.isBot && p.connected);
    if (rec.phase !== 'LOBBY' || !rec.isQuickPlay) {
      rec.quickPlayWaitingSince = null;
      rec.quickPlayOfferBots = false;
      return;
    }
    if (connectedHumans.length >= 2) {
      rec.quickPlayWaitingSince = null;
      rec.quickPlayOfferBots = false;
    } else if (rec.quickPlayWaitingSince === null) {
      rec.quickPlayWaitingSince = now;
      rec.quickPlayOfferBots = false;
    }
  }

  public createRoom(input: CreateRoomInput): ManagerResult {
    const now = input.now ?? Date.now();
    if (input.clientVersion !== GAME_VERSION) {
      return { ok: false, code: 'version_mismatch' };
    }
    const nickRes = sanitizeAndValidateNickname(input.nickname);
    if (!nickRes.ok) {
      return { ok: false, code: 'invalid_nickname', message: nickRes.reason };
    }

    // Leave any existing room first
    if (this.playerToRoom.has(input.guestId)) {
      this.leaveRoom(input.guestId, now);
    }

    const existingCodes = new Set(this.rooms.keys());
    const code = generateRoomCode(existingCodes);
    const maxPlayers = Math.max(2, Math.min(5, Math.round(input.maxPlayers ?? 4)));
    const passwordPlain = (input.password ?? '').trim().slice(0, 24);
    const isPublic = input.isPublic ?? true;

    const settings: RoomSettings = {
      roomName: sanitizeRoomName(input.roomName ?? `Room ${nickRes.nickname}`),
      isPublic,
      hasPassword: passwordPlain.length > 0,
      maxPlayers,
      difficulty: input.difficulty ?? 'Normal',
      voiceChat: input.voiceChat ?? true,
      friendlyFire: false,
      allowLateJoin: input.allowLateJoin ?? true,
      language: input.language ?? 'id',
      region: input.region ?? 'Asia-ID',
    };

    const host: LobbyPlayer = {
      guestId: input.guestId,
      nickname: nickRes.nickname,
      isHost: true,
      isReady: true,
      isBot: false,
      characterId: input.preferredCharacter ?? 'raka',
      cosmetics: input.cosmetics ? { ...input.cosmetics } : { ...DEFAULT_COSMETICS },
      pingMs: 18,
      micOn: settings.voiceChat,
      connected: true,
      disconnectedAt: null,
      reconnectDeadline: null,
      joinOrder: 1,
      role: 'player',
      position: { ...DEFAULT_SPAWN },
      yaw: 0.42,
      floor: 'outside',
      sanity: 100,
      flashlightOn: true,
      isCrouching: false,
      downed: false,
    };

    const rec: RoomRecord = {
      code,
      phase: 'LOBBY',
      settings,
      passwordPlain,
      players: [host],
      chat: [],
      world: createInitialRoomWorldState(),
      createdAt: now,
      nextJoinOrder: 2,
      isQuickPlay: Boolean(input.isQuickPlay),
      quickPlayWaitingSince: input.isQuickPlay ? now : null,
      quickPlayOfferBots: false,
      loadingStartedAt: null,
      lastSummary: null,
    };

    this.pushSystemChat(rec, `${host.nickname} membuat room ${code}.`, now);
    this.rooms.set(code, rec);
    this.playerToRoom.set(host.guestId, code);

    return { ok: true, data: this.toSnapshot(rec) };
  }

  public joinRoom(input: JoinRoomInput): ManagerResult {
    const now = input.now ?? Date.now();
    if (input.clientVersion !== GAME_VERSION) {
      return { ok: false, code: 'version_mismatch' };
    }
    const nickRes = sanitizeAndValidateNickname(input.nickname);
    if (!nickRes.ok) {
      return { ok: false, code: 'invalid_nickname', message: nickRes.reason };
    }

    const code = normalizeRoomCode(input.code);
    const rec = this.rooms.get(code);
    if (!rec) {
      return { ok: false, code: 'not_found' };
    }

    // Check 60s Reconnect slot reclamation for same guestId
    const existingSlot = rec.players.find((p) => p.guestId === input.guestId);
    if (existingSlot) {
      existingSlot.connected = true;
      existingSlot.disconnectedAt = null;
      existingSlot.reconnectDeadline = null;
      existingSlot.nickname = nickRes.nickname;
      this.playerToRoom.set(input.guestId, code);
      this.updateQuickPlayTimer(rec, now);
      this.pushSystemChat(rec, `${existingSlot.nickname} terhubung kembali ke room.`, now);
      return { ok: true, data: this.toSnapshot(rec) };
    }

    // Check password
    if (rec.settings.hasPassword && (input.password ?? '').trim() !== rec.passwordPlain) {
      return { ok: false, code: 'wrong_password' };
    }

    // Check already started
    if (rec.phase !== 'LOBBY' && !rec.settings.allowLateJoin) {
      return { ok: false, code: 'already_started' };
    }

    // Remove bots if a real human needs space and room is still in LOBBY
    if (rec.players.length >= rec.settings.maxPlayers && rec.phase === 'LOBBY') {
      const botIdx = rec.players.findIndex((p) => p.isBot);
      if (botIdx !== -1) {
        rec.players.splice(botIdx, 1);
      }
    }

    if (rec.players.length >= rec.settings.maxPlayers) {
      return { ok: false, code: 'room_full' };
    }

    // Leave any other room first
    const oldCode = this.playerToRoom.get(input.guestId);
    if (oldCode && oldCode !== code) {
      this.leaveRoom(input.guestId, now);
    }

    const role: LobbyPlayer['role'] = rec.phase === 'LOBBY' ? 'player' : 'spectator';
    const assignedChar = this.pickAvailableCharacter(rec, input.preferredCharacter);

    const player: LobbyPlayer = {
      guestId: input.guestId,
      nickname: nickRes.nickname,
      isHost: false,
      isReady: rec.phase !== 'LOBBY',
      isBot: false,
      characterId: assignedChar,
      cosmetics: input.cosmetics ? { ...input.cosmetics } : { ...DEFAULT_COSMETICS },
      pingMs: 24,
      micOn: rec.settings.voiceChat,
      connected: true,
      disconnectedAt: null,
      reconnectDeadline: null,
      joinOrder: rec.nextJoinOrder++,
      role,
      position: { ...DEFAULT_SPAWN },
      yaw: 0.42,
      floor: 'outside',
      sanity: 100,
      flashlightOn: true,
      isCrouching: false,
      downed: false,
    };

    rec.players.push(player);
    this.playerToRoom.set(player.guestId, code);
    this.updateQuickPlayTimer(rec, now);
    this.pushSystemChat(
      rec,
      role === 'spectator'
        ? `${player.nickname} bergabung sebagai Penonton (Late Join).`
        : `${player.nickname} bergabung ke lobby.`,
      now
    );

    return { ok: true, data: this.toSnapshot(rec) };
  }

  public quickPlay(input: QuickPlayInput): ManagerResult {
    const now = input.now ?? Date.now();
    if (input.clientVersion !== GAME_VERSION) {
      return { ok: false, code: 'version_mismatch' };
    }
    const nickRes = sanitizeAndValidateNickname(input.nickname);
    if (!nickRes.ok) {
      return { ok: false, code: 'invalid_nickname', message: nickRes.reason };
    }

    for (const rec of this.rooms.values()) {
      if (!rec.settings.isPublic || rec.settings.hasPassword || rec.phase !== 'LOBBY') continue;
      if (rec.players.some((p) => p.guestId === input.guestId)) continue;
      const nonBotCount = rec.players.filter((p) => !p.isBot).length;
      if (nonBotCount >= rec.settings.maxPlayers) continue;
      if (input.language && input.language !== 'any' && rec.settings.language !== input.language) continue;
      if (input.region && input.region !== 'any' && rec.settings.region !== input.region) continue;
      if (input.difficulty && input.difficulty !== 'any' && rec.settings.difficulty !== input.difficulty) continue;

      return this.joinRoom({
        code: rec.code,
        guestId: input.guestId,
        nickname: nickRes.nickname,
        clientVersion: input.clientVersion,
        preferredCharacter: input.preferredCharacter,
        cosmetics: input.cosmetics,
        now,
      });
    }

    return this.createRoom({
      guestId: input.guestId,
      nickname: nickRes.nickname,
      clientVersion: input.clientVersion,
      preferredCharacter: input.preferredCharacter,
      cosmetics: input.cosmetics,
      roomName: `Main Cepat · ${nickRes.nickname}`,
      isPublic: true,
      maxPlayers: 4,
      difficulty: input.difficulty && input.difficulty !== 'any' ? input.difficulty : 'Normal',
      language: input.language && input.language !== 'any' ? input.language : 'id',
      region: input.region && input.region !== 'any' ? input.region : 'Asia-ID',
      isQuickPlay: true,
      now,
    });
  }

  public listPublicRooms(filter: ListRoomsFilter = {}): PublicRoomSummary[] {
    const q = (filter.search ?? '').trim().toLowerCase();
    const out: PublicRoomSummary[] = [];

    for (const rec of this.rooms.values()) {
      if (!rec.settings.isPublic) continue;
      if (filter.difficulty && filter.difficulty !== 'any' && rec.settings.difficulty !== filter.difficulty) {
        continue;
      }
      if (filter.language && filter.language !== 'any' && rec.settings.language !== filter.language) {
        continue;
      }
      if (filter.region && filter.region !== 'any' && rec.settings.region !== filter.region) {
        continue;
      }
      if (filter.hideFull && rec.players.length >= rec.settings.maxPlayers) {
        continue;
      }
      const host = rec.players.find((p) => p.isHost) ?? rec.players[0];
      const hostName = host?.nickname ?? 'Host';
      if (
        q &&
        !rec.settings.roomName.toLowerCase().includes(q) &&
        !hostName.toLowerCase().includes(q) &&
        !rec.code.toLowerCase().includes(q)
      ) {
        continue;
      }

      out.push({
        code: rec.code,
        roomName: rec.settings.roomName,
        hostName,
        playerCount: rec.players.length,
        maxPlayers: rec.settings.maxPlayers,
        difficulty: rec.settings.difficulty,
        language: rec.settings.language,
        region: rec.settings.region,
        phase: rec.phase,
        hasPassword: rec.settings.hasPassword,
        allowLateJoin: rec.settings.allowLateJoin,
        pingMs: host?.pingMs ?? 22,
      });
    }

    return out.sort((a, b) => (a.phase === 'LOBBY' && b.phase !== 'LOBBY' ? -1 : 1));
  }

  public selectCharacter(code: string, guestId: string, characterId: CharacterId): ManagerResult {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return { ok: false, code: 'not_found' };
    const player = rec.players.find((p) => p.guestId === guestId);
    if (!player) return { ok: false, code: 'not_found' };

    const takenByOther = rec.players.some(
      (p) => p.guestId !== guestId && p.characterId === characterId
    );
    if (takenByOther) {
      return { ok: false, code: 'character_taken' };
    }

    player.characterId = characterId;
    return { ok: true, data: this.toSnapshot(rec) };
  }

  public selectCosmetics(code: string, guestId: string, cosmetics: PlayerCosmetics): ManagerResult {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return { ok: false, code: 'not_found' };
    const player = rec.players.find((p) => p.guestId === guestId);
    if (!player) return { ok: false, code: 'not_found' };

    player.cosmetics = { ...cosmetics };
    return { ok: true, data: this.toSnapshot(rec) };
  }

  public toggleReady(code: string, guestId: string, nextReady?: boolean): ManagerResult {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return { ok: false, code: 'not_found' };
    const player = rec.players.find((p) => p.guestId === guestId);
    if (!player) return { ok: false, code: 'not_found' };

    player.isReady = nextReady !== undefined ? nextReady : !player.isReady;
    return { ok: true, data: this.toSnapshot(rec) };
  }

  public toggleMic(code: string, guestId: string, nextMic?: boolean): ManagerResult {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return { ok: false, code: 'not_found' };
    const player = rec.players.find((p) => p.guestId === guestId);
    if (!player) return { ok: false, code: 'not_found' };

    player.micOn = nextMic !== undefined ? nextMic : !player.micOn;
    return { ok: true, data: this.toSnapshot(rec) };
  }

  public updatePing(guestId: string, pingMs: number): void {
    const code = this.playerToRoom.get(guestId);
    if (!code) return;
    const rec = this.rooms.get(code);
    const p = rec?.players.find((pl) => pl.guestId === guestId);
    if (p) {
      p.pingMs = Math.max(1, Math.min(999, Math.round(pingMs)));
    }
  }

  public sendChat(code: string, guestId: string, text: string, now = Date.now()): ManagerResult {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return { ok: false, code: 'not_found' };
    const player = rec.players.find((p) => p.guestId === guestId);
    if (!player) return { ok: false, code: 'not_found' };

    const clean = sanitizeChatText(text);
    if (!clean) return { ok: true, data: this.toSnapshot(rec) };

    rec.chat.push({
      id: `msg-${this.chatSeq++}`,
      senderId: player.guestId,
      senderName: player.nickname,
      text: clean,
      timestamp: now,
    });
    if (rec.chat.length > 60) {
      rec.chat.splice(0, rec.chat.length - 60);
    }
    return { ok: true, data: this.toSnapshot(rec) };
  }

  public updateSettings(
    code: string,
    hostGuestId: string,
    patch: Partial<Omit<RoomSettings, 'friendlyFire' | 'hasPassword'>> & { password?: string },
    now = Date.now()
  ): ManagerResult {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return { ok: false, code: 'not_found' };
    const actor = rec.players.find((p) => p.guestId === hostGuestId);
    if (!actor || !actor.isHost) return { ok: false, code: 'unauthorized' };

    if (patch.roomName !== undefined) {
      rec.settings.roomName = sanitizeRoomName(patch.roomName);
    }
    if (patch.isPublic !== undefined) rec.settings.isPublic = patch.isPublic;
    if (patch.maxPlayers !== undefined) {
      rec.settings.maxPlayers = Math.max(
        Math.max(2, rec.players.length),
        Math.min(5, Math.round(patch.maxPlayers))
      );
    }
    if (patch.difficulty !== undefined) rec.settings.difficulty = patch.difficulty;
    if (patch.voiceChat !== undefined) rec.settings.voiceChat = patch.voiceChat;
    if (patch.allowLateJoin !== undefined) rec.settings.allowLateJoin = patch.allowLateJoin;
    if (patch.language !== undefined) rec.settings.language = patch.language;
    if (patch.region !== undefined) rec.settings.region = patch.region;
    if (patch.password !== undefined) {
      rec.passwordPlain = patch.password.trim().slice(0, 24);
      rec.settings.hasPassword = rec.passwordPlain.length > 0;
    }
    rec.settings.friendlyFire = false;
    this.pushSystemChat(rec, `${actor.nickname} memperbarui pengaturan room.`, now);
    return { ok: true, data: this.toSnapshot(rec) };
  }

  public kickPlayer(
    code: string,
    hostGuestId: string,
    targetGuestId: string,
    now = Date.now()
  ): ManagerResult<{ snapshot: RoomSnapshot; kickedGuestId: string }> {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return { ok: false, code: 'not_found' };
    const host = rec.players.find((p) => p.guestId === hostGuestId);
    if (!host || !host.isHost) return { ok: false, code: 'unauthorized' };
    if (hostGuestId === targetGuestId) return { ok: false, code: 'unauthorized' };

    const idx = rec.players.findIndex((p) => p.guestId === targetGuestId);
    if (idx === -1) return { ok: false, code: 'not_found' };
    const [removed] = rec.players.splice(idx, 1);
    this.playerToRoom.delete(targetGuestId);
    this.updateQuickPlayTimer(rec, now);
    this.pushSystemChat(rec, `${removed.nickname} dikeluarkan oleh Host.`, now);

    return { ok: true, data: { snapshot: this.toSnapshot(rec), kickedGuestId: targetGuestId } };
  }

  public startMatch(
    code: string,
    hostGuestId: string,
    opts: { withBots?: boolean; botCount?: number; now?: number } = {}
  ): ManagerResult {
    const now = opts.now ?? Date.now();
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return { ok: false, code: 'not_found' };
    const host = rec.players.find((p) => p.guestId === hostGuestId);
    if (!host || !host.isHost) return { ok: false, code: 'unauthorized' };

    if (opts.withBots) {
      const targetBots = opts.botCount ?? Math.max(1, 2 - rec.players.length);
      for (let i = 0; i < targetBots && rec.players.length < rec.settings.maxPlayers; i++) {
        const charId = this.pickAvailableCharacter(rec);
        const charLabel = charId.charAt(0).toUpperCase() + charId.slice(1);
        rec.players.push({
          guestId: `bot_${rec.code}_${rec.nextJoinOrder}`,
          nickname: `AI ${charLabel}`,
          isHost: false,
          isReady: true,
          isBot: true,
          characterId: charId,
          cosmetics: { ...DEFAULT_COSMETICS },
          pingMs: 0,
          micOn: false,
          connected: true,
          disconnectedAt: null,
          reconnectDeadline: null,
          joinOrder: rec.nextJoinOrder++,
          role: 'player',
          position: { ...DEFAULT_SPAWN },
          yaw: 0.42,
          floor: 'outside',
          sanity: 100,
          flashlightOn: true,
          isCrouching: false,
          downed: false,
        });
      }
    }

    const activeHumans = rec.players.filter((p) => !p.isBot && p.connected);
    const unreadyOther = activeHumans.some((p) => !p.isHost && !p.isReady);
    if (unreadyOther) {
      return { ok: false, code: 'not_ready' };
    }

    rec.phase = 'LOADING';
    rec.loadingStartedAt = now;
    rec.quickPlayOfferBots = false;
    rec.quickPlayWaitingSince = null;
    rec.lastSummary = null;
    rec.world = createInitialRoomWorldState();
    for (const p of rec.players) {
      p.role = 'player';
      p.position = { ...DEFAULT_SPAWN };
      p.floor = 'outside';
      p.sanity = 100;
      p.flashlightOn = true;
      p.isCrouching = false;
      p.downed = false;
    }
    this.pushSystemChat(rec, 'Ekspedisi dimulai! Memuat kawasan Sukajadi...', now);
    return { ok: true, data: this.toSnapshot(rec) };
  }

  public dismissQuickPlayBotOffer(code: string, now = Date.now()): ManagerResult {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return { ok: false, code: 'not_found' };
    rec.quickPlayOfferBots = false;
    rec.quickPlayWaitingSince = now;
    this.pushSystemChat(rec, 'Host memilih terus menunggu pemain lain.', now);
    return { ok: true, data: this.toSnapshot(rec) };
  }

  public requestCheckpointSpawn(code: string, guestId: string, now = Date.now()): ManagerResult {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return { ok: false, code: 'not_found' };
    const player = rec.players.find((p) => p.guestId === guestId);
    if (!player) return { ok: false, code: 'not_found' };

    player.role = 'player';
    player.position = { ...DEFAULT_SPAWN };
    player.floor = 'outside';
    player.sanity = 100;
    player.flashlightOn = true;
    player.isCrouching = false;
    player.downed = false;
    this.pushSystemChat(rec, `${player.nickname} masuk ke permainan di Checkpoint Sukajadi.`, now);
    return { ok: true, data: this.toSnapshot(rec) };
  }

  public endMatch(
    code: string,
    summary: NonNullable<RoomSnapshot['lastSummary']>,
    now = Date.now()
  ): ManagerResult {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return { ok: false, code: 'not_found' };
    rec.phase = 'ENDED';
    rec.loadingStartedAt = null;
    rec.lastSummary = { ...summary };
    this.pushSystemChat(rec, `Ekspedisi selesai: ${summary.title}`, now);
    return { ok: true, data: this.toSnapshot(rec) };
  }

  public returnToLobby(code: string, hostGuestId: string, now = Date.now()): ManagerResult {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return { ok: false, code: 'not_found' };
    const actor = rec.players.find((p) => p.guestId === hostGuestId);
    if (!actor || !actor.isHost) return { ok: false, code: 'unauthorized' };

    rec.phase = 'LOBBY';
    rec.loadingStartedAt = null;
    rec.lastSummary = null;
    rec.world = createInitialRoomWorldState();
    // Strip temporary AI bots when returning to lobby
    rec.players = rec.players.filter((p) => !p.isBot);
    for (const p of rec.players) {
      p.role = 'player';
      p.isReady = p.isHost;
      p.downed = false;
      p.sanity = 100;
    }
    this.updateQuickPlayTimer(rec, now);
    this.pushSystemChat(rec, 'Room kembali ke Lobby untuk persiapan ronde berikutnya.', now);
    return { ok: true, data: this.toSnapshot(rec) };
  }

  public isHostPlayer(code: string, guestId: string): boolean {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return false;
    return rec.players.some((p) => p.guestId === guestId && p.isHost);
  }

  public areSameRoom(code: string, guestA: string, guestB: string): boolean {
    const norm = normalizeRoomCode(code);
    const rec = this.rooms.get(norm);
    if (!rec) return false;
    return (
      rec.players.some((p) => p.guestId === guestA) &&
      rec.players.some((p) => p.guestId === guestB)
    );
  }

  public applyWorldAction(
    code: string,
    guestId: string,
    action: CoopActionEvent,
    now = Date.now()
  ): ManagerResult<{ snapshot: RoomSnapshot; broadcast: WorldActionBroadcast }> {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return { ok: false, code: 'not_found' };
    const actor = rec.players.find((p) => p.guestId === guestId);
    if (!actor) return { ok: false, code: 'unauthorized' };

    const w = rec.world;
    switch (action.type) {
      case 'door_toggle': {
        w.openDoors[action.doorId] = action.isOpen;
        if (action.unlocked && !w.unlockedDoors.includes(action.doorId)) {
          w.unlockedDoors.push(action.doorId);
        }
        break;
      }
      case 'item_pickup': {
        // Idempotent guard: ignore duplicate pickups across clients
        if (w.collectedItemIds.includes(action.itemId)) {
          return {
            ok: true,
            data: {
              snapshot: this.toSnapshot(rec),
              broadcast: {
                code: rec.code,
                actorGuestId: actor.guestId,
                actorNickname: actor.nickname,
                action,
                world: this.cloneWorld(w),
                timestamp: now,
              },
            },
          };
        }
        w.collectedItemIds.push(action.itemId);
        if (action.kind === 'key' && action.payloadId) {
          if (!w.collectedKeyIds.includes(action.payloadId)) {
            w.collectedKeyIds.push(action.payloadId);
            w.collectedKeyLabels.push(action.label);
            this.pushSystemChat(rec, `${actor.nickname} menemukan ${action.label}.`, now);
          }
        } else if (action.kind === 'evidence' && action.payloadId) {
          if (!w.discoveredRumorIds.includes(action.payloadId)) {
            w.discoveredRumorIds.push(action.payloadId);
          }
          if (!w.discoveredFactIds.includes(action.payloadId)) {
            w.discoveredFactIds.push(action.payloadId);
            this.pushSystemChat(rec, `${actor.nickname} menemukan Bukti Fakta: ${action.label}.`, now);
          }
        }
        break;
      }
      case 'rumor_discover': {
        if (!w.discoveredRumorIds.includes(action.rumorId)) {
          w.discoveredRumorIds.push(action.rumorId);
        }
        break;
      }
      case 'rumor_debunk': {
        if (!w.discoveredFactIds.includes(action.rumorId)) {
          return { ok: false, code: 'unauthorized', message: 'Bukti fakta belum ditemukan.' };
        }
        if (!w.debunkedRumorIds.includes(action.rumorId)) {
          w.debunkedRumorIds.push(action.rumorId);
          this.pushSystemChat(
            rec,
            `${actor.nickname} mematahkan Segel Rumor${action.title ? `: ${action.title}` : ''}! (${w.debunkedRumorIds.length}/6)`,
            now
          );
        }
        break;
      }
      case 'wall_break': {
        if (!w.collectedItemIds.includes(action.itemId)) {
          w.collectedItemIds.push(action.itemId);
        }
        if (!w.brokenWalls.includes(action.wallId)) {
          w.brokenWalls.push(action.wallId);
          this.pushSystemChat(rec, `${actor.nickname} merobohkan Tembok Rapuh!`, now);
        }
        break;
      }
      case 'radio_rescue': {
        if (!w.raniRescued) {
          w.raniRescued = true;
          if (!w.discoveredRumorIds.includes('rumor_gereja')) w.discoveredRumorIds.push('rumor_gereja');
          if (!w.discoveredFactIds.includes('rumor_gereja')) w.discoveredFactIds.push('rumor_gereja');
          this.pushSystemChat(rec, `${actor.nickname} menyelamatkan sinyal Rani di Menara Radio!`, now);
        }
        break;
      }
      case 'salt_stun': {
        w.lastSaltAt = now;
        w.lastSaltBy = actor.nickname;
        break;
      }
      case 'dimensi_enter': {
        if (!w.inDimensiGaib) {
          w.inDimensiGaib = true;
          this.pushSystemChat(rec, `${actor.nickname} memicu masuk ke Dimensi Gaib Sukajadi.`, now);
        }
        break;
      }
      case 'player_downed': {
        if (!actor.downed) {
          actor.downed = true;
          actor.sanity = 0;
          this.pushSystemChat(
            rec,
            `${actor.nickname} TUMBANG! Rekan regu dapat mendekat dan menekan [E] untuk menolong.`,
            now
          );
        }
        const activeHumans = rec.players.filter(
          (p) => !p.isBot && p.connected && p.role === 'player'
        );
        if (activeHumans.length > 0 && activeHumans.every((p) => p.downed)) {
          rec.phase = 'ENDED';
          rec.loadingStartedAt = null;
          rec.lastSummary = {
            outcome: 'defeat',
            title: 'Seluruh Regu Tumbang',
            subtitle: 'Dimensi Gaib menelan seluruh penyelidik sebelum kebenaran dituntaskan.',
            durationSec: 0,
          };
          this.pushSystemChat(rec, 'Seluruh regu tumbang di Dimensi Gaib.', now);
        }
        break;
      }
      case 'player_revive': {
        const target = rec.players.find((p) => p.guestId === action.targetGuestId);
        if (target && target.downed) {
          target.downed = false;
          target.sanity = 45;
          this.pushSystemChat(rec, `${actor.nickname} menolong ${target.nickname}!`, now);
        }
        break;
      }
      case 'kujang_claim': {
        if (!w.kujangClaimed) {
          w.kujangClaimed = true;
          rec.phase = 'ENDED';
          rec.loadingStartedAt = null;
          rec.lastSummary = {
            outcome: 'victory',
            title: action.summaryTitle ?? 'Kebenaran Terungkap',
            subtitle:
              action.summarySubtitle ??
              `${actor.nickname} mengamankan Pusaka Kujang untuk regu Sukajadi.`,
            durationSec: action.durationSec ?? 0,
          };
          this.pushSystemChat(rec, `${actor.nickname} meraih Pusaka Kujang! Ekspedisi selesai.`, now);
        }
        break;
      }
    }

    const snapshot = this.toSnapshot(rec);
    return {
      ok: true,
      data: {
        snapshot,
        broadcast: {
          code: rec.code,
          actorGuestId: actor.guestId,
          actorNickname: actor.nickname,
          action,
          world: this.cloneWorld(w),
          timestamp: now,
        },
      },
    };
  }

  public updatePlayerState(
    code: string,
    guestId: string,
    state: {
      position: Vec3;
      yaw: number;
      floor: FloorId;
      sanity: number;
      flashlightOn?: boolean;
      isCrouching?: boolean;
      downed?: boolean;
    }
  ): RoomRecord | null {
    const rec = this.rooms.get(normalizeRoomCode(code));
    if (!rec) return null;
    const p = rec.players.find((pl) => pl.guestId === guestId);
    if (!p) return null;
    p.position = { ...state.position };
    p.yaw = state.yaw;
    p.floor = state.floor;
    p.sanity = state.sanity;
    if (typeof state.flashlightOn === 'boolean') p.flashlightOn = state.flashlightOn;
    if (typeof state.isCrouching === 'boolean') p.isCrouching = state.isCrouching;
    if (typeof state.downed === 'boolean') p.downed = state.downed;
    return rec;
  }

  private migrateHostIfNeeded(rec: RoomRecord, now: number): boolean {
    const currentHost = rec.players.find((p) => p.isHost && p.connected && !p.isBot);
    if (currentHost) return false;

    const candidates = rec.players
      .filter((p) => p.connected && !p.isBot)
      .sort((a, b) => a.joinOrder - b.joinOrder);

    for (const p of rec.players) p.isHost = false;
    if (candidates.length === 0) return false;

    const nextHost = candidates[0];
    nextHost.isHost = true;
    nextHost.isReady = true;
    this.pushSystemChat(rec, `Host dialihkan ke pemain tertua: ${nextHost.nickname}.`, now);
    return true;
  }

  public handleDisconnect(guestId: string, now = Date.now()): { code: string; snapshot: RoomSnapshot | null } | null {
    const code = this.playerToRoom.get(guestId);
    if (!code) return null;
    const rec = this.rooms.get(code);
    if (!rec) {
      this.playerToRoom.delete(guestId);
      return null;
    }
    const player = rec.players.find((p) => p.guestId === guestId);
    if (!player) return null;

    player.connected = false;
    player.disconnectedAt = now;
    player.reconnectDeadline = now + RECONNECT_GRACE_MS;

    const wasHost = player.isHost;
    if (wasHost) {
      this.migrateHostIfNeeded(rec, now);
    }

    const connectedHumans = rec.players.filter((p) => p.connected && !p.isBot);
    if (connectedHumans.length === 0) {
      // Keep room alive during 60s grace window so solo/last host can reconnect cleanly
      this.pushSystemChat(
        rec,
        `${player.nickname} terputus. Slot disimpan selama 60 detik untuk reconnect.`,
        now
      );
    } else {
      this.pushSystemChat(
        rec,
        `${player.nickname} terputus (menunggu reconnect maksimal 60 detik).`,
        now
      );
    }
    this.updateQuickPlayTimer(rec, now);

    return { code, snapshot: this.toSnapshot(rec) };
  }

  public leaveRoom(guestId: string, now = Date.now()): { code: string; snapshot: RoomSnapshot | null } | null {
    const code = this.playerToRoom.get(guestId);
    if (!code) return null;
    this.playerToRoom.delete(guestId);

    const rec = this.rooms.get(code);
    if (!rec) return null;

    const idx = rec.players.findIndex((p) => p.guestId === guestId);
    if (idx === -1) return null;
    const [removed] = rec.players.splice(idx, 1);

    const remainingHumans = rec.players.filter((p) => !p.isBot);
    if (remainingHumans.length === 0) {
      this.rooms.delete(code);
      return { code, snapshot: null };
    }

    if (removed.isHost) {
      this.migrateHostIfNeeded(rec, now);
    }
    this.updateQuickPlayTimer(rec, now);
    this.pushSystemChat(rec, `${removed.nickname} keluar dari room.`, now);
    return { code, snapshot: this.toSnapshot(rec) };
  }

  public tick(now = Date.now()): { updatedRooms: RoomSnapshot[] } {
    const updatedRooms: RoomSnapshot[] = [];

    for (const [code, rec] of this.rooms.entries()) {
      let changed = false;

      // 1. Expire 60s reconnect holds
      const beforeLen = rec.players.length;
      const expired = rec.players.filter(
        (p) => !p.connected && p.reconnectDeadline !== null && now >= p.reconnectDeadline
      );
      if (expired.length > 0) {
        for (const e of expired) {
          this.playerToRoom.delete(e.guestId);
          this.pushSystemChat(rec, `Batas waktu reconnect 60 detik ${e.nickname} habis.`, now);
        }
        rec.players = rec.players.filter(
          (p) => p.connected || p.reconnectDeadline === null || now < p.reconnectDeadline
        );
        changed = rec.players.length !== beforeLen;
        if (rec.players.filter((p) => !p.isBot).length === 0) {
          this.rooms.delete(code);
          continue;
        }
        if (this.migrateHostIfNeeded(rec, now)) {
          changed = true;
        }
      }

      // 2. LOADING -> PLAYING transition
      if (rec.phase === 'LOADING' && rec.loadingStartedAt !== null) {
        if (now - rec.loadingStartedAt >= LOADING_TRANSITION_MS) {
          rec.phase = 'PLAYING';
          rec.loadingStartedAt = null;
          this.pushSystemChat(rec, 'Semua penyelidik masuk ke Jalan Sukajadi!', now);
          changed = true;
        }
      }

      // 3. QuickPlay 30-second insufficient players offer
      if (
        rec.phase === 'LOBBY' &&
        rec.isQuickPlay &&
        !rec.quickPlayOfferBots &&
        rec.quickPlayWaitingSince !== null
      ) {
        const connectedHumans = rec.players.filter((p) => !p.isBot && p.connected).length;
        if (connectedHumans < 2 && now - rec.quickPlayWaitingSince >= QUICK_PLAY_BOT_OFFER_MS) {
          rec.quickPlayOfferBots = true;
          this.pushSystemChat(
            rec,
            '30 detik berlalu dengan pemain kurang dari minimum. Tawarkan mulai dengan AI teman atau terus menunggu.',
            now
          );
          changed = true;
        }
      }

      if (changed) {
        updatedRooms.push(this.toSnapshot(rec));
      }
    }

    return { updatedRooms };
  }
}
