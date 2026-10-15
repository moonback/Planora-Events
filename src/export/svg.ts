import type { PlanDocument } from '../domain/types';
import { buildDrawList, type Variant } from './drawList';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => (Math.round(v * 10) / 10).toString();

/**
 * SVG vectoriel en millimètres réels : width/height exprimés en mm et viewBox en mm,
 * donc une impression à 100 % respecte l'échelle 1:1 des coordonnées métier.
 */
export function renderSvg(doc: PlanDocument, variant: Variant, opts: { title?: string; onlyIds?: ReadonlySet<string> } = {}): string {
  const { prims, bounds } = buildDrawList(doc, variant, opts.onlyIds);
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const body = prims
    .map((p) => {
      switch (p.t) {
        case 'poly':
          return `<polygon points="${p.pts.map((q) => `${n(q.x)},${n(q.y)}`).join(' ')}" fill="${p.fill ?? 'none'}" fill-opacity="${p.opacity}" stroke="${p.stroke ?? 'none'}" stroke-width="${p.width}"${p.dash ? ' stroke-dasharray="120 80"' : ''} stroke-linejoin="round"/>`;
        case 'line':
          return `<line x1="${n(p.a.x)}" y1="${n(p.a.y)}" x2="${n(p.b.x)}" y2="${n(p.b.y)}" stroke="${p.stroke}" stroke-width="${p.width}"${p.dash ? ' stroke-dasharray="80 60"' : ''}/>`;
        case 'text':
          return `<text x="${n(p.x)}" y="${n(p.y)}" font-size="${n(p.size)}" fill="${p.color}" text-anchor="middle" dominant-baseline="middle"${p.rotation ? ` transform="rotate(${n(p.rotation)} ${n(p.x)} ${n(p.y)})"` : ''}>${esc(p.text)}</text>`;
      }
    })
    .join('\n  ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}mm" height="${n(h)}mm" viewBox="${n(bounds.minX)} ${n(bounds.minY)} ${n(w)} ${n(h)}" font-family="Helvetica, Arial, sans-serif">
  <title>${esc(opts.title ?? 'Plan')}</title>
  <rect x="${n(bounds.minX)}" y="${n(bounds.minY)}" width="${n(w)}" height="${n(h)}" fill="#f8fafc"/>
  ${body}
</svg>
`;
}
