'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Shield, 
  Home, 
  Image, 
  Search, 
  Menu, 
  X,
  FileText,
  CheckCircle,
  Activity,
  Settings
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { ConnectWallet } from '@/components/ConnectWallet'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Create & Register', href: '/dashboard/create', icon: Image },
  { name: 'Verify', href: '/dashboard/verify', icon: Search },
  { name: 'Monitor', href: '/dashboard/monitor', icon: Activity },
  { name: 'My IP Assets', href: '/dashboard/assets', icon: FileText },
  { name: 'Licenses', href: '/dashboard/licenses', icon: Shield },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const pathname = usePathname()
  const { isConnected } = useAccount()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  // Prevent hydration issues
  useEffect(() => {
    setMounted(true)
  }, [])

  // Only redirect on client side
  useEffect(() => {
    if (mounted && !isConnected) {
      router.push('/login')
    }
  }, [mounted, isConnected, router])

  // Show loading state during hydration
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900/50 to-slate-900 flex relative overflow-hidden">
      {/* Animated gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-purple-900/20 to-slate-900/20 animate-pulse"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(79,70,229,0.3),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(139,92,246,0.2),transparent_50%)]"></div>
      
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-64 flex flex-col fixed left-0 top-0 bottom-0 z-40 overflow-y-auto shadow-2xl shadow-indigo-900/50 relative"
            style={{ height: '100vh' }}
          >
            {/* Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-800/95 via-indigo-900/40 to-slate-900/95 backdrop-blur-xl"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-indigo-900/20 via-transparent to-purple-900/10"></div>
            <div className="absolute inset-0 border-r border-indigo-500/30"></div>
            
            <div className="relative z-10 flex flex-col h-full">
              {/* Logo */}
              <div className="p-6 border-b border-indigo-500/20">
                <Link href="/" className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-indigo rounded-lg flex items-center justify-center">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-xl font-semibold text-white">StorySeal</span>
                </Link>
              </div>

              {/* Navigation */}
              <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                {navigation.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all relative ${
                        isActive
                          ? 'text-white shadow-lg'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      {isActive && (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 rounded-lg opacity-90"></div>
                          <div className="absolute inset-0 bg-gradient-to-r from-indigo-400/20 to-purple-400/20 rounded-lg"></div>
                        </>
                      )}
                      {!isActive && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/0 to-transparent rounded-lg opacity-0 hover:opacity-10 transition-opacity"></div>
                      )}
                      <div className="relative z-10 flex items-center space-x-3 w-full">
                        <item.icon className="w-5 h-5" />
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </Link>
                  )
                })}
              </nav>

              {/* Wallet Section - Sticky at bottom */}
              <div className="p-4 border-t border-indigo-500/20 flex-shrink-0 mt-auto">
                <div className="mb-2">
                  <ConnectWallet />
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-w-0 ${sidebarOpen ? 'ml-64' : ''} transition-all duration-300`}>
        {/* Top Navbar */}
        <header className="px-6 py-4 relative z-20 shadow-lg shadow-indigo-900/20 border-b border-indigo-500/30">
          {/* Gradient Background */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-800/95 via-indigo-900/50 to-slate-800/95 backdrop-blur-xl"></div>
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/10 via-transparent to-transparent"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg hover:bg-indigo-500/20 transition-colors group"
              >
                {sidebarOpen ? (
                  <X className="w-5 h-5 text-gray-300 group-hover:text-white transition-colors" />
                ) : (
                  <Menu className="w-5 h-5 text-gray-300 group-hover:text-white transition-colors" />
                )}
              </button>

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-500/30 via-indigo-500/20 to-purple-500/20 backdrop-blur-sm border border-indigo-400/30 text-indigo-200 rounded-lg shadow-lg shadow-indigo-900/30">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">Connected to Story Protocol</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto relative z-10">
          {children}
        </main>
      </div>
    </div>
  )
}










