# 🤖 WhatsApp Bot Dashboard

A full-featured WhatsApp bot with a **Windows-style web dashboard**, built with Baileys and Node.js.

## ✨ Features

### 👥 Group Management
- Welcome / Goodbye messages with custom text
- Auto kick / Auto warn (configurable warning count)
- Link blocker (anti-link)
- Bad word filter with custom word list
- Anti-spam (rate limiting)
- Group mute/unmute
- Fake number detection

### 👑 Admin Commands
| Command | Description |
|---------|-------------|
| `!kick @user` | Kick a member |
| `!ban @user` | Ban and kick user |
| `!promote @user` | Promote to admin |
| `!demote @user` | Remove admin |
| `!warn @user` | Warn a user |
| `!warnings` | Show all warnings |
| `!tagall [msg]` | Tag all members |
| `!mute` | Mute the group |
| `!unmute` | Unmute the group |
| `!groupinfo` | Show group info |
| `!setname [name]` | Change group name |
| `!setdesc [text]` | Change description |
| `!invitelink` | Get invite link |
| `!setwelcome [msg]` | Set welcome message |

### 🤖 AI Commands (Free APIs)
| Command | Description |
|---------|-------------|
| `!ai [question]` | Chat with AI |
| `!imagine [prompt]` | Generate image (HuggingFace) |
| `!translate [lang] [text]` | Translate text |
| `!story [prompt]` | Generate a story |
| `!code [question]` | Code helper |
| `!roast [name]` | Funny roast |
| `!motivate` | Daily motivation |
| `!summarize [text]` | Summarize text |

### 🎮 Fun Commands
| Command | Description |
|---------|-------------|
| `!joke` | Random joke |
| `!riddle` | Riddle game |
| `!quiz` | Quiz game |
| `!math` | Math challenge |
| `!truth` | Truth question |
| `!dare` | Dare challenge |
| `!tod` | Truth or Dare |
| `!flip` | Coin flip |
| `!dice` | Roll dice |
| `!8ball [question]` | Magic 8-ball |

### 🖼️ Media Tools
| Command | Description |
|---------|-------------|
| `!sticker` | Image to sticker |
| `!tts [text]` | Text to speech |
| `!pfp [@user]` | View profile pic |
| `!xp` | Check your XP |
| `!leaderboard` | Group XP ranking |

### ⚙️ Bot Control (via Dashboard)
- Always online status
- Auto typing indicator
- Auto react to messages
- Auto reply with custom triggers
- Per-group command prefix

### 🔐 Security (via Dashboard)
- Anti-link per group
- Anti-spam (5 msg / 5s limit)
- Anti-bot detection
- Anti-delete (reveals deleted messages)
- Anti-flood

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- npm

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Edit `.env` file:
```env
# Free API Keys
OPENROUTER_API_KEY=your_key   # https://openrouter.ai (free tier)
HUGGINGFACE_API_KEY=hf_xxx    # https://huggingface.co/settings/tokens (free)

# Bot Settings
BOT_PREFIX=!
PORT=3000
OWNER_NUMBER=1234567890       # Your number without +
```

### 3. Start the Bot
```bash
npm start
```

### 4. Open Dashboard
Navigate to: **http://localhost:3000**

### 5. Scan QR Code
1. Open the QR Login window on the dashboard
2. Open WhatsApp on your phone
3. Go to **Settings → Linked Devices → Link a Device**
4. Scan the QR code shown in the dashboard

---

## 🌐 Free Hosting

### Railway (Recommended - Free tier)
1. Push to GitHub
2. Connect at [railway.app](https://railway.app)
3. Add environment variables
4. Deploy!

### Render
1. Push to GitHub  
2. Create new **Web Service** at [render.com](https://render.com)
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables

### Replit
1. Import from GitHub at [replit.com](https://replit.com)
2. Add secrets (environment variables)
3. Click Run
4. Use [UptimeRobot](https://uptimerobot.com) to keep it alive

---

## 📁 Project Structure

```
whatsapp-bot/
├── index.js              # Main bot + Express server
├── package.json
├── .env                  # Config (don't commit!)
├── commands/
│   ├── fun.js            # Games, jokes, riddles
│   ├── admin.js          # Group management
│   ├── ai.js             # AI features
│   └── media.js          # Sticker, TTS, XP
├── utils/
│   ├── antiSpam.js       # Spam detection
│   ├── messageFilter.js  # Link/word filter
│   ├── groupManager.js   # Admin helpers
│   └── xpSystem.js       # XP & economy
├── dashboard/
│   ├── index.html        # Windows-style UI
│   ├── style.css         # Windows CSS
│   └── script.js         # Dashboard logic
├── data/
│   ├── groupSettings.json  # Per-group config
│   └── xpData.json         # XP/economy data
└── sessions/             # Baileys auth (auto-created)
```

---

## 🔑 Free API Keys

| API | Use | Link |
|-----|-----|------|
| OpenRouter | AI Chat (Free models) | https://openrouter.ai |
| HuggingFace | Image Generation | https://huggingface.co |
| MyMemory | Translation (no key needed!) | Built-in |
| Google TTS | Text to Speech (no key!) | Built-in |

---

## ⚠️ Important Notes

1. **Keep your session folder safe** — it stores your WhatsApp login
2. **Don't scan with your main number** — use a secondary number
3. **Bot must be group admin** for admin commands to work
4. **Free APIs have rate limits** — avoid heavy usage
5. **Multi-device is supported** — bot stays connected even without phone

---

## 🛠️ Customization

### Add Custom Commands
In `commands/fun.js` (or any command file):
```javascript
async mycommand({ sock, msg, jid, args }) {
  await sock.sendMessage(jid, { text: 'Hello!' }, { quoted: msg });
}
```
Then add to the `commands` export object.

### Add Auto-Reply via Dashboard
1. Open Groups Manager
2. Select a group
3. Go to Messages tab
4. Add keyword:reply pairs

### Change Per-Group Prefix
Dashboard → Groups → Select group → Messages tab → Command Prefix
