export type ShapeKind = "triangle" | "rectangle" | "ellipse" | "mixed";
export type RegionMode = "global" | "residual";

export type SearchConfig = {
  id: string;
  label: string;
  shape: ShapeKind;
  region: RegionMode;
  proposals: number;
  mutations: number;
};

export type Candidate = {
  kind: Exclude<ShapeKind, "mixed">;
  cx: number;
  cy: number;
  width: number;
  height: number;
  points?: Array<[number, number]>;
  color: [number, number, number];
  alpha: number;
};

export type SearchResult = {
  config: SearchConfig;
  before: number;
  after: number;
  gain: number;
  utility: number;
  evaluations: number;
  elapsedMs: number;
  candidate: Candidate | null;
};

export type OracleStep = {
  current: Uint8ClampedArray;
  results: SearchResult[];
  winner: SearchResult | null;
};

type Rect = { x1: number; y1: number; x2: number; y2: number };
type Rng = () => number;

export const DEFAULT_SEARCH_CONFIGS: SearchConfig[] = [
  { id: "tri-local-48", label: "Triangle · residual", shape: "triangle", region: "residual", proposals: 48, mutations: 20 },
  { id: "rect-local-48", label: "Rectangle · residual", shape: "rectangle", region: "residual", proposals: 48, mutations: 20 },
  { id: "ellipse-local-48", label: "Ellipse · residual", shape: "ellipse", region: "residual", proposals: 48, mutations: 20 },
  { id: "mixed-local-72", label: "Mixed · residual", shape: "mixed", region: "residual", proposals: 72, mutations: 28 },
  { id: "mixed-global-96", label: "Mixed · global", shape: "mixed", region: "global", proposals: 96, mutations: 28 },
  { id: "mixed-cheap-24", label: "Mixed · cheap", shape: "mixed", region: "global", proposals: 24, mutations: 8 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scoreSse(target: Uint8ClampedArray, current: Uint8ClampedArray) {
  let total = 0;
  for (let i = 0; i < target.length; i += 4) {
    const dr = target[i] - current[i];
    const dg = target[i + 1] - current[i + 1];
    const db = target[i + 2] - current[i + 2];
    total += dr * dr + dg * dg + db * db;
  }
  return total;
}

function rmseFromSse(sse: number, width: number, height: number) {
  return Math.sqrt(sse / (width * height * 3)) / 255;
}

export function rmse(target: Uint8ClampedArray, current: Uint8ClampedArray, width: number, height: number) {
  return rmseFromSse(scoreSse(target, current), width, height);
}

export function createAverageCanvas(target: Uint8ClampedArray, width: number, height: number) {
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = width * height;
  for (let i = 0; i < target.length; i += 4) {
    r += target[i];
    g += target[i + 1];
    b += target[i + 2];
  }
  const output = new Uint8ClampedArray(target.length);
  const color = [Math.round(r / pixels), Math.round(g / pixels), Math.round(b / pixels)] as const;
  for (let i = 0; i < output.length; i += 4) {
    output[i] = color[0];
    output[i + 1] = color[1];
    output[i + 2] = color[2];
    output[i + 3] = 255;
  }
  return output;
}

function topResidualRegion(
  target: Uint8ClampedArray,
  current: Uint8ClampedArray,
  width: number,
  height: number,
  grid = 4,
): Rect {
  let bestScore = -1;
  let best: Rect = { x1: 0, y1: 0, x2: width - 1, y2: height - 1 };
  const tileW = Math.ceil(width / grid);
  const tileH = Math.ceil(height / grid);

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x1 = gx * tileW;
      const y1 = gy * tileH;
      const x2 = Math.min(width - 1, x1 + tileW - 1);
      const y2 = Math.min(height - 1, y1 + tileH - 1);
      let score = 0;
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          const i = (y * width + x) * 4;
          const dr = target[i] - current[i];
          const dg = target[i + 1] - current[i + 1];
          const db = target[i + 2] - current[i + 2];
          score += dr * dr + dg * dg + db * db;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = { x1, y1, x2, y2 };
      }
    }
  }

  const padX = Math.round(tileW * 0.55);
  const padY = Math.round(tileH * 0.55);
  return {
    x1: clamp(best.x1 - padX, 0, width - 1),
    y1: clamp(best.y1 - padY, 0, height - 1),
    x2: clamp(best.x2 + padX, 0, width - 1),
    y2: clamp(best.y2 + padY, 0, height - 1),
  };
}

function pickKind(kind: ShapeKind, rng: Rng): Candidate["kind"] {
  if (kind !== "mixed") return kind;
  const kinds: Candidate["kind"][] = ["triangle", "rectangle", "ellipse"];
  return kinds[Math.floor(rng() * kinds.length)];
}

