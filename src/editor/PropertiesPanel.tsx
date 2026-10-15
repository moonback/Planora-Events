import { useState } from 'react';
import { ZONE_TYPE_LABELS } from '../domain/catalog';
import { newId } from '../domain/document';
import { distance, isSimplePolygon, normalizeAngle, polygonArea, rectPolygon } from '../domain/geometry';
import { alignObjects, distributeObjects, reorderObjects, updateObject, type AlignMode } from '../domain/operations';
import { ZONE_TYPES, type PlanDocument, type PlanObject, type Zone, type ZoneType } from '../domain/types';
import { formatArea, formatLength } from '../domain/units';
import { Button } from '../components/ui';
import { repository } from '../persistence';
import { deleteSelection, duplicateSelection, groupSelection, rotateSelection, toggleLock, ungroupSelection } from './actions';
import { NumberInput } from './NumberInput';
import { ROOM_ID, useDoc, useEditor } from './store';

const H = ({ children }: { children: string }) => <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 first:mt-0">{children}</h3>;
const text = 'mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1 text-sm';

export function PropertiesPanel() {
  const doc = useDoc();
  const selection = useEditor((s) => s.selection);
  const readOnly = useEditor((s) => s.readOnly);
  const objects = doc.objects.filter((o) => selection.includes(o.id));
  const zone = doc.zones.find((z) => selection.includes(z.id));
  const annotation = doc.annotations.find((a) => selection.includes(a.id));
  const dimension = doc.dimensions.find((d) => selection.includes(d.id));

  return (
    <fieldset disabled={readOnly} className="space-y-1 p-3 text-sm">
      {objects.length === 1 ? (
        <ObjectProps o={objects[0]!} doc={doc} />
      ) : objects.length > 1 ? (
        <MultiProps ids={objects.map((o) => o.id)} />
      ) : zone ? (
        <ZoneProps z={zone} doc={doc} />
      ) : annotation ? (
        <>
          <H>Annotation</H>
          <label className="block text-xs">
            <span className="text-slate-500">Texte</span>
            <textarea
              className={text}
              defaultValue={annotation.text}
              key={annotation.id}
              maxLength={500}
              onBlur={(e) => e.target.value.trim() && useEditor.getState().apply((d) => ({ ...d, annotations: d.annotations.map((a) => (a.id === annotation.id ? { ...a, text: e.target.value.trim() } : a)) }))}
            />
          </label>
          <NumberInput label="Taille du texte" valueMm={annotation.fontSize} unit={doc.settings.displayUnit} min={50} max={5000} onCommit={(v) => useEditor.getState().apply((d) => ({ ...d, annotations: d.annotations.map((a) => (a.id === annotation.id ? { ...a, fontSize: v } : a)) }))} />
          <Button variant="danger" size="sm" className="mt-3" onClick={deleteSelection}>
            Supprimer
          </Button>
        </>
      ) : dimension ? (
        <>
          <H>Cote</H>
          <p>Longueur : {formatLength(distance(dimension.a, dimension.b), doc.settings.displayUnit)}</p>
          <Button variant="danger" size="sm" className="mt-3" onClick={deleteSelection}>
            Supprimer
          </Button>
        </>
      ) : (
        <RoomProps doc={doc} highlighted={selection.includes(ROOM_ID)} />
      )}
    </fieldset>
  );
}

