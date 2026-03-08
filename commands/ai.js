// commands/ai.js — AI-Powered Commands (uses free APIs)
const axios = require('axios');

// ─── Free AI via OpenRouter (free models available) ───────────────────────────
async function callAI(prompt, systemPrompt = 'You are a helpful assistant.') {
  // Try OpenRouter free models first
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your_openrouter_key_here') {
    const resp = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-7b-instruct-v0.3',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
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

  // Fallback: OpenAI
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_key_here') {
    const resp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return resp.data.choices[0].message.content;
  }

  throw new Error('No AI API key configured. Add OPENROUTER_API_KEY or OPENAI_API_KEY to .env file.\nGet a free key at: https://openrouter.ai/');
}

// ─── Hugging Face Image Generation ───────────────────────────────────────────
async function generateImage(prompt) {
  if (!process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACE_API_KEY === 'your_huggingface_key_here') {
    throw new Error('Hugging Face API key not set. Get free key at: https://huggingface.co/settings/tokens');
  }
  const resp = await axios.post(
    'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
    { inputs: prompt },
    {
      headers: { 'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}` },
      responseType: 'arraybuffer',
      timeout: 60000
    }
  );
  return Buffer.from(resp.data);
}

// ─── Free Translation via MyMemory ───────────────────────────────────────────
async function translate(text, targetLang) {
  const resp = await axios.get('https://api.mymemory.translated.net/get', {
    params: { q: text, langpair: `en|${targetLang}` }
  });
  return resp.data.responseData.translatedText;
}

const commands = {
  // ── AI Chat ──
  async ai({ sock, msg, jid, args }) {
    if (!args.length) {
      return sock.sendMessage(jid, { text: '❓ Usage: *!ai [your question]*\nExample: *!ai What is the meaning of life?*' }, { quoted: msg });
    }
    await sock.sendPresenceUpdate('composing', jid);
    const prompt = args.join(' ');

    try {
      const response = await callAI(prompt);
      await sock.sendMessage(jid, {
        text: `🤖 *AI Response*\n\n${response}`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ AI Error: ${err.message}` }, { quoted: msg });
    }
    await sock.sendPresenceUpdate('paused', jid);
  },

  // ── AI Image Generation ──
  async imagine({ sock, msg, jid, args }) {
    if (!args.length) {
      return sock.sendMessage(jid, { text: '❓ Usage: *!imagine [prompt]*\nExample: *!imagine a beautiful sunset over mountains*' }, { quoted: msg });
    }
    const prompt = args.join(' ');
    await sock.sendMessage(jid, { text: `🎨 Generating image for: "_${prompt}_"\n⏳ Please wait...` }, { quoted: msg });

    try {
      const imageBuffer = await generateImage(prompt);
      await sock.sendMessage(jid, {
        image: imageBuffer,
        caption: `🎨 *AI Generated Image*\nPrompt: _${prompt}_`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ Image generation failed: ${err.message}` }, { quoted: msg });
    }
  },

  // ── AI Translate ──
  async translate({ sock, msg, jid, args }) {
    if (args.length < 2) {
      return sock.sendMessage(jid, {
        text: '❓ Usage: *!translate [language code] [text]*\nExample: *!translate es Hello, how are you?*\n\nCodes: es=Spanish, fr=French, de=German, ar=Arabic, zh=Chinese, ja=Japanese, pt=Portuguese, ru=Russian'
      }, { quoted: msg });
    }
    const lang = args[0];
    const text = args.slice(1).join(' ');

    try {
      const translated = await translate(text, lang);
      await sock.sendMessage(jid, {
        text: `🌍 *Translation*\n\n*Original:* ${text}\n*Translated (${lang}):* ${translated}`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ Translation failed: ${err.message}` }, { quoted: msg });
    }
  },

  // ── AI Story Generator ──
  async story({ sock, msg, jid, args }) {
    if (!args.length) {
      return sock.sendMessage(jid, { text: '❓ Usage: *!story [topic/prompt]*\nExample: *!story a dragon who wants to be a chef*' }, { quoted: msg });
    }
    const prompt = args.join(' ');
    await sock.sendMessage(jid, { text: '📖 Writing your story...' }, { quoted: msg });

    try {
      const story = await callAI(
        `Write a short, engaging story (150-200 words) about: ${prompt}`,
        'You are a creative storyteller. Write engaging, family-friendly short stories.'
      );
      await sock.sendMessage(jid, {
        text: `📖 *AI Story*\n\n${story}`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ Story failed: ${err.message}` }, { quoted: msg });
    }
  },

  // ── AI Code Helper ──
  async code({ sock, msg, jid, args }) {
    if (!args.length) {
      return sock.sendMessage(jid, { text: '❓ Usage: *!code [question]*\nExample: *!code How do I reverse a string in Python?*' }, { quoted: msg });
    }
    const question = args.join(' ');
    await sock.sendPresenceUpdate('composing', jid);

    try {
      const answer = await callAI(
        question,
        'You are an expert programmer. Provide clear, concise code examples with brief explanations. Format code blocks with language labels.'
      );
      await sock.sendMessage(jid, {
        text: `💻 *Code Helper*\n\n${answer}`
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ Code helper failed: ${err.message}` }, { quoted: msg });
    }
    await sock.sendPresenceUpdate('paused', jid);
  },

  // ── AI Roast ──
  async roast({ sock, msg, jid, args }) {
    if (!args.length) {
      return sock.sendMessage(jid, { text: '❓ Usage: *!roast [name/topic]*' }, { quoted: msg });
    }
    const target = args.join(' ');
    try {
      const roast = await callAI(
        `Give a funny, light-hearted roast about: ${target}. Keep it playful, not mean.`,
        'You are a comedian doing light roasts. Keep it funny and harmless.'
      );
      await sock.sendMessage(jid, { text: `🔥 *Roast*\n\n${roast}` }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ ${err.message}` }, { quoted: msg });
    }
  },

  // ── AI Motivate ──
  async motivate({ sock, msg, jid }) {
    try {
      const quote = await callAI(
        'Give me a unique, inspiring motivational quote with a brief explanation (2-3 sentences).',
        'You are an inspirational coach. Provide powerful, unique motivational content.'
      );
      await sock.sendMessage(jid, { text: `💪 *Daily Motivation*\n\n${quote}` }, { quoted: msg });
    } catch (err) {
      // Fallback quotes
      const fallbacks = [
        '💪 "The only way to do great work is to love what you do." — Steve Jobs',
        '🌟 "Success is not final, failure is not fatal: it is the courage to continue that counts." — Churchill',
        '🔥 "Believe you can and you\'re halfway there." — Theodore Roosevelt'
      ];
      await sock.sendMessage(jid, {
        text: fallbacks[Math.floor(Math.random() * fallbacks.length)]
      }, { quoted: msg });
    }
  },

  // ── AI Summary ──
  async summarize({ sock, msg, jid, args }) {
    if (!args.length) {
      return sock.sendMessage(jid, { text: '❓ Usage: *!summarize [long text to summarize]*' }, { quoted: msg });
    }
    const text = args.join(' ');
    try {
      const summary = await callAI(
        `Summarize this text in 3-5 bullet points:\n\n${text}`,
        'You are a professional summarizer. Create clear, concise summaries.'
      );
      await sock.sendMessage(jid, { text: `📋 *Summary*\n\n${summary}` }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ ${err.message}` }, { quoted: msg });
    }
  }
};

module.exports = { commands };
