import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import { Transform } from 'stream';
import addonSdk from 'stremio-addon-sdk';
const { getRouter } = addonSdk;

import { addonInterface, setDynamicHost } from './addon.js';
import { manifest } from './manifest.js';

const app = express();
app.set('trust proxy', true);
app.use(cors());

// Middleware to dynamically capture public host URL for cloud deployments (Render, Railway, VPS)
app.use((req, res, next) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    if (host) {
        setDynamicHost(`${proto}://${host}`);
    }
    next();
});

const PORT = process.env.PORT || 7000;

function base64UrlToBuffer(b64url) {
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    return Buffer.from(b64, 'base64');
}

function parseMegaKey(keyB64Url) {
    const buf = base64UrlToBuffer(keyB64Url);
    if (buf.length !== 32) throw new Error(`Invalid key length: ${buf.length}`);

    const a = [];
    for (let i = 0; i < 8; i++) {
        a.push(buf.readUInt32BE(i * 4));
    }

    const keyBuf = Buffer.alloc(16);
    for (let i = 0; i < 4; i++) {
        keyBuf.writeUInt32BE((a[i] ^ a[i + 4]) >>> 0, i * 4);
    }

    const ivBuf = Buffer.alloc(16);
    ivBuf.writeUInt32BE(a[4], 0);
    ivBuf.writeUInt32BE(a[5], 4);
    ivBuf.writeUInt32BE(0, 8);
    ivBuf.writeUInt32BE(0, 12);

    return { keyBuf, ivBuf };
}

function computeMegaIv(initialIvBuf, startByte) {
    const blockIndex = Math.floor(startByte / 16);
    const newIv = Buffer.from(initialIvBuf);
    let carry = blockIndex;
    for (let i = 15; i >= 8; i--) {
        const sum = newIv[i] + (carry & 0xff);
        newIv[i] = sum & 0xff;
        carry = Math.floor(sum / 256) + Math.floor(carry / 256);
    }
    return newIv;
}

class SkipTransform extends Transform {
    constructor(skip) {
        super();
        this.skip = skip;
    }
    _transform(chunk, encoding, callback) {
        if (this.skip > 0) {
            if (chunk.length <= this.skip) {
                this.skip -= chunk.length;
                return callback();
            }
            chunk = chunk.subarray(this.skip);
            this.skip = 0;
        }
        this.push(chunk);
        callback();
    }
}

/**
 * Universal Video & Range Request Proxy for Stremio Internal Player
 */
