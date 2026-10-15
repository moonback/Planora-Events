import { useEffect, useState } from 'react';
import type { Unit } from '../domain/types';
import { fromUnit, parseNumber, toUnit } from '../domain/units';

/**
 * Saisie numérique validée : la valeur n'est appliquée qu'à la validation (Entrée ou perte de focus),
 * une saisie invalide est signalée et la valeur précédente restaurée.
 */
export function NumberInput({
  label,
  valueMm,
  unit,
  onCommit,
  min,
  max,
  disabled,
  raw = false,
  step,
}: {
  label: string;
  valueMm: number;
  unit?: Unit;
  onCommit: (mm: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Valeur sans conversion d'unité (degrés, nombre de places…). */
  raw?: boolean;
  step?: number;
}) {
  const shown = raw || !unit ? valueMm : toUnit(valueMm, unit);
  const format = (v: number) => String(Math.round(v * 1000) / 1000).replace('.', ',');
  const [text, setText] = useState(format(shown));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setText(format(shown));
    setInvalid(false);
  }, [shown]);

  const commit = () => {
    const n = parseNumber(text);
    const mm = n === null ? null : raw || !unit ? n : fromUnit(n, unit);
    if (mm === null || (min !== undefined && mm < min) || (max !== undefined && mm > max)) {
      setInvalid(true);
      setText(format(shown));
      return;
    }
    setInvalid(false);
    if (mm !== valueMm) onCommit(mm);
  };

  return (
    <label className="block text-xs">
      <span className="text-slate-500">
        {label}
        {!raw && unit ? ` (${unit})` : ''}
      </span>
      <input
        className={`mt-0.5 w-full rounded border px-1.5 py-1 text-sm ${invalid ? 'border-red-500' : 'border-slate-300'}`}
        inputMode="decimal"
        value={text}
        disabled={disabled}
        step={step}
        aria-invalid={invalid}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          e.stopPropagation();
        }}
      />
    </label>
  );
}
