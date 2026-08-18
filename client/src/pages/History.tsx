import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, CircleAlert, Clock3, FilePlus2, History as HistoryIcon, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";

export default function History() {
  const [, setLocation] = useLocation();
  const history = trpc.listing.history.useQuery();

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[#4564e6] uppercase">Activity</p>
            <h1 className="font-display mt-3 text-4xl tracking-[-0.04em] text-[#17212b]">Draft history.</h1>
            <p className="mt-3 text-sm text-[#596674]">Every imported listing, its latest native Seller Hub draft outcome, and its safe eBay task reference.</p>
          </div>
          <Button onClick={() => setLocation("/")} className="h-11 rounded-xl bg-[#3156d8] px-5 hover:bg-[#294cc4]"><FilePlus2 className="mr-2 size-4" /> New draft</Button>
        </div>

        <Card className="mt-8 overflow-hidden rounded-[26px] border-[#e1ded7] bg-white shadow-[0_8px_30px_rgba(35,43,50,.035)]">
          {history.isLoading ? (
            <div className="space-y-3 p-6">{[1, 2, 3].map(item => <Skeleton key={item} className="h-20 rounded-2xl" />)}</div>
          ) : history.error ? (
            <div className="p-12 text-center"><CircleAlert className="mx-auto size-8 text-[#b95c4e]" /><p className="mt-4 text-sm font-semibold">History could not be loaded.</p><Button variant="outline" onClick={() => history.refetch()} className="mt-5 rounded-xl"><RotateCcw className="mr-2 size-4" /> Try again</Button></div>
          ) : history.data?.length ? (
            <div className="divide-y divide-[#ebe8e2]">
              <div className="hidden grid-cols-[1.5fr_.55fr_.5fr_.55fr] gap-5 bg-[#f5f3ef] px-6 py-3 text-[10px] font-semibold tracking-[0.12em] text-[#596674] uppercase md:grid">
                <span>Listing</span><span>Imported</span><span>Status</span><span className="text-right">Action</span>
              </div>
              {history.data.map(item => (
                <div key={item.id} className="grid gap-5 px-5 py-5 transition-colors hover:bg-[#faf9f7] md:grid-cols-[1.5fr_.55fr_.5fr_.55fr] md:items-center md:px-6">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-[#efede8]">
                      {item.imageUrls[0] ? <img src={item.imageUrls[0]} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center"><HistoryIcon className="size-4 text-[#9ba3ab]" /></div>}
                    </div>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#24303b]">{item.title}</p><p className="mt-1 text-xs text-[#596674]">Item #{item.sourceItemId}{item.workflow === "seller_hub_feed" && item.feedTaskId ? ` · Draft task ${item.feedTaskId}` : item.offerId ? ` · Legacy offer ${item.offerId}` : ""}</p></div>
                  </div>
                  <p className="text-xs text-[#697681]">{new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
                  <Status status={item.status} workflow={item.workflow} />
                  <div className="flex justify-start md:justify-end">
                    {item.status === "draft created" && item.workflow === "seller_hub_feed" && item.sellerHubUrl ? (
                      <a href={item.sellerHubUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d8d5ce] bg-white px-3 text-xs font-semibold text-[#3e4b57] hover:border-[#bfc5da]">Open Seller Hub drafts <ArrowUpRight className="size-3" /></a>
                    ) : (
                      <Button variant="outline" onClick={() => setLocation(`/review/${item.id}`)} className="h-9 rounded-lg border-[#d8d5ce] bg-white text-xs">{item.status === "failed" ? "Review issue" : item.status === "draft submitted" || item.status === "draft processing" ? "Check task" : item.status === "draft created" ? "Create native draft" : "Continue review"}</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-14 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#eff1f8] text-[#4564e6]"><Clock3 className="size-5" /></div>
              <h2 className="font-display mt-5 text-2xl">No imports yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#596674]">Paste your first sold eBay link to begin a review and submit a native Seller Hub draft without publishing.</p>
              <Button onClick={() => setLocation("/")} className="mt-6 rounded-xl bg-[#3156d8] hover:bg-[#294cc4]">Import a listing</Button>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Status({ status, workflow }: { status: "review" | "draft submitted" | "draft processing" | "draft created" | "failed"; workflow: "inventory_offer" | "seller_hub_feed" | null }) {
  const styles = status === "draft created"
    ? "bg-[#e8f4eb] text-[#39734b]"
    : status === "failed"
      ? "bg-[#f8e9e5] text-[#9b4b41]"
      : status === "draft processing"
        ? "bg-[#e8eefb] text-[#3655c8]"
        : status === "draft submitted"
          ? "bg-[#eeeafb] text-[#6755a8]"
          : "bg-[#f3eee1] text-[#806526]";
  const labels = {
    review: "in review",
    "draft submitted": "submitted to eBay",
    "draft processing": "eBay processing",
    "draft created": workflow === "seller_hub_feed" ? "Seller Hub draft ready" : "legacy unpublished offer",
    failed: "needs attention",
  } as const;
  return <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] lowercase ${styles}`}>{labels[status]}</span>;
}
