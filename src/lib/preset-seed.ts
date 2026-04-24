import type { SupabaseClient } from '@supabase/supabase-js'
import { PRESET_CATEGORIES } from './presets'

export async function ensurePresetCategoriesForUser(
  supabase: SupabaseClient,
  userId: string
) {
  const { data: existingCategories, error: existingError } = await supabase
    .from('categories')
    .select('id, slug')
    .eq('user_id', userId)

  if (existingError) {
    throw existingError
  }

  const existingBySlug = new Map(
    (existingCategories || []).map((category) => [category.slug, category.id])
  )
  const missingPresets = PRESET_CATEGORIES.filter((preset) => !existingBySlug.has(preset.slug))

  if (missingPresets.length === 0) {
    return
  }

  const rows = missingPresets.map((preset) => ({
    user_id: userId,
    name_zh: preset.name_zh,
    slug: preset.slug,
    icon: preset.icon,
    sort_order: PRESET_CATEGORIES.findIndex((category) => category.slug === preset.slug),
    is_preset: true,
  }))

  const { data: insertedCategories, error: categoryError } = await supabase
    .from('categories')
    .insert(rows)
    .select('id, slug')

  if (categoryError) {
    throw categoryError
  }

  const insertedBySlug = new Map(
    (insertedCategories || []).map((category) => [category.slug, category.id])
  )
  const promptRows = missingPresets.flatMap((preset) => {
    const categoryId = insertedBySlug.get(preset.slug)
    if (!categoryId) return []

    return preset.prompts.map((prompt) => ({
      category_id: categoryId,
        prompt_number: prompt.prompt_number,
        prompt_text: prompt.prompt_text,
    }))
  })

  if (promptRows.length > 0) {
    const { error: promptInsertError } = await supabase
      .from('category_prompts')
      .insert(promptRows)

    if (promptInsertError) {
      throw promptInsertError
    }
  }
}
