import express from 'express';
import axios from 'axios';
import addonSdk from 'stremio-addon-sdk';
const { addonBuilder } = addonSdk;

import { manifest } from './manifest.js';
import { getLatestEpisodes, searchCatalog, getAnimeMeta, getEpisodeStreams } from './scraper.js';

let currentDynamicHost = null;
export function setDynamicHost(host) {
    currentDynamicHost = host;
}

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async (args) => {
    console.log(`[Catalog] Request: type=${args.type}, id=${args.id}, search=${args.extra?.search || 'none'}`);
    let metas = [];
    if (args.id === 'animeav1_latest') {
        metas = await getLatestEpisodes();
    } else if (args.id === 'animeav1_catalog') {
        metas = await searchCatalog(args.extra?.search || '');
    }
    return { metas };
});

builder.defineMetaHandler(async (args) => {
    console.log(`[Meta] Request: type=${args.type}, id=${args.id}`);
    if (!args.id.startsWith('animeav1:')) {
        return { meta: null };
    }
    const slug = args.id.replace('animeav1:', '');
    const meta = await getAnimeMeta(slug);
    return { meta };
});

builder.defineStreamHandler(async (args) => {
    console.log(`[Stream] Request: type=${args.type}, id=${args.id}`);
    const hostUrl = process.env.ADDON_HOST || currentDynamicHost || 'http://localhost:7000';

    if (args.id.startsWith('animeav1:')) {
        const parts = args.id.split(':');
        const slug = parts[1];
        const epNum = parts[2] || '1';
        const streams = await getEpisodeStreams(slug, epNum, hostUrl);
        return { streams };
    }

    if (args.id.startsWith('tt')) {
        try {
            const parts = args.id.split(':');
            const ttId = parts[0];
            const season = parseInt(parts[1] || '1', 10);
            const episode = parseInt(parts[2] || '1', 10);

            // Fetch Cinemeta metadata for IMDb ID
            const metaType = args.type === 'movie' ? 'movie' : 'series';
            const cinemetaUrl = `https://v3-cinemeta.strem.io/meta/${metaType}/${ttId}.json`;
            const res = await axios.get(cinemetaUrl, { timeout: 8000 });
            const meta = res.data?.meta;

            if (meta && meta.name) {
                const title = meta.name;
                const searchResults = await searchCatalog(title);

                if (searchResults.length > 0) {
                    let targetSlug = searchResults[0].id.replace('animeav1:', '');

                    if (season > 1) {
                        const seasonResult = searchResults.find(r => 
                            r.name.toLowerCase().includes(`temporada ${season}`) ||
                            r.name.toLowerCase().includes(`season ${season}`) ||
                            r.name.toLowerCase().includes(`${season}nd season`) ||
                            r.name.toLowerCase().includes(`${season}rd season`) ||
                            r.name.toLowerCase().includes(`${season}th season`) ||
                            r.id.includes(`-${season}`)
                        );
                        if (seasonResult) {
                            targetSlug = seasonResult.id.replace('animeav1:', '');
                        }
                    }

                    const streams = await getEpisodeStreams(targetSlug, episode, hostUrl);
                    return { streams };
                }
            }
        } catch (err) {
            console.error(`Error resolving IMDb ID (${args.id}):`, err.message);
        }
    }

    return { streams: [] };
});

export const addonInterface = builder.getInterface();
