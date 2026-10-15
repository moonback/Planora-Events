import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { summarizeIssues, validatePlan } from '../domain/validation';
import type { EventType, PlanRevision } from '../domain/types';
import { Button, ErrorBanner, Modal, Spinner } from '../components/ui';
import { VersionsPanel } from '../components/VersionsPanel';
import { repository } from '../persistence';
import * as act from './actions';
import { AssistantDialog, AutoLayoutDialog, BackgroundDialog, ExportDialog, PlanSettingsDialog } from './dialogs';
import { IssuesPanel, QuantitiesPanel } from './InsightsPanel';
import { LibraryPanel } from './LibraryPanel';
import { PlanCanvas } from './PlanCanvas';
import { PropertiesPanel } from './PropertiesPanel';
import { useDoc, useEditor, type SaveState, type Tool } from './store';

const AUTOSAVE_DELAY = 1200;

const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Enregistré',
  dirty: 'Modifications non enregistrées',
  saving: 'Enregistrement…',
  error: 'Échec de l’enregistrement',
  conflict: 'Conflit de version',
};
const SAVE_STYLE: Record<SaveState, string> = {
  saved: 'text-emerald-700',
  dirty: 'text-amber-700',
  saving: 'text-slate-500',
  error: 'text-red-700',
  conflict: 'text-red-700',
};

const TOOLS: [Tool, string, string][] = [
  ['select', 'Sélection', 'V'],
  ['pan', 'Vue', 'H'],
  ['wall', 'Murs', 'W'],
  ['zone', 'Zone', 'Z'],
  ['measure', 'Mesure', 'M'],
  ['text', 'Texte', 'T'],
];

type Dialog = 'auto' | 'assistant' | 'export' | 'background' | 'settings' | 'versions' | null;

