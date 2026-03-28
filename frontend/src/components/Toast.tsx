import { Toast, ToastType } from '../hooks/useToast';

const colors: Record<ToastType, string> = {
  success: 'bg-green-600',
  error:   'bg-red-600',
  info:    'bg-brand-700',
  warning: 'bg-yellow-500',
};

interface Props {
  toasts: Toast[];
  onRemove: (id: number) => void;
}

export default function ToastContainer({ toasts, onRemove }: Props) {
  if (!toasts.length) return null;
  return (
    <div className="fixed top-16 left-0 right-0 z-50 flex flex-col gap-2 px-4 items-center">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${colors[t.type]} text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg
                       flex items-center justify-between gap-3 w-full max-w-lg animate-fade-in`}
          onClick={() => onRemove(t.id)}
        >
          <span>{t.message}</span>
          <button className="opacity-70 hover:opacity-100 flex-shrink-0">✕</button>
        </div>
      ))}
    </div>
  );
}
