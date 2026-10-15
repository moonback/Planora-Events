import { newId } from '../document';
import { objectPolygon, rectPolygon } from '../geometry';
import { tablesNeeded } from '../bom';
import type { PlanDocument, PlanObject } from '../types';
import {
  chairsAroundRect,
  chairsAroundRound,
  CHAIR_GAP,
  makeObject,
  maxChairsAroundRound,
  maxChairsPerSide,
  Placer,
  template,
  type Diagnostic,
  type LayoutResult,
} from './engine';

export interface Size {
  width: number;
  depth: number;
}

export interface BanquetOptions {
  guests: number;
  tableTemplateId: string;
  seatsPerTable: number;
  /** Espace libre entre les emprises (tables + chaises). */
  aisle: number;
  wallMargin: number;
  headTableSeats: number;
  buffets: number;
  danceFloor: Size | null;
  stage: Size | null;
}

export interface ConferenceOptions {
  seats: number;
  rowPitch: number;
  centralAisle: number;
  sideAisle: number;
  crossAisleEvery: number;
  crossAisle: number;
  stage: Size | null;
  frontGap: number;
  screens: boolean;
  regie: boolean;
  reservedRows: number;
}

export interface SalonOptions {
  stands: number;
  standWidth: number;
  standDepth: number;
  aisle: number;
  wallMargin: number;
  crossAisleEvery: number;
}

export interface ConcertOptions {
  stage: Size;
  danceFloorDepth: number;
  regie: boolean;
  bar: boolean;
  techZone: boolean;
  standingTables: number;
}

export type LayoutRequest =
  | { kind: 'banquet'; options: BanquetOptions }
  | { kind: 'conference'; options: ConferenceOptions }
  | { kind: 'salon'; options: SalonOptions }
  | { kind: 'concert'; options: ConcertOptions };

export const DEFAULT_BANQUET: BanquetOptions = {
  guests: 80,
  tableTemplateId: 'table-ronde-180',
  seatsPerTable: 10,
  aisle: 900,
  wallMargin: 900,
  headTableSeats: 0,
  buffets: 1,
  danceFloor: null,
  stage: null,
};
export const DEFAULT_CONFERENCE: ConferenceOptions = {
  seats: 100,
  rowPitch: 950,
  centralAisle: 1400,
  sideAisle: 1200,
  crossAisleEvery: 10,
  crossAisle: 1200,
  stage: { width: 6000, depth: 3000 },
  frontGap: 2000,
  screens: true,
  regie: true,
  reservedRows: 0,
};
export const DEFAULT_SALON: SalonOptions = { stands: 20, standWidth: 3000, standDepth: 3000, aisle: 3000, wallMargin: 1500, crossAisleEvery: 6 };
export const DEFAULT_CONCERT: ConcertOptions = {
  stage: { width: 8000, depth: 5000 },
  danceFloorDepth: 8000,
  regie: true,
  bar: true,
  techZone: true,
  standingTables: 6,
};

const positive = (v: number, name: string, diags: Diagnostic[]): boolean => {
  if (Number.isFinite(v) && v > 0) return true;
  diags.push({ level: 'erreur', message: `${name} doit être un nombre positif.` });
  return false;
};

function placeStage(p: Placer, size: Size, clearance: number, diags: Diagnostic[]): PlanObject | null {
  const b = p.bounds;
  const stage = makeObject(template('scene-6x4'), (b.minX + b.maxX) / 2, b.minY + size.depth / 2, 0, {
    name: `Scène ${size.width / 1000}×${size.depth / 1000} m`,
    width: size.width,
    depth: size.depth,
  });
  if (p.tryPlace(stage, clearance)) return stage;
  diags.push({ level: 'erreur', message: `La scène de ${size.width / 1000} × ${size.depth / 1000} m ne tient pas contre le mur du fond (haut du plan).` });
  return null;
}

