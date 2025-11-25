import { createConfig, http } from 'wagmi'
import { mainnet, sepolia, polygon, arbitrum } from 'wagmi/chains'
import { injected, metaMask, walletConnect } from 'wagmi/connectors'
import { defineChain } from 'viem'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

// Get RPC URL dynamically (supports Tenderly)
// Note: Wagmi config is created at module load time (server-side),
// so we can only use env variables here. localStorage will be used
// by Story Protocol SDK at runtime (client-side).
const getAeneidRpcUrl = () => {
  // Check environment variable (available at build/load time)
  const envUrl = process.env.NEXT_PUBLIC_STORY_RPC_URL
  if (envUrl && envUrl.trim() && !envUrl.includes('your-fork-id') && !envUrl.includes('your-tenderly')) {
    return envUrl.trim()
  }
  
  // Default fallback
  return 'https://aeneid.storyrpc.io'
}

// Aeneid Testnet (Story Protocol)
// Chain ID: 1315 (Official Story Protocol Aeneid Testnet)
// Supports Tenderly Virtual TestNet via dynamic RPC URL
const aeneidTestnet = defineChain({
  id: 1315,
  name: 'Aeneid Testnet',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      // This will be overridden in transports, but kept for compatibility
      http: ['https://aeneid.storyrpc.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Aeneid Explorer',
      url: 'https://explorer.aeneid.storyprotocol.xyz',
    },
  },
  testnet: true,
})

const connectors = [
  injected(),
  metaMask(),
]

// Only add walletConnect if projectId is provided and valid
if (projectId && projectId !== 'demo-project-id' && projectId !== 'your-walletconnect-project-id') {
  try {
    connectors.push(walletConnect({ projectId }) as any)
  } catch (error) {
    console.warn('Failed to initialize WalletConnect:', error)
  }
}

// Get RPC URL for Aeneid (supports Tenderly via env)
// Note: Wagmi config is created at module load, so uses env variable
// Story Protocol SDK (created at runtime) can use localStorage
const aeneidRpcUrl = getAeneidRpcUrl()

// Log RPC URL (only in browser, for debugging)
if (typeof window !== 'undefined') {
  console.log('[wagmi] Aeneid RPC URL:', aeneidRpcUrl)
  console.log('[wagmi] Is Tenderly?', aeneidRpcUrl.includes('tenderly.co'))
  
  // Check if localStorage has different RPC URL (for Story Protocol SDK)
  const storedRpc = localStorage.getItem('story_rpc_url')
  if (storedRpc && storedRpc !== aeneidRpcUrl) {
    console.log('[wagmi] Note: Story Protocol SDK will use localStorage RPC:', storedRpc)
    console.log('[wagmi] Wagmi uses env RPC:', aeneidRpcUrl)
    console.log('[wagmi] Recommendation: Set NEXT_PUBLIC_STORY_RPC_URL in .env to match localStorage')
  }
}

export const config = createConfig({
  chains: [aeneidTestnet, sepolia, mainnet, polygon, arbitrum], // Aeneid Testnet first (default)
  connectors,
  transports: {
    [aeneidTestnet.id]: http(aeneidRpcUrl), // Uses env variable or default
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
  },
})

// Export Aeneid Testnet for use in other components
export { aeneidTestnet }

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}

