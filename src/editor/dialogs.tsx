import { useMemo, useState } from 'react';
import { parseDescription, type Proposal } from '../ai/assistant';
import { BUILTIN_TEMPLATES } from '../domain/catalog';
import { rectPolygon } from '../domain/geometry';
import {
  DEFAULT_BANQUET,
  DEFAULT_CONCERT,
  DEFAULT_CONFERENCE,
  DEFAULT_SALON,
  generateLayout,
  type LayoutRequest,
} from '../domain/layout/generators';
import type { LayoutResult } from '../domain/layout/engine';
import { PlanSettingsSchema, type EventType, type PlanDocument, UNITS, type Unit } from '../domain/types';
import { validatePlan } from '../domain/validation';
import { bomCsv, objectsCsv } from '../export/csv';
import { VARIANTS, type Variant } from '../export/drawList';
import { renderPdf, type PaperFormat } from '../export/pdf';
import { renderPng } from '../export/png';
import { renderSvg } from '../export/svg';
import { Button, downloadBlob, ErrorBanner, Field, inputClass, Modal, safeFileName } from '../components/ui';
import { repository } from '../persistence';
import type { ExportFormat } from '../domain/types';
import { NumberInput } from './NumberInput';
import { useDoc, useEditor } from './store';

const DiagList = ({ result }: { result: LayoutResult }) => {
  const errors = validatePlan(result.document).filter((i) => i.severity === 'erreur');
  return (
    <ul className="space-y-1 text-sm" role="status">
      {result.diagnostics.map((d, i) => (
        <li key={i} className={d.level === 'erreur' ? 'text-red-700' : d.level === 'avertissement' ? 'text-amber-700' : 'text-slate-700'}>
          {d.level === 'erreur' ? '✖' : d.level === 'avertissement' ? '⚠' : 'ℹ'} {d.message}
        </li>
      ))}
      <li className={errors.length ? 'text-red-700' : 'text-emerald-700'}>
        Contrôle géométrique du résultat : {errors.length ? `${errors.length} erreur(s)` : 'aucune collision ni dépassement'}.
      </li>
    </ul>
  );
};

