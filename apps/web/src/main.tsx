import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/menu';
import { ApiError } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Client errors (401/403/404) won't fix themselves on retry.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function ThemedToaster() {
  const theme = useTheme((s) => s.preference);
  return (
    <Toaster
      theme={theme}
      position="top-center"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            '!rounded-lg !border !border-border !bg-surface !text-foreground !shadow-[0_8px_28px_rgb(0_0_0/0.16)] !text-[13.5px]',
          description: '!text-muted-foreground',
          closeButton: '!border-border !bg-surface !text-muted-foreground',
        },
      }}
    />
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <ThemedToaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
