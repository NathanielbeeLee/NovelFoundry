import { Github } from "lucide-react";
import { cn } from "@/lib/utils";

const PROJECT_GITHUB_URL = (import.meta.env.VITE_PUBLIC_REPOSITORY_URL ?? "").trim();

interface ProjectGithubLinkProps {
  className?: string;
}

export default function ProjectGithubLink({ className }: ProjectGithubLinkProps) {
  if (!PROJECT_GITHUB_URL) {
    return null;
  }

  return (
    <a
      href={PROJECT_GITHUB_URL}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1 text-[11px] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      title="Open NovelFoundry on GitHub"
      aria-label="Open NovelFoundry on GitHub"
    >
      <Github className="h-3.5 w-3.5" />
      <span className="hidden whitespace-nowrap sm:inline">NovelFoundry</span>
    </a>
  );
}
