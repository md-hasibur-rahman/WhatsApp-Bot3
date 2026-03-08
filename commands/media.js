// commands/media.js — Media, Sticker & Image Vision Tools
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const xpSystem = require('../utils/xpSystem');
const axios = require('axios');

// ─── Helper: ছবি থেকে Base64 বানাও ──────────────────────────────────────────
async function imageToBase64(msg, sock) {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const imageMsg =
    msg.message?.imageMessage ||
    quoted?.imageMessage ||
    msg.message?.viewOnceMessage?.message?.imageMessage;

  if (!imageMsg) return null;

  const buffer = await downloadMediaMessage(
    { message: { imageMessage: imageMsg }, key: msg.key },
    'buffer',
    {}
  );
  return buffer.toString('base64');
}

// ─── AI দিয়ে ছবি analyze করো (HuggingFace বা OpenRouter Vision) ────────────
async function analyzeImageWithAI(base64Image, prompt = 'Describe this image in detail.') {
  // OpenRouter Vision Model (ফ্রি)
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your_openrouter_key_here') {
    const resp = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'google/gemini-flash-1.5-8b',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64Image}` }
              },
              { type: 'text', text: prompt }
            ]
          }
        ],
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://whatsappbot.app',
          'X-Title': 'WhatsApp Bot'
        }
      }
    );
    return resp.data.choices[0].message.content;
  }
  throw new Error('OPENROUTER_API_KEY সেট করো .env ফাইলে।');
}

// ─── NSFW Detection (HuggingFace) ────────────────────────────────────────────
async function detectNSFW(base64Image) {
  if (!process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACE_API_KEY === 'your_huggingface_key_here') {
    return null;
  }
  try {
    const buffer = Buffer.from(base64Image, 'base64');
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
      return nsfw ? nsfw.score : 0;
    }
    return 0;
  } catch {
    return null;
  }
}

const commands = {

  // ══════════════════════════════════════════
  //  🖼️ IMAGE VISION COMMANDS
  // ══════════════════════════════════════════

  // ── ছবির বর্ণনা দাও ──
  async describe({ sock, msg, jid, args }) {
    const base64 = await imageToBase64(msg, sock);
    if (!base64) {
      return sock.sendMessage(jid, {
        text: '❓ ছবি পাঠাও বা কোনো ছবিতে reply করে *!describe* লেখো।'
      }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: '🔍 ছবি analyze করছি...' }, { quoted: msg });

    try {
      const customPrompt = args.length ? args.join(' ') : 'Describe this image in detail. Be specific about what you see.';
      const description = await analyzeImageWithAI(base64, customPrompt);
      await sock.sendMessage(jid, {
        text: `🖼️ *ছবির বর্ণনা*\n\n${description}`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ ছবি analyze করতে পারিনি: ${err.message}`
      }, { quoted: msg });
    }
  },

  // ── ছবিতে কী লেখা আছে পড়ো (OCR) ──
  async readtext({ sock, msg, jid }) {
    const base64 = await imageToBase64(msg, sock);
    if (!base64) {
      return sock.sendMessage(jid, {
        text: '❓ ছবি পাঠাও বা কোনো ছবিতে reply করে *!readtext* লেখো।'
      }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: '📖 ছবি থেকে লেখা পড়ছি...' }, { quoted: msg });

    try {
      const text = await analyzeImageWithAI(
        base64,
        'Read and extract ALL text visible in this image exactly as written. If no text found, say "কোনো লেখা পাওয়া যায়নি".'
      );
      await sock.sendMessage(jid, {
        text: `📝 *ছবিতে লেখা আছে:*\n\n${text}`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ লেখা পড়তে পারিনি: ${err.message}`
      }, { quoted: msg });
    }
  },

  // ── ছবি সম্পর্কে প্রশ্ন করো ──
  async ask({ sock, msg, jid, args }) {
    if (!args.length) {
      return sock.sendMessage(jid, {
        text: '❓ ব্যবহার: ছবিতে reply করে *!ask [প্রশ্ন]* লেখো\nউদাহরণ: *!ask এই ছবিতে কোন দেশের পতাকা?*'
      }, { quoted: msg });
    }

    const base64 = await imageToBase64(msg, sock);
    if (!base64) {
      return sock.sendMessage(jid, {
        text: '❓ কোনো ছবিতে reply করে *!ask [প্রশ্ন]* লেখো।'
      }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: '🤔 চিন্তা করছি...' }, { quoted: msg });

    try {
      const question = args.join(' ');
      const answer = await analyzeImageWithAI(base64, question);
      await sock.sendMessage(jid, {
        text: `💬 *প্রশ্ন:* ${question}\n\n🤖 *উত্তর:* ${answer}`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ উত্তর দিতে পারিনি: ${err.message}`
      }, { quoted: msg });
    }
  },

  // ── ছবির ভাষা detect করে বাংলায় বলো ──
  async imginfo({ sock, msg, jid }) {
    const base64 = await imageToBase64(msg, sock);
    if (!base64) {
      return sock.sendMessage(jid, {
        text: '❓ ছবিতে reply করে *!imginfo* লেখো।'
      }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: '🔎 ছবির তথ্য বের করছি...' }, { quoted: msg });

    try {
      const info = await analyzeImageWithAI(
        base64,
        `Analyze this image and provide:
1. Main subject/objects
2. Colors present
3. Scene/setting (indoor/outdoor etc)
4. Mood/tone
5. Any text visible
6. Estimated location if recognizable
Reply in Bangla language.`
      );
      await sock.sendMessage(jid, {
        text: `🖼️ *ছবির সম্পূর্ণ তথ্য*\n\n${info}`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ তথ্য বের করতে পারিনি: ${err.message}`
      }, { quoted: msg });
    }
  },

  // ── ছবিতে মুখ আছে কিনা ও কেমন দেখতে ──
  async facecheck({ sock, msg, jid }) {
    const base64 = await imageToBase64(msg, sock);
    if (!base64) {
      return sock.sendMessage(jid, {
        text: '❓ ছবিতে reply করে *!facecheck* লেখো।'
      }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: '👤 মুখ খুঁজছি...' }, { quoted: msg });

    try {
      const result = await analyzeImageWithAI(
        base64,
        `Analyze faces in this image:
- How many people/faces are visible?
- Approximate age range of each person
- Emotion/expression (happy, sad, angry, neutral etc)
- Gender if clearly visible
- Any notable features
If no face found, say so. Reply in Bangla.`
      );
      await sock.sendMessage(jid, {
        text: `👤 *মুখ বিশ্লেষণ*\n\n${result}`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ বিশ্লেষণ করতে পারিনি: ${err.message}`
      }, { quoted: msg });
    }
  },

  // ── ছবি translate করো ──
  async imgtranslate({ sock, msg, jid, args }) {
    const base64 = await imageToBase64(msg, sock);
    if (!base64) {
      return sock.sendMessage(jid, {
        text: '❓ ছবিতে reply করে *!imgtranslate [ভাষা]* লেখো\nউদাহরণ: *!imgtranslate বাংলা*'
      }, { quoted: msg });
    }

    const targetLang = args.join(' ') || 'বাংলা';
    await sock.sendMessage(jid, { text: `🌍 ${targetLang} তে অনুবাদ করছি...` }, { quoted: msg });

    try {
      const result = await analyzeImageWithAI(
        base64,
        `Extract all text from this image and translate it to ${targetLang}. 
Format: 
Original: [extracted text]
Translation: [translated text]`
      );
      await sock.sendMessage(jid, {
        text: `🌍 *Image Translation → ${targetLang}*\n\n${result}`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ অনুবাদ করতে পারিনি: ${err.message}`
      }, { quoted: msg });
    }
  },

  // ── NSFW ছবি detect করো (Auto protection) ──
  async nsfwcheck({ sock, msg, jid }) {
    const base64 = await imageToBase64(msg, sock);
    if (!base64) {
      return sock.sendMessage(jid, {
        text: '❓ ছবিতে reply করে *!nsfwcheck* লেখো।'
      }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: '🔍 ছবি চেক করছি...' }, { quoted: msg });

    try {
      const score = await detectNSFW(base64);
      if (score === null) {
        return sock.sendMessage(jid, {
          text: '⚠️ NSFW detection এর জন্য HUGGINGFACE_API_KEY লাগবে।'
        }, { quoted: msg });
      }
      const percent = Math.round(score * 100);
      const safe = percent < 50;
      await sock.sendMessage(jid, {
        text: `${safe ? '✅' : '🔞'} *NSFW Check Result*\n\n${safe ? 'Safe' : 'NSFW'} Content\nScore: ${percent}%\n\n${safe ? 'ছবিটি নিরাপদ।' : '⚠️ এই ছবিতে অনুপযুক্ত content থাকতে পারে!'}`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ চেক করতে পারিনি: ${err.message}` }, { quoted: msg });
    }
  },

  // ── ছবি থেকে মজার caption বানাও ──
  async caption({ sock, msg, jid }) {
    const base64 = await imageToBase64(msg, sock);
    if (!base64) {
      return sock.sendMessage(jid, {
        text: '❓ ছবিতে reply করে *!caption* লেখো।'
      }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: '✍️ মজার caption লিখছি...' }, { quoted: msg });

    try {
      const result = await analyzeImageWithAI(
        base64,
        'Create 3 funny and creative captions for this image. Make them witty and entertaining. Write in both English and Bangla.'
      );
      await sock.sendMessage(jid, {
        text: `😂 *AI Generated Captions*\n\n${result}`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ Caption বানাতে পারিনি: ${err.message}` }, { quoted: msg });
    }
  },

  // ── ছবি থেকে meme বানাও ──
  async meme({ sock, msg, jid }) {
    const base64 = await imageToBase64(msg, sock);
    if (!base64) {
      return sock.sendMessage(jid, {
        text: '❓ ছবিতে reply করে *!meme* লেখো।'
      }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: '🎭 Meme বানাচ্ছি...' }, { quoted: msg });

    try {
      const result = await analyzeImageWithAI(
        base64,
        'Look at this image and create a funny meme text for it. Give top text and bottom text separately like a classic meme format. Also write a Bangla version.'
      );
      await sock.sendMessage(jid, {
        text: `🎭 *Meme Text*\n\n${result}`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ Meme বানাতে পারিনি: ${err.message}` }, { quoted: msg });
    }
  },

  // ══════════════════════════════════════════
  //  📦 অন্যান্য Media Commands
  // ══════════════════════════════════════════

  // ── Sticker from image ──
  async sticker({ sock, msg, jid }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMsg = msg.message?.imageMessage || quoted?.imageMessage;

    if (!imageMsg) {
      return sock.sendMessage(jid, {
        text: '❓ Send an image with *!sticker* as caption, or reply to an image with *!sticker*'
      }, { quoted: msg });
    }

    try {
      const buffer = await downloadMediaMessage(
        { message: { imageMessage: imageMsg }, key: msg.key },
        'buffer',
        {}
      );

      await sock.sendMessage(jid, {
        sticker: buffer
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ Sticker failed: ${err.message}` }, { quoted: msg });
    }
  },

  // ── XP Check ──
  async xp({ sock, msg, jid, sender, isGroup }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only!' }, { quoted: msg });
    const data = xpSystem.getUserXP(sender, jid);
    await sock.sendMessage(jid, {
      text: `📊 *Your Stats*\n\n👤 User: @${sender.split('@')[0]}\n⭐ XP: ${data.xp}\n🏆 Level: ${data.level}\n📈 Next Level: ${data.nextLevel} XP needed`,
      mentions: [sender]
    }, { quoted: msg });
  },

  // ── Leaderboard ──
  async leaderboard({ sock, msg, jid, isGroup }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only!' }, { quoted: msg });
    const lb = xpSystem.getLeaderboard(jid);
    if (!lb.length) {
      return sock.sendMessage(jid, { text: '📊 No XP data yet! Chat more to earn XP.' }, { quoted: msg });
    }
    const medals = ['🥇', '🥈', '🥉'];
    const list = lb.slice(0, 10).map((u, i) =>
      `${medals[i] || `${i + 1}.`} @${u.id.split('@')[0]} — Lvl ${u.level} (${u.xp} XP)`
    ).join('\n');

    await sock.sendMessage(jid, {
      text: `🏆 *XP Leaderboard*\n\n${list}`,
      mentions: lb.slice(0, 10).map(u => u.id)
    });
  },

  // ── Text to sticker ──
  async textsticker({ sock, msg, jid, args }) {
    if (!args.length) {
      return sock.sendMessage(jid, { text: '❓ Usage: *!textsticker [text]*' }, { quoted: msg });
    }
    await sock.sendMessage(jid, {
      text: `⚠️ Text-to-sticker requires canvas module. Install with: *npm install canvas*\nFor now, use an image and *!sticker*`
    }, { quoted: msg });
  },

  // ── TTS placeholder ──
  async tts({ sock, msg, jid, args }) {
    if (!args.length) {
      return sock.sendMessage(jid, { text: '❓ Usage: *!tts [text]*' }, { quoted: msg });
    }
    // Using free Google TTS
    const text = encodeURIComponent(args.join(' '));
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${text}&tl=en&client=tw-ob`;
    try {
      const axios = require('axios');
      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      await sock.sendMessage(jid, {
        audio: Buffer.from(resp.data),
        mimetype: 'audio/mpeg',
        ptt: true
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `🔊 TTS: _${args.join(' ')}_\n_(Voice note generation failed: ${err.message})_`
      }, { quoted: msg });
    }
  },

  // ── Profile picture ──
  async pfp({ sock, msg, jid, args, sender }) {
    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;
    try {
      const ppUrl = await sock.profilePictureUrl(target, 'image');
      await sock.sendMessage(jid, {
        image: { url: ppUrl },
        caption: `🖼️ Profile picture of @${target.split('@')[0]}`,
        mentions: [target]
      }, { quoted: msg });
    } catch {
      await sock.sendMessage(jid, { text: `❌ No profile picture found!` }, { quoted: msg });
    }
  }
};

module.exports = { commands };
