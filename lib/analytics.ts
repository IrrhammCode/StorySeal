/**
 * Analytics Service for StorySeal
 * Tracks and calculates various metrics for dashboard
 */

import { getRegistrationAttempts, getRegistrationStats } from './registration-tracker'
import { getActivities } from './activity-tracker'

export interface AnalyticsData {
  registrations: {
    total: number
    success: number
    failure: number
    successRate: number
    averageDuration: number
    trend: Array<{ date: string; count: number }>
  }
  detections: {
    total: number
    withWatermark: number
    withSimilarity: number
    violations: number
    accuracy: number
  }
  performance: {
    averageGenerationTime: number
    averageScanTime: number
    averageRegistrationTime: number
  }
  activity: {
    total: number
    byType: Record<string, number>
    recent: number
  }
}

/**
 * Get comprehensive analytics data
 */
export function getAnalytics(): AnalyticsData {
  const registrationStats = getRegistrationStats()
  const activities = getActivities()
  
  // Calculate registration trend (last 7 days)
  const attempts = getRegistrationAttempts()
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  
  const recentAttempts = attempts.filter(
    a => new Date(a.timestamp) >= sevenDaysAgo
  )
  
  // Group by date
  const trendMap = new Map<string, number>()
  recentAttempts.forEach(attempt => {
    const date = new Date(attempt.timestamp).toISOString().split('T')[0]
    trendMap.set(date, (trendMap.get(date) || 0) + 1)
  })
  
  const trend = Array.from(trendMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
  
  // Detection stats (from localStorage)
  const detectionCount = parseInt(localStorage.getItem('detection_count') || '0')
  const watermarkDetections = parseInt(localStorage.getItem('watermark_detections') || '0')
  const similarityDetections = parseInt(localStorage.getItem('similarity_detections') || '0')
  const violations = parseInt(localStorage.getItem('violation_count') || '0')
  
  const detectionAccuracy = detectionCount > 0
    ? Math.round(((watermarkDetections + similarityDetections) / detectionCount) * 100)
    : 0
  
  // Performance metrics (from localStorage)
  const generationTimes = JSON.parse(localStorage.getItem('generation_times') || '[]') as number[]
  const scanTimes = JSON.parse(localStorage.getItem('scan_times') || '[]') as number[]
  const registrationTimes = attempts
    .filter(a => a.duration !== undefined)
    .map(a => a.duration!)
  
  const averageGenerationTime = generationTimes.length > 0
    ? Math.round(generationTimes.reduce((a, b) => a + b, 0) / generationTimes.length)
    : 0
  
  const averageScanTime = scanTimes.length > 0
    ? Math.round(scanTimes.reduce((a, b) => a + b, 0) / scanTimes.length)
    : 0
  
  const averageRegistrationTime = registrationTimes.length > 0
    ? Math.round(registrationTimes.reduce((a, b) => a + b, 0) / registrationTimes.length)
    : 0
  
  // Activity stats
  const activityByType: Record<string, number> = {}
  activities.forEach(activity => {
    activityByType[activity.type] = (activityByType[activity.type] || 0) + 1
  })
  
  const recentActivityCount = activities.filter(
    a => new Date(a.timestamp) >= sevenDaysAgo
  ).length
  
  return {
    registrations: {
      ...registrationStats,
      trend,
    },
    detections: {
      total: detectionCount,
      withWatermark: watermarkDetections,
      withSimilarity: similarityDetections,
      violations,
      accuracy: detectionAccuracy,
    },
    performance: {
      averageGenerationTime,
      averageScanTime,
      averageRegistrationTime,
    },
    activity: {
      total: activities.length,
      byType: activityByType,
      recent: recentActivityCount,
    },
  }
}

/**
 * Track generation time
 */
export function trackGenerationTime(duration: number): void {
  if (typeof window === 'undefined') return
  
  try {
    const times = JSON.parse(localStorage.getItem('generation_times') || '[]') as number[]
    times.push(duration)
    // Keep last 50
    const recent = times.slice(-50)
    localStorage.setItem('generation_times', JSON.stringify(recent))
  } catch (error) {
    console.error('Failed to track generation time:', error)
  }
}

/**
 * Track scan time
 */
export function trackScanTime(duration: number): void {
  if (typeof window === 'undefined') return
  
  try {
    const times = JSON.parse(localStorage.getItem('scan_times') || '[]') as number[]
    times.push(duration)
    // Keep last 50
    const recent = times.slice(-50)
    localStorage.setItem('scan_times', JSON.stringify(recent))
  } catch (error) {
    console.error('Failed to track scan time:', error)
  }
}

/**
 * Track detection
 */
export function trackDetection(type: 'watermark' | 'similarity'): void {
  if (typeof window === 'undefined') return
  
  try {
    const count = parseInt(localStorage.getItem('detection_count') || '0')
    localStorage.setItem('detection_count', (count + 1).toString())
    
    if (type === 'watermark') {
      const watermarkCount = parseInt(localStorage.getItem('watermark_detections') || '0')
      localStorage.setItem('watermark_detections', (watermarkCount + 1).toString())
    } else {
      const similarityCount = parseInt(localStorage.getItem('similarity_detections') || '0')
      localStorage.setItem('similarity_detections', (similarityCount + 1).toString())
    }
  } catch (error) {
    console.error('Failed to track detection:', error)
  }
}

/**
 * Track violation
 */
export function trackViolation(): void {
  if (typeof window === 'undefined') return
  
  try {
    const count = parseInt(localStorage.getItem('violation_count') || '0')
    localStorage.setItem('violation_count', (count + 1).toString())
  } catch (error) {
    console.error('Failed to track violation:', error)
  }
}

