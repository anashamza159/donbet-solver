#!/data/data/com.termux/files/usr/bin/bash
echo "🛑 إيقاف كل شي..."
pkill -9 -f chromium 2>/dev/null || true
pkill -9 -f "node solver_server" 2>/dev/null || true
pkill -9 -f "python bot.py" 2>/dev/null || true
sleep 2
echo "✅ توقف الكل."
