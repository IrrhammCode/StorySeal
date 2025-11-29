'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Shield, 
  Home, 
  Image as ImageIcon, 
  Search, 
  Menu, 
  X,
  FileText,
  CheckCircle,
  Activity,
  Settings
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { ConnectWallet } from '@/components/ConnectWallet'
import Particles from '@tsparticles/react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Create & Register', href: '/dashboard/create', icon: ImageIcon },
  { name: 'Verify', href: '/dashboard/verify', icon: Search },
  { name: 'Monitor', href: '/dashboard/monitor', icon: Activity },
  { name: 'My IP Assets', href: '/dashboard/assets', icon: FileText },
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

  // Particles initialization - handled automatically by @tsparticles/react

  // Show loading state during hydration
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-800 via-purple-900 to-fuchsia-900 flex items-center justify-center">
        <div className="text-white font-semibold">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Soft Background Layers - Comfortable for Extended Use */}
      {/* Base gradient is handled by body, these are gentle enhancement layers */}
      <div className="absolute inset-0 bg-pattern opacity-40"></div>
      <div className="absolute inset-0 bg-grid opacity-15"></div>
      {/* Soft Blue Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(37,99,235,0.08),transparent_70%)]"></div>
      {/* Soft Coral Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(251,113,133,0.06),transparent_70%)]"></div>
      
      {/* Floating Geometric Nodes - 3D Effect */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${Math.random() * 100 + 50}px`,
              height: `${Math.random() * 100 + 50}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: `radial-gradient(circle, rgba(99,102,241,${0.2 + Math.random() * 0.3}) 0%, transparent 70%)`,
              boxShadow: `0 0 ${20 + Math.random() * 30}px rgba(99,102,241,0.4)`,
              animation: `float${i} ${15 + Math.random() * 10}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
              filter: 'blur(1px)',
            }}
          />
        ))}
      </div>
      
      {/* Cyberpunk Network Particles with Glowing Connections */}
      {mounted && (
        <Particles
          id="tsparticles"
          className="absolute inset-0 z-0"
          options={{
            background: {
              color: {
                value: "transparent",
              },
            },
            fpsLimit: 120,
            interactivity: {
              events: {
                onClick: {
                  enable: true,
                  mode: "push",
                },
                onHover: {
                  enable: true,
                  mode: "repulse",
                },
              },
              modes: {
                push: {
                  quantity: 4,
                },
                repulse: {
                  distance: 150,
                  duration: 0.4,
                },
              },
            },
            particles: {
              color: {
                value: ["#6366F1", "#8B5CF6", "#818CF8", "#A78BFA"],
              },
              links: {
                color: "#6366F1",
                distance: 200,
                enable: true,
                opacity: 0.4,
                width: 1.5,
                triangles: {
                  enable: true,
                  opacity: 0.1,
                },
              },
              move: {
                direction: "none",
                enable: true,
                outModes: {
                  default: "bounce",
                },
                random: true,
                speed: 0.5,
                straight: false,
                attract: {
                  enable: true,
                  rotate: {
                    x: 600,
                    y: 1200,
                  },
                },
              },
              number: {
                density: {
                  enable: true,
                },
                value: 80,
              },
              opacity: {
                value: { min: 0.3, max: 0.8 },
                animation: {
                  enable: true,
                  speed: 0.5,
                  sync: false,
                },
              },
              shape: {
                type: ["circle", "triangle"],
              },
              size: {
                value: { min: 2, max: 5 },
                animation: {
                  enable: true,
                  speed: 2,
                  sync: false,
                },
              },
              shadow: {
                enable: true,
                blur: 5,
                color: "#6366F1",
                offset: {
                  x: 0,
                  y: 0,
                },
              },
            },
            detectRetina: true,
          }}
        />
      )}
      
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-64 flex flex-col fixed left-0 top-0 z-40 glass-strong border-r border-white/10 overflow-hidden"
            style={{ height: '100vh', position: 'fixed' }}
          >
            <div className="relative z-10 flex flex-col h-full overflow-hidden">
              {/* Logo */}
              <div className="p-6 border-b border-white/10 flex-shrink-0">
                <Link href="/" className="flex items-center space-x-3 group">
                  <div className="w-[72px] h-[72px] rounded-xl flex items-center justify-center shadow-glow-indigo group-hover:scale-110 transition-all duration-300 overflow-hidden relative">
                    <Image 
                      src="/storyseal-logo.png" 
                      alt="StorySeal Logo" 
                      width={72} 
                      height={72} 
                      className="object-contain scale-150 logo-transparent"
                      style={{ width: 'auto', height: 'auto' }}
                      priority
                    />
                  </div>
                  <span className="text-xl font-semibold text-white">StorySeal</span>
                </Link>
              </div>

              {/* Navigation */}
              <nav className="flex-1 p-4 space-y-2 overflow-y-auto min-h-0">
                {navigation.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all relative group ${
                        isActive
                          ? 'text-white'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      {isActive && (
                        <div className="absolute inset-0 bg-gradient-primary rounded-xl shadow-glow-indigo opacity-90"></div>
                      )}
                      {!isActive && (
                        <div className="absolute inset-0 bg-white/5 rounded-xl opacity-0 group-hover:opacity-100 transition-all border border-white/10"></div>
                      )}
                      <div className="relative z-10 flex items-center space-x-3 w-full">
                        <item.icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-white/70 group-hover:text-white'}`} />
                        <span className={`font-medium ${isActive ? 'text-white' : 'text-white/70 group-hover:text-white'}`}>{item.name}</span>
                      </div>
                    </Link>
                  )
                })}
              </nav>

              {/* Wallet Section - Sticky at bottom */}
              <div className="p-4 border-t border-white/10 flex-shrink-0">
                <ConnectWallet />
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-w-0 ${sidebarOpen ? 'ml-64' : ''} transition-all duration-300`}>
        {/* Top Navbar */}
        <header className="sticky top-0 px-6 py-4 relative z-20 glass-strong border-b border-white/10">
          <div className="relative z-10 flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-xl glass-card-hover transition-all group"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? (
                <X className="w-5 h-5 text-white/80 group-hover:text-white transition-colors" />
              ) : (
                <Menu className="w-5 h-5 text-white/80 group-hover:text-white transition-colors" />
              )}
            </button>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-4 py-2 glass-card rounded-xl border border-white/20">
                <CheckCircle className="w-4 h-4 text-indigo-300" />
                <span className="text-sm font-semibold text-white/90">Connected to Story Protocol</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8 overflow-auto relative z-10">
          {children}
        </main>
      </div>
    </div>
  )
}

