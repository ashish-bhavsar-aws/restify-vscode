import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  ntHash,
  ntlmV2Hash,
  buildNtlmType1,
  parseNtlmType2,
  buildNtlmType3,
  parseWwwAuthenticateNtlm,
  ntlmAuthorizationHeader,
} from "../../src/core/ntlm";

const hex = (buf: Buffer): string => buf.toString("hex");
const fromHex = (s: string): Buffer => Buffer.from(s, "hex");

describe("ntlm hashing (F12)", () => {
  it("ntHash matches the well-known '123456' NT hash", () => {
    // 32ed87bdb5fdc5e9cba88547376818d4 is the published NT hash of "123456".
    expect(hex(ntHash("123456"))).toBe("32ed87bdb5fdc5e9cba88547376818d4");
  });

  it("ntlmV2Hash uses the uppercased username + domain (UTF-16LE)", () => {
    const nt = ntHash("Password");
    const identity = Buffer.concat([
      Buffer.from("USER", "utf16le"),
      Buffer.from("Domain", "utf16le"),
    ]);
    expect(hex(ntlmV2Hash("Password", "User", "Domain"))).toBe(
      hex(createHmac("md5", nt).update(identity).digest()),
    );
  });

  it("md4 handles multi-block inputs", () => {
    // 80-char input crosses two 64-byte blocks; NT hash must still be 16 bytes.
    const out = ntHash("x".repeat(80));
    expect(out).toHaveLength(16);
    expect(hex(out)).toHaveLength(32);
  });
});

describe("ntlm type1 (F12)", () => {
  it("is a 32-byte NTLMSSP negotiate message", () => {
    const msg = buildNtlmType1();
    expect(msg).toHaveLength(32);
    expect(msg.subarray(0, 8).toString("ascii")).toBe("NTLMSSP\0");
    expect(msg.readUInt32LE(8)).toBe(1);
    expect(msg.readUInt32LE(12)).toBe(0xe2088297);
  });
});

describe("ntlm type2 parsing (F12)", () => {
  it("extracts challenge, target info and flags", () => {
    const challenge = fromHex("1122334455667788");
    const targetInfo = fromHex("02000c00444156452d5043");
    const buf = Buffer.alloc(64);
    buf.write("NTLMSSP\0", 0, "ascii");
    buf.writeUInt32LE(2, 8);
    buf.writeUInt32LE(0x02000006, 20);
    challenge.copy(buf, 24);
    buf.writeUInt16LE(targetInfo.length, 40);
    buf.writeUInt32LE(48, 44);
    targetInfo.copy(buf, 48);

    const parsed = parseNtlmType2(buf);
    expect(parsed).not.toBeNull();
    expect(hex(parsed!.challenge)).toBe("1122334455667788");
    expect(hex(parsed!.targetInfo)).toBe(hex(targetInfo));
    expect(parsed!.flags).toBe(0x02000006);
  });

  it("accepts a base64 token", () => {
    const challenge = fromHex("8877665544332211");
    const buf = Buffer.alloc(48);
    buf.write("NTLMSSP\0", 0, "ascii");
    buf.writeUInt32LE(2, 8);
    challenge.copy(buf, 24);
    const parsed = parseNtlmType2(buf.toString("base64"));
    expect(parsed).not.toBeNull();
    expect(hex(parsed!.challenge)).toBe("8877665544332211");
  });

  it("returns null for garbage", () => {
    expect(parseNtlmType2("not-a-token")).toBeNull();
    expect(parseNtlmType2(Buffer.alloc(8))).toBeNull();
    expect(parseNtlmType2(Buffer.alloc(40))).toBeNull();
  });
});

