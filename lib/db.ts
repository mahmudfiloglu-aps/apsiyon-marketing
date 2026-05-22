import { neon } from '@neondatabase/serverless'

function getDb() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL
  if (!url) throw new Error('Database URL not configured')
  return neon(url)
}

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

export async function createUser(
  email: string,
  passwordHash: string,
  name: string
) {
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
