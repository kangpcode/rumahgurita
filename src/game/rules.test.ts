import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasLineOfSight,
  isInSafeZone,
  resolveGroundElevation,
  resolveHorizontalCollision,
} from './collision';
import { CHARACTERS, INITIAL_RUMORS } from './data';
import {
  computeCompanionFollowTarget,
  computeCurrentObjective,
  computeGhostWeakeningFactor,
  countBrokenSegel,
  debunkRumor,
  evaluateEnding,
  getDoorClosedCollider,
  isPlayerLookingAt,
  stepDualBatteries,
  stepGhostAI,
  tryInteractDoor,
} from './rules';
import type { AABB, DoorData, GhostData, SafeZone, StairZone } from './types';

test('debunkRumor requires discovered fact before breaking a Segel Rumor', () => {
  const failRes = debunkRumor(INITIAL_RUMORS, 'rumor_666');
  assert.equal(failRes.success, false);
  assert.equal(countBrokenSegel(failRes.updated), 0);

  const withFact = INITIAL_RUMORS.map((r) =>
    r.id === 'rumor_666' ? { ...r, discoveredFact: true } : r
  );
  const okRes = debunkRumor(withFact, 'rumor_666');
  assert.equal(okRes.success, true);
  assert.equal(countBrokenSegel(okRes.updated), 1);
});

test('Raka Debunker skill weakens ghosts more strongly than other characters', () => {
  const raka = CHARACTERS.find((c) => c.id === 'raka')!;
  const bima = CHARACTERS.find((c) => c.id === 'bima')!;
  const rakaFactor = computeGhostWeakeningFactor(6, 6, raka);
  const bimaFactor = computeGhostWeakeningFactor(6, 6, bima);
  assert.ok(rakaFactor < bimaFactor);
  assert.ok(rakaFactor >= 0.4);
});

test('resolveHorizontalCollision pushes player cleanly outside wall AABB', () => {
  const wall: AABB = {
    id: 'test-wall',
    minX: 2,
    maxX: 2.4,
    minY: 0,
    maxY: 3.2,
    minZ: -5,
    maxZ: 5,
  };
  const resolved = resolveHorizontalCollision({ x: 1.85, y: 0, z: 0 }, 0.35, 1.65, [wall]);
  assert.ok(resolved.x <= 1.651, `Expected x <= 1.651, got ${resolved.x}`);
});

test('resolveGroundElevation interpolates smoothly along 4.0m stairs', () => {
  const stairs: StairZone[] = [
    {
      id: 'g-to-2',
      minX: -1.65,
      maxX: 1.55,
      minZ: -7.6,
      maxZ: -2.0,
      startZ: -2.0,
      endZ: -7.6,
      startY: 0,
      endY: 4.0,
    },
  ];
  const midZ = (-2.0 + -7.6) / 2;
  const midY = resolveGroundElevation(0, midZ, 1.8, stairs, 4.0, 8.0);
  assert.ok(Math.abs(midY - 2.0) < 0.05);
});

test('hasLineOfSight detects blocking walls between ghost and player', () => {
  const wall: AABB = {
    id: 'sight-wall',
    minX: -2,
    maxX: 2,
    minY: 0,
    maxY: 3,
    minZ: -0.2,
    maxZ: 0.2,
  };
  assert.equal(hasLineOfSight({ x: 0, y: 1.4, z: -2 }, { x: 0, y: 1.4, z: 2 }, [wall]), false);
  assert.equal(hasLineOfSight({ x: 0, y: 1.4, z: 1 }, { x: 0, y: 1.4, z: 3 }, [wall]), true);
});

