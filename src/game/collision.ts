import type { AABB, FloorId, SafeZone, StairZone, Vec3 } from './types';

/**
 * Menghitung ketinggian lantai berdasarkan posisi (x, z) pada zona tangga atau lantai dasar/2/atap.
 */
export function resolveGroundElevation(
  x: number,
  z: number,
  currentY: number,
  stairs: StairZone[],
  secondY = 4.0,
  roofY = 8.0
): number {
  for (const s of stairs) {
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) {
      // Pastikan pemain berada dekat rentang vertikal tangga ini agar lantai bawah/atas tidak salah snap
      const minStairY = Math.min(s.startY, s.endY) - 1.25;
      const maxStairY = Math.max(s.startY, s.endY) + 1.25;
      if (currentY >= minStairY && currentY <= maxStairY) {
        const span = s.endZ - s.startZ;
        const t = span === 0 ? 0 : Math.max(0, Math.min(1, (z - s.startZ) / span));
        return s.startY + (s.endY - s.startY) * t;
      }
    }
  }

  // Snap ke elevasi lantai terdekat yang sudah dicapai
  if (currentY >= roofY - 1.7) return roofY;
  if (currentY >= secondY - 1.7) return secondY;
  return 0.0;
}

export function detectFloor(y: number, z: number, secondY = 4.0, roofY = 8.0, outsideZ = 7.5): FloorId {
  if (y >= roofY - 1.7) return 'roof';
  if (y >= secondY - 1.7) return 'second';
  if (z > outsideZ) return 'outside';
  return 'ground';
}

/**
 * Menyelesaikan tabrakan silinder horizontal (radius r, tinggi playerH) terhadap daftar AABB dinding/furnitur.
 * Menerapkan sliding mulus di sepanjang sumbu yang tidak terhalang.
 */
export function resolveHorizontalCollision(
  pos: Vec3,
  radius: number,
  playerHeight: number,
  colliders: AABB[]
): Vec3 {
  let x = pos.x;
  let z = pos.z;
  const footY = pos.y + 0.15; // toleransi kecil agar tidak nyangkut lantai
  const headY = pos.y + playerHeight;

  for (let pass = 0; pass < 2; pass++) {
    for (const box of colliders) {
      if (headY <= box.minY || footY >= box.maxY) continue;

      const closestX = Math.max(box.minX, Math.min(x, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
      const dx = x - closestX;
      const dz = z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        if (distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          x += (dx / dist) * push;
          z += (dz / dist) * push;
        } else {
          // Pusat tepat di dalam AABB: dorong keluar lewat sisi terdekat
          const overlapLeft = Math.abs(x - box.minX);
          const overlapRight = Math.abs(box.maxX - x);
          const overlapTop = Math.abs(z - box.minZ);
          const overlapBottom = Math.abs(box.maxZ - z);
          const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
          if (minOverlap === overlapLeft) x = box.minX - radius;
          else if (minOverlap === overlapRight) x = box.maxX + radius;
          else if (minOverlap === overlapTop) z = box.minZ - radius;
          else z = box.maxZ + radius;
        }
      }
    }
  }

  return { x, y: pos.y, z };
}

/**
 * Ray-vs-AABB slab intersection untuk cek garis pandang (Line of Sight) hantu & Boneka Uci.
 * Mengembalikan true jika ada garis pandang bersih antara `from` dan `to`.
 */
export function hasLineOfSight(from: Vec3, to: Vec3, colliders: AABB[]): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;

  for (const box of colliders) {
    if (box.blocksVision === false) continue;

    let tmin = 0;
    let tmax = 1;

    // X slab
    if (Math.abs(dx) < 1e-6) {
      if (from.x < box.minX || from.x > box.maxX) continue;
    } else {
      const inv = 1 / dx;
      let t1 = (box.minX - from.x) * inv;
      let t2 = (box.maxX - from.x) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    // Y slab
    if (Math.abs(dy) < 1e-6) {
      if (from.y < box.minY || from.y > box.maxY) continue;
    } else {
      const inv = 1 / dy;
      let t1 = (box.minY - from.y) * inv;
      let t2 = (box.maxY - from.y) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    // Z slab
    if (Math.abs(dz) < 1e-6) {
      if (from.z < box.minZ || from.z > box.maxZ) continue;
    } else {
      const inv = 1 / dz;
      let t1 = (box.minZ - from.z) * inv;
      let t2 = (box.maxZ - from.z) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (tmin < tmax && tmax > 0 && tmin < 1) {
      return false;
    }
  }

  return true;
}

export function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function distance3D(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Mengecek apakah posisi berada di dalam salah satu Zona Aman (tempat hantu dilarang menyerang/masuk).
 */
export function isInSafeZone(pos: Vec3, safeZones: SafeZone[]): SafeZone | null {
  for (const z of safeZones) {
    if (
      pos.x >= z.minX &&
      pos.x <= z.maxX &&
      pos.y >= z.minY &&
      pos.y <= z.maxY &&
      pos.z >= z.minZ &&
      pos.z <= z.maxZ
    ) {
      return z;
    }
  }
  return null;
}
