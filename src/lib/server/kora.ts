import { requireEnv } from "@/lib/server/env";

type KoraResponse<T> = {
  status: boolean;
  message: string;
  data: T;
};

const BANK_CODE_BY_NAME: Record<string, string> = {
  "Access Bank": "044",
  UBA: "033",
  GTBank: "058",
  "First Bank": "011",
  "Zenith Bank": "057"
};

function getKoraBaseUrl() {
  return process.env.KORA_BASE_URL || "https://api.korapay.com";
}

export function bankCodeFromName(bankName: string) {
  return BANK_CODE_BY_NAME[bankName] || "058";
}

export async function koraRequest<T>(path: string, init?: RequestInit) {
  const secretKey = requireEnv("KORA_SECRET_KEY");
  const response = await fetch(`${getKoraBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    cache: "no-store"
  });

  const payload = await response.json().catch(() => null) as KoraResponse<T> | null;

  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || `Kora request failed (${response.status})`);
  }

  return payload;
}