test('Boneka Uci freezes when player looks directly at her', () => {
  const uci: GhostData = {
    id: 'uci',
    kind: 'boneka_uci',
    name: 'Boneka Uci',
    floor: 'second',
    position: { x: 0, y: 3.6, z: -4 },
    yaw: 0,
    state: 'patrol',
    homePos: { x: 0, y: 3.6, z: -4 },
    waypoints: [{ x: 0, y: 3.6, z: 0 }],
    waypointIndex: 0,
    targetPos: { x: 0, y: 3.6, z: 0 },
    alertTimer: 0,
    stunTimer: 0,
    speed: 2.6,
    active: true,
  };

  assert.equal(isPlayerLookingAt({ x: 0, y: 3.6, z: 0 }, 0, uci.position), true);
  const res = stepGhostAI(
    uci,
    { x: 0, y: 3.6, z: 0 },
    0,
    false,
    50,
    true,
    [],
    1.0,
    0.5
  );
  assert.equal(res.ghost.state, 'stalk');
  assert.equal(res.ghost.position.z, -4);
});

test('evaluateEnding returns true, normal, and bad endings accurately', () => {
  assert.equal(
    evaluateEnding({
      defeated: true,
      kujangClaimed: true,
      segelBroken: 6,
      totalSegel: 6,
      raniRescued: true,
    }).ending,
    'bad'
  );
  assert.equal(
    evaluateEnding({
      defeated: false,
      kujangClaimed: true,
      segelBroken: 4,
      totalSegel: 6,
      raniRescued: false,
    }).ending,
    'normal'
  );
  assert.equal(
    evaluateEnding({
      defeated: false,
      kujangClaimed: true,
      segelBroken: 6,
      totalSegel: 6,
      raniRescued: true,
    }).ending,
    'true'
  );
});

test('isInSafeZone detects Safe Zone bounds and stepGhostAI prevents attacks inside Safe Zones', () => {
  const safeZones: SafeZone[] = [
    {
      id: 'safe_bay',
      name: 'Ceruk Barat Lantai 1 (Zona Aman)',
      minX: -9.6,
      maxX: -7.6,
      minY: -0.5,
      maxY: 3.1,
      minZ: -1.5,
      maxZ: 1.5,
    },
  ];

  assert.ok(isInSafeZone({ x: -8.5, y: 0, z: 0 }, safeZones));
  assert.equal(isInSafeZone({ x: -4.0, y: 0, z: 0 }, safeZones), null);

  const kunti: GhostData = {
    id: 'kunti_test',
    kind: 'kuntilanak',
    name: 'Kuntilanak',
    floor: 'ground',
    position: { x: -7.4, y: 0, z: 0 },
    yaw: 0,
    state: 'chase',
    homePos: { x: -4.5, y: 0, z: 0 },
    waypoints: [{ x: -4.5, y: 0, z: 0 }],
    waypointIndex: 0,
    targetPos: { x: -8.2, y: 0, z: 0 },
    alertTimer: 3,
    stunTimer: 0,
    speed: 3.0,
    active: true,
  };

  const res = stepGhostAI(
    kunti,
    { x: -8.0, y: 0, z: 0 },
    0,
    false,
    90,
    true,
    [],
    1.0,
    0.5,
    safeZones
  );

  assert.equal(res.caughtPlayer, false);
  assert.equal(res.sanityDrainPerSec, 0);
  assert.equal(res.ghost.state, 'patrol');
  assert.equal(isInSafeZone(res.ghost.position, safeZones), null);
});

test('stepGhostAI never walks through or attacks through walls', () => {
  const wall: AABB = {
    id: 'divider',
    minX: -10,
    maxX: 10,
    minY: 0,
    maxY: 3.5,
    minZ: -0.15,
    maxZ: 0.15,
  };

  let kunti: GhostData = {
    id: 'kunti_wall',
    kind: 'kuntilanak',
    name: 'Kuntilanak',
    floor: 'ground',
    position: { x: 0, y: 0, z: -0.6 },
    yaw: 0,
    state: 'chase',
    homePos: { x: 0, y: 0, z: -2 },
    waypoints: [{ x: 0, y: 0, z: -2 }],
    waypointIndex: 0,
    targetPos: { x: 0, y: 0, z: 0.5 },
    alertTimer: 4,
    stunTimer: 0,
    speed: 4.0,
    active: true,
  };

  for (let i = 0; i < 20; i++) {
    const res = stepGhostAI(
      kunti,
      { x: 0, y: 0, z: 0.5 },
      0,
      false,
      90,
      false,
      [wall],
      1.0,
      0.1
    );
    kunti = res.ghost;
    assert.equal(res.caughtPlayer, false, 'Ghost must not hit player through a solid wall');
    assert.ok(kunti.position.z <= -0.15 - 0.31, `Ghost crossed wall to z=${kunti.position.z}`);
  }
});

