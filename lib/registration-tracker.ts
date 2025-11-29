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
  
  // Get total registered IP assets from localStorage
  // This is a fallback if attempts are not tracked properly
  let totalRegisteredIPs = 0
  try {
    if (typeof window !== 'undefined') {
      // Try to get from localStorage if available
      const stored = localStorage.getItem('storyseal_total_registered_ips')
      if (stored) {
        totalRegisteredIPs = parseInt(stored) || 0
      }
    }
  } catch (error) {
    console.error('Failed to get total registered IPs:', error)
  }
  
  if (attempts.length === 0) {
    // If no attempts tracked but we have registered IPs, assume 100% success
    if (totalRegisteredIPs > 0) {
      return {
        total: totalRegisteredIPs,
        success: totalRegisteredIPs,
        failure: 0,
        successRate: 100,
        averageDuration: 0,
        recentFailures: [],
      }
    }
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
  
  // Calculate success rate: if we have registered IPs but no attempts, use 100%
  // Otherwise, calculate from attempts
  let successRate = 0
  if (attempts.length > 0) {
    successRate = (success / attempts.length) * 100
  } else if (totalRegisteredIPs > 0) {
    successRate = 100
  }
  
  // Use total registered IPs if it's higher than success attempts
  // This handles cases where IPs were registered before tracking was implemented
  const total = Math.max(attempts.length, totalRegisteredIPs)
  const actualSuccess = Math.max(success, totalRegisteredIPs)
  
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
    total: total,
    success: actualSuccess,
    failure: failure,
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