function sampleCandidate(config: SearchConfig, region: Rect, width: number, height: number, rng: Rng): Candidate {
  const kind = pickKind(config.shape, rng);
  const regionW = Math.max(1, region.x2 - region.x1 + 1);
  const regionH = Math.max(1, region.y2 - region.y1 + 1);
  const cx = region.x1 + rng() * regionW;
  const cy = region.y1 + rng() * regionH;
  const sizeBase = Math.min(width, height);
  const shapeW = clamp(sizeBase * (0.08 + rng() * 0.34), 3, width);
  const shapeH = clamp(sizeBase * (0.08 + rng() * 0.34), 3, height);

  const candidate: Candidate = {
    kind,
    cx,
    cy,
    width: shapeW,
    height: shapeH,
    color: [128, 128, 128],
    alpha: 0.58,
  };

  if (kind === "triangle") {
    candidate.points = [
      [cx - shapeW * (0.35 + rng() * 0.2), cy + shapeH * (0.25 + rng() * 0.2)],
      [cx + shapeW * (0.35 + rng() * 0.2), cy + shapeH * (0.25 + rng() * 0.2)],
      [cx + (rng() - 0.5) * shapeW * 0.35, cy - shapeH * (0.35 + rng() * 0.25)],
    ];
  }

  return candidate;
}

function candidateBounds(candidate: Candidate, width: number, height: number): Rect {
  if (candidate.kind === "triangle" && candidate.points) {
    const xs = candidate.points.map((p) => p[0]);
    const ys = candidate.points.map((p) => p[1]);
    return {
      x1: clamp(Math.floor(Math.min(...xs)), 0, width - 1),
      y1: clamp(Math.floor(Math.min(...ys)), 0, height - 1),
      x2: clamp(Math.ceil(Math.max(...xs)), 0, width - 1),
      y2: clamp(Math.ceil(Math.max(...ys)), 0, height - 1),
    };
  }
  return {
    x1: clamp(Math.floor(candidate.cx - candidate.width / 2), 0, width - 1),
    y1: clamp(Math.floor(candidate.cy - candidate.height / 2), 0, height - 1),
    x2: clamp(Math.ceil(candidate.cx + candidate.width / 2), 0, width - 1),
    y2: clamp(Math.ceil(candidate.cy + candidate.height / 2), 0, height - 1),
  };
}

