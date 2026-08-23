/* NomadCore assistant — public config (safe to ship; no secrets here).
 * Loaded before assistant.js. Only a publishable endpoint + display values. */
window.NC_CONFIG = {
  // Edge Function URL (NomadCore's own Supabase project: twgatpwehkerapwtpkag).
  // Live only once the nc-assistant function is deployed there.
  ASSISTANT_FN: "https://twgatpwehkerapwtpkag.supabase.co/functions/v1/nc-assistant",

  // Human-handoff address shown in the widget footer / errors.
  CONTACT_EMAIL: "support@nomad-core.com",

  // SEC-05 (optional): set the Cloudflare Turnstile *site* key to require a
  // bot-challenge token per request. Leave "" to disable. The matching secret
  // goes in the edge function's TURNSTILE_SECRET (never here).
  TURNSTILE_SITEKEY: "",
};
