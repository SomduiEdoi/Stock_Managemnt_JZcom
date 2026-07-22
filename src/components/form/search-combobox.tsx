"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
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

const defaultCategories = [{ label: "All", value: "ALL" }];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function suggestionText(suggestion: SearchComboboxSuggestion) {
  return `${suggestion.label} ${suggestion.value ?? ""} ${suggestion.category ?? ""} ${suggestion.searchText ?? ""}`;
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
  categories = defaultCategories,
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
  const [category, setCategory] = useState(categories[0]?.value ?? "ALL");
  const [isOpen, setIsOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentValue = isControlled ? value : internalValue;
  const activeCategory = categories.find((item) => item.value === category) ?? categories[0];

  const filteredSuggestions = useMemo(() => {
    const normalizedQuery = normalize(currentValue);
    const active = category === "ALL" ? null : category;
    return suggestions
      .filter((suggestion) => !active || suggestion.category === active)
      .filter((suggestion) => {
        if (!normalizedQuery) return true;
        return suggestionText(suggestion).toLowerCase().includes(normalizedQuery);
      })
      .slice(0, 12);
  }, [category, currentValue, suggestions]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCategoryOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setIsCategoryOpen(false);
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
    setIsCategoryOpen(false);
  }

  return (
    <div ref={rootRef} className={clsx("relative overflow-visible", className)}>
      <input name={name} type="hidden" value={currentValue} />
      <div className="flex h-11 overflow-hidden rounded-md border border-border bg-white shadow-sm ring-brand-accent/20 transition focus-within:ring-4">
        <button
          className="flex min-w-[122px] items-center justify-center gap-2 border-r border-border bg-surface px-3 text-sm font-semibold text-ink hover:text-navy"
          onClick={() => {
            setIsCategoryOpen((current) => !current);
            setIsOpen(false);
          }}
          type="button"
        >
          <span className="truncate">{activeCategory?.label ?? "All"}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
        <input
          ref={inputRef}
          className="min-w-0 flex-1 border-0 bg-white px-4 text-sm font-medium text-ink outline-none placeholder:text-muted-foreground"
          onChange={(event) => {
            updateValue(event.target.value);
            setIsOpen(true);
            setIsCategoryOpen(false);
          }}
          onFocus={() => {
            setIsOpen(true);
            setIsCategoryOpen(false);
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

      {isCategoryOpen ? (
        <div className="absolute left-0 top-[calc(100%+4px)] z-[95] min-w-[160px] rounded-md border border-border bg-white p-1 shadow-xl">
          {categories.map((item) => (
            <button
              className={clsx(
                "block w-full rounded px-3 py-2 text-left text-sm font-semibold hover:bg-surface",
                item.value === category ? "text-navy" : "text-muted-foreground",
              )}
              key={item.value}
              onClick={() => {
                setCategory(item.value);
                setIsCategoryOpen(false);
                setIsOpen(true);
                inputRef.current?.focus();
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

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
