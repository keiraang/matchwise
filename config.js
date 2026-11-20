/**
 * Matchwise configuration (no backend, so everything here is visible to the
 * browser. Never ship a real production key this way; proxy it instead).
 *
 * You can also paste a key in Settings; it is stored only in this browser.
 */
window.MATCHWISE_CONFIG = {
  GEMINI_API_KEY: '',            // e.g. 'AIza...'  Get one at https://aistudio.google.com/apikey
  GEMINI_MODEL: 'gemini-2.5-flash',
  SPORT: 'soccer',               // id of a module in js/sports/
  BATCH_SECONDS: 9               // how often live transcript is sent for explanation
};
