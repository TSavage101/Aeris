import { requireEnv } from "@/lib/server/env";

type KoraResponse<T> = {
  status: boolean;
  message: string;
  data: T;
};

const BANK_CODE_BY_NAME: Record<string, string> = {
  "Access Bank": "044",
  "Access Bank (Diamond)": "063",
  Citibank: "023",
  Ecobank: "050",
  "Fidelity Bank": "070",
  "First Bank": "011",
  "First City Monument Bank": "214",
  "Globus Bank": "00103",
  GTBank: "058",
  "Heritage Bank": "030",
  "Keystone Bank": "082",
  "Lotus Bank": "303",
  "Moniepoint MFB": "50515",
  "Opay Digital Services": "999992",
  "Parallex Bank": "104",
  Polaris: "076",
  Providus: "101",
  "Stanbic IBTC": "221",
  Sterling: "232",
  "Suntrust Bank": "100",
  Titan: "102",
  UBA: "033",
  Union: "032",
  Unity: "215",
  Wema: "035",
  "Zenith Bank": "057"
};

export const NIGERIAN_BANKS = Object.keys(BANK_CODE_BY_NAME);

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
