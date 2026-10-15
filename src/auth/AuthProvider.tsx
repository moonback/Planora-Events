import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '../components/ui';
import { supabase } from '../persistence';

/**
 * Mode cloud : session Supabase réelle (jeton vérifié par le serveur à chaque requête, RLS).
 * Mode local : aucune authentification n'est simulée ; l'application est mono-utilisateur dans ce navigateur.
 */
interface AuthState {
  mode: 'local' | 'cloud';
  ready: boolean;
  session: Session | null;
  email: string | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

function client() {
  if (!supabase) throw new Error("L'authentification nécessite le mode cloud (variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY).");
  return supabase;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setReady(true));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    mode: supabase ? 'cloud' : 'local',
    ready,
    session,
    email: session?.user.email ?? null,
    async signIn(email, password) {
      const { error } = await client().auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Identifiants incorrects.' : error.message);
    },
    async signUp(email, password) {
      const { data, error } = await client().auth.signUp({ email, password });
      if (error) throw new Error(error.message);
      return { needsConfirmation: !data.session };
    },
    async resetPassword(email) {
      const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/parametres` });
      if (error) throw new Error(error.message);
    },
    async updatePassword(password) {
      const { error } = await client().auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      const { error } = await client().auth.signOut();
      if (error) throw new Error(error.message);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return v;
}

/** Protège les routes privées en mode cloud ; en mode local, tout est accessible (aucun compte). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (!auth.ready) return <Spinner />;
  if (auth.mode === 'cloud' && !auth.session) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
