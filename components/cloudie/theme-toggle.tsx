'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    document.documentElement.classList.toggle('light', !next)
    localStorage.setItem('cloudie-theme', next ? 'dark' : 'light')
    setDark(next)
  }

  return (
    <button type="button" onClick={toggle} aria-label={dark ? 'Use light theme' : 'Use dark theme'} className="inline-flex size-9 items-center justify-center rounded-xl border bg-background/80 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
