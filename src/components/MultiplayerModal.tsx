import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  Lock,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  Share2,
  UserX,
  Users,
  Zap,
} from 'lucide-react';
import { CHARACTERS, STUDIO_INFO } from '../game/data';
import type { CharacterId } from '../game/types';
import type { LobbyClient } from '../net/lobbyClient';
import {
  ACCESSORY_OPTIONS,
  BAG_COLOR_OPTIONS,
  GAME_VERSION,
  normalizeRoomCode,
  sanitizeAndValidateNickname,
  type AccessoryId,
  type BagColorId,
  type PlayerCosmetics,
  type PublicRoomSummary,
  type RoomDifficulty,
  type RoomLanguage,
  type RoomRegion,
  type RoomSnapshot,
} from '../shared/lobbyProtocol';

type HubTab = 'quickplay' | 'create' | 'join' | 'solo';

interface MultiplayerModalProps {
  client: LobbyClient;
  guestId: string;
  nickname: string;
  onChangeNickname: (nick: string) => void;
  cosmetics: PlayerCosmetics;
  onChangeCosmetics: (c: PlayerCosmetics) => void;
  selectedCharacter: CharacterId;
  onSelectSoloCharacter: (c: CharacterId) => void;
  soloDifficulty: RoomDifficulty;
  onChangeSoloDifficulty: (d: RoomDifficulty) => void;
  aiCompanionCount: number;
  onChangeAiCompanions: (cnt: number) => void;
  onStartSolo: () => void;
  room: RoomSnapshot | null;
  connected: boolean;
  errorBanner: string | null;
  onClearError: () => void;
  initialJoinCode?: string | null;
  onClose: () => void;
}

