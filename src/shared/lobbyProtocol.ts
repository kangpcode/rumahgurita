import type { CharacterId, FloorId, Vec3 } from '../game/types';

export const GAME_VERSION = '1.0.0';

// 5-char unambiguous alphabet (strictly excludes O, 0, I, 1)
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
export const RECONNECT_GRACE_MS = 60_000;
export const QUICK_PLAY_BOT_OFFER_MS = 30_000;
export const LOADING_TRANSITION_MS = 2_200;

export type RoomDifficulty = 'Santai' | 'Normal' | 'Mimpi Buruk';
export type RoomLanguage = 'id' | 'en';
export type RoomRegion = 'Asia-ID' | 'Global';
export type RoomPhase = 'LOBBY' | 'LOADING' | 'PLAYING' | 'ENDED';

export type BagColorId = 'charcoal' | 'army' | 'maroon' | 'gold' | 'navy';
export type AccessoryId = 'none' | 'cap' | 'headband' | 'glasses' | 'walkie';

export interface PlayerCosmetics {
  bagColor: BagColorId;
  accessory: AccessoryId;
}

export const DEFAULT_COSMETICS: PlayerCosmetics = {
  bagColor: 'charcoal',
  accessory: 'none',
};

export const BAG_COLOR_OPTIONS: { id: BagColorId; label: string; hex: string; colorNum: number }[] = [
  { id: 'charcoal', label: 'Hitam Arang', hex: '#2d312e', colorNum: 0x2d312e },
  { id: 'army', label: 'Hijau Army', hex: '#3f5439', colorNum: 0x3f5439 },
  { id: 'maroon', label: 'Merah Marun', hex: '#782a26', colorNum: 0x782a26 },
  { id: 'gold', label: 'Kuning Emas', hex: '#b88935', colorNum: 0xb88935 },
  { id: 'navy', label: 'Biru Laut', hex: '#2a4468', colorNum: 0x2a4468 },
];

export const ACCESSORY_OPTIONS: { id: AccessoryId; label: string }[] = [
  { id: 'none', label: 'Tanpa Aksesori' },
  { id: 'cap', label: 'Topi Lapangan' },
  { id: 'headband', label: 'Ikat Kepala' },
  { id: 'glasses', label: 'Kacamata' },
  { id: 'walkie', label: 'HT Bahu' },
];

export const ALL_CHARACTER_IDS: CharacterId[] = ['raka', 'salsa', 'bima', 'nadia', 'dito'];

export interface LobbyPlayer {
  guestId: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  isBot: boolean;
  characterId: CharacterId;
  cosmetics: PlayerCosmetics;
  pingMs: number;
  micOn: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  reconnectDeadline: number | null;
  joinOrder: number;
  role: 'player' | 'spectator';
  position: Vec3;
  yaw: number;
  floor: FloorId;
  sanity: number;
  flashlightOn: boolean;
  isCrouching: boolean;
  downed: boolean;
}

export interface RoomSettings {
  roomName: string;
  isPublic: boolean;
  hasPassword: boolean;
  maxPlayers: number;
  difficulty: RoomDifficulty;
  voiceChat: boolean;
  friendlyFire: false;
  allowLateJoin: boolean;
  language: RoomLanguage;
  region: RoomRegion;
}

export interface LobbyChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  system?: boolean;
}

export interface RoomWorldState {
  openDoors: Record<string, boolean>;
  unlockedDoors: string[];
  collectedItemIds: string[];
  collectedKeyIds: string[];
  collectedKeyLabels: string[];
  discoveredRumorIds: string[];
  discoveredFactIds: string[];
  debunkedRumorIds: string[];
  brokenWalls: string[];
  raniRescued: boolean;
  kujangClaimed: boolean;
  inDimensiGaib: boolean;
  lastSaltAt: number | null;
  lastSaltBy: string | null;
}

export function createInitialRoomWorldState(): RoomWorldState {
  return {
    openDoors: {},
    unlockedDoors: [],
    collectedItemIds: [],
    collectedKeyIds: [],
    collectedKeyLabels: [],
    discoveredRumorIds: [],
    discoveredFactIds: [],
    debunkedRumorIds: [],
    brokenWalls: [],
    raniRescued: false,
    kujangClaimed: false,
    inDimensiGaib: false,
    lastSaltAt: null,
    lastSaltBy: null,
  };
}

export type CoopActionEvent =
  | { type: 'door_toggle'; doorId: string; isOpen: boolean; unlocked?: boolean }
  | {
      type: 'item_pickup';
      itemId: string;
      kind: 'key' | 'evidence' | 'battery_flashlight' | 'battery_uv' | 'salt';
      label: string;
      payloadId?: string;
    }
  | { type: 'rumor_discover'; rumorId: string }
  | { type: 'rumor_debunk'; rumorId: string; title?: string }
  | { type: 'wall_break'; itemId: string; wallId: string }
  | { type: 'radio_rescue' }
  | { type: 'salt_stun'; position: Vec3 }
  | { type: 'dimensi_enter' }
  | { type: 'player_downed' }
  | { type: 'player_revive'; targetGuestId: string }
  | { type: 'kujang_claim'; summaryTitle?: string; summarySubtitle?: string; durationSec?: number };

export interface WorldActionBroadcast {
  code: string;
  actorGuestId: string;
  actorNickname: string;
  action: CoopActionEvent;
  world: RoomWorldState;
  timestamp: number;
}

export interface GhostSyncItem {
  id: string;
  position: Vec3;
  yaw: number;
  state: 'patrol' | 'investigate' | 'chase' | 'stalk' | 'stunned';
  stunTimer: number;
  alertTimer: number;
}

