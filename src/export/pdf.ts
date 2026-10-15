import { jsPDF } from 'jspdf';
import { computeBom, computeMetrics } from '../domain/bom';
import { CATEGORY_LABELS } from '../domain/catalog';
import type { PlanDocument } from '../domain/types';
import { formatArea } from '../domain/units';
import { buildDrawList, legend, VARIANTS, type Variant } from './drawList';

export type PaperFormat = 'a4' | 'a3';
const PAPER: Record<PaperFormat, [number, number]> = { a4: [297, 210], a3: [420, 297] };
/** Échelles normalisées d'architecture ; le plan n'est déclaré « à l'échelle » que si l'une d'elles convient. */
const SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000];
const PT_PER_MM = 72 / 25.4;
const MARGIN = 10;
const TITLE_H = 24;

export interface PdfOptions {
  doc: PlanDocument;
  projectName: string;
  planName: string;
  revision: number;
  date: Date;
  variant: Variant;
  format: PaperFormat;
  includeBom: boolean;
}

export interface PdfResult {
  bytes: ArrayBuffer;
  /** Dénominateur d'échelle (1:N) effectivement appliqué, ou null si ajusté à la page. */
  scale: number | null;
  pages: number;
}

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

export function chooseScale(widthMm: number, heightMm: number, areaW: number, areaH: number): number | null {
  return SCALES.find((s) => widthMm / s <= areaW && heightMm / s <= areaH) ?? null;
}

