import { isResumeEdition } from './app-edition'
import { encodeStoredGeminiSettings, parseStoredGeminiSettings } from './gemini-settings'

export const RESUME_TRIAL_ERROR_CODE = 'RESUME_TRIAL_LIMIT_REACHED'

type SupabaseForTrial = {
  from: (table: 'system_settings') => {
    select: (columns: string) => {
      eq: (column: 'user_id', value: string) => {
        maybeSingle: () => Promise<{
          data: {
            id?: string
            user_id?: string
            gemini_api_key_encrypted?: string | null
            use_builtin_key?: boolean
            builtin_key_password_verified?: boolean
          } | null
          error?: { message: string } | null
        }>
      }
    }
    insert: (row: Record<string, unknown>) => {
      select: () => {
        single: () => Promise<{ data: unknown; error?: { message: string } | null }>
      }
    }
    update: (row: Record<string, unknown>) => {
      eq: (column: 'user_id', value: string) => Promise<{ error?: { message: string } | null }>
    }
  }
}

export type GenerationAccessForTrial = {
  hasOwnGeminiKey?: boolean
  hasOwnOpenAIKey?: boolean
}

export function getResumeTrialLimit() {
  const parsed = Math.floor(Number(process.env.RESUME_TRIAL_LIMIT || 5))
  if (!Number.isFinite(parsed)) return 5
  return Math.min(Math.max(parsed, 0), 100)
}

export function getResumeTrialErrorMessage(limit = getResumeTrialLimit()) {
  return limit > 0
    ? `Public demo trial limit reached. This account can use the built-in Gemini key ${limit} times. Add your own API key in Settings to continue.`
    : 'The built-in Gemini demo key is not available. Add your own API key in Settings to continue.'
}

export function needsResumeBuiltinTrial(access: GenerationAccessForTrial, provider: 'gemini' | 'openai' = 'gemini') {
  if (!isResumeEdition()) return false
  return provider === 'openai' ? !access.hasOwnOpenAIKey : !access.hasOwnGeminiKey
}

export function buildResumeTrialStatus(encryptedSettings: string | null | undefined) {
  const limit = getResumeTrialLimit()
  const stored = parseStoredGeminiSettings(encryptedSettings)
  const used = Math.max(0, Math.floor(Number(stored.resumeTrialUsed || 0)))
  return {
    limit,
    used,
    remaining: Math.max(limit - used, 0),
  }
}

export async function consumeResumeTrial(
  supabaseClient: unknown,
  userId: string,
  units = 1
) {
  if (!isResumeEdition()) {
    return { allowed: true, status: null as ReturnType<typeof buildResumeTrialStatus> | null }
  }

  const supabase = supabaseClient as SupabaseForTrial
  const safeUnits = Math.max(1, Math.floor(Number(units || 1)))
  const { data: settings, error } = await supabase
    .from('system_settings')
    .select('id,user_id,gemini_api_key_encrypted,use_builtin_key,builtin_key_password_verified')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    return {
      allowed: false,
      status: null,
      error: error.message,
      code: RESUME_TRIAL_ERROR_CODE,
    }
  }

  const currentStatus = buildResumeTrialStatus(settings?.gemini_api_key_encrypted)
  if (currentStatus.limit <= 0 || currentStatus.used + safeUnits > currentStatus.limit) {
    return {
      allowed: false,
      status: currentStatus,
      error: getResumeTrialErrorMessage(currentStatus.limit),
      code: RESUME_TRIAL_ERROR_CODE,
    }
  }

  const stored = parseStoredGeminiSettings(settings?.gemini_api_key_encrypted)
  const nextSettings = encodeStoredGeminiSettings({
    ...stored,
    resumeTrialUsed: currentStatus.used + safeUnits,
    resumeTrialUpdatedAt: new Date().toISOString(),
  })

  const result = settings
    ? await supabase
        .from('system_settings')
        .update({
          gemini_api_key_encrypted: nextSettings,
          use_builtin_key: true,
        })
        .eq('user_id', userId)
    : await supabase
        .from('system_settings')
        .insert({
          user_id: userId,
          gemini_api_key_encrypted: nextSettings,
          use_builtin_key: true,
          builtin_key_password_verified: false,
        })
        .select()
        .single()

  if (result.error) {
    return {
      allowed: false,
      status: currentStatus,
      error: result.error.message,
      code: RESUME_TRIAL_ERROR_CODE,
    }
  }

  return {
    allowed: true,
    status: {
      ...currentStatus,
      used: currentStatus.used + safeUnits,
      remaining: Math.max(currentStatus.limit - currentStatus.used - safeUnits, 0),
    },
  }
}