export function generateBanquet(doc: PlanDocument, o: BanquetOptions): LayoutResult {
  const diags: Diagnostic[] = [];
  const p = new Placer(doc);
  const b = p.bounds;
  const chair = template('chaise');
  const tpl = template(o.tableTemplateId);
  if (!positive(o.guests, "Le nombre d'invités", diags) || !positive(o.seatsPerTable, 'La capacité par table', diags)) {
    return { document: doc, diagnostics: diags, placedSeats: 0, targetSeats: o.guests };
  }

  const round = tpl.shape === 'round';
  const maxSeats = round ? maxChairsAroundRound(tpl.width, chair) : 2 * maxChairsPerSide(tpl.width, chair);
  let perTable = o.seatsPerTable;
  if (perTable > maxSeats) {
    diags.push({ level: 'erreur', message: `${perTable} chaises ne tiennent pas autour de « ${tpl.name} » (maximum ${maxSeats}). Capacité ramenée à ${maxSeats}.` });
    perTable = maxSeats;
  }

  let top = b.minY + o.wallMargin;
  if (o.stage) {
    const s = placeStage(p, o.stage, o.aisle, diags);
    if (s) top = b.minY + o.stage.depth + o.aisle;
  }

  let remaining = o.guests;
  if (o.headTableSeats > 0) {
    const ht = template('table-honneur');
    const width = Math.max(1800, o.headTableSeats * (chair.width + 150));
    const groupId = newId();
    const y = top + chair.depth + CHAIR_GAP + ht.depth / 2;
    const table = makeObject(ht, (b.minX + b.maxX) / 2, y, 0, { width, capacity: o.headTableSeats, groupId, label: "Table d'honneur" });
    const chairs = chairsAroundRect(table, chair, o.headTableSeats, 'top');
    const h = ht.depth + chair.depth + CHAIR_GAP;
    const foot = rectPolygon(table.x - width / 2 - o.aisle, top - o.aisle / 2, width + 2 * o.aisle, h + o.aisle * 1.5);
    if (p.tryPlaceAll([table, ...chairs], foot)) {
      remaining -= o.headTableSeats;
      top += h + o.aisle;
    } else diags.push({ level: 'erreur', message: "La table d'honneur ne peut pas être placée (place insuffisante)." });
  }

  if (o.danceFloor) {
    const { width, depth } = o.danceFloor;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (top + b.maxY) / 2;
    const zone = rectPolygon(cx - width / 2, cy - depth / 2, width, depth);
    if (p.free(zone)) {
      p.addZone('Piste de danse', 'piste', '#a855f7', cx - width / 2, cy - depth / 2, width, depth, false);
      p.reserve(rectPolygon(cx - width / 2 - o.aisle, cy - depth / 2 - o.aisle, width + 2 * o.aisle, depth + 2 * o.aisle));
    } else diags.push({ level: 'erreur', message: `La piste de danse de ${width / 1000} × ${depth / 1000} m ne tient pas au centre de la salle.` });
  }

  if (o.buffets > 0) {
    const bt = template('buffet');
    let placed = 0;
    const x = b.maxX - 1000 - bt.depth / 2; // 1 m de service derrière le buffet
    for (let y = top + bt.width / 2; y <= b.maxY - bt.width / 2 && placed < o.buffets; y += bt.width + o.aisle) {
      if (p.tryPlace(makeObject(bt, x, y, 90, { label: `Buffet ${placed + 1}` }), o.aisle)) placed++;
    }
    if (placed > 0) p.addZone('Service traiteur', 'traiteur', '#eab308', x + bt.depth / 2, top, b.maxX - x - bt.depth / 2, Math.min(b.maxY - top, placed * (bt.width + o.aisle)), false);
    if (placed < o.buffets) diags.push({ level: 'avertissement', message: `${placed} buffet(s) placé(s) sur ${o.buffets} demandé(s).` });
  }

  const chairReach = chair.depth + CHAIR_GAP;
  const fw = round ? tpl.width + 2 * chairReach : tpl.width;
  const fh = tpl.depth + 2 * chairReach;
  const needed = tablesNeeded(remaining, perTable);
  let tables = 0;
  // Balayage glouton (pas de 20 cm) : chaque emprise est élargie d'une demi-allée, ce qui garantit
  // une allée complète entre deux tables tout en épousant scène, piste et obstacles.
  const half = o.aisle / 2;
  const [w, h] = [fw + o.aisle, fh + o.aisle];
  const step = 200;
  outer: for (let y = b.minY + o.wallMargin + fh / 2; y <= b.maxY - o.wallMargin - fh / 2; y += step) {
    for (let x = b.minX + o.wallMargin + fw / 2; x <= b.maxX - o.wallMargin - fw / 2; x += step) {
      if (tables >= needed || remaining <= 0) break outer;
      const foot = round ? objectPolygon({ x, y, width: w, depth: h, rotation: 0, shape: 'round' }) : rectPolygon(x - w / 2, y - h / 2, w, h);
      if (!p.free(foot)) continue;
      const groupId = newId();
      const n = Math.min(perTable, remaining);
      const table = makeObject(tpl, x, y, 0, { groupId, label: `T${tables + 1}`, capacity: perTable });
      const chairs = round ? chairsAroundRound(table, chair, n) : chairsAroundRect(table, chair, n);
      if (p.tryPlaceAll([table, ...chairs], foot)) {
        tables++;
        remaining -= n;
        x += fw + half - step;
      }
    }
  }

  const placedSeats = o.guests - remaining;
  if (remaining > 0) {
    diags.push({
      level: 'erreur',
      message: `Seulement ${placedSeats} places sur ${o.guests} ont pu être placées. Réduisez les allées, choisissez des tables plus grandes ou retirez des éléments.`,
    });
  }
  diags.push({ level: 'info', message: `${tables} table(s) « ${tpl.name} » et ${p.objects.filter((x) => x.shape === 'chair').length} chaise(s) placées.` });
  return { document: p.result(), diagnostics: diags, placedSeats, targetSeats: o.guests };
}

