import { getCategoryVisualGuidance, roleGoal } from './category-visual-guidance'
import { normalizeProductImageRole, type ProductImageRole } from './types'

export const PROMPT_GENERATOR_MODEL = 'gemini-3-flash-preview'

export type PromptGeneratorInput = {
  categoryName: string
  categorySlug: string
  productType?: string
  imageRole?: string
  imageStyle?: string
  peopleMode?: string
  displayMethod?: string
  extraInfo?: string
  existingPrompts?: string[]
}

function roleSpecificDirection(role: ProductImageRole | null) {
  if (role === 'main') {
    return [
      'Create a premium product-first main image.',
      'Avoid a flat copy of the source photo. Improve the ecommerce presentation with a refined background, display surface, controlled lighting, soft shadow, and subtle reflection.',
      'Keep the product readable as a marketplace thumbnail.',
    ].join(' ')
  }

  if (role === 'scene') {
    return [
      'Create a realistic lifestyle usage scene.',
      'For skincare, haircare, beauty, and personal-care products, prefer a natural model with a visible face or visible hair when appropriate, especially for face-care and hair-care categories.',
      'The model should demonstrate context and mood, but the product must remain visible, readable, and more important than the person.',
    ].join(' ')
  }

  if (role === 'detail') {
    return [
      'Create a detail or infographic image for ecommerce.',
      'Show verified selling points, texture, material, capacity, usage cues, or packaging information in a clean structured layout.',
      'Use only short natural English text if text is needed, and never invent claims.',
    ].join(' ')
  }

  return 'Create a premium ecommerce product image with a clear, useful, and compliant visual purpose.'
}

function existingPromptExamples(prompts?: string[]) {
  if (!prompts?.length) return 'No existing prompt examples.'
  return prompts
    .slice(0, 8)
    .map((prompt, index) => `Existing prompt ${index + 1}: ${prompt}`)
    .join('\n\n')
}

export function buildPromptGeneratorInstruction() {
  return [
    'You are a senior ecommerce product image prompt architect.',
    'You write production-ready prompts for Gemini image generation / Nano Banana style image editing.',
    '',
    'A strong prompt must include these modules:',
    '1. Product fidelity: preserve the exact product packaging, logo, label layout, visible text, colors, material, proportions, and all product information.',
    '2. Category context: use visual cues that fit the target category.',
    '3. Composition: define background, scene structure, camera angle, depth, thumbnail readability, and product placement.',
    '4. Lighting and material: define light direction, shadow, reflection, texture, and premium commercial finish.',
    '5. People policy: models may support usage context, but they must not cover the product or become the primary subject.',
    '6. Compliance: do not invent certifications, clinical claims, medical claims, before-after effects, fake badges, or unsupported ingredient facts.',
    '7. Variation: the new prompt must be meaningfully different from existing prompts of the same role. Change the composition angle, lighting setup, prop material, scene structure, or detail layout.',
    '',
    'Output rules:',
    '- Return exactly one finished English prompt paragraph.',
    '- Do not return Chinese.',
    '- Do not output headings, bullets, JSON, markdown, explanation, alternatives, or quotation marks.',
    '- Keep it specific enough to produce a polished ecommerce image, but not so decorative that the product is altered.',
    '- End with: Use a 1:1 square composition.',
  ].join('\n')
}

export function buildPromptGeneratorUserPrompt(input: PromptGeneratorInput) {
  const role = normalizeProductImageRole(input.imageRole || input.imageStyle)
  const category = { name_zh: input.categoryName, slug: input.categorySlug }
  const roleName = role || 'custom'

  return [
    'Generate one new category image prompt.',
    '',
    `Target category: ${input.categoryName} (${input.categorySlug})`,
    `Image role: ${roleName} - ${roleGoal(role)}`,
    `Category visual cues: ${getCategoryVisualGuidance(category)}`,
    `Product type: ${input.productType || input.categoryName}`,
    `User style notes: ${input.imageStyle || 'premium ecommerce photography, clean, realistic, refined, visually polished'}`,
    `User people notes: ${input.peopleMode || 'Follow the role-specific people policy. For scene images, visible face or visible hair is preferred when it fits the category.'}`,
    `User scene/display notes: ${input.displayMethod || 'Use a refined display structure, clean background depth, and category-appropriate props.'}`,
    `Extra constraints: ${input.extraInfo || 'None'}`,
    '',
    `Role-specific direction: ${roleSpecificDirection(role)}`,
    '',
    'Existing prompts from this category and role. Learn the constraints, but do not copy or paraphrase them:',
    existingPromptExamples(input.existingPrompts),
    '',
    'Hard requirements for the new prompt:',
    '- Use the uploaded product reference image as the only product truth source.',
    '- Preserve product appearance, packaging, logo, wording, label layout, color, and proportion exactly.',
    '- The prompt must be more visually useful than a plain background copy.',
    '- The new prompt must have a distinct composition from the existing prompt examples.',
    '- Keep the result realistic, premium, clean, compliant, and suitable for marketplace ecommerce.',
  ].join('\n')
}

export function cleanGeneratedPrompt(text: string) {
  return text
    .replace(/^```(?:\w+)?/i, '')
    .replace(/```$/i, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^final prompt[:：]\s*/i, '')
    .replace(/^prompt[:：]\s*/i, '')
    .trim()
}
