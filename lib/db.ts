import { neon } from '@neondatabase/serverless'
import type { AnalyzedLead } from '@/types/lead'

function getDb() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL
  if (!url) throw new Error('Database URL not configured')
  return neon(url)
}

// ── Users ──────────────────────────────────────────────

export async function createUsersTable() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
}

export async function createUser(email: string, passwordHash: string, name: string) {
  const sql = getDb()
  const result = await sql`
    INSERT INTO users (email, password_hash, name)
    VALUES (${email}, ${passwordHash}, ${name})
    RETURNING id, email, name
  `
  return result[0]
}

export async function getUserByEmail(email: string) {
  const sql = getDb()
  const result = await sql`SELECT * FROM users WHERE email = ${email}`
  return result[0] ?? null
}

// ── Analyses ───────────────────────────────────────────

export async function createAnalysesTable() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS analyses (
      id VARCHAR(255) PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_name VARCHAR(255) NOT NULL,
      filtered_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      results JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
}

export async function saveAnalysis(
  id: string,
  userId: string,
  fileName: string,
  filteredCount: number,
  totalCount: number,
  results: AnalyzedLead[]
) {
  const sql = getDb()
  await sql`
    INSERT INTO analyses (id, user_id, file_name, filtered_count, total_count, results)
    VALUES (${id}, ${userId}, ${fileName}, ${filteredCount}, ${totalCount}, ${JSON.stringify(results)})
    ON CONFLICT (id) DO UPDATE SET results = EXCLUDED.results
  `
}

export async function listAnalyses(userId: string) {
  const sql = getDb()
  const result = await sql`
    SELECT id, file_name, filtered_count, total_count, created_at
    FROM analyses
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 50
  `
  return result
}

export async function getAnalysis(id: string, userId: string) {
  const sql = getDb()
  const result = await sql`
    SELECT * FROM analyses WHERE id = ${id} AND user_id = ${userId}
  `
  return result[0] ?? null
}

export async function deleteAnalysis(id: string, userId: string) {
  const sql = getDb()
  await sql`DELETE FROM analyses WHERE id = ${id} AND user_id = ${userId}`
}
