import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
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
import { ConflictError, NotFoundError, PermissionError, type Invitation, type ProjectPatch, type Repository, type Role, type Team } from './repository';

type Row = Record<string, unknown>;
const s = (v: unknown) => String(v ?? '');

function fail(error: PostgrestError | null, what = 'Élément'): void {
  if (!error) return;
  if (error.code === 'PGRST116') throw new NotFoundError(what);
  if (error.code === '42501') throw new PermissionError();
  throw new Error(`Erreur serveur : ${error.message}`);
}

function checkedDocument(doc: unknown): PlanDocument {
  const r = parseDocument(doc);
  if (!r.ok) throw new Error(r.error);
  return r.document;
}

const toProject = (r: Row): Project => ({
  id: s(r.id),
  name: s(r.name),
  client: s(r.client),
  eventName: s(r.event_name),
  eventType: ProjectInputSchema.shape.eventType.parse(r.event_type),
  eventDate: (r.event_date as string | null) ?? null,
  guestCount: (r.guest_count as number | null) ?? null,
  notes: s(r.notes),
  favorite: Boolean(r.favorite),
  archived: Boolean(r.archived),
  createdAt: s(r.created_at),
  updatedAt: s(r.updated_at),
});

const toPlan = (r: Row): FloorPlan => ({
  id: s(r.id),
  projectId: s(r.project_id),
  name: s(r.name),
  document: checkedDocument(r.document),
  revision: Number(r.revision),
  createdAt: s(r.created_at),
  updatedAt: s(r.updated_at),
});

/**
 * Mode cloud. Toutes les autorisations sont appliquées par PostgreSQL (RLS, cf. supabase/migrations) :
 * le contrôle côté interface n'est qu'un confort d'affichage.
 */
export class SupabaseRepository implements Repository {
  readonly mode = 'cloud' as const;
  private readonly sb: SupabaseClient;
  private orgCache: Promise<{ orgId: string; role: Role }> | null = null;

  constructor(sb: SupabaseClient) {
    this.sb = sb;
  }

  /** Organisation active : la première dont l'utilisateur est membre (sélection multi-organisation non gérée). */
  private org() {
    this.orgCache ??= (async () => {
      const { data: auth } = await this.sb.auth.getUser();
      if (!auth.user) throw new PermissionError('Session expirée : reconnectez-vous.');
      const { data, error } = await this.sb.from('organization_members').select('org_id, role').eq('user_id', auth.user.id).order('created_at').limit(1).single();
      fail(error, 'Organisation');
      return { orgId: s(data!.org_id), role: data!.role as Role };
    })();
    this.orgCache.catch(() => (this.orgCache = null));
    return this.orgCache;
  }

  async listProjects() {
    const { data, error } = await this.sb.from('projects').select('*').order('updated_at', { ascending: false });
    fail(error);
    return (data ?? []).map(toProject);
  }

  async getProject(id: string) {
    const { data, error } = await this.sb.from('projects').select('*').eq('id', id).single();
    fail(error, 'Projet');
    return toProject(data!);
  }

  async createProject(input: Parameters<Repository['createProject']>[0]) {
    const d = ProjectInputSchema.parse(input);
    const { orgId } = await this.org();
    const { data, error } = await this.sb
      .from('projects')
      .insert({ org_id: orgId, name: d.name, client: d.client, event_name: d.eventName, event_type: d.eventType, event_date: d.eventDate, guest_count: d.guestCount, notes: d.notes })
      .select()
      .single();
    fail(error);
    return toProject(data!);
  }

  async updateProject(id: string, patch: ProjectPatch) {
    const d = ProjectInputSchema.parse({ ...(await this.getProject(id)), ...patch });
    const { data, error } = await this.sb
      .from('projects')
      .update({
        name: d.name,
        client: d.client,
        event_name: d.eventName,
        event_type: d.eventType,
        event_date: d.eventDate,
        guest_count: d.guestCount,
        notes: d.notes,
        ...(patch.favorite !== undefined && { favorite: patch.favorite }),
        ...(patch.archived !== undefined && { archived: patch.archived }),
      })
      .eq('id', id)
      .select()
      .single();
    fail(error, 'Projet');
    return toProject(data!);
  }

  async deleteProject(id: string) {
    const { error, count } = await this.sb.from('projects').delete({ count: 'exact' }).eq('id', id);
    fail(error);
    if (count === 0) throw new PermissionError('Suppression refusée : seul un administrateur peut supprimer un projet.');
  }

