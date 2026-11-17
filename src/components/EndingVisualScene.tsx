import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  createContactShadowTexture,
  createGhostModel,
  createHumanoidNPC,
  createKujangShrine,
  syncGhostGlbBones,
  syncHumanoidGlbBones,
  type GhostRig,
} from '../game/proceduralModels';
import type { CharacterId, EndingType } from '../game/types';

interface EndingVisualSceneProps {
  ending: EndingType;
  characterName: string;
  characterId?: CharacterId;
  raniRescued: boolean;
}

function resolveCharacterPreset(characterName: string, characterId?: CharacterId): CharacterId {
  if (characterId) return characterId;
  const low = characterName.toLowerCase();
  if (low.includes('salsa')) return 'salsa';
  if (low.includes('bima')) return 'bima';
  if (low.includes('nadia')) return 'nadia';
  if (low.includes('dito')) return 'dito';
  return 'raka';
}

/**
 * Diorama 3D epilog pasca-Ending (True / Normal / Bad) yang mengikuti aset GLB nyata
 * (Raka, Pocong, Kuntilanak, Genderuwo, Boneka Uci/Buna) dengan gerakan dinamis & atmosfer sinematik.
 */
export const EndingVisualScene: React.FC<EndingVisualSceneProps> = ({
  ending,
  characterName,
  characterId,
  raniRescued,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = Math.max(320, container.clientWidth || 560);
    const height = Math.max(180, container.clientHeight || 210);

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      renderer = null;
    }

    if (!renderer) {
      // Fallback 2D ringan bila lingkungan tanpa WebGL (mis. unit test)
      const c = fallbackCanvasRef.current;
      const ctx = c?.getContext('2d');
      if (c && ctx) {
        c.width = 560;
        c.height = 210;
        ctx.fillStyle = ending === 'true' ? '#3d3324' : ending === 'normal' ? '#0d171d' : '#1b0608';
        ctx.fillRect(0, 0, 560, 210);
      }
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = ending === 'true' ? 1.18 : 1.05;

    const prevCanvas = container.querySelector('canvas[data-ending-gl="1"]');
    prevCanvas?.remove();
    renderer.domElement.setAttribute('data-ending-gl', '1');
    renderer.domElement.className = 'w-full h-full block';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 80);
    const contactTex = createContactShadowTexture();

    const groundMat = new THREE.MeshStandardMaterial({
      color: ending === 'true' ? 0x262825 : ending === 'normal' ? 0x11181c : 0x140809,
      roughness: 0.55,
      metalness: 0.15,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Siluet bangunan Rumah Gurita & gerbang di latar belakang sesuai mood Ending
    const bgWallMat = new THREE.MeshStandardMaterial({
      color: ending === 'true' ? 0x3b403c : ending === 'normal' ? 0x162026 : 0x1c0b0c,
      roughness: 0.85,
    });
    const houseBlock = new THREE.Mesh(new THREE.BoxGeometry(10.5, 5.2, 4.0), bgWallMat);
    houseBlock.position.set(0, 2.6, -7.8);
    scene.add(houseBlock);

    const ironMat = new THREE.MeshStandardMaterial({ color: 0x0b0d0e, roughness: 0.45, metalness: 0.7 });
    const animatedGhosts: GhostRig[] = [];
    const preset = resolveCharacterPreset(characterName, characterId);

    let playerActor: ReturnType<typeof createHumanoidNPC> | null = null;
    let raniActor: ReturnType<typeof createHumanoidNPC> | null = null;
    let kujangObj: THREE.Group | null = null;
    let mainSpot: THREE.SpotLight | null = null;

    if (ending === 'true') {
      scene.background = new THREE.Color(0x2b241d);
      scene.fog = new THREE.FogExp2(0x3a2b1d, 0.045);

      const hemi = new THREE.HemisphereLight(0xffdfb0, 0x2c241b, 0.9);
      const sun = new THREE.DirectionalLight(0xffca7a, 2.4);
      sun.position.set(5, 8, -4);
      sun.castShadow = true;
      scene.add(hemi, sun);

      const shrine = createKujangShrine();
      shrine.group.position.set(1.35, 0.0, -0.4);
      shrine.group.scale.setScalar(0.88);
      scene.add(shrine.group);
      kujangObj = shrine.kujang;

      playerActor = createHumanoidNPC({
        shirtColor: 0x9c2f24,
        bottomColor: 0x1b2330,
        preset,
        contactShadowTex: contactTex,
      });
      playerActor.group.position.set(-0.35, 0, 0.35);
      playerActor.group.rotation.y = 0.28;
      scene.add(playerActor.group);

      if (raniRescued) {
        raniActor = createHumanoidNPC({
          shirtColor: 0x3b667d,
          bottomColor: 0x22262e,
          preset: 'salsa',
          contactShadowTex: contactTex,
        });
        raniActor.group.position.set(-1.35, 0, -0.2);
        raniActor.group.rotation.y = 0.38;
        scene.add(raniActor.group);
      }

      // Gerbang besi terbuka lebar
      for (const gx of [-2.4, 2.4]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.16), ironMat);
        bar.position.set(gx, 1.2, -3.5);
        scene.add(bar);
      }
    } else if (ending === 'normal') {
      scene.background = new THREE.Color(0x060b10);
      scene.fog = new THREE.FogExp2(0x091117, 0.085);

      const hemi = new THREE.HemisphereLight(0x4b6a88, 0x0a0d10, 0.55);
      const moon = new THREE.DirectionalLight(0x8bb6e8, 1.25);
      moon.position.set(-3, 7, -5);
      scene.add(hemi, moon);

      mainSpot = new THREE.SpotLight(0xfff0cc, 8.5, 16, Math.PI * 0.24, 0.55, 1.4);
      mainSpot.position.set(-1.8, 1.4, 3.8);
      mainSpot.target.position.set(0, 1.0, -1.0);
      scene.add(mainSpot, mainSpot.target);

      // Pagar besi tertutup
      for (let x = -2.2; x <= 2.2; x += 0.32) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6), ironMat);
        bar.position.set(x, 1.1, -0.8);
        scene.add(bar);
      }

      // Boneka Buna & Pocong GLB mengintai dari balik kabut pagar
      const buna = createGhostModel('boneka_uci', contactTex);
      buna.group.position.set(-0.68, 0, -1.65);
      buna.group.rotation.y = 0.18;
      scene.add(buna.group);
      animatedGhosts.push(buna);

      const pocong = createGhostModel('pocong', contactTex);
      pocong.group.position.set(0.88, 0, -2.35);
      pocong.group.rotation.y = -0.22;
      scene.add(pocong.group);
      animatedGhosts.push(pocong);
    } else {
      scene.background = new THREE.Color(0x0a0203);
      scene.fog = new THREE.FogExp2(0x160305, 0.1);

      const hemi = new THREE.HemisphereLight(0x6e1a18, 0x0d0304, 0.52);
      const redSun = new THREE.DirectionalLight(0xff382c, 1.4);
      redSun.position.set(2, 6, 4);
      scene.add(hemi, redSun);

      mainSpot = new THREE.SpotLight(0xff4236, 11, 14, Math.PI * 0.34, 0.6, 1.4);
      mainSpot.position.set(0, 2.4, 4.4);
      mainSpot.target.position.set(0, 1.2, -0.5);
      scene.add(mainSpot, mainSpot.target);

      // Formasi hantu GLB mengepung di dalam Dimensi Gaib (Pocong, Kuntilanak, Genderuwo, Boneka Buna)
      const pocong = createGhostModel('pocong', contactTex);
      pocong.group.position.set(-1.35, 0, -0.5);
      pocong.group.rotation.y = 0.35;
      scene.add(pocong.group);
      animatedGhosts.push(pocong);

      const kunti = createGhostModel('kuntilanak', contactTex);
      kunti.group.position.set(0.15, 0, -0.25);
      scene.add(kunti.group);
      animatedGhosts.push(kunti);

      const gend = createGhostModel('genderuwo', contactTex);
      gend.group.position.set(1.5, 0, -0.95);
      gend.group.rotation.y = -0.38;
      scene.add(gend.group);
      animatedGhosts.push(gend);

      const buna = createGhostModel('boneka_uci', contactTex);
      buna.group.position.set(-0.55, 0, 0.65);
      buna.group.rotation.y = 0.25;
      scene.add(buna.group);
      animatedGhosts.push(buna);
    }

    let raf = 0;
    let prev = performance.now();
    const start = prev;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const t = (now - start) / 1000;

      if (ending === 'true') {
        camera.position.set(Math.sin(t * 0.45) * 0.75, 1.38 + Math.sin(t * 0.8) * 0.06, 3.35);
        camera.lookAt(0.15, 1.15, -0.2);
        if (kujangObj) kujangObj.rotation.y = t * 1.4;
        if (playerActor) {
          playerActor.bodyRoot.position.y = Math.sin(t * 2.1) * 0.015;
          playerActor.bodyRoot.rotation.z = Math.sin(t * 1.1) * 0.02;
          playerActor.head.rotation.y = Math.sin(t * 0.9) * 0.14;
          playerActor.leftArm.rotation.x = Math.sin(t * 1.4) * 0.06;
          playerActor.rightArm.rotation.x = -0.35 + Math.cos(t * 1.4) * 0.05;
          playerActor.rightElbow.rotation.x = -0.58;
          syncHumanoidGlbBones(playerActor, {});
        }
        if (raniActor) {
          raniActor.bodyRoot.position.y = Math.sin(t * 2.1 + 1.1) * 0.014;
          raniActor.head.rotation.y = Math.sin(t * 1.0 + 0.6) * 0.12;
          syncHumanoidGlbBones(raniActor, {});
        }
      } else if (ending === 'normal') {
        camera.position.set(-0.2 + Math.sin(t * 0.5) * 0.65, 1.25 + Math.cos(t * 0.7) * 0.05, 2.75);
        camera.lookAt(0.05, 1.12, -1.6);
        if (mainSpot) {
          mainSpot.target.position.x = Math.sin(t * 1.3) * 1.8;
          mainSpot.intensity = 7.5 + (Math.sin(t * 17) > 0.8 ? -4.5 : 0);
        }
        animatedGhosts.forEach((g, idx) => {
          if (idx === 0) {
            g.bodyGroup.rotation.z = Math.sin(t * 2.4) * 0.08;
            g.group.rotation.y = 0.18 + Math.sin(t * 1.1) * 0.16;
            syncGhostGlbBones(g, t, false, false);
          } else {
            const hop = Math.abs(Math.sin(t * 3.1));
            g.bodyGroup.position.y = Math.pow(hop, 1.4) * 0.08;
            g.bodyGroup.rotation.x = Math.sin(t * 3.1) * 0.08;
          }
        });
      } else {
        camera.position.set(Math.sin(t * 0.6) * 0.85, 0.92 + Math.sin(t * 1.3) * 0.05, 3.65);
        camera.lookAt(0, 1.22, -0.35);
        if (mainSpot) {
          mainSpot.intensity = 9 + Math.abs(Math.sin(t * 14)) * 7;
        }
        animatedGhosts.forEach((g, idx) => {
          g.mixer?.update(dt * 1.25);
          if (idx === 0) {
            // Pocong mengangguk & melompat kecil di tempat
            g.bodyGroup.position.y = Math.abs(Math.sin(t * 4.5)) * 0.12;
            g.bodyGroup.rotation.x = Math.sin(t * 4.5) * 0.12;
          } else if (idx === 2) {
            // Genderuwo mengayun bahu berat
            g.bodyGroup.rotation.z = Math.sin(t * 2.6) * 0.07;
            g.bodyGroup.position.y = Math.abs(Math.sin(t * 2.6)) * 0.04;
          } else if (idx === 3) {
            // Boneka Buna menggerakkan tulang lengan & kepala tak wajar
            g.bodyGroup.rotation.z = Math.sin(t * 3.8) * 0.11;
            syncGhostGlbBones(g, t, false, true);
          }
        });
      }

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
  }, [ending, characterName, characterId, raniRescued]);

  const badgeText =
    ending === 'true'
      ? `EPILOG FAJAR · ${characterName.toUpperCase()}${raniRescued ? ' & RANI SELAMAT' : ''}`
      : ending === 'normal'
        ? 'EPILOG TENGAH MALAM · GERBANG 666 TERKUNCI'
        : 'SINYAL HILANG · DIMENSI GAIB SUKAJADI 666';

  return (
    <div
      ref={containerRef}
      data-testid="ending-visual-canvas"
      data-ending={ending}
      className="relative w-full h-44 sm:h-52 rounded-sm overflow-hidden border border-[rgba(207,161,90,0.28)] bg-[#050706]"
    >
      <canvas ref={fallbackCanvasRef} className="hidden" aria-hidden="true" />
      <div
        className="absolute top-2 left-2.5 z-10 px-2 py-0.5 bg-[#050706]/80 border border-white/10 rounded-sm text-[10px] font-mono-num uppercase tracking-wider pointer-events-none"
        style={{
          color: ending === 'true' ? '#e8cb88' : ending === 'normal' ? '#9eb8c7' : '#eb6258',
        }}
      >
        {badgeText}
      </div>
    </div>
  );
};
