'use client'

import { useState } from 'react'

export default function JobControls({jobs}:{jobs:Array<{id:string;type:string;attempts:number;lastError:string|null}>}){
 const [busy,setBusy]=useState<string|null>(null); const [message,setMessage]=useState('')
 async function requeue(id:string){setBusy(id);setMessage('');try{const r=await fetch('/api/admin/system-health/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:id})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to requeue job');setMessage(`Job ${id} requeued. Refresh to confirm the new state.`)}catch(e){setMessage(e instanceof Error?e.message:'Unable to requeue job')}finally{setBusy(null)}}
 return <div className="mt-6 rounded-xl border bg-background p-4"><div className="flex items-center justify-between"><h2 className="font-medium">Failed background jobs</h2><span className="text-xs text-muted-foreground">Manual requeue is audited</span></div><div className="mt-3 space-y-2">{jobs.map(j=><div key={j.id} className="flex flex-col gap-3 rounded-md border p-3 text-sm md:flex-row md:items-center md:justify-between"><div><div className="font-medium">{j.type}</div><div className="text-xs text-muted-foreground">{j.id} · attempts {j.attempts}{j.lastError?` · ${j.lastError.slice(0,160)}`:''}</div></div><button onClick={()=>requeue(j.id)} disabled={busy===j.id} className="rounded-md border px-3 py-2 disabled:opacity-50">{busy===j.id?'Requeueing…':'Requeue'}</button></div>)}{!jobs.length&&<p className="text-sm text-muted-foreground">No failed jobs.</p>}</div>{message&&<p className="mt-3 text-sm text-muted-foreground">{message}</p>}</div>
}
