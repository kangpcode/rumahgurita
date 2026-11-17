import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  detectFloor,
  distance3D,
  isInSafeZone,
  resolveGroundElevation,
  resolveHorizontalCollision,
} from './collision';
import { CHARACTERS, INITIAL_RUMORS, INTRO_CAR_DIALOGUES, STORY_BEATS } from './data';
import { HorrorAudioEngine } from './audioEngine';
import {
  BILLBOARD_POS,
  buildLevelGeometry,
  CARPORT_VEHICLES,
  CART_PLACEMENTS,
  COMPOUND_GATE_Z,
  COURTYARD_POOL_POS,
  createInitialDoors,
  createInitialGhosts,
  createInitialInteractables,
  FLOOR_HEIGHT,
  FURNITURE_SPECS,
  HOUSE_FRONT_Z,
  LAMP_POSITIONS,
  MOSQUE_POS,
  NEIGHBORHOOD_HOUSES,
  PLAYER_SPAWN,
  PLAYER_SPAWN_YAW,
  POS_RONDA_POS,
  SAFE_ZONES,
  STAIR_ZONES,
  TREE_PLACEMENTS,
  WARUNG_POS,
} from './levelData';
import {
  createArrivalCar,
  createBillboardWindah,
  createClosetRig,
  createCompoundFenceAndGatehouse,
  createCourtyardSwimmingPool,
  createDoorAssembly,
  createFirstPersonHandRig,
  createGarageCarportStructure,
  createGhostModel,
  createHumanoidNPC,
  createKujangShrine,
  createMaterialLibrary,
  createMosque,
  createNeighborhoodHouseRoofAndFacade,
  createNightSkyDome,
  createOctopusStatue,
  createParkedVehicle,
  createPlaque666,
  createPosRonda,
  createPropFurniture,
  createRadioTower,
  createRoadAndSidewalkDetails,
  createRooftopSculptures,
  createRumahGuritaFacadeDetails,
  createRumahGuritaInteriorDetails,
  createSoftParticleTexture,
  createStreetCart,
  createStreetLamp,
  createStreetPuddles,
  createStreetTree,
  createVolumetricConeMaterial,
  createWarungCeuTitin,
  createWaterRippleNormalTexture,
  syncGhostGlbBones,
  syncHumanoidGlbBones,
  type ArrivalCarRig,
  type FirstPersonHandRig,
  type GhostRig,
  type HumanoidRig,
  type MaterialLibrary,
  type WaterSurfaceHandle,
} from './proceduralModels';
import {
  BAG_COLOR_OPTIONS,
  DEFAULT_COSMETICS,
  type CoopActionEvent,
  type GhostSyncItem,
  type PlayerCosmetics,
  type RoomDifficulty,
  type RoomWorldState,
  type SquadSyncPayload,
  type WorldActionBroadcast,
} from '../shared/lobbyProtocol';
import {
  computeCompanionFollowTarget,
  computeCurrentObjective,
  computeGhostWeakeningFactor,
  countBrokenSegel,
  debunkRumor,
  evaluateEnding,
  getDoorClosedCollider,
  stepDualBatteries,
  stepGhostAI,
  tryInteractDoor,
} from './rules';
import type {
  AABB,
  CharacterId,
  CutsceneHUDState,
  DoorData,
  EndingType,
  FloorId,
  GameHUDState,
  GameMapSnapshot,
  GamePhase,
  GhostData,
  GhostKind,
  GraphicsQuality,
  InteractableItem,
  JumpscareEvent,
  MapMarker,
  MapRectItem,
  NpcVoiceId,
  PerspectiveMode,
  RumorEntry,
  RunSummary,
  Vec3,
  VisualSettings,
} from './types';

function computeLipOpenness(text: string, elapsed: number): number {
  if (!text || elapsed < 0) return 0;
  const charsPerSec = 12.2;
  const idx = Math.floor(elapsed * charsPerSec);
  if (idx >= text.length) return 0;
  const ch = text[idx].toLowerCase();
  let target = 0.24;
  if (ch === 'a') target = 0.96;
  else if (ch === 'o' || ch === 'e') target = 0.72;
  else if (ch === 'i' || ch === 'u') target = 0.48;
  else if (' .,!?;:"\'-'.includes(ch)) target = 0.05;
  const syllablePulse = 0.72 + Math.abs(Math.sin(elapsed * 21.0)) * 0.28;
  return Math.min(1, target * syllablePulse);
}

function applyMouthLipSync(
  mouthPivot: THREE.Object3D | undefined,
  mouthCavity: THREE.Object3D | undefined,
  openAmount: number,
  _facingSign: 1 | -1 = 1
): void {
  if (!mouthPivot || !mouthCavity) return;
  const clamped = THREE.MathUtils.clamp(openAmount, 0, 1);
  mouthPivot.position.y = -0.004 - clamped * 0.011;
  mouthCavity.scale.y = 0.05 + clamped * 0.88;
}

// Shader Post-Processing Horor Sinematik ala Unreal Engine 5 (Vignette, Grain, Aberration, Color Grade)
const CinematicHorrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uAberration: { value: 0.0012 },
    uGrain: { value: 0.025 },
    uHorrorMix: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uGrain;
    uniform float uHorrorMix;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 dir = vUv - vec2(0.5);
      float dist = length(dir);
      vec2 offset = dir * uAberration * (0.5 + dist * 2.0);
      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      vec3 col = vec3(r, g, b);

      // Subtle split-toning & cool/crimson horror grading (bayangan malam dingin, sorotan lampu hangat)
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 coolShadow = vec3(col.r * 0.91, col.g * 0.96, col.b * 1.07);
      vec3 warmHighlight = vec3(col.r * 1.05, col.g * 1.01, col.b * 0.94);
      col = mix(coolShadow, warmHighlight, smoothstep(0.08, 0.62, lum));
      vec3 horrorTone = mix(vec3(lum), vec3(lum * 0.84, lum * 0.92, lum * 1.02), 0.55);
      col = mix(col, horrorTone, uHorrorMix);

      // Film grain & cinematic vignette
      float noise = (rand(vUv + fract(uTime * 0.37)) - 0.5) * uGrain;
      col += noise;
      float vig = smoothstep(0.95, 0.22, dist * (1.0 + uVignette));
      col *= mix(1.0 - uVignette, 1.0, vig);

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

// Pre-allocated scratch math objects (zero GC per frame)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _fogColorTarget = new THREE.Color();

export interface WorldCallbacks {
  onHudUpdate: (hud: GameHUDState) => void;
  onToast: (message: string, tone?: 'info' | 'warn' | 'fact') => void;
  onOpenNpcDialog: (npcId: string) => void;
  onOpenRadioPuzzle: () => void;
  onRumorsChanged: (rumors: RumorEntry[]) => void;
  onJumpscare: (event: JumpscareEvent) => void;
  onGameOver: (summary: RunSummary) => void;
  onToggleJournal: () => void;
  onPauseRequest: () => void;
  onCoopAction?: (action: CoopActionEvent) => void;
}

export class HorrorWorld {
  private container: HTMLElement;
  private callbacks: WorldCallbacks;
  // Renderer & Post-Processing (UE5 style)
  private renderer!: THREE.WebGLRenderer;
  private composer?: EffectComposer;
  private bloomPass?: UnrealBloomPass;
  private horrorPass?: ShaderPass;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private isSoftwareGl = false;
  private mats!: MaterialLibrary;
  public audio = new HorrorAudioEngine();

  // Loop state
  private frameId = 0;
  private destroyed = false;
  private lastTime = performance.now();
  private hudEmitTimer = 0;
  private fpsCounter = 0;
  private fpsTimer = 0;
  private currentFps = 60;

  // World data & dynamic meshes
  private baseColliders: AABB[] = [];
  private activeColliders: AABB[] = [];
  private wallMeshes = new Map<string, THREE.Mesh>();
  private doors: DoorData[] = [];
  private doorRigs = new Map<
    string,
    { pivot: THREE.Group; lockPlateMat: THREE.MeshStandardMaterial }
  >();
  private interactables: InteractableItem[] = [];
  private itemMeshes = new Map<string, THREE.Object3D>();
  private ghosts: GhostData[] = [];
  private ghostRigs = new Map<string, GhostRig>();
  private npcAnimations: { id: string; rig: HumanoidRig }[] = [];
  private playerRig!: HumanoidRig;
  private fpHandRig?: FirstPersonHandRig;
  private heldPropKind: 'none' | 'key' | 'salt' | 'battery' | 'evidence' = 'none';
  private heldPropTimer = 0;
  private fpRightRaise = 1;
  private fpLeftRaise = 0;
  private kujangGroup!: THREE.Group;
  private beaconMesh!: THREE.Mesh;
  private octopusEyes: THREE.Mesh[] = [];
  private dustPoints!: THREE.Points;
  private poolWater!: THREE.Mesh;
  private poolNormalTex?: THREE.DataTexture;
  private courtyardWaterNormalTex?: THREE.DataTexture;
  private streetPuddles?: WaterSurfaceHandle;
  private treeCanopies: { pivot: THREE.Object3D; phase: number }[] = [];

  // Lights & Atmospheric Refs
  private dirLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private flashlight!: THREE.SpotLight;
  private flashlightSpill!: THREE.SpotLight;
  private flashlightTarget = new THREE.Object3D();
  private flashlightAimDir = new THREE.Vector3(0, 0, -1);
  private flashlightOrigin = new THREE.Vector3();
  private flashlightBeamCone!: THREE.Mesh;
  private uvLight!: THREE.SpotLight;
  private interiorBulbs: { light: THREE.PointLight; baseIntensity: number; seed: number }[] = [];
  private gateLanternLights: THREE.PointLight[] = [];
  private streetLampBulbs: { x: number; y: number; z: number; seed: number }[] = [];
  private streetLampPool: THREE.PointLight[] = [];
  private skyDomeMesh?: THREE.Mesh;
  private skyDomeMat?: THREE.ShaderMaterial;
  private arrivalCar!: ArrivalCarRig;
  private endingLight!: THREE.PointLight;
  private indoorBlend = 0;
  private puddleSplashSlot = 0;
  private lastHeadBobSin = 0;
  private visualSettings: VisualSettings = {
    brightness: 1.05,
    fov: 72,
    sensitivity: 1.0,
    cinematicEffects: true,
  };

  // Cutscene States (Intro Car Arrival/Exit/Depart & 3 Distinct 3D Ending Animations)
  private introCutscene: {
    stage: 'arriving' | 'exiting' | 'departing';
    timer: number;
    controlReleased: boolean;
    doorOpened: boolean;
    doorClosed: boolean;
    departAudioPlayed: boolean;
    lastDialogueIdx: number;
  } | null = null;
  private endingCutscene: {
    ending: EndingType;
    timer: number;
    duration: number;
    summary: RunSummary;
  } | null = null;

