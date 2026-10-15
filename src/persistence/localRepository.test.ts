import { describe, expect, it } from 'vitest';
import { findTemplate } from '../domain/catalog';
import { createDocument, objectFromTemplate } from '../domain/document';
import { updateObject } from '../domain/operations';
import { MemoryKVStore } from './kvStore';
import { LocalRepository } from './localRepository';
import { ConflictError, NotFoundError, PermissionError } from './repository';

const setup = () => {
  const kv = new MemoryKVStore();
  return { kv, repo: new LocalRepository(kv) };
};
const table = () => objectFromTemplate(findTemplate('table-ronde-150')!, { x: 3000, y: 3000 });

describe('LocalRepository', () => {
  it('crée un projet, sauvegarde et recharge un plan sans perte', async () => {
    const { repo } = setup();
    const p = await repo.createProject({ name: '  Mariage Durand ', eventType: 'banquet', guestCount: 120 });
    expect(p.name).toBe('Mariage Durand');
    const doc = { ...createDocument({ width: 12_000, depth: 9_000 }), objects: [table()] };
    const plan = await repo.createPlan(p.id, 'Plan principal', doc);
    const moved = updateObject(doc, doc.objects[0]!.id, { x: 4200, rotation: 45 });
    const saved = await repo.savePlan(plan.id, moved, plan.revision);
    expect(saved.revision).toBe(2);
    const reloaded = await repo.getPlan(plan.id);
    expect(reloaded.document).toEqual(moved);
    expect((await repo.listPlans(p.id)).map((x) => x.id)).toEqual([plan.id]);
  });

  it('refuse une sauvegarde concurrente (révision obsolète)', async () => {
    const { repo } = setup();
    const p = await repo.createProject({ name: 'Salon' });
    const plan = await repo.createPlan(p.id, 'A', createDocument({ width: 5000, depth: 5000 }));
    await repo.savePlan(plan.id, plan.document, 1);
    const err = await repo.savePlan(plan.id, plan.document, 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).latest?.revision).toBe(2);
  });

  it('refuse un document corrompu sans écraser les données', async () => {
    const { repo } = setup();
    const p = await repo.createProject({ name: 'X' });
    const plan = await repo.createPlan(p.id, 'A', createDocument({ width: 5000, depth: 5000 }));
    const bad = { ...plan.document, objects: [{ ...table(), width: Number.NaN }] };
    await expect(repo.savePlan(plan.id, bad, 1)).rejects.toThrow(/invalide/);
    expect((await repo.getPlan(plan.id)).revision).toBe(1);
  });

  it('propage les erreurs de stockage', async () => {
    const { repo, kv } = setup();
    const p = await repo.createProject({ name: 'X' });
    const plan = await repo.createPlan(p.id, 'A', createDocument({ width: 5000, depth: 5000 }));
    kv.failNextWrite = new Error('QuotaExceededError');
    await expect(repo.savePlan(plan.id, plan.document, 1)).rejects.toThrow('QuotaExceededError');
    expect((await repo.getPlan(plan.id)).revision).toBe(1);
  });

  it('crée et restaure une version', async () => {
    const { repo } = setup();
    const p = await repo.createProject({ name: 'Gala' });
    const v1doc = { ...createDocument({ width: 8000, depth: 8000 }), objects: [table()] };
    let plan = await repo.createPlan(p.id, 'A', v1doc);
    const rev = await repo.createRevision(plan.id, 'Validé client');
    expect(rev.number).toBe(1);
    plan = await repo.savePlan(plan.id, { ...v1doc, objects: [] }, plan.revision);
    expect((await repo.createRevision(plan.id, 'vide')).number).toBe(2);
    // Restaurer = enregistrer l'instantané comme nouvelle révision (l'historique est conservé).
    const restored = await repo.savePlan(plan.id, rev.document, plan.revision);
    expect(restored.document.objects).toHaveLength(1);
    expect((await repo.listRevisions(plan.id)).map((r) => r.number)).toEqual([2, 1]);
  });

  it('duplique, archive et supprime un projet en cascade', async () => {
    const { repo } = setup();
    const p = await repo.createProject({ name: 'Conf' });
    const plan = await repo.createPlan(p.id, 'A', createDocument({ width: 5000, depth: 5000 }));
    await repo.createRevision(plan.id, 'v1');
    const copy = await repo.duplicateProject(p.id);
    expect(copy.name).toBe('Conf (copie)');
    expect(await repo.listPlans(copy.id)).toHaveLength(1);
    expect((await repo.updateProject(p.id, { archived: true, favorite: true })).archived).toBe(true);
    await repo.deleteProject(p.id);
    await expect(repo.getProject(p.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.getPlan(plan.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await repo.listRevisions(plan.id)).toEqual([]);
    expect(await repo.listProjects()).toHaveLength(1);
  });

  it('valide les entrées et refuse les fonctions d’équipe en mode local', async () => {
    const { repo } = setup();
    await expect(repo.createProject({ name: '   ' })).rejects.toThrow();
    await expect(repo.invite('a@b.fr', 'editeur')).rejects.toBeInstanceOf(PermissionError);
    expect(await repo.getSubscription()).toBeNull();
  });
});
