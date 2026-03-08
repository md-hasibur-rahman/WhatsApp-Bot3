// utils/groupManager.js — Group Management Helpers

async function isAdmin(sock, jid, userId) {
  try {
    const meta = await sock.groupMetadata(jid);
    const participant = meta.participants.find(p => p.id === userId);
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
  } catch {
    return false;
  }
}

async function isBotAdmin(sock, jid) {
  try {
    const botId = sock.user?.id;
    return await isAdmin(sock, jid, botId);
  } catch {
    return false;
  }
}

async function getAdmins(sock, jid) {
  try {
    const meta = await sock.groupMetadata(jid);
    return meta.participants
      .filter(p => p.admin)
      .map(p => p.id);
  } catch {
    return [];
  }
}

async function getMembers(sock, jid) {
  try {
    const meta = await sock.groupMetadata(jid);
    return meta.participants.map(p => p.id);
  } catch {
    return [];
  }
}

module.exports = { isAdmin, isBotAdmin, getAdmins, getMembers };
