import { z } from 'zod';
import {
  DEFAULT_BANQUET,
  DEFAULT_CONCERT,
  DEFAULT_CONFERENCE,
  DEFAULT_SALON,
  type LayoutRequest,
} from '../domain/layout/generators';

/**
 * Assistant d'implantation : transforme une description en français en une proposition STRUCTURÉE
 * (jamais en commandes directes sur le moteur). La proposition est validée par un schéma, puis passée
 * aux générateurs dont le résultat est contrôlé géométriquement et appliqué comme une étape annulable.
 *
 * Implémentation actuelle : analyse locale par règles (aucun service externe). Un fournisseur LLM pourra
 * être branché en produisant le même objet, qui devra passer `ProposalSchema`.
 */

const mm = z.number().int().min(1000).max(500_000);
const size = z.object({ width: mm, depth: mm });

export const ProposalSchema = z.object({
  room: size.nullable(),
  request: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('banquet'),
      options: z.object({
        guests: z.number().int().min(1).max(10_000),
        tableTemplateId: z.enum(['table-ronde-120', 'table-ronde-150', 'table-ronde-180', 'table-rect-180', 'table-rect-240']),
        seatsPerTable: z.number().int().min(1).max(30),
        aisle: z.number().min(300).max(5000),
        wallMargin: z.number().min(0).max(5000),
        headTableSeats: z.number().int().min(0).max(40),
        buffets: z.number().int().min(0).max(10),
        danceFloor: size.nullable(),
        stage: size.nullable(),
      }),
    }),
    z.object({
      kind: z.literal('conference'),
      options: z.object({
        seats: z.number().int().min(1).max(10_000),
        rowPitch: z.number().min(700).max(2000),
        centralAisle: z.number().min(0).max(5000),
        sideAisle: z.number().min(0).max(5000),
        crossAisleEvery: z.number().int().min(0).max(50),
        crossAisle: z.number().min(0).max(5000),
        stage: size.nullable(),
        frontGap: z.number().min(0).max(10_000),
        screens: z.boolean(),
        regie: z.boolean(),
        reservedRows: z.number().int().min(0).max(50),
      }),
    }),
    z.object({
      kind: z.literal('salon'),
      options: z.object({
        stands: z.number().int().min(1).max(1000),
        standWidth: mm,
        standDepth: mm,
        aisle: z.number().min(1000).max(10_000),
        wallMargin: z.number().min(0).max(10_000),
        crossAisleEvery: z.number().int().min(0).max(50),
      }),
    }),
    z.object({
      kind: z.literal('concert'),
      options: z.object({
        stage: size,
        danceFloorDepth: z.number().min(0).max(100_000),
        regie: z.boolean(),
        bar: z.boolean(),
        techZone: z.boolean(),
        standingTables: z.number().int().min(0).max(200),
      }),
    }),
  ]),
  understood: z.array(z.string()),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export type ParseOutcome = { ok: true; proposal: Proposal } | { ok: false; error: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .replace(/×/g, 'x');

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const num = (s: string) => Number(s.replace(',', '.'));
/** « 20 par 20 mètres », « 6x4 m », « 3 sur 3 » → mm. */
const PAIR = String.raw`${NUM}\s*(?:m|metres?)?\s*(?:par|x|sur)\s*${NUM}\s*(?:m|metres?)?`;
const pair = (text: string, prefix: string): { width: number; depth: number } | null => {
  const m = new RegExp(`${prefix}\\s*(?:de\\s*)?${PAIR}`).exec(text);
  return m ? { width: Math.round(num(m[1]!) * 1000), depth: Math.round(num(m[2]!) * 1000) } : null;
};

export function parseDescription(input: string): ParseOutcome {
  const t = norm(input);
  if (!t.trim()) return { ok: false, error: 'Décrivez l’implantation souhaitée.' };
  const understood: string[] = [];

  const room = pair(t, 'salle');
  if (room) understood.push(`Salle de ${room.width / 1000} × ${room.depth / 1000} m`);

  const guestsMatch = /(\d+)\s*(?:personnes|invites|convives|participants|places|pax)/.exec(t.replace(/tables? (?:rondes? |rectangulaires? )?de \d+\s*(?:personnes|places|couverts)/g, ''));
  const guests = guestsMatch ? Number(guestsMatch[1]) : null;
  const stage = pair(t, 'scene') ?? (/\bscene\b/.test(t) ? { width: 6000, depth: 4000 } : null);

  let kind: LayoutRequest['kind'] = 'banquet';
  if (/conference|seminaire|rangees?|amphi|pleniere|assemblee/.test(t)) kind = 'conference';
  else if (/salon|stands?|expo/.test(t)) kind = 'salon';
  else if (/concert|soiree|\bdj\b|festival/.test(t)) kind = 'concert';

  let request: LayoutRequest;
  if (kind === 'banquet') {
    if (!guests) return { ok: false, error: 'Nombre d’invités introuvable (exemple : « pour 160 personnes »).' };
    const seatsM = /tables? (?:rondes? |rectangulaires? )?de (\d+)\s*(?:personnes|places|couverts)?/.exec(t);
    const seats = seatsM ? Number(seatsM[1]) : 8;
    const rect = /rectangulaire/.test(t);
    const tableTemplateId = rect ? (seats > 6 ? 'table-rect-240' : 'table-rect-180') : seats <= 6 ? 'table-ronde-120' : seats <= 8 ? 'table-ronde-150' : 'table-ronde-180';
    const piste = /piste/.test(t) ? (pair(t, 'piste(?: de danse)?') ?? { width: 6000, depth: 6000 }) : null;
    const headM = /table d'honneur(?: de (\d+))?/.exec(t);
    const buffetsM = /(\d+) buffets?/.exec(t);
    const aisleM = new RegExp(`allees? de ${NUM}\\s*(cm|m)`).exec(t);
    request = {
      kind,
      options: {
        ...DEFAULT_BANQUET,
        guests,
        seatsPerTable: seats,
        tableTemplateId,
        stage,
        danceFloor: piste,
        headTableSeats: headM ? Number(headM[1] ?? 10) : 0,
        buffets: buffetsM ? Number(buffetsM[1]) : /buffet/.test(t) ? 1 : 0,
        aisle: aisleM ? Math.round(num(aisleM[1]!) * (aisleM[2] === 'cm' ? 10 : 1000)) : DEFAULT_BANQUET.aisle,
      },
    };
    understood.push(`Banquet pour ${guests} invités, tables ${rect ? 'rectangulaires' : 'rondes'} de ${seats}`);
    if (stage) understood.push(`Scène ${stage.width / 1000} × ${stage.depth / 1000} m`);
    if (piste) understood.push(`Piste de danse centrale ${piste.width / 1000} × ${piste.depth / 1000} m`);
    if (headM) understood.push(`Table d'honneur (${headM[1] ?? 10} places)`);
  } else if (kind === 'conference') {
    if (!guests) return { ok: false, error: 'Nombre de places introuvable (exemple : « 200 places »).' };
    const reservedM = /(\d+) rang(?:ee)?s? reserve/.exec(t);
    request = {
      kind,
      options: {
        ...DEFAULT_CONFERENCE,
        seats: guests,
        stage: stage ?? DEFAULT_CONFERENCE.stage,
        regie: !/sans regie/.test(t),
        screens: !/sans ecran/.test(t),
        centralAisle: /sans allee centrale/.test(t) ? 0 : DEFAULT_CONFERENCE.centralAisle,
        reservedRows: reservedM ? Number(reservedM[1]) : 0,
      },
    };
    understood.push(`Conférence de ${guests} places en rangées face à la scène`);
  } else if (kind === 'salon') {
    const standsM = /(\d+) stands?/.exec(t);
    if (!standsM) return { ok: false, error: 'Nombre de stands introuvable (exemple : « 24 stands de 3 par 3 m »).' };
    const sz = pair(t, 'stands?(?: de)?') ?? { width: 3000, depth: 3000 };
    request = { kind, options: { ...DEFAULT_SALON, stands: Number(standsM[1]), standWidth: sz.width, standDepth: sz.depth } };
    understood.push(`Salon de ${standsM[1]} stands de ${sz.width / 1000} × ${sz.depth / 1000} m`);
  } else {
    request = { kind, options: { ...DEFAULT_CONCERT, stage: stage ?? DEFAULT_CONCERT.stage, bar: !/sans bar/.test(t), regie: !/sans regie/.test(t) } };
    understood.push('Concert / soirée : scène, piste, régie et bar');
  }

  const r = ProposalSchema.safeParse({ room, request, understood });
  if (!r.success) return { ok: false, error: `Valeurs hors limites : ${r.error.issues.map((i) => i.path.join('.')).join(', ')}` };
  return { ok: true, proposal: r.data };
}
