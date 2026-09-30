# Export Module

The export module reads stable novel production data and produces TXT,
Markdown, JSON, and portable backup artifacts. It does not own novel facts,
chapter generation, quality repair, or runtime task state.

Backup import validates package version, size, integrity, and ownership before
creating an independent project. It never resumes old worker leases and never
silently overwrites the source project.
