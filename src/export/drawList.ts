import { CATEGORY_LABELS, ZONE_TYPE_LABELS } from '../domain/catalog';
import { boxOfPoints, distance, objectPolygon, rotatePoint, signedArea, type Box } from '../domain/geometry';
import type { Category, PlanDocument, PlanObject, Point } from '../domain/types';
import { formatLength } from '../domain/units';

/** Primitives vectorielles en millimètres, partagées par les exports SVG et PDF. */
export type Prim =
  | { t: 'poly'; pts: Point[]; fill: string | null; stroke: string | null; width: number; opacity: number; dash: boolean }
  | { t: 'line'; a: Point; b: Point; stroke: string; width: number; dash: boolean }
  | { t: 'text'; x: number; y: number; text: string; size: number; color: string; rotation: number };

export const VARIANTS = {
  general: { label: 'Plan général', categories: null },
  mobilier: { label: 'Plan mobilier', categories: ['mobilier', 'structure', 'personnalise'] },
  technique: { label: 'Plan technique', categories: ['scene', 'audiovisuel', 'structure'] },
  stands: { label: 'Plan de stands', categories: ['exposition', 'logistique', 'structure'] },
  cote: { label: 'Plan coté', categories: null },
} as const satisfies Record<string, { label: string; categories: readonly Category[] | null }>;
export type Variant = keyof typeof VARIANTS;

export function objectsForVariant(doc: PlanDocument, variant: Variant): PlanObject[] {
  const cats = VARIANTS[variant].categories as readonly Category[] | null;
  return cats ? doc.objects.filter((o) => cats.includes(o.category)) : doc.objects;
}

const local = (o: PlanObject, p: Point): Point => {
  const r = rotatePoint(p, o.rotation);
  return { x: r.x + o.x, y: r.y + o.y };
};

function objectPrims(o: PlanObject): Prim[] {
  const out: Prim[] = [
    { t: 'poly', pts: objectPolygon(o), fill: o.color, stroke: '#1f2937', width: 15, opacity: o.role === 'suspendu' ? 0.35 : 0.85, dash: o.role === 'suspendu' },
  ];
  const hw = o.width / 2;
  const hd = o.depth / 2;
  if (o.shape === 'chair') {
    // Dossier du côté +y local.
    out.push({ t: 'line', a: local(o, { x: -hw, y: hd * 0.6 }), b: local(o, { x: hw, y: hd * 0.6 }), stroke: '#111827', width: 25, dash: false });
  } else if (o.shape === 'door') {
    // Battant ouvrant vers +y local (côté salle).
    const steps = 12;
    const arc = Array.from({ length: steps + 1 }, (_, i) => {
      const a = (Math.PI / 2) * (i / steps);
      return local(o, { x: -hw + o.width * Math.cos(a), y: hd + o.width * Math.sin(a) });
    });
    for (let i = 0; i < steps; i++) out.push({ t: 'line', a: arc[i]!, b: arc[i + 1]!, stroke: '#92400e', width: 10, dash: true });
    out.push({ t: 'line', a: local(o, { x: -hw, y: hd }), b: local(o, { x: -hw, y: hd + o.width }), stroke: '#92400e', width: 15, dash: false });
  } else if (o.shape === 'stage') {
    out.push({ t: 'line', a: local(o, { x: -hw, y: -hd }), b: local(o, { x: hw, y: hd }), stroke: '#64748b', width: 10, dash: false });
    out.push({ t: 'line', a: local(o, { x: hw, y: -hd }), b: local(o, { x: -hw, y: hd }), stroke: '#64748b', width: 10, dash: false });
  }
  const named = o.role === 'table' || o.role === 'scene' || o.role === 'stand' || o.role === 'service';
  const text = o.label || (named ? o.name.split(' (')[0]! : '');
  if (text && Math.min(o.width, o.depth) >= 400) {
    const size = Math.max(120, Math.min(400, Math.min(o.width, o.depth) / 4));
    out.push({ t: 'text', x: o.x, y: o.y, text, size, color: o.shape === 'stage' ? '#ffffff' : '#111827', rotation: 0 });
  }
  return out;
}

