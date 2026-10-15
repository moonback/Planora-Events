import type { PlanDocument } from '../domain/types';
import { buildDrawList, type Variant } from './drawList';
import { renderSvg } from './svg';

const MAX_PX = 8000;

/**
 * PNG rastérisé à partir du SVG vectoriel (lui-même issu des données métier), pas d'une capture d'écran.
 * `pxPerMm` fixe la résolution (0,05 = 50 px par mètre) ; la taille est plafonnée à 8000 px.
 */
export async function renderPng(doc: PlanDocument, variant: Variant, opts: { onlyIds?: ReadonlySet<string>; pxPerMm?: number } = {}): Promise<Blob> {
  const { bounds } = buildDrawList(doc, variant, opts.onlyIds);
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const k = Math.min(opts.pxPerMm ?? 0.1, MAX_PX / w, MAX_PX / h);
  const width = Math.max(1, Math.round(w * k));
  const height = Math.max(1, Math.round(h * k));
  const svg = renderSvg(doc, variant, { onlyIds: opts.onlyIds }).replace(/width="[^"]+mm" height="[^"]+mm"/, `width="${width}" height="${height}"`);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Rendu PNG impossible.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible.');
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encodage PNG impossible.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
