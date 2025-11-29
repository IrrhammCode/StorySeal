# StorySeal

**Verify the Origin. Seal the Creation.**

StorySeal is an advanced IP protection suite designed for the Generative AI era. We combine invisible watermarking (LSB steganography) with Story Protocol blockchain integration to ensure that every AI-generated asset is verifiable, traceable, and protected—even when metadata is stripped.

## 🎯 Overview

StorySeal provides comprehensive intellectual property protection for AI-generated content through a multi-layered approach:

1. **AI Generation & Registration**: Generate high-quality AI assets using ABV.dev and automatically register them as IP assets on Story Protocol
2. **Invisible Watermarking**: Embed imperceptible watermarks containing Story Protocol IP IDs directly into image pixels using LSB steganography
3. **Detection & Verification**: Detect watermarks, verify ownership, and track usage across the web using AI-powered similarity detection and reverse image search

## ✨ Key Features

### Core Capabilities
- **AI Image Generation**: Generate professional SVG artwork using ABV.dev's StorySeal-Engine with automatic Story Protocol registration
- **Invisible Watermarking**: LSB steganography embeds IP IDs directly into image pixels—undetectable to the human eye
- **Watermark Detection**: Extract and verify watermarks from images, even after compression or format conversion
- **Blockchain Verification**: Verify IP asset ownership and provenance on Story Protocol blockchain
- **AI-Powered Similarity Detection**: Detect similar images using perceptual hashing and machine learning
- **Reverse Image Search**: Find image usage across the web using multiple search providers (SerpAPI, Serpdog, Bing, Google)
- **C2PA Verification**: Verify Content Authenticity Initiative (C2PA) manifests for additional provenance
- **Automated Monitoring**: Schedule automated scans to monitor your IP assets for violations
- **License Management**: Create and attach Programmable IP Licenses (PIL) to your IP assets
- **DMCA Tools**: Generate violation reports and DMCA notices for enforcement

### Security Features
- **SSRF Protection**: All API routes validate URLs to prevent server-side request forgery
- **XSS Protection**: SVG sanitization removes dangerous elements and scripts
- **Input Validation**: Comprehensive validation for all user inputs
- **DoS Protection**: File size limits and request timeouts prevent abuse
- **Secure API Keys**: Environment variable management with client-side settings override

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **3D Graphics**: React Three Fiber, Three.js
- **Animations**: Framer Motion
- **Icons**: Lucide React

### Blockchain & Web3
- **Blockchain**: Story Protocol (Aeneid Testnet)
- **Web3**: Wagmi, Viem
- **Wallet**: WalletConnect integration

### AI & Image Processing
- **AI Generation**: ABV.dev API (StorySeal-Engine)
- **Steganography**: Custom LSB (Least Significant Bit) implementation
- **Image Processing**: Sharp (server-side), Canvas API (client-side)
- **Similarity Detection**: Perceptual hashing (dHash algorithm)

### Storage & Infrastructure
- **IPFS**: Pinata integration for metadata storage
- **Deployment**: Vercel-ready configuration

### Security & Provenance
- **C2PA**: Content Authenticity Initiative support
- **OpenTelemetry**: Distributed tracing with ABV.dev

### Development & Debugging
- **Tenderly**: Advanced blockchain debugging and transaction simulation
  - Virtual TestNet RPC for isolated testing environments
  - Transaction simulation and detailed error analysis
  - Wallet funding features for seamless development workflow

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- A Web3 wallet (MetaMask, WalletConnect, etc.)
- ABV.dev API key (for AI generation)
- Pinata API credentials (for IPFS storage, optional)
- Story Protocol testnet tokens (IP tokens)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd StorySeal
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy the template file:
   ```bash
   # Windows PowerShell
   Copy-Item env.template .env.local
   
   # Linux/Mac
   cp env.template .env.local
   ```
   
   Then edit `.env.local` and fill in your actual values:
   ```env
   # Story Protocol Configuration
   NEXT_PUBLIC_STORY_RPC_URL=https://aeneid.storyrpc.io
   
   # ABV.dev API (Required for AI generation)
   NEXT_PUBLIC_ABV_API_KEY=your-abv-api-key-here
   NEXT_PUBLIC_ABV_API_URL=https://app.abv.dev
   
   # WalletConnect (Optional)
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id
   
   # Pinata IPFS (Optional - for IPFS storage)
   NEXT_PUBLIC_PINATA_API_KEY=your-pinata-api-key
   NEXT_PUBLIC_PINATA_SECRET_KEY=your-pinata-secret-key
   # OR use JWT token instead:
   # NEXT_PUBLIC_PINATA_JWT_TOKEN=your-pinata-jwt-token
   ```

   **Note**: 
   - You can also configure these settings from the Settings page in the dashboard after connecting your wallet
   - See `env.template` for detailed documentation of all environment variables

