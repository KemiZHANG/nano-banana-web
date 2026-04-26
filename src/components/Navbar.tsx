'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isAdminEmail } from '@/lib/admin'

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/outputs', label: 'Outputs' },
  { href: '/settings', label: 'Settings' },
]

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const visibleLinks = isAdminEmail(userEmail)
    ? [...NAV_LINKS, { href: '/admin/authorized-emails', label: 'Admin' }]
    : NAV_LINKS

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-stone-700 bg-stone-950/95 shadow-sm backdrop-blur">
      <div className="h-1 bg-amber-400" />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold text-stone-50">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-400/15 text-xl shadow-sm ring-1 ring-amber-400/30">
              🍌
            </span>
            <span className="tracking-tight">Nano Banana</span>
          </Link>

          <div className="hidden items-center gap-1 sm:flex">
            {visibleLinks.map((link) => {
              const isActive =
                link.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-amber-400/15 text-amber-200'
                      : 'text-stone-400 hover:bg-stone-800 hover:text-stone-50'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="hidden max-w-[260px] truncate text-sm text-stone-400 md:inline">
              {userEmail}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="rounded-md border border-stone-700 px-3 py-1.5 text-sm font-medium text-stone-300 transition-colors hover:bg-stone-800 hover:text-stone-50"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-t border-stone-800 px-4 py-2 sm:hidden">
        {visibleLinks.map((link) => {
          const isActive =
            link.href === '/'
              ? pathname === '/'
              : pathname.startsWith(link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-amber-400/15 text-amber-200'
                  : 'text-stone-400 hover:bg-stone-800'
              }`}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
