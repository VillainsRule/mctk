import fs from 'node:fs';
import path from 'node:path';

import MinecraftUtil from './util/MinecraftUtil';
import statUtil from './util/StatUtil';

import { ConnectionResult } from './types.d';

const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const lightGray = (text: string) => `\x1b[90m${text}\x1b[0m`;

const log = (...args: any[]) => console.log(`\x1b[90m[${new Date().toTimeString().slice(0, 8)}]\x1b[0m ${args[0]}`, ...args.slice(1));

const inputFile = path.join(import.meta.dirname, '..', 'input.txt');
const ouputFile = path.join(import.meta.dirname, '..', 'output.txt');

const knownNames: string[] = [];

const mainLoop = async (token: string, i: number) => {
    const mcConn = new MinecraftUtil();

    token = token.match(/mctoken: ?([a-zA-Z0-9._-]+)/)?.[1] || token;
    if (!token.startsWith('eyJ')) return log(red(`[${i}] [INVALID] No token provided.`));

    const profile = await mcConn.getProfile(token);
    if (!profile.ok) {
        if (profile.status === 401 || profile.status === 403) return log(red(`[${i}] [INVALID] Invalid token provided.`));
        else if (profile.status === 407) return log(red(`[${i}] [PROXY ERROR] Your LOW_HTTPS_PROXY is invalid.`));
        else if (profile.status === 0) return mainLoop(token, i);
        else return (log(red(`[${i}] [ERROR] unknown status code:`), profile));
    }

    if (knownNames.includes(profile.name)) return log(red(`[${i}] [DUPLICATE] ${profile.name} -> skipping...`));
    knownNames.push(profile.name);

    log(lightGray(`[${i}] ${profile.name} -> loading...`));

    try {
        const { connectionResult, message } = await mcConn.checkBan('mc.hypixel.net', 25565, token, profile.name, profile.id);
        if (connectionResult === ConnectionResult.Banned) log(red(`[${i}] [BANNED] ${profile.name} (${message?.slice(0, 30)}...)`));
        else if (connectionResult === ConnectionResult.AlreadyOnline) log(red(`[${i}] [ALREADY ONLINE] ${profile.name} (${message?.slice(0, 30)}...)`));
        else {
            const output = `[${i}] ${await statUtil.getPlanckeStats(profile.name)} mctoken: ${token}`;
            log(green(output));
            fs.appendFileSync(ouputFile, output + '\n');
        }
    } catch (e) {
        console.log(`connection error: ${e}`);
    }
};

const input = fs.readFileSync(inputFile, 'utf-8');
const token = input.split('\n').map(e => e.trim()).filter(e => e.length > 0);

for (const tok of token) {
    mainLoop(tok, token.indexOf(tok) + 1);
    await new Promise(r => setTimeout(r, Number(Bun.env.WAIT_BETWEEN)));
}