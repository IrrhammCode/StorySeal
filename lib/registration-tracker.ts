/**
 * Registration Tracker for StorySeal
 * Tracks IP registration attempts, success/failure, and statistics
 */

export interface RegistrationAttempt {
  id: string
  timestamp: string
  status: 'success' | 'failure'
  ipId?: string
  error?: string
  prompt?: string
  duration?: number // in milliseconds
  metadata?: {
    imageUrl?: string
    tokenId?: string
    [key: string]: any
  }
}

const REGISTRATION_STORAGE_KEY = 'storyseal_registrations'
const MAX_REGISTRATIONS = 100 // Keep last 100 registrations

/**
 * Get all registration attempts
 */
export function getRegistrationAttempts(): RegistrationAttempt[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(REGISTRATION_STORAGE_KEY)
    if (!stored) return []
    
    const attempts = JSON.parse(stored) as RegistrationAttempt[]
    return attempts.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  } catch (error) {
    console.error('Failed to get registration attempts:', error)
    return []
  }
}

/**
 * Add a registration attempt
 */
export function addRegistrationAttempt(
  status: 'success' | 'failure',
  data: {
    ipId?: string
    error?: string
    prompt?: string
    duration?: number
    metadata?: Record<string, any>
  }
): void {
  if (typeof window === 'undefined') return
  
  try {
    const attempts = getRegistrationAttempts()
    
    const attempt: RegistrationAttempt = {
      id: `reg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      status,
      ...data,
    }
    
    const updated = [attempt, ...attempts].slice(0, MAX_REGISTRATIONS)
    localStorage.setItem(REGISTRATION_STORAGE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Failed to add registration attempt:', error)
  }
}

/**
 * Get registration statistics
 */
export function getRegistrationStats() {
  const attempts = getRegistrationAttempts()
  
  if (attempts.length === 0) {
    return {
      total: 0,
      success: 0,
      failure: 0,
      successRate: 0,
      averageDuration: 0,
      recentFailures: [],
    }
  }
  
  const success = attempts.filter(a => a.status === 'success').length
  const failure = attempts.filter(a => a.status === 'failure').length
  const successRate = (success / attempts.length) * 100
  
  const durations = attempts
    .filter(a => a.duration !== undefined)
    .map(a => a.duration!)
  const averageDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0
  
  const recentFailures = attempts
    .filter(a => a.status === 'failure')
    .slice(0, 5)
    .map(a => ({
      timestamp: a.timestamp,
      error: a.error || 'Unknown error',
      prompt: a.prompt,
    }))
  
  return {
    total: attempts.length,
    success,
    failure,
    successRate: Math.round(successRate * 10) / 10, // Round to 1 decimal
    averageDuration: Math.round(averageDuration),
    recentFailures,
  }
}

/**
 * Clear all registration attempts
 */
export function clearRegistrationAttempts(): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.removeItem(REGISTRATION_STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear registration attempts:', error)
  }
}

