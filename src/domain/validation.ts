import {
  boxOfPoints,
  candidatePairs,
  convexOverlap,
  EPS,
  isSimplePolygon,
  objectPolygon,
  polygonDistance,
  polygonInside,
  polygonsIntersect,
  rotatePoint,
  type Box,
} from './geometry';
import type { PlanDocument, PlanObject, Point } from './types';

/**
 * Nature d'un problème :
 * - erreur_geometrique : démontrable à partir des seules données du plan ;
 * - avertissement : dépend d'un paramètre configuré par l'utilisateur (distances, zones) ;
 * - reglementaire : exigence réglementaire que l'application ne vérifie pas ;
 * - non_verifie : point que l'application n'est pas en mesure de contrôler.
 */
export type IssueKind = 'erreur_geometrique' | 'avertissement' | 'reglementaire' | 'non_verifie';
export type Severity = 'erreur' | 'avertissement' | 'info';
export type IssueStatus = 'ouvert' | 'accepte';

export interface Issue {
  id: string;
  kind: IssueKind;
  code: string;
  severity: Severity;
  objectIds: string[];
  message: string;
  suggestion: string | null;
  status: IssueStatus;
  location: Point | null;
}

export const ISSUE_KIND_LABELS: Record<IssueKind, string> = {
  erreur_geometrique: 'Erreur géométrique',
  avertissement: 'Avertissement configurable',
  reglementaire: 'Exigence réglementaire à faire valider',
  non_verifie: 'Point non vérifié',
};

/** L'objet est fixé dans l'épaisseur du mur : il n'est pas soumis au contrôle « hors salle ». */
export const isWallBound = (o: PlanObject): boolean => o.role === 'ouverture' || o.role === 'issue';
/** Objets qui n'occupent pas le sol (accroches, projecteurs, fenêtres). */
export const occupiesFloor = (o: PlanObject): boolean => o.role !== 'suspendu' && o.shape !== 'window';
const isDoor = (o: PlanObject): boolean => o.shape === 'door';
const SPACED_ROLES = new Set(['table', 'scene', 'service', 'stand', 'obstacle', 'technique', 'cloison']);

/** Zone à dégager devant une porte, du côté de son ouverture (axe local +y). */
export function doorClearancePolygon(o: PlanObject, clearance: number): Point[] {
  const hw = o.width / 2;
  const y0 = o.depth / 2;
  return [
    { x: -hw, y: y0 },
    { x: hw, y: y0 },
    { x: hw, y: y0 + clearance },
    { x: -hw, y: y0 + clearance },
  ].map((p) => {
    const r = rotatePoint(p, o.rotation);
    return { x: r.x + o.x, y: r.y + o.y };
  });
}

const centerOf = (b: Box): Point => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
const label = (o: PlanObject): string => (o.label ? `${o.name} « ${o.label} »` : o.name);

