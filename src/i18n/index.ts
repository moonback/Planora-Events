import { fr } from './fr';

/**
 * Dictionnaires de l'interface. Ajouter une langue : créer `xx.ts` avec les mêmes clés
 * (le type `Messages` garantit l'exhaustivité) puis l'enregistrer ici.
 * shortcut: seuls la navigation et les libellés communs passent par t() ; migrer les autres chaînes avant d'ajouter une langue.
 */
export type Messages = typeof fr;
const dictionaries: Record<string, Messages> = { fr };

let current: Messages = fr;
export function setLocale(locale: string): void {
  current = dictionaries[locale] ?? fr;
}

export function t(key: keyof Messages): string {
  return current[key];
}
