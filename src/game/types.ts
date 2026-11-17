export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type LoadingKind = 'boot' | 'enter_world' | 'return_menu';

export type CharacterId = 'raka' | 'salsa' | 'bima' | 'nadia' | 'dito';

export type FloorId = 'outside' | 'ground' | 'second' | 'roof';

export type PerspectiveMode = 'first-person' | 'third-person';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export type EndingType = 'true' | 'normal' | 'bad';

export type GhostKind =
  | 'ambu_hideung'
  | 'kuntilanak'
  | 'pocong'
  | 'genderuwo'
  | 'boneka_uci';

export type GhostAIState = 'patrol' | 'investigate' | 'chase' | 'stalk' | 'stunned';

export type TreeKind = 'mangga' | 'pinus' | 'ketapang' | 'palem';

export type NpcVoiceId =
  | 'satpam'
  | 'nasgor'
  | 'pecel'
  | 'rani'
  | 'warung_ibu'
  | 'warung_pemuda';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AABB {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  blocksVision?: boolean;
}

export interface StairZone {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  startZ: number; // Z at bottom elevation
  endZ: number;   // Z at top elevation
  startY: number;
  endY: number;
}

export interface SafeZone {
  id: string;
  name: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface DoorData {
  id: string;
  label: string;
  floor: FloorId;
  hingePos: Vec3;
  width: number;
  height: number;
  thickness: number;
  closedAngle: number;
  openAngle: number;
  currentAngle: number;
  targetAngle: number;
  isOpen: boolean;
  lockedKeyId?: string;
  lockedKeyLabel?: string;
  closedCenter: Vec3;
  closedSize: Vec3;
}

export interface JumpscareEvent {
  kind: GhostKind;
  name: string;
  timestamp: number;
}

export interface AudioSettings {
  masterVolume: number; // 0..100
  musicVolume: number;  // 0..100 (Musik Suasana / Ambient & Stinger)
  sfxVolume: number;    // 0..100 (Efek Suara, Langkah, Pintu, Jumpscare)
  bgmVolume?: number;   // 0..100 (Musik Latar Gamelan Sunda)
  masterEnabled?: boolean;
  bgmEnabled?: boolean;
  musicEnabled?: boolean;
  sfxEnabled?: boolean;
  voiceEnabled?: boolean;
}

export interface VisualSettings {
  brightness: number; // 0.75..1.45
  fov: number; // 65..90
  sensitivity: number; // 0.4..2.0
  cinematicEffects: boolean;
}

export interface CharacterProfile {
  id: CharacterId;
  name: string;
  grade: string;
  role: string;
  skillName: string;
  skillDesc: string;
  accentColor: string;
  shirtColor: string;
  bottomColor: string;
  speedMult: number;
  crouchNoiseMult: number;
  sanityResistMult: number;
  batteryDrainMult: number;
  canSenseGhosts: boolean;
  debunkBonusWeakening: number;
}

export interface RumorEntry {
  id: string;
  title: string;
  rumorText: string;
  associatedGhost: string;
  factId: string;
  factTitle: string;
  factText: string;
  discoveredRumor: boolean;
  discoveredFact: boolean;
  debunked: boolean;
}

export interface InteractableItem {
  id: string;
  kind:
    | 'npc'
    | 'evidence'
    | 'battery_flashlight'
    | 'battery_uv'
    | 'key'
    | 'salt'
    | 'hiding'
    | 'crumbling_wall'
    | 'radio_tower'
    | 'kujang';
  label: string;
  prompt: string;
  position: Vec3;
  floor: FloorId;
  requiresUV?: boolean;
  collected?: boolean;
  payloadId?: string;
}

export interface GhostData {
  id: string;
  kind: GhostKind;
  name: string;
  floor: FloorId;
  position: Vec3;
  yaw: number;
  state: GhostAIState;
  homePos: Vec3;
  waypoints: Vec3[];
  waypointIndex: number;
  targetPos: Vec3;
  alertTimer: number;
  stunTimer: number;
  speed: number;
  active: boolean;
  windupTimer?: number;
}

export interface CutsceneHUDState {
  kind: 'intro_car' | 'ending_true' | 'ending_normal' | 'ending_bad';
  stage: string;
  caption: string;
  subcaption?: string;
  canSkip: boolean;
}

export interface MapWaypoint {
  id: string;
  label: string;
  floor: FloorId;
  x: number;
  z: number;
}

export interface MapMarker {
  id: string;
  kind:
    | 'evidence'
    | 'key'
    | 'salt'
    | 'battery'
    | 'hiding'
    | 'door_open'
    | 'door_closed'
    | 'door_locked'
    | 'crumble'
    | 'radio'
    | 'kujang'
    | 'npc'
    | 'stair'
    | 'landmark'
    | 'safe_zone'
    | 'ghost';
  label: string;
  detail?: string;
  floor: FloorId;
  x: number;
  z: number;
}

export interface MapRectItem {
  id: string;
  floor: FloorId;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  kind: 'wall' | 'road' | 'house' | 'safe_zone' | 'water' | 'floor_pad';
  label?: string;
}

export interface GameMapSnapshot {
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    floor: FloorId;
    name: string;
  };
  companions: Array<{ id: string; name: string; x: number; z: number; floor: FloorId; downed?: boolean }>;
  markers: MapMarker[];
  rects: MapRectItem[];
}

export interface GameHUDState {
  phase: GamePhase;
  floor: FloorId;
  actNumber: number;
  currentObjective: string;
  inDimensiGaib: boolean;
  inSafeZone: boolean;
  safeZoneName: string | null;
  sanity: number;
  maxSanity: number;
  stamina: number;
  maxStamina: number;
  flashlightBattery: number;
  maxFlashlightBattery: number;
  uvBattery: number;
  maxUvBattery: number;
  flashlightOn: boolean;
  uvMode: boolean;
  isCrouching: boolean;
  isSprinting: boolean;
  isHiding: boolean;
  perspective: PerspectiveMode;
  noiseLevel: number; // 0..100
  saltCount: number;
  keysInventory: string[];
  segelBroken: number;
  totalSegel: number;
  evidenceCount: number;
  totalEvidence: number;
  kujangClaimed: boolean;
  raniRescued: boolean;
  nearestPrompt: string | null;
  nearestGhostDist: number;
  nearestGhostName: string | null;
  ditoSenseHint: string | null;
  elapsedSeconds: number;
  fps: number;
  playerX?: number;
  playerZ?: number;
  playerYaw?: number;
  isDowned?: boolean;
  cutscene?: CutsceneHUDState | null;
}

export interface RunSummary {
  ending: EndingType;
  endingTitle: string;
  endingSubtitle: string;
  endingMessage: string;
  characterName: string;
  segelBroken: number;
  totalSegel: number;
  evidenceCount: number;
  totalEvidence: number;
  elapsedSeconds: number;
  ghostHits: number;
  raniRescued: boolean;
}
