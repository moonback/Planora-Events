import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDocument } from '../domain/document';
import { EVENT_TYPES, ProjectInputSchema, type EventType } from '../domain/types';
import { fromUnit, parseNumber } from '../domain/units';
import { Button, ErrorBanner, Field, inputClass, PageHeader } from '../components/ui';
import { useAsync } from '../components/useAsync';
import { repository } from '../persistence';
import { EVENT_TYPE_LABELS } from './labels';

export function NewProject() {
  const navigate = useNavigate();
  const templates = useAsync(() => repository.listRoomTemplates(), []);
  const [form, setForm] = useState({
    name: '',
    client: '',
    eventName: '',
    eventType: 'banquet' as EventType,
    eventDate: '',
    guestCount: '',
    notes: '',
    roomName: 'Salle principale',
    width: '20',
    depth: '15',
    templateId: '',
    autoLayout: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const guests = form.guestCount.trim() ? parseNumber(form.guestCount) : null;
    if (form.guestCount.trim() && (guests === null || !Number.isInteger(guests) || guests < 0)) errs.guestCount = 'Nombre entier positif attendu.';
    const w = parseNumber(form.width);
    const d = parseNumber(form.depth);
    if (!form.templateId) {
      if (w === null || w < 1 || w > 500) errs.width = 'Largeur entre 1 et 500 m.';
      if (d === null || d < 1 || d > 500) errs.depth = 'Profondeur entre 1 et 500 m.';
    }
    const input = ProjectInputSchema.safeParse({
      name: form.name,
      client: form.client,
      eventName: form.eventName,
      eventType: form.eventType,
      eventDate: form.eventDate || null,
      guestCount: guests,
      notes: form.notes,
    });
    if (!input.success) for (const i of input.error.issues) errs[String(i.path[0])] = i.message;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    setError(null);
    try {
      const tpl = templates.data?.find((t) => t.id === form.templateId);
      const doc = tpl ? tpl.document : createDocument({ name: form.roomName, width: fromUnit(w!, 'm'), depth: fromUnit(d!, 'm') });
      const project = await repository.createProject(input.data!);
      const plan = await repository.createPlan(project.id, 'Plan principal', doc);
      navigate(`/editeur/${plan.id}${form.autoLayout && form.eventType !== 'autre' ? '?auto=1' : ''}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Nouveau projet" subtitle="Décrivez l’événement et la salle ; tout reste modifiable ensuite." />
      <form onSubmit={submit} className="max-w-3xl space-y-6" noValidate>
        <ErrorBanner error={error} />
        <fieldset className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
          <legend className="px-1 font-semibold">Événement</legend>
          <Field label="Nom du projet *" error={errors.name}>
            <input className={inputClass} value={form.name} onChange={set('name')} required maxLength={120} />
          </Field>
          <Field label="Client">
            <input className={inputClass} value={form.client} onChange={set('client')} maxLength={120} />
          </Field>
          <Field label="Nom de l’événement">
            <input className={inputClass} value={form.eventName} onChange={set('eventName')} maxLength={120} />
          </Field>
          <Field label="Type d’événement">
            <select className={inputClass} value={form.eventType} onChange={set('eventType')}>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date" error={errors.eventDate}>
            <input type="date" className={inputClass} value={form.eventDate} onChange={set('eventDate')} />
          </Field>
          <Field label="Nombre d’invités" error={errors.guestCount}>
            <input inputMode="numeric" className={inputClass} value={form.guestCount} onChange={set('guestCount')} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Notes">
              <textarea className={inputClass} rows={3} value={form.notes} onChange={set('notes')} maxLength={10000} />
            </Field>
          </div>
        </fieldset>
        <fieldset className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
          <legend className="px-1 font-semibold">Salle</legend>
          <div className="md:col-span-3">
            <Field label="Partir d’un modèle de salle" hint="Les modèles s’enregistrent depuis l’éditeur (menu Plan).">
              <select className={inputClass} value={form.templateId} onChange={set('templateId')}>
                <option value="">Salle rectangulaire (dimensions ci-dessous)</option>
                {templates.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.kind === 'salle' ? 'salle' : 'implantation'})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {!form.templateId && (
            <>
              <Field label="Nom de la salle">
                <input className={inputClass} value={form.roomName} onChange={set('roomName')} maxLength={120} />
              </Field>
              <Field label="Largeur (m)" error={errors.width}>
                <input inputMode="decimal" className={inputClass} value={form.width} onChange={set('width')} />
              </Field>
              <Field label="Profondeur (m)" error={errors.depth}>
                <input inputMode="decimal" className={inputClass} value={form.depth} onChange={set('depth')} />
              </Field>
            </>
          )}
          <label className="flex items-center gap-2 text-sm md:col-span-3">
            <input type="checkbox" checked={form.autoLayout} onChange={(e) => setForm({ ...form, autoLayout: e.target.checked })} />
            Proposer une implantation automatique à l’ouverture de l’éditeur
          </label>
        </fieldset>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Création…' : 'Créer le projet et ouvrir l’éditeur'}
          </Button>
          <Button onClick={() => navigate(-1)}>Annuler</Button>
        </div>
      </form>
    </>
  );
}
