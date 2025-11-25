'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Shield, CheckCircle, Zap } from 'lucide-react'
import Link from 'next/link'
import { Scene3D } from '@/components/Scene3D'
import { ConnectWallet } from '@/components/ConnectWallet'
import { useAccount } from 'wagmi'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function LandingPage() {
  const { isConnected } = useAccount()
  const router = useRouter()

  useEffect(() => {
    if (isConnected) {
      router.push('/dashboard')
    }
  }, [isConnected, router])

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Soft Background Layers - Easy on the Eyes */}
      {/* Base gradient is handled by body, these are gentle enhancement layers */}
      <div className="absolute inset-0 bg-pattern opacity-50"></div>
      <div className="absolute inset-0 bg-grid opacity-20"></div>
      {/* Soft Blue Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(37,99,235,0.1),transparent_70%)]"></div>
      {/* Soft Coral Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(251,113,133,0.08),transparent_70%)]"></div>
      
      <div className="relative z-10">
      {/* Navigation - Glassmorphism */}
      <nav className="fixed top-0 w-full z-50 glass-strong border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2 group">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center shadow-glow-indigo group-hover:shadow-glow-indigo transition-all duration-300">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-white">StorySeal</span>
          </Link>
          <div className="flex items-center space-x-4">
            <ConnectWallet />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-block mb-6">
                <span className="px-4 py-2 glass rounded-full text-sm font-medium text-white/90 backdrop-blur-sm border border-white/20">
                  IP Protection Suite
                </span>
              </div>
              <h1 className="text-5xl lg:text-7xl font-bold text-white mb-6 leading-tight">
                Verify the Origin.
                <br />
                <span className="gradient-text-indigo">Seal the Creation.</span>
              </h1>
              <p className="text-xl text-white/80 mb-10 leading-relaxed max-w-2xl">
                Advanced IP protection for the Generative AI era. Combine invisible watermarking 
                with Story Protocol to ensure every AI-generated asset is verifiable and traceable.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/dashboard"
                  className="group px-8 py-4 bg-gradient-primary text-white rounded-xl hover:shadow-glow-indigo transition-all flex items-center justify-center space-x-2 text-lg font-medium shadow-lg shadow-indigo-500/30 hover:scale-105 duration-300"
                >
                  <span>Start Protecting</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <button className="px-8 py-4 glass-card text-white rounded-xl hover:glass-card-hover transition-all border border-white/20 text-lg font-medium backdrop-blur-sm">
                  Learn More
                </button>
              </div>
            </motion.div>

            {/* Right 3D Scene */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative h-[500px] lg:h-[600px]"
            >
              <Scene3D />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4">
              How It Works
            </h2>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              Three simple steps to protect your AI-generated content
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Zap,
                title: 'Create & Register',
                description: 'Generate high-quality AI assets with ABV.dev and automatically register them on Story Protocol.',
                color: 'indigo'
              },
              {
                icon: Shield,
                title: 'Invisible Protection',
                description: 'Embed an imperceptible watermark containing the Story Protocol IP ID directly into image pixels.',
                color: 'coral'
              },
              {
                icon: CheckCircle,
                title: 'Detect & Verify',
                description: 'Upload any image to check its provenance. Even without metadata, we detect the watermark.',
                color: 'indigo'
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="glass-card glass-card-hover rounded-2xl p-8 group"
              >
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 shadow-lg ${
                  feature.color === 'indigo' 
                    ? 'bg-gradient-primary shadow-glow-indigo' 
                    : 'bg-gradient-secondary shadow-glow-coral'
                }`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-semibold text-white mb-3">
                  {feature.title}
                </h3>
                <p className="text-white/70 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass-card rounded-3xl p-12 border border-white/20"
          >
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
              Ready to Protect Your Creations?
            </h2>
            <p className="text-xl text-white/70 mb-10">
              Join the future of IP protection in the Generative AI era
            </p>
            <Link
              href="/login"
              className="group inline-flex items-center space-x-2 px-8 py-4 bg-gradient-primary text-white rounded-xl hover:shadow-glow-indigo transition-all text-lg font-medium shadow-lg shadow-indigo-500/30 hover:scale-105 duration-300"
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/10 relative z-10">
        <div className="max-w-7xl mx-auto text-center text-white/60">
          <p>© 2024 StorySeal. All rights reserved.</p>
        </div>
      </footer>
      </div>
    </div>
  )
}

