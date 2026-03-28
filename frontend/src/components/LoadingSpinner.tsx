export default function LoadingSpinner({ text = 'Cargando...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

export function InlineSpinner() {
  return (
    <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
  );
}
