import { create } from 'zustand';
import { PreviewResult } from '../types';

const DRAFT_STORAGE_KEY = 'chil_order_draft';

interface OrderDraft {
  text: string;
  clientId?: number;
  priceListId?: number;
  preview: PreviewResult | null;
}

interface OrderStore {
  draft: OrderDraft;
  setDraftText: (text: string) => void;
  setDraftClientId: (id: number | undefined) => void;
  setPreview: (preview: PreviewResult) => void;
  clearDraft: () => void;
}

const emptyDraft: OrderDraft = {
  text: '',
  clientId: undefined,
  priceListId: undefined,
  preview: null,
};

/** Carga solo el texto y clientId del localStorage (no el preview, que puede quedar obsoleto) */
function loadPersistedDraft(): OrderDraft {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return { ...emptyDraft };
    const { text, clientId } = JSON.parse(raw) as Partial<OrderDraft>;
    return { ...emptyDraft, text: text ?? '', clientId };
  } catch {
    return { ...emptyDraft };
  }
}

function persistDraft(text: string, clientId: number | undefined) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ text, clientId }));
  } catch {
    // localStorage no disponible (navegador restringido): se ignora silenciosamente
  }
}

function clearPersistedDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignorar
  }
}

export const useOrderStore = create<OrderStore>((set) => ({
  draft: loadPersistedDraft(),

  setDraftText: (text) =>
    set((s) => {
      persistDraft(text, s.draft.clientId);
      return { draft: { ...s.draft, text } };
    }),

  setDraftClientId: (id) =>
    set((s) => {
      persistDraft(s.draft.text, id);
      return { draft: { ...s.draft, clientId: id } };
    }),

  setPreview: (preview) =>
    set((s) => ({ draft: { ...s.draft, preview } })),

  clearDraft: () => {
    clearPersistedDraft();
    set({ draft: { ...emptyDraft } });
  },
}));