  async duplicateProject(id: string) {
    const src = await this.getProject(id);
    const copy = await this.createProject({ ...src, name: `${src.name} (copie)`.slice(0, 120) });
    for (const plan of await this.listPlans(id)) await this.createPlan(copy.id, plan.name, plan.document);
    return copy;
  }

  async listPlans(projectId: string) {
    const { data, error } = await this.sb.from('floor_plans').select('*').eq('project_id', projectId).order('updated_at', { ascending: false });
    fail(error);
    return (data ?? []).map(toPlan);
  }

  async listAllPlans() {
    const { data, error } = await this.sb.from('floor_plans').select('*').order('updated_at', { ascending: false }).limit(50);
    fail(error);
    return (data ?? []).map(toPlan);
  }

  async getPlan(id: string) {
    const { data, error } = await this.sb.from('floor_plans').select('*').eq('id', id).single();
    fail(error, 'Plan');
    return toPlan(data!);
  }

  async createPlan(projectId: string, name: string, document: PlanDocument) {
    const { orgId } = await this.org();
    const { data, error } = await this.sb
      .from('floor_plans')
      .insert({ project_id: projectId, org_id: orgId, name: name.trim() || 'Plan', document: checkedDocument(document) })
      .select()
      .single();
    fail(error);
    return toPlan(data!);
  }

  async savePlan(id: string, document: PlanDocument, expectedRevision: number) {
    const { data, error } = await this.sb
      .from('floor_plans')
      .update({ document: checkedDocument(document), revision: expectedRevision + 1 })
      .eq('id', id)
      .eq('revision', expectedRevision)
      .select();
    fail(error);
    if (data && data.length === 1) return toPlan(data[0]!);
    // Aucune ligne modifiée : soit la révision a changé (conflit), soit l'utilisateur n'a pas le droit d'écrire.
    const latest = await this.getPlan(id);
    if (latest.revision !== expectedRevision) throw new ConflictError(latest);
    throw new PermissionError('Enregistrement refusé : votre rôle ne permet pas de modifier ce plan.');
  }

  async renamePlan(id: string, name: string) {
    if (!name.trim()) throw new Error('Nom de plan requis.');
    const { data, error } = await this.sb.from('floor_plans').update({ name: name.trim().slice(0, 120) }).eq('id', id).select().single();
    fail(error, 'Plan');
    return toPlan(data!);
  }

  async deletePlan(id: string) {
    const { error, count } = await this.sb.from('floor_plans').delete({ count: 'exact' }).eq('id', id);
    fail(error);
    if (count === 0) throw new PermissionError();
  }

  async listRevisions(planId: string) {
    const { data, error } = await this.sb.from('plan_revisions').select('*').eq('plan_id', planId).order('number', { ascending: false });
    fail(error);
    return (data ?? []).map(
      (r): PlanRevision => ({ id: s(r.id), planId: s(r.plan_id), number: Number(r.number), label: s(r.label), document: checkedDocument(r.document), createdAt: s(r.created_at) }),
    );
  }

  async createRevision(planId: string, label: string) {
    const plan = await this.getPlan(planId);
    const { orgId } = await this.org();
    const last = (await this.listRevisions(planId))[0]?.number ?? 0;
    const { data, error } = await this.sb
      .from('plan_revisions')
      .insert({ plan_id: planId, org_id: orgId, number: last + 1, label: label.trim().slice(0, 200), document: plan.document })
      .select()
      .single();
    fail(error);
    return { id: s(data!.id), planId, number: Number(data!.number), label: s(data!.label), document: plan.document, createdAt: s(data!.created_at) };
  }

  async listObjectTemplates() {
    const { data, error } = await this.sb.from('object_templates').select('id, data');
    fail(error);
    return (data ?? []).flatMap((r) => {
      const t = ObjectTemplateSchema.safeParse({ ...(r.data as object), id: r.id });
      return t.success ? [t.data] : [];
    });
  }
  async saveObjectTemplate(t: ObjectTemplate) {
    const v = ObjectTemplateSchema.parse({ ...t, custom: true, category: 'personnalise' });
    const { orgId } = await this.org();
    const id = /^[0-9a-f-]{36}$/.test(v.id) ? v.id : newId();
    const { error } = await this.sb.from('object_templates').upsert({ id, org_id: orgId, data: { ...v, id } });
    fail(error);
    return { ...v, id };
  }
  async deleteObjectTemplate(id: string) {
    const { error } = await this.sb.from('object_templates').delete().eq('id', id);
    fail(error);
  }

