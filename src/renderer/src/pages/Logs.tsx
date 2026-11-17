import { useState } from 'react';
import { Copy, Search } from 'lucide-react';
import type { Snapshot } from '../../../shared/model';
import type { Run } from '../desktop';
import { Feed } from '../components/Common';

export function Logs({ snapshot: s, run }: { snapshot: Snapshot; run: Run }) {
  const [level, setLevel] = useState('ALL');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('feed');
  const logs = s.logs.filter(
    (l) =>
      (level === 'ALL' || l.level === level) &&
      `${l.message} ${l.category}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">KNOW WHAT HAPPENED</div>
          <h1>
            Logs / Diagnostics<span>.</span>
          </h1>
          <p>Cada evento, decisión y respuesta del juego en un solo lugar.</p>
        </div>
        <button className="secondary" onClick={() => void run({ op: 'copyDiagnostics' })}>
          <Copy size={16} /> Copy diagnostics
        </button>
      </div>
      <div className="diagnostic-summary">
        <span>
          <i className="green-dot" /> Runtime activo
        </span>
        <span>{s.errors} errores en esta ejecución</span>
        <span>Retención: {s.settings.logRetentionDays} días / 10.000 registros</span>
        <span>Feed: 500 registros</span>
      </div>
      <div className="tabs">
        <button className={tab === 'feed' ? 'selected' : ''} onClick={() => setTab('feed')}>
          Logs
        </button>
        <button className={tab === 'jobs' ? 'selected' : ''} onClick={() => setTab('jobs')}>
          Historial de trabajos
        </button>
      </div>
      {tab === 'feed' ? (
        <section className="panel">
          <div className="log-filters">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="Buscar logs"
                placeholder="Buscar evento, regla o comando…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select aria-label="Filtrar nivel" value={level} onChange={(e) => setLevel(e.target.value)}>
              {['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR'].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <Feed logs={logs} limit={500} />
        </section>
      ) : (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Regla / evento</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {s.jobs
                  .slice()
                  .reverse()
                  .map((j) => (
                    <tr key={j.id}>
                      <td>
                        <strong>{j.ruleName}</strong>
                        <small>{j.eventId}</small>
                      </td>
                      <td>{j.priority}</td>
                      <td>
                        <span
                          className={`tag ${j.status === 'FAILED' ? 'warning' : j.status === 'COMPLETED' ? 'green' : ''}`}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td>{new Date(j.createdAt).toLocaleTimeString()}</td>
                      <td>{j.error || `${j.actions.length} acciones${j.dryRun ? ' · DRY RUN' : ''}`}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!s.jobs.length && <p className="empty">Todavía no se ejecutaron trabajos.</p>}
          </div>
        </section>
      )}
    </>
  );
}
