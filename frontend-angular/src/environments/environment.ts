// Stesso progetto Supabase del prototipo (prototipo/js/supabase-config.js).
// La chiave "publishable" può stare nel sito: i dati sono protetti dalle regole del database (RLS).
// MAI mettere qui la chiave secret / service_role né la password del database.
export const environment = {
  produzione: true,
  /** Modalità anteprima con dati finti (solo sviluppo, si accende con localStorage anteprima=1). */
  anteprimaPossibile: false,
  supabaseUrl: 'https://azjrpkxejrhmrhlpfmhx.supabase.co',
  supabasePublishableKey: 'sb_publishable_Mguy4jtdrwaHK0fmxy5MgA_jAv9L4AR'
};
