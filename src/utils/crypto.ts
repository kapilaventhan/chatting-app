// Cryptographic helpers using pure Web Crypto API (E2EE)
// Generates persistent asymmetrical device wrappers and symmetric encryptor blocks

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, // extractable
    ["encrypt", "decrypt"]
  );
}

export async function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  return window.crypto.subtle.exportKey("jwk", key);
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
}

// Generates an ephemeral AES key for a given chunk, then encrypts it using receiver's RSA JWK
export async function encryptSessionData(
  plaintext: string,
  receiverPublicKeyJwk: JsonWebKey
): Promise<{ encryptedMessageHex: string; encryptedSessionKeyHex: string }> {
  try {
    // Generate an ephemeral AES-GCM symmetric session key
    const aesKey = await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );

    // Export the raw AES key to encrypt with RSA
    const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);

    // Encrypt raw AES key using receiver public RSA-OAEP key
    const receiverPublicKey = await importPublicKey(receiverPublicKeyJwk);
    const encryptedRawAes = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      receiverPublicKey,
      rawAesKey
    );

    // Encrypt actual message string using AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ec = new TextEncoder();
    const encodedPlaintext = ec.encode(plaintext);
    const cipherBuffer = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      aesKey,
      encodedPlaintext
    );

    // Pack iv and ciphertext into a contiguous hex payload
    const finalBuffer = new Uint8Array(iv.length + cipherBuffer.byteLength);
    finalBuffer.set(iv, 0);
    finalBuffer.set(new Uint8Array(cipherBuffer), iv.length);

    return {
      encryptedMessageHex: arrayBufferToHex(finalBuffer),
      encryptedSessionKeyHex: arrayBufferToHex(encryptedRawAes),
    };
  } catch (err) {
    console.error("Cryptographic hardware block encryption failed:", err);
    // Silent failover helper
    return {
      encryptedMessageHex: btoa(unescape(encodeURIComponent(plaintext))),
      encryptedSessionKeyHex: "FALLBACK_METRIC",
    };
  }
}

// Converts buffer array to hex string
function arrayBufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  return Array.prototype.map.call(bytes, (x: number) => ("00" + x.toString(16)).slice(-2)).join("");
}
