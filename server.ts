import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { CharacterId, FloorId, Vec3 } from './src/game/types.ts';
import { RoomManager } from './src/server/roomManager.ts';
import {
  GAME_VERSION,
  formatLobbyError,
  type CoopActionEvent,
  type GhostSyncItem,
  type LobbyErrorCode,
  type PlayerCosmetics,
  type RoomDifficulty,
  type RoomLanguage,
  type RoomRegion,
  type RoomSettings,
  type RtcSignalPayload,
  type SquadSyncPayload,
} from './src/shared/lobbyProtocol.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json());

const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' },
  pingInterval: 10_000,
  pingTimeout: 8_000,
});

const roomManager = new RoomManager();
const socketToGuest = new Map<string, string>();
const guestToSocket = new Map<string, string>();

function emitRoomState(code: string) {
  const snap = roomManager.getRoomSnapshot(code);
  if (!snap) return;
  io.to(`room:${snap.code}`).emit('room:state', snap);
}

function sendError(socket: Socket, code: LobbyErrorCode, customMsg?: string) {
  socket.emit('room:error', {
    code,
    message: formatLobbyError(code, customMsg),
  });
}

function attachSocketToRoom(socket: Socket, guestId: string, code: string) {
  const prevSocketId = guestToSocket.get(guestId);
  if (prevSocketId && prevSocketId !== socket.id) {
    socketToGuest.delete(prevSocketId);
  }
  socketToGuest.set(socket.id, guestId);
  guestToSocket.set(guestId, socket.id);

  for (const r of socket.rooms) {
    if (r.startsWith('room:') && r !== `room:${code}`) {
      socket.leave(r);
    }
  }
  socket.join(`room:${code}`);
}

