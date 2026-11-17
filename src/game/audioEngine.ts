import type { AudioSettings, EndingType, GhostKind, NpcVoiceId } from './types';

const CAR_AUDIO_URL = '/assets/audio/car_engine.mp3';
const BGM_GAMELAN_URL = '/assets/audio/mus_gameplay_gamelan_sunda_eropa.wav';
const POCONG_SCARE_URL = '/assets/audio/jumscare-pocon.mp3';

/**
 * Mesin Audio Prosedural + Aset Rekaman Web Audio API untuk Rumah Gurita: Dimensi Gaib.
 * Menggunakan bus Gain terpisah (Master, Backsound Gamelan, Music Ambient, SFX) serta
 * menghadirkan suara jump-scare autentik Pocong, suara engsel pintu, dan atmosfer malam.
 */
export class HorrorAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private padGain: GainNode | null = null;
  private droneOsc: OscillatorNode | null = null;
  private padOscA: OscillatorNode | null = null;
  private padOscB: OscillatorNode | null = null;
  private cricketTimer = 0;
  private heartbeatTimer = 0;
  private stepTimer = 0;
  private ghostCueTimer = 0;
  private muted = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private speechToken = 0;
  private speechSpeakingUntil = 0;
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private rawBuffers = new Map<string, ArrayBuffer>();
  private decodedBuffers = new Map<string, AudioBuffer>();
  private fetchStarted = new Set<string>();
  private decodingUrls = new Set<string>();
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmDuckMul = 1.0;
  private carSource: AudioBufferSourceNode | null = null;
  private carFilter: BiquadFilterNode | null = null;
  private carPanner: StereoPannerNode | null = null;
  private carGain: GainNode | null = null;
  private carShouldPlay = false;
  private carPlaybackOffset = 0;
  private settings: AudioSettings = {
    masterVolume: 80,
    musicVolume: 65,
    sfxVolume: 85,
    bgmVolume: 75,
    masterEnabled: true,
    bgmEnabled: true,
    musicEnabled: true,
    sfxEnabled: true,
    voiceEnabled: true,
  };

  constructor() {
    this.preloadAudioAsset(CAR_AUDIO_URL);
    this.preloadAudioAsset(BGM_GAMELAN_URL);
    this.preloadAudioAsset(POCONG_SCARE_URL);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const refresh = () => {
        try {
          this.cachedVoices = window.speechSynthesis.getVoices();
        } catch {
          // Abaikan
        }
      };
      refresh();
      window.speechSynthesis.addEventListener?.('voiceschanged', refresh);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getAudioSettings(): AudioSettings {
    return { ...this.settings };
  }

  public setAudioSettings(next: AudioSettings): void {
    this.settings = {
      masterVolume: Math.max(0, Math.min(100, Math.round(next.masterVolume))),
      musicVolume: Math.max(0, Math.min(100, Math.round(next.musicVolume))),
      sfxVolume: Math.max(0, Math.min(100, Math.round(next.sfxVolume))),
      bgmVolume: Math.max(0, Math.min(100, Math.round(next.bgmVolume ?? this.settings.bgmVolume ?? 75))),
      masterEnabled: next.masterEnabled ?? true,
      bgmEnabled: next.bgmEnabled ?? true,
      musicEnabled: next.musicEnabled ?? true,
      sfxEnabled: next.sfxEnabled ?? true,
      voiceEnabled: next.voiceEnabled ?? true,
    };
    if (this.settings.masterEnabled === false || this.settings.voiceEnabled === false) {
      this.stopSpeech();
    }
    if (this.settings.masterEnabled === false || this.settings.sfxEnabled === false) {
      this.stopCarAudio();
    }
    if (this.settings.bgmEnabled !== false && this.settings.masterEnabled !== false) {
      this.ensureBgmPlaying();
    }
    this.applyGains();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.stopSpeech();
      this.stopCarAudio();
    }
    this.applyGains();
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private applyGains(): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const masterEnabled = this.settings.masterEnabled !== false;
    const masterTarget =
      this.muted || !masterEnabled ? 0 : (this.settings.masterVolume / 100) * 0.85;
    const musicTarget =
      this.settings.musicEnabled === false ? 0 : this.settings.musicVolume / 100;
    const sfxTarget =
      this.settings.sfxEnabled === false ? 0 : this.settings.sfxVolume / 100;
    const bgmVol = (this.settings.bgmVolume ?? 75) / 100;
    const bgmTarget =
      this.settings.bgmEnabled === false || this.muted || !masterEnabled
        ? 0
        : bgmVol * 0.42 * this.bgmDuckMul;
    this.masterGain.gain.setTargetAtTime(masterTarget, now, 0.04);
    this.musicGain.gain.setTargetAtTime(musicTarget, now, 0.04);
    this.sfxGain.gain.setTargetAtTime(sfxTarget, now, 0.04);
    if (this.bgmGain) {
      this.bgmGain.gain.setTargetAtTime(bgmTarget, now, 0.12);
    }
  }

  private hasUserActivation(): boolean {
    if (typeof navigator === 'undefined') return true;
    const ua = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
    return ua ? ua.hasBeenActive : true;
  }

  public unlock(force = false): void {
    if (!force && !this.hasUserActivation()) return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.bgmGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.bgmGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyGains();

      // Musik Layer 1: Sub-bass Dimensi Gaib drone
      this.droneOsc = this.ctx.createOscillator();
      this.droneOsc.type = 'sawtooth';
      this.droneOsc.frequency.value = 46;
      const droneFilter = this.ctx.createBiquadFilter();
      droneFilter.type = 'lowpass';
      droneFilter.frequency.value = 115;
      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.value = 0.03;

      this.droneOsc.connect(droneFilter);
      droneFilter.connect(this.droneGain);
      this.droneGain.connect(this.musicGain);
      this.droneOsc.start();

      // Musik Layer 2: Pad minor gamelan-ambient misterius
      this.padOscA = this.ctx.createOscillator();
      this.padOscB = this.ctx.createOscillator();
      this.padOscA.type = 'sine';
      this.padOscB.type = 'triangle';
      this.padOscA.frequency.value = 146.83;
      this.padOscB.frequency.value = 174.61;
      const padFilter = this.ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 340;
      this.padGain = this.ctx.createGain();
      this.padGain.gain.value = 0.018;

      this.padOscA.connect(padFilter);
      this.padOscB.connect(padFilter);
      padFilter.connect(this.padGain);
      this.padGain.connect(this.musicGain);
      this.padOscA.start();
      this.padOscB.start();
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx
        .resume()
        .then(() => {
          this.tryDecodeAllAssets();
          this.ensureBgmPlaying();
          if (this.carShouldPlay && !this.carSource && this.decodedBuffers.has(CAR_AUDIO_URL)) {
            this.startDecodedCarSource(this.carPlaybackOffset);
          }
        })
        .catch(() => {});
    } else if (this.ctx) {
      this.tryDecodeAllAssets();
      this.ensureBgmPlaying();
    }
  }

  public updateAmbience(
    dt: number,
    inDimensiGaib: boolean,
    sanity: number,
    nearestGhostDist: number,
    isMoving: boolean,
    isSprinting: boolean,
    isCrouching: boolean,
    nearestGhostKind: GhostKind | null = null
  ): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;

    this.ensureBgmPlaying();
    const threat = nearestGhostDist < 10 ? (10 - nearestGhostDist) / 10 : 0;
    const nextDuck = this.isSpeaking() ? 0.56 : this.carShouldPlay ? 0.72 : inDimensiGaib ? 1.18 : 1.0;
    if (Math.abs(nextDuck - this.bgmDuckMul) > 0.04) {
      this.bgmDuckMul = nextDuck;
      this.applyGains();
    }

    if (this.droneGain) {
      const targetDrone = (inDimensiGaib ? 0.08 : 0.025) + threat * 0.11;
      this.droneGain.gain.setTargetAtTime(targetDrone, this.ctx.currentTime, 0.25);
    }
    if (this.padGain && this.padOscB) {
      const targetPad = (inDimensiGaib ? 0.045 : 0.022) + threat * 0.035;
      this.padGain.gain.setTargetAtTime(targetPad, this.ctx.currentTime, 0.35);
      const targetFreqB = threat > 0.45 ? 155.56 : 174.61;
      this.padOscB.frequency.setTargetAtTime(targetFreqB, this.ctx.currentTime, 0.4);
    }

    if (!inDimensiGaib) {
      this.cricketTimer -= dt;
      if (this.cricketTimer <= 0) {
        this.cricketTimer = 1.6 + Math.random() * 2.8;
        this.playCricketChirp();
      }
    }

    const danger = Math.max(
      sanity < 55 ? (55 - sanity) / 55 : 0,
      nearestGhostDist < 7 ? (7 - nearestGhostDist) / 7 : 0
    );
    if (danger > 0.12) {
      this.heartbeatTimer -= dt;
      if (this.heartbeatTimer <= 0) {
        this.heartbeatTimer = Math.max(0.38, 1.05 - danger * 0.62);
        this.playHeartbeat(0.15 + danger * 0.28);
      }
    }

    if (isMoving) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = isSprinting ? 0.31 : isCrouching ? 0.62 : 0.45;
        this.playFootstep(isCrouching ? 0.05 : isSprinting ? 0.16 : 0.1);
      }
    } else {
      this.stepTimer = 0.08;
    }

    if (inDimensiGaib && nearestGhostDist < 12) {
      this.ghostCueTimer -= dt;
      if (this.ghostCueTimer <= 0) {
        this.ghostCueTimer = 4.4 + Math.random() * 4.2;
        this.playGhostVocal(nearestGhostKind ?? 'ambu_hideung', Math.max(0.1, (12 - nearestGhostDist) / 12));
      }
    }
  }

  private playCricketChirp(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(4200 + Math.random() * 250, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.025, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  private playHeartbeat(volume: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.16;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(i === 0 ? 64 : 52, t);
      osc.frequency.exponentialRampToValueAtTime(28, t + 0.12);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  public playFootstep(volume = 0.1): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = 110 * (0.92 + Math.random() * 0.16);
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.07);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Suara percikan air realistis ketika pemain melangkah di dalam genangan hujan.
   */
  public playWaterSplash(isSprinting = false): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.22);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.42));
    }

    const splash = this.ctx.createBufferSource();
    splash.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(isSprinting ? 1450 : 1050, now);
    bp.frequency.exponentialRampToValueAtTime(420, now + 0.19);
    bp.Q.value = 1.4;

    const gain = this.ctx.createGain();
    const peak = isSprinting ? 0.22 : 0.14;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    splash.connect(bp);
    bp.connect(gain);
    gain.connect(this.sfxGain);
    splash.start(now);
    splash.stop(now + 0.21);

    // Nada gelembung air singkat di latar belakang
    const drop = this.ctx.createOscillator();
    const dGain = this.ctx.createGain();
    drop.type = 'sine';
    drop.frequency.setValueAtTime(320 + Math.random() * 140, now + 0.02);
    drop.frequency.exponentialRampToValueAtTime(760, now + 0.09);
    dGain.gain.setValueAtTime(0.04, now + 0.02);
    dGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    drop.connect(dGain);
    dGain.connect(this.sfxGain);
    drop.start(now + 0.02);
    drop.stop(now + 0.11);
  }

  public playClick(high = true): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(high ? 1450 : 920, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.035);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playDoorCreak(opening: boolean): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(opening ? 135 : 195, now);
    osc.frequency.linearRampToValueAtTime(opening ? 225 : 112, now + 0.28);
    filt.type = 'bandpass';
    filt.frequency.value = 540;
    filt.Q.value = 4.5;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(filt);
    filt.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  public playLockedRattle(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [0, 0.08].forEach((offset) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, now + offset);
      osc.frequency.exponentialRampToValueAtTime(85, now + offset + 0.05);
      gain.gain.setValueAtTime(0.14, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + offset);
      osc.stop(now + offset + 0.07);
    });
  }

  public playDoorSlam(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(115, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 0.35);
    subGain.gain.setValueAtTime(0.36, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    sub.connect(subGain);
    subGain.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 0.4);

    const clack = this.ctx.createOscillator();
    const clackGain = this.ctx.createGain();
    clack.type = 'square';
    clack.frequency.setValueAtTime(180, now);
    clack.frequency.exponentialRampToValueAtTime(55, now + 0.14);
    clackGain.gain.setValueAtTime(0.18, now);
    clackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    clack.connect(clackGain);
    clackGain.connect(this.sfxGain);
    clack.start(now);
    clack.stop(now + 0.17);
  }

  /**
   * Suara vokal prosedural berbeda untuk setiap NPC saat berinteraksi / berdialog.
   */
  public playNpcVoice(speakerId: NpcVoiceId, lineIndex = 0): void {
    this.unlock(true);
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const profiles: Record<
      NpcVoiceId,
      {
        baseFreq: number;
        contour: number[];
        formantFreq: number;
        q: number;
        oscType: OscillatorType;
        stepSec: number;
        gain: number;
      }
    > = {
      // Pak Ujang: bariton tegas paruh baya, intonasi menurun berwibawa
      satpam: {
        baseFreq: 108,
        contour: [1.02, 1.08, 0.94, 0.88],
        formantFreq: 480,
        q: 3.2,
        oscType: 'sawtooth',
        stepSec: 0.115,
        gain: 0.14,
      },
      // Mang Asep: tenor ramah ceria dengan cengkok Sunda naik-turun
      nasgor: {
        baseFreq: 168,
        contour: [0.95, 1.18, 1.04, 1.24, 0.96],
        formantFreq: 760,
        q: 2.6,
        oscType: 'triangle',
        stepSec: 0.095,
        gain: 0.16,
      },
      // Mas Budi: tenor rendah santai agak serak/datar
      pecel: {
        baseFreq: 136,
        contour: [1.0, 1.06, 0.96, 1.02, 0.92],
        formantFreq: 610,
        q: 2.8,
        oscType: 'sawtooth',
        stepSec: 0.105,
        gain: 0.12,
      },
      // Rani (walkie-talkie): suara remaja tinggi disaring bandpass radio
      rani: {
        baseFreq: 315,
        contour: [1.08, 1.22, 0.96, 1.15],
        formantFreq: 1450,
        q: 4.5,
        oscType: 'triangle',
        stepSec: 0.09,
        gain: 0.14,
      },
      // Ceu Titin (Pemilik Warung Ceu Titin): suara ibu-ibu Sunda hangat lembut bernada sedang-tinggi
      warung_ibu: {
        baseFreq: 238,
        contour: [1.04, 1.16, 1.08, 0.96, 1.12],
        formantFreq: 980,
        q: 2.7,
        oscType: 'triangle',
        stepSec: 0.1,
        gain: 0.15,
      },
      // Rizky & Anak Muda Tongkrongan: suara pemuda energik, cepat, sedikit nasal
      warung_pemuda: {
        baseFreq: 152,
        contour: [0.96, 1.14, 1.2, 1.02, 1.1],
        formantFreq: 720,
        q: 3.1,
        oscType: 'sawtooth',
        stepSec: 0.082,
        gain: 0.13,
      },
    };

    const p = profiles[speakerId];
    const pitchShift = 1 + ((lineIndex % 3) - 1) * 0.035;

    p.contour.forEach((mult, idx) => {
      const t = now + idx * p.stepSec;
      const osc = this.ctx!.createOscillator();
      const formant = this.ctx!.createBiquadFilter();
      const gain = this.ctx!.createGain();

      osc.type = p.oscType;
      const f = p.baseFreq * mult * pitchShift;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * (idx % 2 === 0 ? 1.05 : 0.94), t + p.stepSec * 0.85);

      formant.type = 'bandpass';
      formant.frequency.setValueAtTime(p.formantFreq * (0.94 + idx * 0.04), t);
      formant.Q.value = p.q;

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(p.gain, t + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, t + p.stepSec * 0.9);

      osc.connect(formant);
      formant.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + p.stepSec);
    });
  }

  public isSpeaking(): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    return (
      this.currentUtterance !== null &&
      performance.now() < this.speechSpeakingUntil &&
      window.speechSynthesis.speaking
    );
  }

  /**
   * Ucapkan kalimat dialog nyata dalam Bahasa Indonesia dengan seleksi gender suara (pria/wanita),
   * perlindungan terhadap Chromium GC agar tidak terpotong di tengah kalimat, serta karakterisasi tiap tokoh.
   */
  public speakIndonesian(
    text: string,
    role:
      | NpcVoiceId
      | 'pa_nanang'
      | 'player'
      | 'companion'
      | 'raka'
      | 'salsa'
      | 'bima'
      | 'nadia'
      | 'dito',
    onEnd?: () => void
  ): boolean {
    if (
      this.muted ||
      this.settings.masterEnabled === false ||
      this.settings.voiceEnabled === false ||
      typeof window === 'undefined' ||
      !('speechSynthesis' in window)
    ) {
      return false;
    }
    if (!this.hasUserActivation()) return false;
    try {
      const synth = window.speechSynthesis;
      const voices = this.cachedVoices.length > 0 ? this.cachedVoices : synth.getVoices();
      this.cachedVoices = voices;
      const cleaned = text.replace(/^["'“]+|["'”]+$/g, '').trim();
      if (!cleaned) return false;

      const voicePreset: Record<string, { gender: 'male' | 'female'; pitch: number; rate: number }> = {
        pa_nanang: { gender: 'male', pitch: 0.72, rate: 1.04 },
        satpam: { gender: 'male', pitch: 0.64, rate: 1.0 },
        nasgor: { gender: 'male', pitch: 0.9, rate: 1.12 },
        pecel: { gender: 'male', pitch: 0.77, rate: 0.98 },
        warung_pemuda: { gender: 'male', pitch: 0.94, rate: 1.15 },
        warung_ibu: { gender: 'female', pitch: 1.22, rate: 1.02 },
        rani: { gender: 'female', pitch: 1.42, rate: 1.12 },
        raka: { gender: 'male', pitch: 0.86, rate: 1.06 },
        bima: { gender: 'male', pitch: 0.8, rate: 1.03 },
        dito: { gender: 'male', pitch: 0.92, rate: 1.01 },
        salsa: { gender: 'female', pitch: 1.3, rate: 1.07 },
        nadia: { gender: 'female', pitch: 1.2, rate: 1.1 },
        player: { gender: 'male', pitch: 0.86, rate: 1.06 },
        companion: { gender: 'female', pitch: 1.24, rate: 1.07 },
      };
      const cfg = voicePreset[role] ?? { gender: 'male', pitch: 0.88, rate: 1.04 };

      synth.cancel();
      this.speechToken += 1;
      const myToken = this.speechToken;

      const utt = new SpeechSynthesisUtterance(cleaned);
      const idVoices = voices.filter(
        (v) => v.lang.toLowerCase().startsWith('id') || v.lang.toLowerCase().includes('ms')
      );
      const maleNameRe = /ardi|andika|laki|pria|male|budi|ahmad|david|guy|daniel|mark/i;
      const femaleNameRe = /gadis|damayanti|wanita|female|sari|google bahasa|zira|aria|samantha/i;

      let chosen =
        cfg.gender === 'male'
          ? idVoices.find((v) => maleNameRe.test(v.name))
          : idVoices.find((v) => femaleNameRe.test(v.name));
      if (!chosen && cfg.gender === 'male' && idVoices.length > 1) {
        chosen = idVoices.find((v) => !femaleNameRe.test(v.name)) ?? idVoices[0];
      } else if (!chosen) {
        chosen = idVoices[0];
      }
      if (chosen) {
        utt.voice = chosen;
      }
      utt.lang = chosen?.lang ?? 'id-ID';

      // Jika hanya tersedia voice wanita default OS untuk id-ID, tekan pitch karakter pria agar jelas maskulin
      const onlyFemaleVoice = chosen ? femaleNameRe.test(chosen.name) && !maleNameRe.test(chosen.name) : true;
      const adjustedPitch =
        cfg.gender === 'male' && onlyFemaleVoice ? Math.max(0.54, cfg.pitch - 0.14) : cfg.pitch;

      utt.pitch = adjustedPitch;
      utt.rate = cfg.rate;
      utt.volume = Math.min(1, (this.settings.masterVolume / 100) * (this.settings.sfxVolume / 100) * 0.95);

      const finish = () => {
        if (this.speechToken === myToken) {
          this.currentUtterance = null;
          this.speechSpeakingUntil = 0;
          onEnd?.();
        }
      };
      utt.onend = finish;
      utt.onerror = finish;

      this.currentUtterance = utt;
      this.speechSpeakingUntil = performance.now() + Math.max(1800, cleaned.length * 95);
      synth.speak(utt);
      return true;
    } catch {
      this.currentUtterance = null;
      return false;
    }
  }

  public stopSpeech(): void {
    this.speechToken += 1;
    this.currentUtterance = null;
    this.speechSpeakingUntil = 0;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Abaikan
    }
  }

  public playPickup(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0.12, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.22);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.24);
    });
  }

  public playDebunkChime(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const chord = [392.0, 493.88, 587.33, 783.99];
    chord.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.14, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.7);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.72);
    });
  }

  /**
   * Suara atmosferik khas tiap jenis hantu saat mengintai di sekitar pemain.
   */
  public playGhostVocal(kind: GhostKind, intensity = 0.5): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const vol = Math.max(0.03, Math.min(0.22, intensity * 0.16));

    if (kind === 'kuntilanak') {
      // Tawa lirih perempuan menggema ("hi-hi-hi")
      [0, 0.19, 0.38].forEach((off, idx) => {
        const osc = this.ctx!.createOscillator();
        const lfo = this.ctx!.createOscillator();
        const lfoGain = this.ctx!.createGain();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        const f = 820 - idx * 65;
        osc.frequency.setValueAtTime(f, now + off);
        osc.frequency.exponentialRampToValueAtTime(f * 0.72, now + off + 0.16);
        lfo.frequency.value = 18;
        lfoGain.gain.value = 28;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        gain.gain.setValueAtTime(0.001, now + off);
        gain.gain.linearRampToValueAtTime(vol * 0.72, now + off + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + off + 0.18);
        osc.connect(gain);
        gain.connect(this.sfxGain!);
        lfo.start(now + off);
        osc.start(now + off);
        lfo.stop(now + off + 0.19);
        osc.stop(now + off + 0.19);
      });
      return;
    }

    if (kind === 'genderuwo') {
      // Geraman bas dalam di tenggorokan
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(64, now);
      osc.frequency.linearRampToValueAtTime(42, now + 0.75);
      filter.type = 'lowpass';
      filter.frequency.value = 210;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(vol * 1.15, now + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.82);
      return;
    }

    if (kind === 'boneka_uci') {
      // Denting kotak musik porselen sumbang di lorong gelap
      [880, 1244, 622].forEach((f, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        const t = now + idx * 0.14;
        osc.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(vol * 0.55, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 0.47);
      });
      return;
    }

    if (kind === 'pocong') {
      // Desir kain kafan kering + ketukan tanah berat
      const len = Math.floor(this.ctx.sampleRate * 0.35);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.45));
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1350;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol * 0.75, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(this.sfxGain);
      src.start(now);
      return;
    }

    // Ambu Hideung: bisikan perempuan mistis & dengung gamelan gaib
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480 + Math.random() * 140, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.65);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol * 0.7, now + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.72);
  }

  /**
   * Suara jump-scare sinematik berlapis (Sub-bass slam + Burst Noise Shockwave + Jeritan/Raungan khas tiap hantu).
   */
  public playJumpScare(kind: GhostKind = 'ambu_hideung'): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Layer 1 (Semua hantu): Sub-bass slam + shockwave white-noise burst tajam untuk efek kaget instan
    const slam = this.ctx.createOscillator();
    const slamGain = this.ctx.createGain();
    slam.type = 'sine';
    slam.frequency.setValueAtTime(110, now);
    slam.frequency.exponentialRampToValueAtTime(24, now + 0.48);
    slamGain.gain.setValueAtTime(0.42, now);
    slamGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
    slam.connect(slamGain);
    slamGain.connect(this.sfxGain);
    slam.start(now);
    slam.stop(now + 0.54);

    const nLen = Math.floor(this.ctx.sampleRate * 0.65);
    const nBuf = this.ctx.createBuffer(1, nLen, this.ctx.sampleRate);
    const nCh = nBuf.getChannelData(0);
    for (let i = 0; i < nLen; i++) {
      nCh[i] = (Math.random() * 2 - 1) * Math.exp(-i / (nLen * 0.35));
    }
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = nBuf;
    const stingFilter = this.ctx.createBiquadFilter();
    stingFilter.type = 'bandpass';
    stingFilter.frequency.setValueAtTime(kind === 'genderuwo' ? 520 : 1850, now);
    stingFilter.frequency.exponentialRampToValueAtTime(kind === 'genderuwo' ? 180 : 620, now + 0.58);
    stingFilter.Q.value = 1.9;
    const stingGain = this.ctx.createGain();
    stingGain.gain.setValueAtTime(0.28, now);
    stingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);
    noiseSrc.connect(stingFilter);
    stingFilter.connect(stingGain);
    stingGain.connect(this.sfxGain);
    noiseSrc.start(now);

    if (kind === 'kuntilanak') {
      // Kuntilanak: jeritan / tawa melengking perempuan bernada tinggi bergetar & menggema
      const shrieks = [0, 0.13, 0.27];
      shrieks.forEach((off, idx) => {
        const osc = this.ctx!.createOscillator();
        const lfo = this.ctx!.createOscillator();
        const lfoGain = this.ctx!.createGain();
        const formant = this.ctx!.createBiquadFilter();
        const gain = this.ctx!.createGain();
        osc.type = 'sawtooth';
        const base = 1120 - idx * 95;
        osc.frequency.setValueAtTime(base, now + off);
        osc.frequency.exponentialRampToValueAtTime(base * 0.68, now + off + 0.22);
        lfo.frequency.value = 32;
        lfoGain.gain.value = 68;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        formant.type = 'bandpass';
        formant.frequency.value = 1450;
        formant.Q.value = 2.4;
        gain.gain.setValueAtTime(0.24, now + off);
        gain.gain.exponentialRampToValueAtTime(0.001, now + off + 0.26);
        osc.connect(formant);
        formant.connect(gain);
        gain.connect(this.sfxGain!);
        lfo.start(now + off);
        osc.start(now + off);
        lfo.stop(now + off + 0.27);
        osc.stop(now + off + 0.27);
      });
      return;
    }

    if (kind === 'pocong') {
      // Pocong: putar rekaman jumpscare asli (/assets/audio/jumscare-pocon.mp3) berlapis sub-bass slam
      const scareBuf = this.decodedBuffers.get(POCONG_SCARE_URL);
      if (scareBuf && this.ctx && this.sfxGain) {
        const sSrc = this.ctx.createBufferSource();
        sSrc.buffer = scareBuf;
        const sGain = this.ctx.createGain();
        sGain.gain.setValueAtTime(0.96, now);
        sSrc.connect(sGain);
        sGain.connect(this.sfxGain);
        sSrc.start(now);
        return;
      }
      // Fallback prosedural bila buffer MP3 belum selesai terdekode
      [340, 480, 695].forEach((f) => {
        const o = this.ctx!.createOscillator();
        const g = this.ctx!.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(f, now);
        o.frequency.linearRampToValueAtTime(f * 0.78, now + 0.5);
        g.gain.setValueAtTime(0.13, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.54);
        o.connect(g);
        g.connect(this.sfxGain!);
        o.start(now);
        o.stop(now + 0.56);
      });
      return;
    }

    if (kind === 'genderuwo') {
      // Genderuwo: raungan monster maskulin sangat rendah & geraman kasar
      [52, 74, 112].forEach((f, idx) => {
        const osc = this.ctx!.createOscillator();
        const filter = this.ctx!.createBiquadFilter();
        const gain = this.ctx!.createGain();
        osc.type = idx === 0 ? 'sawtooth' : 'square';
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.linearRampToValueAtTime(f * 0.52, now + 0.74);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(420, now);
        filter.frequency.exponentialRampToValueAtTime(160, now + 0.74);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(now);
        osc.stop(now + 0.8);
      });
      return;
    }

    if (kind === 'boneka_uci') {
      // Boneka Uci: denting kotak musik sumbang + retakan & pekik porselen tinggi
      const notes = [932, 1318, 659, 1480];
      notes.forEach((f, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        const t = now + idx * 0.055;
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.88, t + 0.34);
        gain.gain.setValueAtTime(0.26, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 0.4);
      });
      return;
    }

    // Ambu Hideung (Boss): kor gamelan gaib + lengkingan roh perempuan berlapis
    [73.4, 155.5, 311.1, 587.3, 932.3].forEach((f, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = idx % 2 === 0 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.56, now + 0.76);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.82);
    });
  }

  private preloadAudioAsset(url: string): void {
    if (this.fetchStarted.has(url) || typeof window === 'undefined' || typeof fetch === 'undefined') {
      return;
    }
    this.fetchStarted.add(url);
    void fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => {
        if (!buf) return;
        this.rawBuffers.set(url, buf);
        this.tryDecodeAudioAsset(url);
      })
      .catch(() => {
        // Abaikan bila offline/test tanpa HTTP server
      });
  }

  private tryDecodeAllAssets(): void {
    for (const url of [CAR_AUDIO_URL, BGM_GAMELAN_URL, POCONG_SCARE_URL]) {
      this.preloadAudioAsset(url);
      this.tryDecodeAudioAsset(url);
    }
  }

  private tryDecodeAudioAsset(url: string): void {
    if (this.decodedBuffers.has(url) || this.decodingUrls.has(url) || !this.ctx) return;
    const raw = this.rawBuffers.get(url);
    if (!raw) return;
    this.decodingUrls.add(url);
    void this.ctx
      .decodeAudioData(raw.slice(0))
      .then((decoded) => {
        this.decodedBuffers.set(url, decoded);
        this.decodingUrls.delete(url);
        if (url === CAR_AUDIO_URL && this.carShouldPlay && !this.carSource) {
          this.startDecodedCarSource(this.carPlaybackOffset);
        }
        if (url === BGM_GAMELAN_URL) {
          this.ensureBgmPlaying();
        }
      })
      .catch(() => {
        this.decodingUrls.delete(url);
      });
  }

  private ensureBgmPlaying(): void {
    if (
      !this.ctx ||
      !this.bgmGain ||
      this.bgmSource ||
      this.ctx.state !== 'running' ||
      this.settings.bgmEnabled === false ||
      this.settings.masterEnabled === false
    ) {
      return;
    }
    const bgmBuf = this.decodedBuffers.get(BGM_GAMELAN_URL);
    if (!bgmBuf) return;

    const src = this.ctx.createBufferSource();
    src.buffer = bgmBuf;
    src.loop = true;
    src.connect(this.bgmGain);
    src.start(0);
    this.bgmSource = src;
    this.applyGains();
  }

  private stopBgm(): void {
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
        this.bgmSource.disconnect();
      } catch {
        // Sudah berhenti
      }
      this.bgmSource = null;
    }
  }

  private startDecodedCarSource(offsetSec: number): void {
    const carAudioBuffer = this.decodedBuffers.get(CAR_AUDIO_URL);
    if (!this.ctx || !this.sfxGain || !carAudioBuffer || this.carSource) return;
    if (this.ctx.state !== 'running') return;

    const source = this.ctx.createBufferSource();
    source.buffer = carAudioBuffer;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 720;
    filter.Q.value = 0.7;

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = 0;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;

    source.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(this.sfxGain);

    const dur = Math.max(0.1, carAudioBuffer.duration);
    const wrappedOffset = ((offsetSec % dur) + dur) % dur;
    try {
      source.start(0, wrappedOffset);
    } catch {
      source.start(0);
    }

    this.carSource = source;
    this.carFilter = filter;
    this.carPanner = panner;
    this.carGain = gain;
  }

  /**
   * Memperbarui audio mesin mobil nyata (/assets/audio/car_engine.mp3) secara spasial:
   * - Redam kabin hangat saat berkendara bersama Pa Nanang,
   * - Membuka saat pintu dibuka keluar di Warung Ceu Titin,
   * - Mengecil halus sesuai jarak, redam frekuensi tinggi udara malam, panning stereo,
   *   hingga benar-benar senyap dan berhenti ketika mobil menjauh melewati batas dengar (~82m).
   */
  public updateCarAudio(opts: {
    active: boolean;
    distMeters: number;
    pan: number;
    inCabin: boolean;
    doorOpen: boolean;
    speedNorm: number;
    speaking: boolean;
    timeSec: number;
  }): void {
    this.preloadAudioAsset(CAR_AUDIO_URL);
    this.carShouldPlay = opts.active;
    this.carPlaybackOffset = Math.max(0, opts.timeSec);

    if (!opts.active || this.muted || this.settings.masterEnabled === false || this.settings.sfxEnabled === false) {
      this.stopCarAudio();
      return;
    }

    if (!this.ctx) {
      this.unlock(false);
    }
    if (!this.ctx || this.ctx.state !== 'running') return;

    this.tryDecodeAudioAsset(CAR_AUDIO_URL);
    const carBuf = this.decodedBuffers.get(CAR_AUDIO_URL);
    if (!this.carSource && carBuf) {
      this.startDecodedCarSource(this.carPlaybackOffset);
    }

    if (!this.carSource || !this.carGain || !this.carFilter || !this.carPanner) {
      return;
    }

    const now = this.ctx.currentTime;
    const maxAudibleDist = 82;
    let targetGain = 0;
    let targetCutoff = 700;
    let targetPan = 0;
    let targetRate = 1.0;

    if (opts.inCabin) {
      // Di dalam kabin mobil: hangat teredam; sedikit merunduk ketika dialog aktif agar suara jelas
      targetGain = opts.speaking ? 0.2 : 0.36;
      targetCutoff = opts.speedNorm > 0.6 ? 780 : 620;
      targetPan = 0;
      targetRate = 0.94 + Math.min(0.14, opts.speedNorm * 0.08);
    } else if (opts.distMeters >= maxAudibleDist) {
      // Sudah terlalu jauh -> mengecil nol sempurna lalu hentikan node audio
      this.carGain.gain.setTargetAtTime(0.0001, now, 0.08);
      if (opts.distMeters >= maxAudibleDist + 4) {
        this.stopCarAudio();
      }
      return;
    } else {
      const clampedD = Math.max(0, opts.distMeters - 2.2);
      const normD = Math.min(1, clampedD / (maxAudibleDist - 2.2));
      const invRolloff = 1 / (1 + Math.pow(clampedD / 11.0, 1.8));
      const tailFade = Math.pow(Math.max(0, 1 - normD), 1.45);
      const baseVol = opts.doorOpen ? 0.44 : 0.4;
      targetGain = baseVol * invRolloff * tailFade;
      // Udara malam & kabut meredam frekuensi tinggi semakin jauh mobil melaju
      const nearCutoff = opts.doorOpen ? 2350 : 1850;
      targetCutoff = 210 + (nearCutoff - 210) * Math.pow(1 - normD, 1.55);
      targetPan = Math.max(-0.85, Math.min(0.85, opts.pan));
      // Efek Doppler & tarikan gas halus saat mulai melaju pergi
      targetRate = 1.08 - normD * 0.22;
    }

    if (targetGain < 0.0015) {
      this.stopCarAudio();
      return;
    }

    this.carGain.gain.setTargetAtTime(targetGain, now, 0.09);
    this.carFilter.frequency.setTargetAtTime(targetCutoff, now, 0.11);
    this.carPanner.pan.setTargetAtTime(targetPan, now, 0.08);
    this.carSource.playbackRate.setTargetAtTime(targetRate, now, 0.14);
  }

  public stopCarAudio(): void {
    this.carShouldPlay = false;
    const src = this.carSource;
    const gain = this.carGain;
    const filter = this.carFilter;
    const panner = this.carPanner;
    this.carSource = null;
    this.carGain = null;
    this.carFilter = null;
    this.carPanner = null;
    if (gain && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(0.0001, now, 0.04);
      } catch {
        // Abaikan
      }
    }
    if (src) {
      const stopDelay = this.ctx ? 160 : 0;
      window.setTimeout(() => {
        try {
          src.stop();
          src.disconnect();
          filter?.disconnect();
          panner?.disconnect();
          gain?.disconnect();
        } catch {
          // Sudah berhenti
        }
      }, stopDelay);
    }
  }

  /**
   * Suara mesin mobil pengantar saat tiba di Warung Ceu Titin atau berangkat meninggalkan pemain.
   */
  public playCarEnginePhase(mode: 'arrive' | 'depart'): void {
    this.unlock();
    // Gunakan rekaman MP3 mobil asli bila sudah terdekode (berkelanjutan & terukur jarak di updateCarAudio).
    if (this.decodedBuffers.has(CAR_AUDIO_URL)) {
      this.carShouldPlay = true;
      return;
    }
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    sub.type = 'triangle';
    filter.type = 'lowpass';
    filter.frequency.value = mode === 'arrive' ? 230 : 280;

    if (mode === 'arrive') {
      osc.frequency.setValueAtTime(84, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 2.6);
      osc.frequency.linearRampToValueAtTime(42, now + 3.4);
      sub.frequency.setValueAtTime(42, now);
      sub.frequency.exponentialRampToValueAtTime(26, now + 3.4);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.11, now + 0.6);
      gain.gain.linearRampToValueAtTime(0.06, now + 2.8);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 3.5);
    } else {
      osc.frequency.setValueAtTime(46, now);
      osc.frequency.exponentialRampToValueAtTime(102, now + 1.5);
      osc.frequency.exponentialRampToValueAtTime(68, now + 3.2);
      sub.frequency.setValueAtTime(28, now);
      sub.frequency.exponentialRampToValueAtTime(52, now + 1.5);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.55);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 3.3);
    }

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    sub.start(now);
    const stopAt = now + (mode === 'arrive' ? 3.55 : 3.35);
    osc.stop(stopAt);
    sub.stop(stopAt);
  }

  /**
   * Suara pintu mobil dibuka / ditutup saat pemain turun di depan Warung Ceu Titin.
   */
  public playCarDoor(open: boolean): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = open ? 'triangle' : 'sine';
    if (open) {
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.16);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.24);
    } else {
      osc.frequency.setValueAtTime(125, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  }

  /**
   * Musik & stinger dramatis sesuai masing-masing Ending (True / Normal / Bad).
   */
  public playEndingStinger(ending: EndingType): void {
    this.unlock();
    if (!this.ctx || !this.musicGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (ending === 'true') {
      // Harmoni hangat fajar Nusantara (pentatonik naik yang menenangkan)
      const notes = [261.63, 329.63, 392.0, 523.25, 659.25];
      notes.forEach((f, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        const t = now + idx * 0.22;
        osc.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.11, t + 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
        osc.connect(gain);
        gain.connect(this.musicGain!);
        osc.start(t);
        osc.stop(t + 2.9);
      });
    } else if (ending === 'normal') {
      // Akor minor menggantung (selamat tetapi misteri belum tuntas)
      const notes = [220.0, 261.63, 311.13, 392.0];
      notes.forEach((f, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        const t = now + idx * 0.26;
        osc.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.085, t + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
        osc.connect(gain);
        gain.connect(this.musicGain!);
        osc.start(t);
        osc.stop(t + 2.7);
      });
    } else {
      // Disonansi berat + sub-bass gelap (terperangkap Dimensi Gaib)
      [55.0, 77.78, 110.0, 155.56, 233.08].forEach((f, idx) => {
        const osc = this.ctx!.createOscillator();
        const filter = this.ctx!.createBiquadFilter();
        const gain = this.ctx!.createGain();
        osc.type = idx < 2 ? 'sawtooth' : 'triangle';
        filter.type = 'lowpass';
        filter.frequency.value = 380;
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.exponentialRampToValueAtTime(f * 0.82, now + 3.2);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.11, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 3.4);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain!);
        osc.start(now);
        osc.stop(now + 3.5);
      });
    }
  }

  public dispose(): void {
    this.stopSpeech();
    this.stopCarAudio();
    this.stopBgm();
    for (const osc of [this.droneOsc, this.padOscA, this.padOscB]) {
      if (osc) {
        try {
          osc.stop();
        } catch {
          // ignore
        }
      }
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
