import { NextResponse } from 'next/server'
import { listBlogPosts } from '@/lib/db'

export async function GET() {
  const posts = await listBlogPosts()
  return NextResponse.json({ posts })
}
