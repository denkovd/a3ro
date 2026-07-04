/**
 * Minimal ambient types for `pg`, covering exactly what storage/db.ts
 * uses. Lets the package typecheck before `npm install`; once
 * @types/pg is installed it takes precedence (delete this file then
 * if you prefer).
 */
declare module "pg" {
  export interface PoolConfig {
    connectionString?: string;
    max?: number;
  }
  export class Pool {
    constructor(config?: PoolConfig);
    query(
      text: string,
      params?: unknown[],
    ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
    end(): Promise<void>;
  }
}
