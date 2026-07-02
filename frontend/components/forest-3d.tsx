"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Forest3dProps {
  points: number;
  offset: number;
}

export function Forest3d({ points, offset }: Forest3dProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Compute number of trees based on XP points: at least 1, max 10.
  const treeCount = Math.min(10, Math.floor(points / 100) + 1);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 360;
    const height = container.clientHeight || 360;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0c1321, 0.015);

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0.5, 0);

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x4edea3, 1.2);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    const accentLight = new THREE.PointLight(0x4cd7f6, 1.5, 15);
    accentLight.position.set(-2, 3, -2);
    scene.add(accentLight);

    // Track geoms/materials for cleanup
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];

    // 5. Create Floating Island (Grassy cylinder)
    const islandRadius = 3.5;
    const islandHeight = 1.0;

    // Grass Top
    const grassGeo = new THREE.CylinderGeometry(islandRadius, islandRadius, 0.1, 32);
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x0f3b2e,
      roughness: 0.8,
      metalness: 0.1,
      flatShading: true,
    });
    const grassMesh = new THREE.Mesh(grassGeo, grassMat);
    grassMesh.position.y = islandHeight / 2;
    scene.add(grassMesh);
    geometries.push(grassGeo);
    materials.push(grassMat);

    // Dirt Bottom
    const dirtGeo = new THREE.CylinderGeometry(islandRadius, islandRadius * 0.7, islandHeight, 32);
    const dirtMat = new THREE.MeshStandardMaterial({
      color: 0x2e1a0c,
      roughness: 0.9,
      flatShading: true,
    });
    const dirtMesh = new THREE.Mesh(dirtGeo, dirtMat);
    dirtMesh.position.y = 0;
    scene.add(dirtMesh);
    geometries.push(dirtGeo);
    materials.push(dirtMat);

    // Grid helper overlay on top for tech look
    const gridGeo = new THREE.RingGeometry(0.1, islandRadius - 0.1, 32, 1);
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0x4edea3,
      transparent: true,
      opacity: 0.08,
      wireframe: true,
    });
    const gridMesh = new THREE.Mesh(gridGeo, gridMat);
    gridMesh.rotation.x = -Math.PI / 2;
    gridMesh.position.y = islandHeight / 2 + 0.01;
    scene.add(gridMesh);
    geometries.push(gridGeo);
    materials.push(gridMat);

    // 6. Spawn procedural trees
    const forestGroup = new THREE.Group();
    scene.add(forestGroup);

    // Deterministic positions using golden angle spiral on the island
    const goldenAngle = 137.5 * (Math.PI / 180);
    const maxRadius = islandRadius - 0.8;

    for (let i = 0; i < treeCount; i++) {
      const theta = i * goldenAngle;
      const radius = maxRadius * Math.sqrt(i / treeCount);

      const x = radius * Math.cos(theta);
      const z = radius * Math.sin(theta);

      // Procedural height scales with offset/XP slightly
      const treeScale = 0.7 + (offset > 0 ? Math.min(1.0, offset / 50) : 0.0) + (i % 3) * 0.15;
      const trunkHeight = 1.0 * treeScale;

      const treeGroup = new THREE.Group();
      treeGroup.position.set(x, islandHeight / 2, z);
      forestGroup.add(treeGroup);

      // Trunk Cylinder
      const trunkGeo = new THREE.CylinderGeometry(0.12 * treeScale, 0.16 * treeScale, trunkHeight, 8);
      const trunkMat = new THREE.MeshStandardMaterial({
        color: 0x3d2715,
        roughness: 0.8,
        flatShading: true,
      });
      const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
      trunkMesh.position.y = trunkHeight / 2;
      treeGroup.add(trunkMesh);
      geometries.push(trunkGeo);
      materials.push(trunkMat);

      // Foliage: Pine-style stacked cones
      const foliageTiers = 3;
      const foliageColor = i % 2 === 0 ? 0x4edea3 : 0x3bceac; // Alternate colors
      const foliageMat = new THREE.MeshStandardMaterial({
        color: foliageColor,
        roughness: 0.6,
        metalness: 0.1,
        flatShading: true,
      });
      materials.push(foliageMat);

      for (let tier = 0; tier < foliageTiers; tier++) {
        const bottomRad = 0.5 * treeScale * (1 - tier * 0.2);
        const coneHeight = 0.6 * treeScale;
        const coneGeo = new THREE.ConeGeometry(bottomRad, coneHeight, 8);
        const coneMesh = new THREE.Mesh(coneGeo, foliageMat);
        // Stack cones
        coneMesh.position.y = trunkHeight + tier * 0.35 * treeScale;
        treeGroup.add(coneMesh);
        geometries.push(coneGeo);
      }
    }

    // 7. Ambient floating "firefly" particles
    const fireflyCount = 20;
    const fireflyGeo = new THREE.BufferGeometry();
    const fireflyPositions = new Float32Array(fireflyCount * 3);
    const fireflySpeeds: number[] = [];

    for (let f = 0; f < fireflyCount; f++) {
      // Random coordinates inside bounds
      const fTheta = Math.random() * Math.PI * 2;
      const fRad = Math.random() * islandRadius;
      fireflyPositions[f * 3] = fRad * Math.cos(fTheta);
      fireflyPositions[f * 3 + 1] = islandHeight / 2 + Math.random() * 4.0;
      fireflyPositions[f * 3 + 2] = fRad * Math.sin(fTheta);
      fireflySpeeds.push(0.5 + Math.random() * 0.8);
    }

    fireflyGeo.setAttribute("position", new THREE.BufferAttribute(fireflyPositions, 3));

    // Custom circle canvas particle texture
    const createParticleTexture = () => {
      const matCanvas = document.createElement("canvas");
      matCanvas.width = 16;
      matCanvas.height = 16;
      const ctx = matCanvas.getContext("2d");
      if (ctx) {
        const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
        grad.addColorStop(0, "rgba(254, 240, 138, 1)"); // light yellow
        grad.addColorStop(0.3, "rgba(78, 222, 163, 0.8)"); // emerald glow
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 16, 16);
      }
      return new THREE.CanvasTexture(matCanvas);
    };

    const fireflyMat = new THREE.PointsMaterial({
      size: 0.28,
      map: createParticleTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const fireflyPoints = new THREE.Points(fireflyGeo, fireflyMat);
    scene.add(fireflyPoints);
    geometries.push(fireflyGeo);
    materials.push(fireflyMat);

    // 8. User Drag Orbit Interactions
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let targetRotationY = 0;
    let targetRotationX = 0.3; // Slight angle look-down

    const handleMouseDown = () => {
      isDragging = true;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const deltaMove = {
        x: e.clientX - previousMousePosition.x,
        y: e.clientY - previousMousePosition.y,
      };

      if (isDragging) {
        targetRotationY += deltaMove.x * 0.005;
        // Limit camera tilt look angles
        targetRotationX = Math.max(0.1, Math.min(1.0, targetRotationX + deltaMove.y * 0.005));
      }

      previousMousePosition = {
        x: e.clientX,
        y: e.clientY,
      };
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    container.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    // Touch support
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        previousMousePosition = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches.length === 1) {
        const deltaMove = {
          x: e.touches[0].clientX - previousMousePosition.x,
          y: e.touches[0].clientY - previousMousePosition.y,
        };
        targetRotationY += deltaMove.x * 0.008;
        targetRotationX = Math.max(0.1, Math.min(1.0, targetRotationX + deltaMove.y * 0.008));
        previousMousePosition = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleMouseUp);

    // 9. Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const elapsed = clock.getElapsedTime();

      // Rotate scene based on camera rotation damp
      const baseGroupRotationY = targetRotationY + (isDragging ? 0 : elapsed * 0.08);
      scene.rotation.y = baseGroupRotationY;
      scene.rotation.x += (targetRotationX - scene.rotation.x) * 0.1;

      // Animate fireflies floating up in sine-waves
      const positions = fireflyGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < fireflyCount; i++) {
        // y position floats up
        const speed = fireflySpeeds[i] || 0.5;
        positions[i * 3 + 1] += speed * 0.015;

        // x/z positions wave slightly
        positions[i * 3] += Math.sin(elapsed * 2 + i) * 0.002;
        positions[i * 3 + 2] += Math.cos(elapsed * 1.5 + i) * 0.002;

        // Reset if float too high
        if (positions[i * 3 + 1] > islandHeight / 2 + 5.0) {
          positions[i * 3 + 1] = islandHeight / 2 + 0.1;
          const theta = Math.random() * Math.PI * 2;
          const rad = Math.random() * islandRadius;
          positions[i * 3] = rad * Math.cos(theta);
          positions[i * 3 + 2] = rad * Math.sin(theta);
        }
      }
      fireflyGeo.attributes.position.needsUpdate = true;

      // Gentle breathing scale on foliage meshes
      forestGroup.children.forEach((tree, tIdx) => {
        const pulse = Math.sin(elapsed * 2.0 + tIdx) * 0.02 + 1.0;
        // Scale foliage group (skip trunk)
        tree.children.forEach((child) => {
          if (child instanceof THREE.Mesh && child.geometry instanceof THREE.ConeGeometry) {
            child.scale.set(pulse, pulse, pulse);
          }
        });
      });

      renderer.render(scene, camera);
    };

    animate();

    // 10. Resizing
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const rect = entries[0].contentRect;
      const w = rect.width;
      const h = rect.height;

      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // 11. Memory Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();

      container.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      container.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);

      try {
        container.removeChild(renderer.domElement);
      } catch {
        // Ignored
      }

      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, [treeCount, offset]);

  return (
    <div className="panel subtle-ring bg-slate-950/40 relative overflow-hidden flex flex-col h-[280px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(78,222,163,0.04)_0%,transparent_70%)] pointer-events-none" />

      <div className="border-b border-border px-5 py-3 flex items-center justify-between z-10 bg-slate-950/30">
        <div>
          <span className="text-[9px] uppercase tracking-[0.25em] text-emerald-300">Procedural 3D Simulator</span>
          <h2 className="text-xs font-bold text-white leading-none">Your Virtual Carbon Offset Forest</h2>
        </div>
        <div className="rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[9px] font-mono text-emerald-300">
          {treeCount} {treeCount === 1 ? "tree" : "trees"} planted
        </div>
      </div>

      <div ref={containerRef} className="flex-1 w-full cursor-grab active:cursor-grabbing z-0 relative" />

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-border bg-slate-950/70 backdrop-blur-md px-3 py-1 text-[9px] uppercase tracking-wider text-slate-400 pointer-events-none select-none">
        Earn XP to grow more trees
      </div>
    </div>
  );
}
