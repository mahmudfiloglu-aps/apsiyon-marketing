import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AdminClient from './AdminClient'

export default async function AdminPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (session.role !== 'super_admin' && session.role !== 'admin') redirect('/')
  return <AdminClient currentUserRole={session.role} />
}
