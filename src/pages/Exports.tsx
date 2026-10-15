import { Link } from 'react-router-dom';
import { EmptyState, ErrorBanner, formatDate, PageHeader, Spinner } from '../components/ui';
import { useAsync } from '../components/useAsync';
import { repository } from '../persistence';

export function Exports() {
  const { data, error, loading, reload } = useAsync(async () => {
    const [exports, projects] = await Promise.all([repository.listExports(), repository.listProjects()]);
    return { exports, names: new Map(projects.map((p) => [p.id, p.name])) };
  }, []);

  return (
    <>
      <PageHeader
        title="Exports et documents"
        subtitle="Historique des documents générés. Les fichiers sont produits dans le navigateur à partir des données du plan et téléchargés sur votre poste."
      />
      {loading ? (
        <Spinner />
      ) : error || !data ? (
        <ErrorBanner error={error} onRetry={reload} />
      ) : data.exports.length === 0 ? (
        <EmptyState title="Aucun export pour le moment">
          Ouvrez un plan puis utilisez « Exporter » : PDF (général, mobilier, technique, stands, coté), SVG, PNG ou CSV.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="p-2">Date</th>
                <th>Projet</th>
                <th>Fichier</th>
                <th>Format</th>
                <th>Révision du plan</th>
                <th className="sr-only">Plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.exports.map((e) => (
                <tr key={e.id}>
                  <td className="p-2">{formatDate(e.createdAt)}</td>
                  <td>{data.names.get(e.projectId) ?? 'Projet supprimé'}</td>
                  <td>{e.fileName}</td>
                  <td>{e.format.toUpperCase()}</td>
                  <td>{e.revision}</td>
                  <td>
                    {e.planId && (
                      <Link className="text-brand-700 hover:underline" to={`/editeur/${e.planId}`}>
                        Ouvrir le plan
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
