export type UserIdentity = "rahmatulloh" | "nilufar";
export type ThemePreference = "light" | "dark" | "system";

export const IDENTITIES = {
  rahmatulloh: {
    email: "komilov@gmail.com",
    name: "Rahmatulloh",
    initial: "R",
  },
  nilufar: {
    email: "nilufar@gmail.com",
    name: "Nilufar",
    initial: "N",
  },
} as const;

export function getUserIdentity(email?: string | null): UserIdentity {
  return email?.toLowerCase() === IDENTITIES.nilufar.email ? "nilufar" : "rahmatulloh";
}

export function getOtherIdentity(identity: UserIdentity): UserIdentity {
  return identity === "rahmatulloh" ? "nilufar" : "rahmatulloh";
}

export function themeStorageKey(identity: UserIdentity) {
  return `private-messenger-theme:${identity}`;
}
