import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createContactShadowTexture, createGhostModel, syncGhostGlbBones } from '../game/proceduralModels';
import type { GhostKind, JumpscareEvent } from '../game/types';

interface JumpscareOverlayProps {
  event: JumpscareEvent | null;
}

const SCARE_THEME: Record<
  GhostKind,
  { bg: string; accent: string; lightHex: number; caption: string; subtitle: string }
> = {
  ambu_hideung: {
    bg: 'radial-gradient(circle at 50% 45%, rgba(120,16,12,0.88) 0%, rgba(10,4,5,0.97) 68%)',
    accent: '#ef2e24',
    lightHex: 0xff3024,
    caption: 'AMBU HIDEUNG',
    subtitle: 'ILUSI MITOS PEMUJAAN MENGURUNG PENGLIHATANMU!',
  },
  kuntilanak: {
    bg: 'radial-gradient(circle at 50% 45%, rgba(28,56,74,0.85) 0%, rgba(4,7,10,0.97) 70%)',
    accent: '#a9dcff',
    lightHex: 0xbfe6ff,
    caption: 'KUNTILANAK',
    subtitle: 'TAWA MELENGKING DARI BALIK KEGELAPAN!',
  },
  pocong: {
    bg: 'radial-gradient(circle at 50% 45%, rgba(92,84,54,0.86) 0%, rgba(8,8,6,0.98) 68%)',
    accent: '#e5d499',
    lightHex: 0xffe9b5,
    caption: 'POCONG',
    subtitle: 'KAFAN KUSUT MELOMPAT TEPAT DI DEPAN WAJAHMU!',
  },
  genderuwo: {
    bg: 'radial-gradient(circle at 50% 45%, rgba(110,42,16,0.88) 0%, rgba(10,5,3,0.98) 70%)',
    accent: '#ff8a3d',
    lightHex: 0xff7b29,
    caption: 'GENDERUWO',
    subtitle: 'RAUNGAN BESAR MENGGUNCANG LORONG RUMAH!',
  },
  boneka_uci: {
    bg: 'radial-gradient(circle at 50% 45%, rgba(88,24,48,0.86) 0%, rgba(8,5,8,0.98) 70%)',
    accent: '#f0b6c8',
    lightHex: 0xffb8cf,
    caption: 'BONEKA UCI',
    subtitle: 'IA BERPINDAH SAAT KAU BERPALING!',
  },
};

function getFaceFraming(kind: GhostKind): { eyeY: number; startZ: number; endZ: number; camYOffset: number } {
  switch (kind) {
    case 'pocong':
      return { eyeY: 1.54, startZ: 2.0, endZ: 0.62, camYOffset: -0.06 };
    case 'kuntilanak':
      return { eyeY: 1.48, startZ: 1.9, endZ: 0.62, camYOffset: -0.04 };
    case 'genderuwo':
      return { eyeY: 1.88, startZ: 2.35, endZ: 0.84, camYOffset: -0.14 };
    case 'boneka_uci':
      return { eyeY: 0.84, startZ: 1.45, endZ: 0.46, camYOffset: -0.05 };
    case 'ambu_hideung':
      return { eyeY: 1.56, startZ: 1.95, endZ: 0.66, camYOffset: -0.04 };
  }
}

