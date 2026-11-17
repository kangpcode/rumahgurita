import type {
  AABB,
  DoorData,
  GhostData,
  InteractableItem,
  SafeZone,
  StairZone,
  TreeKind,
  Vec3,
} from './types';
import type { FurnitureKind } from './proceduralModels';

export interface BoxVisual {
  id: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  mat:
    | 'wall_out'
    | 'wall_in'
    | 'floor_wood'
    | 'floor_tile'
    | 'floor_roof'
    | 'street'
    | 'parapet'
    | 'metal'
    | 'crumble'
    | 'glass';
  solid?: boolean;
  blocksVision?: boolean;
  tint?: number;
}

export type NeighborhoodHouseStyle = 'pelana' | 'limasan' | 'seng' | 'tingkat';

export interface NeighborhoodHouseSpec {
  id: string;
  x: number;
  z: number;
  rotY: number; // 0 faces +Z, Math.PI/2 faces +X, -Math.PI/2 faces -X, Math.PI faces -Z
  roofColor: number;
  wallColor: number;
  w: number;
  d: number;
  style?: NeighborhoodHouseStyle;
}

export interface TreePlacement {
  x: number;
  z: number;
  kind: TreeKind;
  scale: number;
  tint: number;
}

export interface FurnitureSpec {
  id: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  z: number;
  ry?: number;
  w: number;
  h: number;
  d: number;
}

export const FLOOR_HEIGHT = 4.0;
export const HOUSE_FRONT_Z = 8.5;
export const COMPOUND_GATE_Z = 20.5;

export const STAIR_ZONES: StairZone[] = [
  {
    id: 'stair_ground_to_second',
    minX: -1.65,
    maxX: 1.55,
    minZ: -7.6,
    maxZ: -2.0,
    startZ: -2.0,
    endZ: -7.6,
    startY: 0.0,
    endY: FLOOR_HEIGHT,
  },
  {
    id: 'stair_second_to_roof',
    minX: 1.85,
    maxX: 4.75,
    minZ: -6.8,
    maxZ: -2.0,
    startZ: -2.0,
    endZ: -6.8,
    startY: FLOOR_HEIGHT,
    endY: FLOOR_HEIGHT * 2,
  },
];

// Titik spawn tepat di depan-kanan Warung Ceu Titin di Jalan Sukajadi
export const PLAYER_SPAWN: Vec3 = { x: -2.4, y: 0.0, z: 53.2 };
export const PLAYER_SPAWN_YAW = 0.42;

export const WARUNG_POS = { x: -11.5, z: 49.5 };
export const BILLBOARD_POS = { x: 10.2, z: 42.5, rotY: -0.34 };
export const COURTYARD_POOL_POS = { x: 5.8, z: 14.5 };
export const CARPORT_VEHICLES: { id: string; kind: 'sedan' | 'motor'; x: number; z: number; rotY: number }[] = [
  { id: 'carport_sedan', kind: 'sedan', x: -13.6, z: 15.2, rotY: 0.04 },
  { id: 'carport_motor', kind: 'motor', x: -10.5, z: 13.0, rotY: -0.22 },
];

export const MOSQUE_POS = { x: 30, z: 37 };
export const POS_RONDA_POS = { x: -11.4, z: 35.8 };

export const CART_PLACEMENTS: { id: string; kind: 'nasgor' | 'pecel'; x: number; z: number; rotY: number }[] = [
  { id: 'cart_nasgor', kind: 'nasgor', x: -6.8, z: 32.8, rotY: Math.PI * 0.2 },
  { id: 'cart_pecel', kind: 'pecel', x: 6.8, z: 32.8, rotY: -Math.PI * 0.2 },
];

// Rumah Komplek Sukajadi: deretan rumah Bandung presisi (tanpa tumpang tindih jalan maupun bangunan tetangga)
export const NEIGHBORHOOD_HOUSES: NeighborhoodHouseSpec[] = [
  // Deret Barat Komplek (berjajar rapi di sisi barat compound Rumah Gurita, dipisah gang 2.8m)
  { id: 'house_w_row1', x: -27.2, z: -5.4, rotY: Math.PI / 2, roofColor: 0x733524, wallColor: 0xc8c2b5, w: 9.4, d: 9.0, style: 'pelana' },
  { id: 'house_w_row2', x: -27.2, z: 4.2, rotY: Math.PI / 2, roofColor: 0x5c2f22, wallColor: 0xb7beb8, w: 9.4, d: 9.0, style: 'seng' },
  { id: 'house_w_row3', x: -27.2, z: 13.8, rotY: Math.PI / 2, roofColor: 0x6b3525, wallColor: 0xcbc4b6, w: 9.4, d: 9.0, style: 'limasan' },
  { id: 'house_w_mid1', x: -26.8, z: 35.2, rotY: Math.PI / 2, roofColor: 0x5d3224, wallColor: 0xbac1bb, w: 9.4, d: 8.8, style: 'pelana' },
  { id: 'house_w_mid2', x: -26.8, z: 44.8, rotY: Math.PI / 2, roofColor: 0x4b3528, wallColor: 0xc7c0b3, w: 9.4, d: 8.8, style: 'tingkat' },
  { id: 'house_w_tree', x: -37.2, z: 44.8, rotY: 0, roofColor: 0x633324, wallColor: 0xbbc2b9, w: 9.0, d: 8.6, style: 'seng' },

  // Deret Timur Komplek (sisi timur compound Rumah Gurita, aman dari East Wing X=+15)
  { id: 'house_e_row1', x: 27.2, z: -5.4, rotY: -Math.PI / 2, roofColor: 0x693424, wallColor: 0xcac3b4, w: 9.4, d: 9.0, style: 'limasan' },
  { id: 'house_e_row2', x: 27.2, z: 4.2, rotY: -Math.PI / 2, roofColor: 0x543628, wallColor: 0xb7bfb8, w: 9.4, d: 9.0, style: 'pelana' },
  { id: 'house_e_row3', x: 27.2, z: 13.8, rotY: -Math.PI / 2, roofColor: 0x703626, wallColor: 0xc7c0b2, w: 9.4, d: 9.0, style: 'tingkat' },
  { id: 'house_e_tree', x: 30.5, z: 49.2, rotY: -Math.PI / 2, roofColor: 0x583325, wallColor: 0xc1c7bf, w: 9.6, d: 8.8, style: 'seng' },

  // Deret Selatan sepanjang road_cross_south (Z: 54.8..62.4, rumah di Z=68.6 sehingga halaman bersih)
  { id: 'house_s_row1', x: -29.0, z: 68.6, rotY: Math.PI, roofColor: 0x643225, wallColor: 0xb9c0ba, w: 9.2, d: 8.4, style: 'pelana' },
  { id: 'house_s_row2', x: -19.2, z: 68.6, rotY: Math.PI, roofColor: 0x723827, wallColor: 0xc8c1b5, w: 9.2, d: 8.4, style: 'limasan' },
  { id: 'house_s_row3', x: -10.2, z: 68.6, rotY: Math.PI, roofColor: 0x4f392c, wallColor: 0xbac2bb, w: 7.4, d: 8.4, style: 'seng' },
  { id: 'house_s_e1', x: 11.4, z: 68.6, rotY: Math.PI, roofColor: 0x663326, wallColor: 0xc7c0b3, w: 9.4, d: 8.4, style: 'tingkat' },
  { id: 'house_s_e2', x: 21.2, z: 68.6, rotY: Math.PI, roofColor: 0x523428, wallColor: 0xb6beb8, w: 9.4, d: 8.4, style: 'pelana' },

  // Deret Utara gang belakang (Z = -20.0, aman di belakang pagar compound Z = -12.0)
  { id: 'house_n_back1', x: -21.5, z: -20.0, rotY: 0, roofColor: 0x683324, wallColor: 0xc0c5bc, w: 9.2, d: 8.2, style: 'seng' },
  { id: 'house_n_back2', x: -11.8, z: -20.0, rotY: 0, roofColor: 0x523528, wallColor: 0xc8c1b4, w: 9.2, d: 8.2, style: 'pelana' },
  { id: 'house_n_back3', x: 11.8, z: -20.0, rotY: 0, roofColor: 0x6d3627, wallColor: 0xbac2ba, w: 9.2, d: 8.2, style: 'limasan' },
  { id: 'house_n_back4', x: 21.5, z: -20.0, rotY: 0, roofColor: 0x553629, wallColor: 0xc7c0b2, w: 9.2, d: 8.2, style: 'tingkat' },
];

export const LAMP_POSITIONS: { x: number; z: number; rotY: number }[] = [
  { x: -6.4, z: 21.2, rotY: 0 },
  { x: 6.4, z: 21.2, rotY: Math.PI },
  { x: -6.4, z: 30.2, rotY: 0 },
  { x: 6.4, z: 30.2, rotY: Math.PI },
  { x: -6.4, z: 38.5, rotY: 0 },
  { x: 6.4, z: 38.5, rotY: Math.PI },
  { x: -6.4, z: 46.5, rotY: 0 },
  { x: 6.4, z: 46.5, rotY: Math.PI },
  { x: -6.4, z: 54.0, rotY: 0 },
  { x: 6.4, z: 54.0, rotY: Math.PI },
  { x: -20.5, z: 21.0, rotY: -Math.PI / 2 },
  { x: -35.0, z: 21.0, rotY: -Math.PI / 2 },
  { x: 20.5, z: 21.0, rotY: -Math.PI / 2 },
  { x: 38.0, z: 21.0, rotY: -Math.PI / 2 },
  { x: -22.0, z: 54.6, rotY: -Math.PI / 2 },
  { x: 22.0, z: 54.6, rotY: -Math.PI / 2 },
];

