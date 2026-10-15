import type { PlanObject, Point } from './types';

/** Tolérance géométrique (mm) : deux objets qui se touchent ne se chevauchent pas. */
export const EPS = 0.5;

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** cos/sin exacts pour les multiples de 90° afin d'éviter les erreurs d'arrondi des rotations usuelles. */
export function cosSin(deg: number): [number, number] {
  const n = ((deg % 360) + 360) % 360;
  if (n === 0) return [1, 0];
  if (n === 90) return [0, 1];
  if (n === 180) return [-1, 0];
  if (n === 270) return [0, -1];
  const r = (n * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)];
}

export const normalizeAngle = (deg: number): number => {
  const n = ((deg % 360) + 360) % 360;
  return Math.round(n * 1e6) / 1e6;
};

export function rotatePoint(p: Point, deg: number, origin: Point = { x: 0, y: 0 }): Point {
  const [c, s] = cosSin(deg);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

type Shaped = Pick<PlanObject, 'x' | 'y' | 'width' | 'depth' | 'rotation' | 'shape'>;

const ROUND_SEGMENTS = 32;

/** Polygone convexe représentant l'emprise de l'objet (ellipse discrétisée pour les objets ronds). */
export function objectPolygon(o: Shaped): Point[] {
  const hw = o.width / 2;
  const hd = o.depth / 2;
  const local: Point[] =
    o.shape === 'round'
      ? Array.from({ length: ROUND_SEGMENTS }, (_, i) => {
          const a = (i / ROUND_SEGMENTS) * 2 * Math.PI;
          return { x: hw * Math.cos(a), y: hd * Math.sin(a) };
        })
      : [
          { x: -hw, y: -hd },
          { x: hw, y: -hd },
          { x: hw, y: hd },
          { x: -hw, y: hd },
        ];
  return local.map((p) => {
    const r = rotatePoint(p, o.rotation);
    return { x: r.x + o.x, y: r.y + o.y };
  });
}

export function boxOfPoints(points: readonly Point[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export const objectBox = (o: Shaped): Box => boxOfPoints(objectPolygon(o));

export function unionBoxes(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  return boxes.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }));
}

export const boxesOverlap = (a: Box, b: Box, margin = 0): boolean =>
  a.minX < b.maxX + margin && b.minX < a.maxX + margin && a.minY < b.maxY + margin && b.minY < a.maxY + margin;

/** Aire signée (positive si sens trigonométrique dans un repère y vers le haut). */
export function signedArea(poly: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const polygonArea = (poly: readonly Point[]): number => Math.abs(signedArea(poly));

export function rectPolygon(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Point dans le polygone (règle pair-impair). Un point situé sur le bord (à EPS près) est considéré intérieur. */
export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (pointSegmentDistance(p, a, b) <= EPS) return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const cross = (o: Point, a: Point, b: Point): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Intersection stricte de deux segments (les contacts en extrémité ou colinéaires ne comptent pas). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  const tol = EPS * Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(d.x - c.x, d.y - c.y), 1);
  return ((d1 > tol && d2 < -tol) || (d1 < -tol && d2 > tol)) && ((d3 > tol && d4 < -tol) || (d3 < -tol && d4 > tol));
}

function edges(poly: readonly Point[]): [Point, Point][] {
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length]!]);
}

/** Recouvrement strict (pénétration > EPS) de deux polygones convexes, par le théorème des axes séparateurs. */
export function convexOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  for (const poly of [a, b]) {
    for (const [p, q] of edges(poly)) {
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      const len = Math.hypot(nx, ny);
      if (len === 0) continue;
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (const v of a) {
        const d = (v.x * nx + v.y * ny) / len;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      for (const v of b) {
        const d = (v.x * nx + v.y * ny) / len;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA - minB <= EPS || maxB - minA <= EPS) return false;
    }
  }
  return true;
}

/** Intersection de deux polygones quelconques (simples) : arêtes sécantes ou inclusion. */
export function polygonsIntersect(a: readonly Point[], b: readonly Point[]): boolean {
  if (!boxesOverlap(boxOfPoints(a), boxOfPoints(b))) return false;
  for (const [p, q] of edges(a)) for (const [r, s] of edges(b)) if (segmentsCross(p, q, r, s)) return true;
  return a.some((p) => strictlyInside(p, b)) || b.some((p) => strictlyInside(p, a)) || centroidInside(a, b) || centroidInside(b, a);
}

function strictlyInside(p: Point, poly: readonly Point[]): boolean {
  return pointInPolygon(p, poly) && !poly.some((v, i) => pointSegmentDistance(p, v, poly[(i + 1) % poly.length]!) <= EPS);
}

function centroidInside(a: readonly Point[], b: readonly Point[]): boolean {
  const c = { x: a.reduce((s, p) => s + p.x, 0) / a.length, y: a.reduce((s, p) => s + p.y, 0) / a.length };
  return strictlyInside(c, b) && strictlyInside(c, a);
}

/** Le polygone `inner` est entièrement contenu dans `outer` (bords en contact autorisés). */
export function polygonInside(inner: readonly Point[], outer: readonly Point[]): boolean {
  if (!inner.every((p) => pointInPolygon(p, outer))) return false;
  for (const [p, q] of edges(inner)) for (const [r, s] of edges(outer)) if (segmentsCross(p, q, r, s)) return false;
  return true;
}

/** Distance minimale entre deux polygones convexes (0 s'ils se recouvrent ou se touchent). */
export function polygonDistance(a: readonly Point[], b: readonly Point[]): number {
  if (convexOverlap(a, b)) return 0;
  let d = Infinity;
  for (const p of a) for (const [r, s] of edges(b)) d = Math.min(d, pointSegmentDistance(p, r, s));
  for (const p of b) for (const [r, s] of edges(a)) d = Math.min(d, pointSegmentDistance(p, r, s));
  return d;
}

/** Polygone simple : au moins 3 sommets, aire non nulle, pas d'arêtes non adjacentes sécantes. */
export function isSimplePolygon(poly: readonly Point[]): boolean {
  if (poly.length < 3 || polygonArea(poly) < 1) return false;
  const e = edges(poly);
  for (let i = 0; i < e.length; i++) {
    for (let j = i + 2; j < e.length; j++) {
      if (i === 0 && j === e.length - 1) continue;
      if (segmentsCross(e[i]![0], e[i]![1], e[j]![0], e[j]![1])) return false;
    }
  }
  return true;
}

/**
 * Paires candidates dont les boîtes englobantes (élargies de `margin`) se recouvrent.
 * Balayage trié sur x : O(n log n + k), évite le test exhaustif O(n²) sur des centaines d'objets.
 */
export function candidatePairs(boxes: readonly Box[], margin = 0): [number, number][] {
  const order = boxes.map((_, i) => i).sort((i, j) => boxes[i]!.minX - boxes[j]!.minX);
  const pairs: [number, number][] = [];
  for (let a = 0; a < order.length; a++) {
    const i = order[a]!;
    const bi = boxes[i]!;
    for (let b = a + 1; b < order.length; b++) {
      const j = order[b]!;
      const bj = boxes[j]!;
      if (bj.minX >= bi.maxX + margin) break;
      if (boxesOverlap(bi, bj, margin)) pairs.push(i < j ? [i, j] : [j, i]);
    }
  }
  return pairs;
}

export const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

export const snapTo = (v: number, step: number): number => Math.round(v / step) * step;
