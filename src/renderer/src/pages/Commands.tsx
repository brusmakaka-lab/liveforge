import { useState } from 'react';
import { BookOpen, Plus, Save, Search, Terminal, Trash2 } from 'lucide-react';
import type { SavedCommand, Snapshot } from '../../../shared/model';
import type { Run } from '../desktop';
import { Field } from '../components/Common';
import { useEditorScroll } from '../components/useEditorScroll';

export function Commands({ snapshot: s, run }: { snapshot: Snapshot; run: Run }) {
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<SavedCommand>();
  const [deleting, setDeleting] = useState(false);
  const editorRef = useEditorScroll(draft?.id);
  const commands = s.commands.filter((c) =>
    `${c.category} ${c.name} ${c.command}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR COMMAND TOOLKIT</div>
          <h1>
            Command library<span>.</span>
          </h1>
          <p>Atajos reutilizables. Todos los comandos siguen siendo editables.</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setDraft({ id: crypto.randomUUID(), category: 'Custom', name: '', command: '', note: '' });
            setDeleting(false);
          }}
        >
          <Plus size={16} /> Nuevo comando
        </button>
      </div>
      <div className="search-field">
        <Search size={17} />
        <input
          aria-label="Buscar comandos"
          placeholder="Buscar un comando, mod o categoría…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span>{commands.length} comandos</span>
      </div>
      {draft && (
        <section className="panel command-editor" ref={editorRef}>
          <div className="panel-heading">
            <h2>
              <Terminal size={17} /> Comando guardado
            </h2>
            <button className="quiet" onClick={() => setDraft(undefined)}>
              Cerrar
            </button>
          </div>
          <div className="editor-body">
            <div className="form-row">
              <Field label="Nombre del comando">
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label="Categoría">
                <input
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Comando personalizado">
              <textarea
                className="code"
                rows={3}
                value={draft.command}
                onChange={(e) => setDraft({ ...draft, command: e.target.value })}
              />
            </Field>
            <Field label="Nota / sintaxis pendiente">
              <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </Field>
            <div className="button-row">
              <button
                className="primary"
                onClick={() =>
                  void run({ op: 'saveCommand', command: draft }).then((r) => {
                    if (r.ok) setDraft(undefined);
                  })
                }
              >
                <Save size={15} /> Guardar comando
              </button>
              <button
                className="quiet"
                onClick={() => {
                  if (deleting)
                    void run({ op: 'deleteCommand', id: draft.id }).then((r) => {
                      if (r.ok) setDraft(undefined);
                    });
                  else setDeleting(true);
                }}
              >
                <Trash2 size={15} />
                {deleting ? 'Confirmar eliminación' : 'Eliminar'}
              </button>
            </div>
          </div>
        </section>
      )}
      <div className="command-grid">
        {commands.map((c) => (
          <button
            className="command-tile"
            key={c.id}
            onClick={() => {
              setDraft(structuredClone(c));
              setDeleting(false);
            }}
          >
            <span className="command-category">
              <BookOpen size={15} />
              {c.category}
            </span>
            <h3>{c.name}</h3>
            <code>{c.command || 'Configura el comando de tu mod'}</code>
            {c.note && <p>{c.note}</p>}
            <span className="command-edit">Editar comando ↗</span>
          </button>
        ))}
      </div>
      <p className="help-text">
        Los comandos de Skyfall y la potencia de /boom se completan con la sintaxis instalada en tu servidor.
        La biblioteca no ejecuta comandos por sí sola.
      </p>
    </>
  );
}
