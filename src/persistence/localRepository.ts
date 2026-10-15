import { newId, parseDocument } from '../domain/document';
import {
  ObjectTemplateSchema,
  ProjectInputSchema,
  type ExportRecord,
  type FloorPlan,
  type ObjectTemplate,
  type PlanDocument,
  type PlanRevision,
  type Project,
  type RoomTemplate,
  type RoomTemplateKind,
} from '../domain/types';
import type { KVStore } from './kvStore';
import { ConflictError, NotFoundError, PermissionError, type ProjectPatch, type Repository, type Role } from './repository';

const now = () => new Date().toISOString();

function checkedDocument(doc: unknown): PlanDocument {
  const r = parseDocument(doc);
  if (!r.ok) throw new Error(r.error);
  return r.document;
}

/**
 * Mode local : les données vivent dans IndexedDB de ce navigateur uniquement.
 * Pas de compte, pas de partage, pas de synchronisation : l'interface l'indique explicitement.
 */
export class LocalRepository implements Repository {
  readonly mode = 'local' as const;
  private readonly kv: KVStore;

  constructor(kv: KVStore) {
    this.kv = kv;
  }

  async listProjects() {
    return (await this.kv.list<Project>('project:')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getProject(id: string) {
    const p = await this.kv.get<Project>(`project:${id}`);
    if (!p) throw new NotFoundError('Projet');
    return p;
  }

  async createProject(input: Parameters<Repository['createProject']>[0]) {
    const data = ProjectInputSchema.parse(input);
    const t = now();
    const p: Project = { id: newId(), ...data, favorite: false, archived: false, createdAt: t, updatedAt: t };
    await this.kv.set(`project:${p.id}`, p);
    return p;
  }

  async updateProject(id: string, patch: ProjectPatch) {
    const current = await this.getProject(id);
    const data = ProjectInputSchema.parse({ ...current, ...patch });
    return this.kv.update<Project>(`project:${id}`, (cur) => {
      if (!cur) throw new NotFoundError('Projet');
      return { ...cur, ...data, favorite: patch.favorite ?? cur.favorite, archived: patch.archived ?? cur.archived, updatedAt: now() };
    });
  }

  async deleteProject(id: string) {
    for (const plan of await this.listPlans(id)) await this.deletePlan(plan.id);
    for (const e of await this.listExports(id)) await this.kv.delete(`export:${e.id}`);
    await this.kv.delete(`project:${id}`);
  }

  async duplicateProject(id: string) {
    const src = await this.getProject(id);
    const copy = await this.createProject({ ...src, name: `${src.name} (copie)`.slice(0, 120) });
    for (const plan of await this.listPlans(id)) await this.createPlan(copy.id, plan.name, plan.document);
    return copy;
  }

  async listPlans(projectId: string) {
    return (await this.listAllPlans()).filter((p) => p.projectId === projectId);
  }

  async listAllPlans() {
    return (await this.kv.list<FloorPlan>('plan:')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getPlan(id: string) {
    const p = await this.kv.get<FloorPlan>(`plan:${id}`);
    if (!p) throw new NotFoundError('Plan');
    return p;
  }

  async createPlan(projectId: string, name: string, document: PlanDocument) {
    await this.getProject(projectId);
    const t = now();
    const plan: FloorPlan = { id: newId(), projectId, name: name.trim() || 'Plan', document: checkedDocument(document), revision: 1, createdAt: t, updatedAt: t };
    await this.kv.set(`plan:${plan.id}`, plan);
    await this.touchProject(projectId);
    return plan;
  }

  async savePlan(id: string, document: PlanDocument, expectedRevision: number) {
    const doc = checkedDocument(document);
    const saved = await this.kv.update<FloorPlan>(`plan:${id}`, (cur) => {
      if (!cur) throw new NotFoundError('Plan');
      if (cur.revision !== expectedRevision) throw new ConflictError(cur);
      return { ...cur, document: doc, revision: cur.revision + 1, updatedAt: now() };
    });
    await this.touchProject(saved.projectId);
    return saved;
  }

  async renamePlan(id: string, name: string) {
    if (!name.trim()) throw new Error('Nom de plan requis.');
    return this.kv.update<FloorPlan>(`plan:${id}`, (cur) => {
      if (!cur) throw new NotFoundError('Plan');
      return { ...cur, name: name.trim().slice(0, 120), updatedAt: now() };
    });
  }

  async deletePlan(id: string) {
    for (const r of await this.listRevisions(id)) await this.kv.delete(`rev:${id}:${r.id}`);
    await this.kv.delete(`plan:${id}`);
  }

  async listRevisions(planId: string) {
    return (await this.kv.list<PlanRevision>(`rev:${planId}:`)).sort((a, b) => b.number - a.number);
  }

  async createRevision(planId: string, label: string) {
    const plan = await this.getPlan(planId);
    const existing = await this.listRevisions(planId);
    const rev: PlanRevision = {
      id: newId(),
      planId,
      number: (existing[0]?.number ?? 0) + 1,
      label: label.trim().slice(0, 200),
      document: plan.document,
      createdAt: now(),
    };
    await this.kv.set(`rev:${planId}:${rev.id}`, rev);
    return rev;
  }

  async listObjectTemplates() {
    return this.kv.list<ObjectTemplate>('otpl:');
  }
  async saveObjectTemplate(t: ObjectTemplate) {
    const v = ObjectTemplateSchema.parse({ ...t, custom: true, category: 'personnalise' });
    await this.kv.set(`otpl:${v.id}`, v);
    return v;
  }
  async deleteObjectTemplate(id: string) {
    await this.kv.delete(`otpl:${id}`);
  }

  async listRoomTemplates() {
    return (await this.kv.list<RoomTemplate>('rtpl:')).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }
  async saveRoomTemplate(name: string, kind: RoomTemplateKind, document: PlanDocument) {
    if (!name.trim()) throw new Error('Nom de modèle requis.');
    const t: RoomTemplate = { id: newId(), name: name.trim(), kind, document: checkedDocument(document), createdAt: now() };
    await this.kv.set(`rtpl:${t.id}`, t);
    return t;
  }
  async deleteRoomTemplate(id: string) {
    await this.kv.delete(`rtpl:${id}`);
  }

  async recordExport(rec: Omit<ExportRecord, 'id' | 'createdAt'>) {
    const r: ExportRecord = { ...rec, id: newId(), createdAt: now() };
    await this.kv.set(`export:${r.id}`, r);
    return r;
  }
  async listExports(projectId?: string) {
    return (await this.kv.list<ExportRecord>('export:'))
      .filter((e) => !projectId || e.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // Le mode local est mono-utilisateur : aucune équipe, aucune invitation possible.
  async getTeam() {
    return null;
  }
  private cloudOnly(): never {
    throw new PermissionError("La gestion d'équipe nécessite le mode cloud (Supabase configuré).");
  }
  async invite(_email: string, _role: Role): Promise<never> {
    this.cloudOnly();
  }
  async updateMemberRole(_userId: string, _role: Role): Promise<never> {
    this.cloudOnly();
  }
  async removeMember(_userId: string): Promise<never> {
    this.cloudOnly();
  }
  async revokeInvitation(_id: string): Promise<never> {
    this.cloudOnly();
  }
  async acceptInvitation(_token: string): Promise<never> {
    this.cloudOnly();
  }
  async getSubscription() {
    return null;
  }

  private async touchProject(id: string) {
    await this.kv.update<Project>(`project:${id}`, (cur) => {
      if (!cur) throw new NotFoundError('Projet');
      return { ...cur, updatedAt: now() };
    });
  }
}
