'use client';

import { type ReactNode, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, LogOut } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileSidebar from '@/components/mobile/MobileSidebar';
import BottomNav from '@/components/mobile/BottomNav';
import DesktopSidebar from '@/components/desktop/DesktopSidebar';
import PwaInstallAction from '@/components/PwaInstallAction';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getCurrentUser, logout } from '@/lib/auth';
import { useSessionAccessIssue } from '@/hooks/useSessionAccessIssue';
import { getPageMeta } from '@/lib/navigation';

interface AppShellProps {
  children: ReactNode;
  title?: string;
}

function MobileShell({ children, title }: AppShellProps) {
  const pathname = usePathname();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const meta = getPageMeta(pathname);
  const pageTitle = title || meta.title;
  const isResponderRoute = pathname.startsWith('/responder');

  return (
    <div className="civic-shell-noise relative flex min-h-screen flex-col overflow-hidden">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-48 ${isResponderRoute ? 'bg-[linear-gradient(180deg,rgba(8,47,73,0.12),rgba(8,47,73,0))]' : 'bg-[linear-gradient(180deg,rgba(15,23,42,0.04),rgba(15,23,42,0))]'}`} />
      <MobileHeader title={pageTitle} onMenuClick={() => setOverflowOpen(true)} />
      <MobileSidebar isOpen={overflowOpen} onClose={() => setOverflowOpen(false)} />
      <main className="relative flex-1 pb-32">
        {children}
      </main>
      <BottomNav onMoreClick={() => setOverflowOpen(true)} />
    </div>
  );
}

function DesktopShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isResponderRoute = pathname.startsWith('/responder');

  return (
    <div className="civic-shell-noise relative flex h-screen overflow-hidden">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-64 ${isResponderRoute ? 'bg-[linear-gradient(180deg,rgba(8,47,73,0.12),rgba(8,47,73,0))]' : 'bg-[linear-gradient(180deg,rgba(15,23,42,0.04),rgba(15,23,42,0))]'}`} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(8,47,73,0.07),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(13,148,136,0.06),transparent_20%)]" />
      <DesktopSidebar />
      <main className="relative ml-72 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur">
          <div className="flex justify-end px-6 py-3">
            <PwaInstallAction />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

export default function AppShell({ children, title }: AppShellProps) {
  const router = useRouter();
  const user = getCurrentUser();
  const accessIssue = useSessionAccessIssue(user, Boolean(user && user.role !== 'resident'));
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleAccountIssueConfirm() {
    if (!accessIssue) {
      return;
    }

    try {
      setIsLoggingOut(true);
      await logout();
      router.replace(`/login?reason=${accessIssue}`);
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <>
      <div className="lg:hidden">
        <MobileShell title={title}>{children}</MobileShell>
      </div>
      <div className="hidden lg:block">
        <DesktopShell title={title}>{children}</DesktopShell>
      </div>

      <Dialog open={Boolean(accessIssue)}>
        <DialogContent
          showCloseButton={false}
          className="max-w-md rounded-[28px] border-slate-200 bg-white p-0 shadow-[0_28px_80px_-38px_rgba(15,23,42,0.4)]"
        >
          <div className="rounded-t-[28px] bg-amber-50 px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <DialogHeader className="text-left">
                <DialogTitle className="text-lg font-bold text-slate-950">
                  {accessIssue === 'account-deactivated'
                    ? 'Staff account deactivated'
                    : accessIssue === 'account-removed'
                      ? 'Staff account removed'
                      : 'Staff access changed'}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm leading-6 text-slate-600">
                  {accessIssue === 'account-deactivated'
                    ? 'Your staff account was deactivated by an administrator. For security, this session must end now.'
                    : accessIssue === 'account-removed'
                      ? 'This account is no longer available. For security, this session must end now.'
                      : 'Your staff access was updated by an administrator. Please sign in again to continue.'}
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>

          <div className="px-6 pb-6 pt-5">
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              Contact the MSWDO administrator if you believe this access change was made in error.
            </div>

            <DialogFooter className="mt-5">
              <button
                type="button"
                onClick={() => {
                  void handleAccountIssueConfirm();
                }}
                disabled={isLoggingOut}
                className="inline-flex h-[48px] w-full items-center justify-center gap-2 rounded-[18px] bg-cyan-950 px-4 text-sm font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                {isLoggingOut ? 'Signing out...' : 'Sign out and continue'}
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
