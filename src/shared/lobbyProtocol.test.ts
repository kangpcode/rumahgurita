import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomManager } from '../server/roomManager.ts';
import {
  GAME_VERSION,
  LOADING_TRANSITION_MS,
  QUICK_PLAY_BOT_OFFER_MS,
  RECONNECT_GRACE_MS,
  ROOM_CODE_ALPHABET,
  formatLobbyError,
  generateRoomCode,
  sanitizeAndValidateNickname,
} from './lobbyProtocol.ts';

test('generateRoomCode creates 5-char unambiguous codes without O/0/I/1', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateRoomCode();
    assert.equal(code.length, 5);
    assert.ok(!/[O0I1]/.test(code), `Code ${code} must not contain ambiguous O/0/I/1`);
    for (const ch of code) {
      assert.ok(ROOM_CODE_ALPHABET.includes(ch));
    }
  }
});

test('sanitizeAndValidateNickname enforces length and ID+EN profanity filter without false positives', () => {
  assert.equal(sanitizeAndValidateNickname('  Raka_99  ').ok, true);
  assert.equal(sanitizeAndValidateNickname('Ceu Titin').ok, true);
  assert.equal(sanitizeAndValidateNickname('Salsa').ok, true);

  assert.equal(sanitizeAndValidateNickname('A').ok, false);
  assert.equal(sanitizeAndValidateNickname('NamaYangSangatPanjangSekali').ok, false);
  assert.equal(sanitizeAndValidateNickname('Raka@!').ok, false);
  assert.equal(sanitizeAndValidateNickname('anjing123').ok, false);
  assert.equal(sanitizeAndValidateNickname('fuckYou').ok, false);
});

