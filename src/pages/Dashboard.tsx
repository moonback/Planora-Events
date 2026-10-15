import { Link } from 'react-router-dom';
import { EmptyState, ErrorBanner, formatDate, PageHeader, Spinner } from '../components/ui';
import { useAsync } from '../components/useAsync';
import { repository } from '../persistence';
import { EVENT_TYPE_LABELS, formatEventDate, todayIso } from './labels';

const card = 'rounded-xl border border-slate-200 bg-white p-4';

export function Dashboard() {
  const { data, error, loading, reload } = useAsync(async () => {
    const [projects, plans] = await Promise.all([repository.listProjects(), repository.listAllPlans()]);
    return { projects, plans };
  }, []);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBanner error={error} onRetry={reload} />;

  const active = data.projects.filter((p) => !p.archived);
  const today = todayIso();
  const upcoming = active.filter((p) => p.eventDate && p.eventDate >= today).sort((a, b) => a.eventDate!.localeCompare(b.eventDate!));
  const favorites = active.filter((p) => p.favorite);
  const names = new Map(data.projects.map((p) => [p.id, p.name]));

  const actions = (
    <>
      <Link to="/projets/nouveau" className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
        Nouveau projet
      </Link>
      <Link to="/catalogue" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
        Modèles de salle
      </Link>
    </>
  );

  if (data.projects.length === 0) {
    return (
      <>
        <PageHeader title="Bienvenue sur Planora Events" />
        <EmptyState title="Aucun projet pour le moment" action={actions}>
          Créez un projet, dessinez la salle à ses dimensions réelles, puis placez le mobilier ou générez une implantation automatique.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Tableau de bord" actions={actions} />
      <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Projets actifs', active.length],
          ['Plans', data.plans.length],
          ['Événements à venir', upcoming.length],
          ['Favoris', favorites.length],
        ].map(([label, value]) => (
          <div key={label} className={card}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} aria-labelledby="recent">
          <h2 id="recent" className="mb-3 font-semibold">Projets récents</h2>
          <ul className="divide-y divide-slate-100">
            {active.slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <Link to={`/projets/${p.id}`} className="font-medium text-brand-700 hover:underline">
                  {p.favorite && <span aria-label="Favori">★ </span>}
                  {p.name}
                </Link>
                <span className="text-xs text-slate-500">{formatDate(p.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className={card} aria-labelledby="upcoming">
          <h2 id="upcoming" className="mb-3 font-semibold">Événements à venir</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun événement daté à venir.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.slice(0, 6).map((p) => (
                <li key={p.id} className="py-2 text-sm">
                  <Link to={`/projets/${p.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.eventName || p.name}
                  </Link>
                  <span className="block text-xs text-slate-500">
                    {formatEventDate(p.eventDate)} · {EVENT_TYPE_LABELS[p.eventType]}
                    {p.guestCount ? ` · ${p.guestCount} invités` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={card} aria-labelledby="plans">
          <h2 id="plans" className="mb-3 font-semibold">Derniers plans modifiés</h2>
          {data.plans.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun plan.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.plans.slice(0, 6).map((pl) => (
                <li key={pl.id} className="flex items-center justify-between py-2 text-sm">
                  <Link to={`/editeur/${pl.id}`} className="font-medium text-brand-700 hover:underline">
                    {pl.name} <span className="font-normal text-slate-500">— {names.get(pl.projectId) ?? 'Projet'}</span>
                  </Link>
                  <span className="text-xs text-slate-500">v{pl.revision}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={card} aria-labelledby="favs">
          <h2 id="favs" className="mb-3 font-semibold">Favoris</h2>
          {favorites.length === 0 ? (
            <p className="text-sm text-slate-500">Marquez un projet d’une étoile dans la liste des projets pour le retrouver ici.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {favorites.map((p) => (
                <li key={p.id} className="py-2 text-sm">
                  <Link to={`/projets/${p.id}`} className="font-medium text-brand-700 hover:underline">
                    ★ {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
