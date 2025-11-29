/**
 * Automated Monitoring Service
 * Scheduled scans untuk IP assets dengan auto-alerts
 */

export interface ScheduledScan {
  id: string
  ipId: string
  ipAssetName: string
  imageUrl?: string
  schedule: 'daily' | 'weekly' | 'monthly' | 'custom'
  customInterval?: number // in hours
  enabled: boolean
  lastScanAt?: string
  nextScanAt: string
  scanCount: number
  violationCount: number
  createdAt: string
  options: {
    enableReverseSearch: boolean
    enableSimilarityDetection: boolean
    enableC2PAVerification: boolean
    alertThreshold: 'always' | 'high' | 'medium' | 'low' // Alert threshold: 'always' = alert all, others = only if confidence above threshold
  }
}

export interface ScanHistory {
  id: string
  scanId: string
  ipId: string
  scannedAt: string
  status: 'completed' | 'error' | 'violation_detected'
  results: {
    totalMatches: number
    violations: number
    matches: Array<{
      url: string
      similarity?: number
      confidence: 'high' | 'medium' | 'low'
    }>
  }
  error?: string
}

export interface MonitoringAlert {
  id: string
  scanId: string
  ipId: string
  alertType: 'violation' | 'high_similarity' | 'error'
  message: string
  severity: 'high' | 'medium' | 'low'
  createdAt: string
  read: boolean
  data?: {
    violationUrl?: string
    similarity?: number
    confidence?: 'high' | 'medium' | 'low'
  }
}

/**
 * Get all scheduled scans for a user
 */
export function getScheduledScans(walletAddress: string): ScheduledScan[] {
  if (typeof window === 'undefined') return []
  
  try {
    const key = `storyseal_scheduled_scans_${walletAddress}`
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('[AutomatedMonitoring] Failed to load scheduled scans:', error)
    return []
  }
}

/**
 * Save scheduled scan
 */
export function saveScheduledScan(walletAddress: string, scan: ScheduledScan): void {
  if (typeof window === 'undefined') return
  
  try {
    const scans = getScheduledScans(walletAddress)
    const index = scans.findIndex(s => s.id === scan.id)
    
    if (index >= 0) {
      scans[index] = scan
    } else {
      scans.push(scan)
    }
    
    const key = `storyseal_scheduled_scans_${walletAddress}`
    localStorage.setItem(key, JSON.stringify(scans))
  } catch (error) {
    console.error('[AutomatedMonitoring] Failed to save scheduled scan:', error)
  }
}

/**
 * Delete scheduled scan
 */
export function deleteScheduledScan(walletAddress: string, scanId: string): void {
  if (typeof window === 'undefined') return
  
  try {
    const scans = getScheduledScans(walletAddress)
    const filtered = scans.filter(s => s.id !== scanId)
    
    const key = `storyseal_scheduled_scans_${walletAddress}`
    localStorage.setItem(key, JSON.stringify(filtered))
  } catch (error) {
    console.error('[AutomatedMonitoring] Failed to delete scheduled scan:', error)
  }
}

/**
 * Create new scheduled scan
 */
export function createScheduledScan(params: {
  ipId: string
  ipAssetName: string
  imageUrl?: string
  schedule: 'daily' | 'weekly' | 'monthly' | 'custom'
  customInterval?: number
  options?: Partial<ScheduledScan['options']>
}): ScheduledScan {
  const now = new Date()
  const nextScanAt = calculateNextScanTime(params.schedule, params.customInterval)
  
  return {
    id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    ipId: params.ipId,
    ipAssetName: params.ipAssetName,
    imageUrl: params.imageUrl,
    schedule: params.schedule,
    customInterval: params.customInterval,
    enabled: true,
    nextScanAt: nextScanAt.toISOString(),
    scanCount: 0,
    violationCount: 0,
    createdAt: now.toISOString(),
    options: {
      enableReverseSearch: true,
      enableSimilarityDetection: true,
      enableC2PAVerification: true,
      alertThreshold: 'medium',
      ...params.options,
    },
  }
}

/**
 * Calculate next scan time based on schedule
 */
function calculateNextScanTime(
  schedule: 'daily' | 'weekly' | 'monthly' | 'custom',
  customInterval?: number
): Date {
  const now = new Date()
  const next = new Date(now)
  
  switch (schedule) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      break
    case 'weekly':
      next.setDate(next.getDate() + 7)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    case 'custom':
      if (customInterval) {
        next.setHours(next.getHours() + customInterval)
      } else {
        next.setDate(next.getDate() + 1) // Default to daily
      }
      break
  }
  
  return next
}

/**
 * Update scan after execution
 */
export function updateScanAfterExecution(
  walletAddress: string,
  scanId: string,
  hasViolations: boolean
): void {
  if (typeof window === 'undefined') return
  
  try {
    const scans = getScheduledScans(walletAddress)
    const scan = scans.find(s => s.id === scanId)
    
    if (!scan) return
    
    scan.lastScanAt = new Date().toISOString()
    scan.nextScanAt = calculateNextScanTime(scan.schedule, scan.customInterval).toISOString()
    scan.scanCount += 1
    
    if (hasViolations) {
      scan.violationCount += 1
    }
    
    saveScheduledScan(walletAddress, scan)
  } catch (error) {
    console.error('[AutomatedMonitoring] Failed to update scan:', error)
  }
}

