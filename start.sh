#!/data/data/com.termux/files/usr/bin/bash
PROJECT_DIR="$HOME/donbet_solver"
cd "$PROJECT_DIR"

echo "🛑 إيقاف كل شي..."
pkill -9 -f chromium 2>/dev/null || true
pkill -9 -f "node solver_server" 2>/dev/null || true
pkill -9 -f "python bot.py" 2>/dev/null || true
sleep 3

echo "🌐 تشغيل Chromium..."
nohup bash chromium_headless.sh > logs/chromium.log 2>&1 &
sleep 10

if ! curl -s --max-time 5 http://127.0.0.1:9222/json/version > /dev/null; then
    echo "❌ Chromium فشل"
    exit 1
fi
echo "✅ Chromium شغال"

echo "🔧 تشغيل Solver..."
nohup node solver_server.js > logs/solver.log 2>&1 &
sleep 5

if ! curl -s --max-time 5 http://127.0.0.1:8000/health | grep -q '"ok"'; then
    echo "❌ Solver فشل"
    exit 1
fi
echo "✅ Solver شغال"

echo "🤖 تشغيل Bot..."
nohup python bot.py > logs/bot.log 2>&1 &
sleep 4

echo ""
echo "✅ كولشي خدام!"
echo "📊 السجلات:"
echo "  tail -f ~/donbet_solver/logs/bot.log"
echo "  tail -f ~/donbet_solver/logs/solver.log"
