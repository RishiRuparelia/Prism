export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const type = params.get("type") || "movie";
  if (type !== "movie" && type !== "series") {
    return Response.json({ error: "Choose movies or TV series." }, { status: 400 });
  }
  const id = params.get("id");
  const query = (params.get("q") || "").trim();
  const validId = id === null || /^tt\d{5,12}$/.test(id);
  if (!validId || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query) || (id === null && !query)) {
    return Response.json({ error: `Enter a ${type === "series" ? "TV series" : "movie"} title up to 100 characters or a valid IMDb ID.` }, { status: 400 });
  }
  const path = id ? `/meta/${type}/${id}.json` : `/catalog/${type}/top/search=${encodeURIComponent(query)}.json`;
  try {
    const upstream = await fetchCatalog(path);
    if (!upstream.ok) throw new Error("Catalog service unavailable");
    const data = await upstream.json() as { meta?: Record<string, unknown>; metas?: Record<string, unknown>[] };
    if (!data || typeof data !== "object" || (id ? !data.meta || typeof data.meta !== "object" : !Array.isArray(data.metas))) {
      throw new Error("Catalog service returned an invalid response");
    }
    // Keep Cinemeta's metadata/episode fields for existing clients, with aliases
    // shared by the saved movie and TV collections.
    if (type === "series") {
      if (id) data.meta = normalizeSeries(data.meta!);
      else data.metas = data.metas!.map(normalizeSeries);
    }
    return Response.json(data, { headers: { "cache-control": "private, max-age=60" } });
  } catch {
    return Response.json({ error: "The live catalog is unavailable. Your saved collection still works." }, { status: 502 });
  }
}

async function fetchCatalog(path: string): Promise<Response> {
  let url = new URL(path, "https://v3-cinemeta.strem.io");
  const signal = AbortSignal.timeout(12000);
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url.href, { headers: { accept: "application/json" }, redirect: "manual", signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("Catalog redirect had no destination");
    url = new URL(location, url);
    if (url.protocol !== "https:" || url.username || url.password ||
      !["v3-cinemeta.strem.io", "cinemeta-catalogs.strem.io"].includes(url.hostname)) {
      throw new Error("Catalog redirected outside its verified services");
    }
  }
  throw new Error("Catalog redirected too many times");
}

function normalizeSeries(meta: Record<string, unknown>) {
  const genres = Array.isArray(meta.genres) ? meta.genres : Array.isArray(meta.genre) ? meta.genre : [];
  const movieDbId = Number(meta.moviedb_id || meta.tmdbId);
  const videos = Array.isArray(meta.videos) ? meta.videos.filter((video) => {
    return video && typeof video === "object" && Number.isInteger(Number(video.season)) && Number(video.season) >= 0 &&
      Number.isInteger(Number(video.episode ?? video.number)) && Number(video.episode ?? video.number) >= 1;
  }).map((video) => ({
    ...video,
    title: video.title || video.name || `Episode ${video.episode ?? video.number}`,
    season: Number(video.season),
    episode: Number(video.episode ?? video.number),
    description: video.description || video.overview || "",
    released: video.released || video.firstAired || null,
  })) : [];
  return {
    ...meta,
    id: meta.id || meta.imdb_id,
    title: meta.name || meta.title || "Untitled series",
    type: "series",
    genres,
    tmdbId: Number.isSafeInteger(movieDbId) && movieDbId > 0 ? movieDbId : null,
    videos,
  };
}
