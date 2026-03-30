import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import https from 'node:https';
import { IncomingHttpHeaders } from 'node:http';

import statUtil from './util/StatUtil';

const req = (url: string, params: { method?: string, headers?: Record<string, string>, body?: any } = {}): Promise<{
    status: number;
    headers: IncomingHttpHeaders;
    body: string;
}> => new Promise((resolve, reject) => {
    const u = new URL(url);

    const r = https.request({
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: params.method || 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0', ...(params.headers || {}) },
        maxHeaderSize: 32768
    }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: data }));
    });

    r.on('error', reject);
    if (params.body) r.write(params.body);
    r.end();
});

const parseForm = (html: string): { action: string, inputs: [string, string][] } => ({
    action: html.match(/action="([^"]+)"/)?.[1]!,
    inputs: [...html.matchAll(/<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/g)].map(([, name, value]) => [name, value])
});

const getXBL = async (cookie: string) => {
    const jar = new Map();

    const jarCookies = (hostname: string, extra = '') => {
        const stored = jar.get(hostname) ?? '';
        return [stored, extra].filter(Boolean).join('; ');
    }

    const storeCookies = (hostname: string, headers: IncomingHttpHeaders) => {
        const sc = headers['set-cookie'];
        if (!sc) return;

        const existing = new Map((jar.get(hostname) ?? '').split('; ').filter(Boolean).map((c: string) => [c.split('=')[0], c]));

        for (const raw of sc) {
            const pair = raw.split(';')[0];
            existing.set(pair.split('=')[0], pair);
        }

        jar.set(hostname, [...existing.values()].join('; '));
    }

    const r1 = await req('https://sisu.xboxlive.com/connect/XboxLive/?state=login&cobrandId=8058f65d-ce06-4c30-9559-473c9275a65d&tid=896928775&ru=https://www.minecraft.net/en-us/login&aid=1142970254', { headers: { Cookie: `__Host-MSAAUTH=${cookie}` } });
    storeCookies('sisu.xboxlive.com', r1.headers);
    if (r1.status !== 302 || !r1.headers.location) throw new Error(`sisu step 1 returned ${r1.status}`);

    const r1loc = new URL(r1.headers.location);
    const r2init = await req(r1.headers.location);
    storeCookies(r1loc.hostname, r2init.headers);

    const r2raw = await req(r1.headers.location, { headers: { Cookie: jarCookies(r1loc.hostname, `__Host-MSAAUTH=${cookie}`) } });
    storeCookies(r1loc.hostname, r2raw.headers);

    let r2 = r2raw;
    if (r2.status === 200 && r2.body.includes('fmHF')) {
        const { action, inputs } = parseForm(r2.body);
        if (!action) throw new Error('no form action found in sisu response');

        const actionUrl = new URL(action);
        r2 = await req(action, {
            method: 'POST',
            headers: {
                Cookie: jarCookies(actionUrl.hostname, `__Host-MSAAUTH=${cookie}`),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams(inputs).toString()
        });
        storeCookies(actionUrl.hostname, r2.headers);
    }

    if (r2.status !== 302 || !r2.headers.location) throw new Error(`sisu step 2 returned ${r2.status}`);

    const r2loc = new URL(r2.headers.location);
    const r3 = await req(r2.headers.location, { headers: { Cookie: jarCookies(r2loc.hostname, `__Host-MSAAUTH=${cookie}`) } });
    storeCookies(r2loc.hostname, r3.headers);
    if (r3.status !== 302 || !r3.headers.location) throw new Error(`sisu step 3 returned ${r3.status}`);

    const r3loc = new URL(r3.headers.location);
    const r4 = await req(r3.headers.location, { headers: { Cookie: jarCookies(r3loc.hostname) } });
    storeCookies(r3loc.hostname, r4.headers);
    if (r4.status !== 302) throw new Error(`sisu step 4 returned ${r4.status}: ${r4.body.slice(0, 200)}`);

    const loc = r4.headers.location;
    const match = loc?.match(/accessToken=([A-Za-z0-9\-_]+)/);
    if (!match) throw new Error(`no accessToken in final redirect: ${loc}`);

    const b64 = match[1] + '='.repeat((4 - match[1].length % 4) % 4);
    const decoded = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as {
        Item1: string;
        Item2: {
            Token: string;
            DisplayClaims?: {
                xui?: { uhs: string }[];
            }
        }
    }[];

    const uhs = decoded[0]?.Item2?.DisplayClaims?.xui?.[0]?.uhs;
    if (!uhs) throw new Error('no uhs');

    const mcEntry = decoded.find(x => x.Item1 === 'rp://api.minecraftservices.com/');
    if (!mcEntry) throw new Error('no mc xsts token');

    return { xbl: `XBL3.0 x=${uhs};${mcEntry.Item2.Token}`, decoded, uhs };
}

const getProfile = async (xbl: string): Promise<{ name: string, token: string }> => {
    const { body } = await req('https://api.minecraftservices.com/authentication/login_with_xbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityToken: xbl, ensureLegacyEnabled: true }),
    });

    const { access_token } = JSON.parse(body);

    const profile = await req('https://api.minecraftservices.com/minecraft/profile', {
        headers: { Authorization: `Bearer ${access_token}` },
    });

    const body2 = JSON.parse(profile.body);
    return { name: body2.name, token: access_token };
}

import { createInterface } from 'node:readline';

console.log('enter a cookie file:\n');

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', async (line) => {
    if (line.includes('__Host-MSAAUTHP')) {
        rl.close();
        console.log('\nrunning xbox live...');

        const cookie = line.split('__Host-MSAAUTHP')[1].trim();

        const { xbl } = await getXBL(cookie);
        console.log('got xbox live token, fetching profile...');

        const profile = await getProfile(xbl);
        console.log('got profile, fetching stats...');

        const stats = await statUtil.getPlanckeStats(profile.name);
        console.log('');

        const output = `${stats} mctoken: ${profile.token}`;

        console.log(output);
        console.log('');
        const tempSave = path.join(os.tmpdir(), `cookie_${profile.name}.txt`);
        fs.writeFileSync(tempSave, output);
        console.log('saved to ' + tempSave);
    }
});