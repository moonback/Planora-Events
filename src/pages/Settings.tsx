import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { effectiveOffer, OFFERS } from '../billing/plans';
import { Button, ErrorBanner, Field, inputClass, PageHeader, Spinner } from '../components/ui';
import { useAsync } from '../components/useAsync';
import { repository } from '../persistence';

export function Settings() {
  const auth = useAuth();
  const sub = useAsync(() => repository.getSubscription(), []);
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const changePassword = async () => {
    setMsg(null);
    setError(null);
    try {
      if (password.length < 8) throw new Error('Au moins 8 caractères.');
      await auth.updatePassword(password);
      setPassword('');
      setMsg('Mot de passe modifié.');
    } catch (e) {
      setError(e);
    }
  };

  const offer = effectiveOffer(sub.data ?? null);
  return (
    <>
      <PageHeader title="Paramètres du compte" />
      <section className="mb-6 max-w-2xl rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold">Stockage des données</h2>
        {auth.mode === 'local' ? (
          <p>
            <strong>Mode local.</strong> Les projets sont stockés dans la base IndexedDB de ce navigateur. Ils ne sont ni sauvegardés sur un serveur, ni
            synchronisés entre appareils ; vider les données du site les supprime. Exportez vos plans (PDF, SVG, CSV) pour les archiver.
          </p>
        ) : (
          <p>
            <strong>Mode cloud (Supabase).</strong> Connecté en tant que {auth.email}. Les données sont enregistrées sur le serveur, et l’accès est
            contrôlé par les règles de sécurité de la base.
          </p>
        )}
      </section>

      {auth.mode === 'cloud' && (
        <section className="mb-6 max-w-2xl space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">Mot de passe</h2>
          <Field label="Nouveau mot de passe">
            <input type="password" autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorBanner error={error} />
          {msg && <p role="status" className="text-emerald-700">{msg}</p>}
          <Button variant="primary" onClick={changePassword}>
            Modifier le mot de passe
          </Button>
        </section>
      )}

      <section className="max-w-4xl rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold">Abonnement</h2>
        {sub.loading ? (
          <Spinner />
        ) : sub.error ? (
          <ErrorBanner error={sub.error} onRetry={sub.reload} />
        ) : auth.mode === 'local' ? (
          <p className="text-slate-600">Aucun abonnement en mode local. Les offres ci-dessous sont indicatives ; le paiement n’est pas encore intégré.</p>
        ) : (
          <p className="text-slate-600">
            Offre appliquée : <strong>{offer.name}</strong>
            {sub.data ? ` (statut serveur : ${sub.data.status})` : ' (aucun abonnement enregistré côté serveur)'}. Le paiement en ligne n’est pas encore
            intégré.
          </p>
        )}
        <ul className="mt-4 grid gap-3 md:grid-cols-4">
          {OFFERS.map((o) => (
            <li key={o.tier} className={`rounded-lg border p-3 ${auth.mode === 'cloud' && o.tier === offer.tier ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
              <p className="font-semibold">{o.name}</p>
              <p className="text-xs text-slate-500">
                {o.maxProjects === null ? 'Projets illimités' : `${o.maxProjects} projets`} ·{' '}
                {o.maxExportsPerMonth === null ? 'exports illimités' : `${o.maxExportsPerMonth} exports/mois`}
              </p>
              <ul className="mt-2 list-disc pl-4 text-xs text-slate-600">
                {o.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
