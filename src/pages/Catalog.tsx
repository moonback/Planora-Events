import { useState } from 'react';
import { BUILTIN_TEMPLATES, CATEGORY_LABELS } from '../domain/catalog';
import { newId } from '../domain/document';
import { ObjectTemplateSchema, type ObjectTemplate, type Role, type Shape } from '../domain/types';
import { fromUnit, parseNumber, toUnit } from '../domain/units';
import { parseCatalogCsv } from '../export/csv';
import { Button, ConfirmDialog, EmptyState, ErrorBanner, Field, formatDate, inputClass, PageHeader, Spinner } from '../components/ui';
import { useAsync } from '../components/useAsync';
import { repository } from '../persistence';

type Tab = 'bibliotheque' | 'perso' | 'salles';

const SHAPE_LABELS: Partial<Record<Shape, string>> = { rect: 'Rectangle', round: 'Rond / ovale', chair: 'Siège', stage: 'Scène', stand: 'Stand' };
const ROLE_LABELS: Partial<Record<Role, string>> = {
  table: 'Table (capacité)',
  siege: 'Siège (places assises)',
  service: 'Service (buffet, bar…)',
  technique: 'Technique',
  obstacle: 'Obstacle',
  autre: 'Autre',
};

const emptyForm = { id: '', name: '', width: '120', depth: '60', shape: 'rect' as Shape, role: 'table' as Role, seats: '0', capacity: '0', color: '#94a3b8' };

