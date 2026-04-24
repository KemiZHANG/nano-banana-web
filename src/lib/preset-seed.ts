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

  for (let index = 0; index < PRESET_CATEGORIES.length; index++) {
    const preset = PRESET_CATEGORIES[index]
    let categoryId = existingBySlug.get(preset.slug)

    if (!categoryId) {
      const { data: category, error: categoryError } = await supabase
        .from('categories')
        .insert({
          user_id: userId,
          name_zh: preset.name_zh,
          slug: preset.slug,
          icon: preset.icon,
          sort_order: index,
          is_preset: true,
        })
        .select('id')
        .single()

      if (categoryError) {
        throw categoryError
      }

      categoryId = category.id
    }

    const { data: existingPrompts, error: promptReadError } = await supabase
      .from('category_prompts')
      .select('prompt_number')
      .eq('category_id', categoryId)

    if (promptReadError) {
      throw promptReadError
    }

    const existingPromptNumbers = new Set(
      (existingPrompts || []).map((prompt) => prompt.prompt_number)
    )
    const missingPrompts = preset.prompts
      .filter((prompt) => !existingPromptNumbers.has(prompt.prompt_number))
      .map((prompt) => ({
        category_id: categoryId,
        prompt_number: prompt.prompt_number,
        prompt_text: prompt.prompt_text,
      }))

    if (missingPrompts.length > 0) {
      const { error: promptInsertError } = await supabase
        .from('category_prompts')
        .insert(missingPrompts)

      if (promptInsertError) {
        throw promptInsertError
      }
    }
  }
}
