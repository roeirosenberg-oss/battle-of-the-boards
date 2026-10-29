// Rendering and scene management: renderer, scene, camera, bloom, render loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { settings } from './settings.js';

export class Engine {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 330);
    this.scene.add(this.camera); // first-person hands are children of the camera
    // image-based lighting so metals (gold, chrome, pins) reflect something
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.6, 0.5, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.clock = new THREE.Clock();
    // test hook: ?fixeddt=0.05 advances the simulation by a fixed step per frame
    // (used by automated tests in slow software-rendered browsers)
    const fixed = new URLSearchParams(location.search).get('fixeddt');
    this.fixedDt = fixed ? Number(fixed) : 0;
    this.timeScale = 1;
    this.updaters = new Set();
    this.fps = 60;
    this._fpsAcc = 0; this._fpsFrames = 0;

    this.applyQuality(settings.get('quality'));
    settings.onChange((k, v) => { if (k === 'quality') this.applyQuality(v); });
    window.addEventListener('resize', () => this.resize());
  }

  applyQuality(q) {
    const low = q === 'low';
    this.useBloom = !low;
    this.renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = !low;
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
  }

  addUpdater(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      const rawDt = this.fixedDt || Math.min(this.clock.getDelta(), 0.05);
      const dt = rawDt * this.timeScale;
      this._fpsAcc += rawDt; this._fpsFrames++;
      if (this._fpsAcc > 0.5) { this.fps = this._fpsFrames / this._fpsAcc; this._fpsAcc = 0; this._fpsFrames = 0; }
      for (const fn of this.updaters) {
        try { fn(dt, rawDt); } catch (e) { console.error('[update]', e); }
      }
      if (this.useBloom) this.composer.render(dt);
      else this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
}
