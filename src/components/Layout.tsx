import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { t } from '../i18n';

const NAV = [
  ['/', t('navDashboard')],
  ['/projets', t('navProjects')],
  ['/projets/nouveau', t('navNewProject')],
  ['/catalogue', t('navCatalog')],
  ['/exports', t('navExports')],
  ['/equipe', t('navTeam')],
  ['/parametres', t('navSettings')],
  ['/aide', t('navHelp')],
] as const;

export function Layout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    try {
      await auth.signOut();
      navigate('/connexion');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3 md:py-5">
          <NavLink to="/" className="text-lg font-bold tracking-tight text-brand-700">
            {t('appName')}
          </NavLink>
          <button type="button" className="rounded p-2 md:hidden" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen(!open)}>
            <span className="sr-only">Menu</span>☰
          </button>
        </div>
        <nav id="main-nav" aria-label="Navigation principale" className={`${open ? 'block' : 'hidden'} px-2 pb-3 md:block`}>
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/' || to === '/projets'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `block rounded-md px-3 py-2 text-sm ${isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              {label}
            </NavLink>
          ))}
          <div className="mt-4 border-t border-slate-200 px-3 pt-3 text-xs text-slate-500">
            {auth.mode === 'local' ? (
              <p title={t('localModeHint')}>
                <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">{t('localModeBadge')}</span>
                {t('localModeHint')}
              </p>
            ) : (
              <>
                <p className="truncate">
                  <span className="mr-1 rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">{t('cloudModeBadge')}</span>
                  {auth.email}
                </p>
                <button type="button" className="mt-2 text-brand-700 hover:underline" onClick={signOut}>
                  {t('signOut')}
                </button>
                {error && <p role="alert" className="text-red-600">{error}</p>}
              </>
            )}
          </div>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
