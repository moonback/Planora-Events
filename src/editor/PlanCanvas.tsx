import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { Arc, Circle, Ellipse, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text, Transformer } from 'react-konva';
import { newId } from '../domain/document';
import { boxOfPoints, distance, isSimplePolygon, normalizeAngle, objectBox, snapTo, type Box } from '../domain/geometry';
import { moveObjects } from '../domain/operations';
import type { PlanObject, Point, Zone } from '../domain/types';
import { formatLength, parseNumber } from '../domain/units';
import type { Issue } from '../domain/validation';
import { addTemplate, addZonePreset, selectObject } from './actions';
import { ROOM_ID, useDoc, useEditor } from './store';

export const DRAG_MIME = 'application/x-planora-item';
export type DragPayload = { kind: 'template' | 'zone'; id: string };

const flat = (pts: readonly Point[]) => pts.flatMap((p) => [p.x, p.y]);

function useHtmlImage(src: string | undefined) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return setImg(null);
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = src;
    return () => {
      i.onload = null;
    };
  }, [src]);
  return img;
}

interface ObjectNodeProps {
  o: PlanObject;
  selected: boolean;
  flagged: boolean;
  draggable: boolean;
  onMouseDown: (e: KonvaEventObject<MouseEvent>, o: PlanObject) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>, o: PlanObject) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>, o: PlanObject) => void;
}

/** Rendu d'un objet en coordonnées locales (mm) : seul le moteur métier définit la géométrie. */
const ObjectNode = memo(function ObjectNode({ o, selected, flagged, draggable, onMouseDown, onDragMove, onDragEnd }: ObjectNodeProps) {
  const w = o.width;
  const d = o.depth;
  const stroke = flagged ? '#dc2626' : selected ? '#2563eb' : '#1f2937';
  const sw = flagged || selected ? 2 : 1;
  const common = { fill: o.color, stroke, strokeWidth: sw, strokeScaleEnabled: false, opacity: o.role === 'suspendu' ? 0.45 : 0.9, perfectDrawEnabled: false };
  const text = o.label || (['table', 'scene', 'stand', 'service'].includes(o.role) ? o.name.split(' (')[0] : '');
  const fontSize = Math.max(80, Math.min(400, Math.min(w, d) / 4));
  return (
    <Group
      id={o.id}
      name="object"
      x={o.x}
      y={o.y}
      rotation={o.rotation}
      draggable={draggable}
      onMouseDown={(e) => onMouseDown(e, o)}
      onTap={(e) => onMouseDown(e as unknown as KonvaEventObject<MouseEvent>, o)}
      onDragMove={(e) => onDragMove(e, o)}
      onDragEnd={(e) => onDragEnd(e, o)}
    >
      {o.shape === 'round' ? <Ellipse radiusX={w / 2} radiusY={d / 2} {...common} /> : <Rect x={-w / 2} y={-d / 2} width={w} height={d} cornerRadius={o.shape === 'chair' ? Math.min(w, d) * 0.15 : 0} {...common} dash={o.role === 'suspendu' ? [6, 4] : undefined} />}
      {o.shape === 'chair' && <Rect x={-w / 2} y={d / 2 - d * 0.22} width={w} height={d * 0.22} fill="#111827" opacity={0.7} listening={false} />}
      {o.shape === 'door' && (
        <>
          <Arc x={-w / 2} y={d / 2} innerRadius={0} outerRadius={w} angle={90} stroke="#92400e" strokeWidth={1} strokeScaleEnabled={false} dash={[4, 4]} listening={false} />
          <Line points={[-w / 2, d / 2, -w / 2, d / 2 + w]} stroke="#92400e" strokeWidth={2} strokeScaleEnabled={false} listening={false} />
        </>
      )}
      {o.shape === 'stage' && <Line points={[-w / 2, -d / 2, w / 2, d / 2, w / 2, -d / 2, -w / 2, d / 2]} stroke="#64748b" strokeWidth={1} strokeScaleEnabled={false} listening={false} />}
      {o.shape === 'speaker' && <Circle radius={Math.min(w, d) * 0.3} stroke="#e5e7eb" strokeWidth={1} strokeScaleEnabled={false} listening={false} />}
      {text && Math.min(w, d) >= 300 && (
        <Text x={-w / 2} y={-d / 2} width={w} height={d} text={text} align="center" verticalAlign="middle" fontSize={fontSize} fill={o.shape === 'stage' ? '#fff' : '#111827'} listening={false} />
      )}
      {o.locked && <Text x={w / 2 - 260} y={-d / 2 + 20} text="🔒" fontSize={200} listening={false} />}
    </Group>
  );
});