app.get('/proxy', async (req, res) => {
    try {
        const targetUrl = req.query.url;
        const referer = req.query.referer || 'https://animeav1.com/';
        if (!targetUrl) return res.status(400).send('Missing url parameter');

        // MEGA Direct Real-Time AES-128-CTR Decryption Stream Proxy
        if (targetUrl.startsWith('mega:')) {
            const megaParts = targetUrl.replace('mega:', '').split('!');
            const fileId = megaParts[0];
            const keyB64 = megaParts[1];
            const downloadUrl = decodeURIComponent(megaParts.slice(2).join('!'));

            const { keyBuf, ivBuf } = parseMegaKey(keyB64);
            const reqHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

            let startByte = 0;
            let endByte = '';
            const rangeHeader = req.headers.range;

            if (rangeHeader) {
                const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
                if (rangeMatch) {
                    startByte = parseInt(rangeMatch[1], 10);
                    if (rangeMatch[2]) endByte = parseInt(rangeMatch[2], 10);
                }
            }

            const reqStart = Math.floor(startByte / 16) * 16;
            const blockOffset = startByte - reqStart;

            if (rangeHeader) {
                reqHeaders['Range'] = `bytes=${reqStart}-${endByte}`;
            }

            const cdnResponse = await axios({
                method: 'get',
                url: downloadUrl,
                headers: reqHeaders,
                responseType: 'stream',
                timeout: 25000
            });

            const newIv = computeMegaIv(ivBuf, reqStart);
            const decipher = crypto.createDecipheriv('aes-128-ctr', keyBuf, newIv);

            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', '*');

            if (cdnResponse.headers['content-range']) {
                res.status(206);
                const totalLength = cdnResponse.headers['content-range'].split('/')[1] || '*';
                const actualLength = parseInt(cdnResponse.headers['content-length'], 10) - blockOffset;
                const actualEnd = startByte + actualLength - 1;
                res.setHeader('Content-Range', `bytes ${startByte}-${actualEnd}/${totalLength}`);
                res.setHeader('Content-Length', actualLength);
            } else {
                res.status(200);
                if (cdnResponse.headers['content-length']) {
                    res.setHeader('Content-Length', cdnResponse.headers['content-length']);
                }
            }

            cdnResponse.data.pipe(decipher).pipe(new SkipTransform(blockOffset)).pipe(res);
            return;
        }

        const reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': referer,
            'Accept': '*/*',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin'
        };

        if (req.headers.range) {
            reqHeaders['Range'] = req.headers.range;
        }

        const lowerTarget = targetUrl.toLowerCase();
        const isM3u8 = lowerTarget.includes('.m3u8') || lowerTarget.includes('/m3u8/') || lowerTarget.includes('zilla-networks.com/m3u8');
        console.log(`[PROXY] targetUrl: ${targetUrl} | isM3u8: ${isM3u8}`);

        if (isM3u8) {
            const response = await axios.get(targetUrl, {
                headers: reqHeaders,
                timeout: 15000,
                responseType: 'text'
            });

            const baseUrl = targetUrl;
            const host = req.get('host');
            const protocol = req.protocol;

            let m3u8Data = response.data;
            const lines = m3u8Data.split(/\r?\n/);
            const rewrittenLines = lines.map(line => {
                const trimmed = line.trim();
                if (!trimmed) return line;

                // Rewrite tag URIs like #EXT-X-KEY:METHOD=AES-128,URI="https://..."
                if (trimmed.startsWith('#')) {
                    return trimmed.replace(/URI=["']([^"']+)["']/gi, (match, uri) => {
                        const absUri = new URL(uri, baseUrl).href;
                        const proxiedUri = `${protocol}://${host}/proxy?url=${encodeURIComponent(absUri)}&referer=${encodeURIComponent(referer)}`;
                        return `URI="${proxiedUri}"`;
                    });
                }

                // Segment or sub-playlist URL
                try {
                    const absUrl = new URL(trimmed, baseUrl).href;
                    return `${protocol}://${host}/proxy?url=${encodeURIComponent(absUrl)}&referer=${encodeURIComponent(referer)}`;
                } catch (e) {
                    return line;
                }
            });

            const outputM3u8 = rewrittenLines.join('\n');

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', '*');
            return res.send(outputM3u8);
        }

        // Direct binary/video stream proxying for video segments and MP4 files
        const response = await axios({
            method: 'get',
            url: targetUrl,
            headers: reqHeaders,
            responseType: 'stream',
            maxRedirects: 10,
            timeout: 20000
        });

        res.status(response.status);

        const passHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
        passHeaders.forEach(h => {
            if (response.headers[h]) {
                res.setHeader(h, response.headers[h]);
            }
        });

        // Ensure Android ExoPlayer receives video/mp2t Content-Type for HLS segments instead of text/html
        if (targetUrl.includes('/segs/') || lowerTarget.endsWith('.html') || lowerTarget.endsWith('.ts')) {
            res.setHeader('Content-Type', 'video/mp2t');
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');

        response.data.pipe(res);
    } catch (err) {
        console.error('Proxy stream error:', err.message);
        if (!res.headersSent) {
            res.status(500).send('Proxy error: ' + err.message);
        }
    }
});

/**
 * Fullscreen Embedded HTML5 Video Player Wrapper for Stremio Internal Playback
 */
app.get('/embed_player', async (req, res) => {
    const embedUrl = req.query.url;
    if (!embedUrl) return res.status(400).send('Missing url parameter');

    // Special handling for VOE servers to bypass anti-debugger/devtools redirects
    if (embedUrl.includes('voe') || embedUrl.includes('eugenemakedraw') || embedUrl.includes('cantyqueryevening')) {
        try {
            const response = await axios.get(embedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': 'https://voe.sx/'
                },
                timeout: 10000
            });

            let html = response.data;
            const origin = new URL(embedUrl).origin;

            // 1. Remove anti-debugger and devtools detection redirects
            html = html.replace(/debugger\s*;/gi, '');
            html = html.replace(/after\s*-\s*before\s*>\s*\d+/gi, 'false');
            html = html.replace(/self\.location\.replace\([^)]+\)/gi, '');
            html = html.replace(/window\.location\.replace\([^)]+\)/gi, '');

            // 2. Inject <base> tag and convert relative asset URLs to absolute
            if (!html.includes('<base')) {
                html = html.replace('<head>', `<head><base href="${origin}/">`);
            }

            html = html.replace(/(src|href)=["']\/(?!\/)([^"']+)["']/gi, `$1="${origin}/$2"`);
            html = html.replace(/var\s+base\s*=\s*['"][^'"]+['"]/gi, `var base = '${origin}'`);
            html = html.replace(/var\s+staticBase\s*=\s*['"][^'"]+['"]/gi, `var staticBase = '${origin}'`);

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
        } catch (err) {
            console.error('Error proxying VOE page:', err.message);
        }
    }

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AnimeAV1 Player</title>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: #000;
            overflow: hidden;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: 0;
        }
    </style>
