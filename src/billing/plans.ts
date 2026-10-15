import type { Subscription, Tier } from '../persistence/repository';

export interface PlanOffer {
  tier: Tier;
  name: string;
  /** null = illimité. */
  maxProjects: number | null;
  maxExportsPerMonth: number | null;
  features: string[];
}

/**
 * Offres prévues. Aucun paiement n'est intégré : l'abonnement effectif provient exclusivement
 * de la table `subscriptions`, alimentée côté serveur (webhook du prestataire de paiement).
 * shortcut: les limites ne sont pas encore appliquées ; à faire par déclencheur SQL lors de l'intégration du paiement.
 */
export const OFFERS: readonly PlanOffer[] = [
  { tier: 'gratuit', name: 'Gratuit', maxProjects: 3, maxExportsPerMonth: 10, features: ['Éditeur 2D complet', 'Exports PDF / SVG / PNG / CSV'] },
  { tier: 'pro', name: 'Pro', maxProjects: null, maxExportsPerMonth: null, features: ['Projets illimités', 'Exports avancés'] },
  { tier: 'equipe', name: 'Équipe', maxProjects: null, maxExportsPerMonth: null, features: ['Collaboration et partage', 'Historique des versions', 'Rôles'] },
  { tier: 'entreprise', name: 'Entreprise', maxProjects: null, maxExportsPerMonth: null, features: ['Administration', 'Catalogue personnalisé'] },
];

/** Offre applicable : seul un abonnement « active » vérifié par le serveur ouvre une offre payante. */
export function effectiveOffer(sub: Subscription | null): PlanOffer {
  const tier = sub?.status === 'active' ? sub.tier : 'gratuit';
  return OFFERS.find((o) => o.tier === tier)!;
}
