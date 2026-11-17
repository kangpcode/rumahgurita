import React, { useState } from 'react';
import { BookOpen, Play, Settings, ShieldAlert, Users } from 'lucide-react';
import { CHARACTERS, STUDIO_INFO } from '../game/data';
import type { CharacterId } from '../game/types';
import type { RoomDifficulty } from '../shared/lobbyProtocol';

interface TitleScreenProps {
  selectedCharacter: CharacterId;
  onSelectCharacter: (id: CharacterId) => void;
  soloDifficulty: RoomDifficulty;
  onChangeSoloDifficulty: (d: RoomDifficulty) => void;
  aiCompanionCount: number;
  onChangeAiCompanions: (count: number) => void;
  onStartSolo: () => void;
  onOpenMultiplayer: () => void;
  onOpenSettings: () => void;
  onOpenJournalArchive: () => void;
  onShowCredits: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  selectedCharacter,
  onSelectCharacter,
  soloDifficulty,
  onChangeSoloDifficulty,
  aiCompanionCount,
  onChangeAiCompanions,
  onStartSolo,
  onOpenMultiplayer,
  onOpenSettings,
  onOpenJournalArchive,
  onShowCredits,
}) => {
  const [soloPanelOpen, setSoloPanelOpen] = useState(false);
  const activeChar = CHARACTERS.find((c) => c.id === selectedCharacter) ?? CHARACTERS[0];

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 md:p-10 pointer-events-none">
      {/* Lapisan gradien sisi kiri agar tipografi terbaca jelas di atas panorama 3D Sukajadi */}
      <div
        className="fixed inset-y-0 left-0 w-full md:w-[62%] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(7,9,8,0.95) 0%, rgba(7,9,8,0.8) 64%, rgba(7,9,8,0.0) 100%)',
        }}
      />

      {/* Konten Judul & 5 Tombol Menu Utama */}
      <div className="relative z-10 max-w-xl flex flex-col gap-3.5 pointer-events-auto my-auto">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3 text-[11px] tracking-[0.24em] uppercase text-[#b5aa92] font-semibold">
            <span>{STUDIO_INFO.studio}</span>
            <span className="text-[#8f2e24]">/</span>
            <span>{STUDIO_INFO.leadDev}</span>
          </div>

          <svg
            viewBox="0 0 580 120"
            className="w-full max-w-[490px] h-auto"
            role="img"
            aria-label="Rumah Gurita: Dimensi Gaib"
          >
            <g transform="translate(8, 10)">
              <circle cx="44" cy="44" r="40" fill="#111513" stroke="#cfa15a" strokeOpacity="0.55" strokeWidth="2" />
              <path
                d="M44 16 C31 16 24 27 24 38 C24 46 28 50 32 54 C26 60 22 68 20 74 M38 56 C36 64 34 72 34 78 M50 56 C52 64 54 72 54 78 M56 54 C62 60 66 68 68 74 C60 50 64 46 64 38 C64 27 57 16 44 16 Z"
                fill="none"
                stroke="#ebe7dc"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <circle cx="37" cy="37" r="3.4" fill="#d92b21" />
              <circle cx="51" cy="37" r="3.4" fill="#d92b21" />
            </g>

            <text
              x="108"
              y="52"
              fill="#ebe7dc"
              fontSize="41"
              fontWeight="800"
              letterSpacing="4"
              fontFamily="Cinzel, Georgia, serif"
            >
              RUMAH GURITA
            </text>
            <line x1="108" y1="66" x2="548" y2="66" stroke="#cfa15a" strokeOpacity="0.45" strokeWidth="1.5" />
            <text
              x="110"
              y="95"
              fill="#c94036"
              fontSize="18"
              fontWeight="700"
              letterSpacing="4.5"
              fontFamily="'Plus Jakarta Sans', sans-serif"
            >
              DIMENSI GAIB · SUKAJADI 666
            </text>
          </svg>
        </div>

        {/* Menu Utama 5 Pilihan: [SOLO] [MULTIPLAYER] [PENGATURAN] [JURNAL/ARSIP] [KREDIT] */}
        {!soloPanelOpen ? (
          <div className="archival-panel rounded-sm p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[rgba(207,161,90,0.18)] pb-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-[#cfa15a] font-semibold">
                Menu Utama · Klub Penasaran Sukajadi
              </span>
              <span className="text-[11px] text-[#98a29b] font-mono-num">
                Karakter: <strong className="text-[#ebe7dc]">{activeChar.name}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                data-testid="menu-solo"
                onClick={() => setSoloPanelOpen(true)}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-[#9e271e] hover:bg-[#b83025] text-[#f7f4ec] font-display font-bold text-xs tracking-[0.16em] uppercase rounded-sm border border-[#cfa15a]/50 shadow-lg cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4 shrink-0" />
                <span>SOLO</span>
              </button>

              <button
                type="button"
                data-testid="menu-multiplayer"
                onClick={onOpenMultiplayer}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-[#172820] hover:bg-[#20382d] text-[#ebe7dc] font-display font-bold text-xs tracking-[0.16em] uppercase rounded-sm border border-[#689f7d]/55 shadow-lg cursor-pointer whitespace-nowrap"
              >
                <Users className="w-4 h-4 shrink-0 text-[#7ec99e]" />
                <span>MULTIPLAYER</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                data-testid="menu-settings"
                onClick={onOpenSettings}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#101412] hover:bg-[#19201c] text-[#d5dcd7] font-semibold text-[11px] tracking-[0.12em] uppercase rounded-sm border border-[rgba(207,161,90,0.28)] cursor-pointer whitespace-nowrap"
              >
                <Settings className="w-3.5 h-3.5 shrink-0 text-[#cfa15a]" />
                <span>PENGATURAN</span>
              </button>

              <button
                type="button"
                data-testid="menu-journal"
                onClick={onOpenJournalArchive}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#101412] hover:bg-[#19201c] text-[#d5dcd7] font-semibold text-[11px] tracking-[0.12em] uppercase rounded-sm border border-[rgba(207,161,90,0.28)] cursor-pointer whitespace-nowrap"
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0 text-[#cfa15a]" />
                <span>JURNAL/ARSIP</span>
              </button>

              <button
                type="button"
                data-testid="menu-credits"
                onClick={onShowCredits}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#101412] hover:bg-[#19201c] text-[#d5dcd7] font-semibold text-[11px] tracking-[0.12em] uppercase rounded-sm border border-[rgba(207,161,90,0.28)] cursor-pointer whitespace-nowrap"
              >
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-[#cfa15a]" />
                <span>KREDIT</span>
              </button>
            </div>
          </div>
        ) : (
          /* Panel Persiapan Mode SOLO (tanpa server) + opsi AI Teman 0-3 */
          <div data-testid="solo-setup-panel" className="archival-panel rounded-sm p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[rgba(207,161,90,0.18)]">
              <div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#cfa15a] font-semibold">
                  Mode Offline (Tanpa Server)
                </span>
                <h2 className="font-display text-sm font-bold text-[#ebe7dc] tracking-wider uppercase">
                  Ekspedisi Solo · Sukajadi
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSoloPanelOpen(false)}
                className="px-2.5 py-1 bg-[#141916] hover:bg-[#1d2420] border border-[rgba(207,161,90,0.25)] text-[11px] text-[#c7cfc9] rounded-sm cursor-pointer whitespace-nowrap"
              >
                Kembali
              </button>
            </div>

            {/* Pilih Karakter */}
            <div>
              <div className="flex items-center justify-between text-[11px] text-[#b5aa92] mb-1.5">
                <span className="uppercase tracking-wider font-semibold">Pilih Penyelidik</span>
                <span className="text-[#cfa15a] font-semibold">{activeChar.skillName}</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {CHARACTERS.map((char) => {
                  const selected = char.id === selectedCharacter;
                  return (
                    <button
                      key={char.id}
                      type="button"
                      onClick={() => onSelectCharacter(char.id)}
                      className={`px-2 py-2 rounded-sm text-center border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#2a1412] border-[#b53429] text-[#ebe7dc]'
                          : 'bg-[#0e1210] border-[#26302a] text-[#94a098] hover:border-[#cfa15a]/50'
                      }`}
                    >
                      <div className="font-display text-xs font-bold">{char.name}</div>
                      <div className="text-[10px] opacity-75 truncate">{char.grade.split(' ')[0]}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[#cdd3cd] mt-1.5 leading-relaxed">
                <strong className="text-[#ebe7dc]">{activeChar.name}</strong> ({activeChar.role}) —{' '}
                {activeChar.skillDesc}
              </p>
            </div>

            {/* Opsi Kesulitan & AI Teman 0-3 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[rgba(207,161,90,0.16)]">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#9ca7a0] font-semibold mb-1.5">
                  Tingkat Kesulitan
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Santai', 'Normal', 'Mimpi Buruk'] as RoomDifficulty[]).map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => onChangeSoloDifficulty(diff)}
                      className={`py-1.5 px-1.5 text-[10px] font-bold uppercase rounded-sm border cursor-pointer whitespace-nowrap ${
                        soloDifficulty === diff
                          ? 'bg-[#2a1412] border-[#cfa15a] text-[#f5e7c9]'
                          : 'bg-[#0f1412] border-[#26302a] text-[#94a098]'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#9ca7a0] font-semibold mb-1.5">
                  AI Teman Pendamping (0–3)
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0, 1, 2, 3].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      data-testid={`solo-ai-${cnt}`}
                      onClick={() => onChangeAiCompanions(cnt)}
                      className={`py-1.5 text-xs font-mono-num font-bold rounded-sm border cursor-pointer ${
                        aiCompanionCount === cnt
                          ? 'bg-[#13291d] border-[#689f7d] text-[#bdf2cf]'
                          : 'bg-[#0f1412] border-[#26302a] text-[#94a098]'
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              data-start="true"
              onClick={onStartSolo}
              className="w-full py-3 bg-[#9e271e] hover:bg-[#b83025] text-[#f7f4ec] font-display font-bold text-sm tracking-[0.16em] uppercase rounded-sm border border-[#cfa15a]/45 shadow-lg cursor-pointer"
            >
              Masuk Kawasan Sukajadi
            </button>
          </div>
        )}

        {/* Disclaimer Etika Wajib */}
        <div className="bg-[#0b0e0d]/90 border border-[rgba(207,161,90,0.2)] rounded-sm px-3.5 py-2.5 max-w-lg">
          <p className="text-[11px] leading-relaxed text-[#a8b0aa]">
            <span className="text-[#cfa15a] font-semibold uppercase tracking-wider mr-1.5">
              Catatan Etika:
            </span>
            {STUDIO_INFO.disclaimer}
          </p>
        </div>
      </div>

      {/* Control-hint line */}
      <div className="relative z-10 text-[10px] sm:text-[11px] tracking-[0.11em] uppercase text-[#98a29b] hud-text-shadow font-mono-num">
        WASD Gerak · Mouse Lihat · E Pintu/Item · F Senter · Q UV · C Jongkok · G Garam · V Kamera · J Jurnal
      </div>
    </div>
  );
};
