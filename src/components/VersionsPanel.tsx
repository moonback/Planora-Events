import { useState } from 'react';
import { describeDiff, diffDocuments } from '../domain/diff';
import type { PlanDocument, PlanRevision } from '../domain/types';
import { repository } from '../persistence';
import { Button, ErrorBanner, formatDate, inputClass, Spinner } from './ui';
import { useAsync } from './useAsync';

/**
 * Historique des versions d'un plan : création d'un instantané nommé, comparaison avec l'état courant, restauration.
 * La restauration est déléguée à l'appelant (éditeur : étape annulable ; page projet : nouvelle sauvegarde).
 */
export function VersionsPanel({
  planId,
  current,
  canEdit,
  beforeSnapshot,
  onRestore,
}: {
  planId: string;
  current: PlanDocument;
  canEdit: boolean;
  /** Appelé avant la création d'une version (ex. : forcer l'enregistrement en cours dans l'éditeur). */
  beforeSnapshot?: () => Promise<void>;
  onRestore: (rev: PlanRevision) => Promise<void>;
}) {
  const { data, error, loading, reload } = useAsync(() => repository.listRevisions(planId), [planId]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>, success: string) => {
    setBusy(true);
    setActionError(null);
    setDone(null);
    try {
      await fn();
      setDone(success);
      reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 text-sm">
      {canEdit && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await beforeSnapshot?.();
              await repository.createRevision(planId, label || `Version du ${new Date().toLocaleString('fr-FR')}`);
              setLabel('');
            }, 'Version créée.');
          }}
        >
          <input className={inputClass} placeholder="Nom de la version (ex. : validé client)" aria-label="Nom de la version" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} />
          <Button type="submit" variant="primary" disabled={busy}>
            Créer une version
          </Button>
        </form>
      )}
      <ErrorBanner error={actionError} />
      {done && <p role="status" className="text-emerald-700">{done}</p>}
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBanner error={error} onRetry={reload} />
      ) : !data?.length ? (
        <p className="text-slate-500">Aucune version enregistrée. Une version est un instantané nommé que vous pourrez comparer ou restaurer.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {data.map((rev) => (
            <li key={rev.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <p className="font-medium">
                  V{rev.number} — {rev.label}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDate(rev.createdAt)} · {rev.document.objects.length} objet(s) · Écart avec l’état actuel : {describeDiff(diffDocuments(rev.document, current))}
                </p>
              </div>
              {canEdit && (
                <Button size="sm" disabled={busy} onClick={() => run(() => onRestore(rev), `Version V${rev.number} restaurée.`)}>
                  Restaurer
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
