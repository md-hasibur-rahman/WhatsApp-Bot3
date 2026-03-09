require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  getContentType,
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

const funCommands = require('./commands/fun');
const adminCommands = require('./commands/admin');
const aiCommands = require('./commands/ai');
const mediaCommands = require('./commands/media');
const antiSpam = require('./utils/antiSpam');
const messageFilter = require('./utils/messageFilter');
const groupManager = require('./utils/groupManager');
const xpSystem = require('./utils/xpSystem');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'dashboard')));

let sock = null;
let latestQR = null;
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

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

const settingsFile = path.join(dataDir, 'groupSettings.json');
let groupSettings = {};
try {
  if (fs.existsSync(settingsFile)) {
    groupSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
  }
} catch (e) { groupSettings = {}; }

function saveSettings() {
  try { fs.writeFileSync(settingsFile, JSON.stringify(groupSettings, null, 2)); } catch(e) {}
}

function getGroupSettings(groupId) {
  if (!groupSettings[groupId]) {
    groupSettings[groupId] = {
      welcome: false, goodbye: false,
      antiLink: false, antiSpam: false,
      antiBot: false, antiDelete: false,
      antiFlood: false, badWordFilter: false,
      autoKick: false, autoWarn: false,
      muted: false, autoReact: false,
      autoReply: false, alwaysOnline: true,
      autoTyping: false, xpSystem: false,
      economy: false, antiNSFW: false,
      welcomeMsg: 'Welcome to the group, @user!',
      goodbyeMsg: 'Goodbye @user!',
      autoReplyTriggers: {},
      badWords: [],
      warnCount: {}, maxWarns: 3,
      bannedUsers: [], premiumUsers: [],
      prefix: process.env.BOT_PREFIX || '!'
    };
    saveSettings();
  }
  return groupSettings[groupId];
}

async function startBot() {
  try {
    const sessionPath = path.join(__dirname, 'sessions', process.env.SESSION_NAME || 'bot-session');
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    console.log('Using WA v' + version.join('.'));

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: true,
      auth: state,
      msgRetryCounterCache,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      getMessage: async (key) => {
        if (store) {
          const msg = await store.loadMessage(key.remoteJid, key.id);
          return msg?.message || undefined;
        }
        return { conversation: 'hello' };
      }
    });

    store.bind(sock.ev);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log('connection.update:', connection, 'hasQR:', !!qr);

      if (qr) {
        console.log('QR received!');
        try {
          latestQR = await qrcode.toDataURL(qr);
          botStatus = 'qr';
          io.emit('qr', { qr: latestQR });
          io.emit('status', { status: 'qr', message: 'Scan QR Code!' });
          console.log('QR emitted to clients');
        } catch (err) {
          console.error('QR error:', err.message);
        }
      }

      if (connection === 'close') {
        latestQR = null;
        botStatus = 'disconnected';
        botStats.connected = false;
        io.emit('status', { status: 'disconnected', message: 'Disconnected - Reconnecting...' });

        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode
          : null;

        console.log('Connection closed. Code:', statusCode);

        if (statusCode === DisconnectReason.loggedOut) {
          io.emit('status', { status: 'loggedout', message: 'Logged out! Please refresh.' });
          try {
            const sessionDir = path.join(__dirname, 'sessions', process.env.SESSION_NAME || 'bot-session');
            if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
          } catch(e) {}
        }
        setTimeout(startBot, 3000);
      }

      if (connection === 'open') {
        console.log('Bot connected!');
        latestQR = null;
        botStatus = 'connected';
        botStats.connected = true;
        botStats.uptime = Date.now();
        io.emit('status', { status: 'connected', message: 'Bot Connected!' });
        await loadGroups();
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
      await loadGroups();
      io.emit('groups', { groups: Object.values(groups) });
      const settings = getGroupSettings(id);
      if (action === 'add' && settings.welcome) {
        for (const p of participants) {
          const msg = settings.welcomeMsg.replace('@user', '@' + p.split('@')[0]);
          await sock.sendMessage(id, { text: msg, mentions: [p] }).catch(() => {});
        }
      }
      if (action === 'remove' && settings.goodbye) {
        for (const p of participants) {
          const msg = settings.goodbyeMsg.replace('@user', '@' + p.split('@')[0]);
          await sock.sendMessage(id, { text: msg }).catch(() => {});
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        try { await handleMessage(msg); } catch (err) {
          console.error('Message error:', err.message);
        }
      }
    });

    sock.ev.on('messages.delete', async (item) => {
      if (!item.keys) return;
      for (const key of item.keys) {
        const groupId = key.remoteJid;
        if (!groupId || !groupId.endsWith('@g.us')) continue;
        const settings = getGroupSettings(groupId);
        if (settings.antiDelete) {
          await sock.sendMessage(groupId, {
            text: 'Anti-Delete: @' + key.participant?.split('@')[0] + ' deleted a message!',
            mentions: [key.participant]
          }).catch(() => {});
        }
      }
    });

  } catch (err) {
    console.error('startBot error:', err.message);
    setTimeout(startBot, 5000);
  }
}

