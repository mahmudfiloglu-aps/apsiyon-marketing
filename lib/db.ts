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
      role VARCHAR(50) NOT NULL DEFAULT 'viewer',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'viewer'`.catch(() => {})
  // Ensure marketing@apsiyon.com is super_admin
  await sql`UPDATE users SET role = 'super_admin' WHERE email = 'marketing@apsiyon.com' AND role = 'viewer'`.catch(() => {})
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

export async function listUsers() {
  const sql = getDb()
  const result = await sql`SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC`
  return result
}

export async function updateUserRole(userId: string, role: string) {
  const sql = getDb()
  await sql`UPDATE users SET role = ${role} WHERE id = ${userId}`
}

export async function updateUserPassword(userId: string, passwordHash: string) {
  const sql = getDb()
  await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}`
}

export async function setSuperAdmin(email: string) {
  const sql = getDb()
  await sql`UPDATE users SET role = 'super_admin' WHERE email = ${email}`
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

// ── Quality Analyses ───────────────────────────────────

export async function createQualityAnalysesTable() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS quality_analyses (
      id          VARCHAR(255) PRIMARY KEY,
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_name   VARCHAR(255) NOT NULL,
      total_count INTEGER NOT NULL DEFAULT 0,
      results     JSONB,
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `
}

export async function saveQualityAnalysis(
  id: string,
  userId: string,
  fileName: string,
  totalCount: number,
  results: unknown[]
) {
  const sql = getDb()
  await createQualityAnalysesTable()
  await sql`
    INSERT INTO quality_analyses (id, user_id, file_name, total_count, results)
    VALUES (${id}, ${userId}, ${fileName}, ${totalCount}, ${JSON.stringify(results)})
    ON CONFLICT (id) DO UPDATE SET results = EXCLUDED.results
  `
}

export async function listQualityAnalyses(userId: string) {
  const sql = getDb()
  await createQualityAnalysesTable()
  return sql`
    SELECT id, file_name, total_count, created_at
    FROM quality_analyses
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 50
  `
}

export async function getQualityAnalysis(id: string, userId: string) {
  const sql = getDb()
  await createQualityAnalysesTable()
  const result = await sql`
    SELECT * FROM quality_analyses WHERE id = ${id} AND user_id = ${userId}
  `
  return result[0] ?? null
}

export async function deleteQualityAnalysis(id: string, userId: string) {
  const sql = getDb()
  await sql`DELETE FROM quality_analyses WHERE id = ${id} AND user_id = ${userId}`
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

// ── Module Permissions ─────────────────────────────────

export const ALL_MODULES = [
  'lead_analysis',
  'lead_quality',
  'analytics',
  'keywords',
  'ad_reports',
  'settings',
] as const
export type Module = typeof ALL_MODULES[number]

export async function createModulePermissionsTable() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS module_permissions (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      module VARCHAR(100) NOT NULL,
      is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      PRIMARY KEY (user_id, module)
    )
  `
}

export async function getModulePermissions(userId: string): Promise<Record<string, boolean>> {
  const sql = getDb()
  await createModulePermissionsTable()
  const rows = await sql`SELECT module, is_enabled FROM module_permissions WHERE user_id = ${userId}`
  const map: Record<string, boolean> = {}
  for (const r of rows) map[r.module as string] = r.is_enabled as boolean
  // default to true for missing modules
  for (const m of ALL_MODULES) {
    if (!(m in map)) map[m] = true
  }
  return map
}

export async function setModulePermission(userId: string, module: string, isEnabled: boolean) {
  const sql = getDb()
  await createModulePermissionsTable()
  await sql`
    INSERT INTO module_permissions (user_id, module, is_enabled)
    VALUES (${userId}, ${module}, ${isEnabled})
    ON CONFLICT (user_id, module) DO UPDATE SET is_enabled = EXCLUDED.is_enabled
  `
}

export async function getAllUserPermissions(): Promise<Record<string, Record<string, boolean>>> {
  const sql = getDb()
  await createModulePermissionsTable()
  const rows = await sql`SELECT user_id, module, is_enabled FROM module_permissions`
  const map: Record<string, Record<string, boolean>> = {}
  for (const r of rows) {
    const uid = r.user_id as string
    if (!map[uid]) map[uid] = {}
    map[uid][r.module as string] = r.is_enabled as boolean
  }
  return map
}

// ── Ad Reports ─────────────────────────────────────────

export async function createAdReportsTable() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS ad_reports (
      id VARCHAR(255) PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tab_name VARCHAR(255) NOT NULL,
      source VARCHAR(50) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      data JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
}

export async function saveAdReport(
  id: string,
  userId: string,
  tabName: string,
  source: string,
  fileName: string,
  data: Record<string, unknown>[]
) {
  const sql = getDb()
  await createAdReportsTable()
  await sql`
    INSERT INTO ad_reports (id, user_id, tab_name, source, file_name, data)
    VALUES (${id}, ${userId}, ${tabName}, ${source}, ${fileName}, ${JSON.stringify(data)})
    ON CONFLICT (id) DO UPDATE SET tab_name = EXCLUDED.tab_name, data = EXCLUDED.data
  `
}

export async function listAdReports(userId: string) {
  const sql = getDb()
  await createAdReportsTable()
  return sql`
    SELECT id, tab_name, source, file_name, created_at
    FROM ad_reports
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `
}

export async function getAdReport(id: string, userId: string) {
  const sql = getDb()
  await createAdReportsTable()
  const result = await sql`SELECT * FROM ad_reports WHERE id = ${id} AND user_id = ${userId}`
  return result[0] ?? null
}

export async function deleteAdReport(id: string, userId: string) {
  const sql = getDb()
  await sql`DELETE FROM ad_reports WHERE id = ${id} AND user_id = ${userId}`
}

// ── Report Projects ────────────────────────────────────

export async function createReportProjectsTables() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS report_projects (
      id VARCHAR(255) PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_name VARCHAR(255) NOT NULL,
      period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS report_files (
      id VARCHAR(255) PRIMARY KEY,
      project_id VARCHAR(255) NOT NULL REFERENCES report_projects(id) ON DELETE CASCADE,
      file_type VARCHAR(50) NOT NULL,
      is_previous BOOLEAN NOT NULL DEFAULT FALSE,
      file_name VARCHAR(255) NOT NULL,
      data JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(project_id, file_type, is_previous)
    )
  `
}

export async function listReportProjects(userId: string) {
  const sql = getDb()
  await createReportProjectsTables()
  return sql`
    SELECT id, project_name, period_type, created_at
    FROM report_projects WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `
}

export async function createReportProject(id: string, userId: string, projectName: string, periodType: string) {
  const sql = getDb()
  await createReportProjectsTables()
  await sql`
    INSERT INTO report_projects (id, user_id, project_name, period_type)
    VALUES (${id}, ${userId}, ${projectName}, ${periodType})
  `
}

export async function deleteReportProject(id: string, userId: string) {
  const sql = getDb()
  await sql`DELETE FROM report_projects WHERE id = ${id} AND user_id = ${userId}`
}

export async function getReportProjectFiles(projectId: string, userId: string) {
  const sql = getDb()
  // Verify ownership
  const proj = await sql`SELECT id FROM report_projects WHERE id = ${projectId} AND user_id = ${userId}`
  if (!proj.length) return []
  return sql`SELECT id, file_type, is_previous, file_name, data, created_at FROM report_files WHERE project_id = ${projectId}`
}

export async function upsertReportFile(
  id: string, projectId: string, fileType: string, isPrevious: boolean, fileName: string, data: Record<string, unknown>[]
) {
  const sql = getDb()
  await sql`
    INSERT INTO report_files (id, project_id, file_type, is_previous, file_name, data)
    VALUES (${id}, ${projectId}, ${fileType}, ${isPrevious}, ${fileName}, ${JSON.stringify(data)})
    ON CONFLICT (project_id, file_type, is_previous) DO UPDATE
      SET id = EXCLUDED.id, file_name = EXCLUDED.file_name, data = EXCLUDED.data
  `
}

export async function deleteReportFile(id: string, userId: string) {
  const sql = getDb()
  await sql`
    DELETE FROM report_files rf
    USING report_projects rp
    WHERE rf.id = ${id} AND rf.project_id = rp.id AND rp.user_id = ${userId}
  `
}

// ── Blog Tools ─────────────────────────────────────────

export async function createBlogTables() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS blog_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      url TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      auto_keywords TEXT[] DEFAULT '{}',
      manual_keywords TEXT[] DEFAULT '{}',
      last_synced TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
}

export async function getBlogSetting(key: string): Promise<string | null> {
  const sql = getDb()
  await createBlogTables()
  const rows = await sql`SELECT value FROM blog_settings WHERE key = ${key}`
  return rows[0]?.value ?? null
}

export async function setBlogSetting(key: string, value: string) {
  const sql = getDb()
  await createBlogTables()
  await sql`
    INSERT INTO blog_settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `
}

export async function listBlogPosts() {
  const sql = getDb()
  await createBlogTables()
  return sql`
    SELECT id, url, slug, title, auto_keywords, manual_keywords, last_synced, created_at
    FROM blog_posts ORDER BY created_at DESC
  `
}

export async function upsertBlogPost(
  url: string, slug: string, title: string, autoKeywords: string[]
) {
  const sql = getDb()
  await sql`
    INSERT INTO blog_posts (url, slug, title, auto_keywords, last_synced)
    VALUES (${url}, ${slug}, ${title}, ${autoKeywords}, NOW())
    ON CONFLICT (url) DO UPDATE SET
      slug = EXCLUDED.slug,
      title = EXCLUDED.title,
      auto_keywords = EXCLUDED.auto_keywords,
      last_synced = NOW()
  `
}

export async function updateBlogPostKeywords(id: string, manualKeywords: string[]) {
  const sql = getDb()
  await sql`UPDATE blog_posts SET manual_keywords = ${manualKeywords} WHERE id = ${id}`
}

export async function deleteBlogPost(id: string) {
  const sql = getDb()
  await sql`DELETE FROM blog_posts WHERE id = ${id}`
}
