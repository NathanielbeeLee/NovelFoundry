export type SiteDocCategory = {
  id: string;
  title: string;
  description: string;
  docs: SiteDocEntry[];
};

export type SiteDocEntry = {
  id: string;
  title: string;
  description: string;
  sourcePath: string;
  githubPath: string;
};

export type FlattenedSiteDocEntry = SiteDocEntry & {
  categoryId: string;
  categoryTitle: string;
};

function doc(
  id: string,
  title: string,
  description: string,
  githubPath: string,
): SiteDocEntry {
  return {
    id,
    title,
    description,
    sourcePath: `../../${githubPath}`,
    githubPath,
  };
}

export const docsManifest: SiteDocCategory[] = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "Complete setup, configuration, and the first creation path.",
    docs: [
      doc(
        "introduction",
        "Introduction",
        "Understand who the project is for, what it can do, and how the long-form workflow fits together.",
        "docs/public/introduction.md",
      ),
      doc(
        "installation",
        "Installation and preparation",
        "Install the desktop app and confirm model, storage, and knowledge options.",
        "docs/public/installation.md",
      ),
      doc(
        "faq",
        "FAQ",
        "Resolve common model, chapter, and retrieval problems.",
        "docs/public/faq.md",
      ),
      doc(
        "troubleshooting",
        "Troubleshooting",
        "Locate failures through logs, task state, recovery entry points, and backups.",
        "docs/public/troubleshooting.md",
      ),
    ],
  },
  {
    id: "playbooks",
    title: "Playbooks",
    description: "Turn the deeper systems into practical operating and recovery steps.",
    docs: [
      doc(
        "first-novel-walkthrough",
        "First novel walkthrough",
        "Move from an empty project to completed chapter batches with stage and artifact guidance.",
        "docs/public/playbook/first-novel-walkthrough.md",
      ),
      doc(
        "usage-guide",
        "Usage guide",
        "Recommended paths for model setup, novel creation, director use, and chapter execution.",
        "docs/public/usage-guide.md",
      ),
      doc(
        "recovery-by-phase",
        "Recovery by phase",
        "Recover candidate, character, volume, chapter, and execution stages.",
        "docs/public/playbook/recovery-by-phase.md",
      ),
    ],
  },
  {
    id: "production-depth",
    title: "Production depth",
    description: "Understand the director, chapter, retrieval, and recovery chain.",
    docs: [
      doc(
        "end-to-end-production",
        "End-to-end production",
        "Understand inputs, artifacts, and persistence from idea to chapter execution.",
        "docs/public/flow/end-to-end-production.md",
      ),
      doc(
        "auto-director-pipeline",
        "AI director pipeline",
        "Explain director inputs, artifacts, checkpoints, approvals, and recovery stage by stage.",
        "docs/public/flow/auto-director-pipeline.md",
      ),
      doc(
        "chapter-execution",
        "Chapter execution",
        "Explain generation, review, repair, quality debt, and state feedback.",
        "docs/public/flow/chapter-execution.md",
      ),
      doc(
        "knowledge-and-rag",
        "Knowledge and retrieval",
        "Show when knowledge, analysis, writing, and world assets enter the workflow.",
        "docs/public/flow/knowledge-and-rag.md",
      ),
      doc(
        "module-director-follow-up",
        "Director follow-ups",
        "View director checkpoints, pause reasons, approvals, and recovery actions.",
        "docs/public/modules/director-follow-up.md",
      ),
    ],
  },
  {
    id: "module-overview",
    title: "Module overview",
    description: "Understand each entry point and the recommended next step from the home page.",
    docs: [
      doc(
        "module-home",
        "Home",
        "View recent creation entry points, task reminders, and common modules.",
        "docs/public/modules/home.md",
      ),
    ],
  },
  {
    id: "main-chain",
    title: "Novel completion path",
    description: "Complete a novel through setup, progress, recovery, and task state.",
    docs: [
      doc(
        "module-onboarding",
        "Getting started",
        "Run setup, book creation, and the first chapter step by step.",
        "docs/public/modules/onboarding.md",
      ),
      doc(
        "module-novels",
        "Novels",
        "Create, open, manage, and back up novel projects.",
        "docs/public/modules/novels.md",
      ),
      doc(
        "module-creative-hub",
        "Creative Hub",
        "Describe an intention, start a task, and review suggestions through conversation.",
        "docs/public/modules/creative-hub.md",
      ),
      doc(
        "module-task-center",
        "Task center",
        "View background task progress, failure reasons, and retry actions.",
        "docs/public/modules/task-center.md",
      ),
    ],
  },
  {
    id: "knowledge-writing",
    title: "Knowledge and writing",
    description: "Turn sources, analysis, and writing rules into retrievable assets.",
    docs: [
      doc(
        "module-knowledge-base",
        "Knowledge base",
        "Save references, settings, analysis conclusions, and searchable content.",
        "docs/public/modules/knowledge-base.md",
      ),
      doc(
        "module-book-analysis",
        "Book analysis",
        "Analyze a reference work or draft and preserve reusable findings.",
        "docs/public/modules/book-analysis.md",
      ),
      doc(
        "module-style-engine",
        "Style engine",
        "Maintain narrative style, samples, and writing rules.",
        "docs/public/modules/style-engine.md",
      ),
      doc(
        "module-anti-ai-rules",
        "Anti-AI rules",
        "Reduce formulaic, over-explanatory, and vague prose.",
        "docs/public/modules/anti-ai-rules.md",
      ),
    ],
  },
  {
    id: "story-assets",
    title: "Story assets",
    description: "Maintain genres, progression modes, characters, worlds, and titles.",
    docs: [
      doc(
        "module-genre-base-library",
        "Genre library",
        "Maintain genre directions, reader expectations, and hooks.",
        "docs/public/modules/genre-base-library.md",
      ),
      doc(
        "module-progression-mode-library",
        "Progression modes",
        "Manage story progression and reader promise delivery.",
        "docs/public/modules/progression-mode-library.md",
      ),
      doc(
        "module-character-library",
        "Character library",
        "Maintain reusable characters and base visual assets.",
        "docs/public/modules/character-library.md",
      ),
      doc(
        "module-world-sample-library",
        "World library",
        "Save and reuse worldbuilding samples.",
        "docs/public/modules/world-sample-library.md",
      ),
      doc(
        "module-title-workshop",
        "Title studio",
        "Generate, compare, and refine book or chapter titles.",
        "docs/public/modules/title-workshop.md",
      ),
    ],
  },
  {
    id: "derived-workshops",
    title: "Derivative workspaces",
    description: "Extend novel content into drama or comic production assets.",
    docs: [
      doc(
        "module-short-drama-workspace",
        "Drama studio",
        "Extend completed novel content toward short drama.",
        "docs/public/modules/short-drama-workspace.md",
      ),
      doc(
        "module-comic-workspace",
        "Comic studio",
        "Prepare comic panels and visual assets from novel content.",
        "docs/public/modules/comic-workspace.md",
      ),
    ],
  },
  {
    id: "system",
    title: "System configuration",
    description: "Manage providers, task routes, prompts, and runtime preferences.",
    docs: [
      doc(
        "module-system-settings",
        "Settings",
        "Configure model providers, API keys, knowledge base, and core preferences.",
        "docs/public/modules/system-settings.md",
      ),
      doc(
        "module-model-routing",
        "Model routing",
        "Assign models to planning, writing, review, and other tasks.",
        "docs/public/modules/model-routing.md",
      ),
      doc(
        "module-prompt-management",
        "Prompt management",
        "Inspect and maintain prompt assets used by AI tasks.",
        "docs/public/modules/prompt-management.md",
      ),
    ],
  },
  {
    id: "project-updates",
    title: "Project updates",
    description: "View the public roadmap and user-facing update history.",
    docs: [
      doc(
        "development-roadmap",
        "Public roadmap",
        "Near-term, medium-term, and long-term product direction.",
        "docs/public/development-roadmap.md",
      ),
      doc(
        "release-notes",
        "Release notes",
        "Complete user-facing update history.",
        "docs/releases/release-notes.md",
      ),
    ],
  },
];

export const flattenedDocs: FlattenedSiteDocEntry[] = docsManifest.flatMap((category) =>
  category.docs.map((doc) => ({ ...doc, categoryId: category.id, categoryTitle: category.title })),
);
