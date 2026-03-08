// commands/fun.js — Fun & Game Commands

const jokes = [
  "Why don't scientists trust atoms? Because they make up everything! 😂",
  "Why did the scarecrow win an award? Because he was outstanding in his field! 🌾",
  "I told my wife she was drawing her eyebrows too high. She looked surprised! 😮",
  "Why can't you explain puns to kleptomaniacs? They always take things literally! 😅",
  "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them! 🔢",
  "Why do cows wear bells? Because their horns don't work! 🐄",
  "What do you call cheese that isn't yours? Nacho cheese! 🧀",
  "Why did the bicycle fall over? Because it was two-tired! 🚲"
];

const riddles = [
  { q: "I have cities, but no houses live there. I have mountains, but no trees grow there. I have water, but no fish swim there. What am I?", a: "A map" },
  { q: "The more you take, the more you leave behind. What am I?", a: "Footsteps" },
  { q: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?", a: "An echo" },
  { q: "I can fly without wings, I can cry without eyes. Wherever I go, darkness flies. What am I?", a: "A cloud" },
  { q: "What has hands but can't clap?", a: "A clock" }
];

const truths = [
  "What is your biggest fear? 😱",
  "Have you ever lied to your best friend? 🤥",
  "What's the most embarrassing thing you've done? 😳",
  "Who was your first crush? 💕",
  "What's something you've never told anyone? 🤫",
  "What's your biggest regret? 😔"
];

const dares = [
  "Send a voice note singing your favorite song! 🎵",
  "Change your profile picture to a funny face for 1 hour! 📸",
  "Text your most recent contact 'I love you!' 💌",
  "Do 20 push-ups and send proof! 💪",
  "Send a selfie with a funny face right now! 🤳",
  "Tell a joke in the group and everyone must laugh or you do another dare! 😂"
];

// Active games state
const activeQuiz = {};
const activeRiddle = {};
const mathGames = {};

const quizQuestions = [
  { q: "🌍 What is the capital of Japan?", a: "tokyo", opts: "A) Beijing  B) Seoul  C) Tokyo  D) Bangkok" },
  { q: "🔢 What is 15 × 15?", a: "225", opts: "A) 200  B) 225  C) 250  D) 175" },
  { q: "🎵 Who sang 'Thriller'?", a: "michael jackson", opts: "A) Prince  B) Elvis  C) Michael Jackson  D) Stevie Wonder" },
  { q: "🌊 What is the largest ocean?", a: "pacific", opts: "A) Atlantic  B) Indian  C) Arctic  D) Pacific" },
  { q: "⚡ What element has the symbol 'Au'?", a: "gold", opts: "A) Silver  B) Gold  C) Aluminum  D) Argon" },
  { q: "🦁 What is the fastest land animal?", a: "cheetah", opts: "A) Lion  B) Horse  C) Cheetah  D) Leopard" }
];

const commands = {
  // ── Joke ──
  async joke({ sock, msg, jid }) {
    const joke = jokes[Math.floor(Math.random() * jokes.length)];
    await sock.sendMessage(jid, { text: `😂 *Random Joke*\n\n${joke}` }, { quoted: msg });
  },

  // ── Riddle ──
  async riddle({ sock, msg, jid }) {
    const r = riddles[Math.floor(Math.random() * riddles.length)];
    activeRiddle[jid] = { answer: r.a.toLowerCase(), timeoutId: null };

    await sock.sendMessage(jid, {
      text: `🧩 *RIDDLE TIME!*\n\n${r.q}\n\n_Reply with your answer! You have 30 seconds..._`
    }, { quoted: msg });

    activeRiddle[jid].timeoutId = setTimeout(async () => {
      if (activeRiddle[jid]) {
        await sock.sendMessage(jid, {
          text: `⏰ Time's up! The answer was: *${r.a}*`
        });
        delete activeRiddle[jid];
      }
    }, 30000);
  },

  // ── Check riddle answer ──
  async riddleanswer({ sock, msg, jid, body, settings }) {
    if (!activeRiddle[jid]) {
      return sock.sendMessage(jid, { text: '❌ No active riddle! Start one with *!riddle*' }, { quoted: msg });
    }
    const guess = body.replace(`${settings.prefix}riddleanswer`, '').trim().toLowerCase();
    if (guess === activeRiddle[jid].answer) {
      clearTimeout(activeRiddle[jid].timeoutId);
      delete activeRiddle[jid];
      await sock.sendMessage(jid, {
        text: `🎉 Correct! You got it right!`
      }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, { text: `❌ Wrong answer, try again!` }, { quoted: msg });
    }
  },

  // ── Truth ──
  async truth({ sock, msg, jid }) {
    const t = truths[Math.floor(Math.random() * truths.length)];
    await sock.sendMessage(jid, {
      text: `🤔 *TRUTH*\n\n${t}`
    }, { quoted: msg });
  },

  // ── Dare ──
  async dare({ sock, msg, jid }) {
    const d = dares[Math.floor(Math.random() * dares.length)];
    await sock.sendMessage(jid, {
      text: `🎯 *DARE*\n\n${d}`
    }, { quoted: msg });
  },

  // ── Truth or Dare ──
  async tod({ sock, msg, jid }) {
    const isTruth = Math.random() > 0.5;
    const list = isTruth ? truths : dares;
    const item = list[Math.floor(Math.random() * list.length)];
    await sock.sendMessage(jid, {
      text: `🎲 *${isTruth ? 'TRUTH' : 'DARE'}*\n\n${item}`
    }, { quoted: msg });
  },

  // ── Quiz ──
  async quiz({ sock, msg, jid }) {
    const q = quizQuestions[Math.floor(Math.random() * quizQuestions.length)];
    activeQuiz[jid] = { answer: q.a.toLowerCase(), timeoutId: null };

    await sock.sendMessage(jid, {
      text: `🎯 *QUIZ TIME!*\n\n${q.q}\n\n${q.opts}\n\n_Reply with the letter or full answer! 20 seconds..._`
    }, { quoted: msg });

    activeQuiz[jid].timeoutId = setTimeout(async () => {
      if (activeQuiz[jid]) {
        await sock.sendMessage(jid, {
          text: `⏰ Time's up! The answer was: *${q.a}*`
        });
        delete activeQuiz[jid];
      }
    }, 20000);
  },

  // ── Quiz Answer ──
  async quizanswer({ sock, msg, jid, body, settings }) {
    if (!activeQuiz[jid]) {
      return sock.sendMessage(jid, { text: '❌ No active quiz! Start one with *!quiz*' }, { quoted: msg });
    }
    const guess = body.replace(`${settings.prefix}quizanswer`, '').trim().toLowerCase();
    if (guess === activeQuiz[jid].answer || activeQuiz[jid].answer.includes(guess)) {
      clearTimeout(activeQuiz[jid].timeoutId);
      delete activeQuiz[jid];
      await sock.sendMessage(jid, { text: `🏆 Correct! Congratulations!` }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, { text: `❌ Wrong! Try again...` }, { quoted: msg });
    }
  },

  // ── Math Game ──
  async math({ sock, msg, jid }) {
    const a = Math.floor(Math.random() * 50) + 1;
    const b = Math.floor(Math.random() * 50) + 1;
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let answer;
    if (op === '+') answer = a + b;
    else if (op === '-') answer = a - b;
    else answer = a * b;

    mathGames[jid] = { answer: answer.toString(), timeoutId: null };

    await sock.sendMessage(jid, {
      text: `🔢 *MATH CHALLENGE!*\n\nWhat is: *${a} ${op} ${b}*?\n\nReply with your answer! 15 seconds...`
    }, { quoted: msg });

    mathGames[jid].timeoutId = setTimeout(async () => {
      if (mathGames[jid]) {
        await sock.sendMessage(jid, { text: `⏰ Time's up! Answer: *${answer}*` });
        delete mathGames[jid];
      }
    }, 15000);
  },

  // ── Math Answer ──
  async mathanswer({ sock, msg, jid, body, settings }) {
    if (!mathGames[jid]) {
      return sock.sendMessage(jid, { text: '❌ No active math game! Use *!math* to start.' }, { quoted: msg });
    }
    const guess = body.replace(`${settings.prefix}mathanswer`, '').trim();
    if (guess === mathGames[jid].answer) {
      clearTimeout(mathGames[jid].timeoutId);
      delete mathGames[jid];
      await sock.sendMessage(jid, { text: `🎉 Correct! You're a math genius!` }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, { text: `❌ Wrong answer! Try again...` }, { quoted: msg });
    }
  },

  // ── Flip coin ──
  async flip({ sock, msg, jid }) {
    const result = Math.random() > 0.5 ? '🪙 Heads!' : '🪙 Tails!';
    await sock.sendMessage(jid, { text: result }, { quoted: msg });
  },

  // ── Roll dice ──
  async dice({ sock, msg, jid }) {
    const result = Math.floor(Math.random() * 6) + 1;
    const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    await sock.sendMessage(jid, {
      text: `🎲 You rolled: ${faces[result - 1]} *${result}*`
    }, { quoted: msg });
  },

  // ── 8ball ──
  async '8ball'({ sock, msg, jid, args }) {
    const responses = [
      '✅ Yes, definitely!', '✅ It is certain.', '✅ Without a doubt.',
      '🤔 Ask again later.', '🤔 Cannot predict now.', '🤔 Concentrate and ask again.',
      '❌ My reply is no.', '❌ Outlook not so good.', '❌ Very doubtful.'
    ];
    if (!args.length) {
      return sock.sendMessage(jid, { text: '❓ Ask me a question! Example: *!8ball Will I be rich?*' }, { quoted: msg });
    }
    const response = responses[Math.floor(Math.random() * responses.length)];
    await sock.sendMessage(jid, {
      text: `🎱 *8-Ball*\n\nQuestion: _${args.join(' ')}_\nAnswer: *${response}*`
    }, { quoted: msg });
  },

  // ── Help ──
  async help({ sock, msg, jid, settings }) {
    const p = settings.prefix || '!';
    const helpText = `╔══════════════════════════╗
║    🤖 BOT COMMANDS       ║
╚══════════════════════════╝

🎮 *FUN COMMANDS*
${p}joke — Random joke
${p}riddle — Riddle game
${p}quiz — Quiz game
${p}math — Math challenge
${p}tod — Truth or Dare
${p}truth — Random truth
${p}dare — Random dare
${p}flip — Flip a coin
${p}dice — Roll a dice
${p}8ball — Magic 8-ball

👑 *ADMIN COMMANDS*
${p}kick @user — Kick member
${p}promote @user — Promote to admin
${p}demote @user — Demote admin
${p}mute — Mute group
${p}unmute — Unmute group
${p}tagall — Tag everyone
${p}ban @user — Ban user
${p}warn @user — Warn user
${p}groupinfo — Group information

🤖 *AI COMMANDS*
${p}ai [text] — Chat with AI
${p}imagine [prompt] — Generate image
${p}translate [lang] [text] — Translate
${p}story [prompt] — AI story
${p}code [question] — Code helper

🖼️ *MEDIA TOOLS*
${p}sticker — Make sticker from image
${p}tts [text] — Text to speech

📊 *SYSTEM*
${p}xp — Check your XP
${p}leaderboard — Group XP leaderboard
${p}help — Show this menu

_Prefix: ${p}_`;

    await sock.sendMessage(jid, { text: helpText }, { quoted: msg });
  }
};

// Export active game state for message handler hook
module.exports = { commands, activeQuiz, activeRiddle, mathGames };