export const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  client,
  guestId,
  nickname,
  onChangeNickname,
  cosmetics,
  onChangeCosmetics,
  selectedCharacter,
  onSelectSoloCharacter,
  soloDifficulty,
  onChangeSoloDifficulty,
  aiCompanionCount,
  onChangeAiCompanions,
  onStartSolo,
  room,
  connected,
  errorBanner,
  onClearError,
  initialJoinCode,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<HubTab>(initialJoinCode ? 'join' : 'quickplay');
  const [nickInput, setNickInput] = useState(nickname);
  const [nickError, setNickError] = useState<string | null>(null);
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  // Quick Play filters
  const [qpLang, setQpLang] = useState<RoomLanguage | 'any'>('any');
  const [qpRegion, setQpRegion] = useState<RoomRegion | 'any'>('any');
  const [qpDiff, setQpDiff] = useState<RoomDifficulty | 'any'>('any');

  // Create Room state
  const [roomName, setRoomName] = useState(`Ekspedisi ${nickname}`);
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [createDiff, setCreateDiff] = useState<RoomDifficulty>('Normal');
  const [voiceChat, setVoiceChat] = useState(true);
  const [allowLateJoin, setAllowLateJoin] = useState(true);
  const [createLang, setCreateLang] = useState<RoomLanguage>('id');
  const [createRegion, setCreateRegion] = useState<RoomRegion>('Asia-ID');

  // Join Room & Public Browser state
  const [joinCode, setJoinCode] = useState(initialJoinCode ?? '');
  const [joinPassword, setJoinPassword] = useState('');
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDiff, setFilterDiff] = useState<RoomDifficulty | 'any'>('any');
  const [refreshCountdown, setRefreshCountdown] = useState(5);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Lobby Room UI state
  const [chatText, setChatText] = useState('');
  const [copiedLabel, setCopiedLabel] = useState<'code' | 'link' | null>(null);
  const [showHostSettings, setShowHostSettings] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setNickInput(nickname);
  }, [nickname]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room?.chat.length]);

  const validateAndCommitNick = (): string | null => {
    const res = sanitizeAndValidateNickname(nickInput);
    if (!res.ok) {
      setNickError(res.reason);
      return null;
    }
    setNickError(null);
    if (res.nickname !== nickname) {
      onChangeNickname(res.nickname);
    }
    return res.nickname;
  };

  const refreshPublicRooms = async () => {
    setLoadingRooms(true);
    try {
      const list = await client.fetchPublicRooms({
        search: searchQuery,
        difficulty: filterDiff,
      });
      setPublicRooms(list);
      setRefreshCountdown(5);
    } finally {
      setLoadingRooms(false);
    }
  };

  // Auto-refresh daftar room publik setiap 5 detik ketika di tab Gabung Room
  useEffect(() => {
    if (room || activeTab !== 'join') return;
    void refreshPublicRooms();
    const timer = window.setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          void refreshPublicRooms();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, activeTab, searchQuery, filterDiff]);

  const handleQuickPlay = async () => {
    onClearError();
    const validNick = validateAndCommitNick();
    if (!validNick) return;
    await client.quickPlay({
      guestId,
      nickname: validNick,
      preferredCharacter: selectedCharacter,
      cosmetics,
      language: qpLang,
      region: qpRegion,
      difficulty: qpDiff,
    });
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    onClearError();
    const validNick = validateAndCommitNick();
    if (!validNick) return;
    await client.createRoom({
      guestId,
      nickname: validNick,
      preferredCharacter: selectedCharacter,
      cosmetics,
      roomName: roomName.trim() || `Ekspedisi ${validNick}`,
      isPublic,
      password,
      maxPlayers,
      difficulty: createDiff,
      voiceChat,
      allowLateJoin,
      language: createLang,
      region: createRegion,
    });
  };

  const handleJoinByCode = async (targetCode: string, pw = joinPassword) => {
    onClearError();
    const validNick = validateAndCommitNick();
    if (!validNick) return;
    const norm = normalizeRoomCode(targetCode);
    if (norm.length < 4) {
      setLocalMsg('Masukkan kode room 5 karakter terlebih dahulu.');
      return;
    }
    setLocalMsg(null);
    await client.joinRoom({
      code: norm,
      guestId,
      nickname: validNick,
      password: pw,
      preferredCharacter: selectedCharacter,
      cosmetics,
    });
  };

  const handleCopyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard?.writeText(room.code);
      setCopiedLabel('code');
      window.setTimeout(() => setCopiedLabel(null), 2000);
    } catch {
      setLocalMsg(`Kode Room: ${room.code}`);
    }
  };

  const handleShareLink = async () => {
    if (!room) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Rumah Gurita: Dimensi Gaib',
          text: `Gabung ke room "${room.settings.roomName}" (Kode: ${room.code})!`,
          url,
        });
        return;
      }
      await navigator.clipboard?.writeText(url);
      setCopiedLabel('link');
      window.setTimeout(() => setCopiedLabel(null), 2200);
    } catch {
      try {
        await navigator.clipboard?.writeText(url);
        setCopiedLabel('link');
        window.setTimeout(() => setCopiedLabel(null), 2200);
      } catch {
        setLocalMsg(`Link Undangan: ${url}`);
      }
    }
  };

  // ==================== INSIDE ACTIVE LOBBY / LOADING / ENDED ROOM ====================
  if (room) {
    const me = room.players.find((p) => p.guestId === guestId);
    const isHost = Boolean(me?.isHost);
    const connectedHumans = room.players.filter((p) => !p.isBot && p.connected);
    const allHumansReady = connectedHumans.every((p) => p.isHost || p.isReady);

    const handleSendChat = (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatText.trim()) return;
      client.sendChat(room.code, guestId, chatText);
      setChatText('');
    };

    const handleUpdateBag = (bagColor: BagColorId) => {
      const next = { ...cosmetics, bagColor };
      onChangeCosmetics(next);
      client.selectCosmetics(room.code, guestId, next);
    };

    const handleUpdateAccessory = (accessory: AccessoryId) => {
      const next = { ...cosmetics, accessory };
      onChangeCosmetics(next);
      client.selectCosmetics(room.code, guestId, next);
    };

    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-5 bg-[#050706]/90 overflow-y-auto">
        <div
          data-testid="lobby-room-view"
          className="w-full max-w-5xl max-h-[94vh] overflow-y-auto archival-card rounded-sm p-4 sm:p-6 flex flex-col gap-4 my-auto"
        >
          {/* Header Room + Kode 5 Karakter + Salin & Bagikan */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[rgba(207,161,90,0.22)]">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#cfa15a] font-semibold">
                <span>{STUDIO_INFO.studio} · Lobby Multiplayer</span>
                <span className="text-[#4a544e]">|</span>
                <span className={connected ? 'text-[#7ec99e]' : 'text-[#e06a5f]'}>
                  {connected ? 'Server Terhubung' : 'Menghubungkan Ulang...'}
                </span>
              </div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-[#ebe7dc] mt-0.5">
                {room.settings.roomName}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#9ca7a0] mt-1 font-mono-num">
                <span>Kesulitan: <strong className="text-[#ebe7dc]">{room.settings.difficulty}</strong></span>
                <span>·</span>
                <span>{room.settings.isPublic ? 'Publik' : 'Privat'}</span>
                <span>·</span>
                <span>Friendly Fire: Nonaktif</span>
                <span>·</span>
                <span>Join Susulan: {room.settings.allowLateJoin ? 'Izinkan' : 'Tutup'}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="px-3 py-1.5 bg-[#0b0f0d] border border-[#cfa15a]/50 rounded-sm text-center">
                <div className="text-[9px] uppercase tracking-widest text-[#9ca7a0]">Kode Room</div>
                <div data-testid="lobby-room-code" className="font-mono-num text-base font-bold tracking-[0.22em] text-[#f5dfb3]">
                  {room.code}
                </div>
              </div>

              <button
                type="button"
                data-testid="btn-copy-code"
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#141a17] hover:bg-[#1c2420] border border-[rgba(207,161,90,0.3)] text-xs font-semibold text-[#ebe7dc] rounded-sm cursor-pointer whitespace-nowrap"
              >
                {copiedLabel === 'code' ? <Check className="w-3.5 h-3.5 text-[#7ec99e]" /> : <Copy className="w-3.5 h-3.5 text-[#cfa15a]" />}
                <span>{copiedLabel === 'code' ? 'Disalin' : 'Salin Kode'}</span>
              </button>

              <button
                type="button"
                data-testid="btn-share-link"
                onClick={handleShareLink}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#141a17] hover:bg-[#1c2420] border border-[rgba(207,161,90,0.3)] text-xs font-semibold text-[#ebe7dc] rounded-sm cursor-pointer whitespace-nowrap"
              >
                {copiedLabel === 'link' ? <Check className="w-3.5 h-3.5 text-[#7ec99e]" /> : <Share2 className="w-3.5 h-3.5 text-[#cfa15a]" />}
                <span>{copiedLabel === 'link' ? 'Link Disalin' : 'Bagikan Link'}</span>
              </button>
            </div>
          </div>

          {(errorBanner || localMsg) && (
            <div
              data-testid="lobby-error-banner"
              className="px-3.5 py-2.5 bg-[#291210] border border-[#b53429] text-[#ffd4cf] text-xs rounded-sm flex items-center justify-between gap-2"
            >
              <span>{errorBanner ?? localMsg}</span>
              <button
                type="button"
                onClick={() => {
                  onClearError();
                  setLocalMsg(null);
                }}
                className="text-[11px] uppercase font-bold text-[#ffb5ad] cursor-pointer"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Tawaran 30 Detik Quick Play */}
          {room.quickPlayOfferBots && room.phase === 'LOBBY' && (
            <div className="p-3.5 bg-[#1b1810] border border-[#cfa15a] rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-[#f5e7c9]">
                <strong>30 detik menunggu pemain lain:</strong> Pemain belum mencapai minimum. Mulai dengan AI teman atau terus menunggu?
              </div>
              {isHost && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => client.startMatch(room.code, guestId, true, 1)}
                    className="px-3 py-1.5 bg-[#25593c] hover:bg-[#2d6d49] border border-[#689f7d] text-white text-xs font-bold rounded-sm cursor-pointer whitespace-nowrap"
                  >
                    Mulai dengan AI Teman
                  </button>
                  <button
                    type="button"
                    onClick={() => client.keepWaiting(room.code)}
                    className="px-3 py-1.5 bg-[#161c19] hover:bg-[#202924] border border-[#cfa15a]/40 text-[#ebe7dc] text-xs font-semibold rounded-sm cursor-pointer whitespace-nowrap"
                  >
                    Terus Menunggu
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Status Transisi LOADING / ENDED */}
          {room.phase === 'LOADING' && (
            <div className="p-4 bg-[#131d17] border border-[#689f7d] rounded-sm text-center">
              <div className="font-display text-sm font-bold uppercase tracking-[0.16em] text-[#a9e3bf]">
                Memuat Kawasan Sukajadi &amp; Menyinkronkan Skuad...
              </div>
              <p className="text-xs text-[#cdd4cf] mt-1">
                Semua pemain akan masuk ke peta dalam beberapa detik.
              </p>
            </div>
          )}

          {room.phase === 'ENDED' && room.lastSummary && (
            <div className="p-4 bg-[#181310] border border-[#cfa15a] rounded-sm flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#cfa15a] font-semibold">
                  Ringkasan Ronde Terakhir ({room.lastSummary.durationSec} detik)
                </div>
                <div className="font-display text-base font-bold text-[#ebe7dc]">
                  {room.lastSummary.title}
                </div>
                <p className="text-xs text-[#b8c0ba]">{room.lastSummary.subtitle}</p>
              </div>
              {isHost && (
                <button
                  type="button"
                  onClick={() => client.returnToLobby(room.code, guestId)}
                  className="px-4 py-2 bg-[#25593c] hover:bg-[#2e6e4a] border border-[#689f7d] text-white text-xs font-bold uppercase tracking-wider rounded-sm cursor-pointer whitespace-nowrap"
                >
                  Kembali ke Lobby
                </button>
              )}
            </div>
          )}

          {/* Grid Konten Lobby: Kiri (Daftar Pemain + Karakter + Kosmetik), Kanan (Chat + Pengaturan Host) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Kolom Kiri (7 cols) */}
            <div className="lg:col-span-7 flex flex-col gap-3.5">
              {/* Daftar Pemain */}
              <div className="bg-[#090c0b] border border-[rgba(207,161,90,0.18)] rounded-sm p-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs uppercase tracking-[0.16em] text-[#ebe7dc] font-bold">
                    Daftar Pemain ({room.players.length}/{room.settings.maxPlayers})
                  </h3>
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => setShowHostSettings((v) => !v)}
                      className="text-[11px] text-[#cfa15a] hover:underline font-semibold cursor-pointer"
                    >
                      {showHostSettings ? 'Tutup Pengaturan Host' : 'Ubah Pengaturan Room'}
                    </button>
                  )}
                </div>

                {/* Panel Pengaturan Host */}
                {isHost && showHostSettings && (
                  <div className="mb-3 p-3 bg-[#0f1412] border border-[#cfa15a]/30 rounded-sm grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <label className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                      <span className="text-[10px] uppercase text-[#9ca7a0]">Kesulitan</span>
                      <select
                        value={room.settings.difficulty}
                        onChange={(e) =>
                          client.updateSettings(room.code, guestId, {
                            difficulty: e.target.value as RoomDifficulty,
                          })
                        }
                        className="bg-[#161c19] border border-[#2c3630] px-2 py-1.5 rounded-sm text-[#ebe7dc]"
                      >
                        <option value="Santai">Santai</option>
                        <option value="Normal">Normal</option>
                        <option value="Mimpi Buruk">Mimpi Buruk</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase text-[#9ca7a0]">Maks Pemain</span>
                      <select
                        value={room.settings.maxPlayers}
                        onChange={(e) =>
                          client.updateSettings(room.code, guestId, {
                            maxPlayers: Number(e.target.value),
                          })
                        }
                        className="bg-[#161c19] border border-[#2c3630] px-2 py-1.5 rounded-sm text-[#ebe7dc]"
                      >
                        {[2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n} Pemain
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase text-[#9ca7a0]">Join Susulan</span>
                      <button
                        type="button"
                        onClick={() =>
                          client.updateSettings(room.code, guestId, {
                            allowLateJoin: !room.settings.allowLateJoin,
                          })
                        }
                        className="bg-[#161c19] border border-[#2c3630] px-2 py-1.5 rounded-sm text-[#ebe7dc] text-left cursor-pointer"
                      >
                        {room.settings.allowLateJoin ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </label>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {room.players.map((p) => {
                    const charObj = CHARACTERS.find((c) => c.id === p.characterId) ?? CHARACTERS[0];
                    const bagHex =
                      BAG_COLOR_OPTIONS.find((b) => b.id === p.cosmetics.bagColor)?.hex ?? '#2d312e';
                    const isSelf = p.guestId === guestId;
                    return (
                      <div
                        key={p.guestId}
                        data-testid={`lobby-player-${p.nickname}`}
                        className={`px-3 py-2 rounded-sm border flex items-center justify-between gap-2 ${
                          isSelf
                            ? 'bg-[#131b16] border-[#cfa15a]/50'
                            : 'bg-[#0e1310] border-[#232c27]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Avatar */}
                          <div
                            className="w-8 h-8 rounded-sm border border-white/20 flex items-center justify-center font-display text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: charObj.accentColor }}
                            title={`Tas: ${p.cosmetics.bagColor}, Aksesori: ${p.cosmetics.accessory}`}
                          >
                            {p.nickname.slice(0, 2).toUpperCase()}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-[#ebe7dc] truncate">
                                {p.nickname}
                              </span>
                              {p.isHost && (
                                <span
                                  data-testid="host-badge"
                                  className="inline-flex items-center gap-0.5 text-[10px] text-[#cfa15a] font-semibold"
                                >
                                  <Crown className="w-3 h-3" /> Host
                                </span>
                              )}
                              {p.isBot && (
                                <span className="text-[10px] text-[#7ec99e] font-mono-num">[AI]</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-[#98a29b] font-mono-num">
                              <span>{charObj.name} ({charObj.skillName})</span>
                              <span>·</span>
                              <span
                                className="inline-block w-2 h-2 border border-white/30"
                                style={{ backgroundColor: bagHex }}
                              />
                              <span>{p.connected ? `${p.pingMs} ms` : 'Terputus (slot 60d)'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {room.settings.voiceChat && (
                            <span
                              className={p.micOn ? 'text-[#7ec99e]' : 'text-[#6c7570]'}
                              title={p.micOn ? 'Mic Aktif' : 'Mic Mati'}
                            >
                              {p.micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                            </span>
                          )}

                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
                              p.isReady
                                ? 'bg-[#102418] border-[#689f7d]/60 text-[#9de3b8]'
                                : 'bg-[#1f1714] border-[#b53429]/50 text-[#e8a39b]'
                            }`}
                          >
                            {p.isReady ? 'Siap' : 'Belum'}
                          </span>

                          {isHost && !isSelf && (
                            <button
                              type="button"
                              title={`Keluarkan ${p.nickname}`}
                              onClick={() => client.kickPlayer(room.code, guestId, p.guestId)}
                              className="p-1 bg-[#291311] hover:bg-[#3d1c19] border border-[#b53429]/50 text-[#f2b5ae] rounded-sm cursor-pointer"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pilih Karakter Unik (Terkunci Jika Dipilih Pemain Lain) */}
              <div className="bg-[#090c0b] border border-[rgba(207,161,90,0.18)] rounded-sm p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-[0.16em] text-[#ebe7dc] font-bold">
                    Pilih Penyelidik (Unik per Room)
                  </h3>
                  {me && (
                    <span className="text-[11px] text-[#cfa15a] font-semibold">
                      Aktif: {CHARACTERS.find((c) => c.id === me.characterId)?.name}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {CHARACTERS.map((char) => {
                    const holder = room.players.find((p) => p.characterId === char.id);
                    const isMine = holder?.guestId === guestId;
                    const lockedByOther = Boolean(holder && !isMine);
                    return (
                      <button
                        key={char.id}
                        type="button"
                        disabled={lockedByOther}
                        data-testid={`lobby-char-${char.id}`}
                        onClick={() => client.selectCharacter(room.code, guestId, char.id)}
                        className={`p-2 rounded-sm border text-center transition-colors ${
                          isMine
                            ? 'bg-[#2a1412] border-[#b53429] text-[#ebe7dc] cursor-pointer'
                            : lockedByOther
                              ? 'bg-[#0b0e0d] border-[#1f2622] text-[#59625d] cursor-not-allowed opacity-70'
                              : 'bg-[#101512] border-[#26302a] text-[#b5c0b9] hover:border-[#cfa15a]/60 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1 font-display text-xs font-bold">
                          {lockedByOther && <Lock className="w-3 h-3 text-[#d97b73]" />}
                          <span>{char.name}</span>
                        </div>
                        <div className="text-[10px] text-[#cfa15a] truncate">{char.skillName}</div>
                        <div className="text-[9px] opacity-75 truncate">
                          {lockedByOther ? holder?.nickname : char.grade.split(' ')[0]}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {me && (
                  <p className="text-[11px] text-[#b8c2bc] mt-2 leading-relaxed">
                    <strong className="text-[#ebe7dc]">
                      {CHARACTERS.find((c) => c.id === me.characterId)?.name}:
                    </strong>{' '}
                    {CHARACTERS.find((c) => c.id === me.characterId)?.skillDesc}
                  </p>
                )}
              </div>

              {/* Kosmetik (Warna Tas & Aksesori) */}
              <div className="bg-[#090c0b] border border-[rgba(207,161,90,0.18)] rounded-sm p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#9ca7a0] font-semibold mb-1.5">
                    Kosmetik: Warna Tas
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {BAG_COLOR_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleUpdateBag(opt.id)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-sm border text-[10px] cursor-pointer ${
                          cosmetics.bagColor === opt.id
                            ? 'bg-[#1b241f] border-[#cfa15a] text-[#ebe7dc]'
                            : 'bg-[#101412] border-[#252e29] text-[#98a29b]'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 border border-white/30"
                          style={{ backgroundColor: opt.hex }}
                        />
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#9ca7a0] font-semibold mb-1.5">
                    Kosmetik: Aksesori
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ACCESSORY_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleUpdateAccessory(opt.id)}
                        className={`px-2 py-1 rounded-sm border text-[10px] cursor-pointer ${
                          cosmetics.accessory === opt.id
                            ? 'bg-[#1b241f] border-[#cfa15a] text-[#ebe7dc]'
                            : 'bg-[#101412] border-[#252e29] text-[#98a29b]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Kolom Kanan (5 cols): Chat Teks Lobby & Aksi Siap / Mulai */}
            <div className="lg:col-span-5 flex flex-col gap-3.5">
              <div className="bg-[#090c0b] border border-[rgba(207,161,90,0.18)] rounded-sm p-3.5 flex flex-col h-72 lg:h-80">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1c2420]">
                  <h3 className="text-xs uppercase tracking-[0.16em] text-[#ebe7dc] font-bold">
                    Chat Lobby
                  </h3>
                  <button
                    type="button"
                    onClick={() => client.toggleMic(room.code, guestId)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-sm border text-[10px] font-bold uppercase cursor-pointer ${
                      me?.micOn
                        ? 'bg-[#102418] border-[#689f7d] text-[#9de3b8]'
                        : 'bg-[#1a1514] border-[#3d302d] text-[#a39895]'
                    }`}
                  >
                    {me?.micOn ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                    <span>{me?.micOn ? 'Mic Aktif' : 'Mic Mati'}</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-xs">
                  {room.chat.map((msg) => (
                    <div
                      key={msg.id}
                      className={
                        msg.system
                          ? 'text-[#cfa15a] italic text-[11px]'
                          : 'text-[#d4dad5]'
                      }
                    >
                      {!msg.system && (
                        <strong className="text-[#ebe7dc] mr-1.5">{msg.senderName}:</strong>
                      )}
                      <span>{msg.text}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendChat} className="mt-2 pt-2 border-t border-[#1c2420] flex gap-1.5">
                  <input
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Tulis pesan ke regu..."
                    maxLength={160}
                    className="flex-1 bg-[#121714] border border-[#2a342e] rounded-sm px-2.5 py-1.5 text-xs text-[#ebe7dc] focus:outline-none focus:border-[#cfa15a]"
                  />
                  <button
                    type="submit"
                    aria-label="Kirim Chat"
                    className="px-3 py-1.5 bg-[#1b2921] hover:bg-[#23362b] border border-[#689f7d]/50 text-[#d8f3e2] rounded-sm cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>

              {/* Tombol Siap, Mulai (Host), & Keluar */}
              <div className="bg-[#090c0b] border border-[rgba(207,161,90,0.18)] rounded-sm p-3.5 flex flex-col gap-2.5">
                {!isHost && (
                  <button
                    type="button"
                    data-testid="btn-toggle-ready"
                    onClick={() => client.toggleReady(room.code, guestId)}
                    className={`w-full py-2.5 rounded-sm border font-display text-xs font-bold uppercase tracking-[0.14em] cursor-pointer ${
                      me?.isReady
                        ? 'bg-[#1a221d] border-[#689f7d] text-[#a9e3bf]'
                        : 'bg-[#25593c] hover:bg-[#2f704b] border-[#689f7d] text-white'
                    }`}
                  >
                    {me?.isReady ? 'Batalkan Siap' : 'Tandai Siap'}
                  </button>
                )}

                {isHost && (
                  <>
                    <button
                      type="button"
                      data-testid="btn-host-start"
                      disabled={!allHumansReady || room.phase === 'LOADING'}
                      onClick={() => client.startMatch(room.code, guestId, false)}
                      className={`w-full py-3 rounded-sm border font-display text-xs font-bold uppercase tracking-[0.16em] ${
                        allHumansReady && room.phase !== 'LOADING'
                          ? 'bg-[#9e271e] hover:bg-[#b83025] border-[#cfa15a]/55 text-[#f7f4ec] cursor-pointer'
                          : 'bg-[#1a1716] border-[#2e2725] text-[#6d6562] cursor-not-allowed'
                      }`}
                    >
                      MULAI EKSPEDISI
                    </button>
                    {!allHumansReady && (
                      <p className="text-[11px] text-[#cfa15a] text-center">
                        Menunggu semua pemain menekan tombol Siap...
                      </p>
                    )}
                  </>
                )}

                <button
                  type="button"
                  data-testid="btn-leave-room"
                  onClick={() => client.leaveRoom(guestId)}
                  className="w-full py-2 bg-transparent hover:bg-[#191d1b] border border-[#2c3630] text-[#a3aea7] text-xs font-semibold uppercase tracking-wider rounded-sm cursor-pointer"
                >
                  Keluar dari Room
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== HUB MULTIPLAYER (4 PILIHAN) ====================
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-5 bg-[#050706]/88 overflow-y-auto">
      <div
        data-testid="multiplayer-hub-modal"
        className="w-full max-w-4xl max-h-[94vh] overflow-y-auto archival-card rounded-sm p-4 sm:p-6 flex flex-col gap-4 my-auto"
      >
        {/* Header + Profil Guest + Tutup */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[rgba(207,161,90,0.22)]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-[#cfa15a] font-semibold">
              {STUDIO_INFO.studio} · Matchmaking v{GAME_VERSION}
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold tracking-[0.12em] uppercase text-[#ebe7dc] mt-0.5">
              Mode Multiplayer Sukajadi
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-[#151a17] hover:bg-[#1f2722] border border-[rgba(207,161,90,0.3)] text-xs font-semibold text-[#ebe7dc] rounded-sm cursor-pointer self-start sm:self-auto"
          >
            Kembali ke Menu
          </button>
        </div>

        {/* Nickname & Akun Guest */}
        <div className="bg-[#090c0b] border border-[rgba(207,161,90,0.18)] rounded-sm p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1">
            <label htmlFor="mp-nickname" className="block text-[10px] uppercase tracking-wider text-[#9ca7a0] font-semibold mb-1">
              Nickname Penyelidik (2–16 karakter, Tanpa Login Wajib)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="mp-nickname"
                type="text"
                maxLength={16}
                value={nickInput}
                onChange={(e) => {
                  setNickInput(e.target.value);
                  setNickError(null);
                }}
                onBlur={validateAndCommitNick}
                className="w-full max-w-xs bg-[#121714] border border-[#2a352f] rounded-sm px-3 py-1.5 text-xs text-[#ebe7dc] focus:outline-none focus:border-[#cfa15a]"
              />
              <span className="text-[10px] font-mono-num text-[#7f8c84] hidden md:inline">
                ID: {guestId.slice(-8)}
              </span>
            </div>
            {nickError && <p className="text-[11px] text-[#e06a5f] mt-1">{nickError}</p>}
          </div>

          <div className="text-[11px] font-mono-num text-[#9ca7a0] flex items-center gap-2 shrink-0">
            <span className={connected ? 'text-[#7ec99e]' : 'text-[#cfa15a]'}>●</span>
            <span>{connected ? 'Server Online' : 'Siap Menghubungkan'}</span>
          </div>
        </div>

        {(errorBanner || localMsg) && (
          <div
            data-testid="mp-error-banner"
            className="px-3.5 py-2.5 bg-[#291210] border border-[#b53429] text-[#ffd4cf] text-xs rounded-sm flex items-center justify-between gap-2"
          >
            <span>{errorBanner ?? localMsg}</span>
            <button
              type="button"
              onClick={() => {
                onClearError();
                setLocalMsg(null);
              }}
              className="text-[11px] uppercase font-bold text-[#ffb5ad] cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* 4 Pilihan Menu MULTIPLAYER */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(
            [
              { id: 'quickplay', label: '1. Main Cepat', sub: 'Cari Otomatis' },
              { id: 'create', label: '2. Buat Room', sub: 'Host & Kode' },
              { id: 'join', label: '3. Gabung Room', sub: 'Kode & Publik' },
              { id: 'solo', label: '4. Solo', sub: 'AI Teman 0–3' },
            ] as { id: HubTab; label: string; sub: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`mp-tab-${t.id}`}
              onClick={() => {
                onClearError();
                setActiveTab(t.id);
              }}
              className={`p-2.5 rounded-sm border text-left cursor-pointer transition-colors ${
                activeTab === t.id
                  ? 'bg-[#2a1412] border-[#cfa15a] text-[#ebe7dc]'
                  : 'bg-[#0e1310] border-[#252e29] text-[#98a29b] hover:border-[#cfa15a]/45'
              }`}
            >
              <div className="font-display text-xs font-bold whitespace-nowrap">{t.label}</div>
              <div className="text-[10px] opacity-80">{t.sub}</div>
            </button>
          ))}
        </div>

        {/* TAB 1: MAIN CEPAT */}
        {activeTab === 'quickplay' && (
          <div className="bg-[#090c0b] border border-[rgba(207,161,90,0.18)] rounded-sm p-4 flex flex-col gap-3.5">
            <div>
              <h3 className="font-display text-sm font-bold text-[#ebe7dc] uppercase tracking-wider">
                Main Cepat (Quick Play / Random)
              </h3>
              <p className="text-xs text-[#a4b0a8] mt-1 leading-relaxed">
                Otomatis masuk ke room publik yang belum penuh dan belum mulai. Jika belum ada, sistem akan membuat room baru. Setelah 30 detik jika pemain kurang dari minimum, tersedia opsi mulai bersama AI teman atau terus menunggu.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-[#9ca7a0] font-semibold">Filter Bahasa</span>
                <select
                  value={qpLang}
                  onChange={(e) => setQpLang(e.target.value as RoomLanguage | 'any')}
                  className="bg-[#121714] border border-[#2a352f] rounded-sm px-2.5 py-2 text-[#ebe7dc]"
                >
                  <option value="any">Semua Bahasa</option>
                  <option value="id">Indonesia</option>
                  <option value="en">English</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-[#9ca7a0] font-semibold">Filter Region</span>
                <select
                  value={qpRegion}
                  onChange={(e) => setQpRegion(e.target.value as RoomRegion | 'any')}
                  className="bg-[#121714] border border-[#2a352f] rounded-sm px-2.5 py-2 text-[#ebe7dc]"
                >
                  <option value="any">Semua Region</option>
                  <option value="Asia-ID">Asia-ID (Bandung/JKT)</option>
                  <option value="Global">Global</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-[#9ca7a0] font-semibold">Filter Kesulitan</span>
                <select
                  value={qpDiff}
                  onChange={(e) => setQpDiff(e.target.value as RoomDifficulty | 'any')}
                  className="bg-[#121714] border border-[#2a352f] rounded-sm px-2.5 py-2 text-[#ebe7dc]"
                >
                  <option value="any">Semua Kesulitan</option>
                  <option value="Santai">Santai</option>
                  <option value="Normal">Normal</option>
                  <option value="Mimpi Buruk">Mimpi Buruk</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              data-testid="btn-quickplay-go"
              onClick={handleQuickPlay}
              className="w-full sm:w-auto self-start flex items-center justify-center gap-2 px-6 py-3 bg-[#9e271e] hover:bg-[#b83025] border border-[#cfa15a]/45 text-[#f7f4ec] font-display text-xs font-bold uppercase tracking-[0.16em] rounded-sm cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              <span>Cari &amp; Masuk Room</span>
            </button>
          </div>
        )}

        {/* TAB 2: BUAT ROOM */}
        {activeTab === 'create' && (
          <form
            onSubmit={handleCreateRoom}
            className="bg-[#090c0b] border border-[rgba(207,161,90,0.18)] rounded-sm p-4 flex flex-col gap-3.5 text-xs"
          >
            <h3 className="font-display text-sm font-bold text-[#ebe7dc] uppercase tracking-wider">
              Buat Room Baru
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-[#9ca7a0] font-semibold">Nama Room</span>
                <input
                  type="text"
                  maxLength={28}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="bg-[#121714] border border-[#2a352f] rounded-sm px-3 py-2 text-[#ebe7dc]"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-[#9ca7a0] font-semibold">
                  Password Opsional
                </span>
                <input
                  type="password"
                  maxLength={24}
                  placeholder="Kosongkan jika tanpa password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-[#121714] border border-[#2a352f] rounded-sm px-3 py-2 text-[#ebe7dc]"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-[#9ca7a0] font-semibold">
                  Maksimal Pemain (2–5)
                </span>
                <select
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  className="bg-[#121714] border border-[#2a352f] rounded-sm px-3 py-2 text-[#ebe7dc]"
                >
                  {[2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} Pemain
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-[#9ca7a0] font-semibold">Kesulitan</span>
                <select
                  value={createDiff}
                  onChange={(e) => setCreateDiff(e.target.value as RoomDifficulty)}
                  className="bg-[#121714] border border-[#2a352f] rounded-sm px-3 py-2 text-[#ebe7dc]"
                >
                  <option value="Santai">Santai</option>
                  <option value="Normal">Normal</option>
                  <option value="Mimpi Buruk">Mimpi Buruk</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-[#9ca7a0] font-semibold">Bahasa</span>
                <select
                  value={createLang}
                  onChange={(e) => setCreateLang(e.target.value as RoomLanguage)}
                  className="bg-[#121714] border border-[#2a352f] rounded-sm px-3 py-2 text-[#ebe7dc]"
                >
                  <option value="id">Indonesia</option>
                  <option value="en">English</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-[#9ca7a0] font-semibold">Region</span>
                <select
                  value={createRegion}
                  onChange={(e) => setCreateRegion(e.target.value as RoomRegion)}
                  className="bg-[#121714] border border-[#2a352f] rounded-sm px-3 py-2 text-[#ebe7dc]"
                >
                  <option value="Asia-ID">Asia-ID</option>
                  <option value="Global">Global</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsPublic((v) => !v)}
                className={`px-3 py-2 rounded-sm border text-left cursor-pointer ${
                  isPublic
                    ? 'bg-[#102418] border-[#689f7d] text-[#a9e3bf]'
                    : 'bg-[#161a18] border-[#2c3530] text-[#b5c0b9]'
                }`}
              >
                Visibilitas: <strong>{isPublic ? 'Publik' : 'Privat'}</strong>
              </button>

              <button
                type="button"
                onClick={() => setVoiceChat((v) => !v)}
                className={`px-3 py-2 rounded-sm border text-left cursor-pointer ${
                  voiceChat
                    ? 'bg-[#102418] border-[#689f7d] text-[#a9e3bf]'
                    : 'bg-[#161a18] border-[#2c3530] text-[#b5c0b9]'
                }`}
              >
                Voice Chat: <strong>{voiceChat ? 'On' : 'Off'}</strong>
              </button>

              <button
                type="button"
                onClick={() => setAllowLateJoin((v) => !v)}
                className={`px-3 py-2 rounded-sm border text-left cursor-pointer ${
                  allowLateJoin
                    ? 'bg-[#102418] border-[#689f7d] text-[#a9e3bf]'
                    : 'bg-[#161a18] border-[#2c3530] text-[#b5c0b9]'
                }`}
              >
                Join Susulan: <strong>{allowLateJoin ? 'On' : 'Off'}</strong>
              </button>

              <div className="px-3 py-2 rounded-sm border bg-[#111513] border-[#26302a] text-[#8e9a92]">
                Friendly Fire: <strong>Tidak Ada</strong>
              </div>
            </div>

            <button
              type="submit"
              data-testid="btn-create-room-submit"
              className="w-full sm:w-auto self-start px-6 py-3 bg-[#9e271e] hover:bg-[#b83025] border border-[#cfa15a]/45 text-[#f7f4ec] font-display text-xs font-bold uppercase tracking-[0.16em] rounded-sm cursor-pointer"
            >
              Buat Room &amp; Dapatkan Kode
            </button>
          </form>
        )}

        {/* TAB 3: GABUNG ROOM + DAFTAR PUBLIK (AUTO REFRESH 5 DETIK) */}
        {activeTab === 'join' && (
          <div className="bg-[#090c0b] border border-[rgba(207,161,90,0.18)] rounded-sm p-4 flex flex-col gap-3.5 text-xs">
            {/* Input Kode Room Manual */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 pb-3 border-b border-[#1c2420]">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-[10px] uppercase text-[#9ca7a0] font-semibold">
                  Masukkan Kode Room (5 Karakter)
                </span>
                <input
                  type="text"
                  data-testid="input-join-code"
                  maxLength={5}
                  placeholder="Contoh: K7M2Q"
                  value={joinCode}
                  onChange={(e) => setJoinCode(normalizeRoomCode(e.target.value))}
                  className="bg-[#121714] border border-[#2a352f] rounded-sm px-3 py-2 text-sm font-mono-num uppercase tracking-[0.2em] text-[#f5dfb3]"
                />
              </label>

              <label className="flex flex-col gap-1 sm:w-48">
                <span className="text-[10px] uppercase text-[#9ca7a0] font-semibold">
                  Password (jika ada)
                </span>
                <input
                  type="password"
                  placeholder="Opsional"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  className="bg-[#121714] border border-[#2a352f] rounded-sm px-3 py-2 text-[#ebe7dc]"
                />
              </label>

              <button
                type="button"
                data-testid="btn-join-by-code"
                onClick={() => handleJoinByCode(joinCode, joinPassword)}
                className="px-5 py-2.5 bg-[#1b4a32] hover:bg-[#236041] border border-[#689f7d] text-white font-display text-xs font-bold uppercase tracking-wider rounded-sm cursor-pointer whitespace-nowrap"
              >
                Gabung Kode
              </button>
            </div>

            {/* Search & Filter Daftar Room Publik */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="text"
                  placeholder="Cari nama room, host, atau kode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-[#121714] border border-[#2a352f] rounded-sm px-3 py-1.5 text-xs text-[#ebe7dc]"
                />
                <select
                  value={filterDiff}
                  onChange={(e) => setFilterDiff(e.target.value as RoomDifficulty | 'any')}
                  className="bg-[#121714] border border-[#2a352f] rounded-sm px-2.5 py-1.5 text-xs text-[#ebe7dc]"
                >
                  <option value="any">Semua Kesulitan</option>
                  <option value="Santai">Santai</option>
                  <option value="Normal">Normal</option>
                  <option value="Mimpi Buruk">Mimpi Buruk</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => void refreshPublicRooms()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141a17] hover:bg-[#1d2521] border border-[#2c3630] text-[#b5c0b9] rounded-sm cursor-pointer whitespace-nowrap font-mono-num"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
                <span>Segarkan ({refreshCountdown}d)</span>
              </button>
            </div>

            {/* Tabel / Daftar Room Publik */}
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {publicRooms.length === 0 ? (
                <div className="p-4 text-center text-[#8e9a92] border border-dashed border-[#242e28] rounded-sm">
                  Belum ada room publik yang cocok. Gunakan Main Cepat atau Buat Room baru!
                </div>
              ) : (
                publicRooms.map((r) => (
                  <div
                    key={r.code}
                    className="p-3 bg-[#0f1412] border border-[#252f29] rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num text-[11px] font-bold text-[#cfa15a]">
                          [{r.code}]
                        </span>
                        <strong className="text-[#ebe7dc]">{r.roomName}</strong>
                        {r.hasPassword && <Lock className="w-3.5 h-3.5 text-[#cfa15a]" />}
                      </div>
                      <div className="text-[11px] text-[#98a29b] font-mono-num mt-0.5">
                        Host: {r.hostName} · {r.playerCount}/{r.maxPlayers} Pemain · {r.difficulty} ·{' '}
                        {r.pingMs} ms ·{' '}
                        <span className={r.phase === 'LOBBY' ? 'text-[#7ec99e]' : 'text-[#cfa15a]'}>
                          {r.phase === 'LOBBY'
                            ? 'Menunggu'
                            : r.allowLateJoin
                              ? 'Bermain (Late Join)'
                              : 'Sedang Bermain'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleJoinByCode(r.code, joinPassword)}
                      className="px-4 py-1.5 bg-[#1b4a32] hover:bg-[#236041] border border-[#689f7d] text-white text-xs font-bold uppercase tracking-wider rounded-sm cursor-pointer whitespace-nowrap self-start sm:self-auto"
                    >
                      Gabung
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 4: SOLO (TANPA SERVER) DENGAN AI TEMAN 0-3 */}
        {activeTab === 'solo' && (
          <div className="bg-[#090c0b] border border-[rgba(207,161,90,0.18)] rounded-sm p-4 flex flex-col gap-3.5 text-xs">
            <div className="flex items-center gap-2 text-[#cfa15a] font-semibold">
              <Users className="w-4 h-4" />
              <span>Mode Solo Offline (Tanpa Koneksi Server)</span>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {CHARACTERS.map((char) => (
                <button
                  key={char.id}
                  type="button"
                  onClick={() => onSelectSoloCharacter(char.id)}
                  className={`p-2 rounded-sm border text-center cursor-pointer ${
                    selectedCharacter === char.id
                      ? 'bg-[#2a1412] border-[#b53429] text-[#ebe7dc]'
                      : 'bg-[#101512] border-[#26302a] text-[#94a098]'
                  }`}
                >
                  <div className="font-display text-xs font-bold">{char.name}</div>
                  <div className="text-[10px] text-[#cfa15a] truncate">{char.skillName}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase text-[#9ca7a0] font-semibold mb-1.5">
                  Kesulitan
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Santai', 'Normal', 'Mimpi Buruk'] as RoomDifficulty[]).map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => onChangeSoloDifficulty(diff)}
                      className={`py-2 rounded-sm border font-bold uppercase text-[10px] cursor-pointer ${
                        soloDifficulty === diff
                          ? 'bg-[#2a1412] border-[#cfa15a] text-[#f5dfb3]'
                          : 'bg-[#101512] border-[#26302a] text-[#94a098]'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-[#9ca7a0] font-semibold mb-1.5">
                  Jumlah AI Teman (0–3)
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0, 1, 2, 3].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => onChangeAiCompanions(cnt)}
                      className={`py-2 rounded-sm border font-mono-num font-bold cursor-pointer ${
                        aiCompanionCount === cnt
                          ? 'bg-[#13291d] border-[#689f7d] text-[#bdf2cf]'
                          : 'bg-[#101512] border-[#26302a] text-[#94a098]'
                      }`}
                    >
                      {cnt} AI
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onStartSolo}
              className="w-full sm:w-auto self-start px-6 py-3 bg-[#9e271e] hover:bg-[#b83025] border border-[#cfa15a]/45 text-[#f7f4ec] font-display text-xs font-bold uppercase tracking-[0.16em] rounded-sm cursor-pointer"
            >
              Mulai Solo Sekarang
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
