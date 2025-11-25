# StorySeal

> **⚠️ SUBMISSION STATUS: PHASE 2 (WEEKS 3-4)**  
> *Current Progress: Full Implementation Complete - Watermarking, Detection, IP Registration*

**Verify the Origin. Seal the Creation.**

Advanced IP protection suite for the Generative AI era. StorySeal combines invisible watermarking (steganography) with Story Protocol to ensure that every AI-generated asset is verifiable and traceable.

## Selected Tracks

We are submitting this project for:

1. **Main Track:** IP Detection & Enforcement ($5,000)
2. **Partner Bounty:** GenAI IP Registration Challenge (ABV.dev)

## Features

- **Create & Register**: Generate high-quality AI assets with ABV.dev and automatically register them on Story Protocol
- **Invisible Protection**: Embed imperceptible watermarks containing Story Protocol IP IDs directly into image pixels
- **Detection & Enforcement**: Verify image provenance even when metadata is removed

## How It Works

1. **Generate & Register:** Users create assets using **ABV.dev** or **Gemini AI**, which automatically registers them on Story Protocol.
2. **Invisible Watermark:** StorySeal embeds a steganographic watermark (IP ID) into the image pixels using LSB steganography.
3. **Detection:** A public verification tool detects the watermark and retrieves the original IP ownership from the blockchain.

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS
- **3D Graphics**: React Three Fiber, Three.js
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **GenAI & IP**: ABV.dev API, Google Gemini AI
- **Blockchain**: Story Protocol SDK, Wagmi, Viem
- **Security**: LSB Steganography (JavaScript/TypeScript)
- **Storage**: IPFS (Pinata)

## Design System

