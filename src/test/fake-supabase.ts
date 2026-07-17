import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimal chainable, thenable stand-in for the supabase-js query builder,
 * used to prove that services apply tenant filters at the API boundary.
 * Rows are plain objects; every .eq() must match a row's fields for it to be
 * returned — so a missing business_id filter (or a foreign business id)
 * changes observable behavior exactly like the real database would.
 */

type Row = Record<string, unknown>;

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private op: "select" | "update" | "delete" | "insert" = "select";
  readonly filters: Record<string, unknown> = {};
  private patch: Row | null = null;
  private inserted: Row | null = null;
  private wantSingle = false;

  constructor(
    private readonly store: FakeSupabase,
    private readonly table: string,
  ) {}

  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters[column] = value;
    this.store.recordFilter(this.table, column, value);
    return this;
  }
  is(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }
  neq() {
    return this;
  }
  in() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  insert(row: Row) {
    this.op = "insert";
    this.inserted = row;
    return this;
  }
  maybeSingle() {
    this.wantSingle = true;
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }

  private matches(row: Row): boolean {
    return Object.entries(this.filters).every(([column, value]) => {
      if (value === null) return row[column] == null;
      return row[column] === value;
    });
  }

  private execute(): { data: unknown; error: null } {
    const rows = this.store.tables[this.table] ?? [];
    if (this.op === "insert" && this.inserted) {
      const row = { id: `new-${this.table}`, ...this.inserted };
      rows.push(row);
      return { data: this.wantSingle ? row : [row], error: null };
    }
    const matched = rows.filter((row) => this.matches(row));
    if (this.op === "update" && this.patch) {
      for (const row of matched) Object.assign(row, this.patch);
    }
    if (this.op === "delete") {
      this.store.tables[this.table] = rows.filter((row) => !this.matches(row));
    }
    const data = this.wantSingle ? (matched[0] ?? null) : matched;
    return { data, error: null };
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]>;
  /** Every eq() filter applied, per table — lets tests assert scoping. */
  appliedFilters: Record<string, Record<string, unknown>[]> = {};

  constructor(tables: Record<string, Row[]>) {
    this.tables = structuredClone(tables);
  }

  recordFilter(table: string, column: string, value: unknown) {
    (this.appliedFilters[table] ??= []).push({ [column]: value });
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  /** Cast for handing to code typed against SupabaseClient. */
  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }

  filtersFor(table: string, column: string): unknown[] {
    return (this.appliedFilters[table] ?? [])
      .filter((f) => column in f)
      .map((f) => f[column]);
  }
}
