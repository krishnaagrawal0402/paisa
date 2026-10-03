/** Privacy mode: blurs every `.money` element via a class on <html> (see app/globals.css). */
export const PRIVACY_KEY = "paisa:privacy";

/** Runs before first paint (inline in app/layout.tsx) so hidden amounts never flash. */
export const privacyBootScript = `try{if(localStorage.getItem("${PRIVACY_KEY}")==="1")document.documentElement.classList.add("privacy")}catch(e){}`;