describe("ntlm type3 (F12)", () => {
  function makeChallenge(): NonNullable<ReturnType<typeof parseNtlmType2>> {
    const challengeBuf = fromHex("0123456789abcdef");
    const targetInfo = fromHex("02000c00444156452d5043");
    const buf = Buffer.alloc(64);
    buf.write("NTLMSSP\0", 0, "ascii");
    buf.writeUInt32LE(2, 8);
    buf.writeUInt32LE(0xe2088297, 20);
    challengeBuf.copy(buf, 24);
    buf.writeUInt16LE(targetInfo.length, 40);
    buf.writeUInt32LE(48, 44);
    targetInfo.copy(buf, 48);
    return parseNtlmType2(buf)!;
  }

  const clientChallenge = fromHex("ffffffffffffffff");
  const now = Date.UTC(2024, 0, 15, 12, 0, 0);

  it("is a well-formed NTLMSSP authenticate message", () => {
    const msg = buildNtlmType3(makeChallenge(), {
      username: "User",
      password: "Password",
      domain: "Domain",
      workstation: "WS",
    });
    expect(msg.subarray(0, 8).toString("ascii")).toBe("NTLMSSP\0");
    expect(msg.readUInt32LE(8)).toBe(3);
    expect(msg.readUInt32LE(60)).toBe(0xe2088297);
    expect(msg.readUInt8(71)).toBe(0x0f);
  });

  it("NT response = HMAC-MD5(v2hash, challenge+blob) with the blob appended", () => {
    const msg = buildNtlmType3(makeChallenge(), {
      username: "User",
      password: "Password",
      domain: "Domain",
      workstation: "WS",
    }, { clientChallenge, now });

    const v2Hash = ntlmV2Hash("Password", "User", "Domain");
    const filetime = Buffer.alloc(8);
    filetime.writeBigUInt64LE(BigInt(now + 11644473600000) * 10000n);
    const blob = Buffer.concat([
      Buffer.from([0x01, 0x01, 0x00, 0x00]),
      filetime,
      clientChallenge,
      Buffer.alloc(4),
      fromHex("02000c00444156452d5043"),
      Buffer.alloc(4),
    ]);
    const expected = createHmac("md5", v2Hash)
      .update(Buffer.concat([fromHex("0123456789abcdef"), blob]))
      .digest();

    const ntLen = msg.readUInt16LE(20);
    const ntOffset = msg.readUInt32LE(24);
    const ntResponse = msg.subarray(ntOffset, ntOffset + ntLen);
    expect(ntLen).toBe(16 + blob.length);
    expect(hex(ntResponse.subarray(0, 16))).toBe(hex(expected));
    expect(hex(ntResponse.subarray(16))).toBe(hex(blob));
    expect(ntResponse.readUInt16LE(16)).toBe(0x0101);
  });

  it("LM response = HMAC-MD5(v2hash, challenge+clientChallenge) + clientChallenge", () => {
    const msg = buildNtlmType3(makeChallenge(), {
      username: "User",
      password: "Password",
      domain: "Domain",
      workstation: "WS",
    }, { clientChallenge, now });

    const v2Hash = ntlmV2Hash("Password", "User", "Domain");
    const expected = createHmac("md5", v2Hash)
      .update(Buffer.concat([fromHex("0123456789abcdef"), clientChallenge]))
      .digest();

    const lmLen = msg.readUInt16LE(12);
    const lmOffset = msg.readUInt32LE(16);
    expect(lmLen).toBe(24);
    expect(hex(msg.subarray(lmOffset, lmOffset + 16))).toBe(hex(expected));
    expect(hex(msg.subarray(lmOffset + 16, lmOffset + 24))).toBe("ffffffffffffffff");
  });

  it("encodes the username/domain/workstation payloads as UTF-16LE", () => {
    const msg = buildNtlmType3(makeChallenge(), {
      username: "User",
      password: "Password",
      domain: "Domain",
      workstation: "WS",
    }, { clientChallenge, now });

    const readPayload = (hdrOffset: number): string => {
      const len = msg.readUInt16LE(hdrOffset);
      const off = msg.readUInt32LE(hdrOffset + 4);
      return msg.subarray(off, off + len).toString("utf16le");
    };
    expect(readPayload(28)).toBe("Domain");
    expect(readPayload(36)).toBe("User");
    expect(readPayload(44)).toBe("WS");
  });
});

describe("ntlm wire helpers (F12)", () => {
  it("parseWwwAuthenticateNtlm extracts ntlm tokens", () => {
    expect(parseWwwAuthenticateNtlm("NTLM")).toBe("");
    expect(parseWwwAuthenticateNtlm("ntlm")).toBe("");
    expect(parseWwwAuthenticateNtlm("NTLM AbCdEf==")).toBe("AbCdEf==");
    expect(parseWwwAuthenticateNtlm("Negotiate TlRMTVNTUAACAAA=")).toBe("TlRMTVNTUAACAAA=");
  });

  it("parseWwwAuthenticateNtlm returns null for non-ntlm schemes", () => {
    expect(parseWwwAuthenticateNtlm("Digest realm=\"x\"")).toBeNull();
    expect(parseWwwAuthenticateNtlm("Basic realm=\"x\"")).toBeNull();
    expect(parseWwwAuthenticateNtlm("")).toBeNull();
    expect(parseWwwAuthenticateNtlm("NTLM extra more")).toBeNull();
  });

  it("ntlmAuthorizationHeader builds the Authorization value", () => {
    const token = Buffer.from("hello");
    expect(ntlmAuthorizationHeader(token)).toBe("NTLM aGVsbG8=");
  });
});
