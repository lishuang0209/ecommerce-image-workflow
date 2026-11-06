import { FolderClock, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { BeatApiProductShell } from '@/components/marketing/beatapi-product-shell';
import { normalizeLocale } from '@/config/locale';
import { ProjectSettingsDialog } from '@/components/app/project-settings-dialog';
import { ProjectCoverPreview } from '@/components/app/project-cover-preview';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Link } from '@/core/i18n/navigation';
import { buildLocalizedProjectDetailPath } from '@/core/projects/project-entry';
import { useWorkspaceProjects } from '@/core/workspace-hooks/use-workspace-projects';
import type { WorkspaceProjectCardItem } from '@/core/workspace-lib/app/workspace-client-api';
import { m } from '@/paraglide/messages.js';

function getHistoryCopy(locale: string) {
  const messageLocale = normalizeLocale(locale);
  return {
    eyebrow: m['product.history.eyebrow']({}, { locale: messageLocale }),
    title: m['product.history.title']({}, { locale: messageLocale }),
    subtitle: m['product.history.subtitle']({}, { locale: messageLocale }),
    newProject: m['product.history.newProject']({}, { locale: messageLocale }),
    untitled: m['product.history.untitled']({}, { locale: messageLocale }),
    deleteConfirm: (projectName: string) =>
      m['product.history.deleteConfirm'](
        { projectName },
        { locale: messageLocale }
      ),
    deleteConfirmDescription: m['product.history.deleteConfirmDescription'](
      {},
      { locale: messageLocale }
    ),
    cancel: m['product.history.cancel']({}, { locale: messageLocale }),
    openProject: (projectName: string) =>
      m['product.history.openProject'](
        { projectName },
        { locale: messageLocale }
      ),
    deleteProject: m['product.history.deleteProject'](
      {},
      { locale: messageLocale }
    ),
    startFirst: m['product.history.startFirst']({}, { locale: messageLocale }),
    emptyDescription: m['product.history.emptyDescription'](
      {},
      { locale: messageLocale }
    ),
  };
}

function projectName(name: string, untitled: string) {
  const trimmed = name.trim();
  if (
    trimmed &&
    trimmed !== 'Untitled canvas' &&
    trimmed !== 'Untitled project'
  ) {
    return trimmed;
  }
  return untitled;
}

export function WorkspacePage({
  locale,
  projects,
}: {
  locale: string;
  projects: WorkspaceProjectCardItem[];
}) {
  const copy = getHistoryCopy(locale);
  const [deleteTarget, setDeleteTarget] =
    useState<WorkspaceProjectCardItem | null>(null);
  const { projects: liveProjects, deleteProjects } = useWorkspaceProjects({
    locale,
    initialProjects: projects,
    enabled: true,
  });

  async function removeProject(project: WorkspaceProjectCardItem) {
    setDeleteTarget(project);
  }

  async function confirmRemoveProject() {
    if (!deleteTarget) return;
    await deleteProjects([deleteTarget.id]);
    setDeleteTarget(null);
  }

  return (
    <BeatApiProductShell active="projects" locale={locale}>
      <main className="mx-auto w-full max-w-[1280px] px-5 pb-10 pt-14 sm:px-6">
        <section className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--beat-accent)] sm:text-[11px]">
              {copy.eyebrow}
            </p>
            <h1 className="beat-product-display beat-product-page-title mt-4 max-w-3xl text-balance text-[clamp(2.25rem,4.5vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--beat-text-1)]">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-2xl text-pretty text-[14px] font-normal leading-6 text-[var(--beat-text-2)] sm:text-[15px]">
              {copy.subtitle}
            </p>
          </div>

          <Link
            href="/canvas"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start rounded-[var(--beat-radius-sm)] bg-[var(--beat-accent)] px-5 text-[13px] font-semibold text-[var(--beat-accent-ink)] shadow-[0_8px_28px_rgba(255,122,51,0.22)] transition hover:bg-[#ff8a4d] lg:self-auto"
          >
            <Plus className="size-4" />
            {copy.newProject}
          </Link>
        </section>

        <section className="mt-12">
          {liveProjects.length > 0 ? (
            <div className="grid gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {liveProjects.map((project) => {
                const name = projectName(project.name, copy.untitled);
                return (
                  <article key={project.id} className="group relative min-w-0">
                    <Link
                      href={buildLocalizedProjectDetailPath({
                        locale,
                        projectId: project.id,
                        mode: project.lastWorkspaceMode === 'studio' ? 'canvas' : project.lastWorkspaceMode,
                      })}
                      aria-label={copy.openProject(name)}
                      className="block"
                    >
                      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[var(--beat-radius)] border border-white/[0.08] bg-[radial-gradient(circle_at_72%_18%,rgba(255,122,51,0.10),transparent_40%),#111113] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition duration-300 group-hover:-translate-y-0.5 group-hover:border-white/[0.18]">
                        <ProjectCoverPreview url={project.coverImageUrl} />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
                      </div>
                      <h2 className="beat-product-display mt-3 truncate px-1 text-[15px] font-semibold tracking-[-0.02em] text-[var(--beat-text-1)]">
                        {name}
                      </h2>
                      {project.description && <p className="mt-1 line-clamp-2 px-1 text-xs leading-5 text-white/45">{project.description}</p>}
                    </Link>

                    <div className="absolute left-3 top-3 rounded-xl bg-black/70 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100"><ProjectSettingsDialog projectId={project.id} /></div>

                    <button
                      type="button"
                      onClick={() => void removeProject(project)}
                      aria-label={copy.deleteProject}
                      className="absolute right-3 top-3 grid size-8 place-items-center rounded-full border border-white/10 bg-black/60 text-white/60 opacity-0 backdrop-blur transition hover:bg-red-500 hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[330px] flex-col items-center justify-center rounded-[var(--beat-radius)] border border-dashed border-white/[0.1] bg-[radial-gradient(circle_at_50%_24%,rgba(255,122,51,0.045),transparent_38%),#0e0e10] px-6 text-center">
              <span className="grid size-14 place-items-center rounded-[var(--beat-radius-sm)] border border-white/[0.1] bg-[#171719] text-[var(--beat-accent)] shadow-[0_12px_36px_rgba(0,0,0,0.22)]">
                <FolderClock className="size-6" />
              </span>
              <h2 className="beat-product-display mt-5 text-[21px] font-semibold tracking-[-0.03em] text-white">
                {copy.startFirst}
              </h2>
              <p className="mt-2 max-w-md text-[13px] font-normal leading-6 text-[var(--beat-text-2)]">
                {copy.emptyDescription}
              </p>
              <Link
                href="/canvas"
                className="mt-6 inline-flex h-10 items-center gap-2 rounded-[var(--beat-radius-sm)] bg-[var(--beat-accent)] px-4 text-[12px] font-semibold text-[var(--beat-accent-ink)] shadow-[0_8px_24px_rgba(255,122,51,0.24)] transition hover:bg-[#ff8a4d]"
              >
                <Plus className="size-4" />
                {copy.newProject}
              </Link>
            </div>
          )}
        </section>
      </main>

      <ConfirmDialog
        variant="beat"
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={
          deleteTarget
            ? copy.deleteConfirm(projectName(deleteTarget.name, copy.untitled))
            : ''
        }
        description={copy.deleteConfirmDescription}
        confirmLabel={copy.deleteProject}
        cancelLabel={copy.cancel}
        onConfirm={confirmRemoveProject}
      />
    </BeatApiProductShell>
  );
}
