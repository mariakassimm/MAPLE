import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource-variable/inter';
import App from '@/App';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import '@/styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => ((err as { status?: number }).status ?? 500) >= 500 && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
        <Toaster
          position="bottom-center"
          toastOptions={{ style: { borderRadius: 2, background: '#282722', color: '#F8F7F3', border: 'none' } }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
