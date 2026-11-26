import { ChangeDetectionStrategy, Component, inject, OnInit, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { intestazioneSede, PIE_DI_PAGINA, type DocumentoStampa } from '../../shared/intestazioni';

/**
 * Documento A4 su carta intestata (prototipo/stampa-documento.html): carico, ordine, trasferimento, inventario…
 * I dati arrivano dalla scheda del movimento (sessionStorage "stampa"); ?auto=1 apre subito la finestra di stampa.
 * Pagina fuori dal menu (senza barra laterale), così si stampa solo il foglio.
 */
@Component({
  selector: 'app-stampa-documento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="stampa-doc">
      <div class="barra"><b>{{ dati?.titolo ?? 'Stampa' }}</b><button class="stampa" (click)="stampa()">🖨️ Stampa</button><button (click)="chiudi()">✕ Chiudi</button></div>
      @if (dati; as d) {
        <div class="foglio">
          <div class="testa">
            <div class="mittente">@for (r of d.mittente ?? intestazione(d.sede); track $index) { <div>{{ r }}</div> }</div>
            <div class="logo"><img src="img/logo-pddm.jpg" alt="pddm">apostolato liturgico</div>
          </div>
          <div class="seconda">
            <div class="doc"><div>{{ d.titolo }}</div>@for (i of d.info; track $index) { <div>{{ i[0] }}: {{ i[1] }}</div> }</div>
            <div class="destinatario">@for (r of d.destinatario; track $index) { <div>{{ r }}</div> }</div>
          </div>
          <table>
            <thead><tr>@for (c of d.colonne; track c.k) { <th [class.num]="c.num">{{ c.t }}</th> }</tr></thead>
            <tbody>@for (r of d.righe; track $index) { <tr>@for (c of d.colonne; track c.k) { <td [class.num]="c.num" [class.cod]="c.cod">{{ r[c.k] }}</td> }</tr> }</tbody>
          </table>
          <div class="totali">@for (t of d.totali; track $index) { <div><span>{{ t[0] }}</span><span>{{ t[1] }}</span></div> }</div>
          @if (d.note) { <div class="note"><div>Note</div>{{ d.note }}</div> }
          <div class="piede">@for (r of PIE; track $index) { <div>{{ r }}</div> }</div>
        </div>
      } @else {
        <div class="foglio"><div class="vuoto">Niente da stampare: apri la stampa dalla scheda del movimento.</div></div>
      }
    </div>
  `,
  styles: `
    @page { size: A4; margin: 0; }
    .stampa-doc { min-height: 100vh; background: #e6e9ef; font: 9.5pt/1.35 Inter, Arial, sans-serif; color: #1b2230; }
    .stampa-doc * { box-sizing: border-box; }
    .stampa-doc .barra { position: sticky; top: 0; z-index: 2; display: flex; gap: 10px; align-items: center; padding: 10px 16px; background: #1f2a3d; color: #fff; }
    .stampa-doc .barra b { margin-right: auto; font-weight: 600; }
    .stampa-doc .barra button { padding: 7px 14px; border: none; border-radius: 8px; font: 600 0.9rem Inter, sans-serif; cursor: pointer; }
    .stampa-doc .barra .stampa { background: #2f8bff; color: #fff; }
    .stampa-doc .foglio { position: relative; width: 210mm; min-height: 297mm; margin: 16px auto; padding: 14mm 14mm 34mm; background: #fff; box-shadow: 0 4px 24px rgba(20,30,50,0.18); }
    .stampa-doc .testa { display: flex; justify-content: space-between; gap: 20px; }
    .stampa-doc .mittente div:nth-child(2) { font-weight: 700; }
    .stampa-doc .logo { display: flex; align-items: center; gap: 10px; color: #3a4ea6; font-size: 15pt; letter-spacing: 0.01em; }
    .stampa-doc .logo img { height: 17mm; width: auto; mix-blend-mode: multiply; filter: brightness(1.04); }
    .stampa-doc .seconda { display: flex; justify-content: space-between; gap: 20px; margin-top: 8mm; }
    .stampa-doc .doc div:first-child { font-size: 11pt; font-weight: 700; margin-bottom: 2px; }
    .stampa-doc .destinatario { text-align: right; }
    .stampa-doc .destinatario div:first-child { font-weight: 700; }
    .stampa-doc table { width: 100%; margin-top: 9mm; border-collapse: collapse; }
    .stampa-doc th { padding: 5px 6px; border-bottom: 1.5px solid #1b2230; font-size: 8.5pt; font-weight: 700; text-align: left; }
    .stampa-doc td { padding: 5px 6px; border-bottom: 1px solid #dde2ea; vertical-align: top; }
    .stampa-doc tbody tr:nth-child(even) td { background: #f6f8fb; }
    .stampa-doc .num { text-align: right; white-space: nowrap; }
    .stampa-doc .cod { font-family: "Courier New", monospace; font-size: 8.5pt; white-space: nowrap; }
    .stampa-doc .totali { width: 46%; margin: 8mm 0 0 auto; }
    .stampa-doc .totali div { display: flex; justify-content: space-between; padding: 6px 4px; border-bottom: 1px solid #dde2ea; }
    .stampa-doc .totali div:last-child { border-bottom: none; border-top: 1.5px solid #1b2230; font-weight: 700; font-size: 10.5pt; }
    .stampa-doc .note { margin-top: 8mm; padding: 4mm 5mm; border-left: 3px solid #3a4ea6; background: #f1f3f8; white-space: pre-wrap; font-size: 10.5pt; }
    .stampa-doc .note div { margin-bottom: 2px; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: #4a5568; white-space: normal; }
    .stampa-doc .piede { position: absolute; left: 14mm; right: 14mm; bottom: 10mm; padding-top: 3mm; border-top: 1px solid #c9d1dd; text-align: center; font-size: 7.5pt; color: #4a5568; }
    .stampa-doc .piede div:first-child { color: #2f6fd6; font-weight: 600; }
    .stampa-doc .vuoto { padding: 40px; text-align: center; color: #6b7280; }
    @media print {
      .stampa-doc { background: #fff; }
      .stampa-doc .barra { display: none; }
      .stampa-doc .foglio { margin: 0; box-shadow: none; }
    }
  `
})
export class StampaDocumento implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly PIE = PIE_DI_PAGINA;
  protected readonly intestazione = intestazioneSede;
  protected readonly dati: DocumentoStampa | null = (() => {
    try { return JSON.parse(sessionStorage.getItem('stampa') ?? 'null') as DocumentoStampa | null; } catch { return null; }
  })();

  ngOnInit(): void {
    if (this.dati) document.title = `${this.dati.titolo} – Stampa`;
    if (this.dati && this.route.snapshot.queryParamMap.has('auto')) setTimeout(() => window.print(), 400);
  }
  protected stampa(): void { window.print(); }
  /** aperta in una scheda nuova (nota del trasferimento): Chiudi chiude la scheda; altrimenti si torna alla scheda del movimento */
  protected chiudi(): void {
    if (window.opener) { window.close(); return; }
    if (this.dati?.ritorno) void this.router.navigateByUrl(this.dati.ritorno); else history.back();
  }
}
