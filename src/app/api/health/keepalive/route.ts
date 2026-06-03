import { NextResponse } from 'next/server'
import { getAppEdition } from '@/lib/app-edition'
import { logServerEvent } from '@/lib/observability'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const HEALTH_TIMEOUT_MS = 10000

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error('Supabase health check timed out')), timeoutMs)
    }),
  ])
}

function readableError(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Unknown error')
  }
  return 'Unknown error'
}

export async function GET() {
  const startedAt = Date.now()
  const edition = getAppEdition()

  try {
    const supabase = getServerSupabase()
    const { error, count } = await withTimeout(
      supabase
        .from('categories')
        .select('id', { head: true, count: 'exact' }),
      HEALTH_TIMEOUT_MS
    )

    if (error) {
      logServerEvent('warn', 'health.keepalive_failed', {
        edition,
        reason: error.message,
      })
      return NextResponse.json({
        ok: false,
        edition,
        service: 'supabase',
        error: error.message,
        checked_at: new Date().toISOString(),
      }, { status: 503 })
    }

    logServerEvent('info', 'health.keepalive_ok', {
      edition,
      elapsed_ms: Date.now() - startedAt,
    })

    return NextResponse.json({
      ok: true,
      edition,
      service: 'supabase',
      category_count: count,
      elapsed_ms: Date.now() - startedAt,
      checked_at: new Date().toISOString(),
    })
  } catch (error) {
    const message = readableError(error)
    logServerEvent('error', 'health.keepalive_exception', {
      edition,
      reason: message,
    })
    return NextResponse.json({
      ok: false,
      edition,
      service: 'supabase',
      error: message,
      checked_at: new Date().toISOString(),
    }, { status: 503 })
  }
}
