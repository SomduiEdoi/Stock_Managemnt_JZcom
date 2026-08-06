import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

type TablePaginationProps = {
  currentPage: number;
  hrefForPage: (page: number) => string;
  summary?: string;
  totalPages: number;
};

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(1, page), Math.max(1, totalPages));
}

function paginationItems(currentPage: number, totalPages: number) {
  const pages = new Set<number>([1, totalPages, currentPage]);

  for (let offset = -1; offset <= 1; offset += 1) {
    const page = currentPage + offset;
    if (page >= 1 && page <= totalPages) {
      pages.add(page);
    }
  }

  if (currentPage <= 3) {
    [2, 3, 4].forEach((page) => {
      if (page <= totalPages) pages.add(page);
    });
  }

  if (currentPage >= totalPages - 2) {
    [totalPages - 3, totalPages - 2, totalPages - 1].forEach((page) => {
      if (page >= 1) pages.add(page);
    });
  }

  const sortedPages = [...pages].sort((left, right) => left - right);
  const items: Array<number | "ellipsis"> = [];

  sortedPages.forEach((page, index) => {
    const previous = sortedPages[index - 1];
    if (previous && page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  });

  return items;
}

function PageLink({
  children,
  disabled = false,
  href,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  href: string;
}) {
  return (
    <Link
      aria-disabled={disabled}
      className={clsx(
        "-ml-px inline-flex h-12 min-w-12 items-center justify-center border border-border bg-white px-4 text-base font-bold text-navy transition first:ml-0 first:rounded-l-sm last:rounded-r-sm",
        !disabled && "hover:bg-surface hover:text-brand-accent",
        disabled && "pointer-events-none cursor-not-allowed opacity-45",
      )}
      href={href}
    >
      {children}
    </Link>
  );
}

function ActivePage({ page }: { page: number }) {
  return (
    <span
      aria-current="page"
      className="relative z-[1] -ml-px inline-flex h-12 min-w-12 items-center justify-center border border-ink bg-ink px-4 text-base font-bold text-white first:ml-0 first:rounded-l-sm last:rounded-r-sm"
    >
      {page.toLocaleString("en-US")}
    </span>
  );
}

export function TablePagination({
  currentPage,
  hrefForPage,
  summary,
  totalPages,
}: TablePaginationProps) {
  const lastPage = Math.max(1, totalPages);

  if (lastPage <= 1) {
    return null;
  }

  const page = clampPage(currentPage, lastPage);
  const items = paginationItems(page, lastPage);
  const pageSummary = summary ?? `Page ${page.toLocaleString("en-US")} of ${lastPage.toLocaleString("en-US")}`;

  return (
    <footer className="flex justify-center py-5 text-sm text-muted-foreground">
      <p className="sr-only">{pageSummary}</p>
      <nav aria-label="Pagination" className="inline-flex items-center shadow-sm">
        <PageLink disabled={page <= 1} href={hrefForPage(clampPage(page - 1, lastPage))}>
          <ChevronLeft className="h-5 w-5" />
        </PageLink>

        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span
              className="-ml-px inline-flex h-12 min-w-12 items-center justify-center border border-border bg-white px-4 text-base font-bold text-navy"
              key={`ellipsis-${index}`}
            >
              ...
            </span>
          ) : item === page ? (
            <ActivePage key={item} page={item} />
          ) : (
            <PageLink href={hrefForPage(item)} key={item}>
              {item.toLocaleString("en-US")}
            </PageLink>
          ),
        )}

        <PageLink disabled={page >= lastPage} href={hrefForPage(clampPage(page + 1, lastPage))}>
          <ChevronRight className="h-5 w-5" />
        </PageLink>
      </nav>
    </footer>
  );
}
