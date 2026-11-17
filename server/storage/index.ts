import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";

export interface StoredObject { key: string; url: string; contentType: string; size: number }
export interface ObjectStorage { put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> }

class LocalDiskStorage implements ObjectStorage {
  async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
    const safeKey = key.split("/").map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "_")).join("/");
    const root = path.resolve(process.cwd(), "public", "uploads");
    const target = path.resolve(root, safeKey);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error("非法对象路径");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return { key: safeKey, url: `/uploads/${safeKey.split("/").map(encodeURIComponent).join("/")}`, contentType, size: bytes.byteLength };
  }
}

class S3CompatibleStorage implements ObjectStorage {
  async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
    const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
    const bucket = process.env.OBJECT_STORAGE_BUCKET;
    const region = process.env.OBJECT_STORAGE_REGION ?? "auto";
    const accessKey = process.env.OBJECT_STORAGE_ACCESS_KEY;
    const secretKey = process.env.OBJECT_STORAGE_SECRET_KEY;
    const publicBase = process.env.OBJECT_STORAGE_PUBLIC_BASE_URL;
    if (!endpoint || !bucket || !accessKey || !secretKey || !publicBase) throw new Error("对象存储配置不完整");
    const date = new Date();
    const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const safeKey = key.split("/").map(encodeURIComponent).join("/");
    const url = new URL(`${endpoint.replace(/\/$/, "")}/${encodeURIComponent(bucket)}/${safeKey}`);
    const payloadHash = createHash("sha256").update(bytes).digest("hex");
    const headers = { "content-type": contentType, host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const newline = String.fromCharCode(10);
    const canonicalHeaders = ["content-type:" + contentType, "host:" + url.host, "x-amz-content-sha256:" + payloadHash, "x-amz-date:" + amzDate, ""].join(newline);
    const canonicalRequest = ["PUT", url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join(newline);
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join(newline);
    const sign = (keyBytes: Buffer | string, value: string) => createHmac("sha256", keyBytes).update(value).digest();
    const signingKey = sign(sign(sign(sign(`AWS4${secretKey}`, dateStamp), region), "s3"), "aws4_request");
    const signature = sign(signingKey, stringToSign).toString("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response = await fetch(url, { method: "PUT", headers: { ...headers, Authorization: authorization }, body: Buffer.from(bytes) });
    if (!response.ok) throw new Error(`对象存储上传失败：${response.status}`);
    return { key, url: `${publicBase.replace(/\/$/, "")}/${safeKey}`, contentType, size: bytes.byteLength };
  }
}

export function getObjectStorage(localOnly = false): ObjectStorage {
  if (localOnly) return new LocalDiskStorage();
  const provider = process.env.OBJECT_STORAGE_PROVIDER ?? "local";
  if (provider === "local") return new LocalDiskStorage();
  if (["oss", "cos", "r2"].includes(provider)) return new S3CompatibleStorage();
  throw new Error("不支持的对象存储服务");
}
