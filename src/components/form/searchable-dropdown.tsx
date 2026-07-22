"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { clsx } from "clsx";

export type SearchableDropdownOption = {
  description?: string;
  disabled?: boolean;
  label: string;
  searchText?: string;
  value: string;
};

type BaseProps = {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  emptyText?: string;
  name?: string;
  options: SearchableDropdownOption[];
  placeholder?: string;
  searchPlaceholder?: string;
};

type SingleProps = BaseProps & {
  multiple?: false;
  onChange: (value: string) => void;
  value: string;
};

type MultiProps = BaseProps & {
  multiple: true;
  onChange: (value: string[]) => void;
  value: string[];
};

export type SearchableDropdownProps = SingleProps | MultiProps;

function optionSearchText(option: SearchableDropdownOption) {
  return `${option.label} ${option.description ?? ""} ${option.value} ${option.searchText ?? ""}`.toLowerCase();
}

function selectedSingleLabel(options: SearchableDropdownOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? "";
}

export function SearchableDropdown(props: SearchableDropdownProps) {
  const {
    ariaLabel,
    className,
    disabled = false,
    emptyText = "No results found.",
    name,
    options,
    placeholder = "Select option",
    searchPlaceholder,
  } = props;
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedValues = props.multiple ? props.value : props.value ? [props.value] : [];
  const selectedOptions = selectedValues
    .map((value) => options.find((option) => option.value === value))
    .filter(Boolean) as SearchableDropdownOption[];
  const singleDisplayValue = props.multiple ? "" : selectedSingleLabel(options, props.value);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => optionSearchText(option).includes(normalizedQuery));
  }, [options, query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
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

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function openDropdown() {
    if (disabled) return;
    setQuery("");
    setIsOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function chooseOption(option: SearchableDropdownOption) {
    if (option.disabled) return;

    if (props.multiple) {
      const hasValue = props.value.includes(option.value);
      props.onChange(hasValue ? props.value.filter((value) => value !== option.value) : [...props.value, option.value]);
      setQuery("");
      setIsOpen(true);
      return;
    }

    props.onChange(option.value);
    setQuery("");
    setIsOpen(false);
  }

  function removeValue(value: string) {
    if (!props.multiple) {
      props.onChange("");
      return;
    }
    props.onChange(props.value.filter((selected) => selected !== value));
  }

  return (
    <div ref={rootRef} className={clsx("relative overflow-visible", className)}>
      {name && props.multiple
        ? props.value.map((value) => <input key={value} name={name} type="hidden" value={value} />)
        : null}
      {name && !props.multiple ? <input name={name} type="hidden" value={props.value} /> : null}

      <div
        aria-controls={isOpen ? id : undefined}
        aria-expanded={isOpen}
        aria-label={ariaLabel ?? placeholder}
        className={clsx(
          "min-h-11 w-full rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-ink outline-none ring-brand-accent/20 transition focus-within:ring-4",
          disabled && "cursor-not-allowed bg-surface text-muted-foreground",
        )}
        onClick={openDropdown}
        role="combobox"
      >
        {props.multiple && selectedOptions.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedOptions.map((option) => (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1 text-xs font-bold text-navy"
                key={option.value}
                title={option.label}
              >
                {option.label}
                <button
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-white hover:text-status-fail"
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeValue(option.value);
                  }}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            className="h-7 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-ink outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            disabled={disabled}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
            }}
            onFocus={openDropdown}
            placeholder={props.multiple ? searchPlaceholder ?? placeholder : searchPlaceholder || placeholder}
            value={isOpen ? query : props.multiple ? "" : singleDisplayValue}
          />
          {!props.multiple && props.value ? (
            <button
              aria-label="Clear selected value"
              className="rounded p-1 text-muted-foreground hover:bg-surface hover:text-status-fail"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                removeValue(props.value);
              }}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </div>

      {isOpen && !disabled ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-[90] max-h-60 overflow-y-auto rounded-md border border-border bg-white p-1 shadow-xl"
          id={id}
          role="listbox"
        >
          {filteredOptions.map((option) => {
            const isSelected = selectedValues.includes(option.value);
            return (
              <button
                className={clsx(
                  "flex w-full items-start justify-between gap-3 rounded px-3 py-2 text-left text-sm transition",
                  option.disabled
                    ? "cursor-not-allowed text-muted-foreground opacity-50"
                    : "text-ink hover:bg-surface",
                  isSelected && "bg-surface font-bold text-navy",
                )}
                disabled={option.disabled}
                key={option.value}
                onClick={() => chooseOption(option)}
                title={`${option.label}${option.description ? ` ${option.description}` : ""}`}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {isSelected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-accent" /> : null}
              </button>
            );
          })}
          {filteredOptions.length === 0 ? (
            <p className="px-3 py-3 text-sm font-semibold text-muted-foreground">{emptyText}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
