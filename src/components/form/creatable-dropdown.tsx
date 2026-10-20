"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useDropdownPosition } from "./use-dropdown-position";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { clsx } from "clsx";

export type CreatableDropdownOption = {
  description?: string;
  label: string;
  searchText?: string;
  value: string;
};

type CreatableDropdownProps = {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  emptyText?: string;
  error?: boolean;
  onChange: (value: string) => void;
  onCreate?: (value: string) => void;
  options: CreatableDropdownOption[];
  placeholder?: string;
  required?: boolean;
  searchPlaceholder?: string;
  value: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function optionSearchText(option: CreatableDropdownOption) {
  return `${option.label} ${option.value} ${option.description ?? ""} ${option.searchText ?? ""}`.toLowerCase();
}

function uniqueOptions(options: CreatableDropdownOption[]) {
  const seen = new Set<string>();

  return options.filter((option) => {
    const key = normalize(option.value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function CreatableDropdown({
  ariaLabel,
  className,
  disabled = false,
  emptyText = "No results found.",
  error = false,
  onChange,
  onCreate,
  options,
  placeholder = "Select or enter a value",
  required = false,
  searchPlaceholder,
  value,
}: CreatableDropdownProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuPosition = useDropdownPosition(isOpen && !disabled, triggerRef, menuRef);

  const uniqueOptionList = useMemo(() => uniqueOptions(options), [options]);
  const selectedOption = uniqueOptionList.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalize(query);

    return uniqueOptionList
      .filter((option) => !normalizedQuery || optionSearchText(option).includes(normalizedQuery))
      .slice(0, 50);
  }, [query, uniqueOptionList]);
  const trimmedQuery = query.trim();
  const hasExactMatch = uniqueOptionList.some((option) => normalize(option.value) === normalize(trimmedQuery));
  const canCreate = Boolean(trimmedQuery) && !hasExactMatch;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
        setQuery("");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setQuery("");
        inputRef.current?.blur();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function openDropdown() {
    if (disabled) return;

    setQuery("");
    setIsOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function chooseOption(option: CreatableDropdownOption) {
    onChange(option.value);
    setIsOpen(false);
    setQuery("");
  }

  function createOption() {
    if (!canCreate) return;

    onChange(trimmedQuery);
    onCreate?.(trimmedQuery);
    setIsOpen(false);
    setQuery("");
  }

  return (
    <div className={clsx("relative overflow-visible", className)} ref={rootRef}>
      <div
        aria-controls={isOpen ? id : undefined}
        aria-expanded={isOpen}
        aria-label={ariaLabel ?? placeholder}
        className={clsx(
          "min-h-11 w-full rounded-md border bg-white px-3 py-2 text-sm font-semibold text-ink outline-none ring-brand-accent/20 transition focus-within:ring-4",
          error ? "border-status-fail" : "border-border",
          disabled && "cursor-not-allowed bg-surface text-muted-foreground",
        )}
        onClick={openDropdown}
        ref={triggerRef}
        role="combobox"
      >
        <div className="flex items-center gap-2">
          <input
            aria-autocomplete="list"
            aria-invalid={error || undefined}
            aria-required={required || undefined}
            className="h-7 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-gray-400 disabled:cursor-not-allowed"
            disabled={disabled}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
            }}
            onFocus={openDropdown}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              if (canCreate) {
                event.preventDefault();
                createOption();
              } else if (filteredOptions[0]) {
                event.preventDefault();
                chooseOption(filteredOptions[0]);
              }
            }}
            placeholder={isOpen ? searchPlaceholder ?? placeholder : placeholder}
            ref={inputRef}
            value={isOpen ? query : selectedOption?.label ?? value}
          />
          {value ? (
            <button
              aria-label="Clear selected value"
              className="rounded p-1 text-muted-foreground hover:bg-surface hover:text-status-fail"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onChange("");
                setQuery("");
                setIsOpen(true);
                inputRef.current?.focus();
              }}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </div>

      {isOpen ? createPortal(
        <div
          className="fixed z-[1000] max-h-60 overflow-y-auto overscroll-contain rounded-md border border-border bg-white p-1 shadow-xl"
          id={id}
          onClick={(event) => event.stopPropagation()}
          ref={menuRef}
          role="listbox"
          style={menuPosition}
        >
          {filteredOptions.map((option) => (
            <button
              className={clsx(
                "flex w-full items-start justify-between gap-3 rounded px-3 py-2 text-left text-sm transition",
                option.value === value ? "bg-surface font-bold text-navy" : "text-ink hover:bg-surface",
              )}
              key={option.value}
              onClick={() => chooseOption(option)}
              title={option.description ? `${option.label} ${option.description}` : option.label}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{option.description}</span>
                ) : null}
              </span>
              {option.value === value ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-accent" /> : null}
            </button>
          ))}
          {canCreate ? (
            <button
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-bold text-brand-accent hover:bg-brand-accent/10"
              onClick={createOption}
              type="button"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">Add &quot;{trimmedQuery}&quot;</span>
            </button>
          ) : null}
          {!filteredOptions.length && !canCreate ? (
            <p className="px-3 py-3 text-sm font-semibold text-muted-foreground">{emptyText}</p>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
