"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildGlobe, type LineLayer, type PointLayer } from "./build-globe";
import { readFieldColors, toUnit } from "./theme-colors";

/** Height of the orthographic frustum in world units. */
const FRUSTUM_HEIGHT = 11.5;
const CAMERA_Z = 20;

/**
 * Shared drift maths. Every layer runs the identical function on its own
 * seed, so a line always stays welded to the dots it joins and the whole
 * field animates on the GPU with no per-frame buffer uploads. uDrift scales
 * it per layer — the globe's skin barely moves, the loose orbits wander.
 */
const DRIFT_GLSL = /* glsl */ `
  vec3 drift(vec3 base, vec3 seed, float t, float amount) {
    return base + amount * vec3(
      sin(t * 0.21 + seed.x) * 0.16,
      cos(t * 0.17 + seed.y) * 0.13,
      sin(t * 0.25 + seed.z) * 0.16
    );
  }
`;

const POINT_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 aSeed;
  attribute float aAccent;

  uniform float uTime;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uDrift;

  varying float vFade;
  varying float vAccent;

  ${DRIFT_GLSL}

  void main() {
    vAccent = aAccent;
    vec3 shifted = drift(position, aSeed, uTime, uDrift);
    vec4 mvPosition = modelViewMatrix * vec4(shifted, 1.0);

    // The far side of the globe sits lighter than the near side.
    vFade = mix(0.2, 1.0, smoothstep(-27.0, -13.0, mvPosition.z));

    gl_PointSize = aSize * uScale * uPixelRatio * mix(0.7, 1.2, vFade);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const POINT_FRAGMENT = /* glsl */ `
  precision mediump float;

  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform float uOpacity;

  varying float vFade;
  varying float vAccent;

  void main() {
    // Round off the square point sprite, with a pixel of edge softening.
    float dist = length(gl_PointCoord - vec2(0.5));
    float alpha = 1.0 - smoothstep(0.42, 0.5, dist);
    if (alpha <= 0.001) discard;

    vec3 color = mix(uColor, uAccent, vAccent);
    gl_FragColor = vec4(color, alpha * uOpacity * vFade);
  }
`;

const LINE_VERTEX = /* glsl */ `
  attribute vec3 aSeed;
  attribute float aStrength;

  uniform float uTime;
  uniform float uDrift;

  varying float vFade;
  varying float vStrength;

  ${DRIFT_GLSL}

  void main() {
    vStrength = aStrength;
    vec3 shifted = drift(position, aSeed, uTime, uDrift);
    vec4 mvPosition = modelViewMatrix * vec4(shifted, 1.0);
    vFade = mix(0.12, 1.0, smoothstep(-27.0, -13.0, mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  precision mediump float;

  uniform vec3 uColor;
  uniform float uOpacity;

  varying float vFade;
  varying float vStrength;

  void main() {
    gl_FragColor = vec4(uColor, vStrength * vFade * uOpacity);
  }
`;

type Disposable = { dispose: () => void };

export default function GlobeCanvas({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      // No WebGL (old hardware, blocked context) — leave the stage empty
      // rather than throwing out of an effect.
      return;
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearAlpha(0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    camera.position.set(0, 0, CAMERA_Z);
    camera.lookAt(0, 0, 0);

    const data = buildGlobe();
    const colors = readFieldColors();
    const nodeColor = new THREE.Color().fromArray(toUnit(colors.node));
    const linkColor = new THREE.Color().fromArray(toUnit(colors.link));
    const accentColor = new THREE.Color().fromArray(toUnit(colors.accent));

    const disposables: Disposable[] = [];
    const pointMaterials: THREE.ShaderMaterial[] = [];
    const lineMaterials: THREE.ShaderMaterial[] = [];
    const timed: THREE.ShaderMaterial[] = [];

    /** Opacity multipliers, applied on top of the live theme opacity. */
    const pointWeights: number[] = [];
    const lineWeights: number[] = [];

    const addPoints = (
      layer: PointLayer,
      { drift, weight }: { drift: number; weight: number },
    ) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(layer.positions, 3),
      );
      geometry.setAttribute("aSize", new THREE.BufferAttribute(layer.sizes, 1));
      geometry.setAttribute("aSeed", new THREE.BufferAttribute(layer.seeds, 3));
      geometry.setAttribute(
        "aAccent",
        new THREE.BufferAttribute(layer.accents, 1),
      );

      const material = new THREE.ShaderMaterial({
        vertexShader: POINT_VERTEX,
        fragmentShader: POINT_FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: 100 },
          uPixelRatio: { value: pixelRatio },
          uDrift: { value: drift },
          uColor: { value: nodeColor },
          uAccent: { value: accentColor },
          uOpacity: { value: colors.nodeOpacity * weight },
        },
      });

      disposables.push(geometry, material);
      pointMaterials.push(material);
      pointWeights.push(weight);
      timed.push(material);
      return new THREE.Points(geometry, material);
    };

    const addLines = (
      layer: LineLayer,
      { drift, weight }: { drift: number; weight: number },
    ) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(layer.positions, 3),
      );
      geometry.setAttribute("aSeed", new THREE.BufferAttribute(layer.seeds, 3));
      geometry.setAttribute(
        "aStrength",
        new THREE.BufferAttribute(layer.strengths, 1),
      );

      const material = new THREE.ShaderMaterial({
        vertexShader: LINE_VERTEX,
        fragmentShader: LINE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uDrift: { value: drift },
          uColor: { value: linkColor },
          uOpacity: { value: colors.linkOpacity * weight },
        },
      });

      disposables.push(geometry, material);
      lineMaterials.push(material);
      lineWeights.push(weight);
      timed.push(material);
      return new THREE.LineSegments(geometry, material);
    };

    // Back to front: the faint scaffolding first, the bright skin last.
    const group = new THREE.Group();
    group.add(addLines(data.arcs, { drift: 0.5, weight: 1.1 }));
    group.add(addLines(data.grid, { drift: 0.08, weight: 0.7 }));
    group.add(addLines(data.links, { drift: 0.12, weight: 0.95 }));
    group.add(addPoints(data.web, { drift: 0.12, weight: 0.85 }));
    group.add(addPoints(data.dotted, { drift: 0.6, weight: 0.95 }));
    group.add(addPoints(data.surface, { drift: 0.06, weight: 1 }));
    // A slight axial tilt reads as a globe rather than a spinning disc.
    group.rotation.z = 0.22;
    scene.add(group);

    // --- Sizing ------------------------------------------------------------
    const resize = () => {
      const { clientWidth, clientHeight } = host;
      if (!clientWidth || !clientHeight) return;

      const aspect = clientWidth / clientHeight;
      const halfHeight = FRUSTUM_HEIGHT / 2;
      const halfWidth = halfHeight * aspect;

      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();

      renderer.setSize(clientWidth, clientHeight, false);
      // World units -> device pixels, so dot sizes stay physically consistent.
      const scale = clientHeight / FRUSTUM_HEIGHT;
      for (const material of pointMaterials) {
        material.uniforms.uScale.value = scale;
      }
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    // --- Pointer parallax --------------------------------------------------
    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      target.x = (event.clientX / window.innerWidth) * 2 - 1;
      target.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    const onPointerLeave = () => {
      target.x = 0;
      target.y = 0;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);

    // --- Theme tracking ----------------------------------------------------
    const applyColors = () => {
      const next = readFieldColors();
      nodeColor.fromArray(toUnit(next.node));
      linkColor.fromArray(toUnit(next.link));
      accentColor.fromArray(toUnit(next.accent));
      pointMaterials.forEach((material, index) => {
        material.uniforms.uOpacity.value = next.nodeOpacity * pointWeights[index];
      });
      lineMaterials.forEach((material, index) => {
        material.uniforms.uOpacity.value = next.linkOpacity * lineWeights[index];
      });
    };
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", applyColors);
    const themeObserver = new MutationObserver(applyColors);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // --- Loop --------------------------------------------------------------
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let running = false;
    const clock = new THREE.Clock();

    const renderFrame = (time: number) => {
      for (const material of timed) {
        material.uniforms.uTime.value = time;
      }
      renderer.render(scene, camera);
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const time = clock.getElapsedTime();

      // Steady spin, plus an eased lean toward the pointer.
      pointer.x += (target.x - pointer.x) * 0.045;
      pointer.y += (target.y - pointer.y) * 0.045;
      group.rotation.y = time * 0.085 + pointer.x * 0.3;
      group.rotation.x = pointer.y * -0.15;

      renderFrame(time);
    };

    const start = () => {
      if (running) return;
      running = true;
      clock.start();
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
      clock.stop();
    };

    const syncMotion = () => {
      if (motionQuery.matches) {
        stop();
        // Reduced motion still gets the artwork, just held still.
        group.rotation.set(0, 0.6, 0.22);
        renderFrame(0);
      } else {
        start();
      }
    };
    motionQuery.addEventListener("change", syncMotion);

    // Pause whenever the stage is offscreen or the tab is hidden.
    const visibility = new IntersectionObserver(
      ([entry]) => {
        if (motionQuery.matches) return;
        if (entry.isIntersecting && !document.hidden) start();
        else stop();
      },
      { threshold: 0 },
    );
    visibility.observe(host);

    const onVisibilityChange = () => {
      if (motionQuery.matches) return;
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    syncMotion();

    return () => {
      stop();
      resizeObserver.disconnect();
      visibility.disconnect();
      themeObserver.disconnect();
      scheme.removeEventListener("change", applyColors);
      motionQuery.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      for (const item of disposables) item.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className={className} aria-hidden="true" />;
}