async function handleMessage(msg) {
  if (!msg.message || msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  const isGroup = jid && jid.endsWith('@g.us');
  const sender = isGroup ? msg.key.participant : jid;
  const senderNum = sender ? sender.split('@')[0] : '';
  const body =
    msg.message.conversation ||
    (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) ||
    (msg.message.imageMessage && msg.message.imageMessage.caption) ||
    (msg.message.videoMessage && msg.message.videoMessage.caption) || '';

  botStats.messagesHandled++;
  io.emit('stats', botStats);

  await sock.readMessages([msg.key]).catch(() => {});

  if (isGroup) {
    const settings = getGroupSettings(jid);

    if (settings.autoTyping && body.startsWith(settings.prefix)) {
      await sock.sendPresenceUpdate('composing', jid).catch(() => {});
      setTimeout(function() { sock.sendPresenceUpdate('paused', jid).catch(() => {}); }, 2000);
    }

    if (settings.antiSpam) {
      const spamResult = antiSpam.check(sender, jid);
      if (spamResult.isSpam) {
        await sock.sendMessage(jid, {
          text: 'Spam warning @' + senderNum + '! (' + spamResult.count + '/3)',
          mentions: [sender]
        }).catch(() => {});
        if (spamResult.count >= 3 && settings.autoKick) {
          await sock.groupParticipantsUpdate(jid, [sender], 'remove').catch(() => {});
        }
        return;
      }
    }

    if (settings.badWordFilter) {
      const hasBadWord = messageFilter.checkBadWords(body, settings.badWords);
      if (hasBadWord) {
        await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
        await sock.sendMessage(jid, {
          text: 'Warning @' + senderNum + ', watch your language!',
          mentions: [sender]
        }).catch(() => {});
        return;
      }
    }

    if (settings.antiLink) {
      const hasLink = messageFilter.checkLinks(body);
      if (hasLink) {
        const isAdmin = await groupManager.isAdmin(sock, jid, sender);
        if (!isAdmin) {
          await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
          await sock.sendMessage(jid, {
            text: 'Links are not allowed here @' + senderNum + '!',
            mentions: [sender]
          }).catch(() => {});
          return;
        }
      }
    }

    if (settings.muted && body.startsWith(settings.prefix)) return;

    if (settings.autoReact && !body.startsWith(settings.prefix)) {
      const emojis = ['👍','❤️','😂','😮','🔥','👏'];
      const rand = emojis[Math.floor(Math.random() * emojis.length)];
      await sock.sendMessage(jid, { react: { text: rand, key: msg.key } }).catch(() => {});
    }

    if (settings.autoReply && settings.autoReplyTriggers) {
      const lowerBody = body.toLowerCase().trim();
      const reply = settings.autoReplyTriggers[lowerBody];
      if (reply) {
        await sock.sendMessage(jid, { text: reply }, { quoted: msg }).catch(() => {});
        return;
      }
    }

    if (settings.xpSystem) xpSystem.addXP(sender, jid, 1);
  }

  const settings = isGroup ? getGroupSettings(jid) : { prefix: process.env.BOT_PREFIX || '!' };
  if (!body.startsWith(settings.prefix)) return;

  const args = body.slice(settings.prefix.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  botStats.commandsRun++;
  io.emit('stats', botStats);

  const ctx = {
    sock, msg, jid, sender, senderNum, isGroup, args, body,
    settings: isGroup ? getGroupSettings(jid) : {},
    groupSettings, saveSettings, groups, io
  };

  const allCommands = Object.assign({},
    funCommands.commands,
    adminCommands.commands,
    aiCommands.commands,
    mediaCommands.commands
  );

  if (allCommands[command]) {
    try {
      await allCommands[command](ctx);
    } catch (err) {
      await sock.sendMessage(jid, { text: 'Error: ' + err.message }, { quoted: msg }).catch(() => {});
    }
  }
}

async function loadGroups() {
  try {
    const allGroups = await sock.groupFetchAllParticipating();
    groups = {};
    for (const id in allGroups) {
      const meta = allGroups[id];
      groups[id] = {
        id,
        name: meta.subject,
        participants: meta.participants ? meta.participants.length : 0,
        description: meta.desc || '',
        admins: meta.participants ? meta.participants.filter(function(p) { return p.admin; }).map(function(p) { return p.id; }) : []
      };
    }
    io.emit('groups', { groups: Object.values(groups) });
    console.log('Loaded ' + Object.keys(groups).length + ' groups');
  } catch (err) {
    console.error('loadGroups error:', err.message);
  }
}

app.get('/api/status', function(req, res) {
  res.json({
    status: botStatus,
    connected: botStats.connected,
    stats: Object.assign({}, botStats, {
      uptime: botStats.connected ? Math.floor((Date.now() - botStats.uptime) / 1000) : 0
    })
  });
});

app.get('/api/qr', function(req, res) {
  if (latestQR) res.json({ qr: latestQR });
  else res.json({ qr: null, status: botStatus });
});

app.get('/api/groups', function(req, res) {
  res.json({ groups: Object.values(groups) });
});

app.get('/api/group/:id/settings', function(req, res) {
  res.json(getGroupSettings(decodeURIComponent(req.params.id)));
});

app.post('/api/group/:id/settings', function(req, res) {
  const groupId = decodeURIComponent(req.params.id);
  groupSettings[groupId] = Object.assign({}, getGroupSettings(groupId), req.body);
  saveSettings();
  res.json({ success: true, settings: groupSettings[groupId] });
});

app.post('/api/send', async function(req, res) {
  const jid = req.body.jid;
  const text = req.body.text;
  if (!sock || botStatus !== 'connected') return res.status(400).json({ error: 'Bot not connected' });
  try {
    await sock.sendMessage(jid, { text: text });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', async function(req, res) {
  try { if (sock) await sock.logout(); } catch (e) {}
  res.json({ success: true });
});

app.get('/api/xp/:groupId', function(req, res) {
  res.json(xpSystem.getLeaderboard(req.params.groupId));
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

io.on('connection', function(socket) {
  console.log('Dashboard connected. Status:', botStatus);

  socket.emit('status', {
    status: botStatus,
    message: botStatus === 'connected' ? 'Bot Connected!'
           : botStatus === 'qr' ? 'Scan QR Code!'
           : 'Waiting for connection...'
  });

  if (latestQR) {
    console.log('Sending cached QR to new client');
    socket.emit('qr', { qr: latestQR });
  }

  if (Object.keys(groups).length) {
    socket.emit('groups', { groups: Object.values(groups) });
  }

  socket.emit('stats', botStats);

  socket.on('requestQR', function() {
    console.log('QR requested. Available:', !!latestQR);
    if (latestQR) {
      socket.emit('qr', { qr: latestQR });
    } else {
      socket.emit('status', { status: botStatus, message: 'QR not ready, please wait...' });
    }
  });

  socket.on('sendMessage', async function(data) {
    if (sock && botStatus === 'connected') {
      try {
        await sock.sendMessage(data.jid, { text: data.text });
        socket.emit('messageSent', { success: true });
      } catch (err) {
        socket.emit('messageSent', { success: false, error: err.message });
      }
    }
  });

  socket.on('disconnect', function() {
    console.log('Dashboard disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', function() {
  console.log('WhatsApp Bot Dashboard running on port ' + PORT);
  setTimeout(startBot, 1000);
});
