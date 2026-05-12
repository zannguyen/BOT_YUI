const { BaseExtractor, Track, QueryType, Util } = require("discord-player");
const playdl = require("play-dl");
const youtubedl = require("youtube-dl-exec");

async function getBestAudioUrl(videoUrl) {
  const info = await youtubedl(videoUrl, {
    dumpSingleJson: true,
    noWarnings: true,
    youtubeSkipDashManifest: true,
    format: "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio",
  });
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
    const match = query.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (match) return `https://www.youtube.com/watch?v=${match[1]}`;
    // Xóa tham số ?si= không cần thiết
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

    // Direct YouTube URL — build track ngay, không cần fetch info
    if (this._isYouTubeURL(query) || playdl.yt_validate(query) === "video") {
      const track = this._buildTrack({
        title: query, // tạm dùng URL, sẽ được cập nhật khi phát
        url: query,
        author: "YouTube",
        durationMs: 0,
        thumbnail: "",
      }, context);
      return this.createResponse(null, [track]);
    }

    // Tìm kiếm theo tên — dùng play-dl search
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
    const audioUrl = await getBestAudioUrl(cleanUrl);
    if (!audioUrl) throw new Error("Không lấy được stream từ YouTube");
    return audioUrl;
  }

  async getRelatedTracks() {
    return this.createResponse(null, []);
  }
}

module.exports = { YouTubeExtractor };
