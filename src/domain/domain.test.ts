import { describe, expect, it } from 'vitest';
import { computeBom, computeMetrics, tablesNeeded } from './bom';
import { findTemplate } from './catalog';
import { createDocument, objectFromTemplate, parseDocument, serializeDocument } from './document';
import { convexOverlap, isSimplePolygon, objectBox, objectPolygon, pointInPolygon, polygonArea, polygonInside, rotatePoint } from './geometry';
import { commit, createHistory, redo, undo } from './history';
import { alignObjects, distributeObjects, duplicateObjects, groupObjects, expandToGroups, moveObjects, reorderObjects, rotateObjects } from './operations';
import type { PlanDocument, PlanObject } from './types';
import { formatLength, fromUnit, parseNumber, toUnit } from './units';
import { validatePlan } from './validation';

const tpl = (id: string) => findTemplate(id)!;
const obj = (id: string, x: number, y: number, rotation = 0): PlanObject => objectFromTemplate(tpl(id), { x, y, rotation });
const room = (w = 10_000, d = 8_000): PlanDocument => createDocument({ width: w, depth: d });
const withObjects = (doc: PlanDocument, ...objects: PlanObject[]): PlanDocument => ({ ...doc, objects });
const codes = (doc: PlanDocument) => validatePlan(doc).map((i) => i.code);

describe('unités', () => {
  it('convertit mm ↔ cm ↔ m sans dérive', () => {
    expect(toUnit(1234, 'cm')).toBe(123.4);
    expect(toUnit(1234, 'm')).toBe(1.234);
    expect(fromUnit(1.234, 'm')).toBe(1234);
    expect(fromUnit(0.1 + 0.2, 'm')).toBe(300);
  });
  it('analyse les saisies françaises', () => {
    expect(parseNumber('3,5')).toBe(3.5);
    expect(parseNumber(' 12 ')).toBe(12);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(formatLength(1500, 'm')).toBe('1,5 m');
  });
});

describe('géométrie', () => {
  it('rotations exactes aux multiples de 90°', () => {
    expect(rotatePoint({ x: 1000, y: 0 }, 90)).toEqual({ x: 0, y: 1000 });
    expect(rotatePoint({ x: 1000, y: 0 }, 180)).toEqual({ x: -1000, y: 0 });
    expect(rotatePoint({ x: 1000, y: 0 }, -90)).toEqual({ x: 0, y: -1000 });
  });
  it('calcule les limites d’un objet tourné', () => {
    const t = obj('table-rect-180', 0, 0, 90);
    expect(objectBox(t)).toEqual({ minX: -400, minY: -900, maxX: 400, maxY: 900 });
    const b = objectBox({ ...t, rotation: 45 });
    expect(b.maxX).toBeCloseTo((1800 + 800) / 2 / Math.SQRT2, 6);
  });
  it('détecte les collisions et ignore le simple contact', () => {
    const a = objectPolygon(obj('table-carree-80', 0, 0));
    expect(convexOverlap(a, objectPolygon(obj('table-carree-80', 799, 0)))).toBe(true);
    expect(convexOverlap(a, objectPolygon(obj('table-carree-80', 800, 0)))).toBe(false);
    // Deux tables rondes dont les boîtes se recouvrent en diagonale sans contact réel.
    const r = objectPolygon(obj('table-ronde-150', 0, 0));
    expect(convexOverlap(r, objectPolygon(obj('table-ronde-150', 1200, 1200)))).toBe(false);
  });
  it('point dans polygone concave et inclusion', () => {
    const L = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 },
    ].map((p) => ({ x: p.x * 1000, y: p.y * 1000 }));
    expect(pointInPolygon({ x: 2000, y: 8000 }, L)).toBe(true);
    expect(pointInPolygon({ x: 8000, y: 8000 }, L)).toBe(false);
    expect(polygonArea(L)).toBe(64e6);
    const inside = [{ x: 3000, y: 3000 }, { x: 9000, y: 3000 }, { x: 9000, y: 3500 }, { x: 3000, y: 3500 }];
    expect(polygonInside(inside, L)).toBe(true);
    // À cheval sur l'angle rentrant : sort de la salle.
    const across = [{ x: 3000, y: 3000 }, { x: 6000, y: 3000 }, { x: 6000, y: 6000 }, { x: 3000, y: 6000 }];
    expect(polygonInside(across, L)).toBe(false);
  });
  it('rejette un polygone auto-sécant', () => {
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }])).toBe(false);
    expect(isSimplePolygon(room().room.outline)).toBe(true);
  });
});

