/**
 * Indirizzo della scheda di un movimento salvato (nel prototipo: carico.html?db=N, vendita.html?db=N …).
 * Le schede movimento si aggiungono man mano con la migrazione: le rotte seguono questo schema.
 */
const PAGINE: Record<string, string> = {
  carico_fornitore: 'carico',
  ordine_fornitore: 'ordine',
  trasferimento_a_filiale: 'trasferimento',
  trasferimento_ricevuto: 'trasferimento',
  vendite_giornaliere: 'vendita',
  aumento_giacenza: 'aumento',
  diminuzione_giacenza: 'diminuzione',
  riallineamento: 'inventario',
  ordine_cliente: 'ordine-cliente',
  scarico_cliente: 'ordine-cliente'
};

/** ['/carico', 12] oppure null se il tipo non ha una scheda (es. giacenza iniziale). */
export const percorsoMovimento = (tipo: string, id: number): (string | number)[] | null =>
  PAGINE[tipo] ? ['/' + PAGINE[tipo], id] : null;
