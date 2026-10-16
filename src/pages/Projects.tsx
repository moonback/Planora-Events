import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EVENT_TYPES, type EventType, type Project } from '../domain/types';
import { Button, ConfirmDialog, EmptyState, ErrorBanner, formatDate, inputClass, PageHeader, Spinner } from '../components/ui';
import { useAsync } from '../components/useAsync';
import { repository } from '../persistence';
import { EVENT_TYPE_LABELS, formatEventDate } from './labels';

type Filter = 'actifs' | 'favoris' | 'archives' | 'tous';

export function Projects() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => repository.listProjects(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('actifs');
  const [type, setType] = useState<EventType | ''>('');
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(e);
    }
  };

  const q = query.trim().toLowerCase();
  const list = (data ?? []).filter(
    (p) =>
      (filter === 'tous' || (filter === 'archives' ? p.archived : !p.archived && (filter !== 'favoris' || p.favorite))) &&
      (!type || p.eventType === type) &&
      (!q || [p.name, p.client, p.eventName].some((s) => s.toLowerCase().includes(q))),
  );

  return (
    <>
      <PageHeader
        title="Projets"
        actions={
          <Link to="/projets/nouveau" className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
            Nouveau projet
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="search"
          aria-label="Rechercher un projet"
          placeholder="Rechercher (nom, client, événement)…"
          className={`${inputClass} max-w-xs`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select aria-label="Filtrer par statut" className={`${inputClass} max-w-56`} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="actifs">Actifs</option>
          <option value="favoris">Favoris</option>
          <option value="archives">Archivés</option>
          <option value="tous">Tous</option>
        </select>
        <select aria-label="Filtrer par type d'événement" className={`${inputClass} max-w-56`} value={type} onChange={(e) => setType(e.target.value as EventType | '')}>
          <option value="">Tous les types</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <ErrorBanner error={actionError} />
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBanner error={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <EmptyState title={data?.length ? 'Aucun projet ne correspond à ces critères' : 'Aucun projet'}>
          {data?.length ? 'Modifiez la recherche ou les filtres.' : 'Créez votre premier projet pour commencer un plan.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <li key={p.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/projets/${p.id}`} className="font-semibold text-brand-700 hover:underline">
                  {p.name}
                </Link>
                <button
                  type="button"
                  className={`text-lg ${p.favorite ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                  aria-pressed={p.favorite}
                  aria-label={p.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  onClick={() => act(() => repository.updateProject(p.id, { favorite: !p.favorite }))}
                >
                  ★
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {EVENT_TYPE_LABELS[p.eventType]} · {formatEventDate(p.eventDate)}
                {p.client && ` · ${p.client}`}
              </p>
              <p className="mt-1 text-xs text-slate-400">Modifié le {formatDate(p.updatedAt)}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => navigate(`/projets/${p.id}`)}>
                  Ouvrir
                </Button>
                <Button size="sm" onClick={() => act(() => repository.duplicateProject(p.id))}>
                  Dupliquer
                </Button>
                <Button size="sm" onClick={() => act(() => repository.updateProject(p.id, { archived: !p.archived }))}>
                  {p.archived ? 'Désarchiver' : 'Archiver'}
                </Button>
                <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setToDelete(p)}>
                  Supprimer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer le projet"
        confirmLabel="Supprimer définitivement"
        message={
          <>
            Le projet <strong>{toDelete?.name}</strong>, tous ses plans, versions et l’historique d’exports seront supprimés définitivement.
          </>
        }
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          await repository.deleteProject(toDelete!.id);
          reload();
        }}
      />
    </>
  );
}
