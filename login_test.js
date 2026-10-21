const fetch = global.fetch;

// ==========================================
// ⚠️ قم بتغيير بيانات الدخول من هنا
const USERNAME = "callum00"; 
const PASSWORD = "FhfE!MFDuy98EU";
// ==========================================

async function doLogin() {
    console.log(`🚀 محاولة تسجيل الدخول للحساب: ${USERNAME}`);
    console.log(`⏳ انتظر... (المتصفح يحاول حل الحماية)`);

    try {
        const res = await fetch("http://127.0.0.1:8000/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: USERNAME, password: PASSWORD })
        });

        const data = await res.json();

        if (data.error) {
            console.log(`\n❌ فشل السيرفر: ${data.error}`);
            return;
        }

        if (data.status !== 200 || !data.cookies) {
            console.log(`\n❌ فشل تسجيل الدخول (كود ${data.status})`);
            console.log(`📄 رد الموقع: ${data.body ? data.body.substring(0, 100) : 'فارغ'}`);
            return;
        }

        console.log(`\n✅ تم تسجيل الدخول بنجاح!`);
        console.log(`🍪 عدد الكوكيز التي تم جلبها: ${Object.keys(data.cookies).length}`);
        
        // طباعة أهم الكوكيز
        const importantCookies = ['AppAuth', 'SessionId', 'cf_clearance'];
        importantCookies.forEach(c => {
            if (data.cookies[c]) {
                console.log(`🔑 ${c}: ${data.cookies[c].substring(0, 30)}...`);
            }
        });

        // حفظ الكوكيز في ملف للاستخدام لاحقاً
        const fs = require('fs');
        fs.writeFileSync('cookies.json', JSON.stringify(data.cookies, null, 2));
        console.log(`\n💾 تم حفظ الكوكيز في ملف cookies.json`);

    } catch (e) {
        console.log(`\n❌ خطأ في الاتصال بالسيرفر: ${e.message}`);
    }
}

doLogin();
