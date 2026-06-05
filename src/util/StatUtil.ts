const statMode = 'abyss';

class StatUtil {
    getStats(uuid: string, username: string): Promise<string> {
        if (statMode === 'abyss') return this.getAbyssStats(uuid);
        else if (statMode === 'plancke') return this.getPlanckeStats(username);
        else throw new Error('invalid stat mode');
    }

    async getAbyssStats(uuid: string): Promise<string> {
        const abyssReq = await fetch(`http://api.abyssoverlay.com/player?uuid=${uuid}`, {
            headers: {
                'user-agent': 'node-ao/2.0.3'
            }
        });

        const abyss = await abyssReq.json() as { player: any };

        const rawRank = abyss.player.rank || abyss.player.monthlyPackageRank || abyss.player.packageRank || '';
        const rank = rawRank.replace('SUPERSTAR', 'MVP++').replace('_PLUS', '+').trim();

        const networkLevel = abyss.player.networkExp ? Math.floor((Math.sqrt((2 * abyss.player.networkExp) + 30625) / 50) - 2.5) : 0;

        const bwLevel = abyss.player.achievements?.bedwars_level ? abyss.player.achievements.bedwars_level : 0;
        const swLevel = abyss.player.achievements?.skywars_you_re_a_star ? abyss.player.achievements.skywars_you_re_a_star : 0;

        return `${rank ? `[${rank}] ` : ''}${abyss.player.displayname} ${!networkLevel && !bwLevel && !swLevel ? '[fresh] ' : ''}${networkLevel ? `[network: ${networkLevel}] ` : ''}${bwLevel ? `[bw: ${bwLevel}] ` : ''}${swLevel ? `[sw: ${swLevel}] ` : ''}`.trim();
    }

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

        return `${rank ? `[${rank}] ` : ''}${username} ${!parsedNWLevel && !bwLevel && !swLevel ? '[fresh] ' : ''}${parsedNWLevel ? `[network: ${parsedNWLevel || 0}] ` : ''}${bwLevel ? `[bw: ${bwLevel || 0}] ` : ''}${swLevel ? `[sw: ${swLevel || 0}]` : ''}`.trim();
    }
}

const statUtil = new StatUtil();
export default statUtil;