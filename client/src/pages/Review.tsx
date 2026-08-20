import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import {
  getKeywordCoverage,
  insertKeywordIntoDescription,
  insertKeywordIntoItemSpecificValue,
  insertKeywordIntoTitle,
  MAX_KEYWORD_LENGTH,
  MAX_REVIEW_KEYWORDS,
  normalizeKeywordPhrase,
  normalizeKeywordPhrases,
} from "@shared/keywords";
import { ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, ExternalLink, ImagePlus, Loader2, Plus, RotateCcw, Save, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

const ACCEPTED_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"] as const;
type AcceptedUploadMimeType = (typeof ACCEPTED_UPLOAD_MIME_TYPES)[number];
function isAcceptedUploadMimeType(value: string): value is AcceptedUploadMimeType {
  return (ACCEPTED_UPLOAD_MIME_TYPES as readonly string[]).includes(value);
}

type Specific = { name: string; value: string };

type ReviewForm = {
  title: string;
  description: string;
  itemSpecifics: Specific[];
  keywords: string[];
  conditionId: string;
  conditionName: string;
  price: string;
  categoryId: string;
  categoryName: string;
  quantity: number;
};

const emptyForm: ReviewForm = {
  title: "",
  description: "",
  itemSpecifics: [],
  keywords: [],
  conditionId: "",
  conditionName: "",
  price: "",
  categoryId: "",
  categoryName: "",
  quantity: 1,
};

export default function Review() {
  const [, params] = useRoute("/review/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const listing = trpc.listing.get.useQuery({ id }, { enabled: Number.isInteger(id) && id > 0 });
  const ebayStatus = trpc.ebay.status.useQuery();
  const [form, setForm] = useState<ReviewForm>(emptyForm);
  const [keywordInput, setKeywordInput] = useState("");
  const [specificTargetIndex, setSpecificTargetIndex] = useState<number | null>(null);
  const [initializedId, setInitializedId] = useState<number | null>(null);
  const [descriptionProposal, setDescriptionProposal] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!listing.data || initializedId === listing.data.id) return;
    setForm({
      title: listing.data.title,
      description: listing.data.description,
      itemSpecifics: listing.data.itemSpecifics,
      keywords: listing.data.keywords,
      conditionId: listing.data.conditionId ?? "",
      conditionName: listing.data.conditionName ?? "",
      price: listing.data.price ?? "",
      categoryId: listing.data.categoryId ?? "",
      categoryName: listing.data.categoryName ?? "",
      quantity: listing.data.quantity,
    });
    setNotes(listing.data.notes ?? "");
    setInitializedId(listing.data.id);
    setDescriptionProposal(null);
  }, [listing.data, initializedId]);

  const utils = trpc.useUtils();
  const saveReview = trpc.listing.update.useMutation({
    onSuccess: data => {
      utils.listing.get.setData({ id }, current => current ? { ...current, ...data } : current);
      utils.listing.history.invalidate();
      toast.success("Review saved. You can create a photo-pending draft when you are ready.");
    },
    onError: error => toast.error(error.message),
  });

  const updateListingCache = (data: Record<string, unknown>) => {
    utils.listing.get.setData({ id }, current => current ? { ...current, ...data } : current);
    void utils.listing.history.invalidate();
  };

  const saveNotes = trpc.listing.updateNotes.useMutation({
    onSuccess: data => {
      updateListingCache(data);
      toast.success("Notes saved.");
    },
    onError: error => toast.error(error.message),
  });

  const uploadOwnedPhoto = trpc.listing.uploadOwnedPhoto.useMutation({
    onSuccess: data => {
      updateListingCache(data);
      toast.success("Your photo was uploaded. Confirm the photo rights and item accuracy again before drafting.");
    },
    onError: error => toast.error(error.message),
  });

  const removeOwnedPhoto = trpc.listing.removeOwnedPhoto.useMutation({
    onSuccess: data => {
      updateListingCache(data);
      toast.success("Photo removed. Confirm the photo rights and item accuracy again before drafting.");
    },
    onError: error => toast.error(error.message),
  });

  const reorderOwnedPhotos = trpc.listing.reorderOwnedPhotos.useMutation({
    onSuccess: data => updateListingCache(data),
    onError: error => toast.error(error.message),
  });

  const moveOwnedPhoto = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ownedPhotoUrls.length) return;
    const reordered = [...ownedPhotoUrls];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    reorderOwnedPhotos.mutate({ id, urls: reordered });
  };

  const attestPhotoRights = trpc.listing.attestPhotoRights.useMutation({
    onSuccess: data => {
      updateListingCache(data);
      toast.success("Photo rights confirmation saved.");
    },
    onError: error => toast.error(error.message),
  });

  const enhancePhotoBackground = trpc.listing.enhancePhotoBackground.useMutation({
    onSuccess: data => {
      updateListingCache(data);
      toast.success("White-background photo created. Confirm the photo rights and item accuracy again before drafting.");
    },
    onError: error => toast.error(error.message),
  });

  const proposeDescription = trpc.listing.proposeDescription.useMutation({
    onSuccess: data => {
      setDescriptionProposal(data.description);
      toast.success("Description proposal ready. Review it before applying.");
    },
    onError: error => toast.error(error.message),
  });

  const createDraft = trpc.ebay.createDraft.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.listing.get.invalidate({ id }), utils.listing.history.invalidate()]);
    },
    onError: async error => {
      await Promise.all([utils.listing.get.invalidate({ id }), utils.listing.history.invalidate()]);
      toast.error(error.message);
    },
  });

  const publishDraft = trpc.ebay.publishDraft.useMutation({
    onSuccess: async data => {
      await Promise.all([utils.listing.get.invalidate({ id }), utils.listing.history.invalidate()]);
      toast.success("Published to eBay. Your listing is now live.", {
        action: { label: "View listing", onClick: () => window.open(data.url, "_blank", "noopener,noreferrer") },
      });
    },
    onError: async error => {
      await Promise.all([utils.listing.get.invalidate({ id }), utils.listing.history.invalidate()]);
      toast.error(error.message);
    },
  });

  const ownedPhotoUrls = listing.data?.ownedImageUrls ?? [];
  const photoRightsConfirmed = Boolean(listing.data?.photoRightsAttestedAt);
  const readiness = useMemo(() => {
    const checks = [
      { label: "Title", ready: Boolean(form.title.trim()) },
      { label: "Description", ready: Boolean(form.description.trim()) },
      { label: "Price", ready: /^\d+(\.\d{1,2})?$/.test(form.price) },
      { label: "Category ID", ready: Boolean(form.categoryId.trim()) },
      { label: "Condition", ready: Boolean(form.conditionId.trim()) },
    ];
    return { checks, complete: checks.filter(check => check.ready).length };
  }, [form]);

  const reviewPayload = () => ({
    id,
    ...form,
    conditionId: form.conditionId.trim() || undefined,
    conditionName: form.conditionName.trim() || undefined,
    price: form.price.trim() || undefined,
    categoryId: form.categoryId.trim() || undefined,
    categoryName: form.categoryName.trim() || undefined,
    itemSpecifics: form.itemSpecifics.filter(item => item.name.trim() && item.value.trim()),
    keywords: normalizeKeywordPhrases(form.keywords, MAX_REVIEW_KEYWORDS),
  });

  const keywordCoverage = useMemo(
    () => new Map(
      form.keywords.map(keyword => [
        keyword,
        getKeywordCoverage(keyword, {
          title: form.title,
          description: form.description,
          itemSpecifics: form.itemSpecifics,
        }),
      ]),
    ),
    [form.description, form.itemSpecifics, form.keywords, form.title],
  );

  const requestDescriptionProposal = () => {
    if (!form.title.trim()) {
      toast.info("Enter a title before generating a description.");
      return;
    }
    proposeDescription.mutate({ id, title: form.title, description: form.description });
  };

  const applyDescriptionProposal = () => {
    if (!descriptionProposal) return;
    setForm(current => ({ ...current, description: descriptionProposal }));
    setDescriptionProposal(null);
    toast.success("Description applied locally. Save the review when you are ready.");
  };

  const addKeyword = () => {
    const phrase = normalizeKeywordPhrase(keywordInput);
    if (!phrase) {
      toast.info("Enter a keyword phrase to add it.");
      return;
    }
    if (phrase.length > MAX_KEYWORD_LENGTH) {
      toast.error(`Keep each keyword phrase to ${MAX_KEYWORD_LENGTH} characters or fewer.`);
      return;
    }

    const nextKeywords = normalizeKeywordPhrases([...form.keywords, phrase], MAX_REVIEW_KEYWORDS);
    if (nextKeywords.length === form.keywords.length) {
      toast.info("That keyword is already in the suggestion list.");
      return;
    }
    if (nextKeywords.length >= MAX_REVIEW_KEYWORDS && form.keywords.length >= MAX_REVIEW_KEYWORDS) {
      toast.info(`Keep the list to ${MAX_REVIEW_KEYWORDS} phrases or fewer.`);
      return;
    }
    setForm(current => ({ ...current, keywords: nextKeywords }));
    setKeywordInput("");
  };

  const removeKeyword = (keyword: string) => {
    setForm(current => ({
      ...current,
      keywords: current.keywords.filter(candidate => candidate !== keyword),
    }));
  };

  const explainInsertion = (status: "inserted" | "already_present" | "too_long" | "empty", field: string) => {
    if (status === "inserted") {
      toast.success(`Added to ${field}. Save the review when you are ready.`);
    } else if (status === "already_present") {
      toast.info(`That phrase already appears in the ${field}.`);
    } else if (status === "too_long") {
      toast.error(`There is not enough room in the ${field} for that full phrase.`);
    } else {
      toast.info("Choose a valid keyword phrase first.");
    }
  };

  const addKeywordToTitle = (keyword: string) => {
    const result = insertKeywordIntoTitle(form.title, keyword);
    if (result.status === "inserted") setForm(current => ({ ...current, title: result.value }));
    explainInsertion(result.status, "title");
  };

  const addKeywordToDescription = (keyword: string) => {
    const result = insertKeywordIntoDescription(form.description, keyword);
    if (result.status === "inserted") setForm(current => ({ ...current, description: result.value }));
    explainInsertion(result.status, "description");
  };

  const addKeywordToSpecific = (keyword: string) => {
    if (specificTargetIndex === null || !form.itemSpecifics[specificTargetIndex]) {
      toast.info("Choose the item-specific value that this phrase accurately describes.");
      return;
    }
    const result = insertKeywordIntoItemSpecificValue(
      form.itemSpecifics[specificTargetIndex].value,
      keyword,
    );
    if (result.status === "inserted") {
      setForm(current => ({
        ...current,
        itemSpecifics: current.itemSpecifics.map((specific, index) =>
          index === specificTargetIndex ? { ...specific, value: result.value } : specific,
        ),
      }));
    }
    explainInsertion(result.status, "item-specific value");
  };

  const hasUnsavedReviewChanges = useMemo(() => {
    if (!listing.data) return false;
    return (
      form.title !== listing.data.title ||
      form.description !== listing.data.description ||
      form.conditionId !== (listing.data.conditionId ?? "") ||
      form.conditionName !== (listing.data.conditionName ?? "") ||
      form.price !== (listing.data.price ?? "") ||
      form.categoryId !== (listing.data.categoryId ?? "") ||
      form.categoryName !== (listing.data.categoryName ?? "") ||
      form.quantity !== listing.data.quantity ||
      JSON.stringify(form.itemSpecifics) !== JSON.stringify(listing.data.itemSpecifics) ||
      JSON.stringify(normalizeKeywordPhrases(form.keywords, MAX_REVIEW_KEYWORDS)) !== JSON.stringify(listing.data.keywords)
    );
  }, [form, listing.data]);

  const hasUnsavedNotes = notes !== (listing.data?.notes ?? "");
  const saveNotesNow = () => saveNotes.mutate({ id, notes });

  const readFileAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That photo could not be read. Try another file."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : "";
      if (!base64) {
        reject(new Error("That photo could not be read. Try another file."));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    let uploaded = 0;
    for (const file of files) {
      if (ownedPhotoUrls.length + uploaded >= 12) {
        toast.info("You can add up to 12 seller-owned photos.");
        break;
      }
      // Some browsers leave `type` blank for less common formats (e.g. HEIC from a phone
      // camera roll); let those through too and rely on the server's real image decoder.
      if (file.type && !file.type.startsWith("image/")) {
        toast.error(`${file.name}: upload a photo file.`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name}: choose a photo smaller than 10 MB.`);
        continue;
      }
      // The server normalizes every upload to JPEG regardless of source format, so this only
      // needs to satisfy the request schema, not describe the file's real type.
      const mimeType = isAcceptedUploadMimeType(file.type) ? file.type : "image/jpeg";
      try {
        const base64 = await readFileAsBase64(file);
        await uploadOwnedPhoto.mutateAsync({ id, mimeType, base64 });
        uploaded += 1;
      } catch (error) {
        // The mutation's own onError already toasts eBay/server failures; only
        // surface a message here for errors that never reached the network call.
        if (!(error instanceof TRPCClientError)) {
          toast.error(error instanceof Error ? `${file.name}: ${error.message}` : `${file.name}: upload failed.`);
        }
      }
    }
  };

  const hasOffer = Boolean(listing.data?.offerId) && listing.data?.status !== "failed";

  // A single action that always does the next useful thing: save any pending edits, then
  // either save an eBay draft (first time) or sync-and-publish it (once a draft exists).
  const runPrimaryAction = async () => {
    if (listing.data?.status === "published" && listing.data.sellerHubUrl) {
      window.open(listing.data.sellerHubUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!ebayStatus.data?.connection) {
      toast.info("Connect your eBay US account first.");
      setLocation("/connection");
      return;
    }
    try {
      if (hasUnsavedReviewChanges) {
        await saveReview.mutateAsync(reviewPayload());
      }
      if (readiness.complete !== readiness.checks.length) {
        toast.info("Complete every draft-readiness field to create an eBay draft.");
        return;
      }
      if (ownedPhotoUrls.length > 0 && !photoRightsConfirmed) {
        toast.error("Confirm that you own or are authorized to use the uploaded photos before continuing.");
        return;
      }
      if (hasOffer) {
        await createDraft.mutateAsync({ listingImportId: id });
        await publishDraft.mutateAsync({ listingImportId: id });
      } else {
        await createDraft.mutateAsync({ listingImportId: id }, {
          onSuccess: () => toast.success(
            ownedPhotoUrls.length
              ? "Saved as an unpublished eBay draft. Click Publish when you are ready to go live."
              : "Saved as a photo-pending eBay draft. Add your photos, then publish when ready.",
          ),
        });
      }
    } catch {
      // Failures are already surfaced by each mutation's own error toast.
    }
  };

  if (listing.isLoading) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-[1240px] space-y-5"><Skeleton className="h-28 rounded-[26px]" /><div className="grid gap-5 lg:grid-cols-[1fr_310px]"><Skeleton className="h-[660px] rounded-[26px]" /><Skeleton className="h-[420px] rounded-[26px]" /></div></div>
      </DashboardLayout>
    );
  }

  if (listing.error || !listing.data) {
    return (
      <DashboardLayout>
        <Card className="mx-auto max-w-xl rounded-[26px] border-[#e3ded4] p-10 text-center shadow-none">
          <CircleAlert className="mx-auto size-8 text-[#b55b4d]" />
          <h1 className="font-display mt-5 text-3xl">Review unavailable</h1>
          <p className="mt-3 text-sm text-[#74808b]">{listing.error?.message ?? "This imported listing could not be found."}</p>
          <Button onClick={() => setLocation("/")} variant="outline" className="mt-7 rounded-xl">Back to new draft</Button>
        </Card>
      </DashboardLayout>
    );
  }

  const actionProps = {
    status: listing.data.status,
    hasOffer,
    ownedPhotoCount: ownedPhotoUrls.length,
    busy: saveReview.isPending || createDraft.isPending || publishDraft.isPending,
    onAction: runPrimaryAction,
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1240px]">
        <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <button onClick={() => setLocation("/")} className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#56636f] transition-colors hover:text-[#3156d8]">
              <ArrowLeft className="size-3.5" /> New draft
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-4xl tracking-[-0.04em] text-[#17212b]">Review the details.</h1>
              <Badge className="rounded-full bg-[#e7ebfb] px-3 py-1 text-[10px] font-semibold tracking-[0.1em] text-[#3655c8] uppercase shadow-none hover:bg-[#e7ebfb]">Publish only when you say so</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#5b6874]">Everything remains editable. Saving stores an unpublished eBay draft; nothing goes live until you click Publish.</p>
            {listing.data.status === "failed" ? (
              <div role="alert" className="mt-4 flex max-w-2xl gap-3 rounded-xl border border-[#f0c9c4] bg-[#fff5f3] p-3 text-sm leading-5 text-[#7d3f38]">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <p><span className="font-semibold">eBay draft needs attention.</span> {listing.data.draftResultMessage ?? "eBay could not save this draft. Review the listing fields and try again."}</p>
              </div>
            ) : null}
          </div>
          <PrimaryDraftAction {...actionProps} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_310px]">
          <div className="space-y-6">
            <Section eyebrow="Core details" title="Listing information">
              <div className="space-y-5">
                <Field label="Title" note={`${form.title.length}/80`}>
                  <Input aria-label="Title" value={form.title} maxLength={80} onChange={event => { setForm({ ...form, title: event.target.value }); setDescriptionProposal(null); }} className="h-12 rounded-xl border-[#dcd9d2] bg-[#fcfcfb] shadow-none" />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Price" prefix="$"><Input aria-label="Price" inputMode="decimal" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} placeholder="0.00" className="h-11 rounded-xl border-[#dcd9d2] pl-7 shadow-none" /></Field>
                  <Field label="Quantity"><Input aria-label="Quantity" type="number" min={1} max={999} value={form.quantity} onChange={event => setForm({ ...form, quantity: Math.max(1, Number(event.target.value) || 1) })} className="h-11 rounded-xl border-[#dcd9d2] shadow-none" /></Field>
                  <Field label="Condition ID"><Input aria-label="Condition ID" value={form.conditionId} onChange={event => setForm({ ...form, conditionId: event.target.value })} placeholder="e.g. 3000" className="h-11 rounded-xl border-[#dcd9d2] shadow-none" /></Field>
                  <Field label="Category ID"><Input aria-label="Category ID" value={form.categoryId} onChange={event => setForm({ ...form, categoryId: event.target.value })} placeholder="Required" className="h-11 rounded-xl border-[#dcd9d2] shadow-none" /></Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Condition name"><Input aria-label="Condition name" value={form.conditionName} onChange={event => setForm({ ...form, conditionName: event.target.value })} placeholder="Pre-owned" className="h-11 rounded-xl border-[#dcd9d2] shadow-none" /></Field>
                  <Field label="Category name"><Input aria-label="Category name" value={form.categoryName} onChange={event => setForm({ ...form, categoryName: event.target.value })} placeholder="Optional reference" className="h-11 rounded-xl border-[#dcd9d2] shadow-none" /></Field>
                </div>
                <Field label="Description" note="Write only what accurately describes your item">
                  <Textarea aria-label="Description" value={form.description} onChange={event => { setForm({ ...form, description: event.target.value }); setDescriptionProposal(null); }} rows={10} className="resize-y rounded-xl border-[#dcd9d2] bg-[#fcfcfb] leading-6 shadow-none" />
                </Field>
                <div className="rounded-2xl border border-[#dfe5fb] bg-[#f5f7ff] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#e4eaff] text-[#3156d8]"><Sparkles className="size-4" /></span>
                      <div>
                        <p className="text-sm font-semibold text-[#26323d]">Generate or revise your description with AI</p>
                        <p className="mt-1 text-xs leading-5 text-[#5c6875]">Uses your current title and your own description only. If it is blank, it prepares a minimal starting point; it never saves or publishes automatically.</p>
                      </div>
                    </div>
                    <Button type="button" variant="outline" onClick={requestDescriptionProposal} disabled={proposeDescription.isPending} className="h-10 shrink-0 rounded-xl border-[#cfd8fb] bg-white px-4 text-[#3156d8] hover:bg-[#eef1ff]">
                      {proposeDescription.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                      {proposeDescription.isPending ? "Preparing…" : form.description.trim() ? "Revise with AI" : "Generate with AI"}
                    </Button>
                  </div>
                  {descriptionProposal ? (
                    <div className="mt-4 rounded-xl border border-[#d6ddfa] bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold tracking-[0.08em] text-[#4b63be] uppercase">Proposed description</p>
                          <p className="mt-1 text-xs text-[#65717e]">Review the proposal. Applying it changes this form only; you still choose whether to save.</p>
                        </div>
                        <Button type="button" onClick={applyDescriptionProposal} className="h-9 shrink-0 rounded-lg bg-[#3156d8] px-3 text-xs hover:bg-[#294cc4]">Apply proposal</Button>
                      </div>
                      <div aria-live="polite" className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#fafbff] p-3 text-sm leading-6 text-[#34404b]">{descriptionProposal}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            </Section>

            <Section eyebrow="Search guidance" title="Automatic keyword suggestions" action={`${form.keywords.length}/${MAX_REVIEW_KEYWORDS} phrases`}>
              <div className="rounded-2xl border border-[#dfe5fb] bg-[#f5f7ff] p-4">
                <div className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#e4eaff] text-[#3156d8]"><Sparkles className="size-4" /></span>
                  <div>
                    <p className="text-sm font-semibold text-[#26323d]">Generated from the imported listing.</p>
                    <p className="mt-1 text-xs leading-5 text-[#5c6875]">These are suggested buyer-search phrases, not hidden eBay keywords. Add a phrase only where it is accurate and visible: the title, description, or an item-specific value.</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {form.keywords.length ? form.keywords.map(keyword => {
                  const coverage = keywordCoverage.get(keyword) ?? { title: false, description: false, itemSpecifics: false };
                  return (
                    <div key={keyword} className="rounded-2xl border border-[#e5e2db] bg-[#fcfcfb] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-[#26323d]">{keyword}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Keyword coverage for ${keyword}`}>
                            <CoverageBadge label="Title" present={coverage.title} />
                            <CoverageBadge label="Description" present={coverage.description} />
                            <CoverageBadge label="Item specifics" present={coverage.itemSpecifics} />
                          </div>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeKeyword(keyword)} aria-label={`Remove keyword ${keyword}`} className="shrink-0 rounded-xl text-[#8b5550] hover:bg-[#f9ece9] hover:text-[#a24f45]"><Trash2 className="size-4" /></Button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => addKeywordToTitle(keyword)} className="h-8 rounded-lg border-[#d8d5ce] bg-white px-3 text-[11px]">Add to title</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => addKeywordToDescription(keyword)} className="h-8 rounded-lg border-[#d8d5ce] bg-white px-3 text-[11px]">Add to description</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => addKeywordToSpecific(keyword)} className="h-8 rounded-lg border-[#d8d5ce] bg-white px-3 text-[11px]">Add to item specific</Button>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-2xl border border-dashed border-[#d6d2c9] bg-[#faf9f7] p-5 text-sm leading-6 text-[#596674]">No suggestions were available for this older review. New imports generate suggestions automatically; you can still add a precise phrase below.</div>
                )}
              </div>

              <div className="mt-5 grid gap-3 rounded-2xl border border-[#e7e4dd] bg-[#faf9f7] p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <Label htmlFor="keyword-phrase" className="text-xs font-semibold text-[#4f5b67]">Add a phrase</Label>
                  <Input id="keyword-phrase" value={keywordInput} maxLength={MAX_KEYWORD_LENGTH} onChange={event => setKeywordInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addKeyword(); } }} placeholder="e.g. compact travel camera" className="mt-2 h-10 rounded-xl border-[#dcd9d2] bg-white shadow-none" />
                </div>
                <Button type="button" variant="outline" onClick={addKeyword} className="h-10 self-end rounded-xl border-[#d8d5ce] bg-white px-4"><Plus className="mr-2 size-4" /> Add phrase</Button>
              </div>

              <div className="mt-4 rounded-2xl border border-[#e7e4dd] bg-white p-4">
                <Label htmlFor="keyword-specific-target" className="text-xs font-semibold text-[#4f5b67]">Item-specific value to update</Label>
                <select id="keyword-specific-target" value={specificTargetIndex ?? ""} onChange={event => setSpecificTargetIndex(event.target.value === "" ? null : Number(event.target.value))} className="mt-2 h-10 w-full rounded-xl border border-[#dcd9d2] bg-white px-3 text-sm text-[#26323d] shadow-none outline-none focus-visible:ring-2 focus-visible:ring-[#3156d8] focus-visible:ring-offset-2">
                  <option value="">Choose a matching item-specific value</option>
                  {form.itemSpecifics.map((specific, index) => <option key={`${index}-${specific.name}`} value={index}>{specific.name.trim() || `Item specific ${index + 1}`}{specific.value.trim() ? ` — ${specific.value}` : ""}</option>)}
                </select>
                <p className="mt-2 text-[11px] leading-5 text-[#697581]">Only add a phrase when it truthfully describes the selected value. eBay’s title limit remains 80 characters.</p>
              </div>
            </Section>

            <Section eyebrow="Your photo set" title="Seller-owned or authorized photos" action={`${ownedPhotoUrls.length} of 12 uploaded`}>
              <div className="rounded-2xl border border-[#dfe5fb] bg-[#f5f7ff] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#e4eaff] text-[#3156d8]"><ImagePlus className="size-4" /></span>
                    <div>
                      <p className="text-sm font-semibold text-[#26323d]">Add your own photos here.</p>
                      <p className="mt-1 text-xs leading-5 text-[#5c6875]">You can save a draft now and add photos later, but publishing to eBay requires at least one photo upload.</p>
                    </div>
                  </div>
                  <label className={`inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#cfd8fb] bg-white px-4 text-sm font-medium text-[#3156d8] transition-colors hover:bg-[#eef1ff] ${uploadOwnedPhoto.isPending || ownedPhotoUrls.length >= 12 ? "pointer-events-none opacity-60" : ""}`}>
                    {uploadOwnedPhoto.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ImagePlus className="mr-2 size-4" />}
                    {uploadOwnedPhoto.isPending ? "Uploading…" : "Upload photos"}
                    <input aria-label="Upload your photos" type="file" accept="image/*" multiple className="sr-only" onChange={handlePhotoUpload} disabled={uploadOwnedPhoto.isPending || ownedPhotoUrls.length >= 12} />
                  </label>
                </div>
              </div>

              {ownedPhotoUrls.length ? (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {ownedPhotoUrls.map((url, index) => (
                    <div key={url} className="group relative aspect-square overflow-hidden rounded-2xl border border-[#d9d5cd] bg-[#f0eee9]">
                      <img src={url} alt={`Seller-owned photo ${index + 1}`} className="h-full w-full object-cover" />
                      {index === 0 ? <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">Cover photo</span> : null}
                      <div className="absolute inset-x-2 top-2 flex justify-end gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        <Button type="button" size="icon" variant="secondary" onClick={() => moveOwnedPhoto(index, -1)} disabled={index === 0 || reorderOwnedPhotos.isPending} aria-label={`Move photo ${index + 1} earlier`} className="size-7 shrink-0 rounded-lg bg-white/95 text-[#3e4b57] shadow-sm hover:bg-white"><ChevronLeft className="size-3.5" /></Button>
                        <Button type="button" size="icon" variant="secondary" onClick={() => moveOwnedPhoto(index, 1)} disabled={index === ownedPhotoUrls.length - 1 || reorderOwnedPhotos.isPending} aria-label={`Move photo ${index + 1} later`} className="size-7 shrink-0 rounded-lg bg-white/95 text-[#3e4b57] shadow-sm hover:bg-white"><ChevronRight className="size-3.5" /></Button>
                      </div>
                      <div className="absolute inset-x-2 bottom-2 flex gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        <Button type="button" size="sm" variant="secondary" onClick={() => enhancePhotoBackground.mutate({ id, url })} disabled={!photoRightsConfirmed || enhancePhotoBackground.isPending} title={photoRightsConfirmed ? "Create a white-background version" : "Confirm photo rights before using the white-background tool"} className="h-8 flex-1 rounded-lg bg-white/95 px-2 text-[10px] text-[#3156d8] shadow-sm hover:bg-white">
                          {enhancePhotoBackground.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Sparkles className="mr-1 size-3" />}
                          White background
                        </Button>
                        <Button type="button" size="icon" variant="secondary" onClick={() => removeOwnedPhoto.mutate({ id, url })} disabled={removeOwnedPhoto.isPending} aria-label={`Remove seller-owned photo ${index + 1}`} className="size-8 shrink-0 rounded-lg bg-white/95 text-[#9a5148] shadow-sm hover:bg-white hover:text-[#7e3f38]"><Trash2 className="size-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-[#d6d2c9] bg-[#faf9f7] p-7 text-center text-sm leading-6 text-[#596674]">No photo is required to save this draft. Upload one above whenever you're ready — you'll need at least one before you can publish.</div>
              )}

              <div className="mt-5 space-y-3 rounded-2xl border border-[#e7e4dd] bg-[#faf9f7] p-4">
                <label className={`flex gap-3 rounded-xl p-2 ${photoRightsConfirmed ? "bg-[#edf6ef]" : ""}`}>
                  <input type="checkbox" className="mt-0.5 size-4 accent-[#3156d8]" checked={photoRightsConfirmed} onChange={event => { if (event.target.checked) attestPhotoRights.mutate({ id }); }} disabled={!ownedPhotoUrls.length || photoRightsConfirmed || attestPhotoRights.isPending} />
                  <span className="text-xs leading-5 text-[#485560]"><span className="font-semibold text-[#26323d]">I own or am authorized to use these photos.</span> This confirmation applies only to the current uploaded photo set.</span>
                </label>
              </div>
            </Section>

            <Section eyebrow="Structured data" title="Item specifics" action={`${form.itemSpecifics.length} fields`}>
              <div className="space-y-3">
                {form.itemSpecifics.map((specific, index) => (
                  <div key={`${index}-${specific.name}`} className="grid gap-3 sm:grid-cols-[.8fr_1.2fr_auto]">
                    <Input aria-label={`Item specific ${index + 1} name`} value={specific.name} onChange={event => setForm(current => ({ ...current, itemSpecifics: current.itemSpecifics.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} placeholder="Name" className="h-11 rounded-xl border-[#dcd9d2] shadow-none" />
                    <Input aria-label={`Item specific ${index + 1} value`} value={specific.value} onChange={event => setForm(current => ({ ...current, itemSpecifics: current.itemSpecifics.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) }))} placeholder="Value" className="h-11 rounded-xl border-[#dcd9d2] shadow-none" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setForm(current => ({ ...current, itemSpecifics: current.itemSpecifics.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Remove ${specific.name || "item specific"}`} className="rounded-xl text-[#8b5550] hover:bg-[#f9ece9] hover:text-[#a24f45]"><Trash2 className="size-4" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={() => setForm(current => ({ ...current, itemSpecifics: [...current.itemSpecifics, { name: "", value: "" }] }))} className="mt-2 rounded-xl border-dashed border-[#cfcac1] bg-transparent text-[#586775]"><Plus className="mr-2 size-4" /> Add item specific</Button>
              </div>
            </Section>

            <Section eyebrow="Private" title="Notes">
              <p className="text-xs leading-5 text-[#697581]">Visible only to whoever is signed into this account (e.g. a VA sharing your login). Never sent to eBay.</p>
              <Textarea aria-label="Notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="e.g. Ship from the garage shelf, buyer wants signature confirmation…" rows={4} className="mt-3 rounded-xl border-[#dcd9d2] bg-[#fcfcfb] shadow-none" />
              <div className="mt-3 flex justify-end">
                <Button type="button" variant="outline" onClick={saveNotesNow} disabled={!hasUnsavedNotes || saveNotes.isPending} className="h-9 rounded-lg border-[#d8d5ce] bg-white text-xs">
                  {saveNotes.isPending ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Save className="mr-2 size-3.5" />}
                  {saveNotes.isPending ? "Saving…" : "Save notes"}
                </Button>
              </div>
            </Section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <Card className="rounded-[24px] border-[#e1ded7] bg-[#17212b] p-6 text-white shadow-[0_14px_40px_rgba(24,33,42,.13)]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold tracking-[0.12em] text-[#9daab7] uppercase">Draft readiness</p>
                <span className="font-display text-2xl">{readiness.complete}/{readiness.checks.length}</span>
              </div>
              <div className="mt-5 space-y-3">
                {readiness.checks.map(check => (
                  <div key={check.label} className="flex items-center gap-3 text-xs">
                    {check.ready ? <CheckCircle2 className="size-4 text-[#8da2ff]" /> : <span className="size-4 rounded-full border border-[#647280]" />}
                    <span className={check.ready ? "text-[#e5eaf0]" : "text-[#82919f]"}>{check.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-white/10 pt-5">
                <div className="flex gap-3 text-[11px] leading-5 text-[#93a2af]"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#8da2ff]" /><p>Saving stores an unpublished eBay draft only. Nothing goes live until you click Publish, and publishing requires at least one photo.</p></div>
              </div>
            </Card>

            <Card className="rounded-[24px] border-[#e1ded7] bg-white p-5 shadow-none">
              <p className="text-xs font-semibold tracking-[0.12em] text-[#596674] uppercase">Source</p>
              <p className="mt-4 line-clamp-2 text-sm font-semibold leading-5 text-[#26323d]">{listing.data.title}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-[#596674]"><span>Item #{listing.data.sourceItemId}</span><a href={listing.data.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#4564e6] hover:underline">View <ExternalLink className="size-3" /></a></div>
            </Card>
          </aside>
        </div>

        <div className="mt-6 flex justify-end border-t border-[#e7e4dd] pt-6">
          <PrimaryDraftAction {...actionProps} />
        </div>
      </div>
    </DashboardLayout>
  );
}

function PrimaryDraftAction({
  status,
  hasOffer,
  ownedPhotoCount,
  busy,
  onAction,
}: {
  status: string;
  hasOffer: boolean;
  ownedPhotoCount: number;
  busy: boolean;
  onAction: () => void;
}) {
  if (status === "published") {
    return <Button onClick={onAction} className="h-11 rounded-xl bg-[#4f7a58] px-5 hover:bg-[#42694a]"><CheckCircle2 className="mr-2 size-4" /> Published — view listing</Button>;
  }
  const label = busy
    ? hasOffer ? "Publishing…" : "Saving…"
    : hasOffer
      ? "Publish to eBay"
      : status === "failed"
        ? "Retry eBay draft"
        : ownedPhotoCount
          ? "Save eBay draft"
          : "Save photo-pending draft";
  return (
    <Button onClick={onAction} disabled={busy} className="h-11 rounded-xl bg-[#3156d8] px-5 shadow-[0_8px_20px_rgba(49,86,216,.2)] hover:bg-[#294cc4]">
      {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />} {label}
    </Button>
  );
}

function CoverageBadge({ label, present }: { label: string; present: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${present ? "bg-[#e8f2ea] text-[#3d714a]" : "bg-[#f1f0ec] text-[#6d7781]"}`}>
      {present ? <Check className="size-3" aria-hidden="true" /> : <span className="size-1.5 rounded-full bg-current opacity-60" aria-hidden="true" />}
      {label}
    </span>
  );
}

function Section({ eyebrow, title, action, children }: { eyebrow: string; title: string; action?: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-[26px] border-[#e1ded7] bg-white p-5 shadow-[0_8px_30px_rgba(35,43,50,.035)] sm:p-7">
      <div className="mb-7 flex items-end justify-between gap-4 border-b border-[#ebe8e1] pb-5">
        <div><p className="text-[10px] font-semibold tracking-[0.14em] text-[#4564e6] uppercase">{eyebrow}</p><h2 className="font-display mt-2 text-2xl tracking-[-0.025em] text-[#1d2934]">{title}</h2></div>
        {action ? <span className="text-xs font-medium text-[#5b6874]">{action}</span> : null}
      </div>
      {children}
    </Card>
  );
}

function Field({ label, note, prefix, children }: { label: string; note?: string; prefix?: string; children: React.ReactNode }) {
  return (
    <div className="relative space-y-2">
      <div className="flex items-center justify-between"><Label className="text-xs font-semibold text-[#4f5b67]">{label}</Label>{note ? <span className="text-[10px] text-[#596674]">{note}</span> : null}</div>
      {prefix ? <span className="pointer-events-none absolute bottom-3 left-3 text-sm text-[#7b8690]">{prefix}</span> : null}
      {children}
    </div>
  );
}
