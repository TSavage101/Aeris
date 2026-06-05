import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/server/env";

function signUpload(params: Record<string, string>) {
  const secret = requireEnv("CLOUDINARY_API_SECRET");
  const serialized = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1").update(`${serialized}${secret}`).digest("hex");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const folder = String(formData.get("folder") || "aeris");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload file is required" }, { status: 400 });
    }

    const cloudName = requireEnv("CLOUDINARY_CLOUD_NAME");
    const apiKey = requireEnv("CLOUDINARY_API_KEY");
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const dataUri = `data:${file.type || "image/jpeg"};base64,${fileBuffer.toString("base64")}`;
    const signature = signUpload({ folder, timestamp });

    const cloudinaryBody = new URLSearchParams({
      file: dataUri,
      api_key: apiKey,
      timestamp,
      folder,
      signature
    });

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: cloudinaryBody.toString()
    });

    const payload = await response.json().catch(() => null) as { secure_url?: string; error?: { message?: string } } | null;
    if (!response.ok || !payload?.secure_url) {
      throw new Error(payload?.error?.message || "Cloudinary upload failed");
    }

    return NextResponse.json({ url: payload.secure_url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload asset" },
      { status: 500 }
    );
  }
}

