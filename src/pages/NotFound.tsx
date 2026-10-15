import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export function NotFound() {
  return (
    <EmptyState title="Page introuvable" action={<Link className="text-sm font-medium text-brand-700 hover:underline" to="/">Retour au tableau de bord</Link>}>
      L’adresse demandée n’existe pas ou plus.
    </EmptyState>
  );
}
