import postgres from "postgres";

// Só roda no servidor. Em produção use a string do pooler do Supabase
// (modo transação, porta 6543); prepare:false é exigido nesse modo.
// bigint/numeric chegam como string: converta com num() de lib/format.
const g = globalThis as unknown as { __sql?: postgres.Sql };

export const sql = g.__sql ?? postgres(process.env.DATABASE_URL ?? "", { prepare: false, max: 3, idle_timeout: 20 });

if (process.env.NODE_ENV !== "production") g.__sql = sql;

/** Lê um parâmetro de busca como inteiro positivo (ou null). */
export function inteiro(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d+$/.test(s) ? Number(s) : null;
}

/** Lê um parâmetro de busca restrito a uma lista de valores aceitos. */
export function umDe<T extends string>(v: string | string[] | undefined, aceitos: readonly T[]): T | null {
  const s = Array.isArray(v) ? v[0] : v;
  return aceitos.includes(s as T) ? (s as T) : null;
}
