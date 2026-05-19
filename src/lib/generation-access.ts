import { isAdminEmail } from './admin'
import { isResumeEdition } from './app-edition'
import { isBuiltinKeyEmailAuthorized } from './builtin-key-access'
import { isValidGeminiApiKey, parseStoredGeminiSettings, readBuiltinGeminiApiKey } from './gemini-settings'
import { isValidOpenAIApiKey, readOpenAIImageApiKey } from './openai-image'

type SupabaseForGenerationAccess = {
  from: (table: 'system_settings') => {
    select: (columns: string) => {
      eq: (column: 'user_id', value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>
      }
    }
  }
}

export const AI_ACCESS_ERROR = 'AI generation is not available for this account. Use the built-in public trial or add your own valid API key in Settings.'

export async function getGenerationAccess(
  supabaseClient: unknown,
  userId: string,
  userEmail?: string | null
) {
  const supabase = supabaseClient as SupabaseForGenerationAccess
  const { data: settings } = await supabase
    .from('system_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  const stored = parseStoredGeminiSettings(settings?.gemini_api_key_encrypted as string | null | undefined)
  const admin = isAdminEmail(userEmail)
  const passwordVerified = Boolean(settings?.use_builtin_key && settings?.builtin_key_password_verified)
  const hasOwnGeminiKey = isValidGeminiApiKey(stored.apiKey)
  const hasOwnOpenAIKey = isValidOpenAIApiKey(stored.openaiApiKey)
  const hasBuiltinGeminiKey = isValidGeminiApiKey(readBuiltinGeminiApiKey())
  const hasBuiltinOpenAIKey = isValidOpenAIApiKey(readOpenAIImageApiKey())
  const emailAuthorized = isResumeEdition() ? false : await isBuiltinKeyEmailAuthorized(userEmail)

  if (isResumeEdition()) {
    return {
      allowed: hasOwnGeminiKey || hasOwnOpenAIKey || hasBuiltinGeminiKey || hasBuiltinOpenAIKey,
      admin: false,
      emailAuthorized: false,
      passwordVerified: false,
      hasOwnGeminiKey,
      hasOwnOpenAIKey,
    }
  }

  const canUseBuiltin = admin || emailAuthorized || passwordVerified

  return {
    allowed: hasOwnGeminiKey || hasOwnOpenAIKey || (canUseBuiltin && (hasBuiltinGeminiKey || hasBuiltinOpenAIKey)),
    admin,
    emailAuthorized,
    passwordVerified,
    hasOwnGeminiKey,
    hasOwnOpenAIKey,
  }
}
