'use client'

import { useEffect, useMemo, useState } from 'react'

type Workspace={id:string;name:string;slug:string;plan:string;subscriptionStatus:string;role:string}
type Data={staff:any[];departments:any[];invoices:any[];customers:any[];products:any[];orders:any[]}

export function BusinessSuiteClient({workspaces}:{workspaces:Workspace[]}) {
  const [selected,setSelected]=useState(workspaces[0]?.id??'')
  const [data,setData]=useState<Data|null>(null)
  const [message,setMessage]=useState('')
  const [department,setDepartment]=useState('')
  const [invoiceNumber,setInvoiceNumber]=useState('')
  const [invoiceSubtotal,setInvoiceSubtotal]=useState('')
  const [busy,setBusy]=useState(false)
  const workspace=useMemo(()=>workspaces.find(w=>w.id===selected),[selected,workspaces])

  async function load(id:string) {
    if(!id)return
    try { const r=await fetch(`/api/workspaces/${id}/business`,{cache:'no-store'}); const d=await r.json().catch(()=>null); if(!r.ok)throw new Error(d?.error??'Unable to load Business Suite'); setData(d); setMessage('') } catch(e) { setMessage(e instanceof Error?e.message:'Unable to load Business Suite') }
  }
  useEffect(()=>{void load(selected)},[selected])

  async function action(body:Record<string,unknown>) {
    if(!selected)return
    setBusy(true);setMessage('')
    try { const r=await fetch(`/api/workspaces/${selected}/business`,{method:'POST',headers:{'content-type':'application/json','idempotency-key':`business-ui:${crypto.randomUUID()}`},body:JSON.stringify(body)});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error??'Operation failed');await load(selected);return d } catch(e){setMessage(e instanceof Error?e.message:'Operation failed')} finally{setBusy(false)}
  }

  async function createDepartment(){const name=department.trim();if(!name)return setMessage('Department name is required.');await action({action:'department',name});setDepartment('')}
  async function createInvoice(){const subtotal=Number(invoiceSubtotal);if(!invoiceNumber.trim()||!Number.isFinite(subtotal)||subtotal<0)return setMessage('Enter an invoice number and valid subtotal.');await action({action:'invoice',number:invoiceNumber.trim(),currency:'USD',subtotal,tax:0,items:[{description:'Cloudie business service',quantity:1,unitPrice:subtotal}]});setInvoiceNumber('');setInvoiceSubtotal('')}

  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-muted-foreground">Cloudie / Business Suite</p><h1 className="text-3xl font-semibold">Business Suite</h1><p className="mt-1 text-sm text-muted-foreground">Workspace operations, customer portals, invoices, staff and tenant controls.</p></div>{workspaces.length>0&&<select aria-label="Business workspace" value={selected} onChange={e=>setSelected(e.target.value)} className="min-h-11 rounded-lg border bg-background px-3 text-sm">{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>}</header>
    {message&&<p role="status" className="rounded-lg bg-muted p-3 text-sm">{message}</p>}
    {workspace&&<>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border bg-background p-5"><p className="text-xs text-muted-foreground">Plan</p><p className="mt-2 font-semibold">{workspace.plan} · {workspace.subscriptionStatus}</p></div><div className="rounded-xl border bg-background p-5"><p className="text-xs text-muted-foreground">Customers</p><p className="mt-2 text-2xl font-semibold">{data?.customers.length??'—'}</p></div><div className="rounded-xl border bg-background p-5"><p className="text-xs text-muted-foreground">Invoices</p><p className="mt-2 text-2xl font-semibold">{data?.invoices.length??'—'}</p></div><div className="rounded-xl border bg-background p-5"><p className="text-xs text-muted-foreground">Orders</p><p className="mt-2 text-2xl font-semibold">{data?.orders.length??'—'}</p></div></section>
      <section className="grid gap-4 md:grid-cols-2"><article className="rounded-xl border bg-background p-5"><h2 className="font-semibold">Customer portal</h2><p className="mt-2 text-sm text-muted-foreground">Authenticated and workspace-isolated tenant portal.</p><a href={`/business/${workspace.slug}`} className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Open portal</a></article><article className="rounded-xl border bg-background p-5"><h2 className="font-semibold">KYC</h2><p className="mt-2 text-sm text-muted-foreground">Submit and review identity records through Cloudie’s internal workflow.</p><a href="/kyc" className="mt-4 inline-block rounded-lg border px-4 py-2 text-sm font-medium">Open KYC</a></article></section>
      <section className="grid gap-4 lg:grid-cols-2"><article className="rounded-xl border bg-background p-5"><h2 className="font-semibold">Departments</h2><div className="mt-3 flex gap-2"><input value={department} onChange={e=>setDepartment(e.target.value)} placeholder="Department name" className="min-h-10 flex-1 rounded-lg border bg-background px-3 text-sm"/><button disabled={busy} onClick={createDepartment} className="rounded-lg bg-foreground px-4 text-sm text-background disabled:opacity-50">Add</button></div><div className="mt-4 space-y-2">{data?.departments?.map((d:any)=><div key={d.id} className="rounded-lg bg-muted/50 p-3 text-sm">{d.name}</div>)}{!data?.departments?.length&&<p className="text-sm text-muted-foreground">No departments yet.</p>}</div></article>
      <article className="rounded-xl border bg-background p-5"><h2 className="font-semibold">Create invoice</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><input value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)} placeholder="Invoice number" className="min-h-10 rounded-lg border bg-background px-3 text-sm"/><input value={invoiceSubtotal} onChange={e=>setInvoiceSubtotal(e.target.value)} inputMode="decimal" placeholder="Subtotal (USD)" className="min-h-10 rounded-lg border bg-background px-3 text-sm"/></div><button disabled={busy} onClick={createInvoice} className="mt-3 rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">Create invoice</button><div className="mt-4 space-y-2">{data?.invoices?.slice(0,5).map((i:any)=><div key={i.id} className="flex justify-between rounded-lg bg-muted/50 p-3 text-sm"><span>{i.number}</span><span>{i.total} {i.currency}</span></div>)}</div></article></section>
      <section className="rounded-xl border bg-background p-5"><h2 className="font-semibold">Operations</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Staff</p><p className="mt-1 font-semibold">{data?.staff.length??'—'}</p></div><div className="rounded-lg bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Departments</p><p className="mt-1 font-semibold">{data?.departments.length??'—'}</p></div><div className="rounded-lg bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Products</p><p className="mt-1 font-semibold">{data?.products.length??'—'}</p></div><div className="rounded-lg bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Workspace role</p><p className="mt-1 font-semibold">{workspace.role}</p></div></div></section>
    </>}
  </div>
}