export function renderPdf(o: PdfOptions): PdfResult {
  const [pw, ph] = PAPER[o.format];
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: o.format, compress: false });
  const title = `${o.projectName} – ${o.planName}`;
  pdf.setProperties({ title, subject: VARIANTS[o.variant].label, creator: 'Planora Events' });

  const { prims, bounds, objects } = buildDrawList(o.doc, o.variant);
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const areaW = pw - 2 * MARGIN;
  const areaH = ph - 2 * MARGIN - TITLE_H;
  const scale = chooseScale(w, h, areaW, areaH);
  const k = 1 / (scale ?? Math.max(w / areaW, h / areaH));
  const ox = MARGIN + (areaW - w * k) / 2;
  const oy = MARGIN + (areaH - h * k) / 2;
  const X = (x: number) => ox + (x - bounds.minX) * k;
  const Y = (y: number) => oy + (y - bounds.minY) * k;
  const opacity = (v: number) => pdf.setGState(new (pdf as unknown as { GState: new (p: { opacity: number }) => unknown }).GState({ opacity: v }));

  pdf.setFont('helvetica', 'normal');
  for (const p of prims) {
    if (p.t === 'poly') {
      if (p.pts.length < 3) continue;
      pdf.setLineWidth(Math.max(0.1, p.width * k));
      pdf.setLineDashPattern(p.dash ? [1.5, 1] : [], 0);
      if (p.stroke) pdf.setDrawColor(...hex(p.stroke));
      if (p.fill) pdf.setFillColor(...hex(p.fill));
      opacity(p.opacity);
      pdf.moveTo(X(p.pts[0]!.x), Y(p.pts[0]!.y));
      for (const q of p.pts.slice(1)) pdf.lineTo(X(q.x), Y(q.y));
      pdf.close();
      if (p.fill && p.stroke) pdf.fillStroke();
      else if (p.fill) pdf.fill();
      else pdf.stroke();
      opacity(1);
    } else if (p.t === 'line') {
      pdf.setLineWidth(Math.max(0.1, p.width * k));
      pdf.setLineDashPattern(p.dash ? [1, 0.8] : [], 0);
      pdf.setDrawColor(...hex(p.stroke));
      pdf.line(X(p.a.x), Y(p.a.y), X(p.b.x), Y(p.b.y));
    } else {
      const pt = Math.max(3, p.size * k * PT_PER_MM);
      pdf.setFontSize(pt);
      pdf.setTextColor(...hex(p.color));
      pdf.text(p.text, X(p.x), Y(p.y), { align: 'center', baseline: 'middle', angle: -p.rotation });
    }
  }
  pdf.setLineDashPattern([], 0);

  // Cartouche.
  const ty = ph - MARGIN - TITLE_H + 4;
  pdf.setDrawColor(30, 41, 59);
  pdf.setLineWidth(0.3);
  pdf.rect(MARGIN, ty, areaW, TITLE_H - 4);
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(o.projectName, MARGIN + 3, ty + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`${o.planName} – ${VARIANTS[o.variant].label}`, MARGIN + 3, ty + 11);
  pdf.text(`Version ${o.revision} – ${o.date.toLocaleDateString('fr-FR')} ${o.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, MARGIN + 3, ty + 16);
  const scaleText = scale
    ? `Échelle 1:${scale} (impression ${o.format.toUpperCase()} à 100 %)`
    : 'Plan ajusté à la page : aucune échelle normalisée garantie';
  pdf.text(scaleText, MARGIN + 110, ty + 6);
  pdf.text(`Salle : ${o.doc.room.name} – ${formatArea(computeMetrics(o.doc).roomArea)}`, MARGIN + 110, ty + 11);
  pdf.setFontSize(7);
  pdf.text('Document indicatif : conformité réglementaire (ERP, sécurité) à faire valider par un professionnel qualifié.', MARGIN + 110, ty + 16);
  if (scale) {
    // Barre d'échelle de 5 m (ou 1 m aux grandes échelles).
    const meters = scale <= 50 ? 1 : 5;
    const len = (meters * 1000) / scale;
    const bx = pw - MARGIN - len - 8;
    pdf.setFillColor(15, 23, 42);
    pdf.rect(bx, ty + 5, len, 1.5, 'F');
    pdf.setFontSize(7);
    pdf.text(`${meters} m`, bx + len / 2, ty + 11, { align: 'center' });
  }
  // Légende compacte.
  let lx = MARGIN + 215;
  pdf.setFontSize(7);
  for (const l of legend(objects).slice(0, 6)) {
    if (lx > pw - MARGIN - 60) break;
    pdf.setFillColor(...hex(l.color));
    pdf.rect(lx, ty + 13.5, 3, 3, 'F');
    pdf.text(`${l.label} (${l.count})`, lx + 4, ty + 16);
    lx += 4 + pdf.getTextWidth(`${l.label} (${l.count})`) + 5;
  }

  if (o.includeBom) {
    pdf.addPage(o.format, 'landscape');
    let y = MARGIN + 6;
    const m = computeMetrics(o.doc);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(15, 23, 42);
    pdf.text(`Nomenclature – ${title}`, MARGIN, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(
      `Places assises : ${m.seats} · Tables : ${m.tables} (capacité ${m.tableCapacity}) · Chaises : ${m.chairs} · Objets : ${m.objectCount} · Surface salle : ${formatArea(m.roomArea)}`,
      MARGIN,
      y,
    );
    y += 8;
    const cols = [
      ['Catégorie', 0],
      ['Désignation', 35],
      ['Dimensions (mm)', 130],
      ['Qté', 170],
      ['Places', 185],
      ['Répartition par zone', 205],
    ] as const;
    const header = () => {
      pdf.setFont('helvetica', 'bold');
      for (const [c, x] of cols) pdf.text(c, MARGIN + x, y);
      pdf.setFont('helvetica', 'normal');
      pdf.line(MARGIN, y + 1.5, pw - MARGIN, y + 1.5);
      y += 6;
    };
    header();
    for (const l of computeBom(o.doc)) {
      if (y > ph - MARGIN) {
        pdf.addPage(o.format, 'landscape');
        y = MARGIN + 6;
        header();
      }
      const zones = Object.entries(l.byZone).map(([z, q]) => `${z} : ${q}`).join(', ');
      const vals = [CATEGORY_LABELS[l.category], l.name, `${l.width} × ${l.depth}`, String(l.quantity), String(l.seats), zones];
      vals.forEach((v, i) => pdf.text(String(pdf.splitTextToSize(v, i === 5 ? pw - 2 * MARGIN - 205 : i === 1 ? 92 : 33)[0] ?? ''), MARGIN + cols[i]![1], y));
      y += 5.5;
    }
    if (m.zones.length) {
      y += 6;
      if (y > ph - MARGIN - 10) {
        pdf.addPage(o.format, 'landscape');
        y = MARGIN + 6;
      }
      pdf.setFont('helvetica', 'bold');
      pdf.text('Zones', MARGIN, y);
      pdf.setFont('helvetica', 'normal');
      y += 6;
      for (const z of m.zones) {
        if (y > ph - MARGIN) {
          pdf.addPage(o.format, 'landscape');
          y = MARGIN + 6;
        }
        pdf.text(`${z.name} – ${formatArea(z.area)} – ${z.objects} objet(s)`, MARGIN, y);
        y += 5.5;
      }
    }
  }
  return { bytes: pdf.output('arraybuffer'), scale, pages: pdf.getNumberOfPages() };
}
