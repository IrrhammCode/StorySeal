import { http } from 'viem'
import { StoryConfig } from '@story-protocol/core-sdk'

// Get RPC URL from env or localStorage (for settings page)
// Priority: localStorage > process.env > default
const getStoryRpcUrl = () => {
  // Check localStorage first (user settings override)
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('story_rpc_url')
    if (stored && stored.trim()) {
      console.log('[getStoryRpcUrl] Using localStorage value:', stored)
      return stored.trim()
    }
  }
  
  // Fallback to environment variable
  const envUrl = process.env.NEXT_PUBLIC_STORY_RPC_URL
  if (envUrl && envUrl.trim()) {
    console.log('[getStoryRpcUrl] Using env variable:', envUrl)
    return envUrl.trim()
  }
  
  // Default fallback
  console.log('[getStoryRpcUrl] Using default RPC URL')
  return 'https://aeneid.storyrpc.io'
}

export const STORY_RPC_URL = getStoryRpcUrl()
export const STORY_CHAIN_ID = 'aeneid' as const

export const getStoryConfig = (account: any): StoryConfig => {
  return {
    account,
    transport: http(STORY_RPC_URL),
    chainId: STORY_CHAIN_ID,
  }
}

