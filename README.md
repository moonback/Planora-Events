# Planora Events

Application web de création de plans de salle et d’implantation événementielle : salle aux dimensions réelles, mobilier et matériel, placement automatique, contrôles géométriques, nomenclatures, versions et exports PDF / SVG / PNG / CSV.

Interface en français. Unité interne : le **millimètre**.

## Démarrage rapide

Prérequis : Node.js 20 ou plus récent (testé avec Node 24) et npm.

```bash
npm install
npm run dev
```

Ouvrir http://localhost:5173.

- **Sans fichier `.env`** (ou avec des variables vides), l’application démarre en **mode local** : les données sont enregistrées dans IndexedDB, dans ce navigateur uniquement. Il n’y a ni compte, ni synchronisation, ni partage, et l’interface l’indique.
- **Avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`** renseignées dans `.env`, l’application passe en **mode cloud** : comptes Supabase, base PostgreSQL et permissions appliquées par la base (RLS).
- `npm run dev:local` force le mode local même si `.env` contient une configuration Supabase (fichier `.env.demo`).

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement (port 5173) |
| `npm run dev:local` | Idem, en forçant le mode local |
| `npm run typecheck` | Vérification TypeScript (strict) |
| `npm run lint` | ESLint |
| `npm test` | Tests unitaires et d’intégration (Vitest), y compris les tests RLS sur PostgreSQL (PGlite) |
| `npm run build` | Typage puis build de production dans `dist/` |
| `npm run preview` | Sert le build de production |
| `npm run test:e2e` | Tests de bout en bout Playwright (lancent eux-mêmes un serveur en mode local sur le port 5175) |

Avant le premier `npm run test:e2e` : `npx playwright install chromium`.

## Architecture

```
src/
  domain/            Cœur métier, sans React ni rendu (testable seul)
    types.ts         Schémas Zod : document de plan, objets, zones, projet…
    geometry.ts      Rotations exactes, polygones, inclusion, collisions (axes séparateurs), distances, balayage spatial
    units.ts         Conversions mm / cm / m, saisie « 3,5 »
    catalog.ts       Bibliothèque fournie (~50 modèles) et zones prédéfinies
    validation.ts    Contrôles du plan (erreurs, avertissements, points réglementaires non vérifiés)
    bom.ts           Capacités, quantités, nomenclature, tables nécessaires
    operations.ts    Déplacer, pivoter, aligner, distribuer, grouper, verrouiller, ordre d’affichage…
    history.ts       Annuler / rétablir par instantanés immuables
    diff.ts          Comparaison de versions
    layout/          Placement automatique (banquet, conférence, salon, concert)
  persistence/       Contrat Repository + LocalRepository (IndexedDB) + SupabaseRepository
  export/            Liste de dessin commune → SVG, PDF (jsPDF, vectoriel), PNG ; CSV ; import de catalogue CSV
  ai/assistant.ts    Assistant en langage naturel (analyse locale par règles → proposition validée par Zod)
  editor/            Éditeur 2D (Konva) : store Zustand, canvas, panneaux, dialogues
  pages/             Tableau de bord, projets, catalogue, exports, équipe, paramètres, aide, connexion
  auth/              Session Supabase et protection des routes (mode cloud)
  billing/           Offres (abstraction, sans paiement)
  i18n/              Dictionnaire de libellés (fr)
supabase/
  migrations/        Schéma PostgreSQL, contraintes, index, RLS
  tests/             Tests des politiques RLS sur la vraie migration (PGlite)
