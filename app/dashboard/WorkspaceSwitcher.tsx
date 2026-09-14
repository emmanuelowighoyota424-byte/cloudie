'use client'

import { useEffect, useState } from 'react'

const KEY = 'cloudie-workspace-id'

type Workspace = { id: string; name: string; slug: string; plan: string; role: string }

export default function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selected, setSelected] = useState('')

  useEffect(() => {
    setSelected(localStorage.getItem(KEY) || '')
    void fetch('/api/workspaces').then((r) => r.ok ? r.json() : null).then((data) => {
      const next = Array.isArray(data?.workspaces) ? data.workspaces as Workspace[] : []
      setWorkspaces(next)
      if (!localStorage.getItem(KEY) && next[0]) localStorage.setItem(KEY, next[0].id)
    }).catch(() => {})
  }, [])

  if (workspaces.length < 2) return null
  return <label className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs">
    <span className="text-muted-foreground">Workspace</span>
    <select value={selected} onChange={(event) => { const id = event.target.value; setSelected(id); localStorage.setItem(KEY, id); window.dispatchEvent(new Event('cloudie:workspace')); }} className="bg-transparent font-medium outline-none">
      {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
    </select>
  </label>
}