- **Background**: Porcelain (#F8FAFC)
- **Primary Color**: Deep Indigo (#4F46E5)
- **Secondary Color**: Coral (#F43F5E)

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Setup environment variables:

   **Option A: Copy from template**
   ```bash
   cp env.template .env.local
   ```
   Then edit `.env.local` and add your actual API keys.

   **Option B: Create manually**
   Create a `.env.local` file and add your configuration:
   ```env
   # Story Protocol Configuration
   # Currently using Aeneid Testnet (for development/testing)
   # For mainnet, update this URL when Story Protocol mainnet is available
   
   # Option 1: Public RPC (default)
   NEXT_PUBLIC_STORY_RPC_URL=https://aeneid.storyrpc.io
   
   # Option 2: Tenderly RPC (recommended for hackathon - better debugging & monitoring)
   # Get your Tenderly RPC URL from: https://dashboard.tenderly.co
   # Steps: Register → Create Organization → Contact Support → Get RPC URL
   # Format: https://rpc.tenderly.co/fork/{fork-id}
   # NEXT_PUBLIC_STORY_RPC_URL=https://rpc.tenderly.co/fork/your-fork-id

   # ABV.dev API (for AI image generation)
   # Get your API key from: https://abv.dev
   NEXT_PUBLIC_ABV_API_KEY=your-abv-api-key-here
   NEXT_PUBLIC_ABV_API_URL=https://api.abv.dev

   # Google Gemini AI (optional - alternative to ABV.dev)
   # Get your API key from: https://makersuite.google.com/app/apikey
   NEXT_PUBLIC_GEMINI_API_KEY=your-gemini-api-key-here

   # WalletConnect (optional - for wallet connection)
   # Get your project ID from: https://cloud.walletconnect.com
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id

   # Pinata IPFS (for metadata storage)
   # Get your credentials from: https://pinata.cloud
   PINATA_JWT=your-pinata-jwt-token
   PINATA_GATEWAY_URL=https://gateway.pinata.cloud

   # Tenderly Configuration (optional - for advanced debugging)
   # Get from Tenderly Dashboard → Settings → API Keys
   # TENDERLY_ACCESS_KEY=your-tenderly-access-key
   # TENDERLY_PROJECT_SLUG=your-project-slug
   # TENDERLY_ORG_SLUG=your-org-slug

   # SPG NFT Contract (optional - for IP registration)
   # Default testnet contract will be used if not provided
   # NEXT_PUBLIC_SPG_NFT_CONTRACT=0x...

   # Wallet Private Key (optional - for server-side operations)
   # WARNING: Never commit this to version control!
   # WALLET_PRIVATE_KEY=0x...
   ```

   **Note:** 
   - Currently configured for **Aeneid Testnet** (Story Protocol testnet)
   - ✅ **Testnet diperbolehkan untuk hackathon** - Tidak perlu mainnet
   - You can also configure these settings from the Settings page in the dashboard after connecting your wallet
   - For mainnet deployment (optional), update `NEXT_PUBLIC_STORY_RPC_URL` when Story Protocol mainnet is available

3. **Get Testnet Tokens (IP Tokens)**:
   
   Aeneid Testnet menggunakan token khusus yang disebut **IP** (bukan ETH biasa). Anda perlu mendapatkan IP tokens dari faucet untuk melakukan transaksi:
   
   **Faucet Options:**
   - **Official Faucet**: [docs.story.foundation/aeneid](https://docs.story.foundation/aeneid) - 10 IP per permintaan
   - **Unity Nodes Faucet**: [faucet.unitynodes.com](https://faucet.unitynodes.com) - 5 IP per wallet
   - **QuickNode Faucet**: 5 IP setiap 24 jam (tanpa perlu registrasi)
   
   **Cara mendapatkan:**
   1. Pastikan wallet sudah terhubung ke **Aeneid Testnet** (Chain ID: 1315)
   2. Kunjungi salah satu faucet di atas
   3. Masukkan alamat wallet Anda
   4. Klaim IP tokens
   5. Setelah mendapat IP tokens, Anda bisa melakukan IP registration di StorySeal

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Features

- **AI Image Generation**: Generate images using ABV.dev API or Google Gemini AI
- **IP Registration**: Register AI-generated content as IP assets on Story Protocol
- **Watermark Detection**: Detect invisible watermarks in images using LSB steganography
- **IP Verification**: Verify IP asset ownership and provenance on Story Protocol
- **Asset Management**: View and manage your registered IP assets
- **Monitor & Scan**: Batch scanning for IP violations and monitoring
- **License Management**: Create and manage licenses for IP assets
- **Settings**: Configure API keys and preferences from the dashboard

## Project Structure

```
app/
  ├── page.tsx          # Landing page
  ├── login/
  │   └── page.tsx      # Login page
  └── dashboard/
      ├── layout.tsx    # Dashboard layout with sidebar
      ├── page.tsx      # Dashboard home
      ├── create/       # Create & Register page
      ├── verify/       # Verify Origin page
      ├── monitor/      # Monitor & Scan page
      ├── assets/       # My IP Assets page
      ├── licenses/     # License management page
      └── settings/     # Settings page
components/
  ├── Scene3D.tsx      # 3D scene wrapper
  ├── Seal3D.tsx       # 3D seal component
  └── Toast.tsx        # Toast notification component
config/
  ├── wagmi.ts         # Wagmi configuration
  └── story.ts         # Story Protocol configuration
services/
  ├── story-protocol.ts # Story Protocol service
  ├── abv-dev.ts       # ABV.dev API service
  ├── gemini-ai.ts     # Google Gemini AI service
  ├── ipfs-service.ts  # IPFS upload service
  ├── c2pa-service.ts  # C2PA manifest service
  └── yakoa-service.ts # Yakoa integration
hooks/
  ├── useStoryProtocol.ts # Story Protocol hooks
  ├── useABVDev.ts     # ABV.dev hooks
  └── useGeminiAI.ts   # Gemini AI hooks
lib/
  ├── watermark.ts     # Steganography utilities
  ├── story-client.ts  # Story Protocol client
  ├── analytics.ts     # Analytics tracking
  ├── batch-processor.ts # Batch processing
  └── activity-tracker.ts # Activity tracking
contexts/
  ├── ThemeContext.tsx # Theme management
  └── ToastContext.tsx # Toast notifications
```

## License

MIT
