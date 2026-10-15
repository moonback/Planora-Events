import { describe, expect, it } from 'vitest';
import { createDocument } from '../domain/document';
import { generateLayout } from '../domain/layout/generators';
import { validatePlan } from '../domain/validation';
import { parseDescription } from './assistant';

describe('assistant d’implantation (analyse locale)', () => {
  it('comprend l’exemple de référence et produit un plan sans erreur géométrique', () => {
    const r = parseDescription(
      'Crée une implantation pour 160 personnes dans une salle de 20 par 20 mètres, avec des tables de 8 personnes, une scène de 6 par 4 mètres et une piste de danse centrale.',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.room).toEqual({ width: 20000, depth: 20000 });
    const req = r.proposal.request;
    expect(req.kind).toBe('banquet');
    if (req.kind !== 'banquet') return;
    expect(req.options).toMatchObject({ guests: 160, seatsPerTable: 8, tableTemplateId: 'table-ronde-150', stage: { width: 6000, depth: 4000 }, danceFloor: { width: 6000, depth: 6000 } });
    const out = generateLayout(createDocument({ width: 20000, depth: 20000 }), req);
    expect(validatePlan(out.document).filter((i) => i.severity === 'erreur')).toEqual([]);
    // Le diagnostic dit la vérité : soit toutes les places sont posées, soit l'écart est signalé comme erreur.
    expect(out.placedSeats === 160 || out.diagnostics.some((d) => d.level === 'erreur')).toBe(true);
  });

  it('reconnaît conférence et salon', () => {
    const c = parseDescription('Conférence de 250 places avec 2 rangées réservées, sans régie');
    expect(c.ok && c.proposal.request.kind === 'conference' && c.proposal.request.options).toMatchObject({ seats: 250, reservedRows: 2, regie: false });
    const s = parseDescription('Salon avec 30 stands de 3 x 2 m dans une salle de 40 x 25 m');
    expect(s.ok && s.proposal.request).toMatchObject({ kind: 'salon', options: { stands: 30, standWidth: 3000, standDepth: 2000 } });
    expect(s.ok && s.proposal.room).toEqual({ width: 40000, depth: 25000 });
  });

  it('refuse les descriptions incomplètes ou hors limites', () => {
    expect(parseDescription('')).toMatchObject({ ok: false });
    expect(parseDescription('un beau dîner')).toMatchObject({ ok: false });
    expect(parseDescription('dîner pour 50000 personnes')).toMatchObject({ ok: false });
  });
});