export default function EditorPage() {
  const { planId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const [loadError, setLoadError] = useState<unknown>(null);
  const [eventType, setEventType] = useState<EventType>('autre');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<'props' | 'issues' | 'qty'>('props');
  const [notice, setNotice] = useState<string | null>(null);

  const loaded = useEditor((s) => s.planId === planId);
  const doc = useDoc();
  const s = useEditor();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const plan = await repository.getPlan(planId);
        const [project, templates, team] = await Promise.all([repository.getProject(plan.projectId), repository.listObjectTemplates(), repository.getTeam()]);
        if (!alive) return;
        setEventType(project.eventType);
        useEditor.getState().load({ plan, projectName: project.name, guestTarget: project.guestCount, templates, readOnly: team?.myRole === 'lecteur' });
        if (search.get('auto') === '1') {
          setDialog('auto');
          setSearch({}, { replace: true });
        }
      } catch (e) {
        if (alive) setLoadError(e);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  // Autosave différé ; les erreurs restent affichées jusqu'à la prochaine sauvegarde réussie.
  useEffect(() => {
    if (!loaded || s.saveState !== 'dirty') return;
    const t = window.setTimeout(() => void useEditor.getState().save(), AUTOSAVE_DELAY);
    return () => window.clearTimeout(t);
  }, [loaded, s.saveState, s.history.present]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      const st = useEditor.getState().saveState;
      if (st !== 'saved') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // Raccourcis clavier.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
      const st = useEditor.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      let handled = true;
      if (ctrl && k === 'z' && !e.shiftKey) st.undo();
      else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) st.redo();
      else if (ctrl && k === 's') void st.save();
      else if (ctrl && k === 'c') act.copySelection();
      else if (ctrl && k === 'v') act.paste();
      else if (ctrl && k === 'd') act.duplicateSelection();
      else if (ctrl && k === 'a') act.selectAll();
      else if (ctrl && k === 'g') (e.shiftKey ? act.ungroupSelection : act.groupSelection)();
      else if (ctrl) handled = false;
      else if (k === 'delete' || k === 'backspace') act.deleteSelection();
      else if (k === 'escape') {
        if (st.draft.length) st.setDraft([]);
        else st.select([]);
      }
      else if (e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? 100 : 10;
        act.nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
      } else if (k === 'r') act.rotateSelection(e.shiftKey ? -15 : 15);
      else if (k === 'l') act.toggleLock();
      else if (k === '+' || k === '=') st.zoomBy(1.25);
      else if (k === '-') st.zoomBy(1 / 1.25);
      else if (k === '0') st.fitToScreen();
      else {
        const tool = TOOLS.find(([, , key]) => key.toLowerCase() === k);
        if (tool && !st.readOnly) st.setTool(tool[0]);
        else handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const issues = useMemo(() => (loaded ? validatePlan(doc) : []), [doc, loaded]);
  const summary = summarizeIssues(issues);

  if (loadError) {
    return (
      <div className="mx-auto mt-16 max-w-lg space-y-3 p-4">
        <ErrorBanner error={loadError} />
        <Link to="/projets" className="text-sm text-brand-700 hover:underline">
          Retour aux projets
        </Link>
      </div>
    );
  }
  if (!loaded) return <Spinner label="Ouverture du plan…" />;

  const saveRoomTemplate = async (kind: 'salle' | 'implantation') => {
    const name = window.prompt(kind === 'salle' ? 'Nom du modèle de salle (contour, portes, poteaux, zones)' : 'Nom du modèle d’implantation (plan complet)', `${doc.room.name}`);
    if (!name?.trim()) return;
    try {
      const d = kind === 'salle' ? { ...doc, objects: doc.objects.filter((o) => o.category === 'structure'), annotations: [], dimensions: [] } : doc;
      await repository.saveRoomTemplate(name, kind, d);
      setNotice(`Modèle « ${name} » enregistré dans le catalogue.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };

  const renamePlan = async () => {
    const name = window.prompt('Nom du plan', s.planName);
    if (!name?.trim() || name === s.planName) return;
    try {
      const p = await repository.renamePlan(planId, name);
      useEditor.getState().setPlanName(p.name);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };

  const restore = async (rev: PlanRevision) => {
    useEditor.getState().apply(() => rev.document);
    setDialog(null);
    setNotice(`Version V${rev.number} restaurée (Ctrl+Z pour annuler).`);
  };

  return (
    <div className="flex h-screen flex-col bg-white text-sm">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
        <Link to={`/projets/${s.projectId}`} className="text-slate-500 hover:text-slate-900" aria-label="Retour au projet">
          ←
        </Link>
        <div className="min-w-0">
          <p className="truncate text-xs text-slate-500">{s.projectName}</p>
          <button type="button" className="truncate font-semibold hover:underline" onClick={renamePlan} disabled={s.readOnly} title="Renommer le plan">
            {s.planName}
          </button>
        </div>
        <div className="mx-2 flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={s.undo} disabled={!s.history.past.length || s.readOnly} aria-label="Annuler" title="Annuler (Ctrl+Z)">
            ↶
          </Button>
          <Button size="sm" variant="ghost" onClick={s.redo} disabled={!s.history.future.length || s.readOnly} aria-label="Rétablir" title="Rétablir (Ctrl+Y)">
            ↷
          </Button>
        </div>
        <div className="flex items-center gap-2" aria-live="polite">
          <span className={`text-xs font-medium ${SAVE_STYLE[s.saveState]}`} data-testid="save-status">
            {s.readOnly ? 'Lecture seule' : SAVE_LABEL[s.saveState]}
          </span>
          {repository.mode === 'local' && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800" title="Enregistré dans ce navigateur uniquement">local</span>}
          {!s.readOnly && (s.saveState === 'dirty' || s.saveState === 'error') && (
            <Button size="sm" onClick={() => void s.save()}>
              {s.saveState === 'error' ? 'Réessayer' : 'Enregistrer'}
            </Button>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => s.zoomBy(1 / 1.25)} aria-label="Zoom arrière">−</Button>
          <span className="w-12 text-center text-xs tabular-nums" title="Pixels par mètre">{Math.round(s.view.scale * 1000)} px/m</span>
          <Button size="sm" variant="ghost" onClick={() => s.zoomBy(1.25)} aria-label="Zoom avant">+</Button>
          <Button size="sm" variant="ghost" onClick={s.fitToScreen}>Ajuster</Button>
          {!s.readOnly && (
            <>
              <Button size="sm" onClick={() => setDialog('auto')}>Implantation auto</Button>
              <Button size="sm" onClick={() => setDialog('assistant')}>Assistant</Button>
              <Button size="sm" onClick={() => setDialog('background')}>Fond de plan</Button>
              <Button size="sm" onClick={() => setDialog('settings')}>Paramètres</Button>
            </>
          )}
          <Button size="sm" onClick={() => setDialog('versions')}>Versions</Button>
          <Button size="sm" onClick={() => navigate(`/presentation/${planId}`)}>Aperçu</Button>
          <Button size="sm" variant="primary" onClick={() => setDialog('export')}>Exporter</Button>
        </div>
      </header>

      {(s.saveState === 'conflict' || s.saveState === 'error') && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-red-800">
          <span>{s.saveError}</span>
          {s.saveState === 'conflict' ? (
            <>
              <Button size="sm" onClick={() => void s.resolveConflict('reload')}>Charger la version distante (vos changements seront perdus)</Button>
              <Button size="sm" variant="danger" onClick={() => void s.resolveConflict('overwrite')}>Écraser avec ma version</Button>
            </>
          ) : (
            <span>Vos modifications sont conservées dans cet onglet ; réessayez.</span>
          )}
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1.5">
          <span>{notice}</span>
          <button type="button" aria-label="Fermer le message" onClick={() => setNotice(null)}>✕</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-slate-200 lg:block" aria-label="Bibliothèque">
          <LibraryPanel />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div role="toolbar" aria-label="Outils" className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1">
            {TOOLS.map(([id, label, key]) => (
              <Button key={id} size="sm" variant={s.tool === id ? 'primary' : 'ghost'} aria-pressed={s.tool === id} disabled={s.readOnly && id !== 'select' && id !== 'pan'} onClick={() => s.setTool(id)} title={`${label} (${key})`}>
                {label}
              </Button>
            ))}
            {doc.background && !s.readOnly && (
              <Button size="sm" variant={s.tool === 'calibrate' ? 'primary' : 'ghost'} aria-pressed={s.tool === 'calibrate'} onClick={() => s.setTool('calibrate')}>
                Étalonner
              </Button>
            )}
            <span className="mx-2 h-4 w-px bg-slate-300" aria-hidden />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={doc.settings.showGrid} disabled={s.readOnly} onChange={(e) => s.apply((d) => ({ ...d, settings: { ...d.settings, showGrid: e.target.checked } }))} /> Grille
            </label>
            <label className="ml-2 flex items-center gap-1 text-xs">
              <input type="checkbox" checked={doc.settings.snap} disabled={s.readOnly} onChange={(e) => s.apply((d) => ({ ...d, settings: { ...d.settings, snap: e.target.checked } }))} /> Magnétisme
            </label>
            <span className="ml-auto text-xs text-slate-500">
              {doc.objects.length} objet(s) · {s.selection.length} sélectionné(s)
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <PlanCanvas issues={issues} onError={setNotice} />
          </div>
        </div>
        <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200" aria-label="Panneau latéral">
          <div role="tablist" className="flex border-b border-slate-200">
            {(
              [
                ['props', 'Propriétés'],
                ['issues', `Contrôles${summary.errors + summary.warnings ? ` (${summary.errors + summary.warnings})` : ''}`],
                ['qty', 'Quantités'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 border-b-2 px-2 py-2 text-xs ${tab === id ? 'border-brand-600 font-semibold text-brand-700' : 'border-transparent text-slate-600'} ${id === 'issues' && summary.errors ? 'text-red-700' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'props' && <PropertiesPanel />}
            {tab === 'issues' && <IssuesPanel issues={issues} />}
            {tab === 'qty' && <QuantitiesPanel />}
          </div>
          {!s.readOnly && (
            <div className="flex gap-1 border-t border-slate-200 p-2">
              <Button size="sm" onClick={() => saveRoomTemplate('salle')}>Modèle de salle</Button>
              <Button size="sm" onClick={() => saveRoomTemplate('implantation')}>Modèle d’implantation</Button>
            </div>
          )}
        </aside>
      </div>

      {dialog === 'auto' && <AutoLayoutDialog open onClose={() => setDialog(null)} eventType={eventType} guests={s.guestTarget} />}
      {dialog === 'assistant' && <AssistantDialog open onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportDialog open onClose={() => setDialog(null)} />}
      {dialog === 'background' && <BackgroundDialog open onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <PlanSettingsDialog open onClose={() => setDialog(null)} />}
      <Modal open={dialog === 'versions'} onClose={() => setDialog(null)} title="Historique des versions" wide>
        {dialog === 'versions' && (
          <VersionsPanel
            planId={planId}
            current={doc}
            canEdit={!s.readOnly}
            beforeSnapshot={async () => {
              await useEditor.getState().save();
              const st = useEditor.getState().saveState;
              if (st !== 'saved') throw new Error('Le plan doit être enregistré avant de créer une version.');
            }}
            onRestore={restore}
          />
        )}
      </Modal>
    </div>
  );
}
