'use client';

import { ArrowLeft, Bell, Check, Copy, Download, LogIn, MonitorDown, Pin, RefreshCw, Share, Smartphone, SquarePlus, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { CertaLogo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { Label, PageHeader } from '@/components/ui/text';
import type { Platform } from '@/lib/install';

export type InstallTab = 'iphone' | 'android' | 'computer';

export interface InstallScreenProps {
  /** Null until the browser has been detected (first render). */
  platform: Platform | null;
  /** The browser can show its own install dialog (Chrome, Edge, Samsung Internet). */
  canPrompt: boolean;
  /** Already running as the installed app. */
  installed: boolean;
  /** Absolute link to this page, for the QR code and sharing. */
  shareUrl: string;
  /** QR code image (data URL) for `shareUrl`; null before it's drawn. */
  qrDataUrl: string | null;
  copied: boolean;
  onInstall: () => void;
  onCopyLink: () => void;
  onBack: () => void;
}

export const tabFor = (p: Platform | null): InstallTab => (p === 'iphone' || p === 'ipad' ? 'iphone' : p === 'android' ? 'android' : 'computer');

interface Step {
  icon: ReactNode;
  title: ReactNode;
  detail: ReactNode;
}

const k = (s: string) => <span className="font-semibold text-[var(--certa-text)]">{s}</span>;
const i = 'size-5';

const STEPS: Record<InstallTab, { heading: string; browser: string; steps: Step[]; note?: ReactNode }> = {
  iphone: {
    heading: 'iPhone and iPad',
    browser: 'Safari',
    steps: [
      { icon: <Smartphone className={i} aria-hidden />, title: 'Open Certa in Safari', detail: <>Open this page in Safari. Chrome and Edge on iPhone work too, from their own Share button.</> },
      { icon: <Share className={i} aria-hidden />, title: <>Tap Share</>, detail: <>The square with an arrow pointing up: at the bottom of the screen on iPhone, at the top on iPad. If you don’t see it, tap {k('•••')} first, then {k('Share')}.</> },
      { icon: <SquarePlus className={i} aria-hidden />, title: <>Tap “Add to Home Screen”</>, detail: <>Scroll down the list if it isn’t showing. Leave {k('Open as Web App')} switched on.</> },
      { icon: <Check className={i} aria-hidden />, title: 'Tap Add', detail: <>Keep the name “Certa”. The Certa icon appears on your Home Screen.</> },
      { icon: <LogIn className={i} aria-hidden />, title: 'Open Certa from the Home Screen and sign in', detail: <>Sign in once inside the app and it keeps you signed in. Allow notifications when asked: on iPhone, expiry reminders only arrive in the Home Screen app.</> },
    ],
  },
  android: {
    heading: 'Android',
    browser: 'Chrome',
    steps: [
      { icon: <Smartphone className={i} aria-hidden />, title: 'Open Certa in Chrome', detail: <>Open this page in Chrome. Samsung Internet and Edge work too.</> },
      { icon: <Download className={i} aria-hidden />, title: <>Tap Install</>, detail: <>Tap {k('Install Certa')} at the top of this page if you see it. Otherwise tap {k('⋮')} at the top right, then {k('Add to Home screen')} (or {k('Install app')}). In Samsung Internet: {k('≡')} → {k('Add page to')} → {k('Home screen')}.</> },
      { icon: <Check className={i} aria-hidden />, title: 'Confirm', detail: <>Tap {k('Install')} (or {k('Add')}). Certa appears on your Home Screen and in the app drawer.</> },
      { icon: <LogIn className={i} aria-hidden />, title: 'Open Certa and sign in', detail: <>Sign in once and the app keeps you signed in. Press and hold the icon for shortcuts to {k('Log a flight')} and {k('Missions')}.</> },
    ],
  },
  computer: {
    heading: 'Windows, Mac, Chromebook and Linux',
    browser: 'Chrome or Microsoft Edge',
    steps: [
      { icon: <MonitorDown className={i} aria-hidden />, title: 'Open Certa in Chrome or Microsoft Edge', detail: <>Both install Certa as a desktop app. Firefox can’t install web apps on a computer.</> },
      { icon: <Download className={i} aria-hidden />, title: <>Choose Install</>, detail: <>Click {k('Install Certa')} at the top of this page if you see it, or the install icon at the right end of the address bar (a screen with a down arrow). From the menu: Chrome {k('⋮')} → {k('Cast, save and share')} → {k('Install page as app')}; Edge {k('⋯')} → {k('Apps')} → {k('Install this site as an app')}.</> },
      { icon: <Check className={i} aria-hidden />, title: 'Confirm', detail: <>Click {k('Install')}. Certa opens in its own window and is added to the Start menu, Launchpad or app launcher.</> },
      { icon: <Pin className={i} aria-hidden />, title: 'Pin it', detail: <>Windows: right-click Certa in the taskbar → {k('Pin to taskbar')}. Mac: right-click the dock icon → {k('Options')} → {k('Keep in Dock')}.</> },
    ],
    note: (
      <>
        <span className="font-semibold text-[var(--certa-text)]">Mac with Safari</span> (macOS Sonoma or later): {k('File')} → {k('Add to Dock')} → {k('Add')}. To remove Certa later, open it and choose {k('Uninstall')} from its menu.
      </>
    ),
  },
};

const PERKS: { icon: ReactNode; title: string; detail: string }[] = [
  { icon: <Smartphone className="size-4" aria-hidden />, title: 'Opens like an app', detail: 'Full screen from your Home Screen, dock or taskbar.' },
  { icon: <WifiOff className="size-4" aria-hidden />, title: 'Works with no signal', detail: 'Flights save on the device and sync when you’re back in coverage.' },
  { icon: <Bell className="size-4" aria-hidden />, title: 'Expiry reminders', detail: 'Notifications before certificates, training and registrations lapse.' },
  { icon: <RefreshCw className="size-4" aria-hidden />, title: 'Always up to date', detail: 'No app store and nothing to download. Updates arrive on their own.' },
];

function Steps({ tab }: { tab: InstallTab }) {
  const s = STEPS[tab];
  return (
    <section aria-label={`Install on ${s.heading}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[18px] font-semibold">{s.heading}</h2>
        <span className="text-[13px] text-[var(--certa-muted)]">Use {s.browser}</span>
      </div>
      <ol className="space-y-3">
        {s.steps.map((st, n) => (
          <li key={n}>
            <Card className="flex items-start gap-4 p-4 sm:p-5">
              <span className="tabular flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--certa-action)] text-[15px] font-semibold text-[var(--certa-onAction)]" aria-hidden>
                {n + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[15px] font-semibold">
                  {st.title}
                </span>
                <span className="mt-1 block text-[14px] leading-relaxed text-[var(--certa-muted)]">{st.detail}</span>
              </span>
              <span className="mt-1 hidden text-[var(--certa-muted)] sm:block">{st.icon}</span>
            </Card>
          </li>
        ))}
      </ol>
      {s.note && <p className="mt-4 rounded-xl bg-[var(--certa-inset)] px-4 py-3 text-[14px] leading-relaxed text-[var(--certa-muted)]">{s.note}</p>}
    </section>
  );
}

function Status(props: InstallScreenProps) {
  const p = props.platform;
  if (props.installed)
    return (
      <Card className="flex items-center gap-3 p-5">
        <span className="flex size-10 items-center justify-center rounded-full bg-[var(--certa-current)] text-white"><Check className="size-5" aria-hidden /></span>
        <div>
          <div className="text-[16px] font-semibold">Certa is installed</div>
          <div className="text-[14px] text-[var(--certa-muted)]">You’re using the app. To put it on another device, follow the steps below there.</div>
        </div>
      </Card>
    );
  const where = p === 'iphone' || p === 'ipad' || p === 'android' ? 'this phone' : 'this computer';
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[16px] font-semibold">
          {props.canPrompt ? `Install Certa on ${where}` : p === 'iphone' || p === 'ipad' ? 'Add Certa to your Home Screen' : p === 'desktop-firefox' ? 'Open this page in Chrome or Edge' : p === 'mac-safari' ? 'Add Certa to your Dock' : `Install Certa on ${where}`}
        </div>
        <div className="text-[14px] text-[var(--certa-muted)]">
          {props.canPrompt
            ? 'One click. It opens in its own window and works offline.'
            : p === 'iphone' || p === 'ipad'
              ? 'iPhone and iPad add apps from Safari’s Share menu. It takes about 20 seconds.'
              : p === 'desktop-firefox'
                ? 'Firefox can’t install apps on a computer. Chrome and Microsoft Edge can.'
                : p === 'mac-safari'
                  ? 'In Safari, choose File → Add to Dock.'
                  : 'Follow the steps below for your device.'}
        </div>
      </div>
      {props.canPrompt && (
        <Button arrow icon={<Download className="size-4" aria-hidden />} onClick={props.onInstall}>
          Install Certa
        </Button>
      )}
    </Card>
  );
}

export function InstallScreen(props: InstallScreenProps) {
  const [tab, setTab] = useState<InstallTab | null>(null);
  const current = tab ?? tabFor(props.platform);
  const phone = props.platform === 'iphone' || props.platform === 'ipad' || props.platform === 'android';
  return (
    <div className="certa min-h-dvh bg-[var(--certa-canvas)]">
      <header className="border-b border-[var(--certa-border)] bg-[var(--certa-surface)]">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <CertaLogo height={26} />
          <Button size="sm" variant="ghost" icon={<ArrowLeft className="size-4" aria-hidden />} onClick={props.onBack}>
            Back to Certa
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <PageHeader eyebrow="Get the app" title="Put Certa on your phone and computer" description="Certa installs straight from the browser, with no app store. Pick your device and follow the steps." />
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Status {...props} />
            <Segmented
              label="Device"
              value={current}
              onChange={setTab}
              options={[
                { value: 'iphone', label: 'iPhone & iPad' },
                { value: 'android', label: 'Android' },
                { value: 'computer', label: 'Computer' },
              ]}
            />
            <Steps tab={current} />
          </div>
          <aside className="space-y-6">
            {!phone && (
              <Card className="p-5">
                <Label>On your phone</Label>
                <p className="mt-1 mb-4 text-[14px] text-[var(--certa-muted)]">Point your phone’s camera at the code to open this page there, then follow the steps for your phone.</p>
                <div className="mx-auto aspect-square w-full max-w-[220px] rounded-xl bg-white p-3">
                  {props.qrDataUrl && <img src={props.qrDataUrl} alt="QR code that opens this page" className="h-full w-full [image-rendering:pixelated]" />}
                </div>
              </Card>
            )}
            <Card className="p-5">
              <Label>Share with your crew</Label>
              <p className="mt-1 mb-3 text-[14px] text-[var(--certa-muted)]">Send pilots this link. It has the same steps.</p>
              <code className="mb-3 block truncate rounded-lg bg-[var(--certa-inset)] px-3 py-2 text-[13px]">{props.shareUrl}</code>
              <Button variant="secondary" className="w-full" icon={props.copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} onClick={props.onCopyLink}>
                {props.copied ? 'Link copied' : 'Copy link'}
              </Button>
            </Card>
            <Card className="p-5">
              <Label>Why install it</Label>
              <ul className="mt-3 space-y-3">
                {PERKS.map((x) => (
                  <li key={x.title} className="flex gap-3 text-[14px]">
                    <span className="mt-0.5 text-[var(--certa-muted)]">{x.icon}</span>
                    <span>
                      <span className="font-semibold">{x.title}</span>
                      <span className="block text-[var(--certa-muted)]">{x.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