function ZoneNode({ z, selected, draggable, onSelect, onMoved }: { z: Zone; selected: boolean; draggable: boolean; onSelect: (e: KonvaEventObject<MouseEvent>) => void; onMoved: (dx: number, dy: number) => void }) {
  const b = boxOfPoints(z.points);
  return (
    <Group
      id={z.id}
      draggable={draggable}
      onMouseDown={onSelect}
      onDragEnd={(e) => {
        const n = e.target;
        const dx = n.x();
        const dy = n.y();
        n.position({ x: 0, y: 0 });
        onMoved(dx, dy);
      }}
    >
      <Line points={flat(z.points)} closed fill={z.color} opacity={0.18} />
      <Line points={flat(z.points)} closed stroke={selected ? '#2563eb' : z.color} strokeWidth={selected ? 2 : 1} strokeScaleEnabled={false} dash={[8, 5]} />
      <Text x={b.minX} y={b.minY + 100} width={b.maxX - b.minX} text={z.name} align="center" fontSize={Math.max(150, Math.min(400, (b.maxX - b.minX) / 12))} fill="#334155" listening={false} />
    </Group>
  );
}

function niceStep(gridSize: number, scale: number): number {
  let step = gridSize;
  while (step * scale < 8) step *= 2;
  return step;
}

export interface PlanCanvasProps {
  issues: Issue[];
  interactive?: boolean;
  onError?: (message: string) => void;
}

