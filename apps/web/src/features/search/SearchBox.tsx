import { useId, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { PATHS } from "@/app/paths";
import { inputStyles } from "@/components/ui/text-input";
import { SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { SearchResults } from "./SearchResults";
import { useSearch } from "./use-search";
import {
  FAILED_TEXT,
  LOADING_TEXT,
  PROMPT_TEXT,
  SEARCH_LABEL,
  SEARCH_PLACEHOLDER_LABEL,
  SUBMIT_LABEL,
  VIEW_ALL_LABEL,
} from "./search-texts";

/** What the results screen receives: the text rides in the router's history state, never in the address (Afik 20.10.2026: the typed text is never stored, and an address reaches server logs). */
export interface SearchLocationState {
  readonly q: string;
}

/** The text a location carries for the results screen, or "" (a reload keeps the history state; a typed address has none). */
export function searchTextOf(state: unknown): string {
  const q: unknown = typeof state === "object" && state !== null ? Reflect.get(state, "q") : undefined;
  return typeof q === "string" ? q : "";
}

// Global search in the top bar (FR-SEARCH-001, AC-039): a field, and under it a dropdown of the first results by kind with "הצגת כל
// התוצאות". It searches after a pause in typing, from two characters, and shares its results with the results screen. Below 768 the bar holds
// a search icon that opens the results screen, where the field is. Enter opens the results screen at once.
export function SearchBox() {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const navigate = useNavigate();
  const panelId = useId();
  const view = useSearch(text, focused);
  const open = focused && text.trim() !== "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() === "") return;
    setFocused(false);
    void navigate(PATHS.search, { state: { q: text.trim() } satisfies SearchLocationState });
  };

  return (
    <>
      <Link
        to={PATHS.search}
        aria-label={SEARCH_LABEL}
        className="inline-flex size-11 items-center justify-center rounded-md text-foreground hover:bg-muted md:hidden"
      >
        <SearchIcon />
      </Link>
      <form
        role="search"
        onSubmit={submit}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocused(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setFocused(false);
        }}
        className="relative hidden md:block"
      >
        <label htmlFor={`${panelId}-q`} className="sr-only">
          {SEARCH_PLACEHOLDER_LABEL}
        </label>
        <input
          id={`${panelId}-q`}
          type="search"
          value={text}
          autoComplete="off"
          aria-controls={open ? panelId : undefined}
          onFocus={() => setFocused(true)}
          onChange={(event) => setText(event.target.value)}
          className={cn(inputStyles, "min-h-11 w-64 lg:w-80")}
        />
        <button type="submit" className="sr-only">
          {SUBMIT_LABEL}
        </button>
        {open ? (
          <div
            id={panelId}
            className="absolute end-0 top-full z-popover mt-1 w-96 rounded-md bg-card p-3 text-card-foreground shadow-card"
          >
            {view.kind === "idle" ? (
              <p className="text-small text-muted-foreground">{PROMPT_TEXT}</p>
            ) : null}
            {view.kind === "loading" ? (
              <p role="status" className="text-small text-muted-foreground">
                {LOADING_TEXT}
              </p>
            ) : null}
            {view.kind === "failed" ? (
              <p role="alert" className="text-small">
                {FAILED_TEXT}
              </p>
            ) : null}
            {view.kind === "results" ? (
              <>
                <SearchResults
                  data={view.data}
                  type="all"
                  limit={3}
                  onChoose={() => setFocused(false)}
                />
                <Link
                  to={PATHS.search}
                  state={{ q: text.trim() } satisfies SearchLocationState}
                  onClick={() => setFocused(false)}
                  className="mt-2 inline-flex min-h-11 items-center text-label text-primary-strong underline underline-offset-4"
                >
                  {VIEW_ALL_LABEL}
                </Link>
              </>
            ) : null}
          </div>
        ) : null}
      </form>
    </>
  );
}
