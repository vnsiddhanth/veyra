import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BRAND } from '@/config/brand';
import { TOOLS } from '@/tools/registry';
import { CheckField, ChoiceGroup, SelectField } from '@/tools/shared/controls';
import { Button } from '@/components/ui/primitives';
import { setPageMeta } from '@/utils/meta';
import { pageInfo } from '@/seo/site';

type Kind = 'bug' | 'complaint' | 'idea' | 'other';

const KIND_LABEL: Record<Kind, string> = { bug: 'Bug', complaint: 'Complaint', idea: 'Idea', other: 'Other' };

/** Facts about this browser that make a bug reproducible. No file names or content. */
function systemInfo(): string {
  const w = window as unknown as { VideoEncoder?: unknown; VideoDecoder?: unknown };
  return [
    `Browser: ${navigator.userAgent}`,
    `Screen: ${screen.width}×${screen.height} @${window.devicePixelRatio}x`,
    `WebCodecs: ${w.VideoEncoder && w.VideoDecoder ? 'yes' : 'no'}`,
    `Cross-origin isolated: ${window.crossOriginIsolated ? 'yes' : 'no'}`,
    `Cores: ${navigator.hardwareConcurrency ?? '?'}`,
    `Page: ${location.origin}`,
  ].join('\n');
}

export default function FeedbackPage() {
  const [params] = useSearchParams();
  const [kind, setKind] = useState<Kind>((['bug', 'complaint', 'idea', 'other'] as const).find((k) => k === params.get('type')) ?? 'bug');
  const [where, setWhere] = useState(params.get('tool') ?? 'general');
  const [what, setWhat] = useState(params.get('error') ? `I got this error: ${params.get('error')}\n\n` : '');
  const [steps, setSteps] = useState('');
  const [includeInfo, setIncludeInfo] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => setPageMeta(pageInfo('/feedback')!.title, pageInfo('/feedback')!.description), []);

  const info = useMemo(systemInfo, []);
  const whereLabel = where === 'general' ? 'General' : where === 'editor' ? 'Editor' : (TOOLS.find((t) => t.slug === where)?.title ?? where);
  const subject = `[Veyra ${KIND_LABEL[kind]}] ${whereLabel}: ${what.trim().split('\n')[0]!.slice(0, 60) || 'feedback'}`;
  const body = [
    `Type: ${KIND_LABEL[kind]}`,
    `Where: ${whereLabel}`,
    '',
    'What happened:',
    what.trim() || '(describe it here)',
    ...(kind === 'bug' && steps.trim() ? ['', 'Steps to reproduce:', steps.trim()] : []),
    ...(includeInfo ? ['', '---', info] : []),
  ].join('\n');

  const mailto = `mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const issue = `${BRAND.repoUrl}/issues/new?title=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}&labels=${kind === 'bug' ? 'bug' : kind === 'idea' ? 'enhancement' : ''}`;
  const ready = what.trim().length >= 5;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${BRAND.supportEmail}\nSubject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked: the text is still visible below */
    }
  };

  const area = 'w-full rounded-md border border-line bg-surface-2 p-2.5 text-sm';

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Report a problem</h1>
        <p className="text-muted">
          Something broken, annoying or missing? Tell me. I read every report. You can also email{' '}
          <a href={`mailto:${BRAND.supportEmail}`} className="font-medium text-accent hover:underline">
            {BRAND.supportEmail}
          </a>{' '}
          directly.
        </p>
      </header>

      <form className="space-y-5 rounded-xl border border-line bg-surface p-5" onSubmit={(e) => e.preventDefault()}>
        <ChoiceGroup
          name="kind"
          label="What is it?"
          value={kind}
          onChange={setKind}
          options={[
            ['bug', 'Bug', 'Something doesn’t work'],
            ['complaint', 'Complaint', 'Something is bad or annoying'],
            ['idea', 'Idea', 'A feature or improvement'],
            ['other', 'Other', 'Anything else'],
          ]}
        />
        <SelectField
          label="Where?"
          value={where}
          onChange={setWhere}
          options={[['general', 'General / whole site'] as const, ['editor', 'Editor'] as const, ...TOOLS.map((t) => [t.slug, t.title] as const)]}
        />
        <div className="text-sm">
          <label htmlFor="fb-what" className="mb-1 block text-xs text-muted">
            {kind === 'idea' ? 'What would you like?' : 'What happened?'}
          </label>
          <textarea
            id="fb-what"
            rows={5}
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            className={area}
            placeholder={kind === 'idea' ? 'e.g. Let me add music from a file to the slideshow' : 'e.g. Export stopped at 40% with a 2 GB MOV file from my iPhone'}
          />
        </div>
        {kind === 'bug' && (
          <div className="text-sm">
            <label htmlFor="fb-steps" className="mb-1 block text-xs text-muted">
              Steps to reproduce (optional)
            </label>
            <textarea id="fb-steps" rows={3} value={steps} onChange={(e) => setSteps(e.target.value)} className={area} placeholder={'1. Open Merge videos\n2. Add two files\n3. Press Merge'} />
          </div>
        )}
        <div className="space-y-2">
          <CheckField label="Include browser details (helps me reproduce bugs)" checked={includeInfo} onChange={setIncludeInfo} hint="Browser version, screen size and feature support. Never your files or file names." />
          {includeInfo && <pre className="whitespace-pre-wrap break-all rounded-md bg-surface-2 p-2.5 text-xs text-muted">{info}</pre>}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <a
            href={mailto}
            aria-disabled={!ready}
            onClick={(e) => !ready && e.preventDefault()}
            className={
              'inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg ' + (ready ? 'hover:brightness-110' : 'pointer-events-none opacity-45')
            }
          >
            Send by email
          </a>
          <a
            href={issue}
            aria-disabled={!ready}
            onClick={(e) => !ready && e.preventDefault()}
            target="_blank"
            rel="noopener noreferrer"
            className={'inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-medium ' + (ready ? 'hover:bg-surface-2' : 'pointer-events-none opacity-45')}
          >
            Open a GitHub issue
          </a>
          <Button onClick={copy} disabled={!ready}>
            {copied ? 'Copied' : 'Copy report'}
          </Button>
          {!ready && <span className="text-xs text-muted">Describe the problem first.</span>}
        </div>
        <p className="text-xs text-faint">
          Nothing is sent by this page. “Send by email” opens your own email app with the report filled in, and you press send. If no email app opens, use “Copy report” and paste
          it into an email to {BRAND.supportEmail}.
        </p>
      </form>
    </div>
  );
}
