import { rectPolygon } from './geometry';
import { PLAN_SCHEMA_VERSION, PlanDocumentSchema, type ObjectTemplate, type PlanDocument, type PlanObject, type Zone } from './types';
import type { ZonePreset } from './catalog';

export const newId = (): string => crypto.randomUUID();

export const DEFAULT_SETTINGS: PlanDocument['settings'] = {
  gridSize: 500,
  snap: true,
  showGrid: true,
  displayUnit: 'cm',
  minClearance: 900,
  doorClearance: 1400,
};

export function createDocument(opts: { name?: string; width: number; depth: number }): PlanDocument {
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    room: { name: opts.name ?? 'Salle', outline: rectPolygon(0, 0, opts.width, opts.depth), wallThickness: 200 },
    objects: [],
    zones: [],
    annotations: [],
    dimensions: [],
    background: null,
    settings: { ...DEFAULT_SETTINGS },
    acknowledgedIssues: [],
  };
}

export function objectFromTemplate(t: ObjectTemplate, at: { x: number; y: number; rotation?: number }): PlanObject {
  return {
    id: newId(),
    templateId: t.id,
    name: t.name,
    category: t.category,
    shape: t.shape,
    role: t.role,
    x: at.x,
    y: at.y,
    width: t.width,
    depth: t.depth,
    rotation: at.rotation ?? 0,
    seats: t.seats,
    capacity: t.capacity,
    color: t.color,
    label: '',
    locked: false,
    groupId: null,
  };
}

export function zoneFromPreset(p: ZonePreset, center: { x: number; y: number }): Zone {
  return {
    id: newId(),
    name: p.name,
    type: p.type,
    color: p.color,
    points: rectPolygon(center.x - p.width / 2, center.y - p.depth / 2, p.width, p.depth),
  };
}

export type ParseResult = { ok: true; document: PlanDocument } | { ok: false; error: string };

/** Désérialisation défensive : un document corrompu est refusé plutôt que chargé partiellement. */
export function parseDocument(raw: unknown): ParseResult {
  const r = PlanDocumentSchema.safeParse(raw);
  if (r.success) return { ok: true, document: r.data };
  const first = r.error.issues[0];
  return { ok: false, error: `Document de plan invalide${first ? ` (${first.path.join('.')} : ${first.message})` : ''}` };
}

export const serializeDocument = (doc: PlanDocument): string => JSON.stringify(doc);
