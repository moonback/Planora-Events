import { newId } from './document';
import { normalizeAngle, objectBox, rotatePoint, unionBoxes } from './geometry';
import type { PlanDocument, PlanObject } from './types';

/** Opérations d'édition pures : document en entrée, nouveau document en sortie (aucune mutation). */

const mapIds = (doc: PlanDocument, ids: ReadonlySet<string>, fn: (o: PlanObject) => PlanObject): PlanDocument => ({
  ...doc,
  objects: doc.objects.map((o) => (ids.has(o.id) && !o.locked ? fn(o) : o)),
});

/** Étend une sélection à l'ensemble des membres des groupes concernés. */
export function expandToGroups(doc: PlanDocument, ids: readonly string[]): string[] {
  const set = new Set(ids);
  const groups = new Set(doc.objects.filter((o) => set.has(o.id) && o.groupId).map((o) => o.groupId));
  return doc.objects.filter((o) => set.has(o.id) || (o.groupId && groups.has(o.groupId))).map((o) => o.id);
}

export const moveObjects = (doc: PlanDocument, ids: readonly string[], dx: number, dy: number): PlanDocument =>
  mapIds(doc, new Set(ids), (o) => ({ ...o, x: o.x + dx, y: o.y + dy }));

export function updateObject(doc: PlanDocument, id: string, patch: Partial<Omit<PlanObject, 'id'>>): PlanDocument {
  return { ...doc, objects: doc.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) };
}

/** Rotation autour du centre de la sélection (un seul objet : autour de son propre centre). */
export function rotateObjects(doc: PlanDocument, ids: readonly string[], delta: number): PlanDocument {
  const set = new Set(ids);
  const targets = doc.objects.filter((o) => set.has(o.id) && !o.locked);
  const box = unionBoxes(targets.map(objectBox));
  if (!box) return doc;
  const c = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  return mapIds(doc, set, (o) => {
    const p = targets.length === 1 ? { x: o.x, y: o.y } : rotatePoint({ x: o.x, y: o.y }, delta, c);
    return { ...o, x: p.x, y: p.y, rotation: normalizeAngle(o.rotation + delta) };
  });
}

export function deleteObjects(doc: PlanDocument, ids: readonly string[]): PlanDocument {
  const set = new Set(ids);
  return {
    ...doc,
    objects: doc.objects.filter((o) => !set.has(o.id) || o.locked),
    zones: doc.zones.filter((z) => !set.has(z.id)),
    annotations: doc.annotations.filter((a) => !set.has(a.id)),
    dimensions: doc.dimensions.filter((d) => !set.has(d.id)),
  };
}

/** Copies décalées ; les groupes copiés reçoivent de nouveaux identifiants de groupe. */
export function cloneObjects(objects: readonly PlanObject[], dx: number, dy: number): PlanObject[] {
  const groupMap = new Map<string, string>();
  return objects.map((o) => {
    let groupId: string | null = null;
    if (o.groupId) {
      groupId = groupMap.get(o.groupId) ?? newId();
      groupMap.set(o.groupId, groupId);
    }
    return { ...o, id: newId(), x: o.x + dx, y: o.y + dy, groupId, locked: false };
  });
}

export function duplicateObjects(doc: PlanDocument, ids: readonly string[], offset = 500): { doc: PlanDocument; newIds: string[] } {
  const set = new Set(ids);
  const copies = cloneObjects(doc.objects.filter((o) => set.has(o.id)), offset, offset);
  return { doc: { ...doc, objects: [...doc.objects, ...copies] }, newIds: copies.map((c) => c.id) };
}

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

export function alignObjects(doc: PlanDocument, ids: readonly string[], mode: AlignMode): PlanDocument {
  const set = new Set(ids);
  const targets = doc.objects.filter((o) => set.has(o.id) && !o.locked);
  if (targets.length < 2) return doc;
  const boxes = new Map(targets.map((o) => [o.id, objectBox(o)]));
  const all = unionBoxes([...boxes.values()])!;
  return mapIds(doc, set, (o) => {
    const b = boxes.get(o.id)!;
    switch (mode) {
      case 'left':
        return { ...o, x: o.x + (all.minX - b.minX) };
      case 'right':
        return { ...o, x: o.x + (all.maxX - b.maxX) };
      case 'centerX':
        return { ...o, x: o.x + ((all.minX + all.maxX) / 2 - (b.minX + b.maxX) / 2) };
      case 'top':
        return { ...o, y: o.y + (all.minY - b.minY) };
      case 'bottom':
        return { ...o, y: o.y + (all.maxY - b.maxY) };
      case 'centerY':
        return { ...o, y: o.y + ((all.minY + all.maxY) / 2 - (b.minY + b.maxY) / 2) };
    }
  });
}

/** Répartit les centres à intervalles réguliers entre les deux objets extrêmes. */
export function distributeObjects(doc: PlanDocument, ids: readonly string[], axis: 'x' | 'y'): PlanDocument {
  const set = new Set(ids);
  const targets = doc.objects.filter((o) => set.has(o.id) && !o.locked).sort((a, b) => a[axis] - b[axis]);
  if (targets.length < 3) return doc;
  const first = targets[0]![axis];
  const step = (targets[targets.length - 1]![axis] - first) / (targets.length - 1);
  const pos = new Map(targets.map((o, i) => [o.id, first + i * step]));
  return mapIds(doc, set, (o) => ({ ...o, [axis]: pos.get(o.id)! }));
}

export function groupObjects(doc: PlanDocument, ids: readonly string[]): PlanDocument {
  if (ids.length < 2) return doc;
  const groupId = newId();
  const set = new Set(ids);
  return { ...doc, objects: doc.objects.map((o) => (set.has(o.id) ? { ...o, groupId } : o)) };
}

export function ungroupObjects(doc: PlanDocument, ids: readonly string[]): PlanDocument {
  const set = new Set(ids);
  return { ...doc, objects: doc.objects.map((o) => (set.has(o.id) ? { ...o, groupId: null } : o)) };
}

export function setLocked(doc: PlanDocument, ids: readonly string[], locked: boolean): PlanDocument {
  const set = new Set(ids);
  return { ...doc, objects: doc.objects.map((o) => (set.has(o.id) ? { ...o, locked } : o)) };
}

export type Reorder = 'front' | 'back' | 'forward' | 'backward';

/** L'ordre du tableau `objects` est l'ordre d'affichage (dernier = au premier plan). */
export function reorderObjects(doc: PlanDocument, ids: readonly string[], how: Reorder): PlanDocument {
  const set = new Set(ids);
  const objs = [...doc.objects];
  if (how === 'front' || how === 'back') {
    const sel = objs.filter((o) => set.has(o.id));
    const rest = objs.filter((o) => !set.has(o.id));
    return { ...doc, objects: how === 'front' ? [...rest, ...sel] : [...sel, ...rest] };
  }
  const indices = objs.map((o, i) => (set.has(o.id) ? i : -1)).filter((i) => i >= 0);
  if (how === 'forward') indices.reverse();
  for (const i of indices) {
    const j = how === 'forward' ? i + 1 : i - 1;
    if (j < 0 || j >= objs.length || set.has(objs[j]!.id)) continue;
    [objs[i], objs[j]] = [objs[j]!, objs[i]!];
  }
  return { ...doc, objects: objs };
}
