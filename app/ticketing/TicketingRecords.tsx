'use client'
import { useEffect, useState } from 'react'

const config = {
  flights: { type: 'flight', title: 'Flights', fields: ['Passenger name','Airline','Flight number','Departure airport','Arrival airport','Departure date/time','Arrival date/time','Booking/reference','Cabin/class','Status'] },
  hotels: { type: 'hotel', title: 'Hotels', fields: ['Guest name','Hotel','Address','Check-in','Check-out','Reservation number','Room type','Guests','Rate','Currency','Payment status','Status'] },
  bookings: { type: 'booking', title: 'Bookings', fields: ['Booking type','Booking reference','Customer/passenger','Provider','Start date','End date','Route / location','Amount','Currency','Status','Notes'] },
  invoices: { type: 'invoice', title: 'Invoices', fields: ['Customer','Invoice number','Invoice date','Due date','Line items','Subtotal','Taxes','Discount','Total','Currency','Status','Notes'] },
  'financial-records': { type: 'financial_record', title: 'Financial Records', fields: ['Category','Reference','Description','Amount','Currency','Date','Status','Notes'] },
} as const

type Key = keyof typeof config
type Row = { id:string; type:string; title:string; payload:Record<string,unknown>; documentId:string|null; pointsCharged:number; createdAt:string }

export function TicketingRecords({ workspaceId, section }: { workspaceId:string; section:Key }) {
  const spec = config[section]
  const [rows,setRows] = useState<Row[]>([])
  const [values,setValues] = useState<Record<string,string>>({})
  const [query,setQuery] = useState('')
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [selected,setSelected] = useState<Row|null>(null)

  async function load() {
    const params = new URLSearchParams({ workspaceId, type: spec.type })
    if (query.trim()) params.set('q',query.trim())
    const r = await fetch(`/api/ticketing/records?${params}`,{cache:'no-store'})
    const data = await r.json().catch(()=>null)
    if (r.ok) setRows(Array.isArray(data?.records) ? data.records : [])
    else setMessage(data?.error ?? 'Unable to load records')
  }
  useEffect(()=>{ void load() },[workspaceId,section])

  async function createRecord() {
    if (!Object.values(values).some(Boolean)) { setMessage('Enter at least one field.'); return }
    setBusy(true); setMessage('')
    try {
      const r = await fetch('/api/ticketing/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId,type:spec.type,title:`${spec.title.slice(0,-1) || spec.title} record`,payload:values,idempotencyKey:`${spec.type}:${crypto.randomUUID()}`})})
      const data=await r.json().catch(()=>null)
      if (!r.ok) throw new Error(data?.error ?? 'Unable to save record')
      setValues({}); setMessage('Record saved.'); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save record') } finally { setBusy(false) }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">{spec.title}</h1><p className="text-sm text-muted-foreground">Persistent workspace-scoped records with ownership enforcement.</p></div><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void load()}} placeholder="Search" className="min-h-10 rounded-lg border bg-background px-3 text-sm" /></div>
    <section className="rounded-xl border bg-background p-5"><h2 className="font-medium">Create record</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{spec.fields.map(field=><label key={field} className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">{field}</span><input value={values[field]??''} onChange={e=>setValues(v=>({...v,[field]:e.target.value}))} className="min-h-10 w-full rounded-lg border bg-background px-3 py-2" /></label>)}</div><div className="mt-4 flex items-center gap-3"><button onClick={createRecord} disabled={busy} className="rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">{busy?'Saving…':'Save record'}</button>{message&&<span role="status" className="text-sm text-muted-foreground">{message}</span>}</div></section>
    <section className="rounded-xl border bg-background"><div className="border-b p-4 font-medium">Saved records</div><div className="divide-y">{rows.length ? rows.map(row=><button key={row.id} onClick={()=>setSelected(row)} className="block w-full p-4 text-left hover:bg-muted/30"><div className="flex flex-wrap justify-between gap-3"><span className="font-medium">{row.title}</span><span className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span></div><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{Object.entries(row.payload??{}).filter(([,v])=>v).map(([k,v])=>`${k}: ${String(v)}`).join(' · ')}</p></button>) : <p className="p-6 text-sm text-muted-foreground">No records yet.</p>}</div></section>
    {selected&&<section className="rounded-xl border bg-muted/30 p-5"><div className="flex justify-between gap-3"><h2 className="font-medium">Record details</h2><button onClick={()=>setSelected(null)} className="text-sm underline">Close</button></div><div className="mt-4 grid gap-2 text-sm">{Object.entries(selected.payload??{}).map(([k,v])=><div key={k} className="flex justify-between gap-4 border-b pb-2"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{String(v)}</span></div>)}</div></section>}
  </div>
}