export function Catalog() {
  const [tab, setTab] = useState<Tab>('bibliotheque');
  const custom = useAsync(() => repository.listObjectTemplates(), []);
  const rooms = useAsync(() => repository.listRoomTemplates(), []);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [importReport, setImportReport] = useState<string[] | null>(null);
  const [toDelete, setToDelete] = useState<{ kind: 'objet' | 'salle'; id: string; name: string } | null>(null);
  const [query, setQuery] = useState('');

  const saveTemplate = async () => {
    setFormError(null);
    const width = parseNumber(form.width);
    const depth = parseNumber(form.depth);
    const r = ObjectTemplateSchema.safeParse({
      id: form.id || newId(),
      name: form.name,
      category: 'personnalise',
      family: 'Mes modèles',
      shape: form.shape,
      role: form.role,
      width: width === null ? NaN : fromUnit(width, 'cm'),
      depth: depth === null ? NaN : fromUnit(depth, 'cm'),
      seats: Number(form.seats),
      capacity: Number(form.capacity),
      color: form.color,
      custom: true,
    });
    if (!r.success) {
      setFormError(`Saisie invalide : ${r.error.issues.map((i) => `${String(i.path[0])} (${i.message})`).join(', ')}`);
      return;
    }
    try {
      await repository.saveObjectTemplate(r.data);
      setForm(emptyForm);
      custom.reload();
    } catch (e) {
      setActionError(e);
    }
  };

  const edit = (t: ObjectTemplate) =>
    setForm({ id: t.id, name: t.name, width: String(toUnit(t.width, 'cm')), depth: String(toUnit(t.depth, 'cm')), shape: t.shape, role: t.role, seats: String(t.seats), capacity: String(t.capacity), color: t.color });

  const importCsv = async (file: File) => {
    setActionError(null);
    try {
      const { templates, errors } = parseCatalogCsv(await file.text());
      for (const t of templates) await repository.saveObjectTemplate(t);
      setImportReport([`${templates.length} modèle(s) importé(s).`, ...errors]);
      custom.reload();
    } catch (e) {
      setActionError(e);
    }
  };

  const q = query.trim().toLowerCase();
  const builtin = BUILTIN_TEMPLATES.filter((t) => !q || t.name.toLowerCase().includes(q) || t.family.toLowerCase().includes(q));
  const tabs: [Tab, string][] = [
    ['bibliotheque', 'Bibliothèque d’objets'],
    ['perso', 'Mes modèles de mobilier'],
    ['salles', 'Modèles de salle et d’implantation'],
  ];

  return (
    <>
      <PageHeader title="Catalogue de mobilier et de matériel" subtitle="Dimensions en millimètres dans le moteur ; saisie en centimètres." />
      <div role="tablist" aria-label="Sections du catalogue" className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === id ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorBanner error={actionError} />

      {tab === 'bibliotheque' && (
        <>
          <input type="search" aria-label="Rechercher dans la bibliothèque" placeholder="Rechercher…" className={`${inputClass} mb-3 max-w-xs`} value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="p-2">Catégorie</th>
                  <th>Famille</th>
                  <th>Désignation</th>
                  <th>Dimensions (cm)</th>
                  <th>Places / capacité</th>
                  <th>Identifiant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {builtin.map((t) => (
                  <tr key={t.id}>
                    <td className="p-2">{CATEGORY_LABELS[t.category]}</td>
                    <td>{t.family}</td>
                    <td>
                      <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: t.color }} aria-hidden />
                      {t.name}
                    </td>
                    <td>
                      {toUnit(t.width, 'cm')} × {toUnit(t.depth, 'cm')}
                    </td>
                    <td>{t.seats || t.capacity || '—'}</td>
                    <td className="font-mono text-xs text-slate-500">{t.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'perso' && (
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">{form.id ? 'Modifier le modèle' : 'Nouveau modèle'}</h2>
            <Field label="Nom *">
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Largeur (cm)">
                <input inputMode="decimal" className={inputClass} value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} />
              </Field>
              <Field label="Profondeur (cm)">
                <input inputMode="decimal" className={inputClass} value={form.depth} onChange={(e) => setForm({ ...form, depth: e.target.value })} />
              </Field>
              <Field label="Forme">
                <select className={inputClass} value={form.shape} onChange={(e) => setForm({ ...form, shape: e.target.value as Shape })}>
                  {Object.entries(SHAPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Rôle">
                <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Places assises">
                <input type="number" min={0} className={inputClass} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
              </Field>
              <Field label="Capacité (table)">
                <input type="number" min={0} className={inputClass} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
              </Field>
            </div>
            <Field label="Couleur">
              <input type="color" className="h-9 w-16" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </Field>
            {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <Button variant="primary" onClick={saveTemplate}>
                Enregistrer le modèle
              </Button>
              {form.id && <Button onClick={() => setForm(emptyForm)}>Annuler</Button>}
            </div>
            <hr className="border-slate-200" />
            <Field label="Importer un catalogue CSV" hint="Colonnes : nom ; largeur_mm ; profondeur_mm ; places ; forme (rect|round) ; couleur">
              <input type="file" accept=".csv,text/csv" className="text-sm" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
            </Field>
            {importReport && (
              <ul role="status" className="text-xs text-slate-600">
                {importReport.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </section>
          <section>
            {custom.loading ? (
              <Spinner />
            ) : custom.error ? (
              <ErrorBanner error={custom.error} onRetry={custom.reload} />
            ) : !custom.data?.length ? (
              <EmptyState title="Aucun modèle personnalisé">Créez un modèle ici ou depuis l’éditeur (« Enregistrer comme modèle » sur un objet).</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {custom.data.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                    <span>
                      <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: t.color }} aria-hidden />
                      <strong>{t.name}</strong> — {toUnit(t.width, 'cm')} × {toUnit(t.depth, 'cm')} cm
                    </span>
                    <span className="flex gap-1">
                      <Button size="sm" onClick={() => edit(t)}>
                        Modifier
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setToDelete({ kind: 'objet', id: t.id, name: t.name })}>
                        Supprimer
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'salles' &&
        (rooms.loading ? (
          <Spinner />
        ) : rooms.error ? (
          <ErrorBanner error={rooms.error} onRetry={rooms.reload} />
        ) : !rooms.data?.length ? (
          <EmptyState title="Aucun modèle de salle">
            Dans l’éditeur, utilisez « Enregistrer comme modèle de salle » pour réutiliser une salle (contour, portes, poteaux) ou une implantation complète.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {rooms.data.map((t) => (
              <li key={t.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  <strong>{t.name}</strong> — {t.kind === 'salle' ? 'Salle' : 'Implantation'} · {t.document.objects.length} objet(s) · {formatDate(t.createdAt)}
                </span>
                <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setToDelete({ kind: 'salle', id: t.id, name: t.name })}>
                  Supprimer
                </Button>
              </li>
            ))}
          </ul>
        ))}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer le modèle"
        confirmLabel="Supprimer"
        message={<>Supprimer « {toDelete?.name} » ? Les plans existants qui l’utilisent ne sont pas modifiés.</>}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete!.kind === 'objet') {
            await repository.deleteObjectTemplate(toDelete!.id);
            custom.reload();
          } else {
            await repository.deleteRoomTemplate(toDelete!.id);
            rooms.reload();
          }
        }}
      />
    </>
  );
}
