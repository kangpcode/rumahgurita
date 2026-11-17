import {
  distance3D,
  hasLineOfSight,
  isInSafeZone,
  resolveHorizontalCollision,
} from './collision';
import type {
  AABB,
  CharacterProfile,
  DoorData,
  EndingType,
  GhostData,
  RumorEntry,
  SafeZone,
  Vec3,
} from './types';

/**
 * Membuktikan satu Segel Rumor salah menggunakan Fakta yang sudah ditemukan.
 */
export function debunkRumor(
  rumors: RumorEntry[],
  rumorId: string
): { updated: RumorEntry[]; success: boolean; reason?: string } {
  const target = rumors.find((r) => r.id === rumorId);
  if (!target) {
    return { updated: rumors, success: false, reason: 'Segel rumor tidak ditemukan.' };
  }
  if (target.debunked) {
    return { updated: rumors, success: false, reason: 'Segel rumor sudah dipatahkan.' };
  }
  if (!target.discoveredFact) {
    return {
      updated: rumors,
      success: false,
      reason: 'Kumpulkan bukti fakta nyata terlebih dahulu.',
    };
  }

  const updated = rumors.map((r) =>
    r.id === rumorId ? { ...r, discoveredRumor: true, debunked: true } : r
  );
  return { updated, success: true };
}

export function countBrokenSegel(rumors: RumorEntry[]): number {
  return rumors.filter((r) => r.debunked).length;
}

/**
 * Menghitung faktor kekuatan hantu berdasarkan jumlah Segel Rumor yang dipatahkan & skill karakter (Raka).
 */
export function computeGhostWeakeningFactor(
  segelBroken: number,
  totalSegel: number,
  character: CharacterProfile
): number {
  if (totalSegel <= 0) return 1;
  const ratio = Math.max(0, Math.min(1, segelBroken / totalSegel));
  const reduction = ratio * 0.45 * character.debunkBonusWeakening;
  return Math.max(0.4, 1 - reduction);
}

/**
 * Cek apakah pemain sedang menatap ke arah objek tertentu.
 */
export function isPlayerLookingAt(
  playerPos: Vec3,
  playerYaw: number,
  targetPos: Vec3,
  coneCosThreshold = 0.45
): boolean {
  const forwardX = -Math.sin(playerYaw);
  const forwardZ = -Math.cos(playerYaw);
  const dx = targetPos.x - playerPos.x;
  const dz = targetPos.z - playerPos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return true;
  const dot = (dx / len) * forwardX + (dz / len) * forwardZ;
  return dot >= coneCosThreshold;
}

/**
 * Menghitung AABB collider untuk pintu tertutup; mengembalikan null jika pintu terbuka.
 */
export function getDoorClosedCollider(door: DoorData): AABB | null {
  if (door.isOpen) return null;
  return {
    id: `door_col_${door.id}`,
    minX: door.closedCenter.x - door.closedSize.x * 0.5,
    maxX: door.closedCenter.x + door.closedSize.x * 0.5,
    minY: door.closedCenter.y - door.closedSize.y * 0.5,
    maxY: door.closedCenter.y + door.closedSize.y * 0.5,
    minZ: door.closedCenter.z - door.closedSize.z * 0.5,
    maxZ: door.closedCenter.z + door.closedSize.z * 0.5,
    blocksVision: true,
  };
}

/**
 * Mencoba membuka atau menutup pintu dengan validasi kunci.
 */
export function tryInteractDoor(
  door: DoorData,
  collectedKeyIds: string[]
): { door: DoorData; changed: boolean; message: string; lockedBlocked: boolean } {
  if (!door.isOpen && door.lockedKeyId && !collectedKeyIds.includes(door.lockedKeyId)) {
    return {
      door,
      changed: false,
      lockedBlocked: true,
      message: `Pintu terkunci! Cari ${door.lockedKeyLabel ?? 'Kunci Ruangan'} terlebih dahulu.`,
    };
  }
  const nextOpen = !door.isOpen;
  const updated: DoorData = {
    ...door,
    isOpen: nextOpen,
    targetAngle: nextOpen ? door.openAngle : door.closedAngle,
    lockedKeyId: nextOpen ? undefined : door.lockedKeyId, // tetap terbuka/tidak terkunci setelah dibuka kunci
  };
  return {
    door: updated,
    changed: true,
    lockedBlocked: false,
    message: nextOpen
      ? door.lockedKeyId
        ? `${door.label} dibuka dengan ${door.lockedKeyLabel ?? 'kunci'}!`
        : `${door.label} dibuka.`
      : `${door.label} ditutup.`,
  };
}

