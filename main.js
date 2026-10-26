const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, powerSaveBlocker } = require('electron');
const http = require('http'), os = require('os');
const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url'), XLSX = require('xlsx');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const U = app.getPath('userData'), CFG = path.join(U, 'ayarlar.json'), SND = path.join(U, 'sesler');
fs.mkdirSync(SND, { recursive: true });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
const hidden = process.argv.includes('--hidden');
let win, tray, blocker = null, quitting = false, told = false;
const showWin = () => { if (win) { win.show(); win.focus(); } };
app.on('second-instance', showWin);
app.on('before-quit', () => { quitting = true; });

app.whenReady().then(() => {
  if (!gotLock) return;
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  win = new BrowserWindow({ width: 1000, height: 720, minWidth: 780, minHeight: 560, title: 'Okul Zili', icon,
    show: !hidden, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false } });
  win.loadFile('index.html');
  win.on('close', e => {           // kapatınca çıkma, tepsiye küçül
    if (quitting) return;
    e.preventDefault(); win.hide();
    if (!told && tray && tray.displayBalloon) { told = true; tray.displayBalloon({ title: 'Okul Zili', content: 'Program arka planda çalışmaya devam ediyor.' }); }
  });
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Okul Zili');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Aç', click: showWin },
    { label: 'Çık (zil duracak)', click: () => { quitting = true; app.quit(); } }]));
  tray.on('click', showWin);
  if (readCfg().remote && readCfg().remote.enabled) startRemote();
  if ((readCfg().telegram || {}).enabled) tgLoop();
});


// ---------- Telefondan kontrol (yerel ağ) ----------
const PORT = 3939, ACTIONS = ['istiklal', 'saygi', 'siren', 'stop', 'ogrenci', 'ogretmen', 'cikis'];
let srv = null; const fails = {};
const readCfg = () => { try { return JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch { return {}; } };
const lanIPs = () => Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
const PAGE = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Okul Zili</title>
<style>body{font:16px system-ui,sans-serif;margin:0;padding:16px;background:#0f1220;color:#fff}h1{font-size:20px}button{font:inherit;width:100%;padding:18px;margin:6px 0;border:0;border-radius:14px;background:#4f6df5;color:#fff}button.s{background:#e5484d}button.g{background:#2b3252}input{font:inherit;padding:12px;border-radius:10px;border:0;width:100%;margin-bottom:8px;box-sizing:border-box}#m{min-height:24px;text-align:center}.r{display:grid;grid-template-columns:1fr 1fr;gap:8px}</style></head><body>
<h1>🔔 Okul Zili</h1><input id="p" type="password" inputmode="numeric" placeholder="PIN"><div id="m"></div>
<button data-a="istiklal">♪ İstiklal Marşı</button><button data-a="saygi">♪ Saygı duruşu</button><button data-a="siren" class="s">🚨 Siren</button><button data-a="stop" class="g">⏹ Durdur</button>
<div class="r"><button data-a="ogrenci" class="g">Öğrenci girişi</button><button data-a="ogretmen" class="g">Öğretmen girişi</button></div><button data-a="cikis" class="g">Dersten çıkış</button>
<script>const p=document.getElementById('p'),m=document.getElementById('m');p.value=localStorage.getItem('pin')||'';
document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{if(b.dataset.a!=='stop'&&!confirm('Çalınsın mı?'))return;
try{const r=await fetch('/api',{method:'POST',body:JSON.stringify({pin:p.value,action:b.dataset.a})});const j=await r.json();
m.style.color=j.ok?'#8be28b':'#ff8a8a';m.textContent=j.msg||'Gönderildi ✓';if(j.ok)localStorage.setItem('pin',p.value)}catch(e){m.style.color='#ff8a8a';m.textContent='Bağlantı yok'}})</script></body></html>`;

function startRemote() {
  if (srv) return;
  srv = http.createServer((req, res) => {
    const c = readCfg().remote || {};
    if (!c.enabled) { res.writeHead(403); return res.end('Kapalı'); }
    if (req.method === 'GET' && req.url.split('?')[0] === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
    if (req.method === 'POST' && req.url === '/api') {
      let b = ''; req.on('data', d => { b += d; if (b.length > 2000) req.destroy(); });
      req.on('end', () => {
        const out = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
        let j = {}; try { j = JSON.parse(b); } catch {}
        const ip = req.socket.remoteAddress, f = fails[ip] || { n: 0, t: 0 };
        if (f.n >= 5 && Date.now() - f.t < 60000) return out(429, { ok: false, msg: 'Çok fazla yanlış deneme, 1 dk bekleyin' });
        if (!c.pin || String(j.pin) !== String(c.pin)) { fails[ip] = { n: f.n + 1, t: Date.now() }; return out(401, { ok: false, msg: 'PIN hatalı' }); }
        fails[ip] = { n: 0, t: 0 };
        if (!ACTIONS.includes(j.action)) return out(400, { ok: false, msg: 'Geçersiz komut' });
        dispatch(j.action).then(r => out(200, r));
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  srv.on('error', () => { srv = null; });
  srv.listen(PORT, '0.0.0.0');
}
const stopRemote = () => { if (srv) { srv.close(); srv = null; } };
ipcMain.handle('remoteSet', (e, on) => (on ? startRemote() : stopRemote()));
ipcMain.handle('remoteInfo', async () => {
  const urls = lanIPs().map(ip => `http://${ip}:${PORT}`); let qr = '';
  try { qr = urls[0] ? await require('qrcode').toDataURL(urls[0], { margin: 1, width: 160 }) : ''; } catch {}
  return { urls, qr };
});


