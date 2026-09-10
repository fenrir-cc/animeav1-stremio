import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractMp4Upload, extractYourUpload, extractStreamtape, extractVidHide, extractZilla, extractVoe, extractMega } from './extractors.js';

const BASE_URL = 'https://animeav1.com';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
};

/**
 * Fetch latest episodes from home page
 */
export async function getLatestEpisodes() {
    try {
        const response = await axios.get(BASE_URL, { headers: DEFAULT_HEADERS, timeout: 10000 });
        const $ = cheerio.load(response.data);
        const results = [];

        $('article.group\\/item').each((_, element) => {
            const $item = $(element);
            const title = $item.find('header div').first().text().trim();
            const href = $item.find('a[href^="/media/"]').attr('href');
            const img = $item.find('img').attr('src');

            if (href && title) {
                const parts = href.replace('/media/', '').split('/');
                const slug = parts[0];
                const epNum = parts[1] || '1';

                results.push({
                    id: `animeav1:${slug}`,
                    type: 'series',
                    name: `${title} - Ep ${epNum}`,
                    poster: img || `${BASE_URL}/img/logo.svg`,
                    description: `Último episodio agregado: Episodio ${epNum}`,
                });
            }
        });

        return results;
    } catch (err) {
        console.error('Error fetching latest episodes:', err.message);
        return [];
    }
}

/**
 * Search catalog or list popular anime
 */
export async function searchCatalog(query = '') {
    try {
        const url = query
            ? `${BASE_URL}/catalogo?search=${encodeURIComponent(query)}`
            : `${BASE_URL}/catalogo`;

        const response = await axios.get(url, { headers: DEFAULT_HEADERS, timeout: 10000 });
        const $ = cheerio.load(response.data);
        const items = [];

        $('article.group\\/item').each((_, element) => {
            const $item = $(element);
            const title = $item.find('h3').text().trim();
            const href = $item.find('a[href^="/media/"]').attr('href');
            const poster = $item.find('figure img').attr('src');
            const category = $item.find('.rounded.bg-line').text().trim();

            if (href && title) {
                const slug = href.replace('/media/', '').split('/')[0];
                items.push({
                    id: `animeav1:${slug}`,
                    type: 'series',
                    name: title,
                    poster: poster || `${BASE_URL}/img/logo.svg`,
                    description: category ? `Tipo: ${category}` : 'Anime',
                });
            }
        });

        return items;
    } catch (err) {
        console.error(`Error searching catalog (${query}):`, err.message);
        return [];
    }
}

/**
 * Fetch detailed anime metadata by slug
 */
export async function getAnimeMeta(slug) {
    try {
        const url = `${BASE_URL}/media/${slug}`;
        const response = await axios.get(url, { headers: DEFAULT_HEADERS, timeout: 10000 });
        const html = response.data;
        const $ = cheerio.load(html);

        const title = $('h1').first().text().trim() || slug.replace(/-/g, ' ');
        const synopsis = $('.entry p').first().text().trim() || 'Sin descripción disponible.';
        const backdrop = $('figure img').attr('src') || '';
        const poster = `https://cdn.animeav1.com/covers/${slug}.jpg`;

        const genres = [];
        $('a[href*="genre="]').each((_, el) => {
            genres.push($(el).text().trim());
        });

        const epCountMatch = html.match(/episodesCount\s*[:=]\s*(\d+)/i);
        const videos = [];

        if (epCountMatch) {
            const totalEp = parseInt(epCountMatch[1], 10);
            for (let i = 1; i <= totalEp; i++) {
                videos.push({
                    id: `animeav1:${slug}:${i}`,
                    title: `Episodio ${i}`,
                    season: 1,
                    episode: i,
                    released: new Date().toISOString()
                });
            }
        } else {
            $('#episodes-list a').each((_, el) => {
                const epHref = $(el).attr('href');
                const epNumText = $(el).find('span').text().trim();
                if (epHref) {
                    const epNum = parseInt(epNumText || epHref.split('/').pop(), 10);
                    if (!isNaN(epNum)) {
                        videos.push({
                            id: `animeav1:${slug}:${epNum}`,
                            title: `Episodio ${epNum}`,
                            season: 1,
                            episode: epNum,
                            released: new Date().toISOString()
                        });
                    }
                }
            });
        }

        videos.sort((a, b) => a.episode - b.episode);

        if (videos.length === 0) {
            videos.push({
                id: `animeav1:${slug}:1`,
                title: 'Episodio 1',
                season: 1,
                episode: 1,
            });
        }

        return {
            id: `animeav1:${slug}`,
            type: 'series',
            name: title,
            poster: poster,
            background: backdrop || poster,
            description: synopsis,
            genres: genres.length > 0 ? genres : ['Anime'],
            videos: videos
        };
    } catch (err) {
        console.error(`Error fetching meta for ${slug}:`, err.message);
        return null;
    }
}

