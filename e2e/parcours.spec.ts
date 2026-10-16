import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/** Saisit une valeur dans un champ numérique du panneau de propriétés et la valide. */
async function setNumber(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press('Enter');
}

/** Retire le focus des champs pour que les raccourcis clavier de l'éditeur s'appliquent. */
const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

async function addFromLibrary(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).first().click();
}

test('états vides et erreurs de saisie', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Aucun projet pour le moment')).toBeVisible();
  await page.goto('/projets/nouveau');
  await page.getByRole('button', { name: 'Créer le projet et ouvrir l’éditeur' }).click();
  await expect(page.getByText('Nom requis')).toBeVisible();
  await page.goto('/editeur/plan-inexistant');
  await expect(page.getByRole('alert')).toContainText('introuvable');
});

test('parcours complet : projet, salle, mobilier, sauvegarde, rechargement, export PDF', async ({ page }, testInfo) => {
  // 1-3. Ouvrir l'application, créer un projet et une salle de 12 × 10 m.
  await page.goto('/');
  await page.getByRole('link', { name: 'Nouveau projet' }).first().click();
  await page.getByLabel('Nom du projet *').fill('Projet E2E');
  await page.getByLabel('Nombre d’invités').fill('2');
  await page.getByLabel('Largeur (m)').fill('12');
  await page.getByLabel('Profondeur (m)').fill('10');
  await page.getByLabel('Proposer une implantation automatique').uncheck();
  await page.getByRole('button', { name: 'Créer le projet et ouvrir l’éditeur' }).click();
  await expect(page).toHaveURL(/\/editeur\//);
  const status = page.getByTestId('save-status');
  await expect(status).toHaveText('Enregistré');
  await expect(page.getByText('Emprise : 1 200 cm × 1 000 cm')).toBeVisible();

  // 4. Ajouter une table et la positionner précisément.
  await addFromLibrary(page, /^Table ronde Ø150/);
  await setNumber(page, 'X (cm)', '300');
  await setNumber(page, 'Y (cm)', '300');

  // 5. Ajouter deux chaises de part et d'autre de la table.
  await addFromLibrary(page, /^Chaise/);
  await setNumber(page, 'X (cm)', '300');
  await setNumber(page, 'Y (cm)', '200');
  await addFromLibrary(page, /^Chaise/);
  await setNumber(page, 'X (cm)', '300');
  await setNumber(page, 'Y (cm)', '400');

  // 6. Déplacer (Maj+→ : +100 mm) et faire pivoter (R : +15°) la chaise sélectionnée.
  await blur(page);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('r');
  await expect(page.getByLabel('X (cm)', { exact: true })).toHaveValue('310');
  await expect(page.getByLabel('Rotation (°)', { exact: true })).toHaveValue('15');

  // Annuler / rétablir.
  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('Rotation (°)', { exact: true })).toHaveCount(0); // sélection vidée par l'annulation
  await page.keyboard.press('Control+y');

  // 7. Sauvegarder (Ctrl+S) : le statut ne passe à « Enregistré » qu'après confirmation du stockage.
  await page.keyboard.press('Control+s');
  await expect(status).toHaveText('Enregistré');

  // 8-9. Recharger et vérifier la conservation des données.
  await page.reload();
  await expect(status).toHaveText('Enregistré');
  await page.getByRole('tab', { name: 'Quantités' }).click();
  await expect(page.getByTestId('metric-Chaises')).toHaveText('2');
  await expect(page.getByTestId('metric-Tables')).toHaveText('1');
  await expect(page.getByTestId('metric-Places assises')).toHaveText('2');

  // Positions et rotation persistées, vérifiées via l'export CSV détaillé.
  await page.getByRole('button', { name: 'Exporter' }).click();
  await page.getByLabel('Format', { exact: true }).selectOption('csv');
  await page.getByLabel('Contenu').selectOption('objets');
  const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Générer et télécharger' }).click()]);
  const csv = await readFile((await csvDownload.path())!, 'utf8');
  const rows = csv.trim().split('\r\n').slice(1).map((l) => l.split(';'));
  const chairs = rows.filter((r) => r[3] === 'Chaise');
  expect(chairs).toHaveLength(2);
  expect(chairs.map((r) => [r[6], r[7], r[8]])).toEqual(expect.arrayContaining([['3000', '2000', '0'], ['3100', '4000', '15']]));

  // 10-11. Exporter un PDF et vérifier son contenu.
  await page.getByLabel('Format', { exact: true }).selectOption('pdf');
  const [pdfDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Générer et télécharger' }).click()]);
  expect(pdfDownload.suggestedFilename()).toMatch(/^Projet_E2E_Plan_principal_general_v\d+\.pdf$/);
  const pdfPath = testInfo.outputPath('plan.pdf');
  await pdfDownload.saveAs(pdfPath);
  const pdf = (await readFile(pdfPath)).toString('latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf).toContain('Projet E2E');
  expect(pdf).toContain('Plan principal');
  expect(pdf).toContain('Nomenclature');
  expect(pdf).toMatch(/chelle 1:\d+/);
  await expect(page.getByRole('status').filter({ hasText: 'Fichier généré' })).toBeVisible();

  // L'export est historisé.
  await page.goto('/exports');
  await expect(page.getByRole('cell', { name: /\.pdf$/ })).toBeVisible();
});

test('assistant en langage naturel et salle polygonale dessinée aux murs', async ({ page }) => {
  await page.goto('/projets/nouveau');
  await page.getByLabel('Nom du projet *').fill('Projet Assistant');
  await page.getByLabel('Proposer une implantation automatique').uncheck();
  await page.getByRole('button', { name: 'Créer le projet et ouvrir l’éditeur' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Enregistré');

  // Assistant : proposition structurée, aperçu contrôlé, puis application annulable.
  await page.getByRole('button', { name: 'Assistant' }).click();
  await page.getByRole('button', { name: 'Analyser et prévisualiser' }).click();
  await expect(page.getByText('Banquet pour 160 invités, tables rondes de 8')).toBeVisible();
  await expect(page.getByText(/Contrôle géométrique du résultat : aucune collision/)).toBeVisible();
  await page.getByRole('button', { name: 'Appliquer au plan' }).click();
  await page.getByRole('tab', { name: 'Quantités' }).click();
  await expect(page.getByTestId('metric-Surface salle')).toHaveText('400 m²');
  expect(Number(await page.getByTestId('metric-Chaises').textContent())).toBeGreaterThan(100);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('metric-Chaises')).toHaveText('0');

  // Outil Murs : 5 clics puis Entrée → contour polygonal à 5 sommets.
  await page.getByRole('button', { name: 'Murs' }).click();
  const box = (await page.getByTestId('plan-canvas').boundingBox())!;
  const pts = [[0.2, 0.2], [0.7, 0.2], [0.7, 0.5], [0.45, 0.8], [0.2, 0.8]];
  for (const [fx, fy] of pts) await page.mouse.click(box.x + box.width * fx!, box.y + box.height * fy!);
  await page.keyboard.press('Enter');
  await page.getByRole('tab', { name: 'Propriétés' }).click();
  await expect(page.getByRole('button', { name: /Supprimer le sommet/ })).toHaveCount(5);
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-status')).toHaveText('Enregistré');
});
