import type { Category, ObjectTemplate, Role, Shape, ZoneType } from './types';

type Def = [id: string, name: string, family: string, shape: Shape, role: Role, width: number, depth: number, seats: number, capacity: number, color: string];

const T = (category: Category, defs: Def[]): ObjectTemplate[] =>
  defs.map(([id, name, family, shape, role, width, depth, seats, capacity, color]) => ({
    id,
    name,
    category,
    family,
    shape,
    role,
    width,
    depth,
    seats,
    capacity,
    color,
    custom: false,
  }));

/** Catalogue fourni. Dimensions usuelles du marché de la location, en mm (à ajuster selon le loueur). */
export const BUILTIN_TEMPLATES: readonly ObjectTemplate[] = [
  ...T('mobilier', [
    ['table-ronde-120', 'Table ronde Ø120 (6 pl.)', 'Tables rondes', 'round', 'table', 1200, 1200, 0, 6, '#d6b98c'],
    ['table-ronde-150', 'Table ronde Ø150 (8 pl.)', 'Tables rondes', 'round', 'table', 1500, 1500, 0, 8, '#d6b98c'],
    ['table-ronde-180', 'Table ronde Ø180 (10 pl.)', 'Tables rondes', 'round', 'table', 1800, 1800, 0, 10, '#d6b98c'],
    ['table-rect-180', 'Table rectangulaire 180×80', 'Tables rectangulaires', 'rect', 'table', 1800, 800, 0, 6, '#d6b98c'],
    ['table-rect-240', 'Table rectangulaire 240×80', 'Tables rectangulaires', 'rect', 'table', 2400, 800, 0, 8, '#d6b98c'],
    ['table-carree-80', 'Table carrée 80×80', 'Tables carrées', 'rect', 'table', 800, 800, 0, 4, '#d6b98c'],
    ['table-carree-120', 'Table carrée 120×120', 'Tables carrées', 'rect', 'table', 1200, 1200, 0, 8, '#d6b98c'],
    ['mange-debout', 'Mange-debout Ø70', 'Mange-debout', 'round', 'table', 700, 700, 0, 0, '#c9a46c'],
    ['table-honneur', "Table d'honneur 600×80", "Tables d'honneur", 'rect', 'table', 6000, 800, 0, 10, '#b88a4a'],
    ['chaise', 'Chaise', 'Chaises', 'chair', 'siege', 450, 500, 1, 0, '#6b7280'],
    ['fauteuil', 'Fauteuil', 'Fauteuils', 'chair', 'siege', 750, 800, 1, 0, '#7c3aed'],
    ['canape', 'Canapé 3 places', 'Canapés', 'rect', 'siege', 2000, 900, 3, 0, '#7c3aed'],
    ['banquette', 'Banquette', 'Banquettes', 'rect', 'siege', 1800, 500, 3, 0, '#8b5cf6'],
    ['tabouret', 'Tabouret', 'Tabourets', 'round', 'siege', 400, 400, 1, 0, '#6b7280'],
    ['comptoir', 'Comptoir 200×60', 'Comptoirs', 'rect', 'service', 2000, 600, 0, 0, '#a16207'],
    ['buffet', 'Buffet 240×80', 'Buffets', 'rect', 'service', 2400, 800, 0, 0, '#ca8a04'],
    ['bar', 'Bar 300×80', 'Bars', 'rect', 'service', 3000, 800, 0, 0, '#92400e'],
  ]),
  ...T('scene', [
    ['scene-6x4', 'Scène 6×4 m', 'Scènes', 'stage', 'scene', 6000, 4000, 0, 0, '#1e293b'],
    ['scene-8x5', 'Scène 8×5 m', 'Scènes', 'stage', 'scene', 8000, 5000, 0, 0, '#1e293b'],
    ['praticable', 'Praticable 2×1 m', 'Praticables', 'stage', 'scene', 2000, 1000, 0, 0, '#334155'],
    ['estrade', 'Estrade 3×2 m', 'Estrades', 'stage', 'scene', 3000, 2000, 0, 0, '#334155'],
    ['pupitre', 'Pupitre', 'Pupitres', 'rect', 'technique', 600, 500, 0, 0, '#475569'],
  ]),
  ...T('audiovisuel', [
    ['ecran-3m', 'Écran 3 m', 'Écrans', 'screen', 'technique', 3000, 300, 0, 0, '#0f172a'],
    ['ecran-5m', 'Écran 5 m', 'Écrans', 'screen', 'technique', 5000, 400, 0, 0, '#0f172a'],
    ['videoprojecteur', 'Vidéoprojecteur', 'Vidéoprojecteurs', 'rect', 'suspendu', 500, 400, 0, 0, '#0369a1'],
    ['enceinte', 'Enceinte', 'Enceintes', 'speaker', 'technique', 500, 500, 0, 0, '#111827'],
    ['caisson', 'Caisson de basses', 'Caissons de basses', 'speaker', 'technique', 700, 700, 0, 0, '#111827'],
    ['console-son', 'Console son', 'Consoles son', 'rect', 'technique', 1500, 800, 0, 0, '#0e7490'],
    ['console-lumiere', 'Console lumière', 'Consoles lumière', 'rect', 'technique', 1200, 800, 0, 0, '#a21caf'],
    ['projecteur', 'Projecteur', 'Projecteurs', 'round', 'suspendu', 400, 400, 0, 0, '#eab308'],
    ['structure', 'Structure alu 3 m', 'Structures', 'rect', 'suspendu', 3000, 300, 0, 0, '#9ca3af'],
    ['point-accroche', "Point d'accroche", "Points d'accroche", 'round', 'suspendu', 300, 300, 0, 0, '#ef4444'],
    ['regie', 'Régie technique 3×2 m', 'Régies', 'rect', 'technique', 3000, 2000, 0, 0, '#0e7490'],
  ]),
  ...T('exposition', [
    ['stand-3x3', 'Stand 3×3 m', 'Stands', 'stand', 'stand', 3000, 3000, 0, 0, '#2563eb'],
    ['stand-3x2', 'Stand 3×2 m', 'Stands', 'stand', 'stand', 3000, 2000, 0, 0, '#2563eb'],
    ['cloison', 'Cloison 1 m', 'Cloisons', 'rect', 'cloison', 1000, 50, 0, 0, '#64748b'],
    ['comptoir-expo', "Comptoir d'exposition", "Comptoirs d'exposition", 'rect', 'service', 1000, 500, 0, 0, '#1d4ed8'],
    ['presentoir', 'Présentoir', 'Présentoirs', 'rect', 'obstacle', 600, 400, 0, 0, '#3b82f6'],
    ['totem', 'Totem', 'Totems', 'rect', 'obstacle', 500, 500, 0, 0, '#1e40af'],
    ['espace-exposant', 'Espace exposant 6×3 m', 'Espaces exposants', 'stand', 'stand', 6000, 3000, 0, 0, '#60a5fa'],
  ]),
  ...T('logistique', [
    ['vestiaire', 'Vestiaire (portant 3 m)', 'Vestiaires', 'rect', 'service', 3000, 600, 0, 0, '#0f766e'],
    ['accueil', "Banque d'accueil", 'Accueil', 'rect', 'service', 2000, 700, 0, 0, '#0d9488'],
    ['stockage', 'Espace de stockage 3×3 m', 'Stockage', 'rect', 'obstacle', 3000, 3000, 0, 0, '#78716c'],
    ['frigo', 'Réfrigérateur', 'Frigos', 'rect', 'obstacle', 700, 700, 0, 0, '#94a3b8'],
  ]),
  ...T('structure', [
    ['porte', 'Porte 90 cm', 'Portes', 'door', 'ouverture', 900, 100, 0, 0, '#92400e'],
    ['porte-double', 'Porte double 180 cm', 'Portes', 'door', 'ouverture', 1800, 100, 0, 0, '#92400e'],
    ['issue-secours', 'Issue de secours 140 cm', 'Issues de secours', 'door', 'issue', 1400, 100, 0, 0, '#16a34a'],
    ['fenetre', 'Fenêtre 120 cm', 'Fenêtres', 'window', 'ouverture', 1200, 100, 0, 0, '#38bdf8'],
    ['poteau', 'Poteau 40×40', 'Poteaux', 'column', 'obstacle', 400, 400, 0, 0, '#374151'],
  ]),
];