  async listRoomTemplates() {
    const { data, error } = await this.sb.from('room_templates').select('*').order('name');
    fail(error);
    return (data ?? []).map((r): RoomTemplate => ({ id: s(r.id), name: s(r.name), kind: r.kind as RoomTemplateKind, document: checkedDocument(r.document), createdAt: s(r.created_at) }));
  }
  async saveRoomTemplate(name: string, kind: RoomTemplateKind, document: PlanDocument) {
    const { orgId } = await this.org();
    const { data, error } = await this.sb.from('room_templates').insert({ org_id: orgId, name: name.trim(), kind, document: checkedDocument(document) }).select().single();
    fail(error);
    return { id: s(data!.id), name: s(data!.name), kind, document, createdAt: s(data!.created_at) };
  }
  async deleteRoomTemplate(id: string) {
    const { error } = await this.sb.from('room_templates').delete().eq('id', id);
    fail(error);
  }

  async recordExport(rec: Omit<ExportRecord, 'id' | 'createdAt'>) {
    const { orgId } = await this.org();
    const { data, error } = await this.sb
      .from('exports')
      .insert({ org_id: orgId, project_id: rec.projectId, plan_id: rec.planId, format: rec.format, variant: rec.variant, revision: rec.revision, file_name: rec.fileName })
      .select()
      .single();
    fail(error);
    return { ...rec, id: s(data!.id), createdAt: s(data!.created_at) };
  }
  async listExports(projectId?: string) {
    let q = this.sb.from('exports').select('*').order('created_at', { ascending: false }).limit(100);
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    fail(error);
    return (data ?? []).map(
      (r): ExportRecord => ({
        id: s(r.id),
        projectId: s(r.project_id),
        planId: s(r.plan_id),
        format: r.format as ExportRecord['format'],
        variant: s(r.variant),
        revision: Number(r.revision),
        fileName: s(r.file_name),
        createdAt: s(r.created_at),
      }),
    );
  }

  async getTeam(): Promise<Team> {
    const { orgId, role } = await this.org();
    const [org, members, invites] = await Promise.all([
      this.sb.from('organizations').select('name').eq('id', orgId).single(),
      this.sb.from('organization_members').select('user_id, role, profiles(email)').eq('org_id', orgId),
      role === 'admin' ? this.sb.from('invitations').select('*').eq('org_id', orgId).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);
    fail(org.error);
    fail(members.error);
    fail(invites.error);
    return {
      orgId,
      orgName: s(org.data!.name),
      myRole: role,
      members: (members.data ?? []).map((m) => {
        const p = m.profiles as { email?: string } | { email?: string }[] | null;
        return { userId: s(m.user_id), role: m.role as Role, email: s(Array.isArray(p) ? p[0]?.email : p?.email) };
      }),
      invitations: (invites.data ?? []).map(
        (i: Row): Invitation => ({ id: s(i.id), email: s(i.email), role: i.role as Role, token: s(i.token), createdAt: s(i.created_at), acceptedAt: (i.accepted_at as string | null) ?? null }),
      ),
    };
  }

  async invite(email: string, role: Role) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Adresse e-mail invalide.');
    const { orgId } = await this.org();
    const { data, error } = await this.sb.from('invitations').insert({ org_id: orgId, email: email.trim().toLowerCase(), role }).select().single();
    fail(error);
    return { id: s(data!.id), email: s(data!.email), role, token: s(data!.token), createdAt: s(data!.created_at), acceptedAt: null };
  }
  async updateMemberRole(userId: string, role: Role) {
    const { orgId } = await this.org();
    const { error, count } = await this.sb.from('organization_members').update({ role }, { count: 'exact' }).eq('org_id', orgId).eq('user_id', userId);
    fail(error);
    if (count === 0) throw new PermissionError();
  }
  async removeMember(userId: string) {
    const { orgId } = await this.org();
    const { error, count } = await this.sb.from('organization_members').delete({ count: 'exact' }).eq('org_id', orgId).eq('user_id', userId);
    fail(error);
    if (count === 0) throw new PermissionError();
  }
  async revokeInvitation(id: string) {
    const { error } = await this.sb.from('invitations').delete().eq('id', id);
    fail(error);
  }
  async acceptInvitation(token: string) {
    const { error } = await this.sb.rpc('accept_invitation', { p_token: token });
    fail(error);
    this.orgCache = null;
  }

  async getSubscription() {
    const { orgId } = await this.org();
    const { data, error } = await this.sb.from('subscriptions').select('*').eq('org_id', orgId).maybeSingle();
    fail(error);
    if (!data) return null;
    return { tier: data.tier, status: data.status, currentPeriodEnd: data.current_period_end ?? null };
  }
}
