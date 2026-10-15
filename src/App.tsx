import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { Projects } from './pages/Projects';
import { NewProject } from './pages/NewProject';
import { ProjectDetail } from './pages/ProjectDetail';
import { Catalog } from './pages/Catalog';
import { Exports } from './pages/Exports';
import { Team, AcceptInvitation } from './pages/Team';
import { Settings } from './pages/Settings';
import { Help } from './pages/Help';

// L'éditeur (Konva, jsPDF, pdf.js) est chargé à la demande pour alléger les autres pages.
const EditorPage = lazy(() => import('./editor/EditorPage'));
const PresentationPage = lazy(() => import('./editor/PresentationPage'));

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/connexion" element={<Login />} />
            <Route path="/editeur/:planId" element={<RequireAuth><EditorPage /></RequireAuth>} />
            <Route path="/presentation/:planId" element={<RequireAuth><PresentationPage /></RequireAuth>} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Dashboard />} />
              <Route path="projets" element={<Projects />} />
              <Route path="projets/nouveau" element={<NewProject />} />
              <Route path="projets/:projectId" element={<ProjectDetail />} />
              <Route path="catalogue" element={<Catalog />} />
              <Route path="exports" element={<Exports />} />
              <Route path="equipe" element={<Team />} />
              <Route path="invitation/:token" element={<AcceptInvitation />} />
              <Route path="parametres" element={<Settings />} />
              <Route path="aide" element={<Help />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
