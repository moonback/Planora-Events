import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Exécute la vraie migration dans PostgreSQL (PGlite, en mémoire) avec un schéma `auth` minimal
 * reproduisant celui de Supabase (auth.users, auth.uid()), puis vérifie les politiques RLS.
 */
const migration = readFileSync(fileURLToPath(new URL('../migrations/20261016000000_init.sql', import.meta.url)), 'utf8');

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';
const DOC = JSON.stringify({ schemaVersion: 1, room: {}, objects: [] });

let db: PGlite;

async function as<T>(user: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}
const orgOf = async (user: string) =>
  (await db.query<{ org_id: string }>(`select org_id from public.organization_members where user_id = $1 and role = 'admin'`, [user])).rows[0]!.org_id;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated nologin;
    create schema auth;
    grant usage on schema auth to authenticated;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  await db.exec(migration);
  await db.exec(`insert into auth.users values ('${A}', 'a@exemple.fr'), ('${B}', 'b@exemple.fr'), ('${C}', 'c@exemple.fr');`);
}, 60_000);

describe('politiques RLS', () => {
  it('crée un espace personnel administré à l’inscription', async () => {
    const r = await db.query(`select role from public.organization_members where user_id = $1`, [A]);
    expect(r.rows).toEqual([{ role: 'admin' }]);
  });

  it('isole les projets entre organisations', async () => {
    const orgA = await orgOf(A);
    const project = await as(A, () =>
      db.query<{ id: string }>(`insert into public.projects (org_id, name) values ($1, 'Gala A') returning id`, [orgA]),
    );
    const pid = project.rows[0]!.id;
    await as(A, () => db.query(`insert into public.floor_plans (project_id, org_id, name, document) values ($1, $2, 'Plan', $3)`, [pid, orgA, DOC]));

    const seenByB = await as(B, () => db.query(`select * from public.projects`));
    expect(seenByB.rows).toHaveLength(0);
    const plansByB = await as(B, () => db.query(`select * from public.floor_plans`));
    expect(plansByB.rows).toHaveLength(0);
    const upd = await as(B, () => db.query(`update public.projects set name = 'piraté' where id = $1`, [pid]));
    expect(upd.affectedRows).toBe(0);
    await expect(as(B, () => db.query(`insert into public.projects (org_id, name) values ($1, 'intrus')`, [orgA]))).rejects.toThrow();
    // Un plan rattaché à un projet étranger avec son propre org_id est refusé par le déclencheur.
    const orgB = await orgOf(B);
    await expect(
      as(B, () => db.query(`insert into public.floor_plans (project_id, org_id, name, document) values ($1, $2, 'x', $3)`, [pid, orgB, DOC])),
    ).rejects.toThrow();
  });

  it('applique les rôles lecteur / éditeur via invitation', async () => {
    const orgA = await orgOf(A);
    const inv = await as(A, () =>
      db.query<{ token: string }>(`insert into public.invitations (org_id, email, role) values ($1, 'c@exemple.fr', 'lecteur') returning token`, [orgA]),
    );
    // B ne peut pas utiliser une invitation destinée à C.
    await expect(as(B, () => db.query(`select public.accept_invitation($1)`, [inv.rows[0]!.token]))).rejects.toThrow();
    await as(C, () => db.query(`select public.accept_invitation($1)`, [inv.rows[0]!.token]));

    const visible = await as(C, () => db.query(`select name from public.projects`));
    expect(visible.rows).toEqual([{ name: 'Gala A' }]);
    const upd = await as(C, () => db.query(`update public.projects set name = 'modifié par lecteur'`));
    expect(upd.affectedRows).toBe(0);
    // Un lecteur ne peut pas se promouvoir.
    const promote = await as(C, () => db.query(`update public.organization_members set role = 'admin' where user_id = $1 and org_id = $2`, [C, orgA]));
    expect(promote.affectedRows).toBe(0);

    await db.query(`update public.organization_members set role = 'editeur' where user_id = $1 and org_id = $2`, [C, orgA]);
    const upd2 = await as(C, () => db.query(`update public.projects set name = 'Gala A v2' where org_id = $1`, [orgA]));
    expect(upd2.affectedRows).toBe(1);
    // Seul un admin supprime un projet.
    const del = await as(C, () => db.query(`delete from public.projects where org_id = $1`, [orgA]));
    expect(del.affectedRows).toBe(0);
  });

  it('interdit à un client de s’attribuer un abonnement', async () => {
    const orgA = await orgOf(A);
    await expect(as(A, () => db.query(`insert into public.subscriptions (org_id, tier, status) values ($1, 'entreprise', 'active')`, [orgA]))).rejects.toThrow();
  });
});
