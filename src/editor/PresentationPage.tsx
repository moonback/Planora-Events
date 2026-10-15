import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { computeMetrics } from '../domain/bom';
import { formatArea } from '../domain/units';
import { ErrorBanner, Spinner } from '../components/ui';
import { repository } from '../persistence';
import { PlanCanvas } from './PlanCanvas';
import { useDoc, useEditor } from './store';

/** Mode présentation client : lecture seule, plein écran, sans outils d'édition. */
export default function PresentationPage() {
  const { planId = '' } = useParams();
  const [error, setError] = useState<unknown>(null);
  const [ready, setReady] = useState(false);
  const doc = useDoc();
  const name = useEditor((s) => `${s.projectName} — ${s.planName}`);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const plan = await repository.getPlan(planId);
        const project = await repository.getProject(plan.projectId);
        if (!alive) return;
        useEditor.getState().load({ plan, projectName: project.name, guestTarget: project.guestCount, templates: [], readOnly: true });
        setReady(true);
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [planId]);

  const metrics = useMemo(() => (ready ? computeMetrics(doc) : null), [doc, ready]);
  if (error) return <ErrorBanner error={error} />;
  if (!ready || !metrics) return <Spinner />;

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-200 px-4 py-2 text-sm">
        <h1 className="font-semibold">{name}</h1>
        <span className="text-slate-600">
          {metrics.seats} places assises · {metrics.tables} tables · {formatArea(metrics.roomArea)}
        </span>
        <span className="text-xs text-slate-500">Molette : zoom · Espace + glisser : déplacer</span>
        <Link to={`/editeur/${planId}`} className="ml-auto text-brand-700 hover:underline">
          Quitter la présentation
        </Link>
      </header>
      <div className="min-h-0 flex-1">
        <PlanCanvas issues={[]} interactive={false} />
      </div>
    </div>
  );
}
