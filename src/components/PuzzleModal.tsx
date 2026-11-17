import React, { useEffect, useRef, useState } from 'react';
import { NPC_DIALOGS } from '../game/data';
import type { NpcVoiceId } from '../game/types';

interface NpcDialogModalProps {
  npcId: string;
  onPlayVoice: (voiceId: NpcVoiceId, lineIndex: number, lineText: string) => void;
  onClose: () => void;
}

export const NpcDialogModal: React.FC<NpcDialogModalProps> = ({
  npcId,
  onPlayVoice,
  onClose,
}) => {
  const dialog = NPC_DIALOGS[npcId];
  const [lineIdx, setLineIdx] = useState(0);
  const onPlayVoiceRef = useRef(onPlayVoice);
  onPlayVoiceRef.current = onPlayVoice;

  useEffect(() => {
    setLineIdx(0);
  }, [npcId]);

  useEffect(() => {
    if (dialog) {
      onPlayVoiceRef.current(dialog.voiceId, lineIdx, dialog.lines[lineIdx] ?? '');
    }
  }, [dialog, lineIdx]);

  if (!dialog) return null;
  const isLast = lineIdx >= dialog.lines.length - 1;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center p-5 sm:p-6 bg-[#050706]/65">
      <div data-testid="npc-dialog-modal" className="w-full max-w-2xl archival-card rounded-sm p-5">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[rgba(207,161,90,0.2)]">
          <div>
            <h3 className="font-display text-base font-bold text-[#cfa15a] tracking-wide">
              {dialog.speaker}
            </h3>
            <p className="text-[10px] text-[#98a29b] uppercase tracking-[0.16em]">{dialog.role}</p>
          </div>
          <span className="text-xs text-[#8d9991] font-mono-num">
            {lineIdx + 1} / {dialog.lines.length}
          </span>
        </div>

        <p className="text-sm text-[#ebe7dc] leading-relaxed my-3">{dialog.lines[lineIdx]}</p>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onPlayVoice(dialog.voiceId, lineIdx, dialog.lines[lineIdx] ?? '')}
            className="px-3 py-2 bg-[#161e1a] hover:bg-[#1f2b25] border border-[rgba(207,161,90,0.3)] text-[#d8dfd9] text-xs font-semibold rounded-sm cursor-pointer flex items-center gap-1.5"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <span>Putar Suara</span>
          </button>

          {!isLast ? (
            <button
              type="button"
              onClick={() => setLineIdx((i) => i + 1)}
              className="px-4 py-2 bg-[#7a4d1e] hover:bg-[#945e25] border border-[#cfa15a]/45 text-[#f7f4ec] text-xs font-bold uppercase tracking-wider rounded-sm cursor-pointer"
            >
              Lanjut
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#9e271e] hover:bg-[#b83025] border border-[#cfa15a]/45 text-[#f7f4ec] text-xs font-bold uppercase tracking-wider rounded-sm cursor-pointer"
            >
              Selesai
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface RadioPuzzleModalProps {
  alreadyRescued: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export const RadioPuzzleModal: React.FC<RadioPuzzleModalProps> = ({
  alreadyRescued,
  onSuccess,
  onClose,
}) => {
  const [freq, setFreq] = useState(alreadyRescued ? 104.6 : 98.4);
  const target = 104.6;
  const diff = Math.abs(freq - target);
  const locked = diff < 0.25;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#050706]/85">
      <div className="w-full max-w-md archival-card rounded-sm p-6 flex flex-col gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#cfa15a] font-semibold">
            Frekuensi Darurat Sukajadi
          </div>
          <h3 className="font-display text-lg font-bold text-[#ebe7dc] uppercase tracking-[0.12em] mt-0.5">
            Menara Radio Rooftop
          </h3>
          <p className="text-xs text-[#9ca7a0] mt-1">
            Cari frekuensi walkie-talkie Rani di sekitar <strong className="text-[#cfa15a]">104.6 MHz</strong> untuk memutus ilusi Ambu Hideung.
          </p>
        </div>

        <div className="bg-[#090c0b] border border-[rgba(207,161,90,0.22)] rounded-sm p-4 text-center">
          <div className="text-3xl font-mono-num font-bold text-[#cfa15a]">
            {freq.toFixed(1)} MHz
          </div>
          <div className="text-xs mt-1.5 text-[#9aa69e]">
            {locked
              ? 'SINYAL JERNIH — "Kak Nadia! Jangan percaya rumor itu, ini cuma rumah biasa!"'
              : diff < 1.5
                ? '...kresek... "Tolong... aku di dekat..." (Sinyal hampir tepat)'
                : 'Statis berat... geser frekuensi mendekati 104.6 MHz.'}
          </div>
        </div>

        <input
          type="range"
          min={96.0}
          max={108.0}
          step={0.2}
          value={freq}
          onChange={(e) => setFreq(parseFloat(e.target.value))}
          aria-label="Frekuensi Radio"
          className="w-full accent-[#cfa15a] cursor-pointer"
        />

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#161c19] hover:bg-[#202924] border border-[rgba(207,161,90,0.25)] text-xs font-bold text-[#c7cfc9] rounded-sm cursor-pointer"
          >
            Tutup
          </button>
          <button
            type="button"
            disabled={!locked}
            onClick={() => {
              onSuccess();
              onClose();
            }}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm border ${
              locked
                ? 'bg-[#2a5c3e] hover:bg-[#34704c] border-[#689f7d] text-white cursor-pointer'
                : 'bg-[#171c19] border-[#26302a] text-[#5c6660] cursor-not-allowed'
            }`}
          >
            Rekam Sinyal Rani
          </button>
        </div>
      </div>
    </div>
  );
};
