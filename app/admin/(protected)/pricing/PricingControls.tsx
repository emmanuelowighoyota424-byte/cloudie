'use client'

import { useState } from 'react'

type Rule={id:string;action:string;pointCost:number;enabled:boolean;reason:string;workspaceId:string|null}

export default function PricingControls({rules}:{rules:Rule[]}){
  const [action,setAction]=useState('')
  const [pointCost,setPointCost]=useState('')
  const [reason,setReason]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  async function createRule(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{const res=await fetch('/api/admin/pricing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,pointCost:Number(pointCost),reason})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to create pricing rule');setMessage('Pricing rule created. Refresh to view the persisted rule.');setAction('');setPointCost('');setReason('')}catch(e){setError(e instanceof Error?e.message:'Unable to create pricing rule')}finally{setBusy(false)}}
  return <div className="mt-6 space-y-4"><form onSubmit={createRule} className="grid gap-3 rounded-xl border bg-background p-4 md:grid-cols-[1fr_160px_2fr_auto]"><input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Action e.g. shipment.create" value={action} onChange={e=>setAction(e.target.value)} required/><input className="rounded-md border bg-background px-3 py-2 text-sm" type="number" min="0" placeholder="Point cost" value={pointCost} onChange={e=>setPointCost(e.target.value)} required/><input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Reason" value={reason} onChange={e=>setReason(e.target.value)} required/><button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy}>{busy?'Saving…':'Create rule'}</button></form>{error&&<p className="text-sm text-destructive">{error}</p>}{message&&<p className="text-sm text-green-600">{message}</p>}<p className="text-xs text-muted-foreground">Pricing changes are persisted in PostgreSQL and recorded in the append-only audit log.</p><div className="rounded-xl border bg-background p-4"><h2 className="font-medium">Active pricing configuration</h2><div className="mt-3 space-y-2">{rules.filter(r=>r.enabled).map(r=><div key={r.id} className="flex items-center justify-between rounded-md border p-3 text-sm"><span>{r.action}{r.workspaceId?` · workspace ${r.workspaceId}`:''}</span><span>{r.pointCost} points</span></div>)}{!rules.some(r=>r.enabled)&&<p className="text-sm text-muted-foreground">No active rules found.</p>}</div></div></div>
}