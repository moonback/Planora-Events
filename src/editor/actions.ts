import { findTemplate, ZONE_PRESETS } from '../domain/catalog';
import { objectFromTemplate, zoneFromPreset } from '../domain/document';
import { snapTo } from '../domain/geometry';
import {
  cloneObjects,
  deleteObjects,
  duplicateObjects,
  expandToGroups,
  groupObjects,
  moveObjects,
  rotateObjects,
  setLocked,
  ungroupObjects,
} from '../domain/operations';
import type { Point } from '../domain/types';
import { ROOM_ID, useEditor } from './store';

/** Commandes de l'éditeur, partagées par le clavier, la barre d'outils et les panneaux. */
const st = () => useEditor.getState();
const selectedObjectIds = () => {
  const { selection, history } = st();
  const ids = new Set(selection);
  return history.present.objects.filter((o) => ids.has(o.id)).map((o) => o.id);
};

export function viewCenter(): Point {
  const { view, viewport } = st();
  return { x: (viewport.width / 2 - view.x) / view.scale, y: (viewport.height / 2 - view.y) / view.scale };
}

export function addTemplate(templateId: string, at: Point = viewCenter()): void {
  const s = st();
  const t = findTemplate(templateId, s.customTemplates);
  if (!t) return;
  const grid = s.history.present.settings;
  const pos = grid.snap ? { x: snapTo(at.x, grid.gridSize / 2), y: snapTo(at.y, grid.gridSize / 2) } : at;
  const o = objectFromTemplate(t, pos);
  s.apply((doc) => ({ ...doc, objects: [...doc.objects, o] }));
  s.select([o.id]);
}

export function addZonePreset(presetId: string, at: Point = viewCenter()): void {
  const p = ZONE_PRESETS.find((z) => z.id === presetId);
  if (!p) return;
  const z = zoneFromPreset(p, at);
  st().apply((doc) => ({ ...doc, zones: [...doc.zones, z] }));
  st().select([z.id]);
}

export function deleteSelection(): void {
  const { selection } = st();
  if (!selection.length || selection.includes(ROOM_ID)) return;
  st().apply((doc) => deleteObjects(doc, selection));
  st().select([]);
}

export function duplicateSelection(): void {
  const ids = selectedObjectIds();
  if (!ids.length) return;
  let created: string[] = [];
  st().apply((doc) => {
    const r = duplicateObjects(doc, ids);
    created = r.newIds;
    return r.doc;
  });
  st().select(created);
}

export function copySelection(): void {
  const ids = new Set(selectedObjectIds());
  st().setClipboard(st().history.present.objects.filter((o) => ids.has(o.id)));
}

export function paste(): void {
  const { clipboard } = st();
  if (!clipboard.length) return;
  const copies = cloneObjects(clipboard, 500, 500);
  st().apply((doc) => ({ ...doc, objects: [...doc.objects, ...copies] }));
  st().setClipboard(copies);
  st().select(copies.map((c) => c.id));
}

export function nudge(dx: number, dy: number): void {
  const ids = selectedObjectIds();
  if (ids.length) st().apply((doc) => moveObjects(doc, ids, dx, dy));
}

export function rotateSelection(delta: number): void {
  const ids = selectedObjectIds();
  if (ids.length) st().apply((doc) => rotateObjects(doc, ids, delta));
}

export function selectAll(): void {
  st().select(st().history.present.objects.map((o) => o.id));
}

export function toggleLock(): void {
  const ids = selectedObjectIds();
  if (!ids.length) return;
  const doc = st().history.present;
  const allLocked = doc.objects.filter((o) => ids.includes(o.id)).every((o) => o.locked);
  st().apply((d) => setLocked(d, ids, !allLocked));
}

export function groupSelection(): void {
  const ids = selectedObjectIds();
  if (ids.length > 1) st().apply((doc) => groupObjects(doc, ids));
}

export function ungroupSelection(): void {
  const ids = selectedObjectIds();
  if (ids.length) st().apply((doc) => ungroupObjects(doc, ids));
}

/** Sélection d'un objet : un clic sélectionne tout son groupe ; Maj ajoute ou retire. */
export function selectObject(id: string, additive: boolean): void {
  const s = st();
  const ids = expandToGroups(s.history.present, [id]);
  if (additive) {
    const cur = new Set(s.selection.filter((x) => x !== ROOM_ID));
    const remove = ids.every((i) => cur.has(i));
    ids.forEach((i) => (remove ? cur.delete(i) : cur.add(i)));
    s.select([...cur]);
  } else if (!ids.every((i) => s.selection.includes(i))) s.select(ids);
}