function pointInTriangle(px: number, py: number, points: Array<[number, number]>) {
  const [a, b, c] = points;
  const sign = (p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number) =>
    (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
  const d1 = sign(px, py, a[0], a[1], b[0], b[1]);
  const d2 = sign(px, py, b[0], b[1], c[0], c[1]);
  const d3 = sign(px, py, c[0], c[1], a[0], a[1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function contains(candidate: Candidate, x: number, y: number) {
  if (candidate.kind === "triangle" && candidate.points) {
    return pointInTriangle(x + 0.5, y + 0.5, candidate.points);
  }
  const nx = (x + 0.5 - candidate.cx) / Math.max(0.5, candidate.width / 2);
  const ny = (y + 0.5 - candidate.cy) / Math.max(0.5, candidate.height / 2);
  if (candidate.kind === "ellipse") return nx * nx + ny * ny <= 1;
  return Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
}

function evaluateCandidate(
  target: Uint8ClampedArray,
  current: Uint8ClampedArray,
  width: number,
  height: number,
  baseSse: number,
  candidate: Candidate,
) {
  const bounds = candidateBounds(candidate, width, height);
  const alpha = candidate.alpha;
  let count = 0;
  let cr = 0;
  let cg = 0;
  let cb = 0;

  for (let y = bounds.y1; y <= bounds.y2; y++) {
    for (let x = bounds.x1; x <= bounds.x2; x++) {
      if (!contains(candidate, x, y)) continue;
      const i = (y * width + x) * 4;
      cr += (target[i] - (1 - alpha) * current[i]) / alpha;
      cg += (target[i + 1] - (1 - alpha) * current[i + 1]) / alpha;
      cb += (target[i + 2] - (1 - alpha) * current[i + 2]) / alpha;
      count++;
    }
  }

  if (!count) return { score: Number.POSITIVE_INFINITY, candidate };

  const color: [number, number, number] = [
    clamp(Math.round(cr / count), 0, 255),
    clamp(Math.round(cg / count), 0, 255),
    clamp(Math.round(cb / count), 0, 255),
  ];
  let nextSse = baseSse;

  for (let y = bounds.y1; y <= bounds.y2; y++) {
    for (let x = bounds.x1; x <= bounds.x2; x++) {
      if (!contains(candidate, x, y)) continue;
      const i = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const oldDiff = target[i + channel] - current[i + channel];
        const next = current[i + channel] * (1 - alpha) + color[channel] * alpha;
        const newDiff = target[i + channel] - next;
        nextSse += newDiff * newDiff - oldDiff * oldDiff;
      }
    }
  }

  return {
    score: rmseFromSse(Math.max(0, nextSse), width, height),
    candidate: { ...candidate, color },
  };
}

function mutateCandidate(candidate: Candidate, width: number, height: number, rng: Rng): Candidate {
  const next: Candidate = {
    ...candidate,
    color: [...candidate.color] as [number, number, number],
    points: candidate.points?.map(([x, y]) => [x, y] as [number, number]),
  };
  const jitter = Math.min(width, height) * 0.08;
  const op = Math.floor(rng() * 3);

  if (next.kind === "triangle" && next.points) {
    if (op === 0) {
      const index = Math.floor(rng() * 3);
      next.points[index][0] += (rng() - 0.5) * jitter * 2;
      next.points[index][1] += (rng() - 0.5) * jitter * 2;
    } else {
      const dx = (rng() - 0.5) * jitter;
      const dy = (rng() - 0.5) * jitter;
      next.points = next.points.map(([x, y]) => [x + dx, y + dy]);
      next.cx += dx;
      next.cy += dy;
    }
  } else if (op === 0) {
    next.cx = clamp(next.cx + (rng() - 0.5) * jitter * 2, 0, width - 1);
    next.cy = clamp(next.cy + (rng() - 0.5) * jitter * 2, 0, height - 1);
  } else if (op === 1) {
    next.width = clamp(next.width * (0.72 + rng() * 0.65), 2, width);
    next.height = clamp(next.height * (0.72 + rng() * 0.65), 2, height);
  } else {
    next.alpha = clamp(next.alpha + (rng() - 0.5) * 0.22, 0.2, 0.9);
  }
  return next;
}

export function applyCandidate(current: Uint8ClampedArray, width: number, height: number, candidate: Candidate) {
  const output = new Uint8ClampedArray(current);
  const bounds = candidateBounds(candidate, width, height);
  for (let y = bounds.y1; y <= bounds.y2; y++) {
    for (let x = bounds.x1; x <= bounds.x2; x++) {
      if (!contains(candidate, x, y)) continue;
      const i = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        output[i + channel] = Math.round(
          output[i + channel] * (1 - candidate.alpha) + candidate.color[channel] * candidate.alpha,
        );
      }
      output[i + 3] = 255;
    }
  }
  return output;
}

export function runSearchConfig(
  target: Uint8ClampedArray,
  current: Uint8ClampedArray,
  width: number,
  height: number,
  config: SearchConfig,
  seed: number,
): SearchResult {
  const started = performance.now();
  const rng = mulberry32(seed);
  const baseSse = scoreSse(target, current);
  const before = rmseFromSse(baseSse, width, height);
  const region =
    config.region === "residual"
      ? topResidualRegion(target, current, width, height)
      : { x1: 0, y1: 0, x2: width - 1, y2: height - 1 };

  let bestScore = before;
  let bestCandidate: Candidate | null = null;
  let evaluations = 0;

  for (let i = 0; i < config.proposals; i++) {
    const candidate = sampleCandidate(config, region, width, height, rng);
    const evaluated = evaluateCandidate(target, current, width, height, baseSse, candidate);
    evaluations++;
    if (evaluated.score < bestScore) {
      bestScore = evaluated.score;
      bestCandidate = evaluated.candidate;
    }
  }

  if (bestCandidate) {
    let incumbent = bestCandidate;
    for (let i = 0; i < config.mutations; i++) {
      const candidate = mutateCandidate(incumbent, width, height, rng);
      const evaluated = evaluateCandidate(target, current, width, height, baseSse, candidate);
      evaluations++;
      if (evaluated.score < bestScore) {
        bestScore = evaluated.score;
        incumbent = evaluated.candidate;
        bestCandidate = incumbent;
      }
    }
  }

  const gain = Math.max(0, before - bestScore);
  const utility = gain - evaluations * 0.0000025;
  return {
    config,
    before,
    after: bestScore,
    gain,
    utility,
    evaluations,
    elapsedMs: performance.now() - started,
    candidate: bestCandidate,
  };
}

export function runOracleStep(
  target: Uint8ClampedArray,
  current: Uint8ClampedArray,
  width: number,
  height: number,
  step: number,
  configs = DEFAULT_SEARCH_CONFIGS,
): OracleStep {
  const results = configs.map((config, index) =>
    runSearchConfig(target, current, width, height, config, (step + 1) * 1009 + index * 7919),
  );
  const winner = results.reduce<SearchResult | null>((best, result) => {
    if (!result.candidate || result.gain <= 0) return best;
    if (!best || result.utility > best.utility) return result;
    return best;
  }, null);

  return {
    current: winner?.candidate ? applyCandidate(current, width, height, winner.candidate) : new Uint8ClampedArray(current),
    results,
    winner,
  };
}
