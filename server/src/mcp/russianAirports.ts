/**
 * Kiwi MCP does not support Russian airports. There is no reliable way to
 * ask Kiwi itself "is this airport in Russia?" ahead of time, so we keep a
 * curated list of major Russian cities / airports (Cyrillic + English
 * spellings + IATA codes) and match the user's origin/destination against
 * it before ever calling the MCP server.
 */
const RUSSIAN_PLACE_NAMES: string[] = [
  "москва", "moscow", "svo", "dme", "vko", "shermetyevo", "sheremetyevo", "domodedovo", "vnukovo",
  "санкт-петербург", "петербург", "saint petersburg", "st petersburg", "st. petersburg", "led", "pulkovo",
  "новосибирск", "novosibirsk", "ovb",
  "екатеринбург", "ekaterinburg", "yekaterinburg", "svx",
  "казань", "kazan", "kzn",
  "нижний новгород", "nizhny novgorod", "goj",
  "челябинск", "chelyabinsk", "cek",
  "самара", "samara", "kuf",
  "ростов-на-дону", "ростов", "rostov-on-don", "rostov", "rov",
  "уфа", "ufa",
  "красноярск", "krasnoyarsk", "kja",
  "пермь", "perm", "pee",
  "воронеж", "voronezh", "vox",
  "волгоград", "volgograd", "vog",
  "краснодар", "krasnodar", "krr",
  "сочи", "sochi", "aer",
  "тюмень", "tyumen", "tju",
  "томск", "tomsk", "tof",
  "иркутск", "irkutsk", "ikt",
  "барнаул", "barnaul", "bax",
  "владивосток", "vladivostok", "vvo",
  "хабаровск", "khabarovsk", "khv",
  "калининград", "kaliningrad", "kgd",
  "омск", "omsk", "oms",
  "мурманск", "murmansk", "mmk",
  "минеральные воды", "mineralnye vody", "mrv",
  "анапа", "anapa", "aap",
  "ставрополь", "stavropol", "stw",
  "архангельск", "arkhangelsk", "arh",
  "россия", "russia", "russian federation",
];

const NORMALIZED = new Set(RUSSIAN_PLACE_NAMES.map(normalize));

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

/**
 * Returns true if the given free-text place (city, airport name or IATA
 * code, in Russian or English) looks like it refers to a Russian airport.
 */
export function isRussianAirport(place: string): boolean {
  const normalized = normalize(place);
  if (!normalized) return false;
  if (NORMALIZED.has(normalized)) return true;
  // Also catch things like "аэропорт Шереметьево" / "Moscow Domodedovo".
  for (const name of NORMALIZED) {
    if (name.length >= 4 && normalized.includes(name)) return true;
  }
  return false;
}
