import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getModulePermissions } from '@/lib/db'
import ReportsClient from './ReportsClient'

export default async function ReportsPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  const perms = await getModulePermissions(session.userId)
  if (!perms.ad_reports) redirect('/')
  return <ReportsClient />
}
