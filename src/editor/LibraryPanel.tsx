import { useMemo, useState } from 'react';
import { BUILTIN_TEMPLATES, CATEGORY_LABELS, ZONE_PRESETS } from '../domain/catalog';
import { CATEGORIES, type ObjectTemplate } from '../domain/types';
import { toUnit } from '../domain/units';
import { inputClass } from '../components/ui';
import { addTemplate, addZonePreset } from './actions';
import { DRAG_MIME, type DragPayload } from './PlanCanvas';
import { useEditor } from './store';

const FAV_KEY = 'planora.favorites';
const readFavs = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};

function Item({ label, sub, color, payload, onAdd, fav, onFav }: { label: string; sub: string; color: string; payload: DragPayload; onAdd: () => void; fav?: boolean; onFav?: () => void }) {
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={onAdd}
        title="Cliquer pour ajouter au centre de la vue, ou glisser sur le plan"
        className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-brand-50"
      >
        <span className="h-3 w-3 shrink-0 rounded-sm border border-slate-300" style={{ background: color }} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-[10px] text-slate-400">{sub}</span>
      </button>
      {onFav && (
        <button type="button" onClick={onFav} aria-pressed={fav} aria-label={fav ? `Retirer ${label} des favoris` : `Ajouter ${label} aux favoris`} className={`px-1 text-sm ${fav ? 'text-amber-500' : 'text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100'}`}>
          ★
        </button>
      )}
    </li>
  );
}

const dims = (t: ObjectTemplate) => `${toUnit(t.width, 'cm')}×${toUnit(t.depth, 'cm')}`;

export function LibraryPanel() {
  const custom = useEditor((s) => s.customTemplates);
  const readOnly = useEditor((s) => s.readOnly);
  const [query, setQuery] = useState('');
  const [favs, setFavs] = useState<string[]>(readFavs);
  const [open, setOpen] = useState<Record<string, boolean>>({ favoris: true, mobilier: true, zones: false });

  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    setFavs(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {
      /* préférence non persistée : sans conséquence */
    }
  };

  const all = useMemo(() => [...BUILTIN_TEMPLATES, ...custom.map((t) => ({ ...t, category: 'personnalise' as const }))], [custom]);
  const q = query.trim().toLowerCase();
  const match = (t: ObjectTemplate) => !q || t.name.toLowerCase().includes(q) || t.family.toLowerCase().includes(q);

  if (readOnly) return <p className="p-3 text-xs text-slate-500">Lecture seule : la bibliothèque est désactivée.</p>;

  const section = (key: string, title: string, items: ObjectTemplate[]) =>
    items.length > 0 && (
      <section key={key}>
        <button
          type="button"
          aria-expanded={q ? true : !!open[key]}
          onClick={() => setOpen({ ...open, [key]: !open[key] })}
          className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
        >
          {title} <span>{q || open[key] ? '−' : '+'}</span>
        </button>
        {(q || open[key]) && (
          <ul>
            {items.map((t) => (
              <Item key={t.id} label={t.name} sub={dims(t)} color={t.color} payload={{ kind: 'template', id: t.id }} onAdd={() => addTemplate(t.id)} fav={favs.includes(t.id)} onFav={() => toggleFav(t.id)} />
            ))}
          </ul>
        )}
      </section>
    );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 p-2">
        <input type="search" aria-label="Rechercher un objet" placeholder="Rechercher un objet…" className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-1" aria-label="Bibliothèque d'objets">
        {section('favoris', 'Favoris', all.filter((t) => favs.includes(t.id) && match(t)))}
        {CATEGORIES.map((c) => section(c, CATEGORY_LABELS[c], all.filter((t) => t.category === c && match(t))))}
        {(!q || 'zone'.includes(q) || ZONE_PRESETS.some((z) => z.name.toLowerCase().includes(q))) && (
          <section>
            <button type="button" aria-expanded={!!open.zones} onClick={() => setOpen({ ...open, zones: !open.zones })} className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800">
              Zones <span>{open.zones ? '−' : '+'}</span>
            </button>
            {open.zones && (
              <ul>
                {ZONE_PRESETS.map((z) => (
                  <Item key={z.id} label={z.name} sub={`${toUnit(z.width, 'm')}×${toUnit(z.depth, 'm')} m`} color={z.color} payload={{ kind: 'zone', id: z.id }} onAdd={() => addZonePreset(z.id)} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
