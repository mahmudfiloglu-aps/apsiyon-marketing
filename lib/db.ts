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

// ── Lead Decisions ─────────────────────────────────────

export async function createDecisionsTable() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS lead_decisions (
      analysis_id   VARCHAR(255) NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
      lead_id       VARCHAR(255) NOT NULL,
      ai_status     VARCHAR(100),
      user_decision VARCHAR(20)  NOT NULL,
      user_note     VARCHAR(500),
      created_at    TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (analysis_id, lead_id)
    )
  `
  await sql`ALTER TABLE lead_decisions ADD COLUMN IF NOT EXISTS user_note VARCHAR(500)`.catch(() => {})
}

export async function saveDecisions(
  analysisId: string,
  decisions: { leadId: string; aiStatus: string; userDecision: string; userNote?: string }[]
) {
  if (!decisions.length) return
  const sql = getDb()
  await createDecisionsTable()
  for (const d of decisions) {
    await sql`
      INSERT INTO lead_decisions (analysis_id, lead_id, ai_status, user_decision, user_note)
      VALUES (${analysisId}, ${d.leadId}, ${d.aiStatus}, ${d.userDecision}, ${d.userNote ?? null})
      ON CONFLICT (analysis_id, lead_id) DO UPDATE
        SET user_decision = EXCLUDED.user_decision,
            ai_status     = EXCLUDED.ai_status,
            user_note     = ${d.userNote ?? null},
            created_at    = NOW()
    `
  }
}

export async function getDecisionAccuracy(userId: string) {
  const sql = getDb()
  await createDecisionsTable()
  const rows = await sql`
    SELECT d.ai_status, d.user_decision, COUNT(*)::int AS count
    FROM lead_decisions d
    JOIN analyses a ON d.analysis_id = a.id
    WHERE a.user_id = ${userId}
    GROUP BY d.ai_status, d.user_decision
  `
  return rows
}

export async function getRejectedExamples(userId: string, limit = 10) {
  const sql = getDb()
  await createDecisionsTable()
  const rows = await sql`
    SELECT
      elem->'lead'->>'Son Aktivite Açıklaması' AS note,
      elem->'lead'->>'Başvuru Kampanyası'       AS campaign,
      elem->'lead'->>'Kayıt Tipi'               AS record_type,
      d.ai_status,
      elem->'analysisResult'->>'reason'          AS ai_reason,
      d.user_note AS user_note
    FROM lead_decisions d
    JOIN analyses a ON d.analysis_id = a.id,
         jsonb_array_elements(a.results) AS elem
    WHERE a.user_id = ${userId}
      AND d.user_decision = 'rejected'
      AND elem->'lead'->>'ID' = d.lead_id
      AND elem->'analysisResult' IS NOT NULL
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `
  return rows as { note: string; campaign: string; record_type: string; ai_status: string; ai_reason: string; user_note: string | null }[]
}

// ── Rep Leads ──────────────────────────────────────────

export async function getRepLeads(userId: string, repName: string) {
  const sql = getDb()
  const rows = await sql`
    SELECT
      a.id AS analysis_id,
      a.file_name,
      a.created_at,
      elem->'lead' AS lead,
      elem->'analysisResult' AS analysis_result
    FROM analyses a,
      jsonb_array_elements(a.results) AS elem
    WHERE a.user_id = ${userId}
      AND elem->'lead'->>'Satış Temsilcisi' = ${repName}
      AND elem->'analysisResult' IS NOT NULL
    ORDER BY a.created_at DESC
    LIMIT 200
  `
  return rows
}

// ── Analytics ──────────────────────────────────────────

export async function getAnalytics(userId: string) {
  const sql = getDb()

  const repRows = await sql`
    SELECT
      elem->'lead'->>'Satış Temsilcisi' AS rep,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE elem->'analysisResult'->>'suggestedStatus' = 'Yeniden Değerlendir')::int AS reeval,
      COUNT(*) FILTER (WHERE elem->'analysisResult'->>'suggestedStatus' = 'Yanlış Kayıt')::int        AS wrong_record,
      COUNT(*) FILTER (WHERE elem->'analysisResult'->>'suggestedStatus' = 'Yetersiz Not')::int        AS insufficient,
      COUNT(*) FILTER (WHERE elem->'analysisResult'->>'suggestedStatus' = 'Belirsiz')::int            AS unclear,
      COUNT(*) FILTER (WHERE elem->'analysisResult'->>'suggestedStatus' = 'Check Pass')::int          AS check_pass,
      ROUND(AVG((elem->'analysisResult'->>'qualityScore')::numeric), 1) AS avg_quality
    FROM analyses a, jsonb_array_elements(a.results) AS elem
    WHERE a.user_id = ${userId}
      AND elem->'lead'->>'Satış Temsilcisi' IS NOT NULL
      AND elem->'lead'->>'Satış Temsilcisi' != ''
      AND elem->'analysisResult' IS NOT NULL
    GROUP BY 1 ORDER BY reeval DESC, total DESC LIMIT 50
  `

  const campaignRows = await sql`
    SELECT
      elem->'lead'->>'Başvuru Kampanyası' AS campaign,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE elem->'analysisResult'->>'suggestedStatus' = 'Yeniden Değerlendir')::int AS reeval,
      COUNT(*) FILTER (WHERE elem->'analysisResult'->>'suggestedStatus' = 'Yanlış Kayıt')::int        AS wrong_record,
      COUNT(*) FILTER (WHERE elem->'analysisResult'->>'suggestedStatus' = 'Check Pass')::int          AS check_pass,
      ROUND(AVG((elem->'analysisResult'->>'qualityScore')::numeric), 1) AS avg_quality
    FROM analyses a, jsonb_array_elements(a.results) AS elem
    WHERE a.user_id = ${userId}
      AND elem->'lead'->>'Başvuru Kampanyası' IS NOT NULL
      AND elem->'lead'->>'Başvuru Kampanyası' != ''
      AND elem->'analysisResult' IS NOT NULL
    GROUP BY 1 ORDER BY reeval DESC, total DESC LIMIT 50
  `

  return { reps: repRows, campaigns: campaignRows }
}

export async function getCompanyHistory(
  userId: string,
  companies: string[],
  excludeAnalysisId?: string
) {
  if (!companies.length) return []
  const sql = getDb()
  const rows = await sql`
    SELECT
      a.id,
      a.file_name,
      a.created_at,
      elem->'lead'->>'Hesap Adı' AS company_name,
      elem->'analysisResult'->>'suggestedStatus' AS status
    FROM analyses a,
      jsonb_array_elements(a.results) AS elem
    WHERE a.user_id = ${userId}
      AND (${excludeAnalysisId ?? null}::text IS NULL OR a.id != ${excludeAnalysisId ?? ''})
      AND elem->'lead'->>'Hesap Adı' = ANY(${companies})
    ORDER BY a.created_at DESC
    LIMIT 200
  `
  // Group by company name
  const map: Record<string, { analysisId: string; fileName: string; status: string; date: string }[]> = {}
  for (const row of rows) {
    const name = row.company_name as string
    if (!name) continue
    if (!map[name]) map[name] = []
    map[name].push({
      analysisId: row.id as string,
      fileName: row.file_name as string,
      status: (row.status as string) || 'Bilinmiyor',
      date: row.created_at as string,
    })
  }
  return map
}

// ── Custom Rules ───────────────────────────────────────

export async function createCustomRulesTable() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS custom_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rule_text TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
}

export async function getCustomRules(userId: string) {
  const sql = getDb()
  await createCustomRulesTable()
  const rows = await sql`
    SELECT id, rule_text, is_active, created_at
    FROM custom_rules
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `
  return rows
}

export async function saveCustomRule(userId: string, ruleText: string) {
  const sql = getDb()
  await createCustomRulesTable()
  const result = await sql`
    INSERT INTO custom_rules (user_id, rule_text)
    VALUES (${userId}, ${ruleText})
    RETURNING id, rule_text, is_active, created_at
  `
  return result[0]
}

export async function deleteCustomRule(userId: string, id: string) {
  const sql = getDb()
  await sql`DELETE FROM custom_rules WHERE id = ${id} AND user_id = ${userId}`
}

export async function toggleCustomRule(userId: string, id: string, isActive: boolean) {
  const sql = getDb()
  await sql`UPDATE custom_rules SET is_active = ${isActive} WHERE id = ${id} AND user_id = ${userId}`
}
