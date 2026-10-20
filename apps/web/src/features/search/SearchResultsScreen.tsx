import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { SEARCH_TYPES, type SearchType } from "@nestly/shared";
import { Button } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/text-input";
import { cn } from "@/lib/cn";
import { searchPath } from "./SearchBox";
import { SearchResults } from "./SearchResults";
import { useSearch } from "./use-search";
import {
  FAILED_TEXT,
  LOADING_TEXT,
  NONE_TEXT,
  PROMPT_TEXT,
  RETRY_LABEL,
  SEARCH_PLACEHOLDER_LABEL,
  SUBMIT_LABEL,
  TABS,
} from "./search-texts";

// The search results screen (PG-017, FR-SEARCH-001, AC-039): the text in the address (`/search?q=`), a field to change it, and the tabs All /
// People / Groups / Posts over one search. Every result went through the database's own permissions before it was ranked.
export function SearchResultsScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);
  const [type, setType] = useState<SearchType>("all");
  useEffect(() => setText(q), [q]);
  const [retry, setRetry] = useState(0);
  const view = useSearch(q, true, retry);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() !== "")
      void navigate(searchPath(text.trim()), { replace: true });
  };
  const empty =
    view.kind === "results" &&
    view.data.people.length === 0 &&
    view.data.posts.length === 0 &&
    !view.data.peopleLimited;

  return (
    <div>
      <form role="search" onSubmit={submit} className="flex items-center gap-2">
        <label htmlFor="search-page-q" className="sr-only">
          {SEARCH_PLACEHOLDER_LABEL}
        </label>
        <input
          id="search-page-q"
          type="search"
          value={text}
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
          className={cn(inputStyles, "flex-1")}
        />
        <Button type="submit">{SUBMIT_LABEL}</Button>
      </form>
      <div
        role="group"
        aria-label="סוג תוצאות"
        className="mt-3 flex flex-wrap gap-2"
      >
        {SEARCH_TYPES.map((kind) => (
          <Button
            key={kind}
            variant={type === kind ? "primary" : "soft"}
            aria-pressed={type === kind}
            onClick={() => setType(kind)}
          >
            {TABS[kind]}
          </Button>
        ))}
      </div>
      <div className="mt-4" aria-live="polite">
        {view.kind === "idle" ? (
          <p className="text-muted-foreground">{PROMPT_TEXT}</p>
        ) : null}
        {view.kind === "loading" ? (
          <p role="status" className="text-muted-foreground">
            {LOADING_TEXT}
          </p>
        ) : null}
        {view.kind === "failed" ? (
          <div>
            <p role="alert">{FAILED_TEXT}</p>
            <Button variant="text" onClick={() => setRetry((n) => n + 1)}>
              {RETRY_LABEL}
            </Button>
          </div>
        ) : null}
        {view.kind === "results" ? (
          <>
            {empty ? (
              <p className="mb-3 text-muted-foreground">{NONE_TEXT}</p>
            ) : null}
            <SearchResults data={view.data} type={type} />
          </>
        ) : null}
      </div>
    </div>
  );
}
