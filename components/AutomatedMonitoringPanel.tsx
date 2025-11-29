'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import {
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  AlertCircle,
  CheckCircle,
  XCircle,
  Calendar,
  Settings,
  Bell,
  History,
  Eye,
  Loader2,
  Search,
  Brain,
  Shield
} from 'lucide-react'
import {
  ScheduledScan,
  getScheduledScans,
  createScheduledScan,
  saveScheduledScan,
  deleteScheduledScan,
  getScanHistory,
  saveScanHistory,
  getMonitoringAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  type MonitoringAlert,
  type ScanHistory
} from '@/lib/automated-monitoring'
import { startMonitoring, stopMonitoring, getMonitoringService } from '@/lib/monitoring-service'
import { useAccount } from 'wagmi'
import { useToast } from '@/contexts/ToastContext'
import { useIPAssetsByOwner } from '@/hooks/useStoryProtocol'
import { reverseImageSearch } from '@/services/reverse-image-search'

export default function AutomatedMonitoringPanel() {
  const { address } = useAccount()
  const { showToast } = useToast()
  const { data: ipAssets } = useIPAssetsByOwner(address)
  const [scans, setScans] = useState<ScheduledScan[]>([])
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedScan, setSelectedScan] = useState<ScheduledScan | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [scanHistory, setScanHistory] = useState<ScanHistory[]>([])
  const [isMonitoringActive, setIsMonitoringActive] = useState(false)

  useEffect(() => {
    if (!address) return

    loadData()

    // Start monitoring service
    const service = getMonitoringService()
    service.start({
      walletAddress: address,
      checkInterval: 60000, // 1 minute
      onViolationDetected: (scan, violations) => {
        showToast('warning', `Violation detected for "${scan.ipAssetName}"! Found ${violations.length} potential violation(s).`)
        loadData() // Refresh alerts
      },
      onScanComplete: (scan, result) => {
        console.log('[AutomatedMonitoring] Scan completed:', scan.ipAssetName)
        loadData() // Refresh data
      },
      onError: (scan, error) => {
        showToast('error', `Scan failed for "${scan.ipAssetName}": ${error.message}`)
      },
    })

    setIsMonitoringActive(true)

    // Refresh data every 30 seconds
    const interval = setInterval(loadData, 30000)

    return () => {
      clearInterval(interval)
      service.stop()
      setIsMonitoringActive(false)
    }
  }, [address])

  const loadData = () => {
    if (!address) return

    const loadedScans = getScheduledScans(address)
    setScans(loadedScans)

    const loadedAlerts = getMonitoringAlerts(address)
    setAlerts(loadedAlerts)

    if (selectedScan) {
      const history = getScanHistory(address, selectedScan.id)
      setScanHistory(history)
    }
  }

  const handleCreateScan = (
    ipId: string, 
    ipAssetName: string, 
    imageUrl?: string,
    schedule?: 'daily' | 'weekly' | 'monthly' | 'custom',
    customInterval?: number,
    options?: {
      enableReverseSearch: boolean
      enableSimilarityDetection: boolean
      enableC2PAVerification: boolean
      alertThreshold: 'always' | 'high' | 'medium' | 'low'
    }
  ) => {
    if (!address) return

    const newScan = createScheduledScan({
      ipId,
      ipAssetName,
      imageUrl,
      schedule: schedule || 'daily',
      customInterval: customInterval,
      options: options || {
        enableReverseSearch: true,
        enableSimilarityDetection: true,
        enableC2PAVerification: true,
        alertThreshold: 'medium',
      },
    })

    saveScheduledScan(address, newScan)
    loadData()
    setShowCreateModal(false)
    showToast('success', `Monitoring scheduled for "${ipAssetName}"`)
  }

  const handleToggleScan = (scan: ScheduledScan) => {
    if (!address) return

    const updated = { ...scan, enabled: !scan.enabled }
    saveScheduledScan(address, updated)
    loadData()
    showToast('success', `Monitoring ${updated.enabled ? 'enabled' : 'disabled'} for "${scan.ipAssetName}"`)
  }

  const handleDeleteScan = (scanId: string) => {
    if (!address) return

    const scan = scans.find(s => s.id === scanId)
    if (scan && confirm(`Are you sure you want to delete monitoring for "${scan.ipAssetName}"?`)) {
      deleteScheduledScan(address, scanId)
      loadData()
      showToast('success', 'Monitoring deleted')
    }
  }

  const handleViewHistory = (scan: ScheduledScan) => {
    setSelectedScan(scan)
    // Get history for this specific scan
    const scanHistory = getScanHistory(address!, scan.id)
    // Also get general history (includes test scans)
    const generalHistory = getScanHistory(address!)
    // Combine, remove duplicates by id, and sort by date (newest first)
    const historyMap = new Map<string, ScanHistory>()
    scanHistory.forEach(h => historyMap.set(h.id, h))
    generalHistory.forEach(h => {
      // Only include test scans or scans related to this IP asset
      if (h.scanId?.startsWith('test_scan_') || h.ipId === scan.ipId) {
        if (!historyMap.has(h.id)) {
          historyMap.set(h.id, h)
        }
      }
    })
    const allHistory = Array.from(historyMap.values())
      .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
    setScanHistory(allHistory)
    setShowHistory(true)
  }

  const handleMarkAlertRead = (alertId: string) => {
    if (!address) return

    markAlertAsRead(address, alertId)
    loadData()
  }

  const handleMarkAllRead = () => {
    if (!address) return

    markAllAlertsAsRead(address)
    loadData()
    showToast('success', 'All alerts marked as read')
  }

  const unreadAlerts = alerts.filter(a => !a.read)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Automated Monitoring</h2>
          <p className="text-white/60">Schedule automatic scans for your IP assets</p>
        </div>
        <div className="flex items-center space-x-4">
          {isMonitoringActive && (
            <div className="flex items-center space-x-2 px-4 py-2 glass-card rounded-xl">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <span className="text-sm text-white/80">Active</span>
            </div>
          )}
          {unreadAlerts.length > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="px-4 py-2 glass-card rounded-xl hover:glass-card-hover transition-all flex items-center space-x-2 text-white"
            >
              <Bell className="w-4 h-4" />
              <span>Mark All Read ({unreadAlerts.length})</span>
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-gradient-primary text-white rounded-xl hover:shadow-glow-indigo transition-all flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Scan</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {unreadAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-4 border-l-4 border-coral-500"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-coral-400" />
              <span>Recent Alerts ({unreadAlerts.length})</span>
            </h3>
          </div>
          <div className="space-y-2">
            {unreadAlerts.slice(0, 3).map((alert) => (
              <div
                key={alert.id}
                className="flex items-start justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-all"
              >
                <div className="flex-1">
                  <div className="text-white font-medium">{alert.message}</div>
                  <div className="text-xs text-white/60 mt-1">
                    {new Date(alert.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => handleMarkAlertRead(alert.id)}
                  className="ml-4 p-1 rounded hover:bg-white/10 transition-all"
                >
                  <XCircle className="w-4 h-4 text-white/60" />
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Scheduled Scans */}
      <div className="space-y-4">
        {scans.length === 0 ? (
          <div className="glass-card rounded-xl p-12 text-center">
            <Clock className="w-16 h-16 text-white/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Scheduled Scans</h3>
            <p className="text-white/60 mb-6">
              Schedule automatic scans to monitor your IP assets for violations
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-gradient-primary text-white rounded-xl hover:shadow-glow-indigo transition-all"
            >
              <Plus className="w-5 h-5 inline mr-2" />
              Schedule Your First Scan
            </button>
          </div>
        ) : (
          scans.map((scan) => (
            <motion.div
              key={scan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-xl p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">{scan.ipAssetName}</h3>
                    {scan.enabled ? (
                      <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-medium">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-500/20 text-gray-400 rounded text-xs font-medium">
                        Paused
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-white/60 mb-4">
                    IP ID: <span className="font-mono text-xs">{scan.ipId}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-white/60">Schedule</div>
                      <div className="text-white font-medium capitalize">{scan.schedule}</div>
                    </div>
                    <div>
                      <div className="text-white/60">Scans</div>
                      <div className="text-white font-medium">{scan.scanCount}</div>
                    </div>
                    <div>
                      <div className="text-white/60">Violations</div>
                      <div className="text-coral-400 font-medium">{scan.violationCount}</div>
                    </div>
                    <div>
                      <div className="text-white/60">Next Scan</div>
                      <div className="text-white font-medium text-xs">
                        {new Date(scan.nextScanAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => handleViewHistory(scan)}
                    className="p-2 glass-card-hover rounded-lg transition-all"
                    title="View History"
                  >
                    <History className="w-5 h-5 text-white/80" />
                  </button>
                  <button
                    onClick={() => handleToggleScan(scan)}
                    className="p-2 glass-card-hover rounded-lg transition-all"
                    title={scan.enabled ? 'Pause' : 'Resume'}
                  >
                    {scan.enabled ? (
                      <Pause className="w-5 h-5 text-white/80" />
                    ) : (
                      <Play className="w-5 h-5 text-white/80" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteScan(scan.id)}
                    className="p-2 glass-card-hover rounded-lg transition-all text-coral-400 hover:text-coral-300"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateScanModal
            ipAssets={ipAssets || []}
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreateScan}
          />
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {showHistory && selectedScan && (
          <HistoryModal
            scan={selectedScan}
            history={scanHistory}
            onClose={() => {
              setShowHistory(false)
              setSelectedScan(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function CreateScanModal({
  ipAssets,
  onClose,
  onCreate,
}: {
  ipAssets: any[]
  onClose: () => void
  onCreate: (
    ipId: string, 
    ipAssetName: string, 
    imageUrl?: string,
    schedule?: 'daily' | 'weekly' | 'monthly' | 'custom',
    customInterval?: number,
    options?: {
      enableReverseSearch: boolean
      enableSimilarityDetection: boolean
      enableC2PAVerification: boolean
      alertThreshold: 'always' | 'high' | 'medium' | 'low'
    }
  ) => void
}) {
  const { address } = useAccount()
  const { showToast } = useToast()
  const [selectedIpId, setSelectedIpId] = useState('')
  const [schedule, setSchedule] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily')
  const [customInterval, setCustomInterval] = useState(24)
  const [isTestingScan, setIsTestingScan] = useState(false)
  const [testScanResult, setTestScanResult] = useState<{
    success: boolean
    message: string
    matches?: number
    error?: string
  } | null>(null)
  const [testScanCompleted, setTestScanCompleted] = useState(false)
  
  // Monitoring options
  const [enableReverseSearch, setEnableReverseSearch] = useState(true)
  const [enableSimilarityDetection, setEnableSimilarityDetection] = useState(true)
  const [enableC2PAVerification, setEnableC2PAVerification] = useState(true)
  const [alertThreshold, setAlertThreshold] = useState<'always' | 'high' | 'medium' | 'low'>('medium')
  
  // Check available API keys
  const checkAvailableTools = () => {
    if (typeof window === 'undefined') return { reverseSearch: false, similarity: false, c2pa: false }
    
    const hasSerpAPI = !!localStorage.getItem('serpapi_api_key')
    const hasSerpdog = !!localStorage.getItem('serpdog_api_key')
    const hasBing = !!localStorage.getItem('bing_visual_search_api_key')
    const hasGoogle = !!(localStorage.getItem('google_api_key') && localStorage.getItem('google_search_engine_id'))
    const hasReverseSearch = hasSerpAPI || hasSerpdog || hasBing || hasGoogle
    
    // Similarity detection doesn't require external API (uses local image comparison)
    // C2PA verification is built-in (no external API needed)
    
    return {
      reverseSearch: hasReverseSearch,
      reverseSearchProviders: {
        serpapi: hasSerpAPI,
        serpdog: hasSerpdog,
        bing: hasBing,
        google: hasGoogle,
      },
      similarity: true, // Always available (local processing)
      c2pa: true, // Always available (built-in)
    }
  }
  
  const availableTools = checkAvailableTools()

  const selectedAsset = ipAssets.find(a => a.id === selectedIpId)

  // Reset test scan result when IP asset changes
  useEffect(() => {
    setTestScanResult(null)
    setTestScanCompleted(false)
  }, [selectedIpId])

  // Get image URL from asset
  const getImageUrl = (asset: any): string | undefined => {
    return asset?.mediaUrl || 
           asset?.metadata?.image || 
           asset?.metadata?.mediaUrl || 
           asset?.metadata?.metadataURI ||
           asset?.metadata?.metadata?.image ||
           asset?.metadata?.metadata?.mediaUrl
  }

  const handleTestScan = async () => {
    if (!selectedIpId) {
      showToast('error', 'Please select an IP asset first')
      return
    }

    const asset = ipAssets.find(a => a.id === selectedIpId)
    if (!asset) return

    const imageUrl = getImageUrl(asset)
    if (!imageUrl) {
      showToast('error', 'No image URL found for this IP asset. Cannot perform test scan.')
      setTestScanResult({
        success: false,
        message: 'No image URL available',
        error: 'IP asset does not have an image URL'
      })
      setTestScanCompleted(true)
      return
    }

    setIsTestingScan(true)
    setTestScanResult(null)
    setTestScanCompleted(false)

    try {
      showToast('info', 'Testing scan... This may take a few seconds.')
      
      const searchResults = await reverseImageSearch({
        imageUrl: imageUrl,
        provider: 'auto',
      })

      // Save test scan to history
      if (address) {
        const testScanId = `test_scan_${Date.now()}`
        const history: ScanHistory = {
          id: `history_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          scanId: testScanId,
          ipId: selectedIpId,
          scannedAt: new Date().toISOString(),
          status: searchResults.found && searchResults.totalMatches > 0 ? 'violation_detected' : 'completed',
          results: {
            totalMatches: searchResults.totalMatches || 0,
            violations: searchResults.found && searchResults.totalMatches > 0 ? searchResults.totalMatches : 0,
            matches: (searchResults.matches || []).map(match => ({
              url: match.url,
              similarity: match.similarity,
              confidence: match.similarity && match.similarity > 0.95 ? 'high' : 
                         match.similarity && match.similarity > 0.85 ? 'medium' : 'low' as 'high' | 'medium' | 'low',
            })),
          },
        }
        saveScanHistory(address, history)
        console.log('[CreateScanModal] Test scan saved to history:', history.id)
      }

      if (searchResults.found && searchResults.totalMatches > 0) {
        setTestScanResult({
          success: true,
          message: `Test scan successful! Found ${searchResults.totalMatches} match(es) online.`,
          matches: searchResults.totalMatches
        })
        showToast('success', `Test scan successful! Found ${searchResults.totalMatches} match(es). Saved to history.`)
      } else {
        setTestScanResult({
          success: true,
          message: 'Test scan successful! No matches found (this is normal for new images).',
          matches: 0
        })
        showToast('success', 'Test scan successful! No matches found. Saved to history.')
      }
    } catch (error: any) {
      console.error('[CreateScanModal] Test scan error:', error)
      const errorMessage = error.message || 'Unknown error'
      
      // Save error to history
      if (address) {
        const testScanId = `test_scan_${Date.now()}`
        const history: ScanHistory = {
          id: `history_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          scanId: testScanId,
          ipId: selectedIpId,
          scannedAt: new Date().toISOString(),
          status: 'error',
          results: {
            totalMatches: 0,
            violations: 0,
            matches: [],
          },
          error: errorMessage,
        }
        saveScanHistory(address, history)
        console.log('[CreateScanModal] Test scan error saved to history:', history.id)
      }
      
      setTestScanResult({
        success: false,
        message: 'Test scan failed',
        error: errorMessage
      })
      showToast('error', `Test scan failed: ${errorMessage}`)
    } finally {
      setIsTestingScan(false)
      setTestScanCompleted(true)
    }
  }

  const handleCreate = () => {
    if (!selectedIpId) return

    const asset = ipAssets.find(a => a.id === selectedIpId)
    if (!asset) return

    // If test scan was required but not completed or failed, warn user
    if (testScanCompleted && testScanResult && !testScanResult.success) {
      const proceed = confirm(
        `Test scan failed: ${testScanResult.error}\n\n` +
        `Do you still want to schedule monitoring? The scheduled scans may also fail.\n\n` +
        `Click OK to proceed anyway, or Cancel to fix the issue first.`
      )
      if (!proceed) return
    }

    onCreate(
      selectedIpId, 
      asset.name || `IP ${selectedIpId.slice(0, 10)}...`, 
      getImageUrl(asset),
      schedule,
      schedule === 'custom' ? customInterval : undefined,
      {
        enableReverseSearch,
        enableSimilarityDetection,
        enableC2PAVerification,
        alertThreshold,
      }
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <h3 className="text-xl font-bold text-white mb-4">Schedule Monitoring</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Select IP Asset
            </label>
            <select
              value={selectedIpId}
              onChange={(e) => setSelectedIpId(e.target.value)}
              className="w-full px-4 py-2 glass-card rounded-xl text-white bg-white/5 border border-white/10"
            >
              <option value="">Select an IP asset...</option>
              {ipAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name || `IP ${asset.id.slice(0, 10)}...`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Scan Schedule
            </label>
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as any)}
              className="w-full px-4 py-2 glass-card rounded-xl text-white bg-white/5 border border-white/10"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom (hours)</option>
            </select>
          </div>

          {schedule === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Interval (hours)
              </label>
              <input
                type="number"
                min="1"
                max="168"
                value={customInterval}
                onChange={(e) => setCustomInterval(parseInt(e.target.value) || 24)}
                className="w-full px-4 py-2 glass-card rounded-xl text-white bg-white/5 border border-white/10"
              />
            </div>
          )}

          {/* Monitoring Tools Selection */}
          <div className="border-t border-white/10 pt-4">
            <label className="block text-sm font-medium text-white/80 mb-3">
              Monitoring Tools
            </label>
            <p className="text-xs text-white/60 mb-4">
              Select which detection methods to use for monitoring
            </p>
            
            <div className="space-y-3">
              {/* Reverse Image Search */}
              <div className="p-3 glass-card rounded-lg border border-white/10">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableReverseSearch}
                    onChange={(e) => setEnableReverseSearch(e.target.checked)}
                    disabled={!availableTools.reverseSearch}
                    className="mt-1 w-4 h-4 text-indigo rounded focus:ring-indigo disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <Search className="w-4 h-4 text-white/70" />
                      <span className="text-sm font-medium text-white">Reverse Image Search</span>
                      {availableTools.reverseSearch ? (
                        <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded">Available</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-300 rounded">Not Configured</span>
                      )}
                    </div>
                    <p className="text-xs text-white/60 mt-1">
                      Search the web for images similar to your IP asset
                    </p>
                    {availableTools.reverseSearch && availableTools.reverseSearchProviders && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {availableTools.reverseSearchProviders.serpapi && (
                          <span className="px-2 py-0.5 text-xs bg-indigo-500/20 text-indigo-300 rounded">SerpAPI</span>
                        )}
                        {availableTools.reverseSearchProviders.serpdog && (
                          <span className="px-2 py-0.5 text-xs bg-indigo-500/20 text-indigo-300 rounded">Serpdog</span>
                        )}
                        {availableTools.reverseSearchProviders.bing && (
                          <span className="px-2 py-0.5 text-xs bg-indigo-500/20 text-indigo-300 rounded">Bing</span>
                        )}
                        {availableTools.reverseSearchProviders.google && (
                          <span className="px-2 py-0.5 text-xs bg-indigo-500/20 text-indigo-300 rounded">Google</span>
                        )}
                      </div>
                    )}
                    {!availableTools.reverseSearch && (
                      <p className="text-xs text-red-300 mt-1">
                        ⚠️ No API key configured. Set up in Settings page.
                      </p>
                    )}
                  </div>
                </label>
              </div>

              {/* Similarity Detection */}
              <div className="p-3 glass-card rounded-lg border border-white/10">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableSimilarityDetection}
                    onChange={(e) => setEnableSimilarityDetection(e.target.checked)}
                    className="mt-1 w-4 h-4 text-indigo rounded focus:ring-indigo"
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <Brain className="w-4 h-4 text-white/70" />
                      <span className="text-sm font-medium text-white">AI Similarity Detection</span>
                      <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded">Available</span>
                    </div>
                    <p className="text-xs text-white/60 mt-1">
                      Compare with your other registered IP assets using perceptual hashing
                    </p>
                  </div>
                </label>
              </div>

              {/* C2PA Verification */}
              <div className="p-3 glass-card rounded-lg border border-white/10">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableC2PAVerification}
                    onChange={(e) => setEnableC2PAVerification(e.target.checked)}
                    className="mt-1 w-4 h-4 text-indigo rounded focus:ring-indigo"
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-white/70" />
                      <span className="text-sm font-medium text-white">C2PA Verification</span>
                      <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded">Available</span>
                    </div>
                    <p className="text-xs text-white/60 mt-1">
                      Verify C2PA provenance metadata in images
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Alert Threshold */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <label className="block text-sm font-medium text-white/80 mb-2">
                Alert Threshold
              </label>
              <p className="text-xs text-white/60 mb-3">
                Only send alerts when confidence is above this threshold
              </p>
              <select
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value as 'always' | 'high' | 'medium' | 'low')}
                className="w-full px-4 py-2 glass-card rounded-xl text-white bg-white/5 border border-white/10"
              >
                <option value="always">Always Alert - Alert for all matches regardless of similarity</option>
                <option value="high">High (95%+ similarity) - Only very confident matches</option>
                <option value="medium">Medium (85%+ similarity) - Balanced detection</option>
                <option value="low">Low (75%+ similarity) - More sensitive, may have false positives</option>
              </select>
            </div>
          </div>

          {/* Test Scan Section */}
          {selectedIpId && (
            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-white/80">
                  Test Scan (Recommended)
                </label>
                <button
                  onClick={handleTestScan}
                  disabled={isTestingScan || !selectedIpId}
                  className="px-4 py-2 bg-indigo-500/20 text-indigo-300 rounded-lg hover:bg-indigo-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 text-sm"
                >
                  {isTestingScan ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      <span>Test Scan</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-white/60 mb-3">
                Test the scan to ensure it works before scheduling. This will perform a reverse image search to verify the setup.
              </p>

              {/* Test Scan Result */}
              {testScanResult && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-3 rounded-lg border ${
                    testScanResult.success
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-red-500/10 border-red-500/30'
                  }`}
                >
                  <div className="flex items-start space-x-2">
                    {testScanResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${
                        testScanResult.success ? 'text-green-300' : 'text-red-300'
                      }`}>
                        {testScanResult.message}
                      </p>
                      {testScanResult.matches !== undefined && (
                        <p className="text-xs text-white/60 mt-1">
                          Found {testScanResult.matches} match(es) online
                        </p>
                      )}
                      {testScanResult.error && (
                        <p className="text-xs text-red-300 mt-1">
                          Error: {testScanResult.error}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}

          <div className="flex items-center space-x-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 glass-card rounded-xl text-white hover:glass-card-hover transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!selectedIpId}
              className="flex-1 px-4 py-2 bg-gradient-primary text-white rounded-xl hover:shadow-glow-indigo transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testScanCompleted && testScanResult && !testScanResult.success
                ? 'Schedule Anyway'
                : 'Schedule'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function HistoryModal({
  scan,
  history,
  onClose,
}: {
  scan: ScheduledScan
  history: ScanHistory[]
  onClose: () => void
}) {
  // Separate test scans from scheduled scan history
  const testScans = history.filter(h => h.scanId?.startsWith('test_scan_'))
  const scheduledScans = history.filter(h => !h.scanId?.startsWith('test_scan_'))
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Scan History: {scan.ipAssetName}</h3>
          <button
            onClick={onClose}
            className="p-2 glass-card-hover rounded-lg transition-all"
          >
            <XCircle className="w-5 h-5 text-white/80" />
          </button>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-12 text-white/60">
            No scan history yet
          </div>
        ) : (
          <div className="space-y-6">
            {/* Scheduled Scans History */}
            {scheduledScans.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white/80 mb-3">Scheduled Scans</h4>
                <div className="space-y-3">
                  {scheduledScans.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 glass-card rounded-xl border-l-4 border-indigo-500"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          {item.status === 'violation_detected' ? (
                            <AlertCircle className="w-5 h-5 text-coral-400" />
                          ) : item.status === 'error' ? (
                            <XCircle className="w-5 h-5 text-red-400" />
                          ) : (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          )}
                          <span className="text-white font-medium capitalize">
                            {item.status.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="text-xs text-white/60">
                          {new Date(item.scannedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm text-white/80">
                        Found {item.results.totalMatches} match(es), {item.results.violations} violation(s)
                      </div>
                      {item.error && (
                        <div className="text-sm text-red-400 mt-2">Error: {item.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Test Scans History */}
            {testScans.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white/80 mb-3">Test Scans</h4>
                <div className="space-y-3">
                  {testScans.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 glass-card rounded-xl border-l-4 border-blue-500"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          {item.status === 'violation_detected' ? (
                            <AlertCircle className="w-5 h-5 text-coral-400" />
                          ) : item.status === 'error' ? (
                            <XCircle className="w-5 h-5 text-red-400" />
                          ) : (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          )}
                          <span className="text-white font-medium capitalize">
                            {item.status.replace('_', ' ')}
                          </span>
                          <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-300 rounded">Test</span>
                        </div>
                        <span className="text-xs text-white/60">
                          {new Date(item.scannedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm text-white/80">
                        Found {item.results.totalMatches} match(es), {item.results.violations} violation(s)
                      </div>
                      {item.error && (
                        <div className="text-sm text-red-400 mt-2">Error: {item.error}</div>
                      )}
                      {item.results.matches && item.results.matches.length > 0 && (
                        <div className="mt-2 text-xs text-white/60">
                          Matches: {item.results.matches.map((m, i) => (
                            <span key={i} className="mr-2">
                              {m.url?.substring(0, 30)}... ({Math.round((m.similarity || 0) * 100)}%)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

