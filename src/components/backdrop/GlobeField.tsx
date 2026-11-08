"use client";

import dynamic from "next/dynamic";

/**
 * Public entry point for the globe. Three.js is browser-only and sizeable,
 * so the renderer is pulled in through a client-side dynamic import: it stays
 * out of the server render and out of the first bundle, and the form paints
 * before the artwork arrives.
 */
const GlobeCanvas = dynamic(() => import("./GlobeCanvas"), {
  ssr: false,
  loading: () => null,
});

export default function GlobeField({ className }: { className?: string }) {
  return <GlobeCanvas className={className} />;
}
