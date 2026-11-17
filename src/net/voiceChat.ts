import type { Vec3 } from '../game/types';
import type { LobbyPlayer, RtcSignalPayload } from '../shared/lobbyProtocol';
import type { LobbyClient } from './lobbyClient';

interface PeerEntry {
  pc: RTCPeerConnection;
  gainNode?: GainNode;
  filterNode?: BiquadFilterNode;
  audioEl?: HTMLAudioElement;
}

export type VoiceStatus = 'disabled' | 'ready' | 'active' | 'denied' | 'unavailable';

export class CoopVoiceManager {
  private client: LobbyClient;
  private peers = new Map<string, PeerEntry>();
  private localStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private localGuestId = '';
  private roomCode = '';
  private enabled = false;
  private micOn = false;
  private status: VoiceStatus = 'disabled';
  private onStatusChange?: (status: VoiceStatus) => void;

  constructor(client: LobbyClient, onStatusChange?: (status: VoiceStatus) => void) {
    this.client = client;
    this.onStatusChange = onStatusChange;
  }

  public getStatus(): VoiceStatus {
    return this.status;
  }

  private setStatus(next: VoiceStatus) {
    this.status = next;
    this.onStatusChange?.(next);
  }

  public async configure(opts: {
    roomCode: string;
    localGuestId: string;
    enabled: boolean;
    micOn: boolean;
    players: LobbyPlayer[];
  }): Promise<void> {
    this.roomCode = opts.roomCode;
    this.localGuestId = opts.localGuestId;
    this.enabled = opts.enabled;
    this.micOn = opts.micOn;

    if (!opts.enabled || !opts.roomCode) {
      this.disposePeers();
      this.stopLocalStream();
      this.setStatus('disabled');
      return;
    }

    if (
      typeof RTCPeerConnection === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      this.setStatus('unavailable');
      return;
    }

    if (opts.micOn && !this.localStream) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        this.setStatus('active');
      } catch {
        this.setStatus('denied');
        return;
      }
    } else {
      this.setStatus(opts.micOn ? 'active' : 'ready');
    }

    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = opts.micOn;
      }
    }

    // Sync peers with connected human players
    const targets = opts.players.filter(
      (p) => !p.isBot && p.connected && p.guestId !== opts.localGuestId
    );
    const activeIds = new Set(targets.map((p) => p.guestId));

    for (const [peerId, entry] of this.peers.entries()) {
      if (!activeIds.has(peerId)) {
        entry.pc.close();
        entry.audioEl?.remove();
        this.peers.delete(peerId);
      }
    }

    for (const peer of targets) {
      if (!this.peers.has(peer.guestId)) {
        const shouldOffer = opts.localGuestId < peer.guestId;
        await this.createPeer(peer.guestId, shouldOffer);
      }
    }
  }

  private async createPeer(remoteGuestId: string, initiateOffer: boolean): Promise<PeerEntry> {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    const entry: PeerEntry = { pc };
    this.peers.set(remoteGuestId, entry);

    pc.onicecandidate = (ev) => {
      if (!ev.candidate || !this.roomCode) return;
      this.client.sendRtcSignal({
        code: this.roomCode,
        fromGuestId: this.localGuestId,
        toGuestId: remoteGuestId,
        signalType: 'ice',
        candidate: ev.candidate.toJSON(),
      });
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (!stream) return;
      this.attachRemoteAudio(remoteGuestId, entry, stream);
    };

    if (initiateOffer && this.localStream) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.client.sendRtcSignal({
          code: this.roomCode,
          fromGuestId: this.localGuestId,
          toGuestId: remoteGuestId,
          signalType: 'offer',
          sdp: { type: offer.type, sdp: offer.sdp },
        });
      } catch {
        // Ignore transient signaling error
      }
    }

    return entry;
  }

  private attachRemoteAudio(_remoteGuestId: string, entry: PeerEntry, stream: MediaStream) {
    try {
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.srcObject = stream;
      audioEl.volume = 0; // routed through Web Audio GainNode when available
      entry.audioEl = audioEl;

      if (!this.audioCtx) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (Ctx) this.audioCtx = new Ctx();
      }
      if (this.audioCtx) {
        if (this.audioCtx.state === 'suspended') {
          void this.audioCtx.resume().catch(() => {});
        }
        const source = this.audioCtx.createMediaStreamSource(stream);
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'allpass';
        const gain = this.audioCtx.createGain();
        gain.gain.value = 0.85;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.audioCtx.destination);
        entry.filterNode = filter;
        entry.gainNode = gain;
      } else {
        audioEl.volume = 0.85;
      }
    } catch {
      // Fallback cleanly if audio playback blocked
    }
  }

  public async handleSignal(sig: RtcSignalPayload): Promise<void> {
    if (!this.enabled || sig.code !== this.roomCode) return;
    let entry = this.peers.get(sig.fromGuestId);
    if (!entry) {
      entry = await this.createPeer(sig.fromGuestId, false);
    }

    try {
      if (sig.signalType === 'offer' && sig.sdp) {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(sig.sdp as RTCSessionDescriptionInit));
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        this.client.sendRtcSignal({
          code: this.roomCode,
          fromGuestId: this.localGuestId,
          toGuestId: sig.fromGuestId,
          signalType: 'answer',
          sdp: { type: answer.type, sdp: answer.sdp },
        });
      } else if (sig.signalType === 'answer' && sig.sdp) {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(sig.sdp as RTCSessionDescriptionInit));
      } else if (sig.signalType === 'ice' && sig.candidate) {
        await entry.pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
      }
    } catch {
      // Ignore stale ICE/SDP race
    }
  }

  /**
   * Proximity + HT Radio audio spatial attenuation:
   * - < 16m: clear proximity voice
   * - >= 16m: walkie-talkie bandpass radio effect with clear audibility
   */
  public updateSpatialPositions(
    localPos: Vec3,
    remotePositions: { guestId: string; position: Vec3; micOn: boolean }[]
  ): void {
    for (const remote of remotePositions) {
      const entry = this.peers.get(remote.guestId);
      if (!entry) continue;
      const dist = Math.hypot(
        remote.position.x - localPos.x,
        remote.position.y - localPos.y,
        remote.position.z - localPos.z
      );
      if (entry.gainNode && this.audioCtx) {
        const gainVal = !remote.micOn
          ? 0
          : dist <= 16
            ? Math.max(0.28, 1 - dist / 22)
            : 0.42; // HT radio floor gain
        entry.gainNode.gain.setTargetAtTime(gainVal, this.audioCtx.currentTime, 0.08);
      }
      if (entry.filterNode) {
        if (dist > 16) {
          entry.filterNode.type = 'bandpass';
          entry.filterNode.frequency.value = 1350;
          entry.filterNode.Q.value = 1.4;
        } else {
          entry.filterNode.type = 'allpass';
        }
      }
    }
  }

  private disposePeers() {
    for (const entry of this.peers.values()) {
      entry.pc.close();
      entry.audioEl?.remove();
    }
    this.peers.clear();
  }

  private stopLocalStream() {
    if (this.localStream) {
      for (const t of this.localStream.getTracks()) t.stop();
      this.localStream = null;
    }
  }

  public dispose() {
    this.disposePeers();
    this.stopLocalStream();
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
