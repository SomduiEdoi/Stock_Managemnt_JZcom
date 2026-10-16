"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

export function filterFormHref(action: string, data: FormData) {
  const params = new URLSearchParams();
  for (const [key, value] of data) {
    if (typeof value === "string" && value !== "") params.append(key, value);
  }
  params.delete("page");
  const query = params.toString();
  return `${action}${query ? `?${query}` : ""}`;
}

export function InstantFilterForm({ action, onChange, onSubmit, ...props }: Omit<ComponentProps<"form">, "action"> & { action: string }) {
  const router = useRouter();
  return <form {...props} action={action} data-instant-filters method="get"
    onChange={(event) => {
      onChange?.(event);
      const target = event.target;
      if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type === "checkbox")) {
        event.currentTarget.requestSubmit();
      }
    }}
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit?.(event);
      router.push(filterFormHref(action, new FormData(event.currentTarget)), { scroll: false });
    }}
  />;
}
