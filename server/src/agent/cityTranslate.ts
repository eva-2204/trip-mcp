import type OpenAI from "openai";

const CYRILLIC_RE = /[Ѐ-ӿ]/;

export function containsCyrillic(text: string): boolean {
  return CYRILLIC_RE.test(text);
}

/**
 * Trivago MCP doesn't handle Russian city names well. Per spec, Russian
 * input is translated to English via Claude (through the same OpenRouter
 * chat completion the agent already uses) before it's ever sent to Trivago.
 * The user never sees this intermediate step.
 */
export async function translateCityToEnglish(openai: OpenAI, model: string, city: string): Promise<string> {
  if (!containsCyrillic(city)) return city;

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You translate city names from Russian to English for a hotel search API. " +
            "Reply with ONLY the common English name of the city, nothing else. No punctuation, no explanation.",
        },
        { role: "user", content: city },
      ],
    });
    const translated = completion.choices[0]?.message?.content?.trim();
    return translated && translated.length > 0 ? translated : city;
  } catch {
    // If translation fails for any reason, fall back to the original string
    // rather than blocking the whole hotel search.
    return city;
  }
}
