import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../bom';
import { createDocument, objectFromTemplate } from '../document';
import { findTemplate } from '../catalog';
import { validatePlan } from '../validation';
import { DEFAULT_BANQUET, DEFAULT_CONCERT, DEFAULT_CONFERENCE, DEFAULT_SALON, generateLayout } from './generators';
import { maxChairsAroundRound, template } from './engine';

const errors = (doc: Parameters<typeof validatePlan>[0]) => validatePlan(doc).filter((i) => i.severity === 'erreur');

describe('placement automatique', () => {
  it('banquet : 160 invités, tables de 8, scène et piste dans 20×20 m', () => {
    const doc = createDocument({ width: 20_000, depth: 20_000 });
    const r = generateLayout(doc, {
      kind: 'banquet',
      options: {
        ...DEFAULT_BANQUET,
        guests: 160,
        tableTemplateId: 'table-ronde-150',
        seatsPerTable: 8,
        aisle: 800,
        wallMargin: 600,
        buffets: 0,
        stage: { width: 6000, depth: 4000 },
        danceFloor: { width: 6000, depth: 6000 },
      },
    });
    const t = performance.now();
    generateLayout(doc, { kind: 'banquet', options: DEFAULT_BANQUET });
    expect(performance.now() - t).toBeLessThan(1500);
    expect(r.diagnostics.filter((d) => d.level === 'erreur')).toEqual([]);
    expect(r.placedSeats).toBe(160);
    const m = computeMetrics(r.document);
    expect(m.chairs).toBe(160);
    expect(m.tables).toBe(20);
    expect(errors(r.document)).toEqual([]);
    expect(r.document.zones.some((z) => z.type === 'piste')).toBe(true);
  });

  it('banquet impossible : diagnostic explicite au lieu d’un faux succès', () => {
    const doc = createDocument({ width: 8000, depth: 6000 });
    const r = generateLayout(doc, { kind: 'banquet', options: { ...DEFAULT_BANQUET, guests: 300 } });
    expect(r.placedSeats).toBeLessThan(300);
    expect(r.diagnostics.some((d) => d.level === 'erreur' && d.message.includes('300'))).toBe(true);
    expect(errors(r.document)).toEqual([]);
  });

  it('refuse plus de chaises que la table ne peut en accueillir', () => {
    const max = maxChairsAroundRound(1500, template('chaise'));
    const doc = createDocument({ width: 20_000, depth: 20_000 });
    const r = generateLayout(doc, { kind: 'banquet', options: { ...DEFAULT_BANQUET, guests: 40, tableTemplateId: 'table-ronde-150', seatsPerTable: 30 } });
    expect(r.diagnostics[0]!.message).toContain(`maximum ${max}`);
    expect(errors(r.document)).toEqual([]);
  });

  it('contourne un poteau et conserve la structure existante', () => {
    const base = createDocument({ width: 15_000, depth: 12_000 });
    const column = objectFromTemplate(findTemplate('poteau')!, { x: 7500, y: 6000 });
    const r = generateLayout({ ...base, objects: [column] }, { kind: 'banquet', options: { ...DEFAULT_BANQUET, guests: 60 } });
    expect(r.document.objects).toContainEqual(column);
    expect(errors(r.document)).toEqual([]);
  });

  it('respecte le dégagement d’une porte existante', () => {
    const base = createDocument({ width: 15_000, depth: 12_000 });
    const door = objectFromTemplate(findTemplate('porte-double')!, { x: 7500, y: 0 });
    const r = generateLayout({ ...base, objects: [door] }, { kind: 'banquet', options: { ...DEFAULT_BANQUET, guests: 80 } });
    expect(validatePlan(r.document).filter((i) => i.code === 'porte_bloquee')).toEqual([]);
  });

  it('conférence : rangées sans collision, allée centrale libre', () => {
    const doc = createDocument({ width: 18_000, depth: 25_000 });
    const r = generateLayout(doc, { kind: 'conference', options: { ...DEFAULT_CONFERENCE, seats: 200, reservedRows: 2 } });
    expect(r.placedSeats).toBe(200);
    expect(errors(r.document)).toEqual([]);
    expect(validatePlan(r.document).filter((i) => i.code === 'allee_interrompue')).toEqual([]);
  });

  it('salon : stands numérotés', () => {
    const doc = createDocument({ width: 30_000, depth: 20_000 });
    const r = generateLayout(doc, { kind: 'salon', options: { ...DEFAULT_SALON, stands: 24 } });
    const stands = r.document.objects.filter((o) => o.role === 'stand');
    expect(stands).toHaveLength(24);
    expect(new Set(stands.map((s) => s.label)).size).toBe(24);
    expect(errors(r.document)).toEqual([]);
  });

  it('concert : scène, piste, régie, bar', () => {
    const doc = createDocument({ width: 25_000, depth: 30_000 });
    const r = generateLayout(doc, { kind: 'concert', options: DEFAULT_CONCERT });
    expect(r.diagnostics.filter((d) => d.level === 'erreur')).toEqual([]);
    expect(r.document.objects.some((o) => o.role === 'scene')).toBe(true);
    expect(r.document.objects.some((o) => o.templateId === 'regie')).toBe(true);
    expect(errors(r.document)).toEqual([]);
  });
});
