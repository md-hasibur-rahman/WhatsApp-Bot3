// commands/admin.js — Admin & Group Management Commands

const groupManager = require('../utils/groupManager');

async function isGroupAdmin(sock, jid, sender) {
  return await groupManager.isAdmin(sock, jid, sender);
}

const commands = {
  // ── Kick member ──
  async kick({ sock, msg, jid, sender, isGroup, settings }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only command.' }, { quoted: msg });
    if (!await isGroupAdmin(sock, jid, sender)) {
      return sock.sendMessage(jid, { text: '❌ You need to be an admin to use this command.' }, { quoted: msg });
    }
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
      msg.message?.extendedTextMessage?.contextInfo?.participant ? [msg.message.extendedTextMessage.contextInfo.participant] : [];

    if (!mentioned.length) {
      return sock.sendMessage(jid, { text: '❌ Tag someone to kick! Example: *!kick @user*' }, { quoted: msg });
    }
    for (const user of mentioned) {
      await sock.groupParticipantsUpdate(jid, [user], 'remove');
      await sock.sendMessage(jid, {
        text: `🦵 @${user.split('@')[0]} has been kicked!`,
        mentions: [user]
      });
    }
  },

  // ── Ban user ──
  async ban({ sock, msg, jid, sender, isGroup, groupSettings, saveSettings }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only command.' }, { quoted: msg });
    if (!await isGroupAdmin(sock, jid, sender)) {
      return sock.sendMessage(jid, { text: '❌ Admins only!' }, { quoted: msg });
    }
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned.length) {
      return sock.sendMessage(jid, { text: '❌ Tag someone to ban!' }, { quoted: msg });
    }
    const settings = groupSettings[jid] || {};
    if (!settings.bannedUsers) settings.bannedUsers = [];

    for (const user of mentioned) {
      if (!settings.bannedUsers.includes(user)) settings.bannedUsers.push(user);
      await sock.groupParticipantsUpdate(jid, [user], 'remove');
      await sock.sendMessage(jid, {
        text: `🔨 @${user.split('@')[0]} has been *banned* from this group!`,
        mentions: [user]
      });
    }
    groupSettings[jid] = settings;
    saveSettings();
  },

  // ── Promote ──
  async promote({ sock, msg, jid, sender, isGroup }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only command.' }, { quoted: msg });
    if (!await isGroupAdmin(sock, jid, sender)) {
      return sock.sendMessage(jid, { text: '❌ Admins only!' }, { quoted: msg });
    }
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned.length) return sock.sendMessage(jid, { text: '❌ Tag someone to promote!' }, { quoted: msg });

    for (const user of mentioned) {
      await sock.groupParticipantsUpdate(jid, [user], 'promote');
      await sock.sendMessage(jid, {
        text: `⬆️ @${user.split('@')[0]} has been promoted to admin! 👑`,
        mentions: [user]
      });
    }
  },

  // ── Demote ──
  async demote({ sock, msg, jid, sender, isGroup }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only command.' }, { quoted: msg });
    if (!await isGroupAdmin(sock, jid, sender)) {
      return sock.sendMessage(jid, { text: '❌ Admins only!' }, { quoted: msg });
    }
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned.length) return sock.sendMessage(jid, { text: '❌ Tag someone to demote!' }, { quoted: msg });

    for (const user of mentioned) {
      await sock.groupParticipantsUpdate(jid, [user], 'demote');
      await sock.sendMessage(jid, {
        text: `⬇️ @${user.split('@')[0]} has been demoted.`,
        mentions: [user]
      });
    }
  },

  // ── Mute ──
  async mute({ sock, msg, jid, sender, isGroup, groupSettings, saveSettings }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only!' }, { quoted: msg });
    if (!await isGroupAdmin(sock, jid, sender)) {
      return sock.sendMessage(jid, { text: '❌ Admins only!' }, { quoted: msg });
    }
    await sock.groupSettingUpdate(jid, 'announcement');
    if (groupSettings[jid]) { groupSettings[jid].muted = true; saveSettings(); }
    await sock.sendMessage(jid, { text: '🔇 Group has been *muted*. Only admins can send messages.' });
  },

  // ── Unmute ──
  async unmute({ sock, msg, jid, sender, isGroup, groupSettings, saveSettings }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only!' }, { quoted: msg });
    if (!await isGroupAdmin(sock, jid, sender)) {
      return sock.sendMessage(jid, { text: '❌ Admins only!' }, { quoted: msg });
    }
    await sock.groupSettingUpdate(jid, 'not_announcement');
    if (groupSettings[jid]) { groupSettings[jid].muted = false; saveSettings(); }
    await sock.sendMessage(jid, { text: '🔊 Group has been *unmuted*. Everyone can send messages.' });
  },

  // ── Tag All ──
  async tagall({ sock, msg, jid, sender, isGroup, args }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only!' }, { quoted: msg });
    if (!await isGroupAdmin(sock, jid, sender)) {
      return sock.sendMessage(jid, { text: '❌ Admins only!' }, { quoted: msg });
    }
    const meta = await sock.groupMetadata(jid);
    const members = meta.participants.map(p => p.id);
    const customMsg = args.join(' ') || 'Attention everyone!';
    const mentionText = members.map(m => `@${m.split('@')[0]}`).join(' ');

    await sock.sendMessage(jid, {
      text: `📢 *${customMsg}*\n\n${mentionText}`,
      mentions: members
    });
  },

  // ── Warn user ──
  async warn({ sock, msg, jid, sender, isGroup, settings, groupSettings, saveSettings }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only!' }, { quoted: msg });
    if (!await isGroupAdmin(sock, jid, sender)) {
      return sock.sendMessage(jid, { text: '❌ Admins only!' }, { quoted: msg });
    }
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned.length) return sock.sendMessage(jid, { text: '❌ Tag someone to warn!' }, { quoted: msg });

    const s = groupSettings[jid] || settings;
    if (!s.warnCount) s.warnCount = {};
    const maxWarns = s.maxWarns || 3;

    for (const user of mentioned) {
      s.warnCount[user] = (s.warnCount[user] || 0) + 1;
      const count = s.warnCount[user];

      await sock.sendMessage(jid, {
        text: `⚠️ @${user.split('@')[0]} has been warned!\nWarnings: ${count}/${maxWarns}`,
        mentions: [user]
      });

      if (count >= maxWarns) {
        await sock.groupParticipantsUpdate(jid, [user], 'remove');
        await sock.sendMessage(jid, {
          text: `🔨 @${user.split('@')[0]} has been *kicked* after ${maxWarns} warnings!`,
          mentions: [user]
        });
        s.warnCount[user] = 0;
      }
    }
    groupSettings[jid] = { ...(groupSettings[jid] || {}), ...s };
    saveSettings();
  },

  // ── Warnings ──
  async warnings({ sock, msg, jid, isGroup, settings, groupSettings }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only!' }, { quoted: msg });
    const s = groupSettings[jid] || settings;
    const warnList = Object.entries(s.warnCount || {});
    if (!warnList.length) {
      return sock.sendMessage(jid, { text: '✅ No warnings in this group!' }, { quoted: msg });
    }
    const list = warnList.map(([u, c]) => `• @${u.split('@')[0]}: ${c} warning(s)`).join('\n');
    await sock.sendMessage(jid, {
      text: `⚠️ *Warning List*\n\n${list}`,
      mentions: warnList.map(([u]) => u)
    });
  },

  // ── Group info ──
  async groupinfo({ sock, msg, jid, isGroup }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only!' }, { quoted: msg });
    const meta = await sock.groupMetadata(jid);
    const admins = meta.participants.filter(p => p.admin).map(p => `• @${p.id.split('@')[0]}`).join('\n');
    const info = `╔══════════════════════════╗
║     📊 GROUP INFO        ║
╚══════════════════════════╝

📌 *Name:* ${meta.subject}
👥 *Members:* ${meta.participants.length}
📝 *Description:* ${meta.desc || 'None'}
🔒 *Restrict:* ${meta.restrict ? 'Yes' : 'No'}
📣 *Announce:* ${meta.announce ? 'Yes' : 'No'}
📅 *Created:* ${new Date(meta.creation * 1000).toLocaleDateString()}

👑 *Admins:*
${admins || 'None'}`;

    await sock.sendMessage(jid, {
      text: info,
      mentions: meta.participants.filter(p => p.admin).map(p => p.id)
    });
  },

  // ── Change group name ──
  async setname({ sock, msg, jid, sender, isGroup, args }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only!' }, { quoted: msg });
    if (!await isGroupAdmin(sock, jid, sender)) {
      return sock.sendMessage(jid, { text: '❌ Admins only!' }, { quoted: msg });
    }
    const newName = args.join(' ');
    if (!newName) return sock.sendMessage(jid, { text: '❌ Provide a name: *!setname New Name*' }, { quoted: msg });
    await sock.groupUpdateSubject(jid, newName);
    await sock.sendMessage(jid, { text: `✅ Group name changed to: *${newName}*` });
  },

  // ── Change group desc ──
  async setdesc({ sock, msg, jid, sender, isGroup, args }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only!' }, { quoted: msg });
    if (!await isGroupAdmin(sock, jid, sender)) {
      return sock.sendMessage(jid, { text: '❌ Admins only!' }, { quoted: msg });
    }
    const newDesc = args.join(' ');
    if (!newDesc) return sock.sendMessage(jid, { text: '❌ Provide a description!' }, { quoted: msg });
    await sock.groupUpdateDescription(jid, newDesc);
    await sock.sendMessage(jid, { text: `✅ Group description updated!` });
  },

  // ── Invite link ──
  async invitelink({ sock, msg, jid, sender, isGroup }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only!' }, { quoted: msg });
    if (!await isGroupAdmin(sock, jid, sender)) {
      return sock.sendMessage(jid, { text: '❌ Admins only!' }, { quoted: msg });
    }
    const code = await sock.groupInviteCode(jid);
    await sock.sendMessage(jid, {
      text: `🔗 *Group Invite Link:*\nhttps://chat.whatsapp.com/${code}`
    }, { quoted: msg });
  },

  // ── Setwelcome ──
  async setwelcome({ sock, msg, jid, sender, isGroup, args, groupSettings, saveSettings }) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only!' }, { quoted: msg });
    if (!await isGroupAdmin(sock, jid, sender)) {
      return sock.sendMessage(jid, { text: '❌ Admins only!' }, { quoted: msg });
    }
    const welcomeMsg = args.join(' ') || 'Welcome to the group, @user! 👋';
    if (!groupSettings[jid]) groupSettings[jid] = {};
    groupSettings[jid].welcomeMsg = welcomeMsg;
    groupSettings[jid].welcome = true;
    saveSettings();
    await sock.sendMessage(jid, {
      text: `✅ Welcome message set!\n\n_${welcomeMsg}_\n\n_Use @user as placeholder for the new member's name._`
    }, { quoted: msg });
  }
};

module.exports = { commands };
