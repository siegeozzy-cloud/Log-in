export type FieldColors = {
  node: [number, number, number];
  link: [number, number, number];
  accent: [number, number, number];
  nodeOpacity: number;
  linkOpacity: number;
};

const FALLBACK: FieldColors = {
  node: [13, 17, 23],
  link: [13, 17, 23],
  accent: [220, 20, 60],
  nodeOpacity: 0.85,
  linkOpacity: 0.5,
};

function readTriplet(
  styles: CSSStyleDeclaration,
  name: string,
  fallback: [number, number, number],
): [number, number, number] {
  const raw = styles.getPropertyValue(name).trim();
  if (!raw) return fallback;
  const parts = raw.split(",").map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return fallback;
  return [parts[0], parts[1], parts[2]];
}

function readNumber(
  styles: CSSStyleDeclaration,
  name: string,
  fallback: number,
): number {
  const value = Number.parseFloat(styles.getPropertyValue(name).trim());
  return Number.isNaN(value) ? fallback : value;
}

/** Reads the live network palette off :root so the canvas tracks light/dark. */
export function readFieldColors(): FieldColors {
  if (typeof window === "undefined") return FALLBACK;
  const styles = getComputedStyle(document.documentElement);
  return {
    node: readTriplet(styles, "--net-node", FALLBACK.node),
    link: readTriplet(styles, "--net-link", FALLBACK.link),
    accent: readTriplet(styles, "--net-accent", FALLBACK.accent),
    nodeOpacity: readNumber(styles, "--net-node-opacity", FALLBACK.nodeOpacity),
    linkOpacity: readNumber(styles, "--net-link-opacity", FALLBACK.linkOpacity),
  };
}

/** Normalises an rgb triplet to the 0..1 range Three.js wants. */
export function toUnit([r, g, b]: [number, number, number]): [
  number,
  number,
  number,
] {
  return [r / 255, g / 255, b / 255];
}
