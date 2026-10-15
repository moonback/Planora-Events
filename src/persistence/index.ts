import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { IndexedDBKVStore } from './kvStore';
import { LocalRepository } from './localRepository';
import type { Repository } from './repository';
import { SupabaseRepository } from './supabaseRepository';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Client Supabase, uniquement si les deux variables publiques sont fournies (sinon : mode local). */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

export const repository: Repository = supabase ? new SupabaseRepository(supabase) : new LocalRepository(new IndexedDBKVStore());
