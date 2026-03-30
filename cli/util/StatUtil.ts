class StatUtil {
    async getPlanckeStats(username: string): Promise<string> {
        const planckeReq = await fetch(`https://plancke.io/hypixel/player/stats/${username}#BedWars`, {
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'accept-language': 'en-US,en;q=0.9',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
            }
        });

        const plancke = await planckeReq.text();

        const metaContent = plancke.match(/description" content="(.*?)"/)?.[1];
        const metaParts = metaContent?.split('. ') || [];
        const rank = metaParts[0]?.match(/\[(.*?)\]/)?.[1] || '';

        const networkLevel = plancke.match(/<b>Level:<\/b> ([0-9,]+)<br\/>\<b>Karma:/)?.[1];
        const bwLevel = plancke.match(/([0-9,]+)\<\/li\>\<li\>\<br\/\>\<\/li\>\<li\>\<b\>Diamonds Collected:/)?.[1];
        const swLevel = plancke.match(/<b>Level:<\/b> ([0-9,]+)\<\/li\>\<li\>\<b\>Prestige:/)?.[1];

        const parsedNWLevel = networkLevel ? Math.round(Number(networkLevel.replace(/,/g, ''))) : 0;

        return `[UNBANNED] ${rank ? `[${rank}] ` : ''}${username} ${!parsedNWLevel && !bwLevel && !swLevel ? '[fresh] ' : ''}${parsedNWLevel ? `[network: ${parsedNWLevel || 0}] ` : ''}${bwLevel ? `[bw: ${bwLevel || 0}] ` : ''}${swLevel ? `[sw: ${swLevel || 0}]` : ''}`;
    }
}

const statUtil = new StatUtil();
export default statUtil;