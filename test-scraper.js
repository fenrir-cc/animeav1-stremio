import { getLatestEpisodes, searchCatalog, getAnimeMeta, getEpisodeStreams } from './src/scraper.js';

async function runTests() {
    console.log('=== TEST 1: getLatestEpisodes ===');
    const latest = await getLatestEpisodes();
    console.log(`Found ${latest.length} latest items:`);
    console.log(latest.slice(0, 3));

    console.log('\n=== TEST 2: searchCatalog ("one piece") ===');
    const searchResults = await searchCatalog('one piece');
    console.log(`Found ${searchResults.length} search results:`);
    console.log(searchResults.slice(0, 3));

    console.log('\n=== TEST 3: getAnimeMeta ("one-piece") ===');
    const meta = await getAnimeMeta('one-piece');
    if (meta) {
        console.log(`Title: ${meta.name}`);
        console.log(`Synopsis: ${meta.description.substring(0, 100)}...`);
        console.log(`Episodes count: ${meta.videos ? meta.videos.length : 0}`);
        if (meta.videos && meta.videos.length > 0) {
            console.log('First video:', meta.videos[0]);
            console.log('Last video:', meta.videos[meta.videos.length - 1]);
        }
    } else {
        console.error('Failed to fetch meta for one-piece');
    }

    console.log('\n=== TEST 4: getEpisodeStreams ("one-piece", 1177) ===');
    const streams = await getEpisodeStreams('one-piece', 1177);
    console.log(`Found ${streams.length} stream links:`);
    console.log(streams);

    console.log('\n✅ ALL TESTS COMPLETED');
}

runTests();
