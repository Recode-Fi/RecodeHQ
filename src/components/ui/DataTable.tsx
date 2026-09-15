"use client";

import { useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  width?: string;
  sortable?: boolean;
  /** Preformatted cell content. */
  render: (row: T) => ReactNode;
  /** Sort value — numeric or string; nulls always sort last. */
  sortValue?: (row: T) => number | string | null;
  /** Hide this column below the given breakpoint (mobile card mode). */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  priority?: number; // lower = kept on mobile
}

const HIDE_CLASS: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  initialSort,
  emptyState,
  dense = false,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  initialSort?: { key: string; dir: "asc" | "desc" };
  emptyState?: ReactNode;
  dense?: boolean;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
  }, [rows, sort, columns]);

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const pad = dense ? "py-1.5" : "py-2.5";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => {
              const sortable = Boolean(c.sortable && c.sortValue);
              const isActive = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  className={`${c.hideBelow ? HIDE_CLASS[c.hideBelow] : ""} ${
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                  } px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint`}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSort((s) =>
                          s?.key === c.key
                            ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" }
                            : { key: c.key, dir: "desc" },
                        )
                      }
                      className={`inline-flex items-center gap-1 uppercase tracking-[0.12em] transition-colors hover:text-muted ${
                        isActive ? "text-green" : ""
                      }`}
                    >
                      {c.header}
                      <span className="text-[9px]">{isActive ? (sort!.dir === "asc" ? "▲" : "▼") : "△"}</span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`row-hover border-b border-line-soft ${onRowClick ? "cursor-pointer" : ""}`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`${c.hideBelow ? HIDE_CLASS[c.hideBelow] : ""} ${
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                  } ${pad} px-3 align-middle`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
