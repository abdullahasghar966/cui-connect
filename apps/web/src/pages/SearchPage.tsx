import { useQuery } from '@tanstack/react-query';
import { MessageSquareText, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { PageHeader } from '@/components/page';
import { Input } from '@/components/ui/form';
import { useDebounced } from '@/hooks/useDebounced';
import { api } from '@/lib/api';
import { formatListTime } from '@/lib/utils';

/** Message search across every chat the reader may read; each result opens at that message. */
export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const term = useDebounced(q.trim(), 250);
  const results = useQuery({
    queryKey: ['search', 'messages', term],
    queryFn: () => api.searchMessages(term),
    enabled: term.length >= 2,
    placeholderData: (previous) => previous,
  });
  const hits = term.length >= 2 ? (results.data ?? []) : [];

  return (
    <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Search messages"
          description="Only chats you can read are searched. Whole words come first, then words that start with what you typed."
        />
        <div className="relative mb-4">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search messages"
            autoFocus
            placeholder="Search messages"
            className="h-10 pl-9 text-[15px]"
            value={q}
            onChange={(e) =>
              setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })
            }
          />
        </div>
        {term.length < 2 ? (
          <EmptyState icon={MessageSquareText} title="Type at least two letters" />
        ) : results.isPending ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !hits.length ? (
          <EmptyState icon={MessageSquareText} title={`No messages match “${term}”`} />
        ) : (
          <ul
            aria-label="Messages"
            className="divide-y overflow-hidden rounded-lg border bg-surface"
          >
            {hits.map((hit) => (
              <li key={hit.id}>
                <Link
                  to={`/chat/${hit.groupId}?message=${hit.id}`}
                  className="block px-4 py-3 hover:bg-surface-2"
                >
                  <span className="flex items-baseline gap-2 text-[13px]">
                    <span className="font-bold">{hit.groupName}</span>
                    <span className="text-muted-foreground">· {hit.sender}</span>
                    <span className="ml-auto shrink-0 text-[12px] text-muted-foreground">
                      {formatListTime(hit.createdAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[14px]">{hit.snippet}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