export function generateConference(doc: PlanDocument, o: ConferenceOptions): LayoutResult {
  const diags: Diagnostic[] = [];
  const p = new Placer(doc);
  const b = p.bounds;
  const chair = template('chaise');
  if (!positive(o.seats, 'Le nombre de places', diags) || !positive(o.rowPitch, "L'entraxe des rangées", diags)) {
    return { document: doc, diagnostics: diags, placedSeats: 0, targetSeats: o.seats };
  }
  if (o.rowPitch < chair.depth + 300) diags.push({ level: 'avertissement', message: `Entraxe de rangées de ${o.rowPitch} mm : moins de 30 cm de passage entre rangées.` });

  let front = b.minY + 1000;
  if (o.stage) {
    const s = placeStage(p, o.stage, 0, diags);
    if (s) {
      front = b.minY + o.stage.depth;
      if (o.screens) {
        const sc = template('ecran-3m');
        for (const side of [-1, 1]) {
          const x = s.x + side * (o.stage.width / 2 + 500 + sc.width / 2);
          if (!p.tryPlace(makeObject(sc, x, b.minY + 600, 0), 300)) diags.push({ level: 'avertissement', message: "Un écran latéral n'a pas pu être placé à côté de la scène." });
        }
      }
    }
  }
  let back = b.maxY - 1000;
  if (o.regie) {
    const r = template('regie');
    const regie = makeObject(r, (b.minX + b.maxX) / 2, b.maxY - 1000 - r.depth / 2, 0);
    if (p.tryPlace(regie, 800)) back = regie.y - r.depth / 2 - 1200;
    else diags.push({ level: 'avertissement', message: "La régie n'a pas pu être placée en fond de salle." });
  }

  const left = b.minX + o.sideAisle;
  const right = b.maxX - o.sideAisle;
  const blocks: [number, number][] = o.centralAisle > 0
    ? [[left, (left + right) / 2 - o.centralAisle / 2], [(left + right) / 2 + o.centralAisle / 2, right]]
    : [[left, right]];

  let placed = 0;
  let firstY: number | null = null;
  let lastY = 0;
  for (let r = 0; placed < o.seats; r++) {
    const y = front + o.frontGap + chair.depth / 2 + r * o.rowPitch + (o.crossAisleEvery > 0 ? Math.floor(r / o.crossAisleEvery) * o.crossAisle : 0);
    if (y + chair.depth / 2 > back) break;
    let rowPlaced = 0;
    for (const [x0, x1] of blocks) {
      const n = Math.floor((x1 - x0) / chair.width);
      const groupId = newId();
      // Remplissage depuis l'allée centrale vers les murs.
      const xs = Array.from({ length: n }, (_, i) => x0 + chair.width * (i + 0.5));
      if (blocks.length === 2 && x0 < (left + right) / 2) xs.reverse();
      for (const x of xs) {
        if (placed >= o.seats) break;
        if (p.tryPlace(makeObject(chair, x, y, 0, { groupId, label: `R${r + 1}` }))) {
          placed++;
          rowPlaced++;
        }
      }
    }
    if (rowPlaced > 0) {
      firstY ??= y;
      lastY = y;
    }
  }

  if (firstY !== null) {
    if (o.centralAisle > 0) {
      const cx = (left + right) / 2;
      p.addZone('Allée centrale', 'circulation', '#22c55e', cx - o.centralAisle / 2, firstY - chair.depth / 2, o.centralAisle, lastY - firstY + chair.depth, false);
    }
    if (o.reservedRows > 0) {
      const h = Math.min(o.reservedRows * o.rowPitch, lastY - firstY + o.rowPitch);
      p.addZone('Rangs réservés', 'reservee', '#64748b', left, firstY - chair.depth / 2, right - left, h - (o.rowPitch - chair.depth), false);
    }
  }
  if (placed < o.seats) diags.push({ level: 'erreur', message: `Seulement ${placed} places sur ${o.seats} ont pu être placées dans l'espace disponible.` });
  diags.push({ level: 'info', message: `${placed} chaise(s) en rangées orientées vers la scène.` });
  return { document: p.result(), diagnostics: diags, placedSeats: placed, targetSeats: o.seats };
}

