"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, useGLTF, Bounds } from "@react-three/drei";
import * as THREE from "three";

// ----------------------------------------------------------------------------
// Wire DRACO once, at module scope. drei's useGLTF accepts a string path that
// it forwards to DRACOLoader.setDecoderPath(). gstatic hosts the official
// google draco decoder (wasm + js), so we don't need to vendor binaries.
// ----------------------------------------------------------------------------
const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.6/";

// Preload at module-eval time (still client-only because parent is "use client").
useGLTF.preload("/meshes/ruhr.glb", DRACO_DECODER_PATH);

interface RuhrModelProps {
  groupRef: React.RefObject<THREE.Group | null>;
}

function RuhrModel({ groupRef }: RuhrModelProps) {
  const { scene } = useGLTF("/meshes/ruhr.glb", DRACO_DECODER_PATH);

  // Clone once so this component instance can mutate transforms freely.
  const cloned = useMemo(() => {
    const clone = scene.clone(true);

    // Compute bounding box and re-center to origin. The Ruhr mesh uses
    // CESIUM_RTC for georeferencing — its raw vertices are tiny offsets from
    // a multi-million-meter ECEF anchor, but THREE doesn't honor CESIUM_RTC,
    // so we just normalize: translate the geometry so its centroid sits at
    // (0, 0, 0) and Bounds can frame it predictably.
    const box = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    box.getCenter(center);
    clone.position.sub(center);

    // Materials sometimes lose env-map response when DRACO-compressed; nudge.
    clone.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
        if (mat && "envMapIntensity" in mat) {
          mat.envMapIntensity = 0.85;
          mat.needsUpdate = true;
        }
      }
    });

    return clone;
  }, [scene]);

  return (
    <group ref={groupRef}>
      <primitive object={cloned} />
    </group>
  );
}

// Auto-rotates the camera around the model's centroid in a slow 30s loop at a
// 45° oblique angle. Radius is derived from the model's bounding-sphere so the
// orbit stays tight to the building regardless of mesh scale.
function CameraOrbit({ groupRef }: { groupRef: React.RefObject<THREE.Group | null> }) {
  const { camera } = useThree();
  const startRef = useRef<number | null>(null);
  const radiusRef = useRef<number>(60);
  const heightRef = useRef<number>(60);

  // Recompute orbit radius after the mesh has mounted.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!groupRef.current) return;
      const box = new THREE.Box3().setFromObject(groupRef.current);
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      // 1.6× radius keeps the building filling ~60% of the frame.
      radiusRef.current = Math.max(sphere.radius * 1.6, 12);
      // 45° oblique → camera height equals horizontal distance.
      heightRef.current = radiusRef.current;
    });
    return () => cancelAnimationFrame(id);
  });

  useFrame((state) => {
    if (startRef.current === null) startRef.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - startRef.current;
    const period = 30; // seconds per full revolution
    const angle = (t / period) * Math.PI * 2;
    const r = radiusRef.current;
    const h = heightRef.current;
    camera.position.set(Math.cos(angle) * r, h, Math.sin(angle) * r);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

export default function RuhrCinematicScene() {
  const groupRef = useRef<THREE.Group | null>(null);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [60, 60, 60], fov: 35, near: 0.1, far: 5000 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ background: "#0A0E1A" }}
    >
      {/* Warm, golden-hour lighting */}
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[120, 180, 80]}
        intensity={1.4}
        color={"#FFD9A8"}
      />
      <hemisphereLight args={["#FFE2B6", "#0A0E1A", 0.35]} />

      <Suspense fallback={null}>
        <Environment preset="sunset" />
        <Bounds fit clip observe margin={1.15}>
          <RuhrModel groupRef={groupRef} />
        </Bounds>
        <CameraOrbit groupRef={groupRef} />
      </Suspense>
    </Canvas>
  );
}