test('Locked door blocks passage and emits closed collider until unlocked with key', () => {
  const door: DoorData = {
    id: 'door_kitchen',
    label: 'Pintu Dapur',
    floor: 'ground',
    hingePos: { x: 2.2, y: 0, z: -0.6 },
    width: 1.5,
    height: 2.4,
    thickness: 0.12,
    closedAngle: 0,
    openAngle: Math.PI * 0.48,
    currentAngle: 0,
    targetAngle: 0,
    isOpen: false,
    lockedKeyId: 'key_dapur',
    lockedKeyLabel: 'Kunci Dapur',
    closedCenter: { x: 2.95, y: 1.2, z: -0.6 },
    closedSize: { x: 1.5, y: 2.4, z: 0.12 },
  };

  assert.ok(getDoorClosedCollider(door) !== null);
  const blocked = tryInteractDoor(door, []);
  assert.equal(blocked.changed, false);
  assert.equal(blocked.lockedBlocked, true);

  const opened = tryInteractDoor(door, ['key_dapur']);
  assert.equal(opened.changed, true);
  assert.equal(opened.door.isOpen, true);
  assert.equal(getDoorClosedCollider(opened.door), null);
});

test('stepDualBatteries drains flashlight and UV camera independently', () => {
  const onlyFlash = stepDualBatteries({
    flashlightBattery: 50,
    uvBattery: 80,
    flashlightOn: true,
    uvMode: false,
    drainMult: 1,
    dt: 10,
  });
  assert.ok(onlyFlash.flashlightBattery < 50);
  assert.equal(onlyFlash.uvBattery, 80);

  const onlyUv = stepDualBatteries({
    flashlightBattery: 50,
    uvBattery: 80,
    flashlightOn: false,
    uvMode: true,
    drainMult: 1,
    dt: 10,
  });
  assert.equal(onlyUv.flashlightBattery, 50);
  assert.ok(onlyUv.uvBattery < 80);
});

test('computeCurrentObjective advances cleanly across Act 0, Act 1, Act 2, and Act 3', () => {
  const act0 = computeCurrentObjective({
    floor: 'outside',
    inDimensiGaib: false,
    talkedNpcCount: 0,
    collectedKeyIds: [],
    evidenceCount: 0,
    segelBroken: 0,
    totalSegel: 6,
    raniRescued: false,
    kujangClaimed: false,
  });
  assert.equal(act0.actNumber, 0);

  const act1 = computeCurrentObjective({
    floor: 'ground',
    inDimensiGaib: true,
    talkedNpcCount: 1,
    collectedKeyIds: [],
    evidenceCount: 0,
    segelBroken: 0,
    totalSegel: 6,
    raniRescued: false,
    kujangClaimed: false,
  });
  assert.equal(act1.actNumber, 1);

  const act2 = computeCurrentObjective({
    floor: 'second',
    inDimensiGaib: true,
    talkedNpcCount: 1,
    collectedKeyIds: ['key_dapur', 'key_kamar2'],
    evidenceCount: 3,
    segelBroken: 2,
    totalSegel: 6,
    raniRescued: false,
    kujangClaimed: false,
  });
  assert.equal(act2.actNumber, 2);

  const act3 = computeCurrentObjective({
    floor: 'roof',
    inDimensiGaib: true,
    talkedNpcCount: 2,
    collectedKeyIds: ['key_dapur', 'key_kamar2', 'key_atap'],
    evidenceCount: 6,
    segelBroken: 6,
    totalSegel: 6,
    raniRescued: true,
    kujangClaimed: false,
  });
  assert.equal(act3.actNumber, 3);
  assert.ok(act3.objective.includes('Kujang'));
});

