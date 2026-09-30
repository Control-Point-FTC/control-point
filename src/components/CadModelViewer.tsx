// Immersive in-browser 3D model viewer for CAD snapshots.
// Lazy-loaded (React.lazy) so three.js + the OpenCASCADE WASM parser never
// touch the main bundle. STEP files are parsed client-side with
// occt-import-js (WASM served from /occt/occt-import-js.wasm, bundled in
// public/); STL files use three's STLLoader.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
// @ts-ignore — occt-import-js ships no types
import occtimportjs from 'occt-import-js';
import { X, RotateCw, Maximize2, Grid3X3, Box, AlertTriangle } from 'lucide-react';

interface CadModelViewerProps {
  fileUrl: string;
  fileType: 'step' | 'stl';
  fileName: string;
  onClose: () => void;
}

let occtPromise: Promise<any> | null = null;
function getOcct() {
  if (!occtPromise) {
    // locateFile points Emscripten at the WASM we ship in public/occt/.
    occtPromise = occtimportjs({ locateFile: () => '/occt/occt-import-js.wasm' });
  }
  return occtPromise;
}

export function meshFromOcct(occtMesh: any): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(occtMesh.attributes.position.array, 3));
  if (occtMesh.attributes.normal?.array) {
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(occtMesh.attributes.normal.array, 3));
  } else {
    geo.computeVertexNormals();
  }
  // occt index array is triplets: flatten to a plain index list
  const tris: number[] = [];
  for (const t of occtMesh.index.array) tris.push(t[0], t[1], t[2]);
  geo.setIndex(tris);
  return geo;
}

