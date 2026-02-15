#!/bin/bash
# UnfilteredHub — Hızlı Kurulum Scripti
# Bu script Cloudflare hesabınıza DoH worker'ı deploy eder.

set -e

echo "========================================="
echo "  UnfilteredHub — Hızlı Kurulum"
echo "========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js bulunamadı. Lütfen https://nodejs.org adresinden yükleyin."
    exit 1
fi

echo "✓ Node.js $(node -v) bulundu"

# Install dependencies
echo ""
echo "📦 Bağımlılıklar yükleniyor..."
npm install

# Login to Cloudflare
echo ""
echo "🔑 Cloudflare hesabına giriş yapılıyor..."
echo "  (Tarayıcınızda Cloudflare giriş sayfası açılacak)"
npx wrangler login

# Deploy
echo ""
echo "🚀 Worker deploy ediliyor..."
npx wrangler deploy

echo ""
echo "========================================="
echo "  ✅ Kurulum tamamlandı!"
echo "========================================="
echo ""
echo "Worker URL'in yukarıda gösteriliyor."
echo "Bu URL'i cihazlarında DoH adresi olarak kullan."
echo ""
echo "Örnek test:"
echo "  curl 'https://WORKER-URL/dns-query?name=example.com&type=A'"
echo ""
