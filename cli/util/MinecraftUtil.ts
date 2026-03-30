import crypto from 'node:crypto';

import { SocksClient } from 'socks';

import DataUtil from './DataUtil';
import EncryptionUtil from './EncryptionUtil';

import { ConnectionResult } from '../types.d';

const banKeywords = ['banned', 'ban', 'suspended', 'blacklisted', 'permanently', 'unfair advantages', 'appeal'];
const alreadyOnlineKeywords = ['failed to authenticate your connection', 'double login', 'already connected', 'another location'];

class MinecraftUtil {
    async getProfile(accessToken: string): Promise<{ ok: true, name: string, id: string } | { ok: false, status: number }> {
        try {
            const response = await fetch('https://api.minecraftservices.com/minecraft/profile', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(10000),
                proxy: Bun.env.LOW_HTTPS_PROXY
            });

            if (response.status === 200) {
                const res = await response.json() as any;
                return { ok: true, name: res.name, id: res.id };
            } else return { ok: false, status: response.status };
        } catch (e) {
            console.log(`profile fetch error: ${e}`);
            return { ok: false, status: 0 };
        }
    }

    checkBan = (host: string, port: number, accessToken: string, username: string, profileId: string) => new Promise<{ connectionResult: ConnectionResult, message?: string }>(async (resolve) => {
        const url = new URL(Bun.env.SOCKS_PROXY);

        const { socket } = await SocksClient.createConnection({
            proxy: {
                host: url.hostname,
                port: Number(url.port),
                type: 5,
                ...(url.username && url.password && {
                    userId: url.username,
                    password: url.password
                })
            },
            command: 'connect',
            destination: { host, port }
        });

        socket.setTimeout(10000);

        socket.on('error', (err) => console.log('socket error', err));

        const handshakeData = Buffer.concat([
            DataUtil.packVarInt(47),
            DataUtil.packString(host),
            Buffer.from([(port >> 8) & 0xFF, port & 0xFF]),
            DataUtil.packVarInt(2)
        ]);

        const handshakePacket = Buffer.concat([
            DataUtil.packVarInt(0x00),
            handshakeData
        ]);

        const packetWithLength = Buffer.concat([
            DataUtil.packVarInt(handshakePacket.length),
            handshakePacket
        ]);

        const loginPacket = Buffer.concat([
            DataUtil.packVarInt(0x00),
            DataUtil.packString(username)
        ]);

        const loginWithLength = Buffer.concat([
            DataUtil.packVarInt(loginPacket.length),
            loginPacket
        ]);

        socket.once('data', async (data) => {
            let { offset } = DataUtil.unpackVarInt(data, 0);
            let { value: packetId, offset: newOffset } = DataUtil.unpackVarInt(data, offset);

            if (packetId === 0x00) {
                let { value: reasonLength, offset: reasonOffset } = DataUtil.unpackVarInt(data, newOffset);
                if (reasonOffset + reasonLength <= data.length) {
                    const reasonBytes = data.slice(reasonOffset, reasonOffset + reasonLength);
                    let reason = reasonBytes.toString('utf-8');

                    try {
                        const reasonJson = JSON.parse(reason);
                        if (typeof reasonJson === 'object' && reasonJson !== null) {
                            if ('text' in reasonJson) reason = reasonJson['text'];
                            else if ('extra' in reasonJson) reason = reasonJson['extra'].map((part: { text?: string }) => part.text || '').join('');
                        }
                    } catch { }

                    const reasonLower = reason.toLowerCase();

                    if (banKeywords.some(keyword => reasonLower.includes(keyword))) resolve({ connectionResult: ConnectionResult.Banned, message: reason });
                    else if (alreadyOnlineKeywords.some(keyword => reasonLower.includes(keyword))) resolve({ connectionResult: ConnectionResult.AlreadyOnline, message: reason });
                    else console.log(`${username}: disconnected: ${reason}`);

                    socket.end();
                } else console.log('disconnected: invalid disconnect packet format');
            } else if (packetId === 0x01) {
                let { value: serverIdLength, offset: serverIdOffset } = DataUtil.unpackVarInt(data, newOffset);
                const serverIdBytes = data.slice(serverIdOffset, serverIdOffset + serverIdLength);
                const serverId = serverIdBytes.toString('utf-8');
                let offsetAfterServerId = serverIdOffset + serverIdLength;

                let { value: publicKeyLength, offset: publicKeyOffset } = DataUtil.unpackVarInt(data, offsetAfterServerId);
                const publicKey = data.slice(publicKeyOffset, publicKeyOffset + publicKeyLength);
                let offsetAfterPublicKey = publicKeyOffset + publicKeyLength;

                let { value: verifyTokenLength, offset: verifyTokenOffset } = DataUtil.unpackVarInt(data, offsetAfterPublicKey);
                const verifyToken = data.slice(verifyTokenOffset, verifyTokenOffset + verifyTokenLength);

                const sharedSecret = crypto.randomBytes(16);
                const serverHash = EncryptionUtil.createServerIdHash(serverId, sharedSecret, publicKey);

                let retries = 0;

                const attempt = async () => {
                    try {
                        const response = await fetch('https://sessionserver.mojang.com/session/minecraft/join', {
                            method: 'POST',
                            body: JSON.stringify({
                                accessToken,
                                selectedProfile: profileId,
                                serverId: serverHash
                            }),
                            headers: {
                                'accept': 'application/json',
                                'user-agent': 'windows',
                                'Content-Type': 'application/json'
                            },
                            signal: AbortSignal.timeout(10000),
                            proxy: Bun.env.HIGH_HTTPS_PROXY
                        });

                        if (response.status === 204) {
                            const publicKeyObj = crypto.createPublicKey({
                                key: publicKey,
                                format: 'der',
                                type: 'spki'
                            });

                            const encryptedSecret = crypto.publicEncrypt({
                                key: publicKeyObj,
                                padding: crypto.constants.RSA_PKCS1_PADDING
                            }, sharedSecret);

                            const encryptedVerifyToken = crypto.publicEncrypt({
                                key: publicKeyObj,
                                padding: crypto.constants.RSA_PKCS1_PADDING
                            }, verifyToken);

                            const encResponseData = Buffer.concat([
                                DataUtil.packVarInt(encryptedSecret.length),
                                encryptedSecret,
                                DataUtil.packVarInt(encryptedVerifyToken.length),
                                encryptedVerifyToken
                            ]);

                            const encResponsePacket = Buffer.concat([
                                DataUtil.packVarInt(0x01),
                                encResponseData
                            ]);

                            const encResponseWithLength = Buffer.concat([
                                DataUtil.packVarInt(encResponsePacket.length),
                                encResponsePacket
                            ]);

                            socket.once('data', (data) => {
                                const decrypted = EncryptionUtil.decryptCFB8(sharedSecret, sharedSecret, data);

                                try {
                                    let { offset: finalOffset } = DataUtil.unpackVarInt(decrypted, 0);
                                    let { value: finalPacketId, offset: newFinalOffset } = DataUtil.unpackVarInt(decrypted, finalOffset);

                                    if (finalPacketId === 0x00) {
                                        let { value: reasonLength, offset: reasonOffset } = DataUtil.unpackVarInt(decrypted, newFinalOffset);
                                        if (reasonOffset + reasonLength <= decrypted.length) {
                                            const reasonBytes = decrypted.slice(reasonOffset, reasonOffset + reasonLength);
                                            let reason = reasonBytes.toString('utf-8');

                                            try {
                                                const reasonJson = JSON.parse(reason);
                                                if (typeof reasonJson === 'object' && reasonJson !== null) {
                                                    if ('text' in reasonJson && reasonJson.text.length) {
                                                        reason = reasonJson['text'];
                                                    } else if ('extra' in reasonJson) {
                                                        reason = reasonJson['extra'].map((part: { text?: string }) => part.text || '').join('');
                                                    }
                                                }
                                            } catch { }

                                            const reasonLower = reason.toLowerCase();

                                            if (banKeywords.some(keyword => reasonLower.includes(keyword))) resolve({ connectionResult: ConnectionResult.Banned, message: reason });
                                            else if (alreadyOnlineKeywords.some(keyword => reasonLower.includes(keyword))) resolve({ connectionResult: ConnectionResult.AlreadyOnline, message: reason });
                                            else console.log(`${username}: disconnected: ${reason}`);

                                            socket.end();
                                        } else console.log('disconnected after encryption: invalid disconnect packet format');
                                    } else if (finalPacketId === 0x02) {
                                        resolve({ connectionResult: ConnectionResult.Unbanned });
                                        if (socket.writable) socket.end();
                                    } else if (finalPacketId === 0x03) {
                                        resolve({ connectionResult: ConnectionResult.Unbanned });
                                        if (socket.writable) socket.end();
                                    } else {
                                        console.log(`received packet 0x${finalPacketId.toString(16).padStart(2, '0')} - conn established`);
                                        if (socket.writable) socket.end();
                                    }
                                } catch (err) {
                                    console.log(`error parsing encrypted packet: ${err}`);
                                    let { offset } = DataUtil.unpackVarInt(data, 0);
                                    let { value: packetId } = DataUtil.unpackVarInt(data, offset);
                                    console.log(`received unencrypted packet ID: 0x${packetId.toString(16).padStart(2, '0')}`);
                                    socket.end();
                                }
                            });

                            socket.write(encResponseWithLength);
                        } else console.log(`failed to authenticate with the server. Status code: ${response.status}`);
                    } catch (e: any) {
                        if (e.toString().includes('TimeoutError') || e.toString().includes('closed unexpectedly')) {
                            retries++;
                            if (retries < 10) attempt();
                            else console.log('max authentication retries reached.');
                        }

                        console.log(`authentication error: ${e}`);
                    }
                };

                attempt();
            }
        });

        socket.write(packetWithLength);
        socket.write(loginWithLength);
    });
}

export default MinecraftUtil;