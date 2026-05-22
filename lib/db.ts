import { sql } from '@vercel/postgres'

export async function createUsersTable() {
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
  const result = await sql`
    INSERT INTO users (email, password_hash, name)
    VALUES (${email}, ${passwordHash}, ${name})
    RETURNING id, email, name
  `
  return result.rows[0]
}

export async function getUserByEmail(email: string) {
  const result = await sql`SELECT * FROM users WHERE email = ${email}`
  return result.rows[0] ?? null
}
