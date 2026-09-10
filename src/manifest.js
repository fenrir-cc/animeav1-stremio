export const manifest = {
    id: 'com.stremio.animeav1',
    version: '1.4.0',
    name: 'AnimeAV1',
    description: 'Disfruta de animes en HD y Sub Español directamente desde AnimeAV1 (animeav1.com)',
    resources: [
        {
            name: 'catalog',
            types: ['series', 'anime', 'movie'],
            idPrefixes: ['animeav1_']
        },
        {
            name: 'meta',
            types: ['series', 'anime', 'movie'],
            idPrefixes: ['animeav1:']
        },
        {
            name: 'stream',
            types: ['series', 'anime', 'movie'],
            idPrefixes: ['animeav1:', 'tt']
        }
    ],
    types: ['series', 'anime', 'movie'],
    idPrefixes: ['animeav1:', 'tt'],
    catalogs: [
        {
            type: 'series',
            id: 'animeav1_latest',
            name: 'AnimeAV1 - Últimos Episodios'
        },
        {
            type: 'series',
            id: 'animeav1_catalog',
            name: 'AnimeAV1 - Catálogo',
            extra: [
                {
                    name: 'search',
                    isRequired: false
                }
            ]
        }
    ],
    logo: 'https://animeav1.com/favicon.png',
    background: 'https://cdn.animeav1.com/backdrops/197.jpg'
};
