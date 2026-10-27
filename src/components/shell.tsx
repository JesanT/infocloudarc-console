import { useEffect } from "react";
import { Menu, Search, X } from "lucide-react";
import { ROLE_LABEL, VIEW_TITLES, boundSite, siteLabel, type Role, type SiteFilter, type SiteKey } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";
import { View } from "@/components/views";
import { SideNav } from "@/components/nav";
import { Select } from "@/components/ui";
import { useConsolePersistence } from "@/lib/cloud/persist";
import { syncFromHypervisors } from "@/lib/cloud/reconcile";

export function AppShell() {
  const view = useCloud((s) => s.view);
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const navOpen = useCloud((s) => s.navOpen);
  const notice = useCloud((s) => s.notice);
  const sites = useCloud((s) => s.sites);
  const setView = useCloud((s) => s.setView);
  const setRole = useCloud((s) => s.setRole);
  const setSite = useCloud((s) => s.setSite);
  const setQuery = useCloud((s) => s.setQuery);
  const setNavOpen = useCloud((s) => s.setNavOpen);
  const restored = useConsolePersistence();
  const viewing = boundSite(role, site);

  useEffect(() => {
    const id = window.setInterval(() => useCloud.getState().poll(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!restored) return;
    void syncFromHypervisors().then((note) => {
      if (note) useCloud.getState().flash(note);
    });
  }, [restored]);

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
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-accent uppercase">Private cloud</div>
            <div className="text-base font-semibold text-ink">Infocloudarc</div>
          </div>
          <button type="button" className="text-ink md:hidden" aria-label="Close menu" onClick={() => setNavOpen(false)}>
            <X className="size-5" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
          <SideNav view={view} role={role} onSelect={setView} />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2 md:px-5">
          <button type="button" className="inline-flex size-8 items-center justify-center text-ink md:hidden" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-accent">{siteLabel(viewing)}</div>
            <h1 className="truncate text-base font-semibold">{VIEW_TITLES[view] ?? "Infocloudarc"}</h1>
          </div>
          <label className="relative order-last w-full sm:order-none sm:w-64">
            <Search className="pointer-events-none absolute top-2 left-2 size-4 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter this view"
              className="h-8 w-full rounded-sm border border-[#8a8886] bg-white pr-2 pl-8 text-sm outline-none placeholder:text-faint focus:border-[#0078d4] sm:w-64"
            />
          </label>
          <Select
            aria-label="Site"
            value={viewing}
            disabled={role === "site"}
            onChange={(event) => setSite(event.target.value as SiteFilter)}
          >
            {role !== "site" && <option value="all">All sites</option>}
            {sites.filter((item) => role !== "site" || item.id === viewing).map((item) => (
              <option key={item.id} value={item.id}>{siteLabel(item.id)}</option>
            ))}
          </Select>
          <Select
            aria-label="Access role"
            value={role === "site" ? `site:${viewing === "all" ? "east" : viewing}` : role}
            onChange={(event) => {
              const value = event.target.value;
              if (value.startsWith("site:")) setRole("site", value.slice(5) as SiteKey);
              else setRole(value as Role);
            }}
          >
            <option value="vendor">{ROLE_LABEL.vendor}</option>
            <option value="global">{ROLE_LABEL.global}</option>
            {sites.map((item) => (
              <option key={item.id} value={`site:${item.id}`}>Site admin — {item.name}</option>
            ))}
          </Select>
        </header>
        <main className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-5">
          {restored ? (
            <div key={view} className="enter">
              <View id={view} />
            </div>
          ) : (
            <p className="text-sm text-muted">Restoring the saved console…</p>
          )}
        </main>
      </div>

      {notice && (
        <div role="status" className="fixed right-4 bottom-4 z-40 max-w-md rounded-sm border border-line bg-white px-3 py-2 text-sm text-ink shadow-[0_3.2px_7.2px_rgba(0,0,0,0.13)]">
          {notice}
        </div>
      )}
    </div>
  );
}
