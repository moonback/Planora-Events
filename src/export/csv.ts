import { CATEGORY_LABELS } from '../domain/catalog';
import { computeBom } from '../domain/bom';
import { pointInPolygon } from '../domain/geometry';
import { ObjectTemplateSchema, type ObjectTemplate, type PlanDocument } from '../domain/types';
import { newId } from '../domain/document';

/** Séparateur « ; » et BOM UTF-8 : ouverture directe et correcte dans Excel en français. */
const cell = (v: string | number) => {
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: (string | number)[][]) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';

/** Nomenclature agrégée : une ligne par modèle et dimensions, avec répartition par zone. */
export function bomCsv(doc: PlanDocument): string {
  const lines = computeBom(doc);
  const rows: (string | number)[][] = [['Catégorie', 'Désignation', 'Modèle', 'Largeur (mm)', 'Profondeur (mm)', 'Quantité', 'Places assises', 'Répartition par zone']];
  for (const l of lines) {
    const zones = Object.entries(l.byZone).map(([z, q]) => `${z} : ${q}`).join(' | ');
    rows.push([CATEGORY_LABELS[l.category], l.name, l.templateId, l.width, l.depth, l.quantity, l.seats, zones]);
  }
  rows.push(['TOTAL', '', '', '', '', lines.reduce((s, l) => s + l.quantity, 0), lines.reduce((s, l) => s + l.seats, 0), '']);
  return toCsv(rows);
}

/** Liste détaillée : un objet par ligne avec identifiant, position et zone (pour les équipes terrain). */
export function objectsCsv(doc: PlanDocument): string {
  const rows: (string | number)[][] = [['Identifiant', 'Repère', 'Catégorie', 'Désignation', 'Largeur (mm)', 'Profondeur (mm)', 'X (mm)', 'Y (mm)', 'Rotation (°)', 'Places', 'Zone']];
  for (const o of doc.objects) {
    const zone = doc.zones.find((z) => pointInPolygon({ x: o.x, y: o.y }, z.points))?.name ?? '';
    rows.push([o.id, o.label, CATEGORY_LABELS[o.category], o.name, Math.round(o.width), Math.round(o.depth), Math.round(o.x), Math.round(o.y), Math.round(o.rotation * 10) / 10, o.seats, zone]);
  }
  return toCsv(rows);
}

/** Découpe une ligne CSV (séparateur « ; » ou « , », guillemets doubles). */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export interface CatalogImport {
  templates: ObjectTemplate[];
  errors: string[];
}

/**
 * Import d'un catalogue CSV. Colonnes attendues (en-tête obligatoire) :
 * nom ; largeur_mm ; profondeur_mm ; places ; forme (rect|round) ; couleur (#rrggbb, facultatif).
 */
export function parseCatalogCsv(text: string): CatalogImport {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { templates: [], errors: ['Le fichier ne contient aucune ligne de données.'] };
  const sep = lines[0]!.includes(';') ? ';' : ',';
  const header = splitLine(lines[0]!, sep).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const missing = ['nom', 'largeur_mm', 'profondeur_mm'].filter((c) => col(c) < 0);
  if (missing.length) return { templates: [], errors: [`Colonnes manquantes : ${missing.join(', ')}.`] };
  const templates: ObjectTemplate[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, i) => {
    const c = splitLine(line, sep);
    const get = (name: string) => (col(name) >= 0 ? (c[col(name)] ?? '') : '');
    const num = (name: string) => Number(get(name).replace(',', '.'));
    const seats = get('places') ? num('places') : 0;
    const shape = get('forme') === 'round' ? 'round' : 'rect';
    const r = ObjectTemplateSchema.safeParse({
      id: newId(),
      name: get('nom'),
      category: 'personnalise',
      family: 'Import CSV',
      shape,
      role: seats > 0 && shape === 'rect' && num('largeur_mm') < 1000 ? 'siege' : 'table',
      width: num('largeur_mm'),
      depth: num('profondeur_mm'),
      seats: 0,
      capacity: seats,
      color: /^#[0-9a-f]{6}$/i.test(get('couleur')) ? get('couleur') : '#94a3b8',
      custom: true,
    });
    if (r.success) templates.push(r.data);
    else errors.push(`Ligne ${i + 2} : ${r.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join(', ')}`);
  });
  return { templates, errors };
}
