import { CATEGORY_LABELS } from './catalog';
import { pointInPolygon, polygonArea } from './geometry';
import type { Category, PlanDocument } from './types';

export interface BomLine {
  key: string;
  templateId: string;
  name: string;
  category: Category;
  width: number;
  depth: number;
  quantity: number;
  seats: number;
  /** Quantité par zone (nom de zone → nombre), « Hors zone » pour le reste. */
  byZone: Record<string, number>;
  objectIds: string[];
}

export interface PlanMetrics {
  roomArea: number;
  objectCount: number;
  tables: number;
  chairs: number;
  /** Places assises réellement disponibles (sièges posés sur le plan). */
  seats: number;
  /** Capacité théorique des tables (places annoncées autour des tables). */
  tableCapacity: number;
  byCategory: { category: Category; label: string; quantity: number }[];
  zones: { id: string; name: string; type: string; area: number; objects: number }[];
}

export const OUTSIDE_ZONE = 'Hors zone';

/** Nombre de tables nécessaires pour une capacité cible. */
export function tablesNeeded(guests: number, perTable: number): number {
  if (!Number.isFinite(guests) || guests <= 0) return 0;
  if (!Number.isFinite(perTable) || perTable <= 0) throw new Error('La capacité par table doit être positive.');
  return Math.ceil(guests / perTable);
}

function zoneOf(doc: PlanDocument, x: number, y: number): string {
  return doc.zones.find((z) => pointInPolygon({ x, y }, z.points))?.name ?? OUTSIDE_ZONE;
}

/** Nomenclature triée par catégorie puis nom ; regroupe les objets de même modèle et mêmes dimensions. */
export function computeBom(doc: PlanDocument): BomLine[] {
  const lines = new Map<string, BomLine>();
  for (const o of doc.objects) {
    const key = `${o.templateId}|${o.name}|${Math.round(o.width)}|${Math.round(o.depth)}`;
    let line = lines.get(key);
    if (!line) {
      line = {
        key,
        templateId: o.templateId,
        name: o.name,
        category: o.category,
        width: Math.round(o.width),
        depth: Math.round(o.depth),
        quantity: 0,
        seats: 0,
        byZone: {},
        objectIds: [],
      };
      lines.set(key, line);
    }
    line.quantity++;
    line.seats += o.seats;
    line.objectIds.push(o.id);
    const zone = zoneOf(doc, o.x, o.y);
    line.byZone[zone] = (line.byZone[zone] ?? 0) + 1;
  }
  const order = Object.keys(CATEGORY_LABELS);
  return [...lines.values()].sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.name.localeCompare(b.name, 'fr') || a.width - b.width,
  );
}

export function computeMetrics(doc: PlanDocument): PlanMetrics {
  const byCat = new Map<Category, number>();
  let tables = 0;
  let chairs = 0;
  let seats = 0;
  let tableCapacity = 0;
  for (const o of doc.objects) {
    byCat.set(o.category, (byCat.get(o.category) ?? 0) + 1);
    if (o.role === 'table') {
      tables++;
      tableCapacity += o.capacity;
    }
    if (o.shape === 'chair') chairs++;
    seats += o.seats;
  }
  return {
    roomArea: polygonArea(doc.room.outline),
    objectCount: doc.objects.length,
    tables,
    chairs,
    seats,
    tableCapacity,
    byCategory: [...byCat.entries()].map(([category, quantity]) => ({ category, label: CATEGORY_LABELS[category], quantity })),
    zones: doc.zones.map((z) => ({
      id: z.id,
      name: z.name,
      type: z.type,
      area: polygonArea(z.points),
      objects: doc.objects.filter((o) => pointInPolygon({ x: o.x, y: o.y }, z.points)).length,
    })),
  };
}
