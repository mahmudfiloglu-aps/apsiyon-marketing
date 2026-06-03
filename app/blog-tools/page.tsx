import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import BlogToolsClient from './BlogToolsClient'

export default async function BlogToolsPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  return <BlogToolsClient userRole={session.role} />
}
