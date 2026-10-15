import { PageHeader } from '../components/ui';

const SHORTCUTS: [string, string][] = [
  ['V', 'Outil sélection'],
  ['H (ou Espace maintenu)', 'Déplacer la vue'],
  ['W', 'Dessiner les murs de la salle'],
  ['Z', 'Dessiner une zone'],
  ['M', 'Mesurer / coter'],
  ['T', 'Annotation'],
  ['Ctrl+Z / Ctrl+Y (ou Ctrl+Maj+Z)', 'Annuler / rétablir'],
  ['Ctrl+C / Ctrl+V', 'Copier / coller'],
  ['Ctrl+D', 'Dupliquer'],
  ['Ctrl+G / Ctrl+Maj+G', 'Grouper / dégrouper'],
  ['Ctrl+A', 'Tout sélectionner'],
  ['Ctrl+S', 'Enregistrer immédiatement'],
  ['Suppr / Retour arrière', 'Supprimer la sélection'],
  ['Flèches (Maj : ×10)', 'Déplacer de 10 mm (100 mm)'],
  ['R / Maj+R', 'Pivoter de +15° / −15°'],
  ['L', 'Verrouiller / déverrouiller'],
  ['+ / − / 0', 'Zoom avant / arrière / adapter à l’écran'],
  ['Entrée / Échap', 'Terminer / annuler un tracé'],
];

export function Help() {
  return (
    <>
      <PageHeader title="Aide et documentation" />
      <div className="grid max-w-5xl gap-6 text-sm leading-relaxed text-slate-700 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-slate-900">Démarrer</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Créez un projet et indiquez les dimensions de la salle (en mètres).</li>
            <li>Dans l’éditeur, placez portes, issues de secours et poteaux (catégorie « Structure de la salle »).</li>
            <li>Glissez le mobilier depuis la bibliothèque, ou utilisez « Implantation auto » / « Assistant ».</li>
            <li>Corrigez les problèmes signalés dans l’onglet « Contrôles ».</li>
            <li>Créez une version nommée, puis exportez le PDF pour les équipes terrain.</li>
          </ol>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-slate-900">Unités et précision</h2>
          <p>
            Toutes les dimensions sont stockées en millimètres. L’affichage (mm, cm, m) se règle dans « Paramètres du plan ». Les positions et dimensions
            peuvent être saisies précisément dans le panneau de propriétés. Les PDF indiquent une échelle normalisée (1:50, 1:100…) uniquement lorsque le
            plan tient sur la page à cette échelle ; sinon, le plan est déclaré « ajusté à la page ».
          </p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-slate-900">Contrôles du plan</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Erreur géométrique</strong> : chevauchement, objet hors salle, contour invalide, objet dans une zone interdite.</li>
            <li><strong>Avertissement configurable</strong> : distances minimales, dégagement des portes, circulations interrompues. Il peut être accepté.</li>
            <li><strong>Exigence réglementaire</strong> : la conformité ERP, incendie et accessibilité n’est jamais vérifiée par l’application et doit être validée par un professionnel qualifié.</li>
            <li><strong>Point non vérifié</strong> : information absente du plan (par exemple, aucune issue de secours placée).</li>
          </ul>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-slate-900">Plan de référence</h2>
          <p>
            Importez une image ou un PDF (première page) comme fond. Utilisez « Étalonner » : cliquez sur deux points dont vous connaissez la distance réelle, puis
            saisissez cette distance. Le fond reste une référence visuelle : aucun mur n’est reconstruit automatiquement.
          </p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-2 font-semibold text-slate-900">Raccourcis clavier de l’éditeur</h2>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-1">
                <dt>
                  <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