export default function CadModelViewer({ fileUrl, fileType, fileName, onClose }: CadModelViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [meshCount, setMeshCount] = useState(0);
  const [triCount, setTriCount] = useState(0);
  const controlsRef = useRef<OrbitControls | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  // Escape closes the viewer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let raf = 0;

    const init = async () => {
      try {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
        camera.position.set(180, 140, 180);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mount.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controlsRef.current = controls;

        scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1f, 1.1));
        const dir = new THREE.DirectionalLight(0xffffff, 1.6);
        dir.position.set(200, 300, 150);
        scene.add(dir);
        const dir2 = new THREE.DirectionalLight(0xffc700, 0.35);
        dir2.position.set(-200, 100, -150);
        scene.add(dir2);

        const grid = new THREE.GridHelper(400, 40, 0x3a3a42, 0x232328);
        (grid.material as THREE.Material).transparent = true;
        (grid.material as THREE.Material).opacity = 0.5;
        scene.add(grid);

        const group = new THREE.Group();
        groupRef.current = group;
        scene.add(group);

        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`Could not download the model file (HTTP ${res.status})`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        let meshes: number = 0;
        let tris = 0;
        if (fileType === 'step') {
          const occt = await getOcct();
          if (cancelled) return;
          const result = occt.ReadStepFile(new Uint8Array(buffer), null);
          if (!result?.success || !result.meshes?.length) throw new Error('Could not parse this STEP file — it may be corrupt or use unsupported entities.');
          for (const m of result.meshes) {
            const geo = meshFromOcct(m);
            const color = Array.isArray(m.color) ? new THREE.Color(m.color[0], m.color[1], m.color[2]) : new THREE.Color(0xb8bcc4);
            const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.45, side: THREE.DoubleSide });
            group.add(new THREE.Mesh(geo, mat));
            meshes += 1;
            tris += geo.index ? geo.index.count / 3 : 0;
          }
        } else {
          const geo = new STLLoader().parse(buffer);
          geo.computeVertexNormals();
          const mat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.35, roughness: 0.45, side: THREE.DoubleSide });
          group.add(new THREE.Mesh(geo, mat));
          meshes = 1;
          tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
        }

        // Center + fit
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 1);
        group.position.sub(center);
        box.setFromObject(group);
        grid.position.y = box.min.y - 0.5;
        const fitDist = (maxDim * 1.9) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        camera.position.set(fitDist * 0.75, fitDist * 0.55, fitDist * 0.75);
        camera.near = fitDist / 1000;
        camera.far = fitDist * 20;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();

        if (cancelled) return;
        setMeshCount(meshes);
        setTriCount(Math.round(tris));
        setLoading(false);

        const resize = () => {
          const w = mount.clientWidth, h = mount.clientHeight;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer?.setSize(w, h);
        };
        resize();
        window.addEventListener('resize', resize);

        const animate = () => {
          raf = requestAnimationFrame(animate);
          controls.update();
          renderer?.render(scene, camera);
        };
        animate();

        return () => window.removeEventListener('resize', resize);
      } catch (err: any) {
        if (!cancelled) {
          console.error('CAD viewer error:', err);
          setLoadError(err?.message || 'Failed to load the 3D model.');
          setLoading(false);
        }
      }
    };

    let cleanupResize: (() => void) | undefined;
    init().then((c) => { cleanupResize = c as any; });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (cleanupResize) cleanupResize();
      controlsRef.current?.dispose();
      controlsRef.current = null;
      groupRef.current?.traverse((o: any) => {
        o.geometry?.dispose?.();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => m?.dispose?.());
      });
      groupRef.current = null;
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
        renderer = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, fileType]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    groupRef.current?.traverse((o: any) => {
      if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => { m.wireframe = wireframe; });
    });
  }, [wireframe]);

  const resetView = () => {
    // Simplest reliable reset: remount by toggling a key on the parent.
    // Here we just re-fit via controls reset if available.
    controlsRef.current?.reset();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-sm flex flex-col" role="dialog" aria-modal="true">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/10">
        <div className="rounded-xl bg-accent/12 p-2">
          <Box className="w-5 h-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-bold truncate">{fileName}</h3>
          <p className="text-[11px] text-text-muted uppercase tracking-widest">
            {fileType === 'step' ? 'STEP model' : 'STL model'}
            {meshCount > 0 && ` · ${meshCount} part${meshCount === 1 ? '' : 's'} · ${triCount.toLocaleString()} triangles`}
          </p>
        </div>
        <button
          onClick={() => setAutoRotate((v) => !v)}
          title="Auto-rotate"
          className={`p-2 rounded-xl border transition-all ${autoRotate ? 'bg-accent text-accent-ink border-accent' : 'border-white/10 text-text-muted hover:text-white hover:bg-white/5'}`}
        >
          <RotateCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setWireframe((v) => !v)}
          title="Wireframe"
          className={`p-2 rounded-xl border transition-all ${wireframe ? 'bg-accent text-accent-ink border-accent' : 'border-white/10 text-text-muted hover:text-white hover:bg-white/5'}`}
        >
          <Grid3X3 className="w-4 h-4" />
        </button>
        <button
          onClick={resetView}
          title="Reset view"
          className="p-2 rounded-xl border border-white/10 text-text-muted hover:text-white hover:bg-white/5 transition-all"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          title="Close (Esc)"
          className="p-2 rounded-xl border border-white/10 text-text-muted hover:text-white hover:bg-white/5 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 min-h-0">
        <div ref={mountRef} className="absolute inset-0 [&>canvas]:w-full [&>canvas]:h-full [&>canvas]:block" />
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-text-muted">
            <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-accent animate-spin" />
            <p className="text-sm">Loading 3D model…</p>
            {fileType === 'step' && <p className="text-xs text-text-muted/70">Parsing STEP geometry in your browser</p>}
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-3">
              <AlertTriangle className="w-10 h-10 text-warning mx-auto" />
              <p className="text-white font-bold">Couldn't load this model</p>
              <p className="text-sm text-text-muted">{loadError}</p>
            </div>
          </div>
        )}
        {!loading && !loadError && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
            <p className="text-[11px] text-text-muted/80 bg-black/50 border border-white/10 rounded-full px-4 py-1.5 whitespace-nowrap">
              Drag to orbit · Scroll to zoom · Right-drag to pan
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
