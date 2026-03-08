// utils/xpSystem.js — XP, Level & Economy System
const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, '..', 'data', 'xpData.json');

let xpData = {};
try {
  if (fs.existsSync(dataFile)) xpData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
} catch { xpData = {}; }

function saveXP() {
  fs.writeFileSync(dataFile, JSON.stringify(xpData, null, 2));
}

function levelFromXP(xp) {
  return Math.floor(Math.sqrt(xp / 100));
}

function xpForLevel(level) {
  return level * level * 100;
}

function addXP(userId, groupId, amount = 1) {
  const key = `${groupId}::${userId}`;
  if (!xpData[key]) xpData[key] = { xp: 0, coins: 0, userId, groupId };
  xpData[key].xp += amount;
  xpData[key].coins = (xpData[key].coins || 0) + 1;
  saveXP();

  const newLevel = levelFromXP(xpData[key].xp);
  const oldLevel = levelFromXP(xpData[key].xp - amount);
  return { levelUp: newLevel > oldLevel, newLevel, xp: xpData[key].xp };
}

function getUserXP(userId, groupId) {
  const key = `${groupId}::${userId}`;
  const data = xpData[key] || { xp: 0, coins: 0 };
  const level = levelFromXP(data.xp);
  const nextLevel = xpForLevel(level + 1) - data.xp;
  return { xp: data.xp, level, nextLevel, coins: data.coins || 0 };
}

function getLeaderboard(groupId) {
  return Object.entries(xpData)
    .filter(([key]) => key.startsWith(groupId))
    .map(([key, data]) => ({
      id: data.userId,
      xp: data.xp,
      level: levelFromXP(data.xp),
      coins: data.coins || 0
    }))
    .sort((a, b) => b.xp - a.xp);
}

function addCoins(userId, groupId, amount) {
  const key = `${groupId}::${userId}`;
  if (!xpData[key]) xpData[key] = { xp: 0, coins: 0, userId, groupId };
  xpData[key].coins = (xpData[key].coins || 0) + amount;
  saveXP();
  return xpData[key].coins;
}

module.exports = { addXP, getUserXP, getLeaderboard, addCoins, levelFromXP };
