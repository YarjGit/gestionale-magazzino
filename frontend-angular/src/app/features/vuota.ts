import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Pagina vuota di passaggio (cambio sede: si ricarica la Dashboard da capo). */
@Component({ selector: 'app-vuota', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
export class Vuota {}