/**
 * Hitung konsumsi baterai independen untuk Senter dan Kamera UV.
 */
export function stepDualBatteries(params: {
  flashlightBattery: number;
  uvBattery: number;
  flashlightOn: boolean;
  uvMode: boolean;
  drainMult: number;
  dt: number;
}): {
  flashlightBattery: number;
  uvBattery: number;
  flashlightOn: boolean;
  uvMode: boolean;
  flashlightDepletedNow: boolean;
  uvDepletedNow: boolean;
} {
  let { flashlightBattery, uvBattery, flashlightOn, uvMode } = params;
  let flashlightDepletedNow = false;
  let uvDepletedNow = false;

  if (flashlightOn) {
    flashlightBattery = Math.max(0, flashlightBattery - 1.1 * params.drainMult * params.dt);
    if (flashlightBattery <= 0) {
      flashlightOn = false;
      flashlightDepletedNow = true;
    }
  }
  if (uvMode) {
    uvBattery = Math.max(0, uvBattery - 1.65 * params.drainMult * params.dt);
    if (uvBattery <= 0) {
      uvMode = false;
      uvDepletedNow = true;
    }
  }

  return {
    flashlightBattery,
    uvBattery,
    flashlightOn,
    uvMode,
    flashlightDepletedNow,
    uvDepletedNow,
  };
}

/**
 * Update AI hantu satu frame:
 * - Tidak pernah menembus tembok atau pintu tertutup (`resolveHorizontalCollision` + angle-probing steering).
 * - Tidak pernah menyerang melalui tembok (`hasLineOfSight`).
 * - Masing-masing jenis hantu memiliki pola berburu berbeda:
 *   * Boneka Uci: Weeping Angel (membeku saat dilihat langsung).
 *   * Pocong: Melambat oleh sorotan senter langsung jarak dekat.
 *   * Ambu Hideung: Pengejar cerdas dengan jangkauan penglihatan luas + stalk cepat saat pemain lengah.
 *   * Genderuwo: Penjaga bertubuh besar, langkah berat, sangat peka terhadap suara lari.
 *   * Kuntilanak: Patroli lincah antar ruangan lantai dasar & pengejar agresif.
 */
