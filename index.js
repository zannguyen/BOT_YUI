require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { Player } = require("discord-player");
const { DefaultExtractors } = require("@discord-player/extractor");
const http = require("http");

// Giữ bot sống trên Render
http
  .createServer((req, res) => {
    res.write("Bot đang chạy!");
    res.end();
  })
  .listen(3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const player = new Player(client);

player.events.on("playerStart", (queue, track) => {
  queue.metadata.channel.send(
    `▶️ Đang phát: **${track.title}** - ${track.author}`,
  );
});

player.events.on("audioTrackAdd", (queue, track) => {
  queue.metadata.channel.send(`📋 Đã thêm vào hàng chờ: **${track.title}**`);
});

player.events.on("emptyQueue", (queue) => {
  queue.metadata.channel.send("✅ Hết nhạc trong hàng chờ!");
});

player.events.on("error", (queue, error) => {
  queue.metadata.channel.send(`❌ Lỗi: ${error.message}`);
});

client.on("clientReady", async () => {
  await player.extractors.loadMulti(DefaultExtractors);
  console.log(`✅ Bot đã online: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("yui!") || message.author.bot) return;

  const args = message.content.slice(4).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // LỆNH PLAY
  if (command === "play") {
    const query = args.join(" ");
    if (!query)
      return message.reply("❌ Nhập tên bài hoặc URL! VD: `yui!play Bảo Anh`");

    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) return message.reply("❌ Bạn cần vào kênh voice trước!");

    try {
      const { track } = await player.play(voiceChannel, query, {
        nodeOptions: {
          metadata: { channel: message.channel },
        },
      });
      message.reply(`🔍 Đang tìm: **${query}**`);
    } catch (err) {
      message.reply(`❌ Lỗi: ${err.message}`);
    }
  }

  // LỆNH SKIP
  if (command === "skip") {
    const queue = player.nodes.get(message.guild.id);
    if (!queue) return message.reply("❌ Không có nhạc đang phát!");
    queue.node.skip();
    message.reply("⏭️ Đã skip!");
  }

  // LỆNH STOP
  if (command === "stop") {
    const queue = player.nodes.get(message.guild.id);
    if (!queue) return message.reply("❌ Không có nhạc đang phát!");
    queue.delete();
    message.reply("⏹️ Đã dừng nhạc!");
  }

  // LỆNH QUEUE
  if (command === "queue") {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || queue.tracks.size === 0)
      return message.reply("📋 Hàng chờ trống!");
    const tracks = queue.tracks
      .toArray()
      .map((t, i) => `${i + 1}. **${t.title}**`)
      .join("\n");
    message.reply(`📋 **Hàng chờ:**\n${tracks}`);
  }

  // LỆNH PAUSE
  if (command === "pause") {
    const queue = player.nodes.get(message.guild.id);
    if (!queue) return message.reply("❌ Không có nhạc đang phát!");
    queue.node.pause();
    message.reply("⏸️ Đã tạm dừng!");
  }

  // LỆNH RESUME
  if (command === "resume") {
    const queue = player.nodes.get(message.guild.id);
    if (!queue) return message.reply("❌ Không có nhạc!");
    queue.node.resume();
    message.reply("▶️ Tiếp tục phát!");
  }

  // LỆNH LEAVE
  if (command === "leave") {
    const queue = player.nodes.get(message.guild.id);
    if (queue) queue.delete();
    message.reply("👋 Đã rời kênh!");
  }

  // LỆNH HELP
  if (command === "ngu") {
    message.reply(`
🎵 **Danh sách lệnh:**
\`yui!play <tên/url>\` - Phát nhạc (hỗ trợ tên bài luôn!)
\`yui!skip\` - Chuyển bài
\`yui!pause\` - Tạm dừng
\`yui!resume\` - Tiếp tục
\`yui!queue\` - Xem hàng chờ
\`yui!stop\` - Dừng nhạc
\`yui!leave\` - Rời kênh
    `);
  }
});

client.login(process.env.TOKEN);
