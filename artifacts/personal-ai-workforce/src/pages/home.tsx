import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, BrainCircuit, Check, ChevronDown, CircleDot, Clock3, LoaderCircle, MessageSquare, Plus, Sparkles, WandSparkles } from 'lucide-react';
import { Link } from 'wouter';
import { getListActivityQueryKey, getListConversationsQueryKey, getListMessagesQueryKey, getListTasksQueryKey, useCreateConversation, useGetWorkforceSummary, useListActivity, useListAgents, useListConversations, useListMessages, useRespondWithCompanion } from '@workspace/api-client-react';
import { formatRelativeDate, formatTime, initials } from '@/lib/format';
import { EmptyState, ErrorState, LoadingState, SectionLabel } from '@/components/workspace-shell';

function MessageBubble({ role, content, createdAt, agentName }: { role: string; content: string; createdAt: string; agentName?: string }) {
  const isUser = role === 'user';
  return <div className={`animate-rise-in flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[86%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
    {role === 'agent' && <span className="mb-1 ml-1 font-mono-app text-[10px] uppercase tracking-[.13em] text-[#a76f43]">{agentName ?? 'Specialist'}</span>}
    <div className={`rounded-2xl px-4 py-3 text-[14px] leading-6 shadow-sm ${isUser ? 'rounded-br-md bg-primary text-primary-foreground' : role === 'system' ? 'border border-dashed border-border bg-muted/55 text-muted-foreground' : 'rounded-bl-md border border-border bg-card text-foreground'}`} data-testid={`message-${role}-${createdAt}`}>
      {content}
    </div>
    <span className="mt-1 px-1 font-mono-app text-[9px] text-muted-foreground">{formatTime(createdAt)}</span>
  </div></div>;
}

export default function Home() {
  const queryClient = useQueryClient();
  const conversations = useListConversations();
  const createConversation = useCreateConversation();
  const summary = useGetWorkforceSummary();
  const agents = useListAgents();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [sentState, setSentState] = useState('');
  const initialized = useRef(false);
  const list = conversations.data ?? [];
  const activeConversation = list.find((item) => item.id === activeId) ?? list[0];
  const conversationId = activeConversation?.id ?? 0;
  const messages = useListMessages(conversationId, { query: { enabled: conversationId > 0, queryKey: getListMessagesQueryKey(conversationId) } });
  const activity = useListActivity();
  const respond = useRespondWithCompanion();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialized.current && list[0]) { setActiveId(list[0].id); initialized.current = true; }
  }, [list]);

  const lastActivity = useMemo(() => (activity.data ?? []).slice(0, 4), [activity.data]);

  const handleNewConversation = () => {
    setCreating(true);
    createConversation.mutate({ data: { title: 'Untitled thread' } }, {
      onSuccess: (conversation) => { queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }); setActiveId(conversation.id); setCreating(false); },
      onError: () => setCreating(false),
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !conversationId || respond.isPending) return;
    setDraft(''); setSentState('Companion is thinking');
    respond.mutate({ data: { conversationId, message } }, {
      onSuccess: (result) => {
        setSentState(result.delegated ? `Delegated to ${result.agent?.name ?? 'a specialist'}` : 'Answered from context');
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId) });
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListActivityQueryKey() });
        queryClient.invalidateQueries({ queryKey: ['getWorkforceSummary'] });
        setTimeout(() => setSentState(''), 4200);
      },
      onError: () => setSentState('Could not reach the Companion'),
    });
  };

  return <div className="animate-rise-in">
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 flex items-center gap-2 font-mono-app text-[10px] uppercase tracking-[.2em] text-muted-foreground"><span className="size-1.5 rounded-full bg-[#82c99a]" /> Companion online</p><h1 className="font-display text-[clamp(2.4rem,5vw,4.5rem)] font-semibold leading-[.92] tracking-[-.07em] text-primary">What are we<br className="hidden sm:block" /> moving forward?</h1></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="font-mono-app text-primary">{summary.data?.openTaskCount ?? '—'}</span> open threads <span className="mx-1 text-border">·</span> <span className="font-mono-app text-primary">{summary.data?.memoryCount ?? '—'}</span> memories</div></div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0">
        <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><MessageSquare size={16} className="text-muted-foreground" /><span className="font-display text-lg font-semibold tracking-[-.03em]">{activeConversation?.title ?? 'A fresh space to think'}</span></div><button onClick={handleNewConversation} disabled={creating} className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-primary transition hover:-translate-y-0.5 hover:border-primary/30 disabled:opacity-50" data-testid="button-new-conversation"><Plus size={15} /> New thread</button></div>
        <div className="overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_14px_40px_rgba(35,56,66,.06)]">
          <div className="flex min-h-[410px] flex-col gap-4 overflow-y-auto p-4 md:min-h-[490px] md:p-7" ref={scrollRef}>
            {messages.isLoading ? <LoadingState rows={4} /> : messages.isError ? <ErrorState onRetry={() => messages.refetch()} /> : (messages.data ?? []).length === 0 ? <EmptyState icon={Sparkles} title="A clear desk." description="Ask for a thought partner, a plan, or a piece of work. The Companion will decide what deserves a specialist." /> : (messages.data ?? []).map((message) => <MessageBubble key={message.id} role={message.role} content={message.content} createdAt={message.createdAt} agentName={agents.data?.find((agent) => agent.id === message.agentId)?.name} />)}
            {respond.isPending && <div className="flex items-center gap-3 text-sm text-muted-foreground"><span className="grid size-8 place-items-center rounded-xl bg-accent/40 text-primary"><LoaderCircle size={16} className="animate-spin" /></span><span>{sentState || 'Companion is thinking'}</span></div>}
          </div>
          <form onSubmit={handleSubmit} className="border-t border-border bg-muted/20 p-3 md:p-4"><div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/40"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSubmit(event); } }} placeholder="Give the Companion something to move forward..." rows={2} className="min-h-[54px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground/70" data-testid="input-companion-message" /><button type="submit" disabled={!draft.trim() || !conversationId || respond.isPending} className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message" data-testid="button-send-message"><ArrowUpRight size={19} /></button></div><div className="mt-2 flex items-center justify-between px-2 text-[10px] text-muted-foreground"><span>Enter to send · Shift + Enter for a new line</span>{sentState && !respond.isPending && <span className="flex items-center gap-1 text-[#4d8b67]"><Check size={12} /> {sentState}</span>}</div></form>
        </div>
      </section>
      <aside className="space-y-5">
        <div className="rounded-[22px] border border-border bg-primary p-5 text-primary-foreground shadow-[0_14px_40px_rgba(35,56,66,.12)]"><div className="mb-6 flex items-center justify-between"><span className="flex items-center gap-2 font-mono-app text-[10px] uppercase tracking-[.16em] text-primary-foreground/60"><CircleDot size={13} className="text-accent" /> Orchestration</span><WandSparkles size={17} className="text-accent" /></div><div className="space-y-4"><div className="flex gap-3"><span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-primary"><BrainCircuit size={13} /></span><div><p className="text-sm font-semibold">Inspect context</p><p className="mt-0.5 text-xs leading-5 text-primary-foreground/55">Memory and recent work are always in view.</p></div></div><div className="ml-3 h-4 border-l border-primary-foreground/20" /><div className="flex gap-3"><span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full border border-primary-foreground/20 text-accent"><Sparkles size={13} /></span><div><p className="text-sm font-semibold">Choose the right move</p><p className="mt-0.5 text-xs leading-5 text-primary-foreground/55">Direct answer or one focused delegation.</p></div></div><div className="ml-3 h-4 border-l border-primary-foreground/20" /><div className="flex gap-3"><span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full border border-primary-foreground/20 text-accent"><Check size={13} /></span><div><p className="text-sm font-semibold">Review before returning</p><p className="mt-0.5 text-xs leading-5 text-primary-foreground/55">Nothing comes back without a second look.</p></div></div></div></div>
        <div><SectionLabel>Recent motion</SectionLabel><div className="space-y-1">{lastActivity.length ? lastActivity.map((item) => <div key={item.id} className="flex items-start gap-3 rounded-xl px-2 py-3 transition hover:bg-card"><span className="mt-1 grid size-6 shrink-0 place-items-center rounded-lg bg-accent/35 text-primary"><Clock3 size={13} /></span><div className="min-w-0"><p className="truncate text-xs font-medium">{item.summary}</p><p className="mt-1 font-mono-app text-[9px] text-muted-foreground">{formatRelativeDate(item.createdAt)}</p></div></div>) : <p className="rounded-xl border border-dashed border-border p-4 text-xs leading-5 text-muted-foreground">Your first completed move will appear here.</p>}</div><Link href="/activity" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" data-testid="link-view-activity">View activity <ArrowUpRight size={13} /></Link></div>
        <div><SectionLabel>Threads</SectionLabel><div className="space-y-1">{list.slice(0, 4).map((conversation) => <button key={conversation.id} onClick={() => setActiveId(conversation.id)} className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition ${conversation.id === conversationId ? 'bg-accent/30' : 'hover:bg-card'}`} data-testid={`button-conversation-${conversation.id}`}><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted font-mono-app text-[9px] text-muted-foreground">{initials(conversation.title)}</span><span className="min-w-0 flex-1 truncate text-xs font-medium">{conversation.title}</span><span className="font-mono-app text-[9px] text-muted-foreground">{formatRelativeDate(conversation.updatedAt)}</span></button>)}</div></div>
      </aside>
    </div>
  </div>;
}