function dimension(a: Point, b: Point, offset: number, unit: PlanDocument['settings']['displayUnit']): Prim[] {
  const len = distance(a, b);
  if (len < 1) return [];
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const a2 = { x: a.x + nx * offset, y: a.y + ny * offset };
  const b2 = { x: b.x + nx * offset, y: b.y + ny * offset };
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const upright = angle > 90 || angle < -90 ? angle + 180 : angle;
  const side = offset >= 0 ? 1 : -1;
  return [
    { t: 'line', a: a2, b: b2, stroke: '#0f172a', width: 12, dash: false },
    { t: 'line', a, b: a2, stroke: '#0f172a', width: 8, dash: true },
    { t: 'line', a: b, b: b2, stroke: '#0f172a', width: 8, dash: true },
    { t: 'text', x: (a2.x + b2.x) / 2 + nx * 200 * side, y: (a2.y + b2.y) / 2 + ny * 200 * side, text: formatLength(len, unit), size: 220, color: '#0f172a', rotation: upright },
  ];
}

export interface DrawList {
  prims: Prim[];
  bounds: Box;
  objects: PlanObject[];
}

/** `onlyIds` : restreint l'export à une sélection (fond de salle conservé, cadrage sur la sélection). */
export function buildDrawList(doc: PlanDocument, variant: Variant, onlyIds?: ReadonlySet<string>): DrawList {
  const prims: Prim[] = [];
  const outline = doc.room.outline;
  const unit = doc.settings.displayUnit;
  prims.push({ t: 'poly', pts: outline, fill: '#ffffff', stroke: '#111827', width: Math.max(40, doc.room.wallThickness), opacity: 1, dash: false });
  for (const z of doc.zones) {
    prims.push({ t: 'poly', pts: z.points, fill: z.color, stroke: z.color, width: 20, opacity: 0.18, dash: true });
    const b = boxOfPoints(z.points);
    prims.push({ t: 'text', x: (b.minX + b.maxX) / 2, y: b.minY + 300, text: z.name || ZONE_TYPE_LABELS[z.type], size: 220, color: '#334155', rotation: 0 });
  }
  const objects = objectsForVariant(doc, variant).filter((o) => !onlyIds || onlyIds.has(o.id));
  for (const o of objects) prims.push(...objectPrims(o));
  for (const a of doc.annotations) prims.push({ t: 'text', x: a.x, y: a.y, text: a.text, size: a.fontSize, color: a.color, rotation: 0 });
  for (const d of doc.dimensions) prims.push(...dimension(d.a, d.b, 0, unit));
  if (variant === 'cote') {
    // Cotes de chaque côté de la salle, reportées à l'extérieur du contour (repère y vers le bas).
    const outward = signedArea(outline) > 0 ? -1 : 1;
    outline.forEach((p, i) => prims.push(...dimension(p, outline[(i + 1) % outline.length]!, outward * (doc.room.wallThickness + 600), unit)));
  }
  const pts = onlyIds && objects.length > 0 ? objects.flatMap(objectPolygon) : [...outline, ...objects.flatMap(objectPolygon), ...doc.zones.flatMap((z) => z.points)];
  const b = boxOfPoints(pts);
  const margin = variant === 'cote' ? 1800 : 600;
  return { prims, objects, bounds: { minX: b.minX - margin, minY: b.minY - margin, maxX: b.maxX + margin, maxY: b.maxY + margin } };
}

export function legend(objects: readonly PlanObject[]): { category: Category; label: string; color: string; count: number }[] {
  const m = new Map<Category, { color: string; count: number }>();
  for (const o of objects) {
    const e = m.get(o.category);
    if (e) e.count++;
    else m.set(o.category, { color: o.color, count: 1 });
  }
  return [...m.entries()].map(([category, v]) => ({ category, label: CATEGORY_LABELS[category], ...v }));
}
