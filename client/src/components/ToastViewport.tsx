import { useToastStore } from '../store/toast';

export default function ToastViewport() {
  const items = useToastStore((s) => s.items);
  const remove = useToastStore((s) => s.remove);

  if (!items.length) return null;

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {items.map((item) => (
        <div key={item.id} className={`toast-card ${item.tone}`}>
          <div className="toast-copy">
            <strong>{item.title}</strong>
            {item.message ? <p>{item.message}</p> : null}
          </div>
          <button type="button" className="toast-close" onClick={() => remove(item.id)} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