test('RoomManager handles create, join errors (wrong_password, room_full, already_started, version_mismatch)', () => {
  const mgr = new RoomManager();
  const created = mgr.createRoom({
    guestId: 'g1',
    nickname: 'HostRaka',
    clientVersion: GAME_VERSION,
    roomName: 'Malam Jumat',
    isPublic: true,
    password: 'rahasia',
    maxPlayers: 2,
    allowLateJoin: false,
    now: 1000,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const code = created.data.code;
  assert.equal(created.data.settings.friendlyFire, false);

  const wrongVer = mgr.joinRoom({
    code,
    guestId: 'g2',
    nickname: 'Salsa',
    clientVersion: '0.0.1',
    password: 'rahasia',
  });
  assert.equal(wrongVer.ok, false);
  if (!wrongVer.ok) assert.equal(wrongVer.code, 'version_mismatch');

  const wrongPass = mgr.joinRoom({
    code,
    guestId: 'g2',
    nickname: 'Salsa',
    clientVersion: GAME_VERSION,
    password: 'salah',
  });
  assert.equal(wrongPass.ok, false);
  if (!wrongPass.ok) assert.equal(wrongPass.code, 'wrong_password');

  const notFound = mgr.joinRoom({
    code: 'ZZZZZ',
    guestId: 'g2',
    nickname: 'Salsa',
    clientVersion: GAME_VERSION,
  });
  assert.equal(notFound.ok, false);
  if (!notFound.ok) assert.equal(notFound.code, 'not_found');

  const joined = mgr.joinRoom({
    code,
    guestId: 'g2',
    nickname: 'Salsa',
    clientVersion: GAME_VERSION,
    password: 'rahasia',
    now: 1500,
  });
  assert.equal(joined.ok, true);

  const full = mgr.joinRoom({
    code,
    guestId: 'g3',
    nickname: 'Bima',
    clientVersion: GAME_VERSION,
    password: 'rahasia',
  });
  assert.equal(full.ok, false);
  if (!full.ok) {
    assert.equal(full.code, 'room_full');
    assert.ok(formatLobbyError(full.code).includes('penuh'));
  }

  // Start requires g2 to be ready
  const startNotReady = mgr.startMatch(code, 'g1', { now: 2000 });
  assert.equal(startNotReady.ok, false);
  if (!startNotReady.ok) assert.equal(startNotReady.code, 'not_ready');

  mgr.toggleReady(code, 'g2', true);
  const started = mgr.startMatch(code, 'g1', { now: 2000 });
  assert.equal(started.ok, true);
  if (started.ok) assert.equal(started.data.phase, 'LOADING');

  mgr.tick(2000 + LOADING_TRANSITION_MS + 10);
  assert.equal(mgr.getRoomSnapshot(code)?.phase, 'PLAYING');

  // Cannot late join when allowLateJoin = false
  mgr.kickPlayer(code, 'g1', 'g2');
  const blockedLate = mgr.joinRoom({
    code,
    guestId: 'g4',
    nickname: 'Nadia',
    clientVersion: GAME_VERSION,
    password: 'rahasia',
  });
  assert.equal(blockedLate.ok, false);
  if (!blockedLate.ok) assert.equal(blockedLate.code, 'already_started');
});

test('RoomManager enforces unique characters, host migration to oldest player, and 60s reconnect', () => {
  const mgr = new RoomManager();
  const c = mgr.createRoom({
    guestId: 'host1',
    nickname: 'RakaHost',
    clientVersion: GAME_VERSION,
    preferredCharacter: 'raka',
    now: 1000,
  });
  assert.equal(c.ok, true);
  if (!c.ok) return;
  const code = c.data.code;

  mgr.joinRoom({ code, guestId: 'p2', nickname: 'PemainDua', clientVersion: GAME_VERSION, now: 1100 });
  mgr.joinRoom({ code, guestId: 'p3', nickname: 'PemainTiga', clientVersion: GAME_VERSION, now: 1200 });

  // p2 tries to pick raka (locked by host1)
  const lockCheck = mgr.selectCharacter(code, 'p2', 'raka');
  assert.equal(lockCheck.ok, false);
  if (!lockCheck.ok) assert.equal(lockCheck.code, 'character_taken');

  // Host disconnects -> host migrates to p2 (oldest joinOrder = 2), and host1 keeps slot for 60s
  mgr.handleDisconnect('host1', 5000);
  let snap = mgr.getRoomSnapshot(code)!;
  assert.equal(snap.players.find((p) => p.guestId === 'p2')?.isHost, true);
  assert.equal(snap.players.find((p) => p.guestId === 'host1')?.connected, false);

  // host1 reconnects within 60s -> restores exact slot & character
  const reconnected = mgr.joinRoom({
    code,
    guestId: 'host1',
    nickname: 'RakaHost',
    clientVersion: GAME_VERSION,
    now: 25_000,
  });
  assert.equal(reconnected.ok, true);
  snap = mgr.getRoomSnapshot(code)!;
  assert.equal(snap.players.find((p) => p.guestId === 'host1')?.connected, true);
  assert.equal(snap.players.find((p) => p.guestId === 'host1')?.characterId, 'raka');

  // p3 disconnects and exceeds 60s grace window -> purged by tick
  mgr.handleDisconnect('p3', 30_000);
  mgr.tick(30_000 + RECONNECT_GRACE_MS + 1);
  snap = mgr.getRoomSnapshot(code)!;
  assert.equal(snap.players.some((p) => p.guestId === 'p3'), false);
});

test('QuickPlay matches public rooms, triggers 30s AI bot offer, and supports Late Join spectator -> checkpoint', () => {
  const mgr = new RoomManager();
  const qp1 = mgr.quickPlay({
    guestId: 'solo_wait',
    nickname: 'BimaCepat',
    clientVersion: GAME_VERSION,
    language: 'id',
    region: 'Asia-ID',
    difficulty: 'Normal',
    now: 10_000,
  });
  assert.equal(qp1.ok, true);
  if (!qp1.ok) return;
  const code = qp1.data.code;
  assert.equal(qp1.data.isQuickPlay, true);
  assert.equal(qp1.data.quickPlayOfferBots, false);

  // After 30s with <2 players, offers AI teammates
  mgr.tick(10_000 + QUICK_PLAY_BOT_OFFER_MS + 5);
  assert.equal(mgr.getRoomSnapshot(code)?.quickPlayOfferBots, true);

  // Host starts with AI bots -> LOADING -> PLAYING
  const botStart = mgr.startMatch(code, 'solo_wait', { withBots: true, now: 41_000 });
  assert.equal(botStart.ok, true);
  if (botStart.ok) {
    assert.ok(botStart.data.players.some((p) => p.isBot));
  }
  mgr.tick(41_000 + LOADING_TRANSITION_MS + 5);
  assert.equal(mgr.getRoomSnapshot(code)?.phase, 'PLAYING');

  // Late join enters as spectator, then spawns at checkpoint
  const late = mgr.joinRoom({
    code,
    guestId: 'late_guy',
    nickname: 'DitoTelat',
    clientVersion: GAME_VERSION,
    now: 45_000,
  });
  assert.equal(late.ok, true);
  if (late.ok) {
    assert.equal(late.data.players.find((p) => p.guestId === 'late_guy')?.role, 'spectator');
  }
  const spawned = mgr.requestCheckpointSpawn(code, 'late_guy', 46_000);
  assert.equal(spawned.ok, true);
  if (spawned.ok) {
    assert.equal(spawned.data.players.find((p) => p.guestId === 'late_guy')?.role, 'player');
  }

  // End match -> Return to Lobby strips temporary bots & resets ready flags
  mgr.endMatch(code, { outcome: 'victory', title: 'Selesai', subtitle: 'Fakta terungkap', durationSec: 120 }, 50_000);
  assert.equal(mgr.getRoomSnapshot(code)?.phase, 'ENDED');
  mgr.returnToLobby(code, 'solo_wait', 51_000);
  const backSnap = mgr.getRoomSnapshot(code)!;
  assert.equal(backSnap.phase, 'LOBBY');
  assert.equal(backSnap.players.some((p) => p.isBot), false);
});

test('Tahap 11: RoomManager applies shared world actions idempotently and enforces downed/revive/all-downed defeat', () => {
  const mgr = new RoomManager();
  const created = mgr.createRoom({
    guestId: 'h1',
    nickname: 'RakaCoop',
    clientVersion: GAME_VERSION,
    preferredCharacter: 'raka',
    now: 1000,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const code = created.data.code;

  mgr.joinRoom({ code, guestId: 'p2', nickname: 'SalsaCoop', clientVersion: GAME_VERSION, now: 1100 });
  mgr.toggleReady(code, 'p2', true);
  mgr.startMatch(code, 'h1', { now: 2000 });
  mgr.tick(2000 + LOADING_TRANSITION_MS + 10);
  assert.equal(mgr.getRoomSnapshot(code)?.phase, 'PLAYING');

  assert.equal(mgr.isHostPlayer(code, 'h1'), true);
  assert.equal(mgr.isHostPlayer(code, 'p2'), false);
  assert.equal(mgr.areSameRoom(code, 'h1', 'p2'), true);

  // 1. Door toggle + unlock
  const doorRes = mgr.applyWorldAction(
    code,
    'h1',
    { type: 'door_toggle', doorId: 'door_ruang_tengah', isOpen: true, unlocked: true },
    5000
  );
  assert.equal(doorRes.ok, true);
  if (doorRes.ok) {
    assert.equal(doorRes.data.snapshot.world.openDoors['door_ruang_tengah'], true);
    assert.ok(doorRes.data.snapshot.world.unlockedDoors.includes('door_ruang_tengah'));
  }

  // 2. Idempotent key & evidence pickup
  const keyPick1 = mgr.applyWorldAction(
    code,
    'h1',
    {
      type: 'item_pickup',
      itemId: 'item_kunci_l2',
      kind: 'key',
      label: 'Kunci Lantai 2',
      payloadId: 'key_l2',
    },
    5100
  );
  assert.equal(keyPick1.ok, true);
  const keyPickDup = mgr.applyWorldAction(
    code,
    'p2',
    {
      type: 'item_pickup',
      itemId: 'item_kunci_l2',
      kind: 'key',
      label: 'Kunci Lantai 2',
      payloadId: 'key_l2',
    },
    5150
  );
  assert.equal(keyPickDup.ok, true);
  if (keyPickDup.ok) {
    assert.equal(keyPickDup.data.snapshot.world.collectedKeyIds.length, 1);
  }

  // 3. Debunk requires fact first
  const failDebunk = mgr.applyWorldAction(
    code,
    'p2',
    { type: 'rumor_debunk', rumorId: 'rumor_setan', title: 'Pemujaan Setan' },
    5200
  );
  assert.equal(failDebunk.ok, false);

  mgr.applyWorldAction(
    code,
    'h1',
    {
      type: 'item_pickup',
      itemId: 'ev_setan',
      kind: 'evidence',
      label: 'Sketsa Kelautan',
      payloadId: 'rumor_setan',
    },
    5300
  );
  const okDebunk = mgr.applyWorldAction(
    code,
    'p2',
    { type: 'rumor_debunk', rumorId: 'rumor_setan', title: 'Pemujaan Setan' },
    5400
  );
  assert.equal(okDebunk.ok, true);
  if (okDebunk.ok) {
    assert.ok(okDebunk.data.snapshot.world.debunkedRumorIds.includes('rumor_setan'));
  }

  // 4. Downed + Revive while teammate alive keeps match PLAYING
  const downOne = mgr.applyWorldAction(code, 'h1', { type: 'player_downed' }, 6000);
  assert.equal(downOne.ok, true);
  if (downOne.ok) {
    assert.equal(downOne.data.snapshot.phase, 'PLAYING');
    assert.equal(downOne.data.snapshot.players.find((p) => p.guestId === 'h1')?.downed, true);
  }

  const reviveOne = mgr.applyWorldAction(
    code,
    'p2',
    { type: 'player_revive', targetGuestId: 'h1' },
    6500
  );
  assert.equal(reviveOne.ok, true);
  if (reviveOne.ok) {
    const h1 = reviveOne.data.snapshot.players.find((p) => p.guestId === 'h1')!;
    assert.equal(h1.downed, false);
    assert.equal(h1.sanity, 45);
  }

  // 5. All human players downed simultaneously -> ENDED defeat
  mgr.applyWorldAction(code, 'h1', { type: 'player_downed' }, 7000);
  const allDown = mgr.applyWorldAction(code, 'p2', { type: 'player_downed' }, 7100);
  assert.equal(allDown.ok, true);
  if (allDown.ok) {
    assert.equal(allDown.data.snapshot.phase, 'ENDED');
    assert.equal(allDown.data.snapshot.lastSummary?.outcome, 'defeat');
  }

  // 6. Return to lobby resets world state cleanly
  mgr.returnToLobby(code, 'h1', 8000);
  const resetSnap = mgr.getRoomSnapshot(code)!;
  assert.equal(resetSnap.phase, 'LOBBY');
  assert.equal(resetSnap.world.debunkedRumorIds.length, 0);
  assert.equal(resetSnap.world.collectedKeyIds.length, 0);
  assert.equal(resetSnap.players.every((p) => !p.downed), true);
});
