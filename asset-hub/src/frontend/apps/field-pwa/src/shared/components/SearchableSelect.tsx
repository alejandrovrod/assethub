// SearchableSelect.tsx — Offline-first combobox for PWA forms
//
// Renders a button that shows the current selection and opens a popover with a
// search input plus a scrollable option list. Filtering is fully synchronous over
// the options already loaded in memory (IndexedDB-backed data), so it works offline
// and feels instant on low-end devices.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface SearchableSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  required?: boolean;
  /** Icon shown next to the selected value inside the control. */
  icon?: ReactNode;
  /** Shows the `X` clear button when there is a value. Defaults to true. */
  clearable?: boolean;
  className?: string;
}

const PANEL_MAX_HEIGHT = 300;
const PANEL_MIN_WIDTH = 220;

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

interface PanelPosition {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Seleccione una opción…',
  searchPlaceholder = 'Buscar...',
  emptyMessage = 'No se encontraron resultados',
  disabled = false,
  required = false,
  icon,
  clearable = true,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<PanelPosition | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);
  const selectedLabel = selected?.label ?? value;
  const showClear = clearable && Boolean(value) && !disabled;

  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return options;
    return options.filter(
      (option) => normalize(option.label).includes(term) || normalize(option.value).includes(term),
    );
  }, [options, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const select = useCallback(
    (next: string) => {
      onChange(next);
      close();
      triggerRef.current?.focus();
    },
    [onChange, close],
  );

  // Keep the popover anchored to the trigger. It renders in a portal so it is not
  // clipped by scrollable modals/sheets.
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < PANEL_MAX_HEIGHT && spaceAbove > spaceBelow;

    setPosition({
      left: rect.left,
      width: Math.max(rect.width, PANEL_MIN_WIDTH),
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      maxHeight: Math.max(160, Math.min(PANEL_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleReposition = () => updatePosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    window.visualViewport?.addEventListener('resize', handleReposition);

    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
      window.visualViewport?.removeEventListener('resize', handleReposition);
    };
  }, [open, updatePosition]);

  // Close on outside press or Escape (Escape must not bubble to the parent sheet).
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option) select(option.value);
      return;
    }
    if (event.key === 'Tab') close();
  };

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-left text-sm text-foreground shadow-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
          showClear ? 'pr-9' : 'pr-8',
        )}
      >
        {(selected?.icon ?? icon) ? (
          <span className="shrink-0 text-muted-foreground">{selected?.icon ?? icon}</span>
        ) : null}
        <span className={cn('flex-1 truncate', !selected && !value && 'text-muted-foreground')}>
          {selectedLabel || placeholder}
        </span>
        {!showClear && <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />}
      </button>

      {showClear && (
        <button
          type="button"
          aria-label="Limpiar selección"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* Native mirror so browser form validation still enforces required fields. */}
      {required && (
        <select
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => {}}
          className="sr-only"
        >
          <option value="" />
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              left: position.left,
              width: position.width,
              top: position.top,
              bottom: position.bottom,
              maxHeight: position.maxHeight,
              zIndex: 100,
            }}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl"
          >
            <div className="flex items-center gap-2 border-b border-border/60 px-3">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={listboxId}
                aria-autocomplete="list"
                className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div id={listboxId} role="listbox" className="max-h-60 min-h-0 flex-1 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyMessage}</p>
              ) : (
                filtered.map((option, index) => {
                  const isSelected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-active={index === activeIndex ? 'true' : undefined}
                      onClick={() => select(option.value)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        'flex min-h-[40px] w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                        isSelected ? 'bg-primary/10 font-medium text-foreground' : 'text-foreground',
                        index === activeIndex && !isSelected && 'bg-muted',
                      )}
                    >
                      {option.icon ? (
                        <span className="shrink-0 text-muted-foreground">{option.icon}</span>
                      ) : null}
                      <span className="flex-1 truncate">{option.label}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