export const TREE_PLACEMENTS: TreePlacement[] = [
  // Sepanjang trotoar Jalan Sukajadi (bersih di luar aspal & bangunan)
  { x: -9.4, z: 29.8, kind: 'ketapang', scale: 1.08, tint: 0x1e3322 },
  { x: 9.4, z: 29.8, kind: 'mangga', scale: 1.1, tint: 0x223825 },
  { x: -10.8, z: 42.2, kind: 'palem', scale: 1.06, tint: 0x243b27 },
  { x: 9.4, z: 36.5, kind: 'ketapang', scale: 1.04, tint: 0x1d3020 },
  { x: -9.4, z: 54.2, kind: 'mangga', scale: 1.12, tint: 0x203523 },
  { x: 9.4, z: 49.5, kind: 'pinus', scale: 1.08, tint: 0x182b1e },
  { x: 9.4, z: 63.2, kind: 'palem', scale: 1.1, tint: 0x243a26 },

  // Pohon rindang di depan rumah warga
  { x: -24.5, z: 49.8, kind: 'mangga', scale: 1.24, tint: 0x1e3321 },
  { x: -24.5, z: 53.5, kind: 'ketapang', scale: 1.18, tint: 0x1a2d1e },
  { x: 23.2, z: 46.5, kind: 'mangga', scale: 1.22, tint: 0x1f3422 },
  { x: 23.2, z: 51.5, kind: 'pinus', scale: 1.2, tint: 0x16281b },
  { x: -19.5, z: -13.8, kind: 'ketapang', scale: 1.2, tint: 0x1a2c1e },
  { x: 19.5, z: -13.8, kind: 'mangga', scale: 1.18, tint: 0x1d3020 },

  // Pohon di sisi halaman dalam & lereng luar pagar compound
  { x: -19.8, z: 1.0, kind: 'pinus', scale: 1.24, tint: 0x192b1e },
  { x: -19.8, z: -8.5, kind: 'ketapang', scale: 1.16, tint: 0x1b2e20 },
  { x: -19.8, z: 10.5, kind: 'mangga', scale: 1.08, tint: 0x213624 },
  { x: 19.8, z: 1.0, kind: 'pinus', scale: 1.22, tint: 0x18291d },
  { x: 19.8, z: -8.5, kind: 'mangga', scale: 1.14, tint: 0x1d3021 },
  { x: 19.8, z: 10.5, kind: 'palem', scale: 1.08, tint: 0x233825 },
  { x: -37.0, z: 17.5, kind: 'ketapang', scale: 1.22, tint: 0x1a2b1e },
  { x: -41.0, z: 29.5, kind: 'pinus', scale: 1.28, tint: 0x16261a },
  { x: 40.0, z: 17.5, kind: 'mangga', scale: 1.2, tint: 0x1c2d20 },
  { x: 43.0, z: 33.5, kind: 'palem', scale: 1.2, tint: 0x203424 },

  // Sabuk pepohonan batas luar komplek Bandung Utara
  { x: -48, z: -29, kind: 'pinus', scale: 1.35, tint: 0x142218 },
  { x: -32, z: -29, kind: 'ketapang', scale: 1.28, tint: 0x17261a },
  { x: -16, z: -29, kind: 'pinus', scale: 1.32, tint: 0x152319 },
  { x: 0, z: -29, kind: 'mangga', scale: 1.3, tint: 0x18271c },
  { x: 16, z: -29, kind: 'pinus', scale: 1.3, tint: 0x152218 },
  { x: 32, z: -29, kind: 'ketapang', scale: 1.28, tint: 0x17251a },
  { x: 48, z: -29, kind: 'pinus', scale: 1.35, tint: 0x142218 },
  { x: -46, z: 4, kind: 'mangga', scale: 1.25, tint: 0x18261b },
  { x: -46, z: 42, kind: 'pinus', scale: 1.32, tint: 0x162419 },
  { x: 46, z: 4, kind: 'ketapang', scale: 1.26, tint: 0x17261a },
  { x: 46, z: 42, kind: 'pinus', scale: 1.32, tint: 0x162419 },
  { x: -34, z: 78, kind: 'mangga', scale: 1.22, tint: 0x18271b },
  { x: -12, z: 78, kind: 'ketapang', scale: 1.18, tint: 0x19291d },
  { x: 12, z: 78, kind: 'palem', scale: 1.16, tint: 0x1d2e20 },
  { x: 34, z: 78, kind: 'pinus', scale: 1.26, tint: 0x16251a },
];

export const FURNITURE_SPECS: FurnitureSpec[] = [
  // --- GROUND FLOOR (Y = 0) ---
  { id: 'furn_g_dining', kind: 'dining_set', x: -7.2, y: 0, z: 2.6, w: 2.3, h: 1.0, d: 2.0 },
  { id: 'furn_g_sofa', kind: 'sofa', x: -7.2, y: 0, z: -5.2, w: 2.15, h: 0.95, d: 0.95 },
  { id: 'furn_g_tv', kind: 'tv_stand', x: -7.2, y: 0, z: -8.6, w: 1.75, h: 1.35, d: 0.68 },
  { id: 'furn_g_shelf', kind: 'bookshelf', x: -2.55, y: 0, z: -5.6, ry: -Math.PI / 2, w: 0.5, h: 2.2, d: 1.7 },
  { id: 'furn_g_clock', kind: 'clock', x: -2.55, y: 0, z: -1.8, ry: -Math.PI / 2, w: 0.48, h: 2.25, d: 0.6 },
  { id: 'furn_g_closet_w', kind: 'closet', x: -11.3, y: 0, z: -7.0, ry: Math.PI / 2, w: 0.8, h: 2.2, d: 1.15 },
  { id: 'furn_g_counter', kind: 'counter', x: 7.2, y: 0, z: -8.7, w: 2.7, h: 1.0, d: 0.88 },
  { id: 'furn_g_fridge', kind: 'fridge', x: 10.9, y: 0, z: -8.7, w: 1.0, h: 1.98, d: 0.9 },
  { id: 'furn_g_ktable', kind: 'table', x: 7.2, y: 0, z: -4.6, w: 1.65, h: 1.05, d: 1.05 },
  { id: 'furn_g_closet_k', kind: 'closet', x: 11.3, y: 0, z: -5.8, ry: -Math.PI / 2, w: 0.8, h: 2.2, d: 1.15 },
  { id: 'furn_g_bed_se', kind: 'bed', x: 11.4, y: 0, z: 6.2, w: 1.55, h: 1.0, d: 2.25 },
  { id: 'furn_g_vanity_se', kind: 'vanity', x: 7.2, y: 0, z: 7.75, w: 1.3, h: 1.55, d: 0.6 },
  { id: 'furn_g_closet_se', kind: 'closet', x: 14.3, y: 0, z: 2.0, ry: -Math.PI / 2, w: 0.8, h: 2.2, d: 1.15 },
  { id: 'furn_g_front_sofa', kind: 'sofa', x: 1.1, y: 0, z: 5.5, ry: Math.PI, w: 2.15, h: 0.95, d: 0.95 },

  // --- SECOND FLOOR (Y = 4.0) ---
  { id: 'furn_s_table', kind: 'table', x: -7.2, y: FLOOR_HEIGHT, z: 2.6, w: 1.65, h: 1.05, d: 1.05 },
  { id: 'furn_s_sofa', kind: 'sofa', x: -7.2, y: FLOOR_HEIGHT, z: -0.4, w: 2.15, h: 0.95, d: 0.95 },
  { id: 'furn_s_shelf', kind: 'bookshelf', x: -2.55, y: FLOOR_HEIGHT, z: 4.8, ry: -Math.PI / 2, w: 0.5, h: 2.2, d: 1.7 },
  { id: 'furn_s_closet_hall', kind: 'closet', x: -11.3, y: FLOOR_HEIGHT, z: 6.2, ry: Math.PI / 2, w: 0.8, h: 2.2, d: 1.15 },
  { id: 'furn_s_bed_nw', kind: 'bed', x: -7.6, y: FLOOR_HEIGHT, z: -7.6, w: 1.55, h: 1.0, d: 2.25 },
  { id: 'furn_s_vanity_nw', kind: 'vanity', x: -3.5, y: FLOOR_HEIGHT, z: -8.75, w: 1.3, h: 1.55, d: 0.6 },
  { id: 'furn_s_closet_nw', kind: 'closet', x: -11.3, y: FLOOR_HEIGHT, z: -7.2, ry: Math.PI / 2, w: 0.8, h: 2.2, d: 1.15 },
  { id: 'furn_s_bed_se', kind: 'bed', x: 12.2, y: FLOOR_HEIGHT, z: 6.2, w: 1.55, h: 1.0, d: 2.25 },
  { id: 'furn_s_table_se', kind: 'table', x: 10.6, y: FLOOR_HEIGHT, z: 2.2, w: 1.65, h: 1.05, d: 1.05 },
];

/**
 * Zona Aman tempat hantu dilarang menyerang, menguras Sanity, atau masuk ke dalamnya.
 */
