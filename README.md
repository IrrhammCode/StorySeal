# StorySeal

**Verify the Origin. Seal the Creation.**

Advanced IP protection suite for the Generative AI era. StorySeal combines invisible watermarking (steganography) with Story Protocol to ensure that every AI-generated asset is verifiable and traceable.

## Features

- **Create & Register**: Generate high-quality AI assets with ABV.dev and automatically register them on Story Protocol
- **Invisible Protection**: Embed imperceptible watermarks containing Story Protocol IP IDs directly into image pixels
- **Detection & Enforcement**: Verify image provenance even when metadata is removed

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS
- **3D Graphics**: React Three Fiber, Three.js
- **Animations**: Framer Motion
- **Icons**: Lucide React

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
   cp .env.example .env.local
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

   # WalletConnect (optional - for wallet connection)
   # Get your project ID from: https://cloud.walletconnect.com
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id

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

4. **Get Testnet Tokens (IP Tokens)**:
   
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

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Features

- **AI Image Generation**: Generate images using ABV.dev API
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
  └── abv-dev.ts       # ABV.dev API service
hooks/
  ├── useStoryProtocol.ts # Story Protocol hooks
  └── useABVDev.ts     # ABV.dev hooks
lib/
  ├── watermark.ts     # Steganography utilities
  └── story-client.ts  # Story Protocol client
contexts/
  ├── ThemeContext.tsx # Theme management
  └── ToastContext.tsx # Toast notifications
```

## License

MIT

