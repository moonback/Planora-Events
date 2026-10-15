import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button, ErrorBanner, Field, inputClass } from '../components/ui';

type Mode = 'connexion' | 'inscription' | 'oubli';

export function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [mode, setMode] = useState<Mode>('connexion');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (auth.mode === 'local') {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-xl bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">Mode local</h1>
        <p className="mt-2 text-sm text-slate-600">
          Aucun service d'authentification n'est configuré. Planora Events fonctionne en mode local : vos projets sont enregistrés dans ce
          navigateur uniquement, sans compte ni synchronisation. Pour activer les comptes, renseignez <code>VITE_SUPABASE_URL</code> et{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (voir README).
        </p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
          Continuer en mode local →
        </Link>
      </div>
    );
  }
  if (auth.session) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'connexion') {
        await auth.signIn(email, password);
        navigate(from, { replace: true });
      } else if (mode === 'inscription') {
        if (password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
        const r = await auth.signUp(email, password);
        if (r.needsConfirmation) setInfo('Compte créé. Confirmez votre adresse via le lien reçu par e-mail, puis connectez-vous.');
        else navigate('/', { replace: true });
      } else {
        await auth.resetPassword(email);
        setInfo('Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé.');
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, string> = { connexion: 'Connexion', inscription: 'Créer un compte', oubli: 'Mot de passe oublié' };
  const link = (m: Mode, label: string) =>
    mode !== m && (
      <button type="button" className="text-brand-700 hover:underline" onClick={() => setMode(m)}>
        {label}
      </button>
    );
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow">
        <p className="text-lg font-bold text-brand-700">Planora Events</p>
        <h1 className="text-xl font-semibold">{titles[mode]}</h1>
        <ErrorBanner error={error} />
        {info && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            {info}
          </p>
        )}
        <Field label="Adresse e-mail">
          <input className={inputClass} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {mode !== 'oubli' && (
          <Field label="Mot de passe">
            <input
              className={inputClass}
              type="password"
              required
              minLength={mode === 'inscription' ? 8 : undefined}
              autoComplete={mode === 'inscription' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'Veuillez patienter…' : titles[mode]}
        </Button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          {link('connexion', 'Se connecter')}
          {link('inscription', 'Créer un compte')}
          {link('oubli', 'Mot de passe oublié')}
        </div>
      </form>
    </div>
  );
}
