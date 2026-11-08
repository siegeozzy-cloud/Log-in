"use client";

import { useEffect, useRef } from "react";
import { readFieldColors } from "./theme-colors";

type Strand = {
  x: number;
  y: number;
  angle: number;
  /** turn rate, radians per second */
  curl: number;
  speed: number;
  width: number;
  /** 0..1 life, drives the fade in and out */
  life: number;
  ttl: number;
  accent: boolean;
  trail: Array<{ x: number; y: number }>;
};

const STRAND_COUNT = 44;
/** Trail points kept per strand — more points, longer streak. */
const MAX_TRAIL = 42;
/** Distance between recorded trail points, in CSS pixels. */
const SEGMENT = 7;
/** Peak opacity of a strand. Low on purpose — this layer sits under a form. */
const PEAK_ALPHA = 0.16;
/** Half-width of the launch band at the centre, as a share of the viewport. */
const LAUNCH_SPREAD = 0.05;

/**
 * Strands blast outward from behind the globe toward the left and right
 * edges, then fade. Deliberately low-contrast so they never compete with the
 * form sitting on top of them.
 */
export default function AmbientLines({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let pixelRatio = 1;

    const random = (min: number, max: number) =>
      min + Math.random() * (max - min);

    const spawn = (strand: Strand, initial = false) => {
      const goingRight = Math.random() < 0.5;

      // Launch from a narrow band down the middle, where the globe sits.
      strand.x = width * (0.5 + random(-LAUNCH_SPREAD, LAUNCH_SPREAD));
      strand.y = random(-0.05, 1.05) * height;
      // Near-horizontal, so the field reads as a blast out to the edges.
      strand.angle = (goingRight ? 0 : Math.PI) + random(-0.3, 0.3);
      strand.curl = random(-0.07, 0.07);
      strand.speed = random(90, 280);
      strand.width = random(0.6, 1.6);
      strand.accent = Math.random() < 0.14;
      strand.trail = [{ x: strand.x, y: strand.y }];

      // Live just long enough to clear the edge it is heading for.
      strand.ttl = Math.max(
        1.6,
        ((width * 0.62) / strand.speed) * random(0.8, 1.25),
      );
      strand.life = initial ? random(0, strand.ttl) : 0;
    };

    const strands: Strand[] = Array.from({ length: STRAND_COUNT }, () => {
      const strand: Strand = {
        x: 0,
        y: 0,
        angle: 0,
        curl: 0,
        speed: 0,
        width: 1,
        life: 0,
        ttl: 1,
        accent: false,
        trail: [],
      };
      spawn(strand, true);
      return strand;
    });

    let palette = readFieldColors();
    const applyColors = () => {
      palette = readFieldColors();
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const [nr, ng, nb] = palette.link;
      const [ar, ag, ab] = palette.accent;

      for (const strand of strands) {
        if (strand.trail.length < 2) continue;

        // Triangular envelope: a quick flare on launch, a long fade out, so
        // nothing ever pops on or off.
        const t = strand.life / strand.ttl;
        const envelope = Math.min(t / 0.12, 1, (1 - t) / 0.4);
        const alpha = Math.max(0, envelope) * PEAK_ALPHA;
        if (alpha <= 0.002) continue;

        const [r, g, b] = strand.accent ? [ar, ag, ab] : [nr, ng, nb];
        ctx.lineWidth = strand.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Fade along the streak so the tail dissolves behind the head.
        const tail = strand.trail[0];
        const head = strand.trail[strand.trail.length - 1];
        const gradient = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${alpha})`);
        ctx.strokeStyle = gradient;

        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        for (let i = 1; i < strand.trail.length; i += 1) {
          ctx.lineTo(strand.trail[i].x, strand.trail[i].y);
        }
        ctx.stroke();

        // A faint dot at the leading edge, echoing the nodes on the globe.
        ctx.beginPath();
        ctx.arc(head.x, head.y, strand.width * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 1.9})`;
        ctx.fill();
      }
    };

    const step = (dt: number) => {
      for (const strand of strands) {
        strand.life += dt;
        if (strand.life >= strand.ttl) {
          spawn(strand);
          continue;
        }

        strand.angle += strand.curl * dt;
        strand.x += Math.cos(strand.angle) * strand.speed * dt;
        strand.y += Math.sin(strand.angle) * strand.speed * dt;

        const last = strand.trail[strand.trail.length - 1];
        if (Math.hypot(strand.x - last.x, strand.y - last.y) >= SEGMENT) {
          strand.trail.push({ x: strand.x, y: strand.y });
          if (strand.trail.length > MAX_TRAIL) strand.trail.shift();
        }
      }
    };

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = 0;
    let running = false;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Clamped so a backgrounded tab does not teleport every strand.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      step(dt);
      draw();
    };

    const start = () => {
      if (running || motionQuery.matches) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
    };

    // Trails are drawn from travelled distance, so a cold start would show
    // a field of lone dots for the first second. Fast-forward before paint.
    const warmUp = () => {
      for (let i = 0; i < 120; i += 1) step(1 / 30);
    };

    const syncMotion = () => {
      warmUp();
      if (motionQuery.matches) {
        stop();
        draw();
      } else {
        start();
      }
    };
    motionQuery.addEventListener("change", syncMotion);

    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", applyColors);
    const themeObserver = new MutationObserver(applyColors);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    syncMotion();

    return () => {
      stop();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      scheme.removeEventListener("change", applyColors);
      motionQuery.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
