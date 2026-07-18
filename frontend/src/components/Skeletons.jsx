export function Skeleton({ className = '' }) {
  return (
    <div className={`animate-pulse rounded bg-[#EAE6DF] ${className}`} />
  );
}

export function ChatSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-start">
        <Skeleton className="h-16 w-3/4 rounded-2xl" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-12 w-1/2 rounded-2xl" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-24 w-3/4 rounded-2xl" />
      </div>
    </div>
  );
}

export function TicketSkeleton() {
  return (
    <tr className="border-t border-[#EAE6DF]">
      <td className="py-3 pr-2"><Skeleton className="h-4 w-8" /></td>
      <td className="py-3 pr-2"><Skeleton className="h-5 w-16 rounded-full" /></td>
      <td className="py-3 pr-2"><Skeleton className="h-5 w-12 rounded-full" /></td>
      <td className="py-3 pr-2"><Skeleton className="h-4 w-48" /></td>
      <td className="py-3 pr-2"><Skeleton className="h-4 w-12" /></td>
      <td className="py-3 pr-2"><Skeleton className="h-6 w-20 rounded" /></td>
    </tr>
  );
}
