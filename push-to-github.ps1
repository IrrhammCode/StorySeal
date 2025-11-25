# Script untuk push ke GitHub dengan Personal Access Token

Write-Host "🚀 StorySeal - Push to GitHub" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
Write-Host ""

# Cek apakah sudah ada remote
$hasOrigin = git remote | Select-String -Pattern "origin" -Quiet

if (-not $hasOrigin) {
    Write-Host "❌ Remote 'origin' belum ada!" -ForegroundColor Red
    Write-Host "Jalankan: git remote add origin https://github.com/IrrhammCode/StorySeal.git" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Remote 'origin' ditemukan" -ForegroundColor Green
Write-Host ""

# Opsi 1: Gunakan Personal Access Token
Write-Host "📝 Opsi 1: Personal Access Token (Recommended)" -ForegroundColor Yellow
Write-Host "1. Buka: https://github.com/settings/tokens" -ForegroundColor White
Write-Host "2. Klik 'Generate new token (classic)'" -ForegroundColor White
Write-Host "3. Beri nama: 'StorySeal Push'" -ForegroundColor White
Write-Host "4. Pilih scope: ✅ repo (full control)" -ForegroundColor White
Write-Host "5. Klik 'Generate token'" -ForegroundColor White
Write-Host "6. COPY TOKEN (hanya muncul sekali!)" -ForegroundColor Red
Write-Host ""

$useToken = Read-Host "Sudah punya token? (y/n)"

if ($useToken -eq "y") {
    $token = Read-Host "Masukkan Personal Access Token" -AsSecureString
    $tokenPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($token))
    
    # Update remote URL dengan token
    $remoteUrl = git remote get-url origin
    $newUrl = $remoteUrl -replace 'https://', "https://IrrhammCode:$tokenPlain@"
    git remote set-url origin $newUrl
    
    Write-Host ""
    Write-Host "📤 Mencoba push ke GitHub..." -ForegroundColor Cyan
    
    try {
        git push -u origin main
        Write-Host ""
        Write-Host "✅ Berhasil push ke GitHub!" -ForegroundColor Green
        Write-Host "🌐 Repository: https://github.com/IrrhammCode/StorySeal" -ForegroundColor Cyan
        
        # Reset remote URL (remove token)
        git remote set-url origin $remoteUrl
    } catch {
        Write-Host ""
        Write-Host "❌ Gagal push: $_" -ForegroundColor Red
        # Reset remote URL
        git remote set-url origin $remoteUrl
    }
} else {
    Write-Host ""
    Write-Host "💡 Setelah membuat token, jalankan script ini lagi" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Atau gunakan GitHub CLI:" -ForegroundColor Yellow
    Write-Host "  gh auth login" -ForegroundColor White
    Write-Host "  git push -u origin main" -ForegroundColor White
}


