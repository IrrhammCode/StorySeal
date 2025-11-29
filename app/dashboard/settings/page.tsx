'use client'

import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { 
  Settings as SettingsIcon,
  Key,
  Bell,
  Network,
  Save,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Droplet,
  ExternalLink,
  Copy,
  Sparkles,
  Search
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { useStoryService, useFundWallet } from '@/hooks/useStoryProtocol'
import { useAccount } from 'wagmi'

export default function SettingsPage() {
  const { address, isConnected } = useAccount()
  const storyService = useStoryService()
  const fundWalletMutation = useFundWallet()
  const [abvApiKey, setAbvApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [tineyeApiKey, setTineyeApiKey] = useState('')
  const [showTineyeApiKey, setShowTineyeApiKey] = useState(false)
  // Reverse Image Search API Keys
  const [serpapiApiKey, setSerpapiApiKey] = useState('')
  const [showSerpapiApiKey, setShowSerpapiApiKey] = useState(false)
  const [serpdogApiKey, setSerpdogApiKey] = useState('')
  const [showSerpdogApiKey, setShowSerpdogApiKey] = useState(false)
  const [bingVisualSearchApiKey, setBingVisualSearchApiKey] = useState('')
  const [showBingVisualSearchApiKey, setShowBingVisualSearchApiKey] = useState(false)
  const [googleApiKey, setGoogleApiKey] = useState('')
  const [showGoogleApiKey, setShowGoogleApiKey] = useState(false)
  const [googleSearchEngineId, setGoogleSearchEngineId] = useState('')
  const [showGoogleSearchEngineId, setShowGoogleSearchEngineId] = useState(false)
  const [pinataJwtToken, setPinataJwtToken] = useState('')
  const [showPinataJwtToken, setShowPinataJwtToken] = useState(false)
  const [pinataApiKey, setPinataApiKey] = useState('')
  const [showPinataApiKey, setShowPinataApiKey] = useState(false)
  const [pinataSecretKey, setPinataSecretKey] = useState('')
  const [showPinataSecretKey, setShowPinataSecretKey] = useState(false)
  const [storyRpcUrl, setStoryRpcUrl] = useState('https://aeneid.storyrpc.io')
  const [notifications, setNotifications] = useState({
    violations: true,
    registrations: true,
    verifications: false,
  })
  const [saved, setSaved] = useState(false)
  const { showToast } = useToast()

  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedApiKey = localStorage.getItem('abv_api_key')
      const storedTineyeApiKey = localStorage.getItem('tineye_api_key')
      const storedSerpapiApiKey = localStorage.getItem('serpapi_api_key')
      const storedSerpdogApiKey = localStorage.getItem('serpdog_api_key')
      const storedBingApiKey = localStorage.getItem('bing_visual_search_api_key')
      const storedGoogleApiKey = localStorage.getItem('google_api_key')
      const storedGoogleSearchEngineId = localStorage.getItem('google_search_engine_id')
      const storedPinataJwt = localStorage.getItem('pinata_jwt_token')
      const storedPinataApiKey = localStorage.getItem('pinata_api_key')
      const storedPinataSecretKey = localStorage.getItem('pinata_secret_key')
      const storedRpcUrl = localStorage.getItem('story_rpc_url')
      const storedNotifications = localStorage.getItem('notifications')
      
      if (storedApiKey) setAbvApiKey(storedApiKey)
      if (storedTineyeApiKey) setTineyeApiKey(storedTineyeApiKey)
      if (storedSerpapiApiKey) setSerpapiApiKey(storedSerpapiApiKey)
      if (storedSerpdogApiKey) setSerpdogApiKey(storedSerpdogApiKey)
      if (storedBingApiKey) setBingVisualSearchApiKey(storedBingApiKey)
      if (storedGoogleApiKey) setGoogleApiKey(storedGoogleApiKey)
      if (storedGoogleSearchEngineId) setGoogleSearchEngineId(storedGoogleSearchEngineId)
      if (storedPinataJwt) setPinataJwtToken(storedPinataJwt)
      if (storedPinataApiKey) setPinataApiKey(storedPinataApiKey)
      if (storedPinataSecretKey) setPinataSecretKey(storedPinataSecretKey)
      if (storedRpcUrl) setStoryRpcUrl(storedRpcUrl)
      if (storedNotifications) {
        try {
          setNotifications(JSON.parse(storedNotifications))
        } catch (e) {
          console.error('Failed to parse notifications:', e)
        }
      }
    }
  }, [])

  const handleSave = () => {
    // Save to localStorage (in production, this would be saved securely)
    // ABV.dev API Key - save or remove
    if (abvApiKey && abvApiKey.trim()) {
      localStorage.setItem('abv_api_key', abvApiKey.trim())
    } else {
      localStorage.removeItem('abv_api_key')
    }
    
    // ABV.dev Base URL - save or remove
    const abvBaseUrl = (typeof window !== 'undefined' && localStorage.getItem('abv_api_url')) || process.env.NEXT_PUBLIC_ABV_API_URL || 'https://app.abv.dev'
    if (abvBaseUrl && abvBaseUrl.trim()) {
      localStorage.setItem('abv_api_url', abvBaseUrl.trim())
    } else {
      localStorage.removeItem('abv_api_url')
    }
    
    // TinEye API Key
    if (tineyeApiKey) {
      localStorage.setItem('tineye_api_key', tineyeApiKey)
    } else {
      localStorage.removeItem('tineye_api_key')
    }
    
    // Reverse Image Search API Keys
    if (serpapiApiKey) {
      localStorage.setItem('serpapi_api_key', serpapiApiKey)
    } else {
      localStorage.removeItem('serpapi_api_key')
    }
    
    if (serpdogApiKey) {
      localStorage.setItem('serpdog_api_key', serpdogApiKey)
    } else {
      localStorage.removeItem('serpdog_api_key')
    }
    
    if (bingVisualSearchApiKey) {
      localStorage.setItem('bing_visual_search_api_key', bingVisualSearchApiKey)
    } else {
      localStorage.removeItem('bing_visual_search_api_key')
    }
    
    if (googleApiKey) {
      localStorage.setItem('google_api_key', googleApiKey)
    } else {
      localStorage.removeItem('google_api_key')
    }
    
    if (googleSearchEngineId) {
      localStorage.setItem('google_search_engine_id', googleSearchEngineId)
    } else {
      localStorage.removeItem('google_search_engine_id')
    }
    
    // Pinata credentials - save all that are provided
    if (pinataApiKey) {
      localStorage.setItem('pinata_api_key', pinataApiKey)
    }
    if (pinataSecretKey) {
      localStorage.setItem('pinata_secret_key', pinataSecretKey)
    }
    if (pinataJwtToken) {
      localStorage.setItem('pinata_jwt_token', pinataJwtToken)
    }
    
    // Clear credentials if fields are empty (to allow switching)
    if (!pinataApiKey) {
      localStorage.removeItem('pinata_api_key')
    }
    if (!pinataSecretKey) {
      localStorage.removeItem('pinata_secret_key')
    }
    if (!pinataJwtToken) {
      localStorage.removeItem('pinata_jwt_token')
    }
    
    localStorage.setItem('story_rpc_url', storyRpcUrl)
    localStorage.setItem('notifications', JSON.stringify(notifications))
    
    setSaved(true)
    showToast('success', 'Settings saved successfully!')
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
        <p className="text-white/90">Manage your StorySeal configuration and preferences</p>
      </motion.div>

      {/* API Keys */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="glass-card rounded-xl border border-white/10 p-6 mb-6"
      >
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
            <Key className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">API Keys</h2>
            <p className="text-sm text-white/90">Configure your API keys for external services</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              ABV.dev API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={abvApiKey}
                onChange={(e) => setAbvApiKey(e.target.value)}
                placeholder="Enter your ABV.dev API key"
                className="w-full px-4 py-3 pr-12 glass-card rounded-lg text-white placeholder-white/70 focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showApiKey ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
            <p className="text-xs text-white/90 mt-2">
              Used for AI image generation. Get your key from{' '}
              <a href="https://app.abv.dev" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 underline font-medium">
                ABV.dev dashboard
              </a>
              . <strong className="text-white">This setting takes priority over .env.local</strong>
            </p>
            <div className="mt-3 p-3 bg-blue-500/10 border border-blue-400/30 rounded-lg">
              <p className="text-xs text-white mb-2">
                <strong>💡 Important:</strong>
              </p>
              <p className="text-xs text-white mb-2">
                1. Set API key here and click <strong className="text-white">"Save Settings"</strong> (button below)
              </p>
              <p className="text-xs text-white mb-2">
                2. <strong className="text-white">API key from Settings page takes priority</strong> over .env.local
              </p>
              <p className="text-xs text-white">
                3. Login to <a href="https://app.abv.dev" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-white hover:text-white/80">ABV.dev dashboard</a> → Settings → Enable Story Protocol integration
              </p>
            </div>
            {abvApiKey && (
              <div className="mt-2 p-2 bg-green-500/10 border border-green-400/30 rounded-lg">
                <p className="text-xs text-green-300">
                  ✅ API key is set. Click "Save Settings" to apply changes.
                </p>
              </div>
            )}
          </div>

          {/* TinEye API Key */}
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              TinEye API Key (Optional)
            </label>
            <div className="relative">
              <input
                type={showTineyeApiKey ? 'text' : 'password'}
                value={tineyeApiKey}
                onChange={(e) => setTineyeApiKey(e.target.value)}
                placeholder="Enter your TinEye API key (optional)"
                className="w-full px-4 py-3 pr-12 border border-white/20 rounded-lg glass-card text-white placeholder-white/70 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowTineyeApiKey(!showTineyeApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showTineyeApiKey ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
            <p className="text-xs text-white/90 mt-2">
              Used for reverse image search. Get your key from{' '}
              <a href="https://tineye.com/api" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 underline font-medium">
                TinEye API
              </a>
              . Optional.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Reverse Image Search APIs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="glass-card rounded-xl border border-white/10 p-6 mb-6"
      >
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
            <Search className="w-5 h-5 text-purple-300" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Reverse Image Search APIs</h2>
            <p className="text-sm text-white/90">Configure APIs for finding image usage online (FREE tiers available)</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* SerpAPI */}
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              <div className="flex items-center space-x-2">
                <span>SerpAPI Key</span>
                <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded">FREE: 100/month</span>
              </div>
            </label>
            <div className="relative">
              <input
                type={showSerpapiApiKey ? 'text' : 'password'}
                value={serpapiApiKey}
                onChange={(e) => setSerpapiApiKey(e.target.value)}
                placeholder="Enter your SerpAPI key"
                className="w-full px-4 py-3 pr-12 border border-white/20 rounded-lg glass-card text-white placeholder-white/70 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowSerpapiApiKey(!showSerpapiApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showSerpapiApiKey ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
            <p className="text-xs text-white/90 mt-2">
              Get free API key from{' '}
              <a href="https://serpapi.com" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 underline font-medium">
                serpapi.com
              </a>
              {' '}(100 free searches/month). Used for reverse image search in Monitor page.
            </p>
          </div>

          {/* Serpdog */}
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              <div className="flex items-center space-x-2">
                <span>Serpdog API Key</span>
                <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded">FREE tier</span>
              </div>
            </label>
            <div className="relative">
              <input
                type={showSerpdogApiKey ? 'text' : 'password'}
                value={serpdogApiKey}
                onChange={(e) => setSerpdogApiKey(e.target.value)}
                placeholder="Enter your Serpdog API key"
                className="w-full px-4 py-3 pr-12 border border-white/20 rounded-lg glass-card text-white placeholder-white/70 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowSerpdogApiKey(!showSerpdogApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showSerpdogApiKey ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
            <p className="text-xs text-white/90 mt-2">
              Alternative to SerpAPI. Get free API key from{' '}
              <a href="https://serpdog.io" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 underline font-medium">
                serpdog.io
              </a>
              .
            </p>
          </div>

          {/* Bing Visual Search */}
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              <div className="flex items-center space-x-2">
                <span>Bing Visual Search API Key</span>
                <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded">FREE: 3,000/month</span>
              </div>
            </label>
            <div className="relative">
              <input
                type={showBingVisualSearchApiKey ? 'text' : 'password'}
                value={bingVisualSearchApiKey}
                onChange={(e) => setBingVisualSearchApiKey(e.target.value)}
                placeholder="Enter your Bing Visual Search API key"
                className="w-full px-4 py-3 pr-12 border border-white/20 rounded-lg glass-card text-white placeholder-white/70 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowBingVisualSearchApiKey(!showBingVisualSearchApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showBingVisualSearchApiKey ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
            <p className="text-xs text-white/90 mt-2">
              Get free API key from{' '}
              <a href="https://azure.microsoft.com/en-us/services/cognitive-services/bing-visual-search/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 underline font-medium">
                Azure Portal
              </a>
              {' '}(3,000 free transactions/month). Create Bing Visual Search resource.
            </p>
          </div>

          {/* Google Custom Search */}
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              <div className="flex items-center space-x-2">
                <span>Google Custom Search API Key</span>
                <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded">FREE: 100/day</span>
              </div>
            </label>
            <div className="relative">
              <input
                type={showGoogleApiKey ? 'text' : 'password'}
                value={googleApiKey}
                onChange={(e) => setGoogleApiKey(e.target.value)}
                placeholder="Enter your Google API key"
                className="w-full px-4 py-3 pr-12 border border-white/20 rounded-lg glass-card text-white placeholder-white/70 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowGoogleApiKey(!showGoogleApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showGoogleApiKey ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
            <p className="text-xs text-white/90 mt-2">
              Get API key from{' '}
              <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 underline font-medium">
                Google Cloud Console
              </a>
              {' '}(100 free queries/day). Also requires Search Engine ID below.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              Google Custom Search Engine ID
            </label>
            <div className="relative">
              <input
                type={showGoogleSearchEngineId ? 'text' : 'password'}
                value={googleSearchEngineId}
                onChange={(e) => setGoogleSearchEngineId(e.target.value)}
                placeholder="Enter your Custom Search Engine ID"
                className="w-full px-4 py-3 pr-12 border border-white/20 rounded-lg glass-card text-white placeholder-white/70 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowGoogleSearchEngineId(!showGoogleSearchEngineId)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showGoogleSearchEngineId ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
            <p className="text-xs text-white/90 mt-2">
              Create Custom Search Engine at{' '}
              <a href="https://programmablesearchengine.google.com" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 underline font-medium">
                Google Programmable Search
              </a>
              {' '}and enable Image Search. Required if using Google API.
            </p>
          </div>

          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-400/30 rounded-lg">
            <p className="text-xs text-white mb-2">
              <strong>💡 Tips:</strong>
            </p>
            <ul className="text-xs text-white space-y-1 list-disc list-inside">
              <li>Set at least one API key to enable reverse image search in Monitor page</li>
              <li>System will auto-select best available provider</li>
              <li>All APIs are legal and don't require web scraping</li>
              <li>Free tiers are sufficient for testing and small-scale usage</li>
            </ul>
          </div>
        </div>
      </motion.div>

      {/* IPFS Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="glass-card rounded-xl border border-white/10 p-6 mb-6"
      >
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
            <Key className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">IPFS / Pinata Settings</h2>
            <p className="text-sm text-white/90">Configure Pinata for IPFS storage</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              Pinata API Key
            </label>
            <div className="relative">
              <input
                type={showPinataApiKey ? 'text' : 'password'}
                value={pinataApiKey}
                onChange={(e) => setPinataApiKey(e.target.value)}
                placeholder="Enter your Pinata API Key"
                className="w-full px-4 py-3 pr-12 border border-white/20 rounded-lg glass-card text-white placeholder-white/70 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowPinataApiKey(!showPinataApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showPinataApiKey ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              Pinata Secret Key (API Secret)
            </label>
            <div className="relative">
              <input
                type={showPinataSecretKey ? 'text' : 'password'}
                value={pinataSecretKey}
                onChange={(e) => setPinataSecretKey(e.target.value)}
                placeholder="Enter your Pinata API Secret / Secret Access Token"
                className="w-full px-4 py-3 pr-12 border border-white/20 rounded-lg glass-card text-white placeholder-white/70 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowPinataSecretKey(!showPinataSecretKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showPinataSecretKey ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
            <p className="text-xs text-white/90 mt-2">
              <strong className="text-white">Required:</strong> Enter "API Secret" or "Secret Access Token" from Pinata dashboard here. 
              This is the same as "Secret Key". Get free API Key + API Secret from{' '}
              <a href="https://pinata.cloud" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 underline font-medium">
                pinata.cloud
              </a>
            </p>
            <div className="mt-3 p-3 bg-blue-50 bg-blue-500/10 border border-blue-200 border-blue-400/30 rounded-lg">
              <p className="text-xs text-white mb-1">
                <strong>💡 Pinata Credentials Mapping:</strong>
              </p>
              <p className="text-xs text-white">
                • <strong className="text-white">API Key</strong> = Key name (short, ~20 chars) → Enter in "Pinata API Key"
              </p>
              <p className="text-xs text-white">
                • <strong className="text-white">API Secret</strong> = Secret Key = Secret Access Token (long, ~64+ chars) → Enter in "Pinata Secret Key"
              </p>
              <p className="text-xs text-white">
                • <strong className="text-white">JWT Token</strong> = Optional (if using JWT, no need for API Key + Secret Key)
              </p>
            </div>
            <div className="mt-3 p-3 bg-yellow-50 bg-yellow-500/10 border border-yellow-200 border-yellow-400/30 rounded-lg">
              <p className="text-xs text-white">
                <strong>⚠️ Required for Real On-Chain Registration:</strong> Metadata will be automatically uploaded to IPFS to avoid contract revert. Without these credentials, registration will fail.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Network Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="glass-card rounded-xl border border-white/10 p-6 mb-6"
      >
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
            <Network className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Network Settings</h2>
            <p className="text-sm text-white/90">Configure Story Protocol network connection</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              Story Protocol RPC URL
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={storyRpcUrl}
                onChange={(e) => setStoryRpcUrl(e.target.value)}
                placeholder="https://aeneid.storyrpc.io"
                className="flex-1 px-4 py-3 border border-white/20 rounded-lg glass-card text-white placeholder-white/70 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => {
                  const defaultRpc = 'https://aeneid.storyrpc.io'
                  setStoryRpcUrl(defaultRpc)
                  showToast('info', 'RPC URL reset to default (Public RPC). Click "Save Settings" to apply.')
                }}
                className="px-4 py-3 glass text-white/90 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium whitespace-nowrap"
                title="Reset to default Public RPC (recommended for ABV.dev auto-registration)"
              >
                Reset to Default
              </button>
            </div>
            <p className="text-xs text-white/90 mt-2">
              RPC endpoint for Story Protocol network. <strong className="text-white">Default (Public RPC)</strong> is recommended for ABV.dev auto-registration.
            </p>
            {storyRpcUrl.includes('tenderly.co') && (
              <div className="mt-2 p-3 bg-yellow-50 bg-yellow-500/10 border border-yellow-200 border-yellow-400/30 rounded-lg">
                <p className="text-xs text-yellow-800 text-yellow-300">
                  <strong>⚠️ Tenderly RPC Detected:</strong> If using ABV.dev auto-registration, switch to Public RPC to avoid RPC mismatch. ABV.dev registers IP assets on Public RPC.
                </p>
              </div>
            )}
          </div>

          {/* SPG NFT Contract Management */}
          <div className="pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-white/90">SPG NFT Contract</p>
                <p className="text-xs text-white/90">
                  {typeof window !== 'undefined' && localStorage.getItem('storyseal_spg_nft_contract')
                    ? `Current: ${localStorage.getItem('storyseal_spg_nft_contract')?.slice(0, 10)}...`
                    : 'Not set (will be created automatically)'}
                </p>
              </div>
              {typeof window !== 'undefined' && localStorage.getItem('storyseal_spg_nft_contract') && (
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      localStorage.removeItem('storyseal_spg_nft_contract')
                      showToast('success', 'SPG NFT contract cleared. A new one will be created on next registration.')
                    }
                  }}
                  className="px-3 py-1.5 text-xs bg-red-100 bg-red-500/10 text-red-700 text-red-300 rounded-lg hover:bg-red-200 hover:bg-red-500/20 transition-colors"
                >
                  Clear & Reset
                </button>
              )}
            </div>
            <div className="mt-2 p-3 bg-blue-50 bg-blue-500/10 border border-blue-200 border-blue-400/30 rounded-lg">
              <p className="text-xs text-white">
                <strong>💡 Troubleshooting:</strong> If you're experiencing contract revert errors (0x3bdad64c), 
                try clearing the SPG NFT contract to force creation of a new one. This can resolve contract state issues.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Testnet Faucet */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="glass-card rounded-xl border border-white/10 p-6 mb-6"
      >
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
            <Droplet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Testnet Faucet</h2>
            <p className="text-sm text-white/90">Get IP tokens for Aeneid Testnet</p>
          </div>
        </div>

        {/* Wallet & Token Info */}
        {isConnected && address && (
          <div className="mb-4 p-4 bg-blue-50 bg-blue-500/10 border border-blue-200 border-blue-400/30 rounded-lg">
            <p className="text-sm font-medium text-white mb-3">
              💼 Wallet & Token Information
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-white">Wallet Address:</span>
                <div className="flex items-center space-x-2">
                  <code className="text-white font-mono">
                    {address.slice(0, 10)}...{address.slice(-8)}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(address)
                      showToast('success', 'Wallet address copied!')
                    }}
                    className="p-1 hover:bg-white/20 rounded transition-colors"
                  >
                    <Copy className="w-3 h-3 text-white" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white">Full Address:</span>
                <code className="text-white font-mono text-[10px] break-all">
                  {address}
                </code>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-blue-200 border-blue-400/30">
                <span className="text-white">Token Type:</span>
                <span className="text-white font-medium">
                  IP (Aeneid Testnet Native Token)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white">Network:</span>
                <span className="text-white font-medium">
                  Aeneid Testnet (Chain ID: 1315)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tenderly Fund Wallet Button */}
        {typeof window !== 'undefined' && storyRpcUrl?.includes('tenderly.co') && isConnected && storyService && (
          <div className="mb-4 p-4 bg-green-50 bg-green-500/10 border border-green-200 border-green-400/30 rounded-lg">
            <p className="text-sm font-medium text-white mb-2">
              🚀 Tenderly Virtual TestNet Detected
            </p>
            <p className="text-xs text-white mb-3">
              Fund your wallet directly from the app using Tenderly's unlimited faucet.
            </p>
            <div className="flex space-x-2">
              <button
                onClick={async () => {
                  try {
                    await fundWalletMutation.mutateAsync('100')
                    showToast('success', 'Wallet funded with 100 IP tokens!')
                  } catch (error: any) {
                    showToast('error', error.message || 'Failed to fund wallet')
                  }
                }}
                disabled={fundWalletMutation.isPending}
                className="px-4 py-2 bg-green-600 bg-green-500 text-white rounded-lg hover:bg-green-700 hover:bg-green-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fundWalletMutation.isPending ? 'Funding...' : 'Fund 100 IP Tokens'}
              </button>
              <button
                onClick={async () => {
                  try {
                    await fundWalletMutation.mutateAsync('1000')
                    showToast('success', 'Wallet funded with 1000 IP tokens!')
                  } catch (error: any) {
                    showToast('error', error.message || 'Failed to fund wallet')
                  }
                }}
                disabled={fundWalletMutation.isPending}
                className="px-4 py-2 bg-green-600 bg-green-500 text-white rounded-lg hover:bg-green-700 hover:bg-green-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fundWalletMutation.isPending ? 'Funding...' : 'Fund 1000 IP Tokens'}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 bg-blue-500/10 border border-blue-200 border-blue-400/30 rounded-lg">
            <p className="text-sm text-white mb-3">
              <strong>Important:</strong> Aeneid Testnet uses a special token called <strong>IP</strong> (not regular ETH). 
              You need to get IP tokens from the faucet to perform transactions like IP registration.
            </p>
          </div>

          <div className="space-y-3">
            <a
              href="https://docs.story.foundation/aeneid"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 glass rounded-lg hover:bg-white/10 transition-colors group"
            >
              <div>
                <p className="font-medium text-white">Official Faucet</p>
                <p className="text-sm text-white/70">10 IP per request</p>
              </div>
              <ExternalLink className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
            </a>

            <a
              href="https://faucet.unitynodes.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 glass rounded-lg hover:bg-white/10 transition-colors group"
            >
              <div>
                <p className="font-medium text-white">Unity Nodes Faucet</p>
                <p className="text-sm text-white/70">5 IP per wallet</p>
              </div>
              <ExternalLink className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
            </a>
          </div>

          <div className="pt-4 border-t border-white/10">
            <p className="text-xs text-white/90 mb-3">
              <strong className="text-white">Note:</strong> Make sure your wallet is connected to <strong className="text-white">Aeneid Testnet (Chain ID: 1315)</strong> before claiming tokens from the faucet.
            </p>
            
            <div className="p-3 bg-indigo-500/20 border border-indigo-200 border-indigo-400/30 rounded-lg">
              <p className="text-sm font-semibold text-white mb-2">
                💡 What are IP Tokens used for?
              </p>
              <ul className="text-xs text-white space-y-1 list-disc list-inside">
                <li><strong>IP Registration</strong> - Register AI-generated artwork as IP Asset on blockchain (mint NFT + register)</li>
                <li><strong>License Creation</strong> - Create license terms for IP assets (Commercial, Non-Commercial, etc.)</li>
                <li><strong>Gas Fees</strong> - Transaction fees for all blockchain operations on Story Protocol</li>
              </ul>
              <p className="text-xs text-white mt-2">
                Every transaction requires IP tokens for gas fees. Make sure you have sufficient balance before performing operations.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Notifications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="glass-card rounded-xl border border-white/10 p-6 mb-6"
      >
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Notifications</h2>
            <p className="text-sm text-white/90">Manage your notification preferences</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 glass rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
            <div>
              <p className="font-medium text-white">IP Violations</p>
              <p className="text-sm text-white/90">Get notified when violations are detected</p>
            </div>
            <input
              type="checkbox"
              checked={notifications.violations}
              onChange={(e) => setNotifications(prev => ({ ...prev, violations: e.target.checked }))}
              className="w-5 h-5 text-indigo rounded focus:ring-indigo"
            />
          </label>

          <label className="flex items-center justify-between p-4 glass rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
            <div>
              <p className="font-medium text-white">New Registrations</p>
              <p className="text-sm text-white/90">Notify when IP assets are registered</p>
            </div>
            <input
              type="checkbox"
              checked={notifications.registrations}
              onChange={(e) => setNotifications(prev => ({ ...prev, registrations: e.target.checked }))}
              className="w-5 h-5 text-indigo rounded focus:ring-indigo"
            />
          </label>

          <label className="flex items-center justify-between p-4 glass rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
            <div>
              <p className="font-medium text-white">Verifications</p>
              <p className="text-sm text-white/90">Notify when images are verified</p>
            </div>
            <input
              type="checkbox"
              checked={notifications.verifications}
              onChange={(e) => setNotifications(prev => ({ ...prev, verifications: e.target.checked }))}
              className="w-5 h-5 text-indigo rounded focus:ring-indigo"
            />
          </label>
        </div>
      </motion.div>

      {/* Save Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center space-x-2">
          {saved && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center space-x-2 text-green-600 text-green-200/90"
            >
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Settings saved!</span>
            </motion.div>
          )}
        </div>
        <button
          onClick={handleSave}
          className="flex items-center space-x-2 px-6 py-3 bg-gradient-primary text-white rounded-lg hover:shadow-glow-indigo transition-all font-medium"
        >
          <Save className="w-5 h-5" />
          <span>Save Settings</span>
        </button>
      </motion.div>
    </div>
  )
}

