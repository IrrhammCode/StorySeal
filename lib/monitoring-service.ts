/**
 * Monitoring Service
 * Background service untuk execute scheduled scans
 * Run di client-side menggunakan setInterval
 */

import { 
  ScheduledScan, 
  getDueScans, 
  updateScanAfterExecution,
  saveScanHistory,
  createMonitoringAlert,
  ScanHistory
} from './automated-monitoring'
import { reverseImageSearch, findImageUsage } from '@/services/reverse-image-search'
import { checkForViolations } from './image-similarity'
import { trackScanTime, trackDetection, trackViolation } from './analytics'

export interface MonitoringServiceConfig {
  walletAddress: string
  checkInterval?: number // in milliseconds, default 60000 (1 minute)
  onScanComplete?: (scan: ScheduledScan, result: ScanHistory) => void
  onViolationDetected?: (scan: ScheduledScan, violations: any[]) => void
  onError?: (scan: ScheduledScan, error: Error) => void
}

class MonitoringService {
  private intervalId: NodeJS.Timeout | null = null
  private config: MonitoringServiceConfig | null = null
  private isRunning = false
  private executingScans = new Set<string>() // Track scans currently being executed

  /**
   * Start monitoring service
   */
  start(config: MonitoringServiceConfig): void {
    if (this.isRunning) {
      console.warn('[MonitoringService] Service is already running')
      return
    }

    this.config = config
    this.isRunning = true
    const interval = config.checkInterval || 60000 // Default 1 minute

    // Check immediately
    this.checkAndExecute()

    // Then check periodically
    this.intervalId = setInterval(() => {
      this.checkAndExecute()
    }, interval)

    console.log('[MonitoringService] Started monitoring service', {
      walletAddress: config.walletAddress,
      checkInterval: interval,
    })
  }

  /**
   * Stop monitoring service
   */
  stop(): void {
    if (!this.isRunning) return

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.isRunning = false
    this.config = null
    this.executingScans.clear()

    console.log('[MonitoringService] Stopped monitoring service')
  }

  /**
   * Check and execute due scans
   */
  private async checkAndExecute(): Promise<void> {
    if (!this.config) return

    const dueScans = getDueScans(this.config.walletAddress)

    if (dueScans.length === 0) {
      return
    }

    console.log(`[MonitoringService] Found ${dueScans.length} due scan(s)`)

    // Execute scans sequentially to avoid overwhelming the system
    for (const scan of dueScans) {
      // Skip if already executing
      if (this.executingScans.has(scan.id)) {
        console.log(`[MonitoringService] Scan ${scan.id} is already executing, skipping`)
        continue
      }

      this.executingScans.add(scan.id)

      try {
        await this.executeScan(scan)
      } catch (error) {
        console.error(`[MonitoringService] Error executing scan ${scan.id}:`, error)
        if (this.config.onError) {
          this.config.onError(scan, error as Error)
        }
      } finally {
        this.executingScans.delete(scan.id)
      }
    }
  }

