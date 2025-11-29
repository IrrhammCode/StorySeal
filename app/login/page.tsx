'use client'

import { motion } from 'framer-motion'
import { Shield, Wallet, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useAccount } from 'wagmi'
import { ConnectWallet } from '@/components/ConnectWallet'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function LoginPage() {
  const { isConnected } = useAccount()
  const router = useRouter()

  useEffect(() => {
    if (isConnected) {
      router.push('/dashboard')
    }
  }, [isConnected, router])

  return (
    <div className="min-h-screen relative flex items-center justify-center px-6 py-12">
      {/* Soft Background Layers - Easy on the Eyes */}
      <div className="absolute inset-0 bg-pattern opacity-40"></div>
      <div className="absolute inset-0 bg-grid opacity-20"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(37,99,235,0.08),transparent_70%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(251,113,133,0.06),transparent_70%)]"></div>
      
      <div className="w-full max-w-md relative z-10">
        {/* Logo and Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <div className="flex justify-end mb-4">
            <ThemeToggle />
          </div>
          <Link href="/" className="inline-flex items-center space-x-3 mb-6">
            <div className="w-20 h-20 rounded-xl flex items-center justify-center shadow-glow-indigo overflow-hidden relative">
              <Image 
                src="/storyseal-logo.png" 
                alt="StorySeal Logo" 
                width={80} 
                height={80} 
                className="object-contain scale-150 logo-transparent"
                style={{ width: 'auto', height: 'auto' }}
                priority
              />
            </div>
            <span className="text-3xl font-bold text-white">StorySeal</span>
          </Link>
          <h1 className="text-2xl font-semibold text-white mb-2">
            Connect Your Wallet
          </h1>
          <p className="text-white/80">
            Connect to start protecting your creations
          </p>
        </motion.div>

        {/* Wallet Connection Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="glass-card rounded-2xl border border-white/10 p-8"
        >
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-primary/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-400/30">
                <Wallet className="w-8 h-8 text-indigo-300" />
              </div>
              <p className="text-white/70 text-sm mb-6">
                Connect your wallet to access StorySeal and start protecting your AI-generated content with on-chain IP registration.
              </p>
            </div>

            <div className="flex justify-center">
              <ConnectWallet />
            </div>

            <div className="pt-6 border-t border-white/10">
              <p className="text-xs text-center text-white/60 mb-4">
                Supported Wallets
              </p>
              <div className="flex justify-center space-x-4">
                <div className="text-xs text-white/50">MetaMask</div>
                <div className="text-xs text-white/50">WalletConnect</div>
                <div className="text-xs text-white/50">Injected</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Back to Home */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-6 text-center"
        >
          <Link href="/" className="text-sm text-white/70 hover:text-indigo-300 transition-colors">
            ← Back to home
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