export function stepGhostAI(
  ghost: GhostData,
  playerPos: Vec3,
  playerYaw: number,
  playerHiding: boolean,
  playerNoiseLevel: number,
  flashlightOn: boolean,
  colliders: AABB[],
  weakeningFactor: number,
  dt: number,
  safeZones: SafeZone[] = []
): { ghost: GhostData; caughtPlayer: boolean; sanityDrainPerSec: number } {
  if (!ghost.active) {
    return { ghost, caughtPlayer: false, sanityDrainPerSec: 0 };
  }

  const next: GhostData = { ...ghost };
  const sameFloor = Math.abs(ghost.position.y - playerPos.y) < 2.2;
  const dist = distance3D(ghost.position, playerPos);
  const playerSafeZone = isInSafeZone(playerPos, safeZones);
  const playerProtected = playerHiding || playerSafeZone !== null;
  const ghostRadius = ghost.kind === 'genderuwo' ? 0.42 : 0.32;

  if (next.stunTimer > 0) {
    next.stunTimer = Math.max(0, next.stunTimer - dt);
    next.state = 'stunned';
    return { ghost: next, caughtPlayer: false, sanityDrainPerSec: 0 };
  }

  const eyeGhost: Vec3 = { x: ghost.position.x, y: ghost.position.y + 1.35, z: ghost.position.z };
  const eyePlayer: Vec3 = { x: playerPos.x, y: playerPos.y + 1.35, z: playerPos.z };
  const sightRange = ghost.kind === 'ambu_hideung' ? 14.5 : ghost.kind === 'kuntilanak' ? 13.0 : 11.5;
  const hasSight = hasLineOfSight(eyeGhost, eyePlayer, colliders);
  const canSee = !playerProtected && sameFloor && dist < sightRange && hasSight;

  // Mekanik khusus Boneka Uci: membeku saat ditatap langsung dengan jarak < 11.5m
  if (
    ghost.kind === 'boneka_uci' &&
    sameFloor &&
    dist < 11.5 &&
    isPlayerLookingAt(playerPos, playerYaw, ghost.position, 0.48) &&
    hasSight
  ) {
    next.state = 'stalk';
    return {
      ghost: next,
      caughtPlayer: false,
      sanityDrainPerSec: !playerProtected && dist < 4.2 ? 3.8 : 0,
    };
  }

  // Mekanik khusus per jenis hantu
  let speedMod = weakeningFactor;
  if (
    ghost.kind === 'pocong' &&
    flashlightOn &&
    sameFloor &&
    dist < 6.8 &&
    hasSight &&
    isPlayerLookingAt(playerPos, playerYaw, ghost.position, 0.7)
  ) {
    speedMod *= 0.25;
  }

  // Genderuwo lebih peka terhadap kebisingan langkah
  const noiseGain = ghost.kind === 'genderuwo' ? 11.0 : 8.5;
  const hearRadius = 2.4 + (playerNoiseLevel / 100) * noiseGain;
  const canHear = !playerProtected && sameFloor && dist < hearRadius;

  if (playerSafeZone) {
    next.state = 'patrol';
    next.alertTimer = 0;
  } else if (canSee) {
    next.state = 'chase';
    next.targetPos = { ...playerPos };
    next.alertTimer = ghost.kind === 'ambu_hideung' ? 6.0 : 4.8;
  } else if (canHear) {
    if (next.state !== 'chase') {
      next.state = 'investigate';
      next.targetPos = { ...playerPos };
      next.alertTimer = 4.0;
    } else {
      // Tetap perbarui posisi terakhir bila mendengar suara saat sedang memburu
      next.targetPos = { ...playerPos };
      next.alertTimer = Math.max(next.alertTimer, 3.2);
    }
  } else if (next.alertTimer > 0) {
    next.alertTimer = Math.max(0, next.alertTimer - dt);
    if (next.alertTimer === 0) {
      next.state = 'patrol';
    }
  } else {
    next.state = 'patrol';
  }

  let moveTarget = next.targetPos;
  let moveSpeed = next.speed * speedMod;

  if (next.state === 'patrol') {
    const wp = next.waypoints[next.waypointIndex] ?? next.homePos;
    moveTarget = wp;
    moveSpeed *= 0.62;
    if (Math.hypot(wp.x - next.position.x, wp.z - next.position.z) < 0.45) {
      next.waypointIndex = (next.waypointIndex + 1) % Math.max(1, next.waypoints.length);
    }
  } else if (next.state === 'investigate') {
    moveSpeed *= 0.85;
  } else if (next.state === 'chase') {
    if (next.kind === 'kuntilanak') moveSpeed *= 1.12;
    else if (next.kind === 'ambu_hideung') moveSpeed *= 1.16;
    else if (next.kind === 'boneka_uci') moveSpeed *= 1.24;

    // Jika sudah sampai ke lokasi terakhir tanpa melihat pemain, kembali patrol
    if (!canSee && Math.hypot(moveTarget.x - next.position.x, moveTarget.z - next.position.z) < 0.45) {
      next.state = 'patrol';
      next.alertTimer = 0;
    }
  }

  const dx = moveTarget.x - next.position.x;
  const dz = moveTarget.z - next.position.z;
  const moveDist = Math.hypot(dx, dz);

  if (moveDist > 0.05) {
    const desiredStep = Math.min(moveDist, moveSpeed * dt);
    const baseDirX = dx / moveDist;
    const baseDirZ = dz / moveDist;

    // Coba sudut langsung, lalu steering kiri/kanan agar hantu menyusuri dinding/pintu terbuka & tidak macet
    const probeAngles = [0, 0.55, -0.55, 1.05, -1.05, 1.55, -1.55];
    let bestPos: Vec3 | null = null;
    let bestScore = -Infinity;

    for (const ang of probeAngles) {
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const tx = baseDirX * cos - baseDirZ * sin;
      const tz = baseDirX * sin + baseDirZ * cos;

      const rawCandidate: Vec3 = {
        x: next.position.x + tx * desiredStep,
        y: next.position.y,
        z: next.position.z + tz * desiredStep,
      };
      const resolved = resolveHorizontalCollision(rawCandidate, ghostRadius, 1.75, colliders);
      if (isInSafeZone(resolved, safeZones)) continue;

      const actualMoved = Math.hypot(resolved.x - next.position.x, resolved.z - next.position.z);
      if (actualMoved < 0.002) continue;

      const distBefore = Math.hypot(moveTarget.x - next.position.x, moveTarget.z - next.position.z);
      const distAfter = Math.hypot(moveTarget.x - resolved.x, moveTarget.z - resolved.z);
      const progress = distBefore - distAfter;
      const score = progress + (ang === 0 ? 0.01 : -Math.abs(ang) * 0.008);

      if (score > bestScore) {
        bestScore = score;
        bestPos = resolved;
      }

      // Jalur langsung lancar tanpa terhalang tembok
      if (ang === 0 && actualMoved >= desiredStep * 0.72) {
        break;
      }
    }

    if (bestPos) {
      const movedDx = bestPos.x - next.position.x;
      const movedDz = bestPos.z - next.position.z;
      next.position = bestPos;
      if (Math.hypot(movedDx, movedDz) > 0.002) {
        next.yaw = Math.atan2(movedDx, movedDz);
      }
    } else if (isInSafeZone(next.position, safeZones)) {
      next.position = { ...next.homePos };
      next.state = 'patrol';
    } else if (next.state === 'patrol') {
      // Skip waypoint bila benar-benar terblokir pintu tertutup
      next.waypointIndex = (next.waypointIndex + 1) % Math.max(1, next.waypoints.length);
    }
  }

  // Cek tangkapan pemain: wajib memiliki Line of Sight (tidak bisa menyerang menembus dinding/pintu)
  const hitRadius = ghost.kind === 'genderuwo' ? 1.25 : 1.05;
  const caughtPlayer = !playerProtected && sameFloor && dist < hitRadius && hasSight;

  let sanityDrainPerSec = 0;
  if (sameFloor && dist < 8.0 && !playerProtected && hasSight) {
    sanityDrainPerSec = ((8.0 - dist) / 8.0) * (ghost.kind === 'ambu_hideung' ? 7.5 : 4.5);
  }

  return { ghost: next, caughtPlayer, sanityDrainPerSec };
}

