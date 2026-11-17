import React from 'react';
import type { FloorId, RumorEntry } from '../game/types';

interface JournalModalProps {
  rumors: RumorEntry[];
  currentFloor: FloorId;
  raniRescued: boolean;
  archiveMode?: boolean;
  onDebunk: (rumorId: string) => void;
  onClose: () => void;
}

export const JournalModal: React.FC<JournalModalProps> = ({
  rumors,
  currentFloor,
  raniRescued,
  archiveMode = false,
  onDebunk,
  onClose,
}) => {
  const brokenCount = rumors.filter((r) => r.debunked).length;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#050706]/85">
      <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto archival-card rounded-sm p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-[rgba(207,161,90,0.22)]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-[#cfa15a] font-semibold">
              Arsip Lapangan Sukajadi · Catatan Salsa
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold tracking-[0.12em] text-[#ebe7dc] uppercase mt-0.5">
              Jurnal Mitos vs Fakta
            </h2>
            <p className="text-xs text-[#9ca7a0] mt-1">
              Pasangkan bukti nyata untuk mematahkan Segel Rumor dan melemahkan{' '}
              <strong className="text-[#e06a5f]">Ambu Hideung</strong>.{' '}
              <span className="font-mono-num text-[#cfa15a]">
                ({brokenCount}/{rumors.length} Segel Terbuka)
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-[#171c19] hover:bg-[#222a25] border border-[rgba(207,161,90,0.3)] text-xs font-semibold rounded-sm text-[#ebe7dc] cursor-pointer shrink-0"
          >
            Tutup [J / Esc]
          </button>
        </div>

        {/* Denah Skematis 3 Lantai & Komplek */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 bg-[#090c0b] border border-[rgba(207,161,90,0.18)] p-3 rounded-sm text-[11px]">
          <div
            className={`p-2.5 rounded-sm border ${
              currentFloor === 'ground' || currentFloor === 'outside'
                ? 'border-[#cfa15a]/75 bg-[#19150e]'
                : 'border-[#232b26]'
            }`}
          >
            <div className="font-display font-bold text-[#cfa15a] tracking-wider mb-1">
              ACT 1 · HALAMAN &amp; LANTAI DASAR
            </div>
            <p className="text-[#a4aea7] leading-relaxed">
              • Komplek, Masjid Al-Ikhlas, Pos Ronda &amp; Pedagang.<br />
              • Semua pintu bisa dibuka [E]; Dapur butuh Kunci Dapur.<br />
              • Lemari tersedia di Lounge &amp; Ruang Belajar untuk bersembunyi.
            </p>
          </div>

          <div
            className={`p-2.5 rounded-sm border ${
              currentFloor === 'second'
                ? 'border-[#cfa15a]/75 bg-[#19150e]'
                : 'border-[#232b26]'
            }`}
          >
            <div className="font-display font-bold text-[#cfa15a] tracking-wider mb-1">
              ACT 2 · LANTAI 2
            </div>
            <p className="text-[#a4aea7] leading-relaxed">
              • Kamar terkunci memakai Kunci Kamar Lt.2 &amp; Kunci Pintu Atap.<br />
              • Boneka Uci membeku jika ditatap; Genderuwo sensitif suara.<br />
              • Tembok Rapuh Tenggara terbuka setelah 2+ Segel patah.
            </p>
          </div>

          <div
            className={`p-2.5 rounded-sm border ${
              currentFloor === 'roof'
                ? 'border-[#cfa15a]/75 bg-[#19150e]'
                : 'border-[#232b26]'
            }`}
          >
            <div className="font-display font-bold text-[#cfa15a] tracking-wider mb-1">
              ACT 3 · ROOFTOP GURITA
            </div>
            <p className="text-[#a4aea7] leading-relaxed">
              • Patung Gurita Statis &amp; Kolam (Bukti Rani).<br />
              • Menara Radio: {raniRescued ? 'Sinyal Rani Terhubung' : 'Setel 104.6 MHz'}.<br />
              • Tembok Pusaka Timur → Kujang Pamungkas.
            </p>
          </div>
        </div>

        {/* Daftar 6 Segel Rumor vs Fakta (zero static capsule pills) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rumors.map((r) => (
            <div
              key={r.id}
              className={`p-3.5 rounded-sm border flex flex-col justify-between gap-2.5 ${
                r.debunked
                  ? 'bg-[#0f1d15] border-[#689f7d]/60'
                  : 'bg-[#121614] border-[#28312c]'
              }`}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2 pb-1.5 border-b border-[rgba(207,161,90,0.14)]">
                  <h3 className="font-display text-sm font-bold text-[#ebe7dc]">{r.title}</h3>
                  <span
                    className={`text-[10px] font-mono-num uppercase tracking-[0.12em] font-semibold shrink-0 ${
                      r.debunked
                        ? 'text-[#7ec99e]'
                        : r.discoveredFact
                          ? 'text-[#cfa15a]'
                          : 'text-[#d1766e]'
                    }`}
                  >
                    {r.debunked ? 'TERPATAHKAN' : r.discoveredFact ? 'FAKTA SIAP' : 'MASIH MITOS'}
                  </span>
                </div>

                <div className="text-xs text-[#b8c0ba]">
                  <span className="text-[#d1766e] font-semibold">Mitos: </span>
                  {archiveMode || r.discoveredRumor
                    ? r.rumorText
                    : 'Belum diselidiki. Bicara dengan warga atau telusuri rumah.'}
                </div>

                <div className="text-xs text-[#a2b4a8] pt-1.5 border-t border-[#222a25]">
                  <span className="text-[#7ec99e] font-semibold">Bukti Nyata: </span>
                  {r.discoveredFact
                    ? `${r.factTitle} — ${r.factText}`
                    : archiveMode
                      ? 'Temukan dokumen bukti di dalam Rumah Gurita selama permainan.'
                      : 'Belum ditemukan di dalam rumah.'}
                </div>
              </div>

              {!archiveMode && !r.debunked && (
                <button
                  type="button"
                  disabled={!r.discoveredFact}
                  onClick={() => onDebunk(r.id)}
                  className={`w-full py-2 rounded-sm text-xs font-bold uppercase tracking-wider border ${
                    r.discoveredFact
                      ? 'bg-[#2a5c3e] hover:bg-[#34704c] border-[#689f7d] text-[#f5faf6] cursor-pointer'
                      : 'bg-[#161b18] border-[#242c28] text-[#5e6862] cursor-not-allowed'
                  }`}
                >
                  {r.discoveredFact
                    ? 'Patahkan Segel Dengan Fakta'
                    : 'Cari Bukti Fakta Terlebih Dahulu'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
