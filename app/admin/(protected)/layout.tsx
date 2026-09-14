import { redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/authorization'
import AdminSidebar from '../AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try { await requireSuperAdmin() } catch { redirect('/admin/login') }
  return <div className="min-h-screen bg-muted/30">
    <AdminSidebar />
    <div>
      <header className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <form action="/admin" className="flex-1"><input name="q" placeholder="Search authorized resources…" className="h-10 w-full max-w-xl rounded-lg border bg-muted/40 px-3 text-sm" /></form>
        </div>
      </header>
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  </div>
}