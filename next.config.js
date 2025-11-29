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
  },
  // Disable output file tracing to prevent stack overflow
  // This is a workaround for the micromatch stack overflow issue
  output: 'standalone',
}

module.exports = nextConfig

