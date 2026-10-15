import { describe, expect, it } from 'vitest';
import { findTemplate } from '../domain/catalog';
import { createDocument, objectFromTemplate } from '../domain/document';
import { generateLayout, DEFAULT_BANQUET } from '../domain/layout/generators';
import type { PlanDocument } from '../domain/types';
import { bomCsv, objectsCsv, parseCatalogCsv } from './csv';
import { buildDrawList, objectsForVariant } from './drawList';
import { chooseScale, renderPdf } from './pdf';
import { renderSvg } from './svg';

const doc: PlanDocument = generateLayout(
  { ...createDocument({ width: 15_000, depth: 10_000 }), objects: [objectFromTemplate(findTemplate('issue-secours')!, { x: 7500, y: 0 })] },
  { kind: 'banquet', options: { ...DEFAULT_BANQUET, guests: 40 } },
).document;

describe('exports', () => {
  it('SVG en millimètres réels, avec textes échappés', () => {
    const d = { ...doc, annotations: [{ id: 'a', x: 100, y: 100, text: 'Accès <traiteur> & livraison', fontSize: 300, color: '#000000' }] };
    const svg = renderSvg(d, 'general', { title: 'Gala' });
    expect(svg).toMatch(/width="16200mm" height="11250mm" viewBox="-600 -650 16200 11250"/);
    expect(svg).toContain('Accès &lt;traiteur&gt; &amp; livraison');
    expect((svg.match(/<polygon/g) ?? []).length).toBe(1 + doc.zones.length + doc.objects.length);
  });

  it('les variantes filtrent les catégories', () => {
    expect(objectsForVariant(doc, 'technique').every((o) => ['scene', 'audiovisuel', 'structure'].includes(o.category))).toBe(true);
    expect(objectsForVariant(doc, 'mobilier').length).toBe(doc.objects.length);
    const cote = buildDrawList(doc, 'cote').prims.filter((p) => p.t === 'text' && /m$/.test(p.text));
    expect(cote.map((p) => (p.t === 'text' ? p.text.replace(/\s/g, ' ') : ''))).toEqual(expect.arrayContaining(['1 500 cm', '1 000 cm']));
  });

  it('choisit une échelle normalisée seulement si elle tient', () => {
    expect(chooseScale(16_200, 11_200, 400, 253)).toBe(50);
    expect(chooseScale(1e7, 1e7, 400, 253)).toBeNull();
  });

  it('PDF réel : en-tête, projet, échelle, nomenclature', () => {
    const r = renderPdf({ doc, projectName: 'Gala Test', planName: 'Plan A', revision: 3, date: new Date('2026-10-16T10:00:00Z'), variant: 'general', format: 'a3', includeBom: true });
    const text = new TextDecoder('latin1').decode(r.bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Gala Test');
    expect(text).toContain('Version 3');
    expect(text).toContain('chelle 1:50');
    expect(text).toContain('Nomenclature');
    expect(r.pages).toBe(2);
  });

  it('CSV : nomenclature cohérente avec le plan et liste détaillée', () => {
    const csv = bomCsv(doc);
    expect(csv.charCodeAt(0) === 0xfeff).toBe(true);
    const total = csv.trim().split('\r\n').at(-1)!.split(';');
    expect(Number(total[5])).toBe(doc.objects.length);
    expect(Number(total[6])).toBe(40);
    expect(objectsCsv(doc).trim().split('\r\n')).toHaveLength(doc.objects.length + 1);
  });

  it('import de catalogue CSV avec validation ligne par ligne', () => {
    const r = parseCatalogCsv('nom;largeur_mm;profondeur_mm;places;forme\n"Table ""Ovale""";2000;1000;8;rect\nCassée;-3;100;;\nGuéridon;600;600;2;round');
    expect(r.templates.map((t) => t.name)).toEqual(['Table "Ovale"', 'Guéridon']);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('Ligne 3');
    expect(parseCatalogCsv('a;b\n1;2').errors[0]).toContain('Colonnes manquantes');
  });
});
