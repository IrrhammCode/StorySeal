'use client'

import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { StoryClient, StoryConfig } from '@story-protocol/core-sdk'
import { STORY_CHAIN_ID } from '@/config/story'
import { useAccount } from 'wagmi'

// Get RPC URL dynamically
const getStoryRpcUrl = () => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('story_rpc_url')
    if (stored) return stored
  }
  return process.env.NEXT_PUBLIC_STORY_RPC_URL || 'https://aeneid.storyrpc.io'
}

let storyClientInstance: StoryClient | null = null

/**
 * Initialize Story Protocol client with private key (server-side or with private key)
 */
export function initStoryClientWithPrivateKey(privateKey: string): StoryClient {
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  
  const config: StoryConfig = {
    account,
    transport: http(getStoryRpcUrl()),
    chainId: STORY_CHAIN_ID,
  }

  return StoryClient.newClient(config)
}

/**
 * Get Story Protocol client instance (singleton)
 * Note: For client-side, we'll use wagmi account
 */
export function getStoryClient(account?: any): StoryClient | null {
  if (!account) {
    return null
  }

  if (storyClientInstance) {
    return storyClientInstance
  }

  try {
    const config: StoryConfig = {
      account,
      transport: http(getStoryRpcUrl()),
      chainId: STORY_CHAIN_ID,
    }

    storyClientInstance = StoryClient.newClient(config)
    return storyClientInstance
  } catch (error) {
    console.error('Failed to initialize Story client:', error)
    return null
  }
}

/**
 * Reset Story client instance
 */
export function resetStoryClient() {
  storyClientInstance = null
}