io.on('connection', (socket) => {
  socket.on('ping:probe', (clientTs: number, ack?: (serverTs: number) => void) => {
    if (typeof ack === 'function') {
      ack(clientTs);
    }
  });

  socket.on('ping:report', (payload: { guestId: string; pingMs: number }) => {
    if (!payload?.guestId || typeof payload.pingMs !== 'number') return;
    roomManager.updatePing(payload.guestId, payload.pingMs);
  });

  socket.on(
    'room:list',
    (
      filter: {
        search?: string;
        difficulty?: RoomDifficulty | 'any';
        language?: RoomLanguage | 'any';
        region?: RoomRegion | 'any';
        hideFull?: boolean;
      } = {},
      ack?: (rooms: ReturnType<RoomManager['listPublicRooms']>) => void
    ) => {
      const rooms = roomManager.listPublicRooms(filter);
      if (typeof ack === 'function') ack(rooms);
      else socket.emit('room:list:result', rooms);
    }
  );

  socket.on(
    'room:create',
    (
      payload: {
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
      },
      ack?: (res: { ok: boolean; room?: unknown; code?: LobbyErrorCode; message?: string }) => void
    ) => {
      const res = roomManager.createRoom(payload);
      if (!res.ok) {
        sendError(socket, res.code, res.message);
        ack?.({ ok: false, code: res.code, message: formatLobbyError(res.code, res.message) });
        return;
      }
      attachSocketToRoom(socket, payload.guestId, res.data.code);
      emitRoomState(res.data.code);
      ack?.({ ok: true, room: res.data });
    }
  );

  socket.on(
    'room:join',
    (
      payload: {
        code: string;
        guestId: string;
        nickname: string;
        clientVersion: string;
        password?: string;
        preferredCharacter?: CharacterId;
        cosmetics?: PlayerCosmetics;
      },
      ack?: (res: { ok: boolean; room?: unknown; code?: LobbyErrorCode; message?: string }) => void
    ) => {
      const res = roomManager.joinRoom(payload);
      if (!res.ok) {
        sendError(socket, res.code, res.message);
        ack?.({ ok: false, code: res.code, message: formatLobbyError(res.code, res.message) });
        return;
      }
      attachSocketToRoom(socket, payload.guestId, res.data.code);
      emitRoomState(res.data.code);
      ack?.({ ok: true, room: res.data });
    }
  );

  socket.on(
    'room:quickplay',
    (
      payload: {
        guestId: string;
        nickname: string;
        clientVersion: string;
        preferredCharacter?: CharacterId;
        cosmetics?: PlayerCosmetics;
        language?: RoomLanguage | 'any';
        region?: RoomRegion | 'any';
        difficulty?: RoomDifficulty | 'any';
      },
      ack?: (res: { ok: boolean; room?: unknown; code?: LobbyErrorCode; message?: string }) => void
    ) => {
      const res = roomManager.quickPlay(payload);
      if (!res.ok) {
        sendError(socket, res.code, res.message);
        ack?.({ ok: false, code: res.code, message: formatLobbyError(res.code, res.message) });
        return;
      }
      attachSocketToRoom(socket, payload.guestId, res.data.code);
      emitRoomState(res.data.code);
      ack?.({ ok: true, room: res.data });
    }
  );

  socket.on('room:leave', (payload: { guestId: string }) => {
    if (!payload?.guestId) return;
    const res = roomManager.leaveRoom(payload.guestId);
    if (res) {
      socket.leave(`room:${res.code}`);
      if (res.snapshot) {
        io.to(`room:${res.code}`).emit('room:state', res.snapshot);
      }
    }
    socketToGuest.delete(socket.id);
    if (guestToSocket.get(payload.guestId) === socket.id) {
      guestToSocket.delete(payload.guestId);
    }
  });

  socket.on('room:ready', (payload: { code: string; guestId: string; ready?: boolean }) => {
    const res = roomManager.toggleReady(payload.code, payload.guestId, payload.ready);
    if (!res.ok) return sendError(socket, res.code, res.message);
    emitRoomState(res.data.code);
  });

  socket.on(
    'room:character',
    (payload: { code: string; guestId: string; characterId: CharacterId }) => {
      const res = roomManager.selectCharacter(payload.code, payload.guestId, payload.characterId);
      if (!res.ok) return sendError(socket, res.code, res.message);
      emitRoomState(res.data.code);
    }
  );

  socket.on(
    'room:cosmetics',
    (payload: { code: string; guestId: string; cosmetics: PlayerCosmetics }) => {
      const res = roomManager.selectCosmetics(payload.code, payload.guestId, payload.cosmetics);
      if (!res.ok) return sendError(socket, res.code, res.message);
      emitRoomState(res.data.code);
    }
  );

  socket.on('room:mic', (payload: { code: string; guestId: string; micOn?: boolean }) => {
    const res = roomManager.toggleMic(payload.code, payload.guestId, payload.micOn);
    if (!res.ok) return sendError(socket, res.code, res.message);
    emitRoomState(res.data.code);
  });

  socket.on('room:chat', (payload: { code: string; guestId: string; text: string }) => {
    const res = roomManager.sendChat(payload.code, payload.guestId, payload.text);
    if (!res.ok) return sendError(socket, res.code, res.message);
    emitRoomState(res.data.code);
  });

  socket.on(
    'room:settings',
    (payload: {
      code: string;
      guestId: string;
      patch: Partial<Omit<RoomSettings, 'friendlyFire' | 'hasPassword'>> & { password?: string };
    }) => {
      const res = roomManager.updateSettings(payload.code, payload.guestId, payload.patch);
      if (!res.ok) return sendError(socket, res.code, res.message);
      emitRoomState(res.data.code);
    }
  );

  socket.on(
    'room:kick',
    (payload: { code: string; guestId: string; targetGuestId: string }) => {
      const res = roomManager.kickPlayer(payload.code, payload.guestId, payload.targetGuestId);
      if (!res.ok) return sendError(socket, res.code, res.message);

      const kickedSocketId = guestToSocket.get(res.data.kickedGuestId);
      if (kickedSocketId) {
        const kickedSocket = io.sockets.sockets.get(kickedSocketId);
        kickedSocket?.leave(`room:${res.data.snapshot.code}`);
        kickedSocket?.emit('room:kicked', {
          code: 'kicked',
          message: formatLobbyError('kicked'),
        });
      }
      emitRoomState(res.data.snapshot.code);
    }
  );

  socket.on(
    'room:start',
    (payload: { code: string; guestId: string; withBots?: boolean; botCount?: number }) => {
      const res = roomManager.startMatch(payload.code, payload.guestId, {
        withBots: payload.withBots,
        botCount: payload.botCount,
      });
      if (!res.ok) return sendError(socket, res.code, res.message);
      emitRoomState(res.data.code);
    }
  );

  socket.on('room:keepWaiting', (payload: { code: string }) => {
    const res = roomManager.dismissQuickPlayBotOffer(payload.code);
    if (!res.ok) return sendError(socket, res.code, res.message);
    emitRoomState(res.data.code);
  });

  socket.on('room:checkpointSpawn', (payload: { code: string; guestId: string }) => {
    const res = roomManager.requestCheckpointSpawn(payload.code, payload.guestId);
    if (!res.ok) return sendError(socket, res.code, res.message);
    emitRoomState(res.data.code);
  });

  socket.on(
    'room:end',
    (payload: {
      code: string;
      summary: {
        outcome: 'victory' | 'defeat';
        title: string;
        subtitle: string;
        durationSec: number;
      };
    }) => {
      const res = roomManager.endMatch(payload.code, payload.summary);
      if (!res.ok) return sendError(socket, res.code, res.message);
      emitRoomState(res.data.code);
    }
  );

  socket.on('room:returnLobby', (payload: { code: string; guestId: string }) => {
    const res = roomManager.returnToLobby(payload.code, payload.guestId);
    if (!res.ok) return sendError(socket, res.code, res.message);
    emitRoomState(res.data.code);
  });

  socket.on(
    'world:action',
    (payload: { code: string; guestId: string; action: CoopActionEvent }) => {
      if (!payload?.code || !payload?.guestId || !payload?.action) return;
      const res = roomManager.applyWorldAction(payload.code, payload.guestId, payload.action);
      if (!res.ok) {
        sendError(socket, res.code, res.message);
        return;
      }
      io.to(`room:${res.data.snapshot.code}`).emit('world:event', res.data.broadcast);
      io.to(`room:${res.data.snapshot.code}`).emit('room:state', res.data.snapshot);
    }
  );

  socket.on(
    'ghost:sync',
    (payload: { code: string; guestId: string; ghosts: GhostSyncItem[] }) => {
      if (!payload?.code || !payload?.guestId || !Array.isArray(payload.ghosts)) return;
      if (!roomManager.isHostPlayer(payload.code, payload.guestId)) return;
      const snap = roomManager.getRoomSnapshot(payload.code);
      if (!snap || snap.phase !== 'PLAYING') return;
      socket.to(`room:${snap.code}`).emit('ghost:positions', payload.ghosts);
    }
  );

  socket.on('rtc:signal', (payload: RtcSignalPayload) => {
    if (!payload?.code || !payload?.fromGuestId || !payload?.toGuestId) return;
    if (!roomManager.areSameRoom(payload.code, payload.fromGuestId, payload.toGuestId)) return;
    const targetSocketId = guestToSocket.get(payload.toGuestId);
    if (!targetSocketId) return;
    io.to(targetSocketId).emit('rtc:signal', payload);
  });

  socket.on(
    'player:sync',
    (payload: {
      code: string;
      guestId: string;
      position: Vec3;
      yaw: number;
      floor: FloorId;
      sanity: number;
      flashlightOn?: boolean;
      isCrouching?: boolean;
      downed?: boolean;
    }) => {
      const rec = roomManager.updatePlayerState(payload.code, payload.guestId, payload);
      if (!rec) return;
      const squad: SquadSyncPayload[] = rec.players.map((p) => ({
        guestId: p.guestId,
        nickname: p.nickname,
        characterId: p.characterId,
        cosmetics: p.cosmetics,
        position: p.position,
        yaw: p.yaw,
        floor: p.floor,
        sanity: p.sanity,
        flashlightOn: p.flashlightOn,
        isCrouching: p.isCrouching,
        downed: p.downed,
        micOn: p.micOn,
        role: p.role,
        connected: p.connected,
        isBot: p.isBot,
      }));
      socket.to(`room:${rec.code}`).emit('player:positions', squad);
    }
  );

  socket.on('disconnect', () => {
    const guestId = socketToGuest.get(socket.id);
    socketToGuest.delete(socket.id);
    if (!guestId) return;
    // Only mark disconnected if this socket is still the active socket for guestId
    if (guestToSocket.get(guestId) === socket.id) {
      guestToSocket.delete(guestId);
      const res = roomManager.handleDisconnect(guestId);
      if (res?.snapshot) {
        io.to(`room:${res.code}`).emit('room:state', res.snapshot);
      }
    }
  });
});

// 1-second server tick for LOADING -> PLAYING, 30s QuickPlay AI offer, and 60s reconnect expiry
setInterval(() => {
  const { updatedRooms } = roomManager.tick(Date.now());
  for (const snap of updatedRooms) {
    io.to(`room:${snap.code}`).emit('room:state', snap);
  }
}, 1000);

// REST endpoints
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: GAME_VERSION });
});

app.get('/api/rooms', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  const difficulty =
    typeof req.query.difficulty === 'string'
      ? (req.query.difficulty as RoomDifficulty | 'any')
      : 'any';
  const language =
    typeof req.query.language === 'string' ? (req.query.language as RoomLanguage | 'any') : 'any';
  const region =
    typeof req.query.region === 'string' ? (req.query.region as RoomRegion | 'any') : 'any';
  const hideFull = req.query.hideFull === 'true';

  res.json({
    version: GAME_VERSION,
    rooms: roomManager.listPublicRooms({ search, difficulty, language, region, hideFull }),
  });
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Rumah Gurita Server] Listening on http://0.0.0.0:${PORT} (v${GAME_VERSION})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
