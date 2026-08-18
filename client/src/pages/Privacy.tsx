import { ShieldCheck } from "lucide-react";
import { Link } from "wouter";

export default function Privacy() {
  return (
    <main className="min-h-screen bg-[#f6f5f2] px-5 py-8 text-[#17212b] sm:px-8 sm:py-12">
      <article className="mx-auto max-w-3xl rounded-[28px] border border-[#e2dfd7] bg-white p-7 shadow-[0_18px_55px_rgba(35,43,50,.07)] sm:p-12">
        <header className="border-b border-[#e5e2db] pb-8">
          <div className="flex items-center gap-3 text-[#3156d8]">
            <span className="grid size-10 place-items-center rounded-xl bg-[#eef1fb]"><ShieldCheck className="size-5" /></span>
            <span className="text-xs font-semibold tracking-[0.14em] uppercase">Sell Similar Studio</span>
          </div>
          <h1 className="font-display mt-7 text-4xl tracking-[-0.045em] sm:text-5xl">Privacy Policy</h1>
          <p className="mt-4 text-sm leading-6 text-[#5b6874]">Last updated: July 21, 2026</p>
        </header>

        <div className="space-y-8 pt-9 text-[15px] leading-7 text-[#3f4b56]">
          <section>
            <h2 className="text-lg font-semibold text-[#17212b]">What this policy covers</h2>
            <p className="mt-2">This policy explains how Sell Similar Studio handles information when you use the service to import eBay listing details, review a draft, connect an eBay seller account, or create an unpublished eBay draft.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#17212b]">Information used to provide the service</h2>
            <p className="mt-2">The service uses your account information, the listing details you choose to import or edit, and the eBay account data that you expressly authorize through eBay Sign-In. This may include the eBay seller identifier, authorized access tokens, seller policies, inventory-location choices, and data needed to create an unpublished offer at your request.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#17212b]">How information is used</h2>
            <p className="mt-2">Information is used only to operate the requested workflow: import a listing, help you review and improve its content, retrieve available seller settings, and create an unpublished eBay draft when you choose that action. Sell Similar Studio does not automatically publish listings.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#17212b]">eBay authorization and security</h2>
            <p className="mt-2">eBay access and refresh tokens are stored in encrypted form and are used only to carry out actions you initiate. You can revoke the service’s eBay access through your eBay account or disconnect the eBay account within Sell Similar Studio.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#17212b]">Sharing</h2>
            <p className="mt-2">Sell Similar Studio does not sell personal information. Information is shared with eBay only when needed to perform an action you request through eBay’s official APIs, such as retrieving authorized seller settings or creating an unpublished draft.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#17212b]">Changes and questions</h2>
            <p className="mt-2">This policy may be updated when the service changes. Continued use after an update means the revised policy applies from its stated effective date. For questions about this policy or the service, contact the operator through the support contact associated with your Sell Similar Studio account.</p>
          </section>
        </div>

        <footer className="mt-10 border-t border-[#e5e2db] pt-6 text-sm">
          <Link href="/" className="font-semibold text-[#3156d8] hover:text-[#294cc4]">Return to Sell Similar Studio</Link>
        </footer>
      </article>
    </main>
  );
}
