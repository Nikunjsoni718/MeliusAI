import { getSettingsTab, type SettingsTab } from '@/lib/settings-tabs';

export function SettingsTabPlaceholder({ tab }: { tab: SettingsTab }) {
  const details = getSettingsTab(tab);
  const titleId = `settings-${tab}-title`;

  return (
    <section aria-labelledby={titleId} className="mx-auto w-full max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Settings</p>
      <h2 id={titleId} className="mt-3 text-2xl font-semibold tracking-tight text-slate-200 sm:text-3xl">
        {details.label}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{details.description}</p>

      <div className="mt-8 rounded-md border border-slate-800 bg-[#0B1021] p-5 sm:p-6">
        <h3 className="text-base font-medium text-slate-200">{details.label}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          This section is ready for its settings controls. Form fields and save actions will be added in the next
          implementation phase.
        </p>
      </div>
    </section>
  );
}
