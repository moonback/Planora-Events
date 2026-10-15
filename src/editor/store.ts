import { create } from 'zustand';
import { boxOfPoints } from '../domain/geometry';
import { commit, createHistory, redo, undo, type History } from '../domain/history';
import type { FloorPlan, ObjectTemplate, PlanDocument, PlanObject, Point } from '../domain/types';
import { repository } from '../persistence';
import { ConflictError } from '../persistence/repository';

export type Tool = 'select' | 'pan' | 'wall' | 'zone' | 'measure' | 'text' | 'calibrate';
/** saved : confirmé par le stockage ; dirty : modifications non enregistrées ; conflict : version distante plus récente. */
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

/** Transformation vue : écran = monde (mm) × scale + (x, y). */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export const ROOM_ID = 'room';

interface EditorState {
  planId: string | null;
  projectId: string;
  projectName: string;
  planName: string;
  guestTarget: number | null;
  history: History<PlanDocument>;
  revision: number;
  savedDoc: PlanDocument | null;
  saveState: SaveState;
  saveError: string | null;
  conflict: FloorPlan | null;
  readOnly: boolean;
  selection: string[];
  tool: Tool;
  view: View;
  viewport: { width: number; height: number };
  clipboard: PlanObject[];
  customTemplates: ObjectTemplate[];
  draft: Point[];

  load(args: { plan: FloorPlan; projectName: string; guestTarget: number | null; templates: ObjectTemplate[]; readOnly: boolean }): void;
  apply(fn: (doc: PlanDocument) => PlanDocument): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  setTool(tool: Tool): void;
  setView(view: View): void;
  setViewport(width: number, height: number): void;
  fitToScreen(): void;
  zoomBy(factor: number, center?: { x: number; y: number }): void;
  setDraft(points: Point[]): void;
  setClipboard(objects: PlanObject[]): void;
  setPlanName(name: string): void;
  addCustomTemplate(t: ObjectTemplate): void;
  save(): Promise<void>;
  resolveConflict(choice: 'reload' | 'overwrite'): Promise<void>;
}

export const MIN_SCALE = 0.002;
export const MAX_SCALE = 2;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

let saving: Promise<void> | null = null;

const stateAfterHistory = (h: History<PlanDocument>, savedDoc: PlanDocument | null, prev: SaveState): SaveState =>
  prev === 'conflict' ? 'conflict' : h.present === savedDoc ? 'saved' : 'dirty';

export const useEditor = create<EditorState>((set, get) => ({
  planId: null,
  projectId: '',
  projectName: '',
  planName: '',
  guestTarget: null,
  history: createHistory({} as PlanDocument),
  revision: 0,
  savedDoc: null,
  saveState: 'saved',
  saveError: null,
  conflict: null,
  readOnly: false,
  selection: [],
  tool: 'select',
  view: { scale: 0.05, x: 40, y: 40 },
  viewport: { width: 800, height: 600 },
  clipboard: [],
  customTemplates: [],
  draft: [],

  load({ plan, projectName, guestTarget, templates, readOnly }) {
    set({
      planId: plan.id,
      projectId: plan.projectId,
      projectName,
      planName: plan.name,
      guestTarget,
      history: createHistory(plan.document),
      revision: plan.revision,
      savedDoc: plan.document,
      saveState: 'saved',
      saveError: null,
      conflict: null,
      readOnly,
      selection: [],
      tool: 'select',
      customTemplates: templates,
      draft: [],
    });
    get().fitToScreen();
  },

  apply(fn) {
    const s = get();
    if (s.readOnly) return;
    const next = fn(s.history.present);
    if (next === s.history.present) return;
    const history = commit(s.history, next);
    set({ history, saveState: stateAfterHistory(history, s.savedDoc, s.saveState) });
  },
  undo() {
    const s = get();
    if (s.readOnly) return;
    const history = undo(s.history);
    set({ history, selection: [], saveState: stateAfterHistory(history, s.savedDoc, s.saveState) });
  },
  redo() {
    const s = get();
    if (s.readOnly) return;
    const history = redo(s.history);
    set({ history, selection: [], saveState: stateAfterHistory(history, s.savedDoc, s.saveState) });
  },
  select: (ids) => set({ selection: ids }),
  setTool: (tool) => set({ tool, draft: [] }),
  setView: (view) => set({ view: { ...view, scale: clampScale(view.scale) } }),
  setViewport: (width, height) => set({ viewport: { width, height } }),
  fitToScreen() {
    const { history, viewport } = get();
    const doc = history.present;
    if (!doc.room) return;
    const b = boxOfPoints([...doc.room.outline, ...doc.objects.map((o) => ({ x: o.x, y: o.y }))]);
    const pad = 40;
    const scale = clampScale(Math.min((viewport.width - 2 * pad) / (b.maxX - b.minX || 1), (viewport.height - 2 * pad) / (b.maxY - b.minY || 1)));
    set({
      view: {
        scale,
        x: (viewport.width - (b.maxX - b.minX) * scale) / 2 - b.minX * scale,
        y: (viewport.height - (b.maxY - b.minY) * scale) / 2 - b.minY * scale,
      },
    });
  },
  zoomBy(factor, center) {
    const { view, viewport } = get();
    const c = center ?? { x: viewport.width / 2, y: viewport.height / 2 };
    const scale = clampScale(view.scale * factor);
    const wx = (c.x - view.x) / view.scale;
    const wy = (c.y - view.y) / view.scale;
    set({ view: { scale, x: c.x - wx * scale, y: c.y - wy * scale } });
  },
  setDraft: (draft) => set({ draft }),
  setClipboard: (clipboard) => set({ clipboard }),
  setPlanName: (planName) => set({ planName }),
  addCustomTemplate: (t) => set({ customTemplates: [...get().customTemplates.filter((x) => x.id !== t.id), t] }),

  /** Enregistre l'état courant ; « Enregistré » n'est affiché qu'après confirmation du stockage. */
  async save() {
    if (saving) await saving;
    const s = get();
    if (!s.planId || s.readOnly || s.saveState === 'conflict' || s.history.present === s.savedDoc) return;
    const doc = s.history.present;
    set({ saveState: 'saving', saveError: null });
    saving = (async () => {
      try {
        const plan = await repository.savePlan(s.planId!, doc, s.revision);
        set({ revision: plan.revision, savedDoc: doc, saveState: get().history.present === doc ? 'saved' : 'dirty' });
      } catch (e) {
        if (e instanceof ConflictError) set({ saveState: 'conflict', conflict: e.latest, saveError: e.message });
        else set({ saveState: 'error', saveError: e instanceof Error ? e.message : String(e) });
      } finally {
        saving = null;
      }
    })();
    await saving;
  },

  async resolveConflict(choice) {
    const s = get();
    if (!s.planId) return;
    const latest = s.conflict ?? (await repository.getPlan(s.planId));
    if (choice === 'reload') {
      set({ history: createHistory(latest.document), savedDoc: latest.document, revision: latest.revision, saveState: 'saved', saveError: null, conflict: null, selection: [] });
    } else {
      // Écrase la version distante avec l'état local (choix explicite de l'utilisateur).
      set({ revision: latest.revision, saveState: 'dirty', saveError: null, conflict: null });
      await get().save();
    }
  },
}));

export const useDoc = () => useEditor((s) => s.history.present);