/** Génération d'une implantation initiale : aperçu des diagnostics avant application (annulable). */
export function AutoLayoutDialog({ open, onClose, eventType, guests }: { open: boolean; onClose: () => void; eventType: EventType; guests: number | null }) {
  const doc = useDoc();
  const initialKind: LayoutRequest['kind'] = eventType === 'autre' ? 'banquet' : eventType;
  const [kind, setKind] = useState<LayoutRequest['kind']>(initialKind);
  const [banquet, setBanquet] = useState({ ...DEFAULT_BANQUET, guests: guests ?? DEFAULT_BANQUET.guests });
  const [conf, setConf] = useState({ ...DEFAULT_CONFERENCE, seats: guests ?? DEFAULT_CONFERENCE.seats });
  const [salon, setSalon] = useState(DEFAULT_SALON);
  const [concert, setConcert] = useState(DEFAULT_CONCERT);
  const [result, setResult] = useState<LayoutResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  const request = (): LayoutRequest =>
    kind === 'banquet' ? { kind, options: banquet } : kind === 'conference' ? { kind, options: conf } : kind === 'salon' ? { kind, options: salon } : { kind, options: concert };

  const preview = () => {
    setError(null);
    try {
      setResult(generateLayout(doc, request()));
    } catch (e) {
      setError(e);
    }
  };
  const applyResult = () => {
    if (!result) return;
    useEditor.getState().apply(() => result.document);
    useEditor.getState().select([]);
    setResult(null);
    onClose();
  };
  const tables = BUILTIN_TEMPLATES.filter((t) => t.role === 'table' && t.capacity > 0 && t.id !== 'table-honneur');
  const num = (label: string, value: number, onChange: (v: number) => void, raw = true) => (
    <NumberInput label={label} raw={raw} unit={raw ? undefined : 'm'} valueMm={value} min={0} onCommit={(v) => (setResult(null), onChange(v))} />
  );
  const sizeField = (label: string, v: { width: number; depth: number } | null, onChange: (v: { width: number; depth: number } | null) => void, def: { width: number; depth: number }) => (
    <div className="col-span-2 rounded border border-slate-200 p-2">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={v !== null} onChange={(e) => (setResult(null), onChange(e.target.checked ? def : null))} /> {label}
      </label>
      {v && (
        <div className="mt-1 grid grid-cols-2 gap-2">
          {num('Largeur', v.width, (w) => onChange({ ...v, width: w }), false)}
          {num('Profondeur', v.depth, (d) => onChange({ ...v, depth: d }), false)}
        </div>
      )}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Implantation automatique" wide>
      <p className="mb-3 text-sm text-slate-600">
        Le mobilier actuel est remplacé ; la structure (portes, issues, fenêtres, poteaux) et les zones existantes sont conservées et contournées. Le résultat reste
        entièrement modifiable et l’opération peut être annulée (Ctrl+Z).
      </p>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1">
        {(['banquet', 'conference', 'salon', 'concert'] as const).map((k) => (
          <Button key={k} size="sm" variant={k === kind ? 'primary' : 'secondary'} role="tab" aria-selected={k === kind} onClick={() => (setKind(k), setResult(null))}>
            {{ banquet: 'Banquet', conference: 'Conférence', salon: 'Salon', concert: 'Concert / soirée' }[k]}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kind === 'banquet' && (
          <>
            {num('Invités', banquet.guests, (guests) => setBanquet({ ...banquet, guests: Math.round(guests) }))}
            <label className="block text-xs">
              <span className="text-slate-500">Table</span>
              <select
                className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1 text-sm"
                value={banquet.tableTemplateId}
                onChange={(e) => {
                  const t = tables.find((x) => x.id === e.target.value)!;
                  setResult(null);
                  setBanquet({ ...banquet, tableTemplateId: t.id, seatsPerTable: t.capacity });
                }}
              >
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            {num('Places par table', banquet.seatsPerTable, (v) => setBanquet({ ...banquet, seatsPerTable: Math.round(v) }))}
            {num('Allées entre emprises', banquet.aisle, (aisle) => setBanquet({ ...banquet, aisle }), false)}
            {num('Marge aux murs', banquet.wallMargin, (wallMargin) => setBanquet({ ...banquet, wallMargin }), false)}
            {num("Table d'honneur (places, 0 = aucune)", banquet.headTableSeats, (v) => setBanquet({ ...banquet, headTableSeats: Math.round(v) }))}
            {num('Buffets', banquet.buffets, (v) => setBanquet({ ...banquet, buffets: Math.round(v) }))}
            {sizeField('Scène (contre le mur du haut)', banquet.stage, (stage) => setBanquet({ ...banquet, stage }), { width: 6000, depth: 4000 })}
            {sizeField('Piste de danse centrale', banquet.danceFloor, (danceFloor) => setBanquet({ ...banquet, danceFloor }), { width: 6000, depth: 6000 })}
          </>
        )}
        {kind === 'conference' && (
          <>
            {num('Places', conf.seats, (v) => setConf({ ...conf, seats: Math.round(v) }))}
            {num('Entraxe des rangées', conf.rowPitch, (rowPitch) => setConf({ ...conf, rowPitch }), false)}
            {num('Allée centrale (0 = aucune)', conf.centralAisle, (centralAisle) => setConf({ ...conf, centralAisle }), false)}
            {num('Allées latérales', conf.sideAisle, (sideAisle) => setConf({ ...conf, sideAisle }), false)}
            {num('Allée transversale tous les N rangs', conf.crossAisleEvery, (v) => setConf({ ...conf, crossAisleEvery: Math.round(v) }))}
            {num('Rangs réservés', conf.reservedRows, (v) => setConf({ ...conf, reservedRows: Math.round(v) }))}
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={conf.screens} onChange={(e) => (setResult(null), setConf({ ...conf, screens: e.target.checked }))} /> Écrans latéraux</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={conf.regie} onChange={(e) => (setResult(null), setConf({ ...conf, regie: e.target.checked }))} /> Régie en fond de salle</label>
            {sizeField('Scène', conf.stage, (stage) => setConf({ ...conf, stage }), { width: 6000, depth: 3000 })}
          </>
        )}
        {kind === 'salon' && (
          <>
            {num('Nombre de stands', salon.stands, (v) => setSalon({ ...salon, stands: Math.round(v) }))}
            {num('Largeur de stand', salon.standWidth, (standWidth) => setSalon({ ...salon, standWidth }), false)}
            {num('Profondeur de stand', salon.standDepth, (standDepth) => setSalon({ ...salon, standDepth }), false)}
            {num('Largeur des allées', salon.aisle, (aisle) => setSalon({ ...salon, aisle }), false)}
            {num('Allée transversale tous les N stands', salon.crossAisleEvery, (v) => setSalon({ ...salon, crossAisleEvery: Math.round(v) }))}
            {num('Marge aux murs', salon.wallMargin, (wallMargin) => setSalon({ ...salon, wallMargin }), false)}
          </>
        )}
        {kind === 'concert' && (
          <>
            {num('Largeur de scène', concert.stage.width, (width) => setConcert({ ...concert, stage: { ...concert.stage, width } }), false)}
            {num('Profondeur de scène', concert.stage.depth, (depth) => setConcert({ ...concert, stage: { ...concert.stage, depth } }), false)}
            {num('Profondeur de piste (0 = aucune)', concert.danceFloorDepth, (danceFloorDepth) => setConcert({ ...concert, danceFloorDepth }), false)}
            {num('Mange-debout', concert.standingTables, (v) => setConcert({ ...concert, standingTables: Math.round(v) }))}
            {(['regie', 'bar', 'techZone'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={concert[k]} onChange={(e) => (setResult(null), setConcert({ ...concert, [k]: e.target.checked }))} /> {{ regie: 'Régie façade', bar: 'Bar', techZone: 'Espace technique' }[k]}
              </label>
            ))}
          </>
        )}
      </div>
      <div className="mt-4 space-y-3">
        <ErrorBanner error={error} />
        {result && <DiagList result={result} />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Fermer</Button>
          <Button onClick={preview}>Calculer l’aperçu</Button>
          <Button variant="primary" disabled={!result} onClick={applyResult}>
            Appliquer au plan
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Assistant en langage naturel : proposition structurée → aperçu contrôlé → application annulable. */
export function AssistantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useDoc();
  const [text, setText] = useState('Crée une implantation pour 160 personnes dans une salle de 20 par 20 mètres, avec des tables de 8 personnes, une scène de 6 par 4 mètres et une piste de danse centrale.');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [resizeRoom, setResizeRoom] = useState(true);
  const [result, setResult] = useState<LayoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyse = () => {
    setResult(null);
    const r = parseDescription(text);
    if (!r.ok) {
      setProposal(null);
      return setError(r.error);
    }
    setError(null);
    setProposal(r.proposal);
    const base: PlanDocument = r.proposal.room && resizeRoom ? { ...doc, room: { ...doc.room, outline: rectPolygon(0, 0, r.proposal.room.width, r.proposal.room.depth) } } : doc;
    setResult(generateLayout(base, r.proposal.request));
  };

  return (
    <Modal open={open} onClose={onClose} title="Assistant d’implantation" wide>
      <p className="mb-2 text-sm text-slate-600">
        Décrivez l’implantation en français. L’analyse est effectuée localement par des règles (aucun service d’IA externe n’est configuré). La proposition est
        contrôlée géométriquement et vous la validez avant application.
      </p>
      <textarea className={`${inputClass} h-24`} aria-label="Description de l'implantation" value={text} onChange={(e) => setText(e.target.value)} />
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={resizeRoom} onChange={(e) => setResizeRoom(e.target.checked)} /> Redimensionner la salle si des dimensions sont indiquées
      </label>
      <div className="mt-3 space-y-3">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {proposal && (
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <p className="font-medium">Proposition comprise :</p>
            <ul className="list-disc pl-5">
              {proposal.understood.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        )}
        {result && <DiagList result={result} />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Fermer</Button>
          <Button onClick={analyse}>Analyser et prévisualiser</Button>
          <Button
            variant="primary"
            disabled={!result}
            onClick={() => {
              useEditor.getState().apply(() => result!.document);
              useEditor.getState().fitToScreen();
              onClose();
            }}
          >
            Appliquer au plan
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const MIME: Record<ExportFormat, string> = { pdf: 'application/pdf', svg: 'image/svg+xml', png: 'image/png', csv: 'text/csv;charset=utf-8' };

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useDoc();
  const s = useEditor();
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [variant, setVariant] = useState<Variant>('general');
  const [paper, setPaper] = useState<PaperFormat>('a3');
  const [bom, setBom] = useState(true);
  const [onlySelection, setOnlySelection] = useState(false);
  const [csvKind, setCsvKind] = useState<'nomenclature' | 'objets'>('nomenclature');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);
  const selectedIds = useMemo(() => new Set(s.selection.filter((id) => doc.objects.some((o) => o.id === id))), [s.selection, doc.objects]);

  const run = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const base = safeFileName(`${s.projectName}_${s.planName}_${format === 'csv' ? csvKind : variant}_v${s.revision}`);
      const fileName = `${base}.${format}`;
      const only = onlySelection && selectedIds.size ? selectedIds : undefined;
      let data: BlobPart;
      if (format === 'pdf') data = renderPdf({ doc, projectName: s.projectName, planName: s.planName, revision: s.revision, date: new Date(), variant, format: paper, includeBom: bom }).bytes;
      else if (format === 'svg') data = renderSvg(doc, variant, { title: `${s.projectName} – ${s.planName}`, onlyIds: only });
      else if (format === 'png') data = await renderPng(doc, variant, { onlyIds: only });
      else data = csvKind === 'nomenclature' ? bomCsv(doc) : objectsCsv(doc);
      downloadBlob(data, fileName, MIME[format]);
      await repository.recordExport({ projectId: s.projectId, planId: s.planId!, format, variant: format === 'csv' ? csvKind : variant, revision: s.revision, fileName });
      setDone(`Fichier généré : ${fileName}${s.saveState !== 'saved' ? ' (attention : des modifications ne sont pas encore enregistrées ; le numéro de version correspond au dernier enregistrement)' : ''}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Exporter le plan">
      <div className="space-y-3 text-sm">
        <Field label="Format">
          <select className={inputClass} value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="pdf">PDF vectoriel (plan + nomenclature)</option>
            <option value="svg">SVG vectoriel (dimensions réelles en mm)</option>
            <option value="png">PNG (image)</option>
            <option value="csv">CSV (tableur)</option>
          </select>
        </Field>
        {format !== 'csv' ? (
          <Field label="Type de plan">
            <select className={inputClass} value={variant} onChange={(e) => setVariant(e.target.value as Variant)}>
              {Object.entries(VARIANTS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Contenu">
            <select className={inputClass} value={csvKind} onChange={(e) => setCsvKind(e.target.value as 'nomenclature' | 'objets')}>
              <option value="nomenclature">Nomenclature (quantités par modèle et par zone)</option>
              <option value="objets">Liste détaillée des objets (identifiants, positions)</option>
            </select>
          </Field>
        )}
        {format === 'pdf' && (
          <>
            <Field label="Format papier">
              <select className={inputClass} value={paper} onChange={(e) => setPaper(e.target.value as PaperFormat)}>
                <option value="a3">A3 paysage</option>
                <option value="a4">A4 paysage</option>
              </select>
            </Field>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={bom} onChange={(e) => setBom(e.target.checked)} /> Inclure la nomenclature et les zones
            </label>
          </>
        )}
        {(format === 'png' || format === 'svg') && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={onlySelection} disabled={!selectedIds.size} onChange={(e) => setOnlySelection(e.target.checked)} /> Uniquement la sélection ({selectedIds.size} objet(s))
          </label>
        )}
        <ErrorBanner error={error} />
        {done && <p role="status" className="text-emerald-700">{done}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Fermer</Button>
          <Button variant="primary" onClick={run} disabled={busy}>
            {busy ? 'Génération…' : 'Générer et télécharger'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

async function fileToImage(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  let dataUrl: string;
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    dataUrl = canvas.toDataURL('image/png');
  } else if (file.type.startsWith('image/')) {
    dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('Lecture du fichier impossible.'));
      r.readAsDataURL(file);
    });
  } else throw new Error('Format non pris en charge : utilisez une image (PNG, JPEG…) ou un PDF.');
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Image illisible.'));
    img.src = dataUrl;
  });
  return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
}

export function BackgroundDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useDoc();
  const apply = useEditor((s) => s.apply);
  const setTool = useEditor((s) => s.setTool);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const bg = doc.background;

  const load = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('Fichier trop volumineux (15 Mo maximum).');
      const img = await fileToImage(file);
      const xs = doc.room.outline.map((p) => p.x);
      const roomW = Math.max(...xs) - Math.min(...xs);
      apply((d) => ({
        ...d,
        background: { dataUrl: img.dataUrl, sourceName: file.name.slice(0, 200), x: Math.min(...xs), y: Math.min(...d.room.outline.map((p) => p.y)), mmPerPx: roomW / img.width, pixelWidth: img.width, pixelHeight: img.height, opacity: 0.6, locked: true, visible: true },
      }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const patch = (p: Partial<NonNullable<PlanDocument['background']>>) => apply((d) => (d.background ? { ...d, background: { ...d.background, ...p } } : d));

  return (
    <Modal open={open} onClose={onClose} title="Plan de référence (fond)">
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">
          Image ou PDF (première page) affiché sous le plan, comme référence visuelle uniquement. Aucune reconstruction automatique des murs n’est effectuée.
        </p>
        <Field label="Importer une image ou un PDF">
          <input type="file" accept="image/*,application/pdf,.pdf" disabled={busy} onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        </Field>
        {busy && <p role="status">Import en cours…</p>}
        <ErrorBanner error={error} />
        {bg && (
          <>
            <p>
              Fichier : <strong>{bg.sourceName}</strong> — échelle actuelle : {bg.mmPerPx.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} mm par pixel
            </p>
            <label className="block">
              Transparence ({Math.round(bg.opacity * 100)} %)
              <input type="range" min={0.1} max={1} step={0.05} value={bg.opacity} onChange={(e) => patch({ opacity: Number(e.target.value) })} className="w-full" />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={bg.visible} onChange={(e) => patch({ visible: e.target.checked })} /> Afficher
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={bg.locked} onChange={(e) => patch({ locked: e.target.checked })} /> Verrouiller (non déplaçable)
            </label>
            {!bg.locked && (
              <div className="grid grid-cols-2 gap-2">
                <NumberInput label="Position X" valueMm={bg.x} unit={doc.settings.displayUnit} onCommit={(x) => patch({ x })} />
                <NumberInput label="Position Y" valueMm={bg.y} unit={doc.settings.displayUnit} onCommit={(y) => patch({ y })} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setTool('calibrate');
                  onClose();
                }}
              >
                Étalonner (2 points + distance réelle)
              </Button>
              <Button variant="danger" onClick={() => apply((d) => ({ ...d, background: null }))}>
                Retirer le fond
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function PlanSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useDoc();
  const apply = useEditor((s) => s.apply);
  const st = doc.settings;
  const set = (p: Partial<PlanDocument['settings']>) => {
    const r = PlanSettingsSchema.safeParse({ ...st, ...p });
    if (r.success) apply((d) => ({ ...d, settings: r.data }));
  };
  return (
    <Modal open={open} onClose={onClose} title="Paramètres du plan">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="Unité d’affichage">
          <select className={inputClass} value={st.displayUnit} onChange={(e) => set({ displayUnit: e.target.value as Unit })}>
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </Field>
        <NumberInput label="Pas de grille" valueMm={st.gridSize} unit={st.displayUnit} min={10} max={10_000} onCommit={(gridSize) => set({ gridSize })} />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={st.showGrid} onChange={(e) => set({ showGrid: e.target.checked })} /> Afficher la grille
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={st.snap} onChange={(e) => set({ snap: e.target.checked })} /> Grille magnétique
        </label>
        <NumberInput label="Distance minimale entre mobilier" valueMm={st.minClearance} unit={st.displayUnit} min={0} max={20_000} onCommit={(minClearance) => set({ minClearance })} />
        <NumberInput label="Dégagement devant les portes" valueMm={st.doorClearance} unit={st.displayUnit} min={0} max={20_000} onCommit={(doorClearance) => set({ doorClearance })} />
        <p className="col-span-2 text-xs text-slate-500">
          Ces distances sont des paramètres de contrôle configurables : elles ne constituent pas une vérification de conformité réglementaire.
        </p>
      </div>
    </Modal>
  );
}
