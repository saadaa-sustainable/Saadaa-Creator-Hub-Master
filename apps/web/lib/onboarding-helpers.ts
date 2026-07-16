/**
 * Shared onboarding helpers — used by the live Onboarding submit
 * (features/onboarding/actions.ts) and the historic onboarding fill
 * (features/team-rows/historic-onboarding-actions.ts). Plain module (NOT
 * "use server") so sync helpers can be exported.
 */

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Puducherry",
  "Chandigarh",
  "Andaman and Nicobar",
  "Dadra and Nagar Haveli",
  "Daman and Diu",
  "Lakshadweep",
] as const;

export interface ParsedAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
}

/**
 * Parses a Shopify India address string into components.
 * Shopify format: "[street parts...], City, State, Pincode, Country"
 * Strategy: anchor on known values (country, pincode, state) then derive
 * city as the part immediately preceding state — no city list needed.
 */
export function parseShopifyAddress(addr: string | null): ParsedAddress {
  const empty: ParsedAddress = {
    street: null,
    city: null,
    state: null,
    pincode: null,
    country: null,
  };
  if (!addr) return empty;

  let parts = addr
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return empty;

  let country: string | null = null;
  let pincode: string | null = null;
  let state: string | null = null;
  let city: string | null = null;

  // 1. Country: last part that is all letters/spaces
  if (parts.length > 1 && /^[A-Za-z\s]+$/.test(parts.at(-1)!)) {
    country = parts.at(-1)!;
    parts = parts.slice(0, -1);
  }

  // 2. Pincode: rightmost 6-digit number
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d{6}$/.test(parts[i])) {
      pincode = parts[i];
      parts = [...parts.slice(0, i), ...parts.slice(i + 1)];
      break;
    }
  }

  // 3. State: rightmost part matching INDIAN_STATES; record its original index
  let stateOriginalIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (INDIAN_STATES.some((s) => s.toLowerCase() === parts[i].toLowerCase())) {
      state = parts[i];
      stateOriginalIdx = i;
      parts = [...parts.slice(0, i), ...parts.slice(i + 1)];
      break;
    }
  }

  // 4. City: the part that was immediately BEFORE state in the original sequence.
  //    After removing state at stateOriginalIdx, that part is now at stateOriginalIdx-1.
  //    If no state found, fall back to last remaining part.
  const cityIdx =
    stateOriginalIdx > 0 ? stateOriginalIdx - 1 : parts.length - 1;
  if (parts.length > 0 && cityIdx >= 0 && cityIdx < parts.length) {
    city = parts[cityIdx];
    parts = [...parts.slice(0, cityIdx), ...parts.slice(cityIdx + 1)];
  }

  // 5. Everything remaining = street address
  const street = parts.length > 0 ? parts.join(", ") : null;
  return { street, city, state, pincode, country };
}

export function buildLegacyNomenclature(
  postId: string,
  username: unknown,
  contentType: unknown,
  date: string,
): string | null {
  const handle = typeof username === "string" ? username.trim() : "";
  const type = typeof contentType === "string" ? contentType.trim() : "";
  if (!postId || !handle || !type) return null;
  return `${postId}-${handle}-${type}-${date}`;
}
