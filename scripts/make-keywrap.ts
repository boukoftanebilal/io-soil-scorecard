// Sets the sign-in that opens the app on a new computer (public/keywrap.json).
// Usage: tsx scripts/make-keywrap.ts <username> <password> <full name> <dataset key>
// The file holds the dataset key and the account name, AES-256-GCM encrypted under a key derived
// from "username:password" (PBKDF2-SHA-256, 600,000 iterations). Change the sign-in by running
// this again and rebuilding; the dataset bundle (seed.enc.json) does not need to change.
import { writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const [username, password, name, datasetKey] = process.argv.slice(2);
if (!username || !password || !name || !datasetKey) { console.error('usage: make-keywrap <username> <password> <full name> <dataset key>'); process.exit(1); }
const enc = new TextEncoder(), hex = (b: ArrayBuffer | Uint8Array) => Buffer.from(b as ArrayBuffer).toString('hex');
const iter = 600000, salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
const km = await crypto.subtle.importKey('raw', enc.encode(username.trim().toLowerCase() + ':' + password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, km, 256);
const key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt']);
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ key: datasetKey.trim(), name })));
writeFileSync(new URL('../public/keywrap.json', import.meta.url), JSON.stringify({ v: 1, iter, salt: hex(salt), iv: hex(iv), ct: Buffer.from(ct).toString('base64') }) + '\n');
console.log('wrote public/keywrap.json');
