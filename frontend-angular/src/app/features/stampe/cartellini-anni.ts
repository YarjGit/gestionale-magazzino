import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { barcodeSvg } from '../../shared/barcode';

interface Cartellino { anno: number; corregge: boolean; svg: SafeHtml }

/**
 * Cartellini degli anni per l'inventario (come prototipo/cartellini-anni.html): si spara l'articolo e, se l'etichetta non è
 * dell'anno in corso, subito dopo il cartellino del suo anno. Il barcode contiene "ANNO" + anno (es. ANNO2022, Code 128):
 * non può essere scambiato per un articolo. Un foglio A4 di 3 × 4: 2015 … anno scorso + l'anno in corso "(correggi)".
 * Solo lettura e stampa: non scrive niente nel database.
 */
@Component({
  selector: 'app-cartellini-anni',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head">
      <div><h1 class="page-title">Cartellini degli anni</h1>
        <div class="crumbs"><a routerLink="/dashboard">⌂</a><span>-</span><span>Movimenti</span><span>-</span><a routerLink="/inventario">Inventario</a><span>-</span><span>Cartellini degli anni</span></div></div>
      <div class="azioni-top"><a class="btn btn-light" routerLink="/inventario">✕ Chiudi</a><button class="btn btn-primary" (click)="stampa()">🖨️ Stampa</button></div>
    </div>
    <div class="nota">
      📋 <b>Come si usano all'inventario:</b> sparate l'<b>articolo</b>. Se sull'etichetta c'è l'<b>anno in corso</b> passate all'articolo dopo;
      se c'è un <b>anno vecchio</b> (es. 22), sparate <b>subito dopo</b> il cartellino di quell'anno.
      Il cartellino <b>{{ annoInCorso }} (correggi)</b> serve solo a rimettere sull'anno in corso un pezzo a cui avete dato l'anno sbagliato.<br>
      Stampa su un foglio A4 normale (scala 100%, margini: nessuno) e tenetelo vicino a chi spara.
    </div>
    <div class="anteprima">
      <div class="foglio">
        @for (c of cartellini; track c.anno) {
          <div class="cartellino" [class.corregge]="c.corregge">
            <div class="anno">{{ c.anno }}@if (c.corregge) { (correggi) }</div>
            <div class="barre" [innerHTML]="c.svg"></div>
            <div class="testo">ANNO{{ c.anno }}</div>
            @if (c.corregge) { <div class="spiega">rimette sul {{ c.anno }} l'ultimo pezzo sparato</div> }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .nota { background: #eef5ff; border: 1px solid #c9dcf7; border-radius: 10px; padding: 10px 14px; font-size: 0.9rem; line-height: 1.5; margin-bottom: 14px; }
    .anteprima { background: #e9edf3; border-radius: 12px; padding: 16px; display: flex; justify-content: center; }
    .foglio {
      --s: 2.4px; width: calc(210 * var(--s)); height: calc(297 * var(--s)); padding: calc(12 * var(--s)) calc(10 * var(--s));
      background: #fff; box-shadow: 0 4px 16px rgba(20,30,50,0.15); display: grid; grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(4, 1fr); gap: calc(6 * var(--s)); font-family: Arial, Helvetica, sans-serif; color: #000;
    }
    .cartellino { border: calc(0.5 * var(--s)) dashed #888; border-radius: calc(2 * var(--s)); display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: calc(2 * var(--s)); padding: calc(3 * var(--s)); }
    .cartellino .anno { font-size: calc(16 * var(--s)); font-weight: 700; line-height: 1; }
    .cartellino .barre { width: 92%; height: calc(16 * var(--s)); }
    .cartellino .barre ::ng-deep svg { display: block; width: 100%; height: 100%; }
    .cartellino .testo { font-family: "JetBrains Mono", monospace; font-size: calc(3 * var(--s)); letter-spacing: 0.08em; }
    .cartellino.corregge { background: #f3f3f3; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cartellino.corregge .anno { font-size: calc(12 * var(--s)); }
    .cartellino .spiega { font-size: calc(2.8 * var(--s)); text-align: center; }
    @media print {
      :host ::ng-deep .foglio { --s: 1mm; }
      .page-head, .nota { display: none; }
      .anteprima { padding: 0; background: none; }
      .foglio { position: fixed; left: 0; top: 0; box-shadow: none; }
    }
  `
})
export class CartelliniAnni {
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly annoInCorso = new Date().getFullYear();
  /** 2015 … anno scorso, poi l'anno in corso come "correggi" (senza cartellino un pezzo è già dell'anno in corso) */
  protected readonly cartellini: Cartellino[] = [
    ...Array.from({ length: this.annoInCorso - 2015 }, (_, i) => this.cartellino(2015 + i, false)),
    this.cartellino(this.annoInCorso, true)
  ];

  private cartellino(anno: number, corregge: boolean): Cartellino {
    // contenuto fisso ("ANNO" + quattro cifre): sicuro da mostrare come SVG
    return { anno, corregge, svg: this.sanitizer.bypassSecurityTrustHtml(barcodeSvg('ANNO' + anno, 40)) };
  }
  protected stampa(): void { window.print(); }
}
