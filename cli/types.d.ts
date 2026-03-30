declare module 'bun' {
    interface Env {
        LOW_HTTPS_PROXY: string;
        HIGH_HTTPS_PROXY: string;
        SOCKS_PROXY: string;

        WAIT_BETWEEN: string;
    }
}

export enum ConnectionResult {
    Banned,
    Unbanned,
    AlreadyOnline
}