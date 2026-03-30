import crypto from 'node:crypto';

import DataUtil from './DataUtil';

class EncryptionUtil {
    static createServerIdHash(serverId: string, sharedSecret: Buffer<ArrayBuffer>, publicKey: string | Buffer<ArrayBuffer>): string {
        const sha1 = crypto.createHash('sha1');
        sha1.update(serverId, 'ascii');
        sha1.update(sharedSecret);
        sha1.update(publicKey);

        let digest = sha1.digest();

        if (digest[0] >= 0x80) {
            const digestArray = Array.from(digest);
            let carry = 1;
            for (let i = digestArray.length - 1; i >= 0; i--) {
                digestArray[i] = 0xff - digestArray[i] + carry;
                carry = digestArray[i] > 0xff ? 1 : 0;
                digestArray[i] &= 0xff;
            }
            digest = Buffer.from(digestArray);
            return '-' + digest.toString('hex').replace(/^0+/, '') || '0';
        } else return digest.toString('hex').replace(/^0+/, '') || '0';
    }

    static decryptCFB8(key: Buffer, iv: Buffer, inputData: string | Buffer<ArrayBuffer>): Buffer<ArrayBuffer> {
        const data = DataUtil.convertToBufferIfNeeded(inputData);

        const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
        cipher.setAutoPadding(false);

        const result = Buffer.alloc(data.length);
        let feedback = Buffer.from(iv);

        for (let i = 0; i < data.length; i++) {
            const encrypted = cipher.update(feedback);
            result[i] = data[i] ^ encrypted[0];
            feedback = Buffer.concat([feedback.slice(1), Buffer.from([data[i]])]);
        }

        return result;
    }
}

export default EncryptionUtil;