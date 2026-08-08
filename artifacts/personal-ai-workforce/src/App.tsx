import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import MemoryPage from '@/pages/memory';
import AgentsPage from '@/pages/agents';
import TasksPage from '@/pages/tasks';
import ActivityPage from '@/pages/activity';
import { WorkspaceShell } from '@/components/workspace-shell';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <WorkspaceShell>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/memory" component={MemoryPage} />
          <Route path="/agents" component={AgentsPage} />
          <Route path="/tasks" component={TasksPage} />
          <Route path="/activity" component={ActivityPage} />
          <Route component={NotFound} />
        </Switch>
      </WorkspaceShell>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
