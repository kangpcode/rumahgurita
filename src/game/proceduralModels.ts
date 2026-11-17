import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { DoorData, GhostKind, TreeKind } from './types';
import type { NeighborhoodHouseSpec } from './levelData';

export interface GlbBoneSet {
  hips: THREE.Bone;
  spine: THREE.Bone;
  head: THREE.Bone;
  lArm: THREE.Bone;
  lFore: THREE.Bone;
  rArm: THREE.Bone;
  rFore: THREE.Bone;
  lThigh: THREE.Bone;
  lShin: THREE.Bone;
  rThigh: THREE.Bone;
  rShin: THREE.Bone;
  baseHipY: number;
}

interface GlbAssetBundle {
  root: THREE.Group;
  animations: THREE.AnimationClip[];
}

interface GlbNormalizeOptions {
  targetHeight: number;
  groundOffset?: number;
  envMapIntensity?: number;
  rotationY?: number;
  stripHipsRootMotion?: boolean;
  humanoidSkinPreset?: 'raka' | 'buna' | 'genderuwo';
}

function smoothstepSkin(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

/**
 * Mengonversi model GLB statis (raka.glb, buna.glb, genderuwo.glb)
 * menjadi SkinnedMesh 11-tulang anatomis yang mulus tanpa robekan/pemotongan:
 * - Menghitung skinning weights continuous dengan falloff smoothstep pada 11 sendi tubuh
 * - Mempertahankan kesinambungan jaring geometri asli 100% (zero vertex tearing / zero gaps)
 * - Menyesuaikan postur istirahat tangan (T-pose -> santai di samping paha)
 */
function buildAutoSkinnedHumanoid(
  model: THREE.Group,
  preset: 'raka' | 'buna' | 'genderuwo',
  targetHeight: number,
  groundOffset = 0.02,
  rotationY = 0
): THREE.Group {
  let srcMesh: THREE.Mesh | null = null;
  model.traverse((obj) => {
    if (!srcMesh && (obj as THREE.Mesh).isMesh) {
      srcMesh = obj as THREE.Mesh;
    }
  });
  if (!srcMesh) return model;

  const meshRef = srcMesh as THREE.Mesh;
  const geom = meshRef.geometry.clone();
  if (rotationY) {
    geom.applyMatrix4(new THREE.Matrix4().makeRotationY(rotationY));
  }
  geom.computeBoundingBox();
  const box = geom.boundingBox!;
  const sizeY = Math.max(0.001, box.max.y - box.min.y);
  const scale = targetHeight / sizeY;

  const center = box.getCenter(new THREE.Vector3());
  geom.translate(-center.x, -box.min.y, -center.z);
  geom.scale(scale, scale, scale);
  geom.computeBoundingBox();

  const H = targetHeight;
  const cfg =
    preset === 'raka'
      ? {
          isTPose: true,
          hipY: H * 0.488,       // ~0.85m
          spineRelY: H * 0.144,  // +0.25m -> 1.10m
          neckRelY: H * 0.195,   // +0.34m -> 1.44m
          shX: 0.20,
          shRelY: H * 0.121,     // +0.21m -> 1.31m
          elbowRelX: 0.26,
          elbowRelY: 0,
          legX: 0.10,
          kneeRelY: -H * 0.247,  // -0.43m -> 0.42m
          armYMin0: H * 0.47,    // 0.82m (seluruh area lengan di atas pinggang)
          armYMin1: H * 0.52,    // 0.90m
          armYMax0: H * 0.88,    // 1.53m
          armYMax1: H * 0.94,    // 1.64m
          armX0: 0.18,           // Batas jahitan bahu bebas robek: absX <= 0.18 adalah torso/ransel
          armX1: 0.23,           // absX >= 0.23 adalah 100% lengan utuh
          foreX0: 0.42,
          foreX1: 0.50,
          headY0: H * 0.810,     // 1.41m
          headY1: H * 0.845,     // 1.47m
          headX0: 0.14,
          headX1: 0.20,
          legY0: H * 0.391,      // 0.68m
          legY1: H * 0.460,      // 0.80m
          shinY0: H * 0.207,     // 0.36m
          shinY1: H * 0.264,     // 0.46m
          lArmRestZ: 1.38,
          rArmRestZ: -1.38,
        }
      : preset === 'buna'
        ? {
            isTPose: true,
            hipY: H * 0.446,       // ~0.50m
            spineRelY: H * 0.143,  // +0.16m -> 0.66m
            neckRelY: H * 0.179,   // +0.20m -> 0.86m
            shX: 0.14,
            shRelY: H * 0.125,     // +0.14m -> 0.80m
            elbowRelX: 0.16,
            elbowRelY: 0,
            legX: 0.07,
            kneeRelY: -H * 0.232,  // -0.26m -> 0.24m
            armYMin0: H * 0.40,    // 0.45m
            armYMin1: H * 0.46,    // 0.52m
            armYMax0: H * 0.92,    // 1.03m
            armYMax1: H * 0.98,    // 1.10m
            armX0: 0.12,
            armX1: 0.17,
            foreX0: 0.26,
            foreX1: 0.32,
            headY0: H * 0.741,     // 0.83m
            headY1: H * 0.786,     // 0.88m
            headX0: 0.18,
            headX1: 0.23,
            legY0: H * 0.232,      // 0.26m
            legY1: H * 0.286,      // 0.32m
            shinY0: H * 0.125,     // 0.14m
            shinY1: H * 0.179,     // 0.20m
            lArmRestZ: 1.35,
            rArmRestZ: -1.35,
          }
        : {
            isTPose: false,
            hipY: H * 0.461,       // ~1.05m
            spineRelY: H * 0.154,  // +0.35m -> 1.40m
            neckRelY: H * 0.197,   // +0.45m -> 1.85m
            shX: 0.42,
            shRelY: H * 0.154,     // +0.35m -> 1.75m
            elbowRelX: 0.08,
            elbowRelY: -H * 0.197, // -0.45m -> 1.30m
            legX: 0.20,
            kneeRelY: -H * 0.228,  // -0.52m -> 0.53m
            armYMin0: H * 0.272,   // 0.62m
            armYMin1: H * 0.316,   // 0.72m
            armYMax0: H * 0.754,   // 1.72m
            armYMax1: H * 0.807,   // 1.84m
            armX0: 0.36,
            armX1: 0.44,
            foreX0: 0.50,
            foreX1: 0.58,
            headY0: H * 0.789,     // 1.80m
            headY1: H * 0.833,     // 1.90m
            headX0: 0.28,
            headX1: 0.36,
            legY0: H * 0.368,      // 0.84m
            legY1: H * 0.430,      // 0.98m
            shinY0: H * 0.197,     // 0.45m
            shinY1: H * 0.254,     // 0.58m
            lArmRestZ: 0,
            rArmRestZ: 0,
          };

  const root = new THREE.Group();
  root.position.y = groundOffset;

  const hips = new THREE.Bone();
  hips.name = 'hips';
  hips.position.set(0, cfg.hipY, 0);
  hips.userData.baseHipY = cfg.hipY;
  hips.userData.isTPose = cfg.isTPose;
  hips.userData.lArmRestZ = cfg.lArmRestZ;
  hips.userData.rArmRestZ = cfg.rArmRestZ;
  root.add(hips);

  const spine = new THREE.Bone();
  spine.name = 'spine';
  spine.position.set(0, cfg.spineRelY, 0);
  hips.add(spine);

  const head = new THREE.Bone();
  head.name = 'head';
  head.position.set(0, cfg.neckRelY, 0);
  spine.add(head);

  const lArm = new THREE.Bone();
  lArm.name = 'lArm';
  lArm.position.set(-cfg.shX, cfg.shRelY, 0);
  spine.add(lArm);

  const lFore = new THREE.Bone();
  lFore.name = 'lFore';
  lFore.position.set(-cfg.elbowRelX, cfg.elbowRelY, 0);
  lArm.add(lFore);

  const rArm = new THREE.Bone();
  rArm.name = 'rArm';
  rArm.position.set(cfg.shX, cfg.shRelY, 0);
  spine.add(rArm);

  const rFore = new THREE.Bone();
  rFore.name = 'rFore';
  rFore.position.set(cfg.elbowRelX, cfg.elbowRelY, 0);
  rArm.add(rFore);

  const lThigh = new THREE.Bone();
  lThigh.name = 'lThigh';
  lThigh.position.set(-cfg.legX, 0, 0);
  hips.add(lThigh);

  const lShin = new THREE.Bone();
  lShin.name = 'lShin';
  lShin.position.set(0, cfg.kneeRelY, 0);
  lThigh.add(lShin);

  const rThigh = new THREE.Bone();
  rThigh.name = 'rThigh';
  rThigh.position.set(cfg.legX, 0, 0);
  hips.add(rThigh);

  const rShin = new THREE.Bone();
  rShin.name = 'rShin';
  rShin.position.set(0, cfg.kneeRelY, 0);
  rThigh.add(rShin);

  const bones = [hips, spine, head, lArm, lFore, rArm, rFore, lThigh, lShin, rThigh, rShin];
  const pos = geom.attributes.position;
  const skinIndices = new Uint16Array(pos.count * 4);
  const skinWeights = new Float32Array(pos.count * 4);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const absX = Math.abs(x);

    // Proteksi tegas: Ransel (z < -0.04) dan inti dada (absX < 0.205) tidak boleh ikut tertarik tulang lengan
    const isBackpack = preset === 'raka' && z < -0.04 && y > 0.85 && y < 1.48;
    const isChestCore = preset === 'raka' && absX < 0.205 && y > 0.82 && y < 1.45;

    const armYMask =
      smoothstepSkin(cfg.armYMin0, cfg.armYMin1, y) * (1 - smoothstepSkin(cfg.armYMax0, cfg.armYMax1, y));
    const armXMask = smoothstepSkin(cfg.armX0, cfg.armX1, absX);
    const wArmTotal = isBackpack || isChestCore ? 0 : armYMask * armXMask;

    const wHead =
      smoothstepSkin(cfg.headY0, cfg.headY1, y) * (1 - smoothstepSkin(cfg.headX0, cfg.headX1, absX));
    const wLegTotal = (1 - smoothstepSkin(cfg.legY0, cfg.legY1, y)) * (1 - wArmTotal);

    const wBody = Math.max(0, 1 - wArmTotal - wHead - wLegTotal);
    const spineMix = smoothstepSkin(cfg.hipY, cfg.hipY + cfg.spineRelY, y);
    const wSpine = wBody * spineMix;
    const wHips = wBody * (1 - spineMix);

    const entries: [number, number][] = [];
    if (wHips > 0.001) entries.push([0, wHips]);
    if (wSpine > 0.001) entries.push([1, wSpine]);
    if (wHead > 0.001) entries.push([2, wHead]);

    if (wArmTotal > 0.001) {
      const foreMix = cfg.isTPose
        ? smoothstepSkin(cfg.foreX0, cfg.foreX1, absX)
        : 1 - smoothstepSkin(H * cfg.foreX0, H * cfg.foreX1, y);
      if (x < 0) {
        entries.push([3, wArmTotal * (1 - foreMix)]);
        if (foreMix > 0.001) entries.push([4, wArmTotal * foreMix]);
      } else {
        entries.push([5, wArmTotal * (1 - foreMix)]);
        if (foreMix > 0.001) entries.push([6, wArmTotal * foreMix]);
      }
    }

    if (wLegTotal > 0.001) {
      const shinMix = 1 - smoothstepSkin(cfg.shinY0, cfg.shinY1, y);
      // Pemisahan kaki kiri & kanan presisi di garis tengah x=0 tanpa silang bobot yang merobek selangkangan
      const rightSide = smoothstepSkin(-0.005, 0.005, x);
      const leftSide = 1 - rightSide;
      if (leftSide > 0.001) {
        entries.push([7, wLegTotal * leftSide * (1 - shinMix)]);
        if (shinMix > 0.001) entries.push([8, wLegTotal * leftSide * shinMix]);
      }
      if (rightSide > 0.001) {
        entries.push([9, wLegTotal * rightSide * (1 - shinMix)]);
        if (shinMix > 0.001) entries.push([10, wLegTotal * rightSide * shinMix]);
      }
    }

    entries.sort((a, b) => b[1] - a[1]);
    const top4 = entries.slice(0, 4);
    let sum = 0;
    for (const e of top4) sum += e[1];
    for (let k = 0; k < 4; k++) {
      if (k < top4.length && sum > 0) {
        skinIndices[i * 4 + k] = top4[k][0];
        skinWeights[i * 4 + k] = top4[k][1] / sum;
      }
    }
  }

  geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const skinnedMesh = new THREE.SkinnedMesh(geom, meshRef.material);
  skinnedMesh.castShadow = true;
  skinnedMesh.receiveShadow = true;
  skinnedMesh.frustumCulled = false;
  root.add(skinnedMesh);

  // Bind skeleton to bones with root at y = 0
  root.position.y = 0;
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  skinnedMesh.bind(skeleton);
  root.position.y = groundOffset;

  // Set rest pose
  lArm.rotation.z = cfg.lArmRestZ;
  rArm.rotation.z = cfg.rArmRestZ;
  root.updateMatrixWorld(true);

  return root;
}

export function extractGlbBoneSet(root: THREE.Object3D): GlbBoneSet | undefined {
  const map: Record<string, THREE.Bone> = {};
  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone && obj.name) {
      map[obj.name] = obj as THREE.Bone;
    }
  });
  if (
    !map.hips ||
    !map.spine ||
    !map.head ||
    !map.lArm ||
    !map.lFore ||
    !map.rArm ||
    !map.rFore ||
    !map.lThigh ||
    !map.lShin ||
    !map.rThigh ||
    !map.rShin
  ) {
    return undefined;
  }
  return {
    hips: map.hips,
    spine: map.spine,
    head: map.head,
    lArm: map.lArm,
    lFore: map.lFore,
    rArm: map.rArm,
    rFore: map.rFore,
    lThigh: map.lThigh,
    lShin: map.lShin,
    rThigh: map.rThigh,
    rShin: map.rShin,
    baseHipY:
      typeof map.hips.userData.baseHipY === 'number'
        ? map.hips.userData.baseHipY
        : map.hips.position.y,
  };
}

/**
 * Menyelaraskan tulang SkinnedMesh GLB Raka dengan animasi HumanoidRig (jalan, lari, jongkok, duduk di mobil, menoleh).
 */
export function syncHumanoidGlbBones(
  rig: HumanoidRig,
  opts: { isSeated?: boolean; isCrouching?: boolean; isDowned?: boolean } = {}
): void {
  const b = rig.glbBones;
  if (!b) return;
  const baseRestZ = (b.hips.userData.lArmRestZ as number | undefined) ?? 1.22;
  b.hips.position.y = b.baseHipY;

  if (opts.isSeated) {
    b.spine.rotation.set(0.08, 0, rig.bodyRoot.rotation.z);
    b.lThigh.rotation.x = -1.36;
    b.rThigh.rotation.x = -1.36;
    b.lShin.rotation.x = 1.38;
    b.rShin.rotation.x = 1.38;
    b.lArm.rotation.set(-0.35, 0, baseRestZ);
    b.rArm.rotation.set(-0.45, 0, -baseRestZ);
    b.lFore.rotation.y = 0.45;
    b.rFore.rotation.y = -0.45;
  } else {
    b.spine.rotation.set(
      (opts.isDowned ? 0.34 : opts.isCrouching ? 0.24 : 0) + rig.bodyRoot.rotation.x * 0.45,
      rig.bodyRoot.rotation.y * 0.5,
      rig.bodyRoot.rotation.z
    );
    b.lThigh.rotation.x = rig.leftLeg.rotation.x;
    b.rThigh.rotation.x = rig.rightLeg.rotation.x;
    b.lShin.rotation.x = Math.max(0.06, rig.leftKnee.rotation.x);
    b.rShin.rotation.x = Math.max(0.06, rig.rightKnee.rotation.x);

    if (b.hips.userData.isTPose !== false) {
      // Pembatasan ayunan lengan anatomis: mencegah tangan melayang ke langit saat menengadah
      const clampedPitchL = THREE.MathUtils.clamp(rig.leftArm.rotation.x, -0.65, 0.45);
      const clampedPitchR = THREE.MathUtils.clamp(rig.rightArm.rotation.x, -0.65, 0.45);
      b.lArm.rotation.set(clampedPitchL, 0, baseRestZ - rig.leftArm.rotation.z * 0.35);
      b.rArm.rotation.set(clampedPitchR, 0, -baseRestZ + rig.rightArm.rotation.z * 0.35);
      // Tekukan siku natural ke arah depan (+Z dunia) saat memegang senter/berlari
      const leftElbowBend = Math.min(1.15, Math.max(0.08, Math.abs(rig.leftElbow.rotation.x) * 0.82));
      const rightElbowBend = Math.min(1.15, Math.max(0.08, Math.abs(rig.rightElbow.rotation.x) * 0.82));
      b.lFore.rotation.y = leftElbowBend;
      b.rFore.rotation.y = -rightElbowBend;
    } else {
      b.lArm.rotation.set(rig.leftArm.rotation.x, 0, rig.leftArm.rotation.z);
      b.rArm.rotation.set(rig.rightArm.rotation.x, 0, rig.rightArm.rotation.z);
      b.lFore.rotation.x = rig.leftElbow.rotation.x;
      b.rFore.rotation.x = rig.rightElbow.rotation.x;
    }
  }
  b.head.rotation.set(rig.head.rotation.x, rig.head.rotation.y, rig.head.rotation.z);
}

/**
 * Menyelaraskan tulang SkinnedMesh GLB Boneka Buna & Genderuwo dengan gerakan mengerikan GhostRig (berdiri/berjalan/membeku).
 */
export function syncGhostGlbBones(
  rig: GhostRig,
  timeSec: number,
  isFrozen: boolean,
  isChasing: boolean
): void {
  const b = rig.glbBones;
  if (!b) return;
  const isTPose = b.hips.userData.isTPose !== false;
  const baseRestZ = (b.hips.userData.lArmRestZ as number | undefined) ?? 1.12;

  if (isFrozen) {
    if (isTPose) {
      b.lArm.rotation.z = baseRestZ;
      b.rArm.rotation.z = -baseRestZ;
    }
    return;
  }

  const stride = Math.sin(timeSec * (isChasing ? 10.5 : 4.2)) * (isChasing ? 0.48 : 0.14);
  b.lThigh.rotation.x = stride;
  b.rThigh.rotation.x = -stride;
  b.lShin.rotation.x = Math.max(0.08, -stride * 0.75 + 0.12);
  b.rShin.rotation.x = Math.max(0.08, stride * 0.75 + 0.12);

  if (isTPose) {
    b.lArm.rotation.set(-0.42 - stride * 0.35, 0, baseRestZ);
    b.rArm.rotation.set(-0.52 + stride * 0.35, 0, -baseRestZ);
    b.lFore.rotation.y = 0.55;
    b.rFore.rotation.y = -0.55;
    b.spine.rotation.set(isChasing ? 0.18 : 0.06, 0, Math.sin(timeSec * 3.1) * 0.08);
    b.head.rotation.set(
      Math.sin(timeSec * 2.7) * 0.1,
      Math.sin(timeSec * 1.9) * 0.16,
      Math.sin(timeSec * 6.5) * 0.24
    );
  } else {
    b.lArm.rotation.set(-stride * 0.75 - 0.28, 0, -0.08);
    b.rArm.rotation.set(stride * 0.75 - 0.28, 0, 0.08);
    b.lFore.rotation.x = -0.42 - Math.abs(stride) * 0.35;
    b.rFore.rotation.x = -0.42 - Math.abs(stride) * 0.35;
    b.spine.rotation.set(isChasing ? 0.22 : 0.08, 0, Math.sin(timeSec * 4.2) * 0.06);
    b.head.rotation.set(Math.sin(timeSec * 2.4) * 0.08, Math.sin(timeSec * 1.8) * 0.14, 0);
  }
}

const cachedGlbBundles = new Map<string, Promise<GlbAssetBundle>>();

function stripHorizontalHipsDrift(clips: THREE.AnimationClip[]): void {
  for (const clip of clips) {
    for (const track of clip.tracks) {
      if (!/hips.*\.position$/i.test(track.name) || track.values.length < 3) continue;
      const baseX = track.values[0];
      const baseZ = track.values[2];
      for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] = baseX;
        track.values[i + 2] = baseZ;
      }
    }
  }
}

/**
 * Loads, normalizes, and caches a GLB character/ghost asset by URL so
 * textures, geometries, and animation clips are shared safely across spawns.
 */
function loadNormalizedGlbAsset(
  url: string,
  options: GlbNormalizeOptions
): Promise<GlbAssetBundle> {
  let pending = cachedGlbBundles.get(url);
  if (!pending) {
    const loader = new GLTFLoader();
    pending = loader
      .loadAsync(url)
      .then((gltf) => {
        const root = new THREE.Group();
        let model: THREE.Group = gltf.scene;
        const animations = gltf.animations ?? [];
        if (options.stripHipsRootMotion && animations.length > 0) {
          stripHorizontalHipsDrift(animations);
        }

        if (options.humanoidSkinPreset) {
          model = buildAutoSkinnedHumanoid(
            model,
            options.humanoidSkinPreset,
            options.targetHeight,
            options.groundOffset ?? 0.02,
            options.rotationY ?? 0
          );
        } else {
          if (options.rotationY) {
            model.rotation.y = options.rotationY;
          }

          // Pose bind/first frame before measuring bounds on skinned models.
          let measureMixer: THREE.AnimationMixer | null = null;
          if (animations.length > 0) {
            measureMixer = new THREE.AnimationMixer(model);
            measureMixer.clipAction(animations[0]).play();
            measureMixer.setTime(0);
          }
          model.updateMatrixWorld(true);

          const rawBox = new THREE.Box3().setFromObject(model);
          const rawSize = rawBox.getSize(new THREE.Vector3());
          const scale = rawSize.y > 0.0005 ? options.targetHeight / rawSize.y : 1;
          model.scale.setScalar(scale);
          model.updateMatrixWorld(true);

          const scaledBox = new THREE.Box3().setFromObject(model);
          const center = scaledBox.getCenter(new THREE.Vector3());
          model.position.set(
            -center.x,
            (options.groundOffset ?? 0.02) - scaledBox.min.y,
            -center.z
          );
          measureMixer?.stopAllAction();
        }

        model.traverse((child) => {
          const mesh = child as THREE.Mesh & { isSkinnedMesh?: boolean };
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (mesh.isSkinnedMesh) {
              mesh.frustumCulled = false;
            }
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.envMapIntensity = options.envMapIntensity ?? 0.9;
                mat.needsUpdate = true;
              }
            }
          }
        });

        root.add(model);
        return { root, animations };
      })
      .catch((err) => {
        cachedGlbBundles.delete(url);
        throw err;
      });
    cachedGlbBundles.set(url, pending);
  }
  return pending;
}

function attachGlbGhostModel(
  url: string,
  options: GlbNormalizeOptions,
  rig: GhostRig,
  fallbackRoot: THREE.Group
): void {
  void loadNormalizedGlbAsset(url, options)
    .then((bundle) => {
      const instance = SkeletonUtils.clone(bundle.root) as THREE.Group;
      rig.bodyGroup.add(instance);
      const boneSet = extractGlbBoneSet(instance);
      if (boneSet) {
        rig.glbBones = boneSet;
      }
      if (bundle.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(instance);
        mixer.clipAction(bundle.animations[0]).play();
        rig.mixer = mixer;
      }
      fallbackRoot.visible = false;
    })
    .catch(() => {
      // Pertahankan model prosedural bila pemuatan GLB gagal (mis. mode offline/headless).
    });
}

function makeCanvasTexture(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  repeatX = 1,
  repeatY = 1,
  anisotropy = 4,
  isColor = true,
  canvasW = 512,
  canvasH = 512
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, canvasW, canvasH);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  return makeCanvasTexture((ctx, w, h) => {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.72)');
    grad.addColorStop(0.65, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }, 1, 1, 1, false);
}

export function createContactShadowDisc(radius: number, tex: THREE.CanvasTexture): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 20);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  return mesh;
}

export interface MaterialLibrary {
  wall_out: THREE.MeshStandardMaterial;
  wall_in: THREE.MeshStandardMaterial;
  floor_wood: THREE.MeshStandardMaterial;
  floor_tile: THREE.MeshStandardMaterial;
  floor_roof: THREE.MeshStandardMaterial;
  street: THREE.MeshStandardMaterial;
  parapet: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  crumble: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  contactShadowTex: THREE.CanvasTexture;
}

export function createMaterialLibrary(maxAniso: number): MaterialLibrary {
  const plasterTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#c4c9bf';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1200; i++) {
        ctx.fillStyle = i % 3 === 0 ? 'rgba(38,44,40,0.09)' : 'rgba(220,226,216,0.08)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 7, 2 + Math.random() * 8);
      }
      // Jejak hujan tropis halus + lumut lembap bawah dinding plester Bandung
      for (let i = 0; i < 42; i++) {
        const sx = Math.random() * w;
        const sy = Math.random() * (h * 0.4);
        ctx.fillStyle = 'rgba(26,32,29,0.1)';
        ctx.fillRect(sx, sy, 3 + Math.random() * 4, 45 + Math.random() * 140);
      }
      const dampGrad = ctx.createLinearGradient(0, h * 0.72, 0, h);
      dampGrad.addColorStop(0, 'rgba(18, 28, 20, 0.0)');
      dampGrad.addColorStop(1, 'rgba(18, 28, 20, 0.24)');
      ctx.fillStyle = dampGrad;
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
      ctx.strokeStyle = 'rgba(40,46,42,0.12)';
      ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    },
    4,
    2,
    maxAniso
  );

  const woodTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#3a271c';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#1e120b';
      ctx.lineWidth = 2;
      for (let y = 0; y < h; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = 'rgba(20,12,7,0.18)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 26, 3);
      }
    },
    4,
    4,
    maxAniso
  );

  const tileTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#2d3734';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#19201e';
      ctx.lineWidth = 3;
      for (let i = 0; i <= w; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(w, i);
        ctx.stroke();
      }
    },
    5,
    5,
    maxAniso
  );

  const asphaltTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#1b1f23';
      ctx.fillRect(0, 0, w, h);
      // Agregat batu aspal halus merata (tanpa garis marka hardcoded yang tertarik gepeng di persimpangan)
      for (let i = 0; i < 1600; i++) {
        const px = (i * 73 + (i % 13) * 19) % w;
        const py = (i * 137 + (i % 7) * 29) % h;
        const s = i % 5 === 0 ? 3 : 2;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(72,78,86,0.24)' : 'rgba(7,9,11,0.34)';
        ctx.fillRect(px, py, s, s);
      }
      // Retakan rambut tipis alami di aspal tua Bandung
      ctx.strokeStyle = 'rgba(8, 10, 12, 0.45)';
      ctx.lineWidth = 1.5;
      for (let c = 0; c < 6; c++) {
        ctx.beginPath();
        let cx = (c * 83) % w;
        let cy = (c * 119) % h;
        ctx.moveTo(cx, cy);
        for (let s = 0; s < 5; s++) {
          cx += ((c + s) % 2 === 0 ? 1 : -1) * (14 + ((s * 17) % 20));
          cy += 18 + ((c * 11 + s * 7) % 18);
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    },
    10,
    10,
    maxAniso
  );

  const crumbleTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#4a2923';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#140907';
      ctx.lineWidth = 4;
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        let cx = Math.random() * w;
        let cy = Math.random() * h;
        ctx.moveTo(cx, cy);
        for (let s = 0; s < 4; s++) {
          cx += (Math.random() - 0.5) * 60;
          cy += (Math.random() - 0.5) * 60;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    },
    2,
    2,
    maxAniso
  );

  const wetRoughTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(0, 0, w, h);
      // Bercak genangan air hujan tipis di aspal Bandung agar pantulan lampu jalan & mobil tampak realistis (ala UE5)
      for (let i = 0; i < 24; i++) {
        const px = ((i * 97) % w);
        const py = ((i * 151) % h);
        const rx = 28 + (i % 5) * 18;
        const ry = 18 + (i % 4) * 14;
        const grad = ctx.createRadialGradient(px, py, 2, px, py, Math.max(rx, ry));
        grad.addColorStop(0, '#2a2a2a');
        grad.addColorStop(0.65, '#686868');
        grad.addColorStop(1, '#e8e8e8');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(px, py, rx, ry, (i % 6) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    1,
    8,
    maxAniso
  );

  return {
    wall_out: new THREE.MeshStandardMaterial({
      color: 0xd0d4cc,
      map: plasterTex,
      bumpMap: plasterTex,
      bumpScale: 0.025,
      roughness: 0.88,
      metalness: 0.04,
    }),
    wall_in: new THREE.MeshStandardMaterial({
      color: 0xadb5ae,
      map: plasterTex,
      bumpMap: plasterTex,
      bumpScale: 0.02,
      roughness: 0.88,
      metalness: 0.04,
    }),
    floor_wood: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: woodTex,
      bumpMap: woodTex,
      bumpScale: 0.018,
      roughness: 0.78,
      metalness: 0.06,
    }),
    floor_tile: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tileTex,
      bumpMap: tileTex,
      bumpScale: 0.02,
      roughness: 0.56,
      metalness: 0.12,
    }),
    floor_roof: new THREE.MeshStandardMaterial({
      color: 0x353c38,
      map: plasterTex,
      bumpMap: plasterTex,
      bumpScale: 0.03,
      roughness: 0.92,
      metalness: 0.04,
    }),
    street: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: asphaltTex,
      bumpMap: asphaltTex,
      bumpScale: 0.03,
      roughnessMap: wetRoughTex,
      roughness: 0.92,
      metalness: 0.08,
    }),
    parapet: new THREE.MeshStandardMaterial({
      color: 0x262d27,
      roughness: 0.9,
      metalness: 0.04,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x464f54,
      roughness: 0.42,
      metalness: 0.75,
    }),
    crumble: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: crumbleTex,
      roughness: 0.95,
      metalness: 0.05,
      emissive: new THREE.Color(0x2e0f0a),
      emissiveIntensity: 0.45,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x99b8c2,
      roughness: 0.12,
      metalness: 0.05,
      transparent: true,
      opacity: 0.38,
    }),
    contactShadowTex: createContactShadowTexture(),
  };
}

let cachedWaterNormalA: THREE.DataTexture | null = null;
let cachedWaterNormalB: THREE.DataTexture | null = null;

/**
 * Menghasilkan peta normal (tangent-space) berulang untuk riak air hujan & gelombang kolam realistis.
 */
export function createWaterRippleNormalTexture(
  variant: 0 | 1 = 0,
  maxAniso = 4
): THREE.DataTexture {
  if (variant === 0 && cachedWaterNormalA) return cachedWaterNormalA;
  if (variant === 1 && cachedWaterNormalB) return cachedWaterNormalB;

  const size = 256;
  const heights = new Float32Array(size * size);
  const rings =
    variant === 0
      ? [
          { cx: 0.28, cy: 0.34, freq: 38, amp: 0.55, decay: 6.5 },
          { cx: 0.72, cy: 0.68, freq: 44, amp: 0.45, decay: 7.2 },
          { cx: 0.55, cy: 0.18, freq: 32, amp: 0.4, decay: 6.0 },
        ]
      : [
          { cx: 0.64, cy: 0.28, freq: 42, amp: 0.5, decay: 7.0 },
          { cx: 0.22, cy: 0.76, freq: 36, amp: 0.48, decay: 6.4 },
          { cx: 0.84, cy: 0.82, freq: 48, amp: 0.36, decay: 8.2 },
        ];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Gelombang kapiler angin berulang (seamless periodic)
      let h =
        Math.sin(u * Math.PI * 6 + v * Math.PI * 4) * 0.26 +
        Math.cos(u * Math.PI * 10 - v * Math.PI * 8) * 0.16 +
        Math.sin((u + v) * Math.PI * 14) * 0.08;

      for (const r of rings) {
        let dx = u - r.cx;
        let dy = v - r.cy;
        if (dx > 0.5) dx -= 1;
        if (dx < -0.5) dx += 1;
        if (dy > 0.5) dy -= 1;
        if (dy < -0.5) dy += 1;
        const dist = Math.hypot(dx, dy);
        const envelope = Math.exp(-dist * r.decay);
        h += Math.sin(dist * r.freq) * envelope * r.amp;
      }
      heights[y * size + x] = h;
    }
  }

  const data = new Uint8Array(size * size * 4);
  const strength = 2.6;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * strength;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;

  if (variant === 0) cachedWaterNormalA = tex;
  else cachedWaterNormalB = tex;
  return tex;
}

export interface PuddleZone {
  x: number;
  y: number;
  z: number;
  rx: number;
  rz: number;
}

export interface SplashDroplet {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
}

export interface WaterSurfaceHandle {
  group: THREE.Group;
  normalTexA: THREE.DataTexture;
  normalTexB: THREE.DataTexture;
  shaderMat?: THREE.ShaderMaterial;
  puddles: PuddleZone[];
  splashDrops: SplashDroplet[];
  rainRings: { mesh: THREE.Mesh; phase: number; speed: number; baseScale: number }[];
}

/**
 * Genangan air hujan sinematik dengan Shader GLSL prosedural:
 * - Tepi organik multi-oktaf FBM (bukan elips/cincin kaku)
 * - Riak tetes hujan hidup berlapis + gelombang angin halus
 * - Refleksi Fresnel langit malam & pendar lampu jalan natrium hangat + pinggiran aspal basah
 */
export function createStreetPuddles(maxAniso = 4): WaterSurfaceHandle {
  const group = new THREE.Group();
  const normalTexA = createWaterRippleNormalTexture(0, maxAniso);
  normalTexA.repeat.set(3, 3);
  const normalTexB = createWaterRippleNormalTexture(1, maxAniso);
  normalTexB.repeat.set(4, 4);

  const dampRimTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.14, w * 0.5, h * 0.5, w * 0.49);
      grad.addColorStop(0, '#c8c8c8');
      grad.addColorStop(0.55, '#828282');
      grad.addColorStop(1, '#000000');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
    1,
    1,
    maxAniso,
    false,
    256,
    256
  );

  const dampAsphaltMat = new THREE.MeshStandardMaterial({
    color: 0x090c0e,
    roughness: 0.22,
    metalness: 0.08,
    alphaMap: dampRimTex,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const puddleShaderMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      uTime: { value: 0 },
      uSkyColor: { value: new THREE.Color(0x28415e) },
      uWarmGlow: { value: new THREE.Color(0xffb45a) },
      uDeepWater: { value: new THREE.Color(0x060b10) },
      uSplashes: {
        value: [
          new THREE.Vector4(0, 0, -99, 0),
          new THREE.Vector4(0, 0, -99, 0),
          new THREE.Vector4(0, 0, -99, 0),
          new THREE.Vector4(0, 0, -99, 0),
        ],
      },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSkyColor;
      uniform vec3 uWarmGlow;
      uniform vec3 uDeepWater;
      uniform vec4 uSplashes[4];
      varying vec2 vUv;
      varying vec3 vWorldPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float rainRipple(vec2 wp, vec2 cellOffset, float rate) {
        vec2 cell = floor(wp * 1.15 + cellOffset);
        vec2 local = fract(wp * 1.15 + cellOffset) - 0.5;
        float h1 = hash21(cell);
        float h2 = hash21(cell + vec2(17.3, 9.1));
        float t = fract(uTime * rate + h1 * 6.28);
        vec2 center = (vec2(h1, h2) - 0.5) * 0.48;
        float dist = length(local - center);
        float radius = t * 0.48;
        float ring = smoothstep(0.075, 0.0, abs(dist - radius));
        float wave = sin((dist - radius) * 58.0) * ring * (1.0 - t) * smoothstep(0.0, 0.08, t);
        return wave;
      }

      float footSplashRipple(vec2 wp) {
        float acc = 0.0;
        for (int i = 0; i < 4; i++) {
          vec4 sp = uSplashes[i];
          float age = uTime - sp.z;
          if (sp.w > 0.01 && age >= 0.0 && age < 1.35) {
            float d = length(wp - sp.xy);
            float front = age * 2.1;
            float env = exp(-abs(d - front) * 5.2) * (1.0 - age / 1.35) * sp.w;
            acc += sin((d - front) * 32.0) * env;
          }
        }
        return acc;
      }

      float puddleHeight(vec2 wp) {
        float windA = sin(wp.x * 4.8 + wp.y * 3.1 - uTime * 1.35) * 0.25;
        float windB = cos(wp.x * 3.4 - wp.y * 5.2 + uTime * 1.1) * 0.25;
        float dropA = rainRipple(wp, vec2(0.0, 0.0), 0.72);
        float dropB = rainRipple(wp * 1.35, vec2(3.7, 8.2), 0.56);
        float stepSplash = footSplashRipple(wp);
        return (windA + windB) * 0.07 + (dropA + dropB) * 0.65 + stepSplash * 1.35;
      }

      void main() {
        vec2 centered = (vUv - 0.5) * 2.0;
        float baseDist = length(centered);
        // Distorsi tepi organik multi-oktaf supaya siluet genangan alami mengikuti kontur aspal
        float edgeN =
          noise2D(vWorldPos.xz * 1.4) * 0.28 +
          noise2D(vWorldPos.xz * 3.7 + 4.1) * 0.14;
        float warpedDist = baseDist - (edgeN - 0.19);
        float alphaEdge = 1.0 - smoothstep(0.62, 0.98, warpedDist);
        if (alphaEdge <= 0.01) discard;

        // Riak angin kapiler + 2 lapis riak tetes hujan acak dinamis (gradien finite-difference aman di semua GPU)
        vec2 wp = vWorldPos.xz;
        float h0 = puddleHeight(wp);
        float hx = puddleHeight(wp + vec2(0.035, 0.0));
        float hz = puddleHeight(wp + vec2(0.0, 0.035));
        vec2 grad = vec2(hx - h0, hz - h0) * 9.5;
        vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = clamp(dot(N, V), 0.05, 0.999);
        float fresnel = pow(max(1.0 - ndv, 0.001), 3.2) * 0.88 + 0.12;

        // Kilau cahaya bulan & pendar hangat lampu jalan di atas riak air
        vec3 Lmoon = normalize(vec3(0.45, 0.75, 0.48));
        vec3 Hmoon = normalize(Lmoon + V);
        float specMoon = pow(max(dot(N, Hmoon), 0.001), 54.0) * 0.62;

        // Pantulan hangat dekat koridor Jalan Sukajadi & Warung
        float streetBand = exp(-abs(vWorldPos.x) * 0.095) * (0.45 + 0.55 * smoothstep(5.0, 48.0, vWorldPos.z));
        float rippleGlint = smoothstep(0.06, 0.52, length(grad));
        vec3 reflCol = mix(uSkyColor, uWarmGlow * 0.72, streetBand * 0.65);

        vec3 waterCol = mix(uDeepWater, reflCol, fresnel)
          + uSkyColor * specMoon
          + uWarmGlow * rippleGlint * (0.26 + streetBand * 0.38);

        // Sedikit bening di tepi tipis genangan dan pekat di tengah
        float finalAlpha = alphaEdge * mix(0.66, 0.9, clamp(fresnel + 0.25, 0.0, 1.0));
        gl_FragColor = vec4(waterCol, finalAlpha);
      }
    `,
  });

  const specs: { x: number; y: number; z: number; rx: number; rz: number; rot: number; lobes: number[] }[] = [
    // Depan Warung Ceu Titin & tempat parkir kedatangan mobil
    { x: -2.1, y: -0.013, z: 48.8, rx: 2.35, rz: 1.55, rot: 0.22, lobes: [1.0, 0.88, 1.08, 0.85, 1.02, 0.9] },
    { x: 3.1, y: -0.013, z: 44.2, rx: 1.85, rz: 1.2, rot: -0.35, lobes: [1.05, 0.84, 0.98, 1.1, 0.86, 0.95] },
    // Sekitar saluran air tepi trotoar & Gerobak / Pos Ronda
    { x: -3.7, y: -0.013, z: 33.8, rx: 1.9, rz: 1.45, rot: 0.45, lobes: [0.92, 1.08, 0.88, 1.04, 0.9, 1.02] },
    { x: 3.4, y: -0.013, z: 30.2, rx: 1.8, rz: 1.25, rot: -0.18, lobes: [1.0, 0.9, 1.06, 0.86, 1.02, 0.92] },
    // Persimpangan Jalan Sukajadi Utara & driveway gerbang besi Rumah Gurita
    { x: -5.4, y: -0.01, z: 22.8, rx: 2.4, rz: 1.45, rot: 0.12, lobes: [1.06, 0.86, 1.02, 0.92, 1.08, 0.84] },
    { x: 6.2, y: -0.013, z: 24.4, rx: 2.5, rz: 1.35, rot: -0.08, lobes: [0.95, 1.05, 0.88, 1.06, 0.92, 1.0] },
    { x: -13.4, y: -0.013, z: 25.4, rx: 2.1, rz: 1.2, rot: 0.05, lobes: [1.04, 0.9, 1.06, 0.85, 0.98, 0.92] },
    // Halaman dalam & dekat Carport / Kolam depan Rumah Gurita
    { x: -8.6, y: -0.023, z: 16.5, rx: 1.85, rz: 1.25, rot: 0.35, lobes: [0.94, 1.08, 0.86, 1.02, 0.92, 1.05] },
    { x: -12.6, y: -0.01, z: 12.2, rx: 1.65, rz: 1.1, rot: -0.25, lobes: [1.02, 0.88, 1.04, 0.9, 1.0, 0.88] },
    { x: 1.2, y: -0.023, z: 13.8, rx: 1.9, rz: 1.3, rot: 0.18, lobes: [1.05, 0.87, 1.0, 0.93, 1.06, 0.86] },
    // Jalan Selatan dekat Masjid & Deret Selatan
    { x: -2.2, y: -0.013, z: 58.6, rx: 2.6, rz: 1.6, rot: -0.15, lobes: [1.0, 0.9, 1.08, 0.86, 1.02, 0.92] },
    { x: 14.5, y: -0.013, z: 57.4, rx: 2.2, rz: 1.3, rot: 0.1, lobes: [0.96, 1.04, 0.88, 1.08, 0.9, 1.0] },
  ];

  specs.forEach((p) => {
    const pts: THREE.Vector2[] = [];
    const steps = p.lobes.length;
    for (let i = 0; i < steps; i++) {
      const ang = (i / steps) * Math.PI * 2;
      const rad = p.lobes[i];
      pts.push(new THREE.Vector2(Math.cos(ang) * rad * 0.5, Math.sin(ang) * rad * 0.5));
    }
    const spline = new THREE.SplineCurve(pts);
    const smoothPts = spline.getPoints(36);
    const shape = new THREE.Shape(smoothPts);
    const geo = new THREE.ShapeGeometry(shape);

    const posAttr = geo.attributes.position;
    const uvs = new Float32Array(posAttr.count * 2);
    for (let i = 0; i < posAttr.count; i++) {
      uvs[i * 2] = posAttr.getX(i) + 0.5;
      uvs[i * 2 + 1] = posAttr.getY(i) + 0.5;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    const dampMesh = new THREE.Mesh(geo, dampAsphaltMat);
    dampMesh.rotation.x = -Math.PI / 2;
    dampMesh.rotation.z = p.rot;
    dampMesh.scale.set(p.rx * 2.45, p.rz * 2.45, 1);
    dampMesh.position.set(p.x, p.y - 0.001, p.z);
    dampMesh.receiveShadow = true;
    group.add(dampMesh);

    const waterMesh = new THREE.Mesh(geo, puddleShaderMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.rotation.z = p.rot;
    waterMesh.scale.set(p.rx * 2.05, p.rz * 2.05, 1);
    waterMesh.position.set(p.x, p.y, p.z);
    group.add(waterMesh);
  });

  // Pool percikan tetes air 3D saat pemain melangkah/berlari melewati genangan
  const splashGeo = new THREE.SphereGeometry(0.022, 5, 5);
  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xbfe2f5,
    transparent: true,
    opacity: 0.85,
  });
  const splashDrops: SplashDroplet[] = [];
  for (let i = 0; i < 18; i++) {
    const mesh = new THREE.Mesh(splashGeo, splashMat);
    mesh.visible = false;
    group.add(mesh);
    splashDrops.push({ mesh, vx: 0, vy: 0, vz: 0, age: 99, maxAge: 0.45 });
  }

  return {
    group,
    normalTexA,
    normalTexB,
    shaderMat: puddleShaderMat,
    puddles: specs.map((p) => ({ x: p.x, y: p.y, z: p.z, rx: p.rx, rz: p.rz })),
    splashDrops,
    rainRings: [],
  };
}

/**
 * Detail Jalan Raya Sukajadi & Trotoar Bandung:
 * Marka jalan putus-putus & garis bahu putih searah sumbu jalan (Utara-Selatan & Timur-Barat),
 * zebra cross persimpangan, trotoar paving block, kanstin beton hitam-putih, tutup selokan/got besi,
 * tutup manhole, polisi tidur karet, serta papan nama Jalan Sukajadi.
 */
export function createRoadAndSidewalkDetails(maxAniso = 4): THREE.Group {
  const group = new THREE.Group();

  const whitePaintMat = new THREE.MeshStandardMaterial({
    color: 0xd4d2c7,
    roughness: 0.72,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const yellowPaintMat = new THREE.MeshStandardMaterial({
    color: 0xd9a83c,
    roughness: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const curbWhiteMat = new THREE.MeshStandardMaterial({ color: 0xcfd1ca, roughness: 0.8 });
  const curbBlackMat = new THREE.MeshStandardMaterial({ color: 0x1d2123, roughness: 0.85 });
  const ironGrateMat = new THREE.MeshStandardMaterial({ color: 0x2a3034, roughness: 0.55, metalness: 0.72 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x181a1c, roughness: 0.88 });
  const patchMat = new THREE.MeshStandardMaterial({ color: 0x131618, roughness: 0.94 });

  // Tekstur Paving Block Abu-Abu Bandung untuk permukaan trotoar yang jelas & tegas
  const pavingTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#474c48';
      ctx.fillRect(0, 0, w, h);
      const pw = 32;
      const ph = 16;
      for (let row = 0; row < h / ph; row++) {
        const off = (row % 2) * (pw * 0.5);
        for (let col = -1; col < w / pw + 1; col++) {
          const x = col * pw + off;
          const y = row * ph;
          const v = 64 + ((row * 7 + col * 13) & 15);
          ctx.fillStyle = `rgb(${v}, ${v + 3}, ${v})`;
          ctx.fillRect(x + 1, y + 1, pw - 2, ph - 2);
          ctx.strokeStyle = 'rgba(18, 20, 19, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);
        }
      }
    },
    1,
    1,
    maxAniso
  );
  const sidePavingTex = pavingTex.clone();
  sidePavingTex.repeat.set(3, 18);
  sidePavingTex.needsUpdate = true;
  const sidePavingMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: sidePavingTex,
    roughness: 0.86,
  });

  const northApronTex = pavingTex.clone();
  northApronTex.repeat.set(22, 1);
  northApronTex.needsUpdate = true;
  const northApronMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: northApronTex,
    roughness: 0.86,
  });

  const roadTopY = -0.0165;

  // 1. Lapisan Paving Block Trotoar (menutupi atas sidewalk_* pada levelData.ts tanpa z-fighting)
  for (const sx of [-7.2, 7.2]) {
    const pav = new THREE.Mesh(new THREE.PlaneGeometry(3.75, 25.9), sidePavingMat);
    pav.rotation.x = -Math.PI / 2;
    pav.position.set(sx, -0.005, 41.8);
    pav.receiveShadow = true;
    group.add(pav);
  }
  for (const [ax, aw] of [
    [-16.8, 2.8],
    [-9.5, 4.9],
    [7.15, 22.1],
  ]) {
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(aw, 0.68), northApronMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(ax, -0.008, 20.85);
    apron.receiveShadow = true;
    group.add(apron);
  }

  // 2. Kanstin Beton Hitam-Putih di Tepi Trotoar & Apron Rumah Gurita
  const curbGeo = new THREE.BoxGeometry(0.18, 0.085, 0.96);
  let curbToggle = 0;
  for (const cx of [-5.28, 5.28]) {
    for (let z = 29.3; z <= 54.3; z += 1.0) {
      const c = new THREE.Mesh(curbGeo, curbToggle++ % 2 === 0 ? curbWhiteMat : curbBlackMat);
      c.position.set(cx, 0.02, z);
      c.receiveShadow = true;
      group.add(c);
    }
  }
  const nCurbGeo = new THREE.BoxGeometry(0.96, 0.085, 0.18);
  for (const [xStart, xEnd] of [
    [-18.0, -15.6],
    [-11.6, -7.3],
    [-3.7, 18.0],
  ]) {
    for (let x = xStart + 0.5; x <= xEnd - 0.4; x += 1.0) {
      const c = new THREE.Mesh(nCurbGeo, curbToggle++ % 2 === 0 ? curbWhiteMat : curbBlackMat);
      c.position.set(x, 0.018, 21.18);
      c.receiveShadow = true;
      group.add(c);
    }
  }

  // 3. Marka Jalan Raya Utara-Selatan (road_main_ns_mid & road_main_ns_south)
  const addNSRoadLines = (zStart: number, zEnd: number) => {
    const len = zEnd - zStart;
    const zMid = (zStart + zEnd) * 0.5;
    for (const sx of [-4.72, 4.72]) {
      const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(0.14, len), whitePaintMat);
      shoulder.rotation.x = -Math.PI / 2;
      shoulder.position.set(sx, roadTopY, zMid);
      group.add(shoulder);
    }
    const dashGeo = new THREE.PlaneGeometry(0.16, 2.2);
    for (let z = zStart + 1.5; z <= zEnd - 1.5; z += 4.2) {
      const dash = new THREE.Mesh(dashGeo, yellowPaintMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, roadTopY, z);
      group.add(dash);
    }
  };
  addNSRoadLines(29.0, 54.5);
  addNSRoadLines(62.8, 79.8);

  // 4. Marka Jalan Raya Timur-Barat (road_cross_north Z=25.0 & road_cross_south Z=58.6)
  const addEWRoadLines = (zCenter: number, xStart: number, xEnd: number) => {
    const len = xEnd - xStart;
    const xMid = (xStart + xEnd) * 0.5;
    for (const sz of [zCenter - 3.3, zCenter + 3.3]) {
      const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.14), whitePaintMat);
      shoulder.rotation.x = -Math.PI / 2;
      shoulder.position.set(xMid, roadTopY, sz);
      group.add(shoulder);
    }
    const dashGeo = new THREE.PlaneGeometry(2.4, 0.16);
    for (let x = xStart + 1.6; x <= xEnd - 1.6; x += 4.4) {
      const dash = new THREE.Mesh(dashGeo, yellowPaintMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, roadTopY, zCenter);
      group.add(dash);
    }
  };
  addEWRoadLines(25.0, -64, -6.2);
  addEWRoadLines(25.0, 6.2, 64);
  addEWRoadLines(58.6, -64, -6.2);
  addEWRoadLines(58.6, 6.2, 64);

  // 5. Zebra Cross & Garis Henti di Persimpangan Utama Sukajadi
  const zBarGeoNS = new THREE.PlaneGeometry(0.55, 2.5);
  for (const zc of [29.8, 53.5, 63.8]) {
    for (let x = -4.0; x <= 4.0; x += 1.0) {
      const bar = new THREE.Mesh(zBarGeoNS, whitePaintMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(x, roadTopY, zc);
      group.add(bar);
    }
    const stopLine = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.24), whitePaintMat);
    stopLine.rotation.x = -Math.PI / 2;
    stopLine.position.set(zc < 40 ? 2.3 : -2.3, roadTopY, zc < 40 ? zc + 1.7 : zc - 1.7);
    group.add(stopLine);
  }
  const zBarGeoEW = new THREE.PlaneGeometry(2.4, 0.55);
  for (const xc of [-6.8, 6.8]) {
    for (const zBase of [25.0, 58.6]) {
      for (let z = zBase - 2.6; z <= zBase + 2.6; z += 1.04) {
        const bar = new THREE.Mesh(zBarGeoEW, whitePaintMat);
        bar.rotation.x = -Math.PI / 2;
        bar.position.set(xc, roadTopY, z);
        group.add(bar);
      }
    }
  }

  // 6. Tutup Got Besi Drainase (tempat genangan air berkumpul), Tutup Manhole, Polisi Tidur, & Tambalan Aspal
  for (const [gx, gz] of [
    [-4.92, 33.8],
    [4.92, 30.2],
    [-4.92, 48.2],
    [4.92, 44.2],
    [-6.2, 21.8],
    [6.2, 21.8],
    [-6.2, 55.4],
    [6.2, 55.4],
  ]) {
    const grate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.018, 0.95), ironGrateMat);
    grate.position.set(gx, -0.014, gz);
    group.add(grate);
    for (let s = -0.36; s <= 0.36; s += 0.12) {
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.045), rubberMat);
      slot.rotation.x = -Math.PI / 2;
      slot.position.set(gx, -0.004, gz + s);
      group.add(slot);
    }
  }

  for (const [mx, mz] of [
    [1.8, 25.0],
    [-1.6, 58.6],
    [0.0, 41.8],
  ]) {
    const manhole = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.016, 14), ironGrateMat);
    manhole.position.set(mx, -0.016, mz);
    group.add(manhole);
  }

  // Polisi tidur karet kuning-hitam rendah (visual tipis 1.4cm agar mobil/pemain tetap mulus melintas)
  for (const bz of [31.6, 52.0]) {
    const segW = 0.72;
    for (let i = 0; i < 12; i++) {
      const bx = -4.0 + i * segW;
      const bump = new THREE.Mesh(
        new THREE.BoxGeometry(segW - 0.02, 0.026, 0.32),
        i % 2 === 0 ? yellowPaintMat : rubberMat
      );
      bump.position.set(bx, -0.009, bz);
      group.add(bump);
    }
  }

  // Tambalan aspal realistis di beberapa ruas Jalan Sukajadi
  for (const [px, pz, pw, pd, rot] of [
    [-2.4, 37.5, 2.2, 1.4, 0.14],
    [2.6, 49.6, 1.9, 1.6, -0.22],
    [-11.5, 24.8, 2.8, 1.3, 0.08],
    [16.0, 58.4, 2.5, 1.5, -0.1],
  ]) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), patchMat);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = rot;
    patch.position.set(px, roadTopY - 0.001, pz);
    group.add(patch);
  }

  // 7. Papan Nama Jalan "JL. SUKAJADI - BANDUNG" di sudut persimpangan Warung
  const signTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#144d2a';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#ecebe3';
      ctx.lineWidth = 6;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('JL. SUKAJADI', w / 2, 46);
      ctx.fillStyle = '#d4e8d8';
      ctx.font = '18px sans-serif';
      ctx.fillText('KEC. SUKAJADI · BANDUNG', w / 2, 76);
    },
    1,
    1,
    maxAniso,
    true,
    384,
    96
  );
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.85, 8), ironGrateMat);
  pole.position.set(-5.6, 1.42, 29.2);
  const boardBack = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.28, 0.04), ironGrateMat);
  boardBack.position.set(-5.6, 2.7, 29.2);
  const boardFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.98, 0.25),
    new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
  );
  boardFace.position.set(-5.6, 2.7, 29.23);
  group.add(pole, boardBack, boardFace);

  return group;
}

function createOctopusSkinTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1b1e21';
  ctx.fillRect(0, 0, 128, 128);

  // Subtle weathered concrete mineral variation & rain streaks (matching Bandung rooftop statue)
  for (let i = 0; i < 420; i++) {
    const x = (i * 53) % 128;
    const y = (i * 97) % 128;
    const r = 1 + (i % 4);
    ctx.fillStyle = i % 3 === 0 ? 'rgba(54,60,64,0.22)' : 'rgba(10,12,13,0.34)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 28; i++) {
    const x = (i * 19 + 7) % 128;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(42,50,46,0.18)' : 'rgba(8,10,11,0.26)';
    ctx.fillRect(x, 0, 2, 128);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

interface SuckerPlacement {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  radius: number;
}

function buildTaperedTentacleGeometry(
  curve: THREE.CatmullRomCurve3,
  tubularSegs: number,
  radialSegs: number,
  baseRadius: number,
  tipRadius: number,
  suckerCollector: SuckerPlacement[]
): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(tubularSegs, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const v = new THREE.Vector3();

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    curve.getPointAt(t, p);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const rBase = tipRadius + (baseRadius - tipRadius) * Math.pow(1 - t, 1.38);

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = -Math.cos(theta);
      // Slight organic dorsal ridge profile
      const ribMod = 1 + 0.05 * Math.cos(theta * 3);
      const r = rBase * ribMod;

      n.x = cos * N.x + sin * B.x;
      n.y = cos * N.y + sin * B.y;
      n.z = cos * N.z + sin * B.z;
      n.normalize();

      v.x = p.x + r * n.x;
      v.y = p.y + r * n.y;
      v.z = p.z + r * n.z;

      positions.push(v.x, v.y, v.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(u, t * 4);
    }

    // Place twin-row suction cups along the ventral/outer side of the tentacle
    if (i >= 3 && i <= tubularSegs - 2 && i % 2 === 1) {
      const outDir = new THREE.Vector3(p.x, -0.35, p.z).normalize();
      const tangent = frames.tangents[i];
      const sideAxis = new THREE.Vector3().crossVectors(tangent, outDir).normalize();
      if (sideAxis.lengthSq() < 0.01) sideAxis.set(1, 0, 0);
      const ventralDir = new THREE.Vector3().crossVectors(sideAxis, tangent).normalize();
      // Ensure ventral points outward/downward visibly
      if (ventralDir.dot(outDir) < 0) ventralDir.negate();

      const suckerR = Math.max(0.028, rBase * 0.34);
      for (const sideSign of [-1, 1]) {
        const cupNormal = ventralDir
          .clone()
          .addScaledVector(sideAxis, sideSign * 0.42)
          .normalize();
        const cupPos = p.clone().addScaledVector(cupNormal, rBase * 0.94);
        suckerCollector.push({ pos: cupPos, normal: cupNormal, radius: suckerR });
      }
    }
  }

  for (let j = 1; j <= tubularSegs; j++) {
    for (let i = 1; i <= radialSegs; i++) {
      const a = (radialSegs + 1) * (j - 1) + (i - 1);
      const b = (radialSegs + 1) * j + (i - 1);
      const c = (radialSegs + 1) * j + i;
      const d = (radialSegs + 1) * (j - 1) + i;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Patung Gurita Hitam Bermata Merah (STATIS, properti seni ikonik di atap yang tentakelnya menjuntai ke balkon depan).
 */
export function createOctopusStatue(): {
  group: THREE.Group;
  eyeMeshes: THREE.Mesh[];
} {
  const group = new THREE.Group();
  const skinTex = createOctopusSkinTexture();

  const blackBody = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: skinTex,
    roughness: 0.62,
    metalness: 0.16,
  });
  const collarDark = new THREE.MeshStandardMaterial({
    color: 0x1e2226,
    roughness: 0.72,
    metalness: 0.12,
  });
  const plinthStone = new THREE.MeshStandardMaterial({
    color: 0x2b3033,
    roughness: 0.88,
    metalness: 0.05,
  });
  const suckerMat = new THREE.MeshStandardMaterial({
    color: 0x4b5156,
    roughness: 0.78,
    metalness: 0.08,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xff2222,
    emissive: new THREE.Color(0xe31616),
    emissiveIntensity: 2.3,
    roughness: 0.18,
  });
  const pupilMat = new THREE.MeshStandardMaterial({
    color: 0x090202,
    roughness: 0.15,
  });

  // 1. Alas Batu & Leher Berotot Bertingkat
  const plinthLower = new THREE.Mesh(new THREE.CylinderGeometry(2.38, 2.68, 0.65, 20), plinthStone);
  plinthLower.position.y = 0.325;
  plinthLower.castShadow = true;
  plinthLower.receiveShadow = true;
  group.add(plinthLower);

  const plinthUpper = new THREE.Mesh(new THREE.CylinderGeometry(1.92, 2.28, 0.72, 20), collarDark);
  plinthUpper.position.y = 1.01;
  plinthUpper.castShadow = true;
  plinthUpper.receiveShadow = true;
  group.add(plinthUpper);

  // Sabuk selaput pangkal tentakel
  const webRing = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.32, 10, 22), blackBody);
  webRing.rotation.x = Math.PI * 0.5;
  webRing.position.y = 1.38;
  webRing.castShadow = true;
  group.add(webRing);

  // 2. Mantel Kepala Gurita Organik (Agak Lonjong & Miring ke Belakang seperti Foto Asli Bandung)
  const mantlePts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(1.32, 0.16),
    new THREE.Vector2(1.78, 0.82),
    new THREE.Vector2(2.04, 1.72),
    new THREE.Vector2(1.94, 2.68),
    new THREE.Vector2(1.48, 3.45),
    new THREE.Vector2(0.82, 3.92),
    new THREE.Vector2(0.0, 4.12),
  ];
  const headAnchor = new THREE.Group();
  headAnchor.position.set(0, 1.32, -0.15);
  headAnchor.rotation.x = -0.22;
  group.add(headAnchor);

  const mantle = new THREE.Mesh(new THREE.LatheGeometry(mantlePts, 28), blackBody);
  mantle.scale.set(1.04, 1.0, 1.2);
  mantle.castShadow = true;
  mantle.receiveShadow = true;
  headAnchor.add(mantle);

  // Punggungan mahkota belakang & lipatan mantel samping
  const dorsalCrest = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 14), blackBody);
  dorsalCrest.scale.set(0.75, 1.45, 0.88);
  dorsalCrest.position.set(0, 2.85, -1.05);
  dorsalCrest.rotation.x = -0.35;
  dorsalCrest.castShadow = true;
  headAnchor.add(dorsalCrest);

  // Corong Siphon (tabung pernapasan samping khas anatomi gurita)
  const siphonCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.1, 0.35, 0.6),
    new THREE.Vector3(1.88, 0.62, 0.92),
    new THREE.Vector3(2.24, 0.78, 1.18),
  ]);
  const siphon = new THREE.Mesh(new THREE.TubeGeometry(siphonCurve, 10, 0.24, 10, false), collarDark);
  siphon.castShadow = true;
  headAnchor.add(siphon);
  const siphonLip = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 8, 12), blackBody);
  siphonLip.position.set(2.24, 0.78, 1.18);
  siphonLip.lookAt(3.0, 1.0, 1.8);
  headAnchor.add(siphonLip);

  // 3. Kelopak Alis Berotot, Soket Mata Cekung, Bola Mata Merah Menyala & Pupil Horizontal
  const eyeMeshes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(side * 0.86, 0.92, 1.72);
    eyeSocket.rotation.y = side * 0.34;
    headAnchor.add(eyeSocket);

    const socketRim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 10, 16), collarDark);
    socketRim.castShadow = true;
    eyeSocket.add(socketRim);

    const browArch = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.11, 10, 14, Math.PI * 0.95),
      blackBody
    );
    browArch.position.set(0, 0.08, 0.04);
    browArch.rotation.z = side * -0.18;
    browArch.castShadow = true;
    eyeSocket.add(browArch);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 14), eyeMat);
    eye.position.set(0, -0.01, 0.06);
    eyeSocket.add(eye);
    eyeMeshes.push(eye);

    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.075, 0.06), pupilMat);
    pupil.position.set(0, -0.01, 0.29);
    eyeSocket.add(pupil);
  }

  // 4. 8 Tentakel Meruncing (Tapered) dengan Pose Asimetris Ikonik Rumah Gurita Bandung
  const tentacleSpecs: { pts: [number, number, number][]; baseR: number; tipR: number }[] = [
    // 0: Tentakel utama depan-kanan melengkung di atas bibir balkon atap & menjuntai turun hingga balkon Lantai 2
    {
      pts: [
        [0.85, 1.42, 1.25],
        [1.25, 2.18, 2.75],
        [1.38, 1.55, 4.45],
        [1.22, 0.45, 5.55],
        [0.98, -1.35, 5.42],
        [1.08, -2.95, 4.95],
        [1.55, -3.55, 5.25],
        [1.92, -3.12, 5.38],
      ],
      baseR: 0.42,
      tipR: 0.05,
    },
    // 1: Tentakel depan-kiri melengkung spiral S-loop melewati sisi barat balkon
    {
      pts: [
        [-0.85, 1.42, 1.22],
        [-1.45, 2.28, 2.38],
        [-2.05, 1.65, 3.85],
        [-2.28, -0.35, 4.55],
        [-1.85, -1.95, 4.45],
        [-1.32, -1.62, 4.72],
      ],
      baseR: 0.4,
      tipR: 0.05,
    },
    // 2: Tentakel kanan-depan mencengkeram bibir mangkuk balkon atap
    {
      pts: [
        [1.35, 1.36, 0.55],
        [2.35, 1.85, 1.65],
        [2.85, 0.85, 2.95],
        [2.65, 0.22, 3.85],
        [2.05, 0.58, 4.18],
      ],
      baseR: 0.36,
      tipR: 0.05,
    },
    // 3: Tentakel kiri-samping menjuntai melewati parapet barat atap
    {
      pts: [
        [-1.38, 1.36, 0.48],
        [-2.42, 1.72, 1.15],
        [-3.18, 0.95, 1.72],
        [-3.45, -0.85, 1.98],
        [-3.18, -1.52, 2.42],
      ],
      baseR: 0.36,
      tipR: 0.05,
    },
    // 4: Tentakel timur melingkar di dek atap dengan ujung tergulung ke atas
    {
      pts: [
        [1.42, 1.32, -0.45],
        [2.38, 1.12, -0.35],
        [3.22, 0.35, 0.15],
        [3.68, 0.25, 0.95],
        [3.35, 0.88, 1.28],
        [2.98, 0.72, 0.95],
      ],
      baseR: 0.35,
      tipR: 0.045,
    },
    // 5: Tentakel barat-belakang melingkar di dek atap menuju karang seni
    {
      pts: [
        [-1.38, 1.32, -0.55],
        [-2.28, 1.05, -1.05],
        [-2.95, 0.32, -1.78],
        [-2.42, 0.26, -2.65],
        [-1.85, 0.72, -2.35],
      ],
      baseR: 0.35,
      tipR: 0.045,
    },
    // 6: Tentakel belakang-kanan menjalar di lantai atap
    {
      pts: [
        [0.75, 1.32, -1.25],
        [1.35, 0.95, -2.15],
        [2.05, 0.3, -2.95],
        [2.72, 0.26, -2.55],
        [2.52, 0.68, -2.02],
      ],
      baseR: 0.34,
      tipR: 0.045,
    },
    // 7: Tentakel belakang-tengah melengkung kokoh sebagai jangkar
    {
      pts: [
        [-0.38, 1.34, -1.32],
        [-0.55, 1.22, -2.38],
        [-0.35, 0.35, -3.28],
        [0.42, 0.28, -3.65],
        [0.72, 0.78, -3.32],
      ],
      baseR: 0.36,
      tipR: 0.05,
    },
  ];

  const suckers: SuckerPlacement[] = [];
  for (const spec of tentacleSpecs) {
    const curve = new THREE.CatmullRomCurve3(
      spec.pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))
    );
    const geo = buildTaperedTentacleGeometry(curve, 26, 10, spec.baseR, spec.tipR, suckers);
    const tentMesh = new THREE.Mesh(geo, blackBody);
    tentMesh.castShadow = true;
    tentMesh.receiveShadow = true;
    group.add(tentMesh);
  }

  // 5. Ratusan Mangkuk Hisap (Suction Cups) 2-Baris via 1 InstancedMesh (hemat draw call!)
  if (suckers.length > 0) {
    const cupGeo = new THREE.CylinderGeometry(1.0, 0.76, 0.45, 8);
    const cupMesh = new THREE.InstancedMesh(cupGeo, suckerMat, suckers.length);
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion();
    suckers.forEach((s, idx) => {
      dummy.position.copy(s.pos);
      quat.setFromUnitVectors(up, s.normal);
      dummy.quaternion.copy(quat);
      dummy.scale.set(s.radius, s.radius, s.radius);
      dummy.updateMatrix();
      cupMesh.setMatrixAt(idx, dummy.matrix);
    });
    cupMesh.instanceMatrix.needsUpdate = true;
    group.add(cupMesh);
  }

  // Pencahayaan rim bulan lembut & pendar merah mata agar lekuk tentakel & mangkuk hisap terlihat jelas di malam hari
  const moonRim = new THREE.PointLight(0x8ba7c2, 2.4, 14, 1.4);
  moonRim.position.set(-0.6, 5.1, 4.4);
  group.add(moonRim);

  const eyeGlow = new THREE.PointLight(0xe02222, 1.35, 6.5, 2.0);
  eyeGlow.position.set(0, 2.35, 2.55);
  group.add(eyeGlow);

  // Tiang penangkal petir vertikal di sisi belakang mahkota gurita (sesuai foto asli)
  const spireMat = new THREE.MeshStandardMaterial({
    color: 0x3b4048,
    roughness: 0.42,
    metalness: 0.85,
  });
  const spirePole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.055, 5.4, 8), spireMat);
  spirePole.position.set(-0.35, 3.6, -1.65);
  spirePole.castShadow = true;
  group.add(spirePole);
  const spireTip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 8), spireMat);
  spireTip.position.set(-0.35, 6.45, -1.65);
  group.add(spireTip);

  return { group, eyeMeshes };
}

function createGentengRoofTexture(baseColorHex: number, maxAniso: number): THREE.CanvasTexture {
  const c = new THREE.Color(baseColorHex);
  const rBase = Math.round(c.r * 255);
  const gBase = Math.round(c.g * 255);
  const bBase = Math.round(c.b * 255);

  return makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = `rgb(${rBase},${gBase},${bBase})`;
      ctx.fillRect(0, 0, w, h);

      const cols = 16;
      const rows = 14;
      const cw = w / cols;
      const rh = h / rows;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * cw;
          const y = row * rh;
          const shade = ((row * 7 + col * 13) % 19) - 9;
          ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, rBase + shade))},${Math.max(0, Math.min(255, gBase + shade))},${Math.max(0, Math.min(255, bBase + shade))})`;
          ctx.fillRect(x + 1, y + 1, cw - 2, rh - 2);

          // Bayangan lengkung genteng tanah liat
          ctx.fillStyle = 'rgba(10, 6, 4, 0.34)';
          ctx.fillRect(x, y + rh - 5, cw, 5);
          ctx.fillStyle = 'rgba(255, 225, 195, 0.1)';
          ctx.fillRect(x + 3, y + 2, cw * 0.45, 3);
        }
      }
    },
    3,
    3,
    maxAniso
  );
}

function createRosterBlockTexture(maxAniso: number): THREE.CanvasTexture {
  return makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#cfd3cb';
      ctx.fillRect(0, 0, w, h);
      const cell = 64;
      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          ctx.strokeStyle = '#9aa097';
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
          // Lubang roster beton gelap bertingkat
          ctx.fillStyle = '#18201e';
          ctx.fillRect(x + 11, y + 11, cell - 22, cell - 22);
          // Ornamen silang / kerawang tengah khas 1980-an
          ctx.fillStyle = '#c4c9c0';
          ctx.fillRect(x + cell * 0.5 - 4, y + 10, 8, cell - 20);
          ctx.fillRect(x + 10, y + cell * 0.5 - 4, cell - 20, 8);
          ctx.fillStyle = '#242d2a';
          ctx.beginPath();
          ctx.arc(x + cell * 0.5, y + cell * 0.5, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    2,
    2,
    maxAniso,
    true,
    256,
    256
  );
}

function createMarineMuralTexture(maxAniso: number): THREE.CanvasTexture {
  return makeCanvasTexture(
    (ctx, w, h) => {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#cfd6cf');
      bg.addColorStop(1, '#aeb9b4');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#242d2b';
      ctx.lineWidth = 10;
      ctx.strokeRect(10, 10, w - 20, h - 20);

      // Siluet ikonik kuda laut / kereta kuda kelautan di balik kaca Rumah Gurita
      ctx.fillStyle = '#1f2625';
      for (const hx of [w * 0.34, w * 0.52, w * 0.68]) {
        ctx.beginPath();
        ctx.ellipse(hx, h * 0.56, 36, 18, -0.15, 0, Math.PI * 2);
        ctx.fill();
        // Leher & kepala melengkung
        ctx.beginPath();
        ctx.moveTo(hx - 14, h * 0.52);
        ctx.quadraticCurveTo(hx - 36, h * 0.3, hx - 58, h * 0.34);
        ctx.quadraticCurveTo(hx - 48, h * 0.44, hx - 22, h * 0.46);
        ctx.lineTo(hx + 6, h * 0.54);
        ctx.fill();
        // Ekor spiral kelautan
        ctx.strokeStyle = '#1f2625';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(hx + 34, h * 0.66, 16, 0, Math.PI * 1.6);
        ctx.stroke();
      }
      // Garis ombak bergelombang di bawah siluet
      ctx.strokeStyle = '#29484d';
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let x = 24; x <= w - 24; x += 24) {
        const y = h * 0.8 + Math.sin(x * 0.06) * 8;
        if (x === 24) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },
    1,
    1,
    maxAniso,
    true,
    512,
    256
  );
}

function createBilikBambuTexture(maxAniso: number): THREE.CanvasTexture {
  return makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#6e5435';
      ctx.fillRect(0, 0, w, h);
      const step = 20;
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const odd = ((x / step + y / step) | 0) % 2 === 0;
          ctx.fillStyle = odd ? '#826440' : '#574027';
          ctx.fillRect(x + 1, y + 1, step - 2, step - 2);
          ctx.strokeStyle = 'rgba(22,14,8,0.35)';
          ctx.strokeRect(x, y, step, step);
        }
      }
    },
    2,
    1,
    maxAniso,
    true,
    256,
    256
  );
}

function createCorrugatedZincTexture(maxAniso: number): THREE.CanvasTexture {
  return makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#485055';
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) {
        ctx.fillStyle = 'rgba(220,232,240,0.16)';
        ctx.fillRect(x, 0, 6, h);
        ctx.fillStyle = 'rgba(12,16,18,0.35)';
        ctx.fillRect(x + 8, 0, 5, h);
      }
      // Garis karat ringan di tepi seng
      for (let i = 0; i < 45; i++) {
        ctx.fillStyle = 'rgba(115, 62, 34, 0.22)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 18 + Math.random() * 30, 4);
      }
    },
    3,
    2,
    maxAniso,
    true,
    256,
    256
  );
}

function createBatuAlamTexture(maxAniso: number): THREE.CanvasTexture {
  return makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#2d312f';
      ctx.fillRect(0, 0, w, h);
      const rowH = 16;
      for (let y = 0; y < h; y += rowH) {
        let x = (y / rowH) % 2 === 0 ? 0 : -28;
        while (x < w) {
          const bw = 42 + ((x * 13 + y * 7) & 31);
          const shade = 48 + ((x * 5 + y * 11) % 26);
          ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade - 1})`;
          ctx.fillRect(x + 1, y + 1, bw - 2, rowH - 2);
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fillRect(x + 1, y + 1, bw - 2, 3);
          x += bw;
        }
      }
    },
    2,
    2,
    maxAniso,
    true,
    256,
    256
  );
}

function createWarungTileTexture(maxAniso: number, baseHex = '#cfc9b8', accentHex = '#b3ad9c'): THREE.CanvasTexture {
  return makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = baseHex;
      ctx.fillRect(0, 0, w, h);
      const cell = 64;
      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          if (((x + y) / cell) % 2 === 0) {
            ctx.fillStyle = accentHex;
            ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
          }
          ctx.strokeStyle = 'rgba(42, 46, 40, 0.42)';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, cell, cell);
        }
      }
    },
    3,
    3,
    maxAniso,
    true,
    256,
    256
  );
}

/**
 * Fasad Putih Art-Deco Rumah Gurita Bandung:
 * Pondasi batu kali, balkon lengkung bertingkat dengan soffit corbel & pagar besi atap,
 * kerawang roster beton 1980-an, kanopi pintu bergelombang, lentera teras, & relief siluet kelautan.
 */
export function createRumahGuritaFacadeDetails(maxAniso = 4): {
  group: THREE.Group;
  facadeMat: THREE.MeshStandardMaterial;
  trimMat: THREE.MeshStandardMaterial;
  windowMat: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();
  const stuccoTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#d4d8d0';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(32,38,35,0.06)' : 'rgba(245,248,240,0.06)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 4 + Math.random() * 10, 4 + Math.random() * 12);
      }
      // Jejak rembesan hujan di fasad Art-Deco
      for (let i = 0; i < 32; i++) {
        ctx.fillStyle = 'rgba(30,36,34,0.08)';
        ctx.fillRect(Math.random() * w, 0, 3 + Math.random() * 4, 65 + Math.random() * 160);
      }
    },
    3,
    2,
    maxAniso
  );

  const facadeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: stuccoTex,
    roughness: 0.86,
    metalness: 0.04,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xe6e8e0, roughness: 0.76, metalness: 0.06 });
  const stonePlinthMat = new THREE.MeshStandardMaterial({ color: 0x3b403c, roughness: 0.92 });
  const darkMullion = new THREE.MeshStandardMaterial({ color: 0x222927, roughness: 0.45, metalness: 0.5 });
  const ironRailMat = new THREE.MeshStandardMaterial({ color: 0x1b2022, roughness: 0.38, metalness: 0.78 });
  const balconyDeckMat = new THREE.MeshStandardMaterial({ color: 0x2f3532, roughness: 0.9 });
  const shingleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createCorrugatedZincTexture(maxAniso),
    roughness: 0.78,
    metalness: 0.25,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x182e36,
    emissive: new THREE.Color(0x09161a),
    emissiveIntensity: 0.22,
    roughness: 0.14,
    metalness: 0.38,
  });
  const clearGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x709ea8,
    emissive: new THREE.Color(0x0c1b1e),
    emissiveIntensity: 0.14,
    transparent: true,
    opacity: 0.34,
    roughness: 0.12,
    metalness: 0.12,
  });

  // Pondasi batu kali keliling bangunan utama (24m x 18m + Sayap Timur +3m & Paviliun Barat -3.6m)
  const baseSouthL = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.36, 0.38), stonePlinthMat);
  baseSouthL.position.set(-9.9, 0.18, 8.56);
  const baseSouthR = new THREE.Mesh(new THREE.BoxGeometry(21.4, 0.36, 0.38), stonePlinthMat);
  baseSouthR.position.set(4.4, 0.18, 8.56);
  const baseNorth = new THREE.Mesh(new THREE.BoxGeometry(24.6, 0.36, 0.38), stonePlinthMat);
  baseNorth.position.set(0, 0.18, -9.56);
  const baseEastN = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 8.6), stonePlinthMat);
  baseEastN.position.set(12.06, 0.18, -5.25);
  const baseEastS = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 9.6), stonePlinthMat);
  baseEastS.position.set(15.06, 0.18, 3.75);
  group.add(baseSouthL, baseSouthR, baseNorth, baseEastN, baseEastS);

  // Dek beton atap berpasir kecokelatan & lapuk hujan sesuai foto udara Bandung
  const roofSandTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#9c8c6f';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 600; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(65,58,44,0.16)' : 'rgba(182,168,142,0.14)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 4 + Math.random() * 12);
      }
      ctx.strokeStyle = 'rgba(42,38,30,0.28)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 10; k++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * w, Math.random() * h);
        ctx.lineTo(Math.random() * w, Math.random() * h);
        ctx.stroke();
      }
    },
    3,
    2,
    maxAniso
  );
  const roofDeckMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: roofSandTex,
    roughness: 0.94,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const roofDeckMain = new THREE.Mesh(new THREE.PlaneGeometry(23.8, 17.8), roofDeckMat);
  roofDeckMain.rotation.x = -Math.PI / 2;
  roofDeckMain.position.set(0, 8.01, -0.5);
  roofDeckMain.receiveShadow = true;
  const roofDeckWing = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 9.4), roofDeckMat);
  roofDeckWing.rotation.x = -Math.PI / 2;
  roofDeckWing.position.set(13.5, 8.01, 3.75);
  roofDeckWing.receiveShadow = true;
  group.add(roofDeckMain, roofDeckWing);

  // Sabuk lis beton bertingkat mengelilingi fasad L-shape (blok utama + sayap timur)
  for (const cy of [3.95, 7.95]) {
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(24.7, 0.3, 18.7), trimMat);
    cornice.position.set(0, cy, -0.5);
    cornice.castShadow = true;
    const corniceWing = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.3, 10.1), trimMat);
    corniceWing.position.set(13.6, cy, 3.75);
    corniceWing.castShadow = true;
    group.add(cornice, corniceWing);

    const dripLip = new THREE.Mesh(new THREE.BoxGeometry(24.9, 0.1, 18.9), facadeMat);
    dripLip.position.set(0, cy + 0.17, -0.5);
    const dripWing = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.1, 10.3), facadeMat);
    dripWing.position.set(13.6, cy + 0.17, 3.75);
    group.add(dripLip, dripWing);
  }

  // Paviliun Servis Barat (sebelah kiri pintu masuk utama sesuai foto asli)
  const annexRoof = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.14, 7.2), shingleMat);
  annexRoof.position.set(-13.8, 3.55, 5.15);
  annexRoof.rotation.z = 0.14;
  annexRoof.castShadow = true;
  const annexDoor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.12), trimMat);
  annexDoor.position.set(-13.8, 1.1, 8.58);
  group.add(annexRoof, annexDoor);

  // Kanopi putih melengkung panjang di atas lantai dasar + tudung pintu masuk gelap bergelombang
  const groundCanopy = new THREE.Mesh(new THREE.BoxGeometry(21.2, 0.24, 1.45), trimMat);
  groundCanopy.position.set(4.5, 3.62, 9.15);
  groundCanopy.castShadow = true;
  group.add(groundCanopy);

  const groundCanopyLip = new THREE.Mesh(new THREE.BoxGeometry(21.3, 0.12, 0.18), facadeMat);
  groundCanopyLip.position.set(4.5, 3.55, 9.85);
  group.add(groundCanopyLip);

  const entryCanopy = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.16, 1.75), shingleMat);
  entryCanopy.position.set(-7.0, 3.68, 9.2);
  entryCanopy.rotation.x = 0.26;
  entryCanopy.castShadow = true;
  group.add(entryCanopy);

  for (const sx of [-8.35, -5.65]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.25), ironRailMat);
    bracket.position.set(sx, 3.35, 9.05);
    bracket.rotation.x = -0.55;
    group.add(bracket);

    const lanternHousing = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.32, 0.2), ironRailMat);
    lanternHousing.position.set(sx, 2.38, 8.72);
    group.add(lanternHousing);

    const lanternGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.2, 0.14),
      new THREE.MeshBasicMaterial({ color: 0xffd280 })
    );
    lanternGlow.position.set(sx, 2.36, 8.72);
    group.add(lanternGlow);
  }

  const entryStep = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 0.9), stonePlinthMat);
  entryStep.position.set(-7.0, 0.01, 8.98);
  group.add(entryStep);

  // Kerawang Roster Beton 1980-an di kiri pintu utama & dinding tangga barat
  const rosterMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createRosterBlockTexture(maxAniso),
    roughness: 0.85,
  });
  const frontRoster = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.35, 0.12), rosterMat);
  frontRoster.position.set(-10.1, 2.15, 8.62);
  group.add(frontRoster);

  const westRoster = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 3.4), rosterMat);
  westRoster.position.set(-12.14, 5.85, -4.8);
  group.add(westRoster);

  // 4 Balkon Lengkung Putih Ikonik di sisi Selatan (Z = 8.52) bertingkat Lt.2 & Rooftop (sesuai foto udara)
  const balconyXs = [-7.8, -1.8, 4.2, 10.2];
  for (const bx of balconyXs) {
    if (bx < -5) {
      const upperCol = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 4.0, 14), facadeMat);
      upperCol.position.set(bx, 6.0, 8.75);
      upperCol.castShadow = true;
      group.add(upperCol);

      for (const px of [-8.25, -5.75]) {
        const pilaster = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.95, 12), facadeMat);
        pilaster.position.set(px, 1.975, 8.75);
        pilaster.castShadow = true;
        group.add(pilaster);
        const pBase = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.28, 12), stonePlinthMat);
        pBase.position.set(px, 0.14, 8.75);
        group.add(pBase);
      }
    } else {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 8.0, 14), facadeMat);
      col.position.set(bx, 4.0, 8.75);
      col.castShadow = true;
      group.add(col);
      const cBase = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.3, 12), stonePlinthMat);
      cBase.position.set(bx, 0.15, 8.75);
      group.add(cBase);
    }

    for (const by of [3.95, 7.95]) {
      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(1.95, 1.65, 1.05, 22, 1, false, -Math.PI * 0.5, Math.PI),
        facadeMat
      );
      bowl.position.set(bx, by + 0.35, 8.52);
      bowl.castShadow = true;
      bowl.receiveShadow = true;
      group.add(bowl);

      const soffit = new THREE.Mesh(
        new THREE.CylinderGeometry(1.65, 0.62, 0.38, 22, 1, false, -Math.PI * 0.5, Math.PI),
        trimMat
      );
      soffit.position.set(bx, by - 0.35, 8.52);
      group.add(soffit);

      const deck = new THREE.Mesh(
        new THREE.CylinderGeometry(1.75, 1.75, 0.08, 18, 1, false, -Math.PI * 0.5, Math.PI),
        balconyDeckMat
      );
      deck.position.set(bx, by + 0.12, 8.52);
      group.add(deck);

      for (const ry of [by - 0.05, by + 0.38, by + 0.82]) {
        const rib = new THREE.Mesh(
          new THREE.CylinderGeometry(2.05, 2.05, 0.12, 22, 1, false, -Math.PI * 0.5, Math.PI),
          trimMat
        );
        rib.position.set(bx, ry, 8.52);
        group.add(rib);
      }

      if (by > 7) {
        const railArc = new THREE.Mesh(
          new THREE.TorusGeometry(1.92, 0.032, 6, 20, Math.PI),
          ironRailMat
        );
        railArc.rotation.x = Math.PI / 2;
        railArc.position.set(bx, by + 1.15, 8.52);
        group.add(railArc);
      }
    }
  }

  // Balkon melengkung di Sayap Timur (X=15.02, Z=1.8 & 6.2) dan Sisi Barat (X=-12.02, Z=-4.5)
  const wingBalconies: { x: number; z: number; startAng: number }[] = [
    { x: 15.02, z: 1.8, startAng: 0 },
    { x: 15.02, z: 6.2, startAng: 0 },
    { x: -12.02, z: -4.5, startAng: Math.PI },
  ];
  for (const wb of wingBalconies) {
    for (const by of [3.95, 7.95]) {
      const sideBowl = new THREE.Mesh(
        new THREE.CylinderGeometry(1.55, 1.32, 0.98, 18, 1, false, wb.startAng, Math.PI),
        facadeMat
      );
      sideBowl.position.set(wb.x, by + 0.35, wb.z);
      sideBowl.castShadow = true;
      const sideSoffit = new THREE.Mesh(
        new THREE.CylinderGeometry(1.32, 0.48, 0.34, 18, 1, false, wb.startAng, Math.PI),
        trimMat
      );
      sideSoffit.position.set(wb.x, by - 0.28, wb.z);
      const sideRib = new THREE.Mesh(
        new THREE.CylinderGeometry(1.65, 1.65, 0.11, 18, 1, false, wb.startAng, Math.PI),
        trimMat
      );
      sideRib.position.set(wb.x, by + 0.42, wb.z);
      group.add(sideBowl, sideSoffit, sideRib);
    }
  }

  // Jendela strip sisi Timur & Barat Lantai 2
  for (const [sideX, sideZ] of [[-12.14, 3.6], [15.14, 3.6]]) {
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.45, 5.2), windowMat);
    sideGlass.position.set(sideX, 6.05, sideZ);
    group.add(sideGlass);
    for (let mz = sideZ - 2.4; mz <= sideZ + 2.4; mz += 1.2) {
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.52, 0.08), darkMullion);
      mull.position.set(sideX, 6.05, mz);
      group.add(mull);
    }
  }

  // Strip Jendela Kaca Panjang Lantai 2 di Selatan (Z = 8.62)
  const stripSegments = [
    { x: 4.4, z: 8.62, w: 13.6, h: 1.55 },
    { x: -7.5, z: 8.62, w: 6.4, h: 1.55 },
  ];
  for (const seg of stripSegments) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(seg.w, seg.h, 0.1), windowMat);
    glass.position.set(seg.x, 6.05, seg.z);
    group.add(glass);

    for (const sy of [6.05 - seg.h * 0.5 - 0.05, 6.05 + seg.h * 0.5 + 0.05]) {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(seg.w + 0.16, 0.1, 0.22), trimMat);
      sill.position.set(seg.x, sy, seg.z + 0.03);
      group.add(sill);
    }

    const steps = Math.floor(seg.w / 1.5);
    for (let i = 0; i <= steps; i++) {
      const mx = seg.x - seg.w * 0.5 + (i / steps) * seg.w;
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.08, seg.h + 0.08, 0.14), darkMullion);
      mullion.position.set(mx, 6.05, seg.z);
      group.add(mullion);
    }
  }

  // Jendela kaca lantai dasar lebar menghadap kolam renang & teras (Z = 8.62)
  const groundWin = new THREE.Mesh(new THREE.BoxGeometry(16.2, 2.25, 0.08), clearGlassMat);
  groundWin.position.set(4.8, 1.95, 8.62);
  group.add(groundWin);
  for (const gy of [0.8, 3.1]) {
    const gFrame = new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.1, 0.18), darkMullion);
    gFrame.position.set(4.8, gy, 8.62);
    group.add(gFrame);
  }
  for (let wx = -3.2; wx <= 12.8; wx += 1.6) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.35, 0.14), darkMullion);
    mullion.position.set(wx, 1.95, 8.62);
    group.add(mullion);
  }

  // Lukisan siluet kelautan di balik kaca ruang depan (tampak persis di detikcom foto asli!)
  const muralTex = createMarineMuralTexture(maxAniso);
  const reliefFrame = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 1.45, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: muralTex,
      roughness: 0.68,
    })
  );
  reliefFrame.position.set(1.4, 2.08, 8.34);
  group.add(reliefFrame);

  // Pilaster Art-Deco beralur vertikal, talang air ber-klem, & balustrade berujung bola batu
  for (const px of [-11.8, -5.0, 1.2, 7.2, 13.6]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.32, 7.7, 0.24), trimMat);
    pil.position.set(px, 4.0, px > 12 ? 8.56 : 8.54);
    pil.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.34), trimMat);
    cap.position.set(px, 7.82, px > 12 ? 8.58 : 8.56);
    group.add(pil, cap);
  }

  for (const [dx, dz] of [[-12.16, 8.4], [15.16, 8.4], [12.16, -9.4], [-12.16, -9.4]]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 7.8, 8), darkMullion);
    pipe.position.set(dx, 3.9, dz);
    group.add(pipe);
    for (const cy of [1.8, 4.0, 6.4]) {
      const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 8), ironRailMat);
      clamp.position.set(dx, cy, dz);
      group.add(clamp);
    }
  }

  // Pelataran batu alam depan pintu masuk & topi beton pelindung jendela lantai 2
  const porchApron = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.08, 2.6), stonePlinthMat);
  porchApron.position.set(-7.0, -0.02, 9.8);
  porchApron.receiveShadow = true;
  const frontUpperHood = new THREE.Mesh(new THREE.BoxGeometry(20.6, 0.14, 0.58), trimMat);
  frontUpperHood.position.set(0.6, 6.96, 8.82);
  frontUpperHood.castShadow = true;
  group.add(porchApron, frontUpperHood);

  // Unit kondensor AC & panel sekring berkarat di dinding Paviliun Servis Barat
  const westAc = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.58, 0.78), trimMat);
  westAc.position.set(-15.78, 2.2, 4.2);
  const westAcFan = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), ironRailMat);
  westAcFan.rotation.z = Math.PI / 2;
  westAcFan.position.set(-15.96, 2.2, 4.2);
  const breakerBox = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.34), darkMullion);
  breakerBox.position.set(-15.72, 1.55, 6.8);
  group.add(westAc, westAcFan, breakerBox);

  // Tiang vertikal pagar besi lengkung & ornamen bola batu balkon rooftop
  for (const bx of balconyXs) {
    for (let i = 1; i <= 7; i++) {
      const ang = (i / 8) * Math.PI;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.36, 6), ironRailMat);
      post.position.set(bx + Math.cos(ang) * 1.92, 8.92, 8.52 + Math.sin(ang) * 1.92);
      group.add(post);
    }
    for (const side of [-1, 1]) {
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), trimMat);
      finial.position.set(bx + side * 1.92, 9.15, 8.56);
      group.add(finial);
    }
  }

  return { group, facadeMat, trimMat, windowMat };
}

/**
 * Detail Interior Rumah Gurita (Lantai 1 & Lantai 2) disesuaikan dengan ukuran baru 24m x 18m.
 */
export function createRumahGuritaInteriorDetails(maxAniso = 4): THREE.Group {
  const g = new THREE.Group();
  const trimWood = new THREE.MeshStandardMaterial({ color: 0x2c1b12, roughness: 0.82 });
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x3b281c, roughness: 0.86 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a54e, roughness: 0.28, metalness: 0.82 });
  const shadeMat = new THREE.MeshStandardMaterial({
    color: 0x5c5141,
    emissive: new THREE.Color(0xa66b28),
    emissiveIntensity: 0.18,
    roughness: 0.45,
  });

  const addStairHandrail = (
    xLeft: number,
    xRight: number,
    zStart: number,
    zEnd: number,
    yStart: number,
    yEnd: number
  ) => {
    const dz = zEnd - zStart;
    const dy = yEnd - yStart;
    const len = Math.hypot(dz, dy);
    const pitch = Math.atan2(dy, Math.abs(dz));
    for (const rx of [xLeft + 0.08, xRight - 0.08]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, len), trimWood);
      rail.position.set(rx, (yStart + yEnd) * 0.5 + 0.92, (zStart + zEnd) * 0.5);
      rail.rotation.x = pitch;
      g.add(rail);

      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.92, 0.055), trimWood);
        post.position.set(
          rx,
          yStart + (yEnd - yStart) * t + 0.46,
          zStart + (zEnd - zStart) * t
        );
        g.add(post);
      }
    }
  };
  addStairHandrail(-1.65, 1.55, -2.0, -7.6, 0.0, 4.0);
  addStairHandrail(1.85, 4.75, -2.0, -6.8, 4.0, 8.0);

  for (const baseY of [0, 4.0]) {
    const northTrim = new THREE.Mesh(new THREE.BoxGeometry(23.6, 0.16, 0.06), trimWood);
    northTrim.position.set(0, baseY + 0.08, -9.33);
    const eastTrim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 17.6), trimWood);
    eastTrim.position.set(11.83, baseY + 0.08, -0.5);
    g.add(northTrim, eastTrim);

    for (const bx of [-7.2, 0.0, 7.2]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 17.6), beamMat);
      beam.position.set(bx, baseY + 3.78, -0.5);
      g.add(beam);
    }
  }

  const rugTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#4a201b';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#c4964e';
      ctx.lineWidth = 10;
      ctx.strokeRect(14, 14, w - 28, h - 28);
      ctx.strokeStyle = '#24453a';
      ctx.lineWidth = 5;
      ctx.strokeRect(28, 28, w - 56, h - 56);
    },
    1,
    1,
    maxAniso,
    true,
    256,
    256
  );
  const rugMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: rugTex,
    roughness: 0.94,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const rugPlacements: [number, number, number, number, number][] = [
    [-7.2, 0.04, 2.6, 4.0, 3.0],
    [-7.2, 0.04, -6.2, 3.6, 2.8],
    [-7.2, 4.02, 1.2, 4.0, 3.4],
  ];
  for (const [rx, ry, rz, rw, rd] of rugPlacements) {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(rw, rd), rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(rx, ry, rz);
    g.add(rug);
  }

  const lampSpots: [number, number, number][] = [
    [-7.2, 3.85, 2.6],
    [1.0, 3.85, 5.5],
    [7.2, 3.85, -4.6],
    [-7.2, 7.85, 1.2],
    [9.8, 7.85, 4.0],
  ];
  for (const [lx, ly, lz] of lampSpots) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6), brassMat);
    rod.position.set(lx, ly - 0.275, lz);
    const bowl = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.16, 12), shadeMat);
    bowl.position.set(lx, ly - 0.58, lz);
    bowl.rotation.x = Math.PI;
    g.add(rod, bowl);
  }

  const paintingColors = [0x29444a, 0x5c3626, 0x263b2d];
  const paintings: [number, number, number, number][] = [
    [-11.82, 1.95, 4.2, Math.PI / 2],
    [-2.55, 1.95, -4.8, -Math.PI / 2],
    [-11.82, 5.95, 4.2, Math.PI / 2],
  ];
  paintings.forEach(([px, py, pz, ry], idx) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.82, 0.06), trimWood);
    frame.position.set(px, py, pz);
    frame.rotation.y = ry;
    const canvas = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.64, 0.07),
      new THREE.MeshStandardMaterial({ color: paintingColors[idx % paintingColors.length], roughness: 0.7 })
    );
    canvas.position.set(px, py, pz);
    canvas.rotation.y = ry;
    g.add(frame, canvas);
  });

  return g;
}

export function createPlaque666(maxAniso: number): THREE.Mesh {
  const tex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#1b1412';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#7a251c';
      ctx.lineWidth = 10;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.fillStyle = '#cc2c22';
      ctx.font = 'bold 98px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('666', w / 2, h / 2 - 14);
      ctx.fillStyle = '#9aa39d';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('SUKAJADI · BANDUNG', w / 2, h - 38);
    },
    1,
    1,
    maxAniso
  );
  return new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.85, 0.08),
    new THREE.MeshStandardMaterial({
      map: tex,
      emissive: new THREE.Color(0x52120d),
      emissiveIntensity: 0.7,
      roughness: 0.5,
      metalness: 0.35,
    })
  );
}

/**
 * Daun Gerbang Besi Tempa Berornamen Art-Deco 1980-an (khusus `door_gerbang_utama`).
 * Mempertahankan pivot engsel di (hingePos) dan lockPlateMat agar animasi buka/tutup & collider 100% sinkron.
 */
function createOrnateIronGateDoor(door: DoorData): {
  pivot: THREE.Group;
  frameGroup: THREE.Group;
  lockPlateMat: THREE.MeshStandardMaterial;
} {
  const frameGroup = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.set(door.hingePos.x, door.hingePos.y, door.hingePos.z);
  pivot.rotation.y = door.currentAngle;

  const wroughtIronTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#1d2224';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 650; i++) {
        ctx.fillStyle = i % 5 === 0 ? 'rgba(96, 46, 26, 0.22)' : 'rgba(54, 62, 66, 0.25)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 3 + Math.random() * 14);
      }
    },
    2,
    2,
    4
  );

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x202528,
    map: wroughtIronTex,
    bumpMap: wroughtIronTex,
    bumpScale: 0.015,
    roughness: 0.42,
    metalness: 0.86,
  });
  const agedBrassMat = new THREE.MeshStandardMaterial({
    color: 0xc99c4a,
    roughness: 0.34,
    metalness: 0.82,
  });
  const lockPlateMat = new THREE.MeshStandardMaterial({
    color: door.lockedKeyId ? 0xb53429 : 0x6b8f74,
    emissive: new THREE.Color(door.lockedKeyId ? 0x7a1c14 : 0x16291c),
    emissiveIntensity: door.lockedKeyId ? 0.9 : 0.35,
    roughness: 0.4,
  });

  const W = door.width;
  const H = door.height; // 2.0m dasar frame, mahkota lengkung naik hingga ~2.38m
  const archRise = 0.36;

  // 1. Tiang bingkai kiri & kanan + rel bawah & tengah + pelat tendang (kickplate) berornamen
  const leftStile = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 0.08), ironMat);
  leftStile.position.set(0.04, H * 0.5, 0);
  leftStile.castShadow = true;
  const rightStile = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 0.08), ironMat);
  rightStile.position.set(W - 0.04, H * 0.5, 0);
  rightStile.castShadow = true;
  pivot.add(leftStile, rightStile);

  // Engsel silinder berat menempel di pilar gerbang
  for (const hy of [0.35, 1.05, 1.75]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.14, 10), ironMat);
    barrel.position.set(0, hy, 0);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.06), ironMat);
    strap.position.set(0.12, hy, 0);
    pivot.add(barrel, strap);
  }

  // Pelat tendang bawah baja berbingkai paku keling
  const kickPlate = new THREE.Mesh(new THREE.BoxGeometry(W - 0.08, 0.44, 0.036), ironMat);
  kickPlate.position.set(W * 0.5, 0.26, 0);
  kickPlate.castShadow = true;
  pivot.add(kickPlate);

  for (const ry of [0.06, 0.48, 1.18, 1.88]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(W, 0.055, 0.072), ironMat);
    rail.position.set(W * 0.5, ry, 0);
    rail.castShadow = true;
    pivot.add(rail);
  }

  // Ornamen paku keling kuningan pada kickplate & garis bingkai dalam
  for (let rx = 0.22; rx <= W - 0.22; rx += 0.34) {
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), agedBrassMat);
    rivet.position.set(rx, 0.26, 0.024);
    const rivetBack = rivet.clone();
    rivetBack.position.z = -0.024;
    pivot.add(rivet, rivetBack);
  }

  // 2. Rel atas melengkung (swept wrought-iron arch crown)
  const archCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.04, H - 0.06, 0),
    new THREE.Vector3(W * 0.25, H + archRise * 0.62, 0),
    new THREE.Vector3(W * 0.5, H + archRise, 0),
    new THREE.Vector3(W * 0.75, H + archRise * 0.62, 0),
    new THREE.Vector3(W - 0.04, H - 0.06, 0),
  ]);
  const archBeam = new THREE.Mesh(new THREE.TubeGeometry(archCurve, 24, 0.034, 8, false), ironMat);
  archBeam.castShadow = true;
  pivot.add(archBeam);

  // Profil ujung tombak tempa (LatheGeometry halus, bukan kerucut 4 sisi generik)
  const spearProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.024, 0.02),
    new THREE.Vector2(0.016, 0.045),
    new THREE.Vector2(0.042, 0.085),
    new THREE.Vector2(0.028, 0.13),
    new THREE.Vector2(0.008, 0.19),
    new THREE.Vector2(0.0, 0.22),
  ];
  const spearGeo = new THREE.LatheGeometry(spearProfile, 10);

  // 3. Jeruji besi vertikal + ujung tombak mengikuti kurva lengkung + cincin roset tengah
  const barCount = 11;
  for (let i = 1; i < barCount; i++) {
    const u = i / barCount;
    const bx = u * W;
    const archH = H - 0.06 + Math.sin(u * Math.PI) * (archRise + 0.06);
    const picket = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, archH - 0.48, 8), ironMat);
    picket.position.set(bx, 0.48 + (archH - 0.48) * 0.5, 0);
    picket.castShadow = true;
    pivot.add(picket);

    const spear = new THREE.Mesh(spearGeo, i === 5 || i === 6 ? agedBrassMat : ironMat);
    spear.position.set(bx, archH + 0.01, 0);
    pivot.add(spear);

    if (i % 2 === 1 && i < barCount - 1) {
      const nextBx = ((i + 1) / barCount) * W;
      const midX = (bx + nextBx) * 0.5;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 7, 16), ironMat);
      ring.position.set(midX, 1.54, 0);
      const ringLow = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.013, 7, 16), ironMat);
      ringLow.position.set(midX, 0.84, 0);
      pivot.add(ring, ringLow);
    }
  }

  // 4. Filigree S-scroll tempa di bawah lengkung mahkota gerbang
  for (const side of [-1, 1]) {
    const scrollCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(W * 0.5 + side * 0.18, 1.88, 0),
      new THREE.Vector3(W * 0.5 + side * 0.46, 2.02, 0),
      new THREE.Vector3(W * 0.5 + side * 0.72, 1.92, 0),
      new THREE.Vector3(W * 0.5 + side * 0.96, 1.98, 0),
    ]);
    const scrollMesh = new THREE.Mesh(new THREE.TubeGeometry(scrollCurve, 14, 0.014, 6, false), ironMat);
    pivot.add(scrollMesh);
  }

  // 5. Medallion tengah & mekanisme slot kunci/gembok
  const crestRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.024, 8, 20), agedBrassMat);
  crestRing.position.set(W * 0.5, 1.54, 0);
  const crestInner = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.032, 16), ironMat);
  crestInner.rotation.x = Math.PI / 2;
  crestInner.position.set(W * 0.5, 1.54, 0);
  pivot.add(crestRing, crestInner);

  const latchHousing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.09), ironMat);
  latchHousing.position.set(W - 0.16, 1.18, 0);
  const latchHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), agedBrassMat);
  latchHandle.rotation.z = Math.PI / 2;
  latchHandle.position.set(W - 0.18, 1.18, 0.065);
  const lockIndicator = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.02), lockPlateMat);
  lockIndicator.position.set(W - 0.16, 1.08, 0.05);
  pivot.add(latchHousing, latchHandle, lockIndicator);

  return { pivot, frameGroup, lockPlateMat };
}

function createGarageIronGateDoor(door: DoorData): {
  pivot: THREE.Group;
  frameGroup: THREE.Group;
  lockPlateMat: THREE.MeshStandardMaterial;
} {
  const frameGroup = new THREE.Group();
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1b2124, roughness: 0.42, metalness: 0.82 });
  const meshPanelMat = new THREE.MeshStandardMaterial({ color: 0x242c30, roughness: 0.52, metalness: 0.72 });
  const hazardMat = new THREE.MeshStandardMaterial({ color: 0xb88628, roughness: 0.55 });
  const lockPlateMat = new THREE.MeshStandardMaterial({
    color: 0x6b8f74,
    emissive: new THREE.Color(0x16291c),
    emissiveIntensity: 0.35,
    roughness: 0.4,
  });

  // Rel besi bawah di aspal untuk keluar masuk mobil
  const track = new THREE.Mesh(new THREE.BoxGeometry(door.width + 0.35, 0.03, 0.14), ironMat);
  track.position.set(door.hingePos.x + door.width * 0.5, 0.015, door.hingePos.z);
  frameGroup.add(track);

  const pivot = new THREE.Group();
  pivot.position.set(door.hingePos.x, door.hingePos.y, door.hingePos.z);
  pivot.rotation.y = door.currentAngle;

  const W = door.width;
  const H = door.height;

  // Rangka baja utama gerbang garasi (X = 0..W) + balok silang diagonal
  for (const fx of [0.05, W * 0.5, W - 0.05]) {
    const stile = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 0.09), ironMat);
    stile.position.set(fx, H * 0.5, 0);
    stile.castShadow = true;
    pivot.add(stile);
  }
  for (const ry of [0.12, 0.92, H - 0.08]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(W, 0.07, 0.09), ironMat);
    rail.position.set(W * 0.5, ry, 0);
    rail.castShadow = true;
    pivot.add(rail);
  }

  // Pelat bawah solid & garis kuning-hitam aman mobil
  const kickPlate = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.72, 0.035), meshPanelMat);
  kickPlate.position.set(W * 0.5, 0.5, 0);
  const hazardStrip = new THREE.Mesh(new THREE.BoxGeometry(W - 0.14, 0.08, 0.045), hazardMat);
  hazardStrip.position.set(W * 0.5, 0.22, 0);
  pivot.add(kickPlate, hazardStrip);

  // Kisi-kisi vertikal bagian atas
  const barGeo = new THREE.CylinderGeometry(0.016, 0.016, H - 1.0, 6);
  const count = 14;
  for (let i = 1; i < count; i++) {
    const bx = (i / count) * W;
    const bar = new THREE.Mesh(barGeo, ironMat);
    bar.position.set(bx, 0.92 + (H - 1.0) * 0.5, 0);
    bar.castShadow = true;
    pivot.add(bar);
  }

  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.08), lockPlateMat);
  latch.position.set(W - 0.14, 1.04, 0.04);
  pivot.add(latch);

  return { pivot, frameGroup, lockPlateMat };
}

/**
 * Pintu kayu 3D berengsel dengan bingkai, gagang kuningan, dan pelat kunci status.
 * Khusus `door_gerbang_utama` dan `door_gerbang_garasi`, merender gerbang besi tempa/garasi transparan.
 */
export function createDoorAssembly(door: DoorData): {
  pivot: THREE.Group;
  frameGroup: THREE.Group;
  lockPlateMat: THREE.MeshStandardMaterial;
} {
  if (door.id === 'door_gerbang_utama') {
    return createOrnateIronGateDoor(door);
  }
  if (door.id === 'door_gerbang_garasi') {
    return createGarageIronGateDoor(door);
  }

  const frameGroup = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x261a12, roughness: 0.84 });
  const leafMat = new THREE.MeshStandardMaterial({
    color: door.lockedKeyId ? 0x452820 : 0x4d3422,
    roughness: 0.76,
    metalness: 0.08,
  });
  const panelInsetMat = new THREE.MeshStandardMaterial({ color: 0x362216, roughness: 0.85 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd9a84e, roughness: 0.28, metalness: 0.82 });
  const lockPlateMat = new THREE.MeshStandardMaterial({
    color: door.lockedKeyId ? 0xb53429 : 0x6b8f74,
    emissive: new THREE.Color(door.lockedKeyId ? 0x7a1c14 : 0x16291c),
    emissiveIntensity: door.lockedKeyId ? 0.9 : 0.35,
    roughness: 0.4,
  });

  // Engsel pivot di door.hingePos
  const pivot = new THREE.Group();
  pivot.position.set(door.hingePos.x, door.hingePos.y, door.hingePos.z);
  pivot.rotation.y = door.currentAngle;

  // Daun pintu memanjang sepanjang +X lokal dari 0..door.width
  const leaf = new THREE.Mesh(
    new THREE.BoxGeometry(door.width, door.height, door.thickness),
    leafMat
  );
  leaf.position.set(door.width * 0.5, door.height * 0.5, 0);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  pivot.add(leaf);

  // Panel ukiran dekoratif depan & belakang
  for (const py of [door.height * 0.32, door.height * 0.72]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(door.width * 0.68, door.height * 0.28, door.thickness + 0.025),
      panelInsetMat
    );
    panel.position.set(door.width * 0.5, py, 0);
    pivot.add(panel);
  }

  // Gagang pintu kuningan di kedua sisi
  for (const sz of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), brassMat);
    knob.position.set(door.width - 0.16, 1.05, sz * (door.thickness * 0.5 + 0.055));
    pivot.add(knob);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.02), lockPlateMat);
    plate.position.set(door.width - 0.16, 1.02, sz * (door.thickness * 0.5 + 0.015));
    pivot.add(plate);
  }

  // Kusen tiang engsel tipis untuk penegasan arsitektur
  const postA = new THREE.Mesh(new THREE.BoxGeometry(0.1, door.height, 0.24), frameMat);
  postA.position.set(door.hingePos.x, door.hingePos.y + door.height * 0.5, door.hingePos.z);
  frameGroup.add(postA);

  return { pivot, frameGroup, lockPlateMat };
}

export function createStreetCart(kind: 'nasgor' | 'pecel', maxAniso: number): THREE.Group {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4b3322, roughness: 0.85 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a3034, roughness: 0.45, metalness: 0.7 });
  const roofColor = kind === 'nasgor' ? 0x2e4a5e : 0x733224;
  const canopyMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.75 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xb7d4dc,
    transparent: true,
    opacity: 0.4,
    roughness: 0.15,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.95, 0.95), woodMat);
  body.position.y = 0.72;
  body.castShadow = true;
  group.add(body);

  const showcase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.65, 0.8), glassMat);
  showcase.position.set(-0.25, 1.5, 0);
  group.add(showcase);

  for (const sx of [-0.88, 0.88]) {
    for (const sz of [-0.42, 0.42]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), darkMetal);
      post.position.set(sx, 1.75, sz);
      group.add(post);
    }
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.1, 1.2), canopyMat);
  roof.position.y = 2.35;
  roof.castShadow = true;
  group.add(roof);

  for (const sx of [-0.65, 0.65]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 16), darkMetal);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(sx, 0.32, 0.5);
    group.add(wheel);
  }

  const bannerTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = kind === 'nasgor' ? '#d9a441' : '#c95c38';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#1c1512';
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#181210';
      ctx.font = 'bold 46px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(kind === 'nasgor' ? 'NASI GORENG' : 'PECEL LELE', w / 2, h / 2 - 18);
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('SUKAJADI MALAM', w / 2, h / 2 + 28);
    },
    1,
    1,
    maxAniso,
    true,
    512,
    192
  );
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.55),
    new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide })
  );
  sign.position.set(0, 2.02, 0.58);
  group.add(sign);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd280 })
  );
  bulb.position.set(0.35, 2.2, 0.2);
  group.add(bulb);

  return group;
}

/**
 * Pos Ronda / Gardu Keamanan Komplek Sukajadi (atap genteng bertekstur, bilik bambu, bangku kayu, jadwal ronda, & kentongan).
 */
export function createPosRonda(maxAniso: number): THREE.Group {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x473020, roughness: 0.88 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x3b403c, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createGentengRoofTexture(0x733223, maxAniso),
    roughness: 0.82,
  });
  const bilikMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createBilikBambuTexture(maxAniso),
    roughness: 0.9,
  });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.22, 3.1), floorMat);
  plinth.position.y = 0.11;
  group.add(plinth);

  for (const sx of [-1.45, 1.45]) {
    for (const sz of [-1.25, 1.25]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.52, 0.15), woodMat);
      post.position.set(sx, 1.36, sz);
      post.castShadow = true;
      group.add(post);
    }
  }

  // Dinding setengah bilik bambu di belakang (-X) & sisi utara (-Z)
  const backBilik = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 2.9), bilikMat);
  backBilik.position.set(-1.45, 0.74, 0);
  const northBilik = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.05, 0.12), bilikMat);
  northBilik.position.set(0, 0.74, -1.25);
  group.add(backBilik, northBilik);

  // Bangku panjang & meja pojok dengan teko kopi
  const bench = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 2.4), woodMat);
  bench.position.set(-0.95, 0.55, 0);
  const backRest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 2.4), woodMat);
  backRest.position.set(-1.26, 0.82, 0);
  const cornerTable = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.58, 0.6), woodMat);
  cornerTable.position.set(0.85, 0.51, -0.82);
  const kettle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.11, 0.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x265947, roughness: 0.4, metalness: 0.3 })
  );
  kettle.position.set(0.85, 0.9, -0.82);
  group.add(bench, backRest, cornerTable, kettle);

  // Atap limas genteng + lisplang kayu + mahkota nok
  const eave = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.14, 3.3), woodMat);
  eave.position.y = 2.6;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.18, 4), roofMat);
  roof.position.y = 3.22;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.22, 6), roofMat);
  crown.position.y = 3.85;
  group.add(eave, roof, crown);

  // Kentongan bambu gantung + pemukul kayu
  const kentongan = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.085, 0.68, 8),
    new THREE.MeshStandardMaterial({ color: 0x9c7c49, roughness: 0.78 })
  );
  kentongan.position.set(1.42, 1.85, 0.95);
  const striker = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.35, 6), woodMat);
  striker.position.set(1.42, 1.68, 0.75);
  striker.rotation.x = 0.45;
  group.add(kentongan, striker);

  // Papan Jadwal Ronda Malam di dinding dalam
  const boardTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#18241d';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#cfa15a';
      ctx.lineWidth = 8;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#eef2ea';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('JADWAL RONDA RT 04', w / 2, 42);
      ctx.font = '20px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#c5d6c7';
      ctx.fillText('SEN-RAB: PAK UJANG & KANG DEDI', 24, 90);
      ctx.fillText('KAM-SAB: MANG ASEP & MAS BUDI', 24, 126);
      ctx.fillText('MINGGU : KERJA BAKTI WARGA', 24, 162);
    },
    1,
    1,
    maxAniso,
    true,
    512,
    192
  );
  const jadwalBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.62),
    new THREE.MeshBasicMaterial({ map: boardTex, side: THREE.DoubleSide })
  );
  jadwalBoard.position.set(-1.35, 1.75, -0.1);
  jadwalBoard.rotation.y = Math.PI / 2;
  group.add(jadwalBoard);

  // Papan POS RONDA RT 04 di luar
  const signTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#18241d';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#cfa15a';
      ctx.lineWidth = 10;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.fillStyle = '#ebe7dc';
      ctx.font = 'bold 46px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('POS RONDA', w / 2, h / 2 - 20);
      ctx.fillStyle = '#cfa15a';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('SUKAJADI RT 04', w / 2, h / 2 + 26);
    },
    1,
    1,
    maxAniso,
    true,
    512,
    192
  );
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.75, 0.52),
    new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
  );
  sign.position.set(1.48, 2.4, 0);
  sign.rotation.y = Math.PI / 2;
  group.add(sign);

  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd58a })
  );
  lamp.position.set(0, 2.48, 0);
  group.add(lamp);

  return group;
}

/**
 * Rumah Komplek Perumahan Khas Bandung / Sukajadi:
 * Atap genteng presisi ber-overstek plafon & lisplang mitered rapi (tanpa kayu menjulur berlebih),
 * fasad batu alam andesit, roster beton angin-angin, teras keramik lengkap kursi santai & lampu taman pagar.
 */
export function createNeighborhoodHouseRoofAndFacade(
  spec: NeighborhoodHouseSpec,
  maxAniso = 4
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(spec.x, 0, spec.z);
  group.rotation.y = spec.rotY;

  const style = spec.style ?? 'pelana';
  const isTwoStory = style === 'tingkat';
  const wallTopY = isTwoStory ? 5.6 : 3.5;
  // Di levelData.ts, spec.w selalu bentang X dunia dan spec.d selalu bentang Z dunia;
  // sesuaikan dimensi lokal agar presisi sejajar dengan dinding walaupun rotY = ±PI/2.
  const isRotated90 = Math.abs(Math.cos(spec.rotY)) < 0.5;
  const localW = isRotated90 ? spec.d : spec.w;
  const localD = isRotated90 ? spec.w : spec.d;

  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: style === 'seng' ? createCorrugatedZincTexture(maxAniso) : createGentengRoofTexture(spec.roofColor, maxAniso),
    roughness: style === 'seng' ? 0.62 : 0.82,
    metalness: style === 'seng' ? 0.32 : 0.04,
  });
  const ridgeMat = new THREE.MeshStandardMaterial({ color: spec.roofColor, roughness: 0.76 });
  const stuccoMat = new THREE.MeshStandardMaterial({ color: spec.wallColor, roughness: 0.88 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x3b423d, roughness: 0.78 });
  const soffitMat = new THREE.MeshStandardMaterial({ color: 0xd8d5ca, roughness: 0.86 });
  const woodFrameMat = new THREE.MeshStandardMaterial({ color: 0x4b3120, roughness: 0.76 });
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createBatuAlamTexture(maxAniso),
    roughness: 0.88,
  });
  const terasMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createWarungTileTexture(maxAniso, '#bfb7a5', '#a89f8d'),
    roughness: 0.68,
  });
  const rosterMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createRosterBlockTexture(maxAniso),
    roughness: 0.85,
  });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e2426, roughness: 0.4, metalness: 0.76 });
  const planterLeafMat = new THREE.MeshStandardMaterial({ color: 0x2a532d, roughness: 0.84, flatShading: true });
  const warmWinMat = new THREE.MeshStandardMaterial({
    color: 0xffd796,
    emissive: new THREE.Color(0xc98836),
    emissiveIntensity: 0.42,
    roughness: 0.28,
  });

  // 1. Pondasi batu alam & ban-banan beton khas Bandung mengelilingi badan rumah
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(localW + 0.16, 0.34, localD + 0.16), plinthMat);
  plinth.position.y = 0.17;
  group.add(plinth);

  const midBand = new THREE.Mesh(new THREE.BoxGeometry(localW + 0.1, 0.08, localD + 0.1), trimMat);
  midBand.position.y = 3.44;
  group.add(midBand);

  // Jika tipe 'tingkat', lantai 2 berada tepat di separuh belakang (depth 0.72 * localD) dengan atap menyelimuti tepat massa lantai 2 + dak balkon beton di depan.
  const upperD = isTwoStory ? localD * 0.72 : localD;
  const upperW = isTwoStory ? localW - 0.08 : localW;
  const upperOffsetZ = isTwoStory ? -localD * 0.14 : 0;

  if (isTwoStory) {
    const upperBody = new THREE.Mesh(new THREE.BoxGeometry(upperW, 2.1, upperD), stuccoMat);
    upperBody.position.set(0, 4.55, upperOffsetZ);
    upperBody.castShadow = true;
    upperBody.receiveShadow = true;
    group.add(upperBody);

    // Dak beton lantai 2 + lis profil Bandung
    const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(localW + 0.2, 0.18, localD + 0.2), trimMat);
    upperDeck.position.y = 3.52;
    group.add(upperDeck);

    // Balkon lantai 2 dengan tembok batu alam rendah + railing besi hollow minimalis Bandung
    const frontEdgeZ = localD * 0.5 - 0.06;
    const upperParapet = new THREE.Mesh(new THREE.BoxGeometry(localW * 0.92, 0.34, 0.14), plinthMat);
    upperParapet.position.set(0, 3.76, frontEdgeZ);
    const upperRailTop = new THREE.Mesh(new THREE.BoxGeometry(localW * 0.94, 0.05, 0.08), ironMat);
    upperRailTop.position.set(0, 4.42, frontEdgeZ);
    const upperRailMid = new THREE.Mesh(new THREE.BoxGeometry(localW * 0.94, 0.035, 0.05), ironMat);
    upperRailMid.position.set(0, 4.16, frontEdgeZ);
    group.add(upperParapet, upperRailTop, upperRailMid);
    const balSpan = localW * 0.88;
    const balCount = Math.max(6, Math.floor(balSpan / 0.45));
    for (let b = 0; b <= balCount; b++) {
      const bx = -balSpan * 0.5 + (b / balCount) * balSpan;
      const bal = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), ironMat);
      bal.position.set(bx, 4.17, frontEdgeZ);
      group.add(bal);
    }

    const upperWin = new THREE.Mesh(new THREE.BoxGeometry(upperW * 0.48, 1.04, 0.08), warmWinMat);
    upperWin.position.set(0, 4.72, upperOffsetZ + upperD * 0.5 + 0.03);
    const upperWinFrame = new THREE.Mesh(new THREE.BoxGeometry(upperW * 0.52, 1.12, 0.06), woodFrameMat);
    upperWinFrame.position.set(0, 4.72, upperOffsetZ + upperD * 0.5 + 0.01);
    const upperWinHood = new THREE.Mesh(new THREE.BoxGeometry(upperW * 0.56, 0.09, 0.32), trimMat);
    upperWinHood.position.set(0, 5.3, upperOffsetZ + upperD * 0.5 + 0.15);
    group.add(upperWinFrame, upperWin, upperWinHood);
  }

  // 2. Atap Presisi Bandung: plafon overstek putih + lisplang mitered flush (tanpa ujung kayu mencuat)
  const over = 0.34;
  const rw = upperW + over * 2;
  const rd = upperD + over * 2;
  const roofCenterZ = upperOffsetZ;

  // Plafon overstek & kaso pendek tepat di bawah bibir atap
  const soffit = new THREE.Mesh(new THREE.BoxGeometry(rw - 0.04, 0.05, rd - 0.04), soffitMat);
  soffit.position.set(0, wallTopY + 0.025, roofCenterZ);
  group.add(soffit);

  if (style === 'seng') {
    // Atap seng miring tunggal Bandung: rendah di depan (+Z), tinggi di belakang (-Z)
    const riseH = 1.02;
    const slopeLen = Math.hypot(rd, riseH);
    const pitch = Math.atan2(riseH, rd);
    const slope = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.08, slopeLen), roofMat);
    slope.position.set(0, wallTopY + riseH * 0.5 + 0.06, roofCenterZ);
    slope.rotation.x = pitch;
    slope.castShadow = true;
    slope.receiveShadow = true;
    group.add(slope);

    // Dinding sopi-sopi belakang & segitiga samping tepat menghadap tinggi di -Z
    const rearRiser = new THREE.Mesh(new THREE.BoxGeometry(upperW, riseH * 0.92, 0.2), stuccoMat);
    rearRiser.position.set(0, wallTopY + riseH * 0.46, roofCenterZ - upperD * 0.5 + 0.1);
    group.add(rearRiser);

    // rotateY(PI/2) memetakan shapeX -> -Z sehingga +upperD*0.5 di shapeX tepat berada di belakang (-Z)
    const triShape = new THREE.Shape();
    triShape.moveTo(-upperD * 0.5, 0);
    triShape.lineTo(upperD * 0.5, 0);
    triShape.lineTo(upperD * 0.5, riseH * 0.92);
    triShape.closePath();
    const wedgeGeo = new THREE.ExtrudeGeometry(triShape, { depth: 0.2, bevelEnabled: false });
    wedgeGeo.rotateY(Math.PI / 2);
    for (const sx of [-upperW * 0.5, upperW * 0.5 - 0.2]) {
      const wedge = new THREE.Mesh(wedgeGeo, stuccoMat);
      wedge.position.set(sx, wallTopY, roofCenterZ);
      group.add(wedge);
    }

    // Lisplang samping miring terpotong rata presisi
    const sideFasciaShape = new THREE.Shape();
    sideFasciaShape.moveTo(-rd * 0.5, 0.08);
    sideFasciaShape.lineTo(rd * 0.5, riseH + 0.08);
    sideFasciaShape.lineTo(rd * 0.5, riseH - 0.06);
    sideFasciaShape.lineTo(-rd * 0.5, -0.06);
    sideFasciaShape.closePath();
    const sideFasciaGeo = new THREE.ExtrudeGeometry(sideFasciaShape, { depth: 0.05, bevelEnabled: false });
    sideFasciaGeo.rotateY(Math.PI / 2);
    for (const sx of [-rw * 0.5, rw * 0.5 - 0.05]) {
      const sf = new THREE.Mesh(sideFasciaGeo, woodFrameMat);
      sf.position.set(sx, wallTopY, roofCenterZ);
      group.add(sf);
    }

    const fasciaFront = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.14, 0.05), woodFrameMat);
    fasciaFront.position.set(0, wallTopY + 0.02, roofCenterZ + rd * 0.5 - 0.025);
    const fasciaBack = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.14, 0.05), woodFrameMat);
    fasciaBack.position.set(0, wallTopY + riseH + 0.01, roofCenterZ - rd * 0.5 + 0.025);
    group.add(fasciaFront, fasciaBack);
  } else if (style === 'limasan') {
    // Atap Limasan Bandung (4 bidang miring rapi + lisplang bingkai sekeliling tepat sejajar tepi)
    const ridgeH = 1.92;
    const ridgeW = Math.max(1.8, rw * 0.46);
    const hx = rw * 0.5;
    const hz = rd * 0.5;
    const rx = ridgeW * 0.5;
    const baseY = wallTopY + 0.06;
    const topY = baseY + ridgeH;

    for (const sz of [-hz + 0.025, hz - 0.025]) {
      const trimFB = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.13, 0.05), woodFrameMat);
      trimFB.position.set(0, wallTopY + 0.02, roofCenterZ + sz);
      group.add(trimFB);
    }
    for (const sx of [-hx + 0.025, hx - 0.025]) {
      const trimLR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, rd - 0.04), woodFrameMat);
      trimLR.position.set(sx, wallTopY + 0.02, roofCenterZ);
      group.add(trimLR);
    }

    const verts = new Float32Array([
      -hx, baseY, roofCenterZ - hz, // 0: NW
      hx, baseY, roofCenterZ - hz,  // 1: NE
      hx, baseY, roofCenterZ + hz,  // 2: SE
      -hx, baseY, roofCenterZ + hz, // 3: SW
      -rx, topY, roofCenterZ,       // 4: Ridge W
      rx, topY, roofCenterZ,        // 5: Ridge E
    ]);
    const faces: { idx: number[]; sideAxis: 'x' | 'z' }[] = [
      { idx: [0, 4, 5, 0, 5, 1], sideAxis: 'x' },
      { idx: [2, 5, 4, 2, 4, 3], sideAxis: 'x' },
      { idx: [0, 3, 4], sideAxis: 'z' },
      { idx: [1, 5, 2], sideAxis: 'z' },
    ];
    const triPos: number[] = [];
    const triUv: number[] = [];
    for (const f of faces) {
      for (const vertIdx of f.idx) {
        const vi = vertIdx * 3;
        const vx = verts[vi];
        const vy = verts[vi + 1];
        const vz = verts[vi + 2];
        triPos.push(vx, vy, vz);
        const uCoord = f.sideAxis === 'x' ? (vx + hx) / rw : (vz - roofCenterZ + hz) / rd;
        const vCoord = (vy - baseY) / ridgeH;
        triUv.push(uCoord, vCoord);
      }
    }
    const limGeo = new THREE.BufferGeometry();
    limGeo.setAttribute('position', new THREE.Float32BufferAttribute(triPos, 3));
    limGeo.setAttribute('uv', new THREE.Float32BufferAttribute(triUv, 2));
    limGeo.computeVertexNormals();

    const limMesh = new THREE.Mesh(limGeo, roofMat);
    limMesh.castShadow = true;
    limMesh.receiveShadow = true;
    group.add(limMesh);

    const nokTop = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, ridgeW + 0.04, 8), ridgeMat);
    nokTop.rotation.z = Math.PI / 2;
    nokTop.position.set(0, topY + 0.04, roofCenterZ);
    group.add(nokTop);

    for (const [cx, cz] of [
      [-hx + 0.02, roofCenterZ - hz + 0.02],
      [hx - 0.02, roofCenterZ - hz + 0.02],
      [hx - 0.02, roofCenterZ + hz - 0.02],
      [-hx + 0.02, roofCenterZ + hz - 0.02],
    ]) {
      const rxTarget = cx < 0 ? -rx : rx;
      const p0 = new THREE.Vector3(cx, baseY + 0.02, cz);
      const p1 = new THREE.Vector3(rxTarget, topY + 0.02, roofCenterZ);
      const len = p0.distanceTo(p1);
      const hip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, len, 6), ridgeMat);
      hip.position.copy(p0).lerp(p1, 0.5);
      hip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
      group.add(hip);
    }
  } else {
    // Atap Pelana Presisi Bandung: panel kembar tanpa kayu menjulur + chevron lisplang terpotong siku rata
    const ridgeH = isTwoStory ? 1.62 : 1.88;
    const baseY = wallTopY + 0.06;
    const halfD = rd * 0.5;
    const slopeLen = Math.hypot(halfD, ridgeH);
    const slopeAng = Math.atan2(ridgeH, halfD);

    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.09, slopeLen), roofMat);
      panel.position.set(0, baseY + ridgeH * 0.5, roofCenterZ + side * halfD * 0.5);
      panel.rotation.x = side * slopeAng;
      panel.castShadow = true;
      panel.receiveShadow = true;
      group.add(panel);

      // Lisplang horizontal depan & belakang sejajar tepat ujung atap
      const eaveTrim = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.14, 0.05), woodFrameMat);
      eaveTrim.position.set(0, baseY - 0.04, roofCenterZ + side * (halfD - 0.025));
      group.add(eaveTrim);
    }

    // Dinding sopi-sopi segitiga plester tepat sejajar tepi luar bangunan
    const gableWallShape = new THREE.Shape();
    gableWallShape.moveTo(-upperD * 0.5, 0);
    gableWallShape.lineTo(0, ridgeH * 0.96);
    gableWallShape.lineTo(upperD * 0.5, 0);
    gableWallShape.closePath();
    const gableWallGeo = new THREE.ExtrudeGeometry(gableWallShape, { depth: 0.2, bevelEnabled: false });
    gableWallGeo.rotateY(Math.PI / 2);

    for (const sx of [-upperW * 0.5, upperW * 0.5 - 0.2]) {
      const gw = new THREE.Mesh(gableWallGeo, stuccoMat);
      gw.position.set(sx, baseY - 0.02, roofCenterZ);
      gw.castShadow = true;
      group.add(gw);
    }

    // Lisplang chevron miring satu kesatuan terpotong vertikal rapi di kanan-kiri atap (0 ujung kayu mencuat!)
    const bargeChevron = new THREE.Shape();
    bargeChevron.moveTo(-halfD, 0.04);
    bargeChevron.lineTo(0, ridgeH + 0.05);
    bargeChevron.lineTo(halfD, 0.04);
    bargeChevron.lineTo(halfD, -0.1);
    bargeChevron.lineTo(0, ridgeH - 0.1);
    bargeChevron.lineTo(-halfD, -0.1);
    bargeChevron.closePath();
    const bargeGeo = new THREE.ExtrudeGeometry(bargeChevron, { depth: 0.05, bevelEnabled: false });
    bargeGeo.rotateY(Math.PI / 2);

    for (const sx of [-rw * 0.5, rw * 0.5 - 0.05]) {
      const barge = new THREE.Mesh(bargeGeo, woodFrameMat);
      barge.position.set(sx, baseY, roofCenterZ);
      barge.castShadow = true;
      group.add(barge);
    }

    // Ventilasi jalusi ramping di dinding sopi-sopi
    for (const sx of [-upperW * 0.5 - 0.015, upperW * 0.5 + 0.015]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.56), woodFrameMat);
      vent.position.set(sx, baseY + ridgeH * 0.42, roofCenterZ);
      group.add(vent);
    }

    // Genteng karpus di puncak atap berhenti tepat di batas rw
    const nok = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, rw + 0.02, 8), ridgeMat);
    nok.rotation.z = Math.PI / 2;
    nok.position.set(0, baseY + ridgeH + 0.05, roofCenterZ);
    group.add(nok);
  }

  // Ban-banan dasar batu alam di dinding muka + box meteran PLN & talang air menempel rapat
  const frontSkirt = new THREE.Mesh(new THREE.BoxGeometry(localW + 0.08, 0.68, 0.09), plinthMat);
  frontSkirt.position.set(0, 0.34, localD * 0.5 + 0.12);
  const plnBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 0.1), trimMat);
  plnBox.position.set(-localW * 0.42, 1.65, localD * 0.5 + 0.16);
  group.add(frontSkirt, plnBox);

  // Tiang antena TV alumni Bandung klasik di sisi belakang atas (proporsional rapi)
  if (spec.id.endsWith('1') || spec.id.endsWith('3')) {
    const antZ = roofCenterZ - upperD * 0.38;
    const antY = wallTopY + (style === 'seng' ? 1.1 : 1.72);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 1.65, 6), ironMat);
    pole.position.set(upperW * 0.32, wallTopY + 0.9, antZ);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.022, 0.022), ironMat);
    cross.position.set(upperW * 0.32, antY + 0.36, antZ);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.022, 0.022), ironMat);
    cross2.position.set(upperW * 0.32, antY + 0.2, antZ);
    group.add(pole, cross, cross2);
  }

  // Toren air biru/oranye di atas dak beton kecil belakang
  if (spec.id.includes('row') || spec.id.includes('back')) {
    const tankColor = spec.id.endsWith('2') ? 0xc45e28 : 0x1e5c8c;
    const dakX = -upperW * 0.3;
    const dakZ = roofCenterZ - upperD * 0.4;
    const dakY = wallTopY + (style === 'seng' ? 1.1 : 0.15);
    const tankBase = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.14, 1.12), trimMat);
    tankBase.position.set(dakX, dakY, dakZ);
    const tankStand = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.1, 0.84), ironMat);
    tankStand.position.set(dakX, dakY + 0.6, dakZ);
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 1.0, 12),
      new THREE.MeshStandardMaterial({ color: tankColor, roughness: 0.45 })
    );
    tank.position.set(dakX, dakY + 1.65, dakZ);
    group.add(tankBase, tankStand, tank);
  }

  // Talang air vertikal menempel rapat di sudut dinding depan
  for (const gx of [-localW * 0.48, localW * 0.48]) {
    const gutter = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, wallTopY - 0.08, 6), trimMat);
    gutter.position.set(gx, (wallTopY - 0.08) * 0.5, localD * 0.5 + 0.12);
    group.add(gutter);
  }

  // 3. Teras Depan Bandung / Sukajadi: Lantai keramik berundak, Pilar batu alam, Kanopi beton berlisplang, Pagar rendah
  const porchW = Math.min(localW * 0.72, 3.9);
  const porchFloor = new THREE.Mesh(new THREE.BoxGeometry(porchW, 0.14, 1.48), terasMat);
  porchFloor.position.set(0, 0.07, localD * 0.5 + 0.74);
  porchFloor.receiveShadow = true;
  const porchStep = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.32), terasMat);
  porchStep.position.set(0, 0.04, localD * 0.5 + 1.56);
  group.add(porchFloor, porchStep);

  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.14, 0.1, 1.5), roofMat);
  porchRoof.position.set(0, 2.72, localD * 0.5 + 0.66);
  porchRoof.rotation.x = 0.1;
  porchRoof.castShadow = true;
  const porchFascia = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.14, 0.12, 0.05), woodFrameMat);
  porchFascia.position.set(0, 2.62, localD * 0.5 + 1.4);
  group.add(porchRoof, porchFascia);

  const colSpread = Math.min(1.42, porchW * 0.4);
  for (const px of [-colSpread, colSpread]) {
    const colBase = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.92, 0.34), plinthMat);
    colBase.position.set(px, 0.46, localD * 0.5 + 1.2);
    const colCap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), trimMat);
    colCap.position.set(px, 0.96, localD * 0.5 + 1.2);
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.68, 0.24), stuccoMat);
    col.position.set(px, 1.84, localD * 0.5 + 1.2);
    group.add(colBase, colCap, col);
  }

  // Pintu Kayu Jati Panel + Roster Angin-angin di atas kusen + Plang Nomor Rumah
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.16, 2.26, 0.14), woodFrameMat);
  doorFrame.position.set(0, 1.16, localD * 0.5 + 0.06);
  const doorLeaf = new THREE.Mesh(
    new THREE.BoxGeometry(0.98, 2.12, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x422818, roughness: 0.72 })
  );
  doorLeaf.position.set(0, 1.12, localD * 0.5 + 0.08);
  const doorHandle = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.18, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xd4a84f, metalness: 0.85, roughness: 0.25 })
  );
  doorHandle.position.set(0.34, 1.06, localD * 0.5 + 0.14);
  const doorRoster = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.24, 0.08), rosterMat);
  doorRoster.position.set(0, 2.42, localD * 0.5 + 0.1);
  group.add(doorFrame, doorLeaf, doorHandle, doorRoster);

  const numPlaque = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.04), ironMat);
  numPlaque.position.set(-0.78, 1.82, localD * 0.5 + 0.14);
  const numStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.08, 0.045),
    new THREE.MeshBasicMaterial({ color: 0xffe4a3 })
  );
  numStrip.position.set(-0.78, 1.82, localD * 0.5 + 0.145);
  group.add(numPlaque, numStrip);

  // Kursi teras kayu santai & meja kecil di teras kiri (tidak menghalangi pintu)
  if (localW >= 8.5) {
    const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), woodFrameMat);
    chairSeat.position.set(-colSpread + 0.34, 0.52, localD * 0.5 + 0.78);
    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.44, 0.07), woodFrameMat);
    chairBack.position.set(-colSpread + 0.34, 0.78, localD * 0.5 + 0.55);
    const sideTable = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.46, 10), woodFrameMat);
    sideTable.position.set(-colSpread + 0.88, 0.37, localD * 0.5 + 0.78);
    group.add(chairSeat, chairBack, sideTable);
  }

  for (const side of [-1, 1]) {
    const lowRail = new THREE.Mesh(new THREE.BoxGeometry(porchW * 0.28, 0.58, 0.14), plinthMat);
    lowRail.position.set(side * (porchW * 0.34), 0.36, localD * 0.5 + 1.32);
    const railCap = new THREE.Mesh(new THREE.BoxGeometry(porchW * 0.3, 0.06, 0.18), trimMat);
    railCap.position.set(side * (porchW * 0.34), 0.68, localD * 0.5 + 1.32);
    group.add(lowRail, railCap);
  }

  // Pagar Halaman Rendah Khas Komplek Sukajadi (batu alam + teralis hollow + lampu pilar kuning hangat, tengah terbuka lebar)
  const gateOpenHalf = Math.max(1.22, porchW * 0.4);
  const wingW = Math.max(0.4, localW * 0.5 - gateOpenHalf);
  const fenceZ = localD * 0.5 + 1.66;
  const lanternGlassMat = new THREE.MeshBasicMaterial({ color: 0xffd584 });
  for (const side of [-1, 1]) {
    const wingCx = side * (gateOpenHalf + wingW * 0.5);
    const fenceBase = new THREE.Mesh(new THREE.BoxGeometry(wingW, 0.48, 0.16), plinthMat);
    fenceBase.position.set(wingCx, 0.24, fenceZ);
    const fenceCap = new THREE.Mesh(new THREE.BoxGeometry(wingW + 0.04, 0.06, 0.2), trimMat);
    fenceCap.position.set(wingCx, 0.51, fenceZ);
    const fenceTopBar = new THREE.Mesh(new THREE.BoxGeometry(wingW, 0.04, 0.05), ironMat);
    fenceTopBar.position.set(wingCx, 1.02, fenceZ);
    group.add(fenceBase, fenceCap, fenceTopBar);

    const picketCount = Math.max(3, Math.floor(wingW / 0.35));
    for (let p = 0; p < picketCount; p++) {
      const px = side * (gateOpenHalf + 0.16 + ((p + 0.5) / picketCount) * (wingW - 0.24));
      const picket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.48, 0.03), ironMat);
      picket.position.set(px, 0.78, fenceZ);
      group.add(picket);
    }

    // Pilar gerbang batu alam + lampu pagar kecil
    const gatePillar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.18, 0.28), plinthMat);
    gatePillar.position.set(side * gateOpenHalf, 0.59, fenceZ);
    const pillarCap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.32), trimMat);
    pillarCap.position.set(side * gateOpenHalf, 1.21, fenceZ);
    const pillarLamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), lanternGlassMat);
    pillarLamp.position.set(side * gateOpenHalf, 1.32, fenceZ);
    group.add(gatePillar, pillarCap, pillarLamp);
  }

  // Jendela Berbingkai Kayu + Roster Beton + Topi Beton + Kaca Reflektif
  const glassPaneMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e2c30,
    emissive: new THREE.Color(0x523c1b),
    emissiveIntensity: 0.26,
    roughness: 0.1,
    metalness: 0.2,
    clearcoat: 0.9,
  });
  const winOffsets = localW >= 7 ? [-localW * 0.29, localW * 0.29] : [];
  for (const wx of winOffsets) {
    const fz = localD * 0.5 + 0.12;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.48, 1.32, 0.1), woodFrameMat);
    frame.position.set(wx, 1.72, fz);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.08, 0.12), glassPaneMat);
    win.position.set(wx, 1.72, fz);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.12, 0.14), woodFrameMat);
    crossV.position.set(wx, 1.72, fz);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.06, 0.14), woodFrameMat);
    crossH.position.set(wx, 1.72, fz);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.08, 0.2), trimMat);
    sill.position.set(wx, 1.05, fz + 0.04);
    const winRoster = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.24, 0.08), rosterMat);
    winRoster.position.set(wx, 2.54, fz + 0.01);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.09, 0.36), trimMat);
    hood.position.set(wx, 2.74, fz + 0.13);
    hood.rotation.x = 0.12;
    group.add(frame, win, crossV, crossH, sill, winRoster, hood);

    for (const tx of [-0.38, 0, 0.38]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.08, 6), ironMat);
      bar.position.set(wx + tx, 1.72, fz + 0.08);
      group.add(bar);
    }

    for (const sx of [-0.88, 0.88]) {
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.24, 0.06), woodFrameMat);
      shutter.position.set(wx + sx, 1.72, fz + 0.02);
      group.add(shutter);
    }

    const planter = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.32, 0.38), plinthMat);
    planter.position.set(wx, 0.16, localD * 0.5 + 0.35);
    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), planterLeafMat);
    bush.scale.set(1.3, 0.9, 0.85);
    bush.position.set(wx, 0.45, localD * 0.5 + 0.35);
    group.add(planter, bush);
  }

  // Unit AC luar di dinding samping + lampu teras & plafon dalam
  const acBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.5, 0.7),
    new THREE.MeshStandardMaterial({ color: 0xc2c7c0, roughness: 0.55 })
  );
  acBox.position.set(localW * 0.5 + 0.16, 2.4, 0.8);
  const acFan = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10),
    new THREE.MeshStandardMaterial({ color: 0x222628, roughness: 0.7 })
  );
  acFan.rotation.z = Math.PI / 2;
  acFan.position.set(localW * 0.5 + 0.3, 2.4, 0.8);
  group.add(acBox, acFan);

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), lanternGlassMat);
  lamp.position.set(0, 2.58, localD * 0.5 + 0.65);
  const innerLamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 0.12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe2a6 })
  );
  innerLamp.position.set(0, 3.25, 0);
  group.add(lamp, innerLamp);

  return group;
}

/**
 * Masjid Al-Ikhlas Komplek Sukajadi:
 * Kubah 8-rusuk emas, menara bertingkat dengan balkon muadzin & 4 corong toa, lengkung serambi Islami,
 * jendela kerawang/roster, undakan marmer, tempat wudhu, serta mihrab & lampu gantung interior.
 */
export function createMosque(x: number, z: number, maxAniso: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const creamMat = new THREE.MeshStandardMaterial({ color: 0xd8dad0, roughness: 0.82 });
  const stoneStepMat = new THREE.MeshStandardMaterial({ color: 0x676e68, roughness: 0.78 });
  const greenDomeMat = new THREE.MeshStandardMaterial({ color: 0x1e5c3e, roughness: 0.4, metalness: 0.28 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd9a84e, roughness: 0.28, metalness: 0.8 });
  const teakMat = new THREE.MeshStandardMaterial({ color: 0x3b2416, roughness: 0.72 });
  const teakLightMat = new THREE.MeshStandardMaterial({ color: 0x543622, roughness: 0.68 });
  const velvetMat = new THREE.MeshStandardMaterial({ color: 0x15472f, roughness: 0.9 });
  const carpetTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#12422c';
      ctx.fillRect(0, 0, w, h);
      const rows = 4;
      const rowW = w / rows;
      const cols = 6;
      const colH = h / cols;
      for (let r = 0; r < rows; r++) {
        // Garis saf putih-emas menghadap Timur (+X / kanan tekstur)
        ctx.fillStyle = 'rgba(222, 185, 108, 0.45)';
        ctx.fillRect(r * rowW + rowW - 8, 0, 5, h);
        for (let c = 0; c < cols; c++) {
          const sx = r * rowW + 10;
          const sy = c * colH + 6;
          ctx.strokeStyle = 'rgba(209, 171, 95, 0.36)';
          ctx.lineWidth = 2;
          ctx.strokeRect(sx, sy, rowW - 22, colH - 12);
          // Motif kubah kecil sajadah
          ctx.beginPath();
          ctx.arc(sx + rowW - 34, sy + (colH - 12) * 0.5, 14, -Math.PI * 0.5, Math.PI * 0.5);
          ctx.stroke();
        }
      }
    },
    2,
    2,
    maxAniso
  );
  const carpetMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: carpetTex, roughness: 0.94 });
  const rosterTex = createRosterBlockTexture(maxAniso);
  const winGlowMat = new THREE.MeshStandardMaterial({
    color: 0xd8ffe3,
    map: rosterTex,
    emissive: new THREE.Color(0x6bd498),
    emissiveIntensity: 0.62,
  });

  // 1. Interior Utama: Karpet Sajadah Saf Beralur Kiblat (+X), Plint Marmer, & Ceruk Mihrab Kaligrafi
  const carpet = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.04, 9.4), carpetMat);
  carpet.position.y = 0.14;
  carpet.receiveShadow = true;
  group.add(carpet);

  // Plint dinding marmer bagian dalam
  for (const [bx, bz, bw, bd] of [
    [0, -5.0, 10.1, 0.14],
    [0, 5.0, 10.1, 0.14],
    [5.0, 0, 0.14, 10.1],
  ] as [number, number, number, number][]) {
    const dado = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.95, bd), stoneStepMat);
    dado.position.set(bx, 0.55, bz);
    group.add(dado);
  }

  // Ceruk Mihrab Kiblat Timur (X = +4.9 lokal) dengan panel kaligrafi emas, kolom kembar, & jam waktu sholat digital
  const mihrabBack = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.25, 2.3), velvetMat);
  mihrabBack.position.set(4.96, 1.75, 0);
  const mihrabArch = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 8, 18, Math.PI), brassMat);
  mihrabArch.position.set(4.86, 2.38, 0);
  mihrabArch.rotation.y = -Math.PI / 2;
  const calMedallion = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16), brassMat);
  calMedallion.rotation.z = Math.PI / 2;
  calMedallion.position.set(4.86, 2.55, 0);
  for (const mz of [-1.05, 1.05]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.4, 10), teakMat);
    col.position.set(4.84, 1.25, mz);
    group.add(col);
  }
  const digitalClock = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.36, 0.95),
    new THREE.MeshBasicMaterial({ color: 0x0b1610 })
  );
  digitalClock.position.set(4.92, 3.68, -2.1);
  const clockLeds = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.2, 0.78),
    new THREE.MeshBasicMaterial({ color: 0x3ef08a })
  );
  clockLeds.position.set(4.91, 3.68, -2.1);
  group.add(mihrabBack, mihrabArch, calMedallion, digitalClock, clockLeds);

  // Mimbar Khotbah Kayu Jati Berundak + Mikrofon + Kursi Khatib (X = +3.9, Z = +1.85)
  const mimbarGroup = new THREE.Group();
  mimbarGroup.position.set(3.9, 0.16, 1.85);
  const mBase = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.48, 1.05), teakMat);
  mBase.position.y = 0.24;
  const mStep1 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.24, 0.72), teakLightMat);
  mStep1.position.set(-0.62, 0.12, 0);
  const mLectern = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.92, 0.78), teakMat);
  mLectern.position.set(0.44, 0.92, 0);
  const mDesk = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.84), teakLightMat);
  mDesk.position.set(0.32, 1.38, 0);
  mDesk.rotation.z = -0.22;
  const micStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.34, 6), brassMat);
  micStem.position.set(0.35, 1.56, 0.14);
  const mArchTop = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, 6, 14, Math.PI), brassMat);
  mArchTop.rotation.y = -Math.PI / 2;
  mArchTop.position.set(0.44, 1.72, 0);
  mimbarGroup.add(mBase, mStep1, mLectern, mDesk, micStem, mArchTop);
  group.add(mimbarGroup);

  // Rak Al-Qur'an & Kitab Berwarna + 2 Rehal Kayu di Lantai + Kotak Infaq + Tirai Pemisah Shaf
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.65, 1.45), teakMat);
  shelf.position.set(4.6, 0.98, -3.6);
  group.add(shelf);
  const bookColors = [0x1c5c39, 0x872d24, 0x1e406b, 0xb88c34];
  for (let row = 0; row < 3; row++) {
    for (let bi = 0; bi < 7; bi++) {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.24, 0.11),
        new THREE.MeshStandardMaterial({ color: bookColors[(row + bi) % bookColors.length], roughness: 0.75 })
      );
      book.position.set(4.52, 0.56 + row * 0.42, -4.1 + bi * 0.16);
      group.add(book);
    }
  }
  for (const rz of [-2.4, -1.1]) {
    const rehal = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.42), teakLightMat);
    rehal.position.set(2.8, 0.25, rz);
    group.add(rehal);
  }
  const infaqBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.68, 0.42), teakMat);
  infaqBox.position.set(-4.35, 0.5, 1.65);
  const curtain = new THREE.Mesh(
    new THREE.BoxGeometry(6.8, 1.35, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x174d33, roughness: 0.92 })
  );
  curtain.position.set(0.2, 0.84, 3.35);
  const curtainRod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 7.0, 8), brassMat);
  curtainRod.rotation.z = Math.PI / 2;
  curtainRod.position.set(0.2, 1.54, 3.35);
  group.add(infaqBox, curtain, curtainRod);

  // Plafon Kubah Interior Bertingkat + Lampu Gantung Kuningan 2 Tingkat + Pencahayaan Hangat Ruangan Sholat
  const ceilingRing = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.16, 8, 24), creamMat);
  ceilingRing.rotation.x = Math.PI / 2;
  ceilingRing.position.y = 4.02;
  const chandelierStem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.45, 8), brassMat);
  chandelierStem.position.set(0, 3.92, 0);
  const chandelier = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.055, 6, 20), brassMat);
  chandelier.rotation.x = Math.PI / 2;
  chandelier.position.set(0, 3.22, 0);
  const chandelierUpper = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.04, 6, 16), brassMat);
  chandelierUpper.rotation.x = Math.PI / 2;
  chandelierUpper.position.set(0, 3.55, 0);
  group.add(ceilingRing, chandelierStem, chandelier, chandelierUpper);

  const globeMat = new THREE.MeshBasicMaterial({ color: 0xffebba });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), globeMat);
    globe.position.set(Math.cos(a) * 0.88, 3.16, Math.sin(a) * 0.88);
    group.add(globe);
  }
  const mosqueInteriorLight = new THREE.PointLight(0xffe1a6, 3.2, 14, 1.4);
  mosqueInteriorLight.position.set(0.6, 3.05, 0);
  group.add(mosqueInteriorLight);

  // Atap bertingkat, cornice lis emas & kubah utama + 8 rusuk meridian
  const lowerRoof = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.32, 11.6), creamMat);
  lowerRoof.position.y = 4.25;
  const roofParapet = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.16, 11.8), greenDomeMat);
  roofParapet.position.y = 4.46;
  group.add(lowerRoof, roofParapet);

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.9, 1.25, 8), creamMat);
  drum.position.y = 4.98;
  const drumRing = new THREE.Mesh(new THREE.CylinderGeometry(2.85, 2.85, 0.18, 8), brassMat);
  drumRing.position.y = 5.56;
  group.add(drum, drumRing);

  const domePts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(2.65, 0.2),
    new THREE.Vector2(2.85, 1.25),
    new THREE.Vector2(2.15, 2.45),
    new THREE.Vector2(0.85, 3.25),
    new THREE.Vector2(0.0, 3.7),
  ];
  const dome = new THREE.Mesh(new THREE.LatheGeometry(domePts, 24), greenDomeMat);
  dome.position.y = 5.52;
  dome.castShadow = true;
  group.add(dome);

  // 8 Rusuk lengkung emas di sekeliling kubah
  for (let r = 0; r < 8; r++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(2.76, 0.045, 6, 18, Math.PI * 0.56), brassMat);
    rib.position.y = 6.55;
    rib.rotation.y = (r / 8) * Math.PI * 2;
    group.add(rib);
  }

  // Mustaka / Bulan Sabit di puncak kubah
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.15, 8), brassMat);
  spire.position.y = 9.65;
  const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 8, 16, Math.PI * 1.4), brassMat);
  crescent.position.y = 10.35;
  crescent.rotation.z = Math.PI * 0.25;
  group.add(spire, crescent);

  // Menara Masjid Bertingkat (X = -5.4, Z = -5.4 lokal) dengan pagar balkon & 4 corong toa
  const minaretBase = new THREE.Mesh(new THREE.BoxGeometry(1.72, 8.5, 1.72), creamMat);
  minaretBase.position.set(-5.4, 4.25, -5.4);
  minaretBase.castShadow = true;
  group.add(minaretBase);

  for (const my of [4.4, 6.6]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.2, 1.88), greenDomeMat);
    band.position.set(-5.4, my, -5.4);
    group.add(band);
  }

  const balcony = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.26, 2.35), brassMat);
  balcony.position.set(-5.4, 8.5, -5.4);
  const balRail = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.55, 2.42), creamMat);
  balRail.position.set(-5.4, 8.85, -5.4);
  group.add(balcony, balRail);

  // 4 Corong Toa pengeras suara adzan di atas balkon menara
  for (let h = 0; h < 4; h++) {
    const ang = (h / 4) * Math.PI * 2;
    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.34, 8),
      new THREE.MeshStandardMaterial({ color: 0xe8ecea, roughness: 0.45 })
    );
    horn.position.set(-5.4 + Math.cos(ang) * 1.08, 9.28, -5.4 + Math.sin(ang) * 1.08);
    horn.rotation.z = Math.cos(ang) * -Math.PI * 0.45;
    horn.rotation.x = Math.sin(ang) * Math.PI * 0.45;
    group.add(horn);
  }

  const minDome = new THREE.Mesh(new THREE.SphereGeometry(0.92, 16, 12), greenDomeMat);
  minDome.position.set(-5.4, 9.45, -5.4);
  const minSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.95, 8), brassMat);
  minSpire.position.set(-5.4, 10.65, -5.4);
  group.add(minDome, minSpire);

  // Pilar serambi Barat (-X) lengkap dengan lengkung gerbang Islami, dasar batu & pagar serambi
  const serambiFloor = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.18, 11.4), stoneStepMat);
  serambiFloor.position.set(-6.0, 0.09, 0);
  group.add(serambiFloor);

  for (const pz of [-3.6, -1.6, 1.6, 3.6]) {
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 4.1, 10), creamMat);
    pil.position.set(-6.3, 2.05, pz);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.48), brassMat);
    cap.position.set(-6.3, 3.98, pz);
    group.add(pil, cap);

    const win = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.75, 1.05), winGlowMat);
    win.position.set(-5.3, 2.1, pz * 0.85);
    const winArch = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.08, 6, 12, Math.PI), brassMat);
    winArch.rotation.y = Math.PI / 2;
    winArch.position.set(-5.32, 2.98, pz * 0.85);
    group.add(win, winArch);
  }
  // Lengkung gapura tengah serambi
  const centerArch = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 8, 16, Math.PI), greenDomeMat);
  centerArch.rotation.y = Math.PI / 2;
  centerArch.position.set(-6.3, 2.95, 0);
  group.add(centerArch);

  const serambiRoof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.24, 11.3), greenDomeMat);
  serambiRoof.position.set(-5.9, 4.1, 0);
  group.add(serambiRoof);

  // Tempat Wudhu (bangku keramik & 3 kran kuningan di sisi barat daya masjid)
  const wudhuWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.35, 3.1), creamMat);
  wudhuWall.position.set(-5.35, 0.68, 4.4);
  const wudhuDrain = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.22, 3.1), stoneStepMat);
  wudhuDrain.position.set(-5.68, 0.11, 4.4);
  group.add(wudhuWall, wudhuDrain);
  for (const kz of [3.6, 4.4, 5.2]) {
    const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6), brassMat);
    tap.rotation.z = Math.PI / 2;
    tap.position.set(-5.52, 0.86, kz);
    group.add(tap);
  }

  // Papan nama Masjid
  const signTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#0e291c';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#cfa15a';
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#f2e8cf';
      ctx.font = 'bold 42px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('MASJID AL-IKHLAS', w / 2, h / 2 - 18);
      ctx.fillStyle = '#cfa15a';
      ctx.font = '24px sans-serif';
      ctx.fillText('KOMPLEK SUKAJADI', w / 2, h / 2 + 28);
    },
    1,
    1,
    maxAniso
  );
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.65),
    new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
  );
  board.position.set(-6.38, 3.55, 0);
  board.rotation.y = -Math.PI / 2;
  group.add(board);

  return group;
}

/**
 * Baliho Pinggir Jalan Sukajadi: "WINDAH BASUDARA · BOCIL KEMATIAN GARIS KERAS".
 */
export function createBillboardWindah(maxAniso: number): THREE.Group {
  const group = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x2b3136, roughness: 0.42, metalness: 0.78 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x16191c, roughness: 0.5, metalness: 0.65 });

  // Dua tiang baja penyangga + palang silang
  for (const sx of [-1.8, 1.8]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.6, 10), steelMat);
    post.position.set(sx, 3.3, 0);
    post.castShadow = true;
    group.add(post);

    const footing = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.35, 0.65), frameMat);
    footing.position.set(sx, 0.175, 0);
    group.add(footing);
  }

  const brace = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.16, 0.18), steelMat);
  brace.position.set(0, 2.2, 0);
  group.add(brace);

  // Rangka papan reklame (5.4m x 2.8m) lebih tebal dari tiang agar poster bersih tanpa tembus tiang
  const backing = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.9, 0.4), frameMat);
  backing.position.set(0, 5.05, 0);
  backing.castShadow = true;
  group.add(backing);

  const posterTex = makeCanvasTexture(
    (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#240c16');
      grad.addColorStop(0.5, '#7a1620');
      grad.addColorStop(1, '#141c2c');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Bingkai kuning neon
      ctx.strokeStyle = '#f5c038';
      ctx.lineWidth = 16;
      ctx.strokeRect(14, 14, w - 28, h - 28);

      // Ilustrasi ikonik figur gamer + headset + kacamata di sisi kiri
      ctx.fillStyle = '#252b3b';
      ctx.beginPath();
      ctx.arc(178, 260, 118, 0, Math.PI * 2);
      ctx.fill();
      // Kepala karikatur
      ctx.fillStyle = '#dfa982';
      ctx.beginPath();
      ctx.arc(178, 240, 74, 0, Math.PI * 2);
      ctx.fill();
      // Rambut & headset
      ctx.fillStyle = '#14161a';
      ctx.beginPath();
      ctx.arc(178, 202, 76, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e63e35';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(178, 224, 86, Math.PI * 0.95, Math.PI * 2.05);
      ctx.stroke();
      // Kacamata tebal
      ctx.fillStyle = '#0e1116';
      ctx.fillRect(122, 222, 46, 26);
      ctx.fillRect(188, 222, 46, 26);
      ctx.fillRect(168, 230, 20, 8);
      // Senyum lebar
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(178, 268, 26, 0.15, Math.PI - 0.15);
      ctx.stroke();

      // Tipografi utama Baliho (1024x512 proporsi 2:1 presisi!)
      ctx.fillStyle = '#f8d252';
      ctx.font = 'bold 88px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('WINDAH', 340, 148);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 82px sans-serif';
      ctx.fillText('BASUDARA', 340, 232);

      ctx.fillStyle = '#d92b21';
      ctx.fillRect(340, 262, 620, 64);
      ctx.fillStyle = '#fff8dc';
      ctx.font = 'bold 33px sans-serif';
      ctx.fillText('BOCIL KEMATIAN GARIS KERAS', 356, 306);

      ctx.fillStyle = '#c4e0f2';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('ABSEN MALAM JUMAT · SUKAJADI 666', 340, 382);

      ctx.fillStyle = '#f5c038';
      ctx.font = 'italic 26px sans-serif';
      ctx.fillText('"JANGAN LUPA NONTON LIVE & HATI-HATI!"', 340, 434);
    },
    1,
    1,
    maxAniso,
    true,
    1024,
    512
  );

  const posterMat = new THREE.MeshStandardMaterial({
    map: posterTex,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: posterTex,
    emissiveIntensity: 0.85,
    roughness: 0.35,
  });

  for (const sz of [-0.21, 0.21]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(5.25, 2.65), posterMat);
    face.position.set(0, 5.05, sz);
    if (sz < 0) face.rotation.y = Math.PI;
    group.add(face);
  }

  // Lampu sorot atas baliho
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6a3 });
  for (const lx of [-1.6, 0, 1.6]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.65), steelMat);
    arm.position.set(lx, 6.52, 0.35);
    group.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), bulbMat);
    bulb.position.set(lx, 6.45, 0.65);
    group.add(bulb);
  }

  return group;
}

/**
 * Warung Nongkrong Sukajadi dengan Spanduk "WARUNG CEU TITIN", atap seng bergelombang, terpal biru,
 * panci mie rebus, rentengan kopi, etalase gorengan, galon air, bangku kayu (dingklik), & lampu hangat.
 */
export function createWarungCeuTitin(maxAniso: number): THREE.Group {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x5c6b5a, roughness: 0.86 });
  const wallTileMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createWarungTileTexture(maxAniso, '#cad6c5', '#b4c4ae'),
    roughness: 0.52,
  });
  const floorTileMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createWarungTileTexture(maxAniso, '#b8b09d', '#9c9481'),
    roughness: 0.72,
  });
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createBatuAlamTexture(maxAniso),
    roughness: 0.9,
  });
  const rosterMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createRosterBlockTexture(maxAniso),
    roughness: 0.85,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x624026, roughness: 0.76 });
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x3b2617, roughness: 0.84 });
  const teakTopMat = new THREE.MeshStandardMaterial({ color: 0x7a4e2b, roughness: 0.55 });
  const zincRoofMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createCorrugatedZincTexture(maxAniso),
    roughness: 0.62,
    metalness: 0.36,
  });
  const alumMat = new THREE.MeshStandardMaterial({ color: 0xc2c8cc, roughness: 0.3, metalness: 0.82 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x222729, roughness: 0.45, metalness: 0.72 });
  const tarpMat = new THREE.MeshStandardMaterial({ color: 0x1d4d7a, roughness: 0.72 });
  const enamelGreenMat = new THREE.MeshStandardMaterial({
    color: 0x1b4d2e,
    roughness: 0.38,
    metalness: 0.25,
    side: THREE.DoubleSide,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xd4eef5,
    transparent: true,
    opacity: 0.38,
    roughness: 0.1,
    clearcoat: 0.85,
  });

  // 1. Lantai keramik teras warung & plint batu alam sekeliling
  const deckPlinth = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.1, 7.7), plinthMat);
  deckPlinth.position.set(0.5, 0.05, 0);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.1, 7.6), floorTileMat);
  deck.position.set(0.5, 0.12, 0);
  deck.receiveShadow = true;
  group.add(deckPlinth, deck);

  // 2. Dinding kios belakang (-X) & kiri/kanan (-Z / +Z) + keramik dinding setengah badan + roster ventilasi
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.26, 3.1, 6.8), wallMat);
  backWall.position.set(-2.5, 1.55, 0);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  const backWainscot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.28, 6.48), wallTileMat);
  backWainscot.position.set(-2.35, 0.8, 0);
  const backTrim = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 6.5), darkWoodMat);
  backTrim.position.set(-2.35, 1.45, 0);
  group.add(backWall, backWainscot, backTrim);

  for (const sz of [-3.3, 3.3]) {
    const innerZSign = sz < 0 ? 1 : -1;
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.1, 0.26), wallMat);
    sideWall.position.set(-0.7, 1.55, sz);
    sideWall.castShadow = true;
    sideWall.receiveShadow = true;
    const sideWainscot = new THREE.Mesh(new THREE.BoxGeometry(3.56, 1.28, 0.05), wallTileMat);
    sideWainscot.position.set(-0.68, 0.8, sz + innerZSign * 0.14);
    const sideTrim = new THREE.Mesh(new THREE.BoxGeometry(3.58, 0.07, 0.07), darkWoodMat);
    sideTrim.position.set(-0.68, 1.45, sz + innerZSign * 0.14);
    const sideRoster = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.36, 0.28), rosterMat);
    sideRoster.position.set(-0.7, 2.74, sz);
    group.add(sideWall, sideWainscot, sideTrim, sideRoster);
  }

  // Jendela kayu terbuka bertopi seng kecil di dinding selatan (+Z = +3.3) menghadap jalan
  const winFrameS = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.05, 0.3), darkWoodMat);
  winFrameS.position.set(-0.4, 1.98, 3.3);
  const winGlassS = new THREE.Mesh(
    new THREE.BoxGeometry(1.25, 0.86, 0.32),
    new THREE.MeshBasicMaterial({ color: 0xffd896 })
  );
  winGlassS.position.set(-0.4, 1.98, 3.3);
  const winHoodS = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.07, 0.42), zincRoofMat);
  winHoodS.position.set(-0.4, 2.55, 3.5);
  winHoodS.rotation.x = 0.22;
  group.add(winFrameS, winGlassS, winHoodS);

  // 3. Tiang kanopi depan (+X = +3.45) lengkap dengan umpak batu alam + balok ring & atap seng rapi berlisplang
  for (const pz of [-3.3, 0, 3.3]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.44, 0.26), plinthMat);
    base.position.set(3.45, 0.22, pz);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.05, 0.14), darkWoodMat);
    post.position.set(3.45, 1.92, pz);
    post.castShadow = true;
    group.add(base, post);
  }
  const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 6.76), darkWoodMat);
  frontBeam.position.set(3.45, 3.36, 0);
  group.add(frontBeam);

  // Atap seng miring + lisplang kayu tepat sejajar tepi atap (tanpa ujung mencuat)
  const roofPitch = -0.075;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.1, 7.5), zincRoofMat);
  roof.position.set(0.65, 3.68, 0);
  roof.rotation.z = roofPitch;
  roof.castShadow = true;
  group.add(roof);

  const frontFascia = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 7.5), darkWoodMat);
  frontFascia.position.set(4.06, 3.4, 0);
  const backFascia = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 7.5), darkWoodMat);
  backFascia.position.set(-2.76, 3.92, 0);
  group.add(frontFascia, backFascia);

  for (const sz of [-3.72, 3.72]) {
    const sideFascia = new THREE.Mesh(new THREE.BoxGeometry(6.86, 0.14, 0.05), darkWoodMat);
    sideFascia.position.set(0.65, 3.66, sz);
    sideFascia.rotation.z = roofPitch;
    group.add(sideFascia);
  }

  for (const rz of [-2.2, 0, 2.2]) {
    const rafter = new THREE.Mesh(new THREE.BoxGeometry(6.35, 0.07, 0.08), darkWoodMat);
    rafter.position.set(0.62, 3.55, rz);
    rafter.rotation.z = roofPitch;
    group.add(rafter);
  }

  // Gulungan terpal biru terikat rapi di bawah balok kanopi depan dengan pengikat besi
  const rolledTarp = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 6.4, 10), tarpMat);
  rolledTarp.rotation.x = Math.PI / 2;
  rolledTarp.position.set(3.44, 2.28, 0);
  group.add(rolledTarp);
  for (const bz of [-2.4, -0.8, 0.8, 2.4]) {
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.016, 6, 12), ironMat);
    strap.position.set(3.44, 2.28, bz);
    group.add(strap);
  }

  // Spanduk / Neon Box "WARUNG CEU TITIN" berbingkai aluminium
  const spandukTex = makeCanvasTexture(
    (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#0d1b14');
      grad.addColorStop(0.5, '#193124');
      grad.addColorStop(1, '#101d16');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#cfa15a';
      ctx.lineWidth = 10;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.strokeStyle = '#f0b857';
      ctx.lineWidth = 3;
      ctx.strokeRect(22, 22, w - 44, h - 44);

      ctx.fillStyle = '#244030';
      ctx.beginPath();
      ctx.arc(112, h / 2, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cfa15a';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.strokeStyle = '#f5dfb3';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      for (const sx of [96, 112, 128]) {
        ctx.beginPath();
        ctx.moveTo(sx, h / 2 - 16);
        ctx.quadraticCurveTo(sx - 8, h / 2 - 30, sx + 4, h / 2 - 44);
        ctx.stroke();
      }
      ctx.fillStyle = '#ebe4d1';
      ctx.beginPath();
      ctx.roundRect(82, h / 2 - 8, 52, 40, [4, 4, 18, 18]);
      ctx.fill();
      ctx.strokeStyle = '#ebe4d1';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(138, h / 2 + 10, 11, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.fillStyle = '#cfa15a';
      ctx.fillRect(72, h / 2 + 34, 72, 7);

      ctx.fillStyle = '#fff9ec';
      ctx.font = 'bold 72px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('WARUNG CEU TITIN', 202, h / 2 - 12);

      ctx.fillStyle = '#f0b857';
      ctx.font = 'bold 31px sans-serif';
      ctx.fillText('KOPI TUBRUK · MIE REBUS · BALA-BALA · GEHU', 204, h / 2 + 36);

      ctx.fillStyle = '#a9d9ba';
      ctx.font = '23px sans-serif';
      ctx.fillText('BASECAMP NONGKRONG SUKAJADI · BUKA 24 JAM', 204, h / 2 + 76);
    },
    1,
    1,
    maxAniso,
    true,
    1024,
    256
  );

  const bannerMat = new THREE.MeshStandardMaterial({
    map: spandukTex,
    emissive: new THREE.Color(0xfff1d6),
    emissiveMap: spandukTex,
    emissiveIntensity: 0.72,
    side: THREE.DoubleSide,
  });

  const bannerBox = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.24, 6.46), alumMat);
  bannerBox.position.set(3.52, 2.86, 0);
  const bannerMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.38, 1.16), bannerMat);
  bannerMesh.position.set(3.58, 2.86, 0);
  bannerMesh.rotation.y = Math.PI / 2;
  group.add(bannerBox, bannerMesh);

  const southBox = new THREE.Mesh(new THREE.BoxGeometry(4.18, 0.94, 0.08), alumMat);
  southBox.position.set(1.35, 2.84, 3.55);
  const southBanner = new THREE.Mesh(new THREE.PlaneGeometry(4.08, 0.86), bannerMat);
  southBanner.position.set(1.35, 2.84, 3.6);
  group.add(southBox, southBanner);

  // 4. INTERIOR COUNTER UTAMA KERAMIK + ETALASE GORENGAN + KOMPOR MIE + STOPLES + TERMOS + GALON
  const counter = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.9, 4.6), wallTileMat);
  counter.position.set(-0.35, 0.57, 0);
  counter.castShadow = true;
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.06, 4.68), teakTopMat);
  counterTop.position.set(-0.35, 1.05, 0);
  const counterFootRail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4.4, 8), alumMat);
  counterFootRail.rotation.x = Math.PI / 2;
  counterFootRail.position.set(0.16, 0.28, 0);
  group.add(counter, counterTop, counterFootRail);

  // Etalase kaca berbingkai aluminium (z = -1.25) dengan 2 rak gorengan hangat & LED interior
  const etalaseFrameBase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 1.38), alumMat);
  etalaseFrameBase.position.set(-0.35, 1.1, -1.25);
  const etalaseFrameTop = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 1.38), alumMat);
  etalaseFrameTop.position.set(-0.35, 1.74, -1.25);
  const etalaseGlass = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 1.34), glassMat);
  etalaseGlass.position.set(-0.35, 1.42, -1.25);
  const etalaseGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.025, 1.24),
    new THREE.MeshBasicMaterial({ color: 0xffe29a })
  );
  etalaseGlow.position.set(-0.35, 1.7, -1.25);
  const etalaseMidShelf = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 1.28), glassMat);
  etalaseMidShelf.position.set(-0.35, 1.42, -1.25);
  group.add(etalaseFrameBase, etalaseFrameTop, etalaseGlass, etalaseGlow, etalaseMidShelf);

  for (const [cx, cz] of [
    [-0.6, -1.91],
    [-0.1, -1.91],
    [-0.6, -0.59],
    [-0.1, -0.59],
  ]) {
    const corner = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.66, 0.03), alumMat);
    corner.position.set(cx, 1.42, cz);
    group.add(corner);
  }

  // Nampan bala-bala, gehu, tempe & bungkus nasi uduk daun pisang di 2 tingkat etalase
  const fryMat = new THREE.MeshStandardMaterial({ color: 0xd18f2a, roughness: 0.68 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3b6e2e, roughness: 0.72 });
  for (const shelfY of [1.15, 1.45]) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 1.14), alumMat);
    tray.position.set(-0.35, shelfY, -1.25);
    group.add(tray);
    for (let g = 0; g < 5; g++) {
      const gz = -1.68 + g * 0.21;
      const item = new THREE.Mesh(
        shelfY > 1.3 && g >= 3
          ? new THREE.ConeGeometry(0.08, 0.13, 6)
          : new THREE.DodecahedronGeometry(0.075, 0),
        shelfY > 1.3 && g >= 3 ? leafMat : fryMat
      );
      item.scale.set(1.1, 0.75, 1.0);
      item.position.set(-0.35 + (g % 2 === 0 ? -0.07 : 0.07), shelfY + 0.06, gz);
      group.add(item);
    }
  }

  // Kompor gas stainless + nyala api biru + panci aluminium mie rebus + tumpukan mangkok ayam jago
  const stoveBody = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.78), alumMat);
  stoveBody.position.set(-0.38, 1.13, -0.15);
  const burnerGlow = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.014, 6, 12),
    new THREE.MeshBasicMaterial({ color: 0x45b8ff })
  );
  burnerGlow.rotation.x = Math.PI / 2;
  burnerGlow.position.set(-0.38, 1.19, -0.22);
  const panci = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.19, 12), alumMat);
  panci.position.set(-0.38, 1.29, -0.22);
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.3 });
  for (let b = 0; b < 4; b++) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.055, 0.065, 10), bowlMat);
    bowl.position.set(-0.36, 1.12 + b * 0.032, 0.14);
    group.add(bowl);
  }
  group.add(stoveBody, burnerGlow, panci);

  // 3 Stoples kaca tutup merah berisi kerupuk & kue warung
  const lidRedMat = new THREE.MeshStandardMaterial({ color: 0xb82e24, roughness: 0.45 });
  const snackMat = new THREE.MeshStandardMaterial({ color: 0xe3cf9d, roughness: 0.75 });
  for (const [idx, jz] of [0.55, 0.95, 1.35].entries()) {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.32, 10), glassMat);
    jar.position.set(-0.34, 1.24, jz);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.04, 10), lidRedMat);
    lid.position.set(-0.34, 1.41, jz);
    const fill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.18 + idx * 0.02, 8),
      snackMat
    );
    fill.position.set(-0.34, 1.18, jz);
    group.add(jar, lid, fill);
  }

  // Termos air panas merah klasik + rak gelas kopi (z = +1.85)
  const thermos = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.095, 0.36, 10), lidRedMat);
  thermos.position.set(-0.34, 1.26, 1.85);
  const thermosCap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.07, 10), alumMat);
  thermosCap.position.set(-0.34, 1.47, 1.85);
  group.add(thermos, thermosCap);

  // Kaleng kerupuk biru kotak + Dispenser Galon Aqua di ujung selatan counter
  const kalengKerupuk = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.48, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x26659e, roughness: 0.38, metalness: 0.35 })
  );
  kalengKerupuk.position.set(-0.35, 0.41, 2.55);
  const kalengLid = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 10), alumMat);
  kalengLid.position.set(-0.35, 0.67, 2.55);
  const dispStand = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.62, 0.38), bowlMat);
  dispStand.position.set(-0.55, 0.48, 2.95);
  const galon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.17, 0.46, 12),
    new THREE.MeshStandardMaterial({ color: 0x2c7ab8, roughness: 0.2, transparent: true, opacity: 0.85 })
  );
  galon.position.set(-0.55, 1.02, 2.95);
  group.add(kalengKerupuk, kalengLid, dispStand, galon);

  // 5. DINDING BELAKANG: Kulkas Minuman Kaca, Rak Kelontong, Rentengan Kopi, Menu Harga, Jam & Kalender
  const coolerBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 1.84, 0.74),
    new THREE.MeshStandardMaterial({ color: 0x242829, roughness: 0.45 })
  );
  coolerBody.position.set(-2.02, 1.08, 2.38);
  const coolerGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 1.38),
    new THREE.MeshBasicMaterial({ color: 0xc9f0ff })
  );
  coolerGlow.rotation.y = Math.PI / 2;
  coolerGlow.position.set(-1.67, 1.18, 2.38);
  group.add(coolerBody, coolerGlow);
  for (let r = 0; r < 3; r++) {
    const cShelfY = 0.72 + r * 0.38;
    const cBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.56), ironMat);
    cBar.position.set(-1.65, cShelfY, 2.38);
    group.add(cBar);
    const drinkColors = [0x2e8b47, 0xe07b22, 0xc72c28, 0x2366a8];
    for (let b = 0; b < 4; b++) {
      const bottle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.038, 0.19, 8),
        new THREE.MeshStandardMaterial({ color: drinkColors[(b + r) % drinkColors.length], roughness: 0.3 })
      );
      bottle.position.set(-1.66, cShelfY + 0.11, 2.18 + b * 0.13);
      group.add(bottle);
    }
  }

  // Rak kelontong kayu bertingkat (-0.4 Z)
  const shelfFrame = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.98, 3.4), darkWoodMat);
  shelfFrame.position.set(-2.14, 1.15, -0.45);
  group.add(shelfFrame);
  for (const [idx, sy] of [0.68, 1.15, 1.62, 2.02].entries()) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 3.32), teakTopMat);
    plank.position.set(-2.1, sy, -0.45);
    group.add(plank);
    const boxColors = [0xd4a42a, 0xa82e24, 0x2d6e3e, 0x295985];
    for (let k = 0; k < 5; k++) {
      const stockBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.22 + ((k + idx) % 2) * 0.06, 0.42),
        new THREE.MeshStandardMaterial({ color: boxColors[(k + idx) % boxColors.length], roughness: 0.7 })
      );
      stockBox.position.set(-2.02, sy + 0.14, -1.7 + k * 0.62);
      group.add(stockBox);
    }
  }

  // Gantungan rentengan sachet kopi warna-warni
  const hangerBar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.2, 6), ironMat);
  hangerBar.rotation.x = Math.PI / 2;
  hangerBar.position.set(-1.82, 2.48, -0.45);
  group.add(hangerBar);
  const sachetColors = [0x9e2b24, 0x2a6938, 0xd49b2a, 0x255078, 0x6e3222, 0xc75c24];
  for (let s = 0; s < 8; s++) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.68, 0.14),
      new THREE.MeshStandardMaterial({ color: sachetColors[s % sachetColors.length], roughness: 0.6 })
    );
    strip.position.set(-1.82, 2.12, -1.75 + s * 0.38);
    group.add(strip);
  }

  // Papan Harga Menu Warung + Jam Dinding Bulat di dinding belakang (menghadap +X)
  const menuTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#17261d';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#cfa15a';
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#f5d88e';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DAFTAR MENU WARUNG', w / 2, 40);
      ctx.fillStyle = '#edf2e8';
      ctx.font = '21px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('KOPI TUBRUK   Rp 4.000', 22, 82);
      ctx.fillText('INDOMIE TELOR Rp12.000', 22, 114);
      ctx.fillText('TEH HANGAT    Rp 3.000', 22, 146);
      ctx.fillText('GORENGAN      Rp 2.000', 22, 178);
    },
    1,
    1,
    maxAniso,
    true,
    384,
    210
  );
  const menuBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(1.18, 0.65),
    new THREE.MeshBasicMaterial({ map: menuTex, side: THREE.DoubleSide })
  );
  menuBoard.rotation.y = Math.PI / 2;
  menuBoard.position.set(-2.34, 2.52, -1.35);
  const clockFace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14),
    new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.4 })
  );
  clockFace.rotation.z = Math.PI / 2;
  clockFace.position.set(-2.34, 2.68, 0.35);
  const clockRim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 16), darkWoodMat);
  clockRim.rotation.y = Math.PI / 2;
  clockRim.position.set(-2.33, 2.68, 0.35);
  group.add(menuBoard, clockFace, clockRim);

  // 6. AREA NONGKRONG PELANGGAN: 2 Meja Panjang Bertaplak + 4 Kaki + Cangkir + Gorengan + Bangku Berkaki
  const taplakMat = new THREE.MeshStandardMaterial({ color: 0x8c2a24, roughness: 0.72 });
  for (const tz of [-1.5, 1.5]) {
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.055, 2.12), teakTopMat);
    tableTop.position.set(1.85, 0.78, tz);
    tableTop.castShadow = true;
    const runner = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.015, 2.06), taplakMat);
    runner.position.set(1.85, 0.812, tz);
    group.add(tableTop, runner);

    for (const [lx, lz] of [
      [-0.31, -0.92],
      [0.31, -0.92],
      [-0.31, 0.92],
      [0.31, 0.92],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), darkWoodMat);
      leg.position.set(1.85 + lx, 0.47, tz + lz);
      group.add(leg);
    }

    // Cangkir kopi, piring gorengan & botol saos di atas meja
    for (const cz of [-0.52, 0.38]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 8), bowlMat);
      cup.position.set(1.85, 0.87, tz + cz);
      group.add(cup);
    }
    const snackPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.025, 10), bowlMat);
    snackPlate.position.set(1.82, 0.83, tz - 0.08);
    const friedItem = new THREE.Mesh(new THREE.DodecahedronGeometry(0.065, 0), fryMat);
    friedItem.scale.set(1.1, 0.65, 1);
    friedItem.position.set(1.82, 0.865, tz - 0.08);
    const saosBottle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.035, 0.17, 8), lidRedMat);
    saosBottle.position.set(1.78, 0.9, tz + 0.72);
    const tissueBox = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.12), bowlMat);
    tissueBox.position.set(1.88, 0.86, tz - 0.82);
    group.add(snackPlate, friedItem, saosBottle, tissueBox);

    // Bangku kayu 4 kaki dengan palang tengah (tempat nongkrong anak muda)
    const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 2.04), woodMat);
    benchSeat.position.set(2.58, 0.49, tz);
    benchSeat.castShadow = true;
    const benchBrace = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.8), darkWoodMat);
    benchBrace.position.set(2.58, 0.28, tz);
    group.add(benchSeat, benchBrace);
    for (const [bx, bz] of [
      [-0.15, -0.88],
      [0.15, -0.88],
      [-0.15, 0.88],
      [0.15, 0.88],
    ]) {
      const bLeg = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.31, 0.055), darkWoodMat);
      bLeg.position.set(2.58 + bx, 0.32, tz + bz);
      group.add(bLeg);
    }
  }

  // 7. Lampu gantung kap enamel hijau klasik warung
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd584 });
  for (const [bx, bz] of [
    [-0.15, -0.8],
    [1.85, -1.5],
    [1.85, 1.5],
  ]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 6), ironMat);
    cord.position.set(bx, 3.08, bz);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.14, 12, 1, true), enamelGreenMat);
    shade.position.set(bx, 2.74, bz);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), bulbMat);
    bulb.position.set(bx, 2.66, bz);
    group.add(cord, shade, bulb);
  }

  // Tong sampah kecil di sudut luar tiang selatan
  const trashBin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.14, 0.42, 10),
    new THREE.MeshStandardMaterial({ color: 0x262b2c, roughness: 0.78 })
  );
  trashBin.position.set(3.45, 0.38, 3.66);
  group.add(trashBin);

  return group;
}

/**
 * Kolam Renang Halaman Depan Rumah Gurita (di dalam Gerbang Utama, lantai dasar)
 * Lengkap dengan keramik mosaik biru, lampu dinding kolam, tangga stainless, pot tanaman, dan patung singa bersurai.
 */
export function createCourtyardSwimmingPool(): THREE.Group {
  const group = new THREE.Group();
  const stoneCoping = new THREE.MeshStandardMaterial({ color: 0x9aa29a, roughness: 0.72 });
  const mosaicTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#155d6e';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(130, 225, 240, 0.25)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= w; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(w, i);
        ctx.stroke();
      }
    },
    3,
    2,
    4,
    true,
    256,
    256
  );
  const tileBasin = new THREE.MeshStandardMaterial({ color: 0xffffff, map: mosaicTex, roughness: 0.45 });
  const waterNormalTex = createWaterRippleNormalTexture(1, 4).clone();
  waterNormalTex.repeat.set(4, 2.5);
  waterNormalTex.needsUpdate = true;
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x1c99ad,
    emissive: new THREE.Color(0x09424f),
    emissiveIntensity: 0.45,
    roughness: 0.05,
    metalness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    ior: 1.333,
    envMapIntensity: 2.2,
    normalMap: waterNormalTex,
    normalScale: new THREE.Vector2(0.45, 0.45),
    transparent: true,
    opacity: 0.78,
  });
  group.userData.waterNormalTex = waterNormalTex;
  const stainlessMat = new THREE.MeshStandardMaterial({ color: 0xd0d8db, roughness: 0.22, metalness: 0.88 });
  const statueMat = new THREE.MeshStandardMaterial({ color: 0xbcbeb6, roughness: 0.78 });
  const potMat = new THREE.MeshStandardMaterial({ color: 0x6b4532, roughness: 0.88 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a542d, roughness: 0.84, flatShading: true });

  const rimN = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.28, 0.48), stoneCoping);
  rimN.position.set(0, 0.14, -2.9);
  const rimS = rimN.clone();
  rimS.position.set(0, 0.14, 2.9);
  const rimW = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, 5.4), stoneCoping);
  rimW.position.set(-4.58, 0.14, 0);
  const rimE = rimW.clone();
  rimE.position.set(4.58, 0.14, 0);
  group.add(rimN, rimS, rimW, rimE);

  const basin = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.08, 5.4), tileBasin);
  basin.position.y = 0.02;
  group.add(basin);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(8.75, 5.35), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.17;
  group.add(water);

  // Lampu dinding kolam bawah air
  for (const lx of [-2.4, 2.4]) {
    const poolLight = new THREE.Mesh(
      new THREE.CircleGeometry(0.14, 10),
      new THREE.MeshBasicMaterial({ color: 0x6ef7ff })
    );
    poolLight.position.set(lx, 0.16, -2.62);
    group.add(poolLight);
  }

  for (const lz of [-0.35, 0.35]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.85, 8), stainlessMat);
    rail.position.set(-4.35, 0.45, lz - 1.2);
    group.add(rail);
  }

  // Patung klasik berdiri (sesuai foto prestigeproperty di tepi kolam Rumah Gurita) + 2 Patung Singa Taman Putih
  const darkStatueMat = new THREE.MeshStandardMaterial({ color: 0x262a2d, roughness: 0.65 });
  const standingBase = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.22, 12), stoneCoping);
  standingBase.position.set(-5.1, 0.11, 0.0);
  const standingTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.35, 10), darkStatueMat);
  standingTorso.position.set(-5.1, 0.9, 0.0);
  standingTorso.castShadow = true;
  const standingHead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), darkStatueMat);
  standingHead.position.set(-5.1, 1.72, 0.0);
  const raisedArm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.68, 6), darkStatueMat);
  raisedArm.position.set(-5.1, 1.76, -0.16);
  raisedArm.rotation.x = -0.35;
  group.add(standingBase, standingTorso, standingHead, raisedArm);

  for (const sz of [-1.75, 1.75]) {
    const lion = new THREE.Group();
    lion.position.set(-5.25, 0, sz);
    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.14, 0.62), stoneCoping);
    ped.position.y = 0.07;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.42), statueMat);
    body.position.set(0, 0.48, 0);
    body.castShadow = true;
    const mane = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), statueMat);
    mane.position.set(-0.3, 0.72, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), statueMat);
    head.position.set(-0.42, 0.74, 0);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.28, 0.34), statueMat);
    legs.position.set(0, 0.24, 0);
    lion.add(ped, body, mane, head, legs);
    group.add(lion);
  }

  for (const pz of [-2.4, -0.5, 0.5, 2.4]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.38, 10), potMat);
    pot.position.set(-5.05, 0.19, pz);
    const bush = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.82, 7), leafMat);
    bush.position.set(-5.05, 0.68, pz);
    group.add(pot, bush);
  }

  return group;
}

/**
 * Tekstur partikel bokeh lembut melingkar (bukan piksel kotak).
 */
export function createSoftParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Material shader kerucut cahaya volumetrik lembut ala UE5:
 * Memudar halus di ujung, tepi siluet (Fresnel), dan dasar kerucut tanpa garis tepi poligon kaku.
 */
export function createVolumetricConeMaterial(colorHex: number, opacity = 0.08): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vViewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewPos;
      void main() {
        vec3 n = normalize(vViewNormal);
        vec3 v = normalize(vViewPos);
        // Fresnel halus sehingga tepi samping kerucut menghilang mulus tanpa sudut tajam (clamp max aman dari NaN)
        float rim = pow(max(abs(dot(n, v)), 0.001), 1.85);
        // ConeGeometry UV.y = 1 di puncak (sumber lampu) dan 0 di dasar lebar
        float axialFade = smoothstep(0.0, 0.78, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
        float alpha = uOpacity * rim * axialFade * 1.65;
        gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 0.65));
      }
    `,
  });
}

/**
 * Kubah langit malam Bandung dengan bintang, kabut bulan samar, dan siluet pegunungan Bandung Utara.
 */
export function createNightSkyDome(): {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
} {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uDawnMix: { value: 0 },
    },
    vertexShader: `
      varying vec3 vLocalDir;
      void main() {
        vLocalDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uDawnMix;
      varying vec3 vLocalDir;

      float hash31(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      vec3 hash33(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yxz + 19.19);
        return fract((p.xxy + p.yxx) * p.zyx);
      }

      float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 4; i++) {
          v += a * noise2D(p);
          p = rot * p * 2.04 + vec2(17.1, 31.7);
          a *= 0.5;
        }
        return v;
      }

      float starLayer(vec3 dir, float scale, float density) {
        vec3 p = dir * scale;
        vec3 id = floor(p);
        vec3 f = fract(p) - 0.5;
        vec3 rnd = hash33(id);
        if (rnd.x < density) return 0.0;
        vec3 offset = (rnd - 0.5) * 0.58;
        float d = length(f - offset);
        float glint = smoothstep(0.14, 0.015, d);
        float twinkle = 0.65 + 0.35 * sin(uTime * (1.2 + rnd.y * 2.8) + rnd.z * 42.0);
        return glint * twinkle;
      }

      void main() {
        vec3 dir = normalize(vLocalDir);
        float elev = dir.y;
        float azim = (abs(dir.x) + abs(dir.z)) > 0.001 ? atan(dir.z, dir.x) : 0.0;

        // Gradien langit malam alami Bandung -> horizon berembun (aman dari NaN/spot hitam)
        vec3 zenithCol = mix(vec3(0.015, 0.026, 0.05), vec3(0.14, 0.24, 0.42), uDawnMix);
        vec3 midCol = mix(vec3(0.036, 0.06, 0.102), vec3(0.32, 0.36, 0.48), uDawnMix);
        vec3 horizCol = mix(vec3(0.072, 0.092, 0.122), vec3(0.75, 0.48, 0.32), uDawnMix);
        vec3 skyCol = mix(horizCol, midCol, smoothstep(0.0, 0.34, max(elev, 0.0)));
        skyCol = mix(skyCol, zenithCol, smoothstep(0.28, 0.88, max(elev, 0.0)));

        // Bulan bercahaya lembut dengan tekstur kawah & pendar atmosferik
        vec3 moonDir = normalize(vec3(0.46, 0.56, -0.68));
        float mDot = max(dot(dir, moonDir), 0.001);
        float moonHalo = pow(mDot, 10.0) * 0.22 + pow(mDot, 96.0) * 0.42;
        skyCol += vec3(0.55, 0.68, 0.88) * moonHalo * (1.0 - uDawnMix * 0.5);

        float moonDisc = smoothstep(0.9989, 0.99935, mDot);
        if (moonDisc > 0.001) {
          float crater = noise2D(dir.xy * 115.0 + dir.z * 85.0);
          vec3 moonSurface = mix(vec3(0.74, 0.8, 0.88), vec3(0.96, 0.98, 1.0), crater);
          skyCol = mix(skyCol, moonSurface, moonDisc * (1.0 - uDawnMix * 0.35));
        }

        // Bintang 3D bebas distorsi kutub + kilau halus berbagai temperatur warna
        if (elev > 0.02) {
          float s1 = starLayer(dir, 95.0, 0.945);
          float s2 = starLayer(dir + vec3(0.37), 185.0, 0.935) * 0.62;
          float starVis = smoothstep(0.02, 0.22, elev) * (1.0 - uDawnMix * 0.85) * (1.0 - moonDisc);
          vec3 sCol = mix(vec3(0.78, 0.88, 1.0), vec3(1.0, 0.92, 0.78), hash31(floor(dir * 95.0)));
          skyCol += sCol * (s1 + s2) * starVis * 0.9;
        }

        // Awan malam bergerak halus yang memantulkan cahaya bulan di bagian tepi (tidak menghitam)
        if (elev > 0.0) {
          vec2 cUv = (dir.xz / (elev + 0.28)) * 0.72 + vec2(uTime * 0.006, uTime * 0.003);
          float cDense = fbm(cUv);
          float cWisp = fbm(cUv * 2.1 - vec2(uTime * 0.004, 0.0));
          float cloudMask = smoothstep(0.46, 0.86, cDense * 0.74 + cWisp * 0.3) * smoothstep(0.0, 0.22, elev);
          vec3 cloudDark = mix(vec3(0.042, 0.058, 0.088), vec3(0.28, 0.24, 0.32), uDawnMix);
          vec3 cloudLit = mix(vec3(0.16, 0.22, 0.31), vec3(0.78, 0.56, 0.42), uDawnMix);
          float moonLitCloud = pow(mDot, 3.0) * 0.85 + 0.15;
          vec3 cloudCol = mix(cloudDark, cloudLit, moonLitCloud);
          skyCol = mix(skyCol, cloudCol, cloudMask * 0.52);
        }

        // Siluet pegunungan Bandung Utara (Tangkuban Perahu & Lembang) + kabut lembah di kaki langit
        float ridge = 0.068
          + sin(azim * 3.0 + 0.4) * 0.024
          + cos(azim * 7.0 - 0.8) * 0.015
          + sin(azim * 17.0) * 0.006
          + fbm(vec2(azim * 6.0, 2.0)) * 0.018;
        float mtnMask = 1.0 - smoothstep(ridge - 0.008, ridge + 0.005, elev);
        vec3 mtnCol = mix(vec3(0.024, 0.034, 0.042), vec3(0.048, 0.062, 0.075), smoothstep(-0.08, ridge, elev));
        skyCol = mix(skyCol, mtnCol, mtnMask);

        gl_FragColor = vec4(max(skyCol, vec3(0.0)), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(92, 48, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return { mesh, mat };
}

/**
 * Gerbang Depan, Pilar Batu Kali Art-Deco, Lentera Gerbang, Gapura Besi Tempa "666", & Celah Pagar Barat.
 */
export function createCompoundFenceAndGatehouse(
  gateZ: number,
  maxAniso = 4
): {
  group: THREE.Group;
  lanternLights: THREE.PointLight[];
  lanternBulbs: THREE.MeshBasicMaterial[];
} {
  const group = new THREE.Group();
  const lanternLights: THREE.PointLight[] = [];
  const lanternBulbs: THREE.MeshBasicMaterial[] = [];

  const stoneTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#3c423e';
      ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < 12; row++) {
        const y = (row / 12) * h;
        const rowH = h / 12;
        const offset = (row % 2) * 18;
        for (let col = -1; col < 10; col++) {
          const x = col * 36 + offset;
          const shade = 44 + ((row * 17 + col * 31) % 28);
          ctx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 1})`;
          ctx.beginPath();
          ctx.roundRect(x + 2, y + 2, 32, rowH - 4, 6);
          ctx.fill();
        }
      }
      // Lumut dan rembesan hujan Bandung
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(24, 42, 26, 0.25)' : 'rgba(12, 15, 13, 0.28)';
        ctx.fillRect((i * 47) % w, 0, 5 + (i % 6), h);
      }
    },
    3,
    1,
    maxAniso
  );

  const stuccoTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#adb3aa';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 450; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(30,36,33,0.1)' : 'rgba(230,235,225,0.08)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 8, 3 + Math.random() * 8);
      }
    },
    1,
    2,
    maxAniso
  );

  const riverStoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: stoneTex,
    bumpMap: stoneTex,
    bumpScale: 0.035,
    roughness: 0.92,
  });
  const pillarStuccoMat = new THREE.MeshStandardMaterial({
    color: 0xc2c6bc,
    map: stuccoTex,
    bumpMap: stuccoTex,
    bumpScale: 0.02,
    roughness: 0.86,
  });
  const copingMat = new THREE.MeshStandardMaterial({ color: 0x525953, roughness: 0.84 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1a1f22, roughness: 0.4, metalness: 0.84 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc79a48, roughness: 0.32, metalness: 0.82 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x5e3422, roughness: 0.78, metalness: 0.45 });
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x1c311f, roughness: 0.9 });

  const spearProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.022, 0.018),
    new THREE.Vector2(0.015, 0.042),
    new THREE.Vector2(0.038, 0.08),
    new THREE.Vector2(0.024, 0.125),
    new THREE.Vector2(0.0, 0.195),
  ];
  const spearGeo = new THREE.LatheGeometry(spearProfile, 8);
  const barGeo = new THREE.CylinderGeometry(0.02, 0.022, 1.04, 8);

  // 1. Tembok batu kali rendah + coping beton miring + kisi besi tempa berujung tombak
  const spans = [
    [-18.2, -15.4],
    [-11.8, -6.8],
    [-4.2, 18.2],
  ];
  for (const [startX, endX] of spans) {
    const spanW = endX - startX;
    const cx = (startX + endX) * 0.5;

    const stoneWall = new THREE.Mesh(new THREE.BoxGeometry(spanW, 1.04, 0.34), riverStoneMat);
    stoneWall.position.set(cx, 0.52, gateZ);
    stoneWall.castShadow = true;
    stoneWall.receiveShadow = true;
    group.add(stoneWall);

    const coping = new THREE.Mesh(new THREE.BoxGeometry(spanW + 0.08, 0.1, 0.44), copingMat);
    coping.position.set(cx, 1.09, gateZ);
    coping.castShadow = true;
    group.add(coping);

    for (const ry of [1.26, 2.04]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(spanW, 0.055, 0.07), ironMat);
      rail.position.set(cx, ry, gateZ);
      rail.castShadow = true;
      group.add(rail);
    }

    for (let x = startX + 0.34; x <= endX - 0.32; x += 0.36) {
      const bar = new THREE.Mesh(barGeo, ironMat);
      bar.position.set(x, 1.62, gateZ);
      bar.castShadow = true;
      const tip = new THREE.Mesh(spearGeo, ironMat);
      tip.position.set(x, 2.13, gateZ);
      group.add(bar, tip);

      if (Math.round((x - startX) / 0.36) % 2 === 1 && x + 0.36 <= endX - 0.3) {
        const rosette = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.013, 6, 14), ironMat);
        rosette.position.set(x + 0.18, 1.66, gateZ);
        group.add(rosette);
      }
    }
  }

  // 2. Pilar-pilar gerbang & pagar (Pilar utama -6.8/-4.2 + Pilar Gerbang Garasi Mobil -15.4/-11.8)
  const pillarXs = [-18.2, -15.4, -11.8, -6.8, -4.2, 6.8, 18.2];
  for (const px of pillarXs) {
    const isMainGate = px === -6.8 || px === -4.2;
    const isGaragePillar = px === -15.4 || px === -11.8;
    const pw = isMainGate ? 0.68 : isGaragePillar ? 0.56 : 0.48;
    const ph = isMainGate ? 2.68 : isGaragePillar ? 2.45 : 2.32;

    // Alas batu kali bertingkat
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.18, 0.62, pw + 0.18), riverStoneMat);
    plinth.position.set(px, 0.31, gateZ);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    // Badan pilar plester dengan lis vertikal
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(pw, ph - 0.62, pw), pillarStuccoMat);
    shaft.position.set(px, 0.62 + (ph - 0.62) * 0.5, gateZ);
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    group.add(shaft);

    // Panel cerukan pada pilar gerbang utama
    if (isMainGate) {
      const reveal = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.18, ph - 1.1, pw + 0.04), copingMat);
      reveal.position.set(px, 1.62, gateZ);
      group.add(reveal);
    }

    // Kapital bertingkat + topi piramid batu
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.2, 0.12, pw + 0.2), copingMat);
    cornice.position.set(px, ph + 0.06, gateZ);
    const capPyr = new THREE.Mesh(new THREE.ConeGeometry(pw * 0.62, 0.28, 4), copingMat);
    capPyr.rotation.y = Math.PI / 4;
    capPyr.position.set(px, ph + 0.26, gateZ);
    group.add(cornice, capPyr);

    // Lentera besi tempa heksagonal menyala di atas 2 pilar Gerbang Utama (-6.8 dan -4.2)
    if (isMainGate) {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.16, 6), ironMat);
      ped.position.set(px, ph + 0.38, gateZ);
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.14, 0.36, 6), ironMat);
      cage.position.set(px, ph + 0.62, gateZ);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.18, 6), ironMat);
      roof.position.set(px, ph + 0.88, gateZ);
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), brassMat);
      finial.position.set(px, ph + 1.0, gateZ);

      const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd284 });
      const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.24, 6), bulbMat);
      bulb.position.set(px, ph + 0.62, gateZ);
      lanternBulbs.push(bulbMat);

      const pLight = new THREE.PointLight(0xffb55a, 4.4, 15, 1.5);
      pLight.position.set(px, ph + 0.65, gateZ + 0.35);
      lanternLights.push(pLight);

      group.add(ped, cage, roof, finial, bulb, pLight);
    }

    // Lampu peringatan & rambu keluar-masuk mobil di pilar Gerbang Garasi (-15.4 & -11.8)
    if (isGaragePillar) {
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 0.14, 10),
        new THREE.MeshBasicMaterial({ color: 0xffaa3b })
      );
      beacon.position.set(px, ph + 0.48, gateZ);
      group.add(beacon);

      for (let v = 0; v < 4; v++) {
        const vine = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), vineMat);
        vine.position.set(px + (px === -15.4 ? 0.22 : -0.22), 0.9 + v * 0.34, gateZ + (v % 2 === 0 ? 0.2 : -0.18));
        group.add(vine);
      }
    }
  }

  // Palang gawang besi atas gerbang garasi + papan GARASI / AWAS KELUAR MASUK MOBIL
  const garageBeam = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 0.16), ironMat);
  garageBeam.position.set(-13.6, 2.52, gateZ);
  group.add(garageBeam);
  const garSign = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.24, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x222629, roughness: 0.6 })
  );
  garSign.position.set(-13.6, 2.52, gateZ + 0.09);
  group.add(garSign);

  // 3. Gapura Besi Tempa Lengkung di atas Gerbang Utama (tinggi > 2.68m, aman dilewati)
  const archTopCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-6.8, 2.75, gateZ),
    new THREE.Vector3(-6.15, 3.28, gateZ),
    new THREE.Vector3(-5.5, 3.48, gateZ),
    new THREE.Vector3(-4.85, 3.28, gateZ),
    new THREE.Vector3(-4.2, 2.75, gateZ),
  ]);
  const archOuter = new THREE.Mesh(new THREE.TubeGeometry(archTopCurve, 26, 0.045, 8, false), ironMat);
  archOuter.castShadow = true;
  group.add(archOuter);

  const archInnerCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-6.6, 2.66, gateZ),
    new THREE.Vector3(-6.05, 3.08, gateZ),
    new THREE.Vector3(-5.5, 3.24, gateZ),
    new THREE.Vector3(-4.95, 3.08, gateZ),
    new THREE.Vector3(-4.4, 2.66, gateZ),
  ]);
  const archInner = new THREE.Mesh(new THREE.TubeGeometry(archInnerCurve, 22, 0.025, 8, false), ironMat);
  group.add(archInner);

  for (let u = 0.16; u <= 0.85; u += 0.17) {
    const p1 = archInnerCurve.getPointAt(u);
    const p2 = archTopCurve.getPointAt(u);
    const mid = p1.clone().add(p2).multiplyScalar(0.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 12), brassMat);
    ring.position.copy(mid);
    group.add(ring);
  }

  // Plakat nomor rumah "666 · SUKAJADI" di puncak gapura gerbang + kotak surat kuningan di pilar kanan
  const signTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#181412';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#c99c4a';
      ctx.lineWidth = 8;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#d9b56c';
      ctx.font = 'bold 54px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('NO. 666', w * 0.5, h * 0.52);
      ctx.fillStyle = '#a89f8d';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('JL. SUKAJADI · BANDUNG', w * 0.5, h * 0.8);
    },
    1,
    1,
    maxAniso,
    true,
    512,
    192
  );
  const gatePlaque = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.44, 0.08),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.45, metalness: 0.5 })
  );
  gatePlaque.position.set(-5.5, 3.44, gateZ);
  group.add(gatePlaque);

  const mailbox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.2), rustMat);
  mailbox.position.set(-4.2, 1.32, gateZ + 0.42);
  const mailSlot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), brassMat);
  mailSlot.position.set(-4.2, 1.4, gateZ + 0.52);
  group.add(mailbox, mailSlot);

  // 4. Detail Celah Pagar Barat (-15.0..-13.2): jeruji tertekuk paksa & rantai gembok terputus
  const bentBar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.35, 8), rustMat);
  bentBar.position.set(-14.8, 0.72, gateZ - 0.14);
  bentBar.rotation.z = -0.38;
  bentBar.rotation.x = 0.26;
  const brokenChain = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 10), rustMat);
  brokenChain.position.set(-14.7, 1.18, gateZ + 0.16);
  group.add(bentBar, brokenChain);

  return { group, lanternLights, lanternBulbs };
}

/**
 * Kanopi Carport / Garasi Mobil Rumah Gurita lengkap dengan kolom beton-baja, atap bergelombang,
 * lampu neon garasi, ganjalan roda, rak perkakas, jeriken, dan ban cadangan.
 */
export function createGarageCarportStructure(maxAniso = 4): THREE.Group {
  const g = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x1e2428, roughness: 0.44, metalness: 0.82 });
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x4b514c, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createCorrugatedZincTexture(maxAniso),
    roughness: 0.62,
    metalness: 0.35,
  });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x151718, roughness: 0.92 });
  const redCanMat = new THREE.MeshStandardMaterial({ color: 0x8f241c, roughness: 0.55 });
  const hazardMat = new THREE.MeshStandardMaterial({ color: 0xd49b2a, roughness: 0.5 });

  // 4 Tiang besi berumpak beton tepat di tepi carport (-16.6..-10.0, Z: 11.2..19.2)
  for (const [px, pz] of [[-16.6, 11.2], [-16.6, 19.2], [-10.0, 11.2], [-10.0, 19.2]]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.32), plinthMat);
    foot.position.set(px, 0.21, pz);
    const colH = pz > 15 ? 2.55 : 2.85;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, colH, 0.16), steelMat);
    post.position.set(px, colH * 0.5, pz);
    post.castShadow = true;
    g.add(foot, post);
  }

  // Rangka balok memanjang & melintang atap carport + kanopi bergelombang miring ke depan
  for (const bx of [-16.6, -13.3, -10.0]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 8.6), steelMat);
    beam.position.set(bx, 2.74, 15.2);
    beam.rotation.x = 0.04;
    g.add(beam);
  }
  for (const bz of [11.2, 13.8, 16.5, 19.2]) {
    const purlin = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.1, 0.1), steelMat);
    purlin.position.set(-13.3, bz > 15 ? 2.66 : 2.84, bz);
    g.add(purlin);
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.08, 9.0), roofMat);
  canopy.position.set(-13.3, 2.82, 15.2);
  canopy.rotation.x = 0.04;
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  g.add(canopy);

  // Lampu neon garasi di langit-langit kanopi + cahaya hangat redup
  const neonHousing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.18), steelMat);
  neonHousing.position.set(-13.3, 2.66, 15.2);
  const neonTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.35, 8),
    new THREE.MeshBasicMaterial({ color: 0xe6f2ff })
  );
  neonTube.rotation.z = Math.PI / 2;
  neonTube.position.set(-13.3, 2.6, 15.2);
  const garageLight = new THREE.PointLight(0xd9e8ff, 3.0, 12, 1.5);
  garageLight.position.set(-13.3, 2.45, 15.2);
  g.add(neonHousing, neonTube, garageLight);

  // Ganjalan roda karet di lantai parkir + strip batas parkir kuning + rak perkakas & ban serep
  for (const wx of [-14.4, -12.8]) {
    const chock = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.18), hazardMat);
    chock.position.set(wx, 0.02, 12.6);
    g.add(chock);
  }
  const spareTire = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.095, 10, 18), rubberMat);
  spareTire.position.set(-16.1, 0.36, 12.4);
  spareTire.rotation.y = 0.35;
  const jerrycan = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 0.34), redCanMat);
  jerrycan.position.set(-16.15, 0.19, 13.2);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.35, 1.45), steelMat);
  shelf.position.set(-16.25, 0.68, 14.5);
  shelf.castShadow = true;
  g.add(spareTire, jerrycan, shelf);

  return g;
}

function createCarWheel(tireMat: THREE.Material, chromeMat: THREE.Material, radius = 0.33): THREE.Group {
  const wheelGrp = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.22, 20), tireMat);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const wallOuter = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.78, 0.055, 8, 18), tireMat);
  wallOuter.rotation.y = Math.PI / 2;
  wallOuter.position.x = 0.095;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, 0.23, 14), chromeMat);
  rim.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 10), chromeMat);
  hub.rotation.z = Math.PI / 2;
  wheelGrp.add(tire, wallOuter, rim, hub);
  for (let s = 0; s < 5; s++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.24, radius * 1.1, 0.036), chromeMat);
    spoke.rotation.x = (s / 5) * Math.PI;
    wheelGrp.add(spoke);
  }
  return wheelGrp;
}

/**
 * Kendaraan Terparkir di Halaman / Carport dalam Gerbang Rumah Gurita berdetail tinggi.
 */
export function createParkedVehicle(kind: 'sedan' | 'motor'): THREE.Group {
  const g = new THREE.Group();
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x151718, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc2cbd1, roughness: 0.24, metalness: 0.86 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xa2abb0, roughness: 0.28, metalness: 0.8 });
  const darkTrimMat = new THREE.MeshStandardMaterial({ color: 0x16191c, roughness: 0.72 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a2c35,
    roughness: 0.08,
    metalness: 0.18,
    clearcoat: 0.9,
    transparent: true,
    opacity: 0.84,
  });

  if (kind === 'sedan') {
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x5c2320,
      roughness: 0.28,
      metalness: 0.48,
      clearcoat: 0.75,
      clearcoatRoughness: 0.16,
    });
    const profile = new THREE.Shape();
    profile.moveTo(-2.05, 0.28);
    profile.lineTo(2.05, 0.28);
    profile.lineTo(2.08, 0.62);
    profile.lineTo(1.88, 0.74);
    profile.lineTo(1.02, 0.82);
    profile.lineTo(0.42, 1.32);
    profile.lineTo(-0.88, 1.32);
    profile.lineTo(-1.42, 0.84);
    profile.lineTo(-2.02, 0.78);
    profile.lineTo(-2.08, 0.45);
    profile.closePath();

    const bodyGeo = new THREE.ExtrudeGeometry(profile, {
      depth: 1.66,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 2,
    });
    bodyGeo.rotateY(Math.PI / 2);
    bodyGeo.translate(-0.83, 0, 0);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const cabinGlass = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.43, 1.88), glassMat);
    cabinGlass.position.set(0, 1.07, -0.2);
    g.add(cabinGlass);

    // Pilar B & bingkai kaca + wiper depan + spion samping + gagang pintu krom
    for (const sx of [-0.79, 0.79]) {
      const bPillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.1), darkTrimMat);
      bPillar.position.set(sx, 1.07, -0.22);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.12), bodyMat);
      mirror.position.set(sx + Math.sign(sx) * 0.12, 0.88, 0.62);
      const handleF = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.14), rimMat);
      handleF.position.set(sx + Math.sign(sx) * 0.11, 0.68, 0.25);
      const handleR = handleF.clone();
      handleR.position.z = -0.52;
      g.add(bPillar, mirror, handleF, handleR);
    }

    // Gril depan, sepasang lampu kotak & sein kuning, plat nomor hitam D 666 RG, & knalpot
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.06), darkTrimMat);
    grille.position.set(0, 0.52, 2.09);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.5 });
    const plateF = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.04), plateMat);
    plateF.position.set(0, 0.34, 2.16);
    const plateR = plateF.clone();
    plateR.position.set(0, 0.54, -2.1);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.22, 8), rimMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(-0.52, 0.24, -2.14);
    g.add(grille, plateF, plateR, exhaust);

    const headMat = new THREE.MeshStandardMaterial({ color: 0xe6e0c8, roughness: 0.2 });
    const amberMat = new THREE.MeshStandardMaterial({ color: 0xc9741c, roughness: 0.3 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x8f1a16, roughness: 0.3 });
    for (const lx of [-0.62, 0.62]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.06), headMat);
      hl.position.set(lx, 0.52, 2.08);
      const turn = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.06), amberMat);
      turn.position.set(lx + Math.sign(lx) * 0.2, 0.52, 2.07);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.15, 0.06), tailMat);
      tl.position.set(lx, 0.58, -2.09);
      g.add(hl, turn, tl);
    }

    for (const bx of [-0.84, 0.84]) {
      for (const bz of [-1.28, 1.28]) {
        const w = createCarWheel(tireMat, rimMat, 0.32);
        w.position.set(bx, 0.32, bz);
        g.add(w);
      }
    }
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.14, 0.18), metalMat);
    bumperF.position.set(0, 0.34, 2.08);
    const bumperR = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.14, 0.18), metalMat);
    bumperR.position.set(0, 0.34, -2.08);
    g.add(bumperF, bumperR);
  } else {
    // Motor sport klasik 1980-an Bandung berdetail rangka, suspensi, spakbor, lampu bulat, spion & knalpot
    const paintMat = new THREE.MeshPhysicalMaterial({ color: 0x1f364d, roughness: 0.3, metalness: 0.55, clearcoat: 0.8 });
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.86 });
    const headGlass = new THREE.MeshStandardMaterial({ color: 0xf0e8cc, roughness: 0.15 });
    const tailRed = new THREE.MeshStandardMaterial({ color: 0xa61d17, roughness: 0.3 });

    for (const wz of [-0.64, 0.64]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.068, 10, 20), tireMat);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(0, 0.32, wz);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 6, 16), rimMat);
      rim.rotation.y = Math.PI / 2;
      rim.position.set(0, 0.32, wz);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.1, 10), rimMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(0, 0.32, wz);
      g.add(wheel, rim, hub);
      for (let sp = 0; sp < 6; sp++) {
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4), rimMat);
        spoke.rotation.x = (sp / 6) * Math.PI;
        spoke.position.set(0, 0.32, wz);
        g.add(spoke);
      }
    }

    // Spakbor depan & belakang melengkung + mesin ber-sirip + sokbreker belakang ganda
    const fenderF = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.12, 12, 1, true, -0.7, 1.4), metalMat);
    fenderF.rotation.z = Math.PI / 2;
    fenderF.position.set(0, 0.34, 0.64);
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.3), metalMat);
    engine.position.set(0, 0.44, 0.04);
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.36, 6, 12), paintMat);
    tank.rotation.x = Math.PI / 2 - 0.15;
    tank.position.set(0, 0.84, 0.18);
    tank.castShadow = true;
    const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.44, 6, 12), leatherMat);
    seat.rotation.x = Math.PI / 2;
    seat.position.set(0, 0.78, -0.25);

    for (const sx of [-0.075, 0.075]) {
      const forkTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.72, 8), rimMat);
      forkTube.rotation.x = -0.35;
      forkTube.position.set(sx, 0.64, 0.5);
      const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.36, 8), rimMat);
      shock.rotation.x = 0.28;
      shock.position.set(sx * 1.4, 0.54, -0.44);
      const mirrorStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6), rimMat);
      mirrorStem.position.set(sx * 3.8, 1.08, 0.38);
      const mirrorHead = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.055, 0.03), darkTrimMat);
      mirrorHead.position.set(sx * 4.1, 1.16, 0.36);
      g.add(forkTube, shock, mirrorStem, mirrorHead);
    }

    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.68, 8), rimMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.98, 0.38);
    const headlamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.1, 12), headGlass);
    headlamp.rotation.x = Math.PI / 2;
    headlamp.position.set(0, 0.86, 0.58);
    const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.06), tailRed);
    taillight.position.set(0, 0.74, -0.68);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.048, 0.92, 8), rimMat);
    exhaust.rotation.x = Math.PI / 2 + 0.08;
    exhaust.position.set(0.16, 0.34, -0.32);
    const kickstand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), darkTrimMat);
    kickstand.rotation.z = 0.42;
    kickstand.position.set(-0.14, 0.16, -0.05);
    g.add(fenderF, engine, tank, seat, bar, headlamp, taillight, exhaust, kickstand);
  }

  return g;
}

function createArticulatedMouth(
  _skinMat: THREE.Material,
  facingSign: 1 | -1 = 1,
  lipColorHex = 0x8a5147,
  scale = 1.0,
  showTeeth = true
): { mouthGroup: THREE.Group; mouthPivot: THREE.Group; mouthCavity: THREE.Mesh } {
  const mouthGroup = new THREE.Group();
  const lipMat = new THREE.MeshStandardMaterial({ color: lipColorHex, roughness: 0.72 });
  const cavityMat = new THREE.MeshBasicMaterial({ color: 0x240a0c });
  const teethMat = new THREE.MeshStandardMaterial({ color: 0xdad4c2, roughness: 0.45 });

  // Bibir kapsul melengkung halus menempel rapi mengikuti kontur wajah bulat (tanpa balok persegi menonjol)
  const upperLip = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.0046 * scale, 0.024 * scale, 4, 8),
    lipMat
  );
  upperLip.rotation.z = Math.PI / 2;
  upperLip.position.set(0, 0.0045 * scale, facingSign * 0.0055 * scale);

  const mouthCavity = new THREE.Mesh(
    new THREE.SphereGeometry(0.015 * scale, 10, 8),
    cavityMat
  );
  mouthCavity.scale.set(1.28, 0.05, 0.42);
  mouthCavity.position.set(0, -0.001 * scale, facingSign * 0.0015 * scale);

  const mouthPivot = new THREE.Group();
  mouthPivot.position.set(0, -0.004 * scale, 0);

  const lowerLip = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.0044 * scale, 0.021 * scale, 4, 8),
    lipMat
  );
  lowerLip.rotation.z = Math.PI / 2;
  lowerLip.position.set(0, 0, facingSign * 0.005 * scale);
  mouthPivot.add(lowerLip);

  mouthGroup.add(upperLip, mouthCavity, mouthPivot);

  if (showTeeth) {
    const upperTeeth = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.003 * scale, 0.018 * scale, 4, 6),
      teethMat
    );
    upperTeeth.rotation.z = Math.PI / 2;
    upperTeeth.position.set(0, 0.0018 * scale, facingSign * 0.0012 * scale);
    mouthGroup.add(upperTeeth);
  }

  return { mouthGroup, mouthPivot, mouthCavity };
}

export interface ArrivalCarRig {
  group: THREE.Group;
  doorPivot: THREE.Group;
  driverHead: THREE.Group;
  driverMouthPivot: THREE.Group;
  driverMouthCavity: THREE.Mesh;
  steeringWheelPivot: THREE.Group;
  wiperPivotL: THREE.Group;
  wiperPivotR: THREE.Group;
  tasbihPivot: THREE.Group;
  wheels: THREE.Object3D[];
  interiorLight: THREE.PointLight;
  headlightL: THREE.SpotLight;
  headlightR: THREE.SpotLight;
  headlightTargetL: THREE.Object3D;
  headlightTargetR: THREE.Object3D;
  taillightMat: THREE.MeshBasicMaterial;
  dashGlowMat: THREE.MeshBasicMaterial;
}

/**
 * Mobil Pengantar (MPV/Station Wagon 80-an Setir Kanan Indonesia) untuk Animasi Kedatangan & Keberangkatan.
 * Arah depan lokal menghadap -Z; pintu penumpang kiri berengsel di sisi -X (menghadap Warung Ceu Titin).
 */
export function createArrivalCar(): ArrivalCarRig {
  const group = new THREE.Group();
  const wheels: THREE.Object3D[] = [];

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x26353a,
    roughness: 0.34,
    metalness: 0.46,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.78, metalness: 0.25 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xc2cbd1, roughness: 0.24, metalness: 0.86 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x121415, roughness: 0.92 });
  const interiorMat = new THREE.MeshStandardMaterial({ color: 0x28231e, roughness: 0.88 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x3b312a, roughness: 0.85 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x8bb2bf,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
  });
  const dashGlowMat = new THREE.MeshBasicMaterial({ color: 0xffb35c });
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff0cc });
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xd9261c });

  // Sasis bawah, lantai kabin, atap, kap mesin melandai (tidak menutup area kabin kamera!)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.16, 4.3), trimMat);
  chassis.position.set(0, 0.3, 0);
  chassis.castShadow = true;
  group.add(chassis);

  // Kap mesin depan (Z: -2.15 .. -0.95)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.48, 1.24), bodyMat);
  hood.position.set(0, 0.62, -1.56);
  hood.rotation.x = 0.06;
  hood.castShadow = true;
  group.add(hood);

  // Gril depan, bemper krom, dan sepasang lampu utama
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.26, 0.08), trimMat);
  grille.position.set(0, 0.6, -2.18);
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.14, 0.18), chromeMat);
  bumperF.position.set(0, 0.36, -2.2);
  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.14, 0.18), chromeMat);
  bumperR.position.set(0, 0.36, 2.2);
  group.add(grille, bumperF, bumperR);

  for (const lx of [-0.66, 0.66]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.08), headlightMat);
    hl.position.set(lx, 0.62, -2.18);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 0.08), taillightMat);
    tl.position.set(lx, 0.66, 2.16);
    group.add(hl, tl);
  }

  // Sisi kanan penuh (+X) + bagian belakang bagasi (+Z) + pilar A/B/C + atap kabin (memberi interior nyata!)
  const rightSideLow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.56, 3.05), bodyMat);
  rightSideLow.position.set(0.86, 0.64, 0.55);
  const rightPillarA = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), bodyMat);
  rightPillarA.position.set(0.84, 1.22, -0.78);
  rightPillarA.rotation.x = -0.38;
  const leftPillarA = rightPillarA.clone();
  leftPillarA.position.x = -0.84;
  const rightPillarB = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.68, 0.1), bodyMat);
  rightPillarB.position.set(0.84, 1.24, 0.42);
  const leftPillarB = rightPillarB.clone();
  leftPillarB.position.x = -0.84;
  const rightPillarC = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.68, 0.28), bodyMat);
  rightPillarC.position.set(0.84, 1.24, 1.88);
  const leftPillarC = rightPillarC.clone();
  leftPillarC.position.x = -0.84;

  // Panel bodi kiri belakang (di belakang pintu penumpang kiri yang berengsel)
  const leftRearBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.56, 1.62), bodyMat);
  leftRearBody.position.set(-0.86, 0.64, 1.26);
  const rearTailgate = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.58, 0.14), bodyMat);
  rearTailgate.position.set(0, 0.65, 2.08);
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.52, 0.06), glassMat);
  rearGlass.position.set(0, 1.24, 2.04);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 2.9), bodyMat);
  roof.position.set(0, 1.56, 0.6);
  roof.castShadow = true;

  // Kaca depan bening berbingkai
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.68, 0.04), glassMat);
  windshield.position.set(0, 1.22, -0.82);
  windshield.rotation.x = -0.38;

  const rearviewMirror = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.075, 0.05), trimMat);
  rearviewMirror.position.set(0, 1.42, -0.62);

  // Tasbih kayu menggantung di kaca spion tengah
  const tasbihPivot = new THREE.Group();
  tasbihPivot.position.set(0, 1.38, -0.62);
  const beadMat = new THREE.MeshStandardMaterial({ color: 0x6b4528, roughness: 0.72 });
  const tasbihLoop = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 6, 12), beadMat);
  tasbihLoop.position.y = -0.045;
  tasbihPivot.add(tasbihLoop);

  // Tanda "TRAVEL SUKAJADI" bercahaya di atas atap + rak bagasi atap klasik + pelindung matahari
  const roofRackMat = new THREE.MeshStandardMaterial({ color: 0x3b4044, metalness: 0.8, roughness: 0.4 });
  for (const rz of [-0.4, 1.4]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.04, 0.05), roofRackMat);
    bar.position.set(0, 1.63, rz);
    group.add(bar);
  }
  const taxiSign = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.14, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffcf6b })
  );
  taxiSign.position.set(0, 1.67, -0.1);
  const sunVisorL = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.015, 0.16), interiorMat);
  sunVisorL.position.set(-0.42, 1.48, -0.64);
  sunVisorL.rotation.x = 0.25;
  const sunVisorR = sunVisorL.clone();
  sunVisorR.position.x = 0.42;
  const domeLamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.03, 0.14),
    new THREE.MeshBasicMaterial({ color: 0xffd78a })
  );
  domeLamp.position.set(0, 1.51, 0.05);

  group.add(
    rightSideLow,
    rightPillarA,
    leftPillarA,
    rightPillarB,
    leftPillarB,
    rightPillarC,
    leftPillarC,
    leftRearBody,
    rearTailgate,
    rearGlass,
    roof,
    windshield,
    rearviewMirror,
    tasbihPivot,
    taxiSign,
    sunVisorL,
    sunVisorR,
    domeLamp
  );

  // Dashboard interior, radio kaset bercahaya, konsol tengah + tuas persneling, & setir kanan (RHD Indonesia)
  const dashboard = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.35, 0.44), interiorMat);
  dashboard.position.set(0, 0.78, -0.78);
  const speedoCluster = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.04), dashGlowMat);
  speedoCluster.position.set(0.42, 0.9, -0.57);
  const radioHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.08, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x45d68a })
  );
  radioHead.position.set(0, 0.8, -0.55);
  const centerConsole = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.92), interiorMat);
  centerConsole.position.set(0, 0.44, -0.15);
  const gearStick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.26, 6), chromeMat);
  gearStick.position.set(0, 0.62, -0.25);
  gearStick.rotation.x = 0.18;
  const gearKnob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), trimMat);
  gearKnob.position.set(0, 0.75, -0.22);
  const handbrake = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.24, 6), trimMat);
  handbrake.rotation.x = 1.15;
  handbrake.position.set(0.04, 0.56, 0.06);

  const steeringCol = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.28, 8), trimMat);
  steeringCol.rotation.x = 1.05;
  steeringCol.position.set(0.42, 0.86, -0.44);
  const steeringWheelPivot = new THREE.Group();
  steeringWheelPivot.position.set(0.42, 0.92, -0.32);
  steeringWheelPivot.rotation.x = -0.52;
  const steeringWheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 18), trimMat);
  const steeringSpokeH = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.02), chromeMat);
  const steeringHub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), trimMat);
  steeringHub.rotation.x = Math.PI / 2;
  steeringWheelPivot.add(steeringWheelRim, steeringSpokeH, steeringHub);

  // Jok pengemudi kanan + jok penumpang kiri + jok bangku belakang (tempat AI squad ikut di mobil!)
  const makeCarSeat = (sx: number, sz: number) => {
    const s = new THREE.Group();
    s.position.set(sx, 0, sz);
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.46), seatMat);
    cushion.position.set(0, 0.45, 0);
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.54, 0.13), seatMat);
    backrest.position.set(0, 0.76, 0.18);
    backrest.rotation.x = -0.15;
    const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.1), seatMat);
    headrest.position.set(0, 1.12, 0.22);
    s.add(cushion, backrest, headrest);
    return s;
  };
  const driverSeat = makeCarSeat(0.42, -0.04);
  const leftSeat = makeCarSeat(-0.4, 0.14);
  const rearBenchCushion = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.15, 0.48), seatMat);
  rearBenchCushion.position.set(0, 0.46, 0.92);
  const rearBenchBack = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.58, 0.14), seatMat);
  rearBenchBack.position.set(0, 0.78, 1.18);
  rearBenchBack.rotation.x = -0.14;

  // Figur 3D Pa Nanang duduk rapi proporsional di kursi kemudi kanan (x = +0.42)
  const driverSkinMat = new THREE.MeshStandardMaterial({ color: 0xc4916b, roughness: 0.64 });
  const driverJacketMat = new THREE.MeshStandardMaterial({ color: 0x56644d, roughness: 0.8 });
  const driverShirtMat = new THREE.MeshStandardMaterial({ color: 0xded7c5, roughness: 0.78 });
  const driverPantsMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.86 });
  const driverHairMat = new THREE.MeshStandardMaterial({ color: 0x191a1c, roughness: 0.88 });
  const driverPeciMat = new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.86 });

  const driverHip = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.165, 0.14, 10), driverPantsMat);
  driverHip.scale.set(1.12, 1.0, 0.85);
  driverHip.position.set(0.42, 0.56, -0.02);
  for (const tx of [-0.085, 0.085]) {
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.36, 8), driverPantsMat);
    thigh.rotation.x = Math.PI * 0.48;
    thigh.position.set(0.42 + tx, 0.57, -0.2);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.044, 0.34, 8), driverPantsMat);
    shin.rotation.x = -0.22;
    shin.position.set(0.42 + tx, 0.4, -0.36);
    group.add(thigh, shin);
  }

  const driverBody = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.155, 0.46, 12), driverJacketMat);
  driverBody.scale.set(1.12, 1.0, 0.7);
  driverBody.position.set(0.42, 0.84, -0.02);
  const driverVNeck = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.24, 0.04), driverShirtMat);
  driverVNeck.position.set(0.42, 0.94, -0.13);
  const driverCollar = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.02, 6, 12), driverShirtMat);
  driverCollar.rotation.x = Math.PI / 2;
  driverCollar.position.set(0.42, 1.08, -0.02);

  // Sepasang lengan bersegmen (bahu -> lengan atas -> siku -> lengan bawah -> telapak memegang kemudi)
  for (const side of [-1, 1] as (-1 | 1)[]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.056, 8, 8), driverJacketMat);
    shoulder.position.set(0.42 + side * 0.2, 1.0, -0.03);
    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.04, 0.22, 8), driverJacketMat);
    upperArm.position.set(0.42 + side * 0.19, 0.92, -0.12);
    upperArm.rotation.set(Math.PI * 0.34, 0, -side * 0.18);
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.22, 8), driverJacketMat);
    forearm.position.set(0.42 + side * 0.16, 0.9, -0.24);
    forearm.rotation.set(Math.PI * 0.46, side * 0.12, 0);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.052, 0.036), driverSkinMat);
    palm.position.set(0.42 + side * 0.145, 0.92, -0.325);
    group.add(shoulder, upperArm, forearm, palm);
  }

  const driverNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.062, 0.09, 8), driverSkinMat);
  driverNeck.position.set(0.42, 1.1, -0.02);

  const driverHead = new THREE.Group();
  driverHead.position.set(0.42, 1.22, -0.03);
  const dSkull = new THREE.Mesh(new THREE.SphereGeometry(0.132, 16, 14), driverSkinMat);
  dSkull.scale.set(0.94, 1.06, 0.98);
  const dNose = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.042, 6), driverSkinMat);
  dNose.rotation.x = -Math.PI * 0.42;
  dNose.position.set(0, -0.008, -0.13);
  const dHairSide = new THREE.Mesh(
    new THREE.SphereGeometry(0.136, 12, 8, 0, Math.PI * 2, Math.PI * 0.18, Math.PI * 0.36),
    driverHairMat
  );
  dHairSide.position.set(0, 0.01, 0.008);
  // Kopiah/peci bulat-oval meruncing rapi mengikuti lingkar kepala (bukan kotak kaku!)
  const dPeci = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.136, 0.092, 18), driverPeciMat);
  dPeci.scale.set(0.95, 1.0, 1.08);
  dPeci.position.set(0, 0.105, 0.004);
  const dPeciCrown = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), driverPeciMat);
  dPeciCrown.scale.set(0.95, 0.25, 1.08);
  dPeciCrown.position.set(0, 0.148, 0.004);
  const dMustache = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.05, 4, 6), driverHairMat);
  dMustache.rotation.z = Math.PI / 2;
  dMustache.position.set(0, -0.04, -0.125);
  for (const ex of [-0.042, 0.042]) {
    const dEar = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), driverSkinMat);
    dEar.scale.set(0.45, 0.85, 0.65);
    dEar.position.set(Math.sign(ex) * 0.125, 0.004, 0.005);
    const dSclera = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xe6e2d8 })
    );
    dSclera.scale.set(1.1, 0.8, 0.5);
    dSclera.position.set(ex, 0.016, -0.122);
    const dEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x161616 })
    );
    dEye.position.set(ex, 0.016, -0.128);
    const dBrow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.009, 0.012), driverHairMat);
    dBrow.position.set(ex, 0.042, -0.124);
    driverHead.add(dEar, dSclera, dEye, dBrow);
  }
  driverHead.add(dSkull, dNose, dHairSide, dPeci, dPeciCrown, dMustache);
  const dMouth = createArticulatedMouth(driverSkinMat, -1, 0x7c4b42, 0.88, false);
  dMouth.mouthGroup.position.set(0, -0.052, -0.119);
  driverHead.add(dMouth.mouthGroup);

  group.add(
    dashboard,
    speedoCluster,
    radioHead,
    centerConsole,
    gearStick,
    gearKnob,
    handbrake,
    steeringCol,
    steeringWheelPivot,
    driverSeat,
    leftSeat,
    rearBenchCushion,
    rearBenchBack,
    driverHip,
    driverBody,
    driverVNeck,
    driverCollar,
    driverNeck,
    driverHead
  );

  // Pintu penumpang kiri (-X) berengsel di pilar A (-0.86, 0.36, -0.78)
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.86, 0.36, -0.78);
  const doorLower = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.56, 1.18), bodyMat);
  doorLower.position.set(0, 0.28, 0.59);
  const doorWindowFrameTop = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.14), bodyMat);
  doorWindowFrameTop.position.set(0, 1.14, 0.6);
  const doorWindowFrameRear = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.6, 0.07), bodyMat);
  doorWindowFrameRear.position.set(0, 0.84, 1.15);
  const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.54, 1.02), glassMat);
  doorGlass.position.set(0, 0.84, 0.6);
  const sideMirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.12), trimMat);
  sideMirror.position.set(-0.1, 0.58, 0.16);
  doorPivot.add(doorLower, doorWindowFrameTop, doorWindowFrameRear, doorGlass, sideMirror);
  group.add(doorPivot);

  // 4 Roda bervelg palang 5 + plat nomor depan/belakang + wiper + pipa knalpot
  for (const wx of [-0.88, 0.88]) {
    for (const wz of [-1.36, 1.32]) {
      const wheelGrp = createCarWheel(tireMat, chromeMat, 0.34);
      wheelGrp.position.set(wx, 0.34, wz);
      group.add(wheelGrp);
      wheels.push(wheelGrp);
    }
  }
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x0e1012, roughness: 0.45 });
  const plateFront = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.04), plateMat);
  plateFront.position.set(0, 0.36, -2.29);
  const plateRear = plateFront.clone();
  plateRear.position.set(0, 0.6, 2.2);
  const tailpipe = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.22, 8), chromeMat);
  tailpipe.rotation.x = Math.PI / 2;
  tailpipe.position.set(-0.56, 0.26, 2.22);

  const wiperPivotL = new THREE.Group();
  wiperPivotL.position.set(-0.42, 0.91, -0.96);
  const wiperBladeL = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.018, 0.02), trimMat);
  wiperBladeL.position.set(0.22, 0, 0);
  wiperPivotL.add(wiperBladeL);

  const wiperPivotR = new THREE.Group();
  wiperPivotR.position.set(0.16, 0.91, -0.96);
  const wiperBladeR = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.018, 0.02), trimMat);
  wiperBladeR.position.set(0.22, 0, 0);
  wiperPivotR.add(wiperBladeR);

  // Lis karet samping bodi, lampu sein samping kuning, & mudflap belakang
  const amberSideMat = new THREE.MeshStandardMaterial({ color: 0xe68a1e, roughness: 0.35 });
  for (const sx of [-0.91, 0.91]) {
    const molding = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.045, 3.8), trimMat);
    molding.position.set(sx, 0.52, 0.05);
    const sideBlink = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 0.08), amberSideMat);
    sideBlink.position.set(sx, 0.64, -1.12);
    const mudflap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.03), tireMat);
    mudflap.position.set(Math.sign(sx) * 0.84, 0.2, 1.72);
    group.add(molding, sideBlink, mudflap);
  }
  group.add(plateFront, plateRear, tailpipe, wiperPivotL, wiperPivotR);

  // Lampu kabin di depan tengah agar wajah Pa Nanang, dasbor, & kemudi terang merata dari sudut penumpang
  const interiorLight = new THREE.PointLight(0xffd699, 1.25, 5.2, 1.4);
  interiorLight.position.set(-0.08, 1.42, -0.36);
  group.add(interiorLight);

  const headlightL = new THREE.SpotLight(0xfff0cc, 14.0, 38, Math.PI / 4.8, 0.55, 1.25);
  const headlightR = new THREE.SpotLight(0xfff0cc, 14.0, 38, Math.PI / 4.8, 0.55, 1.25);
  headlightL.position.set(-0.66, 0.64, -2.22);
  headlightR.position.set(0.66, 0.64, -2.22);
  const headlightTargetL = new THREE.Object3D();
  const headlightTargetR = new THREE.Object3D();
  headlightTargetL.position.set(-0.9, 0.15, -14);
  headlightTargetR.position.set(0.9, 0.15, -14);
  headlightL.target = headlightTargetL;
  headlightR.target = headlightTargetR;
  group.add(headlightL, headlightR, headlightTargetL, headlightTargetR);

  const coneMat = createVolumetricConeMaterial(0xffe8ba, 0.065);
  for (const cx of [-0.66, 0.66]) {
    const beamCone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 9.5, 18, 1, true), coneMat);
    beamCone.rotation.x = Math.PI / 2;
    beamCone.position.set(cx, 0.54, -7.0);
    group.add(beamCone);
  }

  return {
    group,
    doorPivot,
    driverHead,
    driverMouthPivot: dMouth.mouthPivot,
    driverMouthCavity: dMouth.mouthCavity,
    steeringWheelPivot,
    wiperPivotL,
    wiperPivotR,
    tasbihPivot,
    wheels,
    interiorLight,
    headlightL,
    headlightR,
    headlightTargetL,
    headlightTargetR,
    taillightMat,
    dashGlowMat,
  };
}

/**
 * Ornamen Patung Karang, Keong Spiral, Tangki Silinder, Tangga Kolam, & Pagar Pipa Parapet Rooftop (sesuai foto udara Rumah Gurita).
 */
export function createRooftopSculptures(): THREE.Group {
  const g = new THREE.Group();
  const coralMat = new THREE.MeshStandardMaterial({ color: 0x4b514e, roughness: 0.92, flatShading: true });
  const darkRock = new THREE.MeshStandardMaterial({ color: 0x2b302f, roughness: 0.9 });
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x696357, roughness: 0.84 });
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x5c4734, roughness: 0.85 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x2a3134, roughness: 0.4, metalness: 0.78 });

  // 1. Lengkungan & terowongan karang batu laut + patung tong kayu beruas (persis foto udara image_1f280594)
  for (let i = 0; i < 6; i++) {
    const pillar = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.7 + (i % 2) * 0.28, 0),
      i % 2 === 0 ? coralMat : darkRock
    );
    pillar.position.set(-10.2 + i * 1.45, 0.65, -8.15 + (i % 2) * 0.35);
    pillar.scale.set(1.0, 1.5, 0.92);
    pillar.castShadow = true;
    g.add(pillar);
  }

  const coralArch = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.32, 7, 12, Math.PI), coralMat);
  coralArch.position.set(-7.6, 0.85, -8.2);
  g.add(coralArch);

  // Tong kayu berbingkai besi (di utara-tengah atap pada foto udara)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 1.75, 14), barrelMat);
  barrel.position.set(-4.6, 0.92, -8.0);
  barrel.castShadow = true;
  g.add(barrel);
  for (const ry of [0.35, 0.92, 1.48]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.04, 6, 16), railMat);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(-4.6, ry, -8.0);
    g.add(hoop);
  }

  // 2. Patung Keong & Cangkang Kerang Raksasa bersusun di atap
  const conchPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.75, 0.22),
    new THREE.Vector2(0.66, 0.65),
    new THREE.Vector2(0.5, 1.08),
    new THREE.Vector2(0.3, 1.45),
    new THREE.Vector2(0.06, 1.78),
    new THREE.Vector2(0.0, 1.9),
  ];
  const shell = new THREE.Mesh(new THREE.LatheGeometry(conchPts, 14), shellMat);
  shell.position.set(6.5, 0.25, -8.1);
  shell.rotation.x = 0.36;
  shell.rotation.z = -0.22;
  shell.castShadow = true;
  g.add(shell);

  for (let s = 0; s < 3; s++) {
    const scallop = new THREE.Mesh(new THREE.CylinderGeometry(0.68 - s * 0.12, 0.45, 1.35, 10, 1, false, 0, Math.PI), coralMat);
    scallop.position.set(8.2 + s * 1.15, 0.72, -8.1);
    scallop.castShadow = true;
    g.add(scallop);
  }

  // 3. Menara silinder beton di bibir depan atap (seperti pot/cerobong putih di foto udara)
  const frontTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.56, 1.05, 14), new THREE.MeshStandardMaterial({ color: 0xd4d8d0, roughness: 0.82 }));
  frontTurret.position.set(1.2, 0.54, 7.6);
  const frontTurretRim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 8, 16), new THREE.MeshStandardMaterial({ color: 0xe6e8e0, roughness: 0.78 }));
  frontTurretRim.rotation.x = Math.PI / 2;
  frontTurretRim.position.set(1.2, 1.06, 7.6);
  g.add(frontTurret, frontTurretRim);

  // 4. Tangga stainless kolam rooftop (-7.5, -5.6)
  for (const sz of [-5.85, -5.35]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.85, 6), railMat);
    rail.position.set(-5.55, 0.42, sz);
    g.add(rail);
  }

  // 5. Pagar pipa besi pengaman di atas parapet rooftop L-shape
  const railNorth = new THREE.Mesh(new THREE.BoxGeometry(24.2, 0.05, 0.05), railMat);
  railNorth.position.set(0, 1.38, -9.5);
  const railSouth = new THREE.Mesh(new THREE.BoxGeometry(27.2, 0.05, 0.05), railMat);
  railSouth.position.set(1.5, 1.38, 8.5);
  const railWest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 18.0), railMat);
  railWest.position.set(-12.0, 1.38, -0.5);
  const railEastN = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 8.5), railMat);
  railEastN.position.set(12.0, 1.38, -5.25);
  const railEastStep = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.05, 0.05), railMat);
  railEastStep.position.set(13.5, 1.38, -1.0);
  const railEastS = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 9.5), railMat);
  railEastS.position.set(15.0, 1.38, 3.75);
  g.add(railNorth, railSouth, railWest, railEastN, railEastStep, railEastS);

  return g;
}

/**
 * Tiang Lampu Jalan Komplek Sukajadi (PJU) leher angsa melengkung dengan kerucut cahaya volumetrik lembut.
 */
export function createStreetLamp(): THREE.Group {
  const g = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x262c30, roughness: 0.42, metalness: 0.78 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd788 });

  const baseProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.22, 0.0),
    new THREE.Vector2(0.18, 0.36),
    new THREE.Vector2(0.11, 0.62),
    new THREE.Vector2(0.085, 0.75),
  ];
  const base = new THREE.Mesh(new THREE.LatheGeometry(baseProfile, 12), steelMat);
  g.add(base);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 4.75, 10), steelMat);
  pole.position.y = 3.05;
  pole.castShadow = true;
  g.add(pole);

  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 5.25, 0),
    new THREE.Vector3(0.22, 5.62, 0),
    new THREE.Vector3(0.72, 5.74, 0),
    new THREE.Vector3(1.12, 5.62, 0),
  ]);
  const arm = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 12, 0.042, 8, false), steelMat);
  g.add(arm);

  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.14, 12), steelMat);
  hood.scale.set(1.35, 1, 0.88);
  hood.position.set(1.16, 5.58, 0);
  g.add(hood);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6), bulbMat);
  bulb.position.set(1.16, 5.52, 0);
  g.add(bulb);

  const haloCone = new THREE.Mesh(
    new THREE.ConeGeometry(2.35, 5.2, 20, 1, true),
    createVolumetricConeMaterial(0xffc978, 0.055)
  );
  haloCone.position.set(1.16, 2.9, 0);
  g.add(haloCone);

  return g;
}

let cachedBarkTex: THREE.CanvasTexture | null = null;
let cachedLeafClusterTex: THREE.CanvasTexture | null = null;
let cachedPineNeedleTex: THREE.CanvasTexture | null = null;

function getTreeBarkTexture(): THREE.CanvasTexture {
  if (cachedBarkTex) return cachedBarkTex;
  cachedBarkTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#332318';
      ctx.fillRect(0, 0, w, h);
      // Celah kulit kayu beralur dalam + serat berpilin alami
      for (let i = 0; i < 640; i++) {
        const x = (i * 23 + Math.sin(i * 0.7) * 9 + w) % w;
        const y = (i * 47) % h;
        ctx.fillStyle =
          i % 4 === 0
            ? 'rgba(14, 9, 6, 0.65)'
            : i % 3 === 0
              ? 'rgba(72, 54, 38, 0.34)'
              : 'rgba(104, 82, 62, 0.16)';
        ctx.fillRect(x, y, 1.5 + (i % 4), 22 + (i % 52));
      }
      // Simpul mata kayu & bercak lumut tropis lembap
      for (let m = 0; m < 60; m++) {
        const mx = (m * 71) % w;
        const my = (m * 97) % h;
        ctx.fillStyle = m % 2 === 0 ? 'rgba(34, 58, 28, 0.32)' : 'rgba(20, 14, 10, 0.45)';
        ctx.beginPath();
        ctx.ellipse(mx, my, 5 + (m % 9), 10 + (m % 16), (m % 5) * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    2,
    4,
    4,
    true,
    256,
    256
  );
  return cachedBarkTex;
}

function getLeafClusterTexture(): THREE.CanvasTexture {
  if (cachedLeafClusterTex) return cachedLeafClusterTex;
  cachedLeafClusterTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      // Ranting kayu bercabang halus dari bawah ke atas
      ctx.strokeStyle = '#3d2c1e';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.96);
      ctx.quadraticCurveTo(w * 0.46, h * 0.64, w * 0.52, h * 0.24);
      ctx.stroke();

      const subBranches: Array<[number, number, number, number]> = [
        [0.49, 0.78, 0.2, 0.55],
        [0.49, 0.72, 0.8, 0.52],
        [0.48, 0.54, 0.16, 0.3],
        [0.5, 0.48, 0.84, 0.28],
        [0.51, 0.34, 0.32, 0.12],
        [0.52, 0.3, 0.68, 0.14],
      ];
      ctx.lineWidth = 3;
      for (const [x0, y0, x1, y1] of subBranches) {
        ctx.beginPath();
        ctx.moveTo(x0 * w, y0 * h);
        ctx.lineTo(x1 * w, y1 * h);
        ctx.stroke();
      }

      // Helai daun tropis meruncing tak beraturan (asimetris, bercelah, tanpa pola radial generik)
      let seed = 1337;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      const palette = ['#486640', '#638457', '#82a375', '#a6c496', '#c5dec0'];
      for (let i = 0; i < 72; i++) {
        const b = subBranches[i % subBranches.length];
        const t = 0.2 + rand() * 0.88;
        const cx = (b[0] + (b[2] - b[0]) * t) * w + (rand() - 0.5) * 48;
        const cy = (b[1] + (b[3] - b[1]) * t) * h + (rand() - 0.5) * 44;
        const angle = Math.atan2(b[3] - b[1], b[2] - b[0]) + (rand() - 0.5) * 1.45;
        const len = 24 + rand() * 24;
        const wid = 9 + rand() * 8;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
        ctx.beginPath();
        ctx.moveTo(-len * 0.45, 0);
        ctx.quadraticCurveTo(-len * 0.08, -wid, len * 0.55, 0);
        ctx.quadraticCurveTo(-len * 0.08, wid, -len * 0.45, 0);
        ctx.fill();
        ctx.strokeStyle = 'rgba(220,240,210,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-len * 0.38, 0);
        ctx.lineTo(len * 0.42, 0);
        ctx.stroke();
        ctx.restore();
      }
    },
    1,
    1,
    4,
    true,
    512,
    512
  );
  cachedLeafClusterTex.wrapS = THREE.ClampToEdgeWrapping;
  cachedLeafClusterTex.wrapT = THREE.ClampToEdgeWrapping;
  return cachedLeafClusterTex;
}

function getPineNeedleTexture(): THREE.CanvasTexture {
  if (cachedPineNeedleTex) return cachedPineNeedleTex;
  cachedPineNeedleTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      let seed = 4242;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      ctx.strokeStyle = '#3a2a1c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w * 0.14, h * 0.85);
      ctx.quadraticCurveTo(w * 0.48, h * 0.55, w * 0.86, h * 0.22);
      ctx.stroke();

      for (let i = 0; i < 160; i++) {
        const t = 0.08 + rand() * 0.88;
        const sx = (0.14 + 0.72 * t) * w + (rand() - 0.5) * 46;
        const sy = (0.85 - 0.63 * t) * h + (rand() - 0.5) * 46;
        const ang = -Math.PI * 0.35 + (rand() - 0.5) * 2.1;
        const len = 26 + rand() * 34;
        ctx.strokeStyle = i % 3 === 0 ? '#78996f' : i % 2 === 0 ? '#a4c49a' : '#cee2c6';
        ctx.lineWidth = 1.6 + rand() * 1.4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
        ctx.stroke();
      }
    },
    1,
    1,
    4,
    true,
    512,
    512
  );
  cachedPineNeedleTex.wrapS = THREE.ClampToEdgeWrapping;
  cachedPineNeedleTex.wrapT = THREE.ClampToEdgeWrapping;
  return cachedPineNeedleTex;
}

/**
 * Membangun batang atau dahan tirus berkelok organik (lebar di pangkal, menyempit di ujung).
 */
function addOrganicTaperedLimb(
  parent: THREE.Object3D,
  pts: THREE.Vector3[],
  baseRadius: number,
  tipRadius: number,
  mat: THREE.Material,
  tubularSegments = 10,
  radialSegments = 7
): void {
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, tubularSegments, 1, radialSegments, false);
  const pos = geo.attributes.position;
  const ringVerts = radialSegments + 1;
  const center = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let s = 0; s <= tubularSegments; s++) {
    const t = s / tubularSegments;
    curve.getPointAt(t, center);
    const r = baseRadius + (tipRadius - baseRadius) * Math.pow(t, 0.85);
    for (let j = 0; j < ringVerts; j++) {
      const idx = s * ringVerts + j;
      v.fromBufferAttribute(pos, idx).sub(center);
      // Gurat beralur halus di pangkal akar/batang
      const fluting = 1 + (1 - t) * 0.14 * Math.sin(j * 2.4 + t * 4);
      v.multiplyScalar(r * fluting).add(center);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

/**
 * Menambahkan rumpun dedaunan organik 3D volumetrik pada tajuk & ranting pohon:
 * Menggabungkan inti tajuk rimbun 3D ber-normal terarah radial (shading volumetrik lembut alami)
 * dengan gugusan kelopak daun alpha-cutout bersilang mengitari tajuk (bebas kesan kardus/AI kaku).
 */
function addCrossedFoliageSpray(
  parent: THREE.Object3D,
  pos: THREE.Vector3,
  size: number,
  mat: THREE.Material,
  seedAngle: number,
  coreMat?: THREE.Material
): void {
  const radius = size * 0.52;
  // 1. Inti tajuk volumetrik organik
  const puffGeo = new THREE.DodecahedronGeometry(radius, 1);
  const pPos = puffGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pPos.count; i++) {
    v.fromBufferAttribute(pPos, i);
    const noise = 1 + Math.sin(v.x * 2.6 + seedAngle) * 0.12 + Math.cos(v.y * 2.9 + seedAngle * 1.5) * 0.12;
    v.multiplyScalar(noise);
    pPos.setXYZ(i, v.x, v.y, v.z);
  }
  puffGeo.computeVertexNormals();

  // Haluskan normal mengarah keluar dari pusat tajuk agar shading daun lembut
  const pNorm = puffGeo.attributes.normal;
  for (let i = 0; i < pPos.count; i++) {
    v.fromBufferAttribute(pPos, i).normalize();
    pNorm.setXYZ(i, v.x, v.y, v.z);
  }

  const puff = new THREE.Mesh(puffGeo, coreMat ?? mat);
  puff.position.copy(pos);
  puff.castShadow = true;
  puff.receiveShadow = true;
  parent.add(puff);

  // 2. Gugusan helai daun alpha-cutout alami mengitari tajuk di 6 sudut 3D berbeda
  const cardCount = 6;
  const cardSize = size * 0.88;
  for (let c = 0; c < cardCount; c++) {
    const ang = (c / cardCount) * Math.PI * 2 + seedAngle;
    const elev = (c % 2 === 0 ? 0.22 : -0.18) * radius;
    const dist = radius * (0.65 + (c % 3) * 0.14);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(cardSize, cardSize * 0.84), mat);
    plane.position.set(
      pos.x + Math.cos(ang) * dist,
      pos.y + elev,
      pos.z + Math.sin(ang) * dist
    );
    plane.rotation.set(
      (c % 2 === 0 ? 0.32 : -0.26),
      ang + Math.PI / 2 + (c % 2 === 0 ? 0.35 : -0.35),
      (c % 3 - 1) * 0.22
    );
    plane.castShadow = true;
    parent.add(plane);
  }
}

/**
 * Pepohonan Bandung Alami & Organik (batang tirus berkelok + akar banir, dahan bercabang ranting,
 * dan rumpun daun alpha cutout bersilang 3D bebas dari bola/kerucut/silinder kaku):
 * - 'pinus': batang bengkok beralur + ranting bertingkat tak beraturan + kipas jarum pinus
 * - 'mangga': batang berakar banir & dahan menjuntai + gugus daun lebat tak simetris + buah mangga
 * - 'ketapang': ketapang bercabang bertingkat asimetris + akar gantung halus & hamparan daun tipis
 * - 'palem': batang beruas melengkung + mahkota hijau + pelepah busur berbilah anak daun menyirip
 */
export function createStreetTree(kind: TreeKind = 'mangga', scale = 1, tintHex = 0x1b2b20): THREE.Group {
  const tree = new THREE.Group();
  const canopyPivot = new THREE.Group();
  tree.add(canopyPivot);
  tree.userData.canopyPivot = canopyPivot;

  const barkTex = getTreeBarkTexture();
  const leafTex = getLeafClusterTexture();
  const pineTex = getPineNeedleTexture();

  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: barkTex,
    bumpMap: barkTex,
    bumpScale: 0.055,
    roughness: 0.95,
  });
  const branchMat = new THREE.MeshStandardMaterial({
    color: 0xa89684,
    map: barkTex,
    roughness: 0.92,
  });
  const leafLight = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tintHex).offsetHSL(0.015, 0.05, 0.07).getHex(),
    roughness: 0.84,
  });
  const leafDark = new THREE.MeshStandardMaterial({
    color: tintHex,
    roughness: 0.88,
  });
  const leafCardMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tintHex).offsetHSL(0.01, 0.06, 0.1).getHex(),
    map: kind === 'pinus' ? pineTex : leafTex,
    alphaTest: 0.34,
    side: THREE.DoubleSide,
    roughness: 0.84,
  });
  const deepLeafCardMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tintHex).offsetHSL(-0.01, 0.04, 0.02).getHex(),
    map: kind === 'pinus' ? pineTex : leafTex,
    alphaTest: 0.36,
    side: THREE.DoubleSide,
    roughness: 0.88,
  });

  if (kind === 'pinus') {
    addOrganicTaperedLimb(
      tree,
      [
        new THREE.Vector3(0, -0.04, 0),
        new THREE.Vector3(0.08, 1.9, -0.05),
        new THREE.Vector3(-0.07, 4.3, 0.08),
        new THREE.Vector3(0.05, 6.7, 0.02),
        new THREE.Vector3(0.02, 7.6, -0.02),
      ],
      0.27,
      0.045,
      trunkMat,
      14,
      8
    );

    // Akar menjalar organik mencengkeram tanah
    for (let r = 0; r < 5; r++) {
      const ang = (r / 5) * Math.PI * 2 + 0.35;
      addOrganicTaperedLimb(
        tree,
        [
          new THREE.Vector3(Math.cos(ang) * 0.08, 0.55, Math.sin(ang) * 0.08),
          new THREE.Vector3(Math.cos(ang) * 0.28, 0.16, Math.sin(ang) * 0.28),
          new THREE.Vector3(Math.cos(ang) * 0.62, -0.04, Math.sin(ang) * 0.62),
        ],
        0.1,
        0.025,
        trunkMat,
        6,
        5
      );
    }

    const tiers = [
      { y: 2.6, r: 2.15, count: 5 },
      { y: 3.65, r: 1.8, count: 5 },
      { y: 4.7, r: 1.4, count: 4 },
      { y: 5.75, r: 0.98, count: 4 },
      { y: 6.65, r: 0.6, count: 3 },
    ];
    tiers.forEach((b, idx) => {
      for (let a = 0; a < b.count; a++) {
        const ang = (a / b.count) * Math.PI * 2 + idx * 0.72 + (a % 2) * 0.2;
        const tipX = Math.cos(ang) * b.r;
        const tipZ = Math.sin(ang) * b.r;
        const tipY = b.y + (a % 2 === 0 ? -0.18 : 0.14);
        addOrganicTaperedLimb(
          canopyPivot,
          [
            new THREE.Vector3(0, b.y + 0.1, 0),
            new THREE.Vector3(tipX * 0.45, b.y - 0.12, tipZ * 0.45),
            new THREE.Vector3(tipX, tipY, tipZ),
          ],
          0.06,
          0.018,
          branchMat,
          6,
          5
        );
        addCrossedFoliageSpray(
          canopyPivot,
          new THREE.Vector3(tipX * 0.78, tipY + 0.08, tipZ * 0.78),
          b.r * 0.96,
          (idx + a) % 2 === 0 ? leafCardMat : deepLeafCardMat,
          ang,
          (idx + a) % 2 === 0 ? leafLight : leafDark
        );
      }
    });
    addCrossedFoliageSpray(
      canopyPivot,
      new THREE.Vector3(0.02, 7.45, -0.02),
      1.35,
      leafCardMat,
      0.5,
      leafLight
    );
  } else if (kind === 'ketapang') {
    addOrganicTaperedLimb(
      tree,
      [
        new THREE.Vector3(0, -0.04, 0),
        new THREE.Vector3(-0.07, 1.5, 0.05),
        new THREE.Vector3(0.06, 3.2, -0.03),
        new THREE.Vector3(-0.02, 5.2, 0.04),
      ],
      0.34,
      0.08,
      trunkMat,
      12,
      8
    );

    for (let r = 0; r < 5; r++) {
      const ang = (r / 5) * Math.PI * 2 + 0.15;
      addOrganicTaperedLimb(
        tree,
        [
          new THREE.Vector3(Math.cos(ang) * 0.12, 0.72, Math.sin(ang) * 0.12),
          new THREE.Vector3(Math.cos(ang) * 0.4, 0.2, Math.sin(ang) * 0.4),
          new THREE.Vector3(Math.cos(ang) * 0.78, -0.05, Math.sin(ang) * 0.78),
        ],
        0.12,
        0.028,
        trunkMat,
        6,
        5
      );
    }

    const tiers = [
      { y: 3.1, r: 2.65, branches: 5 },
      { y: 4.25, r: 2.05, branches: 5 },
      { y: 5.2, r: 1.35, branches: 4 },
    ];
    tiers.forEach((d, idx) => {
      for (let b = 0; b < d.branches; b++) {
        const ang = (b / d.branches) * Math.PI * 2 + idx * 0.62 + (b % 2) * 0.16;
        const ex = Math.cos(ang) * d.r;
        const ez = Math.sin(ang) * d.r;
        addOrganicTaperedLimb(
          canopyPivot,
          [
            new THREE.Vector3(0, d.y - 0.18, 0),
            new THREE.Vector3(ex * 0.48, d.y + 0.04, ez * 0.48),
            new THREE.Vector3(ex * 0.92, d.y + 0.12, ez * 0.92),
          ],
          0.072,
          0.02,
          branchMat,
          7,
          5
        );

        const forkAng = ang + (b % 2 === 0 ? 0.46 : -0.42);
        const fx = Math.cos(forkAng) * d.r * 0.96;
        const fz = Math.sin(forkAng) * d.r * 0.96;
        addOrganicTaperedLimb(
          canopyPivot,
          [
            new THREE.Vector3(ex * 0.48, d.y + 0.04, ez * 0.48),
            new THREE.Vector3(fx, d.y + 0.18, fz),
          ],
          0.036,
          0.014,
          branchMat,
          5,
          4
        );

        addCrossedFoliageSpray(
          canopyPivot,
          new THREE.Vector3(ex * 0.76, d.y + 0.16, ez * 0.76),
          d.r * 0.9,
          b % 2 === 0 ? leafCardMat : deepLeafCardMat,
          ang,
          b % 2 === 0 ? leafLight : leafDark
        );
        addCrossedFoliageSpray(
          canopyPivot,
          new THREE.Vector3(fx * 0.84, d.y + 0.22, fz * 0.84),
          d.r * 0.72,
          deepLeafCardMat,
          forkAng,
          leafDark
        );
      }
    });
  } else if (kind === 'palem') {
    const crownX = 0.52;
    const crownY = 5.65;
    addOrganicTaperedLimb(
      tree,
      [
        new THREE.Vector3(0, -0.04, 0),
        new THREE.Vector3(0.1, 1.8, 0.03),
        new THREE.Vector3(0.28, 3.7, -0.05),
        new THREE.Vector3(crownX, crownY, 0),
      ],
      0.22,
      0.13,
      trunkMat,
      14,
      8
    );

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.19, 0.82, 8),
      new THREE.MeshStandardMaterial({ color: 0x35592b, roughness: 0.72 })
    );
    collar.position.set(crownX + 0.02, crownY + 0.28, 0);
    tree.add(collar);

    const fruitMat = new THREE.MeshStandardMaterial({ color: 0x4b5c25, roughness: 0.65 });
    for (let k = 0; k < 4; k++) {
      const ka = (k / 4) * Math.PI * 2;
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 7), fruitMat);
      nut.position.set(crownX + Math.cos(ka) * 0.18, crownY - 0.12, Math.sin(ka) * 0.18);
      tree.add(nut);
    }

    for (let f = 0; f < 12; f++) {
      const ang = (f / 12) * Math.PI * 2 + (f % 3) * 0.12;
      const pitchBoost = f % 2 === 0 ? 0.18 : -0.1;
      const frondGroup = new THREE.Group();
      frondGroup.position.set(crownX, crownY + 0.56, 0);
      frondGroup.rotation.y = ang;

      const ribCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.75, 0.44 + pitchBoost, 0),
        new THREE.Vector3(1.58, 0.24 + pitchBoost * 0.6, 0),
        new THREE.Vector3(2.28, -0.44 + pitchBoost * 0.3, 0),
      ]);
      const rib = new THREE.Mesh(new THREE.TubeGeometry(ribCurve, 9, 0.028, 5, false), leafLight);
      rib.castShadow = true;
      frondGroup.add(rib);

      for (let step = 1; step <= 7; step++) {
        const t = step / 7.5;
        const pt = ribCurve.getPoint(t);
        const bladeLen = 0.84 - t * 0.36;
        for (const side of [-1, 1]) {
          const leaflet = new THREE.Mesh(
            new THREE.PlaneGeometry(0.14, bladeLen),
            f % 2 === 0 ? leafDark : leafLight
          );
          leaflet.material.side = THREE.DoubleSide;
          leaflet.position.set(pt.x, pt.y - bladeLen * 0.32, side * 0.13);
          leaflet.rotation.set(side * 0.44, side * 0.28, -0.28 - t * 0.18);
          frondGroup.add(leaflet);
        }
      }
      canopyPivot.add(frondGroup);
    }
  } else {
    // 'mangga': pohon rindang berbatang tirus + akar banir + dahan bercabang ranting + rumpun daun alpha silang 3D + buah
    addOrganicTaperedLimb(
      tree,
      [
        new THREE.Vector3(0, -0.04, 0),
        new THREE.Vector3(0.09, 1.15, 0.06),
        new THREE.Vector3(-0.06, 2.35, -0.03),
      ],
      0.34,
      0.21,
      trunkMat,
      10,
      8
    );

    for (let r = 0; r < 5; r++) {
      const ang = (r / 5) * Math.PI * 2 + 0.4;
      addOrganicTaperedLimb(
        tree,
        [
          new THREE.Vector3(Math.cos(ang) * 0.1, 0.68, Math.sin(ang) * 0.1),
          new THREE.Vector3(Math.cos(ang) * 0.36, 0.18, Math.sin(ang) * 0.36),
          new THREE.Vector3(Math.cos(ang) * 0.72, -0.04, Math.sin(ang) * 0.72),
        ],
        0.11,
        0.025,
        trunkMat,
        6,
        5
      );
    }

    const limbs = [
      { ox: 1.18, oy: 3.45, oz: 0.56, r: 1.62 },
      { ox: -1.25, oy: 3.55, oz: -0.45, r: 1.56 },
      { ox: 0.32, oy: 3.8, oz: -1.15, r: 1.48 },
      { ox: -0.35, oy: 3.9, oz: 1.05, r: 1.65 },
      { ox: 0.16, oy: 4.55, oz: 0.12, r: 1.55 },
    ];
    const fruitMat = new THREE.MeshStandardMaterial({ color: 0x6b8f3a, roughness: 0.55 });

    limbs.forEach((b, idx) => {
      addOrganicTaperedLimb(
        canopyPivot,
        [
          new THREE.Vector3(0, 2.2, 0),
          new THREE.Vector3(b.ox * 0.48, 2.85, b.oz * 0.48),
          new THREE.Vector3(b.ox * 1.18, b.oy, b.oz * 1.18),
        ],
        0.13,
        0.04,
        branchMat,
        8,
        6
      );

      // Ranting sekunder bercabang alami
      addOrganicTaperedLimb(
        canopyPivot,
        [
          new THREE.Vector3(b.ox * 0.68, 3.05, b.oz * 0.68),
          new THREE.Vector3(b.ox * 1.52, b.oy + 0.38, b.oz * 0.92),
        ],
        0.055,
        0.018,
        branchMat,
        6,
        5
      );

      addCrossedFoliageSpray(
        canopyPivot,
        new THREE.Vector3(b.ox * 1.24, b.oy + 0.35, b.oz * 1.24),
        b.r * 1.42,
        idx % 2 === 0 ? leafCardMat : deepLeafCardMat,
        idx * 1.15,
        idx % 2 === 0 ? leafLight : leafDark
      );
      addCrossedFoliageSpray(
        canopyPivot,
        new THREE.Vector3(b.ox * 1.56, b.oy + 0.58, b.oz * 0.96),
        b.r * 1.12,
        deepLeafCardMat,
        idx * 1.85 + 0.5,
        leafDark
      );

      const mango = new THREE.Mesh(new THREE.SphereGeometry(0.085, 7, 7), fruitMat);
      mango.scale.set(0.85, 1.35, 0.85);
      mango.position.set(b.ox * 1.22, b.oy + 0.04, b.oz * 1.22);
      canopyPivot.add(mango);
    });
  }

  tree.scale.setScalar(scale);
  return tree;
}

export function createRadioTower(): { group: THREE.Group; beacon: THREE.Mesh } {
  const group = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x5c6469,
    roughness: 0.45,
    metalness: 0.78,
  });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x2b3033, roughness: 0.85 });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 1.1), baseMat);
  plinth.position.y = 0.175;
  group.add(plinth);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 5.2, 6), steelMat);
      leg.position.set(sx * 0.24, 2.8, sz * 0.24);
      leg.rotation.z = sx * 0.06;
      leg.rotation.x = -sz * 0.06;
      group.add(leg);
    }
  }

  for (const h of [1.5, 3.0, 4.4]) {
    const ring = new THREE.Mesh(new THREE.BoxGeometry(0.62 - h * 0.06, 0.07, 0.62 - h * 0.06), steelMat);
    ring.position.y = h;
    group.add(ring);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.5, 6), steelMat);
  mast.position.y = 5.9;
  group.add(mast);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff2b2b })
  );
  beacon.position.y = 6.65;
  group.add(beacon);

  return { group, beacon };
}

export function createKujangShrine(): { group: THREE.Group; kujang: THREE.Group } {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3b403c, roughness: 0.88 });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, 0.95, 8), stoneMat);
  pedestal.position.y = 0.475;
  group.add(pedestal);

  const kujang = new THREE.Group();
  kujang.position.y = 1.45;

  const shape = new THREE.Shape();
  shape.moveTo(0, -0.35);
  shape.quadraticCurveTo(0.18, -0.1, 0.14, 0.18);
  shape.quadraticCurveTo(0.24, 0.42, 0.02, 0.68);
  shape.quadraticCurveTo(-0.12, 0.45, -0.06, 0.15);
  shape.quadraticCurveTo(-0.14, -0.12, 0, -0.35);

  const bladeGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  bladeGeo.center();

  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xe6d49a,
    emissive: new THREE.Color(0xc49533),
    emissiveIntensity: 0.85,
    roughness: 0.22,
    metalness: 0.88,
  });
  kujang.add(new THREE.Mesh(bladeGeo, bladeMat));

  const hilt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.24, 8),
    new THREE.MeshStandardMaterial({ color: 0x3d2213, roughness: 0.75 })
  );
  hilt.position.y = -0.45;
  kujang.add(hilt);

  group.add(kujang);
  return { group, kujang };
}

export interface HumanoidRig {
  group: THREE.Group;
  bodyRoot: THREE.Group;
  neckJoint?: THREE.Group;
  head: THREE.Group;
  mouthPivot: THREE.Group;
  mouthCavity: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  rightFlashlight?: THREE.Group;
  rightFlashlightTipAnchor?: THREE.Object3D;
  rightFlashlightLensMat?: THREE.MeshBasicMaterial;
  leftUvCam?: THREE.Group;
  leftKujang?: THREE.Group;
  glbBones?: GlbBoneSet;
}

export interface FirstPersonHandRig {
  group: THREE.Group;
  rightArmPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  flashlightTipAnchor: THREE.Object3D;
  uvTipAnchor: THREE.Object3D;
  flashlightLensMat: THREE.MeshBasicMaterial;
  flashlightSwitchMat: THREE.MeshBasicMaterial;
  uvLedMat: THREE.MeshBasicMaterial;
  uvGroup: THREE.Group;
  kujangGroup: THREE.Group;
  keyGroup: THREE.Group;
  saltGroup: THREE.Group;
  batteryGroup: THREE.Group;
  evidenceGroup: THREE.Group;
}

function createArticulatedHand(skinMat: THREE.Material, side: -1 | 1): THREE.Group {
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.072, 0.036), skinMat);
  palm.position.set(0, -0.02, 0.008);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.032, 4, 6), skinMat);
  thumb.position.set(-side * 0.036, -0.014, 0.026);
  thumb.rotation.set(0.45, 0, side * 0.48);
  hand.add(palm, thumb);
  for (let f = 0; f < 4; f++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.036, 4, 6), skinMat);
    finger.position.set(-0.022 + f * 0.015, -0.056, 0.022);
    finger.rotation.x = 0.55;
    hand.add(finger);
  }
  return hand;
}

function createFlashlightMesh(): {
  group: THREE.Group;
  tipAnchor: THREE.Object3D;
  lensMat: THREE.MeshBasicMaterial;
  switchMat: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x181c20, roughness: 0.62, metalness: 0.35 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x0f1113, roughness: 0.9 });
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x5c646b, roughness: 0.45, metalness: 0.55 });
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xfff3d4 });
  const switchMat = new THREE.MeshBasicMaterial({ color: 0xd93829 });

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.16, 12), bodyMat);
  barrel.rotation.x = Math.PI / 2;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.025, 0.085, 12), gripMat);
  grip.rotation.x = Math.PI / 2;
  grip.position.z = 0.02;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.026, 0.06, 14), bodyMat);
  head.rotation.x = Math.PI / 2;
  head.position.z = -0.1;
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0045, 8, 16), bezelMat);
  bezel.position.z = -0.132;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.033, 14), lensMat);
  lens.rotation.y = Math.PI;
  lens.position.z = -0.131;
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.009, 0.018), switchMat);
  btn.position.set(0, 0.026, -0.045);

  // Jangkar tepat 5cm di depan moncong senter sehingga cahaya memancar murni dari ujung depan senter
  const tipAnchor = new THREE.Object3D();
  tipAnchor.position.set(0, 0, -0.18);

  group.add(barrel, grip, head, bezel, lens, btn, tipAnchor);
  return { group, tipAnchor, lensMat, switchMat };
}

function createUVCameraMesh(): {
  group: THREE.Group;
  tipAnchor: THREE.Object3D;
  ledMat: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.45, metalness: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x4b2a7a, roughness: 0.4, metalness: 0.5 });
  const uvLensMat = new THREE.MeshBasicMaterial({ color: 0xa46eff });
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x2e1e52 });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xff2b2b });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.095, 0.065), bodyMat);
  const topPrism = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.028, 0.058), bodyMat);
  topPrism.position.set(0, 0.058, 0);
  const lensBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.048, 14), accentMat);
  lensBarrel.rotation.x = Math.PI / 2;
  lensBarrel.position.set(-0.015, -0.004, -0.048);
  const uvGlass = new THREE.Mesh(new THREE.CircleGeometry(0.028, 14), uvLensMat);
  uvGlass.rotation.y = Math.PI;
  uvGlass.position.set(-0.015, -0.004, -0.073);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.058), screenMat);
  screen.position.set(0.01, -0.004, 0.034);
  const recLed = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), ledMat);
  recLed.position.set(-0.052, 0.034, 0.034);
  const shutter = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 8), accentMat);
  shutter.position.set(-0.045, 0.052, -0.01);

  const tipAnchor = new THREE.Object3D();
  tipAnchor.position.set(-0.015, -0.004, -0.098);

  group.add(body, topPrism, lensBarrel, uvGlass, screen, recLed, shutter, tipAnchor);
  return { group, tipAnchor, ledMat };
}

function createMiniKujangMesh(): THREE.Group {
  const g = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x3b4048,
    emissive: new THREE.Color(0x805514),
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.88,
  });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd9a84e, roughness: 0.25, metalness: 0.85 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x291a10, roughness: 0.78 });

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.11, 8), gripMat);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.026), brassMat);
  guard.position.y = 0.06;
  const bladeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.07, 0),
    new THREE.Vector3(0.028, 0.15, 0),
    new THREE.Vector3(-0.014, 0.23, 0),
    new THREE.Vector3(0.012, 0.31, 0),
  ]);
  const blade = new THREE.Mesh(new THREE.TubeGeometry(bladeCurve, 10, 0.014, 6, false), bladeMat);
  blade.scale.set(1.2, 1, 0.42);
  g.add(grip, guard, blade);
  return g;
}

/**
 * Rig tangan First-Person lengkap dengan lengan baju karakter, telapak/jari, senter taktis kanan,
 * serta slot item kiri (Kamera UV, Kujang, Kunci, Garam Suci, Baterai, atau Bukti Fakta).
 */
export function createFirstPersonHandRig(
  shirtColorHex: number,
  skinColorHex = 0xc39471
): FirstPersonHandRig {
  const group = new THREE.Group();
  const sleeveMat = new THREE.MeshStandardMaterial({ color: shirtColorHex, roughness: 0.92, envMapIntensity: 0.35 });
  const cuffMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(shirtColorHex).offsetHSL(0, 0, -0.06).getHex(),
    roughness: 0.88,
    envMapIntensity: 0.35,
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColorHex, roughness: 0.86, envMapIntensity: 0.35 });
  const watchMat = new THREE.MeshStandardMaterial({ color: 0x181b1e, roughness: 0.55, metalness: 0.35 });

  // Tangan kanan: Lengan + Telapak + Senter Taktis
  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.24, -0.24, -0.34);
  const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.32, 10), skinMat);
  rForearm.rotation.x = Math.PI / 2 - 0.12;
  rForearm.position.set(0.02, -0.04, 0.12);
  const rSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.048, 0.22, 10), sleeveMat);
  rSleeve.rotation.x = Math.PI / 2 - 0.12;
  rSleeve.position.set(0.03, -0.06, 0.24);
  const rWatch = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.024, 10), watchMat);
  rWatch.rotation.x = Math.PI / 2;
  rWatch.position.set(0.005, -0.015, 0.035);
  const rHand = createArticulatedHand(skinMat, 1);
  rHand.rotation.set(Math.PI / 2 - 0.18, 0.12, -0.15);
  rHand.position.set(0, 0.005, -0.03);

  const flash = createFlashlightMesh();
  flash.group.position.set(-0.008, 0.012, -0.09);
  flash.group.rotation.set(0.04, 0.05, 0);
  rightArmPivot.add(rForearm, rSleeve, rWatch, rHand, flash.group);

  // Tangan kiri: Lengan + Telapak + Slot Kamera UV / Kujang / Barang Pegangan Lain
  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.24, -0.27, -0.36);
  const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.32, 10), skinMat);
  lForearm.rotation.x = Math.PI / 2 - 0.15;
  lForearm.position.set(-0.02, -0.04, 0.12);
  const lSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.046, 0.22, 10), sleeveMat);
  lSleeve.rotation.x = Math.PI / 2 - 0.15;
  lSleeve.position.set(-0.03, -0.06, 0.24);
  const lCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.045, 0.03, 10), cuffMat);
  lCuff.rotation.x = Math.PI / 2 - 0.15;
  lCuff.position.set(-0.025, -0.05, 0.14);
  const lHand = createArticulatedHand(skinMat, -1);
  lHand.rotation.set(Math.PI / 2 - 0.2, -0.15, 0.15);
  lHand.position.set(0.005, 0.005, -0.03);

  const uv = createUVCameraMesh();
  uv.group.position.set(0.02, 0.03, -0.08);
  uv.group.rotation.set(0.06, -0.18, 0);

  const kujangGroup = createMiniKujangMesh();
  kujangGroup.position.set(0.01, -0.02, -0.075);
  kujangGroup.rotation.set(-0.28, 0.25, -0.12);
  kujangGroup.visible = false;

  const keyGroup = new THREE.Group();
  const keyMat = new THREE.MeshStandardMaterial({ color: 0xe3b857, roughness: 0.28, metalness: 0.85 });
  const keyRing = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 12), keyMat);
  const keyShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.075, 6), keyMat);
  keyShaft.rotation.x = Math.PI / 2;
  keyShaft.position.z = -0.05;
  const keyTooth = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.006, 0.02), keyMat);
  keyTooth.position.set(0.008, 0, -0.075);
  keyGroup.add(keyRing, keyShaft, keyTooth);
  keyGroup.position.set(0.015, 0.018, -0.06);
  keyGroup.visible = false;

  const saltGroup = new THREE.Group();
  const pouchMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.042, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.88 })
  );
  pouchMesh.scale.set(0.95, 1.15, 0.85);
  const pouchTie = new THREE.Mesh(
    new THREE.TorusGeometry(0.02, 0.005, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0x8f2d24, roughness: 0.7 })
  );
  pouchTie.rotation.x = Math.PI / 2;
  pouchTie.position.y = 0.032;
  saltGroup.add(pouchMesh, pouchTie);
  saltGroup.position.set(0.01, 0.02, -0.065);
  saltGroup.visible = false;

  const batteryGroup = new THREE.Group();
  const batCyl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.065, 10),
    new THREE.MeshStandardMaterial({ color: 0x267a45, roughness: 0.42, metalness: 0.4 })
  );
  const batCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8),
    new THREE.MeshStandardMaterial({ color: 0xd4a64c, metalness: 0.8, roughness: 0.3 })
  );
  batCap.position.y = 0.036;
  batteryGroup.add(batCyl, batCap);
  batteryGroup.rotation.x = 0.45;
  batteryGroup.position.set(0.01, 0.02, -0.065);
  batteryGroup.visible = false;

  const evidenceGroup = new THREE.Group();
  const paper = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.006, 0.14),
    new THREE.MeshStandardMaterial({ color: 0xd6cdb8, roughness: 0.9 })
  );
  const inkLines = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.007, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.9 })
  );
  evidenceGroup.add(paper, inkLines);
  evidenceGroup.rotation.set(0.55, -0.15, 0.1);
  evidenceGroup.position.set(0.02, 0.025, -0.08);
  evidenceGroup.visible = false;

  leftArmPivot.add(
    lForearm,
    lSleeve,
    lCuff,
    lHand,
    uv.group,
    kujangGroup,
    keyGroup,
    saltGroup,
    batteryGroup,
    evidenceGroup
  );

  group.add(rightArmPivot, leftArmPivot);

  // Tangan & senter FP tidak menelan bayangan dari lampu ujung senternya sendiri
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.castShadow = false;
  });

  return {
    group,
    rightArmPivot,
    leftArmPivot,
    flashlightTipAnchor: flash.tipAnchor,
    uvTipAnchor: uv.tipAnchor,
    flashlightLensMat: flash.lensMat,
    flashlightSwitchMat: flash.switchMat,
    uvLedMat: uv.ledMat,
    uvGroup: uv.group,
    kujangGroup,
    keyGroup,
    saltGroup,
    batteryGroup,
    evidenceGroup,
  };
}

export type CharacterModelPreset =
  | 'raka'
  | 'salsa'
  | 'bima'
  | 'nadia'
  | 'dito'
  | 'satpam'
  | 'nasgor'
  | 'pecel'
  | 'warung_ibu';

export function createHumanoidNPC(opts: {
  shirtColor: number;
  bottomColor: number;
  skinColor?: number;
  hasCap?: boolean;
  capColor?: number;
  hasApron?: boolean;
  isSkirt?: boolean;
  hasBackpack?: boolean;
  bagColor?: number;
  accessory?: 'none' | 'cap' | 'headband' | 'glasses' | 'walkie';
  isSeated?: boolean;
  prop?: 'coffee' | 'phone' | 'ladle';
  preset?: CharacterModelPreset;
  contactShadowTex: THREE.CanvasTexture;
}): HumanoidRig {
  const group = new THREE.Group();
  const bodyRoot = new THREE.Group();
  if (opts.isSeated) {
    bodyRoot.position.y = -0.34;
  }
  group.add(bodyRoot);

  const p = opts.preset;
  const skinHex =
    opts.skinColor ??
    (p === 'satpam' || p === 'nasgor' || p === 'pecel' ? 0xb5825d : p === 'salsa' || p === 'nadia' ? 0xcba181 : 0xc39471);
  const skinMat = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.68 });

  // Tekstur kemeja kotak-kotak untuk Tukang Pecel Lele (sesuai lembar referensi image_efd5c5af)
  let shirtMat: THREE.MeshStandardMaterial;
  if (p === 'pecel') {
    const plaidTex = makeCanvasTexture(
      (ctx, w, h) => {
        ctx.fillStyle = '#4a1b1d';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < w; i += 24) {
          ctx.fillStyle = i % 48 === 0 ? 'rgba(148, 36, 34, 0.72)' : 'rgba(22, 34, 54, 0.72)';
          ctx.fillRect(i, 0, 10, h);
          ctx.fillRect(0, i, w, 10);
        }
        ctx.strokeStyle = 'rgba(218, 210, 198, 0.25)';
        ctx.lineWidth = 2;
        for (let i = 12; i < w; i += 24) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, h);
          ctx.moveTo(0, i);
          ctx.lineTo(w, i);
          ctx.stroke();
        }
      },
      2,
      2,
      4,
      true,
      128,
      128
    );
    shirtMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: plaidTex, roughness: 0.86 });
  } else {
    shirtMat = new THREE.MeshStandardMaterial({ color: opts.shirtColor, roughness: 0.82 });
  }

  const bottomMat = new THREE.MeshStandardMaterial({ color: opts.bottomColor, roughness: 0.86 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.88 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x171b23, roughness: 0.72 });
  const whiteTrimMat = new THREE.MeshStandardMaterial({ color: 0xdadcd6, roughness: 0.65 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x3b2b20, roughness: 0.78 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a64c, roughness: 0.3, metalness: 0.8 });

  group.add(createContactShadowDisc(0.45, opts.contactShadowTex));

  // Kaki berporos di pinggul (y = 0.82) lengkap dengan sendi lutut (y = -0.39) agar berjalan, lari, jongkok & duduk tampak luwes
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.11, 0.82, 0);
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.11, 0.82, 0);
  const leftKnee = new THREE.Group();
  leftKnee.position.set(0, -0.39, 0);
  const rightKnee = new THREE.Group();
  rightKnee.position.set(0, -0.39, 0);
  leftLeg.add(leftKnee);
  rightLeg.add(rightKnee);

  const isLongSkirt = p === 'salsa' || p === 'warung_ibu';
  const isSandal = p === 'nasgor' || p === 'pecel';

  if (opts.isSkirt || isLongSkirt) {
    const skirtH = isLongSkirt ? 0.74 : 0.46;
    const skirtY = isLongSkirt ? 0.52 : 0.65;
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.175, isLongSkirt ? 0.28 : 0.29, skirtH, 16),
      bottomMat
    );
    skirt.position.y = skirtY;
    skirt.castShadow = true;
    bodyRoot.add(skirt);

    for (const [idx, legPivot] of [leftLeg, rightLeg].entries()) {
      const kneePivot = idx === 0 ? leftKnee : rightKnee;
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.056, 0.39, 8), skinMat);
      thigh.position.y = -0.195;
      legPivot.add(thigh);
      const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.044, 0.36, 8), skinMat);
      calf.position.y = -0.18;
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.048, 0.14, 8), shoeMat);
      sock.position.y = -0.3;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.19), shoeMat);
      shoe.position.set(0, -0.39, 0.03);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.116, 0.022, 0.2), whiteTrimMat);
      sole.position.set(0, -0.42, 0.03);
      kneePivot.add(calf, sock, shoe, sole);
    }
  } else {
    for (const [idx, legPivot] of [leftLeg, rightLeg].entries()) {
      const kneePivot = idx === 0 ? leftKnee : rightKnee;
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.074, 0.39, 10), bottomMat);
      thigh.position.y = -0.195;
      thigh.castShadow = true;
      const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.072, 8, 8), bottomMat);
      legPivot.add(thigh);
      kneePivot.add(kneeCap);

      const shinMat = p === 'nasgor' ? skinMat : bottomMat;
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.056, 0.36, 10), shinMat);
      shin.position.y = -0.18;
      shin.castShadow = true;
      kneePivot.add(shin);

      if (isSandal) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.045, 0.19), skinMat);
        foot.position.set(0, -0.39, 0.03);
        const sandalSole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.024, 0.21), leatherMat);
        sandalSole.position.set(0, -0.42, 0.03);
        kneePivot.add(foot, sandalSole);
      } else {
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.085, 0.2), shoeMat);
        shoe.position.set(0, -0.385, 0.03);
        const sole = new THREE.Mesh(
          new THREE.BoxGeometry(0.124, 0.022, 0.21),
          p === 'satpam' ? shoeMat : whiteTrimMat
        );
        sole.position.set(0, -0.42, 0.03);
        kneePivot.add(shoe, sole);
      }
    }
  }

  if (opts.isSeated) {
    leftLeg.rotation.x = -Math.PI * 0.48;
    rightLeg.rotation.x = -Math.PI * 0.48;
    leftKnee.rotation.x = Math.PI * 0.46;
    rightKnee.rotation.x = Math.PI * 0.46;
  }
  bodyRoot.add(leftLeg, rightLeg);

  // Torso sculpted (dada lebih lebar dari pinggang, kerah kemeja, & sabuk)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.175, 0.56, 12), shirtMat);
  torso.scale.set(1.12, 1.0, 0.68);
  torso.position.y = 1.1;
  torso.castShadow = true;
  bodyRoot.add(torso);

  // Kerah & lipatan lapel kemeja + deretan kancing + badge OSIS / SMP / SATPAM
  if (p !== 'nasgor') {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.024, 6, 12), shirtMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 1.38, 0.01);
    const placket = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, 0.44, 0.016),
      new THREE.MeshStandardMaterial({ color: 0x202428, roughness: 0.7, transparent: true, opacity: 0.18 })
    );
    placket.position.set(0, 1.12, 0.132);
    bodyRoot.add(collar, placket);
    for (let b = 0; b < 3; b++) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 6), whiteTrimMat);
      btn.rotation.x = Math.PI / 2;
      btn.position.set(0, 1.26 - b * 0.11, 0.136);
      bodyRoot.add(btn);
    }
  }
  if (p === 'raka' || p === 'salsa' || p === 'bima' || p === 'nadia' || p === 'dito') {
    const pocketBadge = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.075, 0.02),
      new THREE.MeshStandardMaterial({
        color: p === 'nadia' || p === 'dito' ? 0x264b7a : 0x8f2e24,
        roughness: 0.6,
      })
    );
    pocketBadge.position.set(-0.1, 1.2, 0.13);
    bodyRoot.add(pocketBadge);
  }

  // Sabuk pinggang + perlengkapan khas referensi
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.055, 0.24), new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.6 }));
  belt.position.set(0, 0.85, 0);
  bodyRoot.add(belt);

  // Backpack & tas selempang sesuai karakter referensi
  if (opts.hasBackpack || opts.bagColor !== undefined) {
    const packMat = new THREE.MeshStandardMaterial({ color: opts.bagColor ?? 0x383a32, roughness: 0.88 });
    if (p === 'salsa' || p === 'dito') {
      // Tas selempang samping + tali menyilang dada (sesuai lembar Salsa & Dito)
      const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.24, 0.22), new THREE.MeshStandardMaterial({ color: 0x827355, roughness: 0.85 }));
      satchel.position.set(-0.24, 0.92, 0.02);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.56, 0.26), leatherMat);
      strap.position.set(0, 1.12, 0);
      strap.rotation.z = -0.62;
      bodyRoot.add(satchel, strap);
    } else {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.16), packMat);
      pack.position.set(0, 1.12, -0.18);
      pack.castShadow = true;
      bodyRoot.add(pack);
      for (const sx of [-0.11, 0.11]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.48, 0.26), packMat);
        strap.position.set(sx, 1.14, -0.01);
        bodyRoot.add(strap);
      }
      if (p === 'bima') {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.34, 6), shoeMat);
        ant.position.set(-0.11, 1.48, -0.2);
        bodyRoot.add(ant);
        const toolPouch = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.12), leatherMat);
        toolPouch.position.set(0.22, 0.86, 0.06);
        bodyRoot.add(toolPouch);
      }
      if (p === 'nadia') {
        const sideBag = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.16), leatherMat);
        sideBag.position.set(-0.22, 0.88, 0.04);
        bodyRoot.add(sideBag);
      }
    }
  }

  // Detail khusus Satpam (pentungan, HT, lencana emas, ID lanyard), Pedagang (celemek, handuk bahu, tas pinggang), & Siswa (senter/rekorder)
  if (p === 'satpam') {
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 8), brassMat);
    badge.rotation.x = Math.PI / 2;
    badge.position.set(-0.1, 1.22, 0.13);
    const lanyard = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.085, 0.015), whiteTrimMat);
    lanyard.position.set(0, 1.12, 0.135);
    const baton = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.44, 8), shoeMat);
    baton.position.set(-0.23, 0.68, -0.02);
    baton.rotation.z = 0.08;
    const ht = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.13, 0.04), shoeMat);
    ht.position.set(0.22, 0.88, 0.05);
    bodyRoot.add(badge, lanyard, baton, ht);
  } else if (p === 'raka') {
    const miniFlash = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), shoeMat);
    miniFlash.position.set(0.2, 0.82, 0.06);
    bodyRoot.add(miniFlash);
  } else if (p === 'salsa') {
    const notebook = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.025), whiteTrimMat);
    notebook.position.set(0.18, 0.84, 0.1);
    bodyRoot.add(notebook);
  } else if (p === 'dito') {
    const pendant = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 8), brassMat);
    pendant.rotation.x = Math.PI / 2;
    pendant.position.set(0, 1.26, 0.13);
    bodyRoot.add(pendant);
  }

  if (opts.hasApron) {
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.64, 0.25),
      new THREE.MeshStandardMaterial({ color: p === 'pecel' ? 0x2f362d : 0x2c2f2e, roughness: 0.92 })
    );
    apron.position.y = 0.96;
    bodyRoot.add(apron);

    if (p === 'nasgor' || p === 'pecel') {
      // Handuk dapur di bahu kiri & tas pinggang (sesuai referensi Tukang Nasgor & Pecel)
      const towel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.22), whiteTrimMat);
      towel.position.set(-0.18, 1.32, 0.01);
      bodyRoot.add(towel);
    }
    if (p === 'nasgor') {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.1), leatherMat);
      pouch.position.set(0.16, 0.88, 0.13);
      bodyRoot.add(pouch);
    }
  }

  // Lengan berporos di bahu (y = 1.34) lengkap dengan sendi siku (y = -0.26), manset, telapak tangan, & jari
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.27, 1.34, 0);
  const rightArm = new THREE.Group();
  rightArm.position.set(0.27, 1.34, 0);
  const leftElbow = new THREE.Group();
  leftElbow.position.set(0, -0.26, 0);
  const rightElbow = new THREE.Group();
  rightElbow.position.set(0, -0.26, 0);

  for (const [idx, armPivot] of ([leftArm, rightArm] as THREE.Group[]).entries()) {
    const side: -1 | 1 = idx === 0 ? -1 : 1;
    const elbowPivot = idx === 0 ? leftElbow : rightElbow;
    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 8), shirtMat);
    shoulderCap.position.y = -0.02;
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.066, 0.21, 8), shirtMat);
    sleeve.position.y = -0.105;
    sleeve.castShadow = true;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.024, 8), whiteTrimMat);
    cuff.position.y = -0.205;
    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.047, 0.1, 8), skinMat);
    upperArm.position.y = -0.22;
    armPivot.add(shoulderCap, sleeve, cuff, upperArm, elbowPivot);

    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.046, 8, 8), skinMat);
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.038, 0.24, 8), skinMat);
    forearm.position.y = -0.125;
    forearm.castShadow = true;
    const hand = createArticulatedHand(skinMat, side);
    hand.position.y = -0.26;
    elbowPivot.add(elbowJoint, forearm, hand);
  }
  // Jam tangan / gelang di pergelangan kanan
  const watch = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.026, 8), shoeMat);
  watch.position.y = -0.22;
  rightElbow.add(watch);

  // Slot alat pegangan Third-Person (Senter di tangan kanan, Kamera UV & Kujang di tangan kiri)
  let rightFlashlight: THREE.Group | undefined;
  let rightFlashlightTipAnchor: THREE.Object3D | undefined;
  let rightFlashlightLensMat: THREE.MeshBasicMaterial | undefined;
  let leftUvCam: THREE.Group | undefined;
  let leftKujang: THREE.Group | undefined;

  if (!opts.prop && (p === 'raka' || p === 'salsa' || p === 'bima' || p === 'nadia' || p === 'dito' || opts.hasBackpack)) {
    const flash = createFlashlightMesh();
    flash.group.position.set(0, -0.3, 0.06);
    flash.group.rotation.set(Math.PI * 0.42, 0, 0);
    rightElbow.add(flash.group);
    rightFlashlight = flash.group;
    rightFlashlightTipAnchor = flash.tipAnchor;
    rightFlashlightLensMat = flash.lensMat;

    const uv = createUVCameraMesh();
    uv.group.position.set(0, -0.3, 0.08);
    uv.group.rotation.set(Math.PI * 0.45, 0, 0);
    uv.group.visible = false;
    leftElbow.add(uv.group);
    leftUvCam = uv.group;

    leftKujang = createMiniKujangMesh();
    leftKujang.position.set(0, -0.3, 0.06);
    leftKujang.rotation.set(Math.PI * 0.45, 0, 0);
    leftKujang.visible = false;
    leftElbow.add(leftKujang);
  }

  if (opts.prop === 'coffee') {
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.036, 0.1, 8),
      new THREE.MeshStandardMaterial({ color: 0xe6ded0, roughness: 0.4 })
    );
    cup.position.set(0, -0.29, 0.06);
    rightElbow.add(cup);
  } else if (opts.prop === 'phone') {
    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.13, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x9edbff })
    );
    phone.position.set(0, -0.28, 0.06);
    rightElbow.add(phone);
  } else if (opts.prop === 'ladle') {
    const spoon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.42, 6),
      new THREE.MeshStandardMaterial({ color: 0x9aa2a8, metalness: 0.75, roughness: 0.3 })
    );
    spoon.rotation.x = Math.PI * 0.4;
    spoon.position.set(0, -0.27, 0.16);
    rightElbow.add(spoon);
  }

  bodyRoot.add(leftArm, rightArm);

  // Pangkal leher solid (cervical base) tertanam kokoh di dalam kerah baju torso (y = 1.28..1.42)
  // Menghilangkan celah tembus pandang atau leher terpotong saat kepala menoleh
  const neckBase = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.075, 0.16, 12), skinMat);
  neckBase.position.set(0, 1.34, 0);
  neckBase.castShadow = true;

  // Poros sendi leher artikulatif (y = 1.39) dengan selongsong leher atas
  const neckJoint = new THREE.Group();
  neckJoint.position.set(0, 1.39, 0);
  const upperNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.064, 0.11, 12), skinMat);
  upperNeck.position.set(0, 0.038, 0);
  upperNeck.castShadow = true;
  neckJoint.add(upperNeck);
  bodyRoot.add(neckBase, neckJoint);

  // Kepala berporos di puncak leher (y = 1.45) lengkap dengan telinga, hidung, mata, mulut, & rambut
  const head = new THREE.Group();
  head.position.set(0, 1.45, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.148, 18, 16), skinMat);
  skull.scale.set(0.94, 1.06, 0.98);
  skull.position.y = 0.115;
  skull.castShadow = true;
  const noseBridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.026, 4, 6), skinMat);
  noseBridge.rotation.x = -0.18;
  noseBridge.position.set(0, 0.102, 0.14);
  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), skinMat);
  noseTip.position.set(0, 0.084, 0.148);
  const lipHex = p === 'salsa' || p === 'nadia' || p === 'warung_ibu' ? 0x9b5752 : 0x7a4b43;
  const mouth = createArticulatedMouth(skinMat, 1, lipHex, 0.88, false);
  mouth.mouthGroup.position.set(0, 0.048, 0.134);
  head.add(skull, noseBridge, noseTip, mouth.mouthGroup);

  const scleraMat = new THREE.MeshBasicMaterial({ color: 0xe8e4da });
  const irisMat = new THREE.MeshBasicMaterial({ color: 0x382419 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x101012 });
  const eyeGlintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-0.047, 0.047]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 6), skinMat);
    ear.scale.set(0.45, 0.9, 0.7);
    ear.position.set(Math.sign(sx) * 0.136, 0.14, -0.01);
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), scleraMat);
    sclera.scale.set(1.15, 0.76, 0.48);
    sclera.position.set(sx, 0.15, 0.134);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 8, 8), irisMat);
    iris.scale.set(1.0, 1.0, 0.5);
    iris.position.set(sx, 0.15, 0.14);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 6, 6), pupilMat);
    pupil.position.set(sx, 0.15, 0.143);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 4, 4), eyeGlintMat);
    glint.position.set(sx + 0.004, 0.154, 0.146);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, 0.032, 4, 6), hairMat);
    brow.rotation.z = Math.PI / 2 + (sx < 0 ? 0.06 : -0.06);
    brow.position.set(sx, 0.176, 0.136);
    head.add(ear, sclera, iris, pupil, glint, brow);
  }

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.156, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
    hairMat
  );
  hair.position.set(0, 0.168, -0.016);
  const hairFront = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.14, 4, 8), hairMat);
  hairFront.rotation.z = Math.PI / 2;
  hairFront.position.set(0, 0.236, 0.095);
  head.add(hair, hairFront);

  if (p === 'salsa') {
    // Kuncir kuda tinggi (high ponytail) sesuai lembar Salsa
    const ponytail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 8), hairMat);
    ponytail.position.set(0, 0.15, -0.18);
    ponytail.rotation.x = -2.25;
    head.add(ponytail);
  } else if (p === 'nadia') {
    // Rambut bob pendek sporty sesuai lembar Nadia
    const bobBack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.14), hairMat);
    bobBack.position.set(0, 0.11, -0.09);
    head.add(bobBack);
  } else if (p === 'dito') {
    // Rambut ikal bergelombang (curly tufts) sesuai lembar Dito
    for (let c = -2; c <= 2; c++) {
      const curl = new THREE.Mesh(new THREE.DodecahedronGeometry(0.062, 0), hairMat);
      curl.position.set(c * 0.055, 0.27, 0.03 - Math.abs(c) * 0.02);
      head.add(curl);
    }
  } else if (p === 'warung_ibu') {
    const konde = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), hairMat);
    konde.position.set(0, 0.14, -0.16);
    head.add(konde);
  } else if (p === 'pecel') {
    const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.02), hairMat);
    mustache.position.set(0, 0.088, 0.145);
    head.add(mustache);
  }

  if (opts.hasCap || opts.accessory === 'cap') {
    const capMat = new THREE.MeshStandardMaterial({ color: opts.capColor ?? 0x162238, roughness: 0.65 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.156, 0.168, 0.095, 12), capMat);
    cap.position.y = 0.25;
    head.add(cap);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.14), capMat);
    visor.position.set(0, 0.215, 0.14);
    head.add(visor);
    if (p === 'satpam') {
      const emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 8), brassMat);
      emblem.rotation.x = Math.PI / 2;
      emblem.position.set(0, 0.255, 0.16);
      head.add(emblem);
    }
  } else if (opts.accessory === 'headband') {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.155, 0.022, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0xa83228, roughness: 0.7 })
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.19;
    head.add(band);
  }
  if (p === 'bima' || opts.accessory === 'glasses') {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.35 });
    for (const gx of [-0.048, 0.048]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.042, 0.016), frameMat);
      rim.position.set(gx, 0.14, 0.145);
      head.add(rim);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.014), frameMat);
    bridge.position.set(0, 0.145, 0.146);
    head.add(bridge);
  }
  if (opts.accessory === 'walkie') {
    const walkie = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.14, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 0.6 })
    );
    walkie.position.set(0.24, 1.24, 0.09);
    bodyRoot.add(walkie);
  }
  bodyRoot.add(head);

  const proceduralParts = bodyRoot.children.filter((child) => child !== rightFlashlight && child !== leftUvCam && child !== leftKujang);

  const rig: HumanoidRig = {
    group,
    bodyRoot,
    neckJoint,
    head,
    mouthPivot: mouth.mouthPivot,
    mouthCavity: mouth.mouthCavity,
    leftArm,
    rightArm,
    leftElbow,
    rightElbow,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
    rightFlashlight,
    rightFlashlightTipAnchor,
    rightFlashlightLensMat,
    leftUvCam,
    leftKujang,
  };

  if (p === 'raka') {
    void loadNormalizedGlbAsset('/assets/models/raka.glb', {
      targetHeight: 1.74,
      groundOffset: 0.02,
      envMapIntensity: 0.88,
      humanoidSkinPreset: 'raka',
    })
      .then((bundle) => {
        const instance = SkeletonUtils.clone(bundle.root) as THREE.Group;
        const glbBones = extractGlbBoneSet(instance);
        if (glbBones) {
          rig.glbBones = glbBones;
          syncHumanoidGlbBones(rig, { isSeated: opts.isSeated });
        }
        // Pasang senter, kamera UV & kujang langsung ke tulang lengan bawah asli agar ikut bergerak nyata
        if (glbBones && rightFlashlight) {
          rightFlashlight.scale.setScalar(0.56);
          rightFlashlight.position.set(0.24, 0, 0.02);
          rightFlashlight.rotation.set(0, -Math.PI / 2, 0);
          glbBones.rFore.add(rightFlashlight);
        } else if (rightFlashlight) {
          rightFlashlight.position.set(-0.24, 1.04, 0.2);
          rightFlashlight.rotation.set(Math.PI * 0.48, 0, 0);
          bodyRoot.add(rightFlashlight);
        }
        if (glbBones && leftUvCam) {
          leftUvCam.scale.setScalar(0.56);
          leftUvCam.position.set(-0.24, 0, 0.02);
          leftUvCam.rotation.set(0, Math.PI / 2, 0);
          glbBones.lFore.add(leftUvCam);
        } else if (leftUvCam) {
          leftUvCam.position.set(0.24, 1.04, 0.2);
          leftUvCam.rotation.set(Math.PI * 0.5, 0, 0);
          bodyRoot.add(leftUvCam);
        }
        if (glbBones && leftKujang) {
          leftKujang.scale.setScalar(0.56);
          leftKujang.position.set(-0.24, 0, 0.02);
          leftKujang.rotation.set(0, Math.PI / 2, 0);
          glbBones.lFore.add(leftKujang);
        } else if (leftKujang) {
          leftKujang.position.set(0.24, 1.04, 0.16);
          leftKujang.rotation.set(Math.PI * 0.5, 0, 0);
          bodyRoot.add(leftKujang);
        }
        for (const part of proceduralParts) {
          part.visible = false;
        }
        bodyRoot.add(instance);
      })
      .catch(() => {
        // Pertahankan model prosedural bila GLB gagal dimuat
      });
  }

  return rig;
}

export interface GhostRig {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  head: THREE.Group;
  mouthPivot?: THREE.Group;
  mouthCavity?: THREE.Mesh;
  leftArm?: THREE.Group;
  rightArm?: THREE.Group;
  leftElbow?: THREE.Group;
  rightElbow?: THREE.Group;
  leftLeg?: THREE.Group;
  rightLeg?: THREE.Group;
  hairStrands?: THREE.Mesh[];
  mixer?: THREE.AnimationMixer;
  glbBones?: GlbBoneSet;
}

/**
 * Membangun model 3D hantu yang artikulatif (tidak kaku) & sesuai gambar referensi karakter.
 */
export function createGhostModel(
  kind: GhostKind,
  contactShadowTex: THREE.CanvasTexture
): GhostRig {
  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);
  group.add(createContactShadowDisc(kind === 'genderuwo' ? 0.78 : 0.55, contactShadowTex));

  const redEyeMat = new THREE.MeshBasicMaterial({ color: 0xff2424 });

  if (kind === 'ambu_hideung') {
    // Sesuai lembar referensi AMBU HIDEUNG (image_ba3abc60):
    // Kebaya renda hitam compang-camping, kain jarik batik gelap, kulit pucat keabuan bercakar, wajah gelap bermata merah tajam, 10 sulur rambut bergelombang
    const batikTex = makeCanvasTexture(
      (ctx, w, h) => {
        ctx.fillStyle = '#181816';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#3a3428';
        ctx.lineWidth = 2;
        for (let y = 0; y < h; y += 18) {
          for (let x = 0; x < w; x += 18) {
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      },
      2,
      2,
      4,
      true,
      128,
      128
    );
    const kebayaMat = new THREE.MeshStandardMaterial({
      color: 0x15171a,
      roughness: 0.9,
      metalness: 0.08,
    });
    const innerBatikMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: batikTex,
      roughness: 0.88,
    });
    const paleSkinMat = new THREE.MeshStandardMaterial({
      color: 0x67727a,
      roughness: 0.72,
    });
    const shadowFaceMat = new THREE.MeshStandardMaterial({
      color: 0x1a1f24,
      roughness: 0.85,
    });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x090a0c, roughness: 0.95 });

    // Kain panjang batik & selendang kebaya compang-camping berlapis
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.44, 1.18, 16), innerBatikMat);
    skirt.position.y = 0.62;
    skirt.castShadow = true;
    bodyGroup.add(skirt);

    for (const sx of [-1, 1]) {
      const flap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.96, 8), kebayaMat);
      flap.scale.set(1.2, 1, 0.48);
      flap.position.set(sx * 0.16, 0.92, 0.06);
      flap.rotation.z = sx * -0.1;
      const shawl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.18), kebayaMat);
      shawl.position.set(sx * 0.18, 1.24, -0.02);
      shawl.rotation.z = sx * -0.18;
      bodyGroup.add(flap, shawl);
    }

    // Robekan ujung bawah kebaya bergerigi
    for (let t = 0; t < 10; t++) {
      const ang = (t / 10) * Math.PI * 2;
      const tatter = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 4), kebayaMat);
      tatter.position.set(Math.cos(ang) * 0.39, 0.16, Math.sin(ang) * 0.39);
      tatter.rotation.x = Math.PI;
      bodyGroup.add(tatter);
    }

    for (const sx of [-0.11, 0.11]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.18), paleSkinMat);
      foot.position.set(sx, 0.04, 0.06);
      bodyGroup.add(foot);
    }

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.48, 12), kebayaMat);
    torso.scale.set(1.1, 1.0, 0.72);
    torso.position.y = 1.38;
    bodyGroup.add(torso);

    const head = new THREE.Group();
    head.position.set(0, 1.66, 0.02);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 14), shadowFaceMat);
    skull.scale.set(0.92, 1.08, 0.98);
    skull.position.y = 0.1;
    head.add(skull);

    for (const sx of [-0.055, 0.055]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), hairMat);
      socket.position.set(sx, 0.11, 0.125);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), redEyeMat);
      eye.position.set(sx, 0.11, 0.145);
      head.add(socket, eye);
    }
    const ambuMouth = createArticulatedMouth(paleSkinMat, 1, 0x22181a, 0.96, true);
    ambuMouth.mouthGroup.position.set(0, 0.032, 0.13);
    head.add(ambuMouth.mouthGroup);

    const hairCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.168, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
      hairMat
    );
    hairCrown.position.set(0, 0.12, -0.02);
    head.add(hairCrown);
    bodyGroup.add(head);

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.26, 1.54, 0);
    const rightArm = new THREE.Group();
    rightArm.position.set(0.26, 1.54, 0);
    const leftElbow = new THREE.Group();
    leftElbow.position.set(0, -0.32, 0);
    const rightElbow = new THREE.Group();
    rightElbow.position.set(0, -0.32, 0);

    for (const [idx, armPivot] of [leftArm, rightArm].entries()) {
      const elbowPivot = idx === 0 ? leftElbow : rightElbow;
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.105, 0.34, 8), kebayaMat);
      sleeve.position.y = -0.17;
      armPivot.add(sleeve, elbowPivot);

      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.3, 8), paleSkinMat);
      forearm.position.y = -0.15;
      elbowPivot.add(forearm);

      for (let c = -1; c <= 1; c++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.11, 5), hairMat);
        claw.position.set(c * 0.025, -0.34, 0.04);
        claw.rotation.x = Math.PI * 0.85;
        elbowPivot.add(claw);
      }
      armPivot.rotation.x = -Math.PI * 0.28;
      armPivot.rotation.z = idx === 0 ? 0.14 : -0.14;
      elbowPivot.rotation.x = -0.55;
    }
    bodyGroup.add(leftArm, rightArm);

    const hairStrands: THREE.Mesh[] = [];
    for (let i = 0; i < 10; i++) {
      const spread = (i - 4.5) * 0.14;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(spread * 0.35, 1.72, -0.09),
        new THREE.Vector3(spread * 1.15, 1.36, -0.26 - (i % 2) * 0.08),
        new THREE.Vector3(spread * 1.8, 0.84 + (i % 3) * 0.12, -0.34),
      ]);
      const strand = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.032, 6, false), hairMat);
      bodyGroup.add(strand);
      hairStrands.push(strand);
    }

    return {
      group,
      bodyGroup,
      head,
      mouthPivot: ambuMouth.mouthPivot,
      mouthCavity: ambuMouth.mouthCavity,
      leftArm,
      rightArm,
      leftElbow,
      rightElbow,
      hairStrands,
    };
  }

  if (kind === 'kuntilanak') {
    // Render prosedural sementara hingga asset 3D /assets/models/kuntilanak_indonesian_ghost.glb selesai dimuat.
    const fallbackRoot = new THREE.Group();
    const dirtyGownTex = makeCanvasTexture(
      (ctx, w, h) => {
        ctx.fillStyle = '#a4a79b';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 90; i++) {
          ctx.fillStyle = i % 3 === 0 ? 'rgba(42,36,28,0.28)' : 'rgba(84,32,26,0.18)';
          ctx.fillRect(Math.random() * w, h * 0.45 + Math.random() * (h * 0.55), 8 + Math.random() * 18, 12 + Math.random() * 28);
        }
      },
      2,
      2,
      4,
      true,
      128,
      128
    );
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: dirtyGownTex, roughness: 0.92 });
    const bloodHemMat = new THREE.MeshStandardMaterial({ color: 0x3b2c25, roughness: 0.95 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x7a8584, roughness: 0.78 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0c, roughness: 0.95 });

    const gown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.44, 1.38, 14), whiteMat);
    gown.position.y = 0.76;
    gown.castShadow = true;
    const shroudDrape = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.28, 0.52, 10), whiteMat);
    shroudDrape.position.y = 1.28;
    fallbackRoot.add(gown, shroudDrape);

    // Ujung gaun compang-camping bergerigi
    for (let t = 0; t < 10; t++) {
      const ang = (t / 10) * Math.PI * 2;
      const tatter = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.3, 4), bloodHemMat);
      tatter.position.set(Math.cos(ang) * 0.4, 0.14, Math.sin(ang) * 0.4);
      tatter.rotation.x = Math.PI;
      fallbackRoot.add(tatter);
    }

    const head = new THREE.Group();
    head.position.set(0, 1.54, 0.02);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), skinMat);
    skull.scale.set(0.92, 1.08, 0.96);
    skull.position.y = 0.12;
    head.add(skull);

    const hollowMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0c });
    for (const sx of [-0.05, 0.05]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), hollowMat);
      socket.position.set(sx, 0.13, 0.125);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), redEyeMat);
      eye.position.set(sx, 0.13, 0.148);
      head.add(socket, eye);
    }
    const kuntiMouth = createArticulatedMouth(skinMat, 1, 0x3b1a1c, 1.05, true);
    kuntiMouth.mouthGroup.position.set(0, 0.045, 0.128);
    head.add(kuntiMouth.mouthGroup);

    const hairCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.162, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
      hairMat
    );
    hairCrown.position.set(0, 0.13, -0.02);
    head.add(hairCrown);

    const hairStrands: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const spread = (i - 3.5) * 0.095;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(spread * 0.6, 0.14, -0.08),
        new THREE.Vector3(spread * 1.4, -0.28, -0.18),
        new THREE.Vector3(spread * 1.9, -0.78, -0.14),
      ]);
      const lock = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.028, 6, false), hairMat);
      head.add(lock);
      hairStrands.push(lock);
    }
    fallbackRoot.add(head);

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.24, 1.42, 0);
    const rightArm = new THREE.Group();
    rightArm.position.set(0.24, 1.42, 0);
    const leftElbow = new THREE.Group();
    leftElbow.position.set(0, -0.32, 0);
    const rightElbow = new THREE.Group();
    rightElbow.position.set(0, -0.32, 0);

    for (const [idx, armPivot] of [leftArm, rightArm].entries()) {
      const elbowPivot = idx === 0 ? leftElbow : rightElbow;
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.095, 0.34, 8), whiteMat);
      sleeve.position.y = -0.17;
      armPivot.add(sleeve, elbowPivot);
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.028, 0.28, 8), skinMat);
      forearm.position.y = -0.14;
      elbowPivot.add(forearm);
      for (let c = -1; c <= 1; c++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.085, 5), hairMat);
        claw.position.set(c * 0.02, -0.31, 0.03);
        claw.rotation.x = Math.PI * 0.85;
        elbowPivot.add(claw);
      }
      armPivot.rotation.x = -Math.PI * 0.32;
      elbowPivot.rotation.x = -0.48;
    }
    fallbackRoot.add(leftArm, rightArm);
    bodyGroup.add(fallbackRoot);

    const rig: GhostRig = {
      group,
      bodyGroup,
      head,
      mouthPivot: kuntiMouth.mouthPivot,
      mouthCavity: kuntiMouth.mouthCavity,
      leftArm,
      rightArm,
      leftElbow,
      rightElbow,
      hairStrands,
    };

    attachGlbGhostModel(
      '/assets/models/kuntilanak_indonesian_ghost.glb',
      { targetHeight: 1.78, groundOffset: 0.02, envMapIntensity: 0.9, stripHipsRootMotion: true },
      rig,
      fallbackRoot
    );

    return rig;
  }

  if (kind === 'pocong') {
    const shroudMat = new THREE.MeshStandardMaterial({ color: 0xc2c5ba, roughness: 0.95 });
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x73756d, roughness: 0.92 });
    const faceMat = new THREE.MeshStandardMaterial({ color: 0x262927, roughness: 0.92 });

    // Render prosedural sementara hingga asset 3D /assets/models/pocong_scary.glb selesai dimuat.
    const fallbackRoot = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.12, 6, 14), shroudMat);
    body.position.y = 0.84;
    body.castShadow = true;
    const shroudFold = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.55, 10), shroudMat);
    shroudFold.position.y = 0.98;
    fallbackRoot.add(body, shroudFold);

    for (const ty of [0.28, 0.86, 1.32]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.025, 6, 14), tieMat);
      band.position.y = ty;
      band.rotation.x = Math.PI / 2;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 6), tieMat);
      knot.position.set(0.06, ty, 0.23);
      fallbackRoot.add(band, knot);
    }

    const head = new THREE.Group();
    head.position.set(0, 1.42, 0);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 10), faceMat);
    face.scale.set(0.9, 1.05, 0.92);
    face.position.set(0, 0.06, 0.11);
    fallbackRoot.add(head);

    const topKnot = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 8), shroudMat);
    topKnot.position.set(0, 0.36, -0.02);
    head.add(face, topKnot);

    for (const sx of [-0.045, 0.045]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), redEyeMat);
      eye.position.set(sx, 0.08, 0.225);
      head.add(eye);
    }
    const pocongMouth = createArticulatedMouth(faceMat, 1, 0x1c181a, 0.88, true);
    pocongMouth.mouthGroup.position.set(0, -0.004, 0.215);
    head.add(pocongMouth.mouthGroup);
    bodyGroup.add(fallbackRoot);

    const rig: GhostRig = {
      group,
      bodyGroup,
      head,
      mouthPivot: pocongMouth.mouthPivot,
      mouthCavity: pocongMouth.mouthCavity,
    };

    attachGlbGhostModel(
      '/assets/models/pocong_scary.glb',
      { targetHeight: 1.88, groundOffset: 0.02, envMapIntensity: 0.9 },
      rig,
      fallbackRoot
    );

    return rig;
  }

  if (kind === 'genderuwo') {
    // Render prosedural sementara hingga asset 3D /assets/models/genderuwo.glb selesai dimuat.
    const fallbackRoot = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color: 0x1e2023, roughness: 0.96 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x363432, roughness: 0.88 });
    const loinMat = new THREE.MeshStandardMaterial({ color: 0x453628, roughness: 0.92 });
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.5 });

    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.24, 0.9, 0);
    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.24, 0.9, 0);
    for (const legPivot of [leftLeg, rightLeg]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.135, 0.88, 10), furMat);
      leg.position.y = -0.44;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.3), skinMat);
      foot.position.set(0, -0.86, 0.06);
      legPivot.add(leg, foot);
    }
    fallbackRoot.add(leftLeg, rightLeg);

    // Dada bidang berotot + surai bulu bahu & punggung
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.34, 0.96, 12), skinMat);
    torso.scale.set(1.22, 1.0, 0.72);
    torso.position.y = 1.38;
    torso.castShadow = true;
    fallbackRoot.add(torso);

    for (let m = -2; m <= 2; m++) {
      const maneTuft = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.52, 6), furMat);
      maneTuft.position.set(m * 0.2, 1.84, -0.06);
      maneTuft.rotation.x = -0.35;
      maneTuft.rotation.z = m * -0.18;
      fallbackRoot.add(maneTuft);
    }

    const loin = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 0.44, 10), loinMat);
    loin.position.y = 0.88;
    fallbackRoot.add(loin);

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.62, 1.7, 0);
    const rightArm = new THREE.Group();
    rightArm.position.set(0.62, 1.7, 0);
    const leftElbow = new THREE.Group();
    leftElbow.position.set(0, -0.46, 0);
    const rightElbow = new THREE.Group();
    rightElbow.position.set(0, -0.46, 0);
    for (const [idx, armPivot] of [leftArm, rightArm].entries()) {
      const elbowPivot = idx === 0 ? leftElbow : rightElbow;
      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.48, 10), furMat);
      upperArm.position.y = -0.24;
      armPivot.add(upperArm, elbowPivot);
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.46, 10), furMat);
      forearm.position.y = -0.23;
      elbowPivot.add(forearm);
      for (let c = -1; c <= 1; c++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.12, 5), hornMat);
        claw.position.set(c * 0.045, -0.5, 0.06);
        claw.rotation.x = Math.PI * 0.82;
        elbowPivot.add(claw);
      }
      elbowPivot.rotation.x = -0.45;
    }
    fallbackRoot.add(leftArm, rightArm);

    const head = new THREE.Group();
    head.position.set(0, 1.9, 0.12);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), skinMat);
    skull.position.y = 0.12;
    const browMane = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), furMat);
    browMane.position.set(0, 0.2, -0.04);
    head.add(skull, browMane);

    const gendMouth = createArticulatedMouth(skinMat, 1, 0x2a1414, 1.85, true);
    gendMouth.mouthGroup.position.set(0, 0.02, 0.21);
    head.add(gendMouth.mouthGroup);

    for (const sx of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), redEyeMat);
      eye.position.set(sx, 0.15, 0.22);
      head.add(eye);
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.075, 5), hornMat);
      fang.position.set(sx * 0.85, 0.04, 0.23);
      head.add(fang);
    }
    fallbackRoot.add(head);
    bodyGroup.add(fallbackRoot);

    const rig: GhostRig = {
      group,
      bodyGroup,
      head,
      mouthPivot: gendMouth.mouthPivot,
      mouthCavity: gendMouth.mouthCavity,
      leftArm,
      rightArm,
      leftElbow,
      rightElbow,
      leftLeg,
      rightLeg,
    };

    attachGlbGhostModel(
      '/assets/models/genderuwo.glb',
      { targetHeight: 2.28, groundOffset: 0.02, envMapIntensity: 0.9, humanoidSkinPreset: 'genderuwo' },
      rig,
      fallbackRoot
    );

    return rig;
  }

  // Boneka Uci ("boneka buna"): pertahankan model prosedural sementara hingga /assets/models/buna.glb dimuat
  const fallbackRoot = new THREE.Group();
  const crackTex = makeCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#c8c3ba';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#33302c';
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        let cx = (i * 29) % w;
        let cy = (i * 41) % h;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        for (let s = 0; s < 4; s++) {
          cx += (s % 2 === 0 ? 12 : -9);
          cy += 16;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    },
    1,
    1,
    4,
    true,
    128,
    128
  );
  const porcelainMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: crackTex, roughness: 0.38 });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x706960, roughness: 0.5 });
  const dressMat = new THREE.MeshStandardMaterial({ color: 0xa6997e, roughness: 0.88 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x151313, roughness: 0.9 });
  const bowMat = new THREE.MeshStandardMaterial({ color: 0x8a261f, roughness: 0.65 });

  // Kaki boneka porselen bersendi lutut bulat
  for (const sx of [-0.075, 0.075]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.28, 8), porcelainMat);
    leg.position.set(sx, 0.14, 0);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), jointMat);
    knee.position.set(sx, 0.22, 0.01);
    fallbackRoot.add(leg, knee);
  }

  // Gaun bertingkat berenda + kerah renda + pita dada
  const dressLower = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.34, 14), dressMat);
  dressLower.position.y = 0.36;
  const dressUpper = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.28, 14), dressMat);
  dressUpper.position.y = 0.5;
  const chestBow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.04), bowMat);
  chestBow.position.set(0, 0.56, 0.11);
  fallbackRoot.add(dressLower, dressUpper, chestBow);

  const head = new THREE.Group();
  head.position.set(0, 0.66, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 14), porcelainMat);
  skull.position.y = 0.12;
  head.add(skull);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.165, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
    hairMat
  );
  hair.position.y = 0.14;
  head.add(hair);

  // Dua kuncir ikal kiri & kanan + pita rambut
  for (const side of [-1, 1]) {
    const pigtail = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.055, 0.28, 8), hairMat);
    pigtail.position.set(side * 0.17, 0.05, -0.04);
    pigtail.rotation.z = side * 0.18;
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.04), bowMat);
    ribbon.position.set(side * 0.15, 0.18, -0.02);
    head.add(pigtail, ribbon);
  }

  const hollowEye = new THREE.MeshBasicMaterial({ color: 0x050505 });
  for (const sx of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), hollowEye);
    eye.position.set(sx, 0.13, 0.132);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), redEyeMat);
    glint.position.set(sx, 0.13, 0.162);
    head.add(eye, glint);
  }
  const uciMouth = createArticulatedMouth(porcelainMat, 1, 0x8a261f, 0.8, true);
  uciMouth.mouthGroup.position.set(0, 0.048, 0.134);
  head.add(uciMouth.mouthGroup);
  fallbackRoot.add(head);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.18, 0.58, 0);
  const rightArm = new THREE.Group();
  rightArm.position.set(0.18, 0.58, 0);
  const leftElbow = new THREE.Group();
  leftElbow.position.set(0, -0.15, 0);
  const rightElbow = new THREE.Group();
  rightElbow.position.set(0, -0.15, 0);
  for (const [idx, armPivot] of [leftArm, rightArm].entries()) {
    const elbowPivot = idx === 0 ? leftElbow : rightElbow;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 8), dressMat);
    puff.position.y = -0.02;
    const armUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.12, 8), porcelainMat);
    armUpper.position.y = -0.09;
    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), jointMat);
    armPivot.add(puff, armUpper, elbowPivot);

    const armLower = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.13, 8), porcelainMat);
    armLower.position.y = -0.07;
    elbowPivot.add(elbowJoint, armLower);
    elbowPivot.rotation.x = -0.45;
  }
  fallbackRoot.add(leftArm, rightArm);
  bodyGroup.add(fallbackRoot);

  const uciRig: GhostRig = {
    group,
    bodyGroup,
    head,
    mouthPivot: uciMouth.mouthPivot,
    mouthCavity: uciMouth.mouthCavity,
    leftArm,
    rightArm,
    leftElbow,
    rightElbow,
  };

  attachGlbGhostModel(
    '/assets/models/buna.glb',
    {
      targetHeight: 1.12,
      groundOffset: 0.02,
      envMapIntensity: 0.9,
      rotationY: Math.PI,
      humanoidSkinPreset: 'buna',
    },
    uciRig,
    fallbackRoot
  );

  return uciRig;
}

export type FurnitureKind =
  | 'table'
  | 'closet'
  | 'bed'
  | 'sofa'
  | 'counter'
  | 'dining_set'
  | 'bookshelf'
  | 'fridge'
  | 'tv_stand'
  | 'vanity'
  | 'clock';

export interface ClosetRig {
  group: THREE.Group;
  leftDoorPivot: THREE.Group;
  rightDoorPivot: THREE.Group;
}

/**
 * Membangun lemari kayu berongga dengan sekat interior, rel gantungan baju,
 * serta daun pintu engsel berkisi-kisi (krepyak) untuk visual sembunyi di dalam lemari.
 */
export function createClosetRig(): ClosetRig {
  const group = new THREE.Group();
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3b2619, roughness: 0.84 });
  const interiorWood = new THREE.MeshStandardMaterial({ color: 0x4b3120, roughness: 0.88 });
  const warmWood = new THREE.MeshStandardMaterial({ color: 0x593a24, roughness: 0.78 });
  const coatDark = new THREE.MeshStandardMaterial({ color: 0x26292d, roughness: 0.94 });
  const coatWarm = new THREE.MeshStandardMaterial({ color: 0x4e3b2e, roughness: 0.92 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x5c6266, roughness: 0.42, metalness: 0.72 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd4a44a, roughness: 0.3, metalness: 0.8 });

  // Rangka boks lemari berongga (dinding belakang, kiri, kanan, alas, atap, rak, mahkota)
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(1.12, 2.16, 0.05), interiorWood);
  backPanel.position.set(0, 1.08, -0.355);
  backPanel.castShadow = true;
  backPanel.receiveShadow = true;

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.16, 0.74), darkWood);
  leftWall.position.set(-0.535, 1.08, 0);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.16, 0.74), darkWood);
  rightWall.position.set(0.535, 1.08, 0);
  rightWall.castShadow = true;
  rightWall.receiveShadow = true;

  const floorBoard = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.06, 0.72), darkWood);
  floorBoard.position.set(0, 0.03, 0);
  floorBoard.receiveShadow = true;

  const topBoard = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.06, 0.76), darkWood);
  topBoard.position.set(0, 2.13, 0);
  topBoard.castShadow = true;

  const topShelf = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.035, 0.42), warmWood);
  topShelf.position.set(0, 1.88, -0.14);

  const crown = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.09, 0.84), warmWood);
  crown.position.set(0, 2.2, 0);
  crown.castShadow = true;

  // Palang besi gantungan & pakaian tergantung di sudut kiri/kanan (tidak menutup celah pandang tengah)
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.02, 8), metal);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 1.76, -0.04);

  for (const [cx, mat] of [
    [-0.38, coatDark],
    [-0.29, coatWarm],
    [0.37, coatDark],
  ] as const) {
    const garment = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.96, 0.24), mat);
    garment.position.set(cx, 1.24, -0.05);
    garment.rotation.z = cx < 0 ? 0.04 : -0.04;
    group.add(garment);
  }

  group.add(backPanel, leftWall, rightWall, floorBoard, topBoard, topShelf, crown, rail);

  // Dua daun pintu berengsel dengan kisi-kisi ventilasi (krepyak) di ketinggian mata (y = 0.88..1.66)
  const buildDoorLeaf = (isLeft: boolean): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(isLeft ? -0.51 : 0.51, 0, 0.36);
    const dir = isLeft ? 1 : -1;
    const leafW = 0.496; // menyisakan celah vertikal tipis ~2.8cm di tengah saat tertutup

    const hingeRail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.04, 0.032), darkWood);
    hingeRail.position.set(dir * 0.03, 1.08, 0);
    hingeRail.castShadow = true;

    const centerStile = new THREE.Mesh(new THREE.BoxGeometry(0.055, 2.04, 0.032), darkWood);
    centerStile.position.set(dir * (leafW - 0.0275), 1.08, 0);
    centerStile.castShadow = true;

    const bottomPanel = new THREE.Mesh(new THREE.BoxGeometry(leafW, 0.82, 0.028), darkWood);
    bottomPanel.position.set(dir * (leafW * 0.5), 0.47, 0);
    bottomPanel.castShadow = true;

    const topRail = new THREE.Mesh(new THREE.BoxGeometry(leafW, 0.44, 0.03), darkWood);
    topRail.position.set(dir * (leafW * 0.5), 1.88, 0);
    topRail.castShadow = true;

    pivot.add(hingeRail, centerStile, bottomPanel, topRail);

    // Kisi-kisi horizontal berkemiringan sehingga celah luar terlihat jelas saat bersembunyi di dalam
    const slatW = leafW - 0.095;
    for (let s = 0; s < 11; s++) {
      const sy = 0.91 + s * 0.069;
      const slat = new THREE.Mesh(new THREE.BoxGeometry(slatW, 0.032, 0.016), warmWood);
      slat.position.set(dir * (leafW * 0.5), sy, 0);
      slat.rotation.x = 0.38;
      slat.castShadow = true;
      slat.receiveShadow = true;
      pivot.add(slat);
    }

    // Gagang kuningan luar & grendel kecil dalam
    const outerHandle = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.15, 0.035), brass);
    outerHandle.position.set(dir * (leafW - 0.045), 1.08, 0.026);
    const innerLatch = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.08, 0.03), brass);
    innerLatch.position.set(dir * (leafW - 0.045), 1.08, -0.024);
    pivot.add(outerHandle, innerLatch);

    return pivot;
  };

  const leftDoorPivot = buildDoorLeaf(true);
  const rightDoorPivot = buildDoorLeaf(false);
  group.add(leftDoorPivot, rightDoorPivot);

  return { group, leftDoorPivot, rightDoorPivot };
}

export function createPropFurniture(kind: FurnitureKind): THREE.Group {
  if (kind === 'closet') {
    return createClosetRig().group;
  }
  const g = new THREE.Group();
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3b2619, roughness: 0.84 });
  const warmWood = new THREE.MeshStandardMaterial({ color: 0x593a24, roughness: 0.78 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x454f49, roughness: 0.95 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x4c5357, roughness: 0.45, metalness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd4a44a, roughness: 0.3, metalness: 0.8 });

  if (kind === 'table') {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.0), darkWood);
    top.position.y = 0.75;
    top.castShadow = true;
    g.add(top);
    for (const sx of [-0.7, 0.7]) {
      for (const sz of [-0.4, 0.4]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), darkWood);
        leg.position.set(sx, 0.375, sz);
        g.add(leg);
      }
    }
    // Kap lampu meja antik & map dokumen
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.24, 8), brass);
    base.position.set(-0.45, 0.91, -0.2);
    g.add(base);
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.18, 0.18, 10),
      new THREE.MeshStandardMaterial({ color: 0xb89c6a, roughness: 0.8 })
    );
    shade.position.set(-0.45, 1.08, -0.2);
    g.add(shade);
  } else if (kind === 'dining_set') {
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 1.15), warmWood);
    top.position.y = 0.78;
    top.castShadow = true;
    g.add(top);
    for (const sx of [-0.95, 0.95]) {
      for (const sz of [-0.46, 0.46]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.78, 0.09), darkWood);
        leg.position.set(sx, 0.39, sz);
        g.add(leg);
      }
    }
    // 4 Kursi makan di kiri-kanan
    for (const cz of [-0.82, 0.82]) {
      for (const cx of [-0.55, 0.55]) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), darkWood);
        seat.position.set(cx, 0.45, cz);
        g.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.06), darkWood);
        back.position.set(cx, 0.72, cz + (cz > 0 ? 0.18 : -0.18));
        g.add(back);
        const cLeg = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.45, 0.36), darkWood);
        cLeg.position.set(cx, 0.225, cz);
        g.add(cLeg);
      }
    }
  } else if (kind === 'bookshelf') {
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.65, 2.2, 0.08), darkWood);
    back.position.set(0, 1.1, -0.18);
    g.add(back);
    for (const sx of [-0.79, 0.79]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.44), darkWood);
      side.position.set(sx, 1.1, 0);
      g.add(side);
    }
    const bookColors = [0x6e2b24, 0x274234, 0x3b495c, 0x7a5b2d];
    for (let row = 0; row < 4; row++) {
      const y = 0.28 + row * 0.52;
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.05, 0.42), warmWood);
      shelf.position.set(0, y, 0);
      g.add(shelf);
      for (let b = 0; b < 7; b++) {
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.28 + (b % 3) * 0.05, 0.26),
          new THREE.MeshStandardMaterial({ color: bookColors[(row + b) % bookColors.length], roughness: 0.85 })
        );
        book.position.set(-0.56 + b * 0.17, y + 0.17, 0.02);
        g.add(book);
      }
    }
  } else if (kind === 'fridge') {
    const enamel = new THREE.MeshStandardMaterial({ color: 0x9aa39d, roughness: 0.35, metalness: 0.25 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.95, 0.85), enamel);
    body.position.y = 0.975;
    body.castShadow = true;
    g.add(body);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.04, 0.87), metal);
    seam.position.y = 1.32;
    g.add(seam);
    for (const hy of [1.58, 0.95]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.06), metal);
      handle.position.set(-0.34, hy, 0.45);
      g.add(handle);
    }
  } else if (kind === 'tv_stand') {
    const credenza = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.58, 0.62), darkWood);
    credenza.position.y = 0.29;
    credenza.castShadow = true;
    g.add(credenza);
    // TV Tabung Era 1980-an + Antena V
    const tvBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.56, 0.46),
      new THREE.MeshStandardMaterial({ color: 0x261d17, roughness: 0.72 })
    );
    tvBox.position.set(0, 0.86, 0);
    g.add(tvBox);
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.4, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x1e2c2b, roughness: 0.25, metalness: 0.2 })
    );
    screen.position.set(-0.04, 0.86, 0.23);
    g.add(screen);
    for (const sa of [-1, 1]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.42, 6), metal);
      ant.position.set(sa * 0.14, 1.32, 0);
      ant.rotation.z = sa * -0.45;
      g.add(ant);
    }
  } else if (kind === 'bed') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 2.2), darkWood);
    frame.position.y = 0.25;
    frame.castShadow = true;
    g.add(frame);
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.95, 0.12), warmWood);
    headboard.position.set(0, 0.62, -1.06);
    g.add(headboard);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.24, 2.05), fabric);
    mattress.position.y = 0.5;
    g.add(mattress);
    const pillow = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.13, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x999e98, roughness: 0.9 })
    );
    pillow.position.set(0, 0.66, -0.76);
    g.add(pillow);
  } else if (kind === 'sofa') {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 0.9), fabric);
    seat.position.y = 0.24;
    seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.56, 0.24), fabric);
    back.position.set(0, 0.64, -0.34);
    g.add(back);
    for (const sx of [-0.95, 0.95]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.56, 0.92), darkWood);
      arm.position.set(sx, 0.38, 0);
      g.add(arm);
    }
  } else if (kind === 'vanity') {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.76, 0.55), warmWood);
    desk.position.y = 0.38;
    g.add(desk);
    const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, 0.08), darkWood);
    mirrorFrame.position.set(0, 1.18, -0.2);
    g.add(mirrorFrame);
    const mirror = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.72, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x7b8d91, roughness: 0.08, metalness: 0.85 })
    );
    mirror.position.set(0, 1.18, -0.15);
    g.add(mirror);
  } else if (kind === 'clock') {
    // Jam Berdiri Antik (jarum jam membeku di Dimensi Gaib)
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.56, 2.25, 0.42), darkWood);
    tower.position.y = 1.125;
    tower.castShadow = true;
    g.add(tower);
    const dial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: 0xd9d2bd, roughness: 0.4 })
    );
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 1.82, 0.21);
    g.add(dial);
  } else {
    // 'counter' (Meja dapur + wastafel & kompor)
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.85, 0.8), darkWood);
    base.position.y = 0.425;
    base.castShadow = true;
    g.add(base);
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(2.66, 0.07, 0.86),
      new THREE.MeshStandardMaterial({ color: 0x737d78, roughness: 0.5 })
    );
    top.position.y = 0.88;
    g.add(top);
    const stove = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.52), metal);
    stove.position.set(0.65, 0.94, 0);
    g.add(stove);
  }

  return g;
}
