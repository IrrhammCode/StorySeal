/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer, webpack }) => {
    // Ignore optional dependencies that are not needed in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '@react-native-async-storage/async-storage': false,
        'pino-pretty': false,
        // Node.js modules not available in browser
        'stream': false,
        'fs': false,
        'path': false,
        'crypto': false,
        'util': false,
        'events': false,
        'buffer': false,
        'process': false,
      }
      
      // Exclude OpenTelemetry packages from client bundle (server-only)
      config.resolve.alias = {
        ...config.resolve.alias,
        '@opentelemetry/sdk-node': false,
        '@abvdev/otel': false,
        '@grpc/grpc-js': false,
      }
      
      // Exclude OpenTelemetry packages from client bundle
      config.externals = config.externals || []
      config.externals.push({
        '@opentelemetry/sdk-node': 'commonjs @opentelemetry/sdk-node',
        '@abvdev/otel': 'commonjs @abvdev/otel',
        '@grpc/grpc-js': 'commonjs @grpc/grpc-js',
      })
    }
    
    // Ensure instrumentation.ts is only processed on server-side
    if (isServer) {
      // instrumentation.ts should only be loaded by Next.js instrumentation hook (server-only)
      // No special config needed - Next.js handles this automatically
    }
    
    // Ignore warnings for optional dependencies
    config.ignoreWarnings = [
      { module: /node_modules\/@metamask\/sdk/ },
      { module: /node_modules\/pino/ },
      // Ignore OpenTelemetry Node.js-only modules in client bundle
      { module: /node_modules\/@opentelemetry\/sdk-node/ },
      { module: /node_modules\/@grpc\/grpc-js/ },
    ]
    
    return config
  },
  // Disable static optimization for problematic pages if needed
  experimental: {
    optimizePackageImports: ['lucide-react'],
    // Disable instrumentationHook - we're using direct client call now (no server-side OpenTelemetry needed)
    // Direct client call to ABV.dev should be tracked automatically by ABV.dev SDK
    // instrumentationHook: true,
    // Limit output file tracing to prevent stack overflow during build
    // This reduces the number of files Next.js needs to scan during build tracing
    outputFileTracingExcludes: {
      '*': [
        'node_modules/@swc/**',
        'node_modules/@esbuild/**',
        'node_modules/webpack/**',
        'node_modules/next/dist/compiled/**',
        'node_modules/@opentelemetry/**',
        'node_modules/@abvdev/**',
        'node_modules/@grpc/**',
        'node_modules/@react-three/**',
        'node_modules/three/**',
        'node_modules/tsparticles/**',
        'node_modules/@tsparticles/**',
        'node_modules/react-particles/**',
        'node_modules/@story-protocol/**',
        'node_modules/@contentauth/**',
        'node_modules/@trustnxt/**',
        'node_modules/@walletconnect/**',
        'node_modules/@metamask/**',
        'node_modules/canvas-confetti/**',
        'node_modules/react-confetti/**',
        'node_modules/framer-motion/**',
        'node_modules/lucide-react/**',
        'node_modules/wagmi/**',
        'node_modules/viem/**',
        'node_modules/@tanstack/**',
        'node_modules/sharp/**',
        'node_modules/.cache/**',
        'node_modules/.sharp/**',
        'node_modules/**/test/**',
        'node_modules/**/tests/**',
        'node_modules/**/__tests__/**',
        'node_modules/**/__mocks__/**',
        'node_modules/**/examples/**',
        'node_modules/**/docs/**',
        'node_modules/**/documentation/**',
        'node_modules/**/*.md',
        'node_modules/**/*.txt',
        'node_modules/**/*.map',
        'node_modules/**/*.test.*',
        'node_modules/**/*.spec.*',
      ],
    },
  },
}

module.exports = nextConfig

