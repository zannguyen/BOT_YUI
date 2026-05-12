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
    // Chuẩn hóa youtu.be short link → youtube.com
    if (/youtu\.be\/([a-zA-Z0-9_-]+)/.test(query)) {
      const videoId = query.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)[1];
      query = `https://www.youtube.com/watch?v=${videoId}`;
    }

    const ytValidate = playdl.yt_validate(query);

    if (ytValidate === "video") {
      const info = await playdl.video_info(query).catch(() => null);
      if (!info) return this.emptyResponse();
      const v = info.video_details;
      return this.createResponse(null, [
        this._buildTrack(
          {
            title: v.title,
            url: v.url,
            author: v.channel?.name || "Unknown",
            durationMs: (v.durationInSec || 0) * 1000,
            thumbnail: v.thumbnails?.[0]?.url || "",
          },
          context,
        ),
      ]);
    }

    const results = await playdl
      .search(query, { source: { youtube: "video" }, limit: 5 })
      .catch(() => []);
    if (!results.length) return this.emptyResponse();

    return this.createResponse(
      null,
      results.map((v) =>
        this._buildTrack(
          {
            title: v.title,
            url: v.url,
            author: v.channel?.name || "Unknown",
            durationMs: (v.durationInSec || 0) * 1000,
            thumbnail: v.thumbnails?.[0]?.url || "",
          },
          context,
        ),
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
    const audioUrl = await getBestAudioUrl(url);
    if (!audioUrl) throw new Error("Không lấy được stream từ YouTube");
    return audioUrl;
  }

  async getRelatedTracks() {
    return this.createResponse(null, []);
  }
}

module.exports = { YouTubeExtractor };
