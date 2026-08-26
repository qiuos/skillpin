import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from "react";

export type ButtonVariant = "danger" | "primary" | "secondary" | "tertiary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

export function Button({
  className = "",
  type = "button",
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`button button--${variant} ${className}`.trim()}
      type={type}
    />
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly hint?: string;
}

export function TextInput({ hint, id, label, ...props }: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint === undefined ? undefined : `${inputId}-hint`;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <input
        {...props}
        aria-describedby={hintId}
        className="text-input"
        id={inputId}
      />
      {hint === undefined ? null : (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      )}
    </label>
  );
}

interface ChoiceProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  readonly label: ReactNode;
}

export function Checkbox({ label, ...props }: ChoiceProps) {
  const id = useId();
  return (
    <label className="choice" htmlFor={id}>
      <input {...props} id={id} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

export function Radio({ label, ...props }: ChoiceProps) {
  const id = useId();
  return (
    <label className="choice" htmlFor={id}>
      <input {...props} id={id} type="radio" />
      <span>{label}</span>
    </label>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: PropsWithChildren<{
  readonly tone?: "accent" | "neutral" | "success" | "warning";
}>) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ];
}

function useFocusTrap(open: boolean, onClose: () => void) {
  const container = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || container.current === null) {
      return;
    }
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusables = focusableElements(container.current);
    (focusables[0] ?? container.current).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab" || container.current === null) {
        return;
      }
      const targets = focusableElements(container.current);
      const first = targets[0];
      const last = targets.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocus.current?.focus();
    };
  }, [onClose, open]);

  return container;
}

interface OverlayProps extends PropsWithChildren {
  readonly description?: string;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly title: string;
}

export function Dialog({
  children,
  description,
  onClose,
  open,
  title,
}: OverlayProps) {
  const titleId = useId();
  const descriptionId = useId();
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        aria-describedby={description === undefined ? undefined : descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={ref}
        role="dialog"
        tabIndex={-1}
      >
        <div className="overlay__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description === undefined ? null : (
              <p id={descriptionId}>{description}</p>
            )}
          </div>
          <Button
            aria-label="Close dialog"
            onClick={onClose}
            variant="tertiary"
          >
            ×
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Drawer({
  children,
  description,
  onClose,
  open,
  title,
}: OverlayProps) {
  const titleId = useId();
  const descriptionId = useId();
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={onClose}>
      <aside
        aria-describedby={description === undefined ? undefined : descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="drawer"
        onMouseDown={(event) => event.stopPropagation()}
        ref={ref}
        role="dialog"
        tabIndex={-1}
      >
        <div className="overlay__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description === undefined ? null : (
              <p id={descriptionId}>{description}</p>
            )}
          </div>
          <Button aria-label="Close panel" onClick={onClose} variant="tertiary">
            ×
          </Button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function Tooltip({
  children,
  content,
}: PropsWithChildren<{ readonly content: string }>) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <span
      aria-describedby={visible ? id : undefined}
      className="tooltip"
      onBlur={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible ? (
        <span className="tooltip__content" id={id} role="tooltip">
          {content}
        </span>
      ) : null}
    </span>
  );
}

export function EmptyState({
  action,
  body,
  title,
}: {
  readonly action?: ReactNode;
  readonly body: string;
  readonly title: string;
}) {
  return (
    <section className="empty-state">
      <span aria-hidden="true" className="empty-state__icon">
        ◇
      </span>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </section>
  );
}