export const JumpscareOverlay: React.FC<JumpscareOverlayProps> = ({ event }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [webglReady, setWebglReady] = useState(false);

  useEffect(() => {
    if (!event || !hostRef.current) {
      setWebglReady(false);
      return;
    }

    const container = hostRef.current;
    const width = Math.max(320, container.clientWidth || window.innerWidth || 800);
    const height = Math.max(240, container.clientHeight || window.innerHeight || 600);

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      setWebglReady(false);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, width / height, 0.05, 30);

    const contactTex = createContactShadowTexture();
    const rig = createGhostModel(event.kind, contactTex);
    scene.add(rig.group);

    const theme = SCARE_THEME[event.kind];
    const framing = getFaceFraming(event.kind);

    // Pencahayaan horor strobo kontras tinggi untuk menonjolkan detail wajah GLB hantu
    const hemi = new THREE.HemisphereLight(0x2d3847, 0x0c0706, 0.55);
    const strobeKey = new THREE.SpotLight(theme.lightHex, 24, 9, Math.PI * 0.42, 0.45, 1.3);
    strobeKey.position.set(0.32, framing.eyeY + 0.18, framing.startZ + 0.4);
    strobeKey.target.position.set(0, framing.eyeY, 0);
    const underFill = new THREE.PointLight(0xff2c22, 4.5, 4.5, 1.8);
    underFill.position.set(-0.26, framing.eyeY - 0.35, 0.8);
    const rimBack = new THREE.DirectionalLight(0xc2d8ff, 1.4);
    rimBack.position.set(-0.8, framing.eyeY + 0.6, -1.4);
    scene.add(hemi, strobeKey, strobeKey.target, underFill, rimBack);

    setWebglReady(true);

    let raf = 0;
    const startMs = performance.now();
    let prevMs = startMs;

    const tick = (nowMs: number) => {
      const dt = Math.min(0.05, (nowMs - prevMs) / 1000);
      prevMs = nowMs;
      const t = (nowMs - startMs) / 1000;

      rig.mixer?.update(dt * 1.9);

      // Efek menerjang (lunge) cepat di 0.24 detik pertama + getaran intens tidak kaku
      const lunge = 1 - Math.pow(1 - Math.min(1, t / 0.24), 3);
      const camZ = THREE.MathUtils.lerp(framing.startZ, framing.endZ, lunge);
      const shakeX = Math.sin(t * 58) * 0.032 + Math.cos(t * 37) * 0.018;
      const shakeY = Math.cos(t * 51) * 0.028;

      camera.position.set(shakeX, framing.eyeY + framing.camYOffset + shakeY, camZ);
      camera.lookAt(shakeX * 0.2, framing.eyeY, 0);
      camera.rotateZ(Math.sin(t * 28) * 0.15 + Math.cos(t * 17) * 0.05);

      if (event.kind === 'pocong') {
        const snapHop = Math.abs(Math.sin(t * 14)) * 0.08 * (1 - Math.min(1, t * 0.7));
        rig.bodyGroup.position.y = snapHop;
        rig.bodyGroup.rotation.x = 0.18 + Math.sin(t * 31) * 0.08;
        rig.bodyGroup.rotation.z = Math.sin(t * 39) * 0.14;
      } else if (event.kind === 'boneka_uci') {
        // Boneka Uci memelintir kepala & mengayun lengan menerjang kamera
        rig.group.rotation.y = Math.sin(t * 24) * 0.18;
        rig.bodyGroup.rotation.z = Math.sin(t * 19) * 0.12;
        syncGhostGlbBones(rig, t, false, true);
      } else if (event.kind === 'genderuwo') {
        rig.bodyGroup.rotation.x = 0.24 + Math.sin(t * 26) * 0.07;
        rig.bodyGroup.rotation.z = Math.sin(t * 18) * 0.09;
      } else {
        rig.bodyGroup.rotation.z = Math.sin(t * 25) * 0.11;
        rig.bodyGroup.rotation.x = 0.14 + Math.cos(t * 30) * 0.06;
      }

      const strobeWave = Math.sin(t * 54) > -0.15 ? 1.0 : 0.28;
      strobeKey.intensity = (20 + Math.sin(t * 32) * 10) * strobeWave;
      strobeKey.position.set(shakeX * 2, framing.eyeY + 0.15, camZ + 0.22);
      underFill.intensity = 3.5 + Math.abs(Math.sin(t * 42)) * 5.5;

      renderer?.render(scene, camera);
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      contactTex.dispose();
      renderer?.dispose();
      if (renderer?.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [event]);

  if (!event) return null;
  const theme = SCARE_THEME[event.kind];

  return (
    <div
      data-testid="jumpscare-overlay"
      data-ghost-kind={event.kind}
      className="fixed inset-0 z-40 pointer-events-none select-none overflow-hidden flex flex-col items-center justify-center"
      style={{ background: theme.bg }}
    >
      <div
        className="jumpscare-flash fixed inset-0 pointer-events-none"
        style={{ background: theme.accent }}
      />
      <div
        ref={hostRef}
        className="fixed inset-0 pointer-events-none"
        aria-hidden="true"
      />
      {!webglReady && (
        <div className="jumpscare-shake w-48 h-48 rounded-full border-4 border-current opacity-60 animate-ping" style={{ color: theme.accent }} />
      )}
      <div className="absolute bottom-14 left-1/2 -translate-x-1/2 text-center px-4 z-10">
        <div
          className="font-display text-2xl sm:text-4xl font-extrabold tracking-[0.22em] uppercase hud-text-shadow"
          style={{ color: theme.accent }}
        >
          {theme.caption}
        </div>
        <div className="text-[11px] sm:text-xs font-semibold tracking-[0.18em] uppercase text-[#f0eae0] mt-1 hud-text-shadow">
          {theme.subtitle}
        </div>
      </div>
    </div>
  );
};
