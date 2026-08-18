import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { FilePlus2, History, LogOut, PlugZap, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: FilePlus2, label: "New draft", path: "/" },
  { icon: History, label: "Draft history", path: "/history" },
  { icon: PlugZap, label: "eBay connection", path: "/connection" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="signin-shell min-h-screen bg-[#f4f1eb] p-5 text-[#17212b]">
        <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl overflow-hidden rounded-[32px] bg-[#17212b] shadow-[0_30px_90px_rgba(26,35,44,0.22)] lg:grid-cols-[1.15fr_.85fr]">
          <div className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(70,105,255,.35),transparent_34%),radial-gradient(circle_at_90%_85%,rgba(219,178,104,.28),transparent_30%)]" />
            <div className="relative flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-white text-[#17212b] shadow-xl">
                <FilePlus2 className="size-5" />
              </div>
              <span className="text-sm font-semibold tracking-[0.18em] uppercase">Sell Similar Studio</span>
            </div>
            <div className="relative max-w-xl">
              <p className="mb-5 text-sm font-medium text-[#b9c5d1]">Built for eBay US sellers</p>
              <h1 className="font-display text-5xl leading-[1.02] tracking-[-0.04em]">
                From sold listing to native Seller Hub draft, without the busywork.
              </h1>
              <div className="mt-10 flex items-center gap-3 text-sm text-[#cbd4dc]">
                <ShieldCheck className="size-5 text-[#8ea6ff]" />
                Draft-first by design. Nothing is published automatically.
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center bg-white p-8 sm:p-14">
            <div className="w-full max-w-sm">
              <div className="mb-10 lg:hidden">
                <span className="text-xs font-semibold tracking-[0.18em] text-[#48566a] uppercase">Sell Similar Studio</span>
              </div>
              <p className="text-sm font-semibold text-[#4564e6]">Seller workspace</p>
              <h2 className="font-display mt-3 text-4xl tracking-[-0.04em]">Welcome back.</h2>
              <p className="mt-4 text-[15px] leading-7 text-[#66717d]">
                Sign in to import sold eBay listings, refine every detail, and create native Seller Hub drafts.
              </p>
              <Button onClick={() => startLogin()} size="lg" className="mt-9 h-12 w-full rounded-xl bg-[#3156d8] shadow-[0_10px_25px_rgba(49,86,216,.25)] hover:bg-[#294cc4]">
                Sign in securely
              </Button>
              <p className="mt-5 text-center text-xs text-[#66727d]">Your eBay account is connected separately after sign-in.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <WorkspaceShell>{children}</WorkspaceShell>
    </SidebarProvider>
  );
}

function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  return (
    <div className="flex min-h-screen w-full bg-[#f6f5f2] text-[#17212b]">
      <Sidebar collapsible="icon" className="border-r border-[#e4e1da] bg-[#111b26] text-white">
        <SidebarHeader className="p-4 pb-7">
          <div className="flex items-center gap-3 overflow-hidden px-1">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[#17212b]">
              <FilePlus2 className="size-4" />
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-semibold leading-none">Sell Similar</p>
              <p className="mt-1 text-[10px] font-semibold tracking-[0.16em] text-[#8fa0b2] uppercase">Studio</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu className="gap-1 px-3">
            {menuItems.map(item => {
              const active = item.path === "/" ? location === "/" || location.startsWith("/review/") : location.startsWith(item.path);
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={active}
                    onClick={() => setLocation(item.path)}
                    tooltip={item.label}
                    className="h-11 rounded-xl text-[#aeb9c5] transition-all data-[active=true]:bg-white data-[active=true]:text-[#17212b] hover:bg-white/8 hover:text-white"
                  >
                    <item.icon className="size-[18px]" />
                    <span className="font-medium">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
          <div className="mx-4 mt-8 rounded-2xl border border-white/10 bg-white/[0.045] p-4 group-data-[collapsible=icon]:hidden">
            <div className="mb-3 flex size-8 items-center justify-center rounded-lg bg-[#4d6ce5]/20 text-[#9bafff]">
              <ShieldCheck className="size-4" />
            </div>
            <p className="text-xs font-semibold text-white">Draft-first safety</p>
            <p className="mt-1.5 text-[11px] leading-5 text-[#8999a9]">The app submits a native Seller Hub draft. It never presses publish for you.</p>
          </div>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7890ef]">
                <Avatar className="size-9 border border-white/15">
                  <AvatarFallback className="bg-[#2a3948] text-xs text-white">{user?.name?.charAt(0).toUpperCase() ?? "S"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-xs font-semibold text-white">{user?.name ?? "Seller"}</p>
                  <p className="mt-1 truncate text-[10px] text-[#8191a1]">eBay US workspace</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-48">
              <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-transparent">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#e6e3dc]/80 bg-[#f6f5f2]/90 px-4 backdrop-blur-xl sm:px-7">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="-ml-1 rounded-lg" />
            <div className="h-5 w-px bg-[#dad6ce]" />
            <p className="text-xs font-semibold tracking-[0.12em] text-[#596674] uppercase">eBay US · Draft workspace</p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[#dbd8d0] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#596674] shadow-sm sm:flex">
            <span className="size-1.5 rounded-full bg-[#d89b3c]" /> Unpublished only
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-7 lg:p-9">{children}</main>
      </SidebarInset>
    </div>
  );
}
