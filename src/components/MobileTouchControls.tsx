import React, { useRef, useState } from 'react';

interface MobileTouchControlsProps {
  isCrouching: boolean;
  isSprinting: boolean;
  onMoveVector: (forward: number, right: number) => void;
  onToggleCrouch: () => void;
  onSprintChange: (sprinting: boolean) => void;
  onTogglePerspective: () => void;
}

export const MobileTouchControls: React.FC<MobileTouchControlsProps> = ({
  isCrouching,
  isSprinting,
  onMoveVector,
  onToggleCrouch,
  onSprintChange,
  onTogglePerspective,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [autoSprint, setAutoSprint] = useState(false);
  const [sprintLocked, setSprintLocked] = useState(false);

  const maxRadius = 36;

  const updateStick = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const kx = dist > 1e-4 ? Math.cos(angle) * clamped : 0;
    const ky = dist > 1e-4 ? Math.sin(angle) * clamped : 0;
    setKnobOffset({ x: kx, y: ky });

    const normRight = kx / maxRadius;
    const normForward = -ky / maxRadius;
    onMoveVector(normForward, normRight);

    // Dorong joystick ke cincin luar (>82%) untuk lari otomatis agar jempol kanan leluasa menoleh 360°
    const edgeSprint = dist > maxRadius * 0.82 && normForward > 0.25 && !isCrouching;
    if (edgeSprint !== autoSprint) {
      setAutoSprint(edgeSprint);
      onSprintChange(edgeSprint || sprintLocked);
    }
  };

  const resetStick = () => {
    activePointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    setAutoSprint(false);
    onMoveVector(0, 0);
    onSprintChange(sprintLocked);
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none">
      {/* Petunjuk usap area kanan untuk menoleh bebas 360° */}
      <div className="pointer-events-none absolute bottom-22 right-2.5 sm:bottom-24 sm:right-4 text-[9px] font-mono-num uppercase tracking-wider text-[#ebe7dc]/45">
        Usap kanan: Lihat 360°
      </div>

      {/* Virtual Movement Thumbstick — posisi bottom-24 di atas panel status kompak agar viewport tengah & atas bersih */}
      <div
        ref={padRef}
        role="group"
        aria-label="Joystick Gerak Sentuh"
        data-testid="mobile-joystick"
        style={{ touchAction: 'none' }}
        onTouchStart={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          activePointerId.current = e.pointerId;
          updateStick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (activePointerId.current !== e.pointerId) return;
          e.stopPropagation();
          updateStick(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (activePointerId.current !== e.pointerId) return;
          e.stopPropagation();
          resetStick();
        }}
        onPointerCancel={(e) => {
          if (activePointerId.current !== e.pointerId) return;
          resetStick();
        }}
        className={`pointer-events-auto absolute bottom-24 left-2.5 sm:bottom-28 sm:left-4 w-24 h-24 rounded-full archival-panel flex items-center justify-center border ${
          autoSprint || sprintLocked
            ? 'border-[#b53429]/80 shadow-[0_0_16px_rgba(181,52,41,0.45)]'
            : 'border-[rgba(207,161,90,0.32)]'
        }`}
      >
        <div className="w-16 h-16 rounded-full border border-dashed border-[#ebe7dc]/15 pointer-events-none" />
        <span className="absolute -top-3.5 text-[8px] font-mono-num uppercase tracking-widest text-[#cfa15a]/85 pointer-events-none">
          {autoSprint || sprintLocked ? 'LARI' : 'GERAK'}
        </span>
        <div
          className="absolute w-10 h-10 rounded-full bg-[#9e271e] border border-[#cfa15a]/85 shadow-lg pointer-events-none"
          style={{
            transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
          }}
        />
      </div>

      {/* Tombol Toggle Gerak & Kamera — tepat di atas bar alat kanan bawah tanpa menghalangi area pandangan tengah */}
      <div
        className="pointer-events-auto absolute bottom-12 right-2 sm:bottom-14 sm:right-4 flex items-center gap-1 sm:gap-1.5"
        style={{ touchAction: 'none' }}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-pressed={isCrouching}
          onClick={(e) => {
            e.stopPropagation();
            e.currentTarget.blur();
            onToggleCrouch();
          }}
          className={`px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-sm border text-[10px] sm:text-[11px] font-bold uppercase tracking-wide cursor-pointer ${
            isCrouching
              ? 'bg-[#2a2112]/95 border-[#cfa15a] text-[#ffe8b5]'
              : 'bg-[#0e1411]/88 border-[rgba(207,161,90,0.28)] text-[#cfd6d1]'
          }`}
        >
          Jongkok
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-pressed={isSprinting || sprintLocked}
          onClick={(e) => {
            e.stopPropagation();
            e.currentTarget.blur();
            const next = !sprintLocked;
            setSprintLocked(next);
            onSprintChange(next || autoSprint);
          }}
          className={`px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-sm border text-[10px] sm:text-[11px] font-bold uppercase tracking-wide cursor-pointer ${
            isSprinting || sprintLocked
              ? 'bg-[#2a1412]/95 border-[#b53429] text-[#ffd4cf]'
              : 'bg-[#0e1411]/88 border-[rgba(207,161,90,0.28)] text-[#cfd6d1]'
          }`}
        >
          Lari
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            e.currentTarget.blur();
            onTogglePerspective();
          }}
          className="px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-sm border bg-[#0e1411]/88 border-[rgba(207,161,90,0.28)] text-[#cfd6d1] text-[10px] sm:text-[11px] font-bold uppercase tracking-wide cursor-pointer"
        >
          Kamera
        </button>
      </div>
    </div>
  );
};
