'use client'
import { useState } from 'react'
export function NotificationsControls({id}:{id:string}){const [busy,setBusy]=useState(false);async function mark(){setBusy(true);await fetch('/api/notifications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})});location.reload()}return <button disabled={busy} onClick={mark} className="rounded-md border px-2 py-1 text-xs">{busy?'Saving…':'Mark read'}</button>}
