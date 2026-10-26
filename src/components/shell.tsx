import { useEffect } from "react";
import { Menu, Search, X } from "lucide-react";
import { ROLE_LABEL, SITES, VIEW_TITLES, siteLabel, type Role, type SiteFilter } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";
import { View } from "@/components/views";
import { SideNav } from "@/components/nav";
import { Select } from "@/components/ui";
import { useConsolePersistence } from "@/lib/cloud/persist";

export function AppShell() {
  const view = useCloud((s) => s.view);
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const navOpen = useCloud((s) => s.navOpen);
  const notice = useCloud((s) => s.notice);
  const setView = useCloud((s) => s.setView);
  const setRole = useCloud((s) => s.setRole);
  const setSite = useCloud((s) => s.setSite);
  const setQuery = useCloud((s) => s.setQuery);
  const setNavOpen = useCloud((s) => s.setNavOpen);
  const restored = useConsolePersistence();

  useEffect(() => {
    const id = window.setInterval(() => useCloud.getState().poll(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="app-surface flex h-dvh text-ink">
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-20 bg-black/35 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        className={`sidebar nav-slide fixed inset-y-0 left-0 z-30 flex w-72 flex-col transition-transform duration-200 md:static md:w-64 md:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <div>
            <div className="text-xs tracking-widest text-white/75 uppercase">Private cloud</div>
            <div className="text-lg font-semibold text-white">Infocloudarc</div>
          </div>
          <button type="button" className="text-white md:hidden" aria-label="Close menu" onClick={() => setNavOpen(false)}>
            <X className="size-5" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
          <SideNav view={view} onSelect={setView} />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex flex-wrap items-center gap-3 border-b border-line bg-white/80 px-4 py-3 backdrop-blur-md md:px-6">
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-[#ffb070] via-[#e85d04] to-transparent" />
          <button type="button" className="inline-flex size-11 items-center justify-center text-ink md:hidden" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium tracking-wide text-accent uppercase">{siteLabel(role === "site" ? "east" : site)}</div>
            <h1 className="truncate text-lg font-semibold">{VIEW_TITLES[view] ?? "Infocloudarc"}</h1>
          </div>
          <label className="relative order-last w-full sm:order-none sm:w-56">
            <Search className="pointer-events-none absolute top-3 left-3 size-4 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter this view"
              className="h-11 w-full rounded-md border border-line bg-white pr-3 pl-9 text-sm outline-none placeholder:text-faint sm:w-56"
            />
          </label>
          <Select
            aria-label="Site"
            value={role === "site" ? "east" : site}
            disabled={role === "site"}
            onChange={(event) => setSite(event.target.value as SiteFilter)}
          >
            <option value="all">All sites</option>
            {SITES.map((item) => (
              <option key={item.id} value={item.id}>{siteLabel(item.id)}</option>
            ))}
          </Select>
          <Select aria-label="Access role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="vendor">{ROLE_LABEL.vendor}</option>
            <option value="global">{ROLE_LABEL.global}</option>
            <option value="site">{ROLE_LABEL.site}</option>
          </Select>
        </header>
        <main className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-6">
          {restored ? (
            <div key={view} className="enter mx-auto max-w-6xl">
              <View id={view} />
            </div>
          ) : (
            <p className="text-sm text-muted">Restoring the saved console…</p>
          )}
        </main>
      </div>

      {notice && (
        <div role="status" className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-line-strong bg-white px-4 py-2 text-sm text-ink shadow-[0_12px_30px_rgba(194,65,12,0.16)]">
          {notice}
        </div>
      )}
    </div>
  );
}