/**
 * Evaluasi Ending (3 Ending sesuai desain cerita).
 */
export function evaluateEnding(params: {
  defeated: boolean;
  kujangClaimed: boolean;
  segelBroken: number;
  totalSegel: number;
  raniRescued: boolean;
}): {
  ending: EndingType;
  title: string;
  subtitle: string;
  message: string;
} {
  if (params.defeated || !params.kujangClaimed) {
    return {
      ending: 'bad',
      title: 'BAD ENDING — TERPERANGKAP DI DIMENSI GAIB',
      subtitle: 'Kalian gagal mematahkan mitos dan menjadi bagian dari rumor baru.',
      message:
        'Kabut hitam menelan Rumah Gurita. Keesokan malamnya, kabar burung baru kembali beredar di Sukajadi tentang sekelompok remaja yang tak pernah pulang...',
    };
  }

  if (params.segelBroken >= params.totalSegel && params.raniRescued) {
    return {
      ending: 'true',
      title: 'TRUE ENDING — FAKTA MEMUTUS KUTUKAN',
      subtitle: 'Semua 6 Segel Rumor dipatahkan! Rani selamat & Dimensi Gaib memudar.',
      message:
        'Kujang Pamungkas memancarkan cahaya hangat saat fakta demi fakta terungkap. Ambu Hideung lenyap bersama ilusinya, Rani ditemukan selamat di dekat menara radio. "Yang paling menyeramkan bukan rumahnya, tapi rumor."',
    };
  }

  return {
    ending: 'normal',
    title: 'NORMAL ENDING — KELUAR DENGAN LUKA TERSISA',
    subtitle: 'Kujang Pamungkas membuka gerbang keluar, namun sebagian mitos masih hidup.',
    message:
      'Kalian berhasil melarikan diri dari Rumah Gurita dengan Pusaka Kujang Pamungkas, tetapi karena belum semua Segel Rumor dipatahkan dengan fakta, bayangan Dimensi Gaib masih menghantui ingatan Sukajadi.',
  };
}

/**
 * Menentukan nomor Act (0..3) dan teks tujuan cerita aktif berdasarkan progres pemain.
 */
