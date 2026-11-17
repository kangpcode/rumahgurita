import React, { useEffect, useState } from 'react';
import { CHARACTERS, STUDIO_INFO } from '../game/data';
import type { CharacterId, LoadingKind } from '../game/types';

interface LoadingScreenProps {
  kind: LoadingKind;
  characterId: CharacterId;
  onComplete: () => void;
}

const LOADING_CONFIGS: Record<
  LoadingKind,
  {
    badge: string;
    title: string;
    subtitle: string;
    bgClass: string;
    accentColor: string;
    barClass: string;
    durationMs: number;
    tips: string[];
  }
> = {
  boot: {
    badge: 'WORTH-IT STUDIOS · SUKAJADI 1984',
    title: 'MEMUAT DUNIA SUKAJADI',
    subtitle: 'Menyiapkan arsitektur Rumah Gurita, pencahayaan jalan malam, dan mesin audio...',
    bgClass: 'bg-[radial-gradient(circle_at_25%_20%,#1b2620_0%,#090d0c_58%,#040605_100%)]',
    accentColor: '#cfa15a',
    barClass: 'bg-gradient-to-r from-[#8f2e24] via-[#cfa15a] to-[#e8cb92]',
    durationMs: 1350,
    tips: [
      'Catatan: Bangunan asli di Bandung adalah hunian pribadi era 1980-an milik pencinta seni kelautan.',
      'Patung gurita di atap rumah hanyalah karya seni statis—ketakutan kolektiflah yang melahirkan Dimensi Gaib.',
    ],
  },
  enter_world: {
    badge: 'EKSPEDISI KLUB PENASARAN · MALAM JUMAT',
    title: 'MEMASUKI KAWASAN WARUNG CEU TITIN',
    subtitle: 'Menyinkronkan peta Jalan Sukajadi, baterai senter & UV, serta frekuensi radio...',
    bgClass: 'bg-[radial-gradient(circle_at_75%_25%,#2b1414_0%,#0c0f12_56%,#050706_100%)]',
    accentColor: '#e05347',
    barClass: 'bg-gradient-to-r from-[#7b1e18] via-[#d9483b] to-[#f0a175]',
    durationMs: 960,
    tips: [
      'Mulai di Warung Ceu Titin: bicaralah dengan Ceu Titin & anak muda sebelum menyusuri Jalan Sukajadi.',
      'Senter [F] dan Kamera UV [Q] memakai baterai terpisah. Taburkan Garam [G] saat dikejar di dalam rumah.',
    ],
  },
  return_menu: {
    badge: 'ARSIP PENYELIDIK · MENUTUP BERKAS',
    title: 'KEMBALI KE MENU UTAMA',
    subtitle: 'Menyimpan catatan investigasi dan meredam gema Dimensi Gaib Sukajadi...',
    bgClass: 'bg-[radial-gradient(circle_at_50%_30%,#141d29_0%,#090c10_58%,#050608_100%)]',
    accentColor: '#7eb2c9',
    barClass: 'bg-gradient-to-r from-[#2c4e66] via-[#5fa8c9] to-[#a7d8ed]',
    durationMs: 820,
    tips: [
      'Fakta mematahkan mitos: semakin banyak Segel Rumor diungkap, semakin lemah Ambu Hideung.',
      'Setiap karakter Klub Penasaran punya keahlian berbeda untuk menaklukkan Rumah Gurita.',
    ],
  },
};

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  kind,
  characterId,
  onComplete,
}) => {
  const cfg = LOADING_CONFIGS[kind];
  const activeChar = CHARACTERS.find((c) => c.id === characterId) ?? CHARACTERS[0];
  const [progress, setProgress] = useState(8);
  const [tipIndex] = useState(() => Math.floor(Math.random() * cfg.tips.length));

  useEffect(() => {
    setProgress(10);
    const start = performance.now();
    let raf = 0;
    let finished = false;

    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(100, Math.round(10 + (elapsed / cfg.durationMs) * 90));
      setProgress(pct);
      if (elapsed >= cfg.durationMs) {
        if (!finished) {
          finished = true;
          onComplete();
        }
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [kind, cfg.durationMs, onComplete]);

  return (
    <div
      data-testid="loading-screen"
      data-loading-kind={kind}
      className={`fixed inset-0 z-50 flex flex-col justify-between p-6 md:p-12 text-[#ebe7dc] ${cfg.bgClass}`}
    >
      {/* Header Studio */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="text-[11px] uppercase tracking-[0.24em] font-semibold" style={{ color: cfg.accentColor }}>
          {cfg.badge}
        </div>
        <div className="text-[11px] text-[#8d9690] font-mono-num uppercase tracking-widest">
          {STUDIO_INFO.studio} · {STUDIO_INFO.leadDev}
        </div>
      </div>

      {/* Center Emblem & Distinct Theme Visual per Loading Kind */}
      <div className="max-w-2xl mx-auto w-full flex flex-col items-center text-center gap-5 my-auto">
        {kind === 'boot' && (
          <svg viewBox="0 0 120 120" className="w-24 h-24 animate-pulse" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="#0d1310" stroke="#cfa15a" strokeWidth="2.5" strokeOpacity="0.65" />
            <path
              d="M60 22 C42 22 33 36 33 50 C33 60 39 66 44 71 C36 79 30 90 28 97 M52 73 C49 84 47 93 47 101 M68 73 C71 84 73 93 73 101 M76 71 C84 79 90 90 92 97 C81 66 87 60 87 50 C87 36 78 22 60 22 Z"
              fill="none"
              stroke="#ebe7dc"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <circle cx="51" cy="49" r="4.2" fill="#d92b21" />
            <circle cx="69" cy="49" r="4.2" fill="#d92b21" />
          </svg>
        )}

        {kind === 'enter_world' && (
          <div className="flex flex-col items-center gap-3">
            <svg viewBox="0 0 120 120" className="w-24 h-24" aria-hidden="true">
              <rect x="14" y="14" width="92" height="92" rx="8" fill="#181010" stroke="#d9483b" strokeWidth="2.5" />
              <path d="M24 88 L60 28 L96 88 Z" fill="none" stroke="#f0a175" strokeWidth="3" />
              <circle cx="60" cy="64" r="10" fill="#d9483b" fillOpacity="0.85" />
              <circle cx="60" cy="64" r="20" fill="none" stroke="#f0a175" strokeDasharray="5 4" strokeWidth="2" />
            </svg>
            <div className="px-4 py-1.5 bg-[#1b1010]/90 border border-[#d9483b]/45 rounded-sm text-xs text-[#f2dad5]">
              Penyelidik Aktif: <strong className="text-white">{activeChar.name}</strong> ({activeChar.skillName})
            </div>
          </div>
        )}

        {kind === 'return_menu' && (
          <svg viewBox="0 0 120 120" className="w-24 h-24" aria-hidden="true">
            <polygon points="60,12 106,38 106,82 60,108 14,82 14,38" fill="#0d1721" stroke="#5fa8c9" strokeWidth="2.5" />
            <path d="M40 62 L56 76 L82 44" fill="none" stroke="#a7d8ed" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}

        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-[0.16em] uppercase text-[#ebe7dc]">
            {cfg.title}
          </h1>
          <p className="text-xs sm:text-sm text-[#aeb7b1] mt-2 max-w-xl mx-auto leading-relaxed">
            {cfg.subtitle}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-full max-w-md flex flex-col gap-2">
          <div className="w-full h-2.5 bg-[#121715] border border-white/15 rounded-sm overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${cfg.barClass}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono-num text-[#9ca7a0]">
            <span>SINKRONISASI ASET WEBGL</span>
            <span data-testid="loading-progress">{progress}%</span>
          </div>
        </div>
      </div>

      {/* Footer Tip */}
      <div className="max-w-2xl mx-auto w-full bg-black/45 border border-white/10 rounded-sm px-4 py-3 text-center">
        <p className="text-xs text-[#c7cfc9] leading-relaxed">
          <span className="font-bold uppercase tracking-wider mr-2" style={{ color: cfg.accentColor }}>
            Info Lapangan:
          </span>
          {cfg.tips[tipIndex]}
        </p>
      </div>
    </div>
  );
};
