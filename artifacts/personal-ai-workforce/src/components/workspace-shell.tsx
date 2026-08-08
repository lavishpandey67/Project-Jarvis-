import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, Bot, BrainCircuit, ChevronLeft, ChevronRight, CircleDot, ClipboardList, Menu, Plus, Sparkles, X } from 'lucide-react';
import { useGetWorkforceSummary } from '@workspace/api-client-react';

const navItems = [
  { href: '/', label: 'Companion', icon: Sparkles },
  { href: '/memory', label: 'Memory', icon: BrainCircuit },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/tasks', label: 'Tasks', icon: ClipboardList },
  { href: '/activity', label: 'Activity', icon: Activity },
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const summary = useGetWorkforceSummary();

  return (
    <div className="app-noise min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 md:translate-x-0 ${collapsed ? 'md:w-[82px]' : ''} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[78px] items-center justify-between border-b border-sidebar-border px-5">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand" onClick={() => setMobileOpen(false)}>
            <span className="grid size-9 place-items-center rounded-[13px] bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_0_0_5px_rgba(245,199,98,.12)]">
              <Sparkles size={18} strokeWidth={2.5} />
            </span>
            {!collapsed && <span className="font-display text-[18px] font-semibold tracking-[-.03em]">Fieldwork</span>}
          </Link>
          <button className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-close-navigation"><X size={18} /></button>
        </div>
        <div className="flex flex-1 flex-col px-3 py-5">
          {!collapsed && <p className="mb-3 px-3 font-mono-app text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/45">Workspace</p>}
          <nav className="space-y-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = location === href;
              return <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] transition-colors ${active ? 'bg-sidebar-primary font-semibold text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase()}`}>
                <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
                {!collapsed && <span>{label}</span>}
                {!collapsed && label === 'Tasks' && (summary.data?.openTaskCount ?? 0) > 0 && <span className={`ml-auto rounded-full px-2 py-0.5 font-mono-app text-[10px] ${active ? 'bg-sidebar-primary-foreground/20' : 'bg-sidebar-foreground/10'}`}>{summary.data?.openTaskCount}</span>}
              </Link>;
            })}
          </nav>
          {!collapsed && <div className="mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-4">
            <div className="mb-3 flex items-center gap-2"><CircleDot size={14} className="text-sidebar-primary" /><span className="font-mono-app text-[10px] uppercase tracking-[.12em] text-sidebar-foreground/55">Companion status</span></div>
            <p className="text-sm leading-5 text-sidebar-foreground/80">Listening for the next useful thing.</p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-sidebar-foreground/45"><span className="size-1.5 rounded-full bg-[#82c99a]" /> System ready</div>
          </div>}
        </div>
        <div className="hidden border-t border-sidebar-border p-3 md:block">
          <button onClick={() => setCollapsed(!collapsed)} className="flex w-full items-center justify-center rounded-xl py-2 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground" data-testid="button-collapse-navigation">
            {collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={16} /><span className="ml-2 text-xs">Collapse</span></>}
          </button>
        </div>
      </aside>
      <div className={`min-h-[100dvh] transition-[padding] duration-300 ${collapsed ? 'md:pl-[82px]' : 'md:pl-[264px]'}`}>
        <header className="sticky top-0 z-30 flex h-[66px] items-center justify-between border-b border-border/80 bg-background/90 px-4 backdrop-blur-md md:px-8">
          <button className="rounded-xl border border-border bg-card p-2.5 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={19} /></button>
          <div className="hidden items-center gap-2 font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground md:flex"><span className="size-1.5 rounded-full bg-[#82c99a]" /> Personal workspace <span className="mx-1 text-border">/</span> {navItems.find((item) => item.href === location)?.label ?? 'Companion'}</div>
          <div className="flex items-center gap-2 md:ml-auto">
            <span className="hidden text-xs text-muted-foreground sm:inline">Your command center</span>
            <div className="grid size-8 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">YU</div>
          </div>
        </header>
        <main className="mx-auto max-w-[1360px] px-4 py-7 md:px-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
    <div className="animate-rise-in"><p className="mb-2 font-mono-app text-[10px] uppercase tracking-[.2em] text-muted-foreground">{eyebrow}</p><h1 className="font-display text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-[.95] tracking-[-.06em] text-primary">{title}</h1>{description && <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted-foreground">{description}</p>}</div>
    {action}
  </div>;
}

export function EmptyState({ title, description, icon: Icon, action }: { title: string; description: string; icon: typeof Sparkles; action?: React.ReactNode }) {
  return <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 text-center"><span className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent/35 text-primary"><Icon size={21} /></span><h3 className="font-display text-xl font-semibold tracking-[-.03em]">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3" aria-label="Loading"><div className="h-5 w-32 animate-pulse rounded bg-muted" />{Array.from({ length: rows }).map((_, index) => <div key={index} className="h-[72px] animate-pulse rounded-2xl bg-muted/70" />)}</div>;
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center"><p className="font-display text-lg font-semibold">The workspace paused.</p><p className="mt-1 text-sm text-muted-foreground">We could not read this view right now.</p><button onClick={onRetry} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" data-testid="button-retry">Try again</button></div>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-3 font-mono-app text-[10px] uppercase tracking-[.18em] text-muted-foreground">{children}</p>;
}