e2e/                 Parcours Playwright
```

**Choix techniques**

- **Vite + React 19 + TypeScript strict**, **Tailwind CSS 4**. Pas de bibliothèque de composants supplémentaire : les contrôles natifs (`<dialog>`, `<select>`, `<button>`) sont accessibles par défaut.
- **Konva / react-konva** pour le canvas. La vue (zoom, déplacement) est une transformation de la scène : les nœuds sont positionnés directement en millimètres. Les épaisseurs de trait sont indépendantes du zoom (`strokeScaleEnabled=false`).
- **Moteur géométrique indépendant de React**. Les objets ronds sont des polygones à 32 côtés ; les collisions utilisent le théorème des axes séparateurs, avec un pré-filtrage par balayage trié qui évite le O(n²) sur des centaines d’objets. Les rotations à 90°, 180° et 270° sont calculées sans erreur d’arrondi.
- **Document de plan unique en JSON** validé par Zod à chaque chargement et enregistrement : un document corrompu est refusé, jamais chargé partiellement. Les sauvegardes sont atomiques et les versions sont des instantanés.
- **Concurrence optimiste** : chaque plan porte un numéro de révision. Une sauvegarde concurrente (autre onglet, autre utilisateur) est refusée explicitement, et l’utilisateur choisit entre recharger la version distante et écraser.
- **Exports générés à partir des données métier** : une même liste de primitives vectorielles alimente le SVG et le PDF. Le PNG est rastérisé depuis ce SVG ; ce n’est pas une capture d’écran.
- **Supabase** comme backend (PostgreSQL + Auth). Aucun serveur Node dédié n’a été nécessaire : les autorisations sont appliquées dans la base par RLS.

## Modèle de données (mode cloud)

Migration : `supabase/migrations/20261016000000_init.sql`.

| Table | Contenu |
| --- | --- |
| `organizations`, `profiles`, `organization_members` | Espaces de travail, profils, rôles `admin` / `editeur` / `lecteur` |
| `invitations` | Invitations par e-mail, avec jeton à usage unique, valables uniquement pour l’adresse invitée |
| `projects` | Projet : client, événement, date, invités, notes, favori, archivé |
| `floor_plans` | Plans : document jsonb et `revision` (concurrence optimiste) |
| `plan_revisions` | Versions nommées (instantanés) |
| `object_templates`, `room_templates` | Modèles de mobilier, de salle et d’implantation |
| `exports` | Historique des documents générés |
| `subscriptions` | Abonnement, en écriture réservée au serveur (aucune politique d’écriture client) |

- À l’inscription, un déclencheur crée le profil et un espace personnel dont l’utilisateur est administrateur.
- **Suppression** : un projet supprime en cascade ses plans, versions et exports ; une organisation supprime tout son contenu.
- **RLS** : lecture réservée aux membres, écriture aux administrateurs et éditeurs, suppression de projet aux administrateurs. Un déclencheur interdit de rattacher un plan à l’organisation d’un autre projet. Ces règles sont **testées** sur la vraie migration (`supabase/tests/rls.test.ts`).

### Configurer Supabase

1. Créer un projet Supabase.
2. Appliquer la migration, au choix avec `supabase link` puis `supabase db push`, ou en collant le fichier SQL dans l’éditeur SQL du tableau de bord.
3. Copier `.env.example` en `.env` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (clé publique « anon » uniquement : **jamais** la clé `service_role` côté frontend).
4. Dans Authentication → URL Configuration, ajouter l’URL de l’application (pour la confirmation d’e-mail et la réinitialisation du mot de passe).
5. Relancer `npm run dev`.

## Fonctionnalités terminées (vérifiées par tests ou dans le navigateur)

- **Projets** : création, modification, recherche, filtres (favoris, archivés, type), duplication (avec plans), archivage, suppression confirmée en cascade.
- **Plans** : plusieurs par projet ; renommage, duplication complète ou « salle seule », suppression confirmée.
- **Salle** : rectangle aux dimensions saisies, contour polygonal dessiné à l’outil « Murs » ou saisi sommet par sommet, ajout ou suppression de sommets, épaisseur des murs, refus des contours auto-sécants, portes, issues de secours, fenêtres, poteaux, zones.
- **Éditeur 2D** : bibliothèque (recherche, catégories, favoris, mes modèles, glisser-déposer ou clic), sélection simple, multiple et par zone, déplacement, rotation (poignée avec crans de 45° ou touche R), redimensionnement, saisie précise des positions et dimensions, duplication, copier-coller, suppression, alignements, distribution, groupes, verrouillage, ordre d’affichage, grille magnétique, guides d’alignement, zoom et panoramique, annuler / rétablir, raccourcis clavier, cotes (outil Mesure), annotations, zones (dessinées ou prédéfinies).
- **Fond de plan** : image ou PDF (première page rendue par pdf.js), transparence, verrouillage, étalonnage par deux points et une distance réelle. Le fond reste une référence visuelle : aucun mur n’est reconstruit automatiquement.
- **Placement automatique** : banquet (tables rondes ou rectangulaires, chaises, table d’honneur, buffets, piste, scène), conférence (rangées, allée centrale et transversales, rangs réservés, écrans, régie), salon (stands numérotés, allées), concert (scène, piste, régie, bar, espace technique, mange-debout). Les générateurs respectent la structure existante, les zones interdites et le dégagement des portes. Si toutes les places ne tiennent pas, un **diagnostic explicite** est affiché, et le résultat est prévisualisé avant d’être appliqué comme une étape annulable.
- **Validation** : chevauchements, dépassements de la salle, portes obstruées, circulations interrompues, zones interdites, distances minimales configurées, dimensions incohérentes, contours invalides. Chaque problème porte un type (erreur géométrique, avertissement configurable, exigence réglementaire, point non vérifié), une gravité, les objets concernés, une suggestion et un état (ouvert ou accepté). Les problèmes sont visibles sur le plan : objets en rouge, marqueurs, bouton « Afficher sur le plan ».
- **Calculs** : places assises, capacité des tables, tables, chaises, surfaces de salle et de zones, quantités par catégorie et par zone, nombre de tables nécessaires, objectif d’invités du projet.
- **Sauvegarde** : autosave après 1,2 s d’inactivité et Ctrl+S. « Enregistré » ne s’affiche qu’après confirmation du stockage. Les erreurs (avec bouton Réessayer) et les conflits de version sont gérés explicitement, et l’application avertit avant de quitter avec des modifications non enregistrées.
- **Versions** : création nommée, liste, comparaison avec l’état courant (ajouts, suppressions, déplacements, redimensionnements), restauration (annulable dans l’éditeur).
- **Exports** : PDF vectoriel A3 ou A4 (plan général, mobilier, technique, stands, coté), avec cartouche (projet, plan, date, numéro de version, salle), légende, barre d’échelle et page de nomenclature et zones. Une échelle normalisée (1:50, 1:100…) n’est indiquée **que si elle est réellement respectée**. Également : SVG en millimètres réels, PNG (vue complète ou sélection), CSV de nomenclature et CSV détaillé des objets (identifiants, positions, rotations, zones). Chaque export est historisé.
- **Catalogue** : bibliothèque fournie, modèles personnalisés (création, modification, suppression), import CSV validé ligne par ligne, modèles de salle et d’implantation.
- **Assistant** : description en français → proposition structurée (validée par schéma) → aperçu contrôlé géométriquement → application annulable.
- **Mode présentation** : vue client en lecture seule.
- **Authentification (mode cloud)** : inscription, connexion, déconnexion, réinitialisation et changement de mot de passe, routes protégées, organisations isolées, rôles (lecteur = interface en lecture seule et écriture refusée par la base), invitations.

## Fonctionnalités partielles

- **Mode cloud** : code complet et politiques RLS testées sur PostgreSQL (PGlite). En revanche, l’intégration avec une **instance Supabase réelle** (Auth, PostgREST) n’a pas été exécutée dans cet environnement.
- **Équipe** : une seule organisation active par utilisateur (la première dont il est membre). Les invitations produisent un lien à transmettre : **aucun e-mail n’est envoyé** automatiquement.
- **Partage en lecture seule** : par invitation avec le rôle Lecteur. Il n’existe pas de lien public anonyme.
- **Offres et abonnements** : abstraction et affichage. L’abonnement n’est lu que depuis le serveur, aucun paiement n’est intégré et les limites de l’offre gratuite ne sont pas appliquées.
- **Internationalisation** : architecture en place (`src/i18n`), mais seuls la navigation et les libellés communs passent par le dictionnaire ; les autres chaînes restent à migrer avant d’ajouter une langue.
- **Tablette** : consultation, présentation et pages de gestion utilisables. L’édition est optimisée pour le bureau (la bibliothèque est masquée sous 1024 px de large).
- **Rotation multiple par la poignée** : prise en charge ; le redimensionnement à la poignée est limité à un seul objet à la fois.

## Non réalisé

- Aperçu 3D, collaboration en temps réel.
- Reconstruction vectorielle d’un plan à partir d’un PDF importé (non prévue : le PDF reste une référence visuelle).
- Export XLSX (le CSV s’ouvre directement dans Excel : séparateur « ; », UTF-8 avec BOM).
- Pièces jointes de projet (documents arbitraires) ; seul l’historique des exports est conservé.
- Tarifs dans le catalogue de matériel.
- Assistant fondé sur un modèle de langage : l’analyse actuelle est locale, par règles. Un fournisseur pourra être branché en produisant le même objet validé par `ProposalSchema`.

## Limites connues et précautions

- **Conformité réglementaire** : l’application **ne vérifie pas** la réglementation ERP, la sécurité incendie, l’évacuation ni l’accessibilité. Ce point est signalé en permanence dans les contrôles et dans les PDF. Les distances de contrôle sont des paramètres configurables, pas des valeurs réglementaires.
- **Mode local** : les données dépendent du navigateur ; vider les données du site les supprime. Exportez régulièrement vos plans.
- Le placement automatique est glouton (balayage) : il donne une proposition valide sans chevaucher les obstacles, mais pas une disposition optimale. Une génération de banquet prend jusqu’à environ 1 s sur une grande salle.
- Le bundle principal dépasse 500 ko (supabase-js) ; l’éditeur, jsPDF et pdf.js sont chargés à la demande.
- Fonds de plan limités à 15 Mo ; ils sont stockés dans le document du plan (en data URL).