export function validatePlan(doc: PlanDocument): Issue[] {
  const issues: Issue[] = [];
  const ack = new Set(doc.acknowledgedIssues);
  const push = (i: Omit<Issue, 'id' | 'status'>) => {
    const id = `${i.code}:${[...i.objectIds].sort().join(',')}`;
    issues.push({ ...i, id, status: i.severity !== 'erreur' && ack.has(id) ? 'accepte' : 'ouvert' });
  };

  const outline = doc.room.outline;
  const roomValid = isSimplePolygon(outline);
  if (!roomValid) {
    push({
      kind: 'erreur_geometrique',
      code: 'salle_invalide',
      severity: 'erreur',
      objectIds: [],
      message: 'Le contour de la salle est invalide (côtés qui se croisent ou surface nulle).',
      suggestion: 'Redessinez le contour avec l’outil « Murs ».',
      location: null,
    });
  }

  const polys = doc.objects.map(objectPolygon);
  const boxes = polys.map(boxOfPoints);

  doc.objects.forEach((o, i) => {
    if (o.width < 10 || o.depth < 10 || o.width > 100_000 || o.depth > 100_000) {
      push({
        kind: 'erreur_geometrique',
        code: 'dimension',
        severity: 'erreur',
        objectIds: [o.id],
        message: `${label(o)} : dimensions incohérentes (${Math.round(o.width)} × ${Math.round(o.depth)} mm).`,
        suggestion: 'Corrigez la largeur et la profondeur dans le panneau de propriétés.',
        location: centerOf(boxes[i]!),
      });
    }
    if (roomValid && occupiesFloor(o) && !isWallBound(o) && !polygonInside(polys[i]!, outline)) {
      push({
        kind: 'erreur_geometrique',
        code: 'hors_salle',
        severity: 'erreur',
        objectIds: [o.id],
        message: `${label(o)} dépasse des limites de la salle.`,
        suggestion: 'Déplacez l’objet à l’intérieur du contour de la salle.',
        location: centerOf(boxes[i]!),
      });
    }
  });

  // Chevauchements : balayage sur les boîtes englobantes puis test exact (axes séparateurs).
  const floorIdx = doc.objects.map((o, i) => (occupiesFloor(o) && !isWallBound(o) ? i : -1)).filter((i) => i >= 0);
  const floorBoxes = floorIdx.map((i) => boxes[i]!);
  for (const [a, b] of candidatePairs(floorBoxes)) {
    const i = floorIdx[a]!;
    const j = floorIdx[b]!;
    if (convexOverlap(polys[i]!, polys[j]!)) {
      const oi = doc.objects[i]!;
      const oj = doc.objects[j]!;
      push({
        kind: 'erreur_geometrique',
        code: 'chevauchement',
        severity: 'erreur',
        objectIds: [oi.id, oj.id],
        message: `${label(oi)} et ${label(oj)} se chevauchent.`,
        suggestion: 'Écartez les objets ou réduisez leurs dimensions.',
        location: centerOf(boxes[i]!),
      });
    }
  }

  // Distances minimales configurées entre éléments encombrants (le contact franc est considéré volontaire).
  const min = doc.settings.minClearance;
  if (min > 0) {
    const spacedIdx = floorIdx.filter((i) => SPACED_ROLES.has(doc.objects[i]!.role));
    for (const [a, b] of candidatePairs(spacedIdx.map((i) => boxes[i]!), min)) {
      const i = spacedIdx[a]!;
      const j = spacedIdx[b]!;
      const oi = doc.objects[i]!;
      const oj = doc.objects[j]!;
      if (oi.groupId && oi.groupId === oj.groupId) continue;
      const d = polygonDistance(polys[i]!, polys[j]!);
      if (d > EPS && d < min - EPS) {
        push({
          kind: 'avertissement',
          code: 'distance',
          severity: 'avertissement',
          objectIds: [oi.id, oj.id],
          message: `${label(oi)} et ${label(oj)} sont espacés de ${Math.round(d)} mm (minimum configuré : ${min} mm).`,
          suggestion: 'Écartez les objets ou ajustez la distance minimale dans les paramètres du plan.',
          location: centerOf(boxes[i]!),
        });
      }
    }
  }

  // Portes et issues : la zone de dégagement configurée doit rester libre.
  doc.objects.forEach((door) => {
    if (!isDoor(door)) return;
    const clear = doorClearancePolygon(door, doc.settings.doorClearance);
    const clearBox = boxOfPoints(clear);
    const blockers = doc.objects.filter(
      (o, k) => o !== door && occupiesFloor(o) && !isWallBound(o) && polygonsIntersect(polys[k]!, clear),
    );
    if (blockers.length > 0) {
      push({
        kind: 'avertissement',
        code: 'porte_bloquee',
        severity: 'erreur',
        objectIds: [door.id, ...blockers.map((b) => b.id)],
        message: `${label(door)} est obstruée par ${blockers.length} objet(s) dans les ${doc.settings.doorClearance} mm de dégagement configurés.`,
        suggestion: 'Libérez le passage devant la porte.',
        location: centerOf(clearBox),
      });
    }
  });

  for (const zone of doc.zones) {
    if (!isSimplePolygon(zone.points)) {
      push({
        kind: 'erreur_geometrique',
        code: 'zone_invalide',
        severity: 'erreur',
        objectIds: [zone.id],
        message: `La zone « ${zone.name} » a un contour invalide.`,
        suggestion: 'Supprimez puis redessinez la zone.',
        location: centerOf(boxOfPoints(zone.points)),
      });
      continue;
    }
    if (zone.type !== 'interdite' && zone.type !== 'circulation') continue;
    const zb = boxOfPoints(zone.points);
    const inside = doc.objects.filter(
      (o, k) => occupiesFloor(o) && !isWallBound(o) && boxesIntersect(boxes[k]!, zb) && polygonsIntersect(polys[k]!, zone.points),
    );
    if (inside.length === 0) continue;
    const forbidden = zone.type === 'interdite';
    push({
      kind: forbidden ? 'erreur_geometrique' : 'avertissement',
      code: forbidden ? 'zone_interdite' : 'allee_interrompue',
      severity: forbidden ? 'erreur' : 'avertissement',
      objectIds: [zone.id, ...inside.map((o) => o.id)],
      message: forbidden
        ? `${inside.length} objet(s) empiètent sur la zone interdite « ${zone.name} ».`
        : `La circulation « ${zone.name} » est interrompue par ${inside.length} objet(s).`,
      suggestion: forbidden ? 'Retirez les objets de la zone interdite.' : 'Dégagez la circulation.',
      location: centerOf(zb),
    });
  }

  if (!doc.objects.some((o) => o.role === 'issue')) {
    push({
      kind: 'non_verifie',
      code: 'issues_absentes',
      severity: 'avertissement',
      objectIds: [],
      message: 'Aucune issue de secours n’est placée sur le plan : l’évacuation ne peut pas être évaluée.',
      suggestion: 'Placez les issues de secours existantes de la salle (catégorie « Structure de la salle »).',
      location: null,
    });
  }
  push({
    kind: 'reglementaire',
    code: 'conformite_erp',
    severity: 'info',
    objectIds: [],
    message:
      'La conformité à la réglementation (ERP, sécurité incendie, évacuation, accessibilité) n’est pas vérifiée par Planora Events.',
    suggestion: 'Faites valider le plan par le chargé de sécurité ou un professionnel qualifié.',
    location: null,
  });

  return issues;
}

const boxesIntersect = (a: Box, b: Box): boolean => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

export function summarizeIssues(issues: readonly Issue[]) {
  const open = issues.filter((i) => i.status === 'ouvert');
  return {
    errors: open.filter((i) => i.severity === 'erreur').length,
    warnings: open.filter((i) => i.severity === 'avertissement').length,
    infos: open.filter((i) => i.severity === 'info').length,
  };
}
