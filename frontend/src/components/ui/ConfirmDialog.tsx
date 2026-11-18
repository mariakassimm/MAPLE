import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
}
type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Accessible replacement for window.confirm: `if (await confirm({ title: 'Remove this address?' })) …` */
export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback<Confirm>((options) => new Promise((resolve) => setPending({ options, resolve })), []);
  const close = (answer: boolean) => {
    pending?.resolve(answer);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <Dialog options={pending.options} onAnswer={close} />}
    </ConfirmContext.Provider>
  );
}

function Dialog({ options, onAnswer }: { options: ConfirmOptions; onAnswer: (v: boolean) => void }) {
  const titleId = useId();
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelBtn.current?.focus(); // the safe choice has focus first
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  // Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onAnswer(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = panel.current?.querySelectorAll<HTMLElement>('button');
      if (!items?.length) return;
      const first = items[0]!,
        last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onAnswer]);

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- see comment on the handler
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal/50 px-5"
      // Backdrop click is a mouse convenience only; Escape and the "Keep it" button are the accessible ways out.
      onMouseDown={(e) => e.target === e.currentTarget && onAnswer(false)}
    >
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.description ? descId : undefined}
        className="w-full max-w-md bg-ivory p-7 shadow-xl sm:p-9"
      >
        <h2 id={titleId} className="font-display text-3xl leading-tight">
          {options.title}
        </h2>
        {options.description && (
          <p id={descId} className="mt-3 text-[14px] leading-relaxed text-stone">
            {options.description}
          </p>
        )}
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button ref={cancelBtn} type="button" className="btn-secondary !min-h-[44px]" onClick={() => onAnswer(false)}>
            {options.cancelLabel ?? 'Keep it'}
          </button>
          <button
            type="button"
            className={`btn-primary !min-h-[44px] ${options.destructive ? '!bg-[#8a2f26] !border-[#8a2f26]' : ''}`}
            onClick={() => onAnswer(true)}
          >
            {options.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
