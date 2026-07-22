"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { clsx } from "clsx";

export type SearchComboboxSuggestion = {
  category?: string;
  label: string;
  searchText?: string;
  value?: string;
};

export type SearchComboboxCategory = {
  label: string;
  value: string;
};

type SearchComboboxProps = {
  categories?: SearchComboboxCategory[];
  className?: string;
  defaultValue?: string;
  name?: string;
  onChange?: (value: string) => void;
  placeholder: string;
  suggestions: SearchComboboxSuggestion[];
  value?: string;
};


function normalize(value: string) {
  return value.trim().toLowerCase();
}

function suggestionText(suggestion: SearchComboboxSuggestion) {
  return `${suggestion.label} ${suggestion.value ?? ""} ${suggestion.category ?? ""} ${suggestion.searchText ?? ""}`;
}

function dedupeSuggestionKey(suggestion: SearchComboboxSuggestion) {
  return normalize(suggestion.value ?? suggestion.label);
}

function uniqueSuggestions(suggestions: SearchComboboxSuggestion[]) {
  const seen = new Set<string>();

  return suggestions.filter((suggestion) => {
    const key = dedupeSuggestionKey(suggestion);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderHighlighted(label: string, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return label;

  const lower = label.toLowerCase();
  const index = lower.indexOf(normalizedQuery);
  if (index < 0) return label;

  return (
    <>
      <strong className="font-bold text-ink">{label.slice(0, index)}</strong>
      <span className="text-muted-foreground">{label.slice(index, index + query.trim().length)}</span>
      <span className="text-muted-foreground">{label.slice(index + query.trim().length)}</span>
    </>
  );
}

export function SearchCombobox({
  className,
  defaultValue = "",
  name = "q",
  onChange,
  placeholder,
  suggestions,
  value,
}: SearchComboboxProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentValue = isControlled ? value : internalValue;
  const filteredSuggestions = useMemo(() => {
    const normalizedQuery = normalize(currentValue);
    return uniqueSuggestions(
      suggestions.filter((suggestion) => {
        if (!normalizedQuery) return true;
        return suggestionText(suggestion).toLowerCase().includes(normalizedQuery);
      }),
    ).slice(0, 12);
  }, [currentValue, suggestions]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
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

  function updateValue(nextValue: string) {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    onChange?.(nextValue);
  }

  function chooseSuggestion(suggestion: SearchComboboxSuggestion) {
    updateValue(suggestion.value ?? suggestion.label);
    setIsOpen(false);
  }

  return (
    <div ref={rootRef} className={clsx("relative overflow-visible", className)}>
      <input name={name} type="hidden" value={currentValue} />
      <div className="flex h-11 overflow-hidden rounded-md border border-border bg-white shadow-sm ring-brand-accent/20 transition focus-within:ring-4">
        <input
          ref={inputRef}
          className="min-w-0 flex-1 border-0 bg-white px-4 text-sm font-medium text-ink outline-none placeholder:text-muted-foreground"
          onChange={(event) => {
            updateValue(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
          }}
          placeholder={placeholder}
          value={currentValue}
        />
        {currentValue ? (
          <button
            aria-label="Clear search"
            className="flex w-11 items-center justify-center border-l border-border text-muted-foreground transition hover:bg-surface hover:text-navy"
            onClick={() => {
              updateValue("");
              setIsOpen(true);
              inputRef.current?.focus();
            }}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <button
          aria-label="Search"
          className="flex w-12 items-center justify-center border-l border-border text-navy transition hover:bg-surface"
          type="submit"
        >
          <Search className="h-5 w-5" />
        </button>
      </div>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[90] max-h-80 overflow-y-auto rounded-md border border-border bg-white py-2 shadow-xl">
          {filteredSuggestions.map((suggestion, index) => (
            <button
              className="block w-full px-6 py-2 text-left text-base leading-7 text-ink hover:bg-surface"
              key={`${suggestion.category ?? "ALL"}-${suggestion.value ?? suggestion.label}-${index}`}
              onClick={() => chooseSuggestion(suggestion)}
              title={suggestionText(suggestion)}
              type="button"
            >
              {renderHighlighted(suggestion.label, currentValue)}
            </button>
          ))}
          {filteredSuggestions.length === 0 ? (
            <p className="px-6 py-3 text-sm font-semibold text-muted-foreground">No results found.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


