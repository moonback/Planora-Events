import { useState } from 'react';
import { computeBom, computeMetrics, tablesNeeded } from '../domain/bom';
import { ISSUE_KIND_LABELS, type Issue } from '../domain/validation';
import { formatArea } from '../domain/units';
import { Button } from '../components/ui';
import { useDoc, useEditor } from './store';

const SEVERITY_STYLE = { erreur: 'border-red-300 bg-red-50', avertissement: 'border-amber-300 bg-amber-50', info: 'border-slate-200 bg-slate-50' } as const;
const SEVERITY_LABEL = { erreur: 'Erreur', avertissement: 'Avertissement', info: 'Information' } as const;

export function IssuesPanel({ issues }: { issues: Issue[] }) {
  const readOnly = useEditor((s) => s.readOnly);
  const focus = (i: Issue) => {
    const st = useEditor.getState();
    const objectIds = i.objectIds.filter((id) => st.history.present.objects.some((o) => o.id === id));
    st.select(objectIds.length ? objectIds : i.objectIds.slice(0, 1));
    if (i.location) {
      const { viewport, view } = st;
      st.setView({ ...view, x: viewport.width / 2 - i.location.x * view.scale, y: viewport.height / 2 - i.location.y * view.scale });
    }
  };
  const toggleAck = (i: Issue) =>
    useEditor.getState().apply((d) => ({
      ...d,
      acknowledgedIssues: i.status === 'accepte' ? d.acknowledgedIssues.filter((x) => x !== i.id) : [...d.acknowledgedIssues, i.id],
    }));

  const order = { erreur: 0, avertissement: 1, info: 2 };
  const sorted = [...issues].sort((a, b) => order[a.severity] - order[b.severity] || (a.status === 'accepte' ? 1 : 0) - (b.status === 'accepte' ? 1 : 0));
  const errors = issues.filter((i) => i.severity === 'erreur').length;

  return (
    <div className="space-y-2 p-3 text-xs">
      <p className="text-slate-600" role="status">
        {errors === 0 ? 'Aucune erreur géométrique détectée.' : `${errors} erreur(s) à corriger.`} Ce contrôle ne remplace pas la validation réglementaire.
      </p>
      <ul className="space-y-2">
        {sorted.map((i) => (
          <li key={i.id} className={`rounded-md border p-2 ${SEVERITY_STYLE[i.severity]} ${i.status === 'accepte' ? 'opacity-60' : ''}`}>
            <p className="font-medium">
              {SEVERITY_LABEL[i.severity]} · <span className="font-normal text-slate-600">{ISSUE_KIND_LABELS[i.kind]}</span>
              {i.status === 'accepte' && ' · accepté'}
            </p>
            <p className="mt-0.5">{i.message}</p>
            {i.suggestion && <p className="mt-0.5 text-slate-600">→ {i.suggestion}</p>}
            <div className="mt-1 flex gap-1">
              {(i.objectIds.length > 0 || i.location) && (
                <Button size="sm" variant="ghost" onClick={() => focus(i)}>
                  Afficher sur le plan
                </Button>
              )}
              {i.severity === 'avertissement' && !readOnly && (
                <Button size="sm" variant="ghost" onClick={() => toggleAck(i)}>
                  {i.status === 'accepte' ? 'Rouvrir' : 'Accepter'}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QuantitiesPanel() {
  const doc = useDoc();
  const target = useEditor((s) => s.guestTarget);
  const m = computeMetrics(doc);
  const bom = computeBom(doc);
  const [guests, setGuests] = useState(target ?? 100);
  const [perTable, setPerTable] = useState(8);
  let needed: string;
  try {
    needed = String(tablesNeeded(guests, perTable));
  } catch (e) {
    needed = e instanceof Error ? e.message : '—';
  }

  return (
    <div className="space-y-4 p-3 text-xs">
      <dl className="grid grid-cols-2 gap-2">
        {[
          ['Places assises', m.seats],
          ['Capacité des tables', m.tableCapacity],
          ['Tables', m.tables],
          ['Chaises', m.chairs],
          ['Objets', m.objectCount],
          ['Surface salle', formatArea(m.roomArea)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-slate-50 p-2">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-base font-semibold" data-testid={`metric-${k}`}>{v}</dd>
          </div>
        ))}
      </dl>
      {target != null && (
        <p className={m.seats >= target ? 'text-emerald-700' : 'text-amber-700'} role="status">
          Objectif du projet : {target} invités — {m.seats >= target ? 'atteint' : `il manque ${target - m.seats} place(s) assise(s)`}.
        </p>
      )}
      <section>
        <h3 className="mb-1 font-semibold">Tables nécessaires</h3>
        <div className="flex items-end gap-2">
          <label>
            Invités
            <input type="number" min={0} className="mt-0.5 w-20 rounded border border-slate-300 px-1 py-0.5" value={guests} onChange={(e) => setGuests(Number(e.target.value))} />
          </label>
          <label>
            Places / table
            <input type="number" min={1} className="mt-0.5 w-16 rounded border border-slate-300 px-1 py-0.5" value={perTable} onChange={(e) => setPerTable(Number(e.target.value))} />
          </label>
          <p className="pb-1 font-semibold">= {needed}</p>
        </div>
      </section>
      {m.zones.length > 0 && (
        <section>
          <h3 className="mb-1 font-semibold">Zones</h3>
          <ul>
            {m.zones.map((z) => (
              <li key={z.id}>
                {z.name} — {formatArea(z.area)} — {z.objects} objet(s)
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-1 font-semibold">Nomenclature</h3>
        {bom.length === 0 ? (
          <p className="text-slate-500">Aucun objet sur le plan.</p>
        ) : (
          <table className="w-full">
            <tbody className="divide-y divide-slate-100">
              {bom.map((l) => (
                <tr key={l.key}>
                  <td className="py-1">{l.name}</td>
                  <td className="text-right font-semibold">{l.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