export interface RtcSignalPayload {
  code: string;
  fromGuestId: string;
  toGuestId: string;
  signalType: 'offer' | 'answer' | 'ice';
  sdp?: { type: string; sdp?: string };
  candidate?: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
}

export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  settings: RoomSettings;
  players: LobbyPlayer[];
  chat: LobbyChatMessage[];
  world: RoomWorldState;
  createdAt: number;
  isQuickPlay: boolean;
  quickPlayWaitingSince: number | null;
  quickPlayOfferBots: boolean;
  loadingStartedAt: number | null;
  lastSummary: {
    outcome: 'victory' | 'defeat';
    title: string;
    subtitle: string;
    durationSec: number;
  } | null;
}

export interface PublicRoomSummary {
  code: string;
  roomName: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  difficulty: RoomDifficulty;
  language: RoomLanguage;
  region: RoomRegion;
  phase: RoomPhase;
  hasPassword: boolean;
  allowLateJoin: boolean;
  pingMs: number;
}

export interface SquadSyncPayload {
  guestId: string;
  nickname: string;
  characterId: CharacterId;
  cosmetics: PlayerCosmetics;
  position: Vec3;
  yaw: number;
  floor: FloorId;
  sanity: number;
  flashlightOn: boolean;
  isCrouching: boolean;
  downed: boolean;
  micOn: boolean;
  role: 'player' | 'spectator';
  connected: boolean;
  isBot: boolean;
}

export type LobbyErrorCode =
  | 'room_full'
  | 'not_found'
  | 'wrong_password'
  | 'already_started'
  | 'version_mismatch'
  | 'invalid_nickname'
  | 'invalid_room_name'
  | 'kicked'
  | 'unauthorized'
  | 'not_ready'
  | 'character_taken';

const PROFANITY_LIST = [
  // Indonesian
  'anjing',
  'anjir',
  'bangsat',
  'bajingan',
  'babi',
  'kontol',
  'memek',
  'jembut',
  'ngentot',
  'pepek',
  'perek',
  'lonte',
  'tolol',
  'goblok',
  'brengsek',
  'jancok',
  'jancuk',
  'asu',
  'kampret',
  'bangke',
  'kimak',
  'pantek',
  // English
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'dick',
  'pussy',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'whore',
  'slut',
  'bastard',
  'motherfucker',
];

export function generateRoomCode(existingCodes?: Set<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const idx = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
      code += ROOM_CODE_ALPHABET[idx];
    }
    if (!existingCodes || !existingCodes.has(code)) {
      return code;
    }
  }
  return `RG${Math.floor(234 + Math.random() * 760)}`;
}

export function normalizeRoomCode(raw: string = ''): string {
  return String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase();
  const collapsed = lower.replace(/[\s_.-]+/g, '');
  const words = lower.split(/[\s_.-]+/).filter(Boolean);

  for (const bad of PROFANITY_LIST) {
    if (words.includes(bad)) return true;
    // Also catch obvious compound forms for multi-char profanity (>3 chars)
    if (bad.length >= 4 && collapsed.includes(bad)) {
      return true;
    }
  }
  return false;
}

export function sanitizeAndValidateNickname(
  raw: string
): { ok: true; nickname: string } | { ok: false; code: LobbyErrorCode; reason: string } {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2 || cleaned.length > 16) {
    return {
      ok: false,
      code: 'invalid_nickname',
      reason: 'Nickname harus terdiri dari 2 sampai 16 karakter.',
    };
  }
  if (!/^[a-zA-Z0-9 _.-]+$/.test(cleaned)) {
    return {
      ok: false,
      code: 'invalid_nickname',
      reason: 'Nickname hanya boleh berisi huruf, angka, spasi, titik, garis bawah, atau tanda hubung.',
    };
  }
  if (containsProfanity(cleaned)) {
    return {
      ok: false,
      code: 'invalid_nickname',
      reason: 'Nickname mengandung kata yang tidak diperbolehkan.',
    };
  }
  return { ok: true, nickname: cleaned };
}

export function sanitizeRoomName(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, 28);
  if (cleaned.length < 2 || containsProfanity(cleaned)) {
    return 'Ekspedisi Sukajadi';
  }
  return cleaned;
}

export function sanitizeChatText(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, 180);
  if (!cleaned) return '';
  if (containsProfanity(cleaned)) {
    return '[pesan disaring sistem]';
  }
  return cleaned;
}

export function formatLobbyError(code: LobbyErrorCode, fallback?: string): string {
  switch (code) {
    case 'room_full':
      return 'Room sudah penuh (kapasitas pemain maksimal tercapai).';
    case 'not_found':
      return 'Kode room tidak ditemukan atau room sudah ditutup.';
    case 'wrong_password':
      return 'Password room salah. Periksa kembali kata sandi room.';
    case 'already_started':
      return 'Permainan di room ini sudah dimulai dan join susulan tidak diizinkan.';
    case 'version_mismatch':
      return 'Versi client tidak cocok dengan server. Muat ulang halaman untuk memperbarui.';
    case 'invalid_nickname':
      return fallback ?? 'Nickname tidak valid (2-16 karakter tanpa kata terlarang).';
    case 'invalid_room_name':
      return 'Nama room tidak valid.';
    case 'kicked':
      return 'Kamu dikeluarkan oleh Host dari room ini.';
    case 'unauthorized':
      return 'Hanya Host room yang dapat melakukan tindakan ini.';
    case 'not_ready':
      return 'Semua pemain yang terhubung harus berstatus Siap sebelum memulai.';
    case 'character_taken':
      return 'Karakter tersebut sudah dipilih oleh pemain lain di room ini.';
    default:
      return fallback ?? 'Terjadi kendala saat menghubungkan ke room.';
  }
}
