// Voci del menu, come MENU in prototipo/js/layout.js.
// route = schermata migrata in Angular; inArrivo = nel prototipo è solo grafica con dati di esempio (si farà più avanti);
// futuro = voce rimandata dall'utente ("in futuro").

export interface VoceMenu {
  label: string;
  route?: string;
  inArrivo?: boolean;
  futuro?: string;
}
export interface GruppoMenu { titolo?: string; voci: VoceMenu[] }
export interface SezioneMenu { id: string; label: string; icona: string; route?: string; gruppi?: GruppoMenu[] }

export const ICONE: Record<string, string> = {
  dashboard: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  movimenti: '<path d="M1 4h14v12H1z"/><path d="M15 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  magazzino: '<path d="M3 9l9-5 9 5v11H3z"/><path d="M7 20v-7h10v7"/><path d="M7 16h10"/>',
  laboratori: '<path d="M8 3l-5 3 2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
  configurazione: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  setup: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'
};

export const MENU: SezioneMenu[] = [
  { id: 'dashboard', label: 'Dashboard', icona: 'dashboard', route: '/dashboard' },
  {
    id: 'movimenti', label: 'Movimenti', icona: 'movimenti', gruppi: [
      { titolo: 'Entrate', voci: [
        { label: 'Carichi da Fornitori', route: '/movimenti/carichi-fornitori' },
        { label: 'Ordini a Fornitori', route: '/movimenti/ordini-fornitori' },
        { label: 'Trasferimenti da Filiali', route: '/trasferimenti/da-filiali' },
        { label: 'Resi Ricevuti da Clienti', inArrivo: true },
        { label: 'Aumento Giacenza', route: '/movimenti/aumento-giacenza' },
        { label: 'Altri Carichi', inArrivo: true }
      ] },
      { titolo: 'Uscite', voci: [
        { label: 'Vendite Giornaliere', route: '/movimenti/vendite-giornaliere' },
        { label: 'Scarichi a Clienti', route: '/movimenti/scarichi-clienti' },
        { label: 'Ordini da Clienti', route: '/movimenti/ordini-clienti' },
        { label: 'Resi Inviati a Fornitori', inArrivo: true },
        { label: 'Trasferimenti a Filiali', route: '/trasferimenti/a-filiali' },
        { label: 'Preventivi', inArrivo: true },
        { label: 'Diminuzione Giacenza', route: '/movimenti/diminuzione-giacenza' },
        { label: 'Altri Scarichi', inArrivo: true }
      ] },
      { titolo: 'Rettifiche', voci: [{ label: 'Riallineamenti Giacenza', route: '/inventario' }] },
      { titolo: 'Riepilogo', voci: [{ label: 'Tutti i Movimenti', route: '/movimenti/tutti' }, { label: 'Inevasi', route: '/trasferimenti/inevasi' }] }
    ]
  },
  {
    id: 'magazzino', label: 'Magazzino', icona: 'magazzino', gruppi: [
      { titolo: 'Anagrafica', voci: [{ label: 'Articoli', route: '/articoli' }, { label: 'Categorie', inArrivo: true }, { label: 'Sottocategorie', inArrivo: true }] },
      { titolo: 'Situazione', voci: [{ label: 'Giacenze', route: '/giacenze' }] }
    ]
  },
  { id: 'laboratori', label: 'Laboratori', icona: 'laboratori', gruppi: [{ voci: [{ label: 'Laboratori', futuro: 'Laboratori: per ora non serve, lo vedremo in futuro' }] }] },
  {
    id: 'configurazione', label: 'Configurazione', icona: 'configurazione', gruppi: [
      { titolo: 'Anagrafiche', voci: [{ label: 'Fornitori', route: '/anagrafiche/fornitori' }, { label: 'Clienti', route: '/anagrafiche/clienti' }, { label: 'Gruppi', inArrivo: true }] },
      { titolo: 'Fiscale e pagamenti', voci: [{ label: 'Aliquote IVA', route: '/anagrafiche/aliquote-iva' }, { label: 'Coordinate Bancarie', inArrivo: true }, { label: 'Condizioni Pagamento', inArrivo: true }, { label: 'Sconti Clienti', inArrivo: true }] },
      { titolo: 'Documenti', voci: [{ label: 'Email Templates', inArrivo: true }, { label: 'Contatori', inArrivo: true }, { label: 'Tipi Movimento', inArrivo: true }, { label: 'Totali Movimenti', inArrivo: true }] },
      { titolo: 'Logistica', voci: [{ label: 'Spedizionieri', inArrivo: true }, { label: 'Casse', inArrivo: true }, { label: 'Luoghi Consegna Merci', inArrivo: true }] },
      { titolo: 'Stampe e codici', voci: [{ label: 'Modelli Stampa', inArrivo: true }, { label: 'Macro Gruppi di Codici', inArrivo: true }, { label: 'Gruppi di Codici', inArrivo: true }] }
    ]
  },
  {
    id: 'setup', label: 'Setup', icona: 'setup', gruppi: [
      { titolo: 'Utenti', voci: [{ label: 'Utenti Sito', route: '/setup/utenti' }, { label: 'Attività Utenti', route: '/setup/attivita' }] },
      { titolo: 'Azienda', voci: [{ label: 'Sedi', route: '/setup/sedi' }, { label: 'App Settings', inArrivo: true }] },
      { titolo: 'Sistema', voci: [{ label: 'Background Task', inArrivo: true }, { label: 'Azioni Applicazione', inArrivo: true }, { label: 'Firewall Rules', inArrivo: true }] },
      { titolo: 'Lingue', voci: [{ label: 'Traduzioni', inArrivo: true }] }
    ]
  }
];
