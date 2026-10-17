// cadena (N10): what a digital good would look like on a chain — READY, NOT USED. No key, no network, no money here:
// which chain, who holds the signing key and who pays the mint are Pablo's decision (work/noche-20261018/
// N10-bienes-digitales.md §Decisión). Two pure functions:
//   metadatos(recibo)  → ERC-721 / ERC-1155 metadata JSON (EIP-721 «ERC721 Metadata JSON Schema» + the usual
//                        `attributes` of marketplaces): name, description, animation_url (the .glb), attributes.
//   vale(recibo, o)    → the EIP-712 typed data of a lazy-mint voucher («Vale»: to, tokenId, uri, expires) for a minter
//                        contract that mints only what a trusted signer signed (OpenZeppelin EIP712 + ECDSA pattern).
//                        Unsigned: signing it needs a secp256k1 key nobody has made.
// GDPR (EDPB Guidelines 02/2025 v2.0): a chain never forgets, so NOTHING that comes from the person goes there — not the
// guest id, not their name, not a hash of the receipt (it contains the guest id; a hash of personal data is still
// personal data). The good's id in the receipt is an HMAC over the guest id too, so the token id is NOT derived from
// it: the minter gives a plain serial number at claim time and the world keeps the link receipt ↔ token off-chain.
// The only thing about the owner on a chain would be the wallet address THEY chose to claim to.
import type { Recibo } from "./recibos.ts";

/** Testnets the design names (chain ids from chainlist / the networks' docs). The default is a placeholder, not a choice. */
export const REDES_PRUEBA = { "base-sepolia": 84532, "polygon-amoy": 80002, "arbitrum-sepolia": 421614, "optimism-sepolia": 11155420 } as const;
export type RedPrueba = keyof typeof REDES_PRUEBA;
const SIN_CONTRATO = "0x0000000000000000000000000000000000000000";

/** ERC-721 metadata of a good: what a wallet or a marketplace shows. `base` = the world's public origin, where its
 * models live (/a/<sha256>.glb); none = the receipt's `mundo` over https (or no model link for «local»). */
export function metadatos(r: Recibo, base?: string): Record<string, unknown> {
  const origen = base ?? (r.mundo && r.mundo !== "local" ? `https://${r.mundo}` : "");
  const atributos = [{ trait_type: "Mundo", value: r.mundo }, { trait_type: "Misión", value: r.mision }, { trait_type: "Licencia del arte", value: r.objeto.licencia || "sin indicar" }];
  return {
    name: r.objeto.nombre,
    description: r.objeto.descripcion || `Un objeto de ${r.mundo}, recompensa de la misión «${r.mision}».`,
    ...(r.objeto.modelo && origen ? { animation_url: `${origen.replace(/\/$/, "")}/a/${r.objeto.modelo}.glb` } : {}),
    attributes: atributos,
    properties: { objeto: r.objeto.id, emisor: r.emisor, licencia: r.objeto.licencia || null, nota: "Tener este token no da los derechos de autor de su arte: mira su licencia." },
  };
}

/** The EIP-712 typed data of a lazy-mint voucher for one good (eth_signTypedData_v4 shape), unsigned. `para` = the wallet
 * the owner chose (null until they claim); `numero` = the token id the minter gives (a serial, never from the receipt). */
export function vale(r: Recibo, o: { numero: number | bigint; uri: string; para?: string | null; red?: RedPrueba; contrato?: string; caducaS?: number }): Record<string, unknown> {
  const red = o.red ?? "base-sepolia";
  return {
    types: {
      EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }],
      Vale: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "uri", type: "string" }, { name: "expires", type: "uint256" }],
    },
    primaryType: "Vale",
    domain: { name: "Numinia Bienes", version: "1", chainId: REDES_PRUEBA[red], verifyingContract: o.contrato ?? SIN_CONTRATO },
    message: { to: o.para ?? null, tokenId: String(o.numero), uri: o.uri, expires: String(o.caducaS ?? 0) },
    nota: `Sin firmar: firmarlo necesita una clave secp256k1 en la que confíe el contrato (decisión de Pablo). Objeto «${r.objeto.nombre}» de ${r.mundo}.`,
  };
}
