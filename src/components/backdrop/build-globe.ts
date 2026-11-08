/**
 * Builds the synthetic globe behind the form, in layers:
 *
 *   surface  dense dots over the sphere, thinned into patches
 *   grid     latitude rings and meridians on the sphere
 *   web      coarse nodes on the sphere, plus the links between neighbours
 *   links    those links
 *   arcs     long sweeping orbits outside the sphere
 *   dotted   squiggling orbital loops drawn as dots, in the accent colour
 *
 * Pure data — no Three.js types — so it stays testable and cheap to tweak.
 */

export type PointLayer = {
  /** xyz per dot */
  positions: Float32Array;
  /** world-space radius per dot */
  sizes: Float32Array;
  /** drift seed, 3 floats per dot */
  seeds: Float32Array;
  /** 1 where the dot takes the accent colour */
  accents: Float32Array;
  count: number;
};

export type LineLayer = {
  /** xyz per endpoint, two endpoints per segment */
  positions: Float32Array;
  /** drift seed per endpoint */
  seeds: Float32Array;
  /** 0..1 opacity weight per endpoint */
  strengths: Float32Array;
  /** number of segments */
  count: number;
};

export type GlobeData = {
  surface: PointLayer;
  web: PointLayer;
  dotted: PointLayer;
  grid: LineLayer;
  links: LineLayer;
  arcs: LineLayer;
};

export type GlobeOptions = {
  radius?: number;
  /** candidate dots over the sphere, before patch thinning */
  surfaceDots?: number;
  /** coarse nodes that take part in the link graph */
  webNodes?: number;
  /** nodes closer than this fraction of the radius get linked */
  linkSpan?: number;
  maxLinks?: number;
  latitudeRings?: number;
  meridians?: number;
  orbitCount?: number;
  dottedCurves?: number;
  seed?: number;
};