test('player and ghosts are blocked cleanly by solid carts, tree trunks, and furniture AABBs', () => {
  const cartCollider: AABB = {
    id: 'cart_nasgor',
    minX: -6.85,
    maxX: -4.75,
    minY: 0,
    maxY: 2.45,
    minZ: 25.525,
    maxZ: 26.875,
    blocksVision: true,
  };
  const treeCollider: AABB = {
    id: 'tree_trunk_0',
    minX: -8.75,
    maxX: -8.05,
    minY: 0,
    maxY: 3.8,
    minZ: 13.15,
    maxZ: 13.85,
    blocksVision: false,
  };

  // Player walking toward cart cannot enter its AABB
  const playerResolved = resolveHorizontalCollision(
    { x: -5.8, y: 0, z: 26.2 },
    0.34,
    1.68,
    [cartCollider, treeCollider]
  );
  assert.ok(
    playerResolved.z <= cartCollider.minZ - 0.33 ||
      playerResolved.z >= cartCollider.maxZ + 0.33 ||
      playerResolved.x <= cartCollider.minX - 0.33 ||
      playerResolved.x >= cartCollider.maxX + 0.33,
    'Player must be pushed completely outside cart collider'
  );

  // Player walking toward tree trunk cannot enter trunk AABB
  const treeResolved = resolveHorizontalCollision(
    { x: -8.4, y: 0, z: 13.5 },
    0.34,
    1.68,
    [treeCollider]
  );
  assert.ok(
    Math.hypot(treeResolved.x - -8.4, treeResolved.z - 13.5) >= 0.35,
    'Player must be pushed cleanly outside tree trunk collider'
  );
});

import { INTRO_CAR_DIALOGUES, NPC_DIALOGS } from './data';
import {
  BILLBOARD_POS,
  CARPORT_VEHICLES,
  COURTYARD_POOL_POS,
  FLOOR_HEIGHT,
  MOSQUE_POS,
  NEIGHBORHOOD_HOUSES,
  PLAYER_SPAWN,
  SAFE_ZONES,
  STAIR_ZONES,
  WARUNG_POS,
  buildLevelGeometry,
  createInitialDoors,
} from './levelData';

