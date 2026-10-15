import type { PlanDocument, PlanObject } from './types';

export interface PlanDiff {
  added: PlanObject[];
  removed: PlanObject[];
  moved: PlanObject[];
  resized: PlanObject[];
  roomChanged: boolean;
  zonesDelta: number;
}

/** Différences de `to` par rapport à `from` (objets appariés par identifiant). */
export function diffDocuments(from: PlanDocument, to: PlanDocument): PlanDiff {
  const before = new Map(from.objects.map((o) => [o.id, o]));
  const after = new Map(to.objects.map((o) => [o.id, o]));
  const moved: PlanObject[] = [];
  const resized: PlanObject[] = [];
  for (const [id, o] of after) {
    const b = before.get(id);
    if (!b) continue;
    if (b.x !== o.x || b.y !== o.y || b.rotation !== o.rotation) moved.push(o);
    if (b.width !== o.width || b.depth !== o.depth) resized.push(o);
  }
  return {
    added: to.objects.filter((o) => !before.has(o.id)),
    removed: from.objects.filter((o) => !after.has(o.id)),
    moved,
    resized,
    roomChanged: JSON.stringify(from.room) !== JSON.stringify(to.room),
    zonesDelta: to.zones.length - from.zones.length,
  };
}

export function describeDiff(d: PlanDiff): string {
  const parts = [
    d.added.length && `${d.added.length} ajouté(s)`,
    d.removed.length && `${d.removed.length} supprimé(s)`,
    d.moved.length && `${d.moved.length} déplacé(s)/pivoté(s)`,
    d.resized.length && `${d.resized.length} redimensionné(s)`,
    d.roomChanged && 'salle modifiée',
    d.zonesDelta && `${d.zonesDelta > 0 ? '+' : ''}${d.zonesDelta} zone(s)`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Identique';
}
