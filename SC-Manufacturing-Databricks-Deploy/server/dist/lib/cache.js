import fs from 'fs';
import { CACHE_FILE } from './config.js';
const TTL_HOURS = Number(process.env.INSIGHTS_REFRESH_INTERVAL_HOURS || 24);
const TTL_MS = TTL_HOURS * 3600 * 1000;
export function cacheGet(key) {
    try {
        if (!fs.existsSync(CACHE_FILE))
            return null;
        const store = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        const entry = store[key];
        if (!entry)
            return null;
        if (Date.now() - entry.ts > TTL_MS) {
            console.log(`[cache] EXPIRED key=${key.slice(0, 40)}`);
            return null;
        }
        console.log(`[cache] HIT key=${key.slice(0, 40)}`);
        return entry.data;
    }
    catch (e) {
        console.warn('[cache] read failed', e);
        return null;
    }
}
export function cacheGetAny() {
    try {
        if (!fs.existsSync(CACHE_FILE))
            return null;
        const store = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        for (const [key, entry] of Object.entries(store)) {
            if (key.startsWith('metrics_') && entry?.data)
                return entry.data;
            if (key.startsWith('{') && entry?.data?.kpis) {
                return entry.data;
            }
        }
        return null;
    }
    catch {
        return null;
    }
}
export function cacheSet(key, data) {
    try {
        let store = {};
        if (fs.existsSync(CACHE_FILE)) {
            store = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        }
        store[key] = { data, ts: Date.now() };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(store));
        console.log(`[cache] SAVED key=${key.slice(0, 40)}`);
    }
    catch (e) {
        console.warn('[cache] write failed', e);
    }
}
export function cacheInfo() {
    try {
        if (!fs.existsSync(CACHE_FILE))
            return { entry_count: 0, entries: [] };
        const store = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        const entries = Object.entries(store).map(([key, entry]) => ({
            key,
            age_min: Math.floor((Date.now() - entry.ts) / 60000),
            expired: Date.now() - entry.ts > TTL_MS,
        }));
        return { entry_count: entries.length, ttl_hours: TTL_HOURS, entries };
    }
    catch {
        return { entry_count: 0, entries: [] };
    }
}
/** Load all non-expired metrics_* entries from disk (for memory warm-up). */
export function cacheLoadAllMetrics() {
    try {
        if (!fs.existsSync(CACHE_FILE))
            return [];
        const store = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        const now = Date.now();
        return Object.entries(store)
            .filter(([key, entry]) => key.startsWith('metrics_') && entry?.data && now - entry.ts <= TTL_MS)
            .map(([key, entry]) => ({ key, data: entry.data, ts: entry.ts }));
    }
    catch {
        return [];
    }
}
