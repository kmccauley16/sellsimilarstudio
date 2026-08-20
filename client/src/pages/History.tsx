import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, CircleAlert, Clock3, FilePlus2, History as HistoryIcon, RotateCcw, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function History() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const history = trpc.listing.history.useQuery();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const deleteListing = trpc.listing.delete.useMutation({
    onSuccess: async () => {
      await utils.listing.history.invalidate();
      toast.success("Listing removed from your draft history.");
    },
    onError: error => toast.error(error.message),
  });

  const deleteManyListings = trpc.listing.deleteMany.useMutation({
    onSuccess: async data => {
      await utils.listing.history.invalidate();
      setSelectedIds([]);
      toast.success(`Removed ${data.deletedCount} listing${data.deletedCount === 1 ? "" : "s"} from your draft history.`);
    },
    onError: error => toast.error(error.message),
  });

  const publishManyListings = trpc.ebay.publishMany.useMutation({
    onSuccess: async data => {
      await utils.listing.history.invalidate();
      setSelectedIds([]);
      const succeeded = data.results.filter(result => result.success).length;
      const failed = data.results.filter(result => !result.success);
      if (failed.length === 0) {
        toast.success(`Published ${succeeded} listing${succeeded === 1 ? "" : "s"} to eBay.`);
      } else {
        toast.error(`Published ${succeeded} of ${data.results.length}. ${failed.length} failed: ${failed[0].message}${failed.length > 1 ? ` (+${failed.length - 1} more)` : ""}`);
      }
    },
    onError: error => toast.error(error.message),
  });

  const allIds = history.data?.map(item => item.id) ?? [];
  const allSelected = allIds.length > 0 && selectedIds.length === allIds.length;
  const publishableSelectedIds = selectedIds.filter(id => history.data?.find(item => item.id === id)?.status === "draft created");

  const toggleSelected = (id: number) => {
    setSelectedIds(current => current.includes(id) ? current.filter(existing => existing !== id) : [...current, id]);
  };
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : allIds);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[#4564e6] uppercase">Activity</p>
            <h1 className="font-display mt-3 text-4xl tracking-[-0.04em] text-[#17212b]">Draft history.</h1>
            <p className="mt-3 text-sm text-[#596674]">Every imported listing and whether its eBay draft has been published yet.</p>
          </div>
          <div className="flex gap-3">
            {publishableSelectedIds.length > 0 ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={publishManyListings.isPending} className="h-11 rounded-xl border-[#cfd8fb] bg-white px-5 text-[#3156d8] hover:bg-[#eef1ff]">
                    <Upload className="mr-2 size-4" /> Publish {publishableSelectedIds.length} selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Publish {publishableSelectedIds.length} listing{publishableSelectedIds.length === 1 ? "" : "s"} to eBay?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Each of these goes live on eBay immediately. This cannot be undone from here — you'd need to end the listing on eBay itself.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => publishManyListings.mutate({ listingImportIds: publishableSelectedIds })} className="bg-[#3156d8] hover:bg-[#294cc4]">Publish</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            {selectedIds.length > 0 ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={deleteManyListings.isPending} className="h-11 rounded-xl border-[#e3c6c1] bg-white px-5 text-[#9a5148] hover:bg-[#f9ece9]">
                    <Trash2 className="mr-2 size-4" /> Delete {selectedIds.length} selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selectedIds.length} listing{selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the selected listings and their drafts from Sell Similar Studio only. It does not remove or end any live eBay listings. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteManyListings.mutate({ ids: selectedIds })} className="bg-[#9a5148] hover:bg-[#7e3f38]">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            <Button onClick={() => setLocation("/")} className="h-11 rounded-xl bg-[#3156d8] px-5 hover:bg-[#294cc4]"><FilePlus2 className="mr-2 size-4" /> New draft</Button>
          </div>
        </div>

        <Card className="mt-8 overflow-hidden rounded-[26px] border-[#e1ded7] bg-white shadow-[0_8px_30px_rgba(35,43,50,.035)]">
          {history.isLoading ? (
            <div className="space-y-3 p-6">{[1, 2, 3].map(item => <Skeleton key={item} className="h-20 rounded-2xl" />)}</div>
          ) : history.error ? (
            <div className="p-12 text-center"><CircleAlert className="mx-auto size-8 text-[#b95c4e]" /><p className="mt-4 text-sm font-semibold">History could not be loaded.</p><Button variant="outline" onClick={() => history.refetch()} className="mt-5 rounded-xl"><RotateCcw className="mr-2 size-4" /> Try again</Button></div>
          ) : history.data?.length ? (
            <div className="divide-y divide-[#ebe8e2]">
              <div className="hidden grid-cols-[auto_1.5fr_.55fr_.5fr_.55fr] items-center gap-5 bg-[#f5f3ef] px-6 py-3 text-[10px] font-semibold tracking-[0.12em] text-[#596674] uppercase md:grid">
                <input type="checkbox" aria-label="Select all listings" checked={allSelected} onChange={toggleSelectAll} className="size-4 accent-[#3156d8]" />
                <span>Listing</span><span>Imported</span><span>Status</span><span className="text-right">Action</span>
              </div>
              {history.data.map(item => (
                <div key={item.id} className="grid grid-cols-[auto_1fr] items-start gap-4 px-5 py-5 transition-colors hover:bg-[#faf9f7] md:grid-cols-[auto_1.5fr_.55fr_.5fr_.55fr] md:items-center md:px-6">
                  <input type="checkbox" aria-label={`Select ${item.title}`} checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} className="mt-1 size-4 shrink-0 accent-[#3156d8] md:mt-0" />
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-[#efede8]">
                      {item.imageUrls[0] ? <img src={item.imageUrls[0]} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center"><HistoryIcon className="size-4 text-[#9ba3ab]" /></div>}
                    </div>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#24303b]">{item.title}</p><p className="mt-1 text-xs text-[#596674]">Item #{item.sourceItemId}{item.offerId ? ` · Offer ${item.offerId}` : ""}</p></div>
                  </div>
                  <p className="text-xs text-[#697681]">{new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
                  <Status status={item.status} />
                  <div className="flex items-center justify-start gap-2 md:justify-end">
                    {item.status === "published" && item.sellerHubUrl ? (
                      <a href={item.sellerHubUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d8d5ce] bg-white px-3 text-xs font-semibold text-[#3e4b57] hover:border-[#bfc5da]">View listing <ArrowUpRight className="size-3" /></a>
                    ) : (
                      <Button variant="outline" onClick={() => setLocation(`/review/${item.id}`)} className="h-9 rounded-lg border-[#d8d5ce] bg-white text-xs">{item.status === "failed" ? "Review issue" : item.status === "draft created" ? "Publish draft" : "Continue review"}</Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="icon" aria-label={`Delete ${item.title}`} className="h-9 w-9 shrink-0 rounded-lg border-[#d8d5ce] bg-white text-[#9a5148] hover:bg-[#f9ece9] hover:text-[#7e3f38]"><Trash2 className="size-3.5" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this listing?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes "{item.title}" and its draft from Sell Similar Studio only.
                            {item.status === "published" ? " It does not remove or end the live eBay listing." : ""} This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteListing.mutate({ id: item.id })} className="bg-[#9a5148] hover:bg-[#7e3f38]">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-14 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#eff1f8] text-[#4564e6]"><Clock3 className="size-5" /></div>
              <h2 className="font-display mt-5 text-2xl">No imports yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#596674]">Paste your first sold eBay link to begin a review and save an eBay draft — you publish it when you're ready.</p>
              <Button onClick={() => setLocation("/")} className="mt-6 rounded-xl bg-[#3156d8] hover:bg-[#294cc4]">Import a listing</Button>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Status({ status }: { status: "review" | "draft submitted" | "draft processing" | "draft created" | "published" | "failed" }) {
  const styles = status === "published"
    ? "bg-[#e8f4eb] text-[#39734b]"
    : status === "draft created"
      ? "bg-[#eeeafb] text-[#6755a8]"
      : status === "failed"
        ? "bg-[#f8e9e5] text-[#9b4b41]"
        : "bg-[#f3eee1] text-[#806526]";
  const labels = {
    review: "in review",
    "draft submitted": "in review",
    "draft processing": "in review",
    "draft created": "draft saved, not published",
    published: "published to eBay",
    failed: "needs attention",
  } as const;
  return <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] lowercase ${styles}`}>{labels[status]}</span>;
}