test('Turn 5 levelData has Warung Ceu Titin spawn, Baliho Windah, Courtyard Pool, Vehicles, and Rooftop door_roof_exit', () => {
  const { colliders } = buildLevelGeometry();
  const doors = createInitialDoors();

  // 1. Spawn sits right outside Warung Ceu Titin unobstructed
  assert.ok(Math.hypot(PLAYER_SPAWN.x - WARUNG_POS.x, PLAYER_SPAWN.z - WARUNG_POS.z) < 10);
  const spawnResolved = resolveHorizontalCollision(PLAYER_SPAWN, 0.34, 1.68, colliders);
  assert.equal(spawnResolved.x, PLAYER_SPAWN.x);
  assert.equal(spawnResolved.z, PLAYER_SPAWN.z);

  // 2. Solid colliders exist for Warung, Windah Billboard legs, Courtyard Pool, and Carport Sedan
  for (const idPrefix of [
    'warung_counter',
    'warung_table_n',
    'billboard_leg_-1.8',
    'courtyard_pool_basin',
    'carport_sedan',
  ]) {
    assert.ok(
      colliders.some((c) => c.id === idPrefix),
      `Expected solid collider "${idPrefix}" in levelData`
    );
  }

  // Attempting to walk into Courtyard Pool basin pushes player cleanly outside
  const poolCenterResolved = resolveHorizontalCollision(
    { x: COURTYARD_POOL_POS.x, y: 0, z: COURTYARD_POOL_POS.z },
    0.34,
    1.68,
    colliders
  );
  assert.ok(
    Math.hypot(poolCenterResolved.x - COURTYARD_POOL_POS.x, poolCenterResolved.z - COURTYARD_POOL_POS.z) > 2.5,
    'Player cannot stand inside solid Courtyard Pool basin'
  );

  // Attempting to walk into Carport Sedan pushes player cleanly outside
  const sedan = CARPORT_VEHICLES[0];
  const sedanResolved = resolveHorizontalCollision({ x: sedan.x, y: 0, z: sedan.z }, 0.34, 1.68, colliders);
  assert.ok(
    Math.hypot(sedanResolved.x - sedan.x, sedanResolved.z - sedan.z) > 0.8,
    'Player cannot clip through Carport Sedan'
  );

  // Billboard pos is solid at its steel legs
  assert.ok(colliders.some((c) => c.id.startsWith('billboard_leg_') && Math.hypot(c.minX - BILLBOARD_POS.x, c.minZ - BILLBOARD_POS.z) < 4));

  // 3. Rooftop stair zone reaches FLOOR_HEIGHT * 2 cleanly at Z = -6.8 with door_roof_exit
  const roofStairY = resolveGroundElevation(3.3, -6.8, FLOOR_HEIGHT * 1.9, STAIR_ZONES, FLOOR_HEIGHT, FLOOR_HEIGHT * 2);
  assert.ok(Math.abs(roofStairY - FLOOR_HEIGHT * 2) < 0.05);

  const gerbangDoor = doors.find((d) => d.id === 'door_gerbang_utama');
  const garasiDoor = doors.find((d) => d.id === 'door_gerbang_garasi');
  const gStairDoor = doors.find((d) => d.id === 'door_g_stair');
  const roofExitDoor = doors.find((d) => d.id === 'door_roof_exit');
  assert.ok(gerbangDoor, 'Expected door_gerbang_utama');
  assert.ok(garasiDoor && garasiDoor.width >= 3.4, 'Expected wide door_gerbang_garasi for vehicle access');
  assert.equal(getDoorClosedCollider(tryInteractDoor(garasiDoor!, []).door), null);
  assert.ok(gStairDoor, 'Expected door_g_stair');
  assert.ok(roofExitDoor, 'Expected door_roof_exit');

  // Closed door_roof_exit blocks X = 1.85 exit, opened door_roof_exit removes collider cleanly
  assert.ok(getDoorClosedCollider(roofExitDoor!) !== null);
  const openedExit = tryInteractDoor(roofExitDoor!, []);
  assert.equal(openedExit.changed, true);
  assert.equal(getDoorClosedCollider(openedExit.door), null);

  // 4. Warung NPCs, Pa Nanang intro car dialogue & Masjid Al-Ikhlas interior/safe zone
  assert.equal(NPC_DIALOGS.warung_ibu.voiceId, 'warung_ibu');
  assert.equal(NPC_DIALOGS.warung_pemuda.voiceId, 'warung_pemuda');
  assert.ok(NPC_DIALOGS.warung_ibu.lines.length >= 4);
  assert.ok(NPC_DIALOGS.warung_ibu.lines.some((l) => l.includes('Pa Nanang')));
  assert.ok(INTRO_CAR_DIALOGUES.length >= 6);
  assert.ok(INTRO_CAR_DIALOGUES[INTRO_CAR_DIALOGUES.length - 1].endSec >= 20);
  assert.ok(INTRO_CAR_DIALOGUES.some((d) => d.speaker.includes('PA NANANG')));
  assert.ok(SAFE_ZONES.some((z) => z.id === 'safe_masjid'));
  assert.ok(isInSafeZone({ x: MOSQUE_POS.x, y: 0, z: MOSQUE_POS.z }, SAFE_ZONES) !== null);
  assert.ok(colliders.some((c) => c.id === 'masjid_mimbar'));
  assert.ok(colliders.some((c) => c.id === 'masjid_rak_quran'));
  const act0 = computeCurrentObjective({
    floor: 'outside',
    inDimensiGaib: false,
    talkedNpcCount: 0,
    collectedKeyIds: [],
    evidenceCount: 0,
    segelBroken: 0,
    totalSegel: 6,
    raniRescued: false,
    kujangClaimed: false,
  });
  assert.ok(act0.objective.includes('Warung Ceu Titin'));
});