describe('validation', () => {
  it('détecte chevauchement et dépassement de la salle', () => {
    const doc = withObjects(room(), obj('table-ronde-150', 2000, 2000), obj('table-ronde-150', 2500, 2000), obj('table-ronde-150', 9800, 4000));
    const c = codes(doc);
    expect(c.filter((x) => x === 'chevauchement')).toHaveLength(1);
    expect(c.filter((x) => x === 'hors_salle')).toHaveLength(1);
  });
  it('un plan correct n’a aucune erreur, mais signale toujours la conformité non vérifiée', () => {
    const doc = withObjects(room(), obj('issue-secours', 5000, 0), obj('table-ronde-150', 3000, 4000));
    const issues = validatePlan(doc);
    expect(issues.filter((i) => i.severity === 'erreur')).toHaveLength(0);
    expect(issues.find((i) => i.code === 'conformite_erp')?.kind).toBe('reglementaire');
  });
  it('détecte une porte bloquée et une zone interdite', () => {
    const door = obj('porte', 5000, 0); // ouverture vers +y, dans la salle
    const blocker = obj('table-carree-80', 5000, 800);
    const doc: PlanDocument = {
      ...withObjects(room(), door, blocker, obj('chaise', 2000, 6000)),
      zones: [{ id: 'z', name: 'Local', type: 'interdite', color: '#ff0000', points: [{ x: 1500, y: 5500 }, { x: 2500, y: 5500 }, { x: 2500, y: 6500 }, { x: 1500, y: 6500 }] }],
    };
    const c = codes(doc);
    expect(c).toContain('porte_bloquee');
    expect(c).toContain('zone_interdite');
  });
  it('avertit si la distance configurée n’est pas respectée, et l’avertissement peut être accepté', () => {
    const doc = withObjects(room(), obj('table-carree-80', 2000, 2000), obj('table-carree-80', 3000, 2000));
    const issue = validatePlan(doc).find((i) => i.code === 'distance')!;
    expect(issue.severity).toBe('avertissement');
    expect(validatePlan({ ...doc, acknowledgedIssues: [issue.id] }).find((i) => i.id === issue.id)?.status).toBe('accepte');
  });
  it('reste rapide sur plusieurs centaines d’objets', () => {
    const objects: PlanObject[] = [];
    for (let i = 0; i < 25; i++) for (let j = 0; j < 20; j++) objects.push(obj('chaise', 500 + i * 600, 500 + j * 700));
    const doc = withObjects(room(20_000, 20_000), ...objects);
    const t = performance.now();
    validatePlan(doc);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});

describe('nomenclature et capacité', () => {
  it('compte places, tables, chaises et regroupe par modèle', () => {
    const doc = withObjects(room(), obj('table-ronde-150', 2000, 2000), obj('chaise', 2000, 3100), obj('chaise', 2000, 900), obj('canape', 6000, 6000));
    const m = computeMetrics(doc);
    expect(m).toMatchObject({ tables: 1, chairs: 2, seats: 5, tableCapacity: 8, roomArea: 80e6 });
    const bom = computeBom(doc);
    expect(bom.find((l) => l.templateId === 'chaise')?.quantity).toBe(2);
    expect(bom.reduce((s, l) => s + l.quantity, 0)).toBe(4);
  });
  it('calcule le nombre de tables nécessaires', () => {
    expect(tablesNeeded(160, 8)).toBe(20);
    expect(tablesNeeded(161, 8)).toBe(21);
    expect(tablesNeeded(0, 8)).toBe(0);
    expect(() => tablesNeeded(10, 0)).toThrow();
  });
});

describe('historique', () => {
  it('annule et rétablit', () => {
    let h = createHistory(1);
    h = commit(h, 2);
    h = commit(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = redo(h);
    expect(h.present).toBe(3);
    h = undo(undo(h));
    h = commit(h, 9);
    expect(h.future).toHaveLength(0);
    expect(undo(undo(undo(h))).present).toBe(1);
  });
});

describe('opérations', () => {
  const base = withObjects(room(), obj('chaise', 1000, 1000), obj('chaise', 3000, 2000), obj('chaise', 8000, 1500));
  const ids = base.objects.map((o) => o.id);
  it('déplace sans toucher aux objets verrouillés', () => {
    const locked = { ...base, objects: base.objects.map((o, i) => (i === 0 ? { ...o, locked: true } : o)) };
    const moved = moveObjects(locked, ids, 100, 0);
    expect(moved.objects.map((o) => o.x)).toEqual([1000, 3100, 8100]);
  });
  it('aligne et distribue', () => {
    expect(alignObjects(base, ids, 'top').objects.every((o) => o.y === 1000)).toBe(true);
    expect(distributeObjects(base, ids, 'x').objects.map((o) => o.x)).toEqual([1000, 4500, 8000]);
  });
  it('fait pivoter, duplique et regroupe', () => {
    expect(rotateObjects(base, [ids[0]!], 370).objects[0]!.rotation).toBe(10);
    const g = groupObjects(base, ids.slice(0, 2));
    expect(expandToGroups(g, [ids[0]!])).toEqual(ids.slice(0, 2));
    const { doc, newIds } = duplicateObjects(g, ids.slice(0, 2));
    expect(doc.objects).toHaveLength(5);
    const copies = doc.objects.filter((o) => newIds.includes(o.id));
    expect(copies[0]!.groupId).toBe(copies[1]!.groupId);
    expect(copies[0]!.groupId).not.toBe(g.objects[0]!.groupId);
  });
  it('change l’ordre d’affichage', () => {
    expect(reorderObjects(base, [ids[0]!], 'front').objects.map((o) => o.id)).toEqual([ids[1], ids[2], ids[0]]);
    expect(reorderObjects(base, [ids[2]!], 'backward').objects.map((o) => o.id)).toEqual([ids[0], ids[2], ids[1]]);
  });
});

describe('sérialisation', () => {
  it('aller-retour sans perte', () => {
    const doc = withObjects(room(), obj('table-ronde-180', 3000, 3000, 33.5));
    const r = parseDocument(JSON.parse(serializeDocument(doc)));
    expect(r).toEqual({ ok: true, document: doc });
  });
  it('refuse un document corrompu', () => {
    const doc = withObjects(room(), obj('chaise', 1000, 1000));
    const bad = JSON.parse(serializeDocument(doc));
    bad.objects[0].width = -5;
    expect(parseDocument(bad).ok).toBe(false);
    expect(parseDocument({ hello: 1 }).ok).toBe(false);
  });
});
