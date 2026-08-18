import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowRight, CheckCircle2, FileSearch, ImageIcon, Link2, Loader2, PenLine, ShieldCheck, Sparkles } from "lucide-react";
import React, { FormEvent, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();
  const [url, setUrl] = useState("");
  const history = trpc.listing.history.useQuery();
  const importListing = trpc.listing.importFromUrl.useMutation({
    onSuccess: result => {
      if (result.warnings.length) toast.info(result.warnings[0]);
      toast.success("Listing imported. Review every detail before creating the draft.");
      setLocation(`/review/${result.listing.id}`);
    },
    onError: error => toast.error(error.message),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim()) return;
    importListing.mutate({ url: url.trim() });
  };

  const recentCount = history.data?.filter(item => item.status === "draft created").length ?? 0;
  const reviewCount = history.data?.filter(item => item.status === "review").length ?? 0;
  const publicImportBlocked = importListing.error?.message.startsWith("eBay blocked public retrieval");

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1240px]">
        <section className="relative overflow-hidden rounded-[30px] bg-[#17212b] px-6 py-8 text-white shadow-[0_20px_60px_rgba(25,34,43,.16)] sm:px-10 sm:py-11 lg:px-14 lg:py-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(72,99,220,.30),transparent_32%),radial-gradient(circle_at_98%_95%,rgba(197,155,83,.20),transparent_30%)]" />
          <div className="relative grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
            <div>
              <Badge className="mb-6 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-[#d6deea] uppercase shadow-none">
                <Sparkles className="mr-1.5 size-3" /> Sold listing → Seller Hub draft
              </Badge>
              <h1 className="font-display max-w-3xl text-[42px] leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-[58px]">
                Your next listing starts with one link.
              </h1>
              <p className="mt-6 max-w-2xl text-[15px] leading-7 text-[#b9c5cf] sm:text-base">
                Paste a sold eBay US listing. We’ll bring the useful details into a focused review workspace, where you stay in control of every word, photo, and item specific.
              </p>
            </div>
            <div className="lg:justify-self-end">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 backdrop-blur">
                <div className="grid size-10 place-items-center rounded-xl bg-[#516fe4]/20 text-[#a9b8ff]">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold">Draft-first, always</p>
                  <p className="mt-1 text-[11px] text-[#98a7b6]">No automatic publishing in this workflow.</p>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="relative mt-10 rounded-[22px] border border-white/10 bg-white p-2 shadow-[0_18px_50px_rgba(0,0,0,.18)] sm:flex sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
              <Link2 className="size-5 shrink-0 text-[#6b7784]" />
              <Input
                value={url}
                onChange={event => setUrl(event.target.value)}
                placeholder="https://www.ebay.com/itm/123456789012"
                aria-label="eBay sold listing URL"
                className="h-12 border-0 bg-transparent px-0 text-[15px] text-[#17212b] shadow-none placeholder:text-[#9aa2aa] focus-visible:ring-0"
              />
            </div>
            <Button disabled={importListing.isPending || !url.trim()} className="h-12 w-full rounded-[15px] bg-[#3156d8] px-6 text-sm shadow-[0_8px_20px_rgba(49,86,216,.25)] hover:bg-[#294cc4] sm:w-auto">
              {importListing.isPending ? <><Loader2 className="mr-2 size-4 animate-spin" /> Importing…</> : <>Import listing <ArrowRight className="ml-2 size-4" /></>}
            </Button>
          </form>
          {importListing.error ? (
            <div role="alert" className="relative mt-3 flex flex-col gap-3 px-2 text-sm text-[#ffb7ae] sm:flex-row sm:items-center sm:justify-between">
              <p>{importListing.error.message}</p>
              {publicImportBlocked ? <Button type="button" variant="outline" onClick={() => setLocation("/connection")} className="h-9 shrink-0 rounded-lg border-white/25 bg-white/10 px-3 text-xs text-white hover:bg-white/20 hover:text-white">Open eBay setup</Button> : null}
            </div>
          ) : null}
        </section>

        <section className="mt-7 grid gap-5 md:grid-cols-[1fr_1fr_1.25fr]">
          <MetricCard value={String(reviewCount).padStart(2, "0")} label="Reviews in progress" note="Ready when you are" />
          <MetricCard value={String(recentCount).padStart(2, "0")} label="Seller Hub drafts" note="Confirmed by eBay" />
          <Card className="rounded-[24px] border-[#e4e1da] bg-[#eeeae2] p-6 shadow-none">
            <p className="text-xs font-semibold tracking-[0.12em] text-[#52606c] uppercase">What happens next</p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <ProcessStep icon={FileSearch} number="01" label="Import" />
              <ProcessStep icon={PenLine} number="02" label="Refine" />
              <ProcessStep icon={CheckCircle2} number="03" label="Draft" />
            </div>
          </Card>
        </section>

        <section className="mt-12 grid gap-8 border-t border-[#dedbd4] pt-10 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[#4564e6] uppercase">Designed for speed, not shortcuts</p>
            <h2 className="font-display mt-4 text-3xl tracking-[-0.035em] text-[#17212b] sm:text-4xl">Bring over the useful parts. Keep the judgment.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Feature icon={ImageIcon} title="Choose every image" copy="Preview the imported gallery and remove anything you do not have permission to reuse." />
            <Feature icon={PenLine} title="Edit every field" copy="Refine title, description, condition, price, category, quantity, and item specifics before submitting a native Seller Hub draft." />
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

function MetricCard({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <Card className="rounded-[24px] border-[#e4e1da] bg-white p-6 shadow-[0_8px_30px_rgba(35,43,50,.045)]">
      <p className="font-display text-4xl tracking-[-0.04em] text-[#17212b]">{value}</p>
      <p className="mt-5 text-sm font-semibold text-[#28333e]">{label}</p>
      <p className="mt-1 text-xs text-[#596674]">{note}</p>
    </Card>
  );
}

function ProcessStep({ icon: Icon, number, label }: { icon: typeof FileSearch; number: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/70 p-3">
      <div className="flex items-center justify-between text-[#52606d]"><Icon className="size-4" /><span className="text-[10px] font-semibold">{number}</span></div>
      <p className="mt-5 text-xs font-semibold text-[#26323d]">{label}</p>
    </div>
  );
}

function Feature({ icon: Icon, title, copy }: { icon: typeof ImageIcon; title: string; copy: string }) {
  return (
    <div className="rounded-[22px] border border-[#e1ded7] bg-white p-6">
      <div className="grid size-10 place-items-center rounded-xl bg-[#eef1fb] text-[#4564e6]"><Icon className="size-4" /></div>
      <h3 className="mt-5 text-sm font-semibold text-[#24303b]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#596674]">{copy}</p>
    </div>
  );
}
