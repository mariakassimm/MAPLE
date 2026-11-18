import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const FormField = forwardRef<HTMLInputElement, Props>(({ label, error, hint, id, className, ...rest }, ref) => {
  const fieldId = id ?? `f-${rest.name}`;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="field-label">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined}
        className={cn('field', error && 'border-[#8a2f26]')}
        {...rest}
      />
      {hint && !error && (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-[13px] text-stone">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fieldId}-err`} role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
});
FormField.displayName = 'FormField';