export function PlanCanvas({ issues, interactive = true, onError }: PlanCanvasProps) {
  const doc = useDoc();
  const view = useEditor((s) => s.view);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const draft = useEditor((s) => s.draft);
  const readOnly = useEditor((s) => s.readOnly) || !interactive;
  const { apply, select, setView, setViewport, setDraft, zoomBy, setTool } = useEditor.getState();

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [pointer, setPointer] = useState<Point | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const bgImage = useHtmlImage(doc.background?.visible ? doc.background.dataUrl : undefined);

  const selected = useMemo(() => new Set(selection), [selection]);
  const flagged = useMemo(() => new Set(issues.filter((i) => i.status === 'ouvert' && i.severity === 'erreur').flatMap((i) => i.objectIds)), [issues]);
  const s = view.scale;
  const settings = doc.settings;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setSize({ width, height });
      setViewport(width, height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setViewport]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) setSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Le transformateur suit la sélection (objets non verrouillés).
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const lockedIds = new Set(doc.objects.filter((o) => o.locked).map((o) => o.id));
    const nodes = readOnly || tool !== 'select' ? [] : selection.filter((id) => !lockedIds.has(id)).map((id) => stage.findOne(`#${id}`)).filter((n): n is Konva.Node => !!n && n.name() === 'object');
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selection, doc.objects, readOnly, tool]);

  const toWorld = useCallback((p: { x: number; y: number }): Point => ({ x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale }), [view]);
  const snapPoint = useCallback((p: Point): Point => (settings.snap ? { x: snapTo(p.x, settings.gridSize / 2), y: snapTo(p.y, settings.gridSize / 2) } : p), [settings]);

  // Boîtes des objets non sélectionnés, pour les guides d'alignement.
  const otherBoxes = useMemo(() => doc.objects.filter((o) => !selected.has(o.id)).map(objectBox), [doc.objects, selected]);

  const onObjectMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>, o: PlanObject) => {
      if (useEditor.getState().tool !== 'select') return;
      e.cancelBubble = true;
      selectObject(o.id, e.evt.shiftKey);
    },
    [],
  );

  const onObjectDragMove = useCallback(
    (e: KonvaEventObject<DragEvent>, o: PlanObject) => {
      const n = e.target;
      const st = useEditor.getState();
      if (st.selection.length > 1) return; // déplacement groupé : accrochage appliqué au relâchement
      const tol = 8 / st.view.scale;
      const b = objectBox({ ...o, x: n.x(), y: n.y() });
      const xs = [b.minX, (b.minX + b.maxX) / 2, b.maxX];
      const ys = [b.minY, (b.minY + b.maxY) / 2, b.maxY];
      let bestX: { d: number; at: number } | null = null;
      let bestY: { d: number; at: number } | null = null;
      for (const ob of otherBoxes) {
        for (const tx of [ob.minX, (ob.minX + ob.maxX) / 2, ob.maxX])
          for (const x of xs) if (Math.abs(tx - x) < tol && (!bestX || Math.abs(tx - x) < Math.abs(bestX.d))) bestX = { d: tx - x, at: tx };
        for (const ty of [ob.minY, (ob.minY + ob.maxY) / 2, ob.maxY])
          for (const y of ys) if (Math.abs(ty - y) < tol && (!bestY || Math.abs(ty - y) < Math.abs(bestY.d))) bestY = { d: ty - y, at: ty };
      }
      const g = st.history.present.settings;
      n.x(bestX ? n.x() + bestX.d : g.snap ? snapTo(n.x(), g.gridSize / 2) : n.x());
      n.y(bestY ? n.y() + bestY.d : g.snap ? snapTo(n.y(), g.gridSize / 2) : n.y());
      setGuides({ x: bestX?.at ?? null, y: bestY?.at ?? null });
    },
    [otherBoxes],
  );

  const onObjectDragEnd = useCallback(
    (e: KonvaEventObject<DragEvent>, o: PlanObject) => {
      setGuides({ x: null, y: null });
      const st = useEditor.getState();
      let dx = e.target.x() - o.x;
      let dy = e.target.y() - o.y;
      const ids = st.selection.includes(o.id) ? st.selection : [o.id];
      const g = st.history.present.settings;
      if (ids.length > 1 && g.snap) {
        dx = snapTo(dx, g.gridSize / 2);
        dy = snapTo(dy, g.gridSize / 2);
      }
      if (dx === 0 && dy === 0) {
        e.target.position({ x: o.x, y: o.y });
        return;
      }
      st.apply((d) => moveObjects(d, ids, dx, dy));
    },
    [],
  );

  const onTransformEnd = () => {
    const tr = trRef.current;
    if (!tr) return;
    const updates = new Map<string, Partial<PlanObject>>();
    for (const n of tr.nodes()) {
      const o = doc.objects.find((x) => x.id === n.id());
      if (!o) continue;
      const sx = n.scaleX();
      const sy = n.scaleY();
      n.scale({ x: 1, y: 1 });
      updates.set(o.id, {
        x: Math.round(n.x()),
        y: Math.round(n.y()),
        rotation: normalizeAngle(Math.round(n.rotation() * 100) / 100),
        width: Math.max(10, Math.round(o.width * Math.abs(sx))),
        depth: Math.max(10, Math.round(o.depth * Math.abs(sy))),
      });
    }
    apply((d) => ({ ...d, objects: d.objects.map((o) => (updates.has(o.id) ? { ...o, ...updates.get(o.id) } : o)) }));
  };

  const finishDraft = useCallback(
    (points: Point[]) => {
      const st = useEditor.getState();
      if (st.tool === 'wall') {
        if (points.length < 3 || !isSimplePolygon(points)) onError?.('Contour invalide : au moins 3 points, sans côtés qui se croisent.');
        else st.apply((d) => ({ ...d, room: { ...d.room, outline: points } }));
        st.setTool('select');
        st.select([ROOM_ID]);
      } else if (st.tool === 'zone') {
        if (points.length < 3 || !isSimplePolygon(points)) onError?.('Zone invalide : au moins 3 points, sans côtés qui se croisent.');
        else {
          const z: Zone = { id: newId(), name: 'Zone', type: 'libre', color: '#0ea5e9', points };
          st.apply((d) => ({ ...d, zones: [...d.zones, z] }));
          st.setTool('select');
          st.select([z.id]);
          return;
        }
        st.setTool('select');
      }
      st.setDraft([]);
    },
    [onError],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      if (!st.draft.length) return;
      if (e.key === 'Escape') st.setDraft([]);
      if (e.key === 'Enter') finishDraft(st.draft);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finishDraft]);

  const handleToolClick = (raw: Point) => {
    const p = tool === 'calibrate' ? raw : snapPoint(raw);
    if (tool === 'wall' || tool === 'zone') {
      if (draft.length >= 3 && distance(p, draft[0]!) < 12 / s) return finishDraft(draft);
      setDraft([...draft, p]);
    } else if (tool === 'measure') {
      if (!draft.length) return setDraft([p]);
      apply((d) => ({ ...d, dimensions: [...d.dimensions, { id: newId(), a: draft[0]!, b: p }] }));
      setDraft([]);
    } else if (tool === 'text') {
      const text = window.prompt('Texte de l’annotation');
      if (text?.trim()) {
        const id = newId();
        apply((d) => ({ ...d, annotations: [...d.annotations, { id, x: p.x, y: p.y, text: text.trim().slice(0, 500), fontSize: 300, color: '#1f2937' }] }));
        select([id]);
      }
      setTool('select');
    } else if (tool === 'calibrate') {
      if (!draft.length) return setDraft([p]);
      const measured = distance(draft[0]!, p);
      setDraft([]);
      const bg = doc.background;
      const answer = window.prompt(`Distance réelle entre les deux points (en mètres) ? Mesurée actuellement : ${formatLength(measured, 'm')}`);
      const real = answer ? parseNumber(answer) : null;
      if (!bg || real === null || real <= 0 || measured < 1) {
        if (answer !== null) onError?.('Étalonnage annulé : distance invalide.');
        return setTool('select');
      }
      const f = (real * 1000) / measured;
      const a = draft[0]!;
      apply((d) => (d.background ? { ...d, background: { ...d.background, mmPerPx: d.background.mmPerPx * f, x: a.x - (a.x - d.background.x) * f, y: a.y - (a.y - d.background.y) * f } } : d));
      setTool('select');
    }
  };

  const isBackground = (e: KonvaEventObject<MouseEvent>) => e.target === e.target.getStage() || e.target.name() === 'bg';
  const panning = tool === 'pan' || spaceDown;

  const onStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (panning || e.evt.button !== 0) return;
    const p = toWorld(e.target.getStage()!.getPointerPosition()!);
    if (tool === 'select') {
      if (!isBackground(e)) return;
      if (!e.evt.shiftKey) select([]);
      if (!readOnly) setMarquee({ start: p, end: p });
    } else if (!readOnly) handleToolClick(p);
  };

  const onStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    const p = toWorld(pos);
    if (marquee) setMarquee({ ...marquee, end: p });
    if (draft.length) setPointer(tool === 'calibrate' ? p : snapPoint(p));
  };

  const onStageMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    if (!marquee) return;
    const box: Box = boxOfPoints([marquee.start, marquee.end]);
    setMarquee(null);
    if (box.maxX - box.minX < 2 / s && box.maxY - box.minY < 2 / s) return;
    const hit = doc.objects.filter((o) => {
      const b = objectBox(o);
      return b.minX < box.maxX && b.maxX > box.minX && b.minY < box.maxY && b.maxY > box.minY;
    });
    const ids = hit.map((o) => o.id);
    select(e.evt.shiftKey ? [...new Set([...useEditor.getState().selection, ...ids])] : ids);
  };

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pos = e.target.getStage()?.getPointerPosition();
    if (pos) zoomBy(e.evt.deltaY < 0 ? 1.15 : 1 / 1.15, pos);
  };

  const onDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (readOnly) return;
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    const payload = JSON.parse(raw) as DragPayload;
    const rect = containerRef.current!.getBoundingClientRect();
    const p = toWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (payload.kind === 'template') addTemplate(payload.id, p);
    else addZonePreset(payload.id, p);
  };

  // Grille visible uniquement.
  const x0 = -view.x / s;
  const y0 = -view.y / s;
  const x1 = (size.width - view.x) / s;
  const y1 = (size.height - view.y) / s;
  const step = niceStep(settings.gridSize, s);

  const roomSelected = selected.has(ROOM_ID);
  const selectedObjects = doc.objects.filter((o) => selected.has(o.id));
  const singleSelection = selectedObjects.length === 1;
  const scaleBar = useMemo(() => {
    const candidates = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    return candidates.find((c) => c * s >= 70) ?? 50000;
  }, [s]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-slate-100"
      style={{ cursor: panning ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      data-testid="plan-canvas"
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={s}
        scaleY={s}
        draggable={panning}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) setView({ scale: s, x: e.target.x(), y: e.target.y() });
        }}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onDblClick={() => draft.length && (tool === 'wall' || tool === 'zone') && finishDraft(draft)}
        onWheel={onWheel}
      >
        <Layer listening>
          {bgImage && doc.background && (
            <KImage
              name="bg"
              image={bgImage}
              x={doc.background.x}
              y={doc.background.y}
              width={doc.background.pixelWidth * doc.background.mmPerPx}
              height={doc.background.pixelHeight * doc.background.mmPerPx}
              opacity={doc.background.opacity}
            />
          )}
          <Line points={flat(doc.room.outline)} closed stroke="#334155" strokeWidth={Math.max(40, doc.room.wallThickness * 2)} lineJoin="miter" onMouseDown={(e) => {
            if (tool !== 'select') return;
            e.cancelBubble = true;
            select([ROOM_ID]);
          }} />
          <Line name="bg" points={flat(doc.room.outline)} closed fill="#ffffff" opacity={doc.background?.visible ? 0.55 : 1} stroke={roomSelected ? '#2563eb' : '#0f172a'} strokeWidth={roomSelected ? 2 : 1} strokeScaleEnabled={false} />
          {settings.showGrid && (
            <Shape
              listening={false}
              stroke="#cbd5e1"
              strokeWidth={0.5}
              strokeScaleEnabled={false}
              sceneFunc={(ctx, shape) => {
                ctx.beginPath();
                for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
                  ctx.moveTo(x, y0);
                  ctx.lineTo(x, y1);
                }
                for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
                  ctx.moveTo(x0, y);
                  ctx.lineTo(x1, y);
                }
                ctx.strokeShape(shape);
              }}
            />
          )}
        </Layer>
        <Layer>
          {doc.zones.map((z) => (
            <ZoneNode
              key={z.id}
              z={z}
              selected={selected.has(z.id)}
              draggable={!readOnly && tool === 'select' && selected.has(z.id)}
              onSelect={(e) => {
                if (tool !== 'select') return;
                e.cancelBubble = true;
                select([z.id]);
              }}
              onMoved={(dx, dy) => apply((d) => ({ ...d, zones: d.zones.map((x) => (x.id === z.id ? { ...x, points: x.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : x)) }))}
            />
          ))}
          {doc.objects.map((o) => (
            <ObjectNode
              key={o.id}
              o={o}
              selected={selected.has(o.id)}
              flagged={flagged.has(o.id)}
              draggable={!readOnly && tool === 'select' && !o.locked && !panning}
              onMouseDown={onObjectMouseDown}
              onDragMove={onObjectDragMove}
              onDragEnd={onObjectDragEnd}
            />
          ))}
          {doc.annotations.map((a) => (
            <Text
              key={a.id}
              id={a.id}
              x={a.x}
              y={a.y}
              text={a.text}
              fontSize={a.fontSize}
              fill={selected.has(a.id) ? '#2563eb' : a.color}
              draggable={!readOnly && tool === 'select'}
              onMouseDown={(e) => {
                if (tool !== 'select') return;
                e.cancelBubble = true;
                select([a.id]);
              }}
              onDragEnd={(e) => {
                const n = e.target;
                apply((d) => ({ ...d, annotations: d.annotations.map((x) => (x.id === a.id ? { ...x, x: n.x(), y: n.y() } : x)) }));
              }}
            />
          ))}
          {doc.dimensions.map((dm) => {
            const sel = selected.has(dm.id);
            return (
              <Group
                key={dm.id}
                onMouseDown={(e) => {
                  if (tool !== 'select') return;
                  e.cancelBubble = true;
                  select([dm.id]);
                }}
              >
                <Line points={[dm.a.x, dm.a.y, dm.b.x, dm.b.y]} stroke={sel ? '#2563eb' : '#0f172a'} strokeWidth={sel ? 3 : 1.5} strokeScaleEnabled={false} hitStrokeWidth={12} />
                <Circle x={dm.a.x} y={dm.a.y} radius={3 / s} fill="#0f172a" />
                <Circle x={dm.b.x} y={dm.b.y} radius={3 / s} fill="#0f172a" />
                <Text x={(dm.a.x + dm.b.x) / 2} y={(dm.a.y + dm.b.y) / 2 - 16 / s} text={formatLength(distance(dm.a, dm.b), settings.displayUnit)} fontSize={13 / s} fill="#0f172a" />
              </Group>
            );
          })}
        </Layer>
        <Layer>
          {roomSelected &&
            !readOnly &&
            doc.room.outline.map((p, i) => (
              <Circle
                key={i}
                x={p.x}
                y={p.y}
                radius={6 / s}
                fill="#fff"
                stroke="#2563eb"
                strokeWidth={2}
                strokeScaleEnabled={false}
                draggable
                onMouseDown={(e) => (e.cancelBubble = true)}
                onDragEnd={(e) => {
                  const q = snapPoint({ x: e.target.x(), y: e.target.y() });
                  const outline = doc.room.outline.map((v, k) => (k === i ? q : v));
                  if (!isSimplePolygon(outline)) {
                    e.target.position(p);
                    onError?.('Ce déplacement rendrait le contour de la salle invalide.');
                    return;
                  }
                  apply((d) => ({ ...d, room: { ...d.room, outline } }));
                }}
              />
            ))}
          <Transformer
            ref={trRef}
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={4}
            ignoreStroke
            keepRatio={false}
            flipEnabled={false}
            resizeEnabled={singleSelection}
            enabledAnchors={['top-center', 'bottom-center', 'middle-left', 'middle-right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']}
            boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4 ? oldBox : newBox)}
            onTransformEnd={onTransformEnd}
          />
          {guides.x !== null && <Line points={[guides.x, y0, guides.x, y1]} stroke="#ec4899" strokeWidth={1} strokeScaleEnabled={false} dash={[4, 4]} listening={false} />}
          {guides.y !== null && <Line points={[x0, guides.y, x1, guides.y]} stroke="#ec4899" strokeWidth={1} strokeScaleEnabled={false} dash={[4, 4]} listening={false} />}
          {marquee && (
            <Rect
              x={Math.min(marquee.start.x, marquee.end.x)}
              y={Math.min(marquee.start.y, marquee.end.y)}
              width={Math.abs(marquee.end.x - marquee.start.x)}
              height={Math.abs(marquee.end.y - marquee.start.y)}
              fill="rgba(37,99,235,0.08)"
              stroke="#2563eb"
              strokeWidth={1}
              strokeScaleEnabled={false}
              listening={false}
            />
          )}
          {draft.length > 0 && (
            <>
              <Line points={flat(pointer ? [...draft, pointer] : draft)} stroke="#2563eb" strokeWidth={2} strokeScaleEnabled={false} dash={[6, 4]} listening={false} />
              {draft.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={4 / s} fill="#2563eb" listening={false} />
              ))}
              {pointer && <Text x={pointer.x + 10 / s} y={pointer.y + 10 / s} text={formatLength(distance(draft[draft.length - 1]!, pointer), settings.displayUnit)} fontSize={12 / s} fill="#1d4ed8" listening={false} />}
            </>
          )}
          {issues
            .filter((i) => i.status === 'ouvert' && i.location && i.severity !== 'info')
            .map((i) => (
              <Group key={i.id} x={i.location!.x} y={i.location!.y} listening={false}>
                <Circle radius={9 / s} fill={i.severity === 'erreur' ? '#dc2626' : '#f59e0b'} opacity={0.9} />
                <Text x={-3 / s} y={-6 / s} text="!" fontSize={12 / s} fill="#fff" fontStyle="bold" />
              </Group>
            ))}
        </Layer>
      </Stage>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-white/90 px-2 py-1 text-xs text-slate-700 shadow" aria-hidden>
        <div className="h-1.5 bg-slate-800" style={{ width: scaleBar * s }} />
        {formatLength(scaleBar, scaleBar >= 1000 ? 'm' : 'cm')}
      </div>
      {draft.length > 0 && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded bg-slate-900/85 px-3 py-1.5 text-xs text-white" role="status">
          {tool === 'measure' || tool === 'calibrate' ? 'Cliquez sur le second point' : 'Cliquez pour ajouter des points — Entrée, double-clic ou clic sur le premier point pour terminer, Échap pour annuler'}
        </div>
      )}
    </div>
  );
}

