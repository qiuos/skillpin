import { useEffect, useRef, useState } from "react";

import { themeOptions, type AppTheme } from "./theme-preference.js";

function themeLabel(theme: AppTheme): string {
  return (
    themeOptions.find((option) => option.id === theme)?.label ?? "羊皮卷主题"
  );
}

export function ThemeSelector({
  onThemeChange,
  theme,
}: {
  readonly onThemeChange: (theme: AppTheme) => void;
  readonly theme: AppTheme;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeForOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeForOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeForOutsidePointer);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const chooseTheme = (nextTheme: AppTheme) => {
    onThemeChange(nextTheme);
    close();
  };

  const moveFocus = (direction: 1 | -1) => {
    const options = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="option"]',
      ) ?? []),
    ];
    const currentIndex = options.findIndex(
      (option) => option === document.activeElement,
    );
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + direction + options.length) % options.length;
    options[nextIndex]?.focus();
  };

  return (
    <div className="theme-selector">
      <button
        aria-controls="theme-options"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`主题：${themeLabel(theme)}`}
        className="theme-selector__trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="theme-selector__icon"
          viewBox="0 0 24 24"
        >
          <path d="M12 3.25a8.75 8.75 0 1 0 0 17.5h1.75a1.75 1.75 0 0 0 0-3.5h-1.5a1.5 1.5 0 0 1 0-3h2a6.5 6.5 0 1 0-2.25-11Z" />
          <circle cx="7.75" cy="11" r="1" />
          <circle cx="10.75" cy="7.75" r="1" />
          <circle cx="15.5" cy="8.5" r="1" />
        </svg>
      </button>
      {open ? (
        <div
          aria-label="选择主题"
          className="theme-selector__menu"
          id="theme-options"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              moveFocus(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveFocus(-1);
            }
          }}
          ref={menuRef}
          role="listbox"
        >
          {themeOptions.map((option) => (
            <button
              aria-selected={theme === option.id}
              className="theme-selector__option"
              key={option.id}
              onClick={() => chooseTheme(option.id)}
              role="option"
              type="button"
            >
              <span aria-hidden="true" className="theme-selector__check">
                {theme === option.id ? "✓" : ""}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