export function generateSalon(doc: PlanDocument, o: SalonOptions): LayoutResult {
  const diags: Diagnostic[] = [];
  const p = new Placer(doc);
  const b = p.bounds;
  if (!positive(o.stands, 'Le nombre de stands', diags) || !positive(o.standWidth, 'La largeur de stand', diags) || !positive(o.standDepth, 'La profondeur de stand', diags)) {
    return { document: doc, diagnostics: diags, placedSeats: 0, targetSeats: null };
  }
  const st = template('stand-3x3');
  const xs: number[] = [];
  for (let x = b.minX + o.wallMargin, k = 0; x + o.standWidth <= b.maxX - o.wallMargin; k++) {
    xs.push(x + o.standWidth / 2);
    x += o.standWidth;
    if (o.crossAisleEvery > 0 && (k + 1) % o.crossAisleEvery === 0) x += o.aisle;
  }
  let placed = 0;
  let row = 0;
  for (let y = b.minY + o.wallMargin; y + o.standDepth <= b.maxY - o.wallMargin && placed < o.stands; y += 2 * o.standDepth + o.aisle) {
    for (const half of [0, 1]) {
      const cy = y + o.standDepth * (half + 0.5);
      if (cy + o.standDepth / 2 > b.maxY - o.wallMargin) break;
      const letter = String.fromCharCode(65 + row++);
      let n = 0;
      for (const x of xs) {
        if (placed >= o.stands) break;
        const s = makeObject(st, x, cy, half === 0 ? 0 : 180, {
          name: `Stand ${o.standWidth / 1000}×${o.standDepth / 1000} m`,
          width: o.standWidth,
          depth: o.standDepth,
          label: `${letter}${n + 1}`,
        });
        if (p.tryPlace(s)) {
          placed++;
          n++;
        }
      }
    }
  }
  if (placed < o.stands) diags.push({ level: 'erreur', message: `Seulement ${placed} stands sur ${o.stands} ont pu être placés.` });
  diags.push({ level: 'info', message: `${placed} stand(s) numérotés par rangée (A1, A2…), allées de ${o.aisle / 1000} m.` });
  return { document: p.result(), diagnostics: diags, placedSeats: 0, targetSeats: null };
}

