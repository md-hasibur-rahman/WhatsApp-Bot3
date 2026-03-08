// utils/messageFilter.js — Link & Bad Word Detection

const LINK_PATTERNS = [
  /https?:\/\//i,
  /chat\.whatsapp\.com/i,
  /t\.me\//i,
  /bit\.ly\//i,
  /tinyurl\.com/i,
  /wa\.me\//i,
  /\bwww\.\S+\.\S+/i
];

const DEFAULT_BAD_WORDS = [
  'spam', 'scam', 'hack', 'cheat', 'fraud', 'porn', 'xxx', 'adult', 'drugs', 'nsfw'
];

function checkLinks(text) {
  if (!text) return false;
  return LINK_PATTERNS.some(pattern => pattern.test(text));
}

function checkBadWords(text, customBadWords = []) {
  if (!text) return false;
  const badWords = [...DEFAULT_BAD_WORDS, ...customBadWords];
  const lower = text.toLowerCase();
  return badWords.some(word => lower.includes(word.toLowerCase()));
}

function containsInviteLink(text) {
  if (!text) return false;
  return /chat\.whatsapp\.com\/[a-zA-Z0-9]+/.test(text);
}

function isFakeNumber(jid) {
  const num = jid?.split('@')[0];
  if (!num) return false;
  // Very short numbers or obvious test numbers
  if (num.length < 7) return true;
  if (/^0+$/.test(num)) return true;
  if (/^1234567/.test(num)) return true;
  return false;
}

function extractLinks(text) {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

module.exports = { checkLinks, checkBadWords, containsInviteLink, isFakeNumber, extractLinks };
