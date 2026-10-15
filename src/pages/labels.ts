import type { EventType } from '../domain/types';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  banquet: 'Banquet / dîner',
  conference: 'Conférence',
  salon: 'Salon / exposition',
  concert: 'Concert / soirée',
  autre: 'Autre',
};

export const formatEventDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date non définie';

export const todayIso = () => new Date().toISOString().slice(0, 10);
