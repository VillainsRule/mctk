class DataUtil {
    static convertToBufferIfNeeded(input: string | Buffer<ArrayBuffer>): Buffer<ArrayBuffer> {
        if (typeof input === 'string') {
            const buf = Buffer.alloc(input.length);
            for (let i = 0; i < input.length; i++) buf[i] = input.charCodeAt(i);
            return buf;
        } else return input;
    }

    static packVarInt(value: number): Buffer<ArrayBuffer> {
        const data = [];
        while (value > 0x7F) {
            data.push((value & 0x7F) | 0x80);
            value >>>= 7;
        }
        data.push(value & 0x7F);
        return Buffer.from(data);
    }

    static unpackVarInt(input: string | Buffer<ArrayBuffer>, offset = 0): { value: number, offset: number } {
        const data = this.convertToBufferIfNeeded(input);

        let value = 0;
        let position = 0;
        let currentByte = 0;

        while (true) {
            if (offset >= data.length) break;

            currentByte = data[offset];
            value |= (currentByte & 0x7F) << position;

            if ((currentByte & 0x80) === 0) break;

            position += 7;
            offset += 1;

            if (position >= 32) {
                console.trace(data);
                throw new Error('VarInt is too big; stack above');
            }
        }

        return { value, offset: offset + 1 };
    }

    static packString(text: string): Buffer<ArrayBuffer> {
        const encoded = Buffer.from(text, 'utf-8');
        return Buffer.concat([this.packVarInt(encoded.length), encoded]);
    }
}

export default DataUtil;