require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidDecode,
  proto,
  getContentType,
  generateWAMessageFromContent,
  prepareWAMessageMedia
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const NodeCache = require('node-cache');

// Command handlers
const funCommands = require('./commands/fun');
const adminCommands = require('./commands/admin');
const aiCommands = require('./commands/ai');
const mediaCommands = require('./commands/media');

// Utils
const antiSpam = require('./utils/antiSpam');
const messageFilter = require('./utils/messageFilter');
const groupManager = require('./utils/groupManager');
const xpSystem = require('./utils/xpSystem');

// ─── Express + Socket.io Setup ───────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: '*' } });

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'dashboard')));

// ─── Bot State ────────────────────────────────────────────────────────────────
let sock = null;
let qrString = null;
let botStatus = 'disconnected';
let groups = {};
let botStats = {
  messagesHandled: 0,
  commandsRun: 0,
  uptime: Date.now(),
  connected: false
};

const msgRetryCounterCache = new NodeCache();
const store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });

// ─── Group Settings Store ─────────────────────────────────────────────────────
const settingsFile = path.join(__dirname, 'data', 'groupSettings.json');
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}
let groupSettings = {};
if (fs.existsSync(settingsFile)) {
  groupSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
}

function saveSettings() {
  fs.writeFileSync(settingsFile, JSON.stringify(groupSettings, null, 2));
}

function getGroupSettings(groupId) {
  if (!groupSettings[groupId]) {
    groupSettings[groupId] = {
      welcome: false,
      goodbye: false,
      antiLink: false,
      antiSpam: false,
      antiBot: false,
      antiDelete: false,
      antiFlood: false,
      badWordFilter: false,
      autoKick: false,
      autoWarn: false,
      muted: false,
      autoReact: false,
      autoReply: false,
      alwaysOnline: true,
      autoTyping: false,
      xpSystem: false,
      economy: false,
      welcomeMsg: 'Welcome to the group, @user! 👋',
      goodbyeMsg: 'Goodbye @user! We will miss you 👋',
      autoReplyTriggers: {},
      badWords: ['spam', 'scam'],
      warnCount: {},
      maxWarns: 3,
      bannedUsers: [],
      premiumUsers: [],
      prefix: process.env.BOT_PREFIX || '!'
    };
    saveSettings();
  }
  return groupSettings[groupId];
}

// ─── Start WhatsApp Bot ───────────────────────────────────────────────────────
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, 'sessions', process.env.SESSION_NAME || 'bot-session')
  );

  const { version } = await fetchLatestBaileysVersion();
  console.log(`Using WA v${version.join('.')}`);

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    msgRetryCounterCache,
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
      if (store) {
        const msg = await store.loadMessage(key.remoteJid, key.id);
        return msg?.message || undefined;
      }
      return { conversation: 'hello' };
    }
  });

  store.bind(sock.ev);

  // ── QR Code ──
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrString = await qrcode.toDataURL(qr);
      botStatus = 'qr';
      io.emit('qr', { qr: qrString });
      io.emit('status', { status: 'qr', message: 'Scan QR Code' });
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom &&
        lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut;

      botStatus = 'disconnected';
      botStats.connected = false;
      io.emit('status', { status: 'disconnected', message: 'Disconnected' });

      if (shouldReconnect) {
        setTimeout(startBot, 3000);
      } else {
        io.emit('status', { status: 'loggedout', message: 'Logged out. Refresh to scan QR again.' });
        // Clear session
        const sessionDir = path.join(__dirname, 'sessions', process.env.SESSION_NAME || 'bot-session');
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }
      }
    }

    if (connection === 'open') {
      qrString = null;
      botStatus = 'connected';
      botStats.connected = true;
      botStats.uptime = Date.now();
      io.emit('status', { status: 'connected', message: 'Bot Connected ✓' });
      await loadGroups();
    }
  });

  // ── Credentials update ──
  sock.ev.on('creds.update', saveCreds);

  // ── Group updates ──
  sock.ev.on('groups.update', async (updates) => {
    await loadGroups();
    io.emit('groups', { groups: Object.values(groups) });
  });

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    await loadGroups();
    io.emit('groups', { groups: Object.values(groups) });

    const settings = getGroupSettings(id);
    const groupMeta = groups[id];
    if (!groupMeta) return;

    if (action === 'add' && settings.welcome) {
      for (const p of participants) {
        const msg = settings.welcomeMsg.replace('@user', `@${p.split('@')[0]}`);
        await sock.sendMessage(id, {
          text: msg,
          mentions: [p]
        });
      }
    }

    if (action === 'remove' && settings.goodbye) {
      for (const p of participants) {
        const msg = settings.goodbyeMsg.replace('@user', `@${p.split('@')[0]}`);
        await sock.sendMessage(id, { text: msg });
      }
    }
  });

  // ── Messages ──
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await handleMessage(msg);
      } catch (err) {
        console.error('Message handling error:', err.message);
      }
    }
  });

  // ── Message delete (anti-delete) ──
  sock.ev.on('messages.delete', async (item) => {
    if (!item.keys) return;
    for (const key of item.keys) {
      const groupId = key.remoteJid;
      if (!groupId?.endsWith('@g.us')) continue;
      const settings = getGroupSettings(groupId);
      if (settings.antiDelete) {
        const cached = store.messages[groupId]?.get(key.id);
        if (cached?.message) {
          await sock.sendMessage(groupId, {
            text: `🔴 *Anti-Delete* | @${key.participant?.split('@')[0]} deleted a message`,
            mentions: [key.participant]
          });
        }
      }
    }
  });
}

