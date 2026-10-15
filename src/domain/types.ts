import { z } from 'zod';

/** Toutes les longueurs métier sont en millimètres ; les angles en degrés (sens horaire, repère écran). */

export const MAX_LENGTH_MM = 500_000; // 500 m : au-delà, la saisie est considérée comme erronée

const finite = z.number().refine(Number.isFinite, 'Nombre invalide');
const length = finite.refine((v) => v > 0 && v <= MAX_LENGTH_MM, 'Dimension hors limites');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const PointSchema = z.object({ x: finite, y: finite });
export type Point = z.infer<typeof PointSchema>;

export const CATEGORIES = ['mobilier', 'scene', 'audiovisuel', 'exposition', 'logistique', 'structure', 'personnalise'] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

/** Forme de rendu 2D (le moteur ne dépend que de la boîte orientée width × depth). */
export const SHAPES = ['rect', 'round', 'chair', 'stage', 'door', 'window', 'column', 'screen', 'speaker', 'stand'] as const;
export const ShapeSchema = z.enum(SHAPES);
export type Shape = z.infer<typeof ShapeSchema>;

/** Rôle fonctionnel utilisé par la validation et les nomenclatures. */
export const ROLES = ['table', 'siege', 'scene', 'technique', 'stand', 'ouverture', 'issue', 'obstacle', 'service', 'cloison', 'suspendu', 'autre'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const ObjectTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  category: CategorySchema,
  family: z.string().min(1).max(60),
  shape: ShapeSchema,
  role: RoleSchema,
  width: length,
  depth: length,
  seats: z.number().int().min(0).max(1000),
  capacity: z.number().int().min(0).max(1000),
  color,
  custom: z.boolean(),
});
export type ObjectTemplate = z.infer<typeof ObjectTemplateSchema>;

export const PlanObjectSchema = z.object({
  id: z.string().min(1),
  templateId: z.string(),
  name: z.string().max(120),
  category: CategorySchema,
  shape: ShapeSchema,
  role: RoleSchema,
  /** Centre de l'objet, en mm. */
  x: finite,
  y: finite,
  width: length,
  depth: length,
  rotation: finite,
  /** Nombre de personnes assises sur l'objet (chaise = 1, canapé = 3…). */
  seats: z.number().int().min(0).max(1000),
  /** Capacité d'accueil d'une table (places autour). */
  capacity: z.number().int().min(0).max(1000),
  color,
  label: z.string().max(60),
  locked: z.boolean(),
  groupId: z.string().nullable(),
});
export type PlanObject = z.infer<typeof PlanObjectSchema>;

export const ZONE_TYPES = ['libre', 'circulation', 'interdite', 'personnel', 'piste', 'traiteur', 'technique', 'reservee', 'exposants'] as const;
export const ZoneTypeSchema = z.enum(ZONE_TYPES);
export type ZoneType = z.infer<typeof ZoneTypeSchema>;

export const ZoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(120),
  type: ZoneTypeSchema,
  points: z.array(PointSchema).min(3),
  color,
});
export type Zone = z.infer<typeof ZoneSchema>;

export const AnnotationSchema = z.object({
  id: z.string().min(1),
  x: finite,
  y: finite,
  text: z.string().min(1).max(500),
  fontSize: z.number().min(50).max(5000),
  color,
});
export type Annotation = z.infer<typeof AnnotationSchema>;

export const DimensionSchema = z.object({ id: z.string().min(1), a: PointSchema, b: PointSchema });
export type Dimension = z.infer<typeof DimensionSchema>;

export const BackgroundSchema = z.object({
  dataUrl: z.string().startsWith('data:image/'),
  sourceName: z.string().max(200),
  /** Coin haut-gauche en mm. */
  x: finite,
  y: finite,
  /** Millimètres par pixel de l'image. */
  mmPerPx: finite.refine((v) => v > 0, 'Échelle invalide'),
  pixelWidth: z.number().int().positive(),
  pixelHeight: z.number().int().positive(),
  opacity: z.number().min(0).max(1),
  locked: z.boolean(),
  visible: z.boolean(),
});
export type Background = z.infer<typeof BackgroundSchema>;

export const UNITS = ['mm', 'cm', 'm'] as const;
export const UnitSchema = z.enum(UNITS);
export type Unit = z.infer<typeof UnitSchema>;

export const PlanSettingsSchema = z.object({
  gridSize: z.number().min(10).max(10_000),
  snap: z.boolean(),
  showGrid: z.boolean(),
  displayUnit: UnitSchema,
  /** Distance minimale configurée entre éléments de mobilier (hors sièges). */
  minClearance: z.number().min(0).max(20_000),
  /** Profondeur dégagée exigée devant une porte / issue. */
  doorClearance: z.number().min(0).max(20_000),
});
export type PlanSettings = z.infer<typeof PlanSettingsSchema>;

export const RoomSchema = z.object({
  name: z.string().max(120),
  /** Contour intérieur de la salle (polygone simple), en mm. */
  outline: z.array(PointSchema).min(3),
  wallThickness: z.number().min(0).max(2000),
});
export type Room = z.infer<typeof RoomSchema>;

export const PLAN_SCHEMA_VERSION = 1;

export const PlanDocumentSchema = z.object({
  schemaVersion: z.literal(PLAN_SCHEMA_VERSION),
  room: RoomSchema,
  objects: z.array(PlanObjectSchema),
  zones: z.array(ZoneSchema),
  annotations: z.array(AnnotationSchema),
  dimensions: z.array(DimensionSchema),
  background: BackgroundSchema.nullable(),
  settings: PlanSettingsSchema,
  /** Identifiants d'avertissements explicitement acceptés par l'utilisateur. */
  acknowledgedIssues: z.array(z.string()),
});
export type PlanDocument = z.infer<typeof PlanDocumentSchema>;

export const EVENT_TYPES = ['banquet', 'conference', 'salon', 'concert', 'autre'] as const;
export const EventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventTypeSchema>;

export const ProjectInputSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(120),
  client: z.string().trim().max(120).default(''),
  eventName: z.string().trim().max(120).default(''),
  eventType: EventTypeSchema.default('autre'),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').nullable().default(null),
  guestCount: z.number().int().min(0).max(100_000).nullable().default(null),
  notes: z.string().max(10_000).default(''),
});
export type ProjectInput = z.input<typeof ProjectInputSchema>;

export interface Project {
  id: string;
  name: string;
  client: string;
  eventName: string;
  eventType: EventType;
  eventDate: string | null;
  guestCount: number | null;
  notes: string;
  favorite: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FloorPlan {
  id: string;
  projectId: string;
  name: string;
  document: PlanDocument;
  /** Incrémenté à chaque sauvegarde : contrôle de concurrence optimiste. */
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanRevision {
  id: string;
  planId: string;
  number: number;
  label: string;
  document: PlanDocument;
  createdAt: string;
}

export type RoomTemplateKind = 'salle' | 'implantation';
export interface RoomTemplate {
  id: string;
  name: string;
  kind: RoomTemplateKind;
  document: PlanDocument;
  createdAt: string;
}

export type ExportFormat = 'pdf' | 'svg' | 'png' | 'csv';
export interface ExportRecord {
  id: string;
  projectId: string;
  planId: string;
  format: ExportFormat;
  variant: string;
  revision: number;
  fileName: string;
  createdAt: string;
}
