import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const ADMIN_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/postgres";
const TEST_DB = "app_test";

const repoRoot = path.resolve(__dirname, "../../..");

/**
 * Drops and recreates the test database, applies the Supabase stub schema
 * (auth/storage stand-ins for vanilla Postgres) and then every migration in
 * supabase/migrations in filename order. Returns a superuser client connected
 * to the fresh database.
 */
export async function createTestDatabase(): Promise<Client> {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();

  const db = new Client({
    connectionString: ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DB}`),
  });
  await db.connect();

  await db.query(
    readFileSync(path.join(repoRoot, "src/test/db/supabase-stub.sql"), "utf8"),
  );

  const migrationsDir = path.join(repoRoot, "supabase/migrations");
  const migrations = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    await db.query(readFileSync(path.join(migrationsDir, file), "utf8"));
  }

  return db;
}

/**
 * Runs queries as the `authenticated` role with auth.uid() = userId,
 * mimicking a PostgREST request, then restores superuser. Errors are
 * rethrown after the session is reset so one failed query can't leak the
 * restricted role into later assertions.
 */
export async function asUser<T>(
  db: Client,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    userId,
  ]);
  await db.query("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
