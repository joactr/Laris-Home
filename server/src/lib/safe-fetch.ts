import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 3;
const MAX_BYTES = Number(process.env.OUTBOUND_FETCH_MAX_BYTES || 2 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.OUTBOUND_FETCH_TIMEOUT_MS || 15_000);

const BLOCKED_V4 = [
    [0, 0, 0, 0, 8],
    [10, 0, 0, 0, 8],
    [100, 64, 0, 0, 10],
    [127, 0, 0, 0, 8],
    [169, 254, 0, 0, 16],
    [172, 16, 0, 0, 12],
    [192, 0, 0, 0, 24],
    [192, 168, 0, 0, 16],
    [198, 18, 0, 0, 15],
    [224, 0, 0, 0, 4],
    [240, 0, 0, 0, 4],
] as const;

export class UnsafeUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsafeUrlError';
    }
}

function ipv4ToInt(address: string) {
    return address.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

export function isPrivateAddress(address: string): boolean {
    const mapped = address.startsWith('::ffff:') ? address.slice(7) : address;
    const version = isIP(mapped);

    if (version === 4) {
        const value = ipv4ToInt(mapped);
        return BLOCKED_V4.some(([a, b, c, d, bits]) => {
            const network = (((a << 24) | (b << 16) | (c << 8) | d) >>> 0);
            const mask = (0xffffffff << (32 - bits)) >>> 0;
            return (value & mask) === (network & mask);
        });
    }

    if (version === 6) {
        const normalized = mapped.toLowerCase();
        if (normalized === '::' || normalized === '::1') return true;
        if (/^f[cd]/.test(normalized)) return true;
        if (/^fe[89ab]/.test(normalized)) return true;
        return false;
    }

    return false;
}

async function assertPublicHost(hostname: string) {
    if (isIP(hostname)) {
        if (isPrivateAddress(hostname)) {
            throw new UnsafeUrlError('URL points to a private address.');
        }
        return;
    }

    const records = await lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) {
        throw new UnsafeUrlError('Could not resolve the URL domain.');
    }
    // ponytail: DNS se resuelve y luego fetch vuelve a resolver (ventana de rebinding).
    // Si esto deja de ser una app domestica, fijar la IP con un dispatcher de undici.
    if (records.some((record) => isPrivateAddress(record.address))) {
        throw new UnsafeUrlError('URL points to a private address.');
    }
}

async function readCapped(response: Response) {
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) {
        throw new UnsafeUrlError('Response is too large.');
    }

    if (!response.body) {
        return '';
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_BYTES) {
            await reader.cancel();
            throw new UnsafeUrlError('Response is too large.');
        }
        chunks.push(value);
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

export async function fetchTextSafely(rawUrl: string): Promise<{ html: string; finalUrl: string }> {
    let current = rawUrl;
    const signal = AbortSignal.timeout(TIMEOUT_MS);

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        let url: URL;
        try {
            url = new URL(current);
        } catch {
            throw new UnsafeUrlError('Recipe URL is not valid.');
        }

        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new UnsafeUrlError('Only http or https URLs are allowed.');
        }

        await assertPublicHost(url.hostname);

        const response = await fetch(url, {
            redirect: 'manual',
            signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml',
            },
        });

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) {
                throw new UnsafeUrlError('Redirect has no destination.');
            }
            current = new URL(location, url).toString();
            continue;
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status}`);
        }

        return { html: await readCapped(response), finalUrl: response.url || url.toString() };
    }

    throw new UnsafeUrlError('Too many redirects.');
}