  // Player state
  private phase: GamePhase = 'title';
  private characterId: CharacterId = 'raka';
  private cosmetics: PlayerCosmetics = { ...DEFAULT_COSMETICS };
  private difficulty: RoomDifficulty = 'Normal';
  private isMultiplayer = false;
  private isHostAuthority = false;
  private isSpectator = false;
  private downed = false;
  private inputSuspended = false;
  private spawnSlot = 0;
  private aiCompanionCount = 0;
  private aiCompanions: {
    id: CharacterId;
    name: string;
    rig: HumanoidRig;
    pos: Vec3;
    yaw: number;
    phaseOffset: number;
  }[] = [];
  private remoteRigs = new Map<
    string,
    {
      rig: HumanoidRig;
      nameSprite: THREE.Sprite;
      beamLight: THREE.PointLight;
      charId: CharacterId;
      bagColor: string;
      accessory: string;
      nickname: string;
      targetPos: Vec3;
      targetYaw: number;
      flashlightOn: boolean;
      isCrouching: boolean;
      downed: boolean;
      micOn: boolean;
      role: 'player' | 'spectator';
    }
  >();
  private remoteGhostTargets = new Map<string, GhostSyncItem>();
  private quality: GraphicsQuality = 'medium';
  private playerPos: Vec3 = { ...PLAYER_SPAWN };
  private yaw = 0;
  private pitch = 0;
  private currentEyeHeight = 1.65;
  private headBobPhase = 0;
  private cameraRoll = 0;
  private bodyVisualYawOffset = 0;
  private perspective: PerspectiveMode = 'first-person';
  private flashlightOn = true;
  private uvMode = false;
  private isHiding = false;
  private hideOrigin: Vec3 = { ...PLAYER_SPAWN };
  private closetRigs: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    ry: number;
    leftDoor: THREE.Group;
    rightDoor: THREE.Group;
    openAmount: number;
    autoCloseTimer: number;
  }> = [];
  private activeClosetIndex: number | null = null;
  private hideTransition = 0;
  private hideEnterDoorTimer = 0;
  private hideTargetYaw = 0;
  private closetInteriorLight?: THREE.PointLight;
  private sanity = 100;
  private stamina = 100;
  private flashlightBattery = 100;
  private uvBattery = 100;
  private saltCount = 2;
  private collectedKeyIds: string[] = [];
  private collectedKeyLabels: string[] = [];
  private ghostHits = 0;
  private invulnTimer = 0;
  private cameraTrauma = 0;
  private elapsedSeconds = 0;
  private inDimensiGaib = false;
  private raniRescued = false;
  private kujangClaimed = false;
  private rumors: RumorEntry[] = INITIAL_RUMORS.map((r) => ({ ...r }));
  private talkedNpcIds = new Set<string>();
  private activeSpeech: {
    target: string;
    text: string;
    elapsed: number;
    duration: number;
  } | null = null;
  private triggeredSecondBeat = false;
  private triggeredRooftopBeat = false;
  private facadeMaterials?: {
    facadeMat: THREE.MeshStandardMaterial;
    trimMat: THREE.MeshStandardMaterial;
    windowMat: THREE.MeshStandardMaterial;
  };

  // Input & Smooth Motion State
  private keys = new Set<string>();
  private isDraggingLook = false;
  private hasHoverPointer = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private lastMouseMoveAt = 0;
  private pointerLockIgnoreMoves = 0;
  private moveVelX = 0;
  private moveVelZ = 0;
  private handSwayX = 0;
  private handSwayY = 0;
  private lookTouchId: number | null = null;
  private lastTouchAt = 0;
  private lastTouchX = 0;
  private lastTouchY = 0;
  private virtualForward = 0;
  private virtualRight = 0;
  private virtualCrouch = false;
  private virtualSprint = false;
  private resizeObserver?: ResizeObserver;

  private dampAngle(current: number, target: number, lambda: number, dt: number): number {
    let diff = (target - current) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * (1 - Math.exp(-lambda * dt));
  }

  private applyLookDelta(dx: number, dy: number, sensitivity: number): void {
    const mult = this.visualSettings.sensitivity;
    const dYaw = -dx * sensitivity * mult;
    const dPitch = -dy * sensitivity * mult;
    this.yaw += dYaw;
    if (this.isHiding) {
      let rel = ((this.yaw - this.hideTargetYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      rel = THREE.MathUtils.clamp(rel, -0.58, 0.58);
      this.yaw = this.hideTargetYaw + rel;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, -0.46, 0.48);
    } else {
      this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, -1.42, 1.42);
    }
    this.handSwayX = THREE.MathUtils.clamp(this.handSwayX - dYaw * 0.16, -0.055, 0.055);
    this.handSwayY = THREE.MathUtils.clamp(this.handSwayY - dPitch * 0.14, -0.045, 0.045);
  }

  private computeThirdPersonCameraPos(
    anchorX: number,
    anchorY: number,
    anchorZ: number,
    floorY: number
  ): THREE.Vector3 {
    const rightVec = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const shoulderX = anchorX + rightVec.x * 0.26;
    const shoulderZ = anchorZ + rightVec.z * 0.26;

    // Pitch elevasi dibatasi pada boom camera agar saat menengadah ke langit malam kamera tidak menusuk panggul/bawah baju
    const boomPitch = Math.max(-0.75, Math.min(0.68, this.pitch));
    const maxBoom = 2.42;
    const backDirX = Math.sin(this.yaw);
    const backDirZ = Math.cos(this.yaw);

    let safeBoom = maxBoom;
    const steps = 12;
    for (let s = 1; s <= steps; s++) {
      const bDist = (s / steps) * maxBoom;
      const hD = bDist * Math.cos(boomPitch);
      const vD = bDist * Math.sin(boomPitch);
      const testX = shoulderX + backDirX * hD;
      const testZ = shoulderZ + backDirZ * hD;
      const testY = Math.max(floorY + 0.45, anchorY - vD);
      const blocked = this.activeColliders.some(
        (c) =>
          testX >= c.minX - 0.18 &&
          testX <= c.maxX + 0.18 &&
          testZ >= c.minZ - 0.18 &&
          testZ <= c.maxZ + 0.18 &&
          testY >= c.minY - 0.15 &&
          testY <= c.maxY + 0.15
      );
      if (blocked) {
        safeBoom = Math.max(1.15, ((s - 1) / steps) * maxBoom);
        break;
      }
    }

    const horizDist = safeBoom * Math.cos(boomPitch);
    const vertDist = safeBoom * Math.sin(boomPitch);
    const camY = Math.max(floorY + 0.45, anchorY - vertDist);

    return new THREE.Vector3(
      shoulderX + backDirX * horizDist,
      camY,
      shoulderZ + backDirZ * horizDist
    );
  }

  constructor(container: HTMLElement, callbacks: WorldCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.initRendererAndScene();
    this.buildEnvironment();
    this.bindInput();
    this.startLoop();
  }

  private detectSoftwareGl(): boolean {
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  }

  private initRendererAndScene(): void {
    this.isSoftwareGl = this.detectSoftwareGl();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.userSelect = 'none';
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06090b);
    this.scene.fog = new THREE.FogExp2(0x06090b, 0.019);

    this.camera = new THREE.PerspectiveCamera(72, w / h, 0.06, 260);
    this.scene.add(this.camera);

    // Ganti RoomEnvironment terang dengan IBL langit malam bergradasi (pantulan bulan dingin + bias hangat jalan)
    if (!this.isSoftwareGl) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const nightIblScene = new THREE.Scene();
      nightIblScene.background = new THREE.Color(0x050810);
      const iblHemi = new THREE.HemisphereLight(0x365278, 0x19130d, 0.65);
      const moonBounce = new THREE.DirectionalLight(0x88b0e6, 0.72);
      moonBounce.position.set(1.2, 2.0, 1.0);
      const streetBounce = new THREE.DirectionalLight(0xd9924c, 0.28);
      streetBounce.position.set(-1.0, 0.35, -1.2);
      nightIblScene.add(iblHemi, moonBounce, streetBounce);
      this.scene.environment = pmrem.fromScene(nightIblScene, 0.04).texture;
      this.scene.environmentIntensity = 0.32;
      pmrem.dispose();

      // Pipeline Post-Processing UE5: Render -> UnrealBloom -> ACES Output -> Cinematic Horror Grade
      const composer = new EffectComposer(this.renderer);
      composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      composer.setSize(w, h);
      const renderPass = new RenderPass(this.scene, this.camera);
      const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.64, 0.76);
      const outputPass = new OutputPass();
      const horrorPass = new ShaderPass(CinematicHorrorShader);
      composer.addPass(renderPass);
      composer.addPass(bloomPass);
      composer.addPass(outputPass);
      composer.addPass(horrorPass);
      this.composer = composer;
      this.bloomPass = bloomPass;
      this.horrorPass = horrorPass;
    }

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.mats = createMaterialLibrary(maxAniso);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
  }

  private renderScene(): void {
    if (this.skyDomeMesh) {
      this.skyDomeMesh.position.set(
        this.camera.position.x,
        this.camera.position.y * 0.25,
        this.camera.position.z
      );
    }
    if (this.composer && !this.isSoftwareGl && this.quality !== 'low') {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private buildEnvironment(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // Kubah langit malam Bandung + bulan & pegunungan (selalu mengitari kamera agar bebas clipping/spot hitam)
    const sky = createNightSkyDome();
    this.skyDomeMesh = sky.mesh;
    this.skyDomeMat = sky.mat;
    this.scene.add(sky.mesh);

    // Cahaya pantulan lembut dalam lemari agar dinding kayu, baju gantung, & kisi-kisi tetap terbaca saat bersembunyi
    this.closetInteriorLight = new THREE.PointLight(0xd9b382, 0.28, 1.5, 2);
    this.closetInteriorLight.visible = false;
    this.scene.add(this.closetInteriorLight);

    // Pencahayaan malam berlapis (otomatis meredup drastis saat pemain masuk ke dalam rumah)
    this.hemiLight = new THREE.HemisphereLight(
      0x4c6b88,
      0x17120e,
      this.isSoftwareGl ? 0.54 : 0.36
    );
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xadc8eb, 1.04);
    this.dirLight.position.set(18, 30, 24);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.radius = 2.6;
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 85;
    const d = 22;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0004;
    this.dirLight.shadow.normalBias = 0.022;
    this.scene.add(this.dirLight, this.dirLight.target);

    // Pool 6 lampu jalan natrium-hangat dinamis (selalu menerangi 6 tiang terdekat tanpa shader recompile)
    for (let i = 0; i < 6; i++) {
      const p = new THREE.PointLight(0xffb45a, 0, 18, 1.65);
      this.scene.add(p);
      this.streetLampPool.push(p);
    }

    // PointLights strategis Jalan Sukajadi (Warung, Baliho, Pos Ronda, Pecel, Masjid)
    const warungWarm = new THREE.PointLight(0xffb866, 7.5, 22, 1.4);
    warungWarm.position.set(WARUNG_POS.x + 1.8, 2.75, WARUNG_POS.z + 0.4);
    this.scene.add(warungWarm);

    const warungCounterFill = new THREE.PointLight(0xffcb82, 4.2, 10, 1.5);
    warungCounterFill.position.set(WARUNG_POS.x - 1.15, 2.55, WARUNG_POS.z - 0.4);
    this.scene.add(warungCounterFill);

    const billboardGlow = new THREE.PointLight(0xffe6b3, 5.6, 20, 1.35);
    billboardGlow.position.set(BILLBOARD_POS.x - 1.4, 5.2, BILLBOARD_POS.z + 2.4);
    this.scene.add(billboardGlow);

    const rondaWarm = new THREE.PointLight(0xffb45c, 4.4, 18, 1.5);
    rondaWarm.position.set(POS_RONDA_POS.x + 2.6, 2.8, POS_RONDA_POS.z - 0.8);
    this.scene.add(rondaWarm);

    const pecelWarm = new THREE.PointLight(0xffa952, 4.0, 16, 1.5);
    pecelWarm.position.set(6.4, 2.5, 32.8);
    this.scene.add(pecelWarm);

    const masjidGlow = new THREE.PointLight(0xbef5ce, 3.6, 18, 1.5);
    masjidGlow.position.set(MOSQUE_POS.x - 4.0, 3.2, MOSQUE_POS.z);
    this.scene.add(masjidGlow);

    // Bohlam interior redup berkedip-kedip horor + aksen cahaya ruang dalam Rumah Gurita
    const foyerSpillBulb = new THREE.PointLight(0x8aa8be, 0.56, 10.5, 1.75);
    foyerSpillBulb.position.set(-7.0, 3.35, 7.2);
    this.scene.add(foyerSpillBulb);
    this.interiorBulbs.push({ light: foyerSpillBulb, baseIntensity: 0.56, seed: 0.7 });

    const groundBulb = new THREE.PointLight(0xd98f46, 0.72, 10.5, 1.8);
    groundBulb.position.set(-6.2, 3.3, 4.6);
    this.scene.add(groundBulb);
    this.interiorBulbs.push({ light: groundBulb, baseIntensity: 0.72, seed: 1.3 });

    const eastWingBulb = new THREE.PointLight(0xb56b43, 0.54, 9.5, 1.85);
    eastWingBulb.position.set(12.2, 3.3, 4.0);
    this.scene.add(eastWingBulb);
    this.interiorBulbs.push({ light: eastWingBulb, baseIntensity: 0.54, seed: 2.5 });

    const stairBulb = new THREE.PointLight(0xb84632, 0.52, 9.2, 1.85);
    stairBulb.position.set(0.0, 3.3, -4.5);
    this.scene.add(stairBulb);
    this.interiorBulbs.push({ light: stairBulb, baseIntensity: 0.52, seed: 3.7 });

    const secondBulb = new THREE.PointLight(0x8aa199, 0.58, 9.8, 1.8);
    secondBulb.position.set(-5.2, FLOOR_HEIGHT + 3.3, 0.8);
    this.scene.add(secondBulb);
    this.interiorBulbs.push({ light: secondBulb, baseIntensity: 0.58, seed: 5.9 });

    const shrinePulseBulb = new THREE.PointLight(0xc94a38, 0.88, 12.0, 1.7);
    shrinePulseBulb.position.set(9.5, FLOOR_HEIGHT * 2 + 2.35, 0.8);
    this.scene.add(shrinePulseBulb);
    this.interiorBulbs.push({ light: shrinePulseBulb, baseIntensity: 0.88, seed: 7.4 });

    // Senter Berbayangan Nyata (Inti + Spill Periferal Lembut + Offset Tangan Kanan) & Kamera UV
    this.flashlight = new THREE.SpotLight(0xfff2da, 11.8, 30, Math.PI / 5.4, 0.72, 1.45);
    this.flashlightSpill = new THREE.SpotLight(0xffe7c2, 2.9, 14, Math.PI / 2.6, 0.94, 1.65);
    if (!this.isSoftwareGl) {
      this.flashlight.castShadow = true;
      this.flashlight.shadow.mapSize.set(1024, 1024);
      this.flashlight.shadow.radius = 2.2;
      this.flashlight.shadow.camera.near = 0.25;
      this.flashlight.shadow.camera.far = 28;
      this.flashlight.shadow.bias = -0.0004;
    }
    this.uvLight = new THREE.SpotLight(0x8c5aff, 8.2, 22, Math.PI / 4.2, 0.65, 1.35);
    this.uvLight.visible = false;
    this.scene.add(this.flashlight, this.flashlightSpill, this.uvLight, this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;
    this.flashlightSpill.target = this.flashlightTarget;
    this.uvLight.target = this.flashlightTarget;

    // Kerucut cahaya volumetrik lembut senter (berawal tepat sekeliling bezel ujung senter, tanpa meledak di pergelangan tangan)
    this.flashlightBeamCone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 1.85, 7.6, 24, 1, true),
      createVolumetricConeMaterial(0xfff1d6, 0.03)
    );
    this.scene.add(this.flashlightBeamCone);

    // Lampu dramatis khusus cutscene ending
    this.endingLight = new THREE.PointLight(0xffd078, 0, 32, 1.2);
    this.scene.add(this.endingLight);

    // Geometri Rumah Gurita + Komplek Perumahan + Masjid + Jalan + Collider Solid Semua Objek
    const { visuals, colliders } = buildLevelGeometry();
    this.baseColliders = colliders;
    const tintedMats = new Map<string, THREE.MeshStandardMaterial>();

    for (const b of visuals) {
      let mat: THREE.Material = this.mats[b.mat];
      if (b.tint !== undefined) {
        const key = `${b.mat}:${b.tint}`;
        let cached = tintedMats.get(key);
        if (!cached) {
          cached = (this.mats[b.mat] as THREE.MeshStandardMaterial).clone();
          cached.color.setHex(b.tint);
          tintedMats.set(key, cached);
        }
        mat = cached;
      }
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
      mesh.position.set(b.x, b.y, b.z);
      mesh.receiveShadow = true;
      // FIX BUG PENCAHAYAAN: Plat lantai atas (s_floor_*, r_floor_*, r_pent_roof) wajib castShadow=true agar cahaya bulan tidak tembus atap/plafon!
      const isUpperSlab =
        b.id.startsWith('s_floor_') || b.id.startsWith('r_floor_') || b.id === 'r_pent_roof';
      mesh.castShadow = isUpperSlab || (b.y > 0.2 && b.solid !== false);
      this.scene.add(mesh);
      this.wallMeshes.set(b.id, mesh);
    }

    // Tangga visual 4.0m antar lantai (tangga rooftop berakhir di Z = -6.8 untuk ruang keluar luas)
    this.buildStairSteps(-1.65, 1.55, -2.0, -7.6, 0.0, FLOOR_HEIGHT, 16);
    this.buildStairSteps(1.85, 4.75, -2.0, -6.8, FLOOR_HEIGHT, FLOOR_HEIGHT * 2, 16);

    // Papan 666, Gerbang Besi Tempa Berornamen & Pilar Batu Kali, Fasad Putih Balkon Lengkung & Detail Interior
    const plaqueFront = createPlaque666(maxAniso);
    plaqueFront.position.set(-3.2, 2.75, HOUSE_FRONT_Z + 0.16);
    this.scene.add(plaqueFront);
    const gatehouse = createCompoundFenceAndGatehouse(COMPOUND_GATE_Z, maxAniso);
    this.gateLanternLights = gatehouse.lanternLights;
    this.scene.add(gatehouse.group);
    this.buildArchitecturalFacade(maxAniso);
    this.scene.add(createRumahGuritaInteriorDetails(maxAniso));

    // Mobil Pengantar (untuk animasi kedatangan di Warung Ceu Titin, turun, lalu berangkat menghilang)
    this.arrivalCar = createArrivalCar();
    this.arrivalCar.group.visible = false;
    this.scene.add(this.arrivalCar.group);

    // Halaman Dalam Pagar Rumah Gurita: Kolam Renang + Tempat Parkir (Sedan & Motor)
    const courtyardPool = createCourtyardSwimmingPool();
    courtyardPool.position.set(COURTYARD_POOL_POS.x, 0, COURTYARD_POOL_POS.z);
    this.courtyardWaterNormalTex = courtyardPool.userData.waterNormalTex as THREE.DataTexture | undefined;
    this.scene.add(courtyardPool);

    // Sorot arsitektural luar fasad Rumah Gurita agar lekuk balkon Art-Deco dan Papan 666 tampak tajam di malam hari
    const facadeWashL = new THREE.PointLight(0xffcb85, 2.8, 16, 1.5);
    facadeWashL.position.set(-7.0, 2.8, HOUSE_FRONT_Z + 3.2);
    const facadeWashR = new THREE.PointLight(0x9fc2d8, 2.1, 18, 1.5);
    facadeWashR.position.set(4.5, 2.5, HOUSE_FRONT_Z + 4.0);
    this.scene.add(facadeWashL, facadeWashR);

    this.scene.add(createGarageCarportStructure(maxAniso));
    for (const v of CARPORT_VEHICLES) {
      const veh = createParkedVehicle(v.kind);
      veh.position.set(v.x, 0, v.z);
      veh.rotation.y = v.rotY;
      this.scene.add(veh);
    }

    // Komplek Perumahan (Berdempetan & Terhalang Pohon)
    for (const h of NEIGHBORHOOD_HOUSES) {
      this.scene.add(createNeighborhoodHouseRoofAndFacade(h, maxAniso));
    }

    // Masjid Al-Ikhlas Komplek Sukajadi
    this.scene.add(createMosque(MOSQUE_POS.x, MOSQUE_POS.z, maxAniso));

    // Warung Ceu Titin & Baliho Windah Basudara di Jalan Sukajadi
    const warung = createWarungCeuTitin(maxAniso);
    warung.position.set(WARUNG_POS.x, 0, WARUNG_POS.z);
    this.scene.add(warung);

    const billboard = createBillboardWindah(maxAniso);
    billboard.position.set(BILLBOARD_POS.x, 0, BILLBOARD_POS.z);
    billboard.rotation.y = BILLBOARD_POS.rotY;
    this.scene.add(billboard);

    // Pos Ronda
    const posRonda = createPosRonda(maxAniso);
    posRonda.position.set(POS_RONDA_POS.x, 0, POS_RONDA_POS.z);
    this.scene.add(posRonda);

    // Gerobak Pedagang (solid collider sudah di buildLevelGeometry)
    for (const c of CART_PLACEMENTS) {
      const cart = createStreetCart(c.kind, maxAniso);
      cart.position.set(c.x, 0, c.z);
      cart.rotation.y = c.rotY;
      this.scene.add(cart);
    }

    // Detail Jalan Sukajadi (Marka Jalan, Zebra Cross, Trotoar Paving, Kanstin, Tutup Got) + Genangan Air
    const roadDetails = createRoadAndSidewalkDetails(maxAniso);
    this.scene.add(roadDetails);
    this.streetPuddles = createStreetPuddles(maxAniso);
    this.scene.add(this.streetPuddles.group);
    this.buildStreetLamps();
    this.buildStreetTrees();

    // Furnitur interior (sinkron 1:1 dengan AABB solid) & penanda Zona Aman
    this.buildInteriorProps();
    this.buildSafeZoneMarkers();

    // Rooftop Hero Landmarks: Patung Gurita Hitam Bermata Merah (STATIS), Karang Seni, Kolam, Radio, Pusaka Kujang
    const octopus = createOctopusStatue();
    octopus.group.position.set(-8.0, FLOOR_HEIGHT * 2, 5.2);
    octopus.group.rotation.y = 0.15;
    this.octopusEyes = octopus.eyeMeshes;
    this.scene.add(octopus.group);

    const roofSculptures = createRooftopSculptures();
    roofSculptures.position.set(0, FLOOR_HEIGHT * 2, 0);
    this.scene.add(roofSculptures);

    const poolNormalTex = createWaterRippleNormalTexture(0, maxAniso).clone();
    poolNormalTex.repeat.set(2.5, 2.0);
    poolNormalTex.needsUpdate = true;
    this.poolNormalTex = poolNormalTex;
    this.poolWater = new THREE.Mesh(
      new THREE.PlaneGeometry(4.0, 3.2),
      new THREE.MeshPhysicalMaterial({
        color: 0x112a34,
        roughness: 0.05,
        metalness: 0.22,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        ior: 1.333,
        envMapIntensity: 2.3,
        normalMap: poolNormalTex,
        normalScale: new THREE.Vector2(0.42, 0.42),
      })
    );
    this.poolWater.rotation.x = -Math.PI / 2;
    this.poolWater.position.set(-7.5, FLOOR_HEIGHT * 2 + 0.25, -5.6);
    this.scene.add(this.poolWater);

    const tower = createRadioTower();
    tower.group.position.set(-0.5, FLOOR_HEIGHT * 2, -7.2);
    this.beaconMesh = tower.beacon;
    this.scene.add(tower.group);

    const shrine = createKujangShrine();
    shrine.group.position.set(9.6, FLOOR_HEIGHT * 2, 0.8);
    this.kujangGroup = shrine.kujang;
    this.scene.add(shrine.group);

    // NPC Luar: Satpam Pos Ronda, Pedagang, Ceu Titin (Pemilik Warung) & 3 Anak Muda Warung Ceu Titin (masing-masing beranimasi!)
    this.npcAnimations = [];
    const registerNpc = (id: string, rig: HumanoidRig, x: number, y: number, z: number, ry: number) => {
      rig.group.position.set(x, y, z);
      rig.group.rotation.y = ry;
      this.scene.add(rig.group);
      this.npcAnimations.push({ id, rig });
    };

    registerNpc(
      'satpam',
      createHumanoidNPC({
        preset: 'satpam',
        shirtColor: 0x1a2c4a,
        bottomColor: 0x142038,
        hasCap: true,
        capColor: 0x13223b,
        contactShadowTex: this.mats.contactShadowTex,
      }),
      -9.1,
      0,
      35.0,
      Math.PI * 0.45
    );

    registerNpc(
      'nasgor',
      createHumanoidNPC({
        preset: 'nasgor',
        shirtColor: 0x45494a,
        bottomColor: 0x2a353d,
        hasApron: true,
        prop: 'ladle',
        contactShadowTex: this.mats.contactShadowTex,
      }),
      -5.2,
      0,
      32.2,
      0.45
    );

    registerNpc(
      'pecel',
      createHumanoidNPC({
        preset: 'pecel',
        shirtColor: 0x872f29,
        bottomColor: 0x383d3b,
        hasApron: true,
        hasCap: true,
        capColor: 0x3b3532,
        contactShadowTex: this.mats.contactShadowTex,
      }),
      5.2,
      0,
      32.2,
      -0.45
    );

    registerNpc(
      'warung_ibu',
      createHumanoidNPC({
        preset: 'warung_ibu',
        shirtColor: 0x99415e,
        bottomColor: 0x3d281c,
        isSkirt: true,
        hasApron: true,
        prop: 'ladle',
        contactShadowTex: this.mats.contactShadowTex,
      }),
      WARUNG_POS.x - 1.35,
      0,
      WARUNG_POS.z,
      Math.PI / 2
    );

    registerNpc(
      'warung_pemuda_1',
      createHumanoidNPC({
        shirtColor: 0x2a5070,
        bottomColor: 0x232930,
        isSeated: true,
        prop: 'coffee',
        contactShadowTex: this.mats.contactShadowTex,
      }),
      WARUNG_POS.x + 2.55,
      0,
      WARUNG_POS.z - 1.5,
      -Math.PI / 2
    );

    registerNpc(
      'warung_pemuda_2',
      createHumanoidNPC({
        shirtColor: 0x6b322e,
        bottomColor: 0x212428,
        hasCap: true,
        capColor: 0x1c1e24,
        isSeated: true,
        prop: 'phone',
        contactShadowTex: this.mats.contactShadowTex,
      }),
      WARUNG_POS.x + 2.55,
      0,
      WARUNG_POS.z + 1.2,
      -Math.PI / 2
    );

    registerNpc(
      'warung_pemuda_3',
      createHumanoidNPC({
        shirtColor: 0x2c4a38,
        bottomColor: 0x2c333a,
        contactShadowTex: this.mats.contactShadowTex,
      }),
      WARUNG_POS.x + 3.7,
      0,
      WARUNG_POS.z + 2.4,
      Math.PI * 0.35
    );

    this.rebuildPlayerMesh();
    this.buildDustParticles();
    this.resetWorldEntities();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private buildStreetLamps(): void {
    this.streetLampBulbs = [];
    LAMP_POSITIONS.forEach((l, idx) => {
      const lamp = createStreetLamp();
      lamp.position.set(l.x, 0, l.z);
      lamp.rotation.y = l.rotY;
      this.scene.add(lamp);
      this.streetLampBulbs.push({
        x: l.x + Math.cos(l.rotY) * 1.16,
        y: 5.25,
        z: l.z - Math.sin(l.rotY) * 1.16,
        seed: idx * 1.73 + 0.5,
      });
    });
  }

  private buildStreetTrees(): void {
    this.treeCanopies = [];
    TREE_PLACEMENTS.forEach((t, idx) => {
      const tree = createStreetTree(t.kind, t.scale, t.tint);
      tree.position.set(t.x, 0, t.z);
      tree.rotation.y = ((t.x * 0.7 + t.z * 0.3) % (Math.PI * 2));
      this.scene.add(tree);
      const canopyPivot = tree.userData.canopyPivot as THREE.Object3D | undefined;
      if (canopyPivot) {
        this.treeCanopies.push({ pivot: canopyPivot, phase: idx * 0.87 });
      }
    });
  }

  private buildArchitecturalFacade(maxAniso = 4): void {
    const facade = createRumahGuritaFacadeDetails(maxAniso);
    this.facadeMaterials = {
      facadeMat: facade.facadeMat,
      trimMat: facade.trimMat,
      windowMat: facade.windowMat,
    };
    this.scene.add(facade.group);
  }

  private buildStairSteps(
    minX: number,
    maxX: number,
    startZ: number,
    endZ: number,
    startY: number,
    endY: number,
    steps: number
  ): void {
    const width = maxX - minX;
    const cx = (minX + maxX) * 0.5;
    const totalDepth = Math.abs(endZ - startZ);
    const stepDepth = totalDepth / steps;
    const stepHeight = (endY - startY) / steps;

    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const z = startZ + (endZ - startZ) * t;
      const y = startY + stepHeight * (i + 0.5);
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(width, stepHeight, stepDepth + 0.04),
        this.mats.floor_wood
      );
      step.position.set(cx, y, z);
      step.receiveShadow = true;
      this.scene.add(step);
    }
  }

  private buildInteriorProps(): void {
    this.closetRigs = [];
    for (const f of FURNITURE_SPECS) {
      if (f.kind === 'closet') {
        const closet = createClosetRig();
        closet.group.position.set(f.x, f.y, f.z);
        closet.group.rotation.y = f.ry ?? 0;
        this.scene.add(closet.group);
        this.closetRigs.push({
          id: f.id,
          x: f.x,
          y: f.y,
          z: f.z,
          ry: f.ry ?? 0,
          leftDoor: closet.leftDoorPivot,
          rightDoor: closet.rightDoorPivot,
          openAmount: 0,
          autoCloseTimer: 0,
        });
      } else {
        const g = createPropFurniture(f.kind);
        g.position.set(f.x, f.y, f.z);
        g.rotation.y = f.ry ?? 0;
        this.scene.add(g);
      }
    }
  }

  private buildSafeZoneMarkers(): void {
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x3b7a57,
      emissive: new THREE.Color(0x2d6b47),
      emissiveIntensity: 0.55,
      roughness: 0.6,
    });
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xffd699,
      emissive: new THREE.Color(0xe6a145),
      emissiveIntensity: 1.2,
      roughness: 0.3,
    });

    const markers = [
      { x: -12.9, y: 0.02, z: 0.0 },
      { x: -12.9, y: FLOOR_HEIGHT + 0.02, z: 0.0 },
      { x: -0.05, y: FLOOR_HEIGHT + 0.02, z: -8.0 },
      { x: 3.3, y: FLOOR_HEIGHT * 2 + 0.02, z: -8.0 },
    ];
    for (const m of markers) {
      const mat = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 24), ringMat);
      mat.rotation.x = -Math.PI / 2;
      mat.position.set(m.x, m.y, m.z);
      this.scene.add(mat);

      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.22, 8), lanternMat);
      lantern.position.set(m.x, m.y + 0.11, m.z);
      this.scene.add(lantern);
    }
  }

  private buildDustParticles(): void {
    const count = 260;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 48;
      positions[i * 3 + 1] = 0.4 + Math.random() * 12;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 68 + 18;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xb2c2b8,
      map: createSoftParticleTexture(),
      size: 0.16,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dustPoints = new THREE.Points(geo, mat);
    this.scene.add(this.dustPoints);
  }

  private rebuildPlayerMesh(): void {
    if (this.playerRig) {
      this.scene.remove(this.playerRig.group);
    }
    if (this.fpHandRig) {
      this.camera.remove(this.fpHandRig.group);
    }
    const profile = this.getCharacter();
    const bagHex =
      BAG_COLOR_OPTIONS.find((b) => b.id === this.cosmetics.bagColor)?.colorNum ?? 0x2d312e;
    const shirtHex = new THREE.Color(profile.shirtColor).getHex();
    const skinHex = profile.id === 'salsa' || profile.id === 'nadia' ? 0xcba181 : 0xc39471;
    this.playerRig = createHumanoidNPC({
      preset: profile.id,
      shirtColor: shirtHex,
      bottomColor: new THREE.Color(profile.bottomColor).getHex(),
      isSkirt: profile.id === 'salsa' || profile.id === 'nadia',
      hasBackpack: true,
      bagColor: bagHex,
      accessory: this.cosmetics.accessory,
      contactShadowTex: this.mats.contactShadowTex,
    });
    this.playerRig.group.visible = this.perspective === 'third-person' && !this.isSpectator;
    this.scene.add(this.playerRig.group);

    this.fpHandRig = createFirstPersonHandRig(shirtHex, skinHex);
    const showFp = this.perspective === 'first-person' && !this.isSpectator && !this.isHiding;
    this.fpHandRig.group.visible = showFp;
    if (!showFp) {
      this.fpHandRig.group.position.set(0, -999, 0);
    }
    this.camera.add(this.fpHandRig.group);
  }

  private triggerLeftHandProp(kind: 'key' | 'salt' | 'battery' | 'evidence'): void {
    this.heldPropKind = kind;
    this.heldPropTimer = 2.4;
  }

  private rebuildAiCompanions(): void {
    for (const c of this.aiCompanions) {
      this.scene.remove(c.rig.group);
    }
    this.aiCompanions = [];
    if (this.isMultiplayer || this.aiCompanionCount <= 0) return;

    const others = CHARACTERS.filter((c) => c.id !== this.characterId).slice(0, this.aiCompanionCount);
    others.forEach((p, idx) => {
      const rig = createHumanoidNPC({
        preset: p.id,
        shirtColor: new THREE.Color(p.shirtColor).getHex(),
        bottomColor: new THREE.Color(p.bottomColor).getHex(),
        isSkirt: p.id === 'salsa' || p.id === 'nadia',
        hasBackpack: true,
        bagColor: BAG_COLOR_OPTIONS[(idx + 1) % BAG_COLOR_OPTIONS.length].colorNum,
        accessory: idx === 0 ? 'walkie' : 'none',
        contactShadowTex: this.mats.contactShadowTex,
      });
      const rawTarget = computeCompanionFollowTarget(
        this.playerPos,
        this.yaw || PLAYER_SPAWN_YAW,
        idx,
        others.length
      );
      const safeStart = resolveHorizontalCollision(
        { x: rawTarget.x, y: this.playerPos.y, z: rawTarget.z },
        0.32,
        1.68,
        this.activeColliders
      );
      const startPos: Vec3 = {
        x: safeStart.x,
        y: this.playerPos.y,
        z: safeStart.z,
      };
      const initYaw = (this.yaw || PLAYER_SPAWN_YAW) + Math.PI;
      rig.group.position.set(startPos.x, startPos.y, startPos.z);
      rig.group.rotation.y = initYaw;
      this.scene.add(rig.group);
      this.aiCompanions.push({
        id: p.id,
        name: p.name,
        rig,
        pos: startPos,
        yaw: initYaw,
        phaseOffset: idx * 1.9,
      });
    });
  }

  private rebuildActiveColliders(): void {
    const next: AABB[] = [...this.baseColliders];
    for (const d of this.doors) {
      const dc = getDoorClosedCollider(d);
      if (dc) next.push(dc);
    }
    this.activeColliders = next;
  }

  private resetWorldEntities(): void {
    for (const m of this.itemMeshes.values()) this.scene.remove(m);
    this.itemMeshes.clear();
    for (const g of this.ghostRigs.values()) this.scene.remove(g.group);
    this.ghostRigs.clear();
    for (const r of this.doorRigs.values()) {
      this.scene.remove(r.pivot);
    }
    this.doorRigs.clear();

    for (const wallId of ['s_crumble_wall', 'r_crumble_wall']) {
      const m = this.wallMeshes.get(wallId);
      if (m) m.visible = true;
    }
    const { colliders } = buildLevelGeometry();
    this.baseColliders = colliders;

    // Pintu berengsel untuk semua ruangan
    this.doors = createInitialDoors();
    for (const d of this.doors) {
      const rig = createDoorAssembly(d);
      this.scene.add(rig.pivot);
      this.scene.add(rig.frameGroup);
      this.doorRigs.set(d.id, { pivot: rig.pivot, lockPlateMat: rig.lockPlateMat });
    }
    this.rebuildActiveColliders();

    // Item pickup (Bukti, Kunci, Baterai Senter, Baterai UV, Garam)
    this.interactables = createInitialInteractables();
    for (const item of this.interactables) {
      if (
        item.kind === 'evidence' ||
        item.kind === 'battery_flashlight' ||
        item.kind === 'battery_uv' ||
        item.kind === 'key' ||
        item.kind === 'salt'
      ) {
        const g = new THREE.Group();
        const color =
          item.kind === 'evidence'
            ? item.requiresUV
              ? 0x9966ff
              : 0xe6c367
            : item.kind === 'battery_flashlight'
              ? 0xf2b441
              : item.kind === 'battery_uv'
                ? 0x7b63ff
                : item.kind === 'key'
                  ? 0xe8d580
                  : 0xd9e0dc;

        if (item.kind === 'key') {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.08, 0.022, 6, 12),
            new THREE.MeshStandardMaterial({
              color,
              emissive: new THREE.Color(0xc49533),
              emissiveIntensity: 0.75,
              roughness: 0.25,
              metalness: 0.85,
            })
          );
          ring.position.y = 0.22;
          ring.rotation.x = Math.PI / 2;
          g.add(ring);
          const shaft = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.04, 0.22),
            ring.material as THREE.Material
          );
          shaft.position.set(0, 0.22, 0.14);
          g.add(shaft);
        } else {
          const orb = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.16, 0.22),
            new THREE.MeshStandardMaterial({
              color,
              emissive: new THREE.Color(color),
              emissiveIntensity: item.requiresUV ? 0.2 : 0.7,
              roughness: 0.35,
            })
          );
          orb.position.y = 0.18;
          g.add(orb);
        }

        g.position.set(item.position.x, item.position.y, item.position.z);
        this.scene.add(g);
        this.itemMeshes.set(item.id, g);
      }
    }

    // Hantu dengan Rig Artikulatif
    this.ghosts = createInitialGhosts();
    for (const g of this.ghosts) {
      const rig = createGhostModel(g.kind, this.mats.contactShadowTex);
      rig.group.position.set(g.position.x, g.position.y, g.position.z);
      rig.group.visible = g.active;
      this.scene.add(rig.group);
      this.ghostRigs.set(g.id, rig);
    }
  }

  public getCharacter() {
    return CHARACTERS.find((c) => c.id === this.characterId) ?? CHARACTERS[0];
  }

  public setCharacter(id: CharacterId): void {
    this.characterId = id;
    this.rebuildPlayerMesh();
  }

  public setCosmetics(cosmetics: PlayerCosmetics): void {
    this.cosmetics = { ...cosmetics };
    this.rebuildPlayerMesh();
  }

  public setSoloOptions(opts: { difficulty: RoomDifficulty; aiCompanionCount: number }): void {
    this.isMultiplayer = false;
    this.isHostAuthority = false;
    this.isSpectator = false;
    this.downed = false;
    this.inputSuspended = false;
    this.difficulty = opts.difficulty;
    this.aiCompanionCount = Math.max(0, Math.min(3, opts.aiCompanionCount));
    this.clearRemoteRigs();
  }

  public setMultiplayerConfig(opts: {
    isMultiplayer: boolean;
    isSpectator: boolean;
    isHost?: boolean;
    spawnSlot?: number;
    difficulty: RoomDifficulty;
  }): void {
    this.isMultiplayer = opts.isMultiplayer;
    this.isSpectator = opts.isSpectator;
    this.isHostAuthority = Boolean(opts.isHost);
    if (typeof opts.spawnSlot === 'number') {
      this.spawnSlot = opts.spawnSlot;
    }
    this.difficulty = opts.difficulty;
    if (opts.isMultiplayer) {
      this.aiCompanionCount = 0;
      this.rebuildAiCompanions();
    }
    this.playerRig.group.visible = this.perspective === 'third-person' && !this.isSpectator;
  }

  public enterFromCheckpoint(): void {
    this.isSpectator = false;
    this.downed = false;
    this.playerPos = { ...PLAYER_SPAWN };
    this.yaw = PLAYER_SPAWN_YAW;
    this.pitch = 0.02;
    this.sanity = 100;
    this.stamina = 100;
    this.inDimensiGaib = false;
    this.playerRig.group.visible = this.perspective === 'third-person';
    this.emitHud();
  }

  public setInputSuspended(suspended: boolean): void {
    this.inputSuspended = suspended;
    if (suspended) {
      this.keys.clear();
      this.isDraggingLook = false;
      this.lookTouchId = null;
      this.virtualForward = 0;
      this.virtualRight = 0;
      this.virtualSprint = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        try {
          document.exitPointerLock?.();
        } catch {
          // ignore
        }
      }
    }
  }

  public getPlayerSyncPayload() {
    const floor = detectFloor(
      this.playerPos.y,
      this.playerPos.z,
      FLOOR_HEIGHT,
      FLOOR_HEIGHT * 2,
      HOUSE_FRONT_Z
    );
    return {
      position: { ...this.playerPos },
      yaw: this.yaw,
      floor,
      sanity: Math.round(this.sanity),
      flashlightOn: this.flashlightOn,
      isCrouching:
        this.virtualCrouch || this.keys.has('KeyC') || this.keys.has('ControlLeft'),
      downed: this.downed,
    };
  }

  public getRemotePlayerPositions(): { guestId: string; position: Vec3; micOn: boolean }[] {
    const list: { guestId: string; position: Vec3; micOn: boolean }[] = [];
    for (const [guestId, entry] of this.remoteRigs.entries()) {
      list.push({
        guestId,
        position: { ...entry.targetPos },
        micOn: entry.micOn,
      });
    }
    return list;
  }

  public getLocalPlayerPosition(): Vec3 {
    return { ...this.playerPos };
  }

  public getGhostSyncPayload(): GhostSyncItem[] {
    return this.ghosts.map((g) => ({
      id: g.id,
      position: { ...g.position },
      yaw: g.yaw,
      state: g.state,
      stunTimer: g.stunTimer,
      alertTimer: g.alertTimer,
    }));
  }

  public applyRemoteGhosts(ghosts: GhostSyncItem[]): void {
    for (const item of ghosts) {
      this.remoteGhostTargets.set(item.id, {
        ...item,
        position: { ...item.position },
      });
    }
  }

  public discoverRumor(rumorId: string): void {
    let changed = false;
    this.rumors = this.rumors.map((r) => {
      if (r.id === rumorId && !r.discoveredRumor) {
        changed = true;
        return { ...r, discoveredRumor: true };
      }
      return r;
    });
    if (changed) {
      this.callbacks.onRumorsChanged([...this.rumors]);
      if (this.isMultiplayer) {
        this.callbacks.onCoopAction?.({ type: 'rumor_discover', rumorId });
      }
    }
  }

  public applyRemoteWorldState(world: RoomWorldState): void {
    let doorDirty = false;
    for (let i = 0; i < this.doors.length; i++) {
      const d = this.doors[i];
      if (world.unlockedDoors.includes(d.id) && d.lockedKeyId) {
        d.lockedKeyId = undefined;
        d.lockedKeyLabel = undefined;
        const rig = this.doorRigs.get(d.id);
        if (rig) {
          rig.lockPlateMat.color.setHex(0x6b8f74);
          rig.lockPlateMat.emissive.setHex(0x16291c);
          rig.lockPlateMat.emissiveIntensity = 0.35;
        }
      }
      if (world.openDoors[d.id] !== undefined && d.isOpen !== world.openDoors[d.id]) {
        d.isOpen = world.openDoors[d.id];
        d.targetAngle = d.isOpen ? d.openAngle : d.closedAngle;
        d.currentAngle = d.targetAngle;
        const rig = this.doorRigs.get(d.id);
        if (rig) rig.pivot.rotation.y = d.currentAngle;
        doorDirty = true;
      }
    }

    for (const item of this.interactables) {
      if (world.collectedItemIds.includes(item.id) && !item.collected) {
        item.collected = true;
        const mesh = this.itemMeshes.get(item.id);
        if (mesh) mesh.visible = false;
      }
    }

    for (let i = 0; i < world.collectedKeyIds.length; i++) {
      const kid = world.collectedKeyIds[i];
      if (!this.collectedKeyIds.includes(kid)) {
        this.collectedKeyIds.push(kid);
        this.collectedKeyLabels.push(world.collectedKeyLabels[i] ?? kid);
      }
    }

    for (const wallId of world.brokenWalls) {
      const mesh = this.wallMeshes.get(wallId);
      if (mesh) mesh.visible = false;
      this.baseColliders = this.baseColliders.filter((c) => c.id !== wallId);
      doorDirty = true;
    }

    this.rumors = this.rumors.map((r) => ({
      ...r,
      discoveredRumor: r.discoveredRumor || world.discoveredRumorIds.includes(r.id),
      discoveredFact: r.discoveredFact || world.discoveredFactIds.includes(r.id),
      debunked: r.debunked || world.debunkedRumorIds.includes(r.id),
    }));
    this.callbacks.onRumorsChanged([...this.rumors]);

    if (world.raniRescued) this.raniRescued = true;
    if (world.kujangClaimed) {
      this.kujangClaimed = true;
      if (this.kujangGroup) this.kujangGroup.visible = false;
    }
    if (world.inDimensiGaib && !this.inDimensiGaib) {
      this.activateDimensiGaibAtmosphere();
    }

    if (doorDirty) this.rebuildActiveColliders();
    this.emitHud();
  }

  public applyRemoteWorldEvent(broadcast: WorldActionBroadcast, localGuestId: string): void {
    const isSelf = broadcast.actorGuestId === localGuestId;
    const { action, actorNickname } = broadcast;

    switch (action.type) {
      case 'door_toggle': {
        const idx = this.doors.findIndex((d) => d.id === action.doorId);
        if (idx >= 0) {
          const d = this.doors[idx];
          if (action.unlocked) {
            d.lockedKeyId = undefined;
            d.lockedKeyLabel = undefined;
            const rig = this.doorRigs.get(d.id);
            if (rig) {
              rig.lockPlateMat.color.setHex(0x6b8f74);
              rig.lockPlateMat.emissive.setHex(0x16291c);
              rig.lockPlateMat.emissiveIntensity = 0.35;
            }
          }
          if (d.isOpen !== action.isOpen) {
            d.isOpen = action.isOpen;
            d.targetAngle = action.isOpen ? d.openAngle : d.closedAngle;
            this.rebuildActiveColliders();
            if (!isSelf) this.audio.playDoorCreak(action.isOpen);
          }
        }
        break;
      }
      case 'item_pickup': {
        const item = this.interactables.find((it) => it.id === action.itemId);
        if (item && !item.collected) {
          item.collected = true;
          const mesh = this.itemMeshes.get(item.id);
          if (mesh) mesh.visible = false;
        }
        if (action.kind === 'key' && action.payloadId) {
          if (!this.collectedKeyIds.includes(action.payloadId)) {
            this.collectedKeyIds.push(action.payloadId);
            this.collectedKeyLabels.push(action.label);
            if (!isSelf) {
              this.audio.playPickup();
              this.callbacks.onToast(`${actorNickname} menemukan ${action.label} (dibagikan ke regu)!`, 'fact');
            }
          }
        } else if (action.kind === 'evidence' && action.payloadId) {
          this.rumors = this.rumors.map((r) =>
            r.id === action.payloadId ? { ...r, discoveredRumor: true, discoveredFact: true } : r
          );
          this.callbacks.onRumorsChanged([...this.rumors]);
          if (!isSelf) {
            this.audio.playPickup();
            this.callbacks.onToast(`${actorNickname} menemukan Bukti Fakta: ${action.label}!`, 'fact');
          }
        }
        break;
      }
      case 'rumor_discover': {
        this.rumors = this.rumors.map((r) =>
          r.id === action.rumorId ? { ...r, discoveredRumor: true } : r
        );
        this.callbacks.onRumorsChanged([...this.rumors]);
        break;
      }
      case 'rumor_debunk': {
        this.rumors = this.rumors.map((r) =>
          r.id === action.rumorId
            ? { ...r, discoveredRumor: true, discoveredFact: true, debunked: true }
            : r
        );
        this.callbacks.onRumorsChanged([...this.rumors]);
        if (!isSelf) {
          this.audio.playDebunkChime();
          this.sanity = Math.min(100, this.sanity + 10);
          this.callbacks.onToast(
            `${actorNickname} mematahkan Segel Rumor${action.title ? `: ${action.title}` : ''}!`,
            'fact'
          );
        }
        break;
      }
      case 'wall_break': {
        const item = this.interactables.find((it) => it.id === action.itemId);
        if (item) item.collected = true;
        const mesh = this.wallMeshes.get(action.wallId);
        if (mesh) mesh.visible = false;
        this.baseColliders = this.baseColliders.filter((c) => c.id !== action.wallId);
        this.rebuildActiveColliders();
        if (!isSelf) {
          this.cameraTrauma = 0.4;
          this.audio.playDoorCreak(true);
          this.callbacks.onToast(`${actorNickname} merobohkan Tembok Rapuh!`, 'fact');
        }
        break;
      }
      case 'radio_rescue': {
        if (!this.raniRescued) {
          this.raniRescued = true;
          this.rumors = this.rumors.map((r) =>
            r.id === 'rumor_gereja' ? { ...r, discoveredRumor: true, discoveredFact: true } : r
          );
          this.callbacks.onRumorsChanged([...this.rumors]);
          if (!isSelf) {
            this.audio.playDebunkChime();
            this.callbacks.onToast(`${actorNickname} menyelamatkan sinyal Rani di Menara Radio!`, 'fact');
          }
        }
        break;
      }
      case 'salt_stun': {
        if (!isSelf) {
          for (const g of this.ghosts) {
            if (distance3D(g.position, action.position) < 9.0) {
              g.stunTimer = 6.0;
              g.state = 'stunned';
            }
          }
          this.callbacks.onToast(`${actorNickname} menaburkan Garam Pengusir di sekitar hantu!`, 'info');
        }
        break;
      }
      case 'dimensi_enter': {
        if (!this.inDimensiGaib) {
          this.activateDimensiGaibAtmosphere();
          if (!isSelf) {
            this.audio.playDoorSlam();
            this.callbacks.onToast(`${actorNickname} memasuki Rumah Gurita — Dimensi Gaib aktif!`, 'warn');
          }
        }
        break;
      }
      case 'player_downed': {
        if (!isSelf) {
          this.callbacks.onToast(
            `${actorNickname} TUMBANG! Dekati dan tekan [E] untuk menolongnya!`,
            'warn'
          );
        }
        break;
      }
      case 'player_revive': {
        if (action.targetGuestId === localGuestId && this.downed) {
          this.downed = false;
          this.sanity = 45;
          this.invulnTimer = 3.0;
          this.audio.playDebunkChime();
          this.callbacks.onToast(`Kamu ditolong oleh ${actorNickname}! (+45 Sanity)`, 'fact');
        } else if (!isSelf) {
          this.callbacks.onToast(`${actorNickname} berhasil menolong rekannya!`, 'fact');
        }
        break;
      }
      case 'kujang_claim': {
        this.kujangClaimed = true;
        if (this.kujangGroup) this.kujangGroup.visible = false;
        if (!isSelf) {
          this.audio.playDebunkChime();
          this.finishRun(false);
        }
        break;
      }
    }
    this.emitHud();
  }

  private createNameplateSprite(nickname: string, downed: boolean): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = downed ? 'rgba(130, 24, 18, 0.92)' : 'rgba(12, 16, 14, 0.85)';
    ctx.fillRect(10, 12, 236, 40);
    ctx.strokeStyle = downed ? '#ff7c6e' : '#cfa15a';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 12, 236, 40);
    ctx.fillStyle = downed ? '#ffdcd8' : '#f3efe4';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = downed ? `${nickname} · TUMBANG!` : nickname;
    ctx.fillText(label.slice(0, 20), 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: !downed,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(0, 2.02, 0);
    sprite.scale.set(0.68, 0.17, 1);
    return sprite;
  }

  private clearRemoteRigs(): void {
    for (const entry of this.remoteRigs.values()) {
      (entry.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
      entry.nameSprite.material.dispose();
      this.scene.remove(entry.rig.group);
    }
    this.remoteRigs.clear();
  }

  public syncRemotePlayers(squad: SquadSyncPayload[], localGuestId: string): void {
    const activeIds = new Set<string>();
    for (const member of squad) {
      if (member.guestId === localGuestId) continue;
      activeIds.add(member.guestId);
      const existing = this.remoteRigs.get(member.guestId);
      const bagColor = member.cosmetics?.bagColor ?? 'charcoal';
      const accessory = member.cosmetics?.accessory ?? 'none';

      if (
        !existing ||
        existing.charId !== member.characterId ||
        existing.bagColor !== bagColor ||
        existing.accessory !== accessory
      ) {
        if (existing) {
          (existing.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
          existing.nameSprite.material.dispose();
          this.scene.remove(existing.rig.group);
        }
        const profile = CHARACTERS.find((c) => c.id === member.characterId) ?? CHARACTERS[0];
        const bagHex = BAG_COLOR_OPTIONS.find((b) => b.id === bagColor)?.colorNum ?? 0x2d312e;
        const rig = createHumanoidNPC({
          preset: profile.id,
          shirtColor: new THREE.Color(profile.shirtColor).getHex(),
          bottomColor: new THREE.Color(profile.bottomColor).getHex(),
          isSkirt: profile.id === 'salsa' || profile.id === 'nadia',
          hasBackpack: true,
          bagColor: bagHex,
          accessory,
          contactShadowTex: this.mats.contactShadowTex,
        });
        const nameSprite = this.createNameplateSprite(member.nickname, Boolean(member.downed));
        rig.group.add(nameSprite);

        const beamLight = new THREE.PointLight(0xfff1d6, member.flashlightOn ? 1.8 : 0, 12, 1.5);
        beamLight.position.set(0, 1.45, 0.55);
        rig.group.add(beamLight);

        rig.group.position.set(member.position.x, member.position.y, member.position.z);
        rig.group.visible = member.role === 'player';
        this.scene.add(rig.group);
        this.remoteRigs.set(member.guestId, {
          rig,
          nameSprite,
          beamLight,
          charId: member.characterId,
          bagColor,
          accessory,
          nickname: member.nickname,
          targetPos: { ...member.position },
          targetYaw: member.yaw,
          flashlightOn: Boolean(member.flashlightOn),
          isCrouching: Boolean(member.isCrouching),
          downed: Boolean(member.downed),
          micOn: Boolean(member.micOn),
          role: member.role,
        });
      } else {
        existing.targetPos = { ...member.position };
        existing.targetYaw = member.yaw;
        existing.flashlightOn = Boolean(member.flashlightOn);
        existing.isCrouching = Boolean(member.isCrouching);
        existing.micOn = Boolean(member.micOn);
        existing.role = member.role;
        existing.rig.group.visible = member.role === 'player';
        existing.beamLight.intensity = member.flashlightOn && !member.downed ? 1.8 : 0;

        if (existing.downed !== Boolean(member.downed)) {
          existing.downed = Boolean(member.downed);
          existing.rig.group.remove(existing.nameSprite);
          (existing.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
          existing.nameSprite.material.dispose();
          existing.nameSprite = this.createNameplateSprite(member.nickname, existing.downed);
          existing.rig.group.add(existing.nameSprite);
        }
      }
    }

    for (const [id, entry] of this.remoteRigs.entries()) {
      if (!activeIds.has(id)) {
        (entry.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
        entry.nameSprite.material.dispose();
        this.scene.remove(entry.rig.group);
        this.remoteRigs.delete(id);
      }
    }
  }

  public setVisualSettings(next: VisualSettings): void {
    this.visualSettings = {
      brightness: THREE.MathUtils.clamp(next.brightness, 0.75, 1.45),
      fov: THREE.MathUtils.clamp(next.fov, 65, 90),
      sensitivity: THREE.MathUtils.clamp(next.sensitivity, 0.4, 2.0),
      cinematicEffects: Boolean(next.cinematicEffects),
    };
    if (this.bloomPass) {
      this.bloomPass.enabled =
        this.visualSettings.cinematicEffects && !this.isSoftwareGl && this.quality !== 'low';
    }
    if (this.horrorPass?.uniforms?.uGrain) {
      this.horrorPass.uniforms.uGrain.value = this.visualSettings.cinematicEffects ? 0.024 : 0.0;
    }
  }

  public setQuality(q: GraphicsQuality): void {
    this.quality = q;
    if (this.isSoftwareGl) return;
    if (q === 'low') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.flashlight.castShadow = false;
      if (this.bloomPass) this.bloomPass.enabled = false;
    } else if (q === 'medium') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.flashlight.castShadow = true;
      if (this.bloomPass) {
        this.bloomPass.enabled = this.visualSettings.cinematicEffects;
        this.bloomPass.strength = 0.34;
      }
      if (this.dirLight.shadow.mapSize.x !== 1024) {
        this.dirLight.shadow.mapSize.set(1024, 1024);
        this.dirLight.shadow.map?.dispose();
        this.dirLight.shadow.map = null;
      }
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.flashlight.castShadow = true;
      if (this.bloomPass) {
        this.bloomPass.enabled = this.visualSettings.cinematicEffects;
        this.bloomPass.strength = 0.42;
      }
      if (this.dirLight.shadow.mapSize.x !== 2048) {
        this.dirLight.shadow.mapSize.set(2048, 2048);
        this.dirLight.shadow.map?.dispose();
        this.dirLight.shadow.map = null;
      }
    }
    this.handleResize();
  }

  public getRumors(): RumorEntry[] {
    return this.rumors;
  }

  public tryDebunkRumor(rumorId: string): boolean {
    const res = debunkRumor(this.rumors, rumorId);
    if (!res.success) {
      this.callbacks.onToast(res.reason ?? 'Belum bisa mematahkan segel.', 'warn');
      return false;
    }
    this.rumors = res.updated;
    const rumorItem = this.rumors.find((r) => r.id === rumorId);
    this.audio.playDebunkChime();
    this.sanity = Math.min(100, this.sanity + 14);
    this.callbacks.onRumorsChanged([...this.rumors]);
    const broken = countBrokenSegel(this.rumors);
    this.callbacks.onToast(
      `Segel Rumor dipatahkan dengan Fakta! (${broken}/${this.rumors.length}) Ambu Hideung melemah.`,
      'fact'
    );
    this.speakPlayerLine(
      `Faktanya jelas, rumor ini bohong. Segel ke ${broken} berhasil kupatahkan!`
    );
    if (this.isMultiplayer) {
      this.callbacks.onCoopAction?.({
        type: 'rumor_debunk',
        rumorId,
        title: rumorItem?.title,
      });
    }
    this.emitHud();
    return true;
  }

  public completeRadioPuzzle(): void {
    this.raniRescued = true;
    this.rumors = this.rumors.map((r) =>
      r.id === 'rumor_gereja' ? { ...r, discoveredRumor: true, discoveredFact: true } : r
    );
    this.audio.playDebunkChime();
    this.audio.playNpcVoice('rani', 2);
    this.speakPlayerLine('Rani! Sinyalmu tersambung, bertahanlah kami segera ke sana!');
    this.callbacks.onRumorsChanged([...this.rumors]);
    this.callbacks.onToast(
      'Sinyal Rani ditemukan! Rekaman suara Rani masuk ke Jurnal Mitos vs Fakta.',
      'fact'
    );
    if (this.isMultiplayer) {
      this.callbacks.onCoopAction?.({ type: 'radio_rescue' });
    }
    this.emitHud();
  }

  private activateDimensiGaibAtmosphere(): void {
    this.inDimensiGaib = true;
    this.mats.wall_out.color.setHex(0x636c66);
    if (this.facadeMaterials) {
      this.facadeMaterials.facadeMat.color.setHex(0x636c66);
      this.facadeMaterials.trimMat.color.setHex(0x7c857e);
    }
    this.scene.background = new THREE.Color(0x030405);
  }

  private seatAiCompanionsInCar(carX: number, carY: number, carZ: number, carYaw: number): void {
    const count = this.aiCompanions.length;
    this.aiCompanions.forEach((c, idx) => {
      const seatOffsetX = (idx - (count - 1) * 0.5) * 0.38;
      const localZ = 0.88;
      const sin = Math.sin(carYaw);
      const cos = Math.cos(carYaw);
      c.pos = {
        x: carX + seatOffsetX * cos + localZ * sin,
        y: carY + 0.08,
        z: carZ - seatOffsetX * sin + localZ * cos,
      };
      c.yaw = carYaw + Math.PI;
      c.rig.group.position.set(c.pos.x, c.pos.y, c.pos.z);
      c.rig.group.rotation.y = c.yaw;
      c.rig.bodyRoot.position.y = -0.32;
      c.rig.leftLeg.rotation.x = -Math.PI * 0.44;
      c.rig.rightLeg.rotation.x = -Math.PI * 0.44;
      c.rig.leftArm.rotation.x = -0.32;
      c.rig.rightArm.rotation.x = -0.32;
      syncHumanoidGlbBones(c.rig, { isSeated: true });
    });
  }

  private standAiCompanionsAtSpawn(): void {
    this.aiCompanions.forEach((c, idx) => {
      const target = computeCompanionFollowTarget(
        this.playerPos,
        this.yaw || PLAYER_SPAWN_YAW,
        idx,
        this.aiCompanions.length
      );
      const safe = resolveHorizontalCollision(
        { x: target.x, y: this.playerPos.y, z: target.z },
        0.32,
        1.68,
        this.activeColliders
      );
      c.pos = { x: safe.x, y: this.playerPos.y, z: safe.z };
      c.yaw = (this.yaw || PLAYER_SPAWN_YAW) + Math.PI;
      c.rig.group.position.set(c.pos.x, c.pos.y, c.pos.z);
      c.rig.group.rotation.y = c.yaw;
      c.rig.bodyRoot.position.y = 0;
      c.rig.leftLeg.rotation.x = 0;
      c.rig.rightLeg.rotation.x = 0;
      c.rig.leftArm.rotation.x = 0;
      c.rig.rightArm.rotation.x = 0;
    });
  }

  public skipCutscene(): void {
    if (this.endingCutscene) {
      this.completeEndingCutscene();
      return;
    }
    if (this.introCutscene) {
      this.introCutscene = null;
      this.audio.stopCarAudio();
      this.arrivalCar.group.visible = false;
      this.arrivalCar.interiorLight.intensity = 0;
      this.playerPos = { ...PLAYER_SPAWN };
      this.yaw = PLAYER_SPAWN_YAW;
      this.pitch = 0.02;
      this.currentEyeHeight = 1.65;
      this.flashlightOn = true;
      this.inputSuspended = false;
      this.standAiCompanionsAtSpawn();
      this.emitHud();
    }
  }

  public startNewGame(): void {
    this.audio.unlock();
    this.resetWorldEntities();
    this.remoteGhostTargets.clear();
    if (this.kujangGroup) {
      this.kujangGroup.visible = true;
      this.kujangGroup.scale.setScalar(1);
    }
    this.endingCutscene = null;
    this.endingLight.intensity = 0;
    this.indoorBlend = 0;
    this.downed = false;
    const staggerOffsets = [
      { dx: 0, dz: 0 },
      { dx: 1.6, dz: -0.9 },
      { dx: 3.1, dz: -1.6 },
      { dx: 1.8, dz: 1.1 },
      { dx: 3.4, dz: 0.4 },
    ];
    const st = this.isMultiplayer
      ? staggerOffsets[Math.abs(this.spawnSlot) % staggerOffsets.length]
      : { dx: 0, dz: 0 };
    this.playerPos = {
      x: PLAYER_SPAWN.x + st.dx,
      y: PLAYER_SPAWN.y,
      z: PLAYER_SPAWN.z + st.dz,
    };
    this.yaw = PLAYER_SPAWN_YAW;
    this.pitch = 0.02;
    this.currentEyeHeight = 1.65;
    this.cameraRoll = 0;
    this.bodyVisualYawOffset = 0;
    this.moveVelX = 0;
    this.moveVelZ = 0;
    this.handSwayX = 0;
    this.handSwayY = 0;
    this.hasHoverPointer = false;
    this.perspective = 'first-person';
    this.playerRig.group.visible = false;
    this.flashlightOn = true;
    this.uvMode = false;
    this.isHiding = false;
    this.activeClosetIndex = null;
    this.hideTransition = 0;
    this.hideEnterDoorTimer = 0;
    for (const c of this.closetRigs) {
      c.openAmount = 0;
      c.autoCloseTimer = 0;
      c.leftDoor.rotation.y = 0;
      c.rightDoor.rotation.y = 0;
    }
    if (this.closetInteriorLight) {
      this.closetInteriorLight.visible = false;
    }
    this.sanity = 100;
    this.stamina = 100;
    this.flashlightBattery = 100;
    this.uvBattery = 100;
    this.saltCount = 2;
    this.collectedKeyIds = [];
    this.collectedKeyLabels = [];
    this.ghostHits = 0;
    this.invulnTimer = 0;
    this.elapsedSeconds = 0;
    this.inDimensiGaib = false;
    this.talkedNpcIds.clear();
    this.triggeredSecondBeat = false;
    this.triggeredRooftopBeat = false;
    this.mats.wall_out.color.setHex(0xd0d4cc);
    if (this.facadeMaterials) {
      this.facadeMaterials.facadeMat.color.setHex(0xd4d8d0);
      this.facadeMaterials.trimMat.color.setHex(0xe3e6de);
    }
    if (this.skyDomeMat?.uniforms?.uDawnMix) {
      this.skyDomeMat.uniforms.uDawnMix.value = 0;
    }
    this.dirLight.color.setHex(0xaec6e6);
    this.scene.background = new THREE.Color(0x06090b);
    (this.scene.fog as THREE.FogExp2).color.setHex(0x06090b);
    (this.scene.fog as THREE.FogExp2).density = 0.018;
    this.raniRescued = false;
    this.kujangClaimed = false;
    this.rumors = INITIAL_RUMORS.map((r) => ({ ...r }));
    this.callbacks.onRumorsChanged([...this.rumors]);
    this.phase = 'playing';
    this.keys.clear();
    this.isDraggingLook = false;
    this.lookTouchId = null;
    this.virtualForward = 0;
    this.virtualRight = 0;
    this.virtualCrouch = false;
    this.virtualSprint = false;
    this.inputSuspended = false;
    this.rebuildAiCompanions();

    // Mulai animasi kedatangan di dalam mobil bersama Pa Nanang menuju Warung Ceu Titin (Solo & Multiplayer)
    const skipIntroParam =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('skipintro') === '1';
    if (!this.isSpectator && !skipIntroParam) {
      this.flashlightOn = false;
      this.arrivalCar.group.visible = true;
      this.arrivalCar.group.position.set(-0.95, 0, 80.0);
      this.arrivalCar.group.rotation.set(0, 0, 0);
      this.arrivalCar.doorPivot.rotation.y = 0;
      this.arrivalCar.interiorLight.intensity = 1.25;
      this.arrivalCar.taillightMat.color.setHex(0x9e1c14);
      this.yaw = INTRO_CAR_DIALOGUES[0].lookYaw;
      this.pitch = INTRO_CAR_DIALOGUES[0].lookPitch;
      this.arrivalCar.driverHead.rotation.y = INTRO_CAR_DIALOGUES[0].driverHeadYaw;
      this.seatAiCompanionsInCar(-0.95, 0, 80.0, 0);
      this.introCutscene = {
        stage: 'arriving',
        timer: 0,
        controlReleased: false,
        doorOpened: false,
        doorClosed: false,
        departAudioPlayed: false,
        lastDialogueIdx: 0,
      };
      this.audio.playCarEnginePhase('arrive');
      this.audio.playNpcVoice('satpam', 0);
    } else {
      this.introCutscene = null;
      this.arrivalCar.group.visible = false;
    }

    this.emitHud();
  }

  public setPhase(next: GamePhase): void {
    this.phase = next;
    if (next !== 'playing') {
      this.audio.stopCarAudio();
      this.keys.clear();
      this.isDraggingLook = false;
      this.lookTouchId = null;
      this.virtualForward = 0;
      this.virtualRight = 0;
      this.virtualSprint = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        try {
          document.exitPointerLock?.();
        } catch {
          // ignore
        }
      }
    }
    this.emitHud();
  }

  public setVirtualMove(forward: number, right: number): void {
    this.virtualForward = Math.max(-1, Math.min(1, forward));
    this.virtualRight = Math.max(-1, Math.min(1, right));
  }

  public setVirtualCrouch(crouch: boolean): void {
    this.virtualCrouch = crouch;
    this.emitHud();
  }

  public setVirtualSprint(sprint: boolean): void {
    this.virtualSprint = sprint;
    this.emitHud();
  }

  public requestPointerLock(): void {
    if (this.phase === 'playing' && document.pointerLockElement !== this.renderer.domElement) {
      try {
        const res = this.renderer.domElement.requestPointerLock?.() as unknown;
        if (res && typeof (res as Promise<void>).catch === 'function') {
          (res as Promise<void>).catch(() => {});
        }
      } catch {
        // ignore
      }
    }
  }

  public toggleFlashlight(): void {
    if (this.flashlightBattery <= 0 && !this.flashlightOn) {
      this.callbacks.onToast('Baterai Senter habis! Cari Baterai Senter.', 'warn');
      return;
    }
    this.flashlightOn = !this.flashlightOn;
    this.audio.playClick(this.flashlightOn);
    this.emitHud();
  }

  public toggleUVMode(): void {
    if (this.uvBattery <= 0 && !this.uvMode) {
      this.callbacks.onToast('Baterai Kamera UV habis! Cari Baterai UV.', 'warn');
      return;
    }
    this.uvMode = !this.uvMode;
    this.audio.playClick(this.uvMode);
    this.emitHud();
  }

  public togglePerspective(): void {
    this.perspective = this.perspective === 'first-person' ? 'third-person' : 'first-person';
    this.playerRig.group.visible = this.perspective === 'third-person' && !this.isHiding;
    if (this.fpHandRig) {
      const showFp = this.perspective === 'first-person' && !this.isHiding;
      this.fpHandRig.group.visible = showFp;
      if (!showFp) {
        this.fpHandRig.group.position.set(0, -999, 0);
      }
    }
    this.emitHud();
  }

  public useSalt(): void {
    if (this.saltCount <= 0 || this.phase !== 'playing' || this.downed || this.isSpectator) return;
    this.saltCount--;
    this.triggerLeftHandProp('salt');
    this.audio.playClick(false);
    let stunnedAny = false;
    for (const g of this.ghosts) {
      if (distance3D(g.position, this.playerPos) < 8.5) {
        g.stunTimer = 6.0;
        g.state = 'stunned';
        stunnedAny = true;
      }
    }
    if (this.isMultiplayer) {
      this.callbacks.onCoopAction?.({ type: 'salt_stun', position: { ...this.playerPos } });
    }
    this.callbacks.onToast(
      stunnedAny
        ? 'Garam ditaburkan! Hantu di sekitar terpukul mundur sementara!'
        : 'Garam ditaburkan, namun tidak ada hantu di jarak dekat.',
      stunnedAny ? 'fact' : 'info'
    );
    this.emitHud();
  }

  private findNearestDownedTeammate(): { guestId: string; nickname: string; dist: number } | null {
    let best: { guestId: string; nickname: string; dist: number } | null = null;
    let bestDist = 2.65;
    for (const [guestId, entry] of this.remoteRigs.entries()) {
      if (!entry.downed || entry.role !== 'player') continue;
      if (Math.abs(entry.targetPos.y - this.playerPos.y) > 2.2) continue;
      const d = distance3D(entry.targetPos, this.playerPos);
      if (d < bestDist) {
        bestDist = d;
        best = { guestId, nickname: entry.nickname, dist: d };
      }
    }
    return best;
  }

  private findNearestDoor(): DoorData | null {
    let best: DoorData | null = null;
    let bestDist = 2.55;
    for (const d of this.doors) {
      if (Math.abs(d.hingePos.y - this.playerPos.y) > 2.2) continue;
      const dist = distance3D(d.closedCenter, this.playerPos);
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  }

  private findNearestInteractable(): InteractableItem | null {
    let best: InteractableItem | null = null;
    let bestDist = 2.65;
    for (const item of this.interactables) {
      if (item.collected) continue;
      if (Math.abs(item.position.y - this.playerPos.y) > 2.2) continue;
      const d = distance3D(item.position, this.playerPos);
      if (d < bestDist) {
        bestDist = d;
        best = item;
      }
    }
    return best;
  }

  public interactNearest(): void {
    if (this.phase !== 'playing' || this.downed || this.isSpectator) return;

    if (this.isHiding) {
      if (this.activeClosetIndex !== null && this.closetRigs[this.activeClosetIndex]) {
        this.closetRigs[this.activeClosetIndex].autoCloseTimer = 0.72;
      }
      this.isHiding = false;
      this.activeClosetIndex = null;
      this.hideTransition = 0;
      this.hideEnterDoorTimer = 0;
      if (this.closetInteriorLight) {
        this.closetInteriorLight.visible = false;
      }
      this.playerPos = { ...this.hideOrigin };
      this.audio.playDoorCreak(false);
      this.callbacks.onToast('Keluar dari lemari.', 'info');
      this.emitHud();
      return;
    }

    // Prioritaskan menolong rekan regu yang Tumbang
    const downedMate = this.findNearestDownedTeammate();
    if (downedMate && this.isMultiplayer) {
      const entry = this.remoteRigs.get(downedMate.guestId);
      if (entry) {
        entry.downed = false;
      }
      this.audio.playDebunkChime();
      this.callbacks.onCoopAction?.({
        type: 'player_revive',
        targetGuestId: downedMate.guestId,
      });
      this.callbacks.onToast(`Kamu menolong ${downedMate.nickname}! (+45 Sanity)`, 'fact');
      this.emitHud();
      return;
    }

    const nearestDoor = this.findNearestDoor();
    const nearestItem = this.findNearestInteractable();

    // Prioritaskan yang jaraknya paling dekat dengan pemain
    const doorDist = nearestDoor ? distance3D(nearestDoor.closedCenter, this.playerPos) : 999;
    const itemDist = nearestItem ? distance3D(nearestItem.position, this.playerPos) : 999;

    if (nearestDoor && doorDist <= itemDist) {
      const wasLocked = Boolean(nearestDoor.lockedKeyId);
      const res = tryInteractDoor(nearestDoor, this.collectedKeyIds);
      if (res.lockedBlocked) {
        this.audio.playLockedRattle();
        this.callbacks.onToast(res.message, 'warn');
        return;
      }
      if (res.changed) {
        const idx = this.doors.findIndex((d) => d.id === nearestDoor.id);
        if (idx >= 0) this.doors[idx] = res.door;
        this.rebuildActiveColliders();
        this.audio.playDoorCreak(res.door.isOpen);
        const rig = this.doorRigs.get(nearestDoor.id);
        if (rig) {
          rig.lockPlateMat.color.setHex(0x6b8f74);
          rig.lockPlateMat.emissive.setHex(0x16291c);
          rig.lockPlateMat.emissiveIntensity = 0.35;
        }
        if (this.isMultiplayer) {
          this.callbacks.onCoopAction?.({
            type: 'door_toggle',
            doorId: res.door.id,
            isOpen: res.door.isOpen,
            unlocked: wasLocked && !res.door.lockedKeyId,
          });
        }
        this.callbacks.onToast(res.message, 'info');
        this.emitHud();
      }
      return;
    }

    const item = nearestItem;
    if (!item) return;

    if (item.kind === 'npc' && item.payloadId) {
      this.talkedNpcIds.add(item.payloadId);
      this.emitHud();
      this.callbacks.onOpenNpcDialog(item.payloadId);
      return;
    }

    if (item.kind === 'key' && item.payloadId) {
      item.collected = true;
      const mesh = this.itemMeshes.get(item.id);
      if (mesh) mesh.visible = false;
      this.collectedKeyIds.push(item.payloadId);
      this.collectedKeyLabels.push(item.label);
      this.triggerLeftHandProp('key');
      this.audio.playPickup();
      if (this.isMultiplayer) {
        this.callbacks.onCoopAction?.({
          type: 'item_pickup',
          itemId: item.id,
          kind: 'key',
          label: item.label,
          payloadId: item.payloadId,
        });
      }
      this.callbacks.onToast(`Mendapatkan ${item.label}! Gunakan pada pintu ruangan yang terkunci.`, 'fact');
      this.emitHud();
      return;
    }

    if (item.kind === 'evidence') {
      if (item.requiresUV && !this.uvMode) {
        this.callbacks.onToast('Nyalakan Kamera UV [Q] untuk membaca bukti tersembunyi ini!', 'warn');
        return;
      }
      item.collected = true;
      const mesh = this.itemMeshes.get(item.id);
      if (mesh) mesh.visible = false;
      this.triggerLeftHandProp('evidence');
      this.audio.playPickup();
      if (item.payloadId) {
        this.rumors = this.rumors.map((r) =>
          r.id === item.payloadId ? { ...r, discoveredRumor: true, discoveredFact: true } : r
        );
        this.callbacks.onRumorsChanged([...this.rumors]);
      }
      if (this.isMultiplayer) {
        this.callbacks.onCoopAction?.({
          type: 'item_pickup',
          itemId: item.id,
          kind: 'evidence',
          label: item.label,
          payloadId: item.payloadId,
        });
      }
      this.callbacks.onToast(
        `Bukti Fakta ditemukan: ${item.label}. Tekan [J] untuk mematahkan Segel Rumor!`,
        'fact'
      );
      this.emitHud();
      return;
    }

    if (item.kind === 'battery_flashlight') {
      item.collected = true;
      const mesh = this.itemMeshes.get(item.id);
      if (mesh) mesh.visible = false;
      this.flashlightBattery = Math.min(100, this.flashlightBattery + 50);
      this.triggerLeftHandProp('battery');
      this.audio.playPickup();
      if (this.isMultiplayer) {
        this.callbacks.onCoopAction?.({
          type: 'item_pickup',
          itemId: item.id,
          kind: 'battery_flashlight',
          label: item.label,
        });
      }
      this.callbacks.onToast('Baterai Senter terisi +50%.', 'info');
      this.emitHud();
      return;
    }

    if (item.kind === 'battery_uv') {
      item.collected = true;
      const mesh = this.itemMeshes.get(item.id);
      if (mesh) mesh.visible = false;
      this.uvBattery = Math.min(100, this.uvBattery + 50);
      this.triggerLeftHandProp('battery');
      this.audio.playPickup();
      if (this.isMultiplayer) {
        this.callbacks.onCoopAction?.({
          type: 'item_pickup',
          itemId: item.id,
          kind: 'battery_uv',
          label: item.label,
        });
      }
      this.callbacks.onToast('Baterai Kamera UV terisi +50%.', 'info');
      this.emitHud();
      return;
    }

    if (item.kind === 'salt') {
      item.collected = true;
      const mesh = this.itemMeshes.get(item.id);
      if (mesh) mesh.visible = false;
      this.saltCount += 1;
      this.triggerLeftHandProp('salt');
      this.audio.playPickup();
      if (this.isMultiplayer) {
        this.callbacks.onCoopAction?.({
          type: 'item_pickup',
          itemId: item.id,
          kind: 'salt',
          label: item.label,
        });
      }
      this.callbacks.onToast('Mendapatkan Garam Pengusir (+1). Tekan [G] untuk menabur.', 'info');
      this.emitHud();
      return;
    }

    if (item.kind === 'hiding') {
      this.hideOrigin = { ...this.playerPos };
      let matchedIdx: number | null = null;
      let bestDist = 3.0;
      for (let ci = 0; ci < this.closetRigs.length; ci++) {
        const c = this.closetRigs[ci];
        if (Math.abs(c.y - item.position.y) > 1.5) continue;
        const d = Math.hypot(c.x - item.position.x, c.z - item.position.z);
        if (d < bestDist) {
          bestDist = d;
          matchedIdx = ci;
        }
      }
      this.activeClosetIndex = matchedIdx;
      const closet = matchedIdx !== null ? this.closetRigs[matchedIdx] : null;
      if (closet) {
        this.playerPos = { x: closet.x, y: closet.y, z: closet.z };
        this.hideTargetYaw = closet.ry + Math.PI;
        this.yaw = this.hideTargetYaw;
        this.pitch = -0.02;
      } else {
        this.hideTargetYaw = this.yaw;
      }
      this.moveVelX = 0;
      this.moveVelZ = 0;
      this.isHiding = true;
      this.hideTransition = 0;
      this.hideEnterDoorTimer = 0.36;
      this.audio.playDoorCreak(false);
      this.callbacks.onToast(
        `Masuk bersembunyi di dalam ${item.label}. Arahkan pandangan untuk mengintip · [E] Keluar.`,
        'info'
      );
      this.emitHud();
      return;
    }

    if (item.kind === 'crumbling_wall' && item.payloadId) {
      const broken = countBrokenSegel(this.rumors);
      const required = item.id === 'crumble_second' ? 2 : 3;
      if (broken < required) {
        this.callbacks.onToast(
          `Tembok Rapuh masih tertahan mitos! Bongkar minimal ${required} Segel Rumor di Jurnal [J] (Saat ini: ${broken}).`,
          'warn'
        );
        return;
      }
      item.collected = true;
      const mesh = this.wallMeshes.get(item.payloadId);
      if (mesh) mesh.visible = false;
      this.baseColliders = this.baseColliders.filter((c) => c.id !== item.payloadId);
      this.rebuildActiveColliders();
      this.cameraTrauma = 0.65;
      this.audio.playDoorCreak(true);
      if (this.isMultiplayer) {
        this.callbacks.onCoopAction?.({
          type: 'wall_break',
          itemId: item.id,
          wallId: item.payloadId,
        });
      }
      this.callbacks.onToast('Tembok Rapuh runtuh terbuka!', 'fact');
      this.emitHud();
      return;
    }

    if (item.kind === 'radio_tower') {
      this.callbacks.onOpenRadioPuzzle();
      return;
    }

    if (item.kind === 'kujang') {
      this.kujangClaimed = true;
      this.audio.playDebunkChime();
      this.finishRun(false);
    }
  }

  private finishRun(defeated: boolean): void {
    if (this.endingCutscene) return;
    const segelBroken = countBrokenSegel(this.rumors);
    const ev = evaluateEnding({
      defeated,
      kujangClaimed: this.kujangClaimed,
      segelBroken,
      totalSegel: this.rumors.length,
      raniRescued: this.raniRescued,
    });
    if (this.isMultiplayer && !defeated) {
      this.callbacks.onCoopAction?.({
        type: 'kujang_claim',
        summaryTitle: ev.title,
        summarySubtitle: ev.subtitle,
        durationSec: Math.round(this.elapsedSeconds),
      });
    }
    const summary: RunSummary = {
      ending: ev.ending,
      endingTitle: ev.title,
      endingSubtitle: ev.subtitle,
      endingMessage: ev.message,
      characterName: this.getCharacter().name,
      segelBroken,
      totalSegel: this.rumors.length,
      evidenceCount: this.rumors.filter((r) => r.discoveredFact).length,
      totalEvidence: this.rumors.length,
      elapsedSeconds: Math.round(this.elapsedSeconds),
      ghostHits: this.ghostHits,
      raniRescued: this.raniRescued,
    };

    // Putar Animasi Cutscene 3D Ending sesuai tipe Ending (True / Normal / Bad)
    this.introCutscene = null;
    this.audio.stopCarAudio();
    this.arrivalCar.group.visible = false;
    this.setInputSuspended(true);
    this.flashlightOn = false;
    this.uvMode = false;
    this.isHiding = false;
    this.activeClosetIndex = null;
    this.hideTransition = 0;
    this.hideEnterDoorTimer = 0;
    for (const c of this.closetRigs) {
      c.openAmount = 0;
      c.autoCloseTimer = 0;
      c.leftDoor.rotation.y = 0;
      c.rightDoor.rotation.y = 0;
    }
    if (this.closetInteriorLight) {
      this.closetInteriorLight.visible = false;
    }
    this.flashlight.visible = false;
    this.flashlightSpill.visible = false;
    this.uvLight.visible = false;
    this.flashlightBeamCone.visible = false;
    this.playerRig.group.visible = false;
    if (ev.ending !== 'true' && this.kujangGroup) {
      this.kujangGroup.visible = false;
    }
    this.endingCutscene = {
      ending: ev.ending,
      timer: 0,
      duration: 5.8,
      summary,
    };
    this.audio.playEndingStinger(ev.ending);
    this.emitHud();
  }

  private completeEndingCutscene(): void {
    if (!this.endingCutscene) return;
    const summary = this.endingCutscene.summary;
    this.endingCutscene = null;
    this.endingLight.intensity = 0;
    this.setInputSuspended(false);
    this.setPhase('gameover');
    this.callbacks.onGameOver(summary);
  }

  private bindInput(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onWindowBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);

    const dom = this.renderer.domElement;
    dom.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);

    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('touchend', this.onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.onTouchEnd, { passive: true });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.phase !== 'playing') return;
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target instanceof HTMLElement && e.target.isContentEditable)
    ) {
      return;
    }
    this.audio.unlock(true);
    if (e.code === 'Space' && (this.endingCutscene || (this.introCutscene && !this.introCutscene.controlReleased))) {
      e.preventDefault();
      this.skipCutscene();
      return;
    }
    if (this.inputSuspended) return;
    const isRepeat = this.keys.has(e.code);
    this.keys.add(e.code);
    if (isRepeat) return;

    const moveKey =
      e.code === 'KeyW' ||
      e.code === 'KeyA' ||
      e.code === 'KeyS' ||
      e.code === 'KeyD' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'ShiftLeft' ||
      e.code === 'Space';
    if (moveKey && document.pointerLockElement !== this.renderer.domElement) {
      this.requestPointerLock();
    }

    if (e.code === 'KeyF') this.toggleFlashlight();
    else if (e.code === 'KeyQ') this.toggleUVMode();
    else if (e.code === 'KeyV') this.togglePerspective();
    else if (e.code === 'KeyE') this.interactNearest();
    else if (e.code === 'KeyG') this.useSalt();
    else if (e.code === 'KeyJ') this.callbacks.onToggleJournal();
    else if (e.code === 'Escape' || e.code === 'KeyP') this.callbacks.onPauseRequest();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onWindowBlur = (): void => {
    this.keys.clear();
    this.isDraggingLook = false;
    this.hasHoverPointer = false;
    this.lookTouchId = null;
    this.virtualForward = 0;
    this.virtualRight = 0;
    this.virtualSprint = false;
  };

  private onPointerLockChange = (): void => {
    this.isDraggingLook = false;
    this.hasHoverPointer = false;
    if (document.pointerLockElement === this.renderer.domElement) {
      this.pointerLockIgnoreMoves = 2;
    } else {
      this.pointerLockIgnoreMoves = 0;
    }
  };

  private onPointerLockError = (): void => {
    this.pointerLockIgnoreMoves = 0;
  };

  private onContextMenu = (e: MouseEvent): void => {
    if (this.phase === 'playing') {
      e.preventDefault();
      return;
    }
    this.isDraggingLook = false;
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (this.phase !== 'playing') return;
    if (this.inputSuspended) return;
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLButtonElement ||
      (e.target instanceof HTMLElement && e.target.closest('button, input, textarea, a, [role="button"]'))
    ) {
      return;
    }
    this.audio.unlock(true);
    this.isDraggingLook = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    if ((e.button === 0 || e.button === 2) && document.pointerLockElement !== this.renderer.domElement) {
      this.requestPointerLock();
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    this.lastMouseMoveAt = performance.now();
    if (this.phase !== 'playing') {
      this.hasHoverPointer = false;
      return;
    }
    const dom = this.renderer.domElement;
    if (document.pointerLockElement === dom) {
      if (this.pointerLockIgnoreMoves > 0) {
        this.pointerLockIgnoreMoves--;
        return;
      }
      if (Math.abs(e.movementX) > 240 || Math.abs(e.movementY) > 240) return;
      const dx = Math.max(-95, Math.min(95, e.movementX));
      const dy = Math.max(-95, Math.min(95, e.movementY));
      this.applyLookDelta(dx, dy, 0.0024);
      return;
    }

    const introLocked = Boolean(this.introCutscene && !this.introCutscene.controlReleased);
    if (this.inputSuspended || this.endingCutscene || introLocked) {
      this.hasHoverPointer = false;
      return;
    }

    // Bebas menoleh 360° ke kiri/kanan/atas/bawah saat berjalan, lari, jongkok maupun diam:
    // Tidak pernah terkunci atau membeku hanya karena kursor melintasi GameHUD/minimap/stamina
    let rawDx = 0;
    let rawDy = 0;
    if (
      typeof e.movementX === 'number' &&
      (e.movementX !== 0 || e.movementY !== 0) &&
      Math.abs(e.movementX) < 180 &&
      Math.abs(e.movementY) < 180
    ) {
      rawDx = e.movementX;
      rawDy = e.movementY;
    } else if (this.hasHoverPointer) {
      rawDx = e.clientX - this.lastPointerX;
      rawDy = e.clientY - this.lastPointerY;
    }
    this.hasHoverPointer = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    if (rawDx !== 0 || rawDy !== 0) {
      const dx = Math.max(-95, Math.min(95, rawDx));
      const dy = Math.max(-95, Math.min(95, rawDy));
      const sens = this.isDraggingLook ? 0.0036 : 0.0028;
      this.applyLookDelta(dx, dy, sens);
    }
  };

  private onMouseUp = (): void => {
    this.isDraggingLook = false;
  };

  private onTouchStart = (e: TouchEvent): void => {
    this.lastTouchAt = performance.now();
    if (this.phase !== 'playing' || this.inputSuspended) return;
    this.audio.unlock(true);

    if (this.lookTouchId === null) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const target = t.target as HTMLElement | null;
        if (target && target.closest('button, input, textarea, a, [role="button"]')) {
          continue;
        }
        // Usap pandangan di area bebas layar (sisi kanan layar atau bagian atas, di luar virtual thumbstick kiri)
        const isLookZone = t.clientX > window.innerWidth * 0.32 || t.clientY < window.innerHeight * 0.58;
        if (isLookZone) {
          this.lookTouchId = t.identifier;
          this.lastTouchX = t.clientX;
          this.lastTouchY = t.clientY;
          break;
        }
      }
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    this.lastTouchAt = performance.now();
    if (this.phase !== 'playing' || this.inputSuspended || this.lookTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.lookTouchId) {
        if (e.cancelable) e.preventDefault();
        const rawDx = t.clientX - this.lastTouchX;
        const rawDy = t.clientY - this.lastTouchY;
        this.lastTouchX = t.clientX;
        this.lastTouchY = t.clientY;
        const dx = Math.max(-95, Math.min(95, rawDx));
        const dy = Math.max(-95, Math.min(95, rawDy));
        this.applyLookDelta(dx, dy, 0.0052);
        break;
      }
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    this.lastTouchAt = performance.now();
    if (this.lookTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.lookTouchId) {
        this.lookTouchId = null;
        break;
      }
    }
  };

  private startLoop(): void {
    const tick = () => {
      if (this.destroyed) return;
      const now = performance.now();
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const totalDt = Math.min(Math.max(rawDt, 0.001), 0.25);
      const timeSec = now * 0.001;
      let remaining = totalDt;
      while (remaining > 0.0001) {
        const step = Math.min(remaining, 0.05);
        this.update(step, timeSec);
        remaining -= step;
      }
      this.renderScene();

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.destroyed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private animateGhosts(ghost: GhostData, rig: GhostRig, dt: number, timeSec: number): void {
    const speedFactor = ghost.state === 'chase' ? 1.55 : ghost.state === 'investigate' ? 1.15 : 0.75;
    if (rig.mixer) {
      rig.mixer.update(dt * speedFactor);
    }
    const bob =
      ghost.kind === 'pocong'
        ? Math.abs(Math.sin(timeSec * 6.2)) * 0.34
        : ghost.kind === 'genderuwo'
          ? Math.abs(Math.sin(timeSec * 4.2)) * 0.05
          : rig.mixer
            ? Math.abs(Math.sin(timeSec * 2.8 + ghost.homePos.x)) * 0.025
            : Math.sin(timeSec * 2.8 + ghost.homePos.x) * 0.07;

    rig.group.position.set(ghost.position.x, ghost.position.y + bob, ghost.position.z);
    rig.group.rotation.y = this.dampAngle(rig.group.rotation.y, ghost.yaw, 9, dt);
    const chaseLean = ghost.state === 'chase' ? 0.14 : 0.03;
    rig.bodyGroup.rotation.x = THREE.MathUtils.damp(rig.bodyGroup.rotation.x, chaseLean, 6, dt);

    if (ghost.kind === 'boneka_uci' && ghost.state === 'stalk') {
      // Membeku kaku gaya Weeping Angel
      syncGhostGlbBones(rig, timeSec, true, false);
      return;
    }

    // Animasi artikulasi kepala, siku, mulut, & tubuh sesuai jenis hantu (luwes tidak kaku)
    if (ghost.kind === 'ambu_hideung') {
      rig.head.rotation.z = Math.sin(timeSec * 4.5) * 0.16;
      rig.head.rotation.x = ghost.state === 'chase' ? 0.15 : Math.sin(timeSec * 1.9) * 0.07;
      const armReach = ghost.state === 'chase' ? -Math.PI * 0.56 : -Math.PI * 0.28;
      const elbowReach = ghost.state === 'chase' ? -0.45 : -0.78;
      if (rig.leftArm) {
        rig.leftArm.rotation.x = THREE.MathUtils.damp(
          rig.leftArm.rotation.x,
          armReach + Math.sin(timeSec * 5.2) * 0.22,
          8,
          dt
        );
      }
      if (rig.rightArm) {
        rig.rightArm.rotation.x = THREE.MathUtils.damp(
          rig.rightArm.rotation.x,
          armReach - Math.sin(timeSec * 5.2) * 0.22,
          8,
          dt
        );
      }
      if (rig.leftElbow) rig.leftElbow.rotation.x = elbowReach + Math.cos(timeSec * 5.2) * 0.2;
      if (rig.rightElbow) rig.rightElbow.rotation.x = elbowReach - Math.cos(timeSec * 5.2) * 0.2;
      applyMouthLipSync(
        rig.mouthPivot,
        rig.mouthCavity,
        ghost.state === 'chase'
          ? 0.52 + Math.abs(Math.sin(timeSec * 9.2)) * 0.42
          : 0.14 + Math.max(0, Math.sin(timeSec * 3.1)) * 0.22
      );
      if (rig.hairStrands) {
        rig.hairStrands.forEach((strand, idx) => {
          strand.rotation.y = Math.sin(timeSec * 3.8 + idx * 0.8) * 0.18;
          strand.rotation.z = Math.cos(timeSec * 3.1 + idx * 0.6) * 0.09;
        });
      }
    } else if (ghost.kind === 'kuntilanak') {
      rig.head.rotation.z = Math.sin(timeSec * 5.1) * 0.22;
      const sway = Math.sin(timeSec * 4.0 * speedFactor) * 0.25;
      if (rig.leftArm) rig.leftArm.rotation.x = -Math.PI * 0.42 + sway;
      if (rig.rightArm) rig.rightArm.rotation.x = -Math.PI * 0.42 - sway;
      if (rig.leftElbow) rig.leftElbow.rotation.x = -0.58 - Math.cos(timeSec * 4.0) * 0.22;
      if (rig.rightElbow) rig.rightElbow.rotation.x = -0.58 + Math.cos(timeSec * 4.0) * 0.22;
      applyMouthLipSync(
        rig.mouthPivot,
        rig.mouthCavity,
        ghost.state === 'chase'
          ? 0.6 + Math.abs(Math.sin(timeSec * 12.4)) * 0.35
          : 0.2 + Math.abs(Math.sin(timeSec * 5.4)) * 0.25
      );
      if (rig.hairStrands) {
        rig.hairStrands.forEach((lock, idx) => {
          lock.rotation.x = 0.15 + Math.sin(timeSec * 4.4 + idx) * 0.16;
        });
      }
    } else if (ghost.kind === 'pocong') {
      const hopFreq = ghost.state === 'chase' ? 8.2 : 5.4;
      const hopPhase = timeSec * hopFreq + (ghost.homePos.x * 2.1);
      const hopCycle = Math.sin(hopPhase);
      const hopArc = Math.max(0, hopCycle);
      const hopHeight = ghost.state === 'chase' ? 0.44 : 0.28;
      rig.bodyGroup.position.y = Math.pow(hopArc, 1.25) * hopHeight;

      // Kecondongan tubuh ke depan di udara & roll ke samping saat berbelok
      const pitchTilt = (ghost.state === 'chase' ? 0.26 : 0.12) + Math.cos(hopPhase) * 0.18;
      rig.bodyGroup.rotation.x = THREE.MathUtils.damp(rig.bodyGroup.rotation.x, pitchTilt, 10, dt);
      rig.bodyGroup.rotation.z = THREE.MathUtils.damp(
        rig.bodyGroup.rotation.z,
        Math.sin(hopPhase * 0.5) * 0.08,
        8,
        dt
      );

      // Kompresi pendaratan (squash saat sentuh tanah, stretch saat melompat)
      const isLanding = hopCycle <= 0.08;
      const targetScaleY = isLanding ? 0.92 : 1.05;
      const targetScaleXZ = isLanding ? 1.05 : 0.98;
      rig.bodyGroup.scale.y = THREE.MathUtils.damp(rig.bodyGroup.scale.y, targetScaleY, 14, dt);
      rig.bodyGroup.scale.x = THREE.MathUtils.damp(rig.bodyGroup.scale.x, targetScaleXZ, 14, dt);
      rig.bodyGroup.scale.z = THREE.MathUtils.damp(rig.bodyGroup.scale.z, targetScaleXZ, 14, dt);

      const jitter = ghost.state === 'chase' ? Math.sin(timeSec * 16) * 0.14 : 0;
      rig.head.rotation.z = Math.sin(timeSec * 3.0) * 0.12 + jitter;
      rig.head.rotation.y = Math.sin(timeSec * 2.4) * 0.12;
      applyMouthLipSync(
        rig.mouthPivot,
        rig.mouthCavity,
        ghost.state === 'chase'
          ? 0.55 + Math.abs(Math.sin(timeSec * 16.0)) * 0.45
          : Math.max(0, Math.sin(timeSec * 8.2)) * 0.24
      );
    } else if (ghost.kind === 'genderuwo') {
      const stride = Math.sin(timeSec * 5.2 * speedFactor) * 0.55;
      if (rig.leftLeg) rig.leftLeg.rotation.x = stride;
      if (rig.rightLeg) rig.rightLeg.rotation.x = -stride;
      if (rig.leftArm) rig.leftArm.rotation.x = -stride * 0.8 - 0.35;
      if (rig.rightArm) rig.rightArm.rotation.x = stride * 0.8 - 0.35;
      if (rig.leftElbow) rig.leftElbow.rotation.x = -0.62 - Math.cos(timeSec * 5.2) * 0.18;
      if (rig.rightElbow) rig.rightElbow.rotation.x = -0.62 + Math.cos(timeSec * 5.2) * 0.18;
      rig.bodyGroup.rotation.z = Math.sin(timeSec * 5.2 * speedFactor) * 0.06;
      rig.head.rotation.y = Math.sin(timeSec * 2.5) * 0.18;
      applyMouthLipSync(
        rig.mouthPivot,
        rig.mouthCavity,
        ghost.state === 'chase'
          ? 0.65 + Math.abs(Math.sin(timeSec * 7.8)) * 0.35
          : 0.22 + Math.abs(Math.sin(timeSec * 2.6)) * 0.25
      );
      syncGhostGlbBones(rig, timeSec, false, ghost.state === 'chase');
    } else if (ghost.kind === 'boneka_uci') {
      rig.head.rotation.z = Math.sin(timeSec * 9.0) * 0.28;
      if (rig.leftArm) rig.leftArm.rotation.x = -0.65 + Math.sin(timeSec * 8) * 0.3;
      if (rig.rightArm) rig.rightArm.rotation.x = -0.65 - Math.sin(timeSec * 8) * 0.3;
      if (rig.leftElbow) rig.leftElbow.rotation.x = -0.6 + Math.cos(timeSec * 8) * 0.25;
      if (rig.rightElbow) rig.rightElbow.rotation.x = -0.6 - Math.cos(timeSec * 8) * 0.25;
      applyMouthLipSync(rig.mouthPivot, rig.mouthCavity, Math.max(0, Math.sin(timeSec * 6.5)) * 0.36);
      syncGhostGlbBones(rig, timeSec, false, ghost.state === 'chase');
    }
  }

  public speakNpcDialogueLine(
    npcId: string,
    lineText: string,
    voiceId?: NpcVoiceId,
    lineIndex = 0
  ): void {
    const duration = Math.max(2.0, Math.min(12.0, lineText.length / 10.5));
    this.activeSpeech = {
      target: npcId,
      text: lineText,
      elapsed: 0,
      duration,
    };
    const spoken = this.audio.speakIndonesian(lineText, voiceId ?? 'warung_ibu', () => {
      if (this.activeSpeech?.target === npcId) {
        this.activeSpeech = null;
      }
    });
    if (!spoken && voiceId) {
      this.audio.playNpcVoice(voiceId, lineIndex);
    }
  }

  public stopDialogueSpeech(): void {
    if (this.activeSpeech && this.activeSpeech.target !== 'player' && this.activeSpeech.target !== 'pa_nanang') {
      this.activeSpeech = null;
    }
    this.audio.stopSpeech();
  }

  public speakPlayerLine(text: string): void {
    const duration = Math.max(1.8, Math.min(10.0, text.length / 11.2));
    this.activeSpeech = {
      target: 'player',
      text,
      elapsed: 0,
      duration,
    };
    this.audio.speakIndonesian(text, this.characterId, () => {
      if (this.activeSpeech?.target === 'player') {
        this.activeSpeech = null;
      }
    });
  }

  private animateNpcs(dt: number, timeSec: number): void {
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    for (const { id, rig } of this.npcAnimations) {
      const breath = Math.sin(timeSec * 2.1 + id.length) * 0.014;
      const dx = px - rig.group.position.x;
      const dz = pz - rig.group.position.z;
      const dist = Math.hypot(dx, dz);
      const playerWorldYaw = Math.atan2(dx, dz);
      let headYawOffset = 0;
      if (dist < 4.5 && this.phase === 'playing') {
        let diff = (playerWorldYaw - rig.group.rotation.y) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        headYawOffset = THREE.MathUtils.clamp(diff, -0.72, 0.72);
      }

      const isSpeaking =
        this.activeSpeech !== null &&
        (this.activeSpeech.target === id ||
          (this.activeSpeech.target === 'warung_pemuda' && id === 'warung_pemuda_1'));
      const lipOpen = isSpeaking ? computeLipOpenness(this.activeSpeech!.text, this.activeSpeech!.elapsed) : 0;
      applyMouthLipSync(rig.mouthPivot, rig.mouthCavity, lipOpen);

      if (id === 'satpam') {
        rig.bodyRoot.position.y = breath;
        rig.bodyRoot.rotation.z = Math.sin(timeSec * 1.1) * 0.02;
        const targetHead = dist < 4.5 ? headYawOffset : Math.sin(timeSec * 0.9) * 0.44;
        rig.head.rotation.y = this.dampAngle(rig.head.rotation.y, targetHead, 5, dt);
        rig.head.rotation.x = isSpeaking ? Math.sin(timeSec * 5.2) * 0.06 : 0;
        rig.rightArm.rotation.x = isSpeaking ? -0.58 + Math.sin(timeSec * 4.5) * 0.16 : -0.3 + Math.sin(timeSec * 1.4) * 0.14;
        rig.rightElbow.rotation.x = isSpeaking ? -0.78 + Math.cos(timeSec * 5.0) * 0.18 : -0.45;
        rig.leftArm.rotation.x = -0.14 + Math.sin(timeSec * 1.2) * 0.06;
        rig.leftElbow.rotation.x = -0.32;
        rig.leftKnee.rotation.x = 0.06 + Math.sin(timeSec * 1.1) * 0.025;
        rig.rightKnee.rotation.x = 0.06 - Math.sin(timeSec * 1.1) * 0.025;
      } else if (id === 'nasgor') {
        rig.bodyRoot.position.y = breath;
        rig.rightArm.rotation.x = -0.68 + Math.sin(timeSec * 6.4) * 0.24;
        rig.rightArm.rotation.z = Math.cos(timeSec * 6.4) * 0.16;
        rig.rightElbow.rotation.x = -0.55 - Math.sin(timeSec * 6.4) * 0.2;
        rig.leftArm.rotation.x = isSpeaking ? -0.45 + Math.sin(timeSec * 4.2) * 0.15 : -0.28 + Math.sin(timeSec * 3.2) * 0.1;
        rig.leftElbow.rotation.x = -0.42;
        rig.head.rotation.y = this.dampAngle(rig.head.rotation.y, dist < 4.5 ? headYawOffset : Math.sin(timeSec * 1.5) * 0.18, 5, dt);
        rig.head.rotation.x = isSpeaking ? Math.sin(timeSec * 4.8) * 0.06 : 0.14 + Math.sin(timeSec * 3.2) * 0.06;
        rig.leftKnee.rotation.x = 0.08 + Math.sin(timeSec * 2.1) * 0.03;
        rig.rightKnee.rotation.x = 0.08 - Math.sin(timeSec * 2.1) * 0.03;
      } else if (id === 'pecel') {
        rig.bodyRoot.position.y = breath;
        rig.rightArm.rotation.x = isSpeaking ? -0.62 + Math.sin(timeSec * 4.6) * 0.18 : -0.52 + Math.sin(timeSec * 4.8) * 0.26;
        rig.rightElbow.rotation.x = -0.58;
        rig.leftArm.rotation.x = -0.2 + Math.cos(timeSec * 2.4) * 0.12;
        rig.leftElbow.rotation.x = -0.38;
        rig.head.rotation.y = this.dampAngle(rig.head.rotation.y, dist < 4.5 ? headYawOffset : Math.sin(timeSec * 1.3) * 0.24, 5, dt);
        rig.leftKnee.rotation.x = 0.08 + Math.sin(timeSec * 1.8) * 0.03;
        rig.rightKnee.rotation.x = 0.08 - Math.sin(timeSec * 1.8) * 0.03;
      } else if (id === 'warung_ibu') {
        rig.bodyRoot.position.y = breath;
        rig.rightArm.rotation.x = isSpeaking ? -0.64 + Math.sin(timeSec * 5.0) * 0.2 : -0.42 + Math.sin(timeSec * 2.2) * 0.18;
        rig.rightElbow.rotation.x = isSpeaking ? -0.82 + Math.cos(timeSec * 4.5) * 0.2 : -0.56;
        rig.leftArm.rotation.x = isSpeaking ? -0.48 + Math.cos(timeSec * 4.6) * 0.18 : -0.28 + Math.cos(timeSec * 2.2) * 0.14;
        rig.leftElbow.rotation.x = -0.52;
        rig.head.rotation.y = this.dampAngle(rig.head.rotation.y, dist < 4.5 ? headYawOffset : Math.sin(timeSec * 1.1) * 0.3, 5, dt);
        rig.head.rotation.x = isSpeaking ? Math.sin(timeSec * 5.5) * 0.07 : 0;
        rig.leftKnee.rotation.x = 0.07;
        rig.rightKnee.rotation.x = 0.07;
      } else if (id === 'warung_pemuda_1') {
        rig.bodyRoot.position.y = -0.34 + breath * 0.6;
        rig.bodyRoot.rotation.z = Math.sin(timeSec * 1.1) * 0.025;
        const sip = isSpeaking ? 0 : Math.max(0, Math.sin(timeSec * 1.25));
        rig.rightArm.rotation.x = isSpeaking ? -0.55 + Math.sin(timeSec * 4.4) * 0.16 : -0.46 - sip * 0.56;
        rig.rightElbow.rotation.x = isSpeaking ? -0.74 : -0.45 - sip * 0.52;
        rig.leftArm.rotation.x = -0.25 + Math.sin(timeSec * 1.5) * 0.08;
        rig.leftElbow.rotation.x = -0.55;
        rig.head.rotation.x = isSpeaking ? Math.sin(timeSec * 4.8) * 0.06 : -0.04 + sip * 0.14;
        rig.head.rotation.y = this.dampAngle(rig.head.rotation.y, dist < 4.5 ? headYawOffset : Math.sin(timeSec * 0.7) * 0.26, 5, dt);
      } else if (id === 'warung_pemuda_2') {
        rig.bodyRoot.position.y = -0.34 + breath * 0.6;
        rig.bodyRoot.rotation.z = Math.cos(timeSec * 1.3) * 0.024;
        rig.leftArm.rotation.x = isSpeaking ? -0.48 + Math.sin(timeSec * 4.0) * 0.16 : -0.48 + Math.sin(timeSec * 1.8) * 0.08;
        rig.leftElbow.rotation.x = -0.65;
        rig.rightArm.rotation.x = isSpeaking ? -0.54 + Math.cos(timeSec * 4.2) * 0.18 : -0.68 + Math.sin(timeSec * 4.6) * 0.1;
        rig.rightElbow.rotation.x = -0.78 + Math.cos(timeSec * 3.8) * 0.08;
        rig.head.rotation.x = isSpeaking ? Math.sin(timeSec * 4.5) * 0.06 : 0.22 + Math.sin(timeSec * 1.6) * 0.06;
        rig.head.rotation.y = this.dampAngle(rig.head.rotation.y, dist < 4.5 ? headYawOffset : Math.sin(timeSec * 0.9) * 0.24, 5, dt);
      } else if (id === 'warung_pemuda_3') {
        rig.bodyRoot.position.y = breath;
        rig.bodyRoot.rotation.z = Math.sin(timeSec * 1.4) * 0.022;
        rig.leftArm.rotation.x = -0.18 + Math.sin(timeSec * 2.1) * 0.14;
        rig.leftElbow.rotation.x = -0.38;
        rig.rightArm.rotation.x = isSpeaking ? -0.52 + Math.sin(timeSec * 4.5) * 0.18 : -0.24 + Math.cos(timeSec * 2.4) * 0.2;
        rig.rightElbow.rotation.x = -0.44 - Math.sin(timeSec * 2.4) * 0.12;
        rig.head.rotation.y = this.dampAngle(rig.head.rotation.y, dist < 4.5 ? headYawOffset : -0.18 + Math.sin(timeSec * 1.45) * 0.28, 5, dt);
        rig.leftLeg.rotation.x = Math.sin(timeSec * 4.0) * 0.08;
        rig.leftKnee.rotation.x = 0.08 + Math.sin(timeSec * 1.4) * 0.03;
        rig.rightKnee.rotation.x = 0.08 - Math.sin(timeSec * 1.4) * 0.03;
      }
    }
  }

  private update(dt: number, timeSec: number): void {
    this.fpsCounter++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.currentFps = Math.round(this.fpsCounter / this.fpsTimer);
      this.fpsCounter = 0;
      this.fpsTimer = 0;
    }

    if (this.activeSpeech) {
      this.activeSpeech.elapsed += dt;
      if (this.activeSpeech.elapsed >= this.activeSpeech.duration) {
        this.activeSpeech = null;
      }
    }

    // Animasi lingkungan + engsel pintu + gerakan & lip-sync tiap NPC
    this.animateNpcs(dt, timeSec);
    for (const d of this.doors) {
      if (Math.abs(d.currentAngle - d.targetAngle) > 0.001) {
        d.currentAngle = THREE.MathUtils.damp(d.currentAngle, d.targetAngle, 9, dt);
        const rig = this.doorRigs.get(d.id);
        if (rig) rig.pivot.rotation.y = d.currentAngle;
      }
    }

    if (this.beaconMesh) {
      const pulse = Math.sin(timeSec * 4) > 0 ? 1 : 0.2;
      (this.beaconMesh.material as THREE.MeshBasicMaterial).color.setRGB(pulse, 0.1, 0.1);
    }
    if (this.kujangGroup && this.kujangGroup.visible) {
      this.kujangGroup.rotation.y = timeSec * 1.1;
      this.kujangGroup.position.y = 1.45 + Math.sin(timeSec * 2.4) * 0.08;
    }
    for (const eye of this.octopusEyes) {
      const mat = eye.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.6 + Math.sin(timeSec * 3.1) * 0.7;
    }
    if (this.dustPoints) {
      this.dustPoints.rotation.y = timeSec * 0.015;
    }

    // Riak air hujan prosedural di genangan jalan, percikan air saat dilewati, & langit malam dinamis
    if (this.skyDomeMesh) {
      this.skyDomeMesh.position.set(
        this.camera.position.x,
        this.camera.position.y * 0.25,
        this.camera.position.z
      );
    }
    if (this.skyDomeMat?.uniforms?.uTime) {
      this.skyDomeMat.uniforms.uTime.value = timeSec;
    }
    if (this.streetPuddles) {
      if (this.streetPuddles.shaderMat?.uniforms?.uTime) {
        this.streetPuddles.shaderMat.uniforms.uTime.value = timeSec;
      }
      this.streetPuddles.normalTexA.offset.set(timeSec * 0.018, timeSec * 0.012);
      this.streetPuddles.normalTexB.offset.set(-timeSec * 0.014, timeSec * 0.02);
      for (const d of this.streetPuddles.splashDrops) {
        if (!d.mesh.visible) continue;
        d.age += dt;
        if (d.age >= d.maxAge) {
          d.mesh.visible = false;
          continue;
        }
        d.vy -= 9.5 * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z += d.vz * dt;
        const s = 1 - d.age / d.maxAge;
        d.mesh.scale.setScalar(Math.max(0.15, s));
      }
    }
    if (this.poolNormalTex) {
      this.poolNormalTex.offset.set(timeSec * 0.025, -timeSec * 0.018);
    }
    if (this.courtyardWaterNormalTex) {
      this.courtyardWaterNormalTex.offset.set(-timeSec * 0.02, timeSec * 0.024);
    }
    for (const tc of this.treeCanopies) {
      tc.pivot.rotation.z = Math.sin(timeSec * 0.85 + tc.phase) * 0.018;
      tc.pivot.rotation.x = Math.cos(timeSec * 0.65 + tc.phase) * 0.012;
    }

    // Kamera Title Screen: Live Sukajadi World Tour menampilkan Warung Ceu Titin, Baliho Windah, Pos Ronda, Masjid & Rumah Gurita
    if (this.phase === 'title') {
      const angle = timeSec * 0.14;
      this.camera.position.set(
        2.5 + Math.sin(angle) * 5.2,
        9.4 + Math.sin(angle * 1.3) * 0.45,
        39.5
      );
      this.camera.lookAt(-1.2, 4.0, 6.0);
      this.flashlight.visible = false;
      this.flashlightSpill.visible = false;
      this.flashlightBeamCone.visible = false;
      this.uvLight.visible = false;
      if (this.fpHandRig) this.fpHandRig.group.visible = false;
      this.updateLightingAndAtmosphere(dt, timeSec, 999);
      return;
    }

    if (this.phase !== 'playing') {
      if (this.fpHandRig) this.fpHandRig.group.visible = false;
      return;
    }

    // Cutscene Ending 3D (berbeda untuk True, Normal, dan Bad Ending)
    if (this.endingCutscene) {
      if (this.fpHandRig) this.fpHandRig.group.visible = false;
      this.updateEndingCutscene(dt, timeSec);
      this.hudEmitTimer += dt;
      if (this.hudEmitTimer >= 0.1) {
        this.hudEmitTimer = 0;
        this.emitHud(0, 999, null);
      }
      return;
    }

    // Animasi Mobil Pengantar Menuju Warung Ceu Titin -> Keluar Mobil -> Mobil Berangkat Menghilang
    if (this.introCutscene) {
      this.updateIntroCarCutscene(dt);
      if (!this.introCutscene?.controlReleased) {
        if (this.fpHandRig) this.fpHandRig.group.visible = false;
        this.updateFlashlightTransform(dt, timeSec, 999, false);
        this.updateLightingAndAtmosphere(dt, timeSec, 999);
        this.hudEmitTimer += dt;
        if (this.hudEmitTimer >= 0.1) {
          this.hudEmitTimer = 0;
          this.emitHud(0, 999, null);
        }
        return;
      }
    }

    if (this.heldPropTimer > 0) {
      this.heldPropTimer = Math.max(0, this.heldPropTimer - dt);
      if (this.heldPropTimer === 0) {
        this.heldPropKind = 'none';
      }
    }

    this.elapsedSeconds += dt;
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.cameraTrauma > 0) this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.6);

    // Update animasi remote squadmates di Multiplayer (termasuk jongkok, tumbang, & sinar senter)
    for (const entry of this.remoteRigs.values()) {
      if (entry.role !== 'player') continue;
      const cur = entry.rig.group.position;
      const dx = entry.targetPos.x - cur.x;
      const dz = entry.targetPos.z - cur.z;
      const moving = Math.hypot(dx, dz) > 0.03;
      cur.x = THREE.MathUtils.damp(cur.x, entry.targetPos.x, 12, dt);
      cur.y = THREE.MathUtils.damp(cur.y, entry.targetPos.y, 12, dt);
      cur.z = THREE.MathUtils.damp(cur.z, entry.targetPos.z, 12, dt);
      entry.rig.group.rotation.y = this.dampAngle(entry.rig.group.rotation.y, entry.targetYaw + Math.PI, 12, dt);
      entry.rig.bodyRoot.scale.y = entry.downed ? 0.56 : 1.0;
      entry.rig.bodyRoot.position.y =
        (entry.downed ? -0.34 : entry.isCrouching ? -0.24 : 0) +
        (moving && !entry.downed ? Math.abs(Math.sin(timeSec * 8.5)) * 0.036 : 0) +
        Math.sin(timeSec * 2.0) * 0.012;
      entry.rig.bodyRoot.rotation.x = THREE.MathUtils.damp(
        entry.rig.bodyRoot.rotation.x,
        entry.downed ? 0.55 : entry.isCrouching ? 0.22 : moving ? 0.08 : 0,
        10,
        dt
      );
      const mpPhase = timeSec * 8.5;
      const swing = moving && !entry.downed ? Math.sin(mpPhase) * 0.54 : 0;
      const crouchHipOff = entry.isCrouching && !entry.downed ? -0.68 : 0;
      const crouchKneeOff = entry.isCrouching && !entry.downed ? 1.16 : 0;
      const mpSwingKneeL = Math.max(0, Math.sin(mpPhase)) * 0.74;
      const mpStanceKneeL = Math.max(0, -Math.sin(mpPhase)) * 0.20;
      const mpKneeL = moving && !entry.downed ? 0.08 + mpSwingKneeL + mpStanceKneeL : 0.08;

      const mpSwingKneeR = Math.max(0, -Math.sin(mpPhase)) * 0.74;
      const mpStanceKneeR = Math.max(0, Math.sin(mpPhase)) * 0.20;
      const mpKneeR = moving && !entry.downed ? 0.08 + mpSwingKneeR + mpStanceKneeR : 0.08;

      entry.rig.leftLeg.rotation.x = THREE.MathUtils.damp(entry.rig.leftLeg.rotation.x, crouchHipOff + swing, 10, dt);
      entry.rig.rightLeg.rotation.x = THREE.MathUtils.damp(entry.rig.rightLeg.rotation.x, crouchHipOff - swing, 10, dt);
      entry.rig.leftKnee.rotation.x = THREE.MathUtils.damp(entry.rig.leftKnee.rotation.x, crouchKneeOff + mpKneeL, 10, dt);
      entry.rig.rightKnee.rotation.x = THREE.MathUtils.damp(entry.rig.rightKnee.rotation.x, crouchKneeOff + mpKneeR, 10, dt);
      entry.rig.leftArm.rotation.x = THREE.MathUtils.damp(entry.rig.leftArm.rotation.x, -swing * 0.8, 10, dt);
      entry.rig.rightArm.rotation.x = THREE.MathUtils.damp(
        entry.rig.rightArm.rotation.x,
        entry.flashlightOn && !entry.downed ? -0.44 + swing * 0.16 : swing * 0.8,
        10,
        dt
      );
      entry.rig.leftElbow.rotation.x = THREE.MathUtils.damp(
        entry.rig.leftElbow.rotation.x,
        moving && !entry.downed ? -0.24 - Math.max(0, -swing) * 0.45 : -0.2,
        10,
        dt
      );
      entry.rig.rightElbow.rotation.x = THREE.MathUtils.damp(
        entry.rig.rightElbow.rotation.x,
        entry.flashlightOn && !entry.downed ? -0.62 : moving && !entry.downed ? -0.24 - Math.max(0, swing) * 0.45 : -0.2,
        10,
        dt
      );
      const mpHipYaw = moving && !entry.downed ? Math.sin(mpPhase) * 0.06 : 0;
      const mpHipRoll = moving && !entry.downed ? Math.cos(mpPhase) * 0.03 : Math.sin(timeSec * 0.35) * 0.015;
      syncHumanoidGlbBones(entry.rig, {
        isCrouching: entry.isCrouching,
        isDowned: entry.downed,
        hipYaw: mpHipYaw,
        hipRoll: mpHipRoll,
      });
      if (entry.rig.rightFlashlightLensMat) {
        entry.rig.rightFlashlightLensMat.color.setHex(entry.flashlightOn && !entry.downed ? 0xfff3d4 : 0x26282a);
      }

      const distToCam = Math.hypot(cur.x - this.playerPos.x, cur.z - this.playerPos.z);
      const tagScale = entry.downed
        ? THREE.MathUtils.clamp(distToCam * 0.16, 0.52, 1.35)
        : THREE.MathUtils.clamp(distToCam * 0.11, 0.38, 0.95);
      entry.nameSprite.scale.set(tagScale, tagScale * 0.25, 1);
      entry.nameSprite.position.y = entry.downed ? 1.45 : entry.isCrouching ? 1.68 : 2.02;
      entry.nameSprite.visible = distToCam > 0.35;
    }

    // Update AI Teman Solo (0-3 rekan selalu mengikuti di belakang pemain tanpa tembus dinding)
    for (let idx = 0; idx < this.aiCompanions.length; idx++) {
      const c = this.aiCompanions[idx];
      const followTarget = computeCompanionFollowTarget(
        this.playerPos,
        this.yaw,
        idx,
        this.aiCompanions.length
      );
      const dx = followTarget.x - c.pos.x;
      const dz = followTarget.z - c.pos.z;
      const dist = Math.hypot(dx, dz);
      let moved = false;
      let targetYaw = this.yaw + Math.PI;
      if (dist > 0.35) {
        const step = Math.min(dist, 3.8 * dt);
        const nx = c.pos.x + (dx / dist) * step;
        const nz = c.pos.z + (dz / dist) * step;
        const resolved = resolveHorizontalCollision(
          { x: nx, y: this.playerPos.y, z: nz },
          0.32,
          1.68,
          this.activeColliders
        );
        const ny = resolveGroundElevation(
          resolved.x,
          resolved.z,
          this.playerPos.y,
          STAIR_ZONES,
          FLOOR_HEIGHT,
          FLOOR_HEIGHT * 2
        );
        moved = Math.hypot(resolved.x - c.pos.x, resolved.z - c.pos.z) > 0.002;
        c.pos = { x: resolved.x, y: ny, z: resolved.z };
        targetYaw = Math.atan2(dx, dz);
      }
      c.yaw = this.dampAngle(c.yaw, targetYaw, 10, dt);
      c.rig.group.position.set(c.pos.x, c.pos.y, c.pos.z);
      c.rig.group.rotation.y = c.yaw;
      // Jangan pernah biarkan rekan AI menembus/menghalangi lensa kamera Third-Person:
      // Sembunyikan rekan jika berada di bidang pandang depan kamera dekat (< 3.2m dan dotCam > 0.22)
      // atau jarak mutlak terlalu dekat (< 2.2m saat menengadah ke langit)
      if (this.perspective === 'third-person') {
        const compPos = _v1.set(c.pos.x, c.pos.y + 1.25, c.pos.z);
        const distToCam = this.camera.position.distanceTo(compPos);
        _v2.subVectors(compPos, this.camera.position).normalize();
        this.camera.getWorldDirection(_v3);
        const dotCam = _v2.dot(_v3);
        const isBlockingView = distToCam < 3.2 && dotCam > 0.22;
        c.rig.group.visible = !isBlockingView && distToCam > 2.2;
      } else {
        c.rig.group.visible = true;
      }
      const breath = Math.sin(timeSec * 2.1 + c.phaseOffset) * 0.015;
      c.rig.bodyRoot.position.y = (moved ? Math.abs(Math.sin(timeSec * 7.8 + c.phaseOffset)) * 0.04 : 0) + breath;
      c.rig.bodyRoot.rotation.x = THREE.MathUtils.damp(c.rig.bodyRoot.rotation.x, moved ? 0.08 : 0, 8, dt);
      const cPhase = timeSec * 7.8 + c.phaseOffset;
      const swing = moved ? Math.sin(cPhase) * 0.54 : 0;
      const cSwingKneeL = Math.max(0, Math.sin(cPhase)) * 0.74;
      const cStanceKneeL = Math.max(0, -Math.sin(cPhase)) * 0.20;
      const cKneeL = moved ? 0.08 + cSwingKneeL + cStanceKneeL : 0.08;

      const cSwingKneeR = Math.max(0, -Math.sin(cPhase)) * 0.74;
      const cStanceKneeR = Math.max(0, Math.sin(cPhase)) * 0.20;
      const cKneeR = moved ? 0.08 + cSwingKneeR + cStanceKneeR : 0.08;

      c.rig.leftLeg.rotation.x = THREE.MathUtils.damp(c.rig.leftLeg.rotation.x, swing, 10, dt);
      c.rig.rightLeg.rotation.x = THREE.MathUtils.damp(c.rig.rightLeg.rotation.x, -swing, 10, dt);
      c.rig.leftKnee.rotation.x = THREE.MathUtils.damp(c.rig.leftKnee.rotation.x, cKneeL, 10, dt);
      c.rig.rightKnee.rotation.x = THREE.MathUtils.damp(c.rig.rightKnee.rotation.x, cKneeR, 10, dt);
      c.rig.leftArm.rotation.x = THREE.MathUtils.damp(c.rig.leftArm.rotation.x, moved ? -swing * 0.78 : breath * 1.4, 10, dt);
      c.rig.rightArm.rotation.x = THREE.MathUtils.damp(c.rig.rightArm.rotation.x, moved ? -0.38 + swing * 0.2 : -0.3 - breath * 1.2, 10, dt);
      c.rig.leftElbow.rotation.x = THREE.MathUtils.damp(
        c.rig.leftElbow.rotation.x,
        moved ? -0.24 - Math.max(0, -swing) * 0.45 : -0.2,
        10,
        dt
      );
      c.rig.rightElbow.rotation.x = THREE.MathUtils.damp(c.rig.rightElbow.rotation.x, -0.64, 10, dt);
      c.rig.head.rotation.y = Math.sin(timeSec * 0.8 + c.phaseOffset) * 0.16;
      const cHipYaw = moved ? Math.sin(cPhase) * 0.06 : 0;
      const cHipRoll = moved ? Math.cos(cPhase) * 0.03 : Math.sin(timeSec * 0.35) * 0.015;
      syncHumanoidGlbBones(c.rig, { hipYaw: cHipYaw, hipRoll: cHipRoll });
      const compTalking = this.activeSpeech?.target === 'player' && idx === 0;
      applyMouthLipSync(
        c.rig.mouthPivot,
        c.rig.mouthCavity,
        compTalking ? computeLipOpenness(this.activeSpeech!.text, this.activeSpeech!.elapsed) * 0.45 : 0
      );
    }

    const profile = this.getCharacter();
    const isCrouching =
      !this.inputSuspended &&
      (this.downed || this.virtualCrouch || this.keys.has('KeyC') || this.keys.has('ControlLeft'));
    let forward = this.inputSuspended ? 0 : this.virtualForward;
    let right = this.inputSuspended ? 0 : this.virtualRight;
    if (!this.inputSuspended) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
      if (this.keys.has('KeyD')) right += 1;
      if (this.keys.has('KeyA')) right -= 1;
      // Kontrol Keyboard rotasi sudut pandang: ArrowLeft / ArrowRight memutar yaw mulus
      if (this.keys.has('ArrowLeft')) {
        this.yaw += 2.4 * dt;
      }
      if (this.keys.has('ArrowRight')) {
        this.yaw -= 2.4 * dt;
      }
    }
    forward = Math.max(-1, Math.min(1, forward));
    right = Math.max(-1, Math.min(1, right));

    const wantsMove =
      !this.inputSuspended &&
      !this.isHiding &&
      !this.isSpectator &&
      (Math.abs(forward) > 0.05 || Math.abs(right) > 0.05);

    // Saat berjalan/berlari dan berbelok kiri/kanan (A/D atau joystick) tanpa mouse override aktif:
    // Putar sudut pandang (yaw) secara simultan sehingga pandangan tidak pernah beku atau terkunci
    const mouseInactive = performance.now() - this.lastMouseMoveAt > 220;
    if (wantsMove && Math.abs(right) > 0.05 && mouseInactive && !this.keys.has('ArrowLeft') && !this.keys.has('ArrowRight')) {
      const steerSpeed = (this.virtualSprint || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 2.4 : 1.85) * (forward < -0.1 ? -1 : 1);
      this.yaw += -right * steerSpeed * dt;
    }

    // Edge panning fallback: jika pointer lock belum aktif dan kursor berada di tepi layar saat gameplay:
    if (document.pointerLockElement !== this.renderer.domElement && this.hasHoverPointer && !this.inputSuspended) {
      const margin = 55;
      if (this.lastPointerX <= margin) {
        const factor = (margin - this.lastPointerX) / margin;
        this.yaw += 2.6 * factor * dt;
      } else if (this.lastPointerX >= window.innerWidth - margin) {
        const factor = (this.lastPointerX - (window.innerWidth - margin)) / margin;
        this.yaw -= 2.6 * factor * dt;
      }
    }
    const wantsSprint =
      wantsMove &&
      !this.downed &&
      !isCrouching &&
      (this.virtualSprint || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));

    let isSprinting = false;
    if (wantsSprint && this.stamina > 1) {
      isSprinting = true;
      this.stamina = Math.max(0, this.stamina - 20 * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + 14 * dt);
    }

    // Gerak pemain dengan akselerasi/deselerasi mulus & tabrakan AABB dinding + pintu + tangga
    let actualMoved = false;
    let moveSpeed = 0;
    let targetVelX = 0;
    let targetVelZ = 0;
    if (wantsMove) {
      moveSpeed =
        (this.downed ? 1.05 : isCrouching ? 1.95 : isSprinting ? 5.85 : 3.6) * profile.speedMult;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      let mx = fx * forward + rx * right;
      let mz = fz * forward + rz * right;
      const len = Math.hypot(mx, mz);
      if (len > 1e-4) {
        mx /= len;
        mz /= len;
      }
      targetVelX = mx * moveSpeed;
      targetVelZ = mz * moveSpeed;
    }
    const accelRate = wantsMove ? 15 : 18;
    this.moveVelX = THREE.MathUtils.damp(this.moveVelX, targetVelX, accelRate, dt);
    this.moveVelZ = THREE.MathUtils.damp(this.moveVelZ, targetVelZ, accelRate, dt);
    const curSpeed = Math.hypot(this.moveVelX, this.moveVelZ);
    if (curSpeed > 0.04) {
      const nextX = THREE.MathUtils.clamp(this.playerPos.x + this.moveVelX * dt, -86, 86);
      const nextZ = THREE.MathUtils.clamp(this.playerPos.z + this.moveVelZ * dt, -30, 82);
      const resolved = resolveHorizontalCollision(
        { x: nextX, y: this.playerPos.y, z: nextZ },
        0.34,
        isCrouching ? 1.15 : 1.68,
        this.activeColliders
      );
      const newY = resolveGroundElevation(
        resolved.x,
        resolved.z,
        this.playerPos.y,
        STAIR_ZONES,
        FLOOR_HEIGHT,
        FLOOR_HEIGHT * 2
      );
      const steppedDist = Math.hypot(resolved.x - this.playerPos.x, resolved.z - this.playerPos.z);
      actualMoved = steppedDist > 0.001;
      this.playerPos = { x: resolved.x, y: newY, z: resolved.z };
      moveSpeed = curSpeed;

      if (actualMoved) {
        this.headBobPhase += steppedDist * (isSprinting ? 2.5 : isCrouching ? 3.2 : 2.8);
      }
    } else {
      this.moveVelX = 0;
      this.moveVelZ = 0;
    }

    // Story Beat 1: Menyusup masuk ke Rumah Gurita -> Pintu depan membanting tutup & Dimensi Gaib aktif
    if (
      !this.inDimensiGaib &&
      this.playerPos.z < HOUSE_FRONT_Z - 0.35 &&
      this.playerPos.x >= -15.4 &&
      this.playerPos.x <= 14.9
    ) {
      const entryDoor = this.doors.find((d) => d.id === 'door_main_entry');
      if (entryDoor && entryDoor.isOpen) {
        entryDoor.isOpen = false;
        entryDoor.targetAngle = entryDoor.closedAngle;
        this.rebuildActiveColliders();
      }
      this.audio.playDoorSlam();
      this.audio.playNpcVoice('rani', 0);
      this.cameraTrauma = 0.55;
      this.activateDimensiGaibAtmosphere();
      if (this.isMultiplayer) {
        this.callbacks.onCoopAction?.({ type: 'dimensi_enter' });
      }
      this.callbacks.onToast(STORY_BEATS.enterDimensiGaib, 'warn');
    }

    // Story Beat 2 & 3: Lantai 2 & Rooftop
    if (!this.triggeredSecondBeat && this.playerPos.y >= FLOOR_HEIGHT - 0.45) {
      this.triggeredSecondBeat = true;
      this.audio.playGhostVocal('kuntilanak', 0.7);
      this.callbacks.onToast(STORY_BEATS.enterSecondFloor, 'info');
    }
    if (!this.triggeredRooftopBeat && this.playerPos.y >= FLOOR_HEIGHT * 2 - 0.45) {
      this.triggeredRooftopBeat = true;
      this.audio.playNpcVoice('rani', 1);
      this.callbacks.onToast(STORY_BEATS.enterRooftop, 'warn');
    }

    // Konsumsi Baterai Independen: Senter vs Kamera UV
    const batStep = stepDualBatteries({
      flashlightBattery: this.flashlightBattery,
      uvBattery: this.uvBattery,
      flashlightOn: this.flashlightOn,
      uvMode: this.uvMode,
      drainMult: profile.batteryDrainMult,
      dt,
    });
    this.flashlightBattery = batStep.flashlightBattery;
    this.uvBattery = batStep.uvBattery;
    this.flashlightOn = batStep.flashlightOn;
    this.uvMode = batStep.uvMode;
    if (batStep.flashlightDepletedNow) {
      this.callbacks.onToast('Baterai Senter habis! Cari baterai senter cadangan.', 'warn');
    }
    if (batStep.uvDepletedNow) {
      this.callbacks.onToast('Baterai Kamera UV habis! Cari baterai UV cadangan.', 'warn');
    }

    // Kebisingan langkah
    const noiseLevel = !actualMoved
      ? 5
      : isCrouching
        ? Math.round(22 * profile.crouchNoiseMult)
        : isSprinting
          ? 92
          : 48;

    // Update AI Hantu (Authoritative di Solo / Host, atau interpolasi dari Host di Multiplayer non-host)
    const diffMult =
      this.difficulty === 'Santai' ? 0.78 : this.difficulty === 'Mimpi Buruk' ? 1.24 : 1.0;
    const segelBroken = countBrokenSegel(this.rumors);
    const weakFactor =
      computeGhostWeakeningFactor(segelBroken, this.rumors.length, profile) * diffMult;
    let nearestGhostDist = 999;
    let nearestGhostName: string | null = null;
    let nearestGhostKind: GhostKind | null = null;
    let totalSanityDrain = 0;

    const useRemoteGhosts =
      this.isMultiplayer && !this.isHostAuthority && this.remoteGhostTargets.size > 0;

    for (let i = 0; i < this.ghosts.length; i++) {
      let g = this.ghosts[i];
      if (useRemoteGhosts) {
        const synced = this.remoteGhostTargets.get(g.id);
        if (synced) {
          g.position.x = THREE.MathUtils.damp(g.position.x, synced.position.x, 12, dt);
          g.position.y = THREE.MathUtils.damp(g.position.y, synced.position.y, 12, dt);
          g.position.z = THREE.MathUtils.damp(g.position.z, synced.position.z, 12, dt);
          g.yaw = synced.yaw;
          g.state = synced.state;
          g.stunTimer = synced.stunTimer;
          g.alertTimer = synced.alertTimer;
        }
        const d = distance3D(g.position, this.playerPos);
        if (d < nearestGhostDist) {
          nearestGhostDist = d;
          nearestGhostName = g.name;
          nearestGhostKind = g.kind;
        }
        const activeSafe = isInSafeZone(this.playerPos, SAFE_ZONES);
        if (d < 6.5 && !activeSafe && !this.isSpectator && !this.downed) {
          totalSanityDrain += (1 - d / 6.5) * 4.5 * weakFactor;
        }
        if (
          d < 1.25 &&
          !activeSafe &&
          !this.isSpectator &&
          !this.downed &&
          !this.isHiding &&
          g.stunTimer <= 0 &&
          this.invulnTimer <= 0
        ) {
          this.ghostHits += 1;
          this.invulnTimer = 2.6;
          const dmgMult =
            this.difficulty === 'Santai' ? 0.7 : this.difficulty === 'Mimpi Buruk' ? 1.3 : 1.0;
          this.sanity = Math.max(0, this.sanity - 34 * profile.sanityResistMult * dmgMult);
          this.cameraTrauma = 1.0;
          this.audio.playJumpScare(g.kind);
          this.callbacks.onJumpscare({ kind: g.kind, name: g.name, timestamp: Date.now() });
          this.callbacks.onToast(
            `Diserang ${g.name}! Lari, sembunyi [E], atau tabur Garam [G]!`,
            'warn'
          );
        }
      } else {
        const res = stepGhostAI(
          g,
          this.playerPos,
          this.yaw,
          this.isHiding || this.isSpectator || this.downed,
          noiseLevel,
          this.flashlightOn,
          this.activeColliders,
          weakFactor,
          dt,
          SAFE_ZONES
        );
        g = res.ghost;
        this.ghosts[i] = g;
        totalSanityDrain += res.sanityDrainPerSec;

        const d = distance3D(g.position, this.playerPos);
        if (d < nearestGhostDist) {
          nearestGhostDist = d;
          nearestGhostName = g.name;
          nearestGhostKind = g.kind;
        }

        if (!this.isSpectator && !this.downed && res.caughtPlayer && this.invulnTimer <= 0) {
          this.ghostHits += 1;
          this.invulnTimer = 2.6;
          const dmgMult =
            this.difficulty === 'Santai' ? 0.7 : this.difficulty === 'Mimpi Buruk' ? 1.3 : 1.0;
          this.sanity = Math.max(0, this.sanity - 34 * profile.sanityResistMult * dmgMult);
          this.cameraTrauma = 1.0;
          this.audio.playJumpScare(g.kind);
          this.callbacks.onJumpscare({
            kind: g.kind,
            name: g.name,
            timestamp: Date.now(),
          });
          this.callbacks.onToast(
            `Diserang ${g.name}! Lari, sembunyi [E], atau tabur Garam [G]!`,
            'warn'
          );
        }
      }

      const rig = this.ghostRigs.get(g.id);
      if (rig) {
        this.animateGhosts(g, rig, dt, timeSec);
      }
    }

    // Update Sanity & Downed state
    const activeSafeZone = isInSafeZone(this.playerPos, SAFE_ZONES);
    if (this.isSpectator || this.downed) {
      if (this.isSpectator) this.sanity = 100;
    } else if (activeSafeZone) {
      this.sanity = Math.min(100, this.sanity + 2.5 * dt);
    } else if (this.inDimensiGaib) {
      const baseDrain = this.flashlightOn ? 0.25 : 0.75;
      this.sanity = Math.max(
        0,
        this.sanity - (baseDrain + totalSanityDrain) * profile.sanityResistMult * diffMult * dt
      );
    } else {
      this.sanity = Math.min(100, this.sanity + 3 * dt);
    }

    if (this.sanity <= 0 && !this.isSpectator && !this.downed) {
      const hasAliveTeammates =
        this.isMultiplayer &&
        Array.from(this.remoteRigs.values()).some((r) => r.role === 'player' && !r.downed);
      if (hasAliveTeammates) {
        this.downed = true;
        this.flashlightOn = false;
        this.uvMode = false;
        this.callbacks.onCoopAction?.({ type: 'player_downed' });
        this.callbacks.onToast(
          'Sanity habis! Kamu TUMBANG — tunggu rekan regu menekan [E] di dekatmu untuk menolong!',
          'warn'
        );
      } else {
        if (this.isMultiplayer) {
          this.downed = true;
          this.callbacks.onCoopAction?.({ type: 'player_downed' });
        }
        this.finishRun(true);
        return;
      }
    }

    // Update Audio Ambient + suara hantu khas saat mendekat
    this.audio.updateAmbience(
      dt,
      this.inDimensiGaib,
      this.sanity,
      nearestGhostDist,
      actualMoved,
      isSprinting,
      isCrouching,
      nearestGhostKind
    );

    // Deteksi langkah kaki pemain di atas genangan air -> riak gelombang shader + percikan tetes air 3D + SFX cipratan
    const curBobSin = Math.sin(this.headBobPhase);
    if (actualMoved && this.playerPos.y < 0.25 && this.streetPuddles) {
      const steppedNow =
        (this.lastHeadBobSin <= 0 && curBobSin > 0) ||
        (this.lastHeadBobSin >= 0 && curBobSin < 0);
      if (steppedNow) {
        const px = this.playerPos.x;
        const pz = this.playerPos.z;
        const hitPuddle = this.streetPuddles.puddles.find((p) => {
          const nx = (px - p.x) / p.rx;
          const nz = (pz - p.z) / p.rz;
          return nx * nx + nz * nz <= 1.15;
        });
        if (hitPuddle) {
          this.triggerPuddleSplash(px, hitPuddle.y, pz, timeSec, isSprinting);
        }
      }
    }
    this.lastHeadBobSin = curBobSin;

    // Visual Gerak Kiri/Kanan/Lari/Jongkok (Camera Roll + Bob + FOV Kick + Third-Person Rig Gait)
    const targetRoll = actualMoved ? -right * (isSprinting ? 0.045 : 0.024) : 0;
    this.cameraRoll = THREE.MathUtils.damp(this.cameraRoll, targetRoll, 11, dt);

    const baseFov = this.visualSettings.fov;
    const targetFov = isSprinting && actualMoved ? Math.min(96, baseFov + 7) : isCrouching ? Math.max(58, baseFov - 3) : baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.08) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 8, dt);
      this.camera.updateProjectionMatrix();
    }

    const targetEye = this.downed ? 0.85 : this.isHiding ? 1.15 : isCrouching ? 1.05 : 1.65;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEye, 12, dt);
    const bobAmp = isSprinting ? 0.055 : isCrouching ? 0.018 : 0.032;
    const bobY = actualMoved ? Math.sin(this.headBobPhase) * bobAmp : 0;
    const bobX = actualMoved ? Math.cos(this.headBobPhase * 0.5) * bobAmp * 0.55 : 0;

    const shake = this.cameraTrauma * this.cameraTrauma * 0.08;
    const shakeYaw = (Math.random() - 0.5) * shake;
    const shakePitch = (Math.random() - 0.5) * shake;
    _euler.set(this.pitch + shakePitch, this.yaw + shakeYaw, this.cameraRoll, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);

    if (this.isSpectator) {
      this.camera.position.set(2.5, 11.5, 22.0);
      this.camera.lookAt(0, 3.0, 2.0);
      this.playerRig.group.visible = false;
      if (this.closetInteriorLight) this.closetInteriorLight.visible = false;
    } else if (this.isHiding) {
      this.hideTransition = Math.min(1, this.hideTransition + dt * 4.2);
      if (this.hideEnterDoorTimer > 0) {
        this.hideEnterDoorTimer = Math.max(0, this.hideEnterDoorTimer - dt);
      }
      const closet =
        this.activeClosetIndex !== null ? this.closetRigs[this.activeClosetIndex] : null;
      const ease = 1 - Math.pow(1 - this.hideTransition, 3);
      if (closet) {
        // Duduk/membungkuk di bagian belakang dalam lemari (local z = -0.16) menghadap pintu krepyak (+Z lemari)
        const backX = closet.x - Math.sin(closet.ry) * 0.16;
        const backZ = closet.z - Math.cos(closet.ry) * 0.16;
        const breathe = Math.sin(timeSec * 1.6) * 0.008;
        const camX = THREE.MathUtils.lerp(this.hideOrigin.x, backX, ease);
        const camY = THREE.MathUtils.lerp(this.hideOrigin.y + 1.56, closet.y + 1.3 + breathe, ease);
        const camZ = THREE.MathUtils.lerp(this.hideOrigin.z, backZ, ease);
        this.camera.position.set(camX, camY, camZ);
        if (this.closetInteriorLight) {
          this.closetInteriorLight.visible = true;
          this.closetInteriorLight.position.set(camX, closet.y + 1.48, camZ);
        }
      } else {
        this.camera.position.set(
          this.playerPos.x,
          this.playerPos.y + this.currentEyeHeight,
          this.playerPos.z
        );
        if (this.closetInteriorLight) this.closetInteriorLight.visible = false;
      }
      this.playerRig.group.visible = false;
    } else if (this.perspective === 'first-person') {
      if (this.closetInteriorLight) this.closetInteriorLight.visible = false;
      const rightX = Math.cos(this.yaw);
      const rightZ = -Math.sin(this.yaw);
      this.camera.position.set(
        this.playerPos.x + rightX * bobX,
        this.playerPos.y + this.currentEyeHeight + bobY,
        this.playerPos.z + rightZ * bobX
      );
      this.playerRig.group.visible = false;
    } else {
      if (this.closetInteriorLight) this.closetInteriorLight.visible = false;
      this.playerRig.group.visible = true;
      this.playerRig.group.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);

      // Arah badan karakter menghadap gerakan maju/mundur/kiri/kanan mulus (shortest-angle tanpa putaran 360 mendadak!)
      // Sementara kamera tetap bebas memandang 360° ke kiri/kanan & atas/bawah!
      const desiredOffset =
        actualMoved && (Math.abs(right) > 0.05 || Math.abs(forward) > 0.05)
          ? Math.atan2(-right, forward)
          : 0;
      this.bodyVisualYawOffset = this.dampAngle(
        this.bodyVisualYawOffset,
        desiredOffset,
        11,
        dt
      );
      this.playerRig.group.rotation.y = this.yaw + Math.PI + this.bodyVisualYawOffset;

      const idleBreath = Math.sin(timeSec * 1.9) * 0.014;
      const stepLift = actualMoved ? Math.abs(Math.sin(this.headBobPhase)) * (isSprinting ? 0.052 : 0.028) : 0;
      this.playerRig.bodyRoot.position.y = (this.downed ? -0.34 : isCrouching ? -0.24 : 0) + stepLift + idleBreath;
      this.playerRig.bodyRoot.scale.y = this.downed ? 0.56 : 1.0;
      this.playerRig.bodyRoot.rotation.x = THREE.MathUtils.damp(
        this.playerRig.bodyRoot.rotation.x,
        actualMoved ? (isSprinting ? 0.14 : isCrouching ? 0.24 : 0.06) : isCrouching ? 0.18 : 0,
        10,
        dt
      );
      this.playerRig.bodyRoot.rotation.y = actualMoved ? Math.sin(this.headBobPhase) * 0.055 : 0;
      this.playerRig.bodyRoot.rotation.z = THREE.MathUtils.damp(
        this.playerRig.bodyRoot.rotation.z,
        actualMoved ? -right * 0.065 : 0,
        10,
        dt
      );

      // Kepala selalu menoleh mengikuti pandangan kamera (atas/bawah & kiri/kanan) dalam batas anatomis aman
      // Meniadakan leher terpotong, berbelit, atau robek saat strafe/berbalik arah
      const targetHeadPitch = THREE.MathUtils.clamp(-this.pitch * 0.45, -0.38, 0.38);
      const targetHeadYaw = THREE.MathUtils.clamp(-this.bodyVisualYawOffset * 0.2, -0.24, 0.24);
      this.playerRig.head.rotation.x = THREE.MathUtils.damp(
        this.playerRig.head.rotation.x,
        targetHeadPitch,
        14,
        dt
      );
      this.playerRig.head.rotation.y = this.dampAngle(
        this.playerRig.head.rotation.y,
        targetHeadYaw,
        12,
        dt
      );
      if (this.playerRig.neckJoint) {
        this.playerRig.neckJoint.rotation.x = this.playerRig.head.rotation.x * 0.35;
        this.playerRig.neckJoint.rotation.y = this.playerRig.head.rotation.y * 0.35;
      }

      // Animasi biomekanik ayunan tangan, tekukan lutut 2-fase, panggul & spine di Third-Person
      const phase = this.headBobPhase;
      const swingAmp = actualMoved ? (isSprinting ? 0.85 : isCrouching ? 0.38 : 0.58) : 0;
      const swing = Math.sin(phase) * swingAmp;
      const crouchHipOff = isCrouching && !this.downed ? -0.68 : 0;
      const crouchKneeOff = isCrouching && !this.downed ? 1.16 : 0;

      // Fleksi lutut dua fase anatomis: tekukan fase ayun (swing clearance) + peredam hentakan tumit (heel strike cushion)
      const lSwingKnee = Math.max(0, Math.sin(phase)) * (isSprinting ? 0.95 : 0.74);
      const lStanceKnee = Math.max(0, -Math.sin(phase)) * 0.22;
      const lKneeTarget = actualMoved ? 0.08 + lSwingKnee + lStanceKnee : 0.08;

      const rSwingKnee = Math.max(0, -Math.sin(phase)) * (isSprinting ? 0.95 : 0.74);
      const rStanceKnee = Math.max(0, Math.sin(phase)) * 0.22;
      const rKneeTarget = actualMoved ? 0.08 + rSwingKnee + rStanceKnee : 0.08;

      this.playerRig.leftLeg.rotation.x = THREE.MathUtils.damp(this.playerRig.leftLeg.rotation.x, crouchHipOff + swing, 14, dt);
      this.playerRig.rightLeg.rotation.x = THREE.MathUtils.damp(this.playerRig.rightLeg.rotation.x, crouchHipOff - swing, 14, dt);
      this.playerRig.leftKnee.rotation.x = THREE.MathUtils.damp(
        this.playerRig.leftKnee.rotation.x,
        crouchKneeOff + lKneeTarget,
        14,
        dt
      );
      this.playerRig.rightKnee.rotation.x = THREE.MathUtils.damp(
        this.playerRig.rightKnee.rotation.x,
        crouchKneeOff + rKneeTarget,
        14,
        dt
      );

      // Rotasi panggul dinamis (Pelvis Yaw & Roll) untuk membuang kesan mannequin/kaku kaku
      const hipYaw = actualMoved ? Math.sin(phase) * (isSprinting ? 0.085 : 0.06) : 0;
      const hipRoll = actualMoved ? Math.cos(phase) * (isSprinting ? 0.045 : 0.03) : Math.sin(timeSec * 0.35) * 0.015;

      const pitchArmOffset = THREE.MathUtils.clamp(-this.pitch * 0.06, -0.08, 0.08);
      const leftTargetArmX =
        this.uvMode || this.kujangClaimed || this.heldPropTimer > 0
          ? -0.42 + pitchArmOffset + swing * 0.14
          : actualMoved
            ? -swing * 0.72
            : idleBreath * 1.2;
      const rightTargetArmX = this.flashlightOn
        ? -0.38 + pitchArmOffset + swing * 0.12
        : actualMoved
          ? swing * 0.72
          : -idleBreath * 1.2;
      const leftElbowTargetX =
        this.uvMode || this.kujangClaimed || this.heldPropTimer > 0
          ? -0.68
          : actualMoved
            ? -0.24 - Math.max(0, -swing) * 0.48
            : -0.2;
      const rightElbowTargetX = this.flashlightOn
        ? -0.52 - swing * 0.08
        : actualMoved
          ? -0.24 - Math.max(0, swing) * 0.48
          : -0.2;
      this.playerRig.leftArm.rotation.x = THREE.MathUtils.damp(this.playerRig.leftArm.rotation.x, leftTargetArmX, 14, dt);
      this.playerRig.rightArm.rotation.x = THREE.MathUtils.damp(this.playerRig.rightArm.rotation.x, rightTargetArmX, 14, dt);
      this.playerRig.leftElbow.rotation.x = THREE.MathUtils.damp(this.playerRig.leftElbow.rotation.x, leftElbowTargetX, 14, dt);
      this.playerRig.rightElbow.rotation.x = THREE.MathUtils.damp(this.playerRig.rightElbow.rotation.x, rightElbowTargetX, 14, dt);
      this.playerRig.bodyRoot.scale.y = this.downed && !this.playerRig.glbBones ? 0.56 : 1.0;
      syncHumanoidGlbBones(this.playerRig, { isCrouching, isDowned: this.downed, hipYaw, hipRoll });

      const playerTalking = this.activeSpeech?.target === 'player';
      applyMouthLipSync(
        this.playerRig.mouthPivot,
        this.playerRig.mouthCavity,
        playerTalking ? computeLipOpenness(this.activeSpeech!.text, this.activeSpeech!.elapsed) : 0
      );

      if (this.playerRig.rightFlashlightLensMat) {
        this.playerRig.rightFlashlightLensMat.color.setHex(this.flashlightOn ? 0xfff3d4 : 0x26282a);
      }
      if (this.playerRig.leftUvCam) {
        this.playerRig.leftUvCam.visible = this.uvMode;
      }
      if (this.playerRig.leftKujang) {
        this.playerRig.leftKujang.visible = !this.uvMode && this.kujangClaimed;
      }

      const camOrb = this.computeThirdPersonCameraPos(
        this.playerPos.x,
        this.playerPos.y + this.currentEyeHeight + 0.14,
        this.playerPos.z,
        this.playerPos.y
      );
      this.camera.position.copy(camOrb);
    }

    // Damping inersia gerakan tangan First-Person saat menoleh kiri/kanan/atas/bawah
    this.handSwayX = THREE.MathUtils.damp(this.handSwayX, 0, 10, dt);
    this.handSwayY = THREE.MathUtils.damp(this.handSwayY, 0, 10, dt);

    // Visual Tangan & Barang Pegangan First-Person (Senter, Kamera UV, Kujang, Kunci, Garam, Baterai, Bukti)
    if (this.fpHandRig) {
      const showFpHands =
        this.perspective === 'first-person' && !this.isSpectator && !this.isHiding;
      this.fpHandRig.group.visible = showFpHands;
      if (!showFpHands) {
        this.fpHandRig.group.position.set(0, -999, 0);
      } else {
        this.fpHandRig.group.position.set(0, 0, 0);
        this.fpRightRaise = THREE.MathUtils.damp(this.fpRightRaise, this.flashlightOn ? 1 : 0.22, 10, dt);
        const showLeftProp = this.uvMode || this.kujangClaimed || this.heldPropTimer > 0;
        this.fpLeftRaise = THREE.MathUtils.damp(this.fpLeftRaise, showLeftProp ? 1 : 0, 11, dt);

        const moveAmp = actualMoved ? (isSprinting ? 0.02 : 0.011) : 0;
        const breath = Math.sin(timeSec * 1.9) * 0.004;
        const walkX = Math.cos(this.headBobPhase * 0.5) * moveAmp;
        const walkY = Math.abs(Math.sin(this.headBobPhase)) * moveAmp * 0.9;
        const sprintTilt = isSprinting && actualMoved ? -0.14 : 0;

        this.fpHandRig.rightArmPivot.position.set(
          0.22 + walkX * 0.75 + this.handSwayX,
          THREE.MathUtils.lerp(-0.34, -0.21, this.fpRightRaise) - walkY + breath + this.handSwayY,
          THREE.MathUtils.lerp(-0.3, -0.36, this.fpRightRaise)
        );
        this.fpHandRig.rightArmPivot.rotation.set(
          THREE.MathUtils.lerp(-0.36, 0.04, this.fpRightRaise) + this.pitch * 0.08 + sprintTilt + this.handSwayY * 0.6,
          -0.06 + this.handSwayX * 0.8,
          0.03 - this.handSwayX * 0.45
        );
        this.fpHandRig.flashlightLensMat.color.setHex(this.flashlightOn ? 0xfff3d4 : 0x222528);
        this.fpHandRig.flashlightSwitchMat.color.setHex(this.flashlightOn ? 0x4ae67a : 0xd93829);

        this.fpHandRig.leftArmPivot.visible = this.fpLeftRaise > 0.04;
        this.fpHandRig.leftArmPivot.position.set(
          -0.22 - walkX * 0.75 + this.handSwayX,
          THREE.MathUtils.lerp(-0.46, -0.22, this.fpLeftRaise) - walkY - breath + this.handSwayY,
          -0.36
        );
        this.fpHandRig.leftArmPivot.rotation.set(
          THREE.MathUtils.lerp(-0.55, 0.06, this.fpLeftRaise) + sprintTilt + this.handSwayY * 0.6,
          0.1 + this.handSwayX * 0.8,
          -0.04 - this.handSwayX * 0.45
        );

        const activeLeftKind =
          this.heldPropTimer > 0
            ? this.heldPropKind
            : this.uvMode
              ? 'uv'
              : this.kujangClaimed
                ? 'kujang'
                : 'none';
        this.fpHandRig.uvGroup.visible = activeLeftKind === 'uv';
        this.fpHandRig.kujangGroup.visible = activeLeftKind === 'kujang';
        this.fpHandRig.keyGroup.visible = activeLeftKind === 'key';
        this.fpHandRig.saltGroup.visible = activeLeftKind === 'salt';
        this.fpHandRig.batteryGroup.visible = activeLeftKind === 'battery';
        this.fpHandRig.evidenceGroup.visible = activeLeftKind === 'evidence';
        this.fpHandRig.uvLedMat.color.setHex(Math.sin(timeSec * 5) > 0 ? 0xff2b2b : 0x4f1111);
      }
    }

    // Animasi buka-tutup daun pintu lemari persembunyian
    for (let ci = 0; ci < this.closetRigs.length; ci++) {
      const c = this.closetRigs[ci];
      if (c.autoCloseTimer > 0) {
        c.autoCloseTimer = Math.max(0, c.autoCloseTimer - dt);
      }
      let targetOpen = 0;
      if (this.isHiding && this.activeClosetIndex === ci) {
        targetOpen = this.hideEnterDoorTimer > 0 ? 0.72 : 0.045;
      } else if (c.autoCloseTimer > 0) {
        targetOpen = 0.78;
      }
      c.openAmount = THREE.MathUtils.damp(c.openAmount, targetOpen, 9, dt);
      const doorAngle = c.openAmount * 1.42;
      c.leftDoor.rotation.y = -doorAngle;
      c.rightDoor.rotation.y = doorAngle;
    }

    // Senter & UV dengan offset tangan kanan, inersia arah halus, & kedipan saat baterai tipis / hantu dekat
    this.updateFlashlightTransform(dt, timeSec, nearestGhostDist, this.uvMode);
    this.updateLightingAndAtmosphere(dt, timeSec, nearestGhostDist);

    this.hudEmitTimer += dt;
    if (this.hudEmitTimer >= 0.1) {
      this.hudEmitTimer = 0;
      this.emitHud(noiseLevel, nearestGhostDist, nearestGhostName);
    }
  }

  private updateFlashlightTransform(
    dt: number,
    timeSec: number,
    nearestGhostDist: number,
    uvActive: boolean
  ): void {
    // Arah kamera & vektor kanan/atas untuk target bidikan crosshair
    _v2.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    _v3.set(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize();
    _v4.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();

    const dampAlpha = 1 - Math.exp(-16 * Math.min(dt, 0.1));
    this.flashlightAimDir.lerp(_v2, dampAlpha).normalize();

    // Titik cahaya berasal langsung dari UJUNG MONCONG SENTER 3D (First-Person maupun Third-Person), bukan dari tengah tangan/kamera!
    this.camera.updateMatrixWorld(true);
    if (
      this.perspective === 'first-person' &&
      this.fpHandRig &&
      this.fpHandRig.group.visible
    ) {
      this.fpHandRig.flashlightTipAnchor.updateWorldMatrix(true, false);
      this.fpHandRig.flashlightTipAnchor.getWorldPosition(this.flashlightOrigin);
    } else if (
      this.perspective === 'third-person' &&
      this.playerRig?.group.visible &&
      this.playerRig.rightFlashlightTipAnchor
    ) {
      this.playerRig.rightFlashlightTipAnchor.updateWorldMatrix(true, false);
      this.playerRig.rightFlashlightTipAnchor.getWorldPosition(this.flashlightOrigin);
    } else if (this.isHiding) {
      this.flashlightOrigin
        .copy(this.camera.position)
        .addScaledVector(_v3, 0.04)
        .addScaledVector(_v4, -0.07)
        .addScaledVector(_v2, 0.14);
    } else {
      const speedMag = Math.hypot(this.moveVelX, this.moveVelZ);
      const walkAmp = Math.min(1, speedMag / 3.2);
      const swayX = Math.sin(timeSec * 1.9) * 0.008 + Math.cos(this.headBobPhase * 0.5) * 0.018 * walkAmp + this.handSwayX * 0.55;
      const swayY = Math.cos(timeSec * 2.4) * 0.006 - Math.abs(Math.sin(this.headBobPhase)) * 0.016 * walkAmp + this.handSwayY * 0.55;
      this.flashlightOrigin
        .copy(this.camera.position)
        .addScaledVector(_v3, 0.23 + swayX)
        .addScaledVector(_v4, -0.2 + swayY)
        .addScaledVector(_v2, 0.56);
    }

    const lowBatFactor = this.flashlightBattery < 18 ? (18 - this.flashlightBattery) / 18 : 0;
    const ghostFactor = nearestGhostDist < 9.5 ? (9.5 - nearestGhostDist) / 9.5 : 0;
    const glitchWave =
      Math.sin(timeSec * 27.3) * 0.45 + Math.sin(timeSec * 41.7) * 0.35 + Math.cos(timeSec * 13.1) * 0.2;
    const flickerMul =
      lowBatFactor > 0 || ghostFactor > 0.25
        ? glitchWave < -0.58 - (1 - Math.max(lowBatFactor, ghostFactor)) * 0.35
          ? 0.22
          : 0.85 + glitchWave * 0.15
        : 1.0 + Math.sin(timeSec * 3.1) * 0.018;

    this.flashlight.visible = this.flashlightOn;
    this.flashlightSpill.visible = this.flashlightOn;
    this.uvLight.visible = uvActive;

    this.flashlight.intensity = 11.8 * flickerMul;
    this.flashlightSpill.intensity = 2.9 * flickerMul;

    // Target bidik tetap konvergen mulus ke arah pandangan kamera sejauh 14m di depan
    this.flashlightTarget.position.copy(this.camera.position).addScaledVector(this.flashlightAimDir, 14.0);
    _v1.copy(this.flashlightTarget.position).sub(this.flashlightOrigin).normalize();

    // Posisikan sumber SpotLight 24cm strictly AHEAD dari ujung lensa senter agar tangan/pergelangan bebas silau oranye!
    this.flashlight.position.copy(this.flashlightOrigin).addScaledVector(_v1, 0.24);
    this.flashlightSpill.position.copy(this.flashlightOrigin).addScaledVector(_v1, 0.24);

    if (
      uvActive &&
      this.perspective === 'first-person' &&
      this.fpHandRig &&
      this.fpHandRig.group.visible
    ) {
      this.fpHandRig.uvTipAnchor.updateWorldMatrix(true, false);
      this.fpHandRig.uvTipAnchor.getWorldPosition(_v3);
      this.uvLight.position.copy(_v3).addScaledVector(_v1, 0.22);
    } else {
      this.uvLight.position.copy(this.flashlightOrigin).addScaledVector(_v1, 0.24);
    }

    if (this.flashlightBeamCone) {
      this.flashlightBeamCone.visible = this.flashlightOn && !this.isSpectator;
      if (this.flashlightBeamCone.visible) {
        this.flashlightBeamCone.position.copy(this.flashlightOrigin).addScaledVector(_v1, 3.82);
        _v3.set(0, 1, 0);
        _v4.copy(_v1).negate();
        this.flashlightBeamCone.quaternion.setFromUnitVectors(_v3, _v4);
        const beamMat = this.flashlightBeamCone.material as THREE.ShaderMaterial;
        if (beamMat.uniforms?.uColor) {
          beamMat.uniforms.uColor.value.setHex(uvActive ? 0x9c6dff : 0xfff1d6);
          beamMat.uniforms.uOpacity.value = (uvActive ? 0.04 : 0.028) * flickerMul;
        }
      }
    }
  }

  private triggerPuddleSplash(
    x: number,
    y: number,
    z: number,
    timeSec: number,
    isSprinting: boolean
  ): void {
    this.audio.playWaterSplash(isSprinting);
    if (!this.streetPuddles) return;

    const uSplashes = this.streetPuddles.shaderMat?.uniforms?.uSplashes;
    if (uSplashes && Array.isArray(uSplashes.value)) {
      const slot = this.puddleSplashSlot % 4;
      this.puddleSplashSlot++;
      (uSplashes.value[slot] as THREE.Vector4).set(x, z, timeSec, isSprinting ? 1.0 : 0.72);
    }

    // Pancarkan 6 percikan tetes air 3D dari kaki pemain
    let spawned = 0;
    const count = isSprinting ? 7 : 5;
    for (const drop of this.streetPuddles.splashDrops) {
      if (drop.mesh.visible) continue;
      const ang = (spawned / count) * Math.PI * 2 + Math.random() * 0.6;
      const spd = (isSprinting ? 1.5 : 0.95) * (0.65 + Math.random() * 0.6);
      drop.vx = Math.cos(ang) * spd;
      drop.vz = Math.sin(ang) * spd;
      drop.vy = (isSprinting ? 1.85 : 1.25) + Math.random() * 0.65;
      drop.age = 0;
      drop.maxAge = 0.34 + Math.random() * 0.14;
      drop.mesh.position.set(x + Math.cos(ang) * 0.08, y + 0.04, z + Math.sin(ang) * 0.08);
      drop.mesh.scale.setScalar(1);
      drop.mesh.visible = true;
      spawned++;
      if (spawned >= count) break;
    }
  }

  private updateLightingAndAtmosphere(dt: number, timeSec: number, nearestGhostDist: number): void {
    const isInsideHouse =
      this.phase !== 'title' &&
      this.playerPos.x >= -15.6 &&
      this.playerPos.x <= 15.1 &&
      this.playerPos.z <= HOUSE_FRONT_Z + 0.05 &&
      this.playerPos.z >= -9.6 &&
      this.playerPos.y < FLOOR_HEIGHT * 2 - 0.35;

    this.indoorBlend = THREE.MathUtils.damp(this.indoorBlend, isInsideHouse ? 1 : 0, 5.5, dt);

    // Pindahkan fokus frustum bayangan bulan mengikuti posisi pemain (snapped 0.25m halus tanpa lompat kasar)
    const snapX = Math.round(this.playerPos.x * 4) * 0.25;
    const snapZ = Math.round(this.playerPos.z * 4) * 0.25;
    this.dirLight.target.position.set(snapX, 0, snapZ);
    this.dirLight.position.set(snapX + 18, 30, snapZ + 24);
    this.dirLight.target.updateMatrixWorld();

    if (!this.endingCutscene) {
      this.hemiLight.intensity = THREE.MathUtils.lerp(
        this.isSoftwareGl ? 0.54 : 0.36,
        this.isSoftwareGl ? 0.14 : 0.048,
        this.indoorBlend
      );
      this.scene.environmentIntensity = THREE.MathUtils.lerp(0.32, 0.03, this.indoorBlend);
      this.dirLight.intensity = THREE.MathUtils.lerp(1.04, 0.15, this.indoorBlend);
      this.renderer.toneMappingExposure =
        THREE.MathUtils.lerp(1.06, this.inDimensiGaib ? 0.86 : 0.94, this.indoorBlend) *
        this.visualSettings.brightness;

      const fog = this.scene.fog as THREE.FogExp2;
      const targetFogDensity = this.inDimensiGaib
        ? THREE.MathUtils.lerp(0.034, 0.062, this.indoorBlend)
        : THREE.MathUtils.lerp(0.017, 0.043, this.indoorBlend);
      fog.density = THREE.MathUtils.damp(fog.density, targetFogDensity, 4.5, dt);
      const targetFogHex = this.indoorBlend > 0.5 || this.inDimensiGaib ? 0x030406 : 0x060a0e;
      _fogColorTarget.setHex(targetFogHex);
      fog.color.lerp(_fogColorTarget, Math.min(1, dt * 3));
      if (this.scene.background instanceof THREE.Color) {
        this.scene.background.copy(fog.color);
      }
    }

    // Pool 6 lampu jalan natrium-hangat dinamis menerangi 6 tiang lampu terdekat dari posisi kamera
    const camX = this.camera.position.x;
    const camZ = this.camera.position.z;
    const outdoorWeight = 1 - this.indoorBlend * 0.65;
    const bestIdx = [-1, -1, -1, -1, -1, -1];
    const bestDistSq = [Infinity, Infinity, Infinity, Infinity, Infinity, Infinity];
    for (let i = 0; i < this.streetLampBulbs.length; i++) {
      const b = this.streetLampBulbs[i];
      const dx = b.x - camX;
      const dz = b.z - camZ;
      const d2 = dx * dx + dz * dz;
      for (let slot = 0; slot < this.streetLampPool.length; slot++) {
        if (d2 < bestDistSq[slot]) {
          for (let shift = this.streetLampPool.length - 1; shift > slot; shift--) {
            bestDistSq[shift] = bestDistSq[shift - 1];
            bestIdx[shift] = bestIdx[shift - 1];
          }
          bestDistSq[slot] = d2;
          bestIdx[slot] = i;
          break;
        }
      }
    }
    for (let slot = 0; slot < this.streetLampPool.length; slot++) {
      const p = this.streetLampPool[slot];
      const idx = bestIdx[slot];
      if (idx < 0) {
        p.intensity = 0;
        continue;
      }
      const b = this.streetLampBulbs[idx];
      const dist = Math.sqrt(bestDistSq[slot]);
      const fade = THREE.MathUtils.clamp(1 - (dist - 16) / 14, 0, 1);
      const hum = 0.94 + Math.sin(timeSec * 14.3 + b.seed) * 0.04 + Math.sin(timeSec * 3.7 + b.seed * 2) * 0.02;
      const rareDip = Math.sin(timeSec * 2.3 + b.seed * 5.1) > 0.985 ? 0.45 : 1.0;
      p.position.set(b.x, b.y, b.z);
      p.intensity = 6.8 * fade * outdoorWeight * hum * rareDip;
    }

    // Kedipan filamen organik bohlam horor di dalam Rumah Gurita (tidak kaku maupun seragam)
    const ghostNearFactor = nearestGhostDist < 10 ? 1 - nearestGhostDist / 10 : 0;
    for (const b of this.interiorBulbs) {
      const wave =
        Math.sin(timeSec * 3.7 + b.seed) * 0.4 +
        Math.sin(timeSec * 11.3 + b.seed * 2.1) * 0.35 +
        Math.cos(timeSec * 29.1 + b.seed * 3.7) * 0.25;
      const dip = THREE.MathUtils.smoothstep(wave, -0.88 - (1 - ghostNearFactor) * 0.12, -0.52);
      const flicker = (0.76 + wave * 0.24) * (0.14 + 0.86 * dip) * (1 - ghostNearFactor * 0.42);
      b.light.intensity = b.baseIntensity * Math.max(0.06, flicker);
    }

    // Kedipan hangat lembut lentera gerbang
    this.gateLanternLights.forEach((l, idx) => {
      l.intensity = 4.2 + Math.sin(timeSec * 6.4 + idx * 2.1) * 0.32 + Math.sin(timeSec * 13.7 + idx) * 0.14;
    });

    // Update shader post-processing horor sinematik
    if (this.horrorPass) {
      const u = this.horrorPass.uniforms;
      u.uTime.value = timeSec;
      const lowSanity = Math.max(0, 1 - this.sanity / 100);
      u.uVignette.value = 0.34 + this.indoorBlend * 0.18 + lowSanity * 0.28;
      u.uAberration.value =
        0.0007 + (this.inDimensiGaib ? 0.0011 : 0) + lowSanity * 0.0032 + this.cameraTrauma * 0.004;
      u.uHorrorMix.value = this.inDimensiGaib ? 0.36 : this.indoorBlend * 0.18 + lowSanity * 0.25;
    }
  }

  private updateIntroCarCutscene(dt: number): void {
    const ic = this.introCutscene;
    if (!ic) return;
    ic.timer += dt;
    const t = ic.timer;
    const car = this.arrivalCar;

    // Animasi wiper kaca depan, tasbih spion, & kemudi halus selama perjalanan
    const wiperSweep = Math.sin(t * 2.1) * 0.52 + 0.52;
    car.wiperPivotL.rotation.z = wiperSweep;
    car.wiperPivotR.rotation.z = wiperSweep;
    car.tasbihPivot.rotation.z = Math.sin(t * 2.6) * 0.14;

    if (t < 38.0) {
      ic.stage = 'arriving';
      const u = Math.min(1, t / 38.0);
      // 8 detik pertama berjalan pelan sambil mengobrol akrab dengan Pa Nanang, lalu melaju menuju Warung Ceu Titin
      const driveU = THREE.MathUtils.clamp((t - 4.0) / 34.0, 0, 1);
      const ease = 1 - Math.pow(1 - driveU, 2.0);
      const carZ = THREE.MathUtils.lerp(80.0, 53.2, ease);
      const carX = THREE.MathUtils.lerp(-0.95, -1.45, THREE.MathUtils.smoothstep(u, 0.78, 1.0));
      const speedNorm = driveU > 0 ? 1.85 * Math.pow(1 - driveU, 1.1) + 0.15 : 0.25;

      car.group.position.set(carX, Math.sin(t * 14) * 0.004 * speedNorm, carZ);
      car.group.rotation.y = u > 0.78 && u < 0.98 ? Math.sin(((u - 0.78) / 0.2) * Math.PI) * 0.045 : 0;
      car.steeringWheelPivot.rotation.z = Math.sin(t * 0.9) * 0.12 + (u > 0.78 ? 0.22 : 0);
      for (const w of car.wheels) {
        w.rotation.x -= speedNorm * dt * 2.1;
      }

      // Cari segmen dialog aktif antara pemain & Pa Nanang beserta suara & lip-sync (tunggu selesai bicara agar tidak terpotong)
      let activeIdx = INTRO_CAR_DIALOGUES.findIndex((b) => t >= b.startSec && t < b.endSec);
      if (activeIdx < 0) activeIdx = INTRO_CAR_DIALOGUES.length - 1;
      const beat = INTRO_CAR_DIALOGUES[activeIdx];
      if (activeIdx !== ic.lastDialogueIdx && !this.audio.isSpeaking()) {
        ic.lastDialogueIdx = activeIdx;
        const isDriverSpeaking = beat.speaker.includes('PA NANANG');
        const targetKey = isDriverSpeaking ? 'pa_nanang' : 'player';
        this.activeSpeech = {
          target: targetKey,
          text: beat.line,
          elapsed: 0,
          duration: Math.max(2.0, beat.endSec - beat.startSec + 1.5),
        };
        this.audio.speakIndonesian(
          beat.line,
          isDriverSpeaking ? 'pa_nanang' : this.characterId,
          () => {
            if (this.activeSpeech?.target === targetKey) {
              this.activeSpeech = null;
            }
          }
        );
        if (activeIdx === 5) {
          this.audio.playCarEnginePhase('arrive');
        }
        this.emitHud();
      }

      // Lampu kabin menyala redup hangat sehingga Pa Nanang & gerak mulutnya terlihat jelas
      car.interiorLight.intensity = 1.25;
      car.driverHead.rotation.y = THREE.MathUtils.damp(car.driverHead.rotation.y, beat.driverHeadYaw, 4.5, dt);
      car.driverHead.rotation.x = Math.sin(t * 3.4) * 0.045;
      const driverOpen =
        this.activeSpeech?.target === 'pa_nanang'
          ? computeLipOpenness(this.activeSpeech.text, this.activeSpeech.elapsed)
          : 0;
      applyMouthLipSync(car.driverMouthPivot, car.driverMouthCavity, driverOpen, -1);

      const camX = carX - 0.36;
      const camY = 1.19 + Math.sin(t * 12) * 0.004 * speedNorm;
      const camZ = carZ + 0.24;
      this.yaw = THREE.MathUtils.damp(this.yaw, beat.lookYaw, 3.0, dt);
      this.pitch = THREE.MathUtils.damp(this.pitch, beat.lookPitch, 3.0, dt);
      this.camera.position.set(camX, camY, camZ);
      _euler.set(this.pitch, this.yaw, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(_euler);

      // Rekan AI ikut duduk di bangku belakang mobil Pa Nanang (tidak spawn lebih dulu di warung!)
      this.seatAiCompanionsInCar(carX, car.group.position.y, carZ, car.group.rotation.y);
      // Pemain lain di Multiplayer yang masih di titik spawn juga ikut tampil duduk di kabin belakang mobil saat perjalanan
      let mpIdx = 0;
      for (const entry of this.remoteRigs.values()) {
        if (entry.role !== 'player') continue;
        const nearStart = Math.hypot(entry.targetPos.x - PLAYER_SPAWN.x, entry.targetPos.z - PLAYER_SPAWN.z) < 4.5;
        if (nearStart) {
          const sx = carX + ((mpIdx % 3) - 1) * 0.38;
          entry.rig.group.position.set(sx, car.group.position.y + 0.08, carZ + 0.88);
          entry.rig.group.rotation.y = car.group.rotation.y + Math.PI;
          entry.rig.bodyRoot.position.y = -0.32;
          entry.rig.leftLeg.rotation.x = -Math.PI * 0.44;
          entry.rig.rightLeg.rotation.x = -Math.PI * 0.44;
          syncHumanoidGlbBones(entry.rig, { isSeated: true });
        }
        mpIdx++;
      }
    } else if (t < 40.6) {
      ic.stage = 'exiting';
      if (!ic.doorOpened) {
        ic.doorOpened = true;
        this.audio.playCarDoor(true);
        car.interiorLight.intensity = 1.75;
        this.emitHud();
      }
      car.group.position.set(-1.45, 0, 53.2);
      car.group.rotation.y = 0;
      car.driverHead.rotation.y = THREE.MathUtils.damp(car.driverHead.rotation.y, 1.05, 5, dt);
      const u = (t - 38.0) / 2.6;

      // Rekan AI keluar dari mobil satu per satu setelah pintu terbuka
      if (u < 0.35) {
        this.seatAiCompanionsInCar(-1.45, 0, 53.2, 0);
      } else {
        const exitU = THREE.MathUtils.clamp((u - 0.35) / 0.6, 0, 1);
        this.aiCompanions.forEach((c, idx) => {
          const target = computeCompanionFollowTarget(
            PLAYER_SPAWN,
            PLAYER_SPAWN_YAW,
            idx,
            this.aiCompanions.length
          );
          const safe = resolveHorizontalCollision(
            { x: target.x, y: 0, z: target.z },
            0.32,
            1.68,
            this.activeColliders
          );
          const startX = -1.45 - 0.48;
          const startZ = 53.2 + 0.55;
          c.pos = {
            x: THREE.MathUtils.lerp(startX, safe.x, exitU),
            y: 0,
            z: THREE.MathUtils.lerp(startZ, safe.z, exitU),
          };
          c.yaw = Math.atan2(safe.x - startX, safe.z - startZ);
          c.rig.group.position.set(c.pos.x, 0, c.pos.z);
          c.rig.group.rotation.y = c.yaw;
          c.rig.bodyRoot.position.y = 0;
          const stepSwing = exitU < 0.98 ? Math.sin(exitU * Math.PI * 5 + idx) * 0.45 : 0;
          c.rig.leftLeg.rotation.x = stepSwing;
          c.rig.rightLeg.rotation.x = -stepSwing;
        });
      }
      if (u < 0.72) {
        const doorOpenT = Math.min(1, u / 0.32);
        car.doorPivot.rotation.y = -1.14 * (1 - Math.pow(1 - doorOpenT, 2));
      } else {
        const doorCloseT = Math.min(1, (u - 0.72) / 0.22);
        car.doorPivot.rotation.y = -1.14 * (1 - doorCloseT);
        if (doorCloseT >= 0.95 && !ic.doorClosed) {
          ic.doorClosed = true;
          this.audio.playCarDoor(false);
          car.interiorLight.intensity = 0;
        }
      }

      if (u > 0.45 && !this.flashlightOn) {
        this.flashlightOn = true;
      }

      const stepU = THREE.MathUtils.clamp((u - 0.16) / 0.58, 0, 1);
      const smoothStep = stepU * stepU * (3 - 2 * stepU);
      const bobExit = Math.sin(smoothStep * Math.PI * 2) * 0.04;
      const cx = THREE.MathUtils.lerp(-1.81, PLAYER_SPAWN.x, smoothStep);
      const cy = THREE.MathUtils.lerp(1.19, 1.65, smoothStep) + bobExit;
      const cz = THREE.MathUtils.lerp(53.44, PLAYER_SPAWN.z, smoothStep);
      this.camera.position.set(cx, cy, cz);

      const targetYaw = u < 0.7 ? THREE.MathUtils.lerp(0.36, 0.42, smoothStep) : THREE.MathUtils.lerp(0.42, -0.52, (u - 0.7) / 0.3);
      this.yaw = targetYaw;
      this.pitch = 0.02;
      _euler.set(this.pitch, this.yaw, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(_euler);
      this.playerPos = { ...PLAYER_SPAWN };
    } else if (t < 51.0) {
      ic.stage = 'departing';
      if (!ic.departAudioPlayed) {
        ic.departAudioPlayed = true;
        this.audio.playCarEnginePhase('depart');
        car.taillightMat.color.setHex(0xff3b2f);
        this.emitHud();
      }

      const dSec = t - 40.6;
      if (dSec < 3.4) {
        const u = dSec / 3.4;
        const accel = u * u * 0.65 + u * 0.35;
        const cx = THREE.MathUtils.lerp(-1.45, 1.15, Math.min(1, u * 2.2));
        const cz = THREE.MathUtils.lerp(53.2, 22.5, accel);
        const steer = u < 0.4 ? -0.18 * Math.sin((u / 0.4) * Math.PI) : 0;
        car.group.position.set(cx, 0, cz);
        car.group.rotation.y = steer;
      } else {
        const u2 = (dSec - 3.4) / 7.0;
        const turnU = Math.min(1, u2 * 3.8);
        car.group.rotation.y = THREE.MathUtils.lerp(0, -Math.PI / 2, turnU);
        const cx = THREE.MathUtils.lerp(1.15, 96, u2);
        const cz = THREE.MathUtils.lerp(22.5, 22.0, turnU);
        car.group.position.set(cx, 0, cz);
      }
      for (const w of car.wheels) {
        w.rotation.x -= dt * 11.5;
      }

      if (dSec < 1.45) {
        this.camera.position.set(PLAYER_SPAWN.x, 1.65, PLAYER_SPAWN.z);
        this.camera.lookAt(car.group.position.x, 0.9, car.group.position.z);
        _euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.yaw = _euler.y;
        this.pitch = _euler.x;
      } else if (!ic.controlReleased) {
        ic.controlReleased = true;
        this.emitHud();
      }
    } else {
      car.group.visible = false;
      this.audio.stopCarAudio();
      this.introCutscene = null;
      return;
    }

    // Perbarui audio mesin mobil nyata (/assets/audio/car_engine.mp3):
    // Hangat di dalam kabin -> terbuka saat pintu keluar -> semakin mengecil, teredam,
    // bergeser panning stereo, dan hilang senyap saat mobil menjauh menembus kabut Jalan Sukajadi.
    const camRx = Math.cos(this.yaw);
    const camRz = -Math.sin(this.yaw);
    const toCarX = car.group.position.x - this.camera.position.x;
    const toCarZ = car.group.position.z - this.camera.position.z;
    const carDist = Math.hypot(toCarX, toCarZ);
    const pan = carDist > 0.25 ? (toCarX * camRx + toCarZ * camRz) / carDist : 0;
    const doorOpenVisual = Math.abs(car.doorPivot.rotation.y) > 0.15;
    const departingSpeed =
      ic.stage === 'arriving'
        ? Math.max(0.25, 1.0 - t / 38.0)
        : ic.stage === 'exiting'
          ? 0.08
          : 1.05;
    this.audio.updateCarAudio({
      active: car.group.visible && t < 50.8,
      distMeters: ic.stage === 'arriving' ? 0 : carDist,
      pan,
      inCabin: ic.stage === 'arriving',
      doorOpen: doorOpenVisual,
      speedNorm: departingSpeed,
      speaking: this.audio.isSpeaking(),
      timeSec: t,
    });
  }

  private updateEndingCutscene(dt: number, timeSec: number): void {
    const ec = this.endingCutscene;
    if (!ec) return;
    ec.timer += dt;
    const p = Math.min(1, ec.timer / ec.duration);
    const fog = this.scene.fog as THREE.FogExp2;

    if (ec.ending === 'true') {
      // TRUE ENDING: Kujang memancarkan cahaya emas fajar, kabut Dimensi Gaib sirna, mata gurita padam, fajar Bandung menyingsing
      const angle = p * 1.45 + 0.4;
      const dist = THREE.MathUtils.lerp(3.8, 12.5, p);
      this.camera.position.set(
        9.6 - Math.cos(angle) * dist,
        FLOOR_HEIGHT * 2 + THREE.MathUtils.lerp(1.8, 4.8, p),
        0.8 + Math.sin(angle) * dist
      );
      this.camera.lookAt(8.5, FLOOR_HEIGHT * 2 + 1.3, 0.9);

      // Tampilkan karakter pemain (termasuk Raka GLB) & rekan di atap menatap Kujang fajar secara dinamis
      this.playerRig.group.visible = true;
      this.playerRig.group.position.set(7.85, FLOOR_HEIGHT * 2, 1.55);
      this.playerRig.group.rotation.y = Math.atan2(9.6 - 7.85, 0.8 - 1.55);
      this.playerRig.bodyRoot.position.y = Math.sin(timeSec * 2.2) * 0.015;
      this.playerRig.bodyRoot.rotation.z = Math.sin(timeSec * 1.2) * 0.025;
      this.playerRig.head.rotation.y = Math.sin(timeSec * 1.1) * 0.1;
      this.playerRig.leftArm.rotation.x = Math.sin(timeSec * 1.4) * 0.06;
      this.playerRig.rightArm.rotation.x = -0.38;
      this.playerRig.rightElbow.rotation.x = -0.6;
      syncHumanoidGlbBones(this.playerRig, {});

      if (this.kujangGroup) {
        this.kujangGroup.visible = true;
        this.kujangGroup.position.y = 1.5 + p * 1.4;
        this.kujangGroup.rotation.y = timeSec * 2.8;
        this.kujangGroup.scale.setScalar(1 + p * 0.45);
      }
      this.endingLight.color.setHex(0xffd280);
      this.endingLight.position.set(9.6, FLOOR_HEIGHT * 2 + 2.2, 0.8);
      this.endingLight.intensity = 6 + Math.sin(p * Math.PI) * 18;

      this.dirLight.color.setHex(0xffe1b0);
      this.dirLight.intensity = THREE.MathUtils.lerp(0.7, 1.55, p);
      this.hemiLight.intensity = THREE.MathUtils.lerp(0.25, 0.72, p);
      this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.95, 1.24, p);
      fog.density = THREE.MathUtils.lerp(0.042, 0.011, p);
      fog.color.setRGB(
        THREE.MathUtils.lerp(0.03, 0.24, p),
        THREE.MathUtils.lerp(0.04, 0.21, p),
        THREE.MathUtils.lerp(0.05, 0.19, p)
      );
      if (this.scene.background instanceof THREE.Color) {
        this.scene.background.copy(fog.color);
      }
      if (this.skyDomeMat?.uniforms?.uDawnMix) {
        this.skyDomeMat.uniforms.uDawnMix.value = p;
      }
      this.mats.wall_out.color.setHex(0xe0e4dc);
      for (const eye of this.octopusEyes) {
        (eye.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.max(0, 1.5 * (1 - p * 1.6));
      }
      for (const rig of this.ghostRigs.values()) {
        rig.mixer?.update(dt * 1.4);
        rig.group.position.y -= dt * 1.2;
        rig.bodyGroup.rotation.z = Math.sin(timeSec * 8) * 0.06;
        rig.group.visible = p < 0.55;
      }
    } else if (ec.ending === 'normal') {
      // NORMAL ENDING: Berlari keluar gerbang besi dengan Kujang, namun saat menoleh ke Rumah Gurita mata merah di atap & Boneka Buna/Pocong kembali mengintai
      if (p < 0.35) {
        const u = p / 0.35;
        this.playerRig.group.visible = false;
        this.camera.position.set(
          THREE.MathUtils.lerp(8.5, -6.5, u),
          FLOOR_HEIGHT * 2 + 1.8,
          THREE.MathUtils.lerp(0.8, 6.2, u)
        );
        this.camera.lookAt(-7.2, FLOOR_HEIGHT * 2 + 1.2, 5.0);
        this.endingLight.color.setHex(0xcfa15a);
        this.endingLight.position.set(9.6, FLOOR_HEIGHT * 2 + 1.8, 0.8);
        this.endingLight.intensity = 4.5 * (1 - u);
      } else {
        const u = (p - 0.35) / 0.65;
        this.playerRig.group.visible = true;
        const px = -6.1 + Math.sin(u * 1.2) * 0.4;
        const pz = THREE.MathUtils.lerp(18.5, 22.8, u);
        this.playerRig.group.position.set(px, 0, pz);
        this.playerRig.group.rotation.y = Math.atan2(-7.0 - px, 5.0 - pz);
        this.playerRig.bodyRoot.position.y = Math.abs(Math.sin(timeSec * 7.2)) * 0.03;
        const walkSwing = Math.sin(timeSec * 7.2) * 0.55;
        this.playerRig.leftLeg.rotation.x = walkSwing;
        this.playerRig.rightLeg.rotation.x = -walkSwing;
        this.playerRig.leftKnee.rotation.x = Math.max(0.08, Math.sin(timeSec * 7.2) * 0.72 + 0.16);
        this.playerRig.rightKnee.rotation.x = Math.max(0.08, -Math.sin(timeSec * 7.2) * 0.72 + 0.16);
        this.playerRig.leftArm.rotation.x = -walkSwing * 0.7;
        this.playerRig.rightArm.rotation.x = -0.45 + walkSwing * 0.2;
        const eHipYaw = Math.sin(timeSec * 7.2) * 0.06;
        const eHipRoll = Math.cos(timeSec * 7.2) * 0.03;
        syncHumanoidGlbBones(this.playerRig, { hipYaw: eHipYaw, hipRoll: eHipRoll });

        this.camera.position.set(
          -5.0 + Math.sin(u * 1.4) * 1.0,
          THREE.MathUtils.lerp(1.75, 2.25, u),
          THREE.MathUtils.lerp(20.5, 26.2, u)
        );
        this.camera.lookAt(-7.4, THREE.MathUtils.lerp(1.8, 8.8, u), 5.2);

        const buna = this.ghostRigs.get('ghost_boneka_uci');
        if (buna) {
          buna.group.visible = true;
          buna.group.position.set(-6.35, 0, HOUSE_FRONT_Z + 0.8);
          buna.group.rotation.y = Math.sin(timeSec * 1.5) * 0.14;
          buna.bodyGroup.rotation.z = Math.sin(timeSec * 2.8) * 0.07;
          syncGhostGlbBones(buna, timeSec, false, false);
        }
        const pocong = this.ghostRigs.get('ghost_pocong');
        if (pocong) {
          pocong.group.visible = true;
          pocong.group.position.set(-8.1, Math.abs(Math.sin(timeSec * 3.2)) * 0.12, HOUSE_FRONT_Z + 0.4);
          pocong.group.rotation.y = 0.22;
        }

        const gateDoor = this.doors.find((d) => d.id === 'door_gerbang_utama');
        if (gateDoor) {
          gateDoor.isOpen = false;
          gateDoor.targetAngle = gateDoor.closedAngle;
        }
        for (const eye of this.octopusEyes) {
          (eye.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 + u * 2.6;
        }
      }
      fog.density = 0.036;
      fog.color.setHex(0x070b10);
      if (this.scene.background instanceof THREE.Color) {
        this.scene.background.setHex(0x070b10);
      }
    } else {
      // BAD ENDING: Terjatuh di dalam Dimensi Gaib saat seluruh hantu GLB mengepung, lalu sorot mata gurita merah menatap dari kegelapan pekat
      this.endingLight.color.setHex(0xd91c18);
      if (p < 0.48) {
        const u = p / 0.48;
        const dropY = this.playerPos.y + THREE.MathUtils.lerp(1.55, 0.45, u);
        this.camera.position.set(this.playerPos.x, dropY, this.playerPos.z);
        const fwdX = -Math.sin(this.yaw);
        const fwdZ = -Math.cos(this.yaw);
        const rightX = Math.cos(this.yaw);
        const rightZ = -Math.sin(this.yaw);
        this.camera.lookAt(this.playerPos.x + fwdX * 3, dropY + 0.45, this.playerPos.z + fwdZ * 3);
        this.camera.rotateZ(u * 0.42 + Math.sin(timeSec * 28) * 0.04);

        const stageList: Array<{ key: string; fwd: number; side: number; hop?: boolean }> = [
          { key: 'ghost_ambu', fwd: THREE.MathUtils.lerp(3.5, 1.35, u), side: 0 },
          { key: 'ghost_pocong', fwd: THREE.MathUtils.lerp(4.0, 1.8, u), side: -1.15, hop: true },
          { key: 'ghost_kuntilanak', fwd: THREE.MathUtils.lerp(4.2, 1.9, u), side: 1.15 },
          { key: 'ghost_boneka_uci', fwd: THREE.MathUtils.lerp(2.9, 1.1, u), side: -0.58 },
        ];
        for (const st of stageList) {
          const rig = this.ghostRigs.get(st.key);
          if (!rig) continue;
          rig.group.visible = true;
          rig.mixer?.update(dt * 1.5);
          const hopY = st.hop ? Math.abs(Math.sin(timeSec * 6.5)) * 0.22 : 0;
          rig.group.position.set(
            this.playerPos.x + fwdX * st.fwd + rightX * st.side,
            this.playerPos.y + 0.05 + hopY,
            this.playerPos.z + fwdZ * st.fwd + rightZ * st.side
          );
          rig.group.lookAt(this.camera.position.x, rig.group.position.y, this.camera.position.z);
          rig.bodyGroup.rotation.z = Math.sin(timeSec * 5 + st.side) * 0.08;
        }
        this.endingLight.position.set(
          this.playerPos.x + fwdX * 1.4,
          this.playerPos.y + 1.5,
          this.playerPos.z + fwdZ * 1.4
        );
        this.endingLight.intensity = 4 + Math.abs(Math.sin(timeSec * 22)) * 9;
      } else {
        const u = (p - 0.48) / 0.52;
        this.camera.position.set(
          -8.0 + Math.sin(u * 0.9) * 1.5,
          FLOOR_HEIGHT * 2 + 1.1,
          THREE.MathUtils.lerp(12.5, 7.8, u)
        );
        this.camera.lookAt(-8.0, FLOOR_HEIGHT * 2 + 2.2, 5.2);
        this.endingLight.position.set(-8.0, FLOOR_HEIGHT * 2 + 2.6, 5.5);
        this.endingLight.intensity = 7 + Math.sin(timeSec * 8) * 2.5;
        for (const eye of this.octopusEyes) {
          (eye.material as THREE.MeshStandardMaterial).emissiveIntensity = 4.2;
        }
      }
      fog.density = THREE.MathUtils.lerp(0.055, 0.125, p);
      fog.color.setHex(0x0b0203);
      if (this.scene.background instanceof THREE.Color) {
        this.scene.background.setHex(0x0b0203);
      }
      if (this.horrorPass) {
        this.horrorPass.uniforms.uAberration.value = 0.006;
        this.horrorPass.uniforms.uVignette.value = 0.72;
        this.horrorPass.uniforms.uHorrorMix.value = 0.78;
      }
    }

    if (p >= 1) {
      this.completeEndingCutscene();
    }
  }

  private getActiveCutsceneHud(): CutsceneHUDState | null {
    if (this.endingCutscene) {
      const e = this.endingCutscene.ending;
      if (e === 'true') {
        return {
          kind: 'ending_true',
          stage: 'TRUE ENDING',
          caption: 'Kujang Pamungkas memancarkan cahaya fajar — segel mitos runtuh dan Dimensi Gaib sirna.',
          subcaption: 'Rani dan regu selamat menyambut pagi di Sukajadi.',
          canSkip: true,
        };
      }
      if (e === 'normal') {
        return {
          kind: 'ending_normal',
          stage: 'NORMAL ENDING',
          caption: 'Gerbang Rumah Gurita tertutup di belakangmu, namun tatapan merah itu masih mengintai di balik kabut...',
          subcaption: 'Sebagian Segel Rumor belum terbongkar.',
          canSkip: true,
        };
      }
      return {
        kind: 'ending_bad',
        stage: 'BAD ENDING',
        caption: 'Kegelapan Dimensi Gaib menelan langkah terakhir di Sukajadi No. 666...',
        subcaption: 'Ambu Hideung menguasai rumah bersama rumor baru.',
        canSkip: true,
      };
    }

    if (this.introCutscene) {
      if (this.introCutscene.stage === 'arriving') {
        const beat =
          INTRO_CAR_DIALOGUES[
            Math.max(0, Math.min(INTRO_CAR_DIALOGUES.length - 1, this.introCutscene.lastDialogueIdx))
          ];
        return {
          kind: 'intro_car',
          stage: beat.speaker,
          caption: beat.line,
          subcaption: 'Perjalanan malam bersama Pa Nanang menuju Warung Ceu Titin · Tekan [Spasi] lewati',
          canSkip: true,
        };
      }
      if (this.introCutscene.stage === 'exiting') {
        return {
          kind: 'intro_car',
          stage: 'PA NANANG (SOPIR TRAVEL SUKAJADI)',
          caption: '"Hati-hati ya, Dek. Jangan percaya mentah-mentah sama kabar bohong. Temui Ceu Titin di warung depan dulu!"',
          subcaption: 'Kamu turun di depan Warung Ceu Titin · Tekan [Spasi] lewati',
          canSkip: true,
        };
      }
      if (!this.introCutscene.controlReleased) {
        return {
          kind: 'intro_car',
          stage: 'MOBIL PA NANANG BERANGKAT',
          caption: 'Mobil travel Pa Nanang membunyikan klakson pelan dan melaju pergi menembus kabut Jalan Sukajadi...',
          subcaption: 'Investigasi dimulai! Temui Ceu Titin di warung.',
          canSkip: true,
        };
      }
    }

    return null;
  }

  private emitHud(
    noiseLevel = 0,
    nearestGhostDist = 999,
    nearestGhostName: string | null = null
  ): void {
    const profile = this.getCharacter();
    let nearestPrompt: string | null = null;
    if (this.downed) {
      nearestPrompt = 'Tumbang · Tunggu rekan regu menolong dengan [E]';
    } else if (this.isHiding) {
      nearestPrompt = '[E] Keluar dari Lemari';
    } else {
      const downedMate = this.isMultiplayer ? this.findNearestDownedTeammate() : null;
      const door = this.findNearestDoor();
      const item = this.findNearestInteractable();
      const doorDist = door ? distance3D(door.closedCenter, this.playerPos) : 999;
      const itemDist = item ? distance3D(item.position, this.playerPos) : 999;
      if (downedMate) {
        nearestPrompt = `[E] Tolong ${downedMate.nickname} (+45 Sanity)`;
      } else if (door && doorDist <= itemDist) {
        if (!door.isOpen && door.lockedKeyId && !this.collectedKeyIds.includes(door.lockedKeyId)) {
          nearestPrompt = `[E] ${door.label} (Terkunci: Butuh ${door.lockedKeyLabel})`;
        } else {
          nearestPrompt = door.isOpen ? `[E] Tutup ${door.label}` : `[E] Buka ${door.label}`;
        }
      } else if (item) {
        nearestPrompt = item.prompt;
      }
    }

    const floor = detectFloor(
      this.playerPos.y,
      this.playerPos.z,
      FLOOR_HEIGHT,
      FLOOR_HEIGHT * 2,
      HOUSE_FRONT_Z
    );
    const activeSafeZone = isInSafeZone(this.playerPos, SAFE_ZONES);
    const segelBroken = countBrokenSegel(this.rumors);
    const evidenceCount = this.rumors.filter((r) => r.discoveredFact).length;
    const obj = computeCurrentObjective({
      floor,
      inDimensiGaib: this.inDimensiGaib,
      talkedNpcCount: this.talkedNpcIds.size,
      collectedKeyIds: this.collectedKeyIds,
      evidenceCount,
      segelBroken,
      totalSegel: this.rumors.length,
      raniRescued: this.raniRescued,
      kujangClaimed: this.kujangClaimed,
    });

    let ditoSenseHint: string | null = null;
    if (profile.canSenseGhosts && nearestGhostName && nearestGhostDist < 16) {
      ditoSenseHint = `Peka: ${nearestGhostName} (~${Math.round(nearestGhostDist)}m)`;
    }

    this.callbacks.onHudUpdate({
      phase: this.phase,
      floor,
      actNumber: obj.actNumber,
      currentObjective: obj.objective,
      inDimensiGaib: this.inDimensiGaib,
      inSafeZone: activeSafeZone !== null,
      safeZoneName: activeSafeZone?.name ?? null,
      sanity: Math.round(this.sanity),
      maxSanity: 100,
      stamina: Math.round(this.stamina),
      maxStamina: 100,
      flashlightBattery: Math.round(this.flashlightBattery),
      maxFlashlightBattery: 100,
      uvBattery: Math.round(this.uvBattery),
      maxUvBattery: 100,
      flashlightOn: this.flashlightOn,
      uvMode: this.uvMode,
      isCrouching:
        this.virtualCrouch || this.keys.has('KeyC') || this.keys.has('ControlLeft'),
      isSprinting:
        this.virtualSprint || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      isHiding: this.isHiding,
      isDowned: this.downed,
      perspective: this.perspective,
      noiseLevel,
      saltCount: this.saltCount,
      keysInventory: [...this.collectedKeyLabels],
      segelBroken,
      totalSegel: this.rumors.length,
      evidenceCount,
      totalEvidence: this.rumors.length,
      kujangClaimed: this.kujangClaimed,
      raniRescued: this.raniRescued,
      nearestPrompt,
      nearestGhostDist: Math.round(nearestGhostDist),
      nearestGhostName,
      ditoSenseHint,
      elapsedSeconds: Math.round(this.elapsedSeconds),
      fps: this.currentFps,
      playerX: Math.round(this.playerPos.x * 100) / 100,
      playerZ: Math.round(this.playerPos.z * 100) / 100,
      playerYaw: this.yaw,
      cutscene: this.getActiveCutsceneHud(),
    });
  }

  private cachedStaticMapRects: MapRectItem[] | null = null;

  private getStaticMapRects(): MapRectItem[] {
    if (this.cachedStaticMapRects) return this.cachedStaticMapRects;
    const rects: MapRectItem[] = [
      // Jalan Sukajadi & pelataran masuk
      { id: 'road_main', floor: 'outside', minX: -54, maxX: 54, minZ: 21.5, maxZ: 29.5, kind: 'road', label: 'Jalan Sukajadi' },
      { id: 'road_driveway', floor: 'outside', minX: -4.2, maxX: 4.2, minZ: 10.5, maxZ: 58, kind: 'road' },
      { id: 'pad_rumah_gurita', floor: 'outside', minX: -14.8, maxX: 15.2, minZ: -9.8, maxZ: 10.2, kind: 'house', label: 'Rumah Gurita No. 666' },
      { id: 'pad_warung', floor: 'outside', minX: WARUNG_POS.x - 3.0, maxX: WARUNG_POS.x + 3.0, minZ: WARUNG_POS.z - 2.6, maxZ: WARUNG_POS.z + 2.6, kind: 'house', label: 'Warung Ceu Titin' },
      { id: 'pad_masjid', floor: 'outside', minX: MOSQUE_POS.x - 5.2, maxX: MOSQUE_POS.x + 5.2, minZ: MOSQUE_POS.z - 5.2, maxZ: MOSQUE_POS.z + 5.2, kind: 'house', label: 'Masjid Al-Ikhlas' },
      { id: 'pad_ronda', floor: 'outside', minX: POS_RONDA_POS.x - 1.8, maxX: POS_RONDA_POS.x + 1.8, minZ: POS_RONDA_POS.z - 1.8, maxZ: POS_RONDA_POS.z + 1.8, kind: 'house', label: 'Pos Ronda' },
      { id: 'pad_pool', floor: 'outside', minX: COURTYARD_POOL_POS.x - 3.6, maxX: COURTYARD_POOL_POS.x + 3.6, minZ: COURTYARD_POOL_POS.z - 2.4, maxZ: COURTYARD_POOL_POS.z + 2.4, kind: 'water', label: 'Kolam' },
      { id: 'pad_g', floor: 'ground', minX: -14.8, maxX: 15.2, minZ: -9.8, maxZ: 10.2, kind: 'floor_pad' },
      { id: 'pad_s', floor: 'second', minX: -14.8, maxX: 15.2, minZ: -9.8, maxZ: 10.2, kind: 'floor_pad' },
      { id: 'pad_r', floor: 'roof', minX: -14.8, maxX: 15.2, minZ: -9.8, maxZ: 10.2, kind: 'floor_pad' },
    ];

    for (const h of NEIGHBORHOOD_HOUSES) {
      const rotSwap = Math.abs(Math.sin(h.rotY)) > 0.7;
      const hw = (rotSwap ? h.d : h.w) * 0.5;
      const hd = (rotSwap ? h.w : h.d) * 0.5;
      rects.push({
        id: h.id,
        floor: 'outside',
        minX: h.x - hw,
        maxX: h.x + hw,
        minZ: h.z - hd,
        maxZ: h.z + hd,
        kind: 'house',
      });
    }

    for (const sz of SAFE_ZONES) {
      if (sz.id === 'safe_outside') continue;
      const floor: FloorId =
        sz.id === 'safe_masjid'
          ? 'outside'
          : sz.minY >= 7.0
            ? 'roof'
            : sz.minY >= 3.2
              ? 'second'
              : 'ground';
      rects.push({
        id: sz.id,
        floor,
        minX: sz.minX,
        maxX: sz.maxX,
        minZ: sz.minZ,
        maxZ: sz.maxZ,
        kind: 'safe_zone',
        label: sz.name,
      });
    }

    const { visuals } = buildLevelGeometry();
    for (const v of visuals) {
      if (v.mat !== 'wall_out' && v.mat !== 'wall_in' && v.mat !== 'crumble' && v.mat !== 'parapet') {
        continue;
      }
      if (v.h < 0.85) continue;
      let floor: FloorId;
      if (v.y >= FLOOR_HEIGHT * 2 - 0.3) {
        floor = 'roof';
      } else if (v.y >= FLOOR_HEIGHT - 0.3) {
        floor = 'second';
      } else if (v.z > HOUSE_FRONT_Z + 0.5) {
        floor = 'outside';
      } else {
        floor = 'ground';
      }
      rects.push({
        id: `w_${v.id}`,
        floor,
        minX: v.x - v.w * 0.5,
        maxX: v.x + v.w * 0.5,
        minZ: v.z - v.d * 0.5,
        maxZ: v.z + v.d * 0.5,
        kind: 'wall',
      });
    }

    this.cachedStaticMapRects = rects;
    return rects;
  }

  public getMapSnapshot(): GameMapSnapshot {
    const profile = this.getCharacter();
    const playerFloor = detectFloor(
      this.playerPos.y,
      this.playerPos.z,
      FLOOR_HEIGHT,
      FLOOR_HEIGHT * 2,
      HOUSE_FRONT_Z
    );

    const markers: MapMarker[] = [
      { id: 'lm_warung', kind: 'landmark', label: 'Warung Ceu Titin', floor: 'outside', x: WARUNG_POS.x, z: WARUNG_POS.z },
      { id: 'lm_masjid', kind: 'landmark', label: 'Masjid Al-Ikhlas (Zona Aman)', floor: 'outside', x: MOSQUE_POS.x, z: MOSQUE_POS.z },
      { id: 'lm_ronda', kind: 'landmark', label: 'Pos Ronda Sukajadi', floor: 'outside', x: POS_RONDA_POS.x, z: POS_RONDA_POS.z },
      { id: 'lm_billboard', kind: 'landmark', label: 'Baliho Windah', floor: 'outside', x: BILLBOARD_POS.x, z: BILLBOARD_POS.z },
      { id: 'lm_gate', kind: 'landmark', label: 'Gerbang Rumah Gurita', floor: 'outside', x: 0, z: HOUSE_FRONT_Z + 1.4 },
    ];

    for (const st of STAIR_ZONES) {
      const sx = (st.minX + st.maxX) * 0.5;
      const sz = (st.minZ + st.maxZ) * 0.5;
      if (st.id === 'stair_ground_to_second') {
        markers.push({ id: `${st.id}_g`, kind: 'stair', label: 'Tangga ke Lantai 2', floor: 'ground', x: sx, z: sz });
        markers.push({ id: `${st.id}_s`, kind: 'stair', label: 'Tangga ke Lantai 1', floor: 'second', x: sx, z: sz });
      } else {
        markers.push({ id: `${st.id}_s`, kind: 'stair', label: 'Tangga ke Atap', floor: 'second', x: sx, z: sz });
        markers.push({ id: `${st.id}_r`, kind: 'stair', label: 'Tangga ke Lantai 2', floor: 'roof', x: sx, z: sz });
      }
    }

    for (const d of this.doors) {
      const floor: FloorId =
        d.floor === 'roof'
          ? 'roof'
          : d.floor === 'second'
            ? 'second'
            : d.closedCenter.z >= HOUSE_FRONT_Z - 0.4
              ? 'outside'
              : 'ground';
      const locked = !d.isOpen && Boolean(d.lockedKeyId) && !this.collectedKeyIds.includes(d.lockedKeyId!);
      markers.push({
        id: `door_${d.id}`,
        kind: locked ? 'door_locked' : d.isOpen ? 'door_open' : 'door_closed',
        label: d.label,
        detail: locked ? `Butuh ${d.lockedKeyLabel}` : d.isOpen ? 'Terbuka' : 'Tertutup',
        floor,
        x: d.closedCenter.x,
        z: d.closedCenter.z,
      });
    }

    for (const item of this.interactables) {
      if (item.collected) continue;
      let kind: MapMarker['kind'];
      if (item.kind === 'evidence') kind = 'evidence';
      else if (item.kind === 'key') kind = 'key';
      else if (item.kind === 'hiding') kind = 'hiding';
      else if (item.kind === 'salt') kind = 'salt';
      else if (item.kind === 'battery_flashlight' || item.kind === 'battery_uv') kind = 'battery';
      else if (item.kind === 'crumbling_wall') kind = 'crumble';
      else if (item.kind === 'radio_tower') kind = 'radio';
      else if (item.kind === 'kujang') kind = 'kujang';
      else if (item.kind === 'npc') kind = 'npc';
      else continue;

      markers.push({
        id: `item_${item.id}`,
        kind,
        label: item.label,
        floor: item.floor,
        x: item.position.x,
        z: item.position.z,
      });
    }

    const senseRadius = profile.canSenseGhosts ? 22 : 9.5;
    for (const g of this.ghosts) {
      const dist = distance3D(g.position, this.playerPos);
      if (dist <= senseRadius) {
        markers.push({
          id: `ghost_${g.id}`,
          kind: 'ghost',
          label: g.name,
          detail: `${Math.round(dist)}m`,
          floor: g.floor,
          x: g.position.x,
          z: g.position.z,
        });
      }
    }

    const companions: GameMapSnapshot['companions'] = [];
    for (const c of this.aiCompanions) {
      companions.push({
        id: c.id,
        name: `${c.name} (AI)`,
        x: c.pos.x,
        z: c.pos.z,
        floor: detectFloor(c.pos.y, c.pos.z, FLOOR_HEIGHT, FLOOR_HEIGHT * 2, HOUSE_FRONT_Z),
      });
    }
    for (const [gid, entry] of this.remoteRigs.entries()) {
      if (entry.role !== 'player') continue;
      companions.push({
        id: gid,
        name: 'Rekan Regu',
        x: entry.targetPos.x,
        z: entry.targetPos.z,
        floor: detectFloor(entry.targetPos.y, entry.targetPos.z, FLOOR_HEIGHT, FLOOR_HEIGHT * 2, HOUSE_FRONT_Z),
        downed: entry.downed,
      });
    }

    return {
      player: {
        x: this.playerPos.x,
        y: this.playerPos.y,
        z: this.playerPos.z,
        yaw: this.yaw,
        floor: playerFloor,
        name: profile.name,
      },
      companions,
      markers,
      rects: this.getStaticMapRects(),
    };
  }

  private handleResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    this.renderScene();
  }

  public dispose(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver?.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onWindowBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    const dom = this.renderer.domElement;
    dom.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('touchend', this.onTouchEnd);
    window.removeEventListener('touchcancel', this.onTouchEnd);
    this.audio.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (dom.parentNode === this.container) {
      this.container.removeChild(dom);
    }
  }
}