  /**
   * Execute a single scan
   */
  private async executeScan(scan: ScheduledScan): Promise<void> {
    if (!this.config) return

    console.log(`[MonitoringService] Executing scan for IP: ${scan.ipId}`)

    const startTime = Date.now()
    let hasViolations = false
    const violations: any[] = []

    try {
      // Check if we have image URL
      if (!scan.imageUrl) {
        console.warn(`[MonitoringService] No image URL for scan ${scan.id}, skipping`)
        return
      }

      // Step 1: Reverse Image Search (if enabled)
      if (scan.options.enableReverseSearch) {
        try {
          const searchResults = await reverseImageSearch({
            imageUrl: scan.imageUrl,
            provider: 'auto',
          })

          if (searchResults.found && searchResults.totalMatches > 0) {
            // Check each match for violations
            for (const match of searchResults.matches) {
              // If similarity is provided and high, it's a potential violation
              if (match.similarity && match.similarity > 0.85) {
                violations.push({
                  url: match.url,
                  similarity: match.similarity,
                  confidence: match.similarity > 0.95 ? 'high' : match.similarity > 0.90 ? 'medium' : 'low',
                  source: 'reverse_search',
                })
              }
            }
          }
        } catch (error) {
          console.warn('[MonitoringService] Reverse search failed:', error)
          // Continue with other checks
        }
      }

      // Step 2: Similarity Detection (if enabled and we have other IP assets)
      if (scan.options.enableSimilarityDetection) {
        try {
          // Get other IP assets for comparison
          // Note: This would need to be passed in or fetched
          // For now, we'll skip this if we don't have the data
          // In production, you'd fetch this from Story Protocol or localStorage
        } catch (error) {
          console.warn('[MonitoringService] Similarity detection failed:', error)
        }
      }

      // Determine if we have violations based on alert threshold
      const thresholdMap: Record<string, number> = {
        always: 0, // Always alert, no threshold
        high: 0.95,
        medium: 0.85,
        low: 0.75,
      }

      const threshold = thresholdMap[scan.options.alertThreshold] || 0.85
      const significantViolations = scan.options.alertThreshold === 'always'
        ? violations // Alert all violations if threshold is 'always'
        : violations.filter(v => (v.similarity || 0) >= threshold)

      hasViolations = significantViolations.length > 0

      // Track analytics
      const duration = Date.now() - startTime
      trackScanTime(duration)
      if (hasViolations) {
        trackViolation()
      }

      // Save scan history
      const history: ScanHistory = {
        id: `history_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        scanId: scan.id,
        ipId: scan.ipId,
        scannedAt: new Date().toISOString(),
        status: hasViolations ? 'violation_detected' : 'completed',
        results: {
          totalMatches: violations.length,
          violations: significantViolations.length,
          matches: violations.map(v => ({
            url: v.url,
            similarity: v.similarity,
            confidence: v.confidence,
          })),
        },
      }

      saveScanHistory(this.config.walletAddress, history)

      // Update scan
      updateScanAfterExecution(this.config.walletAddress, scan.id, hasViolations)

      // Create alert if violations found
      if (hasViolations) {
        const alertSeverity = significantViolations.some(v => v.confidence === 'high')
          ? 'high'
          : significantViolations.some(v => v.confidence === 'medium')
          ? 'medium'
          : 'low'

        createMonitoringAlert(this.config.walletAddress, {
          scanId: scan.id,
          ipId: scan.ipId,
          alertType: 'violation',
          message: `Violation detected for "${scan.ipAssetName}". Found ${significantViolations.length} potential violation(s).`,
          severity: alertSeverity,
          data: {
            violationUrl: significantViolations[0]?.url,
            similarity: significantViolations[0]?.similarity,
            confidence: significantViolations[0]?.confidence,
          },
        })

        if (this.config.onViolationDetected) {
          this.config.onViolationDetected(scan, significantViolations)
        }
      }

      if (this.config.onScanComplete) {
        this.config.onScanComplete(scan, history)
      }

      console.log(`[MonitoringService] Scan completed for IP: ${scan.ipId}`, {
        hasViolations,
        violationCount: significantViolations.length,
        duration: `${duration}ms`,
      })
    } catch (error: any) {
      console.error(`[MonitoringService] Scan execution failed:`, error)

      // Save error history
      const history: ScanHistory = {
        id: `history_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        scanId: scan.id,
        ipId: scan.ipId,
        scannedAt: new Date().toISOString(),
        status: 'error',
        results: {
          totalMatches: 0,
          violations: 0,
          matches: [],
        },
        error: error.message,
      }

      saveScanHistory(this.config.walletAddress, history)

      // Create error alert
      createMonitoringAlert(this.config.walletAddress, {
        scanId: scan.id,
        ipId: scan.ipId,
        alertType: 'error',
        message: `Scan failed for "${scan.ipAssetName}": ${error.message}`,
        severity: 'medium',
      })

      throw error
    }
  }

  /**
   * Get service status
   */
  getStatus(): { isRunning: boolean; executingScans: string[] } {
    return {
      isRunning: this.isRunning,
      executingScans: Array.from(this.executingScans),
    }
  }

  /**
   * Manually trigger scan execution
   */
  async triggerScan(scanId: string): Promise<void> {
    if (!this.config) {
      throw new Error('Monitoring service is not started')
    }

    // Get the scan
    const scans = getDueScans(this.config.walletAddress)
    const scan = scans.find(s => s.id === scanId)

    if (!scan) {
      throw new Error(`Scan ${scanId} not found or not due`)
    }

    await this.executeScan(scan)
  }
}

// Singleton instance
let monitoringServiceInstance: MonitoringService | null = null

/**
 * Get monitoring service instance
 */
export function getMonitoringService(): MonitoringService {
  if (!monitoringServiceInstance) {
    monitoringServiceInstance = new MonitoringService()
  }
  return monitoringServiceInstance
}

/**
 * Start monitoring service (convenience function)
 */
export function startMonitoring(config: MonitoringServiceConfig): MonitoringService {
  const service = getMonitoringService()
  service.start(config)
  return service
}

/**
 * Stop monitoring service (convenience function)
 */
export function stopMonitoring(): void {
  const service = getMonitoringService()
  service.stop()
}