// ─── Handle Incoming Messages ─────────────────────────────────────────────────
async function handleMessage(msg) {
  if (!msg.message || msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  const isGroup = jid?.endsWith('@g.us');
  const sender = isGroup ? msg.key.participant : jid;
  const senderNum = sender?.split('@')[0];
  const contentType = getContentType(msg.message);
  const body =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    '';

  botStats.messagesHandled++;
  io.emit('stats', botStats);

  // ── Always Online / Auto Seen ──
  await sock.readMessages([msg.key]);

  // Group-specific handling
  if (isGroup) {
    const settings = getGroupSettings(jid);

    // Auto typing indicator
    if (settings.autoTyping && body.startsWith(settings.prefix)) {
      await sock.sendPresenceUpdate('composing', jid);
      setTimeout(() => sock.sendPresenceUpdate('paused', jid), 2000);
    }

    // Anti-spam
    if (settings.antiSpam) {
      const spamResult = antiSpam.check(sender, jid);
      if (spamResult.isSpam) {
        await sock.sendMessage(jid, {
          text: `⚠️ @${senderNum} detected as spam. Warning ${spamResult.count}/3`,
          mentions: [sender]
        });
        if (spamResult.count >= 3 && settings.autoKick) {
          await sock.groupParticipantsUpdate(jid, [sender], 'remove');
        }
        return;
      }
    }

    // Bad word filter
    if (settings.badWordFilter) {
      const hasBadWord = messageFilter.checkBadWords(body, settings.badWords);
      if (hasBadWord) {
        await sock.sendMessage(jid, { delete: msg.key });
        await sock.sendMessage(jid, {
          text: `🚫 @${senderNum}, watch your language!`,
          mentions: [sender]
        });
        return;
      }
    }

    // Anti-link
    if (settings.antiLink) {
      const hasLink = messageFilter.checkLinks(body);
      if (hasLink) {
        const isAdmin = await groupManager.isAdmin(sock, jid, sender);
        if (!isAdmin) {
          await sock.sendMessage(jid, { delete: msg.key });
          await sock.sendMessage(jid, {
            text: `🔗 @${senderNum}, links are not allowed here!`,
            mentions: [sender]
          });
          return;
        }
      }
    }

    // Muted group - no commands
    if (settings.muted && body.startsWith(settings.prefix)) return;

    // ── Auto NSFW Image Detection ──
    if (settings.antiNSFW && msg.message?.imageMessage) {
      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const axios = require('axios');
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        const base64 = buffer.toString('base64');

        if (process.env.HUGGINGFACE_API_KEY && process.env.HUGGINGFACE_API_KEY !== 'your_huggingface_key_here') {
          const resp = await axios.post(
            'https://api-inference.huggingface.co/models/Falconsai/nsfw_image_detection',
            buffer,
            {
              headers: {
                'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                'Content-Type': 'application/octet-stream'
              },
              timeout: 15000
            }
          );
          const results = resp.data;
          if (Array.isArray(results)) {
            const nsfw = results.find(r => r.label === 'nsfw' || r.label === 'NSFW');
            const score = nsfw ? nsfw.score : 0;
            if (score > 0.7) {
              await sock.sendMessage(jid, { delete: msg.key });
              await sock.sendMessage(jid, {
                text: `🔞 @${senderNum} এর পাঠানো ছবি অনুপযুক্ত মনে হচ্ছে তাই ডিলিট করা হয়েছে!`,
                mentions: [sender]
              });
            }
          }
        }
      } catch (err) {
        console.error('NSFW check error:', err.message);
      }
    }

    // Auto React
    if (settings.autoReact && !body.startsWith(settings.prefix)) {
      const emojis = ['👍', '❤️', '😂', '😮', '🔥', '👏'];
      const rand = emojis[Math.floor(Math.random() * emojis.length)];
      await sock.sendMessage(jid, {
        react: { text: rand, key: msg.key }
      });
    }

    // Auto Reply
    if (settings.autoReply && settings.autoReplyTriggers) {
      const lowerBody = body.toLowerCase().trim();
      const reply = settings.autoReplyTriggers[lowerBody];
      if (reply) {
        await sock.sendMessage(jid, { text: reply }, { quoted: msg });
        return;
      }
    }

    // XP System
    if (settings.xpSystem) {
      xpSystem.addXP(sender, jid, 1);
    }
  }

  // ── Command Prefix Check ──
  const settings = isGroup ? getGroupSettings(jid) : { prefix: process.env.BOT_PREFIX || '!' };
  if (!body.startsWith(settings.prefix)) return;

  const args = body.slice(settings.prefix.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  botStats.commandsRun++;
  io.emit('stats', botStats);

  const ctx = {
    sock,
    msg,
    jid,
    sender,
    senderNum,
    isGroup,
    args,
    body,
    settings: isGroup ? getGroupSettings(jid) : {},
    groupSettings,
    saveSettings,
    groups,
    io
  };

  // Route commands
  const allCommands = {
    ...funCommands.commands,
    ...adminCommands.commands,
    ...aiCommands.commands,
    ...mediaCommands.commands
  };

  if (allCommands[command]) {
    try {
      await allCommands[command](ctx);
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ Error: ${err.message}` }, { quoted: msg });
    }
  }
}

// ─── Load Groups ──────────────────────────────────────────────────────────────
async function loadGroups() {
  try {
    const allGroups = await sock.groupFetchAllParticipating();
    groups = {};
    for (const [id, meta] of Object.entries(allGroups)) {
      groups[id] = {
        id,
        name: meta.subject,
        participants: meta.participants?.length || 0,
        description: meta.desc || '',
        creation: meta.creation,
        owner: meta.owner,
        admins: meta.participants?.filter(p => p.admin)?.map(p => p.id) || []
      };
    }
    io.emit('groups', { groups: Object.values(groups) });
  } catch (err) {
    console.error('Error loading groups:', err.message);
  }
}

// ─── API Routes ───────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    status: botStatus,
    connected: botStats.connected,
    stats: {
      ...botStats,
      uptime: botStats.connected ? Math.floor((Date.now() - botStats.uptime) / 1000) : 0
    }
  });
});

app.get('/api/groups', (req, res) => {
  res.json({ groups: Object.values(groups) });
});

app.get('/api/group/:id/settings', (req, res) => {
  const settings = getGroupSettings(decodeURIComponent(req.params.id));
  res.json(settings);
});

app.post('/api/group/:id/settings', (req, res) => {
  const groupId = decodeURIComponent(req.params.id);
  const current = getGroupSettings(groupId);
  groupSettings[groupId] = { ...current, ...req.body };
  saveSettings();
  res.json({ success: true, settings: groupSettings[groupId] });
});

app.post('/api/send', async (req, res) => {
  const { jid, text } = req.body;
  if (!sock || botStatus !== 'connected') {
    return res.status(400).json({ error: 'Bot not connected' });
  }
  try {
    await sock.sendMessage(jid, { text });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', async (req, res) => {
  try {
    if (sock) await sock.logout();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: true });
  }
});

app.get('/api/xp/:groupId', (req, res) => {
  const data = xpSystem.getLeaderboard(req.params.groupId);
  res.json(data);
});

// Serve dashboard
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Dashboard connected');

  // Send current state
  socket.emit('status', { status: botStatus, message: botStatus === 'connected' ? 'Bot Connected ✓' : 'Disconnected' });
  if (qrString) socket.emit('qr', { qr: qrString });
  if (Object.keys(groups).length) socket.emit('groups', { groups: Object.values(groups) });
  socket.emit('stats', botStats);

  socket.on('requestQR', () => {
    if (qrString) socket.emit('qr', { qr: qrString });
  });

  socket.on('sendMessage', async ({ jid, text }) => {
    if (sock && botStatus === 'connected') {
      try {
        await sock.sendMessage(jid, { text });
        socket.emit('messageSent', { success: true });
      } catch (err) {
        socket.emit('messageSent', { success: false, error: err.message });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Dashboard disconnected');
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║  WhatsApp Bot Dashboard                ║`);
  console.log(`║  Open: http://localhost:${PORT}           ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  startBot();
});
