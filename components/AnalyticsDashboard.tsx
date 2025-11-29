'use client'

import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import {
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Clock,
  FileText,
  Download,
  BarChart3,
  PieChart,
  LineChart
} from 'lucide-react'
import { getAnalytics } from '@/lib/analytics'
import { getScheduledScans, getScanHistory, getMonitoringAlerts } from '@/lib/automated-monitoring'
import { useAccount } from 'wagmi'
import { useIPAssetsByOwner } from '@/hooks/useStoryProtocol'
import type { AnalyticsData } from '@/lib/analytics'

export default function AnalyticsDashboard() {
  const { address } = useAccount()
  const { data: ipAssets } = useIPAssetsByOwner(address)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [scheduledScans, setScheduledScans] = useState(0)
  const [totalAlerts, setTotalAlerts] = useState(0)
  const [unreadAlerts, setUnreadAlerts] = useState(0)

  useEffect(() => {
    if (!address) return

    // Update total registered IPs in localStorage for accurate success rate calculation
    if (ipAssets && ipAssets.length > 0) {
      try {
        localStorage.setItem('storyseal_total_registered_ips', ipAssets.length.toString())
      } catch (error) {
        console.error('Failed to update total registered IPs:', error)
      }
    }

    // Load analytics
    const data = getAnalytics()
    
    // If we have IP assets but analytics shows 0, adjust success rate
    if (ipAssets && ipAssets.length > 0 && data.registrations.total === 0) {
      data.registrations = {
        ...data.registrations,
        total: ipAssets.length,
        success: ipAssets.length,
        failure: 0,
        successRate: 100,
      }
    } else if (ipAssets && ipAssets.length > 0 && data.registrations.success < ipAssets.length) {
      // Adjust if we have more IP assets than tracked successes
      data.registrations = {
        ...data.registrations,
        total: Math.max(data.registrations.total, ipAssets.length),
        success: Math.max(data.registrations.success, ipAssets.length),
        successRate: data.registrations.total > 0
          ? Math.round((Math.max(data.registrations.success, ipAssets.length) / data.registrations.total) * 1000) / 10
          : 100,
      }
    }
    
    setAnalytics(data)

    // Load monitoring stats
    const scans = getScheduledScans(address)
    setScheduledScans(scans.length)

    const alerts = getMonitoringAlerts(address)
    setTotalAlerts(alerts.length)
    setUnreadAlerts(alerts.filter(a => !a.read).length)

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      const newData = getAnalytics()
      
      // Apply same adjustments
      if (ipAssets && ipAssets.length > 0) {
        if (newData.registrations.total === 0) {
          newData.registrations = {
            ...newData.registrations,
            total: ipAssets.length,
            success: ipAssets.length,
            failure: 0,
            successRate: 100,
          }
        } else if (newData.registrations.success < ipAssets.length) {
          newData.registrations = {
            ...newData.registrations,
            total: Math.max(newData.registrations.total, ipAssets.length),
            success: Math.max(newData.registrations.success, ipAssets.length),
            successRate: newData.registrations.total > 0
              ? Math.round((Math.max(newData.registrations.success, ipAssets.length) / newData.registrations.total) * 1000) / 10
              : 100,
          }
        }
      }
      
      setAnalytics(newData)

      const newScans = getScheduledScans(address)
      setScheduledScans(newScans.length)

      const newAlerts = getMonitoringAlerts(address)
      setTotalAlerts(newAlerts.length)
      setUnreadAlerts(newAlerts.filter(a => !a.read).length)
    }, 30000)

    return () => clearInterval(interval)
  }, [address, ipAssets])

  if (!analytics) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-white/60">Loading analytics...</div>
      </div>
    )
  }

  const exportData = () => {
    const data = {
      analytics,
      scheduledScans,
      totalAlerts,
      unreadAlerts,
      exportedAt: new Date().toISOString(),
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `storyseal-analytics-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Analytics Dashboard</h2>
          <p className="text-white/60">Track your IP protection metrics and monitoring activity</p>
        </div>
        <button
          onClick={exportData}
          className="px-4 py-2 glass-card rounded-xl hover:glass-card-hover transition-all flex items-center space-x-2 text-white"
        >
          <Download className="w-4 h-4" />
          <span>Export Data</span>
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Shield className="w-6 h-6 text-indigo-300" />
            </div>
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {analytics.registrations.total}
          </div>
          <div className="text-sm text-white/60">Total IP Assets</div>
          <div className="text-xs text-green-400 mt-2">
            {analytics.registrations.successRate}% success rate
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-coral-500/20 flex items-center justify-center">
              <Activity className="w-6 h-6 text-coral-300" />
            </div>
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {analytics.detections.total}
          </div>
          <div className="text-sm text-white/60">Total Scans</div>
          <div className="text-xs text-green-400 mt-2">
            {analytics.detections.accuracy}% accuracy
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-yellow-500/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-300" />
            </div>
            {unreadAlerts > 0 && (
              <div className="w-6 h-6 rounded-full bg-coral-500 flex items-center justify-center">
                <span className="text-xs font-bold text-white">{unreadAlerts}</span>
              </div>
            )}
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {analytics.detections.violations}
          </div>
          <div className="text-sm text-white/60">Violations Detected</div>
          <div className="text-xs text-coral-400 mt-2">
            {unreadAlerts} unread alerts
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Clock className="w-6 h-6 text-blue-300" />
            </div>
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {scheduledScans}
          </div>
          <div className="text-sm text-white/60">Active Monitoring</div>
          <div className="text-xs text-blue-400 mt-2">
            Automated scans running
          </div>
        </motion.div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Registration Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
              <LineChart className="w-5 h-5" />
              <span>Registration Trend</span>
            </h3>
          </div>
          <div className="h-48 flex items-end justify-between space-x-2">
            {analytics.registrations.trend.length > 0 ? (
              analytics.registrations.trend.map((point, index) => {
                const maxCount = Math.max(...analytics.registrations.trend.map(p => p.count), 1)
                const height = maxCount > 0 ? (point.count / maxCount) * 100 : 0
                return (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-gradient-primary rounded-t transition-all hover:opacity-80"
                      style={{ height: `${height}%`, minHeight: point.count > 0 ? '4px' : '2px' }}
                    />
                    <div className="text-xs text-white/60 mt-2 text-center">
                      {new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="text-xs font-semibold text-white mt-1">{point.count}</div>
                  </div>
                )
              })
            ) : (
              // Show empty chart with last 7 days
              Array.from({ length: 7 }, (_, i) => {
                const date = new Date()
                date.setDate(date.getDate() - (6 - i))
                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div className="w-full bg-white/10 rounded-t" style={{ height: '2px' }} />
                    <div className="text-xs text-white/60 mt-2 text-center">
                      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="text-xs font-semibold text-white mt-1">0</div>
                  </div>
                )
              })
            )}
          </div>
        </motion.div>

        {/* Detection Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
              <PieChart className="w-5 h-5" />
              <span>Detection Methods</span>
            </h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 rounded bg-indigo-500"></div>
                <span className="text-white/80">Watermark Detection</span>
              </div>
              <div className="text-white font-semibold">{analytics.detections.withWatermark}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 rounded bg-coral-500"></div>
                <span className="text-white/80">Similarity Detection</span>
              </div>
              <div className="text-white font-semibold">{analytics.detections.withSimilarity}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 rounded bg-yellow-500"></div>
                <span className="text-white/80">Violations</span>
              </div>
              <div className="text-white font-semibold">{analytics.detections.violations}</div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-white/60">Total Detections</span>
                <span className="text-white font-bold text-lg">{analytics.detections.total}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Performance Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card rounded-xl p-6"
      >
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
          <BarChart3 className="w-5 h-5" />
          <span>Performance Metrics</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-sm text-white/60 mb-2">Average Generation Time</div>
            <div className="text-2xl font-bold text-white">
              {analytics.performance.averageGenerationTime > 0
                ? `${(analytics.performance.averageGenerationTime / 1000).toFixed(1)}s`
                : 'N/A'}
            </div>
          </div>
          <div>
            <div className="text-sm text-white/60 mb-2">Average Scan Time</div>
            <div className="text-2xl font-bold text-white">
              {analytics.performance.averageScanTime > 0
                ? `${(analytics.performance.averageScanTime / 1000).toFixed(1)}s`
                : 'N/A'}
            </div>
          </div>
          <div>
            <div className="text-sm text-white/60 mb-2">Average Registration Time</div>
            <div className="text-2xl font-bold text-white">
              {analytics.performance.averageRegistrationTime > 0
                ? `${(analytics.performance.averageRegistrationTime / 1000).toFixed(1)}s`
                : 'N/A'}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Activity Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card rounded-xl p-6"
      >
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
          <FileText className="w-5 h-5" />
          <span>Activity Summary</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-white/60 mb-2">Total Activities</div>
            <div className="text-2xl font-bold text-white">{analytics.activity.total}</div>
            <div className="text-xs text-white/60 mt-1">
              {analytics.activity.recent} in last 7 days
            </div>
          </div>
          <div>
            <div className="text-sm text-white/60 mb-2">Activity Types</div>
            <div className="space-y-2 mt-2">
              {Object.entries(analytics.activity.byType).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-white/80 capitalize">{type.replace('_', ' ')}</span>
                  <span className="text-white font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

