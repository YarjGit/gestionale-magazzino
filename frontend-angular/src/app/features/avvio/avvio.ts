import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { SedeService } from '../../core/services/sede.service';
import { SupabaseService } from '../../core/services/supabase.service';

/** Pagina provvisoria: controlla il collegamento a Supabase. Le schermate vere arrivano con la migrazione (MIGRAZIONE.md). */
@Component({
  selector: 'app-avvio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="avvio">
      <h1>Gestionale Magazzino · Angular</h1>
      <p>Progetto pronto. Le schermate si aggiungono una alla volta, seguendo la checklist della migrazione.</p>
      <ul>
        <li>Database: <b>{{ statoDb() }}</b></li>
        <li>Accesso: <b>{{ auth.email() ?? 'non ancora fatto' }}</b></li>
        <li>Sede di lavoro (questa scheda): <b>{{ sede.sedeId() ?? 'non scelta' }}</b></li>
      </ul>
    </main>
  `,
  styles: `
    .avvio { max-width: 640px; margin: 48px auto; padding: 0 16px; font-family: Inter, system-ui, sans-serif; color: #1b2230; }
    h1 { font-size: 18px; }
    li { margin: 6px 0; }
  `
})
export class Avvio implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly sede = inject(SedeService);
  private readonly supabase = inject(SupabaseService);
  protected readonly statoDb = signal('controllo…');

  async ngOnInit(): Promise<void> {
    // risposta del database senza leggere dati (senza accesso le regole RLS non mostrano righe)
    const { error } = await this.supabase.client.from('sedi').select('id', { count: 'exact', head: true });
    this.statoDb.set(error ? `errore: ${error.message}` : 'raggiunto');
  }
}
