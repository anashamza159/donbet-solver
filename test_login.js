const fetch = global.fetch;

// ⚠️ ضع هنا حساباً حقيقياً للتجربة
const USERNAME = "osso_69"; 
const PASSWORD = "Wemarue69";

async function test() {
    console.log(`🚀 Testing login for: ${USERNAME}`);
    
    // 1. طلب تسجيل الدخول من المتصفح الخفي
    try {
        const loginRes = await fetch("http://127.0.0.1:8000/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: USERNAME, password: PASSWORD })
        });
        
        const loginData = await loginRes.json();
        console.log("📥 Login Status:", loginData.status);
        
        if (loginData.status !== 200 || !loginData.cookies || !loginData.cookies.AppAuth) {
            console.log("❌ Login failed or no AppAuth cookie. Response:", loginData.body ? loginData.body.substring(0, 200) : loginData);
            return;
        }

        console.log("✅ Login Successful! Cookies acquired.");
        
        // 2. استخدام الكوكيز لجلب البيانات عبر Node.js
        const cookiesStr = Object.entries(loginData.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
        
        const headers = {
            'User-Agent': loginData.user_agent,
            'Content-Type': 'application/json',
            'Cookie': cookiesStr,
            'origin': 'https://m.donbet.com',
            'referer': 'https://m.donbet.com/'
        };

        console.log("\n👤 Fetching Profile...");
        const profileRes = await fetch("https://m.donbet.com/api/profile/p/getProfile", { headers });
        if (profileRes.status === 200) {
            const profile = await profileRes.json();
            console.log(`✅ Profile: ${profile.FirstName} ${profile.LastName} | Email: ${profile.Email} | KYC: ${profile.KYCStatus}`);
        } else {
            console.log(`❌ Profile fetch failed: ${profileRes.status}`);
        }

        console.log("\n💰 Fetching Wallets...");
        const walletRes = await fetch("https://m.donbet.com/api/profile/p/getWallets", { headers });
        if (walletRes.status === 200) {
            const wallets = await walletRes.json();
            console.log(`✅ Wallet Balance: ${wallets[0]?.Balance} ${wallets[0]?.CurrencyId}`);
        } else {
            console.log(`❌ Wallet fetch failed: ${walletRes.status}`);
        }

    } catch (e) {
        console.error("❌ Error:", e.message);
    }
}

test();