/**
 * Fetch episode streams:
 * - Direct HLS & MP4 native streaming via local proxy
 * - DUB / LATINO options sorted FIRST at the top!
 */
export async function getEpisodeStreams(slug, episodeNumber, hostUrl = 'http://localhost:7000') {
    try {
        const pageUrl = `${BASE_URL}/media/${slug}/${episodeNumber}`;
        const response = await axios.get(pageUrl, { headers: DEFAULT_HEADERS, timeout: 10000 });
        const html = response.data;
        const dubStreams = [];
        const subStreams = [];

        const embedsMatch = html.match(/embeds\s*:\s*(\{[\s\S]+?\})\s*,\s*downloads/i) ||
                            html.match(/embeds\s*:\s*(\{[\s\S]+?\})\s*,\s*publishedAt/i);

        let parsedEmbeds = null;
        if (embedsMatch) {
            try {
                parsedEmbeds = new Function('return ' + embedsMatch[1])();
            } catch (e) {
                console.error('Error evaluating embeds object:', e.message);
            }
        }

        if (parsedEmbeds && typeof parsedEmbeds === 'object') {
            for (const langKey of Object.keys(parsedEmbeds)) {
                const serverList = parsedEmbeds[langKey];
                const langLabel = langKey.toUpperCase(); // SUB, LATINO, DUB, etc.
                const isDub = langLabel.includes('LATINO') || langLabel.includes('DUB') || langLabel.includes('CASTELANO') || langLabel.includes('ESPAÑOL');
                const targetArray = isDub ? dubStreams : subStreams;

                if (Array.isArray(serverList)) {
                    for (const item of serverList) {
                        const serverRaw = item.server || 'Servidor';
                        const serverName = serverRaw.toLowerCase();
                        const embedUrl = item.url;
                        if (!embedUrl) continue;

                        // Skip voe, upnshare, vidhide, byse as requested by user
                        if (
                            serverName.includes('voe') || embedUrl.includes('voe') ||
                            serverName.includes('upnshare') || embedUrl.includes('uns.bio') ||
                            serverName.includes('vidhide') || embedUrl.includes('vidhide') ||
                            serverName.includes('byse') || embedUrl.includes('byselapuix')
                        ) {
                            continue;
                        }

                        let directVideoUrl = null;
                        let refererHeader = 'https://animeav1.com/';

                        // 1. Zilla Networks HLS Extraction
                        if (serverName.includes('hls') || embedUrl.includes('zilla-networks')) {
                            const zillaData = await extractZilla(embedUrl);
                            if (zillaData && zillaData.url) {
                                directVideoUrl = zillaData.url;
                                refererHeader = zillaData.referer;
                            }
                        }
                        // 2. MP4Upload Extraction
                        else if (serverName.includes('mp4upload') || embedUrl.includes('mp4upload')) {
                            directVideoUrl = await extractMp4Upload(embedUrl);
                            refererHeader = 'https://www.mp4upload.com/';
                        }
                        // 3. YourUpload Extraction
                        else if (serverName.includes('yourupload') || embedUrl.includes('yourupload')) {
                            directVideoUrl = await extractYourUpload(embedUrl);
                            refererHeader = embedUrl.includes('/embed/') ? embedUrl : 'https://www.yourupload.com/';
                        }
                        // 4. Streamtape Extraction
                        else if (serverName.includes('streamtape') || embedUrl.includes('streamtape')) {
                            directVideoUrl = await extractStreamtape(embedUrl);
                            refererHeader = 'https://streamtape.com/';
                        }
                        // 5. Mega Extraction
                        else if (serverName.includes('mega') || embedUrl.includes('mega.nz')) {
                            const megaData = await extractMega(embedUrl);
                            if (megaData && megaData.downloadUrl) {
                                directVideoUrl = `mega:${megaData.fileId}!${megaData.keyB64}!${encodeURIComponent(megaData.downloadUrl)}`;
                                refererHeader = 'https://mega.nz/';
                            }
                        }

                        // Direct Video Proxy Stream (Native Stremio Player)
                        if (directVideoUrl) {
                            const proxiedUrl = `${hostUrl}/proxy?url=${encodeURIComponent(directVideoUrl)}&referer=${encodeURIComponent(refererHeader)}`;
                            targetArray.push({
                                url: proxiedUrl,
                                title: `[${langLabel}] ${serverRaw} 🎬 (Reproductor Stremio)`,
                                quality: '1080p'
                            });
                        }
                    }
                }
            }
        }

        // Combine streams: DUB / LATINO FIRST, SUB SECOND!
        const finalStreams = [...dubStreams, ...subStreams];

        return finalStreams;
    } catch (err) {
        console.error(`Error fetching streams for ${slug} ep ${episodeNumber}:`, err.message);
        return [];
    }
}
