# ESET Cafe Modern Startup Script
# The backend is now powered by Supabase (Serverless)

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  ESET Cafe Modern Startup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "  v Node.js $nodeVersion installed" -ForegroundColor Green
} catch {
    Write-Host "  !! Node.js is not installed!" -ForegroundColor Red
    exit 1
}

# 2. Check environment variables
if (-not (Test-Path "frontend/.env.local")) {
    Write-Host "  !! frontend/.env.local is missing!" -ForegroundColor Yellow
}

# 3. Start Frontend
Write-Host ""
Write-Host "  Starting Frontend on http://localhost:3000..." -ForegroundColor Yellow
Write-Host "  Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

npm run dev
