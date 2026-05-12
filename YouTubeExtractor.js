const { BaseExtractor, Track, QueryType, Util } = require("discord-player");
const playdl = require("play-dl");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

// Tìm yt-dlp binary — ưu tiên system path, fallback về npm package
function getYtDlpPath() {
  const npmBin = require("path").join(
    __dirname,
    "node_modules/youtube-dl-exec/bin/yt-dlp"
  );
  // Trên Linux (Render) thử /usr/local/bin/yt-dlp trước
  return process.platform === "win32" ? npmBin + ".exe" : "/usr/local/bin/yt-dlp";
}

async function getBestAudioUrl(videoUrl) {
  const bin = getYtDlpPath();
  const { stdout } = await execFileAsync(bin, [
    videoUrl,
    "--dump-json",
    "--no-warnings",
    "--format", "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio",
    "--youtube-skip-dash-manifest",
  ]);
  const info = JSON.parse(stdout);
  const audioFormats = info.formats.filter(
    (f) => f.acodec !== "none" && f.vcodec === "none" && f.url,
  );
  audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));
  return audioFormats[0]?.url || null;
}

class YouTubeExtractor extends BaseExtractor {
  static identifier = "com.yui.youtubeextractor";

  async activate() {
    this.protocols = ["ytsearch", "youtube"];
  }

  async deactivate() {
    this.protocols = [];
  }

  _isYouTubeURL(query) {
    return /youtu\.be\/|youtube\.com\/(watch|shorts|embed)/.test(query);
  }

  _normalizeURL(query) {
    const shortMatch = query.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) return `https://www.youtube.com/watch?v=${shortMatch[1]}`;
    try {
      const u = new URL(query);
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/watch?v=${v}`;
    } catch {}
    return query;
  }

  async validate(query, type) {
    if (typeof query !== "string") return false;
    if (this._isYouTubeURL(query)) return true;
    return [
      QueryType.YOUTUBE,
      QueryType.YOUTUBE_PLAYLIST,
      QueryType.YOUTUBE_SEARCH,
      QueryType.YOUTUBE_VIDEO,
      QueryType.AUTO,
      QueryType.AUTO_SEARCH,
    ].includes(type);
  }

  async handle(query, context) {
    query = this._normalizeURL(query);

    // Direct YouTube URL — build track ngay không cần fetch info
    if (this._isYouTubeURL(query) || playdl.yt_validate(query) === "video") {
      return this.createResponse(null, [
        this._buildTrack({
          title: query,
          url: query,
          author: "YouTube",
          durationMs: 0,
          thumbnail: "",
        }, context),
      ]);
    }

    // Tìm kiếm theo tên bài
    const results = await playdl
      .search(query, { source: { youtube: "video" }, limit: 5 })
      .catch(() => []);
    if (!results.length) return this.emptyResponse();

    return this.createResponse(
      null,
      results.map((v) =>
        this._buildTrack({
          title: v.title,
          url: v.url,
          author: v.channel?.name || "Unknown",
          durationMs: (v.durationInSec || 0) * 1000,
          thumbnail: v.thumbnails?.[0]?.url || "",
        }, context),
      ),
    );
  }

  _buildTrack({ title, url, author, durationMs, thumbnail }, context) {
    const track = new Track(this.context.player, {
      title: title || "Unknown",
      url,
      duration: Util.buildTimeCode(Util.parseMS(durationMs)),
      description: "",
      thumbnail,
      views: 0,
      author,
      requestedBy: context.requestedBy,
      source: "youtube",
      engine: url,
      queryType: QueryType.YOUTUBE_VIDEO,
      metadata: { url },
      requestMetadata: async () => ({ url }),
      cleanTitle: title || "Unknown",
    });
    track.extractor = this;
    return track;
  }

  async stream(info) {
    const url = info.url || info.track?.url;
    if (!url) throw new Error("Không tìm thấy URL track");
    const cleanUrl = this._normalizeURL(url);
    try {
      const audioUrl = await getBestAudioUrl(cleanUrl);
      if (!audioUrl) throw new Error("yt-dlp không trả về stream URL");
      return audioUrl;
    } catch (err) {
      console.error("[YouTubeExtractor] stream() error:", err.message);
      throw err;
    }
  }

  async getRelatedTracks() {
    return this.createResponse(null, []);
  }
}

module.exports = { YouTubeExtractor };
