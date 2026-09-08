export const manifest = {
    id: 'com.stremio.animeav1',
    version: '1.1.0',
    name: 'AnimeAV1',
    description: 'Disfruta de animes en HD y Sub Español directamente desde AnimeAV1 (animeav1.com)',
    resources: [
        'catalog',
        'meta',
        {
            name: 'stream',
            types: ['anime', 'series', 'movie'],
            idPrefixes: ['animeav1:', 'tt']
        }
    ],
    types: ['anime', 'series', 'movie'],
    idPrefixes: ['animeav1:', 'tt'],
    catalogs: [
        {
            type: 'anime',
            id: 'animeav1_latest',
            name: 'AnimeAV1 - Últimos Episodios'
        },
        {
            type: 'anime',
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
