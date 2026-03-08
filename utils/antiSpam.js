// utils/antiSpam.js — Anti-Spam System

const spamMap = new Map(); // { "user@jid": { count, lastTime, timestamps } }

const SPAM_THRESHOLD = 5;        // messages
const SPAM_WINDOW_MS = 5000;     // within 5 seconds
const RESET_AFTER_MS = 30000;    // reset after 30s of inactivity

function check(sender, groupId) {
  const key = `${sender}::${groupId}`;
  const now = Date.now();

  if (!spamMap.has(key)) {
    spamMap.set(key, { count: 1, timestamps: [now] });
    return { isSpam: false, count: 0 };
  }

  const data = spamMap.get(key);

  // Clean old timestamps outside the window
  data.timestamps = data.timestamps.filter(t => now - t < SPAM_WINDOW_MS);
  data.timestamps.push(now);
  data.count = data.timestamps.length;

  // Auto-reset after inactivity
  if (data.timestamps.length > 0 && now - data.timestamps[0] > RESET_AFTER_MS) {
    spamMap.set(key, { count: 1, timestamps: [now] });
    return { isSpam: false, count: 0 };
  }

  spamMap.set(key, data);

  if (data.count >= SPAM_THRESHOLD) {
    return { isSpam: true, count: data.count };
  }

  return { isSpam: false, count: data.count };
}

function reset(sender, groupId) {
  spamMap.delete(`${sender}::${groupId}`);
}

function getCount(sender, groupId) {
  const key = `${sender}::${groupId}`;
  return spamMap.get(key)?.count || 0;
}

module.exports = { check, reset, getCount };