// ---------- Komutu arayüze iletip sonucunu bekleme ----------
let seq = 0, lastStatus = ''; const pending = {};
function dispatch(action) {
  return new Promise(res => {
    if (!win) return res({ ok: false, msg: 'Program penceresi yok' });
    const id = ++seq;
    const t = setTimeout(() => { delete pending[id]; res({ ok: false, msg: 'Program yanıt vermedi' }); }, 4000);
    pending[id] = (ok, msg) => { clearTimeout(t); delete pending[id]; res({ ok, msg }); };
    win.webContents.send('remote', action, id);
  });
}
ipcMain.on('ack', (e, id, ok, msg) => pending[id] && pending[id](ok, msg));
ipcMain.on('status', (e, t) => { lastStatus = t; });

// ---------- Telegram botu ----------
const CHATS = path.join(U, 'telegram_yetkili.json');
const chats = () => { try { return JSON.parse(fs.readFileSync(CHATS, 'utf8')); } catch { return []; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tgRun = false, tgToken = null, tgOffset = 0, tgFlushed = false, tgStatus = 'kapalı'; const tgBad = {};
const tgApi = (method, body) => fetch(`https://api.telegram.org/bot${tgToken}/${method}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(40000) }).then(r => r.json());
const NAMES = { istiklal: 'İstiklal Marşı', saygi: 'Saygı duruşu', siren: 'Siren', ogrenci: 'Öğrenci girişi', ogretmen: 'Öğretmen girişi', cikis: 'Dersten çıkış' };
const btn = (t, d) => ({ text: t, callback_data: d });
const KB = { inline_keyboard: [[btn('♪ İstiklal Marşı', 'a:istiklal'), btn('♪ Saygı duruşu', 'a:saygi')],
  [btn('🚨 Siren', 'a:siren'), btn('⏹ Durdur', 'y:stop')],
  [btn('Öğrenci girişi', 'a:ogrenci'), btn('Öğretmen girişi', 'a:ogretmen')],
  [btn('Dersten çıkış', 'a:cikis'), btn('ℹ️ Durum', 's')]] };

async function tgHandle(u, c) {
  const cq = u.callback_query, m = u.message || (cq && cq.message);
  if (!m) return;
  const chat = m.chat.id, auth = chats().includes(chat);
  const send = (text, extra) => tgApi('sendMessage', { chat_id: chat, text, ...extra });
  if (cq) {
    tgApi('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
    if (!auth) return;
    const [k, a, t] = String(cq.data).split(':');
    if (k === 's') return send('ℹ️ ' + (lastStatus || 'Henüz bilgi yok'), { reply_markup: KB });
    if (k === 'a' && NAMES[a]) return send(`${NAMES[a]} çalınsın mı?`, { reply_markup: { inline_keyboard: [[btn('✅ Evet, çal', `y:${a}:${Math.floor(Date.now() / 1000)}`), btn('İptal', 'n')]] } });
    if (k === 'y' && (a === 'stop' || NAMES[a])) {
      if (a !== 'stop' && Date.now() / 1000 - Number(t) > 60) return send('⌛ Onay süresi doldu, tekrar deneyin.', { reply_markup: KB });
      const r = await dispatch(a);
      return send((r.ok ? '✅ ' : '⚠️ ') + r.msg, { reply_markup: KB });
    }
    return;
  }
  const text = (m.text || '').trim();
  if (!auth) {
    const f = tgBad[chat] || { n: 0, t: 0 };
    if (f.n >= 5 && Date.now() - f.t < 300000) return;
    if (c.pin && text.replace(/^\/start\s*/, '') === String(c.pin)) {
      fs.writeFileSync(CHATS, JSON.stringify([...chats(), chat])); tgBad[chat] = { n: 0, t: 0 };
      return send('✅ Yetkilendirildi. Komut seçin:', { reply_markup: KB });
    }
    tgBad[chat] = { n: f.n + 1, t: Date.now() };
    return send('🔒 Kullanmak için PIN kodunu yazın.');
  }
  if (/^\/durum/.test(text)) return send('ℹ️ ' + (lastStatus || 'Henüz bilgi yok'), { reply_markup: KB });
  return send('🔔 Okul Zili: bir komut seçin', { reply_markup: KB });
}

async function tgLoop() {
  if (tgRun) return;
  tgRun = true;
  while (true) {
    const c = readCfg().telegram || {};
    if (!c.enabled || !c.token) break;
    if (c.token !== tgToken) { tgToken = c.token; tgOffset = 0; tgFlushed = false; }
    try {
      if (!tgFlushed) {                       // bot kapalıyken birikmiş eski komutlar çalıştırılmasın
        const f = await tgApi('getUpdates', { offset: -1, timeout: 0 });
        if (!f.ok) { tgStatus = 'Hata: ' + (f.description || 'token geçersiz'); await sleep(10000); continue; }
        if (f.result.length) tgOffset = f.result[f.result.length - 1].update_id + 1;
        tgFlushed = true;
      }
      const r = await tgApi('getUpdates', { offset: tgOffset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
      if (!r.ok) { tgStatus = 'Hata: ' + (r.description || ''); await sleep(10000); continue; }
      tgStatus = 'bağlı';
      for (const u of r.result) { tgOffset = u.update_id + 1; await tgHandle(u, c).catch(() => {}); }
    } catch { tgStatus = 'internete bağlanılamıyor'; await sleep(10000); }
  }
  tgRun = false; tgStatus = 'kapalı';
}
ipcMain.handle('tgSet', () => { tgLoop(); return true; });
ipcMain.handle('tgInfo', () => ({ status: tgStatus, chats: chats().length }));
ipcMain.handle('tgReset', () => { fs.writeFileSync(CHATS, '[]'); return true; });

const sounds = () => fs.readdirSync(SND).filter(f => /\.(wav|mp3|ogg)$/i.test(f))
  .map(f => ({ name: f.replace(/\.[^.]+$/, ''), url: pathToFileURL(path.join(SND, f)).href }));
ipcMain.handle('load', () => { try { return JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch { return null; } });
ipcMain.handle('save', (e, c) => fs.writeFileSync(CFG, JSON.stringify(c, null, 2)));
ipcMain.handle('sounds', () => sounds());
ipcMain.handle('autostart', (e, on) => app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] }));
ipcMain.handle('sleepBlock', (e, on) => {
  if (on && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
  if (!on && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
});
ipcMain.handle('addSound', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Ses', extensions: ['wav', 'mp3', 'ogg'] }] });
  if (!r.canceled) r.filePaths.forEach(p => fs.copyFileSync(p, path.join(SND, path.basename(p))));
  return sounds();
});
ipcMain.handle('importRows', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }] });
  if (r.canceled) return null;
  const p = r.filePaths[0];
  if (/\.csv$/i.test(p)) {
    const lines = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    return lines.map(l => l.split(l.includes(';') ? ';' : ','));
  }
  const wb = XLSX.readFile(p);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
});
ipcMain.handle('template', async (e, rows, name) => {
  const r = await dialog.showSaveDialog({ defaultPath: name || 'zil_programi.xlsx', filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
  if (r.canceled) return false;
  const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 26 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Zil programi');
  XLSX.writeFile(wb, r.filePath);
  return true;
});
ipcMain.handle('backup', async (e, c) => {
  const r = await dialog.showSaveDialog({ defaultPath: 'okul_zili_yedek.json', filters: [{ name: 'Yedek', extensions: ['json'] }] });
  if (r.canceled) return false;
  const files = fs.readdirSync(SND).map(f => ({ file: f, data: fs.readFileSync(path.join(SND, f)).toString('base64') }));
  fs.writeFileSync(r.filePath, JSON.stringify({ v: 1, cfg: c, sounds: files }));
  return true;
});
ipcMain.handle('restore', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Yedek', extensions: ['json'] }] });
  if (r.canceled) return null;
  let j; try { j = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch { j = null; }
  if (!j || !j.cfg || !j.cfg.week) { dialog.showErrorBox('Geçersiz yedek', 'Bu dosya bir Okul Zili yedeği değil.'); return null; }
  (j.sounds || []).forEach(s => fs.writeFileSync(path.join(SND, path.basename(s.file)), Buffer.from(s.data, 'base64')));
  fs.writeFileSync(CFG, JSON.stringify(j.cfg, null, 2));
  return { cfg: j.cfg, sounds: sounds() };
});
