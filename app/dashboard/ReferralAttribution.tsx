'use client'

import { useEffect } from 'react'

export default function ReferralAttribution() {
  useEffect(() => {
    const code = localStorage.getItem('cloudie-referral-code')
    if (!code) return
    void fetch('/api/referrals/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    }).finally(() => localStorage.removeItem('cloudie-referral-code'))
  }, [])

  return null
}
