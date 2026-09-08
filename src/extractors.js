import axios from 'axios';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
};

/**
 * Extract direct HLS m3u8 stream link from Zilla Networks player
 */
export async function extractZilla(zillaUrl) {
    try {
        const match = zillaUrl.match(/zilla-networks\.com\/(?:play|embed|m3u8)\/([a-zA-Z0-9]+)/i);
        if (match && match[1]) {
            const zillaId = match[1];
            return {
                url: `https://player.zilla-networks.com/m3u8/${zillaId}`,
                referer: `https://player.zilla-networks.com/play/${zillaId}`
            };
        }
    } catch (err) {
        console.error(`Error extracting Zilla (${zillaUrl}):`, err.message);
    }
    return null;
}

/**
 * Extract direct MP4 link from MP4Upload
 */
export async function extractMp4Upload(url) {
    try {
        const embedUrl = url.includes('/embed-') ? url : url.replace('mp4upload.com/', 'mp4upload.com/embed-') + '.html';
        const res = await axios.get(embedUrl, {
            headers: { ...DEFAULT_HEADERS, 'Referer': 'https://www.mp4upload.com/' },
            timeout: 10000
        });
        const html = res.data;

        const srcMatch = html.match(/player\.src\(\s*\{\s*type:\s*["']video\/mp4["'],\s*src:\s*["']([^"']+)["']/i) ||
                         html.match(/src:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i) ||
                         html.match(/(https?:\/\/[\w\.\-]+(?::\d+)?\/[^\s"'`]+\.mp4[^\s"'`]*)/i);

        if (srcMatch && srcMatch[1]) {
            return srcMatch[1];
        }

        const packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\).*/);
        if (packedMatch) {
            const unpacked = unpackJs(packedMatch[0]);
            const unpackedMp4 = unpacked.match(/(https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*)/i);
            if (unpackedMp4) return unpackedMp4[1];
        }
    } catch (err) {
        console.error(`Error extracting MP4Upload (${url}):`, err.message);
    }
    return null;
}

/**
 * Extract direct MP4 link from YourUpload
 */
export async function extractYourUpload(url) {
    try {
        const embedUrl = url.includes('/embed/') ? url : url.replace('/watch/', '/embed/');
        const watchUrl = url.includes('/watch/') ? url : url.replace('/embed/', '/watch/');

        for (const targetUrl of [embedUrl, watchUrl]) {
            try {
                const res = await axios.get(targetUrl, {
                    headers: { ...DEFAULT_HEADERS, 'Referer': 'https://www.yourupload.com/' },
                    timeout: 8000
                });
                const html = res.data;

                const match = html.match(/file:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i) ||
                              html.match(/meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i) ||
                              html.match(/(https?:\/\/[^"'\s]+\/stream\/[^"'\s]+\.mp4[^"'\s]*)/i) ||
                              html.match(/href=["'](\/download\?file=[^"']+)["']/i);

                if (match && match[1]) {
                    let directUrl = match[1];
                    if (directUrl.startsWith('/')) {
                        directUrl = 'https://www.yourupload.com' + directUrl;
                    }
                    return directUrl;
                }
            } catch (e) {}
        }
    } catch (err) {
        console.error(`Error extracting YourUpload (${url}):`, err.message);
    }
    return null;
}

/**
 * Extract direct MP4 link from Streamtape
 */
export async function extractStreamtape(url) {
    try {
        const res = await axios.get(url, {
            headers: { ...DEFAULT_HEADERS, 'Referer': 'https://streamtape.com/' },
            timeout: 10000
        });
        const html = res.data;

        const linkMatch = html.match(/document\.getElementById\(['"][^'"]+link['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*\((['"][\s\S]+?['"])\)\.substring\((\d+)\)/i) ||
                          html.match(/['"](\/\/streamtape\.com\/get_video\?[^'"]+)['"]/i);

        if (linkMatch) {
            if (linkMatch[3]) {
                const part1 = linkMatch[1];
                const part2Expr = linkMatch[2].replace(/['"]/g, '');
                const substrOffset = parseInt(linkMatch[3], 10);
                return 'https:' + part1 + part2Expr.substring(substrOffset);
            } else if (linkMatch[1]) {
                return linkMatch[1].startsWith('http') ? linkMatch[1] : 'https:' + linkMatch[1];
            }
        }
    } catch (err) {
        console.error(`Error extracting Streamtape (${url}):`, err.message);
    }
    return null;
}

/**
 * Extract direct m3u8/mp4 link from VidHide / VidHidePro / FileLions
 */
export async function extractVidHide(url) {
    try {
        const embedUrl = url.includes('/v/') ? url : url.replace('/embed/', '/v/');
        const res = await axios.get(embedUrl, {
            headers: { ...DEFAULT_HEADERS, 'Referer': 'https://animeav1.com/' },
            timeout: 10000
        });
        const html = res.data;

        const m3u8Match = html.match(/(https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)/i) ||
                          html.match(/file:\s*["'](https?:\/\/[^"']+)["']/i);
        if (m3u8Match && m3u8Match[1]) {
            return m3u8Match[1];
        }

        const packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\).*/);
        if (packedMatch) {
            const unpacked = unpackJs(packedMatch[0]);
            const unpackedM3u8 = unpacked.match(/(https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)/i) ||
                                 unpacked.match(/(https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*)/i);
            if (unpackedM3u8 && unpackedM3u8[1]) {
                return unpackedM3u8[1];
            }
        }
    } catch (err) {
        console.error(`Error extracting VidHide (${url}):`, err.message);
    }
    return null;
}

/**
 * Extract stream link or resolved embed link from Voe player
 */
export async function extractVoe(voeUrl) {
    try {
        let currentUrl = voeUrl;
        let response = await axios.get(currentUrl, {
            headers: DEFAULT_HEADERS,
            timeout: 8000,
            maxRedirects: 10
        });

        let html = response.data;

        // Follow JS redirects (e.g. window.location.href = 'https://eugenemakedraw.com/e/...')
        const jsRedirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i);
        if (jsRedirect && jsRedirect[1]) {
            currentUrl = jsRedirect[1];
            try {
                response = await axios.get(currentUrl, {
                    headers: { ...DEFAULT_HEADERS, 'Referer': voeUrl },
                    timeout: 8000
                });
                html = response.data;
            } catch (e) {}
        }

        // Direct m3u8 or mp4 regex match
        const m3u8Match = html.match(/(https?:\/\/[^"'`\s\\]+\.m3u8[^"'`\s\\]*)/i) ||
                          html.match(/(https?:\/\/[^"'`\s\\]+\.mp4[^"'`\s\\]*)/i);

        if (m3u8Match && m3u8Match[1] && !m3u8Match[1].includes('bigbuckbunny')) {
            return { direct: true, url: m3u8Match[1] };
        }

        // Base64 decoded link search
        const b64Matches = html.match(/['"](aHR0c[A-Za-z0-9+/=]+)['"]/gi);
        if (b64Matches) {
            for (const b of b64Matches) {
                try {
                    const decoded = Buffer.from(b.replace(/['"]/g, ''), 'base64').toString('utf-8');
                    if ((decoded.includes('.m3u8') || decoded.includes('.mp4')) && !decoded.includes('bigbuckbunny')) {
                        return { direct: true, url: decoded };
                    }
                } catch (e) {}
            }
        }

        return { direct: false, url: currentUrl };
    } catch (err) {
        console.error(`Error resolving Voe (${voeUrl}):`, err.message);
    }
    return { direct: false, url: voeUrl };
}

/**
 * Extract direct MEGA CDN streaming URL & decryption key
 */
export async function extractMega(megaUrl) {
    try {
        const match = megaUrl.match(/mega\.nz\/(?:embed|file)\/([a-zA-Z0-9_-]+)#([a-zA-Z0-9_-]+)/i);
        if (match && match[1] && match[2]) {
            const fileId = match[1];
            const keyB64 = match[2];

            const payload = [{ a: 'g', g: 1, p: fileId }];
            const res = await axios.post('https://g.api.mega.co.nz/cs?id=0', payload, { timeout: 10000 });
            if (res.data && res.data[0] && res.data[0].g) {
                return {
                    fileId,
                    keyB64,
                    downloadUrl: res.data[0].g,
                    size: res.data[0].s
                };
            }
        }
    } catch (err) {
        console.error(`Error extracting Mega (${megaUrl}):`, err.message);
    }
    return null;
}

/**
 * Dean Edwards Packer JS Unpacker
 */
function unpackJs(packed) {
    try {
        const payloadMatch = packed.match(/}\('(.+)',\s*(\d+),\s*(\d+),\s*'([^']+)'\.split\('\|'\)/);
        if (!payloadMatch) return packed;
        let [, p, a, c, k] = payloadMatch;
        a = parseInt(a, 10);
        c = parseInt(c, 10);
        k = k.split('|');
        const e = (c) => (c < a ? '' : e(parseInt(c / a, 10))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
        while (c--) {
            if (k[c]) {
                p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
            }
        }
        return p;
    } catch (e) {
        return packed;
    }
}
