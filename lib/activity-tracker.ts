/**
 * Activity Tracker for StorySeal
 * Tracks user activities and stores them in localStorage
 */

export interface Activity {
  id: string
  type: 'ip_registered' | 'ip_verified' | 'license_created' | 'watermark_embedded'
  title: string
  description: string
  timestamp: string
  metadata?: {
    ipId?: string
    licenseId?: string
    imageUrl?: string
    [key: string]: any
  }
}

const ACTIVITY_STORAGE_KEY = 'storyseal_activities'
const MAX_ACTIVITIES = 50 // Keep last 50 activities

/**
 * Get all activities from localStorage
 */
export function getActivities(): Activity[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(ACTIVITY_STORAGE_KEY)
    if (!stored) return []
    
    const activities = JSON.parse(stored) as Activity[]
    // Sort by timestamp (newest first)
    return activities.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  } catch (error) {
    console.error('Failed to get activities:', error)
    return []
  }
}

/**
 * Add a new activity
 */
export function addActivity(activity: Omit<Activity, 'id' | 'timestamp'>): void {
  if (typeof window === 'undefined') return
  
  try {
    const activities = getActivities()
    
    const newActivity: Activity = {
      ...activity,
      id: `activity_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
    }
    
    // Add to beginning and keep only last MAX_ACTIVITIES
    const updated = [newActivity, ...activities].slice(0, MAX_ACTIVITIES)
    
    localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Failed to add activity:', error)
  }
}

/**
 * Clear all activities
 */
export function clearActivities(): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.removeItem(ACTIVITY_STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear activities:', error)
  }
}

/**
 * Get activities by type
 */
export function getActivitiesByType(type: Activity['type']): Activity[] {
  return getActivities().filter(activity => activity.type === type)
}

/**
 * Get recent activities (last N)
 */
export function getRecentActivities(limit: number = 10): Activity[] {
  return getActivities().slice(0, limit)
}

