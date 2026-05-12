const { BaseExtractor, Track, QueryType, Util } = require("discord-player");
const playdl = require("play-dl");
const youtubedl = require("youtube-dl-exec");

// Dùng yt-dlp để lấy info + stream URL (hoạt động trên mọi server)
async function getVideoInfo(videoUrl) {
  return youtubedl(videoUrl, {
    dumpSingleJson: true,
    noWarnings: true,
    youtubeSkipDashManifest: true,
    format: "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio",
  });
}

async function getBestAudioUrl(info) {
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
    const isURL = this._isYouTubeURL(query) || playdl.yt_validate(query) === "video";

    if (isURL) {
      // Dùng yt-dlp để lấy info — hoạt động trên mọi server
      const info = await getVideoInfo(query).catch(() => null);
      if (!info) return this.emptyResponse();
      return this.createResponse(null, [
        this._buildTrack({
          title: info.title,
          url: `https://www.youtube.com/watch?v=${info.id}`,
          author: info.uploader || info.channel || "Unknown",
          durationMs: (info.duration || 0) * 1000,
          thumbnail: info.thumbnail || "",
          ytInfo: info,
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

  _buildTrack({ title, url, author, durationMs, thumbnail, ytInfo }, context) {
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
      engine: ytInfo || url,
      queryType: QueryType.YOUTUBE_VIDEO,
      metadata: { url, ytInfo },
      requestMetadata: async () => ({ url, ytInfo }),
      cleanTitle: title || "Unknown",
    });
    track.extractor = this;
    return track;
  }

  async stream(info) {
    const url = info.url || info.track?.url;
    if (!url) throw new Error("Không tìm thấy URL track");

    // Nếu đã có ytInfo từ handle(), dùng luôn không cần gọi lại yt-dlp
    const ytInfo = info.metadata?.ytInfo || info.track?.metadata?.ytInfo;
    const videoInfo = ytInfo || await getVideoInfo(url).catch(() => null);
    if (!videoInfo) throw new Error("Không lấy được thông tin từ YouTube");

    const audioUrl = await getBestAudioUrl(videoInfo);
    if (!audioUrl) throw new Error("Không lấy được stream từ YouTube");
    return audioUrl;
  }

  async getRelatedTracks() {
    return this.createResponse(null, []);
  }
}

module.exports = { YouTubeExtractor };
