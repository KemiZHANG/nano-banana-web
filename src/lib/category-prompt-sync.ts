import {
  getCategoryEnglishSubject,
  getCategoryVisualGuidance,
  getRoleCompositionAngle,
  roleGoal,
  type CategoryVisualTarget,
} from './category-visual-guidance'
import { type ProductImageRole } from './types'

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function shortReference(value: string, limit = 420) {
  const normalized = compactWhitespace(value)
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized
}

export function buildSynchronizedCategoryPrompt(input: {
  role: ProductImageRole
  sourcePrompt: string
  sourceCategory: CategoryVisualTarget
  targetCategory: CategoryVisualTarget
  existingPrompts?: string[]
  variantIndex?: number
}) {
  const targetSubject = getCategoryEnglishSubject(input.targetCategory)
  const sourceSubject = getCategoryEnglishSubject(input.sourceCategory)
  const guidance = getCategoryVisualGuidance(input.targetCategory)
  const variantIndex = Math.max(0, Number(input.variantIndex || 0))
  const angle = getRoleCompositionAngle(input.role, variantIndex + (input.existingPrompts?.length || 0))
  const existingSummary = input.existingPrompts?.length
    ? `Make this prompt clearly different from the existing ${input.role} prompts for this category by changing the composition angle, background material, lighting direction, and scene structure.`
    : 'This is the first generated variation of this role for the target category, so make it complete and directly usable.'

  return compactWhitespace([
    `Use the uploaded product reference image as the only product truth source. Generate ${roleGoal(input.role)} for ${targetSubject}.`,
    `Adapt the structure of this source-category prompt from ${sourceSubject}, but do not copy it word for word: ${shortReference(input.sourcePrompt)}.`,
    `Category-specific visual cues for ${targetSubject}: ${guidance}. Distinct composition direction: ${angle}.`,
    existingSummary,
    'Strictly preserve the product packaging shape, cap, label layout, logo, visible text, colors, material, proportions, and all product information exactly as shown in the reference image.',
    'Do not redesign the product, change wording, add fake badges, invent certifications, create medical or exaggerated efficacy claims, or add unsupported before-and-after effects.',
    'The product must stay complete, sharp, readable, visually central, and more important than any person, prop, or background.',
    input.role === 'scene'
      ? 'For skincare, haircare, beauty, and personal-care categories, prefer a natural model with a visible face or visible hair in a believable usage scene when appropriate; do not make it a hand-only scene unless the category truly requires it.'
      : '',
    input.role === 'detail'
      ? 'If on-image text is used, keep it short, clean, natural English only, and limit it to verifiable selling points, usage cues, material, capacity, or packaging information from the product reference.'
      : '',
    'Use realistic premium ecommerce photography, clean controlled lighting, soft shadows, subtle reflections, refined material contrast, and a polished 1:1 square composition.',
  ].filter(Boolean).join(' '))
}
