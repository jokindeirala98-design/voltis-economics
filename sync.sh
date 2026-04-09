#!/bin/bash
# 🚀 Voltis Sync Automation

echo "🔄 Iniciando sincronización..."

# 1. Git Sync
echo "📂 Sincronizando GitHub..."
git add .
git commit -m "Auto-update from Voltis Agent: $(date +'%Y-%m-%d %H:%M:%S')"
git push origin main

# 2. Vercel Sync (Manual Trigger if needed)
# El despliegue suele ser automático al hacer push, 
# pero podemos forzarlo si no hay CI/CD configurado:
# echo "☁️ Desplegando en Vercel..."
# npx vercel --prod --yes

echo "✅ Sincronización completa."