export function computeCurrentObjective(params: {
  floor: 'outside' | 'ground' | 'second' | 'roof';
  inDimensiGaib: boolean;
  talkedNpcCount: number;
  collectedKeyIds: string[];
  evidenceCount: number;
  segelBroken: number;
  totalSegel: number;
  raniRescued: boolean;
  kujangClaimed: boolean;
}): { actNumber: number; objective: string } {
  if (!params.inDimensiGaib && params.floor === 'outside') {
    if (params.talkedNpcCount === 0) {
      return {
        actNumber: 0,
        objective:
          'Mulai dari Warung Ceu Titin: tanya Ceu Titin / Anak Muda [E], cek Baliho Windah & Pos Ronda, lalu masuk lewat Gerbang Utama / Celah Pagar Barat.',
      };
    }
    return {
      actNumber: 0,
      objective:
        'Telusuri Jalan Sukajadi melewati Baliho Windah ke Gerbang Utama Rumah Gurita (atau Celah Pagar Barat) lalu buka Pintu Utama [E].',
    };
  }

  if (params.floor === 'roof') {
    if (!params.raniRescued) {
      return {
        actNumber: 3,
        objective: 'Ambil Ponsel Rani di tepi kolam, lalu setel Menara Radio ke 104.6 MHz [E].',
      };
    }
    if (params.segelBroken < 3) {
      return {
        actNumber: 3,
        objective: `Patahkan minimal 3 Segel Rumor di Jurnal [J] (${params.segelBroken}/3) untuk membuka Tembok Pusaka.`,
      };
    }
    if (params.segelBroken < params.totalSegel) {
      return {
        actNumber: 3,
        objective: `Patahkan semua Segel (${params.segelBroken}/${params.totalSegel}) di Jurnal [J] untuk True Ending, atau ambil Kujang Pamungkas!`,
      };
    }
    return {
      actNumber: 3,
      objective: 'Semua Segel patah! Ambil Kujang Pamungkas di Altar Timur untuk memutus Dimensi Gaib!',
    };
  }

  if (params.floor === 'second') {
    if (!params.collectedKeyIds.includes('key_kamar2')) {
      return {
        actNumber: 2,
        objective: 'Waspadai Boneka Uci & Genderuwo; cari bukti antik di Lantai 2 (ambil Kunci Kamar Lt.2 dari Dapur Lantai 1).',
      };
    }
    if (!params.collectedKeyIds.includes('key_atap')) {
      return {
        actNumber: 2,
        objective: 'Buka Kamar Utama Barat Laut dengan Kunci Kamar Lt.2 [E] untuk mengambil Kunci Pintu Atap!',
      };
    }
    if (params.segelBroken < 2) {
      return {
        actNumber: 2,
        objective: `Buka Jurnal [J] & patahkan 2+ Segel (${params.segelBroken}/2) agar bisa meruntuhkan Tembok Rapuh Tenggara!`,
      };
    }
    return {
      actNumber: 2,
      objective: 'Ambil Cetak Biru di balik Tembok Rapuh Tenggara, lalu buka Pintu Tangga Rooftop [E]!',
    };
  }

  // Ground Floor (Act 1)
  if (!params.collectedKeyIds.includes('key_dapur')) {
    return {
      actNumber: 1,
      objective: 'Cari Akta Arsitektur & Kunci Dapur di Ruang Tamu Barat, lalu nyalakan UV [Q] untuk dokumen kamar.',
    };
  }
  if (!params.collectedKeyIds.includes('key_kamar2')) {
    return {
      actNumber: 1,
      objective: 'Buka Pintu Dapur Utara dengan Kunci Dapur [E] untuk mengambil Buku Log Penjaga & Kunci Kamar Lt.2.',
    };
  }
  return {
    actNumber: 1,
    objective: 'Patahkan Segel dari bukti yang ditemukan di Jurnal [J], lalu naik tangga menuju Lantai 2!',
  };
}

/**
 * Menghitung target posisi formasi rekan AI di belakang pemain utama.
 * Arah hadap kamera Three.js adalah (-sin(yaw), -cos(yaw)), sehingga di belakangnya adalah (+sin(yaw), +cos(yaw)).
 */
export function computeCompanionFollowTarget(
  playerPos: Vec3,
  playerYaw: number,
  index: number,
  total: number
): { x: number; z: number } {
  // Tempatkan rekan AI di flank kiri/kanan jauh dari garis bidik kamera boom Third-Person (+0.26m bahu kanan)
  // agar tidak pernah menghalangi lensa kamera atau memunculkan glitch tangan/kepala di sudut pandang.
  const spread =
    total === 1
      ? -0.82 // Flank kiri lebar (-47°) menjauhi koridor kamera third-person
      : total === 2
        ? (index === 0 ? -0.82 : 0.82)
        : index === 0
          ? -0.82
          : index === 1
            ? -0.42
            : 0.82;
  const distBehind = 2.22 + (index === 1 && total === 3 ? 0.25 : (index % 2) * 0.12);
  const backAngle = playerYaw + spread;
  return {
    x: playerPos.x + Math.sin(backAngle) * distBehind,
    z: playerPos.z + Math.cos(backAngle) * distBehind,
  };
}
