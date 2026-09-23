import type { UserProfile } from "@singlebase/singlebase-sdk";

/** "Ada Lovelace", or "" when the profile carries no name at all. */
export function fullNameOf(user: Pick<UserProfile, "first_name" | "last_name"> | null): string {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
}

/**
 * Two-letter avatar initials. Falls back to the email's first letter, then to
 * a neutral glyph, so the avatar is never blank for a profile that only has
 * an address.
 */
export function initialsOf(
  user: Pick<UserProfile, "first_name" | "last_name" | "email"> | null
): string {
  const name = fullNameOf(user);
  if (name) {
    return name
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  const email = user?.email ?? "";
  return email ? email[0]!.toUpperCase() : "·";
}
