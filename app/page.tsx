'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Shield, CheckCircle, Zap, Search, Activity, FileText, Lock, Globe, Sparkles, Brain, Image as ImageIcon, Eye, Download } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
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
            <div className="w-16 h-16 rounded-lg flex items-center justify-center shadow-glow-indigo group-hover:shadow-glow-indigo transition-all duration-300 overflow-hidden relative">
              <Image 
                src="/storyseal-logo.png" 
                alt="StorySeal Logo" 
                width={64} 
                height={64} 
                className="object-contain scale-150 logo-transparent"
                style={{ width: 'auto', height: 'auto' }}
                priority
              />
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
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                  className="px-4 py-2 glass rounded-full text-sm font-medium text-white/90 backdrop-blur-sm border border-white/20 flex items-center space-x-2"
                >
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>Enterprise IP Protection for AI-Generated Content</span>
                </motion.span>
              </div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-5xl lg:text-7xl font-bold text-white mb-6 leading-tight"
              >
                Verify the Origin.
                <br />
                <span className="gradient-text-indigo">Seal the Creation.</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-xl text-white/80 mb-6 leading-relaxed max-w-2xl"
              >
                Enterprise-grade IP protection platform for the Generative AI era. StorySeal combines 
                invisible watermarking with Story Protocol blockchain to ensure every AI-generated asset 
                is verifiable, traceable, and protected—even when metadata is stripped.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="flex flex-wrap gap-3 mb-10"
              >
                {['Story Protocol', 'LSB Steganography', 'AI Similarity Detection', 'Reverse Image Search', 'C2PA Verification'].map((tag, idx) => (
                  <span key={idx} className="px-3 py-1 bg-white/5 rounded-full text-sm text-white/70 border border-white/10">
                    {tag}
                  </span>
                ))}
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <Link
                  href="/dashboard"
                  className="group px-8 py-4 bg-gradient-primary text-white rounded-xl hover:shadow-glow-indigo transition-all flex items-center justify-center space-x-2 text-lg font-medium shadow-lg shadow-indigo-500/30 hover:scale-105 duration-300"
                >
                  <span>Start Protecting</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <a
                  href="#features"
                  className="px-8 py-4 glass-card text-white rounded-xl hover:glass-card-hover transition-all border border-white/20 text-lg font-medium backdrop-blur-sm flex items-center justify-center space-x-2"
                >
                  <Eye className="w-5 h-5" />
                  <span>Learn More</span>
                </a>
              </motion.div>
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
      <section id="features" className="py-24 px-6 relative">
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
                description: 'Generate high-quality AI assets with ABV.dev and automatically register them on Story Protocol blockchain.',
                color: 'indigo',
                features: ['AI Image Generation', 'Auto IP Registration', 'Blockchain Provenance']
              },
              {
                icon: Shield,
                title: 'Invisible Protection',
                description: 'Embed an imperceptible watermark containing the Story Protocol IP ID directly into image pixels using LSB steganography.',
                color: 'coral',
                features: ['LSB Steganography', 'Metadata-Independent', 'Tamper-Proof']
              },
              {
                icon: CheckCircle,
                title: 'Detect & Verify',
                description: 'Upload any image to check its provenance. Even without metadata, we detect the watermark and verify ownership.',
                color: 'indigo',
                features: ['Watermark Detection', 'Blockchain Verification', 'Reverse Search']
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="glass-card glass-card-hover rounded-2xl p-8 group relative overflow-hidden"
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
                <p className="text-white/70 leading-relaxed mb-4">
                  {feature.description}
                </p>
                <ul className="space-y-2">
                  {feature.features.map((feat, idx) => (
                    <li key={idx} className="flex items-center space-x-2 text-sm text-white/60">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Features Section */}
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
              Powerful Features
            </h2>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              Everything you need to protect and verify your AI-generated assets
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: ImageIcon,
                title: 'AI Generation',
                description: 'Generate professional SVG artwork with ABV.dev StorySeal-Engine',
                color: 'indigo'
              },
              {
                icon: Lock,
                title: 'Invisible Watermarking',
                description: 'LSB steganography embeds IP IDs directly into pixels',
                color: 'coral'
              },
              {
                icon: Search,
                title: 'Reverse Image Search',
                description: 'Multi-provider search across the web (SerpAPI, Bing, Google)',
                color: 'indigo'
              },
              {
                icon: Brain,
                title: 'AI Similarity Detection',
                description: 'Perceptual hashing and ML-based similarity matching',
                color: 'coral'
              },
              {
                icon: Activity,
                title: 'Automated Monitoring',
                description: 'Schedule scans and monitor IP assets for violations',
                color: 'indigo'
              },
              {
                icon: FileText,
                title: 'DMCA Enforcement',
                description: 'Generate violation reports and DMCA notices',
                color: 'coral'
              },
              {
                icon: Globe,
                title: 'Blockchain Verification',
                description: 'Story Protocol integration for immutable provenance',
                color: 'indigo'
              },
              {
                icon: Shield,
                title: 'C2PA Support',
                description: 'Content Authenticity Initiative verification',
                color: 'coral'
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className="glass-card rounded-xl p-6 group hover:scale-105 transition-all duration-300"
              >
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${
                  feature.color === 'indigo' 
                    ? 'bg-indigo-500/20 text-indigo-300' 
                    : 'bg-coral-500/20 text-coral-300'
                }`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-white/70">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
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
              Who Can Use StorySeal?
            </h2>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              Perfect for creators, developers, and businesses in the AI era
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'AI Artists',
                description: 'Protect your AI-generated artwork and ensure you get credit for your creations.',
                icon: Sparkles
              },
              {
                title: 'Content Creators',
                description: 'Verify ownership and track usage of your digital assets across platforms.',
                icon: ImageIcon
              },
              {
                title: 'Developers',
                description: 'Integrate IP protection into your AI applications and services.',
                icon: Brain
              }
            ].map((useCase, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="glass-card rounded-2xl p-8 text-center"
              >
                <div className="w-16 h-16 mx-auto mb-6 bg-gradient-primary rounded-2xl flex items-center justify-center">
                  <useCase.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-semibold text-white mb-3">
                  {useCase.title}
                </h3>
                <p className="text-white/70">
                  {useCase.description}
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
            className="glass-card rounded-3xl p-12 border border-white/20 relative overflow-hidden"
          >
            {/* Background glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 blur-3xl"></div>
            
            <div className="relative z-10">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="w-40 h-40 mx-auto mb-6 rounded-full flex items-center justify-center overflow-hidden relative"
              >
                <Image 
                  src="/storyseal-logo.png" 
                  alt="StorySeal Logo" 
                  width={160} 
                  height={160} 
                  className="object-contain scale-175 logo-transparent"
                  style={{ width: 'auto', height: 'auto' }}
                />
              </motion.div>
              
              <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
                Ready to Protect Your Creations?
              </h2>
              <p className="text-xl text-white/70 mb-10">
                Join the future of IP protection in the Generative AI era. Protect, verify, and enforce 
                your AI-generated assets with enterprise-grade security and blockchain-backed provenance.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/dashboard"
                  className="group inline-flex items-center justify-center space-x-2 px-8 py-4 bg-gradient-primary text-white rounded-xl hover:shadow-glow-indigo transition-all text-lg font-medium shadow-lg shadow-indigo-500/30 hover:scale-105 duration-300"
                >
                  <span>Get Started Free</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  href="/dashboard/verify"
                  className="inline-flex items-center justify-center space-x-2 px-8 py-4 glass-card text-white rounded-xl hover:glass-card-hover transition-all border border-white/20 text-lg font-medium backdrop-blur-sm"
                >
                  <Search className="w-5 h-5" />
                  <span>Try Verification</span>
                </Link>
              </div>
            </div>
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

