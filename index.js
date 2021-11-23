const { Client, MessageEmbed } = require("discord.js");
const fs = require("fs");
const ms = require("ms");
const { Player, QueueRepeatMode } = require("discord-player");

const bot = new Client({
  intents: [
    "DIRECT_MESSAGES",
    "GUILD_MESSAGES",
    "GUILDS",
    "GUILD_BANS",
    "GUILD_MEMBERS",
    "GUILD_VOICE_STATES",
  ],
});
let delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

var thresholdData = {};
const config = require("./config.json");

bot.on("ready", async function () {
  console.log("Bot Is Ready");
  bot.user.setActivity(config.general.activity, {
    type: config.general.activity_type,
  });
});
function embed(message) {
  return new MessageEmbed().setDescription(`**${message}**`).setColor("RANDOM");
}
const player = new Player(bot);

player.on("trackStart", (queue, track) =>
  queue.metadata.channel.send(
    config.messages.nowplaying.replace("%song%", track.title)
  )
);

setInterval(() => {
  thresholdData = {};
}, 1000 * 60 * config.general.threshold_period_in_minutes);

function ensureExecuter(banner) {
  if (!thresholdData[banner])
    thresholdData[banner] = {
      ban: {
        threshold: 0,
        users: [],
      },
      removechannels: {
        threshold: 0,
        users: [],
      },
      createchannels: {
        threshold: 0,
        users: [],
      },
    };
  return thresholdData[banner];
}

bot.on("guildBanAdd", async function (ban) {
  var auditLog = (
    await ban.guild.fetchAuditLogs({
      limit: 1,
      type: "MEMBER_BAN_ADD",
    })
  ).entries.first();
  if (auditLog.target.id === ban.user.id) {
    let banner = auditLog.executor;
    let data = ensureExecuter(banner.id);
    await delay(500);
    let execMember = await ban.guild.members.fetch(banner.id);
    data.ban.threshold++;
    data.ban.users.push(auditLog.target.id);
    let owner = await ban.guild.fetchOwner();
    try {
      await delay(500);
      owner.send(
        config.messages.banned
          .replace("%exec%", banner.tag)
          .replace("%member%", ban.user.tag)
          .replace("%num%", data.ban.threshold)
      );
    } catch {}
    if (data.ban.threshold >= config.general.ban_threshold) {
      execMember.roles.cache.forEach((role) => {
        if (role.name == "@everyone") return;
        delay(2000).then(function () {
          execMember.roles.remove(role);
        });
      });
      owner.send(
        config.messages.threshold_reached
          .replace("%exec%", banner.tag)
          .replace("%type%", "bans")
      );
    }
  }
});
bot.on("channelCreate", async function (channel) {
  var auditLog = (
    await channel.guild.fetchAuditLogs({
      limit: 1,
      type: "CHANNEL_CREATE",
    })
  ).entries.first();
  if (auditLog.target.id === channel.id) {
    let banner = auditLog.executor;
    let data = ensureExecuter(banner.id);
    await delay(500);
    let execMember = await channel.guild.members.fetch(banner.id);
    data.createchannels.threshold++;
    data.createchannels.users.push(auditLog.target.id);
    let owner = await channel.guild.fetchOwner();
    try {
      await delay(500);
      owner.send(
        config.messages.channelcreated
          .replace("%exec%", banner.tag)
          .replace("%name%", channel.name)
          .replace("%num%", data.createchannels.threshold)
      );
    } catch {}
    if (
      data.createchannels.threshold >= config.general.add_channels_threshold
    ) {
      execMember.roles.cache.forEach((role) => {
        if (role.name == "@everyone") return;
        delay(2000).then(function () {
          execMember.roles.remove(role);
        });
      });
      owner.send(
        config.messages.threshold_reached
          .replace("%exec%", banner.tag)
          .replace("%type%", "channel creation")
      );
    }
  }
});
bot.on("channelDelete", async function (channel) {
  var auditLog = (
    await channel.guild.fetchAuditLogs({
      limit: 1,
      type: "CHANNEL_DELETE",
    })
  ).entries.first();
  if (auditLog.target.id === channel.id) {
    let banner = auditLog.executor;
    let data = ensureExecuter(banner.id);
    await delay(500);
    let execMember = await channel.guild.members.fetch(banner.id);
    data.removechannels.threshold++;
    data.removechannels.users.push(auditLog.target.id);
    let owner = await channel.guild.fetchOwner();
    try {
      await delay(500);
      owner.send(
        config.messages.channelremoved
          .replace("%exec%", banner.tag)
          .replace("%name%", channel.name)
          .replace("%num%", data.removechannels.threshold)
      );
    } catch {}
    if (
      data.removechannels.threshold >= config.general.delete_channels_threshold
    ) {
      execMember.roles.cache.forEach((role) => {
        if (role.name == "@everyone") return;
        delay(2000).then(function () {
          execMember.roles.remove(role);
        });
      });
      owner.send(
        config.messages.threshold_reached
          .replace("%exec%", banner.tag)
          .replace("%type%", "channel deletion")
      );
    }
  }
});