function ObjectProps({ o, doc }: { o: PlanObject; doc: PlanDocument }) {
  const unit = doc.settings.displayUnit;
  const set = (patch: Partial<PlanObject>) => useEditor.getState().apply((d) => updateObject(d, o.id, patch));
  const [msg, setMsg] = useState<string | null>(null);
  const lock = o.locked;

  const saveAsTemplate = async () => {
    setMsg(null);
    try {
      const t = await repository.saveObjectTemplate({
        id: newId(),
        name: o.label ? `${o.name} – ${o.label}` : o.name,
        category: 'personnalise',
        family: 'Mes modèles',
        shape: o.shape,
        role: o.role,
        width: o.width,
        depth: o.depth,
        seats: o.seats,
        capacity: o.capacity,
        color: o.color,
        custom: true,
      });
      useEditor.getState().addCustomTemplate(t);
      setMsg('Modèle enregistré dans « Mes modèles ».');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <H>Objet</H>
      <label className="block text-xs">
        <span className="text-slate-500">Nom</span>
        <input className={text} key={`n${o.id}`} defaultValue={o.name} maxLength={120} onBlur={(e) => e.target.value.trim() && e.target.value !== o.name && set({ name: e.target.value.trim() })} />
      </label>
      <label className="block text-xs">
        <span className="text-slate-500">Repère / numéro</span>
        <input className={text} key={`l${o.id}`} defaultValue={o.label} maxLength={60} onBlur={(e) => e.target.value !== o.label && set({ label: e.target.value.trim() })} />
      </label>
      <H>Position et dimensions</H>
      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="X" valueMm={o.x} unit={unit} disabled={lock} onCommit={(x) => set({ x })} />
        <NumberInput label="Y" valueMm={o.y} unit={unit} disabled={lock} onCommit={(y) => set({ y })} />
        <NumberInput label="Largeur" valueMm={o.width} unit={unit} min={10} max={100_000} disabled={lock} onCommit={(width) => set({ width })} />
        <NumberInput label="Profondeur" valueMm={o.depth} unit={unit} min={10} max={100_000} disabled={lock} onCommit={(depth) => set({ depth })} />
        <NumberInput label="Rotation (°)" raw valueMm={o.rotation} disabled={lock} onCommit={(r) => set({ rotation: normalizeAngle(r) })} />
        <NumberInput label={o.role === 'table' ? 'Capacité (places)' : 'Places assises'} raw valueMm={o.role === 'table' ? o.capacity : o.seats} min={0} max={1000} onCommit={(v) => set(o.role === 'table' ? { capacity: Math.round(v) } : { seats: Math.round(v) })} />
      </div>
      <H>Style</H>
      <label className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">Couleur</span>
        <input type="color" value={o.color} onChange={(e) => set({ color: e.target.value })} />
      </label>
      <H>Actions</H>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" onClick={toggleLock}>{lock ? 'Déverrouiller' : 'Verrouiller'}</Button>
        <Button size="sm" onClick={duplicateSelection}>Dupliquer</Button>
        <Button size="sm" onClick={() => rotateSelection(90)} disabled={lock}>Pivoter 90°</Button>
        <Button size="sm" onClick={() => useEditor.getState().apply((d) => reorderObjects(d, [o.id], 'front'))}>Premier plan</Button>
        <Button size="sm" onClick={() => useEditor.getState().apply((d) => reorderObjects(d, [o.id], 'back'))}>Arrière-plan</Button>
        {o.groupId && <Button size="sm" onClick={ungroupSelection}>Dégrouper</Button>}
        <Button size="sm" onClick={saveAsTemplate}>Enregistrer comme modèle</Button>
        <Button size="sm" variant="danger" onClick={deleteSelection} disabled={lock}>Supprimer</Button>
      </div>
      {msg && <p role="status" className="mt-2 text-xs text-slate-600">{msg}</p>}
    </>
  );
}

function MultiProps({ ids }: { ids: string[] }) {
  const apply = useEditor.getState().apply;
  const align = (m: AlignMode) => apply((d) => alignObjects(d, ids, m));
  const aligns: [AlignMode, string][] = [
    ['left', 'Gauche'],
    ['centerX', 'Centre H'],
    ['right', 'Droite'],
    ['top', 'Haut'],
    ['centerY', 'Centre V'],
    ['bottom', 'Bas'],
  ];
  return (
    <>
      <H>{`${ids.length} objets sélectionnés`}</H>
      <p className="mb-1 text-xs text-slate-500">Aligner</p>
      <div className="grid grid-cols-3 gap-1">
        {aligns.map(([m, l]) => (
          <Button key={m} size="sm" onClick={() => align(m)}>{l}</Button>
        ))}
      </div>
      <p className="mb-1 mt-3 text-xs text-slate-500">Distribuer régulièrement</p>
      <div className="grid grid-cols-2 gap-1">
        <Button size="sm" onClick={() => apply((d) => distributeObjects(d, ids, 'x'))} disabled={ids.length < 3}>Horizontalement</Button>
        <Button size="sm" onClick={() => apply((d) => distributeObjects(d, ids, 'y'))} disabled={ids.length < 3}>Verticalement</Button>
      </div>
      <H>Actions</H>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" onClick={groupSelection}>Grouper</Button>
        <Button size="sm" onClick={ungroupSelection}>Dégrouper</Button>
        <Button size="sm" onClick={toggleLock}>Verrouiller / déverrouiller</Button>
        <Button size="sm" onClick={() => rotateSelection(15)}>Pivoter +15°</Button>
        <Button size="sm" onClick={duplicateSelection}>Dupliquer</Button>
        <Button size="sm" variant="danger" onClick={deleteSelection}>Supprimer</Button>
      </div>
    </>
  );
}

function ZoneProps({ z, doc }: { z: Zone; doc: PlanDocument }) {
  const set = (patch: Partial<Zone>) => useEditor.getState().apply((d) => ({ ...d, zones: d.zones.map((x) => (x.id === z.id ? { ...x, ...patch } : x)) }));
  return (
    <>
      <H>Zone</H>
      <label className="block text-xs">
        <span className="text-slate-500">Nom</span>
        <input className={text} key={z.id} defaultValue={z.name} maxLength={120} onBlur={(e) => e.target.value !== z.name && set({ name: e.target.value.trim() })} />
      </label>
      <label className="block text-xs">
        <span className="text-slate-500">Type</span>
        <select className={text} value={z.type} onChange={(e) => set({ type: e.target.value as ZoneType })}>
          {ZONE_TYPES.map((t) => (
            <option key={t} value={t}>{ZONE_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </label>
      <label className="mt-2 flex items-center gap-2 text-xs">
        <span className="text-slate-500">Couleur</span>
        <input type="color" value={z.color} onChange={(e) => set({ color: e.target.value })} />
      </label>
      <p className="mt-2 text-xs text-slate-600">Surface : {formatArea(polygonArea(z.points))} · {z.points.length} sommets</p>
      <p className="text-xs text-slate-500">
        {z.type === 'interdite' && 'Tout objet posé ici est signalé comme erreur.'}
        {z.type === 'circulation' && 'Tout objet posé ici est signalé comme circulation interrompue.'}
      </p>
      <p className="mt-1 text-xs text-slate-500">Unité d’affichage : {doc.settings.displayUnit}</p>
      <Button variant="danger" size="sm" className="mt-3" onClick={deleteSelection}>Supprimer la zone</Button>
    </>
  );
}

function RoomProps({ doc, highlighted }: { doc: PlanDocument; highlighted: boolean }) {
  const unit = doc.settings.displayUnit;
  const apply = useEditor.getState().apply;
  const [error, setError] = useState<string | null>(null);
  const outline = doc.room.outline;
  const setVertex = (i: number, p: { x?: number; y?: number }) => {
    const next = outline.map((v, k) => (k === i ? { ...v, ...p } : v));
    if (!isSimplePolygon(next)) return setError('Ce point rendrait le contour invalide.');
    setError(null);
    apply((d) => ({ ...d, room: { ...d.room, outline: next } }));
  };
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);

  return (
    <>
      <H>{highlighted ? 'Salle (sélectionnée)' : 'Salle'}</H>
      <label className="block text-xs">
        <span className="text-slate-500">Nom de la salle</span>
        <input className={text} key={doc.room.name} defaultValue={doc.room.name} maxLength={120} onBlur={(e) => e.target.value !== doc.room.name && apply((d) => ({ ...d, room: { ...d.room, name: e.target.value.trim() } }))} />
      </label>
      <p className="mt-2 text-xs text-slate-600">
        Surface : {formatArea(polygonArea(outline))} · Emprise : {formatLength(w, unit)} × {formatLength(h, unit)}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <NumberInput label="Épaisseur des murs" valueMm={doc.room.wallThickness} unit={unit} min={0} max={2000} onCommit={(t) => apply((d) => ({ ...d, room: { ...d.room, wallThickness: t } }))} />
      </div>
      <H>Rendre rectangulaire</H>
      <RectForm unit={unit} w={w} h={h} onApply={(W, D) => apply((d) => ({ ...d, room: { ...d.room, outline: rectPolygon(Math.min(...xs), Math.min(...ys), W, D) } }))} />
      <H>Sommets du contour</H>
      <p className="mb-1 text-xs text-slate-500">Saisie précise des coordonnées, ou outil « Murs » pour redessiner (contours polygonaux).</p>
      <ol className="space-y-1">
        {outline.map((p, i) => (
          <li key={i} className="grid grid-cols-[1.5rem_1fr_1fr_1.5rem] items-end gap-1">
            <span className="pb-1.5 text-xs text-slate-400">{i + 1}</span>
            <NumberInput label="X" valueMm={p.x} unit={unit} onCommit={(x) => setVertex(i, { x })} />
            <NumberInput label="Y" valueMm={p.y} unit={unit} onCommit={(y) => setVertex(i, { y })} />
            <button
              type="button"
              className="pb-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30"
              aria-label={`Supprimer le sommet ${i + 1}`}
              disabled={outline.length <= 3}
              onClick={() => {
                const next = outline.filter((_, k) => k !== i);
                if (isSimplePolygon(next)) apply((d) => ({ ...d, room: { ...d.room, outline: next } }));
                else setError('Supprimer ce sommet rendrait le contour invalide.');
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      <Button
        size="sm"
        className="mt-2"
        onClick={() => {
          // Insère un sommet au milieu du côté le plus long.
          let best = 0;
          outline.forEach((p, i) => {
            if (distance(p, outline[(i + 1) % outline.length]!) > distance(outline[best]!, outline[(best + 1) % outline.length]!)) best = i;
          });
          const a = outline[best]!;
          const b = outline[(best + 1) % outline.length]!;
          const next = [...outline.slice(0, best + 1), { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) }, ...outline.slice(best + 1)];
          apply((d) => ({ ...d, room: { ...d.room, outline: next } }));
        }}
      >
        Ajouter un sommet
      </Button>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </>
  );
}

function RectForm({ unit, w, h, onApply }: { unit: PlanDocument['settings']['displayUnit']; w: number; h: number; onApply: (w: number, h: number) => void }) {
  const [W, setW] = useState(w);
  const [D, setD] = useState(h);
  return (
    <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
      <NumberInput label="Largeur" valueMm={W} unit={unit} min={1000} max={500_000} onCommit={setW} />
      <NumberInput label="Profondeur" valueMm={D} unit={unit} min={1000} max={500_000} onCommit={setD} />
      <Button size="sm" onClick={() => onApply(W, D)}>Appliquer</Button>
    </div>
  );
}