type Vec3 = [number, number, number];

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Small deterministic PRNG so the globe looks identical on every load. */
function mulberry32(a: number) {
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Collects dots, then freezes them into typed arrays in one pass. */
class PointBuilder {
  private positions: number[] = [];
  private sizes: number[] = [];
  private seeds: number[] = [];
  private accents: number[] = [];

  constructor(private random: () => number) {}

  add(position: Vec3, size: number, accent: boolean) {
    this.positions.push(position[0], position[1], position[2]);
    this.sizes.push(size);
    this.seeds.push(
      this.random() * Math.PI * 2,
      this.random() * Math.PI * 2,
      this.random() * Math.PI * 2,
    );
    this.accents.push(accent ? 1 : 0);
  }

  build(): PointLayer {
    return {
      positions: Float32Array.from(this.positions),
      sizes: Float32Array.from(this.sizes),
      seeds: Float32Array.from(this.seeds),
      accents: Float32Array.from(this.accents),
      count: this.sizes.length,
    };
  }
}

/** Collects line segments, sharing one drift seed per segment. */
class LineBuilder {
  private positions: number[] = [];
  private seeds: number[] = [];
  private strengths: number[] = [];
  /** Segments added so far — read by callers that cap their own output. */
  count = 0;

  constructor(private random: () => number) {}

  /** Both endpoints share a seed so the segment drifts as one piece. */
  segment(a: Vec3, b: Vec3, strength: number, seed?: Vec3) {
    const s: Vec3 = seed ?? [
      this.random() * Math.PI * 2,
      this.random() * Math.PI * 2,
      this.random() * Math.PI * 2,
    ];
    this.positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    this.seeds.push(s[0], s[1], s[2], s[0], s[1], s[2]);
    this.strengths.push(strength, strength);
    this.count += 1;
  }

  /** Turns a sampled curve into consecutive segments. */
  strip(points: Vec3[], strengthAt: (index: number) => number, seed: Vec3) {
    for (let i = 0; i < points.length - 1; i += 1) {
      this.segment(
        points[i],
        points[i + 1],
        Math.min(strengthAt(i), strengthAt(i + 1)),
        seed,
      );
    }
  }

  build(): LineLayer {
    return {
      positions: Float32Array.from(this.positions),
      seeds: Float32Array.from(this.seeds),
      strengths: Float32Array.from(this.strengths),
      count: this.count,
    };
  }
}

/** Rotate a vector about X then Z — enough to tilt an orbit plane. */
function tilt(v: Vec3, ax: number, az: number): Vec3 {
  const y1 = v[1] * Math.cos(ax) - v[2] * Math.sin(ax);
  const z1 = v[1] * Math.sin(ax) + v[2] * Math.cos(ax);
  const x1 = v[0];
  return [
    x1 * Math.cos(az) - y1 * Math.sin(az),
    x1 * Math.sin(az) + y1 * Math.cos(az),
    z1,
  ];
}

/** Evenly spaced direction vectors over a unit sphere. */
function fibonacciSphere(index: number, total: number): Vec3 {
  const y = 1 - (index / Math.max(1, total - 1)) * 2;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * GOLDEN_ANGLE;
  return [Math.cos(theta) * ring, y, Math.sin(theta) * ring];
}

/**
 * Cheap smooth-ish field used to thin the surface dots into patches, so the
 * globe reads as landmasses rather than an even stipple.
 */
function patchField([x, y, z]: Vec3): number {
  return (
    Math.sin(x * 2.7 + 1.3) * Math.sin(y * 2.1 - 0.6) * Math.sin(z * 2.4 + 2.2) +
    0.55 * Math.sin(x * 4.9 - 2.1) * Math.sin(z * 4.3 + 0.9)
  );
}

export function buildGlobe(options: GlobeOptions = {}): GlobeData {
  const {
    radius = 4.2,
    surfaceDots = 2600,
    webNodes = 230,
    linkSpan = 0.4,
    maxLinks = 1400,
    latitudeRings = 7,
    meridians = 10,
    orbitCount = 7,
    dottedCurves = 5,
    seed = 20260117,
  } = options;

  const random = mulberry32(seed);
  const between = (min: number, max: number) => min + random() * (max - min);

  const surface = new PointBuilder(random);
  const web = new PointBuilder(random);
  const dotted = new PointBuilder(random);
  const grid = new LineBuilder(random);
  const links = new LineBuilder(random);
  const arcs = new LineBuilder(random);

  // --- Surface: the dotted skin of the globe --------------------------------
  for (let i = 0; i < surfaceDots; i += 1) {
    const dir = fibonacciSphere(i, surfaceDots);
    const field = patchField(dir);

    // Patch thinning. The random term keeps the patch borders ragged.
    if (field + between(-0.45, 0.45) < -0.1) continue;

    // Dots sit just off the true surface so the sphere has a little thickness.
    const r = radius * between(0.985, 1.015);
    const dense = Math.min(1, Math.max(0, field + 0.5));

    surface.add(
      [dir[0] * r, dir[1] * r, dir[2] * r],
      // Denser parts of the field carry the fatter dots.
      (0.018 + dense * 0.03) * between(0.7, 1.4),
      random() < 0.055,
    );
  }

  // --- Grid: latitude rings and meridians -----------------------------------
  const ringSamples = 72;
  for (let i = 1; i <= latitudeRings; i += 1) {
    const phi = (i / (latitudeRings + 1)) * Math.PI;
    const y = Math.cos(phi) * radius;
    const ringRadius = Math.sin(phi) * radius;
    const strength = 0.26 + Math.sin(phi) * 0.2;
    const seedVec: Vec3 = [
      random() * Math.PI * 2,
      random() * Math.PI * 2,
      random() * Math.PI * 2,
    ];

    const points: Vec3[] = [];
    for (let s = 0; s <= ringSamples; s += 1) {
      const theta = (s / ringSamples) * Math.PI * 2;
      points.push([Math.cos(theta) * ringRadius, y, Math.sin(theta) * ringRadius]);
    }
    grid.strip(points, () => strength, seedVec);
  }

  const meridianSamples = 56;
  for (let i = 0; i < meridians; i += 1) {
    const theta = (i / meridians) * Math.PI * 2;
    const seedVec: Vec3 = [
      random() * Math.PI * 2,
      random() * Math.PI * 2,
      random() * Math.PI * 2,
    ];

    const points: Vec3[] = [];
    for (let s = 0; s <= meridianSamples; s += 1) {
      const phi = (s / meridianSamples) * Math.PI;
      const ringRadius = Math.sin(phi) * radius;
      points.push([
        Math.cos(theta) * ringRadius,
        Math.cos(phi) * radius,
        Math.sin(theta) * ringRadius,
      ]);
    }
    // Fade meridians out toward the poles, where they all bunch together.
    grid.strip(
      points,
      (index) => {
        const p = index / meridianSamples;
        return 0.34 * Math.min(1, p / 0.22, (1 - p) / 0.22);
      },
      seedVec,
    );
  }

  // --- Web: coarse nodes on the sphere, linked to their neighbours ----------
  const webPositions: Vec3[] = [];
  for (let i = 0; i < webNodes; i += 1) {
    const dir = fibonacciSphere(i, webNodes);
    const r = radius * between(1.0, 1.035);
    const position: Vec3 = [dir[0] * r, dir[1] * r, dir[2] * r];
    webPositions.push(position);
    web.add(position, between(0.035, 0.1), random() < 0.06);
  }

  const linkDistance = radius * linkSpan;
  const maxDistSq = linkDistance * linkDistance;
  outer: for (let i = 0; i < webPositions.length; i += 1) {
    for (let j = i + 1; j < webPositions.length; j += 1) {
      const a = webPositions[i];
      const b = webPositions[j];
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      const dz = a[2] - b[2];
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq > maxDistSq) continue;

      links.segment(a, b, 1 - Math.sqrt(distSq) / linkDistance);
      if (links.count >= maxLinks) break outer;
    }
  }

  // --- Orbits: long sweeping curves outside the globe -----------------------
  for (let i = 0; i < orbitCount; i += 1) {
    const ax = between(-0.8, 0.8);
    const az = between(-0.7, 0.7);
    const e1 = tilt([1, 0, 0], ax, az);
    const e2 = tilt([0, 0, 1], ax, az);
    const rx = radius * between(1.1, 1.62);
    const ry = radius * between(1.1, 1.62);
    const start = random() * Math.PI * 2;
    const sweep = between(Math.PI * 1.2, Math.PI * 2);
    const samples = 110;
    const strength = between(0.22, 0.58);
    const seedVec: Vec3 = [
      random() * Math.PI * 2,
      random() * Math.PI * 2,
      random() * Math.PI * 2,
    ];

    const points: Vec3[] = [];
    for (let s = 0; s <= samples; s += 1) {
      const theta = start + (s / samples) * sweep;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      points.push([
        e1[0] * rx * cos + e2[0] * ry * sin,
        e1[1] * rx * cos + e2[1] * ry * sin,
        e1[2] * rx * cos + e2[2] * ry * sin,
      ]);
    }

    // Taper both ends to nothing so orbits dissolve rather than stopping dead.
    arcs.strip(
      points,
      (index) => {
        const p = index / samples;
        return strength * Math.min(1, p / 0.16, (1 - p) / 0.16);
      },
      seedVec,
    );
  }

  // --- Dotted curves: the loose accent squiggles -----------------------------
  for (let i = 0; i < dottedCurves; i += 1) {
    const ax = between(-0.9, 0.9);
    const az = between(-0.8, 0.8);
    const e1 = tilt([1, 0, 0], ax, az);
    const e2 = tilt([0, 0, 1], ax, az);
    const base = radius * between(1.08, 1.5);
    const lobes = Math.floor(between(2, 5));
    const wobble = between(0.12, 0.3);
    const phase = random() * Math.PI * 2;
    const samples = Math.floor(between(90, 150));

    for (let s = 0; s < samples; s += 1) {
      const theta = (s / samples) * Math.PI * 2;
      // Modulating the radius turns the ring into a looping squiggle.
      const r =
        base * (1 + Math.sin(theta * lobes + phase) * wobble) +
        Math.sin(theta * 7 + phase) * 0.12;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      dotted.add(
        [e1[0] * r * cos + e2[0] * r * sin, e1[1] * r * cos + e2[1] * r * sin, e1[2] * r * cos + e2[2] * r * sin],
        between(0.016, 0.034),
        true,
      );
    }
  }

  return {
    surface: surface.build(),
    web: web.build(),
    dotted: dotted.build(),
    grid: grid.build(),
    links: links.build(),
    arcs: arcs.build(),
  };
}
