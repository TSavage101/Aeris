import { NextResponse } from "next/server";
import type { Store } from "@/lib/aeris";
import { requireEnv } from "@/lib/server/env";

type OpenAiStoreEdit = {
  steps: Array<{ title: string; summary: string }>;
  summary: string[];
  patch: {
    heroTitle?: string | null;
    heroCopy?: string | null;
    logoUrl?: string | null;
    heroImageUrl?: string | null;
    theme?: {
      navAlignment?: "left" | "center" | null;
      productRadius?: 0 | 2 | null;
    };
  };
};

const schema = {
  name: "store_edit_patch",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      steps: {
        type: "array",
        minItems: 4,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            summary: { type: "string" }
          },
          required: ["title", "summary"]
        }
      },
      summary: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { type: "string" }
      },
      patch: {
        type: "object",
        additionalProperties: false,
        properties: {
          heroTitle: { type: ["string", "null"] },
          heroCopy: { type: ["string", "null"] },
          logoUrl: { type: ["string", "null"] },
          heroImageUrl: { type: ["string", "null"] },
          theme: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              navAlignment: { type: ["string", "null"], enum: ["left", "center", null] },
              productRadius: { type: ["number", "null"], enum: [0, 2, null] }
            },
            required: ["navAlignment", "productRadius"]
          }
        },
        required: ["heroTitle", "heroCopy", "logoUrl", "heroImageUrl", "theme"]
      }
    },
    required: ["steps", "summary", "patch"]
  }
};

export async function POST(request: Request) {
  try {
    const { store, prompt } = await request.json() as { store: Store; prompt: string };
    const apiKey = requireEnv("OPENAI_API_KEY");
    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: [
              "You are Aeris Store AI, a structured storefront editor.",
              "Only propose safe storefront configuration changes.",
              "Do not propose arbitrary code edits, database edits, or unsupported layout systems.",
              "Supported changes are limited to heroTitle, heroCopy, theme.navAlignment, and theme.productRadius.",
              "Return null for any field that should remain unchanged.",
              "For rounded product cards, only use productRadius 2 because the design system only allows 0 or 2px radii.",
              "If the prompt asks for something unsupported, preserve the current value and mention the constraint in summary."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({
              prompt,
              store: {
                name: store.name,
                city: store.city,
                category: store.category,
                heroTitle: store.heroTitle,
                heroCopy: store.heroCopy,
                theme: {
                  primary: store.theme.primary,
                  navAlignment: store.theme.navAlignment,
                  productRadius: store.theme.productRadius
                }
              }
            })
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: schema
        }
      })
    });

    const payload = await response.json().catch(() => null) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    } | null;

    if (!response.ok) {
      throw new Error(payload?.error?.message || "OpenAI request failed");
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty response");
    }

    const parsed = JSON.parse(content) as OpenAiStoreEdit;
    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate AI storefront changes" },
      { status: 500 }
    );
  }
}
