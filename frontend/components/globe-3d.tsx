"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface Globe3dProps {
  pm25: number;
  fireCount: number;
  demoMode?: boolean;
}

export function Globe3d({ pm25, fireCount, demoMode }: Globe3dProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"aqi" | "fires" | "carbon">("aqi");

  // Determine atmospheric color based on PM2.5
  const getAtmosphereColor = (val: number) => {
    if (val <= 30) return 0x4edea3; // Vibrant Emerald (Good)
    if (val <= 60) return 0xfcd34d; // Yellow (Satisfactory)
    if (val <= 90) return 0xf59e0b; // Orange (Moderate)
    if (val <= 120) return 0xf97316; // Dark Orange (Poor)
    if (val <= 250) return 0xf43f5e; // Rose (Very Poor)
    return 0xe11d48; // Red (Severe)
  };

  const aqiColorHex = getAtmosphereColor(pm25);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 360;
    const height = container.clientHeight || 360;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0c1321, 0.0025);

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 15;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 4. Create holographic particle globe
    const globeRadius = 4.5;
    const dotDensity = 1600;
    const positions = new Float32Array(dotDensity * 3);
    const colors = new Float32Array(dotDensity * 3);

    const baseColor = new THREE.Color(0x4cd7f6); // Cobalt Sky base
    const alertColor = new THREE.Color(aqiColorHex);

    for (let i = 0; i < dotDensity; i++) {
      // Golden spiral distribution on sphere
      const phi = Math.acos(-1 + (2 * i) / dotDensity);
      const theta = Math.sqrt(dotDensity * Math.PI) * phi;

      const x = globeRadius * Math.sin(phi) * Math.cos(theta);
      const y = globeRadius * Math.cos(phi);
      const z = globeRadius * Math.sin(phi) * Math.sin(theta);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Color blending based on latitude / noise
      const mixRatio = Math.sin(phi * 4.0) * 0.5 + 0.5;
      const c = baseColor.clone().lerp(alertColor, mixRatio * 0.4);

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const globeGeo = new THREE.BufferGeometry();
    globeGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    globeGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // Custom glowing point texture using canvas
    const createCircleTexture = () => {
      const matCanvas = document.createElement("canvas");
      matCanvas.width = 16;
      matCanvas.height = 16;
      const ctx = matCanvas.getContext("2d");
      if (ctx) {
        const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
        grad.addColorStop(0, "rgba(255, 255, 255, 1)");
        grad.addColorStop(0.3, "rgba(255, 255, 255, 0.8)");
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 16, 16);
      }
      return new THREE.CanvasTexture(matCanvas);
    };

    const globeMat = new THREE.PointsMaterial({
      size: 0.16,
      map: createCircleTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const globePoints = new THREE.Points(globeGeo, globeMat);
    scene.add(globePoints);

    // 5. Ambient glowing outer shell
    const shellGeo = new THREE.SphereGeometry(globeRadius + 0.05, 32, 32);
    const shellMat = new THREE.MeshBasicMaterial({
      color: aqiColorHex,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    const shellMesh = new THREE.Mesh(shellGeo, shellMat);
    scene.add(shellMesh);

    // 6. Orbital Rings (representing air currents or carbon offset bands)
    const ringsGroup = new THREE.Group();
    const ringColors = [0x4cd7f6, 0x4edea3, aqiColorHex];
    const ringSpeeds: number[] = [];

    for (let r = 0; r < 3; r++) {
      const radius = globeRadius + 0.6 + r * 0.4;
      const ringGeo = new THREE.BufferGeometry();
      const pointsCount = 120;
      const ringPos = new Float32Array(pointsCount * 3);

      for (let p = 0; p < pointsCount; p++) {
        const angle = (p / pointsCount) * Math.PI * 2;
        ringPos[p * 3] = radius * Math.cos(angle);
        ringPos[p * 3 + 1] = 0; // Flat equatorial initially
        ringPos[p * 3 + 2] = radius * Math.sin(angle);
      }

      ringGeo.setAttribute("position", new THREE.BufferAttribute(ringPos, 3));
      const ringMat = new THREE.LineBasicMaterial({
        color: ringColors[r],
        transparent: true,
        opacity: 0.35 - r * 0.08,
        blending: THREE.AdditiveBlending,
      });

      const lineLoop = new THREE.LineLoop(ringGeo, ringMat);
      // Random tilt
      lineLoop.rotation.x = Math.random() * Math.PI;
      lineLoop.rotation.y = Math.random() * Math.PI;

      ringsGroup.add(lineLoop);
      ringSpeeds.push((Math.random() * 0.15 + 0.05) * (Math.random() > 0.5 ? 1 : -1));
    }
    scene.add(ringsGroup);

    // 7. Active Wildfire spikes (NASA FIRMS Hotspots)
    const spikesGroup = new THREE.Group();
    const activeFires = Math.max(1, Math.min(fireCount, 25)); // Cap visually to keep performance high
    const spikeGeoList: THREE.BufferGeometry[] = [];
    const spikeMatList: THREE.Material[] = [];

    for (let f = 0; f < activeFires; f++) {
      // Polar coordinates distribution
      const phi = Math.random() * Math.PI;
      const theta = Math.random() * Math.PI * 2;

      // Spike direction vector
      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      );

      const spikeHeight = 0.5 + Math.random() * 0.8;
      const startPt = dir.clone().multiplyScalar(globeRadius);
      const endPt = dir.clone().multiplyScalar(globeRadius + spikeHeight);

      // Line spike
      const spikeGeo = new THREE.BufferGeometry().setFromPoints([startPt, endPt]);
      const spikeMat = new THREE.LineBasicMaterial({
        color: 0xfb7185, // Rose color for fire hotspots
        linewidth: 2,
        transparent: true,
        opacity: 0.9,
      });

      const spikeLine = new THREE.Line(spikeGeo, spikeMat);
      spikesGroup.add(spikeLine);
      spikeGeoList.push(spikeGeo);
      spikeMatList.push(spikeMat);

      // Little glowing cap at the end of the spike
      const capGeo = new THREE.SphereGeometry(0.06, 8, 8);
      const capMat = new THREE.MeshBasicMaterial({
        color: 0xff4560,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
      });
      const capMesh = new THREE.Mesh(capGeo, capMat);
      capMesh.position.copy(endPt);
      spikesGroup.add(capMesh);
      spikeGeoList.push(capGeo);
      spikeMatList.push(capMat);
    }
    scene.add(spikesGroup);

    // 8. Interactive rotation state
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let targetRotationX = 0;
    let targetRotationY = 0;

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
        targetRotationX += deltaMove.y * 0.005;
      }

      previousMousePosition = {
        x: e.clientX,
        y: e.clientY,
      };
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    // Touch support for mobile
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
        targetRotationX += deltaMove.y * 0.008;

        previousMousePosition = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    };

    container.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleMouseUp);

    // 9. Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const elapsed = clock.getElapsedTime();

      // Smooth damp/inertia rotation for user drag
      globePoints.rotation.y += (targetRotationY - globePoints.rotation.y) * 0.1;
      globePoints.rotation.x += (targetRotationX - globePoints.rotation.x) * 0.1;

      shellMesh.rotation.copy(globePoints.rotation);
      spikesGroup.rotation.copy(globePoints.rotation);

      // Auto rotation in background
      if (!isDragging) {
        targetRotationY += 0.0015;
      }

      // Rotate individual outer rings
      ringsGroup.children.forEach((ring, idx) => {
        const speed = ringSpeeds[idx] || 0.05;
        ring.rotation.z = elapsed * speed;
      });

      // Ambient breathing effect on the atmosphere shell
      const breathing = Math.sin(elapsed * 2) * 0.015 + 0.085;
      shellMat.opacity = breathing;

      // Pulse caps on spikes
      spikesGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          const pulse = Math.sin(elapsed * 4 + child.position.x) * 0.15 + 0.85;
          (child.material as THREE.MeshBasicMaterial).opacity = pulse;
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    // 10. Handle window resizing
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

    // 11. Cleanup function to prevent GPU Memory Leaks
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

      // Dispose Geometries
      globeGeo.dispose();
      shellGeo.dispose();
      ringsGroup.children.forEach((ring) => {
        (ring as THREE.LineLoop).geometry.dispose();
      });
      spikeGeoList.forEach((geo) => geo.dispose());

      // Dispose Materials
      globeMat.dispose();
      shellMat.dispose();
      ringsGroup.children.forEach((ring) => {
        ((ring as THREE.LineLoop).material as THREE.LineBasicMaterial).dispose();
      });
      spikeMatList.forEach((mat) => mat.dispose());

      renderer.dispose();
    };
  }, [aqiColorHex, fireCount]);

  return (
    <div className="panel subtle-ring flex min-h-[500px] flex-col overflow-hidden bg-slate-950/40 relative">
      {/* Background radial gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(76,215,246,0.06)_0%,transparent_70%)] pointer-events-none" />

      <div className="border-b border-border px-5 py-4 flex items-center justify-between z-10">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-secondary">Holographic Earth</span>
          <h2 className="mt-1 text-lg font-bold text-white leading-none">Environmental Telemetry</h2>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-slate-950/50 p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("aqi")}
            className={`rounded-full px-3 py-1 font-medium transition-all ${
              activeTab === "aqi" ? "bg-secondary text-slate-950 shadow-md shadow-secondary/20" : "text-slate-400 hover:text-white"
            }`}
          >
            AQI
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("fires")}
            className={`rounded-full px-3 py-1 font-medium transition-all ${
              activeTab === "fires" ? "bg-rose-500 text-white shadow-md shadow-rose-500/25" : "text-slate-400 hover:text-white"
            }`}
          >
            Fires
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("carbon")}
            className={`rounded-full px-3 py-1 font-medium transition-all ${
              activeTab === "carbon" ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/25" : "text-slate-400 hover:text-white"
            }`}
          >
            Carbon
          </button>
        </div>
      </div>

      {/* The 3D canvas container */}
      <div ref={containerRef} className="flex-1 w-full min-h-[380px] cursor-grab active:cursor-grabbing z-0 relative">
        {/* Floating guidance overlay */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-slate-950/60 backdrop-blur-md px-3.5 py-1.5 text-[10px] uppercase tracking-widest text-slate-400 pointer-events-none select-none">
          Drag to rotate globe
        </div>

        {/* Dynamic Legend based on selected tab */}
        <div className="absolute top-4 left-5 z-10 flex flex-col gap-2 pointer-events-none bg-slate-950/55 backdrop-blur-sm p-3 rounded-2xl border border-border">
          {activeTab === "aqi" && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300 border-b border-border pb-1">Atmosphere AQI</p>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#4edea3]" />
                <span className="text-[10px] text-slate-400">Good (0-50)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#fcd34d]" />
                <span className="text-[10px] text-slate-400">Moderate (51-100)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
                <span className="text-[10px] text-slate-400">Unhealthy (101-200)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#e11d48]" />
                <span className="text-[10px] text-slate-400">Hazardous (201+)</span>
              </div>
            </>
          )}

          {activeTab === "fires" && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300 border-b border-border pb-1">Sat active anomalies</p>
              <div className="flex items-center gap-2">
                <span className="h-3 w-[1px] bg-rose-400" />
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 -ml-1.5" />
                <span className="text-[10px] text-slate-400">FIRMS Heat Spikes ({fireCount})</span>
              </div>
              <p className="text-[9px] text-slate-500 leading-tight max-w-[120px] mt-1">Spike height indicates thermal intensity index.</p>
            </>
          )}

          {activeTab === "carbon" && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300 border-b border-border pb-1">Flux rings</p>
              <div className="flex items-center gap-2">
                <span className="h-0.5 w-4 bg-[#4cd7f6]" />
                <span className="text-[10px] text-slate-400">Atmospheric Wind</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-0.5 w-4 bg-[#4edea3]" />
                <span className="text-[10px] text-slate-400">Carbon Offsets</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