test('computeCompanionFollowTarget places all 1-3 AI companions strictly behind the main player', () => {
  const playerPos = { x: -2.4, y: 0, z: 53.2 };
  for (const yaw of [0, 0.42, Math.PI * 0.5, -Math.PI * 0.75, Math.PI]) {
    // Forward direction in Three.js for camera.rotation.y = yaw
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    for (const total of [1, 2, 3]) {
      for (let i = 0; i < total; i++) {
        const target = computeCompanionFollowTarget(playerPos, yaw, i, total);
        const relX = target.x - playerPos.x;
        const relZ = target.z - playerPos.z;
        const dist = Math.hypot(relX, relZ);
        const dotForward = relX * fwdX + relZ * fwdZ;
        assert.ok(dist >= 1.9 && dist <= 2.6, `Expected trailing distance ~2m, got ${dist}`);
        assert.ok(
          dotForward < -1.2,
          `Expected AI companion ${i}/${total} strictly behind player (dotForward=${dotForward})`
        );
      }
    }
  }
});

test('Roads and neighborhood houses never overlap and expanded Rumah Gurita L-wing bounds are present', () => {
  const { visuals, colliders } = buildLevelGeometry();
  const roadBoxes = visuals.filter((v) => v.id.startsWith('road_'));
  assert.ok(roadBoxes.length >= 4);

  const overlap2D = (
    aMinX: number,
    aMaxX: number,
    aMinZ: number,
    aMaxZ: number,
    bMinX: number,
    bMaxX: number,
    bMinZ: number,
    bMaxZ: number
  ) => aMinX < bMaxX - 0.01 && aMaxX > bMinX + 0.01 && aMinZ < bMaxZ - 0.01 && aMaxZ > bMinZ + 0.01;

  for (let i = 0; i < roadBoxes.length; i++) {
    const a = roadBoxes[i];
    for (let j = i + 1; j < roadBoxes.length; j++) {
      const b = roadBoxes[j];
      assert.equal(
        overlap2D(
          a.x - a.w / 2,
          a.x + a.w / 2,
          a.z - a.d / 2,
          a.z + a.d / 2,
          b.x - b.w / 2,
          b.x + b.w / 2,
          b.z - b.d / 2,
          b.z + b.d / 2
        ),
        false,
        `Road overlap between ${a.id} and ${b.id}`
      );
    }
  }

  for (let i = 0; i < NEIGHBORHOOD_HOUSES.length; i++) {
    const a = NEIGHBORHOOD_HOUSES[i];
    for (const r of roadBoxes) {
      assert.equal(
        overlap2D(
          a.x - a.w / 2,
          a.x + a.w / 2,
          a.z - a.d / 2,
          a.z + a.d / 2,
          r.x - r.w / 2,
          r.x + r.w / 2,
          r.z - r.d / 2,
          r.z + r.d / 2
        ),
        false,
        `Neighborhood house ${a.id} overlaps road ${r.id}`
      );
    }
    for (let j = i + 1; j < NEIGHBORHOOD_HOUSES.length; j++) {
      const b = NEIGHBORHOOD_HOUSES[j];
      assert.equal(
        overlap2D(
          a.x - a.w / 2,
          a.x + a.w / 2,
          a.z - a.d / 2,
          a.z + a.d / 2,
          b.x - b.w / 2,
          b.x + b.w / 2,
          b.z - b.d / 2,
          b.z + b.d / 2
        ),
        false,
        `Neighborhood houses ${a.id} and ${b.id} overlap`
      );
    }
  }

  // Expanded Rumah Gurita wings (East wing up to +15, West annex down to -15.6) & rooftop pedestals
  assert.ok(colliders.some((c) => c.id === 'g_wall_east_s' && c.maxX >= 14.9));
  assert.ok(colliders.some((c) => c.id === 'g_annex_w_wall' && c.minX <= -15.4));
  assert.ok(colliders.some((c) => c.id === 'r_octopus_base' && c.minX < -7 && c.maxZ > 4));
  assert.ok(colliders.some((c) => c.id === 'r_kujang_pedestal' && c.maxX > 9));
});
