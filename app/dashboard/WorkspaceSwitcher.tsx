'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const KEY = 'cloudie-workspace-id'
type Workspace = { id: string; name: string; slug: string; plan: string; role: string }
const routes: Record<string,string> = { personal:'/dashboard', shipments:'/shipments', ticketing:'/ticketing', 'business-suite':'/business', services:'/services' }

function workspaceForPath(pathname: string) {
  if (pathname.startsWith('/shipments') || pathname.startsWith('/customer')) return 'shipments'
  if (pathname.startsWith('/ticketing')) return 'ticketing'
  if (pathname.startsWith('/business')) return 'business-suite'
  if (pathname.startsWith('/services')) return 'services'
  return 'personal'
}

export default function WorkspaceSwitcher() {
  const pathname = usePathname()
  const router = useRouter()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const active = useMemo(() => workspaceForPath(pathname), [pathname])

  useEffect(() => {
    void fetch('/api/workspaces').then((r) => r.ok ? r.json() : null).then((data) => {
      const next = Array.isArray(data?.workspaces) ? data.workspaces as Workspace[] : []
      setWorkspaces(next)
      if (!localStorage.getItem(KEY) && next[0]) localStorage.setItem(KEY, next[0].id)
    }).catch(() => {})
  }, [])

  const options = [
    { id:'personal', name:'Personal' },
    { id:'shipments', name:'Shipments' },
    { id:'ticketing', name:'Ticketing' },
    { id:'business-suite', name:'Business Suite' },
    { id:'services', name:'Services' },
  ]

  return <label className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs shadow-sm">
    <span className="hidden text-muted-foreground sm:inline">Workspace</span>
    <select value={active} onChange={(event) => {
      const id = event.target.value
      if (workspaces[0]) localStorage.setItem(KEY, workspaces[0].id)
      window.dispatchEvent(new CustomEvent('cloudie:workspace', { detail: id }))
      router.push(routes[id] ?? '/dashboard')
    }} className="min-w-0 bg-transparent font-medium outline-none">
      {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>
  </label>
}
