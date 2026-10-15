import type { Unit } from './types';

const FACTOR: Record<Unit, number> = { mm: 1, cm: 10, m: 1000 };
const DECIMALS: Record<Unit, number> = { mm: 0, cm: 1, m: 3 };

export const toUnit = (mm: number, unit: Unit): number => mm / FACTOR[unit];

/** Conversion vers le mm, arrondie au millimètre pour éviter l'accumulation d'erreurs flottantes. */
export const fromUnit = (value: number, unit: Unit): number => Math.round(value * FACTOR[unit]);

export function formatLength(mm: number, unit: Unit): string {
  const v = toUnit(mm, unit);
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: DECIMALS[unit] })} ${unit}`;
}

export function formatArea(mm2: number): string {
  return `${(mm2 / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m²`;
}

/** Accepte « 3,5 » ou « 3.5 ». Renvoie null si la saisie n'est pas un nombre fini. */
export function parseNumber(input: string): number | null {
  const n = Number(input.trim().replace(/\s/g, '').replace(',', '.'));
  return input.trim() !== '' && Number.isFinite(n) ? n : null;
}
