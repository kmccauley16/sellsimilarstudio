import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Check, CheckCircle2, Copy, ExternalLink, KeyRound, Loader2, LockKeyhole, MapPin, PlugZap, ShieldCheck, Unplug } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
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
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#596674]">Authorize this workspace to save unpublished eBay drafts in your own account. Nothing goes live until you explicitly click Publish on a reviewed listing.</p>
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
                    <p className="text-sm leading-6 text-[#64717c]">Your encrypted connection is ready to save drafts and publish listings when you approve them.</p>
                    <Button variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending} className="mt-6 h-11 rounded-xl border-[#dfdcd5] bg-white px-5 text-[#5e6973]"><Unplug className="mr-2 size-4" /> Disconnect</Button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[#2e3a45]">The app will request permission to:</p>
                    <div className="mt-5 space-y-4">
                      <Permission text="Save an unpublished draft offer from your reviewed listing" />
                      <Permission text="Publish that offer to a live listing only when you click Publish" />
                      <Permission text="Read your shipping, payment, and return policies to attach to drafts" />
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

            {connected ? <SellerSetupCard /> : null}

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
              <p className="mt-3 text-sm leading-6 text-[#aab7c3]">The product rule does not change: every listing is saved as an unpublished draft first. eBay's publish endpoint is only called when you click Publish on a reviewed listing.</p>
              <div className="mt-6 border-t border-white/10 pt-5 text-xs text-[#8f9eab]"><LockKeyhole className="mr-2 inline size-3.5" /> Tokens are stored server-side and encrypted at rest.</div>
            </Card>
            <a href="https://developer.ebay.com/api-docs/sell/inventory/overview.html" target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-2xl border border-[#dfdcd5] bg-white p-5 text-sm font-semibold text-[#394652] transition-colors hover:border-[#bdc7e4] hover:text-[#3156d8]">How eBay's Inventory API works <ExternalLink className="size-4" /></a>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function SellerSetupCard() {
  const utils = trpc.useUtils();
  const setup = trpc.ebay.sellerSetup.useQuery();
  const [fulfillmentPolicyId, setFulfillmentPolicyId] = useState("");
  const [paymentPolicyId, setPaymentPolicyId] = useState("");
  const [returnPolicyId, setReturnPolicyId] = useState("");
  const [merchantLocationKey, setMerchantLocationKey] = useState("");
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [city, setCity] = useState("");
  const [stateOrProvince, setStateOrProvince] = useState("");
  const [country, setCountry] = useState("US");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!setup.data || initialized) return;
    setFulfillmentPolicyId(setup.data.connection?.fulfillmentPolicyId ?? "");
    setPaymentPolicyId(setup.data.connection?.paymentPolicyId ?? "");
    setReturnPolicyId(setup.data.connection?.returnPolicyId ?? "");
    setMerchantLocationKey(setup.data.connection?.merchantLocationKey ?? "");
    setInitialized(true);
  }, [setup.data, initialized]);

  const createLocation = trpc.ebay.createWarehouseLocation.useMutation({
    onSuccess: async data => {
      await setup.refetch();
      setMerchantLocationKey(data.location.merchantLocationKey);
      setShowNewLocation(false);
      setCity("");
      setStateOrProvince("");
      setCountry("US");
      toast.success(data.created ? "Inventory location created." : "Matched an existing eBay inventory location.");
    },
    onError: error => toast.error(error.message),
  });

  const saveSetup = trpc.ebay.saveSellerSetup.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.ebay.status.invalidate(), setup.refetch()]);
      toast.success("Seller setup saved. You can now create eBay drafts.");
    },
    onError: error => toast.error(error.message),
  });

  if (setup.isLoading) {
    return (
      <Card className="rounded-[28px] border-[#dfdcd5] bg-white p-7 shadow-[0_12px_40px_rgba(30,40,48,.05)] sm:p-9">
        <div className="flex items-center gap-3 text-sm text-[#65727d]"><Loader2 className="size-4 animate-spin" /> Loading your eBay seller settings…</div>
      </Card>
    );
  }
  if (setup.error || !setup.data) {
    return (
      <Card className="rounded-[28px] border-[#dfdcd5] bg-white p-7 shadow-[0_12px_40px_rgba(30,40,48,.05)] sm:p-9">
        <p className="text-sm text-[#a14f43]">{setup.error?.message ?? "Your eBay seller settings could not be loaded."}</p>
        <Button variant="outline" onClick={() => setup.refetch()} className="mt-4 rounded-xl">Try again</Button>
      </Card>
    );
  }

  const setupComplete = setup.data.connection?.setupComplete ?? false;
  const canSave = Boolean(fulfillmentPolicyId && paymentPolicyId && returnPolicyId && merchantLocationKey);

  const handleCreateLocation = () => {
    if (!city.trim() || !stateOrProvince.trim() || country.trim().length !== 2) {
      toast.error("Enter a city, state or province, and a 2-letter country code.");
      return;
    }
    createLocation.mutate({ city: city.trim(), stateOrProvince: stateOrProvince.trim(), country: country.trim(), confirmCreate: true });
  };

  return (
    <Card className="rounded-[28px] border-[#dfdcd5] bg-white p-7 shadow-[0_12px_40px_rgba(30,40,48,.05)] sm:p-9">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-[#4564e6] uppercase">Required before drafting</p>
          <h2 className="font-display mt-2 text-2xl tracking-[-0.025em]">Seller setup</h2>
          <p className="mt-2 text-sm leading-6 text-[#596674]">Choose the shipping, payment, and return policies plus the inventory location eBay attaches to every draft.</p>
        </div>
        {setupComplete ? <Badge variant="outline" className="w-fit shrink-0 rounded-full border-[#cfe0cf] bg-[#eff7ef] px-3 py-1 text-[10px] font-semibold tracking-[0.08em] text-[#4f7a58] uppercase"><CheckCircle2 className="mr-1 size-3" /> Complete</Badge> : null}
      </div>

      <div className="mt-7 space-y-5">
        <PolicyField label="Shipping (fulfillment) policy" value={fulfillmentPolicyId} onChange={setFulfillmentPolicyId} options={setup.data.fulfillmentPolicies} />
        <PolicyField label="Payment policy" value={paymentPolicyId} onChange={setPaymentPolicyId} options={setup.data.paymentPolicies} />
        <PolicyField label="Return policy" value={returnPolicyId} onChange={setReturnPolicyId} options={setup.data.returnPolicies} />

        <div>
          <Label className="text-xs font-semibold text-[#4f5b67]">Inventory location</Label>
          {setup.data.locations.length ? (
            <select value={merchantLocationKey} onChange={event => setMerchantLocationKey(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#dcd9d2] bg-white px-3 text-sm text-[#26323d] shadow-none outline-none focus-visible:ring-2 focus-visible:ring-[#3156d8] focus-visible:ring-offset-2">
              <option value="">Choose a location</option>
              {setup.data.locations.map(location => <option key={location.merchantLocationKey} value={location.merchantLocationKey}>{location.name}</option>)}
            </select>
          ) : (
            <p className="mt-2 text-xs text-[#74808b]">No inventory location on your eBay account yet.</p>
          )}
          {showNewLocation ? (
            <div className="mt-3 grid gap-3 rounded-2xl border border-[#e7e4dd] bg-[#faf9f7] p-4 sm:grid-cols-3">
              <Input value={city} onChange={event => setCity(event.target.value)} placeholder="City" className="h-10 rounded-xl border-[#dcd9d2] bg-white shadow-none" />
              <Input value={stateOrProvince} onChange={event => setStateOrProvince(event.target.value)} placeholder="State / province" className="h-10 rounded-xl border-[#dcd9d2] bg-white shadow-none" />
              <Input value={country} maxLength={2} onChange={event => setCountry(event.target.value.toUpperCase())} placeholder="US" className="h-10 rounded-xl border-[#dcd9d2] bg-white shadow-none" />
              <div className="flex gap-2 sm:col-span-3">
                <Button type="button" size="sm" onClick={handleCreateLocation} disabled={createLocation.isPending} className="h-9 rounded-lg bg-[#3156d8] hover:bg-[#294cc4]">
                  {createLocation.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <MapPin className="mr-1.5 size-3.5" />} Create location
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowNewLocation(false)} className="h-9 rounded-lg border-[#d8d5ce] bg-white">Cancel</Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowNewLocation(true)} className="mt-2 text-xs font-semibold text-[#3156d8] hover:underline">+ Add a new inventory location</button>
          )}
        </div>

        <Button onClick={() => saveSetup.mutate({ fulfillmentPolicyId, paymentPolicyId, returnPolicyId, merchantLocationKey })} disabled={!canSave || saveSetup.isPending} className="h-11 rounded-xl bg-[#3156d8] px-5 shadow-[0_8px_20px_rgba(49,86,216,.2)] hover:bg-[#294cc4] disabled:opacity-50">
          {saveSetup.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Save seller setup
        </Button>
        {!setup.data.fulfillmentPolicies.length || !setup.data.paymentPolicies.length || !setup.data.returnPolicies.length ? (
          <p className="text-xs leading-5 text-[#8b6727]">Create at least one shipping, payment, and return policy in eBay's Business Policies settings if any list above is empty.</p>
        ) : null}
      </div>
    </Card>
  );
}

function PolicyField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }> }) {
  return (
    <div>
      <Label className="text-xs font-semibold text-[#4f5b67]">{label}</Label>
      <select value={value} onChange={event => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#dcd9d2] bg-white px-3 text-sm text-[#26323d] shadow-none outline-none focus-visible:ring-2 focus-visible:ring-[#3156d8] focus-visible:ring-offset-2">
        <option value="">Choose a policy</option>
        {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
    </div>
  );
}

function CopyField({ label, value, onCopy, masked = false, placeholder = "" }: { label: string; value: string; onCopy: () => void; masked?: boolean; placeholder?: string }) {
  return <div><p className="text-[11px] font-semibold tracking-[0.08em] text-[#596674] uppercase">{label}</p><div className="mt-2 flex items-center gap-2 rounded-xl border border-[#dedbd4] bg-[#fbfaf7] p-2 pl-4"><code className="min-w-0 flex-1 truncate text-xs text-[#35414c]">{masked && value ? "•••••••••••••••••••••••••••••••••••••••••••" : value || placeholder}</code><Button type="button" variant="outline" size="sm" onClick={onCopy} disabled={!value} className="shrink-0 rounded-lg border-[#dedbd4] bg-white"><Copy className="mr-1.5 size-3.5" /> Copy</Button></div></div>;
}

function Permission({ text }: { text: string }) {
  return <div className="flex items-start gap-3 text-sm leading-6 text-[#64717c]"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#eaf2e9] text-[#4f7a58]"><Check className="size-3" /></span>{text}</div>;
}

