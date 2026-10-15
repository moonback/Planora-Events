import { findTemplate } from '../catalog';
import { newId, objectFromTemplate } from '../document';
import { boxOfPoints, boxesOverlap, convexOverlap, objectPolygon, polygonInside, polygonsIntersect, rectPolygon, type Box } from '../geometry';
import type { ObjectTemplate, PlanDocument, PlanObject, Point, Zone, ZoneType } from '../types';
import { doorClearancePolygon, occupiesFloor } from '../validation';

export type DiagnosticLevel = 'erreur' | 'avertissement' | 'info';
export interface Diagnostic {
  level: DiagnosticLevel;
  message: string;
}

export interface LayoutResult {
  document: PlanDocument;
  diagnostics: Diagnostic[];
  placedSeats: number;
  targetSeats: number | null;
}

interface Footprint {
  poly: Point[];
  box: Box;
}

const fp = (poly: Point[]): Footprint => ({ poly, box: boxOfPoints(poly) });

export function template(id: string): ObjectTemplate {
  const t = findTemplate(id);
  if (!t) throw new Error(`Modèle introuvable : ${id}`);
  return t;
}

/**
 * Espace de placement : contour de la salle, obstacles existants (structure conservée),
 * zones interdites/circulations et dégagements de portes. Toute pose est vérifiée géométriquement.
 */
export class Placer {
  readonly outline: Point[];
  readonly bounds: Box;
  readonly objects: PlanObject[] = [];
  readonly zones: Zone[] = [];
  private readonly blocked: Footprint[] = [];
  private readonly blockedZones: Point[][] = [];
  private readonly doc: PlanDocument;

  constructor(doc: PlanDocument) {
    this.doc = doc;
    this.outline = doc.room.outline;
    this.bounds = boxOfPoints(this.outline);
    for (const o of doc.objects) {
      if (o.category !== 'structure') continue; // le mobilier existant est remplacé
      if (o.shape === 'door') this.blocked.push(fp(doorClearancePolygon(o, doc.settings.doorClearance)));
      if (occupiesFloor(o)) this.blocked.push(fp(objectPolygon(o)));
    }
    for (const z of doc.zones) if (z.type === 'interdite' || z.type === 'circulation') this.blockedZones.push(z.points);
  }

  /** Le polygone convexe peut-il être posé sans sortir de la salle ni toucher un élément réservé ? */
  free(poly: Point[]): boolean {
    return this.blockerOf(poly) === null && polygonInside(poly, this.outline);
  }

  /** Boîte du premier élément réservé que le polygone touche (null si aucun) : permet de sauter l'obstacle. */
  blockerOf(poly: Point[]): Box | null {
    const box = boxOfPoints(poly);
    for (const b of this.blocked) if (boxesOverlap(box, b.box) && convexOverlap(poly, b.poly)) return b.box;
    for (const z of this.blockedZones) if (polygonsIntersect(poly, z)) return boxOfPoints(z);
    return null;
  }

  reserve(poly: Point[]): void {
    this.blocked.push(fp(poly));
  }

  /** Pose un objet si son emprise est libre ; `clearance` réserve en plus une marge autour (allées). */
  tryPlace(o: PlanObject, clearance = 0): boolean {
    const poly = objectPolygon(o);
    if (!this.free(poly)) return false;
    this.objects.push(o);
    this.reserve(clearance > 0 ? objectPolygon({ ...o, width: o.width + 2 * clearance, depth: o.depth + 2 * clearance }) : poly);
    return true;
  }

  /** Pose un ensemble indissociable (table + chaises) : tout ou rien. */
  tryPlaceAll(items: PlanObject[], footprint: Point[]): boolean {
    if (!this.free(footprint) || !items.every((o) => polygonInside(objectPolygon(o), this.outline))) return false;
    this.objects.push(...items);
    this.reserve(footprint);
    return true;
  }

  addZone(name: string, type: ZoneType, color: string, x: number, y: number, w: number, h: number, block = true): Zone {
    const zone: Zone = { id: newId(), name, type, color, points: rectPolygon(x, y, w, h) };
    this.zones.push(zone);
    if (block) this.reserve(zone.points);
    return zone;
  }

  /** Document final : structure existante conservée (portes, poteaux, fenêtres…), mobilier remplacé. */
  result(): PlanDocument {
    const kept = this.doc.objects.filter((o) => o.category === 'structure');
    return { ...this.doc, objects: [...kept, ...this.objects], zones: [...this.doc.zones, ...this.zones] };
  }
}

export function makeObject(t: ObjectTemplate, x: number, y: number, rotation = 0, extra: Partial<PlanObject> = {}): PlanObject {
  return { ...objectFromTemplate(t, { x, y, rotation }), ...extra };
}

export const CHAIR_GAP = 50;

/** Chaises réparties autour d'une table ronde, orientées vers son centre. */
export function chairsAroundRound(table: PlanObject, chair: ObjectTemplate, n: number): PlanObject[] {
  const d = table.width / 2 + chair.depth / 2 + CHAIR_GAP;
  return Array.from({ length: n }, (_, k) => {
    const theta = (2 * Math.PI * k) / n - Math.PI / 2;
    const deg = Math.round(((theta * 180) / Math.PI) * 1000) / 1000;
    return makeObject(chair, table.x + d * Math.cos(theta), table.y + d * Math.sin(theta), deg - 90, { groupId: table.groupId });
  });
}

/** Nombre maximal de chaises autour d'une table ronde sans chevauchement (corde au rayon intérieur ≥ largeur). */
export function maxChairsAroundRound(tableDiameter: number, chair: ObjectTemplate): number {
  const r = tableDiameter / 2 + CHAIR_GAP;
  const ratio = (chair.width + 20) / (2 * r);
  return ratio >= 1 ? 1 : Math.floor(Math.PI / Math.asin(ratio));
}

/** Chaises le long des grands côtés d'une table rectangulaire non tournée. */
export function chairsAroundRect(table: PlanObject, chair: ObjectTemplate, n: number, sides: 'both' | 'top' | 'bottom' = 'both'): PlanObject[] {
  const top = sides === 'bottom' ? 0 : sides === 'top' ? n : Math.ceil(n / 2);
  const bottom = n - top;
  const out: PlanObject[] = [];
  const row = (count: number, y: number, rotation: number) => {
    for (let k = 0; k < count; k++) {
      const x = table.x - table.width / 2 + (table.width * (k + 0.5)) / count;
      out.push(makeObject(chair, x, y, rotation, { groupId: table.groupId }));
    }
  };
  row(top, table.y - table.depth / 2 - chair.depth / 2 - CHAIR_GAP, 180);
  row(bottom, table.y + table.depth / 2 + chair.depth / 2 + CHAIR_GAP, 0);
  return out;
}

export const maxChairsPerSide = (tableWidth: number, chair: ObjectTemplate): number => Math.floor(tableWidth / (chair.width + CHAIR_GAP));
