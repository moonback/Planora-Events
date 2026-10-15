import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, ErrorBanner, Field, formatDate, inputClass, PageHeader, Spinner } from '../components/ui';
import { useAsync } from '../components/useAsync';
import { repository } from '../persistence';
import { ROLE_LABELS, type Role } from '../persistence/repository';

const ROLES = Object.keys(ROLE_LABELS) as Role[];

export function Team() {
  const { data, error, loading, reload } = useAsync(() => repository.getTeam(), []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editeur');
  const [actionError, setActionError] = useState<unknown>(null);
  const [link, setLink] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(e);
    }
  };

  if (repository.mode === 'local') {
    return (
      <>
        <PageHeader title="Équipe et permissions" />
        <EmptyState title="Fonction disponible en mode cloud">
          Le mode local est mono-utilisateur. Configurez Supabase (voir README) pour inviter des membres avec les rôles Administrateur, Éditeur ou
          Lecteur. Les permissions sont alors appliquées par la base de données, pas seulement par l’interface.
        </EmptyState>
      </>
    );
  }
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBanner error={error} onRetry={reload} />;
  const admin = data.myRole === 'admin';

  return (
    <>
      <PageHeader title="Équipe et permissions" subtitle={`${data.orgName} · votre rôle : ${ROLE_LABELS[data.myRole]}`} />
      <ErrorBanner error={actionError} />
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Membres</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-1">E-mail</th>
              <th>Rôle</th>
              <th className="sr-only">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.members.map((m) => (
              <tr key={m.userId}>
                <td className="py-2">{m.email || m.userId}</td>
                <td>
                  {admin ? (
                    <select aria-label={`Rôle de ${m.email}`} className={`${inputClass} w-auto`} value={m.role} onChange={(e) => act(() => repository.updateMemberRole(m.userId, e.target.value as Role))}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    ROLE_LABELS[m.role]
                  )}
                </td>
                <td className="text-right">
                  {admin && (
                    <Button size="sm" variant="ghost" className="text-red-700" onClick={() => act(() => repository.removeMember(m.userId))}>
                      Retirer
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {admin && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Inviter un membre</h2>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const inv = await repository.invite(email, role);
                setLink(`${window.location.origin}/invitation/${inv.token}`);
                setEmail('');
              });
            }}
          >
            <Field label="E-mail">
              <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Rôle">
              <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit" variant="primary">
              Créer l’invitation
            </Button>
          </form>
          {link && (
            <p className="mt-3 rounded-md bg-slate-50 p-2 text-sm" role="status">
              Aucun e-mail n’est envoyé automatiquement : transmettez ce lien à la personne invitée (il ne fonctionne qu’avec son adresse) :{' '}
              <code className="break-all">{link}</code>
            </p>
          )}
          <h3 className="mb-2 mt-5 text-sm font-semibold">Invitations</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {data.invitations.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2">
                <span>
                  {i.email} — {ROLE_LABELS[i.role]} — {i.acceptedAt ? `acceptée le ${formatDate(i.acceptedAt)}` : `en attente depuis le ${formatDate(i.createdAt)}`}
                </span>
                {!i.acceptedAt && (
                  <Button size="sm" variant="ghost" onClick={() => act(() => repository.revokeInvitation(i.id))}>
                    Révoquer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function AcceptInvitation() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="max-w-md space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <h1 className="text-lg font-semibold">Rejoindre une organisation</h1>
      <p className="text-sm text-slate-600">Cette invitation n’est valable que pour l’adresse e-mail à laquelle elle a été émise.</p>
      <ErrorBanner error={error} />
      <Button
        variant="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await repository.acceptInvitation(token);
            navigate('/equipe');
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        Accepter l’invitation
      </Button>
    </div>
  );
}