export interface ZonePreset {
  id: string;
  name: string;
  type: ZoneType;
  width: number;
  depth: number;
  color: string;
}

export const ZONE_PRESETS: readonly ZonePreset[] = [
  { id: 'zone-circulation', name: 'Circulation', type: 'circulation', width: 2000, depth: 6000, color: '#22c55e' },
  { id: 'zone-interdite', name: 'Zone interdite', type: 'interdite', width: 3000, depth: 3000, color: '#ef4444' },
  { id: 'zone-personnel', name: 'Zone personnel', type: 'personnel', width: 4000, depth: 3000, color: '#f97316' },
  { id: 'zone-piste', name: 'Piste de danse', type: 'piste', width: 6000, depth: 6000, color: '#a855f7' },
  { id: 'zone-traiteur', name: 'Zone traiteur', type: 'traiteur', width: 5000, depth: 3000, color: '#eab308' },
  { id: 'zone-technique', name: 'Espace technique', type: 'technique', width: 4000, depth: 3000, color: '#06b6d4' },
  { id: 'zone-reservee', name: 'Zone réservée', type: 'reservee', width: 4000, depth: 3000, color: '#64748b' },
];

export const CATEGORY_LABELS: Record<Category, string> = {
  mobilier: 'Mobilier',
  scene: 'Scène',
  audiovisuel: 'Audiovisuel',
  exposition: 'Exposition',
  logistique: 'Logistique',
  structure: 'Structure de la salle',
  personnalise: 'Mes modèles',
};

export const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  libre: 'Zone',
  circulation: 'Circulation',
  interdite: 'Zone interdite',
  personnel: 'Personnel',
  piste: 'Piste de danse',
  traiteur: 'Traiteur',
  technique: 'Technique',
  reservee: 'Réservée',
  exposants: 'Exposants',
};

export const findTemplate = (id: string, custom: readonly ObjectTemplate[] = []): ObjectTemplate | undefined =>
  BUILTIN_TEMPLATES.find((t) => t.id === id) ?? custom.find((t) => t.id === id);
