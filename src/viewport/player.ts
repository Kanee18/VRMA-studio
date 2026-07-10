import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
  type VRMAnimation,
} from '@pixiv/three-vrm-animation';

import { useStudioStore } from '../app/store';

/**
 * Owns the Three.js scene: renderer, camera, lights, the loaded VRM model,
 * and VRMA playback. Playback state (isPlaying / playhead / loop) is driven
 * by the Zustand store so the transport bar and future timeline stay in sync.
 */
export class VrmPlayer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private raf = 0;
  private resizeObserver: ResizeObserver;
  private unsubscribe: () => void;

  private vrm: VRM | null = null;
  private vrmAnimation: VRMAnimation | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private action: THREE.AnimationAction | null = null;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x18181b);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.camera.position.set(0, 1.2, 3.4);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;

    const directional = new THREE.DirectionalLight(0xffffff, 2.4);
    directional.position.set(1, 2, 2);
    this.scene.add(directional);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    this.scene.add(new THREE.GridHelper(10, 10, 0x52525b, 0x27272a));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.unsubscribe = useStudioStore.subscribe((state, prev) => {
      if (!this.action) return;
      if (state.isPlaying !== prev.isPlaying) {
        if (state.isPlaying) {
          if (!this.action.isRunning()) this.action.reset();
          this.action.paused = false;
        } else {
          this.action.paused = true;
        }
      }
      if (state.loop !== prev.loop) this.applyLoop(state.loop);
      if (
        !state.isPlaying &&
        state.playhead !== prev.playhead &&
        Math.abs(state.playhead - this.action.time) > 1e-4
      ) {
        this.seek(state.playhead);
      }
    });

    this.tick();
  }

  async loadVrm(data: ArrayBuffer): Promise<void> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(data, '');
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error('This file does not contain a VRM model.');

    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
    VRMUtils.rotateVRM0(vrm); // VRM 0.x models face +Z; flip them to match 1.0
    this.vrm = vrm;
    this.scene.add(vrm.scene);
    this.rebuildClip();
  }

  async loadVrma(data: ArrayBuffer): Promise<void> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await loader.parseAsync(data, '');
    const animations = gltf.userData.vrmAnimations as VRMAnimation[] | undefined;
    if (!animations || animations.length === 0) {
      throw new Error('This file does not contain a VRM animation.');
    }
    this.vrmAnimation = animations[0];
    this.rebuildClip();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.unsubscribe();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private rebuildClip(): void {
    if (!this.vrm || !this.vrmAnimation) return;
    this.mixer?.stopAllAction();
    this.mixer = new THREE.AnimationMixer(this.vrm.scene);
    this.mixer.addEventListener('finished', () => {
      useStudioStore.getState().setPlaying(false);
    });
    const clip = createVRMAnimationClip(this.vrmAnimation, this.vrm);
    this.action = this.mixer.clipAction(clip);
    this.applyLoop(useStudioStore.getState().loop);
    this.action.play();
    this.action.paused = true;
    // Pose the model immediately at the current playhead (kept in range by
    // the store when edits shorten the animation).
    this.seek(useStudioStore.getState().playhead);
  }

  private applyLoop(loop: boolean): void {
    if (!this.action) return;
    this.action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    this.action.clampWhenFinished = true;
  }

  private seek(time: number): void {
    if (!this.action || !this.mixer || !this.vrm) return;
    this.action.time = Math.max(0, Math.min(time, this.action.getClip().duration));
    this.mixer.update(0);
    this.vrm.update(0);
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private tick = (): void => {
    this.raf = requestAnimationFrame(this.tick);
    const delta = this.clock.getDelta();
    const state = useStudioStore.getState();
    if (state.isPlaying && this.mixer && this.vrm && this.action) {
      this.mixer.update(delta);
      this.vrm.update(delta);
      state.setPlayhead(this.action.time);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
