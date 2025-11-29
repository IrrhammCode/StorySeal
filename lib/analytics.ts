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
  
  // Get total registered IP assets from localStorage (if available)
  // This helps calculate success rate more accurately
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
  
  // If we have registered IPs but no attempts tracked, update success rate
  let adjustedStats = { ...registrationStats }
  if (totalRegisteredIPs > 0 && registrationStats.total === 0) {
    adjustedStats = {
      total: totalRegisteredIPs,
      success: totalRegisteredIPs,
      failure: 0,
      successRate: 100,
      averageDuration: 0,
      recentFailures: [],
    }
  } else if (totalRegisteredIPs > registrationStats.success) {
    // If we have more registered IPs than tracked successes, adjust
    adjustedStats = {
      ...registrationStats,
      total: Math.max(registrationStats.total, totalRegisteredIPs),
      success: Math.max(registrationStats.success, totalRegisteredIPs),
      successRate: registrationStats.total > 0 
        ? Math.round((Math.max(registrationStats.success, totalRegisteredIPs) / registrationStats.total) * 1000) / 10
        : 100,
    }
  }
  
  // Calculate registration trend (last 7 days)
  // Use both registration attempts and IP assets from localStorage
  const attempts = getRegistrationAttempts()
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  
  // Get successful registrations from attempts
  const recentAttempts = attempts.filter(
    a => a.status === 'success' && new Date(a.timestamp) >= sevenDaysAgo
  )
  
  // Also try to get IP assets from localStorage to fill in missing data
  let ipAssetsData: Array<{ timestamp: string }> = []
  try {
    if (typeof window !== 'undefined') {
      // Try to get manual IP assets
      const address = window.ethereum?.selectedAddress || ''
      if (address) {
        const manualAssetsKey = `storyseal_manual_ip_assets_${address}`
        const stored = localStorage.getItem(manualAssetsKey)
        if (stored) {
          const assets = JSON.parse(stored)
          ipAssetsData = assets
            .filter((a: any) => a.registeredAt && new Date(a.registeredAt) >= sevenDaysAgo)
            .map((a: any) => ({ timestamp: a.registeredAt }))
        }
      }
      
      // Also check for IP assets stored in activities
      const activities = getActivities()
      const registrationActivities = activities.filter(
        a => a.type === 'ip_registered' && new Date(a.timestamp) >= sevenDaysAgo
      )
      ipAssetsData = [...ipAssetsData, ...registrationActivities.map(a => ({ timestamp: a.timestamp }))]
    }
  } catch (error) {
    console.error('Failed to get IP assets for trend:', error)
  }
  
  // Combine attempts and IP assets data
  const allRegistrations = [
    ...recentAttempts.map(a => ({ timestamp: a.timestamp })),
    ...ipAssetsData
  ]
  
  // Group by date
  const trendMap = new Map<string, number>()
  allRegistrations.forEach(reg => {
    const date = new Date(reg.timestamp).toISOString().split('T')[0]
    trendMap.set(date, (trendMap.get(date) || 0) + 1)
  })
  
  // Fill in missing dates for last 7 days (for better visualization)
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    if (!trendMap.has(dateStr)) {
      trendMap.set(dateStr, 0)
    }
  }
  
  const trend = Array.from(trendMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7) // Only last 7 days
  
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
      ...adjustedStats,
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

