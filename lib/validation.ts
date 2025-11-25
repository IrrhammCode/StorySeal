/**
 * Validation utilities for StorySeal
 */

export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate prompt
 */
export function validatePrompt(prompt: string): ValidationResult {
  if (!prompt || prompt.trim().length === 0) {
    return {
      valid: false,
      error: 'Prompt cannot be empty',
    }
  }
  
  if (prompt.length > 1000) {
    return {
      valid: false,
      error: 'Prompt must be less than 1000 characters',
    }
  }
  
  return { valid: true }
}

/**
 * Validate URL
 */
export function validateUrl(url: string): ValidationResult {
  if (!url || url.trim().length === 0) {
    return {
      valid: false,
      error: 'URL cannot be empty',
    }
  }
  
  try {
    const urlObj = new URL(url)
    
    // Check if it's a valid image URL
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
    const pathname = urlObj.pathname.toLowerCase()
    const hasImageExtension = imageExtensions.some(ext => pathname.endsWith(ext))
    
    // Also check if URL is accessible (basic check)
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return {
        valid: false,
        error: 'URL must use HTTP or HTTPS protocol',
      }
    }
    
    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: 'Invalid URL format',
    }
  }
}

/**
 * Validate file
 */
export function validateFile(file: File): ValidationResult {
  if (!file) {
    return {
      valid: false,
      error: 'File is required',
    }
  }
  
  // Check file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'File must be an image (JPEG, PNG, GIF, or WebP)',
    }
  }
  
  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'File size must be less than 10MB',
    }
  }
  
  return { valid: true }
}

/**
 * Validate wallet address
 */
export function validateWalletAddress(address: string): ValidationResult {
  if (!address || address.trim().length === 0) {
    return {
      valid: false,
      error: 'Wallet address is required',
    }
  }
  
  // Basic Ethereum address validation
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return {
      valid: false,
      error: 'Invalid wallet address format',
    }
  }
  
  return { valid: true }
}

/**
 * Validate IP ID
 */
export function validateIPId(ipId: string): ValidationResult {
  if (!ipId || ipId.trim().length === 0) {
    return {
      valid: false,
      error: 'IP ID is required',
    }
  }
  
  // Basic Ethereum address validation
  if (!/^0x[a-fA-F0-9]{40}$/.test(ipId)) {
    return {
      valid: false,
      error: 'Invalid IP ID format',
    }
  }
  
  return { valid: true }
}

/**
 * Validate batch prompts
 */
export function validateBatchPrompts(prompts: string[]): ValidationResult {
  if (!prompts || prompts.length === 0) {
    return {
      valid: false,
      error: 'At least one prompt is required',
    }
  }
  
  if (prompts.length > 10) {
    return {
      valid: false,
      error: 'Maximum 10 prompts allowed per batch',
    }
  }
  
  // Validate each prompt
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i].trim()
    if (prompt.length === 0) {
      return {
        valid: false,
        error: `Prompt ${i + 1} cannot be empty`,
      }
    }
  }
  
  return { valid: true }
}

