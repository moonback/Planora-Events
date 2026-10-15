import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createDocument } from '../domain/document';
import { EVENT_TYPES, ProjectInputSchema, type EventType, type FloorPlan, type Project } from '../domain/types';
import { fromUnit, parseNumber } from '../domain/units';
import { Button, ConfirmDialog, EmptyState, ErrorBanner, Field, formatDate, inputClass, Modal, PageHeader, Spinner } from '../components/ui';
import { useAsync } from '../components/useAsync';
import { VersionsPanel } from '../components/VersionsPanel';
import { repository } from '../persistence';
import { EVENT_TYPE_LABELS, formatEventDate } from './labels';

export function ProjectDetail() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(async () => {
    const [project, plans, exports, templates] = await Promise.all([
      repository.getProject(projectId),
      repository.listPlans(projectId),
      repository.listExports(projectId),
      repository.listRoomTemplates(),
    ]);
    return { project, plans, exports, templates };
  }, [projectId]);
  const [editing, setEditing] = useState(false);
  const [newPlan, setNewPlan] = useState(false);
  const [versionsOf, setVersionsOf] = useState<FloorPlan | null>(null);
  const [toDelete, setToDelete] = useState<FloorPlan | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBanner error={error} onRetry={reload} />;
  const { project, plans } = data;

  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(e);
    }
  };

  const duplicate = (plan: FloorPlan, roomOnly: boolean) =>
    act(() =>
      repository.createPlan(
        project.id,
        `${plan.name} (${roomOnly ? 'salle seule' : 'copie'})`.slice(0, 120),
        roomOnly ? { ...plan.document, objects: plan.document.objects.filter((o) => o.category === 'structure'), zones: [], annotations: [], dimensions: [] } : plan.document,
      ),
    );

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={
          <>
            {EVENT_TYPE_LABELS[project.eventType]} · {formatEventDate(project.eventDate)}
            {project.client && ` · Client : ${project.client}`}
            {project.guestCount != null && ` · ${project.guestCount} invités`}
            {project.archived && ' · Archivé'}
          </>
        }
        actions={
          <>
            <Button onClick={() => setEditing(true)}>Modifier les informations</Button>
            <Button variant="primary" onClick={() => setNewPlan(true)}>
              Nouveau plan
            </Button>
          </>
        }
      />
      <ErrorBanner error={actionError} />
      {project.notes && <p className="mb-4 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm text-slate-700 shadow-sm">{project.notes}</p>}

      <h2 className="mb-2 font-semibold">Plans</h2>
      {plans.length === 0 ? (
        <EmptyState title="Ce projet n’a pas encore de plan" action={<Button variant="primary" onClick={() => setNewPlan(true)}>Créer un plan</Button>} />
      ) : (
        <ul className="mb-8 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {plans.map((pl) => (
            <li key={pl.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <Link to={`/editeur/${pl.id}`} className="font-medium text-brand-700 hover:underline">
                  {pl.name}
                </Link>
                <p className="text-xs text-slate-500">
                  {pl.document.room.name} · {pl.document.objects.length} objet(s) · révision {pl.revision} · modifié le {formatDate(pl.updatedAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="primary" onClick={() => navigate(`/editeur/${pl.id}`)}>
                  Ouvrir
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const name = window.prompt('Nouveau nom du plan', pl.name);
                    if (name !== null) void act(() => repository.renamePlan(pl.id, name));
                  }}
                >
                  Renommer
                </Button>
                <Button size="sm" onClick={() => duplicate(pl, false)}>
                  Dupliquer
                </Button>
                <Button size="sm" onClick={() => duplicate(pl, true)} title="Conserve la salle, ses ouvertures et poteaux, sans mobilier">
                  Dupliquer la salle
                </Button>
                <Button size="sm" onClick={() => setVersionsOf(pl)}>
                  Versions
                </Button>
                <Button size="sm" onClick={() => navigate(`/presentation/${pl.id}`)}>
                  Présentation
                </Button>
                <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setToDelete(pl)}>
                  Supprimer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 font-semibold">Documents exportés</h2>
      {data.exports.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun export. Les exports se génèrent depuis l’éditeur (bouton « Exporter »).</p>
      ) : (
        <ul className="text-sm text-slate-700">
          {data.exports.map((e) => (
            <li key={e.id}>
              {formatDate(e.createdAt)} — {e.fileName} ({e.format.toUpperCase()}, révision {e.revision})
            </li>
          ))}
        </ul>
      )}

      {editing && <EditProjectModal project={project} onClose={() => setEditing(false)} onSaved={reload} />}
      {newPlan && (
        <NewPlanModal
          templates={data.templates}
          onClose={() => setNewPlan(false)}
          onCreate={async (name, doc) => {
            const plan = await repository.createPlan(project.id, name, doc);
            navigate(`/editeur/${plan.id}`);
          }}
        />
      )}
      <Modal open={versionsOf !== null} onClose={() => setVersionsOf(null)} title={`Versions — ${versionsOf?.name ?? ''}`} wide>
        {versionsOf && (
          <VersionsPanel
            planId={versionsOf.id}
            current={versionsOf.document}
            canEdit
            onRestore={async (rev) => {
              const latest = await repository.getPlan(versionsOf.id);
              const saved = await repository.savePlan(versionsOf.id, rev.document, latest.revision);
              setVersionsOf(saved);
              reload();
            }}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer le plan"
        confirmLabel="Supprimer définitivement"
        message={<>Le plan <strong>{toDelete?.name}</strong> et toutes ses versions seront supprimés définitivement.</>}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          await repository.deletePlan(toDelete!.id);
          reload();
        }}
      />
    </>
  );
}

function EditProjectModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ ...project, eventDate: project.eventDate ?? '', guestCount: project.guestCount?.toString() ?? '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const guests = f.guestCount.trim() ? parseNumber(f.guestCount) : null;
      const input = ProjectInputSchema.parse({ ...f, eventDate: f.eventDate || null, guestCount: guests });
      await repository.updateProject(project.id, input);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error && 'issues' in e ? new Error('Vérifiez les champs : nom requis, nombre d’invités entier positif.') : e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Informations du projet">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nom *">
          <input className={inputClass} value={f.name} onChange={set('name')} />
        </Field>
        <Field label="Client">
          <input className={inputClass} value={f.client} onChange={set('client')} />
        </Field>
        <Field label="Événement">
          <input className={inputClass} value={f.eventName} onChange={set('eventName')} />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={f.eventType} onChange={(e) => setF({ ...f, eventType: e.target.value as EventType })}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className={inputClass} value={f.eventDate} onChange={set('eventDate')} />
        </Field>
        <Field label="Invités">
          <input inputMode="numeric" className={inputClass} value={f.guestCount} onChange={set('guestCount')} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Notes">
            <textarea className={inputClass} rows={4} value={f.notes} onChange={set('notes')} />
          </Field>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <ErrorBanner error={error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function NewPlanModal({
  templates,
  onClose,
  onCreate,
}: {
  templates: { id: string; name: string; kind: string; document: Parameters<typeof repository.createPlan>[2] }[];
  onClose: () => void;
  onCreate: (name: string, doc: Parameters<typeof repository.createPlan>[2]) => Promise<void>;
}) {
  const [name, setName] = useState('Nouveau plan');
  const [w, setW] = useState('20');
  const [d, setD] = useState('15');
  const [tpl, setTpl] = useState('');
  const [error, setError] = useState<unknown>(null);

  const create = async () => {
    setError(null);
    try {
      const t = templates.find((x) => x.id === tpl);
      const width = parseNumber(w);
      const depth = parseNumber(d);
      if (!t && (width === null || depth === null || width < 1 || depth < 1 || width > 500 || depth > 500)) throw new Error('Dimensions entre 1 et 500 m.');
      await onCreate(name.trim() || 'Plan', t ? t.document : createDocument({ width: fromUnit(width!, 'm'), depth: fromUnit(depth!, 'm') }));
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Modal open onClose={onClose} title="Nouveau plan">
      <div className="space-y-3">
        <Field label="Nom du plan">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Modèle">
          <select className={inputClass} value={tpl} onChange={(e) => setTpl(e.target.value)}>
            <option value="">Salle rectangulaire vide</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.kind})
              </option>
            ))}
          </select>
        </Field>
        {!tpl && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Largeur (m)">
              <input inputMode="decimal" className={inputClass} value={w} onChange={(e) => setW(e.target.value)} />
            </Field>
            <Field label="Profondeur (m)">
              <input inputMode="decimal" className={inputClass} value={d} onChange={(e) => setD(e.target.value)} />
            </Field>
          </div>
        )}
        <ErrorBanner error={error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={create}>
            Créer et ouvrir
          </Button>
        </div>
      </div>
    </Modal>
  );
}