bot.on("messageCreate", async function (message) {
  if (
    !message.content.toLowerCase().startsWith(config.general.prefix) ||
    message.author.bot ||
    message.channel.type == "dm" ||
    message.guild == null
  )
    return;
  let messageArray = message.content.toLowerCase().split(" ");
  let cmd = messageArray[0].slice(config.general.prefix.length);
  let args = messageArray.slice(1);
  if (cmd === "play") {
    let music = args.join(" ");
    if (!music)
      return message.channel.send(
        config.messages.playusage.replace("%cmd%", config.general.prefix + cmd)
      );
    if (!message.member.voice || !message.member.voice.channel)
      return message.channel.send(config.messages.user_not_in_vc);
    const voiceChannel = message.member.voice.channel;
    const queue = player.getQueue(message.guild.id);
    if (!queue) {
      const queue = player.createQueue(message.guild, {
        metadata: {
          channel: message.channel,
        },
      });
      try {
        if (!queue.connection) await queue.connect(voiceChannel);
      } catch {
        queue.destroy();
        return await message.channel.send("Could not join your voice channel!");
      }
      const track = await player
        .search(music, {
          requestedBy: message.author,
        })
        .then((x) => x.tracks[0]);
      if (!track)
        return await message.channel.send(`❌ | Track **${music}** not found!`);

      queue.play(track);
      message.channel.send(
        config.messages.playing.replace("%song%", track.title)
      );
    } else {
      const track = await player
        .search(music, {
          requestedBy: message.author,
        })
        .then((x) => x.tracks[0]);
      if (!track)
        return await message.channel.send(`❌ | Track **${music}** not found!`);

      queue.addTrack(track);
      message.channel.send(
        config.messages.added_to_queue.replace("%song%", track.title)
      );
    }
  } else if (cmd === "queue") {
    const queue = player.getQueue(message.guild.id);
    if (!queue) return message.channel.send(config.messages.no_music_playing);
    let shownQueue = queue.tracks;
    await message.channel.send(
      shownQueue
        .map(
          (x, index) =>
            `${index + 1}. ${x.title} | Requested By: ${x.requestedBy.tag}`
        )
        .join("\n") || queue.nowPlaying().title
    );
  } else if (cmd === "skip") {
    const queue = player.getQueue(message.guild.id);
    if (!queue) return message.channel.send(config.messages.no_music_playing);
    queue.skip();
    message.channel.send(config.messages.skipped);
  } else if (cmd === "volume") {
    let newVol = args[0];
    if (!newVol || isNaN(newVol))
      return message.channel.send(
        config.messages.volusage.replace("%vol%", newVol)
      );
    const queue = player.getQueue(message.guild.id);
    if (!queue) return message.channel.send(config.messages.no_music_playing);
    queue.setVolume(parseInt(newVol));
    message.channel.send(config.messages.volume.replace("%vol%", newVol));
  } else if (cmd === "seek") {
    let seekpoint = args[0];
    if (!seekpoint || isNaN(seekpoint))
      return message.channel.send(config.messages.volusage);
    const queue = player.getQueue(message.guild.id);
    if (!queue) return message.channel.send(config.messages.no_music_playing);
    queue.seek(parseInt(seekpoint) * 1000);
    message.channel.send(config.messages.seek.replace("%point%", seekpoint));
  } else if (cmd === "leave") {
    const queue = player.getQueue(message.guild.id);
    if (!queue) return message.channel.send(config.messages.no_music_playing);
    queue.stop();
    message.channel.send(config.messages.left);
  } else if (cmd === "shuffle") {
    const queue = player.getQueue(message.guild.id);
    if (!queue) return message.channel.send(config.messages.no_music_playing);
    queue.shuffle();
    message.channel.send(config.messages.shuffled);
  } else if (cmd === "pause") {
    const queue = player.getQueue(message.guild.id);
    if (!queue) return message.channel.send(config.messages.no_music_playing);
    queue.setPaused(true);
    message.channel.send(config.messages.paused);
  } else if (cmd === "resume") {
    const queue = player.getQueue(message.guild.id);
    if (!queue) return message.channel.send(config.messages.no_music_playing);
    queue.setPaused(false);
    message.channel.send(config.messages.resumed);
  } else if (cmd == "nowplaying") {
    const queue = player.getQueue(message.guild.id);
    if (!queue) return message.channel.send(config.messages.no_music_playing);
    let shownQueue = queue.nowPlaying();
    message.channel.send(
      config.messages.nowplaying.replace("%song%", shownQueue.title)
    );
  } else if (cmd == "loop") {
    const queue = player.getQueue(message.guild.id);
    if (!queue) return message.channel.send(config.messages.no_music_playing);
    queue.setRepeatMode(
      queue.repeatMode == QueueRepeatMode.TRACK
        ? QueueRepeatMode.OFF
        : QueueRepeatMode.TRACK
    );
    message.channel.send(config.messages.loop);
  } else if (cmd == "loopqueue") {
    const queue = player.getQueue(message.guild.id);
    if (!queue) return message.channel.send(config.messages.no_music_playing);
    queue.setRepeatMode(
      queue.repeatMode == QueueRepeatMode.QUEUE
        ? QueueRepeatMode.OFF
        : QueueRepeatMode.QUEUE
    );
    message.channel.send(config.messages.loopqueue);
  }
  if (cmd == "kick") {
    if (!message.member.permissions.has("KICK_MEMBERS"))
      return message.channel.send(
        "You don't have permissions to that command."
      );
    let member =
      message.mentions.members.first() ||
      (args[0]
        ? message.guild.members.cache.find(
            (x) =>
              x.id == args.join(" ") ||
              x.user.username.toLowerCase() == args.join(" ").toLowerCase()
          )
        : null);
    if (!member)
      return message.channel.send(
        `Usage: ${config.general.prefix}kick <Member>`
      );
    member.kick();
    message.channel.send(
      `Kicked the member [**${member.user.username}**] Successfully!`
    );
  }
  if (cmd == "ban") {
    if (!message.member.permissions.has("BAN_MEMBERS"))
      return message.channel.send(
        "You don't have permissions to that command."
      );
    let member =
      message.mentions.members.first() ||
      (args[0]
        ? message.guild.members.cache.find(
            (x) =>
              x.id == args.join(" ") ||
              x.user.username.toLowerCase() == args.join(" ").toLowerCase()
          )
        : null);
    if (!member)
      return message.channel.send(
        `Usage: ${config.general.prefix}ban <Member>`
      );
    member.ban();
    message.channel.send(
      `Banned the member [**${member.user.username}**] Successfully!`
    );
  }
  if (cmd == "mute") {
    if (!message.member.permissions.has("MANAGE_ROLES"))
      return message.channel.send(embed(config.messages.noperms_message));
    let member =
      message.mentions.members.first() ||
      message.guild.members.cache.get(args[0]) ||
      message.guild.members.cache.find(
        (x) => x.user.username.toLowerCase() == args[0]
      );
    if (!member)
      return message.channel.send(embed(config.messages.mute_nomember_error));
    let role = message.guild.roles.cache.find(
      (r) => r.name.toLowerCase() == "muted"
    );
    if (!role)
      role = await message.guild.roles.create({
        name: "muted",
        permissions: [],
      });
    message.guild.channels.cache.forEach(async (channel) => {
      await channel.permissionOverwrites.edit(role, {
        SEND_MESSAGES: false,
        ADD_REACTIONS: false,
        SEND_TTS_MESSAGES: false,
        ATTACH_FILES: false,
        SPEAK: false,
      });
    });
    member.roles.add(role.id);
    var time = args[1];
    if (time && ms(time)) {
      message.channel.send({
        embeds: [
          embed(
            config.messages.temp_mute_message
              .replace("@member", member)
              .replace("@time", time)
          ),
        ],
      });
      setTimeout(function () {
        member.roles.remove(role.id);
      }, ms(time));
    } else {
      message.channel.send({
        embeds: [
          embed(config.messages.mute_message.replace("@member", member)),
        ],
      });
    }
  }
});
bot.login(config.credentials.token);
process.on("uncaughtException", function (err) {
  console.log(err);
});
process.on("unhandledRejection", (error) => {
  console.log(error);
});