export function generateConcert(doc: PlanDocument, o: ConcertOptions): LayoutResult {
  const diags: Diagnostic[] = [];
  const p = new Placer(doc);
  const b = p.bounds;
  const cx = (b.minX + b.maxX) / 2;
  const stage = placeStage(p, o.stage, 0, diags);
  const stageBottom = b.minY + o.stage.depth;

  if (o.techZone && stage) {
    const w = 3000;
    const x = stage.x - o.stage.width / 2 - w - 500;
    const zone = rectPolygon(x, b.minY, w, o.stage.depth);
    if (p.free(zone)) p.addZone('Espace technique', 'technique', '#06b6d4', x, b.minY, w, o.stage.depth);
    else diags.push({ level: 'avertissement', message: "L'espace technique ne tient pas à gauche de la scène." });
  }
  let floorBottom = stageBottom + 1000;
  if (o.danceFloorDepth > 0) {
    const w = Math.min(b.maxX - b.minX - 4000, o.stage.width * 1.5);
    const y = stageBottom + 1000;
    const zone = rectPolygon(cx - w / 2, y, w, o.danceFloorDepth);
    if (w > 0 && p.free(zone)) {
      p.addZone('Piste de danse', 'piste', '#a855f7', cx - w / 2, y, w, o.danceFloorDepth);
      floorBottom = y + o.danceFloorDepth;
    } else diags.push({ level: 'erreur', message: `La piste de ${o.danceFloorDepth / 1000} m de profondeur ne tient pas devant la scène.` });
  }
  if (o.regie) {
    const r = template('regie');
    if (!p.tryPlace(makeObject(r, cx, floorBottom + 2000 + r.depth / 2, 0), 1000)) diags.push({ level: 'avertissement', message: "La régie façade n'a pas pu être placée derrière la piste." });
  }
  if (o.bar) {
    const bt = template('bar');
    if (!p.tryPlace(makeObject(bt, cx, b.maxY - 1200 - bt.depth / 2, 0), 1000)) diags.push({ level: 'avertissement', message: "Le bar n'a pas pu être placé contre le mur du fond." });
    else p.addZone('Arrière-bar (personnel)', 'personnel', '#f97316', cx - bt.width / 2, b.maxY - 1200, bt.width, 1200, false);
  }
  if (o.standingTables > 0) {
    const md = template('mange-debout');
    let placed = 0;
    for (let y = floorBottom + 1000; y < b.maxY - 2000 && placed < o.standingTables; y += 2000) {
      for (const x of [b.minX + 1200, b.maxX - 1200]) {
        if (placed < o.standingTables && p.tryPlace(makeObject(md, x, y), 500)) placed++;
      }
    }
    if (placed < o.standingTables) diags.push({ level: 'avertissement', message: `${placed} mange-debout placé(s) sur ${o.standingTables}.` });
  }
  diags.push({ level: 'info', message: "Capacité debout non calculée : elle dépend de la réglementation applicable à l'établissement." });
  return { document: p.result(), diagnostics: diags, placedSeats: 0, targetSeats: null };
}

export function generateLayout(doc: PlanDocument, req: LayoutRequest): LayoutResult {
  switch (req.kind) {
    case 'banquet':
      return generateBanquet(doc, req.options);
    case 'conference':
      return generateConference(doc, req.options);
    case 'salon':
      return generateSalon(doc, req.options);
    case 'concert':
      return generateConcert(doc, req.options);
  }
}