</head>
<body>
    <iframe 
        src="${embedUrl}" 
        allowfullscreen 
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
        referrerpolicy="no-referrer"
    ></iframe>
</body>
</html>
    `);
});

// Mount Stremio addon routes
const addonRouter = getRouter(addonInterface);
app.use(addonRouter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', addon: manifest.name, version: manifest.version });
});

// HTML Landing Page for 1-click Stremio Installation
app.get('/', (req, res) => {
    const host = req.get('host');
    const protocol = req.protocol;
    const manifestUrl = `${protocol}://${host}/manifest.json`;
    const stremioLink = `stremio://${host}/manifest.json`;
    const stremioWebLink = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(manifestUrl)}`;

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.5">
    <title>AnimeAV1 - Addon de Stremio</title>
    <link rel="icon" type="image/png" href="${manifest.logo}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0c0e14;
            --card-bg: rgba(22, 27, 38, 0.85);
            --accent-color: #8b5cf6;
            --accent-hover: #7c3aed;
            --text-color: #f3f4f6;
            --text-muted: #9ca3af;
            --border-color: rgba(139, 92, 246, 0.25);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-color);
            background-image: 
                radial-gradient(at 10% 10%, rgba(139, 92, 246, 0.15) 0px, transparent 50%),
                radial-gradient(at 90% 90%, rgba(236, 72, 153, 0.15) 0px, transparent 50%);
            color: var(--text-color);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            max-width: 520px;
            width: 100%;
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-color);
            border-radius: 24px;
            padding: 40px 32px;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            animation: fadeIn 0.5s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .logo {
            width: 80px;
            height: 80px;
            border-radius: 20px;
            margin-bottom: 20px;
            box-shadow: 0 10px 25px rgba(139, 92, 246, 0.4);
        }

        h1 {
            font-size: 2rem;
            font-weight: 900;
            letter-spacing: -0.5px;
            margin-bottom: 8px;
            background: linear-gradient(135deg, #a78bfa, #f472b6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        p.subtitle {
            color: var(--text-muted);
            font-size: 0.95rem;
            line-height: 1.5;
            margin-bottom: 28px;
        }

        .btn-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 28px;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 14px 24px;
            font-size: 1rem;
            font-weight: 700;
            border-radius: 14px;
            text-decoration: none;
            transition: all 0.2s ease;
            cursor: pointer;
            border: none;
        }

        .btn-primary {
            background: linear-gradient(135deg, var(--accent-color), var(--accent-hover));
            color: #ffffff;
            box-shadow: 0 8px 20px rgba(139, 92, 246, 0.35);
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 25px rgba(139, 92, 246, 0.5);
        }

        .btn-secondary {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-color);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .manifest-box {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 12px 16px;
            font-family: monospace;
            font-size: 0.85rem;
            color: #a78bfa;
            word-break: break-all;
            user-select: all;
        }

        .footer {
            margin-top: 24px;
            font-size: 0.8rem;
            color: var(--text-muted);
        }
    </style>
</head>
<body>
    <div class="container">
        <img class="logo" src="${manifest.logo}" alt="AnimeAV1 Logo">
        <h1>${manifest.name}</h1>
        <p class="subtitle">${manifest.description}</p>

        <div class="btn-group">
            <a class="btn btn-primary" href="${stremioLink}">
                ⚡ Instalar en Stremio App
            </a>
            <a class="btn btn-secondary" href="${stremioWebLink}" target="_blank" rel="noopener">
                🌐 Abrir en Stremio Web
            </a>
        </div>

        <div class="manifest-box" id="manifestUrl">${manifestUrl}</div>

        <div class="footer">
            AnimeAV1 Stremio Addon v${manifest.version} • Listo para disfrutar
        </div>
    </div>
</body>
</html>
    `);
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 AnimeAV1 Stremio Addon corriendo en: http://localhost:${PORT}`);
    console.log(`📄 Manifiesto: http://localhost:${PORT}/manifest.json`);
    console.log(`====================================================`);
});
