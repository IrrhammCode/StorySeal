/**
 * Sanitize SVG content to prevent XSS attacks
 * Removes dangerous elements and attributes before rendering
 */

export function sanitizeSVG(svgCode: string): string {
  if (!svgCode || typeof svgCode !== 'string') {
    return ''
  }

  let sanitized = svgCode

  // Remove XML declaration and DOCTYPE
  sanitized = sanitized.replace(/<\?xml[^>]*\?>/gi, '')
  sanitized = sanitized.replace(/<!DOCTYPE[^>]*>/gi, '')

  // Remove script tags and content
  sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  sanitized = sanitized.replace(/<script[^>]*\/>/gi, '')

  // Remove event handlers (onclick, onload, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]+/gi, '')

  // Remove javascript: and data: URLs in href/xlink:href
  sanitized = sanitized.replace(/xlink:href\s*=\s*["']?javascript:[^"'\s>]*["']?/gi, '')
  sanitized = sanitized.replace(/href\s*=\s*["']?javascript:[^"'\s>]*["']?/gi, '')
  sanitized = sanitized.replace(/xlink:href\s*=\s*["']?data:text\/html[^"'\s>]*["']?/gi, '')
  sanitized = sanitized.replace(/href\s*=\s*["']?data:text\/html[^"'\s>]*["']?/gi, '')

  // Remove <iframe>, <embed>, <object> tags
  sanitized = sanitized.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
  sanitized = sanitized.replace(/<embed[^>]*>/gi, '')
  sanitized = sanitized.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')

  // Remove <foreignObject> which can contain HTML
  sanitized = sanitized.replace(/<foreignObject[^>]*>[\s\S]*?<\/foreignObject>/gi, '')

  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  // Ensure SVG has proper namespace
  if (!sanitized.includes('xmlns=')) {
    sanitized = sanitized.replace(
      /<svg([^>]*)>/,
      '<svg$1 xmlns="http://www.w3.org/2000/svg">'
    )
  }

  return sanitized
}

