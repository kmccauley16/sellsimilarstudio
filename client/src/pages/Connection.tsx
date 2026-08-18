import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Check, Copy, ExternalLink, KeyRound, Loader2, LockKeyhole, PlugZap, ShieldCheck, Unplug } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { toast } from "sonner";
import { parseEbayOAuthReturn } from "@shared/ebayOAuthReturn";
const SAFE_AUTHORIZATION_ERROR = "eBay authorization could not be completed securely. Please start authorization again.";
const SAFE_AUTHORIZATION_DECLINED = "eBay authorization was not completed. No eBay connection was saved.";

export default function Connection() {
  const utils = trpc.useUtils();
  const status = trpc.ebay.status.useQuery();
  const compliance = trpc.ebay.complianceSetup.useQuery();
  const callbackHandled = useRef(false);
  const connected = Boolean(status.data?.connection);

  const start = trpc.ebay.startAuthorization.useMutation({
    onSuccess: ({ url }) => window.location.assign(url),
    onError: error => toast.error(error.message),
  });
  const complete = trpc.ebay.completeAuthorization.useMutation({
    onSuccess: async () => {
      window.history.replaceState({}, "", "/connection");
      await utils.ebay.status.invalidate();
      toast.success("eBay US account connected.");
    },
    onError: () => {
      window.history.replaceState({}, "", "/connection");
      // Do not surface provider, database, or OAuth error text that could contain sensitive values.
      toast.error(SAFE_AUTHORIZATION_ERROR);
    },
  });
  const disconnect = trpc.ebay.disconnect.useMutation({
    onSuccess: async () => {
      await utils.ebay.invalidate();
      toast.success("eBay account disconnected.");
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (callbackHandled.current) return;
    const result = parseEbayOAuthReturn(window.location.search);

    if (result.kind === "accepted") {
      callbackHandled.current = true;
      complete.mutate({ code: result.code, state: result.state });
      return;
    }

    if (result.kind === "declined") {
      callbackHandled.current = true;
      // A declined consent return must not display eBay's raw error details or retain them in the address bar.
      window.history.replaceState({}, "", "/connection");
      toast.error(SAFE_AUTHORIZATION_DECLINED);
    }
  }, [complete]);

  const browserOriginIsPublic = window.location.protocol === "https:" && !["localhost", "127.0.0.1"].includes(window.location.hostname);
  const complianceEndpoint = compliance.data?.endpointPath && browserOriginIsPublic
    ? `${window.location.origin}${compliance.data.endpointPath}`
    : "";
  const copyValue = async (label: string, value?: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied.`);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1050px]">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-[#4564e6] uppercase">Account setup</p>
          <h1 className="font-display mt-3 text-4xl tracking-[-0.04em] text-[#17212b]">Connect eBay US.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#596674]">Authorize this workspace to submit native Seller Hub draft files in your own eBay account. Publishing is intentionally outside this app.</p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div className="space-y-6">
            <Card className="overflow-hidden rounded-[28px] border-[#dfdcd5] bg-white shadow-[0_12px_40px_rgba(30,40,48,.05)]">
              <div className="border-b border-[#e8e5df] p-7 sm:p-9">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#edf0fb] text-[#4564e6]"><PlugZap className="size-5" /></div>
                    <div><h2 className="font-display text-2xl tracking-[-0.025em]">eBay seller account</h2><p className="mt-2 text-sm text-[#596674]">Marketplace: United States{status.data?.connection?.ebayUserId ? ` · ${status.data.connection.ebayUserId}` : ""}</p></div>
                  </div>
                  <Badge variant="outline" className={`w-fit rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase ${connected ? "border-[#cfe0cf] bg-[#eff7ef] text-[#4f7a58]" : "border-[#d9d6cf] bg-[#f8f7f4] text-[#596674]"}`}>{connected ? "Connected" : "Not connected"}</Badge>
                </div>
              </div>
              <div className="p-7 sm:p-9">
                {complete.isPending ? (
                  <div className="flex min-h-40 items-center justify-center gap-3 text-sm text-[#65727d]"><Loader2 className="size-4 animate-spin" /> Finishing secure eBay authorization…</div>
                ) : connected ? (
                  <div>
                    <p className="text-sm leading-6 text-[#64717c]">Your encrypted connection is ready for native Seller Hub draft submissions. Publishing remains outside this app.</p>
                    <Button variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending} className="mt-6 h-11 rounded-xl border-[#dfdcd5] bg-white px-5 text-[#5e6973]"><Unplug className="mr-2 size-4" /> Disconnect</Button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[#2e3a45]">The app will request permission to:</p>
                    <div className="mt-5 space-y-4">
                      <Permission text="Submit a native Seller Hub draft file from your reviewed listing" />
                      <Permission text="Read the native draft task status so the app can report eBay’s result accurately" />
                      <Permission text="Keep publication outside this workspace" />
                    </div>
                    <Button onClick={() => start.mutate()} disabled={!status.data?.configured || start.isPending} className="mt-8 h-12 w-full rounded-xl bg-[#3156d8] shadow-[0_8px_22px_rgba(49,86,216,.22)] hover:bg-[#294cc4] sm:w-auto sm:px-7">
                      {start.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <KeyRound className="mr-2 size-4" />} Authorize with eBay
                    </Button>
                    {!status.isLoading && !status.data?.configured && <p className="mt-4 rounded-xl bg-[#fff7e8] px-4 py-3 text-xs leading-5 text-[#8b6727]">The app owner must add the eBay developer credentials before authorization can begin.</p>}
                    <p className="mt-4 text-xs leading-5 text-[#596674]">You will leave this page briefly for eBay’s secure consent screen and return here afterward.</p>
                  </>
                )}
              </div>
            </Card>

            <Card className="rounded-[28px] border-[#dfdcd5] bg-white p-7 shadow-[0_12px_40px_rgba(30,40,48,.05)] sm:p-9">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs font-semibold tracking-[0.12em] text-[#4564e6] uppercase">Production activation</p><h2 className="font-display mt-2 text-2xl tracking-[-0.025em]">eBay compliance endpoint</h2><p className="mt-2 text-sm leading-6 text-[#596674]">Paste these values into eBay’s Marketplace Account Deletion screen. This is required once before Production keys are enabled.</p></div>
                <Badge variant="outline" className="rounded-full border-[#d9d6cf] bg-[#f8f7f4] text-[#596674]">Required once</Badge>
              </div>
              {compliance.isLoading ? <div className="mt-7 flex items-center gap-3 text-sm text-[#596674]"><Loader2 className="size-4 animate-spin" /> Preparing secure values…</div> : compliance.error ? <p className="mt-7 rounded-xl bg-[#fff1ee] p-4 text-sm text-[#a14f43]">{compliance.error.message}</p> : (
                <div className="mt-7 space-y-4">
                  <CopyField label="HTTPS endpoint" value={complianceEndpoint} placeholder="Available after publishing" onCopy={() => copyValue("Endpoint", complianceEndpoint)} />
                  <CopyField label="Verification token" value={compliance.data?.verificationToken ?? ""} onCopy={() => copyValue("Verification token", compliance.data?.verificationToken)} masked />
                  <p className="rounded-xl bg-[#f6f7fb] px-4 py-3 text-xs leading-5 text-[#65727d]">In eBay: enter a failure-notification email and save it, click Edit, paste the endpoint and token, then save and send the test notification.</p>
                </div>
              )}
            </Card>

          </div>

          <div className="space-y-5">
            <Card className="rounded-[26px] border-0 bg-[#17212b] p-7 text-white shadow-[0_14px_40px_rgba(24,33,42,.14)]">
              <div className="grid size-10 place-items-center rounded-xl bg-white/10 text-[#9eb0ff]"><ShieldCheck className="size-5" /></div>
              <h2 className="font-display mt-6 text-2xl tracking-[-0.025em]">Draft-first protection</h2>
              <p className="mt-3 text-sm leading-6 text-[#aab7c3]">The authorization flow does not change the product rule: this workspace submits native Seller Hub drafts and never calls eBay’s publish endpoint.</p>
              <div className="mt-6 border-t border-white/10 pt-5 text-xs text-[#8f9eab]"><LockKeyhole className="mr-2 inline size-3.5" /> Tokens are stored server-side and encrypted at rest.</div>
            </Card>
            <a href="https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds.html" target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-2xl border border-[#dfdcd5] bg-white p-5 text-sm font-semibold text-[#394652] transition-colors hover:border-[#bdc7e4] hover:text-[#3156d8]">How native Seller Hub draft feeds work <ExternalLink className="size-4" /></a>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function CopyField({ label, value, onCopy, masked = false, placeholder = "" }: { label: string; value: string; onCopy: () => void; masked?: boolean; placeholder?: string }) {
  return <div><p className="text-[11px] font-semibold tracking-[0.08em] text-[#596674] uppercase">{label}</p><div className="mt-2 flex items-center gap-2 rounded-xl border border-[#dedbd4] bg-[#fbfaf7] p-2 pl-4"><code className="min-w-0 flex-1 truncate text-xs text-[#35414c]">{masked && value ? "•••••••••••••••••••••••••••••••••••••••••••" : value || placeholder}</code><Button type="button" variant="outline" size="sm" onClick={onCopy} disabled={!value} className="shrink-0 rounded-lg border-[#dedbd4] bg-white"><Copy className="mr-1.5 size-3.5" /> Copy</Button></div></div>;
}

function Permission({ text }: { text: string }) {
  return <div className="flex items-start gap-3 text-sm leading-6 text-[#64717c]"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#eaf2e9] text-[#4f7a58]"><Check className="size-3" /></span>{text}</div>;
}