export const SAFE_ZONES: SafeZone[] = [
  {
    id: 'safe_outside',
    name: 'Komplek Sukajadi & Halaman Depan (Zona Aman)',
    minX: -96,
    maxX: 96,
    minY: -1,
    maxY: 3.2,
    minZ: HOUSE_FRONT_Z + 0.05,
    maxZ: 88,
  },
  {
    id: 'safe_outside_flank_w',
    name: 'Kawasan Komplek Barat (Zona Aman)',
    minX: -96,
    maxX: -15.7,
    minY: -1,
    maxY: 3.2,
    minZ: -38,
    maxZ: 88,
  },
  {
    id: 'safe_outside_flank_e',
    name: 'Kawasan Masjid & Komplek Timur (Zona Aman)',
    minX: 15.1,
    maxX: 96,
    minY: -1,
    maxY: 3.2,
    minZ: -38,
    maxZ: 88,
  },
  {
    id: 'safe_ground_bay',
    name: 'Ceruk Barat Lantai 1 (Zona Aman)',
    minX: -13.9,
    maxX: -11.9,
    minY: -0.5,
    maxY: 3.4,
    minZ: -1.6,
    maxZ: 1.6,
  },
  {
    id: 'safe_second_bay',
    name: 'Ceruk Barat Lantai 2 (Zona Aman)',
    minX: -13.9,
    maxX: -11.9,
    minY: 3.6,
    maxY: 7.4,
    minZ: -1.6,
    maxZ: 1.6,
  },
  {
    id: 'safe_stair_g2_landing',
    name: 'Tangga Lantai 1–2 (Zona Aman)',
    minX: -1.75,
    maxX: 1.65,
    minY: -0.5,
    maxY: 7.2,
    minZ: -8.3,
    maxZ: -1.9,
  },
  {
    id: 'safe_stair_2r_landing',
    name: 'Tangga Lantai 2–Atap (Zona Aman)',
    minX: 1.95,
    maxX: 4.7,
    minY: 3.6,
    maxY: 11.4,
    minZ: -8.3,
    maxZ: -1.9,
  },
  {
    id: 'safe_kujang_shrine',
    name: 'Altar Kujang Pamungkas (Zona Aman)',
    minX: 7.2,
    maxX: 11.9,
    minY: 7.5,
    maxY: 11.5,
    minZ: -1.6,
    maxZ: 2.8,
  },
  {
    id: 'safe_masjid',
    name: 'Masjid Al-Ikhlas Sukajadi (Zona Aman)',
    minX: MOSQUE_POS.x - 4.9,
    maxX: MOSQUE_POS.x + 4.9,
    minY: -0.5,
    maxY: 4.5,
    minZ: MOSQUE_POS.z - 4.9,
    maxZ: MOSQUE_POS.z + 4.9,
  },
];

