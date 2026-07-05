# Store current Post draft and published version

Posts will store only the current Draft version and current Published version, rather than a full immutable version history. This gives the publication workflow enough separation to edit published Posts safely, while avoiding audit/history complexity that the CMS does not need yet.

**Consequences**

Republishing overwrites the previous Published version. The only retained publication history is first publication time, latest publication time, and Slug redirects.
