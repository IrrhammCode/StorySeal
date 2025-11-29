'use client'

import { motion } from 'framer-motion'
import { Image, Search, FileText, TrendingUp, Shield, Zap, Clock, CheckCircle2, BarChart3, AlertCircle, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { useIPAssetsByOwner } from '@/hooks/useStoryProtocol'
import { useEffect, useState } from 'react'
import { getRecentActivities } from '@/lib/activity-tracker'
import { getAnalytics } from '@/lib/analytics'
import { getRegistrationStats } from '@/lib/registration-tracker'
import AnalyticsDashboard from '@/components/AnalyticsDashboard'

export default function DashboardPage() {
  const { address } = useAccount()
  const { data: ipAssets, isLoading } = useIPAssetsByOwner(address)
  const [stats, setStats] = useState<Array<{
    label: string
    value: string
    icon: any
    color: 'indigo' | 'coral'
    subtitle?: string
  }>>([
    { label: 'Total IP Assets', value: '0', icon: FileText, color: 'indigo' },
    { label: 'Protected Images', value: '0', icon: Image, color: 'coral' },
    { label: 'Verifications', value: '0', icon: Search, color: 'indigo' },
    { label: 'Active Licenses', value: '0', icon: Shield, color: 'coral' },
  ])

  const [analytics, setAnalytics] = useState<any>(null)

  useEffect(() => {
    const analyticsData = getAnalytics()
    setAnalytics(analyticsData)
    
    if (ipAssets) {
      const totalAssets = ipAssets.length
      const protectedImages = ipAssets.filter(asset => 
        asset.metadata?.type === 'image' || !asset.metadata?.type
      ).length
      
      // Get verification count from localStorage
      const verifications = parseInt(localStorage.getItem('verification_count') || '0')
      
      // Get registration stats
      const regStats = getRegistrationStats()
      
      setStats([
        { 
          label: 'Total IP Assets', 
          value: totalAssets.toString(), 
          icon: FileText, 
          color: 'indigo',
          subtitle: regStats.total > 0 ? `${regStats.successRate}% success rate` : undefined
        },
        { 
          label: 'Protected Images', 
          value: protectedImages.toString(), 
          icon: Image, 
          color: 'coral',
          subtitle: analyticsData?.detections.total > 0 ? `${analyticsData.detections.accuracy}% accuracy` : undefined
        },
        { 
          label: 'Verifications', 
          value: verifications.toString(), 
          icon: Search, 
          color: 'indigo',
          subtitle: analyticsData?.detections.violations > 0 ? `${analyticsData.detections.violations} violations` : undefined
        },
        { 
          label: 'Active Licenses', 
          value: '0', 
          icon: Shield, 
          color: 'coral' 
        },
      ])
    }
  }, [ipAssets])

  // Recent activity from activity tracker
  const [recentActivity, setRecentActivity] = useState<Array<{
    type: string
    title: string
    time: string
    description: string
  }>>([])

  useEffect(() => {
    const activities = getRecentActivities(5)
    setRecentActivity(activities.map(activity => ({
      type: activity.type,
      title: activity.title,
      time: new Date(activity.timestamp).toLocaleString(),
      description: activity.description,
    })))
  }, [ipAssets])

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-gray-900 text-white mb-2">Dashboard</h1>
        <p className="text-white/90 font-medium">Overview of your IP protection activities</p>
      </motion.div>

      {/* Stats Grid - Professional Glassmorphism Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: index * 0.1 }}
            whileHover={{ y: -4, scale: 1.02 }}
            className="group glass-card glass-card-hover rounded-2xl p-6 overflow-hidden"
          >
            <div className="relative z-10">
              {/* Icon Section */}
              <div className="flex items-center justify-between mb-6">
                <div className={`relative w-14 h-14 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ${
                  stat.color === 'indigo' 
                    ? 'bg-gradient-primary shadow-glow-indigo' 
                    : 'bg-gradient-secondary shadow-glow-coral'
                }`}>
                  <stat.icon className="w-7 h-7 text-white" />
                </div>
                
                {/* Subtle Badge */}
                <div className={`px-3 py-1 rounded-full text-xs font-semibold glass border ${
                  stat.color === 'indigo'
                    ? 'border-indigo-400/30 text-indigo-200'
                    : 'border-coral-400/30 text-coral-200'
                }`}>
                  Active
                </div>
              </div>

              {/* Value Section */}
              <div className="mb-2">
                <p className="text-4xl font-bold text-white group-hover:scale-105 transition-transform duration-300">
                  {stat.value}
                </p>
              </div>

              {/* Label Section */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                    {stat.label}
                  </p>
                  {stat.subtitle && (
                    <p className="text-xs text-white/80 font-medium mt-1">
                      {stat.subtitle}
                    </p>
                  )}
                </div>
              </div>

              {/* Bottom Accent Line */}
              <div className={`mt-4 h-1 rounded-full bg-gradient-to-r ${
                stat.color === 'indigo'
                  ? 'from-indigo-500 to-indigo-600'
                  : 'from-coral to-rose-500'
              } opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions - Professional Glassmorphism Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="grid md:grid-cols-2 gap-6 mb-8"
      >
        <Link
          href="/dashboard/create"
          className="group glass-card glass-card-hover rounded-2xl p-8 overflow-hidden"
        >
          <div className="relative z-10">
            <div className="flex items-center space-x-4 mb-4">
              <div className="relative w-16 h-16 bg-gradient-primary rounded-xl flex items-center justify-center shadow-glow-indigo group-hover:scale-110 transition-all duration-300">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white group-hover:text-indigo-300 transition-colors">
                  Create & Register
                </h3>
                <p className="text-white/90 font-medium text-sm mt-1">
                  Generate AI assets and register as IP
                </p>
              </div>
            </div>
            
            {/* Bottom Accent Line */}
            <div className="mt-6 h-1 rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
        </Link>

        <Link
          href="/dashboard/verify"
          className="group glass-card glass-card-hover rounded-2xl p-8 overflow-hidden"
        >
          <div className="relative z-10">
            <div className="flex items-center space-x-4 mb-4">
              <div className="relative w-16 h-16 bg-gradient-secondary rounded-xl flex items-center justify-center shadow-glow-coral group-hover:scale-110 transition-all duration-300">
                <Search className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white group-hover:text-coral-300 transition-colors">
                  Verify Origin
                </h3>
                <p className="text-white/90 font-medium text-sm mt-1">
                  Check if an image has StorySeal protection
                </p>
              </div>
            </div>
            
            {/* Bottom Accent Line */}
            <div className="mt-6 h-1 rounded-full bg-gradient-to-r from-coral to-rose-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
        </Link>
      </motion.div>

      {/* Full Analytics Dashboard */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="mb-8"
      >
        <AnalyticsDashboard />
      </motion.div>

      {/* Recent Activity Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="mb-6"
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 from-indigo-600 to-indigo-700 flex items-center justify-center shadow-lg">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Recent Activity</h2>
            <p className="text-sm text-white/90 font-medium">Your latest IP protection activities</p>
          </div>
        </div>
      </motion.div>

      {/* Recent Activity Grid - Card Style */}
      {recentActivity.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-8">
          {recentActivity.map((activity, index) => {
          const getTypeIcon = () => {
            if (activity.type === 'ip_registered') return Shield
            if (activity.type === 'ip_verified') return CheckCircle2
            if (activity.type === 'license_created') return FileText
            return Zap
          }
          const TypeIcon = getTypeIcon()
          
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 + index * 0.1 }}
              whileHover={{ y: -4, scale: 1.02 }}
              className="group relative glass-card rounded-2xl p-6 border border-white/10 hover:border-indigo-400/50 transition-all duration-300 shadow-md hover:shadow-xl hover:shadow-indigo-500/20 overflow-hidden"
            >
              {/* Gradient Background Effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-indigo-500/10 via-transparent to-indigo-500/5" />
              
              {/* Decorative Corner */}
              <div className="absolute top-0 right-0 w-24 h-24 opacity-5 group-hover:opacity-10 transition-opacity duration-300 bg-indigo rounded-bl-full" />

              <div className="relative z-10">
                {/* Header Section with Icon */}
                <div className="flex items-start justify-between mb-4">
                  <div className="relative w-14 h-14 rounded-xl flex items-center justify-center group-hover:scale-110 transition-all duration-300 bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/50 group-hover:shadow-xl group-hover:shadow-indigo-400/70">
                    <TypeIcon className="w-7 h-7 text-white" />
                    {/* Glow Effect */}
                    <div className="absolute -inset-1 rounded-xl blur-md opacity-0 group-hover:opacity-50 transition-opacity bg-indigo" />
                  </div>
                </div>

                {/* Activity Title */}
                <h3 className="text-lg font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors">
                  {activity.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-white/90 font-medium mb-4">
                  {activity.description}
                </p>

                {/* Time Info */}
                <div className="flex items-center space-x-2 text-sm text-white/90 font-medium">
                  <Clock className="w-4 h-4" />
                  <span>{activity.time}</span>
                </div>

                {/* Bottom Accent Line */}
                <div className="h-1 rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300 mt-4" />
              </div>
            </motion.div>
          )
          })}
        </div>
      ) : (
        <div className="glass-card rounded-xl border border-white/10 p-12 text-center">
          <TrendingUp className="w-16 h-16 text-white/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No recent activity</h3>
          <p className="text-white/90 font-medium">Your IP protection activities will appear here</p>
        </div>
      )}
    </div>
  )
}

