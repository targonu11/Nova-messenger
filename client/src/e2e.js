export const E2E_ENABLED = true;

const KEY_STORAGE = 'nova_e2e_keypair';

async function getAlgo() {
  return {
    name: 'ECDH',
    namedCurve: 'P-256',
  };
}

export async function ensureKeyPair() {
  if (!E2E_ENABLED || typeof window === 'undefined' || !window.crypto?.subtle) return null;
  try {
    const stored = localStorage.getItem(KEY_STORAGE);
    if (stored) {
      const { publicKey, privateKey } = JSON.parse(stored);
      const algo = await getAlgo();
      const pub = await crypto.subtle.importKey(
        'jwk',
        publicKey,
        algo,
        true,
        []
      );
      const priv = await crypto.subtle.importKey(
        'jwk',
        privateKey,
        algo,
        false,
        ['deriveKey', 'deriveBits']
      );
      return { publicKey: pub, privateKey: priv, jwkPublic: publicKey };
    }
  } catch (e) {
    console.warn('Failed to restore e2e keypair, generating new', e);
  }

  const algo = await getAlgo();
  const keyPair = await crypto.subtle.generateKey(algo, true, ['deriveKey', 'deriveBits']);
  const jwkPublic = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const jwkPrivate = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  localStorage.setItem(KEY_STORAGE, JSON.stringify({ publicKey: jwkPublic, privateKey: jwkPrivate }));
  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey, jwkPublic };
}

export async function importRemotePublicKey(jwk) {
  if (!E2E_ENABLED || !jwk) return null;
  const algo = await getAlgo();
  return crypto.subtle.importKey('jwk', jwk, algo, true, []);
}

async function deriveAesKey(myPrivateKey, theirPublicKey) {
  const algo = await getAlgo();
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: theirPublicKey,
    },
    myPrivateKey,
    256
  );
  const raw = new Uint8Array(bits);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(str) {
  const bin = atob(str);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

export async function encryptForPeer(myPrivateKey, theirPublicJwk, plaintext) {
  if (!E2E_ENABLED || !plaintext) return plaintext;
  try {
    const theirPub = await importRemotePublicKey(theirPublicJwk);
    if (!theirPub) return plaintext;
    const aes = await deriveAesKey(myPrivateKey, theirPub);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, encoded);
    return 'e2e:' + bufToBase64(iv) + ':' + bufToBase64(ct);
  } catch (e) {
    console.error('encryptForPeer failed', e);
    return plaintext;
  }
}

export async function decryptFromPeer(myPrivateKey, theirPublicJwk, ciphertext) {
  if (!E2E_ENABLED || typeof ciphertext !== 'string' || !ciphertext.startsWith('e2e:')) return ciphertext;
  try {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) return ciphertext;
    const iv = new Uint8Array(base64ToBuf(parts[1]));
    const data = base64ToBuf(parts[2]);
    const theirPub = await importRemotePublicKey(theirPublicJwk);
    if (!theirPub) return ciphertext;
    const aes = await deriveAesKey(myPrivateKey, theirPub);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aes, data);
    return new TextDecoder().decode(pt);
  } catch (e) {
    console.error('decryptFromPeer failed', e);
    return ciphertext;
  }
}

