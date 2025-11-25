/**
 * Prompt Templates for AI Image Generation
 * Pre-built prompts for different art styles and use cases
 */

export interface PromptTemplate {
  id: string
  name: string
  category: string
  prompt: string
  description: string
  tags: string[]
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'logo-cyber',
    name: 'Cyberpunk Logo',
    category: 'Logo',
    prompt: 'Create a logo of a cybernetic cat with neon blue eyes, dark background, futuristic design, minimalist',
    description: 'Futuristic cyberpunk-style logo with neon accents',
    tags: ['logo', 'cyberpunk', 'futuristic', 'neon'],
  },
  {
    id: 'abstract-art',
    name: 'Abstract Art',
    category: 'Art',
    prompt: 'Abstract geometric art with vibrant colors, modern style, clean lines, bold shapes',
    description: 'Modern abstract geometric artwork',
    tags: ['abstract', 'geometric', 'modern', 'colorful'],
  },
  {
    id: 'nature-scene',
    name: 'Nature Scene',
    category: 'Nature',
    prompt: 'Beautiful landscape with mountains and lake, sunset colors, peaceful atmosphere, detailed',
    description: 'Serene nature landscape',
    tags: ['nature', 'landscape', 'peaceful', 'detailed'],
  },
  {
    id: 'tech-icon',
    name: 'Tech Icon',
    category: 'Icon',
    prompt: 'Modern tech icon design, clean and minimalist, gradient colors, professional',
    description: 'Professional tech icon',
    tags: ['icon', 'tech', 'minimalist', 'professional'],
  },
  {
    id: 'character-design',
    name: 'Character Design',
    category: 'Character',
    prompt: 'Cute character design, friendly expression, colorful, cartoon style, appealing',
    description: 'Friendly cartoon character',
    tags: ['character', 'cartoon', 'cute', 'colorful'],
  },
  {
    id: 'pattern-design',
    name: 'Pattern Design',
    category: 'Pattern',
    prompt: 'Repeating geometric pattern, symmetrical, elegant, suitable for textile or wallpaper',
    description: 'Elegant repeating pattern',
    tags: ['pattern', 'geometric', 'repeating', 'elegant'],
  },
]

export const PROMPT_CATEGORIES = [
  'All',
  'Logo',
  'Art',
  'Nature',
  'Icon',
  'Character',
  'Pattern',
]

export function getTemplatesByCategory(category: string): PromptTemplate[] {
  if (category === 'All') return PROMPT_TEMPLATES
  return PROMPT_TEMPLATES.filter(t => t.category === category)
}

export function searchTemplates(query: string): PromptTemplate[] {
  const lowerQuery = query.toLowerCase()
  return PROMPT_TEMPLATES.filter(
    template =>
      template.name.toLowerCase().includes(lowerQuery) ||
      template.description.toLowerCase().includes(lowerQuery) ||
      template.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  )
}

