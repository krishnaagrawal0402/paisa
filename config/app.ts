/**
 * Branding in one place. Forking under a different name? Change it here.
 * Colours live as tokens in app/globals.css (@theme).
 */
export const appConfig = {
  name: "Paisa",
  tagline: "Know where your money goes.",
  description: "A simple, open-source money manager: salary, spends, investments and savings at a glance.",
  themeColor: "#07070b",
  /** Where the code lives. Forks: point this at your repo. */
  sourceUrl: "https://github.com/krishnaagrawal0402/paisa",
  /** "Today" and month boundaries are computed in this time zone. */
  timeZone: "Asia/Kolkata",
} as const;
