# StorySeal - Submission Form

## Team Members

**Note:** Silakan isi dengan informasi team members Anda yang sebenarnya.

### Team Member 1
- **Name:** [Nama Lengkap]
- **GitHub:** [@username]
- **Twitter/X:** [@handle] (optional)
- **LinkedIn:** [profile-url] (optional)
- **Role:** [Frontend Developer / Backend Developer / Full Stack / etc.]

### Team Member 2
- **Name:** [Nama Lengkap]
- **GitHub:** [@username]
- **Twitter/X:** [@handle] (optional)
- **LinkedIn:** [profile-url] (optional)
- **Role:** [Frontend Developer / Backend Developer / Full Stack / etc.]

### Team Member 3 (if applicable)
- **Name:** [Nama Lengkap]
- **GitHub:** [@username]
- **Twitter/X:** [@handle] (optional)
- **LinkedIn:** [profile-url] (optional)
- **Role:** [Frontend Developer / Backend Developer / Full Stack / etc.]

---

## Project Idea: StorySeal

### What We Want to Build

**StorySeal** is an advanced IP protection suite for the Generative AI era that combines invisible watermarking (steganography) with Story Protocol to ensure every AI-generated asset is verifiable and traceable, even when metadata is stripped.

### Problem We're Solving

As Generative AI becomes mainstream, creators face a critical challenge: **proving ownership and authenticity of AI-generated content**. Traditional metadata can be easily removed, making it impossible to verify the origin of digital assets. This creates opportunities for IP theft and makes it difficult for creators to protect their work.

### Our Solution

StorySeal provides a three-layer protection system:

1. **Generate & Register**: Users create AI assets using ABV.dev or Gemini AI, which automatically registers them as IP assets on Story Protocol blockchain
2. **Invisible Watermarking**: We embed a steganographic watermark (containing the Story Protocol IP ID) directly into image pixels using LSB (Least Significant Bit) steganography - completely invisible to the human eye
3. **Detection & Verification**: A public verification tool can detect the watermark and retrieve the original IP ownership from the blockchain, even if the image has been edited or metadata removed

### Key Features

- **AI Image Generation**: Generate high-quality SVG artwork using ABV.dev API or Google Gemini AI
- **Automatic IP Registration**: Seamlessly register generated content as IP assets on Story Protocol
- **Invisible Watermarking**: Embed IP IDs into image pixels using LSB steganography (imperceptible to users)
- **Watermark Detection**: Public verification tool to detect watermarks and verify ownership
- **IP Verification**: Verify IP asset ownership and provenance on Story Protocol blockchain
- **Asset Management**: Dashboard to view and manage registered IP assets
- **Batch Monitoring**: Scan multiple images for IP violations using similarity detection
- **License Management**: Create and manage licenses for IP assets

### Technical Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **3D Graphics**: React Three Fiber, Three.js
- **Blockchain**: Story Protocol SDK, Wagmi, Viem
- **AI Generation**: ABV.dev API, Google Gemini AI
- **Storage**: IPFS (Pinata)
- **Security**: LSB Steganography (JavaScript/TypeScript)

### Why This Matters

1. **For Creators**: Protects their AI-generated work with blockchain-backed proof of ownership
2. **For Platforms**: Enables content verification and IP enforcement
3. **For the Ecosystem**: Creates a trust layer for AI-generated content in the Web3 space

### Selected Tracks

1. **Main Track**: IP Detection & Enforcement ($5,000)
2. **Partner Bounty**: GenAI IP Registration Challenge (ABV.dev)

### Current Status

**Checkpoint 1 - Initial Prototype**: We have built a working prototype with:
- ✅ Full frontend dashboard with modern UI/UX
- ✅ AI image generation integration (ABV.dev & Gemini)
- ✅ Story Protocol IP registration workflow
- ✅ LSB steganography watermarking implementation
- ✅ Watermark detection and verification system
- ✅ IP asset management dashboard
- ✅ Analytics and monitoring features

---

## Copy-Paste Ready Version

### Team Members (Fill in your details)

```
Team Member 1:
- Name: [Your Name]
- GitHub: [@yourusername]
- Role: [Your Role]

Team Member 2:
- Name: [Team Member Name]
- GitHub: [@username]
- Role: [Role]
```

### Project Idea (Copy this)

```
StorySeal is an advanced IP protection suite for the Generative AI era. We combine invisible watermarking (steganography) with Story Protocol to ensure every AI-generated asset is verifiable and traceable.

Problem: As Generative AI becomes mainstream, creators can't prove ownership of AI-generated content. Traditional metadata can be easily removed, enabling IP theft.

Solution: 
1. Generate AI assets using ABV.dev/Gemini and auto-register on Story Protocol
2. Embed invisible steganographic watermark (IP ID) into image pixels using LSB steganography
3. Public verification tool detects watermark and retrieves IP ownership from blockchain

Key Features:
- AI image generation (ABV.dev & Gemini AI)
- Automatic IP registration on Story Protocol
- Invisible watermarking (LSB steganography)
- Watermark detection & verification
- IP asset management dashboard
- Batch monitoring for violations

Tech Stack: Next.js 14, React, TypeScript, Story Protocol SDK, IPFS (Pinata), LSB Steganography

Tracks: IP Detection & Enforcement (Main) + GenAI IP Registration Challenge (ABV.dev)

Status: Checkpoint 1 - Working prototype with full feature set completed.
```


