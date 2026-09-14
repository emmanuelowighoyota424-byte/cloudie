import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { TicketingRecords } from '../TicketingRecords'

const sections = new Set(['flights','hotels','bookings','invoices','financial-records'])
type Props = { params: Promise<{ section:string }> }

export default async function TicketingSectionPage({ params }: Props) {
  const { section } = await params
  if (!sections.has(section)) notFound()
  const user = await requireUser()
  const membership = await prisma.workspaceMember.findFirst({ where:{ userId:user.id, status:'ACTIVE' }, orderBy:{ createdAt:'asc' }, select:{ workspaceId:true } })
  if (!membership) return <div className="rounded-xl border bg-background p-6">Create or join a workspace to use Ticketing.</div>
  return <TicketingRecords workspaceId={membership.workspaceId} section={section as 'flights'|'hotels'|'bookings'|'invoices'|'financial-records'} />
}
