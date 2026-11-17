import React from 'react';
import { STUDIO_INFO } from '../game/data';
import type { AudioSettings, GraphicsQuality, RunSummary, VisualSettings } from '../game/types';
import { EndingVisualScene } from './EndingVisualScene';

interface SettingsControlsProps {
  quality: GraphicsQuality;
  onChangeQuality: (q: GraphicsQuality) => void;
  audioSettings: AudioSettings;
  onChangeAudioSettings: (next: AudioSettings) => void;
  visualSettings: VisualSettings;
  onChangeVisualSettings: (next: VisualSettings) => void;
  touchControlsEnabled: boolean;
  onToggleTouchControls: () => void;
}

const SettingsControlsSection: React.FC<SettingsControlsProps> = ({
  quality,
  onChangeQuality,
  audioSettings,
  onChangeAudioSettings,
  visualSettings,
  onChangeVisualSettings,
  touchControlsEnabled,
  onToggleTouchControls,
}) => (
  <>
    {/* Audio Settings */}
    <section
      aria-labelledby="audio-settings-heading"
      className="bg-[#090c0b] border border-[rgba(207,161,90,0.18)] rounded-sm p-3.5 flex flex-col gap-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id="audio-settings-heading"
          className="text-[11px] uppercase tracking-[0.16em] text-[#ebe7dc] font-bold"
        >
          Pengaturan Audio &amp; Musik
        </h3>
        <button
          type="button"
          onClick={() =>
            onChangeAudioSettings({
              ...audioSettings,
              masterEnabled: audioSettings.masterEnabled === false,
            })
          }
          className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-sm border cursor-pointer ${
            audioSettings.masterEnabled !== false
              ? 'bg-[#193b29] border-[#689f7d] text-[#c7f2d6]'
              : 'bg-[#2a1412] border-[#b53429] text-[#f4b8b2]'
          }`}
        >
          {audioSettings.masterEnabled !== false ? 'Audio Aktif' : 'Audio Nonaktif'}
        </button>
      </div>

      {/* Master Volume */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-[#b5c0b9] font-mono-num">
          <label htmlFor="slider-master-volume" className="font-medium">
            Master Volume
          </label>
          <span data-testid="master-volume-value">{audioSettings.masterVolume}%</span>
        </div>
        <input
          id="slider-master-volume"
          type="range"
          min={0}
          max={100}
          disabled={audioSettings.masterEnabled === false}
          value={audioSettings.masterVolume}
          onChange={(e) =>
            onChangeAudioSettings({
              ...audioSettings,
              masterVolume: Number(e.target.value),
            })
          }
          className="w-full accent-[#b53429] cursor-pointer disabled:opacity-40"
        />
      </div>

      {/* Backsound Musik Latar Gamelan Sunda */}
      <div className="flex flex-col gap-1 pt-1 border-t border-[#161e19]">
        <div className="flex items-center justify-between text-xs text-[#b5c0b9] font-mono-num gap-2">
          <label htmlFor="slider-bgm-volume" className="font-medium truncate">
            Musik Latar (Backsound Gamelan)
          </label>
          <div className="flex items-center gap-2 shrink-0">
            <span data-testid="bgm-volume-value">{audioSettings.bgmVolume ?? 75}%</span>
            <button
              type="button"
              data-testid="toggle-bgm-enabled"
              onClick={() =>
                onChangeAudioSettings({
                  ...audioSettings,
                  bgmEnabled: audioSettings.bgmEnabled === false,
                })
              }
              className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-sm border cursor-pointer ${
                audioSettings.bgmEnabled !== false
                  ? 'bg-[#2a2216] border-[#cfa15a] text-[#f3dfb6]'
                  : 'bg-[#171c19] border-white/15 text-[#7f8c84]'
              }`}
            >
              {audioSettings.bgmEnabled !== false ? 'On' : 'Off'}
            </button>
          </div>
        </div>
        <input
          id="slider-bgm-volume"
          type="range"
          min={0}
          max={100}
          disabled={audioSettings.bgmEnabled === false}
          value={audioSettings.bgmVolume ?? 75}
          onChange={(e) =>
            onChangeAudioSettings({
              ...audioSettings,
              bgmVolume: Number(e.target.value),
            })
          }
          className="w-full accent-[#e3b25d] cursor-pointer disabled:opacity-40"
        />
      </div>

      {/* Musik Suasana / Ambient & Ending Stinger */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-[#b5c0b9] font-mono-num gap-2">
          <label htmlFor="slider-music-volume" className="font-medium truncate">
            Musik Suasana &amp; Ambient
          </label>
          <div className="flex items-center gap-2 shrink-0">
            <span data-testid="music-volume-value">{audioSettings.musicVolume}%</span>
            <button
              type="button"
              data-testid="toggle-music-enabled"
              onClick={() =>
                onChangeAudioSettings({
                  ...audioSettings,
                  musicEnabled: audioSettings.musicEnabled === false,
                })
              }
              className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-sm border cursor-pointer ${
                audioSettings.musicEnabled !== false
                  ? 'bg-[#2a2216] border-[#cfa15a] text-[#f3dfb6]'
                  : 'bg-[#171c19] border-white/15 text-[#7f8c84]'
              }`}
            >
              {audioSettings.musicEnabled !== false ? 'On' : 'Off'}
            </button>
          </div>
        </div>
        <input
          id="slider-music-volume"
          type="range"
          min={0}
          max={100}
          disabled={audioSettings.musicEnabled === false}
          value={audioSettings.musicVolume}
          onChange={(e) =>
            onChangeAudioSettings({
              ...audioSettings,
              musicVolume: Number(e.target.value),
            })
          }
          className="w-full accent-[#cfa15a] cursor-pointer disabled:opacity-40"
        />
      </div>

      {/* SFX & Jumpscare */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-[#b5c0b9] font-mono-num gap-2">
          <label htmlFor="slider-sfx-volume" className="font-medium truncate">
            Efek Suara (SFX &amp; Jumpscare)
          </label>
          <div className="flex items-center gap-2 shrink-0">
            <span data-testid="sfx-volume-value">{audioSettings.sfxVolume}%</span>
            <button
              type="button"
              data-testid="toggle-sfx-enabled"
              onClick={() =>
                onChangeAudioSettings({
                  ...audioSettings,
                  sfxEnabled: audioSettings.sfxEnabled === false,
                })
              }
              className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-sm border cursor-pointer ${
                audioSettings.sfxEnabled !== false
                  ? 'bg-[#193b29] border-[#689f7d] text-[#c7f2d6]'
                  : 'bg-[#171c19] border-white/15 text-[#7f8c84]'
              }`}
            >
              {audioSettings.sfxEnabled !== false ? 'On' : 'Off'}
            </button>
          </div>
        </div>
        <input
          id="slider-sfx-volume"
          type="range"
          min={0}
          max={100}
          disabled={audioSettings.sfxEnabled === false}
          value={audioSettings.sfxVolume}
          onChange={(e) =>
            onChangeAudioSettings({
              ...audioSettings,
              sfxVolume: Number(e.target.value),
            })
          }
          className="w-full accent-[#689f7d] cursor-pointer disabled:opacity-40"
        />
      </div>

      {/* Suara Dialog / Voice NPC & Karakter */}
      <div className="flex items-center justify-between text-xs text-[#b5c0b9] pt-1 border-t border-[#161e19]">
        <span className="font-medium">Suara Dialog &amp; Voice NPC</span>
        <button
          type="button"
          data-testid="toggle-voice-enabled"
          onClick={() =>
            onChangeAudioSettings({
              ...audioSettings,
              voiceEnabled: audioSettings.voiceEnabled === false,
            })
          }
          className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-sm border cursor-pointer ${
            audioSettings.voiceEnabled !== false
              ? 'bg-[#193b29] border-[#689f7d] text-[#c7f2d6]'
              : 'bg-[#171c19] border-white/15 text-[#7f8c84]'
          }`}
        >
          {audioSettings.voiceEnabled !== false ? 'Aktif' : 'Nonaktif'}
        </button>
      </div>
    </section>

    {/* Kualitas Grafis, Visual & Kontrol */}
    <div className="bg-[#090c0b] border border-[rgba(207,161,90,0.18)] rounded-sm p-3.5 flex flex-col gap-2.5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-[#9ca7a0] mb-1.5 font-semibold">
          Kualitas Grafis WebGL
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['low', 'medium', 'high'] as GraphicsQuality[]).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onChangeQuality(q)}
              className={`py-1.5 text-xs font-bold uppercase rounded-sm border cursor-pointer ${
                quality === q
                  ? 'bg-[#2a1412] border-[#b53429] text-[#ebe7dc]'
                  : 'bg-[#121714] border-[#26302a] text-[#95a39a]'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1 pt-1.5 border-t border-[#1e2621]">
        <div className="flex items-center justify-between text-xs text-[#b5c0b9] font-mono-num">
          <label htmlFor="slider-brightness" className="font-medium">
            Kecerahan Malam
          </label>
          <span>{Math.round(visualSettings.brightness * 100)}%</span>
        </div>
        <input
          id="slider-brightness"
          type="range"
          min={75}
          max={145}
          value={Math.round(visualSettings.brightness * 100)}
          onChange={(e) =>
            onChangeVisualSettings({
              ...visualSettings,
              brightness: Number(e.target.value) / 100,
            })
          }
          className="w-full accent-[#cfa15a] cursor-pointer"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-[#b5c0b9] font-mono-num">
          <label htmlFor="slider-fov" className="font-medium">
            Sudut Pandang (FOV)
          </label>
          <span>{visualSettings.fov}°</span>
        </div>
        <input
          id="slider-fov"
          type="range"
          min={65}
          max={90}
          value={visualSettings.fov}
          onChange={(e) =>
            onChangeVisualSettings({
              ...visualSettings,
              fov: Number(e.target.value),
            })
          }
          className="w-full accent-[#689f7d] cursor-pointer"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-[#b5c0b9] font-mono-num">
          <label htmlFor="slider-sensitivity" className="font-medium">
            Sensitivitas Kamera
          </label>
          <span>{visualSettings.sensitivity.toFixed(1)}x</span>
        </div>
        <input
          id="slider-sensitivity"
          type="range"
          min={40}
          max={200}
          step={10}
          value={Math.round(visualSettings.sensitivity * 100)}
          onChange={(e) =>
            onChangeVisualSettings({
              ...visualSettings,
              sensitivity: Number(e.target.value) / 100,
            })
          }
          className="w-full accent-[#cfa15a] cursor-pointer"
        />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[#1e2621]">
        <span className="text-xs text-[#b5c0b9] font-medium">Efek Sinematik (Bloom &amp; Film)</span>
        <button
          type="button"
          role="switch"
          aria-checked={visualSettings.cinematicEffects}
          onClick={() =>
            onChangeVisualSettings({
              ...visualSettings,
              cinematicEffects: !visualSettings.cinematicEffects,
            })
          }
          className={`px-3 py-1 text-[11px] font-bold uppercase rounded-sm border cursor-pointer ${
            visualSettings.cinematicEffects
              ? 'bg-[#102418] border-[#689f7d] text-[#9de3b8]'
              : 'bg-[#121714] border-[#26302a] text-[#95a39a]'
          }`}
        >
          {visualSettings.cinematicEffects ? 'Aktif' : 'Nonaktif'}
        </button>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[#1e2621]">
        <span className="text-xs text-[#b5c0b9] font-medium">Kontrol Sentuh Layar (Mobile)</span>
        <button
          type="button"
          role="switch"
          aria-checked={touchControlsEnabled}
          onClick={onToggleTouchControls}
          className={`px-3 py-1 text-[11px] font-bold uppercase rounded-sm border cursor-pointer ${
            touchControlsEnabled
              ? 'bg-[#102418] border-[#689f7d] text-[#9de3b8]'
              : 'bg-[#121714] border-[#26302a] text-[#95a39a]'
          }`}
        >
          {touchControlsEnabled ? 'Aktif' : 'Nonaktif'}
        </button>
      </div>
    </div>
  </>
);

interface SettingsModalProps extends SettingsControlsProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, ...props }) => (
  <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#050706]/85 overflow-y-auto">
    <div className="w-full max-w-md archival-card rounded-sm p-5 sm:p-6 flex flex-col gap-3.5 my-auto">
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#cfa15a] font-semibold">
          {STUDIO_INFO.studio} · Preferensi Sistem
        </div>
        <h2 className="font-display text-xl font-bold tracking-[0.16em] uppercase text-[#ebe7dc] mt-1">
          Pengaturan
        </h2>
      </div>
      <div className="archival-divider" />
      <SettingsControlsSection {...props} />
      <button
        type="button"
        onClick={onClose}
        className="w-full py-2.5 bg-[#9e271e] hover:bg-[#b83025] border border-[#cfa15a]/40 text-[#f7f4ec] font-display text-xs font-bold uppercase tracking-[0.16em] rounded-sm cursor-pointer"
      >
        Simpan &amp; Tutup
      </button>
    </div>
  </div>
);

interface PauseModalProps extends SettingsControlsProps {
  isMultiplayer?: boolean;
  onResume: () => void;
  onRestart: () => void;
  onReturnToLobby?: () => void;
  onExitTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  isMultiplayer = false,
  onResume,
  onRestart,
  onReturnToLobby,
  onExitTitle,
  ...settingsProps
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#050706]/85 overflow-y-auto">
      <div className="w-full max-w-md archival-card rounded-sm p-5 sm:p-6 flex flex-col gap-3.5 my-auto">
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.22em] text-[#cfa15a] font-semibold">
            {STUDIO_INFO.studio} · {STUDIO_INFO.leadDev}
          </div>
          <h2 className="font-display text-xl font-bold tracking-[0.16em] uppercase text-[#ebe7dc] mt-1">
            {isMultiplayer ? 'Menu Jeda (Live)' : 'Permainan Dijeda'}
          </h2>
          {isMultiplayer && (
            <p className="text-[11px] text-[#7ec99e] mt-1">
              Mode Multiplayer: Dunia terus berjalan real-time selama menu ini dibuka.
            </p>
          )}
        </div>

        <div className="archival-divider" />

        <SettingsControlsSection {...settingsProps} />

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 bg-[#9e271e] hover:bg-[#b83025] border border-[#cfa15a]/40 text-[#f7f4ec] font-display text-xs font-bold uppercase tracking-[0.16em] rounded-sm cursor-pointer"
          >
            Lanjutkan
          </button>
          {!isMultiplayer ? (
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-2.5 bg-[#161c19] hover:bg-[#202924] border border-[rgba(207,161,90,0.28)] text-[#ebe7dc] text-xs font-bold uppercase tracking-wider rounded-sm cursor-pointer"
            >
              Ulangi Dari Awal
            </button>
          ) : (
            onReturnToLobby && (
              <button
                type="button"
                onClick={onReturnToLobby}
                className="w-full py-2.5 bg-[#16241d] hover:bg-[#1e3128] border border-[#689f7d]/50 text-[#ccebd8] text-xs font-bold uppercase tracking-wider rounded-sm cursor-pointer"
              >
                Kembali ke Lobby Room
              </button>
            )
          )}
          <button
            type="button"
            onClick={onExitTitle}
            className="w-full py-2.5 bg-transparent hover:bg-[#161c19] border border-[#2a342e] text-[#9ca7a0] text-xs font-bold uppercase tracking-wider rounded-sm cursor-pointer"
          >
            Kembali ke Menu Utama
          </button>
        </div>

        <p className="text-[11px] text-[#8d9690] leading-relaxed border-t border-[rgba(207,161,90,0.16)] pt-2.5">
          {STUDIO_INFO.disclaimer}
        </p>
      </div>
    </div>
  );
};

interface GameOverModalProps {
  summary: RunSummary;
  isMultiplayer?: boolean;
  isHost?: boolean;
  onPlayAgain: () => void;
  onReturnToLobby?: () => void;
  onExitTitle: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  summary,
  isMultiplayer = false,
  isHost = false,
  onPlayAgain,
  onReturnToLobby,
  onExitTitle,
}) => {
  const accentBorder =
    summary.ending === 'true'
      ? 'border-[#689f7d]'
      : summary.ending === 'normal'
        ? 'border-[#cfa15a]'
        : 'border-[#b53429]';

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#050706]/90 overflow-y-auto">
      <div className={`w-full max-w-xl archival-card border-2 ${accentBorder} rounded-sm p-5 sm:p-6 flex flex-col gap-3.5 my-auto`}>
        <EndingVisualScene
          ending={summary.ending}
          characterName={summary.characterName}
          raniRescued={summary.raniRescued}
        />

        <div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#cfa15a] font-semibold">
            {STUDIO_INFO.studio} · Akhir Cerita
          </span>
          <h2 className="font-display text-xl font-bold text-[#ebe7dc] mt-1">{summary.endingTitle}</h2>
          <p className="text-xs text-[#cfa15a] mt-1 font-semibold">{summary.endingSubtitle}</p>
        </div>

        <p className="text-sm text-[#cdd4cf] leading-relaxed bg-[#090c0b] border border-[rgba(207,161,90,0.18)] rounded-sm p-3.5">
          {summary.endingMessage}
        </p>

        <div className="grid grid-cols-3 gap-2.5 text-center font-mono-num">
          <div className="bg-[#0b0e0d] border border-[#26302a] rounded-sm p-2.5">
            <div className="text-lg font-bold text-[#cfa15a]">
              {summary.segelBroken}/{summary.totalSegel}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[#8e9a92]">Segel Fakta</div>
          </div>
          <div className="bg-[#0b0e0d] border border-[#26302a] rounded-sm p-2.5">
            <div className="text-lg font-bold text-[#7ec99e]">{summary.elapsedSeconds}d</div>
            <div className="text-[10px] uppercase tracking-wider text-[#8e9a92]">Durasi</div>
          </div>
          <div className="bg-[#0b0e0d] border border-[#26302a] rounded-sm p-2.5">
            <div className="text-lg font-bold text-[#d97b73]">{summary.ghostHits}</div>
            <div className="text-[10px] uppercase tracking-wider text-[#8e9a92]">Serangan</div>
          </div>
        </div>

        <div className="flex gap-2.5 mt-1">
          {isMultiplayer ? (
            isHost && onReturnToLobby ? (
              <button
                type="button"
                onClick={onReturnToLobby}
                className="flex-1 py-3 bg-[#1d5438] hover:bg-[#256946] border border-[#689f7d] text-[#f5faf6] font-display text-xs font-bold uppercase tracking-[0.14em] rounded-sm cursor-pointer"
              >
                Kembali ke Lobby Room
              </button>
            ) : (
              <div className="flex-1 py-3 px-3 bg-[#101613] border border-[#2c3a32] text-[#98a89f] text-xs text-center rounded-sm">
                Menunggu Host kembali ke Lobby...
              </div>
            )
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onPlayAgain}
              className="flex-1 py-3 bg-[#9e271e] hover:bg-[#b83025] border border-[#cfa15a]/40 text-[#f7f4ec] font-display text-xs font-bold uppercase tracking-[0.14em] rounded-sm cursor-pointer"
            >
              Main Lagi
            </button>
          )}
          <button
            type="button"
            onClick={onExitTitle}
            className="px-5 py-3 bg-[#161c19] hover:bg-[#202924] border border-[rgba(207,161,90,0.28)] text-[#ebe7dc] text-xs font-bold uppercase tracking-wider rounded-sm cursor-pointer"
          >
            Menu Utama
          </button>
        </div>
      </div>
    </div>
  );
};

interface CreditsModalProps {
  onClose: () => void;
}

export const CreditsModal: React.FC<CreditsModalProps> = ({ onClose }) => (
  <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#050706]/85">
    <div className="w-full max-w-md archival-card rounded-sm p-6 flex flex-col gap-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#cfa15a] font-semibold">
        Catatan Produksi
      </div>
      <h2 className="font-display text-lg font-bold tracking-[0.14em] uppercase text-[#ebe7dc]">
        Kredit &amp; Etika Karya
      </h2>
      <div className="archival-divider" />
      <div className="text-xs text-[#c7cfc9] leading-relaxed space-y-2">
        <p>
          <strong className="text-[#ebe7dc]">Judul:</strong> {STUDIO_INFO.title}
        </p>
        <p>
          <strong className="text-[#ebe7dc]">Developer:</strong> {STUDIO_INFO.studio}
        </p>
        <p>
          <strong className="text-[#ebe7dc]">Lead Developer:</strong> {STUDIO_INFO.leadDev}
        </p>
        <p className="pt-2 border-t border-[rgba(207,161,90,0.16)] text-[#d9b8b4]">
          {STUDIO_INFO.disclaimer}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-2 py-2.5 bg-[#9e271e] hover:bg-[#b83025] border border-[#cfa15a]/40 text-[#f7f4ec] font-display text-xs font-bold uppercase tracking-[0.14em] rounded-sm cursor-pointer"
      >
        Tutup
      </button>
    </div>
  </div>
);
