export function isSeries(item) {
  return item?.type === 'series' || item?.type === 'tv';
}

export function normalizeEpisodes(videos = []) {
  const unique = new Map();
  for (const video of videos) {
    const season = Number(video.season);
    const episode = Number(video.episode ?? video.number);
    if (!Number.isInteger(season) || season < 0 || !Number.isInteger(episode) || episode < 1) continue;
    const key = `${season}:${episode}`;
    const previous = unique.get(key);
    const normalized = {
      id: video.id || key, season, episode,
      title: video.title || video.name || `Episode ${episode}`,
      overview: video.overview || video.description || '',
      released: video.released || video.firstAired || '',
      thumbnail: video.thumbnail || '',
    };
    if (!previous || (!previous.overview && normalized.overview)) unique.set(key, normalized);
  }
  return [...unique.values()].sort((a, b) => a.season - b.season || a.episode - b.episode);
}

export function seasonsFor(episodes) {
  return [...new Set(episodes.map(episode => episode.season))].sort((a, b) => a - b);
}

export function episodeReleased(episode, now = Date.now()) {
  const release = Date.parse(episode?.released);
  return Number.isNaN(release) || release <= now;
}

export function initialEpisode(episodes, saved, now = Date.now()) {
  const preferred = episodes.find(episode => episode.season === Number(saved?.season) && episode.episode === Number(saved?.episode) && episodeReleased(episode, now));
  return preferred || episodes.find(episode => episode.season > 0 && episodeReleased(episode, now)) || episodes.find(episode => episodeReleased(episode, now)) || episodes[0] || null;
}

export function adjacentEpisode(episodes, current, direction, now = Date.now()) {
  if (!current) return null;
  const playable = episodes.filter(episode => episodeReleased(episode, now));
  const index = playable.findIndex(episode => episode.season === current.season && episode.episode === current.episode);
  return index < 0 ? null : playable[index + (direction < 0 ? -1 : 1)] || null;
}

export function episodeLabel(episode) {
  if (!episode) return '';
  return `S${String(episode.season).padStart(2, '0')} E${String(episode.episode).padStart(2, '0')}`;
}

export function seriesPlayerUrl(series, episode, settings = {}) {
  if (!episode || !Number.isInteger(episode.season) || episode.season < 0 || !Number.isInteger(episode.episode) || episode.episode < 1) {
    throw new Error('Choose an episode before starting playback.');
  }
  const template = settings.tvProvider || 'https://vidsrc.party/embed/tv/{id}/{season}/{episode}';
  if (!template.includes('{season}') || !template.includes('{episode}')) {
    throw new Error('The TV player URL needs {season} and {episode}. Update it in Settings.');
  }
  if (template.includes('{id}') && !series.tmdbId) {
    throw new Error('This show has no TV playback ID. Retry its details or choose another show.');
  }
  const target = template.replaceAll('{id}', encodeURIComponent(series.tmdbId || ''))
    .replaceAll('{imdb}', encodeURIComponent(series.id || ''))
    .replaceAll('{season}', String(episode.season))
    .replaceAll('{episode}', String(episode.episode));
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Choose an HTTP or HTTPS TV player in Settings.');
  return url.href;
}