/**
 * Get scan history
 */
export function getScanHistory(walletAddress: string, scanId?: string): ScanHistory[] {
  if (typeof window === 'undefined') return []
  
  try {
    const key = scanId
      ? `storyseal_scan_history_${walletAddress}_${scanId}`
      : `storyseal_scan_history_${walletAddress}`
    
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('[AutomatedMonitoring] Failed to load scan history:', error)
    return []
  }
}

/**
 * Save scan history
 */
export function saveScanHistory(walletAddress: string, history: ScanHistory): void {
  if (typeof window === 'undefined') return
  
  try {
    const key = `storyseal_scan_history_${walletAddress}_${history.scanId}`
    const histories = getScanHistory(walletAddress, history.scanId)
    histories.push(history)
    
    // Keep last 100 scans
    const recent = histories.slice(-100)
    localStorage.setItem(key, JSON.stringify(recent))
    
    // Also save to general history
    const generalKey = `storyseal_scan_history_${walletAddress}`
    const generalHistories = getScanHistory(walletAddress)
    generalHistories.push(history)
    const recentGeneral = generalHistories.slice(-100)
    localStorage.setItem(generalKey, JSON.stringify(recentGeneral))
  } catch (error) {
    console.error('[AutomatedMonitoring] Failed to save scan history:', error)
  }
}

/**
 * Get monitoring alerts
 */
export function getMonitoringAlerts(walletAddress: string, unreadOnly?: boolean): MonitoringAlert[] {
  if (typeof window === 'undefined') return []
  
  try {
    const key = `storyseal_monitoring_alerts_${walletAddress}`
    const stored = localStorage.getItem(key)
    const alerts: MonitoringAlert[] = stored ? JSON.parse(stored) : []
    
    return unreadOnly ? alerts.filter(a => !a.read) : alerts
  } catch (error) {
    console.error('[AutomatedMonitoring] Failed to load alerts:', error)
    return []
  }
}

/**
 * Create monitoring alert
 */
export function createMonitoringAlert(
  walletAddress: string,
  alert: Omit<MonitoringAlert, 'id' | 'createdAt' | 'read'>
): void {
  if (typeof window === 'undefined') return
  
  try {
    const newAlert: MonitoringAlert = {
      ...alert,
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      read: false,
    }
    
    const alerts = getMonitoringAlerts(walletAddress)
    alerts.unshift(newAlert) // Add to beginning
    
    // Keep last 100 alerts
    const recent = alerts.slice(0, 100)
    
    const key = `storyseal_monitoring_alerts_${walletAddress}`
    localStorage.setItem(key, JSON.stringify(recent))
  } catch (error) {
    console.error('[AutomatedMonitoring] Failed to create alert:', error)
  }
}

/**
 * Mark alert as read
 */
export function markAlertAsRead(walletAddress: string, alertId: string): void {
  if (typeof window === 'undefined') return
  
  try {
    const alerts = getMonitoringAlerts(walletAddress)
    const alert = alerts.find(a => a.id === alertId)
    
    if (alert) {
      alert.read = true
      
      const key = `storyseal_monitoring_alerts_${walletAddress}`
      localStorage.setItem(key, JSON.stringify(alerts))
    }
  } catch (error) {
    console.error('[AutomatedMonitoring] Failed to mark alert as read:', error)
  }
}

/**
 * Mark all alerts as read
 */
export function markAllAlertsAsRead(walletAddress: string): void {
  if (typeof window === 'undefined') return
  
  try {
    const alerts = getMonitoringAlerts(walletAddress)
    alerts.forEach(alert => {
      alert.read = true
    })
    
    const key = `storyseal_monitoring_alerts_${walletAddress}`
    localStorage.setItem(key, JSON.stringify(alerts))
  } catch (error) {
    console.error('[AutomatedMonitoring] Failed to mark all alerts as read:', error)
  }
}

/**
 * Get scans that are due for execution
 */
export function getDueScans(walletAddress: string): ScheduledScan[] {
  const scans = getScheduledScans(walletAddress)
  const now = new Date()
  
  return scans.filter(scan => {
    if (!scan.enabled) return false
    
    const nextScan = new Date(scan.nextScanAt)
    return nextScan <= now
  })
}

/**
 * Check if monitoring service should run
 * This will be called periodically (e.g., every minute)
 */
export function checkAndExecuteDueScans(
  walletAddress: string,
  onViolationDetected?: (scan: ScheduledScan, violations: any[]) => void
): ScheduledScan[] {
  const dueScans = getDueScans(walletAddress)
  
  // Return due scans - actual execution will be handled by the monitoring service
  // This allows the UI to show which scans are due
  return dueScans
}

