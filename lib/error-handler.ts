/**
 * Error Handler for StorySeal
 * Provides user-friendly error messages and error tracking
 */

export interface ErrorInfo {
  message: string
  userMessage: string
  code?: string
  retryable?: boolean
  suggestion?: string
}

/**
 * Parse error and return user-friendly message
 */
export function parseError(error: unknown): ErrorInfo {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    
    // Wallet connection errors
    if (message.includes('wallet') || message.includes('account')) {
      return {
        message: error.message,
        userMessage: 'Wallet connection issue. Please connect your wallet and try again.',
        code: 'WALLET_ERROR',
        retryable: true,
        suggestion: 'Make sure your wallet is connected and unlocked.',
      }
    }
    
    // Network errors
    if (message.includes('network') || message.includes('rpc') || message.includes('fetch')) {
      // Check for specific network error types
      const isUrlError = message.includes('url') || message.includes('404') || message.includes('not found') || message.includes('failed to fetch')
      const isConnectionError = message.includes('connection') || message.includes('timeout') || message.includes('refused')
      
      let userMessage = 'Network error'
      if (isUrlError) {
        userMessage = 'Network error or URL not found. Please check the URL and your internet connection.'
      } else if (isConnectionError) {
        userMessage = 'Network error or connection failed. Please check your internet connection and try again.'
      } else {
        userMessage = 'Network error or URL not found. Please check your internet connection and the URL, then try again.'
      }
      
      return {
        message: error.message,
        userMessage,
        code: 'NETWORK_ERROR',
        retryable: true,
        suggestion: 'Check your internet connection, RPC endpoint settings, and verify the URL is accessible.',
      }
    }
    
    // Story Protocol errors
    if (message.includes('story') || message.includes('ip') || message.includes('registration') || message.includes('mintandregisterip') || message.includes('reverted')) {
      // Contract revert errors - check FIRST before other checks
      if (message.includes('reverted') || message.includes('0x3bdad64c') || message.includes('unable to decode') || message.includes('signature') || message.includes('transaction failed')) {
        // Error signature 0x3bdad64c is NOT a duplicate registration error
        // It's likely a contract state or parameter validation error
        let detailedSuggestion = 'Possible causes:\n'
        detailedSuggestion += '1. Metadata not accessible during contract execution (IPFS gateway timeout)\n'
        detailedSuggestion += '2. Metadata hash mismatch (calculated hash does not match contract validation)\n'
        detailedSuggestion += '3. SPG NFT contract not properly initialized\n'
        detailedSuggestion += '4. Invalid metadata format\n'
        detailedSuggestion += '5. Contract state mismatch\n\n'
        detailedSuggestion += 'Troubleshooting steps:\n'
        detailedSuggestion += '1. Wait 10-30 seconds and retry (IPFS propagation delay)\n'
        detailedSuggestion += '2. Check wallet balance (need IP tokens from faucet: https://docs.story.foundation/aeneid)\n'
        detailedSuggestion += '3. Verify metadata is accessible via Pinata gateway\n'
        detailedSuggestion += '4. Check Tenderly dashboard for detailed error logs\n'
        detailedSuggestion += '5. Try using Tenderly RPC for better debugging'
        
        return {
          message: error.message,
          userMessage: 'Contract transaction failed. The Story Protocol contract rejected the registration request.',
          code: 'CONTRACT_REVERT',
          retryable: true,
          suggestion: detailedSuggestion,
        }
      }
      
      // Metadata-related errors
      if (message.includes('metadata') && (message.includes('not accessible') || message.includes('timeout') || message.includes('failed'))) {
        return {
          message: error.message,
          userMessage: 'Metadata accessibility issue. The IPFS metadata could not be accessed during registration.',
          code: 'METADATA_ERROR',
          retryable: true,
          suggestion: '1. Wait 10-30 seconds for IPFS propagation\n2. Check IPFS gateway accessibility\n3. Verify metadata was uploaded successfully\n4. Try again - metadata might be available now',
        }
      }
      
      // Hash mismatch errors
      if (message.includes('hash') && (message.includes('mismatch') || message.includes('does not match'))) {
        return {
          message: error.message,
          userMessage: 'Metadata hash mismatch. The calculated hash does not match the contract validation.',
          code: 'HASH_MISMATCH',
          retryable: false,
          suggestion: 'This usually indicates a metadata format issue. Please regenerate the image and try again.',
        }
      }
      
      if (message.includes('insufficient') || message.includes('balance')) {
        return {
          message: error.message,
          userMessage: 'Insufficient IP tokens. Please get testnet tokens from the faucet.',
          code: 'INSUFFICIENT_TOKENS',
          retryable: false,
          suggestion: 'Visit the faucet to get IP tokens: https://docs.story.foundation/aeneid',
        }
      }
      
      if (message.includes('already registered') || message.includes('duplicate')) {
        return {
          message: error.message,
          userMessage: 'This IP asset is already registered.',
          code: 'DUPLICATE_REGISTRATION',
          retryable: false,
          suggestion: 'This asset has already been registered on Story Protocol.',
        }
      }
      
      return {
        message: error.message,
        userMessage: 'Registration failed. Please try again.',
        code: 'REGISTRATION_ERROR',
        retryable: true,
        suggestion: 'Check your wallet connection and IP token balance. If using Tenderly, check the dashboard for detailed error information.',
      }
    }
    
    // ABV.dev API errors
    if (message.includes('abv') || message.includes('api') || message.includes('key')) {
      if (message.includes('unauthorized') || message.includes('invalid key') || message.includes('401')) {
        return {
          message: error.message,
          userMessage: 'Invalid API key. Please check your ABV.dev API key in settings.',
          code: 'INVALID_API_KEY',
          retryable: false,
          suggestion: '1. Go to Settings page\n2. Update your ABV.dev API key\n3. Get API key from https://app.abv.dev',
        }
      }
      
      if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
        return {
          message: error.message,
          userMessage: 'Rate limit exceeded. Too many requests to ABV.dev API.',
          code: 'RATE_LIMIT',
          retryable: true,
          suggestion: 'Please wait a few minutes before trying again. Consider upgrading your ABV.dev plan for higher rate limits.',
        }
      }
      
      return {
        message: error.message,
        userMessage: 'Image generation failed. Please try again.',
        code: 'GENERATION_ERROR',
        retryable: true,
        suggestion: '1. Check your API key in Settings\n2. Verify internet connection\n3. Check ABV.dev service status\n4. Try again in a few moments',
      }
    }
    
    // IPFS/Pinata errors
    if (message.includes('pinata') || message.includes('ipfs') || message.includes('429')) {
      if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
        return {
          message: error.message,
          userMessage: 'IPFS rate limit exceeded. Too many requests to Pinata.',
          code: 'IPFS_RATE_LIMIT',
          retryable: true,
          suggestion: 'Please wait a few minutes before trying again. The system will automatically retry with throttling.',
        }
      }
      
      if (message.includes('credentials') || message.includes('unauthorized') || message.includes('401')) {
        return {
          message: error.message,
          userMessage: 'IPFS credentials invalid. Please check your Pinata credentials in settings.',
          code: 'IPFS_CREDENTIALS',
          retryable: false,
          suggestion: '1. Go to Settings page\n2. Update your Pinata API Key and Secret Key\n3. Get credentials from https://pinata.cloud',
        }
      }
      
      return {
        message: error.message,
        userMessage: 'IPFS upload failed. Please try again.',
        code: 'IPFS_ERROR',
        retryable: true,
        suggestion: '1. Check Pinata credentials\n2. Verify internet connection\n3. Check Pinata service status\n4. Try again',
      }
    }
    
    // Validation errors
    if (message.includes('invalid') || message.includes('validation')) {
      return {
        message: error.message,
        userMessage: error.message,
        code: 'VALIDATION_ERROR',
        retryable: false,
      }
    }
    
    // Generic error
    return {
      message: error.message,
      userMessage: 'An error occurred. Please try again.',
      code: 'UNKNOWN_ERROR',
      retryable: true,
      suggestion: 'If the problem persists, please check your settings and try again.',
    }
  }
  
  // Non-Error object
  return {
    message: String(error),
    userMessage: 'An unexpected error occurred. Please try again.',
    code: 'UNKNOWN_ERROR',
    retryable: true,
  }
}

/**
 * Get retry delay based on error
 */
export function getRetryDelay(errorInfo: ErrorInfo): number {
  if (!errorInfo.retryable) return 0
  
  switch (errorInfo.code) {
    case 'NETWORK_ERROR':
      return 2000 // 2 seconds
    case 'WALLET_ERROR':
      return 1000 // 1 second
    case 'REGISTRATION_ERROR':
      return 3000 // 3 seconds
    default:
      return 2000 // 2 seconds
  }
}

/**
 * Log error for debugging
 */
export function logError(error: unknown, context?: string): void {
  const errorInfo = parseError(error)
  
  console.error(`[StorySeal Error]${context ? ` [${context}]` : ''}:`, {
    message: errorInfo.message,
    code: errorInfo.code,
    userMessage: errorInfo.userMessage,
    originalError: error,
  })
  
  // In production, you might want to send this to an error tracking service
  // e.g., Sentry, LogRocket, etc.
}

