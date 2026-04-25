"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// drei wires DRACOLoader for us when we pass the decoder path as the second arg.
// Google's official gstatic CDN — no need to vendor binaries into /public.
const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.6/";

// Preload at module-eval time so the network fetch starts immediately.
useGLTF.preload("/meshes/ruhr.glb", DRACO_DECODER_PATH);

interface RuhrModelProps {
  onReady: (sphere: THREE.Sphere) => void;
}

function RuhrModel({ onReady }: RuhrModelProps) {
  const { scene } = useGLTF("/meshes/ruhr.glb", DRACO_DECODER_PATH);

  // Build the scene we render: clone, recenter, fix orientation.
  // The Ruhr mesh is drone-photogrammetry exported from a tool that uses Z-up
  // (cesium / geospatial convention). Three.js is Y-up. So we rotate -90° on X
  // to lay the mesh flat as if seen from above.
  const cloned = useMemo(() => {
    const clone = scene.clone(true);

    // Strip CESIUM_RTC offset by recentering geometry around origin.
    const box = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    box.getCenter(center);
    clone.position.sub(center);

    // Wrap in a parent group that flips Z-up → Y-up (drone exporters use Z-up).
    const root = new THREE.Group();
    root.rotation.x = -Math.PI / 2;
    root.add(clone);

    // After rotation, recenter again so the mesh sits at world origin.
    const finalBox = new THREE.Box3().setFromObject(root);
    const finalCenter = new THREE.Vector3();
    finalBox.getCenter(finalCenter);
    root.position.sub(finalCenter);

    // Tone down env-map brightness on PBR materials to match the dark UI.
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
        if (mat && "envMapIntensity" in mat) {
          mat.envMapIntensity = 0.85;
          mat.needsUpdate = true;
        }
      }
    });

    return root;
  }, [scene]);

  // Compute bounding sphere AFTER orientation fix so the camera frames correctly.
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    onReady(sphere);
  }, [cloned, onReady]);

  return <primitive object={cloned} />;
}

interface SceneProps {
  sphere: THREE.Sphere | null;
}

function CameraSetup({ sphere }: SceneProps) {
  const { camera } = useThree();
  useEffect(() => {
    if (!sphere) return;
    // Position camera at a 45° oblique angle, far enough to frame the building.
    const r = Math.max(sphere.radius * 1.8, 20);
    camera.position.set(r * 0.8, r * 0.9, r * 0.8);
    camera.lookAt(sphere.center);
    if ("updateProjectionMatrix" in camera) {
      (camera as THREE.PerspectiveCamera).far = r * 10;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }
  }, [camera, sphere]);
  return null;
}

export default function RuhrCinematicScene() {
  const [sphere, setSphere] = useState<THREE.Sphere | null>(null);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [60, 60, 60], fov: 35, near: 0.1, far: 5000 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ background: "#0A0E1A" }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[120, 180, 80]} intensity={1.4} color="#FFD9A8" />
      <hemisphereLight args={["#FFE2B6", "#0A0E1A", 0.35]} />

      <Suspense fallback={null}>
        <Environment preset="sunset" />
        <RuhrModel onReady={setSphere} />
        <CameraSetup sphere={sphere} />
        {sphere && (
          <OrbitControls
            target={[sphere.center.x, sphere.center.y, sphere.center.z]}
            enableDamping
            dampingFactor={0.08}
            minDistance={Math.max(sphere.radius * 0.8, 8)}
            maxDistance={sphere.radius * 6}
            minPolarAngle={Math.PI * 0.05}
            maxPolarAngle={Math.PI * 0.49}
            // Slow auto-rotate that pauses the moment user touches the scene.
            autoRotate
            autoRotateSpeed={0.6}
            enablePan={false}
          />
        )}
      </Suspense>
    </Canvas>
  );
}