4. **Get Testnet Tokens**

   Story Protocol Aeneid Testnet uses **IP tokens** (not ETH). Get testnet tokens from:
   - **Official Faucet**: [docs.story.foundation/aeneid](https://docs.story.foundation/aeneid) - 10 IP per request
   - **Unity Nodes Faucet**: [faucet.unitynodes.com](https://faucet.unitynodes.com) - 5 IP per wallet
   - **QuickNode Faucet**: 5 IP every 24 hours

   **Steps**:
   1. Connect your wallet to **Aeneid Testnet** (Chain ID: 1315)
   2. Visit one of the faucets above
   3. Enter your wallet address
   4. Claim IP tokens

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📖 Usage Guide

### ABV.dev Integration Flow

StorySeal integrates seamlessly with ABV.dev for AI generation and Story Protocol registration:

1. **First Time Setup**:
   - Log in to [ABV.dev](https://app.abv.dev)
   - Go to **Connectors** in the sidebar
   - Click **"Manage Dashboard"** for Story Protocol
   - Activate the Story Protocol connector

2. **Generate & Register**:
   - Enter your prompt in StorySeal
   - Generate image (automatically traced to ABV.dev)
   - Go to ABV.dev → **Connectors** → **Dashboard Story Protocol**
   - Register your asset (trace and output will appear)
   - Copy IP Asset ID back to StorySeal (optional)

### Creating & Registering IP Assets

1. **Connect Your Wallet**: Click "Connect Wallet" and select your preferred wallet
2. **Navigate to Create & Register**: Go to Dashboard → Create & Register
3. **Setup ABV.dev Connector** (First time only):
   - Go to [ABV.dev](https://app.abv.dev) and log in to your account
   - Navigate to **Connectors** in the sidebar
   - Click **"Manage Dashboard"** for Story Protocol
   - Activate the **Story Protocol** connector if not already enabled
4. **Generate Image**: 
   - Enter your prompt in the input field
   - Click "Generate" to create AI artwork using ABV.dev
   - Your prompt and output are automatically traced to ABV.dev dashboard
5. **Register on Story Protocol**:
   - Go to ABV.dev dashboard → **Connectors** → **Dashboard Story Protocol**
   - You should see **2 items** appear (trace and output)
   - Click the **"Register"** button and wait for the registration to complete
   - Copy the **IP Asset ID** from the dashboard
6. **Add Watermark** (Optional):
   - Paste the IP Asset ID in the input field below (optional - for tracking)
   - Click "Add Watermark" to embed an invisible watermark containing the IP ID
7. **Download Protected Asset**: Download your watermarked image

### Verifying Images

1. **Navigate to Verify**: Go to Dashboard → Verify
2. **Upload Image**: Upload an image file or provide an image URL
3. **Scan**: Click "Verify Origin" to detect watermarks and verify ownership
4. **View Results**: See verification status, IP asset details, and ownership information

### Monitoring & Scanning

1. **Navigate to Monitor**: Go to Dashboard → Monitor
2. **Upload Images**: Upload images to scan for violations
3. **Enable Features**: Toggle AI detection, C2PA verification, or reverse search
4. **View Results**: See detected violations, similar images, and web usage

### Managing Licenses

1. **Navigate to Licenses**: Go to Dashboard → Licenses
2. **Create License Terms**: Define license terms for your IP assets
3. **Attach to IP Asset**: Attach license terms to registered IP assets
4. **Manage**: View and manage all your licenses

## 🏗️ Project Structure

```
StorySeal/
├── app/
│   ├── page.tsx              # Landing page
│   ├── login/                 # Login page
│   └── dashboard/
│       ├── layout.tsx         # Dashboard layout with sidebar
│       ├── page.tsx           # Dashboard home
│       ├── create/            # Create & Register page
│       ├── verify/            # Verify Origin page
│       ├── monitor/           # Monitor & Scan page
│       ├── assets/            # My IP Assets page
│       └── settings/          # Settings page
├── components/
│   ├── Scene3D.tsx           # 3D scene wrapper
│   ├── Seal3D.tsx            # 3D seal component
│   ├── ConnectWallet.tsx     # Wallet connection component
│   └── Toast.tsx             # Toast notification component
├── config/
│   ├── wagmi.ts              # Wagmi configuration
│   └── story.ts              # Story Protocol configuration
├── services/
│   ├── story-protocol.ts     # Story Protocol service
│   ├── abv-dev.ts            # ABV.dev API service
│   ├── ipfs-service.ts       # IPFS/Pinata service
│   ├── reverse-image-search.ts # Reverse image search service
│   └── c2pa-service.ts       # C2PA verification service
├── hooks/
│   ├── useStoryProtocol.ts   # Story Protocol hooks
│   └── useABVDev.ts          # ABV.dev hooks
├── lib/
│   ├── watermark.ts          # LSB steganography utilities
│   ├── image-similarity.ts   # AI similarity detection
│   ├── validation.ts         # Input validation utilities
│   ├── sanitize-svg.ts       # SVG sanitization
│   └── error-handler.ts      # Error handling utilities
└── contexts/
    ├── ThemeContext.tsx      # Theme management
    └── ToastContext.tsx   # Toast notifications
```

## 🔒 Security

StorySeal implements comprehensive security measures:

- **Input Validation**: All user inputs are validated and sanitized
- **SSRF Protection**: URL validation prevents server-side request forgery
- **XSS Protection**: SVG sanitization removes dangerous elements
- **DoS Protection**: File size limits and request timeouts
- **Secure Storage**: API keys stored securely (environment variables or localStorage)
- **Error Handling**: Secure error messages that don't expose sensitive information

For detailed security documentation, see the security audit notes in the codebase. All security measures are implemented following industry best practices.

## 🚢 Deployment

### Vercel Deployment

1. **Push to Git**: Push your code to GitHub/GitLab/Bitbucket
2. **Import to Vercel**: 
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your repository
3. **Configure Environment Variables**:
   - Go to Project Settings → Environment Variables
   - Add all required variables from `.env.local`
4. **Deploy**: Click "Deploy" and wait for build to complete

See `vercel.json` for deployment configuration.

## 📝 API Documentation

### Internal API Routes

- `POST /api/create-image-simple`: Generate AI images using ABV.dev
- `POST /api/svg-to-png`: Convert SVG to PNG (server-side)
- `POST /api/reverse-image-search`: Perform reverse image search

All API routes include:
- Input validation
- Error handling
- Security measures (SSRF protection, XSS protection, DoS protection)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- **Story Protocol**: [docs.story.foundation](https://docs.story.foundation)
- **ABV.dev**: [app.abv.dev](https://app.abv.dev)
- **Pinata**: [pinata.cloud](https://pinata.cloud)
- **Tenderly**: [tenderly.co](https://tenderly.co) - Blockchain debugging and development tools
- **Aeneid Testnet**: [docs.story.foundation/aeneid](https://docs.story.foundation/aeneid)

## 🙏 Acknowledgments

- **Story Protocol** for the blockchain infrastructure and IP asset management
- **ABV.dev** for AI generation capabilities and Story Protocol integration
- **Pinata** for IPFS storage and metadata hosting
- **Tenderly** for advanced blockchain debugging and development tools
  - Tenderly provides powerful debugging capabilities for Story Protocol transactions
  - Enables transaction simulation and detailed error analysis during development
  - Offers Virtual TestNet RPC for isolated testing environments
  - Provides wallet funding features for seamless development workflow
  - Helps developers understand transaction failures with detailed error traces
- The open-source community for amazing tools and libraries

---

**Built with ❤️ for the Generative AI era**
