import type {
  ExportRecord,
  FloorPlan,
  ObjectTemplate,
  PlanDocument,
  PlanRevision,
  Project,
  ProjectInput,
  RoomTemplate,
  RoomTemplateKind,
} from '../domain/types';

export type Role = 'admin' | 'editeur' | 'lecteur';

export const ROLE_LABELS: Record<Role, string> = { admin: 'Administrateur', editeur: 'Éditeur', lecteur: 'Lecteur' };

export interface Member {
  userId: string;
  email: string;
  role: Role;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  token: string;
  createdAt: string;
  acceptedAt: string | null;
}

export interface Team {
  orgId: string;
  orgName: string;
  myRole: Role;
  members: Member[];
  invitations: Invitation[];
}

export type Tier = 'gratuit' | 'pro' | 'equipe' | 'entreprise';
export interface Subscription {
  tier: Tier;
  status: 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: string | null;
}

export class ConflictError extends Error {
  readonly latest: FloorPlan | null;
  constructor(latest: FloorPlan | null) {
    super('Le plan a été modifié ailleurs (autre onglet ou autre utilisateur) depuis son ouverture.');
    this.name = 'ConflictError';
    this.latest = latest;
  }
}
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} introuvable.`);
    this.name = 'NotFoundError';
  }
}
export class PermissionError extends Error {
  constructor(message = "Vous n'avez pas les droits nécessaires pour cette action.") {
    super(message);
    this.name = 'PermissionError';
  }
}

export type ProjectPatch = Partial<ProjectInput> & { favorite?: boolean; archived?: boolean };

/**
 * Contrat de persistance. Deux implémentations :
 * - LocalRepository : IndexedDB du navigateur, mono-utilisateur, sans synchronisation ;
 * - SupabaseRepository : PostgreSQL + Auth Supabase, permissions appliquées côté serveur (RLS).
 */
export interface Repository {
  readonly mode: 'local' | 'cloud';

  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project>;
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(id: string, patch: ProjectPatch): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  duplicateProject(id: string): Promise<Project>;

  listPlans(projectId: string): Promise<FloorPlan[]>;
  listAllPlans(): Promise<FloorPlan[]>;
  getPlan(id: string): Promise<FloorPlan>;
  createPlan(projectId: string, name: string, document: PlanDocument): Promise<FloorPlan>;
  /** Sauvegarde conditionnelle : lève ConflictError si la révision en base diffère de `expectedRevision`. */
  savePlan(id: string, document: PlanDocument, expectedRevision: number): Promise<FloorPlan>;
  renamePlan(id: string, name: string): Promise<FloorPlan>;
  deletePlan(id: string): Promise<void>;

  listRevisions(planId: string): Promise<PlanRevision[]>;
  createRevision(planId: string, label: string): Promise<PlanRevision>;

  listObjectTemplates(): Promise<ObjectTemplate[]>;
  saveObjectTemplate(t: ObjectTemplate): Promise<ObjectTemplate>;
  deleteObjectTemplate(id: string): Promise<void>;

  listRoomTemplates(): Promise<RoomTemplate[]>;
  saveRoomTemplate(name: string, kind: RoomTemplateKind, document: PlanDocument): Promise<RoomTemplate>;
  deleteRoomTemplate(id: string): Promise<void>;

  recordExport(rec: Omit<ExportRecord, 'id' | 'createdAt'>): Promise<ExportRecord>;
  listExports(projectId?: string): Promise<ExportRecord[]>;

  getTeam(): Promise<Team | null>;
  invite(email: string, role: Role): Promise<Invitation>;
  updateMemberRole(userId: string, role: Role): Promise<void>;
  removeMember(userId: string): Promise<void>;
  revokeInvitation(id: string): Promise<void>;
  acceptInvitation(token: string): Promise<void>;

  /** Abonnement vérifié côté serveur ; null si aucun (ou en mode local). */
  getSubscription(): Promise<Subscription | null>;
}