export function buildLevelGeometry(): {
  visuals: BoxVisual[];
  colliders: AABB[];
} {
  const visuals: BoxVisual[] = [];
  const colliders: AABB[] = [];

  const pushBox = (
    id: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: BoxVisual['mat'],
    solid = true,
    blocksVision = true,
    tint?: number
  ) => {
    visuals.push({ id, x, y, z, w, h, d, mat, solid, blocksVision, tint });
    if (solid) {
      colliders.push({
        id,
        minX: x - w * 0.5,
        maxX: x + w * 0.5,
        minY: y - h * 0.5,
        maxY: y + h * 0.5,
        minZ: z - d * 0.5,
        maxZ: z + d * 0.5,
        blocksVision,
      });
    }
  };

  const pushSolidCollider = (
    id: string,
    x: number,
    minY: number,
    z: number,
    w: number,
    h: number,
    d: number,
    blocksVision = true
  ) => {
    colliders.push({
      id,
      minX: x - w * 0.5,
      maxX: x + w * 0.5,
      minY,
      maxY: minY + h,
      minZ: z - d * 0.5,
      maxZ: z + d * 0.5,
      blocksVision,
    });
  };

  // ==================== OUTSIDE / DUNIA SUKAJADI & JALAN NON-OVERLAPPING ====================
  // Elevasi bertingkat bersih tanpa z-fighting:
  // tanah dasar top=-0.08 | halaman compound top=-0.03 | aspal jalan top=-0.02 | trotoar top=-0.008
  pushBox('ground_terrain', 0, -0.23, 24, 210, 0.3, 155, 'parapet', false, false);

  // Segmen jalan terpisah rapi (0 tumpang tindih antar box aspal)
  pushBox('road_cross_north', 0, -0.09, 25.0, 138, 0.14, 7.6, 'street', false, false);
  pushBox('road_main_ns_mid', 0, -0.09, 41.8, 10.6, 0.14, 26.0, 'street', false, false);
  pushBox('road_cross_south', 0, -0.09, 58.6, 138, 0.14, 7.6, 'street', false, false);
  pushBox('road_main_ns_south', 0, -0.09, 71.4, 10.6, 0.14, 18.0, 'street', false, false);
  pushBox('road_driveway_gate', -5.5, -0.085, 20.85, 3.2, 0.14, 0.7, 'street', false, false);
  pushBox('road_driveway_garasi', -13.6, -0.085, 20.85, 3.6, 0.14, 0.7, 'street', false, false);

  // Trotoar / bahu jalan beton rapi di sisi jalan utama (tidak menumpuk aspal)
  pushBox('sidewalk_w_mid', -7.2, -0.078, 41.8, 3.8, 0.14, 26.0, 'floor_roof', false, false);
  pushBox('sidewalk_e_mid', 7.2, -0.078, 41.8, 3.8, 0.14, 26.0, 'floor_roof', false, false);
  pushBox('sidewalk_n_apron', 0, -0.082, 20.85, 36.4, 0.14, 0.7, 'floor_roof', false, false);

  // Pelataran halaman dalam pagar Rumah Gurita (diperluas: X -18.2..+18.2, Z -12.0..+20.5)
  pushBox('yard_gurita', 0.0, -0.1, 4.25, 36.4, 0.14, 32.5, 'floor_tile', false, false);
  pushBox('carport_pad', -13.3, -0.085, 15.2, 7.2, 0.14, 10.6, 'street', false, false);
  for (const [gx, gz] of [[-16.6, 11.2], [-16.6, 19.2], [-10.0, 11.2], [-10.0, 19.2]]) {
    pushSolidCollider(`carport_post_${gx}_${gz}`, gx, 0, gz, 0.26, 2.75, 0.26, false);
  }

  // Pagar compound Rumah Gurita (Z = 20.5) dengan Gerbang Utama (-6.8..-4.2) & Gerbang Garasi Mobil (-15.4..-11.8)
  pushBox('fence_front_w', -16.8, 0.55, COMPOUND_GATE_Z, 2.8, 1.1, 0.28, 'parapet', true, false);
  pushBox('fence_front_mid', -9.3, 0.55, COMPOUND_GATE_Z, 5.0, 1.1, 0.28, 'parapet', true, false);
  pushBox('fence_front_e', 7.0, 0.55, COMPOUND_GATE_Z, 22.4, 1.1, 0.28, 'parapet', true, false);
  pushBox('fence_side_w', -18.2, 1.05, 4.25, 0.28, 2.1, 32.5, 'parapet', true, true);
  pushBox('fence_side_e', 18.2, 1.05, 4.25, 0.28, 2.1, 32.5, 'parapet', true, true);
  pushBox('fence_back', 0, 1.05, -12.0, 36.68, 2.1, 0.28, 'parapet', true, true);

  // Rumah Tetangga Komplek
  for (const h of NEIGHBORHOOD_HOUSES) {
    const hw = h.w * 0.5;
    const hd = h.d * 0.5;
    const t = 0.28;
    const wt = h.wallColor;
    const doorHalf = Math.min(0.7, hw * 0.35, hd * 0.35);
    pushBox(`${h.id}_floor`, h.x, -0.02, h.z, h.w, 0.16, h.d, 'floor_tile', false, false);
    if (h.rotY === Math.PI / 2) {
      pushBox(`${h.id}_w_back`, h.x - hw, 1.75, h.z, t, 3.5, h.d, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_n`, h.x, 1.75, h.z - hd, h.w, 3.5, t, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_s`, h.x, 1.75, h.z + hd, h.w, 3.5, t, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_fn`, h.x + hw, 1.75, h.z - (hd + doorHalf) * 0.5, t, 3.5, hd - doorHalf, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_fs`, h.x + hw, 1.75, h.z + (hd + doorHalf) * 0.5, t, 3.5, hd - doorHalf, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_lintel`, h.x + hw, 2.95, h.z, t, 1.1, doorHalf * 2, 'wall_out', true, true, wt);
      pushSolidCollider(`${h.id}_col_p1`, h.x + hw + 1.2, 0, h.z - 1.4, 0.3, 2.7, 0.3, false);
      pushSolidCollider(`${h.id}_col_p2`, h.x + hw + 1.2, 0, h.z + 1.4, 0.3, 2.7, 0.3, false);
    } else if (h.rotY === -Math.PI / 2) {
      pushBox(`${h.id}_w_back`, h.x + hw, 1.75, h.z, t, 3.5, h.d, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_n`, h.x, 1.75, h.z - hd, h.w, 3.5, t, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_s`, h.x, 1.75, h.z + hd, h.w, 3.5, t, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_fn`, h.x - hw, 1.75, h.z - (hd + doorHalf) * 0.5, t, 3.5, hd - doorHalf, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_fs`, h.x - hw, 1.75, h.z + (hd + doorHalf) * 0.5, t, 3.5, hd - doorHalf, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_lintel`, h.x - hw, 2.95, h.z, t, 1.1, doorHalf * 2, 'wall_out', true, true, wt);
      pushSolidCollider(`${h.id}_col_p1`, h.x - hw - 1.2, 0, h.z - 1.4, 0.3, 2.7, 0.3, false);
      pushSolidCollider(`${h.id}_col_p2`, h.x - hw - 1.2, 0, h.z + 1.4, 0.3, 2.7, 0.3, false);
    } else if (h.rotY === 0) {
      pushBox(`${h.id}_w_back`, h.x, 1.75, h.z - hd, h.w, 3.5, t, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_w`, h.x - hw, 1.75, h.z, t, 3.5, h.d, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_e`, h.x + hw, 1.75, h.z, t, 3.5, h.d, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_fw`, h.x - (hw + doorHalf) * 0.5, 1.75, h.z + hd, hw - doorHalf, 3.5, t, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_fe`, h.x + (hw + doorHalf) * 0.5, 1.75, h.z + hd, hw - doorHalf, 3.5, t, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_lintel`, h.x, 2.95, h.z + hd, doorHalf * 2, 1.1, t, 'wall_out', true, true, wt);
      pushSolidCollider(`${h.id}_col_p1`, h.x - 1.4, 0, h.z + hd + 1.2, 0.3, 2.7, 0.3, false);
      pushSolidCollider(`${h.id}_col_p2`, h.x + 1.4, 0, h.z + hd + 1.2, 0.3, 2.7, 0.3, false);
    } else {
      pushBox(`${h.id}_w_back`, h.x, 1.75, h.z + hd, h.w, 3.5, t, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_w`, h.x - hw, 1.75, h.z, t, 3.5, h.d, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_e`, h.x + hw, 1.75, h.z, t, 3.5, h.d, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_fw`, h.x - (hw + doorHalf) * 0.5, 1.75, h.z - hd, hw - doorHalf, 3.5, t, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_fe`, h.x + (hw + doorHalf) * 0.5, 1.75, h.z - hd, hw - doorHalf, 3.5, t, 'wall_out', true, true, wt);
      pushBox(`${h.id}_w_lintel`, h.x, 2.95, h.z - hd, doorHalf * 2, 1.1, t, 'wall_out', true, true, wt);
      pushSolidCollider(`${h.id}_col_p1`, h.x - 1.4, 0, h.z - hd - 1.2, 0.3, 2.7, 0.3, false);
      pushSolidCollider(`${h.id}_col_p2`, h.x + 1.4, 0, h.z - hd - 1.2, 0.3, 2.7, 0.3, false);
    }
  }

  // Masjid Komplek Sukajadi
  {
    const mx = MOSQUE_POS.x;
    const mz = MOSQUE_POS.z;
    const mt = 0.3;
    const mc = 0xe3e4da;
    pushBox('masjid_floor', mx, 0.02, mz, 11.4, 0.2, 11.4, 'floor_tile', false, false);
    pushBox('masjid_wall_e', mx + 5.2, 2.1, mz, mt, 4.2, 10.4, 'wall_out', true, true, mc);
    pushBox('masjid_wall_n', mx, 2.1, mz - 5.2, 10.4, 4.2, mt, 'wall_out', true, true, mc);
    pushBox('masjid_wall_s', mx, 2.1, mz + 5.2, 10.4, 4.2, mt, 'wall_out', true, true, mc);
    pushBox('masjid_wall_wn', mx - 5.2, 2.1, mz - 3.0, mt, 4.2, 4.4, 'wall_out', true, true, mc);
    pushBox('masjid_wall_ws', mx - 5.2, 2.1, mz + 3.0, mt, 4.2, 4.4, 'wall_out', true, true, mc);
    pushBox('masjid_wall_w_lintel', mx - 5.2, 3.4, mz, mt, 1.6, 1.6, 'wall_out', true, true, mc);
    for (const pz of [-3.6, -1.6, 1.6, 3.6]) {
      pushSolidCollider(`masjid_pil_${pz}`, mx - 6.3, 0, mz + pz, 0.45, 4.1, 0.45, false);
    }
    pushSolidCollider('masjid_minaret_base', mx - 5.4, 0, mz - 5.4, 1.8, 8.5, 1.8, true);
    // Collider interior Masjid: Mimbar kayu timur & Rak Al-Qur'an
    pushSolidCollider('masjid_mimbar', mx + 3.9, 0, mz + 1.85, 1.1, 1.6, 1.1, false);
    pushSolidCollider('masjid_rak_quran', mx + 4.6, 0, mz - 3.6, 0.55, 1.8, 1.5, false);
  }

  // ==================== RUMAH GURITA DIPERLUAS (L-SHAPE ART-DECO BANDUNG, 27m x 18m) ====================
  // GROUND FLOOR (Y = 0 .. 4.0)
  pushBox('g_floor_west', -7.2, -0.04, -0.5, 9.6, 0.14, 18.0, 'floor_wood', false, false);
  pushBox('g_floor_east', 4.8, -0.04, -0.5, 14.4, 0.14, 18.0, 'floor_tile', false, false);
  pushBox('g_floor_wing_e', 13.5, -0.04, 3.75, 3.0, 0.14, 9.5, 'floor_tile', false, false);
  pushBox('g_floor_annex_w', -13.8, -0.04, 5.15, 3.6, 0.14, 6.7, 'floor_tile', false, false);

  // Dinding Luar Ground (X: -12.0..+12.0 bagian utara, sayap timur melebar sampai +15.0 di Z=-1.0..+8.5, Z: -9.5..+8.5)
  pushBox('g_wall_north', 0, 1.95, -9.5, 24.28, 3.95, 0.28, 'wall_out');
  pushBox('g_wall_east_n', 12.0, 1.95, -5.25, 0.28, 3.95, 8.5, 'wall_out');
  pushBox('g_wall_east_step', 13.5, 1.95, -1.0, 3.28, 3.95, 0.28, 'wall_out');
  pushBox('g_wall_east_s', 15.0, 1.95, 3.75, 0.28, 3.95, 9.5, 'wall_out');
  pushBox('g_wall_west_n', -12.0, 1.95, -5.55, 0.28, 3.95, 7.9, 'wall_out');
  pushBox('g_wall_west_s', -12.0, 1.95, 5.05, 0.28, 3.95, 6.9, 'wall_out');
  pushBox('g_bay_w_back', -13.9, 1.95, 0.0, 0.25, 3.95, 3.4, 'wall_out');
  pushBox('g_bay_w_n', -12.95, 1.95, -1.6, 2.0, 3.95, 0.25, 'wall_out');
  pushBox('g_bay_w_s', -12.95, 1.95, 1.6, 2.0, 3.95, 0.25, 'wall_out');

  // Paviliun Servis Barat (X: -15.6..-12.0, Z: 1.8..8.5, tampak di sisi kiri foto asli)
  pushBox('g_annex_w_wall', -15.6, 1.65, 5.15, 0.26, 3.3, 6.7, 'wall_out');
  pushBox('g_annex_w_n', -13.8, 1.65, 1.8, 3.6, 3.3, 0.26, 'wall_out');
  pushBox('g_annex_w_s', -13.8, 1.65, 8.5, 3.6, 3.3, 0.26, 'wall_out');
  pushBox('g_annex_w_roof', -13.8, 3.38, 5.15, 3.9, 0.16, 7.0, 'parapet', false, false);

  // Dinding Selatan dengan pintu utama lebar & bersih (X: -7.8 .. -6.2, Z = 8.5)
  pushBox('g_wall_south_w', -9.9, 1.95, HOUSE_FRONT_Z, 4.2, 3.95, 0.28, 'wall_out');
  pushBox('g_wall_south_e', 4.4, 1.95, HOUSE_FRONT_Z, 21.2, 3.95, 0.28, 'wall_out');
  pushBox('g_wall_south_lintel', -7.0, 3.2, HOUSE_FRONT_Z, 1.6, 1.45, 0.28, 'wall_out');
  for (const px of [-8.25, -5.75, -1.8, 4.2, 10.2]) {
    pushSolidCollider(`facade_pillar_${px}`, px, 0, HOUSE_FRONT_Z + 0.28, 0.52, 3.95, 0.52, false);
  }

  // Sekat Interior Ground + Kusen Pintu Tangga Lantai 1 -> 2 (X: -0.8..+0.7, Z = -2.0)
  pushBox('g_part_lounge_n', -2.4, 1.95, -4.45, 0.24, 3.95, 10.1, 'wall_in');
  pushBox('g_part_lounge_s', -2.4, 1.95, 5.35, 0.24, 3.95, 6.3, 'wall_in');
  pushBox('g_part_lounge_lintel', -2.4, 3.2, 1.4, 0.24, 1.45, 1.6, 'wall_in');

  pushBox('g_part_kitchen_w', 2.0, 1.95, -0.5, 0.6, 3.95, 0.24, 'wall_in');
  pushBox('g_part_kitchen_e', 7.9, 1.95, -0.5, 8.2, 3.95, 0.24, 'wall_in');
  pushBox('g_part_kitchen_lintel', 3.05, 3.2, -0.5, 1.5, 1.45, 0.24, 'wall_in');

  pushBox('g_part_bath_n', 4.6, 1.95, 0.65, 0.24, 3.95, 2.3, 'wall_in');
  pushBox('g_part_bath_s', 4.6, 1.95, 5.9, 0.24, 3.95, 5.2, 'wall_in');
  pushBox('g_part_bath_lintel', 4.6, 3.2, 2.55, 0.24, 1.45, 1.5, 'wall_in');

  pushBox('g_stair_wall_e', 1.65, 1.95, -5.75, 0.24, 3.95, 7.5, 'wall_in');
  pushBox('g_stair_front_w', -1.6, 1.95, -2.0, 1.6, 3.95, 0.24, 'wall_in');
  pushBox('g_stair_front_e', 1.18, 1.95, -2.0, 0.94, 3.95, 0.24, 'wall_in');
  pushBox('g_stair_front_lintel', -0.05, 3.2, -2.0, 1.5, 1.45, 0.24, 'wall_in');

  // ==================== SECOND FLOOR RUMAH GURITA (Y = 4.0 .. 8.0) ====================
  pushBox('s_floor_west', -6.825, 3.92, -0.5, 10.35, 0.16, 18.0, 'floor_wood', false, false);
  pushBox('s_floor_south', -0.05, 3.92, 3.25, 3.2, 0.16, 10.5, 'floor_wood', false, false);
  pushBox('s_floor_north_cap', -0.05, 3.92, -8.55, 3.2, 0.16, 1.9, 'floor_wood', false, false);
  pushBox('s_floor_east', 6.775, 3.92, -0.5, 10.45, 0.16, 18.0, 'floor_tile', false, false);
  pushBox('s_floor_wing_e', 13.5, 3.92, 3.75, 3.0, 0.16, 9.5, 'floor_tile', false, false);

  // Dinding Luar Lantai 2 (L-shape mengikuti lantai 1)
  pushBox('s_wall_north', 0, 5.95, -9.5, 24.28, 3.95, 0.28, 'wall_out');
  pushBox('s_wall_south', 1.5, 5.95, HOUSE_FRONT_Z, 27.28, 3.95, 0.28, 'wall_out');
  pushBox('s_wall_east_n', 12.0, 5.95, -5.25, 0.28, 3.95, 8.5, 'wall_out');
  pushBox('s_wall_east_step', 13.5, 5.95, -1.0, 3.28, 3.95, 0.28, 'wall_out');
  pushBox('s_wall_east_s', 15.0, 5.95, 3.75, 0.28, 3.95, 9.5, 'wall_out');
  pushBox('s_wall_west_n', -12.0, 5.95, -5.55, 0.28, 3.95, 7.9, 'wall_out');
  pushBox('s_wall_west_s', -12.0, 5.95, 5.05, 0.28, 3.95, 6.9, 'wall_out');
  pushBox('s_bay_w_back', -13.9, 5.95, 0.0, 0.25, 3.95, 3.4, 'wall_out');
  pushBox('s_bay_w_n', -12.95, 5.95, -1.6, 2.0, 3.95, 0.25, 'wall_out');
  pushBox('s_bay_w_s', -12.95, 5.95, 1.6, 2.0, 3.95, 0.25, 'wall_out');

  // Pagar lubang tangga 1 -> 2
  pushBox('s_rail_w', -1.65, 4.5, -4.8, 0.16, 0.95, 5.6, 'parapet', true, false);
  pushBox('s_rail_e', 1.55, 4.5, -4.8, 0.16, 0.95, 5.6, 'parapet', true, false);
  pushBox('s_rail_s', -0.05, 4.5, -1.95, 3.2, 0.95, 0.16, 'parapet', true, false);

  // Akses Tangga Atap Lantai 2 (X: 2.4..3.9, Z = -2.0)
  pushBox('s_stair_roof_side_w', 2.075, 5.95, -2.0, 0.65, 3.95, 0.24, 'wall_in');
  pushBox('s_stair_roof_side_e', 4.375, 5.95, -2.0, 0.95, 3.95, 0.24, 'wall_in');
  pushBox('s_stair_roof_lintel', 3.15, 7.2, -2.0, 1.5, 1.45, 0.24, 'wall_in');
  pushBox('s_stair_wall_e', 4.85, 5.95, -5.75, 0.24, 3.95, 7.5, 'wall_in');

  // Sekat Interior Lantai 2
  pushBox('s_part_lounge_n', -2.4, 5.95, -4.5, 0.24, 3.95, 10.0, 'wall_in');
  pushBox('s_part_lounge_s', -2.4, 5.95, 5.3, 0.24, 3.95, 6.4, 'wall_in');
  pushBox('s_part_lounge_lintel', -2.4, 7.2, 1.3, 0.24, 1.45, 1.6, 'wall_in');

  pushBox('s_part_nw_w', -9.1, 5.95, -2.6, 5.8, 3.95, 0.24, 'wall_in');
  pushBox('s_part_nw_e', -3.55, 5.95, -2.6, 2.3, 3.95, 0.24, 'wall_in');
  pushBox('s_part_nw_lintel', -5.45, 7.2, -2.6, 1.5, 1.45, 0.24, 'wall_in');

  pushBox('s_part_se_w', 2.3, 5.95, 0.5, 1.0, 3.95, 0.24, 'wall_in');
  pushBox('s_part_se_e', 9.65, 5.95, 0.5, 10.7, 3.95, 0.24, 'wall_in');
  pushBox('s_part_se_lintel', 3.55, 7.2, 0.5, 1.5, 1.45, 0.24, 'wall_in');

  // Tembok Rapuh Lantai 2 menutup ruangan rahasia Timur (X = 7.2, Z: 0.6..8.4)
  pushBox('s_crumble_wall', 7.2, 5.95, 4.5, 0.28, 3.95, 7.8, 'crumble', true, true);

  // ==================== ROOFTOP (Y = 8.0) L-SHAPE + PENTHOUSE TANGGA ATAP ====================
  pushBox('r_floor_west', -5.075, 7.92, -0.5, 13.85, 0.16, 18.0, 'floor_roof', false, false);
  pushBox('r_floor_south', 3.3, 7.92, 3.25, 2.9, 0.16, 10.5, 'floor_roof', false, false);
  pushBox('r_floor_north_cap', 3.3, 7.92, -8.15, 2.9, 0.16, 2.7, 'floor_roof', false, false);
  pushBox('r_floor_east', 8.375, 7.92, -0.5, 7.25, 0.16, 18.0, 'floor_roof', false, false);
  pushBox('r_floor_wing_e', 13.5, 7.92, 3.75, 3.0, 0.16, 9.5, 'floor_roof', false, false);

  pushBox('r_para_n', 0, 8.58, -9.5, 24.28, 1.2, 0.28, 'parapet');
  pushBox('r_para_s', 1.5, 8.58, HOUSE_FRONT_Z, 27.28, 1.2, 0.28, 'parapet');
  pushBox('r_para_w', -12.0, 8.58, -0.5, 0.28, 1.2, 18.0, 'parapet');
  pushBox('r_para_e_n', 12.0, 8.58, -5.25, 0.28, 1.2, 8.5, 'parapet');
  pushBox('r_para_e_step', 13.5, 8.58, -1.0, 3.28, 1.2, 0.28, 'parapet');
  pushBox('r_para_e_s', 15.0, 8.58, 3.75, 0.28, 1.2, 9.5, 'parapet');

  // Rumah Tangga Rooftop (Penthouse tangga): bukaan pintu keluar Barat di Z: -8.3..-6.8
  pushBox('r_pent_wall_e', 4.75, 9.45, -5.2, 0.24, 2.9, 6.6, 'wall_out');
  pushBox('r_pent_wall_s', 3.3, 9.45, -1.95, 2.9, 2.9, 0.24, 'wall_out');
  pushBox('r_pent_wall_ws', 1.85, 9.45, -4.375, 0.24, 2.9, 4.85, 'wall_out');
  pushBox('r_pent_door_lintel', 1.85, 10.68, -7.55, 0.24, 0.44, 1.5, 'wall_out');
  pushBox('r_pent_roof', 3.3, 10.95, -5.2, 3.2, 0.2, 6.8, 'wall_out', false, false);

  // Kolam Rooftop (pusat -7.5, -5.6)
  pushBox('r_pool_rim_n', -7.5, 8.25, -7.4, 4.4, 0.55, 0.28, 'parapet');
  pushBox('r_pool_rim_s', -7.5, 8.25, -3.8, 4.4, 0.55, 0.28, 'parapet');
  pushBox('r_pool_rim_w', -9.6, 8.25, -5.6, 0.28, 0.55, 3.6, 'parapet');
  pushBox('r_pool_rim_e', -5.4, 8.25, -5.6, 0.28, 0.55, 3.6, 'parapet');

  // Ruang Rahasia Pusaka Kujang Rooftop (sayap timur)
  pushBox('r_shrine_wall_n', 9.5, 9.0, -1.2, 5.0, 2.0, 0.26, 'parapet');
  pushBox('r_shrine_wall_s', 9.5, 9.0, 2.8, 5.0, 2.0, 0.26, 'parapet');
  pushBox('r_crumble_wall', 7.0, 9.0, 0.8, 0.28, 2.0, 4.0, 'crumble', true, true);

  // ==================== COLLIDER SOLID UNTUK SEMUA OBJEK DUNIA & FURNITUR ====================
  // 1. Warung Ceu Titin
  pushSolidCollider('warung_back', WARUNG_POS.x - 2.5, 0, WARUNG_POS.z, 0.36, 3.1, 6.8, true);
  pushSolidCollider('warung_side_n', WARUNG_POS.x - 0.7, 0, WARUNG_POS.z - 3.3, 3.8, 3.1, 0.36, true);
  pushSolidCollider('warung_side_s', WARUNG_POS.x - 0.7, 0, WARUNG_POS.z + 3.3, 3.8, 3.1, 0.36, true);
  pushSolidCollider('warung_counter', WARUNG_POS.x - 0.35, 0, WARUNG_POS.z, 0.92, 1.5, 4.65, false);
  pushSolidCollider('warung_table_n', WARUNG_POS.x + 1.85, 0, WARUNG_POS.z - 1.5, 0.8, 0.85, 2.15, false);
  pushSolidCollider('warung_table_s', WARUNG_POS.x + 1.85, 0, WARUNG_POS.z + 1.5, 0.8, 0.85, 2.15, false);
  pushSolidCollider('warung_bench_n', WARUNG_POS.x + 2.58, 0, WARUNG_POS.z - 1.5, 0.48, 0.55, 2.05, false);
  pushSolidCollider('warung_bench_s', WARUNG_POS.x + 2.58, 0, WARUNG_POS.z + 1.5, 0.48, 0.55, 2.05, false);
  for (const pz of [-3.3, 0, 3.3]) {
    pushSolidCollider(`warung_post_${pz}`, WARUNG_POS.x + 3.45, 0, WARUNG_POS.z + pz, 0.25, 3.2, 0.25, false);
  }

  // 2. Baliho Windah Basudara
  const bCos = Math.cos(BILLBOARD_POS.rotY);
  const bSin = Math.sin(BILLBOARD_POS.rotY);
  for (const lx of [-1.8, 1.8]) {
    pushSolidCollider(
      `billboard_leg_${lx}`,
      BILLBOARD_POS.x + lx * bCos,
      0,
      BILLBOARD_POS.z - lx * bSin,
      0.72,
      6.6,
      0.72,
      false
    );
  }

  // 3. Kolam Renang Halaman Depan Rumah Gurita + Kendaraan Carport
  pushSolidCollider(
    'courtyard_pool_basin',
    COURTYARD_POOL_POS.x - 0.35,
    0,
    COURTYARD_POOL_POS.z,
    10.4,
    1.15,
    6.1,
    false
  );
  for (const v of CARPORT_VEHICLES) {
    if (v.kind === 'sedan') {
      pushSolidCollider(v.id, v.x, 0, v.z, 1.86, 1.65, 4.18, true);
    } else {
      pushSolidCollider(v.id, v.x, 0, v.z, 0.78, 1.15, 1.95, false);
    }
  }

  // 4. Gerobak Pedagang
  for (const c of CART_PLACEMENTS) {
    pushSolidCollider(c.id, c.x, 0, c.z, 2.1, 2.45, 1.35, true);
  }

  // 5. Pos Ronda
  pushSolidCollider('pos_ronda_back', POS_RONDA_POS.x - 1.45, 0, POS_RONDA_POS.z, 0.3, 2.6, 3.0, true);
  pushSolidCollider('pos_ronda_bench', POS_RONDA_POS.x - 0.95, 0, POS_RONDA_POS.z, 0.72, 0.75, 2.45, false);
  for (const sx of [-1.45, 1.45]) {
    for (const sz of [-1.25, 1.25]) {
      pushSolidCollider(`pos_ronda_post_${sx}_${sz}`, POS_RONDA_POS.x + sx, 0, POS_RONDA_POS.z + sz, 0.28, 2.6, 0.28, false);
    }
  }

  // 6. Semua NPC Luar
  pushSolidCollider('npc_col_satpam', -9.1, 0, 35.0, 0.62, 1.75, 0.62, false);
  pushSolidCollider('npc_col_nasgor', -5.2, 0, 32.2, 0.62, 1.75, 0.62, false);
  pushSolidCollider('npc_col_pecel', 5.2, 0, 32.2, 0.62, 1.75, 0.62, false);
  pushSolidCollider('npc_col_warung_ibu', WARUNG_POS.x - 1.35, 0, WARUNG_POS.z, 0.62, 1.75, 0.62, false);
  pushSolidCollider('npc_col_pemuda_1', WARUNG_POS.x + 2.55, 0, WARUNG_POS.z - 1.5, 0.6, 1.45, 0.6, false);
  pushSolidCollider('npc_col_pemuda_2', WARUNG_POS.x + 2.55, 0, WARUNG_POS.z + 1.2, 0.6, 1.45, 0.6, false);
  pushSolidCollider('npc_col_pemuda_3', WARUNG_POS.x + 3.7, 0, WARUNG_POS.z + 2.4, 0.6, 1.75, 0.6, false);

  // 7. Batang semua Pohon & Tiang Lampu Jalan
  TREE_PLACEMENTS.forEach((t, idx) => {
    const trunkSize = 0.68 * t.scale;
    pushSolidCollider(`tree_trunk_${idx}`, t.x, 0, t.z, trunkSize, 3.8, trunkSize, false);
  });
  LAMP_POSITIONS.forEach((l, idx) => {
    pushSolidCollider(`lamp_pole_${idx}`, l.x, 0, l.z, 0.42, 5.2, 0.42, false);
  });

  // 8. Landmark Rooftop
  pushSolidCollider('r_octopus_base', -8.0, FLOOR_HEIGHT * 2, 5.2, 4.2, 3.8, 4.2, true);
  pushSolidCollider('r_radio_tower_base', -0.5, FLOOR_HEIGHT * 2, -7.2, 1.35, 3.6, 1.35, true);
  pushSolidCollider('r_kujang_pedestal', 9.6, FLOOR_HEIGHT * 2, 0.8, 1.1, 1.8, 1.1, false);

  // 9. Semua Furnitur Interior
  for (const f of FURNITURE_SPECS) {
    pushSolidCollider(f.id, f.x, f.y, f.z, f.w, f.h, f.d, f.h >= 1.6);
  }

  return { visuals, colliders };
}

export function createInitialDoors(): DoorData[] {
  const doors: DoorData[] = [
    // --- GERBANG HALAMAN DALAM RUMAH GURITA ---
    {
      id: 'door_gerbang_utama',
      label: 'Gerbang Utama Halaman Rumah Gurita',
      floor: 'outside',
      hingePos: { x: -6.8, y: 0, z: COMPOUND_GATE_Z },
      width: 2.6,
      height: 2.0,
      thickness: 0.14,
      closedAngle: 0,
      openAngle: Math.PI * 0.48,
      currentAngle: 0,
      targetAngle: 0,
      isOpen: false,
      closedCenter: { x: -5.5, y: 1.0, z: COMPOUND_GATE_Z },
      closedSize: { x: 2.6, y: 2.0, z: 0.24 },
    },
    {
      id: 'door_gerbang_garasi',
      label: 'Gerbang Garasi Mobil Rumah Gurita',
      floor: 'outside',
      hingePos: { x: -15.4, y: 0, z: COMPOUND_GATE_Z },
      width: 3.6,
      height: 2.05,
      thickness: 0.14,
      closedAngle: 0,
      openAngle: Math.PI * 0.48,
      currentAngle: 0,
      targetAngle: 0,
      isOpen: false,
      closedCenter: { x: -13.6, y: 1.025, z: COMPOUND_GATE_Z },
      closedSize: { x: 3.6, y: 2.05, z: 0.24 },
    },

    // --- RUMAH GURITA LANTAI DASAR ---
    {
      id: 'door_main_entry',
      label: 'Pintu Utama Rumah Gurita',
      floor: 'ground',
      hingePos: { x: -7.8, y: 0, z: HOUSE_FRONT_Z },
      width: 1.6,
      height: 2.48,
      thickness: 0.12,
      closedAngle: 0,
      openAngle: Math.PI * 0.48,
      currentAngle: 0,
      targetAngle: 0,
      isOpen: false,
      closedCenter: { x: -7.0, y: 1.24, z: HOUSE_FRONT_Z },
      closedSize: { x: 1.6, y: 2.48, z: 0.2 },
    },
    {
      id: 'door_g_stair',
      label: 'Pintu Tangga Lantai 2',
      floor: 'ground',
      hingePos: { x: -0.8, y: 0, z: -2.0 },
      width: 1.5,
      height: 2.48,
      thickness: 0.12,
      closedAngle: 0,
      openAngle: -Math.PI * 0.48,
      currentAngle: 0,
      targetAngle: 0,
      isOpen: false,
      closedCenter: { x: -0.05, y: 1.24, z: -2.0 },
      closedSize: { x: 1.5, y: 2.48, z: 0.2 },
    },
    {
      id: 'door_g_lounge',
      label: 'Pintu Ruang Tengah',
      floor: 'ground',
      hingePos: { x: -2.4, y: 0, z: 0.6 },
      width: 1.6,
      height: 2.48,
      thickness: 0.12,
      closedAngle: -Math.PI / 2,
      openAngle: -Math.PI * 0.04,
      currentAngle: -Math.PI / 2,
      targetAngle: -Math.PI / 2,
      isOpen: false,
      closedCenter: { x: -2.4, y: 1.24, z: 1.4 },
      closedSize: { x: 0.2, y: 2.48, z: 1.6 },
    },
    {
      id: 'door_g_kitchen',
      label: 'Pintu Dapur Utara',
      floor: 'ground',
      hingePos: { x: 2.3, y: 0, z: -0.5 },
      width: 1.5,
      height: 2.48,
      thickness: 0.12,
      closedAngle: 0,
      openAngle: Math.PI * 0.48,
      currentAngle: 0,
      targetAngle: 0,
      isOpen: false,
      lockedKeyId: 'key_dapur',
      lockedKeyLabel: 'Kunci Dapur',
      closedCenter: { x: 3.05, y: 1.24, z: -0.5 },
      closedSize: { x: 1.5, y: 2.48, z: 0.2 },
    },
    {
      id: 'door_g_bath',
      label: 'Pintu Kamar Tenggara',
      floor: 'ground',
      hingePos: { x: 4.6, y: 0, z: 1.8 },
      width: 1.5,
      height: 2.48,
      thickness: 0.12,
      closedAngle: -Math.PI / 2,
      openAngle: -Math.PI * 0.96,
      currentAngle: -Math.PI / 2,
      targetAngle: -Math.PI / 2,
      isOpen: false,
      closedCenter: { x: 4.6, y: 1.24, z: 2.55 },
      closedSize: { x: 0.2, y: 2.48, z: 1.5 },
    },

    // --- RUMAH GURITA LANTAI 2 ---
    {
      id: 'door_s_lounge',
      label: 'Pintu Ruang Keluarga Lt.2',
      floor: 'second',
      hingePos: { x: -2.4, y: FLOOR_HEIGHT, z: 0.5 },
      width: 1.6,
      height: 2.48,
      thickness: 0.12,
      closedAngle: -Math.PI / 2,
      openAngle: -Math.PI * 0.04,
      currentAngle: -Math.PI / 2,
      targetAngle: -Math.PI / 2,
      isOpen: false,
      closedCenter: { x: -2.4, y: FLOOR_HEIGHT + 1.24, z: 1.3 },
      closedSize: { x: 0.2, y: 2.48, z: 1.6 },
    },
    {
      id: 'door_s_nw',
      label: 'Pintu Kamar Utama Lt.2',
      floor: 'second',
      hingePos: { x: -6.2, y: FLOOR_HEIGHT, z: -2.6 },
      width: 1.5,
      height: 2.48,
      thickness: 0.12,
      closedAngle: 0,
      openAngle: Math.PI * 0.48,
      currentAngle: 0,
      targetAngle: 0,
      isOpen: false,
      lockedKeyId: 'key_kamar2',
      lockedKeyLabel: 'Kunci Kamar Lt.2',
      closedCenter: { x: -5.45, y: FLOOR_HEIGHT + 1.24, z: -2.6 },
      closedSize: { x: 1.5, y: 2.48, z: 0.2 },
    },
    {
      id: 'door_s_se',
      label: 'Pintu Kamar Timur Lt.2',
      floor: 'second',
      hingePos: { x: 2.8, y: FLOOR_HEIGHT, z: 0.5 },
      width: 1.5,
      height: 2.48,
      thickness: 0.12,
      closedAngle: 0,
      openAngle: -Math.PI * 0.48,
      currentAngle: 0,
      targetAngle: 0,
      isOpen: false,
      closedCenter: { x: 3.55, y: FLOOR_HEIGHT + 1.24, z: 0.5 },
      closedSize: { x: 1.5, y: 2.48, z: 0.2 },
    },
    {
      id: 'door_s_roof',
      label: 'Pintu Tangga Menuju Rooftop',
      floor: 'second',
      hingePos: { x: 2.4, y: FLOOR_HEIGHT, z: -2.0 },
      width: 1.5,
      height: 2.48,
      thickness: 0.12,
      closedAngle: 0,
      openAngle: -Math.PI * 0.48,
      currentAngle: 0,
      targetAngle: 0,
      isOpen: false,
      lockedKeyId: 'key_atap',
      lockedKeyLabel: 'Kunci Pintu Atap',
      closedCenter: { x: 3.15, y: FLOOR_HEIGHT + 1.24, z: -2.0 },
      closedSize: { x: 1.5, y: 2.48, z: 0.2 },
    },

    // --- PINTU KELUAR TANGGA ROOFTOP ---
    {
      id: 'door_roof_exit',
      label: 'Pintu Keluar Dek Rooftop',
      floor: 'roof',
      hingePos: { x: 1.85, y: FLOOR_HEIGHT * 2, z: -6.8 },
      width: 1.5,
      height: 2.48,
      thickness: 0.12,
      closedAngle: Math.PI / 2,
      openAngle: Math.PI * 0.98,
      currentAngle: Math.PI / 2,
      targetAngle: Math.PI / 2,
      isOpen: false,
      closedCenter: { x: 1.85, y: FLOOR_HEIGHT * 2 + 1.24, z: -7.55 },
      closedSize: { x: 0.2, y: 2.48, z: 1.5 },
    },

    // --- MASJID & RUMAH TETANGGA ---
    {
      id: 'door_masjid',
      label: 'Pintu Masjid Al-Ikhlas',
      floor: 'outside',
      hingePos: { x: MOSQUE_POS.x - 5.2, y: 0.12, z: MOSQUE_POS.z - 0.8 },
      width: 1.6,
      height: 2.5,
      thickness: 0.12,
      closedAngle: -Math.PI / 2,
      openAngle: -Math.PI * 0.96,
      currentAngle: -Math.PI / 2,
      targetAngle: -Math.PI / 2,
      isOpen: false,
      closedCenter: { x: MOSQUE_POS.x - 5.2, y: 1.37, z: MOSQUE_POS.z },
      closedSize: { x: 0.2, y: 2.5, z: 1.6 },
    },
  ];

  for (const h of NEIGHBORHOOD_HOUSES) {
    const hw = h.w * 0.5;
    const hd = h.d * 0.5;
    const dw = Math.min(1.4, h.w * 0.7, h.d * 0.7);
    if (h.rotY === Math.PI / 2) {
      doors.push({
        id: `door_${h.id}`,
        label: `Pintu Rumah Warga (${h.id.toUpperCase()})`,
        floor: 'outside',
        hingePos: { x: h.x + hw, y: 0, z: h.z - dw * 0.5 },
        width: dw,
        height: 2.4,
        thickness: 0.12,
        closedAngle: -Math.PI / 2,
        openAngle: -Math.PI * 0.04,
        currentAngle: -Math.PI / 2,
        targetAngle: -Math.PI / 2,
        isOpen: false,
        closedCenter: { x: h.x + hw, y: 1.2, z: h.z },
        closedSize: { x: 0.2, y: 2.4, z: dw },
      });
    } else if (h.rotY === -Math.PI / 2) {
      doors.push({
        id: `door_${h.id}`,
        label: `Pintu Rumah Warga (${h.id.toUpperCase()})`,
        floor: 'outside',
        hingePos: { x: h.x - hw, y: 0, z: h.z - dw * 0.5 },
        width: dw,
        height: 2.4,
        thickness: 0.12,
        closedAngle: -Math.PI / 2,
        openAngle: -Math.PI * 0.96,
        currentAngle: -Math.PI / 2,
        targetAngle: -Math.PI / 2,
        isOpen: false,
        closedCenter: { x: h.x - hw, y: 1.2, z: h.z },
        closedSize: { x: 0.2, y: 2.4, z: dw },
      });
    } else if (h.rotY === 0) {
      doors.push({
        id: `door_${h.id}`,
        label: `Pintu Rumah Warga (${h.id.toUpperCase()})`,
        floor: 'outside',
        hingePos: { x: h.x - dw * 0.5, y: 0, z: h.z + hd },
        width: dw,
        height: 2.4,
        thickness: 0.12,
        closedAngle: 0,
        openAngle: -Math.PI * 0.48,
        currentAngle: 0,
        targetAngle: 0,
        isOpen: false,
        closedCenter: { x: h.x, y: 1.2, z: h.z + hd },
        closedSize: { x: dw, y: 2.4, z: 0.2 },
      });
    } else {
      doors.push({
        id: `door_${h.id}`,
        label: `Pintu Rumah Warga (${h.id.toUpperCase()})`,
        floor: 'outside',
        hingePos: { x: h.x - dw * 0.5, y: 0, z: h.z - hd },
        width: dw,
        height: 2.4,
        thickness: 0.12,
        closedAngle: 0,
        openAngle: Math.PI * 0.48,
        currentAngle: 0,
        targetAngle: 0,
        isOpen: false,
        closedCenter: { x: h.x, y: 1.2, z: h.z - hd },
        closedSize: { x: dw, y: 2.4, z: 0.2 },
      });
    }
  }

  return doors;
}

export function createInitialInteractables(): InteractableItem[] {
  return [
    {
      id: 'npc_warung_ibu',
      kind: 'npc',
      label: 'Ceu Titin (Pemilik Warung)',
      prompt: '[E] Bicara dengan Ceu Titin (Pemilik Warung)',
      position: { x: WARUNG_POS.x + 0.55, y: 0.0, z: WARUNG_POS.z },
      floor: 'outside',
      payloadId: 'warung_ibu',
    },
    {
      id: 'npc_warung_pemuda',
      kind: 'npc',
      label: 'Rizky & Anak Muda Warung Ceu Titin',
      prompt: '[E] Ngobrol dengan Anak Muda Warung Ceu Titin',
      position: { x: WARUNG_POS.x + 3.55, y: 0.0, z: WARUNG_POS.z + 1.3 },
      floor: 'outside',
      payloadId: 'warung_pemuda',
    },
    {
      id: 'npc_satpam',
      kind: 'npc',
      label: 'Pak Ujang (Satpam Pos Ronda)',
      prompt: '[E] Bicara dengan Pak Ujang (Pos Ronda)',
      position: { x: -9.1, y: 0.0, z: 35.0 },
      floor: 'outside',
      payloadId: 'satpam',
    },
    {
      id: 'npc_nasgor',
      kind: 'npc',
      label: 'Mang Asep (Nasi Goreng)',
      prompt: '[E] Bicara dengan Tukang Nasi Goreng',
      position: { x: -5.2, y: 0.0, z: 32.2 },
      floor: 'outside',
      payloadId: 'nasgor',
    },
    {
      id: 'npc_pecel',
      kind: 'npc',
      label: 'Mas Budi (Pecel Lele)',
      prompt: '[E] Bicara dengan Tukang Pecel Lele',
      position: { x: 5.2, y: 0.0, z: 32.2 },
      floor: 'outside',
      payloadId: 'pecel',
    },

    // 3 KUNCI RUANGAN TERKUNCI
    {
      id: 'pickup_key_dapur',
      kind: 'key',
      label: 'Kunci Dapur',
      prompt: '[E] Ambil Kunci Dapur',
      position: { x: -7.2, y: 0.56, z: -5.2 },
      floor: 'ground',
      payloadId: 'key_dapur',
    },
    {
      id: 'pickup_key_kamar2',
      kind: 'key',
      label: 'Kunci Kamar Lt.2',
      prompt: '[E] Ambil Kunci Kamar Lt.2',
      position: { x: 7.2, y: 0.96, z: -8.7 },
      floor: 'ground',
      payloadId: 'key_kamar2',
    },
    {
      id: 'pickup_key_atap',
      kind: 'key',
      label: 'Kunci Pintu Atap',
      prompt: '[E] Ambil Kunci Pintu Atap',
      position: { x: -3.5, y: 4.82, z: -8.75 },
      floor: 'second',
      payloadId: 'key_atap',
    },

    // 6 BUKTI FAKTA (1 per Segel Rumor)
    {
      id: 'ev_akta',
      kind: 'evidence',
      label: 'Akta & Catatan Arsitektur 1984',
      prompt: '[E] Ambil Bukti: Akta Arsitektur 1984',
      position: { x: -7.2, y: 0.84, z: 2.6 },
      floor: 'ground',
      payloadId: 'rumor_666',
    },
    {
      id: 'ev_penjaga',
      kind: 'evidence',
      label: 'Buku Log Penjaga & Kerabat',
      prompt: '[E] Ambil Bukti: Buku Log Penjaga',
      position: { x: 7.2, y: 0.82, z: -4.6 },
      floor: 'ground',
      payloadId: 'rumor_penghuni',
    },
    {
      id: 'ev_faktur_patung',
      kind: 'evidence',
      label: 'Faktur Properti Seni Kelautan',
      prompt: '[E] Ambil Bukti UV: Faktur Patung Gurita',
      position: { x: 7.2, y: 0.82, z: 7.75 },
      floor: 'ground',
      requiresUV: true,
      payloadId: 'rumor_gurita',
    },
    {
      id: 'ev_kuitansi_boneka',
      kind: 'evidence',
      label: 'Catatan Koleksi Boneka Antik',
      prompt: '[E] Ambil Bukti: Catatan Koleksi Antik',
      position: { x: -7.2, y: 4.82, z: 2.6 },
      floor: 'second',
      payloadId: 'rumor_uci',
    },
    {
      id: 'ev_cetak_biru',
      kind: 'evidence',
      label: 'Cetak Biru Kolam & Radio',
      prompt: '[E] Ambil Bukti: Cetak Biru Rooftop',
      position: { x: 10.6, y: 4.82, z: 2.2 },
      floor: 'second',
      payloadId: 'rumor_kolam',
    },
    {
      id: 'ev_rekaman_rani',
      kind: 'evidence',
      label: 'Rekaman Siaran Rani',
      prompt: '[E] Ambil Bukti: Ponsel & Rekaman Rani',
      position: { x: -7.4, y: 8.2, z: -3.0 },
      floor: 'roof',
      payloadId: 'rumor_gereja',
    },

    // TEMPAT PERSEMBUNYIAN
    {
      id: 'hide_ground_lounge',
      kind: 'hiding',
      label: 'Lemari Ruang Tamu',
      prompt: '[E] Sembunyi di Lemari',
      position: { x: -10.4, y: 0.0, z: -7.0 },
      floor: 'ground',
    },
    {
      id: 'hide_ground_kitchen',
      kind: 'hiding',
      label: 'Lemari Dapur',
      prompt: '[E] Sembunyi di Lemari Dapur',
      position: { x: 10.4, y: 0.0, z: -5.8 },
      floor: 'ground',
    },
    {
      id: 'hide_ground_bedroom',
      kind: 'hiding',
      label: 'Lemari Kamar Tenggara',
      prompt: '[E] Sembunyi di Lemari Kamar',
      position: { x: 13.4, y: 0.0, z: 2.0 },
      floor: 'ground',
    },
    {
      id: 'hide_second_hall',
      kind: 'hiding',
      label: 'Lemari Pakaian Lt.2',
      prompt: '[E] Sembunyi di Lemari',
      position: { x: -10.4, y: FLOOR_HEIGHT, z: 6.2 },
      floor: 'second',
    },
    {
      id: 'hide_second_nw',
      kind: 'hiding',
      label: 'Lemari Kamar Utama Lt.2',
      prompt: '[E] Sembunyi di Lemari Kamar',
      position: { x: -10.4, y: FLOOR_HEIGHT, z: -7.2 },
      floor: 'second',
    },

    // BATERAI TERPISAH & GARAM
    {
      id: 'bat_flash_ground',
      kind: 'battery_flashlight',
      label: 'Baterai Senter (+50%)',
      prompt: '[E] Ambil Baterai Senter (+50%)',
      position: { x: 1.8, y: 0.45, z: 6.6 },
      floor: 'ground',
    },
    {
      id: 'bat_uv_ground',
      kind: 'battery_uv',
      label: 'Baterai Kamera UV (+50%)',
      prompt: '[E] Ambil Baterai Kamera UV (+50%)',
      position: { x: -0.6, y: 0.45, z: 6.6 },
      floor: 'ground',
    },
    {
      id: 'salt_ground',
      kind: 'salt',
      label: 'Garam Pengusir',
      prompt: '[E] Ambil Garam (+1)',
      position: { x: 10.2, y: 0.45, z: -2.4 },
      floor: 'ground',
    },
    {
      id: 'bat_flash_second',
      kind: 'battery_flashlight',
      label: 'Baterai Senter (+50%)',
      prompt: '[E] Ambil Baterai Senter (+50%)',
      position: { x: -4.0, y: FLOOR_HEIGHT + 0.45, z: -0.6 },
      floor: 'second',
    },
    {
      id: 'bat_uv_second',
      kind: 'battery_uv',
      label: 'Baterai Kamera UV (+50%)',
      prompt: '[E] Ambil Baterai Kamera UV (+50%)',
      position: { x: -5.2, y: FLOOR_HEIGHT + 0.45, z: -6.4 },
      floor: 'second',
    },
    {
      id: 'salt_second',
      kind: 'salt',
      label: 'Garam Pengusir',
      prompt: '[E] Ambil Garam (+1)',
      position: { x: 9.2, y: FLOOR_HEIGHT + 0.45, z: -5.2 },
      floor: 'second',
    },

    // PUZZLE & PUSAKA
    {
      id: 'crumble_second',
      kind: 'crumbling_wall',
      label: 'Tembok Rapuh Lantai 2',
      prompt: '[E] Runtuhkan Tembok Rapuh (Butuh >= 2 Segel Fakta)',
      position: { x: 6.4, y: FLOOR_HEIGHT + 1.0, z: 4.5 },
      floor: 'second',
      payloadId: 's_crumble_wall',
    },
    {
      id: 'radio_tower',
      kind: 'radio_tower',
      label: 'Menara Radio Rooftop',
      prompt: '[E] Setel Frekuensi Menara Radio (Cari Sinyal Rani)',
      position: { x: -0.5, y: FLOOR_HEIGHT * 2 + 0.6, z: -5.8 },
      floor: 'roof',
    },
    {
      id: 'crumble_roof',
      kind: 'crumbling_wall',
      label: 'Tembok Rapuh Pusaka Atap',
      prompt: '[E] Buka Tembok Pusaka (3+ Segel Fakta)',
      position: { x: 6.3, y: FLOOR_HEIGHT * 2 + 0.8, z: 0.8 },
      floor: 'roof',
      payloadId: 'r_crumble_wall',
    },
    {
      id: 'kujang_shrine',
      kind: 'kujang',
      label: 'Pusaka Kujang Pamungkas',
      prompt: '[E] Ambil Kujang Pamungkas & Putus Dimensi Gaib',
      position: { x: 9.6, y: FLOOR_HEIGHT * 2 + 0.8, z: 0.8 },
      floor: 'roof',
    },
  ];
}

export function createInitialGhosts(): GhostData[] {
  return [
    {
      id: 'ghost_kuntilanak',
      kind: 'kuntilanak',
      name: 'Kuntilanak',
      floor: 'ground',
      position: { x: 0.2, y: 0.0, z: 2.2 },
      yaw: 0,
      state: 'patrol',
      homePos: { x: 0.2, y: 0.0, z: 2.2 },
      waypoints: [
        { x: 0.2, y: 0.0, z: 2.2 },
        { x: 3.2, y: 0.0, z: 5.0 },
        { x: 3.2, y: 0.0, z: 0.8 },
        { x: -1.0, y: 0.0, z: 5.2 },
      ],
      waypointIndex: 1,
      targetPos: { x: 3.2, y: 0.0, z: 5.0 },
      alertTimer: 0,
      stunTimer: 0,
      speed: 2.45,
      active: true,
    },
    {
      id: 'ghost_pocong',
      kind: 'pocong',
      name: 'Pocong',
      floor: 'ground',
      position: { x: -4.8, y: 0.0, z: -3.5 },
      yaw: 0,
      state: 'patrol',
      homePos: { x: -4.8, y: 0.0, z: -3.5 },
      waypoints: [
        { x: -4.8, y: 0.0, z: -3.5 },
        { x: -4.5, y: 0.0, z: 5.2 },
        { x: -9.5, y: 0.0, z: 5.2 },
      ],
      waypointIndex: 1,
      targetPos: { x: -4.5, y: 0.0, z: 5.2 },
      alertTimer: 0,
      stunTimer: 0,
      speed: 2.15,
      active: true,
    },
    {
      id: 'ghost_boneka_uci',
      kind: 'boneka_uci',
      name: 'Boneka Uci',
      floor: 'second',
      position: { x: -4.6, y: FLOOR_HEIGHT, z: 5.0 },
      yaw: 0,
      state: 'patrol',
      homePos: { x: -4.6, y: FLOOR_HEIGHT, z: 5.0 },
      waypoints: [
        { x: -4.6, y: FLOOR_HEIGHT, z: 5.0 },
        { x: -4.2, y: FLOOR_HEIGHT, z: 0.2 },
        { x: -8.6, y: FLOOR_HEIGHT, z: 5.0 },
      ],
      waypointIndex: 1,
      targetPos: { x: -4.2, y: FLOOR_HEIGHT, z: 0.2 },
      alertTimer: 0,
      stunTimer: 0,
      speed: 2.8,
      active: true,
    },
    {
      id: 'ghost_genderuwo',
      kind: 'genderuwo',
      name: 'Genderuwo',
      floor: 'second',
      position: { x: 8.2, y: FLOOR_HEIGHT, z: -4.5 },
      yaw: 0,
      state: 'patrol',
      homePos: { x: 8.2, y: FLOOR_HEIGHT, z: -4.5 },
      waypoints: [
        { x: 8.2, y: FLOOR_HEIGHT, z: -4.5 },
        { x: 8.2, y: FLOOR_HEIGHT, z: -1.0 },
        { x: 0.2, y: FLOOR_HEIGHT, z: 3.8 },
      ],
      waypointIndex: 1,
      targetPos: { x: 8.2, y: FLOOR_HEIGHT, z: -1.0 },
      alertTimer: 0,
      stunTimer: 0,
      speed: 2.05,
      active: true,
    },
    {
      id: 'ghost_ambu_hideung',
      kind: 'ambu_hideung',
      name: 'Ambu Hideung (Boss)',
      floor: 'roof',
      position: { x: -1.8, y: FLOOR_HEIGHT * 2, z: 1.5 },
      yaw: 0,
      state: 'patrol',
      homePos: { x: -1.8, y: FLOOR_HEIGHT * 2, z: 1.5 },
      waypoints: [
        { x: -1.8, y: FLOOR_HEIGHT * 2, z: 1.5 },
        { x: -2.2, y: FLOOR_HEIGHT * 2, z: -2.4 },
        { x: 1.6, y: FLOOR_HEIGHT * 2, z: 4.5 },
        { x: 4.0, y: FLOOR_HEIGHT * 2, z: 0.8 },
      ],
      waypointIndex: 1,
      targetPos: { x: -2.2, y: FLOOR_HEIGHT * 2, z: -2.4 },
      alertTimer: 0,
      stunTimer: 0,
      speed: 2.7,
      active: true,
    },
  ];
}
